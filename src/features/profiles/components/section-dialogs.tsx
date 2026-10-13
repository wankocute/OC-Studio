"use client";

import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PROFILE_LIMITS } from "@/features/profiles/domain";
import type { SourceGroupOption } from "@/features/profiles/fact-sources";
import { messages } from "@/i18n";
import { useOverlayScrollbars } from "@/hooks/use-overlay-scrollbars";

const t = messages.profiles;

/** Returns an error message to show, or `null` on success (the dialog closes). */
type Submit<T> = (value: T) => Promise<string | null>;

function ErrorText({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

function SourceGroupChecklist({
  groups,
  selected,
  onChange,
}: {
  groups: readonly SourceGroupOption[];
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
}) {
  const prefix = useId();
  const scrollbars = useOverlayScrollbars<HTMLDivElement>();
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium">{t.sourcesTitle}</legend>
      {/* Right padding keeps the overlay scrollbar off the cards. */}
      <div ref={scrollbars} className="grid max-h-64 gap-2 overflow-y-auto pr-3 sm:grid-cols-2">
        {groups.map((group) => {
          const id = `${prefix}-${group.id}`;
          return (
            <div key={group.id} className="flex items-center gap-2">
              <Checkbox
                id={id}
                checked={selected.has(group.id)}
                onCheckedChange={(checked) => {
                  const next = new Set(selected);
                  if (checked === true) next.add(group.id);
                  else next.delete(group.id);
                  onChange(next);
                }}
              />
              <Label htmlFor={id} className="font-normal">
                {group.label}
              </Label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Ordered like the fact editor, whatever order the user ticked them in. */
function orderedSelection(groups: readonly SourceGroupOption[], selected: ReadonlySet<string>) {
  return groups.filter((group) => selected.has(group.id)).map((group) => group.id);
}

export function AddSectionDialog({
  open,
  onOpenChange,
  groups,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: readonly SourceGroupOption[];
  onSubmit: Submit<{ title: string; sourceGroups: string[] }>;
}) {
  const prefix = useId();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              const message = await onSubmit({
                title,
                sourceGroups: orderedSelection(groups, selected),
              });
              if (message) setError(message);
              else onOpenChange(false);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">{t.addSectionTitle}</DialogTitle>
            <DialogDescription>{t.addSectionDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`${prefix}-title`}>{t.titleLabel}</Label>
            <Input
              id={`${prefix}-title`}
              value={title}
              autoFocus
              maxLength={PROFILE_LIMITS.sectionTitle}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? `${prefix}-error` : undefined}
              onChange={(event) => setTitle(event.target.value)}
            />
            <ErrorText id={`${prefix}-error`} message={error} />
          </div>
          <SourceGroupChecklist groups={groups} selected={selected} onChange={setSelected} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {messages.common.cancel}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? messages.common.creating : messages.common.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RenameSectionDialog({
  open,
  onOpenChange,
  initialTitle,
  defaultLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTitle: string;
  /** Built-in sections can go back to their default label. */
  defaultLabel?: string;
  onSubmit: Submit<string | null>;
}) {
  const prefix = useId();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(initialTitle);
  const [error, setError] = useState<string | null>(null);
  const submit = (value: string | null) =>
    startTransition(async () => {
      const message = await onSubmit(value);
      if (message) setError(message);
      else onOpenChange(false);
    });

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit(title);
          }}
        >
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">{t.renameTitle}</DialogTitle>
            <DialogDescription>{t.renameDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`${prefix}-title`}>{t.titleLabel}</Label>
            <Input
              id={`${prefix}-title`}
              value={title}
              autoFocus
              maxLength={PROFILE_LIMITS.sectionTitle}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={
                [defaultLabel ? `${prefix}-default` : "", error ? `${prefix}-error` : ""]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
              onChange={(event) => setTitle(event.target.value)}
            />
            {defaultLabel && (
              <p id={`${prefix}-default`} className="text-xs text-muted-foreground">
                {t.defaultTitle(defaultLabel)}
              </p>
            )}
            <ErrorText id={`${prefix}-error`} message={error} />
          </div>
          <DialogFooter className="gap-2">
            {defaultLabel && (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                className="sm:mr-auto"
                onClick={() => submit(null)}
              >
                {t.resetTitle}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {messages.common.cancel}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? messages.common.saving : messages.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SourcesDialog({
  open,
  onOpenChange,
  sectionTitle,
  groups,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sectionTitle: string;
  groups: readonly SourceGroupOption[];
  initial: readonly string[];
  onSubmit: Submit<string[]>;
}) {
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial));
  // Only groups that still exist can be kept; a removed custom group simply drops out on save.
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              const message = await onSubmit(orderedSelection(groups, selected));
              if (message) setError(message);
              else onOpenChange(false);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">
              {t.sourcesTitle} — {sectionTitle}
            </DialogTitle>
            <DialogDescription>{t.sourcesDescription}</DialogDescription>
          </DialogHeader>
          <SourceGroupChecklist groups={groups} selected={selected} onChange={setSelected} />
          <ErrorText id={errorId} message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {messages.common.cancel}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? messages.common.saving : messages.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
