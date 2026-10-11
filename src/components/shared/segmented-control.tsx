"use client";

import { LayoutGroup, motion } from "motion/react";
import { type ReactNode, useId } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MOTION } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** Required when the label is an icon only. */
  ariaLabel?: string;
  title?: string;
  className?: string;
};

/**
 * A single-choice toggle group (Radix: roving focus, arrow keys, `aria-pressed`) whose selected
 * background slides to the new option — a shared layout animation, so quick successive clicks
 * retarget the same highlight instead of queueing animations. Each instance has its own layout
 * scope, so several groups on a page never steal each other's highlight.
 *
 * `onValueChange` receives `""` when the active option is clicked again (Radix deselects);
 * callers decide whether that means "keep" or "clear".
 */
export function SegmentedControl<T extends string>({
  id,
  value,
  onValueChange,
  options,
  ariaLabel,
  size = "sm",
  className,
}: {
  id?: string;
  value: T | "";
  onValueChange: (value: T | "") => void;
  options: readonly SegmentedOption<T>[];
  ariaLabel: string;
  size?: "sm" | "default";
  className?: string;
}) {
  const scope = useId();
  return (
    <LayoutGroup id={scope}>
      <ToggleGroup
        id={id}
        type="single"
        variant="outline"
        size={size}
        aria-label={ariaLabel}
        value={value}
        onValueChange={(next) => onValueChange(next as T | "")}
        className={className}
      >
        {options.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            aria-label={option.ariaLabel}
            title={option.title}
            // The sliding highlight replaces the static "on" background.
            className={cn("relative isolate data-[state=on]:bg-transparent", option.className)}
          >
            {value === option.value && (
              <motion.span
                layoutId="segmented-indicator"
                aria-hidden
                className="absolute inset-0 -z-10 bg-muted ring-1 ring-foreground/10"
                style={{ borderRadius: 8 }}
                transition={MOTION.indicator}
              />
            )}
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </LayoutGroup>
  );
}
