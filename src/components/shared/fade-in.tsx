"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

import { ENTER_OFFSET, MOTION } from "@/lib/motion";

/**
 * Entrance for content that replaces other content (a tab panel, a section). Key it by what it
 * shows: a new key plays a short fade + rise. There is no exit animation, so the new content is
 * there at once and fast switching always lands on the last choice without queued animations.
 * Only use it where the content is replaced anyway — never to force a remount of a form.
 */
export function FadeIn({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: ENTER_OFFSET }}
      animate={{ opacity: 1, y: 0 }}
      transition={MOTION.fade}
    >
      {children}
    </motion.div>
  );
}
