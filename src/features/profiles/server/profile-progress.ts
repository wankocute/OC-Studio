import "server-only";

import type { Database } from "@/db";
import { summarizePrint } from "@/features/profiles/print";
import { profileProgress } from "@/features/profiles/view";

import { loadFactSources } from "./fact-source-loader";
import { createProfileRepository } from "./profile-repository";
import { toProfileView } from "./profile-views";

/**
 * Progress of the character's primary profile (`null` if none was started), with approved
 * sections checked against the current facts. Read only: nothing is created or locked.
 */
export async function loadProfileProgress(db: Database, characterId: string) {
  const [{ sources }, profile] = await Promise.all([
    loadFactSources(db, characterId),
    createProfileRepository(db).getPrimary(characterId),
  ]);
  if (!profile) return null;
  const view = toProfileView(profile, sources);
  return { ...profileProgress(view), print: summarizePrint(view.sections) };
}
