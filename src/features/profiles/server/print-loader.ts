import "server-only";

import type { Database } from "@/db";
import { createCharacterRepository } from "@/features/characters/server/character-repository";
import { createMediaRepository } from "@/features/library/server/media-repository";
import { planPrint, type PrintSource } from "@/features/profiles/print";

import { createProfileRepository } from "./profile-repository";

export type PrintAvatar = { mediaId: string; width: number | null; height: number | null };

/**
 * Everything the print view shows, read only: no profile is created and no row is locked or
 * written. A missing or deleted character surfaces as the repository's `not_found`.
 */
export async function loadPrintView(db: Database, characterId: string, source: PrintSource) {
  const character = await createCharacterRepository(db).getById(characterId);
  const [profile, media] = await Promise.all([
    createProfileRepository(db).getPrimary(characterId),
    createMediaRepository(db).listForCharacter(characterId),
  ]);
  const avatar = media.find((item) => item.role === "avatar");
  return {
    name: character.facts.displayName,
    avatar: avatar
      ? ({ mediaId: avatar.mediaId, width: avatar.width, height: avatar.height } as PrintAvatar)
      : null,
    plan: profile ? planPrint(profile.sections, source) : null,
  };
}
