"use client";

import { createContext, useContext } from "react";

import type { EditorErrors } from "@/features/characters/editor/errors";

export type CharacterOption = { id: string; displayName: string };

export type EditorContextValue = {
  /** Unique per editor instance: hidden copies of visited pages (Activity) must not share DOM ids. */
  idPrefix: string;
  characterId: string;
  /** Active characters of the library, for reference pickers. */
  characters: readonly CharacterOption[];
  nameOf: (characterId: string) => string | undefined;
  /** Characters whose relationships already point at this character. */
  linkingBack: ReadonlySet<string>;
  errors: EditorErrors;
  /** Field keys listed in the pending migration review. */
  reviewKeys: ReadonlySet<string>;
};

const EditorContext = createContext<EditorContextValue | null>(null);

export const EditorContextProvider = EditorContext.Provider;

export function useEditorContext(): EditorContextValue {
  const value = useContext(EditorContext);
  if (!value) throw new Error("useEditorContext must be used inside the Fact Editor.");
  return value;
}
