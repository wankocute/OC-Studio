import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import type { DbExecutor } from "@/db";
import { RepositoryError } from "@/db/repository-errors";
import { characters } from "@/db/schema";

/** Library links (tags, collections, media) can only be added to non-deleted characters. */
export async function assertActiveCharacter(executor: DbExecutor, id: string): Promise<void> {
  const [row] = await executor
    .select({ id: characters.id })
    .from(characters)
    .where(and(eq(characters.id, id), isNull(characters.deletedAt)));
  if (!row) throw new RepositoryError("not_found", { entity: "character", id });
}
