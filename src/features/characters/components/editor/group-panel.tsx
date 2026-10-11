"use client";

import { ArrowRightLeft, ChevronDown, EyeOff } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { Collapse } from "@/components/shared/collapse";
import { Button } from "@/components/ui/button";
import type { CharacterFacts, FieldConfig, PresentationMode } from "@/features/characters/domain";
import { emptyValueDraft, type FieldDraft } from "@/features/characters/editor/drafts";
import type { EditorField, EditorGroup, EditorSection } from "@/features/characters/editor/layout";
import { messages } from "@/i18n";
import { scrollToElement } from "@/lib/smooth-scroll";
import { cn } from "@/lib/utils";

import { useEditorContext } from "./editor-context";
import { FieldCard, fieldDomId, LegacyFieldCard } from "./field-card";

const t = messages.editor;

export const RELATIONSHIPS_KEY = "relationships.entries";

export type FieldRenderInfo = {
  visibility: "visible" | "hidden_with_data" | "hidden";
  draft: FieldDraft;
};

export const sectionDomId = (prefix: string, id: string) =>
  `${prefix}section-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

/** Suggest adding the reverse relationship on linked characters that have none (Q4). */
function ReverseSuggestions({ draft }: { draft: FieldDraft }) {
  const { characterId, linkingBack, nameOf } = useEditorContext();
  if (draft.state !== "value" || draft.value.kind !== "object_list") return null;
  const targets = new Set<string>();
  for (const item of draft.value.items) {
    const person = item.fields.person;
    if (person?.kind === "character_ref" && person.ref?.type === "character") {
      targets.add(person.ref.characterId);
    }
  }
  const suggestions = [...targets].filter(
    (id) => id !== characterId && !linkingBack.has(id) && nameOf(id) !== undefined,
  );
  if (suggestions.length === 0) return null;
  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <ArrowRightLeft className="size-4 text-muted-foreground" aria-hidden />
        {t.reverse.title}
      </p>
      <ul className="space-y-2">
        {suggestions.map((id) => {
          const name = nameOf(id)!;
          return (
            <li key={id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">{t.reverse.body(name)}</span>
              <Button asChild variant="outline" size="sm">
                <Link
                  href={
                    `/characters/${id}/edit?group=relationships&reverseOf=${characterId}` as Route
                  }
                >
                  {t.reverse.action(name)}
                </Link>
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SectionFields({
  fields,
  info,
  working,
  onField,
}: {
  fields: EditorField[];
  info: (field: EditorField) => FieldRenderInfo;
  working: CharacterFacts;
  onField: (field: EditorField, draft: FieldDraft) => void;
}) {
  const rendered = fields.flatMap((field) => {
    const { visibility, draft } = info(field);
    const stored = working.values[field.key];
    if (visibility === "visible") {
      return [
        <FieldCard
          key={field.key}
          field={field}
          draft={draft}
          stored={stored}
          onChange={(next) => onField(field, next)}
        >
          {field.key === RELATIONSHIPS_KEY && <ReverseSuggestions draft={draft} />}
        </FieldCard>,
      ];
    }
    // Retired built-in fields with data stay visible (read-only) in every mode.
    if (
      visibility === "hidden_with_data" &&
      field.deprecated &&
      field.scope === "builtin" &&
      stored
    ) {
      return [
        <LegacyFieldCard
          key={field.key}
          field={field}
          stored={stored}
          onRemove={() =>
            onField(field, {
              state: "value",
              value: emptyValueDraft(field.definition as FieldConfig),
              sensitiveItemIds: [],
            })
          }
        />,
      ];
    }
    return [];
  });
  return rendered.length > 0 ? <div className="space-y-4">{rendered}</div> : null;
}

/** Controls a jump lands on: the field's input area, never its state menu. */
const FOCUSABLE =
  'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select, button:not([disabled]), [role="combobox"], [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

/** Scroll to a field card and focus its first control (or the card's label as a fallback). */
export function focusField(domId: string) {
  const card = document.getElementById(domId);
  if (!card) return;
  scrollToElement(card);
  const body = [...card.children].slice(1);
  const target =
    body
      .map((child) =>
        child.matches(FOCUSABLE)
          ? (child as HTMLElement)
          : child.querySelector<HTMLElement>(FOCUSABLE),
      )
      .find(Boolean) ?? card.querySelector<HTMLElement>(FOCUSABLE);
  target?.focus({ preventScroll: true });
}

export function GroupPanel({
  group,
  mode,
  working,
  info,
  onField,
  collapsed,
  onToggleSection,
  onShowAdvanced,
}: {
  group: EditorGroup;
  mode: PresentationMode;
  working: CharacterFacts;
  info: (field: EditorField) => FieldRenderInfo;
  onField: (field: EditorField, draft: FieldDraft) => void;
  collapsed: ReadonlySet<string>;
  onToggleSection: (sectionId: string) => void;
  /** Switch to advanced mode; without it (the editor is always advanced) no switch is offered. */
  onShowAdvanced?: () => void;
}) {
  const { idPrefix } = useEditorContext();
  const allFields = [...group.fields, ...group.subgroups.flatMap((section) => section.fields)];
  const isShown = (field: EditorField) => {
    const { visibility } = info(field);
    return (
      visibility === "visible" ||
      (visibility === "hidden_with_data" && field.deprecated && field.scope === "builtin")
    );
  };
  const hiddenWithData = allFields.filter(
    (field) =>
      info(field).visibility === "hidden_with_data" &&
      !(field.deprecated && field.scope === "builtin"),
  );
  const shownSections = group.subgroups.filter((section) => section.fields.some(isShown));
  const hasDirect = group.fields.some(isShown);

  const filledCount = (section: EditorSection) =>
    section.fields.filter((field) => working.values[field.key] !== undefined).length;

  return (
    <section aria-labelledby={`${sectionDomId(idPrefix, group.id)}-title`} className="space-y-5">
      <h2
        id={`${sectionDomId(idPrefix, group.id)}-title`}
        className="font-heading text-2xl font-semibold tracking-tight"
      >
        {group.label}
      </h2>

      {allFields.length === 0 && (
        <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          {t.sections.emptyGroup}
        </p>
      )}
      {allFields.length > 0 && !hasDirect && shownSections.length === 0 && (
        <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          <p>{t.sections.noVisible}</p>
          {mode === "basic" && onShowAdvanced && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={onShowAdvanced}
            >
              {t.hidden.show}
            </Button>
          )}
        </div>
      )}

      <SectionFields fields={group.fields} info={info} working={working} onField={onField} />

      {shownSections.map((section) => {
        const isCollapsed = collapsed.has(section.id);
        const bodyId = `${sectionDomId(idPrefix, section.id)}-body`;
        return (
          <section
            key={section.id}
            id={sectionDomId(idPrefix, section.id)}
            aria-labelledby={`${sectionDomId(idPrefix, section.id)}-title`}
            className="scroll-mt-32 space-y-3"
          >
            <h3 id={`${sectionDomId(idPrefix, section.id)}-title`}>
              <button
                type="button"
                aria-expanded={!isCollapsed}
                aria-controls={bodyId}
                onClick={() => onToggleSection(section.id)}
                className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left font-heading text-lg font-semibold outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <ChevronDown
                  aria-hidden
                  className={cn(
                    "size-4 transition-transform duration-(--duration-base) ease-soft",
                    isCollapsed && "-rotate-90",
                  )}
                />
                {section.label}
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {t.nav.filled(filledCount(section))}
                </span>
              </button>
            </h3>
            <Collapse id={bodyId} open={!isCollapsed}>
              <SectionFields
                fields={section.fields}
                info={info}
                working={working}
                onField={onField}
              />
            </Collapse>
          </section>
        );
      })}

      {hiddenWithData.length > 0 && (
        <aside className="space-y-2 rounded-xl border border-dashed bg-muted/30 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <EyeOff className="size-4 text-muted-foreground" aria-hidden />
            {t.hidden.title}
          </p>
          <p className="text-muted-foreground">{t.hidden.body}</p>
          <ul className="flex flex-wrap gap-1.5">
            {hiddenWithData.map((field) => (
              <li
                key={field.key}
                className="rounded-md bg-background px-2 py-0.5 ring-1 ring-border"
              >
                {field.label}
              </li>
            ))}
          </ul>
          {onShowAdvanced && (
            <Button type="button" variant="outline" size="sm" onClick={onShowAdvanced}>
              {t.hidden.show}
            </Button>
          )}
        </aside>
      )}
    </section>
  );
}

export { fieldDomId };
