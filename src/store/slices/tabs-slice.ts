import type { StateCreator } from "zustand";
import type { RepoTab } from "../../lib/git-types";
import * as commands from "../../lib/tauri-commands";
import { INITIAL_LOADING_STATES, type RepoState } from "../types";

export interface TabsSlice {
  tabs: RepoTab[];
  activeTabId: string | null;
  openRepository: (path: string) => Promise<void>;
  closeTab: (tabId: string) => void;
  switchTab: (tabId: string) => void;
}

/** Tracks in-flight openRepository calls to prevent duplicate concurrent opens */
const pendingOpens = new Set<string>();

export const createTabsSlice: StateCreator<RepoState, [], [], TabsSlice> = (
  set,
  get,
) => ({
  tabs: [],
  activeTabId: null,

  openRepository: async (path: string) => {
    // Deduplicate concurrent calls for the same path
    if (pendingOpens.has(path)) return;
    pendingOpens.add(path);

    set({
      loadingStates: { ...get().loadingStates, global: true },
      error: null,
    });

    try {
      const info = await commands.openRepo(path, {
        errorPrefix: "Failed to open repository",
      });
      const tabId = info.path;
      const existingTab = get().tabs.find((t) => t.id === tabId);

      if (existingTab) {
        // Switch to existing tab
        set({ activeTabId: tabId });
        await get().refreshAll();
      } else {
        // Create new tab
        const newTab: RepoTab = {
          id: tabId,
          path: info.path,
          name: info.name,
          isActive: true,
        };

        set((state) => ({
          tabs: [...state.tabs.map((t) => ({ ...t, isActive: false })), newTab],
          activeTabId: tabId,
          repoInfo: info,
        }));

        // Load all data
        await get().refreshAll();
      }
    } catch (err) {
      set({ error: String(err) });
      throw err;
    } finally {
      set({ loadingStates: { ...get().loadingStates, global: false } });
      pendingOpens.delete(path);
    }
  },

  closeTab: (tabId: string) => {
    const { tabs, activeTabId } = get();
    const filtered = tabs.filter((t) => t.id !== tabId);

    if (activeTabId === tabId) {
      const newActive =
        filtered.length > 0 ? filtered[filtered.length - 1].id : null;
      set({
        tabs: filtered,
        activeTabId: newActive,
        // Reset all per-tab state to prevent stale data
        repoInfo: null,
        status: null,
        branches: [],
        tags: [],
        remotes: [],
        commits: [],
        selectedCommitOid: null,
        commitDiff: [],
        blameLines: [],
        fileHistory: [],
        stashes: [],
        worktrees: [],
        submodules: [],
        commitTree: [],
        compareDiff: [],
        compareBase: null,
        compareTarget: null,
        selectedCompareFile: null,
        compareFileDiff: null,
        conflictStages: null,
        activeConflictedPath: null,
        selectedStashIndex: null,
        stashDiff: [],
        selectedStashFile: null,
        selectedStashFileDiff: null,
        selectedFilePath: null,
        selectedFileIsStaged: false,
        localDiff: null,
        loadingStates: { ...INITIAL_LOADING_STATES },
        isLoading: false,
        error: null,
        errors: {},
        // Increment generation to invalidate in-flight async responses from old tab
        refreshGeneration: get().refreshGeneration + 1,
      });

      // If there's a new active tab, reload its data
      // Surface errors to user instead of swallowing them silently
      if (newActive) {
        get()
          .refreshAll()
          .catch((err) => {
            console.error("Failed to refresh after tab close:", err);
            set({ error: String(err) });
          });
      }
    } else {
      set({ tabs: filtered });
    }

    // Tell Rust to clean up
    commands.closeRepo(tabId, { silent: true }).catch(() => {});
  },

  switchTab: (tabId: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => ({ ...t, isActive: t.id === tabId })),
      activeTabId: tabId,
      // Reset per-tab state to prevent stale data from previous tab
      selectedCommitOid: null,
      commitDiff: [],
      blameLines: [],
      fileHistory: [],
      stashes: [],
      commitTree: [],
      compareDiff: [],
      compareBase: null,
      compareTarget: null,
      selectedCompareFile: null,
      compareFileDiff: null,
      conflictStages: null,
      activeConflictedPath: null,
      selectedStashIndex: null,
      stashDiff: [],
      selectedStashFile: null,
      selectedStashFileDiff: null,
      selectedFilePath: null,
      selectedFileIsStaged: false,
      localDiff: null,
      error: null,
      errors: {},
      // Increment generation to invalidate in-flight async responses from old tab
      refreshGeneration: state.refreshGeneration + 1,
    }));

    // Reload data for the new active tab
    // Surface errors to user instead of swallowing them silently
    get()
      .refreshAll()
      .catch((err) => {
        console.error("Failed to refresh after tab switch:", err);
        set({ error: String(err) });
      });
  },
});
