import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";

import { messages } from "@/i18n";

export type ThemePreference = "light" | "dark" | "system";

export const themeOptions: readonly { value: ThemePreference; label: string; icon: LucideIcon }[] =
  [
    { value: "light", label: messages.theme.light, icon: Sun },
    { value: "dark", label: messages.theme.dark, icon: Moon },
    { value: "system", label: messages.theme.system, icon: Monitor },
  ];

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}
