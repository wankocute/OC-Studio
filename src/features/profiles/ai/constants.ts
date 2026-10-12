export const AI_LIMITS = {
  inputChars: 60_000,
  instructionChars: 2_000,
  outputChars: 12_000,
  paragraphs: 40,
  outputTokens: 6_000,
  responseBytes: 150_000,
  errorChars: 2_000,
  /**
   * Default provider deadline; the server reads AI_REQUEST_TIMEOUT_MS (at most 280 s). Kept under
   * the 300 s a Vercel Hobby function may run, which also bounds the background job.
   */
  timeoutMs: 240_000,
  /** An active job this long past its deadline was abandoned by its instance: mark it failed. */
  deadlineGraceMs: 30_000,
  /** How often a running job checks whether it was cancelled from another instance. */
  cancelCheckMs: 2_000,
  /** Finished jobs (result or error) are kept this long for the user to come back to. */
  jobTtlMs: 15 * 60_000,
  jobs: 200,
  ttlMs: 15 * 60_000,
  entries: 100,
} as const;
