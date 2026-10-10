export const AI_LIMITS = {
  inputChars: 60_000,
  instructionChars: 2_000,
  outputChars: 12_000,
  paragraphs: 40,
  outputTokens: 6_000,
  responseBytes: 150_000,
  errorChars: 2_000,
  /** Default provider deadline; the server reads AI_REQUEST_TIMEOUT_MS. */
  timeoutMs: 300_000,
  /** Finished jobs (result or error) are kept this long for the user to come back to. */
  jobTtlMs: 15 * 60_000,
  jobs: 200,
  ttlMs: 15 * 60_000,
  entries: 100,
  permissions: 500,
  refChars: 300,
} as const;
