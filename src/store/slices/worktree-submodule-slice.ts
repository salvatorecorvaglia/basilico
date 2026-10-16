import type { StateCreator } from "zustand";
import type { SubmoduleInfo, WorktreeInfo } from "../../lib/git-types";
import * as commands from "../../lib/tauri-commands";
import { setLoading, withActiveRepo } from "../store-helpers";
import type { RepoState } from "../types";

export interface WorktreeSubmoduleSlice {
  worktrees: WorktreeInfo[];
  submodules: SubmoduleInfo[];

  loadWorktrees: () => Promise<void>;
  addWorktree: (
    path: string,
    branch?: string | null,
    newBranch?: string | null,
  ) => Promise<void>;
  removeWorktree: (worktreePath: string, force?: boolean) => Promise<void>;
  pruneWorktrees: () => Promise<void>;
  loadSubmodules: () => Promise<void>;
  initSubmodules: (paths: string[]) => Promise<void>;
  updateSubmodules: (paths: string[], recursive?: boolean) => Promise<void>;
  syncSubmodules: (paths: string[]) => Promise<void>;
  addSubmodule: (url: string, path: string) => Promise<void>;
}

export const createWorktreeSubmoduleSlice: StateCreator<
  RepoState,
  [],
  [],
  WorktreeSubmoduleSlice
> = (set, get) => ({
  worktrees: [],
  submodules: [],

  loadWorktrees: async () => {
    const { activeTabId, refreshGeneration } = get();
    if (!activeTabId) return;

    setLoading(get, set, "collaboration", true);
    try {
      const list = await commands.listWorktrees(activeTabId, { silent: true });
      // Guard: only apply if still the same tab
      if (get().refreshGeneration === refreshGeneration) {
        set({ worktrees: list });
      }
    } catch (err) {
      console.error("Failed to load worktrees:", err);
    } finally {
      setLoading(get, set, "collaboration", false);
    }
  },

  addWorktree: async (path, branch, newBranch) => {
    await withActiveRepo(
      get,
      set,
      "collaboration",
      "Failed to add worktree",
      async (activeTabId) => {
        await commands.addWorktree(activeTabId, path, branch, newBranch, {
          errorPrefix: "Failed to add worktree",
        });
        await get().loadWorktrees();
      },
    );
  },

  removeWorktree: async (worktreePath, force = false) => {
    await withActiveRepo(
      get,
      set,
      "collaboration",
      "Failed to remove worktree",
      async (activeTabId) => {
        await commands.removeWorktree(activeTabId, worktreePath, force, {
          errorPrefix: "Failed to remove worktree",
        });
        await get().loadWorktrees();
      },
    );
  },

  pruneWorktrees: async () => {
    await withActiveRepo(
      get,
      set,
      "collaboration",
      "Failed to prune worktrees",
      async (activeTabId) => {
        await commands.pruneWorktrees(activeTabId, {
          errorPrefix: "Failed to prune worktrees",
        });
        await get().loadWorktrees();
      },
    );
  },

  loadSubmodules: async () => {
    const { activeTabId, refreshGeneration } = get();
    if (!activeTabId) return;

    setLoading(get, set, "collaboration", true);
    try {
      const list = await commands.listSubmodules(activeTabId, { silent: true });
      // Guard: only apply if still the same tab
      if (get().refreshGeneration === refreshGeneration) {
        set({ submodules: list });
      }
    } catch (err) {
      console.error("Failed to load submodules:", err);
    } finally {
      setLoading(get, set, "collaboration", false);
    }
  },

  initSubmodules: async (paths) => {
    await withActiveRepo(
      get,
      set,
      "collaboration",
      "Failed to initialize submodules",
      async (activeTabId) => {
        await commands.initSubmodules(activeTabId, paths, {
          errorPrefix: "Failed to initialize submodules",
        });
        await get().loadSubmodules();
      },
    );
  },

  updateSubmodules: async (paths, recursive = false) => {
    await withActiveRepo(
      get,
      set,
      "collaboration",
      "Failed to update submodules",
      async (activeTabId) => {
        await commands.updateSubmodules(activeTabId, paths, recursive, {
          errorPrefix: "Failed to update submodules",
        });
        await get().loadSubmodules();
      },
    );
  },

  syncSubmodules: async (paths) => {
    await withActiveRepo(
      get,
      set,
      "collaboration",
      "Failed to sync submodules",
      async (activeTabId) => {
        await commands.syncSubmodules(activeTabId, paths, {
          errorPrefix: "Failed to sync submodules",
        });
        await get().loadSubmodules();
      },
    );
  },

  addSubmodule: async (url, path) => {
    await withActiveRepo(
      get,
      set,
      "collaboration",
      "Failed to add submodule",
      async (activeTabId) => {
        await commands.addSubmodule(activeTabId, url, path, {
          errorPrefix: "Failed to add submodule",
        });
        await get().loadSubmodules();
      },
    );
  },
});
