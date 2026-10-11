"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/**
 * App-wide Motion settings: with "reduce motion" turned on in the OS, transform and layout
 * animations jump straight to their end state (opacity changes stay, and are short).
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
