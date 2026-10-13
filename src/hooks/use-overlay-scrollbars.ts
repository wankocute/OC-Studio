"use client";

import { OverlayScrollbars, type PartialOptions } from "overlayscrollbars";
import { type Ref, useCallback } from "react";

/** Theme class styled in `globals.css` (`.os-theme-oc`). */
const THEME = "os-theme-oc";

/**
 * Shared options: the bars appear while scrolling or moving the pointer over the area and fade
 * out shortly after; the thumb can be dragged and the track clicked.
 */
export function overlayScrollbarsOptions(): PartialOptions {
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  return {
    scrollbars: {
      theme: THEME,
      autoHide: "move",
      autoHideDelay: 900,
      // Nothing flashes when an area mounts; the bars show on the first interaction.
      autoHideSuspend: true,
      clickScroll: reducedMotion ? "instant" : true,
    },
  };
}

/** Forwards the element to a ref passed through by the caller. */
function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

/**
 * Ref callback that gives an element which already scrolls (`overflow-y-auto` …) custom overlay
 * scrollbars. The element itself stays the viewport — no wrapper elements, its children and
 * scroll position are untouched (wheel, keyboard, touch and `scrollTo` stay native) — and only
 * the native bar is hidden, so it never takes layout width. One instance per element; it is
 * destroyed when the element unmounts (portals, closed menus).
 *
 * `ref` merges a ref passed through by the caller.
 */
export function useOverlayScrollbars<T extends HTMLElement>(ref?: Ref<T>) {
  return useCallback(
    (element: T | null) => {
      assignRef(ref, element);
      if (!element) return;
      const instance = OverlayScrollbars(
        { target: element, elements: { viewport: element } },
        // Inner areas scroll vertically only (as their `overflow-x-hidden` did).
        { ...overlayScrollbarsOptions(), overflow: { x: "hidden" } },
      );
      return () => {
        instance.destroy();
        assignRef(ref, null);
      };
    },
    [ref],
  );
}
