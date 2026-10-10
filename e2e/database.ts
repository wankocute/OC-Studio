import pg from "pg";

import { E2E_DATABASE_URL } from "./environment";

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
