import type { StateCreator } from "zustand";
import type { SubmoduleInfo, WorktreeInfo } from "../../lib/git-types";
import * as commands from "../../lib/tauri-commands";
import { beginLoading, beginRequest, withActiveRepo } from "../store-helpers";
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
    const request = beginRequest(get, "worktrees");
    const { activeTabId } = get();
    if (!activeTabId) return;

    const finishLoading = beginLoading(get, set, "collaboration");
    try {
      const list = await commands.listWorktrees(activeTabId, { silent: true });
      // Guard: only apply if still the same tab
      if (request.isCurrent()) {
        set({ worktrees: list });
      }
    } catch (err) {
      if (!request.isCurrent()) return;
      console.error("Failed to load worktrees:", err);
    } finally {
      finishLoading();
    }
  },

  addWorktree: async (path, branch, newBranch) => {
    await withActiveRepo(
      get,
      set,
      "collaboration",
      "Failed to add worktree",
      async (activeTabId, context) => {
        await commands.addWorktree(activeTabId, path, branch, newBranch, {
          errorPrefix: "Failed to add worktree",
        });
        if (!context.isCurrent()) return;

        await get().loadWorktrees();
        if (!context.isCurrent()) return;
      },
    );
  },

  removeWorktree: async (worktreePath, force = false) => {
    await withActiveRepo(
      get,
      set,
      "collaboration",
      "Failed to remove worktree",
      async (activeTabId, context) => {
        await commands.removeWorktree(activeTabId, worktreePath, force, {
          errorPrefix: "Failed to remove worktree",
        });
        if (!context.isCurrent()) return;

        await get().loadWorktrees();
        if (!context.isCurrent()) return;
      },
    );
  },

  pruneWorktrees: async () => {
    await withActiveRepo(
      get,
      set,
      "collaboration",
      "Failed to prune worktrees",
      async (activeTabId, context) => {
        await commands.pruneWorktrees(activeTabId, {
          errorPrefix: "Failed to prune worktrees",
        });
        if (!context.isCurrent()) return;

        await get().loadWorktrees();
        if (!context.isCurrent()) return;
      },
    );
  },

  loadSubmodules: async () => {
    const request = beginRequest(get, "submodules");
    const { activeTabId } = get();
    if (!activeTabId) return;

    const finishLoading = beginLoading(get, set, "collaboration");
    try {
      const list = await commands.listSubmodules(activeTabId, { silent: true });
      // Guard: only apply if still the same tab
      if (request.isCurrent()) {
        set({ submodules: list });
      }
    } catch (err) {
      if (!request.isCurrent()) return;
      console.error("Failed to load submodules:", err);
    } finally {
      finishLoading();
    }
  },

  initSubmodules: async (paths) => {
    await withActiveRepo(
      get,
      set,
      "collaboration",
      "Failed to initialize submodules",
      async (activeTabId, context) => {
        await commands.initSubmodules(activeTabId, paths, {
          errorPrefix: "Failed to initialize submodules",
        });
        if (!context.isCurrent()) return;

        await get().loadSubmodules();
        if (!context.isCurrent()) return;
      },
    );
  },

  updateSubmodules: async (paths, recursive = false) => {
    await withActiveRepo(
      get,
      set,
      "collaboration",
      "Failed to update submodules",
      async (activeTabId, context) => {
        await commands.updateSubmodules(activeTabId, paths, recursive, {
          errorPrefix: "Failed to update submodules",
        });
        if (!context.isCurrent()) return;

        await get().loadSubmodules();
        if (!context.isCurrent()) return;
      },
    );
  },

  syncSubmodules: async (paths) => {
    await withActiveRepo(
      get,
      set,
      "collaboration",
      "Failed to sync submodules",
      async (activeTabId, context) => {
        await commands.syncSubmodules(activeTabId, paths, {
          errorPrefix: "Failed to sync submodules",
        });
        if (!context.isCurrent()) return;

        await get().loadSubmodules();
        if (!context.isCurrent()) return;
      },
    );
  },

  addSubmodule: async (url, path) => {
    await withActiveRepo(
      get,
      set,
      "collaboration",
      "Failed to add submodule",
      async (activeTabId, context) => {
        await commands.addSubmodule(activeTabId, url, path, {
          errorPrefix: "Failed to add submodule",
        });
        if (!context.isCurrent()) return;

        await get().loadSubmodules();
        if (!context.isCurrent()) return;
      },
    );
  },
});
