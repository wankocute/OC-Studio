"use client";

import {
  ArrowDown,
  ArrowUp,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CirclePlus,
  Loader2,
  Sparkles,
  Eye,
  EyeOff,
  Layers,
  MoreHorizontal,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SectionStatus } from "@/features/profiles/domain";
import { sectionLabel, type SectionStructureView } from "@/features/profiles/view";
import { messages } from "@/i18n";
import { MOTION } from "@/lib/motion";
import { cn } from "@/lib/utils";

const t = messages.profiles;

export const STATUS_ICON: Record<SectionStatus, { icon: LucideIcon; className: string }> = {
  empty: { icon: CircleDashed, className: "text-muted-foreground" },
  draft: { icon: CircleDot, className: "text-warning" },
  approved: { icon: CircleCheck, className: "text-success" },
  changed: { icon: CircleDot, className: "text-primary" },
};

export function SectionStatusIcon({ status }: { status: SectionStatus }) {
  const { icon: Icon, className } = STATUS_ICON[status];
  return <Icon className={cn("size-4 shrink-0", className)} aria-hidden />;
}

export type SectionCommands = {
  onRename: (section: SectionStructureView) => void;
  onMove: (section: SectionStructureView, direction: -1 | 1) => void;
  onToggleHidden: (section: SectionStructureView) => void;
  onEditSources: (section: SectionStructureView) => void;
  onAdd: () => void;
  /** A structure change is in flight: menus stay readable but commands are disabled. */
  busy: boolean;
};

function SectionMenu({
  section,
  index,
  count,
  commands,
}: {
  section: SectionStructureView;
  index: number;
  count: number;
  commands: SectionCommands;
}) {
  const label = sectionLabel(section);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t.sectionMenu(label)}
          disabled={commands.busy}
          className="shrink-0 text-muted-foreground"
        >
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={() => commands.onRename(section)}>
          <Pencil aria-hidden />
          {t.rename}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={index === 0} onSelect={() => commands.onMove(section, -1)}>
          <ArrowUp aria-hidden />
          {t.moveUp}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={index === count - 1}
          onSelect={() => commands.onMove(section, 1)}
        >
          <ArrowDown aria-hidden />
          {t.moveDown}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => commands.onToggleHidden(section)}>
          {section.isHidden ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
          {section.isHidden ? t.show : t.hide}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => commands.onEditSources(section)}>
          <Layers aria-hidden />
          {t.editSources}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Section list: a sticky list with per-section menus on desktop, a select on small screens. */
export function SectionNav({
  sections,
  statuses,
  aiBadges = {},
  activeId,
  onSelect,
  commands,
}: {
  sections: readonly SectionStructureView[];
  statuses: Readonly<Record<string, SectionStatus>>;
  /** Sections with an AI job running, or a suggestion waiting to be reviewed. */
  aiBadges?: Readonly<Record<string, "running" | "ready">>;
  activeId: string;
  onSelect: (sectionId: string) => void;
  commands: SectionCommands;
}) {
  const selectId = useId();
  const navScope = useId();
  const active = sections.find((section) => section.id === activeId);
  const activeIndex = sections.findIndex((section) => section.id === activeId);

  return (
    <>
      <div className="flex items-center gap-2 lg:hidden">
        <label htmlFor={selectId} className="sr-only">
          {t.jumpTo}
        </label>
        <Select value={activeId} onValueChange={onSelect}>
          <SelectTrigger id={selectId} className="min-w-0 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sections.map((section) => (
              <SelectItem key={section.id} value={section.id}>
                {sectionLabel(section)}
                {section.isHidden ? ` · ${t.hiddenBadge}` : ""}
                {aiBadges[section.id] === "running"
                  ? ` · ${messages.profileAi.job.navRunning}`
                  : aiBadges[section.id] === "ready"
                    ? ` · ${messages.profileAi.job.navReady}`
                    : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {active && (
          <SectionMenu
            section={active}
            index={activeIndex}
            count={sections.length}
            commands={commands}
          />
        )}
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t.addSection}
          disabled={commands.busy}
          onClick={commands.onAdd}
        >
          <CirclePlus aria-hidden />
        </Button>
      </div>

      <nav aria-label={t.sections} className="hidden lg:block">
        <LayoutGroup id={navScope}>
          <ul className="space-y-0.5">
            {sections.map((section, index) => {
              const isActive = section.id === activeId;
              const status = statuses[section.id] ?? "empty";
              return (
                <li key={section.id} className="group/section flex items-center gap-0.5">
                  <button
                    type="button"
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => onSelect(section.id)}
                    className={cn(
                      "relative isolate flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors duration-(--duration-fast) outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.99]",
                      isActive
                        ? "font-medium text-accent-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      section.isHidden && "opacity-60",
                    )}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="profile-section-active"
                        aria-hidden
                        className="absolute inset-0 -z-10 bg-accent"
                        style={{ borderRadius: 8 }}
                        transition={MOTION.indicator}
                      />
                    )}
                    <SectionStatusIcon status={status} />
                    <span className="truncate">{sectionLabel(section)}</span>
                    <span className="sr-only">
                      {` — ${t.sectionStatus[status]}`}
                      {section.isHidden ? ` — ${t.hiddenBadge}` : ""}
                      {aiBadges[section.id] === "running"
                        ? ` — ${messages.profileAi.job.navRunning}`
                        : aiBadges[section.id] === "ready"
                          ? ` — ${messages.profileAi.job.navReady}`
                          : ""}
                    </span>
                    {aiBadges[section.id] === "running" && (
                      <Loader2 className="ml-auto size-3.5 shrink-0 animate-spin" aria-hidden />
                    )}
                    {aiBadges[section.id] === "ready" && (
                      <Sparkles className="ml-auto size-3.5 shrink-0 text-primary" aria-hidden />
                    )}
                    {section.isHidden && (
                      <EyeOff className="ml-auto size-3.5 shrink-0" aria-hidden />
                    )}
                  </button>
                  <SectionMenu
                    section={section}
                    index={index}
                    count={sections.length}
                    commands={commands}
                  />
                </li>
              );
            })}
          </ul>
        </LayoutGroup>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 w-full justify-start text-muted-foreground"
          disabled={commands.busy}
          onClick={commands.onAdd}
        >
          <CirclePlus data-icon="inline-start" aria-hidden />
          {t.addSection}
        </Button>
      </nav>
    </>
  );
}
