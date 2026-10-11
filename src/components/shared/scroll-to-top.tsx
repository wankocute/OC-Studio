"use client";

import { ArrowUp } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion, useSpring } from "motion/react";
import { type RefObject, useSyncExternalStore } from "react";

import { useScrollProgress } from "@/hooks/use-scroll-progress";
import { messages } from "@/i18n";
import { MOTION } from "@/lib/motion";
import { scrollToTop } from "@/lib/smooth-scroll";

/** Set on `<body>` while a field is dragged towards the bin (`FieldShredHandle`). */
export const FIELD_DRAG_ATTRIBUTE = "data-field-dragging";

function subscribeToDrag(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.body, { attributes: true, attributeFilter: [FIELD_DRAG_ATTRIBUTE] });
  return () => observer.disconnect();
}
const isDragging = () => document.body.hasAttribute(FIELD_DRAG_ATTRIBUTE);

const SIZE = 44;
const STROKE = 2.5;
const RADIUS = (SIZE - STROKE) / 2;

/**
 * Floating "back to top" button with a ring that fills clockwise as the page scrolls. Appears
 * once the page is scrolled away from the top, and steps aside while a field is dragged to the
 * delete bin (same corner). The scroll itself goes through the page's smooth scroller, so the
 * ring empties with the real position instead of resetting.
 *
 * Pass `container` when the content scrolls inside its own element instead of the page.
 */
export function ScrollToTop({ container }: { container?: RefObject<HTMLElement | null> }) {
  const { progress, away } = useScrollProgress(container);
  const reducedMotion = useReducedMotion();
  // Smooths the ring between scroll events; with reduced motion it follows the position as is.
  const smooth = useSpring(progress, { stiffness: 260, damping: 40, restDelta: 0.001 });
  const dragging = useSyncExternalStore(subscribeToDrag, isDragging, () => false);

  const toTop = () => {
    const element = container?.current;
    if (!element) return scrollToTop();
    element.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  };

  return (
    <AnimatePresence>
      {away && !dragging && (
        <motion.button
          key="scroll-to-top"
          type="button"
          aria-label={messages.nav.scrollToTop}
          title={messages.nav.scrollToTop}
          onClick={toTop}
          className="group fixed right-[calc(1rem+env(safe-area-inset-right))] bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 flex items-center justify-center rounded-full bg-card/90 text-foreground shadow-md ring-1 ring-border backdrop-blur-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:right-6 md:bottom-6"
          style={{ width: SIZE, height: SIZE }}
          initial={{ opacity: 0, scale: 0.6, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.6, y: 12 }}
          whileHover="hover"
          whileTap={{ scale: 0.9 }}
          variants={{ hover: { scale: 1.08 } }}
          transition={MOTION.pop}
        >
          <svg
            aria-hidden
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="pointer-events-none absolute inset-0 -rotate-90"
          >
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              strokeWidth={STROKE}
              className="stroke-border"
            />
            <motion.circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              strokeWidth={STROKE}
              strokeLinecap="round"
              className="stroke-primary transition-[filter] duration-(--duration-base) group-hover:drop-shadow-[0_0_4px_var(--primary)]"
              style={{ pathLength: reducedMotion ? progress : smooth }}
            />
          </svg>
          <motion.span className="flex" variants={{ hover: { y: -2 } }} transition={MOTION.pop}>
            <ArrowUp className="size-4" aria-hidden />
          </motion.span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
