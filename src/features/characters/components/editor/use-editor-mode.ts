"use client";

import { useCallback, useSyncExternalStore } from "react";

import type { PresentationMode } from "@/features/characters/domain";

const STORAGE_KEY = "oc-studio.fact-editor.mode";
const CHANGE_EVENT = "oc-studio:fact-editor-mode";

/** Used when storage is unavailable (private mode, blocked site data). */
let memoryMode: PresentationMode = "basic";

function read(): PresentationMode {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "advanced" || stored === "basic" ? stored : memoryMode;
  } catch {
    return memoryMode;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/**
 * Basic / advanced mode, remembered per browser. Presentation only: switching never changes
 * facts. Server render and hydration use "basic".
 */
export function useEditorMode(): [PresentationMode, (mode: PresentationMode) => void] {
  const mode = useSyncExternalStore(subscribe, read, () => "basic" as const);
  const setMode = useCallback((next: PresentationMode) => {
    memoryMode = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not remembered across visits, but applied for this page via `memoryMode`.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return [mode, setMode];
}
