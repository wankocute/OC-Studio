"use client";

import { type Dispatch, useCallback, useEffect, useRef } from "react";

import { loadSectionDraftAction, saveSectionDraftAction } from "@/features/profiles/actions";
import type { RichTextDocument } from "@/features/profiles/domain";
import {
  canAutosave,
  type WorkspaceAction,
  type WorkspaceState,
} from "@/features/profiles/workspace/state";
import { messages } from "@/i18n";
import { AUTOSAVE_DELAY_MS, SAVE_TIMEOUT_MS, withTimeout } from "@/lib/autosave";

const t = messages.profiles;

/**
 * Debounced, sequential autosave of section drafts: one request at a time across the workspace,
 * with each section's latest draft revision. Nothing is sent for invalid content or during a
 * conflict; a conflict loads the newer stored draft so the user can choose.
 */
export function useSectionAutosave(
  state: WorkspaceState,
  dispatch: Dispatch<WorkspaceAction>,
): { saveNow: (sectionId: string) => void } {
  const inFlight = useRef(false);

  const loadLatest = useCallback(
    async (sectionId: string) => {
      try {
        const result = await withTimeout(loadSectionDraftAction(sectionId), SAVE_TIMEOUT_MS);
        dispatch({
          type: "conflictLoaded",
          sectionId,
          latest: result.ok
            ? { draft: result.data.draft, draftRevision: result.data.draftRevision }
            : null,
        });
      } catch {
        dispatch({ type: "conflictLoaded", sectionId, latest: null });
      }
    },
    [dispatch],
  );

  const save = useCallback(
    async (
      sectionId: string,
      snapshot: RichTextDocument,
      draftRevision: number,
      replaceNewer: boolean,
    ) => {
      inFlight.current = true;
      dispatch({ type: "saveStarted", sectionId, snapshot });
      try {
        // If a timed-out request did reach the database, the next save gets a revision conflict
        // and the conflict resolution takes over — nothing is overwritten.
        const result = await withTimeout(
          saveSectionDraftAction(sectionId, draftRevision, snapshot, replaceNewer),
          SAVE_TIMEOUT_MS,
        );
        if (result.ok) {
          dispatch({ type: "saveSucceeded", sectionId, snapshot, ...result.data });
        } else if (result.error.code === "revision_conflict") {
          dispatch({ type: "conflict", sectionId, message: t.conflict.body });
          void loadLatest(sectionId);
        } else {
          dispatch({ type: "saveFailed", sectionId, message: result.error.message });
        }
      } catch {
        dispatch({ type: "saveFailed", sectionId, message: t.status.offline });
      } finally {
        inFlight.current = false;
      }
    },
    [dispatch, loadLatest],
  );

  // The section to save next: the active one first, then any other unsaved section.
  const pending = [state.activeId, ...Object.keys(state.drafts)].find((id) => {
    const draft = state.drafts[id];
    return draft !== undefined && canAutosave(draft);
  });
  const anySaving = Object.values(state.drafts).some((draft) => draft.status === "saving");
  const pendingDraft = pending ? state.drafts[pending] : undefined;

  useEffect(() => {
    if (!pending || !pendingDraft?.content || anySaving) return;
    const { content, draftRevision, replaceNewer } = pendingDraft;
    const timer = window.setTimeout(() => {
      if (!inFlight.current) void save(pending, content, draftRevision, replaceNewer);
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [anySaving, pending, pendingDraft, save]);

  const saveNow = useCallback(
    (sectionId: string) => {
      const draft = state.drafts[sectionId];
      if (!draft?.content || draft.invalid.length > 0 || inFlight.current) return;
      if (draft.status === "conflict" || draft.status === "saving") return;
      void save(sectionId, draft.content, draft.draftRevision, draft.replaceNewer);
    },
    [save, state.drafts],
  );

  return { saveNow };
}
