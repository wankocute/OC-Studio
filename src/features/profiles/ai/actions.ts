"use server";
import { refresh } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { getServerEnv, InvalidServerEnvError } from "@/lib/env";
import { fail, failFromError, invalidInput, ok, type ActionResult } from "@/lib/action-result";
import { messages } from "@/i18n";
import { sectionLabel } from "../view";
import { createProfileRepository } from "../server/profile-repository";
import { loadFactSources } from "../server/fact-source-loader";
import { AI_LIMITS } from "./constants";
import { AiError } from "./provider";
import { aiConfiguration, createConfiguredWriter } from "./configuration";
import { sectionAi } from "./service";

async function load(sectionId: string) {
  const repository = createProfileRepository(getDb());
  const owner = await repository.getSectionContext(sectionId);
  const section = await repository.getSection(sectionId);
  const { character, library } = await loadFactSources(getDb(), owner.characterId);
  return {
    sectionId,
    draftRevision: section.draftRevision,
    facts: character.facts,
    context: { library },
    groups: section.sourceGroups,
    title: sectionLabel(section),
  };
}
function errorResult(error: unknown) {
  if (error instanceof InvalidServerEnvError)
    return fail({ code: "invalid_input", message: error.message });
  if (error instanceof AiError)
    return fail({
      code: "invalid_input",
      message: [
        messages.profileAi.errors[error.code],
        error.diagnostic &&
          `Google: HTTP ${error.diagnostic.httpStatus}; ${error.diagnostic.status ?? ""}; ${error.diagnostic.reasons.join(", ")}; ${error.diagnostic.message ?? ""}`,
      ]
        .filter(Boolean)
        .join("\n"),
    });
  return failFromError(error);
}
export async function previewSectionAiAction(
  input: unknown,
): Promise<
  ActionResult<ReturnType<typeof sectionAi.preview> & ReturnType<typeof aiConfiguration>>
> {
  const parsed = z
    .object({
      sectionId: z.uuid(),
      allow: z.array(z.string().max(AI_LIMITS.refChars)).max(AI_LIMITS.permissions).default([]),
    })
    .safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  try {
    const env = getServerEnv();
    return ok({
      ...sectionAi.preview(await load(parsed.data.sectionId), parsed.data.allow),
      ...aiConfiguration(env),
    });
  } catch (error) {
    return errorResult(error);
  }
}
export async function generateSectionAiAction(
  input: unknown,
): Promise<ActionResult<Awaited<ReturnType<typeof sectionAi.generate>>>> {
  const parsed = z
    .object({ token: z.uuid(), instruction: z.string().max(AI_LIMITS.instructionChars) })
    .safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  try {
    const env = getServerEnv();
    return ok(
      await sectionAi.generate(
        parsed.data.token,
        parsed.data.instruction,
        createConfiguredWriter(env),
        load,
      ),
    );
  } catch (error) {
    return errorResult(error);
  }
}
export async function applySectionAiAction(
  input: unknown,
): Promise<ActionResult<Awaited<ReturnType<typeof sectionAi.apply>>>> {
  const parsed = z
    .object({ token: z.uuid(), confirmStale: z.boolean().default(false) })
    .safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  try {
    const result = await sectionAi.apply(
      parsed.data.token,
      parsed.data.confirmStale,
      load,
      async (candidate) => {
        const saved = await createProfileRepository(getDb()).applyAiDraft(
          candidate.sectionId,
          candidate.draftRevision,
          candidate.content,
          candidate.snapshot,
        );
        return { draftRevision: saved.draftRevision, savedAt: saved.draftUpdatedAt.toISOString() };
      },
    );
    refresh();
    return ok(result);
  } catch (error) {
    return errorResult(error);
  }
}
export async function discardSectionAiAction(token: unknown): Promise<ActionResult> {
  const parsed = z.uuid().safeParse(token);
  if (!parsed.success) return invalidInput(parsed.error);
  sectionAi.discard(parsed.data);
  return ok();
}
