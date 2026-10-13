"use client";

import { OverlayScrollbars } from "overlayscrollbars";
import { useEffect } from "react";

import { overlayScrollbarsOptions } from "@/hooks/use-overlay-scrollbars";

/**
 * Overlay scrollbar for the page. Initialised on <body>, OverlayScrollbars keeps <html> as the
 * scrolling element (no wrappers), so `window.scrollTo`, Lenis, sticky headers and the scroll
 * progress keep working unchanged.
 *
 * The native page bar is hidden from the first paint (`data-overlayscrollbars-initialize` on
 * <html> and <body>, see the root layout), so it never takes layout width. That is also what keeps
 * menus from shifting the page: Radix's scroll lock measures the bar it removes
 * (`innerWidth - clientWidth`) and compensates with `margin-right` on <body>; with no bar the gap
 * is 0 and nothing moves.
 */
export function PageScrollbars() {
  useEffect(() => {
    const instance = OverlayScrollbars(document.body, overlayScrollbarsOptions());
    return () => instance.destroy();
  }, []);

  return null;
}
