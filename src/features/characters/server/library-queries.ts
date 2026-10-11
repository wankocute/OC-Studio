import "server-only";

import { and, asc, count, desc, eq, exists, ilike, inArray, isNull, sql } from "drizzle-orm";

import type { DbExecutor } from "@/db";
import { guard } from "@/db/repository-errors";
import {
  characterCollections,
  characterMedia,
  characters,
  characterTags,
  collections,
  tags,
} from "@/db/schema";
import { summarizeCharacter } from "@/features/characters/basic-info";
import type { LibrarySort } from "@/features/characters/library-params";
import type { AvatarCrop } from "@/features/media/avatar-crop";

/** What a library card needs — never the full fact sheet. */
export type CharacterCardData = {
  id: string;
  displayName: string;
  isFavorite: boolean;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  summary: string[];
  avatarMediaId: string | null;
  avatarCrop: AvatarCrop | null;
  tags: { id: string; name: string }[];
};

export type LibraryFilter = {
  q?: string;
  sort?: LibrarySort;
  favorites?: boolean;
  tagId?: string | null;
  collectionId?: string | null;
  limit?: number;
};

/** Escape LIKE wildcards so a search for "50%" matches literally. */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

const ORDER_BY = {
  updated: [desc(characters.updatedAt), asc(characters.id)],
  created: [desc(characters.createdAt), asc(characters.id)],
  name: [asc(sql`lower(${characters.displayName})`), asc(characters.id)],
} as const;

/** Active characters for the library, with avatar and tags, filtered and sorted in SQL. */
export function listLibraryCharacters(
  db: DbExecutor,
  filter: LibraryFilter = {},
): Promise<CharacterCardData[]> {
  return guard(async () => {
    const conditions = [isNull(characters.deletedAt)];
    if (filter.q) conditions.push(ilike(characters.displayName, likePattern(filter.q)));
    if (filter.favorites) conditions.push(eq(characters.isFavorite, true));
    if (filter.tagId) {
      conditions.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(characterTags)
            .where(
              and(
                eq(characterTags.characterId, characters.id),
                eq(characterTags.tagId, filter.tagId),
              ),
            ),
        ),
      );
    }
    if (filter.collectionId) {
      conditions.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(characterCollections)
            .where(
              and(
                eq(characterCollections.characterId, characters.id),
                eq(characterCollections.collectionId, filter.collectionId),
              ),
            ),
        ),
      );
    }

    const query = db
      .select({
        id: characters.id,
        displayName: characters.displayName,
        isFavorite: characters.isFavorite,
        revision: characters.revision,
        createdAt: characters.createdAt,
        updatedAt: characters.updatedAt,
        values: sql<Record<string, unknown>>`${characters.facts} -> 'values'`,
      })
      .from(characters)
      .where(and(...conditions))
      .orderBy(...ORDER_BY[filter.sort ?? "updated"]);
    const rows = filter.limit ? await query.limit(filter.limit) : await query;
    if (rows.length === 0) return [];

    const ids = rows.map((row) => row.id);
    const [avatars, tagRows] = await Promise.all([
      db
        .select({
          characterId: characterMedia.characterId,
          mediaId: characterMedia.mediaId,
          crop: characterMedia.crop,
        })
        .from(characterMedia)
        .where(and(inArray(characterMedia.characterId, ids), eq(characterMedia.role, "avatar"))),
      db
        .select({ characterId: characterTags.characterId, id: tags.id, name: tags.name })
        .from(characterTags)
        .innerJoin(tags, eq(tags.id, characterTags.tagId))
        .where(inArray(characterTags.characterId, ids))
        .orderBy(asc(tags.name)),
    ]);
    const avatarBy = new Map(avatars.map((row) => [row.characterId, row]));
    const tagsBy = new Map<string, { id: string; name: string }[]>();
    for (const row of tagRows) {
      const list = tagsBy.get(row.characterId) ?? [];
      list.push({ id: row.id, name: row.name });
      tagsBy.set(row.characterId, list);
    }

    return rows.map(({ values, ...row }) => ({
      ...row,
      summary: summarizeCharacter(values ?? {}),
      avatarMediaId: avatarBy.get(row.id)?.mediaId ?? null,
      avatarCrop: avatarBy.get(row.id)?.crop ?? null,
      tags: tagsBy.get(row.id) ?? [],
    }));
  });
}

export type LibraryStats = { characters: number; favorites: number; collections: number };

export function getLibraryStats(db: DbExecutor): Promise<LibraryStats> {
  return guard(async () => {
    const [[totals], [collectionTotal]] = await Promise.all([
      db
        .select({
          characters: count(),
          favorites: sql<number>`count(*) filter (where ${characters.isFavorite})::int`,
        })
        .from(characters)
        .where(isNull(characters.deletedAt)),
      db.select({ value: count() }).from(collections),
    ]);
    return {
      characters: totals?.characters ?? 0,
      favorites: totals?.favorites ?? 0,
      collections: collectionTotal?.value ?? 0,
    };
  });
}
