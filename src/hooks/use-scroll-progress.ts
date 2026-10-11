"use client";

import { type MotionValue, useMotionValue } from "motion/react";
import { type RefObject, useEffect, useState } from "react";

/** Where a scrolled position counts as "away from the top" (the button appears). */
export const SCROLL_AWAY_PX = 200;

export function scrollProgress(top: number, scrollHeight: number, clientHeight: number) {
  const range = scrollHeight - clientHeight;
  return range > 0 ? Math.min(1, Math.max(0, top / range)) : 0;
}

/**
 * Scroll progress (0–1) of the page, or of `container` when the content scrolls inside its own
 * element. Progress is a MotionValue (no React render per scroll); only crossing the
 * `SCROLL_AWAY_PX` line updates state. Reads are batched to one per animation frame and also run
 * when the content changes height, so the ring stays right without scrolling.
 */
export function useScrollProgress(container?: RefObject<HTMLElement | null>): {
  progress: MotionValue<number>;
  away: boolean;
} {
  const progress = useMotionValue(0);
  const [away, setAway] = useState(false);

  useEffect(() => {
    const element = container?.current ?? null;
    const scroller = element ?? document.documentElement;
    const target: HTMLElement | Window = element ?? window;
    let frame: number | null = null;

    const read = () => {
      frame = null;
      const top = element ? element.scrollTop : window.scrollY;
      const { scrollHeight, clientHeight } = scroller;
      progress.set(scrollProgress(top, scrollHeight, clientHeight));
      // A page too short to scroll past the line never shows the button.
      setAway(top > SCROLL_AWAY_PX && scrollHeight - clientHeight > SCROLL_AWAY_PX);
    };
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(read);
    };

    target.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const resize = new ResizeObserver(schedule);
    resize.observe(element ?? document.body);
    if (element?.firstElementChild) resize.observe(element.firstElementChild);
    read();
    return () => {
      target.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      resize.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [container, progress]);

  return { progress, away };
}
