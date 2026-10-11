import type Lenis from "lenis";

/**
 * The page's Lenis instance while `SmoothScroll` is mounted (browser only; `null` with reduced
 * motion, where scrolling stays native). Programmatic scrolls go through here so they share the
 * wheel's smoothing and never fight an inertia animation that is still running.
 */
let lenis: Lenis | null = null;

export function registerSmoothScroller(instance: Lenis | null) {
  lenis = instance;
}

/** Space left between a sticky header and the element scrolled to. */
const BREATHING_ROOM = 12;

/**
 * Bottom edge of the sticky headers once stuck (`data-sticky-offset` marks them: the top bar,
 * the editor headers), measured live because they wrap to more lines on small screens.
 */
function stickyHeaderBottom(): number {
  let bottom = 0;
  for (const element of document.querySelectorAll<HTMLElement>("[data-sticky-offset]")) {
    if (element.offsetParent === null) continue; // hidden (e.g. a preserved inactive page)
    const top = Number.parseFloat(getComputedStyle(element).top) || 0;
    bottom = Math.max(bottom, top + element.offsetHeight);
  }
  return bottom;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function scrollToY(top: number) {
  const target = Math.max(0, top);
  if (lenis) {
    // Lenis clamps to the page height it measured last (debounced); a jump often follows a
    // layout change (mode switch, expanded section), so measure now.
    lenis.resize();
    lenis.scrollTo(target);
  } else window.scrollTo({ top: target, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

/** Scroll so `element` starts just below the sticky headers. */
export function scrollToElement(element: Element) {
  const top = element.getBoundingClientRect().top + window.scrollY;
  scrollToY(top - stickyHeaderBottom() - BREATHING_ROOM);
}

export function scrollToTop() {
  scrollToY(0);
}
