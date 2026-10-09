import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** `false` during SSR and hydration, `true` afterwards. Use to gate client-only state (e.g. theme). */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
