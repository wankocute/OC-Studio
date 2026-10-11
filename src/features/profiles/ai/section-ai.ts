import "server-only";

import { getDb } from "@/db";

import { createAiJobStore } from "../server/ai-job-store";

import { createAiService, type AiService } from "./service";

// One service per instance (kept across dev reloads) so a cancel that reaches the instance
// running the job aborts it at once; all state itself is in Postgres.
const globalAi = globalThis as typeof globalThis & { ocSectionAi?: AiService };

export function getSectionAi(): AiService {
  globalAi.ocSectionAi ??= createAiService(createAiJobStore(getDb()));
  return globalAi.ocSectionAi;
}
