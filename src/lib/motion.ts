import type { Transition } from "motion/react";

/**
 * Shared timing for every animation in the app, so movement feels like one system: short
 * (150–300 ms), decelerating, never bouncy enough to distract from editing. CSS transitions use
 * the matching tokens in `globals.css` (`--ease-out-soft`, `--duration-*`).
 *
 * Reduced motion: `MotionProvider` sets `reducedMotion="user"`, which turns transform and layout
 * animations into instant changes; opacity fades are kept short.
 */
export const DURATION = { fast: 0.15, base: 0.2, slow: 0.28 } as const;

/** Quick start, soft landing ("ease-out-quint"-like). */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export const MOTION = {
  /** Highlights that slide between options (tabs, nav items). Springs retarget mid-flight. */
  indicator: { type: "spring", bounce: 0.12, visualDuration: 0.26 },
  /** Content appearing after a switch (tab panels, status text). */
  fade: { duration: DURATION.base, ease: EASE_OUT },
  /** Disclosure open/close (height + opacity). */
  collapse: { duration: DURATION.slow, ease: EASE_OUT },
  /** Small state feedback (icons, favourite star). */
  pop: { type: "spring", bounce: 0.45, visualDuration: 0.3 },
  /** Cards and tiles moving to a new place. */
  layout: { type: "spring", bounce: 0.1, visualDuration: 0.28 },
} as const satisfies Record<string, Transition>;

/** Offset for content entering after a switch: small enough to read as "the same place". */
export const ENTER_OFFSET = 6;
