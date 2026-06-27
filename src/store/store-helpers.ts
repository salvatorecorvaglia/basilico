/* ═══════════════════════════════════════════════════════
   Basilico — Shared Store Helpers
   Extracted from duplicated setLoading implementations
   ═══════════════════════════════════════════════════════ */

import type { RepoState } from "./types";

/** Helper to update a single loading domain flag */
export function setLoading(
  get: () => RepoState,
  set: (s: Partial<RepoState>) => void,
  domain: keyof RepoState["loadingStates"],
  value: boolean,
) {
  set({ loadingStates: { ...get().loadingStates, [domain]: value } });
}

/**
 * Wrapper that handles the loading/error/finally boilerplate for store actions.
 *
 * Sets loading flag, clears error, runs the action, catches errors,
 * and resets loading flag in finally block.
 */
export async function withLoading<T>(
  get: () => RepoState,
  set: (s: Partial<RepoState>) => void,
  domain: keyof RepoState["loadingStates"],
  errorLabel: string,
  fn: () => Promise<T>,
): Promise<T> {
  setLoading(get, set, domain, true);
  set({ error: null });
  try {
    return await fn();
  } catch (err) {
    console.error(`${errorLabel}:`, err);
    set({ error: String(err) });
    throw err;
  } finally {
    setLoading(get, set, domain, false);
  }
}
