"use client";

import {
  AlertCircle,
  ArrowLeft,
  BookOpenText,
  Check,
  CircleDashed,
  Loader2,
  PauseCircle,
  PencilLine,
  RefreshCw,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { factLabelsVi, type PresentationMode } from "@/features/characters/domain";
import type { EditorState } from "@/features/characters/editor/editor-state";
import { messages } from "@/i18n";
import { cn } from "@/lib/utils";

const t = messages.editor;

type StatusView = {
  label: string;
  tone: "muted" | "success" | "warning" | "destructive";
  icon: typeof Check;
  spin?: boolean;
};

const timeFormat = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" });

export function statusView(state: EditorState, hasErrors: boolean): StatusView {
  switch (state.status) {
    case "conflict":
      return { label: t.status.conflict, tone: "destructive", icon: AlertCircle };
    case "saving":
      return { label: t.status.saving, tone: "muted", icon: Loader2, spin: true };
    case "error":
      return { label: t.status.error, tone: "destructive", icon: AlertCircle };
  }
  if (state.dirty && state.review && !state.review.confirmed) {
    return { label: t.status.reviewPending, tone: "warning", icon: PauseCircle };
  }
  if (state.dirty && hasErrors) {
    return { label: t.status.invalid, tone: "warning", icon: AlertCircle };
  }
  if (state.dirty) return { label: t.status.dirty, tone: "muted", icon: PencilLine };
  if (state.savedAt) {
    return {
      label: t.status.savedAt(timeFormat.format(new Date(state.savedAt))),
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

export function EditorHeader({
  characterId,
  name,
  state,
  hasErrors,
  mode,
  onModeChange,
  onRetry,
}: {
  characterId: string;
  name: string;
  state: EditorState;
  hasErrors: boolean;
  mode: PresentationMode;
  onModeChange: (mode: PresentationMode) => void;
  onRetry: () => void;
}) {
  const view = statusView(state, hasErrors);
  const Icon = view.icon;
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
            {name || messages.characters.untitled}
          </h1>
        </div>
        <div className="flex basis-full flex-wrap items-center gap-3 sm:basis-auto">
          <p
            role="status"
            aria-live="polite"
            data-testid="save-status"
            className={cn("flex items-center gap-1.5 text-sm", toneClass[view.tone])}
          >
            <Icon className={cn("size-4", view.spin && "animate-spin")} aria-hidden />
            {view.label}
          </p>
          {state.status === "error" && !hasErrors && (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw data-icon="inline-start" aria-hidden />
              {t.status.retry}
            </Button>
          )}
          {/* Two-way link with the profile; the unsaved-changes guard asks before leaving. */}
          <Button asChild variant="outline" size="sm">
            <Link href={`/characters/${characterId}/profile` as Route} title={t.openProfileHint}>
              <BookOpenText data-icon="inline-start" aria-hidden />
              {t.openProfile}
            </Link>
          </Button>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            aria-label={t.modeLabel}
            value={mode}
            onValueChange={(next) => next && onModeChange(next as PresentationMode)}
          >
            {(["basic", "advanced"] as const).map((option) => (
              <ToggleGroupItem key={option} value={option} title={t.modeHint[option]}>
                {factLabelsVi.modes[option]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>
      {state.status === "error" && state.error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
    </header>
  );
}
