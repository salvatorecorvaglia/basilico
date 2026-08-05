import type { CollaborationSlice } from "./slices/collaboration-slice";
import type { GitDataSlice } from "./slices/git-data-slice";
import type { RebaseBisectSlice } from "./slices/rebase-bisect-slice";
import type { SearchSlice } from "./slices/search-slice";
import type { SettingsSlice } from "./slices/settings-slice";
import type { StagingSlice } from "./slices/staging-slice";
import type { TabsSlice } from "./slices/tabs-slice";
import type { WorktreeSubmoduleSlice } from "./slices/worktree-submodule-slice";

export interface LoadingStates {
  global: boolean;
  commits: boolean;
  status: boolean;
  diff: boolean;
  staging: boolean;
  branches: boolean;
  blame: boolean;
  history: boolean;
  stashes: boolean;
  search: boolean;
  collaboration: boolean;
  settings: boolean;
}

export const INITIAL_LOADING_STATES: LoadingStates = {
  global: false,
  commits: false,
  status: false,
  diff: false,
  staging: false,
  branches: false,
  blame: false,
  history: false,
  stashes: false,
  search: false,
  collaboration: false,
  settings: false,
};

/**
 * The assembled store: the shared loading/error surface plus every domain slice.
 *
 * Composed from the slice interfaces rather than restating their fields, so a
 * slice and the store type cannot drift apart — the previous hand-written copy
 * silently omitted anything a slice added.
 */
export interface RepoState
  extends TabsSlice,
    GitDataSlice,
    StagingSlice,
    CollaborationSlice,
    RebaseBisectSlice,
    WorktreeSubmoduleSlice,
    SearchSlice,
    SettingsSlice {
  // ── Shared loading & error surface ──
  loadingStates: LoadingStates;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  errors: Record<string, string>;
}
