"use client";

import { AlertTriangle, BadgeCheck, EyeOff, FileText, Info, Layers } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { approveSectionAction, type RestoredView } from "@/features/profiles/actions";
import type { SourceGroupOption } from "@/features/profiles/fact-sources";
import { sectionLabel, type SectionStructureView } from "@/features/profiles/view";
import {
  approveBlock,
  canRestore,
  type SectionDraftState,
  statusOfSection,
  type WorkspaceAction,
} from "@/features/profiles/workspace/state";
import { messages } from "@/i18n";
import { cn } from "@/lib/utils";

import { HistorySheet } from "./history-sheet";
import { RichTextEditor } from "./rich-text-editor";
import { RichTextView } from "./rich-text-view";
import { SectionStatusIcon } from "./section-nav";
import { SectionAi } from "./section-ai";

const t = messages.profiles;
const dateFormat = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });

type Version = "draft" | "approved";

function ConflictPanel({
  draft,
  onUseLatest,
  onKeepMine,
}: {
  draft: SectionDraftState;
  onUseLatest: () => void;
  onKeepMine: () => void;
}) {
  const latest = draft.conflict?.latest;
  return (
    <div
      role="alert"
      className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm"
    >
      <p className="flex items-center gap-2 font-medium">
        <AlertTriangle className="size-4 text-destructive" aria-hidden />
        {t.conflict.title}
      </p>
      <p className="text-muted-foreground">{t.conflict.body}</p>
      {latest === undefined ? (
        <p className="text-muted-foreground">{t.conflict.loading}</p>
      ) : latest === null ? (
        <p className="text-destructive">{t.conflict.loadFailed}</p>
      ) : (
        <>
          <details className="rounded-lg border bg-background p-3">
            <summary className="cursor-pointer font-medium">{t.conflict.latest}</summary>
            <div className="mt-2">
              {latest.draft ? (
                <RichTextView content={latest.draft} />
              ) : (
                <p className="text-muted-foreground">{t.preview.emptySection}</p>
              )}
            </div>
          </details>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={onKeepMine} title={t.conflict.keepMineHint}>
              {t.conflict.keepMine}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onUseLatest}
              title={t.conflict.useLatestHint}
            >
              {t.conflict.useLatest}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t.conflict.keepMineHint} {t.conflict.useLatestHint}
          </p>
        </>
      )}
    </div>
  );
}

function ApproveButton({
  sectionId,
  draft,
  onApproved,
}: {
  sectionId: string;
  draft: SectionDraftState;
  onApproved: (action: WorkspaceAction) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const blocked = approveBlock(draft);
  const hintId = useId();

  const approve = () =>
    startTransition(async () => {
      try {
        const result = await approveSectionAction(sectionId, draft.draftRevision);
        setConfirming(false);
        if (!result.ok) {
          toast.error(result.error.message);
          return;
        }
        if (result.data.approved === null) {
          toast.info(t.approveUnchanged);
          return;
        }
        onApproved({ type: "approved", sectionId, approved: result.data.approved });
        toast.success(t.approved);
      } catch {
        setConfirming(false);
        toast.error(t.status.offline);
      }
    });

  return (
    <div className="space-y-1">
      <Button
        type="button"
        disabled={blocked !== null || pending}
        aria-describedby={blocked ? hintId : undefined}
        onClick={() => (draft.approved ? setConfirming(true) : approve())}
      >
        <BadgeCheck data-icon="inline-start" aria-hidden />
        {pending ? t.approving : t.approve}
      </Button>
      {blocked && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {t.approveBlocked[blocked]}
        </p>
      )}
      <AlertDialog open={confirming} onOpenChange={(next) => !pending && setConfirming(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.approveConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.approveConfirmBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{messages.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                approve();
              }}
            >
              {pending ? t.approving : t.approve}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FactsNotice({ draft }: { draft: SectionDraftState }) {
  const facts = draft.approved?.facts;
  if (!facts || facts.status === "fresh") return null;
  return (
    <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
      <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <span>
        <span className="font-medium">{t.facts.outdatedTitle}. </span>
        {facts.status === "outdated"
          ? t.facts.outdated(facts.labels.join(", "))
          : t.facts.incomparable}
      </span>
    </p>
  );
}

export function SectionPanel({
  characterId,
  section,
  draft,
  sourceGroups,
  idPrefix,
  dispatch,
  onEditSources,
}: {
  characterId: string;
  section: SectionStructureView;
  draft: SectionDraftState;
  sourceGroups: readonly SourceGroupOption[];
  idPrefix: string;
  dispatch: (action: WorkspaceAction) => void;
  onEditSources: () => void;
}) {
  const [version, setVersion] = useState<Version>("draft");
  const label = sectionLabel(section);
  const status = statusOfSection(draft);
  const editorId = `${idPrefix}-editor-${section.id}`;
  const errorId = `${idPrefix}-errors-${section.id}`;
  const groupLabels = new Map(sourceGroups.map((group) => [group.id, group.label]));
  const sources = section.sourceGroups
    .map((id) => groupLabels.get(id))
    .filter((value): value is string => value !== undefined);
  const firstSource = section.sourceGroups.find((id) => groupLabels.has(id));
  const factsHref = (
    firstSource
      ? `/characters/${characterId}/edit?group=${encodeURIComponent(firstSource)}`
      : `/characters/${characterId}/edit`
  ) as Route;

  const onRestored = (restored: RestoredView) => {
    dispatch({ type: "replaced", sectionId: section.id, ...restored });
    setVersion("draft");
  };

  return (
    <section aria-labelledby={`${idPrefix}-title-${section.id}`} className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2
            id={`${idPrefix}-title-${section.id}`}
            className="font-heading text-2xl font-semibold tracking-tight break-words"
          >
            {label}
          </h2>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <SectionStatusIcon status={status} />
            <span data-testid="section-status">{t.sectionStatus[status]}</span>
          </p>
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label={t.version.label}
          value={version}
          onValueChange={(next) => next && setVersion(next as Version)}
        >
          <ToggleGroupItem value="draft">{t.version.draft}</ToggleGroupItem>
          <ToggleGroupItem value="approved">{t.version.approved}</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {section.isHidden && (
        <p className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          <EyeOff className="size-4 shrink-0" aria-hidden />
          {t.hiddenNotice}
        </p>
      )}

      {draft.status === "conflict" && (
        <ConflictPanel
          draft={draft}
          onUseLatest={() => dispatch({ type: "useLatest", sectionId: section.id })}
          onKeepMine={() => dispatch({ type: "keepMine", sectionId: section.id })}
        />
      )}

      {/* Shown in both versions: it is about the approved text, but the fix is in the draft. */}
      <FactsNotice draft={draft} />

      {version === "draft" ? (
        <div className="space-y-2">
          <RichTextEditor
            // A new editor when the content is replaced from outside (restore, latest version).
            key={`${section.id}:${draft.resetCount}`}
            id={editorId}
            label={t.editorLabel(label)}
            placeholder={t.placeholder(label)}
            initialContent={draft.content}
            invalid={draft.invalid.length > 0}
            describedBy={draft.invalid.length > 0 ? errorId : undefined}
            onChange={(content) => dispatch({ type: "edit", sectionId: section.id, content })}
          />
          {draft.invalid.length > 0 && (
            <ul id={errorId} className="space-y-1 text-sm text-destructive">
              {draft.invalid.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {draft.approved ? (
            <>
              <p className="text-sm text-muted-foreground">
                {t.approvedAt(dateFormat.format(new Date(draft.approved.approvedAt)))} ·{" "}
                {t.approvedReadOnly}
              </p>
              <div className="rounded-xl border bg-card px-4 py-3" data-testid="approved-content">
                <RichTextView content={draft.approved.content} />
              </div>
            </>
          ) : (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t.approvedEmpty}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-start gap-3 border-t pt-4">
        <ApproveButton sectionId={section.id} draft={draft} onApproved={dispatch} />
        <SectionAi sectionId={section.id} draft={draft} onApplied={onRestored} />
        <HistorySheet
          sectionId={section.id}
          sectionTitle={label}
          draft={draft.content}
          draftRevision={draft.draftRevision}
          approvedRevisionId={draft.approved?.revisionId ?? null}
          canRestore={canRestore(draft)}
          onRestored={onRestored}
        />
      </div>

      <div className="space-y-2 rounded-xl bg-muted/50 p-4 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <Layers className="size-4 text-muted-foreground" aria-hidden />
          {t.sourcesTitle}
        </p>
        <p className={cn(sources.length === 0 && "text-muted-foreground")}>
          {sources.length > 0 ? sources.join(", ") : t.sourcesNone}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={onEditSources}>
            {t.chooseSources}
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href={factsHref}>
              <FileText data-icon="inline-start" aria-hidden />
              {t.sourceFactsLink}
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
