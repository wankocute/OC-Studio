export const AI_LIMITS = {
  inputChars: 60_000,
  instructionChars: 2_000,
  outputChars: 12_000,
  paragraphs: 40,
  outputTokens: 6_000,
  responseBytes: 150_000,
  timeoutMs: 60_000,
  ttlMs: 15 * 60_000,
  entries: 100,
  permissions: 500,
  refChars: 300,
} as const;
