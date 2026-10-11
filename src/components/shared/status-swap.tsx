"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

import { MOTION } from "@/lib/motion";

/**
 * A status line (saving / saved / error…) that eases in when its state changes. Key it by the
 * state, not the text, so it plays once per change. It starts mostly visible, so the new state is
 * readable at once; there is no exit, so a quick sequence of states never lags behind.
 */
export function StatusSwap({ children }: { children: ReactNode }) {
  return (
    <motion.span
      className="inline-flex items-center gap-1.5"
      initial={{ opacity: 0.35, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={MOTION.fade}
    >
      {children}
    </motion.span>
  );
}
