"use server";
import { refresh } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { rejectUnauthenticatedAction } from "@/features/auth/server/session";
import { getServerEnv, InvalidServerEnvError } from "@/lib/env";
import { fail, failFromError, invalidInput, ok, type ActionResult } from "@/lib/action-result";
import { sectionLabel } from "../view";
import { createProfileRepository } from "../server/profile-repository";
import { loadFactSources } from "../server/fact-source-loader";
import { AI_LIMITS } from "./constants";
import { AiError } from "./provider";
import { aiConfiguration, createConfiguredWriter, resolveModel } from "./configuration";
import { describeAiError } from "./describe-error";
import { type AiJobView, sectionAi } from "./service";

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
    return fail({ code: "invalid_input", message: describeAiError(error) });
  return failFromError(error);
}
export async function previewSectionAiAction(
  input: unknown,
): Promise<
  ActionResult<ReturnType<typeof sectionAi.preview> & ReturnType<typeof aiConfiguration>>
> {
  const denied = await rejectUnauthenticatedAction();
  if (denied) return denied;
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
/**
 * Start writing in the background and return the job at once. The facts sent are the ones frozen
 * in the preview; a section that already has a job in progress gets that job back.
 */
export async function startSectionAiAction(input: unknown): Promise<ActionResult<AiJobView>> {
  const denied = await rejectUnauthenticatedAction();
  if (denied) return denied;
  const parsed = z
    .object({
      token: z.uuid(),
      instruction: z.string().max(AI_LIMITS.instructionChars),
      // Only compared with the server's allowlist; never passed on unchecked.
      model: z.string().max(100).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  try {
    const env = getServerEnv();
    const model = resolveModel(env, parsed.data.model);
    const option = aiConfiguration(env).models.find((candidate) => candidate.id === model)!;
    return ok(
      await sectionAi.start(
        parsed.data.token,
        parsed.data.instruction,
        createConfiguredWriter(env, fetch, model),
        load,
        { timeoutMs: env.AI_REQUEST_TIMEOUT_MS, model: { id: model, label: option.label } },
      ),
    );
  } catch (error) {
    return errorResult(error);
  }
}

/**
 * Current state of jobs, read from server memory only (the provider is never called here).
 * `null` = the server no longer knows the job (restart or expiry).
 */
export async function getSectionAiJobsAction(
  ids: unknown,
): Promise<ActionResult<(AiJobView | null)[]>> {
  const denied = await rejectUnauthenticatedAction();
  if (denied) return denied;
  const parsed = z.array(z.uuid()).max(AI_LIMITS.jobs).safeParse(ids);
  if (!parsed.success) return invalidInput(parsed.error);
  return ok(parsed.data.map((id) => sectionAi.job(id)));
}

export async function cancelSectionAiJobAction(
  id: unknown,
): Promise<ActionResult<AiJobView | null>> {
  const denied = await rejectUnauthenticatedAction();
  if (denied) return denied;
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return invalidInput(parsed.error);
  return ok(sectionAi.cancel(parsed.data));
}

export async function dismissSectionAiJobAction(id: unknown): Promise<ActionResult> {
  const denied = await rejectUnauthenticatedAction();
  if (denied) return denied;
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return invalidInput(parsed.error);
  sectionAi.dismiss(parsed.data);
  return ok();
}

export async function applySectionAiAction(
  input: unknown,
): Promise<ActionResult<Awaited<ReturnType<typeof sectionAi.apply>>>> {
  const denied = await rejectUnauthenticatedAction();
  if (denied) return denied;
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
  const denied = await rejectUnauthenticatedAction();
  if (denied) return denied;
  const parsed = z.uuid().safeParse(token);
  if (!parsed.success) return invalidInput(parsed.error);
  sectionAi.discard(parsed.data);
  return ok();
}
