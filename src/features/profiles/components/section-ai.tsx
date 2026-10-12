"use client";
import { Loader2, Sparkles } from "lucide-react";
import { useId, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { messages } from "@/i18n";
import type { ActionResult } from "@/lib/action-result";
import { AI_LIMITS } from "../ai/constants";
import {
  applySectionAiAction,
  cancelSectionAiJobAction,
  discardSectionAiAction,
  dismissSectionAiJobAction,
  previewSectionAiAction,
  startSectionAiAction,
} from "../ai/actions";
import type { AiJobView } from "../ai/service";
import type { SectionDraftState } from "../workspace/state";
import type { RestoredView } from "../actions";
import { TypewriterRichText } from "./typewriter-rich-text";
import { isActiveJob } from "./use-ai-jobs";

const t = messages.profileAi;
const timeFormat = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" });
type Preview = Extract<Awaited<ReturnType<typeof previewSectionAiAction>>, { ok: true }>["data"];

/** What the workspace keeps for one section's AI job, and the dialog it can open. */
export type SectionAiControl = {
  job: AiJobView | undefined;
  open: boolean;
  setOpen: (open: boolean) => void;
  track: (job: AiJobView) => void;
  forget: () => void;
};

/**
 * AI for one section. Generation runs as a server job: the dialog can be closed at any time and
 * reopened; leaving the page does not cancel it. A finished suggestion is only ever applied by
 * the user, as a draft.
 */
export function SectionAi({
  sectionId,
  draft,
  onApplied,
  ai,
}: {
  sectionId: string;
  draft: SectionDraftState;
  onApplied: (value: RestoredView) => void;
  ai: SectionAiControl;
}) {
  const { job, open, setOpen } = ai;
  const [preview, setPreview] = useState<Preview | null>(null);
  const [instruction, setInstruction] = useState("");
  /** Picked model id; `null` = the server's default. Fixed into the job when it starts. */
  const [model, setModel] = useState<string | null>(null);
  const modelId = useId();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, start] = useTransition();
  const lock = useRef(false);
  const saved = draft.status === "idle" || draft.status === "saved";
  /** "Generate" was clicked and the server has not taken the job yet (the dialog is closed). */
  const [starting, setStarting] = useState(false);
  const active = isActiveJob(job) || starting;
  const result = job?.status === "succeeded" ? job.result : undefined;
  const changed = result && result.draftRevision !== draft.draftRevision;

  function run<T>(
    work: () => Promise<ActionResult<T>>,
    success: (data: T) => void,
    failure?: () => void,
  ) {
    if (lock.current) return;
    lock.current = true;
    setError(null);
    start(async () => {
      let outcome: ActionResult<T> | undefined;
      try {
        outcome = await work();
        if (!outcome.ok) setError(outcome.error.message);
      } catch {
        setError(t.errors.network);
      } finally {
        lock.current = false;
      }
      if (outcome?.ok) success(outcome.data);
      else failure?.();
    });
  }
  function prepare() {
    setConfirm(false);
    const oldToken = preview?.token;
    setPreview(null);
    run(async () => {
      if (oldToken) await discardSectionAiAction(oldToken);
      return previewSectionAiAction({ sectionId });
    }, setPreview);
  }
  /** Leave a finished job (and its suggestion) and start over from a fresh preview. */
  function startOver() {
    if (job && !isActiveJob(job)) {
      const finished = job;
      ai.forget();
      void dismissSectionAiJobAction(finished.id);
      if (finished.result) void discardSectionAiAction(finished.result.token);
    }
    prepare();
  }
  function openDialog() {
    setOpen(true);
    setError(null);
    if (!job) {
      setInstruction("");
      setModel(null);
      prepare();
    }
  }
  function close() {
    setOpen(false);
    // Consent is per request: an unused preview is dropped. Jobs and suggestions stay.
    if (preview) void discardSectionAiAction(preview.token);
    setPreview(null);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={starting || (!job && !saved)}
        title={!job && !saved ? t.savedFirst : undefined}
        onClick={openDialog}
        data-testid="section-ai-button"
      >
        {active ? (
          <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden />
        ) : (
          <Sparkles data-icon="inline-start" aria-hidden />
        )}
        {active ? t.job.running : result ? t.job.ready : t.open}
      </Button>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent
          className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle>{t.title}</DialogTitle>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm whitespace-pre-line text-destructive">
              {error}
            </p>
          )}

          {active && job ? (
            <div className="space-y-3" role="status" aria-live="polite">
              <p className="flex items-center gap-2 font-medium">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {t.job.running}
              </p>
              <p className="text-sm text-muted-foreground">{t.model.used(job.model.label)}</p>
              <p className="text-sm text-muted-foreground">
                {t.job.runningHint(
                  timeFormat.format(new Date(job.startedAt)),
                  timeFormat.format(new Date(job.deadlineAt)),
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={close}>
                  {t.job.closeKeepRunning}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => cancelSectionAiJobAction(job.id),
                      (view) => view && ai.track(view),
                    )
                  }
                >
                  {t.job.cancel}
                </Button>
              </div>
            </div>
          ) : result ? (
            <div className="space-y-3">
              <h3 className="font-medium">{t.candidate}</h3>
              {job && (
                <p className="text-xs text-muted-foreground" data-testid="ai-model-used">
                  {t.model.used(job.model.label)}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {t.job.expiresAt(timeFormat.format(new Date(result.expiresAt)))}
              </p>
              <div className="rounded-lg border p-3" data-testid="ai-candidate">
                <TypewriterRichText jobId={job?.id ?? result.token} content={result.content} />
              </div>
              {result.stale && (
                <>
                  <p role="alert" className="text-sm text-warning">
                    {t.stale}
                  </p>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={confirm}
                      onChange={(event) => setConfirm(event.target.checked)}
                    />
                    {t.confirmStale}
                  </label>
                </>
              )}
              {changed && (
                <p role="alert" className="text-sm text-warning">
                  {t.draftChanged}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={busy || !saved || !!changed || (result.stale && !confirm)}
                  onClick={() =>
                    run(
                      () => applySectionAiAction({ token: result.token, confirmStale: confirm }),
                      (applied) => {
                        onApplied(applied);
                        ai.forget();
                        setOpen(false);
                      },
                    )
                  }
                >
                  {t.apply}
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={startOver}>
                  {t.regenerate}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => discardSectionAiAction(result.token),
                      () => {
                        ai.forget();
                        setOpen(false);
                      },
                    )
                  }
                >
                  {t.discard}
                </Button>
              </div>
            </div>
          ) : job ? (
            <div className="space-y-3">
              <p role="alert" className="text-sm whitespace-pre-line text-destructive">
                {job.error?.message ?? t.errors.lost}
              </p>
              <p className="text-sm text-muted-foreground">{t.job.draftKept}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || !saved}
                  onClick={startOver}
                >
                  {t.regenerate}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    ai.forget();
                    void dismissSectionAiJobAction(job.id);
                    close();
                  }}
                >
                  {t.job.dismiss}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {preview && (
                <>
                  {!preview.configured && (
                    <p role="status" className="text-sm text-muted-foreground">
                      {preview.configurationIssues.map((issue) => t.errors[issue]).join(" ")}
                    </p>
                  )}
                  {preview.empty && (
                    <p role="status" className="text-sm text-muted-foreground">
                      {t.empty}
                    </p>
                  )}
                  <details open>
                    <summary className="cursor-pointer font-medium">{t.preview}</summary>
                    <pre
                      data-testid="ai-facts-preview"
                      className="mt-2 max-h-64 overflow-y-auto rounded-lg bg-muted p-3 text-xs break-words whitespace-pre-wrap"
                    >
                      {JSON.stringify(JSON.parse(preview.json), null, 2)}
                    </pre>
                  </details>
                </>
              )}
              {preview && preview.models.length > 0 && (
                <div className="space-y-1">
                  <label htmlFor={modelId} className="text-sm font-medium">
                    {t.model.label}
                  </label>
                  <Select
                    value={model ?? preview.defaultModel ?? ""}
                    onValueChange={setModel}
                    disabled={busy}
                  >
                    <SelectTrigger id={modelId} className="w-full sm:w-80">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {preview.models.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                          {option.hint ? ` — ${option.hint}` : ""}
                          {option.id === preview.defaultModel ? ` (${t.model.default})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <label className="block space-y-1 text-sm">
                <span>{t.instruction}</span>
                <Textarea
                  maxLength={AI_LIMITS.instructionChars}
                  value={instruction}
                  disabled={busy}
                  onChange={(event) => setInstruction(event.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={busy || !saved || !preview?.configured || preview.empty}
                  onClick={() => {
                    if (!preview) return;
                    const token = preview.token;
                    setPreview(null);
                    // The job runs on the server: close right away, the section button shows
                    // that it is running. A refused start reopens the dialog with the reason.
                    setOpen(false);
                    setStarting(true);
                    run(
                      () =>
                        startSectionAiAction({
                          token,
                          instruction,
                          ...(model ? { model } : {}),
                        }),
                      (view) => {
                        setStarting(false);
                        ai.track(view);
                      },
                      () => {
                        setStarting(false);
                        setOpen(true);
                      },
                    );
                  }}
                >
                  {busy ? t.generating : t.generate}
                </Button>
                {error && (
                  <Button type="button" variant="outline" disabled={busy} onClick={() => prepare()}>
                    {t.regenerate}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
