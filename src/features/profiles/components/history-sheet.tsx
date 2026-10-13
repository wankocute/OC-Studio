"use client";

import { ArrowLeft, History, RotateCcw } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  getRevisionAction,
  listSectionHistoryAction,
  restoreRevisionAction,
  type RestoredView,
} from "@/features/profiles/actions";
import { contentHash, type RichTextDocument } from "@/features/profiles/domain";
import type { RevisionSummaryView } from "@/features/profiles/view";
import { messages } from "@/i18n";
import { cn } from "@/lib/utils";
import { useOverlayScrollbars } from "@/hooks/use-overlay-scrollbars";

import { RichTextView } from "./rich-text-view";

const t = messages.profiles.history;
const dateFormat = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });

type ListState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; revisions: RevisionSummaryView[] };

type Selected = {
  revision: RevisionSummaryView;
  content: RichTextDocument | null;
  failed?: boolean;
};

export function HistorySheet({
  sectionId,
  sectionTitle,
  draft,
  draftRevision,
  approvedRevisionId,
  canRestore,
  onRestored,
}: {
  sectionId: string;
  sectionTitle: string;
  /** Current working draft, to mark the revision it equals. */
  draft: RichTextDocument | null;
  draftRevision: number;
  approvedRevisionId: string | null;
  /** Restoring needs a fully saved draft (its revision guards the restore). */
  canRestore: boolean;
  onRestored: (restored: RestoredView) => void;
}) {
  const [open, setOpen] = useState(false);
  const scrollbars = useOverlayScrollbars<HTMLDivElement>();
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [selected, setSelected] = useState<Selected | null>(null);
  const [restoring, startRestore] = useTransition();
  const draftHash = draft ? contentHash(draft) : null;

  const load = async () => {
    setList({ status: "loading" });
    try {
      const result = await listSectionHistoryAction(sectionId);
      setList(result.ok ? { status: "ready", revisions: result.data } : { status: "error" });
    } catch {
      setList({ status: "error" });
    }
  };

  const select = async (revision: RevisionSummaryView) => {
    setSelected({ revision, content: null });
    try {
      const result = await getRevisionAction(sectionId, revision.id);
      setSelected((current) =>
        current?.revision.id === revision.id
          ? { revision, content: result.ok ? result.data.content : null, failed: !result.ok }
          : current,
      );
    } catch {
      setSelected((current) =>
        current?.revision.id === revision.id ? { revision, content: null, failed: true } : current,
      );
    }
  };

  const restore = (revision: RevisionSummaryView) =>
    startRestore(async () => {
      try {
        const result = await restoreRevisionAction(sectionId, revision.id, draftRevision);
        if (!result.ok) {
          toast.error(result.error.message);
          return;
        }
        if (result.data.restored === null) {
          toast.info(t.restoreUnchanged);
          return;
        }
        onRestored(result.data.restored);
        toast.success(t.restored);
        setOpen(false);
      } catch {
        toast.error(messages.profiles.status.offline);
      }
    });

  return (
    <Sheet open={open} onOpenChange={(next) => !restoring && setOpen(next)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen(true);
          setSelected(null);
          void load();
        }}
      >
        <History data-icon="inline-start" aria-hidden />
        {t.open}
      </Button>
      <SheetContent
        ref={scrollbars}
        className="w-full overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
      >
        <SheetHeader>
          <SheetTitle className="font-heading text-xl">
            {t.title} — {sectionTitle}
          </SheetTitle>
          <SheetDescription>{t.description}</SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6">
          {selected ? (
            <div className="space-y-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-ml-2"
                onClick={() => setSelected(null)}
              >
                <ArrowLeft data-icon="inline-start" aria-hidden />
                {t.back}
              </Button>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="secondary">{t.kinds[selected.revision.kind]}</Badge>
                <span className="text-muted-foreground">
                  {dateFormat.format(new Date(selected.revision.createdAt))}
                </span>
              </div>
              <div className="rounded-xl border bg-card p-4">
                {selected.failed ? (
                  <p className="text-sm text-destructive">{t.loadFailed}</p>
                ) : selected.content ? (
                  <RichTextView content={selected.content} />
                ) : (
                  <p className="text-sm text-muted-foreground">{t.loading}</p>
                )}
              </div>
              <div className="space-y-2">
                <Button
                  type="button"
                  disabled={
                    !canRestore ||
                    restoring ||
                    !selected.content ||
                    selected.revision.hash === draftHash
                  }
                  onClick={() => restore(selected.revision)}
                >
                  <RotateCcw data-icon="inline-start" aria-hidden />
                  {restoring ? t.restoring : t.restore}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {selected.revision.hash === draftHash
                    ? t.sameAsDraft
                    : canRestore
                      ? t.restoreHint
                      : t.restoreBlocked}
                </p>
              </div>
            </div>
          ) : list.status === "loading" ? (
            <p className="text-sm text-muted-foreground">{t.loading}</p>
          ) : list.status === "error" ? (
            <p className="text-sm text-destructive">{t.loadFailed}</p>
          ) : list.revisions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.empty}</p>
          ) : (
            <ol className="space-y-2" aria-label={t.title}>
              {list.revisions.map((revision) => (
                <li key={revision.id}>
                  <button
                    type="button"
                    onClick={() => void select(revision)}
                    className="w-full rounded-xl border bg-card p-3 text-left outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant={revision.kind === "approval" ? "default" : "secondary"}>
                        {t.kinds[revision.kind]}
                      </Badge>
                      <span className="text-muted-foreground">
                        {dateFormat.format(new Date(revision.createdAt))}
                      </span>
                      {revision.id === approvedRevisionId && (
                        <span className="text-xs text-success">{t.current}</span>
                      )}
                      {revision.hash === draftHash && (
                        <span className="text-xs text-muted-foreground">{t.sameAsDraft}</span>
                      )}
                    </span>
                    <span
                      className={cn(
                        "mt-1.5 line-clamp-2 block text-sm",
                        !revision.excerpt && "text-muted-foreground italic",
                      )}
                    >
                      {revision.excerpt || t.emptyContent}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {t.characters(revision.textLength)}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
