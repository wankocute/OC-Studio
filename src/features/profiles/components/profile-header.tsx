"use client";

import {
  AlertCircle,
  ArrowLeft,
  Check,
  CircleDashed,
  FileText,
  Loader2,
  PencilLine,
  RefreshCw,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { SectionDraftState } from "@/features/profiles/workspace/state";
import { messages } from "@/i18n";
import { cn } from "@/lib/utils";

const t = messages.profiles;
const timeFormat = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" });

export type WorkspaceView = "edit" | "preview";

type StatusView = {
  label: string;
  tone: "muted" | "success" | "warning" | "destructive";
  icon: typeof Check;
  spin?: boolean;
};

export function draftStatusView(draft: SectionDraftState): StatusView {
  switch (draft.status) {
    case "conflict":
      return { label: t.status.conflict, tone: "destructive", icon: AlertCircle };
    case "saving":
      return { label: t.status.saving, tone: "muted", icon: Loader2, spin: true };
    case "error":
      return { label: t.status.error, tone: "destructive", icon: AlertCircle };
    case "dirty":
      return draft.invalid.length > 0
        ? { label: t.status.invalid, tone: "warning", icon: AlertCircle }
        : { label: t.status.dirty, tone: "muted", icon: PencilLine };
  }
  if (draft.savedAt) {
    return {
      label: t.status.savedAt(timeFormat.format(new Date(draft.savedAt))),
      tone: "success",
      icon: Check,
    };
  }
  return { label: t.status.idle, tone: "muted", icon: CircleDashed };
}

const toneClass = {
  muted: "text-muted-foreground",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
};

export function ProfileHeader({
  characterId,
  name,
  active,
  otherUnsaved,
  view,
  onViewChange,
  onRetry,
}: {
  characterId: string;
  name: string;
  /** Draft state of the section being edited (status shown in the header). */
  active: SectionDraftState | undefined;
  otherUnsaved: number;
  view: WorkspaceView;
  onViewChange: (view: WorkspaceView) => void;
  onRetry: () => void;
}) {
  const status = active ? draftStatusView(active) : null;
  const Icon = status?.icon;
  return (
    <header className="sticky top-14 z-10 -mx-4 border-b bg-background/90 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 md:-mx-8 md:px-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button asChild variant="ghost" size="icon-sm" className="shrink-0">
          <Link href={`/characters/${characterId}` as Route} aria-label={t.back}>
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{t.title}</p>
          <h1 className="truncate font-heading text-xl font-semibold tracking-tight md:text-2xl">
            {name}
          </h1>
        </div>
        <div className="flex basis-full flex-wrap items-center gap-3 sm:basis-auto">
          {status && Icon && view === "edit" && (
            <p
              role="status"
              aria-live="polite"
              data-testid="save-status"
              className={cn("flex items-center gap-1.5 text-sm", toneClass[status.tone])}
            >
              <Icon className={cn("size-4", status.spin && "animate-spin")} aria-hidden />
              {status.label}
            </p>
          )}
          {otherUnsaved > 0 && (
            <p className="text-xs text-muted-foreground">{t.status.otherSections(otherUnsaved)}</p>
          )}
          {view === "edit" && active?.status === "error" && (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw data-icon="inline-start" aria-hidden />
              {t.status.retry}
            </Button>
          )}
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            aria-label={t.view.label}
            value={view}
            onValueChange={(next) => next && onViewChange(next as WorkspaceView)}
          >
            <ToggleGroupItem value="edit">{t.view.edit}</ToggleGroupItem>
            <ToggleGroupItem value="preview">{t.view.preview}</ToggleGroupItem>
          </ToggleGroup>
          <Button asChild variant="outline" size="sm">
            <Link href={`/characters/${characterId}/edit` as Route} title={t.openFactsHint}>
              <FileText data-icon="inline-start" aria-hidden />
              {t.openFacts}
            </Link>
          </Button>
        </div>
      </div>
      {view === "edit" && active?.status === "error" && active.error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {active.error}
        </p>
      )}
    </header>
  );
}
