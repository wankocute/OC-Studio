import "server-only";

// Read only known diagnostic identifiers, never an exception message, URL, body or headers.
const codes = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "ERR_SSL_WRONG_VERSION_NUMBER",
]);

export function transportFailure(error: unknown, aborted: boolean) {
  const record = error && typeof error === "object" ? error : {};
  const cause =
    "cause" in record && record.cause && typeof record.cause === "object" ? record.cause : {};
  const rawCode = "code" in cause ? cause.code : "code" in record ? record.code : undefined;
  const causeCode = typeof rawCode === "string" && codes.has(rawCode) ? rawCode : undefined;
  const rawName = "name" in record ? record.name : undefined;
  const errorName =
    typeof rawName === "string" &&
    ["AbortError", "TimeoutError", "TypeError", "Error", "AiError"].includes(rawName)
      ? rawName
      : "Error";
  const kind: "timeout" | "dns" | "tls" | "fetch" = aborted
    ? "timeout"
    : causeCode === "ENOTFOUND" || causeCode === "EAI_AGAIN"
      ? "dns"
      : causeCode && /CERT|TLS|SSL|SELF_SIGNED|ISSUER|LEAF_SIGNATURE/.test(causeCode)
        ? "tls"
        : "fetch";
  return { kind, errorName, ...(causeCode ? { causeCode } : {}) };
}

export function logAiRequest(
  kind: string,
  startedAt: number,
  fields: {
    httpStatus?: number;
    errorName?: string;
    causeCode?: string;
    stage?: "watchdog" | "transport";
  } = {},
) {
  console.info("[profile-ai]", {
    kind,
    elapsedMs: Math.max(0, Date.now() - startedAt),
    ...fields,
  });
}
