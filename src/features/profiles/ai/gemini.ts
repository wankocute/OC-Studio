import "server-only";
import { z } from "zod";
import { geminiResponseError } from "./gemini-errors";
import { logAiRequest, transportFailure } from "./transport";
import { AI_LIMITS } from "./constants";
import { GEMINI_DEFAULT_MODEL, GEMINI_MODEL_ID, geminiModelInfo } from "./gemini-models";
import { AiError, instructions, readProviderJson, type SectionWriter } from "./provider";

/** Default model id (kept under its old name for existing callers and tests). */
export const GEMINI_FREE_MODEL = GEMINI_DEFAULT_MODEL;

/**
 * Finish reasons meaning Google stopped or filtered the content (ai.google.dev/api/generate-content,
 * `Candidate.FinishReason`, checked 2026-10-10). Image-only reasons cannot occur for text output
 * but are listed so a future response is still reported as blocked, not as "invalid output".
 */
const BLOCKED_FINISH_REASONS = new Set([
  "SAFETY",
  "RECITATION",
  "LANGUAGE",
  "BLOCKLIST",
  "PROHIBITED_CONTENT",
  "SPII",
  "IMAGE_SAFETY",
  "IMAGE_PROHIBITED_CONTENT",
  "IMAGE_RECITATION",
  "ESCALATION",
  "PUP_LIMITED_DISABLED",
]);

const geminiBody = z.object({
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  candidates: z
    .array(
      z.object({
        finishReason: z.string().optional(),
        content: z
          .object({
            parts: z
              .array(z.object({ text: z.string().optional(), thought: z.boolean().optional() }))
              .optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});

/** Only enum values from Google are kept as diagnostics — never text from the response. */
const reasonOf = (value: string) => (/^[A-Z_]{1,60}$/.test(value) ? value : "UNKNOWN");

/**
 * Interpret a successful (HTTP 2xx) generateContent body:
 * - `promptFeedback.blockReason` set → the prompt was blocked and no candidates are returned;
 * - a candidate stopped for safety/policy reasons → blocked;
 * - `MAX_TOKENS` → truncated; no candidate or no text → empty; anything else unusable → output.
 */
export function readGeminiOutput(decoded: unknown, httpStatus: number): unknown {
  const parsed = geminiBody.safeParse(decoded);
  if (!parsed.success) throw new AiError("output");
  const blockReason = parsed.data.promptFeedback?.blockReason;
  if (blockReason && blockReason !== "BLOCK_REASON_UNSPECIFIED") {
    throw new AiError("blocked", { httpStatus, status: reasonOf(blockReason), reasons: [] });
  }
  const candidate = parsed.data.candidates?.[0];
  if (!candidate) throw new AiError("outputEmpty");
  const finishReason = candidate.finishReason ?? "STOP";
  if (BLOCKED_FINISH_REASONS.has(finishReason)) {
    throw new AiError("blocked", { httpStatus, status: finishReason, reasons: [] });
  }
  if (finishReason === "MAX_TOKENS") throw new AiError("outputTruncated");
  if (finishReason !== "STOP") {
    throw new AiError("output", { httpStatus, status: reasonOf(finishReason), reasons: [] });
  }
  const text = (candidate.content?.parts ?? [])
    .filter((part) => !part.thought)
    .map((part) => part.text ?? "")
    .join("");
  if (text.trim() === "") throw new AiError("outputEmpty");
  try {
    return JSON.parse(text);
  } catch {
    throw new AiError("output");
  }
}

export function createGeminiWriter(
  key: string | undefined,
  model: string | undefined,
  request: typeof fetch = fetch,
): SectionWriter {
  return {
    async generate(factsJson, instruction, signal) {
      if (!key) throw new AiError("geminiKeyMissing");
      if (!model) throw new AiError("geminiModelMissing");
      // The allowlist is checked by the caller; here only the id format (it goes into the URL).
      if (!GEMINI_MODEL_ID.test(model)) throw new AiError("geminiModelUnsupported");
      const { thinkingLevel } = geminiModelInfo(model);
      const startedAt = Date.now();
      let httpStatus: number | undefined;
      try {
        const response = await request(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            signal,
            headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: instructions }] },
              contents: [
                {
                  role: "user",
                  parts: [
                    {
                      text: JSON.stringify({
                        facts: JSON.parse(factsJson),
                        writingRequest: instruction,
                      }),
                    },
                  ],
                },
              ],
              generationConfig: {
                candidateCount: 1,
                maxOutputTokens: AI_LIMITS.outputTokens,
                // Only for models documented to accept it; others keep Google's default.
                ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
                responseFormat: {
                  text: {
                    // REST uses the protobuf enum, not the MIME string shown in SDK examples.
                    mimeType: "APPLICATION_JSON",
                    schema: {
                      type: "object",
                      additionalProperties: false,
                      required: ["paragraphs"],
                      properties: {
                        paragraphs: {
                          type: "array",
                          minItems: 1,
                          maxItems: AI_LIMITS.paragraphs,
                          items: { type: "string", minLength: 1, maxLength: AI_LIMITS.outputChars },
                        },
                      },
                    },
                  },
                },
              },
            }),
          },
        );
        httpStatus = response.status;
        logAiRequest("http", startedAt, { httpStatus });
        if (!response.ok) throw await geminiResponseError(response, key, factsJson, instruction);
        return readGeminiOutput(await readProviderJson(response), response.status);
      } catch (error) {
        if (error instanceof AiError) throw error;
        const failure = transportFailure(error, signal.aborted);
        logAiRequest(failure.kind, startedAt, {
          errorName: failure.errorName,
          causeCode: failure.causeCode,
          httpStatus,
          stage: "transport",
        });
        throw new AiError(failure.kind === "fetch" ? "network" : failure.kind);
      }
    },
  };
}
