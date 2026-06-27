/* ═══════════════════════════════════════════════════════
   Basilico — Repository Store
   Assembled from modular domain slices
   ═══════════════════════════════════════════════════════ */

import { create } from "zustand";
import { createCollaborationSlice } from "./slices/collaboration-slice";
import { createGitDataSlice } from "./slices/git-data-slice";
import { createSettingsSlice } from "./slices/settings-slice";
import { createStagingSlice } from "./slices/staging-slice";
import { createTabsSlice } from "./slices/tabs-slice";
import { INITIAL_LOADING_STATES, type RepoState } from "./types";

/** Helper: returns true if ANY domain loading flag is set */
function computeIsLoading(state: RepoState): boolean {
  const ls = state.loadingStates;
  return (
    ls.global ||
    ls.commits ||
    ls.status ||
    ls.diff ||
    ls.staging ||
    ls.branches ||
    ls.blame ||
    ls.history ||
    ls.stashes ||
    ls.search ||
    ls.collaboration ||
    ls.settings
  );
}

export const useRepoStore = create<RepoState>((set, get, store) => ({
  // Loading and Error States
  loadingStates: { ...INITIAL_LOADING_STATES },
  get isLoading() {
    return computeIsLoading(get());
  },
  isRefreshing: false,
  error: null,

  // Slice Creators
  ...createTabsSlice(set, get, store),
  ...createGitDataSlice(set, get, store),
  ...createStagingSlice(set, get, store),
  ...createCollaborationSlice(set, get, store),
  ...createSettingsSlice(set, get, store),
}));
