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
import type { ReactNode } from "react";
import Link from "next/link";

import { StatusSwap } from "@/components/shared/status-swap";
import { Button } from "@/components/ui/button";
import type { SectionDraftState } from "@/features/profiles/workspace/state";
import { messages } from "@/i18n";
import { cn } from "@/lib/utils";

const t = messages.profiles;
const timeFormat = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" });

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
  onRetry,
  printAction,
}: {
  characterId: string;
  name: string;
  /** Draft state of the section being edited (status shown in the header). */
  active: SectionDraftState | undefined;
  otherUnsaved: number;
  onRetry: () => void;
  /** "Print / Save PDF" control. */
  printAction?: ReactNode;
}) {
  const status = active ? draftStatusView(active) : null;
  const Icon = status?.icon;
  return (
    <header
      data-sticky-offset
      className="sticky top-14 z-10 -mx-4 border-b bg-background/90 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 md:-mx-8 md:px-8"
    >
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
          {status && Icon && (
            <p
              role="status"
              aria-live="polite"
              data-testid="save-status"
              className={cn("flex items-center gap-1.5 text-sm", toneClass[status.tone])}
            >
              <StatusSwap
                key={`${status.tone}:${status.spin ? "busy" : status.tone === "success" ? "done" : status.label}`}
              >
                <Icon className={cn("size-4", status.spin && "animate-spin")} aria-hidden />
                {status.label}
              </StatusSwap>
            </p>
          )}
          {otherUnsaved > 0 && (
            <p className="text-xs text-muted-foreground">{t.status.otherSections(otherUnsaved)}</p>
          )}
          {active?.status === "error" && (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw data-icon="inline-start" aria-hidden />
              {t.status.retry}
            </Button>
          )}
          {/* Same place as "Hồ sơ chi tiết" in the fact editor's header. */}
          <Button asChild variant="outline" size="sm">
            <Link href={`/characters/${characterId}/edit` as Route} title={t.openFactsHint}>
              <FileText data-icon="inline-start" aria-hidden />
              {t.openFacts}
            </Link>
          </Button>
          {printAction}
        </div>
      </div>
      {active?.status === "error" && active.error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {active.error}
        </p>
      )}
    </header>
  );
}
