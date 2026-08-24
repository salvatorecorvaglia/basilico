/* ═══════════════════════════════════════════════════════
   Basilico — Shared Store Helpers
   Extracted from duplicated setLoading implementations
   ═══════════════════════════════════════════════════════ */

import type { RepoState } from "./types";

/** Recalculate whether ANY domain loading flag is set */
function computeIsLoading(loadingStates: RepoState["loadingStates"]): boolean {
  return (
    loadingStates.global ||
    loadingStates.commits ||
    loadingStates.status ||
    loadingStates.diff ||
    loadingStates.staging ||
    loadingStates.branches ||
    loadingStates.blame ||
    loadingStates.history ||
    loadingStates.stashes ||
    loadingStates.search ||
    loadingStates.collaboration ||
    loadingStates.settings
  );
}

/** Helper to update a single loading domain flag and recalculate isLoading */
export function setLoading(
  get: () => RepoState,
  set: (s: Partial<RepoState>) => void,
  domain: keyof RepoState["loadingStates"],
  value: boolean,
) {
  const newLoadingStates = { ...get().loadingStates, [domain]: value };
  set({
    loadingStates: newLoadingStates,
    isLoading: computeIsLoading(newLoadingStates),
  });
}

/**
 * Wrapper that handles the loading/finally boilerplate for store actions.
 *
 * Sets loading flag, runs the action, logs and rethrows on failure (the
 * caller is expected to surface it via a toast notification — this store has
 * no error state of its own to display), and resets loading flag in finally.
 */
export async function withLoading<T>(
  get: () => RepoState,
  set: (s: Partial<RepoState>) => void,
  domain: keyof RepoState["loadingStates"],
  errorLabel: string,
  fn: () => Promise<T>,
): Promise<T> {
  setLoading(get, set, domain, true);
  try {
    return await fn();
  } catch (err) {
    console.error(`${errorLabel}:`, err);
    throw err;
  } finally {
    setLoading(get, set, domain, false);
  }
}
