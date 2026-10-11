"use client";

import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useState } from "react";

import { MOTION } from "@/lib/motion";

/**
 * Disclosure body that opens and closes with a height + fade animation. Children stay mounted
 * while closed (form inputs keep their state and focus is never lost to a remount); a closed body
 * is `hidden` once the animation ends, and `inert` from the start, so it is out of the tab order
 * and the accessibility tree. Toggling mid-animation reverses from the current height.
 */
export function Collapse({
  open,
  id,
  className,
  children,
}: {
  open: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const [settled, setSettled] = useState<"open" | "closed" | null>(open ? "open" : "closed");
  const target = open ? "open" : "closed";
  return (
    <motion.div
      id={id}
      className={className}
      initial={false}
      animate={target}
      variants={{
        open: { height: "auto", opacity: 1 },
        closed: { height: 0, opacity: 0 },
      }}
      transition={reducedMotion ? { duration: 0 } : MOTION.collapse}
      onAnimationStart={() => setSettled(null)}
      onAnimationComplete={(definition) => setSettled(definition === "open" ? "open" : "closed")}
      hidden={!open && settled === "closed"}
      inert={!open}
      // Clip only while moving or closed, so focus rings inside an open body are not cut off.
      style={{ overflow: open && settled === "open" ? "visible" : "hidden" }}
    >
      {children}
    </motion.div>
  );
}
