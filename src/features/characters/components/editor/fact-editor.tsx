"use client";

import { ArrowLeft, ArrowRight, Info } from "lucide-react";
import { useId, useMemo, useReducer, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  type FieldConfig,
  getBuiltinField,
  type LibraryDefinitions,
} from "@/features/characters/domain";
import { loadLatestCharacterAction } from "@/features/characters/editor-actions";
import { useIsClient } from "@/hooks/use-is-client";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-guard";
import { emptyObjectItem, factToDraft, type FieldDraft } from "@/features/characters/editor/drafts";
import {
  createEditorState,
  draftOf,
  type EditorState,
  editorReducer,
  type LoadedCharacter,
} from "@/features/characters/editor/editor-state";
import { newItemId } from "@/features/characters/editor/ids";
import {
  buildEditorGroups,
  type EditorField,
  fieldsOfGroup,
  visibilityOf,
} from "@/features/characters/editor/layout";
import { mergeOntoLatest } from "@/features/characters/editor/merge";
import { validateSheet } from "@/features/characters/editor/validate";
import { messages } from "@/i18n";
import { scrollToElement, scrollToTop } from "@/lib/smooth-scroll";
import { useOverlayScrollbars } from "@/hooks/use-overlay-scrollbars";

import { ConflictBanner } from "./conflict-banner";
import { CustomFieldsPanel } from "./custom-fields-panel";
import { type CharacterOption, EditorContextProvider } from "./editor-context";
import { EditorHeader } from "./editor-header";
import {
  buildNavEntries,
  CUSTOM_SECTION,
  EditorNav,
  GENERAL_SECTION,
  REVIEW_SECTION,
} from "./editor-nav";
import { fieldDomId } from "./field-card";
import { GeneralPanel } from "./general-panel";
import { focusField, GroupPanel, RELATIONSHIPS_KEY, sectionDomId } from "./group-panel";
import { ReviewPanel } from "./review-panel";
import { useAutosave } from "./use-autosave";

const t = messages.editor;

export type FactEditorProps = {
  characterId: string;
  loaded: LoadedCharacter;
  library: LibraryDefinitions;
  deprecatedLibraryKeys: string[];
  characters: CharacterOption[];
  /** Characters whose relationships already point at this one. */
  linkingBack: string[];
  initialSection?: string;
  /** "Add the reverse relationship" from another character's editor (a suggestion the user followed). */
  reverseOf?: string;
};

/** Whether following a reverse-relationship suggestion should add a draft entry. */
function shouldAddReverse(props: FactEditorProps): boolean {
  const { reverseOf, characterId, characters, loaded } = props;
  if (!reverseOf || reverseOf === characterId) return false;
  if (!characters.some((character) => character.id === reverseOf)) return false;
  const fact = loaded.facts.values[RELATIONSHIPS_KEY];
  if (fact?.state === "explicit_none" || fact?.state === "not_applicable") return false;
  const items = fact?.state === "specified" ? (fact.value as { person?: unknown }[]) : [];
  return !items.some((item) => {
    const person = item.person as { type?: string; characterId?: string } | undefined;
    return person?.type === "character" && person.characterId === reverseOf;
  });
}

function initialState(props: FactEditorProps): EditorState {
  const state = createEditorState(props.loaded, props.library, props.deprecatedLibraryKeys);
  if (!shouldAddReverse(props)) return state;
  // Only the person is filled in: type, status and description are left to the user (Q4).
  const definition = getBuiltinField(RELATIONSHIPS_KEY)!;
  if (definition.kind !== "object_list") return state;
  const draft = factToDraft(definition, state.working.values[RELATIONSHIPS_KEY]);
  if (draft.value.kind !== "object_list") return state;
  const item = emptyObjectItem(definition, newItemId());
  item.fields.person = {
    kind: "character_ref",
    ref: { type: "character", characterId: props.reverseOf! },
  };
  return editorReducer(state, {
    type: "setField",
    key: RELATIONSHIPS_KEY,
    definition,
    draft: { ...draft, value: { ...draft.value, items: [...draft.value.items, item] } },
  });
}

export function FactEditor(props: FactEditorProps) {
  const { characterId, characters, linkingBack } = props;
  const [state, dispatch] = useReducer(editorReducer, props, initialState);
  const [reverseNotice] = useState(() =>
    shouldAddReverse(props)
      ? characters.find((character) => character.id === props.reverseOf)?.displayName
      : undefined,
  );
  // Every field is shown: the basic/advanced switch was removed (presentation only, facts are
  // never affected by it).
  const mode = "advanced" as const;
  const hydrated = useIsClient();
  const idPrefix = useId();
  const [requested, setActive] = useState(() => {
    if (props.loaded.pendingMigration?.review.length) return REVIEW_SECTION;
    return props.initialSection ?? GENERAL_SECTION;
  });
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [activeItem, setActiveItem] = useState<string>();
  const navScrollbars = useOverlayScrollbars<HTMLElement>();
  const contentRef = useRef<HTMLDivElement>(null);

  const { working, library } = state;
  const deprecatedLibraryKeys = useMemo(
    () => new Set(state.deprecatedLibraryKeys),
    [state.deprecatedLibraryKeys],
  );
  const groups = useMemo(
    () => buildEditorGroups({ custom: working.custom, library, deprecatedLibraryKeys }),
    [working.custom, library, deprecatedLibraryKeys],
  );
  const clientErrors = useMemo(() => validateSheet(working, library), [working, library]);
  const errors = useMemo(
    () => ({ ...state.serverErrors, ...clientErrors }),
    [clientErrors, state.serverErrors],
  );
  const hasErrors = Object.keys(clientErrors).length > 0;

  const names = useMemo(
    () => new Map(characters.map((character) => [character.id, character.displayName])),
    [characters],
  );
  const context = useMemo(
    () => ({
      idPrefix,
      characterId,
      characters,
      nameOf: (id: string) => names.get(id),
      linkingBack: new Set(linkingBack),
      errors,
      reviewKeys: new Set(
        state.review && !state.review.confirmed ? state.review.items.map((item) => item.key) : [],
      ),
    }),
    [idPrefix, characterId, characters, names, linkingBack, errors, state.review],
  );

  const { saveNow } = useAutosave(characterId, state, dispatch, hasErrors);
  useUnsavedChangesGuard(state.dirty || state.status === "saving", t.leaveWarning);

  const navEntries = buildNavEntries(
    groups,
    (group) =>
      fieldsOfGroup(group).filter((field) => working.values[field.key] !== undefined).length,
    state.review !== null,
    (field) => {
      const visibility = visibilityOf(field, {
        mode,
        facts: working,
        library,
        addedLibraryKeys: state.addedLibraryKeys,
      });
      return (
        visibility === "visible" ||
        (visibility === "hidden_with_data" && field.deprecated && field.scope === "builtin")
      );
    },
  );
  // A section can disappear (custom group removed, review resolved): fall back to the first one.
  const active = navEntries.some((entry) => entry.id === requested) ? requested : GENERAL_SECTION;
  const activeGroup = groups.find((group) => group.id === active);
  const activeIndex = navEntries.findIndex((entry) => entry.id === active);

  const select = (id: string, target?: string) => {
    flushSync(() => {
      setActive(id);
      setActiveItem(undefined);
    });
    const element = target ? document.getElementById(target) : null;
    if (element) scrollToElement(element);
    else scrollToTop();
  };
  const openField = (key: string) => {
    const group = groups.find((candidate) => fieldsOfGroup(candidate).some((f) => f.key === key));
    if (group)
      navigate(
        group.id,
        group.subgroups.find((section) => section.fields.some((field) => field.key === key))?.id,
        key,
      );
  };
  const navigate = (id: string, section?: string, field?: string) => {
    flushSync(() => {
      setActive(id);
      setActiveItem(field ?? section);
      if (section)
        setCollapsed((current) => {
          const next = new Set(current);
          next.delete(section);
          return next;
        });
    });
    if (field) focusField(fieldDomId(idPrefix, field));
    else {
      const element = section ? document.getElementById(sectionDomId(idPrefix, section)) : null;
      if (element) scrollToElement(element);
      else scrollToTop();
      (element?.querySelector<HTMLElement>("button") ?? contentRef.current)?.focus({
        preventScroll: true,
      });
    }
  };

  const info = (field: EditorField) => ({
    visibility: visibilityOf(field, {
      mode,
      facts: working,
      library,
      addedLibraryKeys: state.addedLibraryKeys,
    }),
    draft: draftOf(state, field.key, field.definition as FieldConfig),
  });
  const setField = (field: EditorField, draft: FieldDraft) =>
    dispatch({
      type: "setField",
      key: field.key,
      definition: field.definition as FieldConfig,
      draft,
    });

  const loadLatest = async () => {
    const result = await loadLatestCharacterAction(characterId);
    if (!result.ok) {
      toast.error(t.conflict.loadFailed);
      return null;
    }
    return result.data;
  };
  const partLabel = (part: string) =>
    t.conflict.parts[part] ??
    groups.flatMap(fieldsOfGroup).find((field) => field.key === part)?.label ??
    part;

  return (
    <EditorContextProvider value={context}>
      {/* `data-ready` marks hydration: input typed before it would be lost (used by E2E). */}
      <div className="space-y-6" data-fact-editor data-ready={hydrated || undefined}>
        <EditorHeader
          characterId={characterId}
          name={working.displayName}
          state={state}
          hasErrors={hasErrors}
          onRetry={saveNow}
        />

        {state.status === "conflict" && (
          <ConflictBanner
            dirty={state.dirty}
            onLoadLatest={async () => {
              const latest = await loadLatest();
              if (!latest) return;
              dispatch({ type: "loadLatest", loaded: latest });
              toast.success(t.conflict.loaded);
            }}
            onKeepMine={async () => {
              const latest = await loadLatest();
              if (!latest) return null;
              const { merged, overlapping } = mergeOntoLatest(state.base, working, latest.facts);
              return {
                overlap: overlapping.map(partLabel),
                apply: () => {
                  dispatch({ type: "rebase", loaded: latest, merged });
                  toast.success(t.conflict.merged);
                },
              };
            }}
          />
        )}

        {reverseNotice && (
          <p className="flex items-start gap-2 rounded-xl border border-dashed p-3 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            {t.reverse.added(reverseNotice)}
          </p>
        )}

        <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-8">
          <aside
            ref={navScrollbars}
            className="lg:sticky lg:top-36 lg:max-h-[calc(100dvh-10rem)] lg:self-start lg:overflow-y-auto"
          >
            <EditorNav
              entries={navEntries}
              active={active}
              activeItem={activeItem}
              onSelect={navigate}
            />
          </aside>

          <div ref={contentRef} tabIndex={-1} className="min-w-0 space-y-8 outline-none">
            {active === GENERAL_SECTION && (
              <GeneralPanel
                displayName={state.displayNameInput}
                onDisplayName={(input) => dispatch({ type: "setDisplayName", input })}
                language={state.language}
                onLanguage={(draft) => dispatch({ type: "setLanguage", draft })}
                factCount={Object.keys(working.values).length}
              />
            )}
            {active === REVIEW_SECTION && state.review && (
              <ReviewPanel
                review={state.review}
                working={working}
                library={library}
                onDecision={(id, decision) => dispatch({ type: "setReviewDecision", id, decision })}
                onConfirm={() => dispatch({ type: "confirmReview" })}
                onOpenField={openField}
              />
            )}
            {active === CUSTOM_SECTION && (
              <CustomFieldsPanel
                state={state}
                groups={groups}
                dispatch={dispatch}
                onOpenGroup={(groupId) => {
                  const owner = groups.find(
                    (group) =>
                      group.id === groupId ||
                      group.subgroups.some((subgroup) => subgroup.id === groupId),
                  );
                  if (owner)
                    select(
                      owner.id,
                      owner.id === groupId ? undefined : sectionDomId(idPrefix, groupId),
                    );
                }}
              />
            )}
            {activeGroup && (
              <GroupPanel
                group={activeGroup}
                mode={mode}
                working={working}
                info={info}
                onField={setField}
                collapsed={collapsed}
                onToggleSection={(id) =>
                  setCollapsed((current) => {
                    const next = new Set(current);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
              />
            )}

            <div className="flex justify-between gap-2 border-t pt-4">
              {activeIndex > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => select(navEntries[activeIndex - 1]!.id)}
                >
                  <ArrowLeft data-icon="inline-start" aria-hidden />
                  {navEntries[activeIndex - 1]!.label}
                </Button>
              ) : (
                <span />
              )}
              {activeIndex < navEntries.length - 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => select(navEntries[activeIndex + 1]!.id)}
                >
                  {navEntries[activeIndex + 1]!.label}
                  <ArrowRight data-icon="inline-end" aria-hidden />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </EditorContextProvider>
  );
}
