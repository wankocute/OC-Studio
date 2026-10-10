"use client";

import { type FormEvent, type ReactNode, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { type BasicInfoFormState, basicInfoSchema } from "@/features/characters/basic-info";
import { messages } from "@/i18n";
import type { ActionResult } from "@/lib/action-result";
import { fieldErrorsOf } from "@/lib/action-result-client";

import { BasicInfoFields } from "./basic-info-fields";

type BasicInfoDialogProps = {
  trigger: ReactNode;
  title: string;
  description: string;
  submitLabel: string;
  pendingLabel: string;
  initial: BasicInfoFormState;
  /** Return the action result; the dialog closes on success. */
  onSubmit: (values: BasicInfoFormState["values"]) => Promise<ActionResult<unknown>>;
};

/** A dialog with the basic-info form, validated on the client and again on the server. */
export function BasicInfoDialog({
  trigger,
  title,
  description,
  submitLabel,
  pendingLabel,
  initial,
  onSubmit,
}: BasicInfoDialogProps) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initial.values);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  // After a revision conflict the form holds stale values; saving is blocked until reloaded.
  const [conflict, setConflict] = useState(false);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setValues(initial.values);
    setErrors({});
    setFormError(undefined);
    setConflict(false);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = basicInfoSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrorsOf(parsed.error));
      return;
    }
    setErrors({});
    setFormError(undefined);
    startTransition(async () => {
      const result = await onSubmit(values);
      if (result.ok) {
        setOpen(false);
        return;
      }
      setErrors(result.error.fieldErrors ?? {});
      setFormError(result.error.message);
      setConflict(result.error.code === "revision_conflict");
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (next) reset();
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={submit} noValidate className="space-y-5">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <BasicInfoFields
            values={values}
            onChange={(patch) => setValues((current) => ({ ...current, ...patch }))}
            errors={errors}
            locked={initial.locked}
            disabled={pending}
          />
          {formError && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {formError}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              {messages.common.cancel}
            </Button>
            {conflict ? (
              // `initial` was refreshed by the action; load it instead of saving stale values.
              // Distinct keys: reusing the DOM button would turn it into "submit" during this very
              // click (React re-renders before the browser runs the default action) and save.
              <Button
                key="load-latest"
                type="button"
                // Enabled once the refreshed `initial` has arrived (the action transition ended).
                disabled={pending}
                onClick={(event) => {
                  event.preventDefault();
                  reset();
                }}
              >
                {messages.characters.loadLatest}
              </Button>
            ) : (
              <Button key="submit" type="submit" disabled={pending}>
                {pending ? pendingLabel : submitLabel}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
