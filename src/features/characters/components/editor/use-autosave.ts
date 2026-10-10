"use client";

import { type Dispatch, useCallback, useEffect } from "react";

import { saveCharacterFactsAction } from "@/features/characters/editor-actions";
import {
  canAutosave,
  type EditorAction,
  type EditorState,
} from "@/features/characters/editor/editor-state";
import { serverIssuesToErrors } from "@/features/characters/editor/validate";
import { messages } from "@/i18n";
import { AUTOSAVE_DELAY_MS, SAVE_TIMEOUT_MS, withTimeout } from "@/lib/autosave";

/**
 * Debounced, sequential autosave. Nothing is sent while the sheet has validation errors, while a
 * conflict is unresolved or while a migration review is unconfirmed. "Saved" is only shown after
 * the database confirmed the write.
 */
export function useAutosave(
  characterId: string,
  state: EditorState,
  dispatch: Dispatch<EditorAction>,
  hasErrors: boolean,
): { saveNow: () => void } {
  const { working, revision, status, library } = state;
  const reviewConfirmed = state.review?.confirmed ?? false;
  const allowed = canAutosave(state) && !hasErrors;

  const save = useCallback(async () => {
    const snapshot = working;
    dispatch({ type: "saveStarted", snapshot });
    try {
      // If a timed-out request did reach the database, the next save gets a revision conflict
      // and the conflict resolution takes over — nothing is overwritten.
      const result = await withTimeout(
        saveCharacterFactsAction(characterId, revision, snapshot, reviewConfirmed),
        SAVE_TIMEOUT_MS,
      );
      if (result.ok) {
        dispatch({
          type: "saveSucceeded",
          snapshot,
          revision: result.data.revision,
          savedAt: result.data.savedAt,
        });
      } else if (result.error.code === "revision_conflict") {
        dispatch({ type: "conflict", message: result.error.message });
      } else {
        dispatch({
          type: "saveFailed",
          message: result.error.message,
          serverErrors: result.error.issues
            ? serverIssuesToErrors(result.error.issues, snapshot, library)
            : {},
        });
      }
    } catch {
      // Network failure or server down: the draft stays on the page; the user can retry.
      dispatch({ type: "saveFailed", message: messages.editor.status.offline });
    }
  }, [characterId, dispatch, library, reviewConfirmed, revision, working]);

  useEffect(() => {
    if (status !== "dirty" || !allowed) return;
    const timer = window.setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [allowed, save, status]);

  const saveNow = useCallback(() => {
    if (allowed && state.status !== "saving") void save();
  }, [allowed, save, state.status]);

  return { saveNow };
}
