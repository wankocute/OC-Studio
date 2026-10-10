/** Shared autosave timing (Fact Editor, profile workspace). Safe for Client Components. */

/** Quiet period after the last edit before saving — one request per pause, not per keystroke. */
export const AUTOSAVE_DELAY_MS = 1000;
/** A save that has not answered by then is reported as failed (the draft is kept for a retry). */
export const SAVE_TIMEOUT_MS = 20_000;

/** Reject with `Error("timeout")` if `promise` has not settled after `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}
