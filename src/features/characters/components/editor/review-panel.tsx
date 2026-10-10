"use client";

import { CheckCircle2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  type CharacterFacts,
  createFieldResolver,
  type LibraryDefinitions,
} from "@/features/characters/domain";
import type { ReviewState } from "@/features/characters/editor/editor-state";
import { buildEditorGroups, fieldsOfGroup } from "@/features/characters/editor/layout";
import {
  isReviewComplete,
  type ReviewDecision,
  reviewChoices,
  reviewItemId,
} from "@/features/characters/editor/review";
import { summarizeFact } from "@/features/characters/editor/summary";
import { messages } from "@/i18n";

import { useEditorContext } from "./editor-context";

const t = messages.editor.review;

export function ReviewPanel({
  review,
  working,
  library,
  onDecision,
  onConfirm,
  onOpenField,
}: {
  review: ReviewState;
  working: CharacterFacts;
  library: LibraryDefinitions;
  onDecision: (id: string, decision: ReviewDecision) => void;
  onConfirm: () => void;
  onOpenField: (key: string) => void;
}) {
  const { nameOf, idPrefix } = useEditorContext();
  const resolve = createFieldResolver(working.custom, { library });
  const labels = new Map(
    buildEditorGroups({ custom: working.custom, library, deprecatedLibraryKeys: new Set() })
      .flatMap(fieldsOfGroup)
      .map((field) => [field.key, field.label]),
  );
  const remaining = review.items.filter(
    (item) => review.decisions[reviewItemId(item)] === undefined,
  ).length;

  return (
    <section aria-labelledby={`${idPrefix}review-title`} className="space-y-5">
      <div className="space-y-2">
        <h2
          id={`${idPrefix}review-title`}
          className="font-heading text-2xl font-semibold tracking-tight"
        >
          {t.title}
        </h2>
        <p className="text-sm text-muted-foreground">{t.intro}</p>
        {review.confirmed ? (
          <p className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="size-4" aria-hidden />
            {t.confirmed}
          </p>
        ) : (
          <p className="flex items-center gap-2 text-sm text-warning">
            <TriangleAlert className="size-4" aria-hidden />
            {t.paused}
          </p>
        )}
      </div>

      <ol className="space-y-4">
        {review.items.map((item) => {
          const id = reviewItemId(item);
          const definition = resolve(item.key);
          const label = labels.get(item.key) ?? item.key;
          const choiceLabels = item.reason === "ambiguous_gender" ? t.genderDecisions : t.decisions;
          const choices = reviewChoices(item, working, { library });
          return (
            <li key={id} className="space-y-3 rounded-xl border bg-card p-4">
              <div className="space-y-1">
                <h3 className="font-medium">{label}</h3>
                <p className="text-sm text-muted-foreground">{t.reasons[item.reason]}</p>
                {definition && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">{t.current}: </span>
                    {summarizeFact(definition, working.values[item.key], nameOf)}
                  </p>
                )}
              </div>
              <RadioGroup
                aria-label={`${t.choose}: ${label}`}
                value={review.decisions[id] ?? ""}
                onValueChange={(value) => onDecision(id, value as ReviewDecision)}
                disabled={review.confirmed}
                className="gap-2.5"
              >
                {choices.map((choice) => (
                  <div key={choice} className="flex items-center gap-2">
                    <RadioGroupItem id={`${idPrefix}${id}-${choice}`} value={choice} />
                    <Label htmlFor={`${idPrefix}${id}-${choice}`} className="font-normal">
                      {choiceLabels[choice]}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto px-0"
                onClick={() =>
                  onOpenField(
                    item.reason === "ambiguous_gender" ? "identity.gender_identity" : item.key,
                  )
                }
              >
                {item.reason === "ambiguous_gender" ? t.openNewFields : t.openField}
              </Button>
            </li>
          );
        })}
      </ol>

      {!review.confirmed && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={!isReviewComplete(review.items, review.decisions)}
            onClick={onConfirm}
          >
            {t.confirm}
          </Button>
          {remaining > 0 && (
            <p className="text-sm text-muted-foreground">{t.remaining(remaining)}</p>
          )}
        </div>
      )}
    </section>
  );
}
