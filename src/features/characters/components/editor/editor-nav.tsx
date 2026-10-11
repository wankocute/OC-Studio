"use client";

import { ChevronRight, Settings2, Shapes, TriangleAlert } from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import { useId, useState } from "react";

import { Collapse } from "@/components/shared/collapse";
import type { EditorField, EditorGroup } from "@/features/characters/editor/layout";
import { messages } from "@/i18n";
import { MOTION } from "@/lib/motion";
import { cn } from "@/lib/utils";

const t = messages.editor.nav;
export const GENERAL_SECTION = "$general";
export const CUSTOM_SECTION = "$custom";
export const REVIEW_SECTION = "$review";

export type NavEntry = {
  id: string;
  label: string;
  count?: number;
  sectionId?: string;
  fieldKey?: string;
  children?: NavEntry[];
  attention?: boolean;
};

export function buildNavEntries(
  groups: readonly EditorGroup[],
  filled: (group: EditorGroup) => number,
  hasReview: boolean,
  isShown: (field: EditorField) => boolean = () => true,
): NavEntry[] {
  const fields = (items: EditorField[], sectionId: string): NavEntry[] =>
    items.filter(isShown).map((field) => ({
      id: field.key,
      label: field.label,
      fieldKey: field.key,
      sectionId,
    }));
  return [
    { id: GENERAL_SECTION, label: t.general },
    ...(hasReview ? [{ id: REVIEW_SECTION, label: t.review, attention: true }] : []),
    ...groups.map((group) => ({
      id: group.id,
      label: group.label,
      count: filled(group),
      children: [
        ...fields(group.fields, group.id),
        ...group.subgroups.flatMap((section) => {
          const children = fields(section.fields, section.id);
          return children.length
            ? [{ id: section.id, label: section.label, sectionId: section.id, children }]
            : [];
        }),
      ],
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

/** One disclosure tree on both desktop and mobile; ordinary buttons retain native keyboard use. */
export function EditorNav({
  entries,
  active,
  activeItem,
  onSelect,
}: {
  entries: readonly NavEntry[];
  active: string;
  activeItem?: string;
  onSelect: (id: string, section?: string, field?: string) => void;
}) {
  const prefix = useId();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const contains = (items: readonly NavEntry[], id: string): boolean =>
    items.some((entry) => entry.id === id || contains(entry.children ?? [], id));
  const activeChildren = entries.find((entry) => entry.id === active)?.children ?? [];
  const selectedId = activeItem && contains(activeChildren, activeItem) ? activeItem : active;
  const selected = (entry: NavEntry) => entry.id === selectedId;
  const renderEntry = (entry: NavEntry, owner: string, top = false) => {
    const hasChildren = !!entry.children?.length;
    const isExpanded = expanded.has(entry.id);
    const bodyId = `${prefix}-children-${entry.id}`;
    return (
      <li key={entry.id}>
        <div className="flex items-center">
          <button
            type="button"
            aria-current={selected(entry) ? "location" : undefined}
            onClick={() => {
              setMobileOpen(false);
              onSelect(owner, top ? undefined : entry.sectionId, entry.fieldKey);
            }}
            className={cn(
              "relative isolate flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-(--duration-fast) outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.99]",
              selected(entry)
                ? "font-medium text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {selected(entry) && (
              // One highlight that slides to the selected entry (shared layout, scoped per nav).
              <motion.span
                layoutId="editor-nav-active"
                aria-hidden
                className="absolute inset-0 -z-10 bg-accent"
                style={{ borderRadius: 8 }}
                transition={MOTION.indicator}
              />
            )}
            <EntryIcon entry={entry} />
            <span className="min-w-0 break-words">{entry.label}</span>
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
              aria-controls={bodyId}
              aria-label={isExpanded ? t.collapse(entry.label) : t.expand(entry.label)}
              onClick={() => toggle(entry.id)}
              className="shrink-0 rounded-md p-2 text-muted-foreground transition-colors duration-(--duration-fast) outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted/70"
            >
              <ChevronRight
                className={cn(
                  "size-4 transition-transform duration-(--duration-base) ease-soft",
                  isExpanded && "rotate-90",
                )}
                aria-hidden
              />
            </button>
          )}
        </div>
        {hasChildren && (
          <Collapse id={bodyId} open={isExpanded}>
            <ul className="my-0.5 ml-3 space-y-0.5 border-l pl-1">
              {entry.children!.map((child) => renderEntry(child, owner))}
            </ul>
          </Collapse>
        )}
      </li>
    );
  };
  return (
    <LayoutGroup id={prefix}>
      <nav aria-label={t.label}>
        <button
          type="button"
          aria-expanded={mobileOpen}
          aria-controls={`${prefix}-navigation`}
          onClick={() => setMobileOpen((value) => !value)}
          className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:hidden"
        >
          {t.jumpTo}: {entries.find((entry) => entry.id === active)?.label}
          <ChevronRight
            className={cn(
              "size-4 shrink-0 transition-transform duration-(--duration-base) ease-soft",
              mobileOpen && "rotate-90",
            )}
            aria-hidden
          />
        </button>
        <ul
          id={`${prefix}-navigation`}
          className={cn(
            "max-h-[60dvh] space-y-0.5 overflow-y-auto lg:max-h-none lg:overflow-visible",
            mobileOpen ? "mt-2 block lg:mt-0" : "hidden lg:block",
          )}
        >
          {entries.map((entry) => renderEntry(entry, entry.id, true))}
        </ul>
      </nav>
    </LayoutGroup>
  );
}
