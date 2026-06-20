/* ═══════════════════════════════════════════════════════
   Basilico — Repository Store
   Assembled from modular domain slices
   ═══════════════════════════════════════════════════════ */

import { create } from 'zustand';
import type { RepoState } from './types';
import { createTabsSlice } from './slices/tabs-slice';
import { createGitDataSlice } from './slices/git-data-slice';
import { createStagingSlice } from './slices/staging-slice';
import { createCollaborationSlice } from './slices/collaboration-slice';
import { createSettingsSlice } from './slices/settings-slice';

export const useRepoStore = create<RepoState>((set, get, store) => ({
  // Loading and Error States (shared across slices)
  isLoading: false,
  isRefreshing: false,
  error: null,

  // Slice Creators
  ...createTabsSlice(set, get, store),
  ...createGitDataSlice(set, get, store),
  ...createStagingSlice(set, get, store),
  ...createCollaborationSlice(set, get, store),
  ...createSettingsSlice(set, get, store),
}));
