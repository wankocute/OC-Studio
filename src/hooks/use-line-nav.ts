"use client";

import { useEffect, useRef } from "react";

/** How far (px, from an item's centre) the pointer still affects it. */
const RADIUS = 56;
/** Smoothing time constant (ms): exponential easing, frame-rate independent. */
const SMOOTHING = 90;

/** Ease-in-out falloff, as React Bits' Line Sidebar "smooth" curve. */
const falloff = (p: number) => p * p * (3 - 2 * p);

const ITEM = "[data-line-item]";

/** Items that can be seen: collapsed disclosure bodies are `inert`, hidden ones have no box. */
function visibleItems(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(ITEM)).filter(
    (item) => item.offsetParent !== null && !item.closest("[inert]"),
  );
}

/**
 * Proximity animation for navigation lists (see `.line-nav-*` in `globals.css`). Attach the
 * returned ref to the list; mark each navigation link/button with `data-line-item` and the
 * `line-nav-item` class. Only items are animated — menus, inputs and other controls in the list
 * are left alone.
 *
 * Values are written as a CSS variable from one rAF loop that stops once everything settles, so
 * moving the pointer never re-renders React. Touch input is ignored (no hover to follow); the
 * current item (`aria-current`) is always fully highlighted by CSS.
 */
export function useLineNav<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const targets = new Map<HTMLElement, number>();
    const current = new WeakMap<HTMLElement, number>();
    let frame: number | null = null;
    let last = 0;

    const step = (now: number) => {
      frame = null;
      const dt = Math.min(now - last, 50);
      last = now;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const k = reduced ? 1 : 1 - Math.exp(-dt / SMOOTHING);
      let moving = false;
      for (const item of container.querySelectorAll<HTMLElement>(ITEM)) {
        const active = item.hasAttribute("aria-current") ? 1 : 0;
        const target = Math.max(targets.get(item) ?? 0, active);
        const from = current.get(item) ?? 0;
        let value = from + (target - from) * k;
        if (Math.abs(target - value) < 0.002) value = target;
        else moving = true;
        if (value !== from) {
          current.set(item, value);
          item.style.setProperty("--line-e", value.toFixed(3));
        }
      }
      if (moving) frame = requestAnimationFrame(step);
    };
    const start = () => {
      if (frame !== null) return;
      last = performance.now();
      frame = requestAnimationFrame(step);
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      targets.clear();
      for (const item of visibleItems(container)) {
        const box = item.getBoundingClientRect();
        const distance = Math.abs(event.clientY - (box.top + box.height / 2));
        targets.set(item, falloff(Math.max(0, 1 - distance / RADIUS)));
      }
      start();
    };
    const onLeave = () => {
      targets.clear();
      start();
    };

    container.addEventListener("pointermove", onMove);
    container.addEventListener("pointerleave", onLeave);
    // The current item can change without the pointer moving (keyboard, navigation).
    const observer = new MutationObserver(start);
    observer.observe(container, { subtree: true, attributeFilter: ["aria-current"] });
    return () => {
      container.removeEventListener("pointermove", onMove);
      container.removeEventListener("pointerleave", onLeave);
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  return ref;
}
