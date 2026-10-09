"use client";

import { useTheme } from "next-themes";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useIsClient } from "@/hooks/use-is-client";
import { messages } from "@/i18n";

import { isThemePreference, themeOptions } from "../theme-options";

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  const isClient = useIsClient();

  return (
    <RadioGroup
      aria-label={messages.theme.label}
      // Theme is only known on the client; keep the group empty until hydration to avoid a mismatch.
      value={isClient ? (theme ?? "system") : ""}
      onValueChange={(value) => {
        if (isThemePreference(value)) setTheme(value);
      }}
      className="grid gap-3 sm:grid-cols-3"
    >
      {themeOptions.map((option) => {
        const id = `theme-${option.value}`;
        return (
          <Label
            key={option.value}
            htmlFor={id}
            className="flex cursor-pointer items-center gap-3 rounded-lg border bg-background p-3 font-normal transition-colors hover:bg-muted has-data-checked:border-primary has-data-checked:bg-accent has-data-checked:text-accent-foreground"
          >
            <RadioGroupItem id={id} value={option.value} />
            <option.icon className="size-4" aria-hidden />
            <span>{option.label}</span>
          </Label>
        );
      })}
    </RadioGroup>
  );
}
