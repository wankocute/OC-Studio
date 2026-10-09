import { vi } from "./vi";

export type { Messages } from "./vi";

export const DEFAULT_LOCALE = "vi";

/** Active UI messages. Single locale for now; replace with per-request lookup when i18n lands. */
export const messages = vi;
