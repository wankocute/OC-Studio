import "server-only";
import { z } from "zod";
import { AI_LIMITS } from "./constants";
import { AiError, readProviderJson } from "./provider";

/** Redact before retaining anything on an error or returning it to the client. */
function redact(text: string, key: string, factsJson: string, instruction: string): string {
  const privateValues = new Set([key, factsJson, instruction]);
  function collect(value: unknown) {
    if (typeof value === "string" || typeof value === "number") privateValues.add(String(value));
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
  }
  for (const input of [factsJson, instruction]) {
    try {
      collect(JSON.parse(input));
    } catch {
      /* The instruction can be plain text. */
    }
  }
  const variants = [...privateValues]
    .filter(Boolean)
    .flatMap((value) => [value, JSON.stringify(value).slice(1, -1), encodeURIComponent(value)])
    .sort((a, b) => b.length - a.length);
  let safe = text;
  for (const value of variants) safe = safe.split(value).join("[đã che]");
  return safe
    .replace(/https?:\/\/[^\s<>"']+/gi, "[URL đã che]")
    .replace(/AIza[\w-]+/g, "[key đã che]")
    .replace(/\b(?:key|api_key|x-goog-api-key)\s*[=:]\s*[^\s,;]+/gi, "key=[đã che]")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .slice(0, AI_LIMITS.errorChars);
}

export async function geminiResponseError(
  response: Response,
  key: string,
  factsJson: string,
  instruction: string,
): Promise<AiError> {
  let decoded: unknown;
  try {
    decoded = await readProviderJson(response);
  } catch {
    /* No usable diagnostic body. */
  }
  const parsed = z
    .object({
      error: z.object({
        status: z.string().optional(),
        message: z.string().optional(),
        details: z.array(z.unknown()).optional(),
      }),
    })
    .safeParse(decoded);
  const body = parsed.success ? parsed.data.error : undefined;
  const reasons = (body?.details ?? []).flatMap((detail) => {
    const item = z.object({ reason: z.string() }).safeParse(detail);
    return item.success ? [item.data.reason] : [];
  });
  const invalidKey =
    reasons.includes("API_KEY_INVALID") ||
    /API key not valid|API_KEY_INVALID/i.test(body?.message ?? "");
  const code: AiError["code"] =
    response.status === 429
      ? "rateLimit"
      : invalidKey
        ? "geminiKeyRejected"
        : body?.status === "FAILED_PRECONDITION"
          ? "geminiPrecondition"
          : response.status === 400 && body?.status === "INVALID_ARGUMENT"
            ? "geminiRequestRejected"
            : response.status === 401
              ? "geminiUnauthorized"
              : response.status === 403
                ? "geminiForbidden"
                : response.status === 404
                  ? "geminiModelNotFound"
                  : response.status >= 500
                    ? "network"
                    : "geminiRejected";
  const clean = (value: string) => redact(value, key, factsJson, instruction);
  return new AiError(code, {
    httpStatus: response.status,
    ...(body?.status ? { status: clean(body.status) } : {}),
    ...(body?.message ? { message: clean(body.message) } : {}),
    reasons: reasons.map(clean),
  });
}
