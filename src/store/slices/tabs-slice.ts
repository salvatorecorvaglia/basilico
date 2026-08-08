import type { StateCreator } from "zustand";
import type { RecentRepo, RepoInfo, RepoTab } from "../../lib/git-types";
import * as commands from "../../lib/tauri-commands";
import { INITIAL_LOADING_STATES, type RepoState } from "../types";

export interface TabsSlice {
  tabs: RepoTab[];
  activeTabId: string | null;
  hasRestored: boolean;
  recentRepos: RecentRepo[];
  openRepository: (path: string) => Promise<void>;
  cloneRepository: (url: string, path: string) => Promise<void>;
  initializeRepository: (path: string) => Promise<void>;
  closeTab: (tabId: string) => void;
  switchTab: (tabId: string) => void;
  restoreRepositories: (
    paths: string[],
    activePath: string | null,
  ) => Promise<void>;
  pinRecentRepo: (path: string, isPinned: boolean) => void;
  removeRecentRepo: (path: string) => void;
  loadRecentRepos: () => void;
}

/** Tracks in-flight openRepository calls to prevent duplicate concurrent opens */
const pendingOpens = new Set<string>();

export const createTabsSlice: StateCreator<RepoState, [], [], TabsSlice> = (
  set,
  get,
) => {
  const addRepoToRecent = (info: RepoInfo) => {
    const recentStr = localStorage.getItem("basilico-recent-repos");
    let currentRecents: RecentRepo[] = [];
    if (recentStr) {
      try {
        currentRecents = JSON.parse(recentStr) as RecentRepo[];
      } catch (e) {
        console.error("Failed to parse recent repos:", e);
      }
    }

    const existing = currentRecents.find((r) => r.path === info.path);
    const isPinned = existing ? existing.isPinned : false;
    const filtered = currentRecents.filter((r) => r.path !== info.path);

    const newRecent: RecentRepo = {
      path: info.path,
      name: info.name,
      lastOpened: Date.now(),
      isPinned,
      headBranch: info.headBranch,
      state: info.state,
    };

    const nextRecents = [newRecent, ...filtered].slice(0, 50);
    nextRecents.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.lastOpened - a.lastOpened;
    });

    set({ recentRepos: nextRecents });
    localStorage.setItem("basilico-recent-repos", JSON.stringify(nextRecents));
  };

  return {
    tabs: [],
    activeTabId: null,
    hasRestored: false,
    recentRepos: [],

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

        // Add to recent repositories
        addRepoToRecent(info);

        const existingTab = get().tabs.find((t) => t.id === tabId);

        if (existingTab) {
          // Switch to existing tab
          set({ activeTabId: tabId });
          localStorage.setItem("basilico-active-repo", tabId);
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
            tabs: [
              ...state.tabs.map((t) => ({ ...t, isActive: false })),
              newTab,
            ],
            activeTabId: tabId,
            repoInfo: info,
          }));

          localStorage.setItem(
            "basilico-open-repos",
            JSON.stringify(get().tabs.map((t) => t.path)),
          );
          localStorage.setItem("basilico-active-repo", tabId);

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

    cloneRepository: async (url: string, path: string) => {
      set({
        loadingStates: { ...get().loadingStates, global: true },
        error: null,
      });
      try {
        const info = await commands.cloneRepo(url, path, {
          errorPrefix: "Failed to clone repository",
        });
        // Automatically open the cloned repo
        await get().openRepository(info.path);
      } catch (err) {
        set({ error: String(err) });
        throw err;
      } finally {
        set({ loadingStates: { ...get().loadingStates, global: false } });
      }
    },

    initializeRepository: async (path: string) => {
      set({
        loadingStates: { ...get().loadingStates, global: true },
        error: null,
      });
      try {
        await commands.initRepo(path, {
          errorPrefix: "Failed to initialize repository",
        });
        // Automatically open the initialized repo
        await get().openRepository(path);
      } catch (err) {
        set({ error: String(err) });
        throw err;
      } finally {
        set({ loadingStates: { ...get().loadingStates, global: false } });
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

        localStorage.setItem(
          "basilico-open-repos",
          JSON.stringify(filtered.map((t) => t.path)),
        );
        if (newActive) {
          localStorage.setItem("basilico-active-repo", newActive);
        } else {
          localStorage.removeItem("basilico-active-repo");
        }

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
        localStorage.setItem(
          "basilico-open-repos",
          JSON.stringify(filtered.map((t) => t.path)),
        );
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

      localStorage.setItem("basilico-active-repo", tabId);

      // Reload data for the new active tab
      // Surface errors to user instead of swallowing them silently
      get()
        .refreshAll()
        .catch((err) => {
          console.error("Failed to refresh after tab switch:", err);
          set({ error: String(err) });
        });
    },

    restoreRepositories: async (paths: string[], activePath: string | null) => {
      if (get().hasRestored) return;
      set({ hasRestored: true });

      if (!paths || paths.length === 0) return;

      set({
        loadingStates: { ...get().loadingStates, global: true },
        error: null,
      });

      const openedTabs: RepoTab[] = [];
      const infoByPath = new Map<string, RepoInfo>();
      let finalActiveTabId = activePath;

      // Opens are independent, so they run concurrently: restoring N tabs
      // sequentially made startup grow linearly with tab count, when it need
      // only take as long as the slowest single open. `allSettled` keeps the
      // previous behaviour of skipping repositories that no longer exist.
      const results = await Promise.allSettled(
        paths.map((path) => commands.openRepo(path, { silent: true })),
      );

      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.error(
            `Failed to restore repository at ${paths[index]}:`,
            result.reason,
          );
          return;
        }
        const info = result.value;

        // Add to recent repositories
        addRepoToRecent(info);

        openedTabs.push({
          id: info.path,
          path: info.path,
          name: info.name,
          isActive: false,
        });
        infoByPath.set(info.path, info);
      });

      if (openedTabs.length === 0) {
        set({ loadingStates: { ...get().loadingStates, global: false } });
        localStorage.removeItem("basilico-open-repos");
        localStorage.removeItem("basilico-active-repo");
        return;
      }

      // Restoration takes several IPC round-trips, so the user can open a
      // repository manually while it is still running. Merge with whatever is
      // in the store now instead of overwriting it — the previous unconditional
      // `set` was built purely from the local accumulator and silently dropped
      // any tab opened in that window.
      const concurrentTabs = get().tabs.filter(
        (existing) => !openedTabs.some((t) => t.id === existing.id),
      );
      const mergedTabs = [...openedTabs, ...concurrentTabs];

      // A tab the user opened by hand is a deliberate, more recent choice than
      // the persisted one, so let it keep focus.
      const manuallyActivated = get().activeTabId;
      if (
        manuallyActivated &&
        concurrentTabs.some((t) => t.id === manuallyActivated)
      ) {
        finalActiveTabId = manuallyActivated;
      }

      // Determine the active tab
      const hasActive = mergedTabs.some((t) => t.id === finalActiveTabId);
      if (!hasActive) {
        finalActiveTabId = mergedTabs[0].id;
      }

      const finalTabs = mergedTabs.map((t) => ({
        ...t,
        isActive: t.id === finalActiveTabId,
      }));

      // Reuse the info already fetched during restoration when it describes the
      // tab that ended up active; a manually-opened tab can win the race above,
      // in which case its info is not in this map and is fetched below.
      let activeInfo: RepoInfo | null = finalActiveTabId
        ? (infoByPath.get(finalActiveTabId) ?? null)
        : null;
      if (!activeInfo) {
        const activeTab = finalTabs.find((t) => t.isActive);
        if (activeTab) {
          try {
            activeInfo = await commands.getRepoInfo(activeTab.path, {
              silent: true,
            });
          } catch (e) {
            console.error("Failed to get repo info for active tab:", e);
          }
        }
      }

      set({
        tabs: finalTabs,
        activeTabId: finalActiveTabId,
        repoInfo: activeInfo,
        loadingStates: { ...get().loadingStates, global: false },
      });

      // Save the list of successfully opened tabs back to localStorage (cleaning up any invalid/missing ones)
      localStorage.setItem(
        "basilico-open-repos",
        JSON.stringify(finalTabs.map((t) => t.path)),
      );
      if (finalActiveTabId) {
        localStorage.setItem("basilico-active-repo", finalActiveTabId);
      }

      // Refresh all data
      try {
        await get().refreshAll();
      } catch (err) {
        console.error("Failed to refresh repositories after restoration:", err);
        set({ error: String(err) });
      }
    },

    pinRecentRepo: (path: string, isPinned: boolean) => {
      const updated = get().recentRepos.map((r) =>
        r.path === path ? { ...r, isPinned } : r,
      );
      updated.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return b.lastOpened - a.lastOpened;
      });
      set({ recentRepos: updated });
      localStorage.setItem("basilico-recent-repos", JSON.stringify(updated));
    },

    removeRecentRepo: (path: string) => {
      const updated = get().recentRepos.filter((r) => r.path !== path);
      set({ recentRepos: updated });
      localStorage.setItem("basilico-recent-repos", JSON.stringify(updated));
    },

    loadRecentRepos: () => {
      const recentStr = localStorage.getItem("basilico-recent-repos");
      if (recentStr) {
        try {
          const recents = JSON.parse(recentStr) as RecentRepo[];
          recents.sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return b.lastOpened - a.lastOpened;
          });
          set({ recentRepos: recents });
        } catch (e) {
          console.error("Failed to parse recent repos:", e);
        }
      }
    },
  };
};
