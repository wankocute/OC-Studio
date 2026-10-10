"use client";

import { ChevronRight, Settings2, Shapes, TriangleAlert } from "lucide-react";
import { useId, useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EditorGroup } from "@/features/characters/editor/layout";
import { messages } from "@/i18n";
import { cn } from "@/lib/utils";

const t = messages.editor.nav;

export const GENERAL_SECTION = "$general";
export const CUSTOM_SECTION = "$custom";
export const REVIEW_SECTION = "$review";

export type NavEntry = {
  id: string;
  label: string;
  count?: number;
  /** Sub-groups, for jumping straight to one. */
  children?: { id: string; label: string }[];
  attention?: boolean;
};

export function buildNavEntries(
  groups: readonly EditorGroup[],
  filled: (group: EditorGroup) => number,
  hasReview: boolean,
): NavEntry[] {
  return [
    { id: GENERAL_SECTION, label: t.general },
    ...(hasReview ? [{ id: REVIEW_SECTION, label: t.review, attention: true }] : []),
    ...groups.map((group) => ({
      id: group.id,
      label: group.label,
      count: filled(group),
      children: group.subgroups.map((subgroup) => ({ id: subgroup.id, label: subgroup.label })),
    })),
    { id: CUSTOM_SECTION, label: t.custom },
  ];
}

function EntryIcon({ entry }: { entry: NavEntry }) {
  if (entry.id === GENERAL_SECTION) return <Settings2 className="size-4" aria-hidden />;
  if (entry.id === CUSTOM_SECTION) return <Shapes className="size-4" aria-hidden />;
  if (entry.id === REVIEW_SECTION)
    return <TriangleAlert className="size-4 text-warning" aria-hidden />;
  return null;
}

/** Group navigation: a sticky list on desktop, a select on small screens. */
export function EditorNav({
  entries,
  active,
  onSelect,
}: {
  entries: readonly NavEntry[];
  active: string;
  /** `subgroup` is set when jumping to a sub-group of `id`. */
  onSelect: (id: string, subgroup?: string) => void;
}) {
  const selectId = useId();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <div className="lg:hidden">
        <label htmlFor={selectId} className="sr-only">
          {t.jumpTo}
        </label>
        <Select value={active} onValueChange={(id) => onSelect(id)}>
          <SelectTrigger id={selectId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {entries.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.label}
                {entry.count ? ` · ${entry.count}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <nav aria-label={t.label} className="hidden lg:block">
        <ul className="space-y-0.5">
          {entries.map((entry) => {
            const isActive = entry.id === active;
            const hasChildren = (entry.children?.length ?? 0) > 0;
            const isExpanded = expanded.has(entry.id);
            return (
              <li key={entry.id}>
                <div className="flex items-center">
                  <button
                    type="button"
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => onSelect(entry.id)}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      isActive
                        ? "bg-accent font-medium text-accent-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <EntryIcon entry={entry} />
                    <span className="truncate">{entry.label}</span>
                    {entry.count ? (
                      <span className="ml-auto rounded-full bg-background/80 px-1.5 text-xs tabular-nums ring-1 ring-border">
                        {entry.count}
                      </span>
                    ) : null}
                  </button>
                  {hasChildren && (
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      aria-label={isExpanded ? t.collapse(entry.label) : t.expand(entry.label)}
                      onClick={() => toggle(entry.id)}
                      className="rounded-md p-1 text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <ChevronRight
                        className={cn("size-4 transition-transform", isExpanded && "rotate-90")}
                        aria-hidden
                      />
                    </button>
                  )}
                </div>
                {hasChildren && isExpanded && (
                  <ul className="my-0.5 ml-4 space-y-0.5 border-l pl-2">
                    {entry.children!.map((child) => (
                      <li key={child.id}>
                        <button
                          type="button"
                          onClick={() => onSelect(entry.id, child.id)}
                          className="w-full truncate rounded-md px-2 py-1 text-left text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          {child.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
