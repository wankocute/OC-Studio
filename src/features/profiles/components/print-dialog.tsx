"use client";

import { Info, Printer } from "lucide-react";
import type { Route } from "next";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  DEFAULT_PRINT_SOURCE,
  PRINT_SOURCES,
  planPrint,
  type PrintableSection,
  type PrintSource,
} from "@/features/profiles/print";
import { messages } from "@/i18n";

const t = messages.profiles.print;

/**
 * Choose what to print, then open the print view in a new tab (the workspace and its drafts stay
 * as they are). Printing the draft needs every section saved first, so the print never shows
 * older content than the editor or silently drops what is being written.
 */
export function PrintDialog({
  characterId,
  sections,
  unsaved,
}: {
  characterId: string;
  /** Sections as stored: saved drafts and approved content. */
  sections: readonly PrintableSection[];
  /** Sections whose edits are not saved yet. */
  unsaved: number;
}) {
  const prefix = useId();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<PrintSource>(DEFAULT_PRINT_SOURCE);
  const plan = planPrint(sections, source);
  const blocked = source === "draft" && unsaved > 0;
  const href = `/characters/${characterId}/profile/print?source=${source}` as Route;

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Printer data-icon="inline-start" aria-hidden />
        {t.open}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">{t.dialogTitle}</DialogTitle>
            <DialogDescription>{t.dialogDescription}</DialogDescription>
          </DialogHeader>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">{t.sourceLabel}</legend>
            <RadioGroup value={source} onValueChange={(next) => setSource(next as PrintSource)}>
              {PRINT_SOURCES.map((option) => (
                <div key={option} className="flex items-start gap-3">
                  <RadioGroupItem
                    id={`${prefix}-${option}`}
                    value={option}
                    aria-describedby={`${prefix}-${option}-hint`}
                    className="mt-0.5"
                  />
                  <div className="space-y-0.5">
                    <Label htmlFor={`${prefix}-${option}`}>{t.sources[option]}</Label>
                    <p id={`${prefix}-${option}-hint`} className="text-xs text-muted-foreground">
                      {t.sourceHints[option]}
                    </p>
                  </div>
                </div>
              ))}
            </RadioGroup>
          </fieldset>
          <div className="space-y-1.5 rounded-lg bg-muted/60 p-3 text-sm" aria-live="polite">
            {blocked ? (
              <p className="flex items-start gap-2 text-warning">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                {t.unsaved(unsaved)}
              </p>
            ) : (
              <>
                <p>
                  {plan.sections.length > 0
                    ? t.sectionsCount(plan.sections.length)
                    : source === "approved"
                      ? t.emptyApproved
                      : t.emptyDraft}
                </p>
                {plan.unapproved > 0 && (
                  <p className="text-muted-foreground">{t.unapproved(plan.unapproved)}</p>
                )}
                {plan.newerDraft > 0 && (
                  <p className="text-muted-foreground">{t.newerDraft(plan.newerDraft)}</p>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {messages.common.cancel}
            </Button>
            {blocked ? (
              <Button type="button" disabled>
                {t.continue}
              </Button>
            ) : (
              <Button asChild>
                {/* A plain link in a new tab: the editor keeps its state and nothing is saved. */}
                <a href={href} target="_blank" rel="noopener" onClick={() => setOpen(false)}>
                  {t.continue}
                </a>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
