"use client";

import { Moon, Sun } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTheme } from "next-themes";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { useIsClient } from "@/hooks/use-is-client";
import { messages } from "@/i18n";
import { MOTION } from "@/lib/motion";
import { switchTheme } from "@/lib/theme-transition";

/**
 * One click flips between light and dark (from what is shown now, so a "system" preference
 * becomes an explicit one). "Theo hệ thống" stays available in Settings.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isClient = useIsClient();
  const button = useRef<HTMLButtonElement>(null);
  const dark = resolvedTheme === "dark";
  const label = !isClient
    ? messages.theme.toggle
    : dark
      ? messages.theme.switchToLight
      : messages.theme.switchToDark;

  return (
    <Button
      ref={button}
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      onClick={() => switchTheme(dark ? "light" : "dark", setTheme, button.current)}
    >
      {isClient ? (
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={dark ? "moon" : "sun"}
            className="flex"
            initial={{ opacity: 0, scale: 0.4, rotate: dark ? -90 : 90 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.4, rotate: dark ? 90 : -90 }}
            transition={MOTION.pop}
          >
            {dark ? <Moon aria-hidden /> : <Sun aria-hidden />}
          </motion.span>
        </AnimatePresence>
      ) : (
        // Before hydration the theme is only known to CSS (no mismatch, no flash).
        <>
          <Sun className="dark:hidden" aria-hidden />
          <Moon className="hidden dark:block" aria-hidden />
        </>
      )}
    </Button>
  );
}
