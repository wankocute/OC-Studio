import "server-only";
import { z } from "zod";
import { geminiResponseError } from "./gemini-errors";
import { logAiRequest, transportFailure } from "./transport";
import { AI_LIMITS } from "./constants";
import { AiError, instructions, readProviderJson, type SectionWriter } from "./provider";

// Verified against Google's pricing and structured output docs on 2026-10-10.
// Fail closed for other model names; never switch models to bypass a free quota.
export const GEMINI_FREE_MODEL = "gemini-3.8-flash";

export function createGeminiWriter(
  key: string | undefined,
  model: string | undefined,
  request: typeof fetch = fetch,
): SectionWriter {
  return {
    async generate(factsJson, instruction, signal) {
      if (!key) throw new AiError("geminiKeyMissing");
      if (!model) throw new AiError("geminiModelMissing");
      if (model !== GEMINI_FREE_MODEL) throw new AiError("geminiModelUnsupported");
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
                thinkingConfig: { thinkingLevel: "LOW" },
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
        const result = z
          .object({
            candidates: z
              .array(
                z.object({
                  finishReason: z.literal("STOP"),
                  content: z.object({
                    parts: z
                      .array(z.object({ text: z.string(), thought: z.boolean().optional() }))
                      .min(1),
                  }),
                }),
              )
              .length(1),
          })
          .safeParse(await readProviderJson(response));
        if (!result.success) throw new AiError("output");
        const text = result.data.candidates[0]!.content.parts.filter((part) => !part.thought)
          .map((part) => part.text)
          .join("");
        try {
          return JSON.parse(text);
        } catch {
          throw new AiError("output");
        }
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
