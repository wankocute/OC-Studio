"use client";

import Lenis from "lenis";
import { cancelFrame, frame, useReducedMotion } from "motion/react";
import { useEffect } from "react";

import { registerSmoothScroller } from "@/lib/smooth-scroll";

/** Elements that scroll on their own: wheel events inside them are never smoothed or taken. */
const OWN_SCROLL =
  '[role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"], [data-radix-popper-content-wrapper], [data-slot="sidebar"], textarea, select';

/**
 * Smooth wheel scrolling of the page (Lenis). Touch keeps native scrolling (`syncTouch: false`)
 * and reduced motion keeps native scrolling everywhere (no instance at all). Lenis runs on
 * Motion's frame loop, so the app has one animation loop; everything is removed on unmount.
 *
 * Nested scrollers (textarea, popovers, sidebar, dialogs) keep their own scrolling; while a
 * modal locks the page (`data-scroll-locked` from Radix), Lenis stops so the background cannot
 * move, and resumes at the same position when it closes.
 */
export function SmoothScroll() {
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;
    const lenis = new Lenis({
      // Light and responsive: follows the wheel quickly, settles without a long tail.
      lerp: 0.16,
      wheelMultiplier: 1,
      syncTouch: false,
      allowNestedScroll: true,
      stopInertiaOnNavigate: true,
      prevent: (node) => node.matches(OWN_SCROLL),
    });
    registerSmoothScroller(lenis);

    const update = ({ timestamp }: { timestamp: number }) => lenis.raf(timestamp);
    frame.update(update, true);

    const syncLock = () => {
      if (document.body.hasAttribute("data-scroll-locked")) lenis.stop();
      else lenis.start();
    };
    const observer = new MutationObserver(syncLock);
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-scroll-locked"] });
    syncLock();

    // Back/Forward: the router restores the position natively; drop any running inertia first.
    // (stop + start resets Lenis to the current position without moving the page.)
    const onPopState = () => {
      if (lenis.isStopped) return;
      lenis.stop();
      lenis.start();
    };
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
      observer.disconnect();
      cancelFrame(update);
      registerSmoothScroller(null);
      lenis.destroy();
    };
  }, [reducedMotion]);

  return null;
}
