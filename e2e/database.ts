import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";

import pg from "pg";

import { contentHash } from "../src/features/profiles/domain/content";

import { E2E_DATABASE_URL, E2E_MEDIA_DIR } from "./environment";

/**
 * Direct access to the E2E database for test setup (e.g. rows stored by an older schema version)
 * and for checking what was actually persisted. Refuses to touch any non-E2E database.
 */
let pool: pg.Pool | undefined;

async function database(): Promise<pg.Pool> {
  if (!pool) {
    pool = new pg.Pool({ connectionString: E2E_DATABASE_URL, max: 2 });
    const { rows } = await pool.query<{ name: string }>("select current_database() as name");
    if (!rows[0]?.name.endsWith("_e2e_test")) throw new Error("Not the E2E database.");
  }
  return pool;
}

export async function closeDatabase(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

/** Insert a character row as stored (`body` = facts without displayName/schemaVersion). */
export async function insertCharacter(
  displayName: string,
  body: Record<string, unknown> = { values: {} },
  schemaVersion = 3,
): Promise<string> {
  const { rows } = await (
    await database()
  ).query<{ id: string }>(
    "insert into characters (display_name, facts, schema_version) values ($1, $2, $3) returning id",
    [displayName, JSON.stringify(body), schemaVersion],
  );
  return rows[0]!.id;
}

export type StoredCharacter = {
  displayName: string;
  schemaVersion: number;
  revision: number;
  facts: {
    values: Record<string, { state: string; value?: unknown; sensitiveItemIds?: string[] }>;
    sourceLanguage?: string;
    custom?: { groups: unknown[]; fields: { key: string; label: string }[] };
  };
};

export async function readCharacter(id: string): Promise<StoredCharacter> {
  const { rows } = await (
    await database()
  ).query("select display_name, schema_version, revision, facts from characters where id = $1", [
    id,
  ]);
  const row = rows[0];
  return {
    displayName: row.display_name,
    schemaVersion: row.schema_version,
    revision: row.revision,
    facts: row.facts,
  };
}

export type StoredSection = {
  id: string;
  key: string;
  title: string | null;
  position: number;
  isHidden: boolean;
  draft: unknown;
  draftRevision: number;
  approved: unknown;
};

/** Sections of the character's primary profile, in display order. */
export async function readProfileSections(characterId: string): Promise<StoredSection[]> {
  const { rows } = await (
    await database()
  ).query(
    `select s.id, s.key, s.title, s.position, s.is_hidden, s.draft_content, s.draft_revision,
            r.content as approved
       from profile_sections s
       join profiles p on p.id = s.profile_id
       left join content_revisions r on r.id = s.approved_revision_id
      where p.character_id = $1 and p.is_primary
      order by s.position`,
    [characterId],
  );
  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    title: row.title,
    position: row.position,
    isHidden: row.is_hidden,
    draft: row.draft_content,
    draftRevision: row.draft_revision,
    approved: row.approved,
  }));
}

/** History kinds of a section, most recent first. */
export async function readRevisionKinds(sectionId: string): Promise<string[]> {
  const { rows } = await (
    await database()
  ).query<{ kind: string }>(
    "select kind from content_revisions where section_id = $1 order by created_at desc, id desc",
    [sectionId],
  );
  return rows.map((row) => row.kind);
}

export type SeedSection = {
  key: string;
  title?: string;
  hidden?: boolean;
  draft?: unknown;
  approved?: unknown;
};

/**
 * Store a profile directly (illustrative test data only), with drafts and approved versions.
 * Returns the section ids in order.
 */
export async function insertProfile(characterId: string, sections: SeedSection[]) {
  const db = await database();
  const { rows } = await db.query<{ id: string }>(
    "insert into profiles (character_id) values ($1) returning id",
    [characterId],
  );
  const profileId = rows[0]!.id;
  const ids: string[] = [];
  for (const [position, section] of sections.entries()) {
    const inserted = await db.query<{ id: string }>(
      `insert into profile_sections (profile_id, key, title, position, is_hidden, draft_content)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [
        profileId,
        section.key,
        section.title ?? null,
        position,
        section.hidden ?? false,
        section.draft === undefined ? null : JSON.stringify(section.draft),
      ],
    );
    const sectionId = inserted.rows[0]!.id;
    ids.push(sectionId);
    if (section.approved !== undefined) {
      const revision = await db.query<{ id: string }>(
        `insert into content_revisions (section_id, kind, content, content_hash)
         values ($1, 'approval', $2, $3) returning id`,
        [
          sectionId,
          JSON.stringify(section.approved),
          contentHash(section.approved as Parameters<typeof contentHash>[0]),
        ],
      );
      await db.query("update profile_sections set approved_revision_id = $1 where id = $2", [
        revision.rows[0]!.id,
        sectionId,
      ]);
    }
  }
  return ids;
}

function crc32(bytes: Uint8Array): number {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

/** A valid solid-colour RGB PNG of the given size. */
export function solidPng(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x60)]);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", pixels),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Store an avatar the way uploads do: a file under the E2E media folder plus its rows. */
export async function insertAvatar(characterId: string, width: number, height: number) {
  const png = solidPng(width, height);
  const key = `media/2026/10/${randomUUID()}.png`;
  const file = path.join(E2E_MEDIA_DIR, ...key.split("/"));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, png);
  const db = await database();
  const { rows } = await db.query<{ id: string }>(
    `insert into media_assets (storage_key, original_filename, mime_type, byte_size, width, height)
     values ($1, 'avatar.png', 'image/png', $2, $3, $4) returning id`,
    [key, png.length, width, height],
  );
  await db.query(
    "insert into character_media (character_id, media_id, role, position) values ($1, $2, 'avatar', 0)",
    [characterId, rows[0]!.id],
  );
}

/**
 * A fingerprint of every row a profile page could touch for one character (contents and row
 * versions), to prove a page only read. Scoped to the character: other tests write in parallel.
 */
export async function databaseSnapshot(characterId: string): Promise<string> {
  const db = await database();
  const queries: Record<string, string> = {
    characters: "select t.*, t.xmin from characters t where t.id = $1",
    profiles: "select t.*, t.xmin from profiles t where t.character_id = $1",
    profile_sections: `select t.*, t.xmin from profile_sections t
      join profiles p on p.id = t.profile_id where p.character_id = $1`,
    content_revisions: `select t.*, t.xmin from content_revisions t
      join profile_sections s on s.id = t.section_id
      join profiles p on p.id = s.profile_id where p.character_id = $1`,
    character_media: "select t.*, t.xmin from character_media t where t.character_id = $1",
    media_assets: `select t.*, t.xmin from media_assets t
      join character_media m on m.media_id = t.id where m.character_id = $1`,
  };
  const parts: string[] = [];
  for (const [table, query] of Object.entries(queries)) {
    const { rows } = await db.query(query, [characterId]);
    const lines = rows.map((row) => JSON.stringify(row)).sort();
    parts.push(`${table}:${rows.length}:${lines.join("|")}`);
  }
  return parts.join("\n");
}

export async function softDeleteCharacter(id: string): Promise<void> {
  await (
    await database()
  ).query("update characters set deleted_at = now(), revision = revision + 1 where id = $1", [id]);
}
