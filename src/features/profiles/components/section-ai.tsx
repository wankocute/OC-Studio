"use client";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { messages } from "@/i18n";
import type { ActionResult } from "@/lib/action-result";
import { AI_LIMITS } from "../ai/constants";
import {
  previewSectionAiAction,
  generateSectionAiAction,
  applySectionAiAction,
  discardSectionAiAction,
} from "../ai/actions";
import type { SectionDraftState } from "../workspace/state";
import type { RestoredView } from "../actions";
import { RichTextView } from "./rich-text-view";

const t = messages.profileAi;
type Preview = Extract<Awaited<ReturnType<typeof previewSectionAiAction>>, { ok: true }>["data"];
type Candidate = Extract<Awaited<ReturnType<typeof generateSectionAiAction>>, { ok: true }>["data"];

export function SectionAi({
  sectionId,
  draft,
  onApplied,
}: {
  sectionId: string;
  draft: SectionDraftState;
  onApplied: (value: RestoredView) => void;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [allow, setAllow] = useState<string[]>([]);
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, start] = useTransition();
  const lock = useRef(false);
  const saved = draft.status === "idle" || draft.status === "saved";
  const changed = candidate && candidate.draftRevision !== draft.draftRevision;

  function run<T>(work: () => Promise<ActionResult<T>>, success: (data: T) => void) {
    if (lock.current) return;
    lock.current = true;
    setError(null);
    start(async () => {
      let result: ActionResult<T> | undefined;
      try {
        result = await work();
        if (!result.ok) {
          setError(result.error.message);
          if (result.error.message === t.errors.stale) setStale(true);
        }
      } catch {
        setError(t.errors.network);
      } finally {
        lock.current = false;
      }
      if (result?.ok) success(result.data);
    });
  }
  function prepare(next: string[] = []) {
    setCandidate(null);
    setAllow(next);
    setConfirm(false);
    setStale(false);
    setPreview(null);
    const oldToken = preview?.token ?? candidate?.token;
    run(async () => {
      if (oldToken) await discardSectionAiAction(oldToken);
      return previewSectionAiAction({ sectionId, allow: next });
    }, setPreview);
  }
  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={!saved || busy}
        title={!saved ? t.savedFirst : undefined}
        onClick={() => {
          setOpen(true);
          setInstruction("");
          prepare();
        }}
      >
        {t.open}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return;
          setOpen(next);
          if (!next) {
            const token = candidate?.token ?? preview?.token;
            if (token)
              run(
                () => discardSectionAiAction(token),
                () => {},
              );
            setAllow([]);
            setPreview(null);
            setCandidate(null);
          }
        }}
      >
        <DialogContent
          className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle>{t.title}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t.notice}</p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {candidate ? (
            <div className="space-y-3">
              <h3 className="font-medium">{t.candidate}</h3>
              <RichTextView content={candidate.content} />
              {stale && (
                <p role="alert" className="text-sm text-warning">
                  {t.stale}
                </p>
              )}
              {stale && (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={confirm}
                    onChange={(event) => setConfirm(event.target.checked)}
                  />
                  {t.confirmStale}
                </label>
              )}
              {changed && (
                <p role="alert" className="text-sm text-warning">
                  {t.draftChanged}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={busy || !saved || !!changed || (stale && !confirm)}
                  onClick={() =>
                    run(
                      () => applySectionAiAction({ token: candidate.token, confirmStale: confirm }),
                      (result) => {
                        onApplied(result);
                        setCandidate(null);
                        setOpen(false);
                      },
                    )
                  }
                >
                  {t.apply}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => discardSectionAiAction(candidate.token),
                      () => prepare(),
                    )
                  }
                >
                  {t.regenerate}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => discardSectionAiAction(candidate.token),
                      () => {
                        setCandidate(null);
                        setOpen(false);
                      },
                    )
                  }
                >
                  {t.discard}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {preview && (
                <>
                  {preview.provider === "gemini" && (
                    <p className="text-sm text-muted-foreground">{t.geminiNotice}</p>
                  )}
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
                  {preview.permissions.length > 0 && (
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium">{t.sensitive}</legend>
                      {preview.permissions.map((ref) => (
                        <label key={ref} className="flex items-start gap-2 text-sm break-all">
                          <input
                            type="checkbox"
                            disabled={busy}
                            checked={allow.includes(ref)}
                            onChange={(event) =>
                              prepare(
                                event.target.checked
                                  ? [...allow, ref]
                                  : allow.filter((key) => key !== ref),
                              )
                            }
                          />
                          {ref}
                        </label>
                      ))}
                    </fieldset>
                  )}
                </>
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
              <Button
                type="button"
                disabled={busy || !preview?.configured || preview.empty}
                onClick={() => {
                  if (!preview) return;
                  setPreview(null);
                  setAllow([]);
                  run(
                    () => generateSectionAiAction({ token: preview.token, instruction }),
                    (result) => {
                      setCandidate(result);
                      setStale(result.stale);
                      setAllow([]);
                      setPreview(null);
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
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
