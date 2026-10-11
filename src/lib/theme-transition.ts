import { flushSync } from "react-dom";

import type { ThemePreference } from "@/features/settings/theme-options";

/** Same timing feel as the rest of the app, long enough to read as "spreading out". */
const REVEAL_MS = 450;

function resolve(preference: ThemePreference): "light" | "dark" {
  if (preference !== "system") return preference;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Switch the theme with a circular reveal spreading from `origin` (View Transitions API).
 *
 * `setTheme` stays the only writer of the preference (next-themes persists it and handles
 * "system"). The class is also set here, synchronously, because the browser snapshots the new
 * state as soon as the callback returns — next-themes applies it in an effect, which could land
 * after the snapshot and flash the old theme. Without the API, with reduced motion, or when the
 * visible theme does not change (e.g. "system" that resolves to the current one), the switch is
 * instant.
 */
export function switchTheme(
  preference: ThemePreference,
  setTheme: (theme: string) => void,
  origin?: Element | null,
) {
  const root = document.documentElement;
  const next = resolve(preference);
  const current = root.classList.contains("dark") ? "dark" : "light";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (
    next === current ||
    reduced ||
    typeof document.startViewTransition !== "function" ||
    root.dataset.themeTransition === "active"
  ) {
    setTheme(preference);
    return;
  }

  const width = window.innerWidth;
  const height = window.innerHeight;
  const rect = origin?.getBoundingClientRect();
  const x = rect ? rect.left + rect.width / 2 : width / 2;
  const y = rect ? rect.top + rect.height / 2 : height / 2;
  const radius = Math.hypot(Math.max(x, width - x), Math.max(y, height - y));
  // Percentages of the snapshot box: px clip paths on `::view-transition-new(root)` can land in the
  // wrong place on fractional display scales (see Magic UI's AnimatedThemeToggler).
  const at = `${(x / width) * 100}% ${(y / height) * 100}%`;
  const end = `${(radius / (Math.hypot(width, height) / Math.SQRT2)) * 100}%`;
  const clipPath = [`circle(0% at ${at})`, `circle(${end} at ${at})`];

  root.dataset.themeTransition = "active";
  // Pinned in CSS so the new snapshot never paints unclipped before the animation starts.
  root.style.setProperty("--theme-reveal-from", clipPath[0]!);
  const transition = document.startViewTransition(() => {
    root.classList.remove("light", "dark");
    root.classList.add(next);
    root.style.colorScheme = next;
    flushSync(() => setTheme(preference));
  });
  transition.ready
    .then(() =>
      root.animate(
        { clipPath },
        {
          duration: REVEAL_MS,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "forwards",
          pseudoElement: "::view-transition-new(root)",
        },
      ),
    )
    .catch(() => {});
  void transition.finished
    .finally(() => {
      delete root.dataset.themeTransition;
      root.style.removeProperty("--theme-reveal-from");
    })
    .catch(() => {});
}
