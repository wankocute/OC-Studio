"use client";

import { Moon, Sun } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTheme } from "next-themes";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isThemePreference, themeOptions } from "@/features/settings/theme-options";
import { useIsClient } from "@/hooks/use-is-client";
import { messages } from "@/i18n";
import { MOTION } from "@/lib/motion";
import { switchTheme } from "@/lib/theme-transition";

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const isClient = useIsClient();
  const trigger = useRef<HTMLButtonElement>(null);
  const dark = resolvedTheme === "dark";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button ref={trigger} variant="ghost" size="icon-sm" aria-label={messages.theme.toggle}>
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
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel>{messages.theme.label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={isClient ? theme : undefined}
          onValueChange={(value) => {
            if (isThemePreference(value)) switchTheme(value, setTheme, trigger.current);
          }}
        >
          {themeOptions.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <option.icon aria-hidden />
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
