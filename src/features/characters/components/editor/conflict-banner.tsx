"use client";

import { AlertTriangle } from "lucide-react";
import { useState, useTransition } from "react";

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
import { messages } from "@/i18n";

const t = messages.editor.conflict;

type Pending = { kind: "discard" } | { kind: "overlap"; labels: string[]; apply: () => void };

/**
 * Shown after a revision conflict. Autosave is paused; the user chooses between the latest
 * stored version and re-applying their own changes on top of it.
 */
export function ConflictBanner({
  dirty,
  onLoadLatest,
  onKeepMine,
}: {
  dirty: boolean;
  onLoadLatest: () => Promise<void>;
  /**
   * Merge local changes onto the latest version. When some parts were changed in both places,
   * it returns their labels and an `apply` callback that is only run after confirmation.
   */
  onKeepMine: () => Promise<{ overlap: string[]; apply: () => void } | null>;
}) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, startTransition] = useTransition();

  return (
    <div
      role="alert"
      className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm"
    >
      <p className="flex items-center gap-2 font-medium">
        <AlertTriangle className="size-4 text-destructive" aria-hidden />
        {t.title}
      </p>
      <p className="text-muted-foreground">{t.body}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() =>
            startTransition(async () => {
              const result = await onKeepMine();
              if (result && result.overlap.length > 0) {
                setPending({ kind: "overlap", labels: result.overlap, apply: result.apply });
              } else {
                result?.apply();
              }
            })
          }
        >
          {t.keepMine}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            dirty ? setPending({ kind: "discard" }) : startTransition(() => onLoadLatest())
          }
        >
          {t.loadLatest}
        </Button>
      </div>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.kind === "overlap" ? t.overlapTitle : t.discardTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.kind === "overlap" ? t.overlapBody : t.discardBody}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pending?.kind === "overlap" && (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {pending.labels.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{messages.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const current = pending;
                setPending(null);
                if (current?.kind === "overlap") current.apply();
                else startTransition(() => onLoadLatest());
              }}
            >
              {pending?.kind === "overlap" ? t.overlapConfirm : t.discardConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
