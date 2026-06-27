import type { StateCreator } from "zustand";
import type {
  BisectState,
  FileDiff,
  RebaseStatus,
  RebaseTodoItem,
  SubmoduleInfo,
  TreeEntryInfo,
  WorktreeInfo,
} from "../../lib/git-types";
import * as commands from "../../lib/tauri-commands";
import { setLoading } from "../store-helpers";
import type { RepoState } from "../types";

export interface CollaborationSlice {
  rebaseTodoItems: RebaseTodoItem[];
  rebaseStatus: RebaseStatus | null;
  bisectState: BisectState | null;
  worktrees: WorktreeInfo[];
  submodules: SubmoduleInfo[];
  commitTree: TreeEntryInfo[];
  compareDiff: FileDiff[];
  compareBase: string | null;
  compareTarget: string | null;
  selectedCompareFile: string | null;
  compareFileDiff: FileDiff | null;

  checkoutBranch: (branchName: string) => Promise<void>;
  createBranch: (name: string, startPoint?: string | null) => Promise<void>;
  deleteBranch: (name: string, isRemote: boolean) => Promise<void>;
  renameBranch: (currentName: string, newName: string) => Promise<void>;
  deleteTag: (name: string) => Promise<void>;
  createTag: (
    name: string,
    targetOid: string,
    message?: string | null,
    force?: boolean,
  ) => Promise<void>;
  pushTag: (remote: string, tagName: string) => Promise<void>;
  mergeBranch: (branchName: string) => Promise<"success" | "conflicts">;
  abortMerge: () => Promise<void>;
  resolveConflict: (filePath: string) => Promise<void>;
  fetch: (remote: string) => Promise<void>;
  pull: (remote: string, branch: string) => Promise<"success" | "conflicts">;
  push: (remote: string, branch: string, force: boolean) => Promise<void>;
  initRebase: (upstream: string) => Promise<void>;
  writeRebaseTodo: (items: RebaseTodoItem[]) => Promise<void>;
  stepRebase: (
    action: string,
    commitMessage?: string | null,
  ) => Promise<RebaseStatus>;
  startBisect: (bad: string, good: string) => Promise<void>;
  markBisect: (status: string) => Promise<void>;
  resetBisect: () => Promise<void>;
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
  cherryPickCommit: (oid: string) => Promise<"success" | "conflicts">;
  cherryPickAbort: () => Promise<void>;
  revertCommit: (oid: string) => Promise<"success" | "conflicts">;
  revertAbort: () => Promise<void>;
  resetToCommit: (
    oid: string,
    mode: "soft" | "mixed" | "hard",
  ) => Promise<void>;
  loadCommitTree: (oid: string) => Promise<void>;
  startComparison: (base: string, target: string) => Promise<void>;
  selectCompareFile: (filePath: string | null) => Promise<void>;
}

export const createCollaborationSlice: StateCreator<
  RepoState,
  [],
  [],
  CollaborationSlice
> = (set, get) => ({
  rebaseTodoItems: [],
  rebaseStatus: null,
  bisectState: null,
  worktrees: [],
  submodules: [],
  commitTree: [],
  compareDiff: [],
  compareBase: null,
  compareTarget: null,
  selectedCompareFile: null,
  compareFileDiff: null,

  checkoutBranch: async (branchName) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "branches", true);
    set({ error: null });
    try {
      await commands.checkoutBranch(activeTabId, branchName, {
        errorPrefix: "Failed to checkout branch",
      });
      set({ selectedFilePath: null, localDiff: null });
      await get().refreshAll();
    } catch (err) {
      console.error("Failed to checkout branch:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "branches", false);
    }
  },

  createBranch: async (name, startPoint = null) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "branches", true);
    set({ error: null });
    try {
      await commands.createBranch(activeTabId, name, startPoint, {
        errorPrefix: "Failed to create branch",
      });
      // Targeted refresh: only branches needed after create
      await get().refreshBranches();
    } catch (err) {
      console.error("Failed to create branch:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "branches", false);
    }
  },

  deleteBranch: async (name, isRemote) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "branches", true);
    set({ error: null });
    try {
      await commands.deleteBranch(activeTabId, name, isRemote, {
        errorPrefix: "Failed to delete branch",
      });
      // Targeted refresh: only branches needed after delete
      await get().refreshBranches();
    } catch (err) {
      console.error("Failed to delete branch:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "branches", false);
    }
  },

  renameBranch: async (currentName, newName) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "branches", true);
    set({ error: null });
    try {
      await commands.renameBranch(activeTabId, currentName, newName, {
        errorPrefix: "Failed to rename branch",
      });
      // Targeted refresh: only branches needed after rename
      await get().refreshBranches();
    } catch (err) {
      console.error("Failed to rename branch:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "branches", false);
    }
  },

  deleteTag: async (name) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "collaboration", true);
    set({ error: null });
    try {
      await commands.deleteTag(activeTabId, name, {
        errorPrefix: "Failed to delete tag",
      });
      // Targeted refresh: only branches/tags needed
      await get().refreshBranches();
    } catch (err) {
      console.error("Failed to delete tag:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "collaboration", false);
    }
  },

  createTag: async (name, targetOid, message = null, force = false) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "collaboration", true);
    set({ error: null });
    try {
      await commands.createTag(activeTabId, name, targetOid, message, force, {
        errorPrefix: "Failed to create tag",
      });
      // Targeted refresh: only branches/tags needed
      await get().refreshBranches();
    } catch (err) {
      console.error("Failed to create tag:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "collaboration", false);
    }
  },

  pushTag: async (remote, tagName) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "collaboration", true);
    set({ error: null });
    try {
      await commands.pushTag(activeTabId, remote, tagName, {
        errorPrefix: "Failed to push tag",
      });
      // Targeted refresh: only branches/tags needed
      await get().refreshBranches();
    } catch (err) {
      console.error("Failed to push tag:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "collaboration", false);
    }
  },

  mergeBranch: async (branchName) => {
    const { activeTabId } = get();
    if (!activeTabId) return "conflicts";

    setLoading(get, set, "collaboration", true);
    set({ error: null });
    try {
      const result = await commands.mergeBranch(activeTabId, branchName, {
        errorPrefix: "Failed to merge",
      });
      // Targeted refresh: commits + status after merge
      await get().refreshCommitsAndStatus();
      return result;
    } catch (err) {
      console.error("Failed to merge branch:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "collaboration", false);
    }
  },

  abortMerge: async () => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "collaboration", true);
    set({ error: null });
    try {
      await commands.abortMerge(activeTabId, {
        errorPrefix: "Failed to abort merge",
      });
      // Targeted refresh: commits + status after merge abort
      await get().refreshCommitsAndStatus();
    } catch (err) {
      console.error("Failed to abort merge:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "collaboration", false);
    }
  },

  resolveConflict: async (filePath) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "collaboration", true);
    set({ error: null });
    try {
      await commands.resolveConflict(activeTabId, filePath, {
        errorPrefix: "Failed to resolve conflict",
      });
      // Targeted refresh: only status after conflict resolve
      await get().refreshStatus();
    } catch (err) {
      console.error("Failed to resolve conflict:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "collaboration", false);
    }
  },

  fetch: async (remote) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isRefreshing: true, error: null });
    try {
      await commands.fetch(activeTabId, remote, {
        errorPrefix: "Fetch failed",
      });
      await get().refreshAll();
    } catch (err) {
      console.error("Failed to fetch:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isRefreshing: false });
    }
  },

  pull: async (remote, branch) => {
    const { activeTabId } = get();
    if (!activeTabId) return "conflicts";

    setLoading(get, set, "collaboration", true);
    set({ error: null });
    try {
      const result = await commands.pull(activeTabId, remote, branch, {
        errorPrefix: "Pull failed",
      });
      await get().refreshAll();
      return result;
    } catch (err) {
      console.error("Failed to pull:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "collaboration", false);
    }
  },

  push: async (remote, branch, force) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "collaboration", true);
    set({ error: null });
    try {
      await commands.push(activeTabId, remote, branch, force, {
        errorPrefix: "Push failed",
      });
      await get().refreshAll();
    } catch (err) {
      console.error("Failed to push:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "collaboration", false);
    }
  },

  initRebase: async (upstream) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "collaboration", true);
    set({ error: null });
    try {
      const items = await commands.rebaseInit(activeTabId, upstream, {
        errorPrefix: "Failed to initialize rebase",
      });
      set({
        rebaseTodoItems: items,
        rebaseStatus: {
          status: "stepping",
          currentOid: null,
          message: "Rebase initialized",
        },
      });
    } catch (err) {
      console.error("Failed to initialize rebase:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "collaboration", false);
    }
  },

  writeRebaseTodo: async (items) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "collaboration", true);
    set({ error: null });
    try {
      await commands.rebaseWriteTodo(activeTabId, items, {
        errorPrefix: "Failed to write rebase todo",
      });
      set({ rebaseTodoItems: items });
    } catch (err) {
      console.error("Failed to write rebase todo:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "collaboration", false);
    }
  },

  stepRebase: async (action, commitMessage = null) => {
    const { activeTabId } = get();
    if (!activeTabId) throw new Error("No active repository");

    setLoading(get, set, "collaboration", true);
    set({ error: null });
    try {
      const status = await commands.rebaseStep(
        activeTabId,
        action,
        commitMessage,
        { errorPrefix: "Failed to step rebase" },
      );
      set({ rebaseStatus: status });
      await get().refreshAll();
      return status;
    } catch (err) {
      console.error("Failed to step rebase:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "collaboration", false);
    }
  },

  startBisect: async (bad, good) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "collaboration", true);
    set({ error: null });
    try {
      const state = await commands.bisectStart(activeTabId, bad, good, {
        errorPrefix: "Failed to start bisect",
      });
      set({ bisectState: state });
      await get().refreshAll();
    } catch (err) {
      console.error("Failed to start bisect:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "collaboration", false);
    }
  },

  markBisect: async (status) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "collaboration", true);
    set({ error: null });
    try {
      const state = await commands.bisectMark(activeTabId, status, {
        errorPrefix: "Failed to mark bisect",
      });
      set({ bisectState: state });
      await get().refreshAll();
    } catch (err) {
      console.error("Failed to mark bisect:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "collaboration", false);
    }
  },

  resetBisect: async () => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "collaboration", true);
    set({ error: null });
    try {
      await commands.bisectReset(activeTabId, {
        errorPrefix: "Failed to reset bisect",
      });
      set({ bisectState: null });
      await get().refreshAll();
    } catch (err) {
      console.error("Failed to reset bisect:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "collaboration", false);
    }
  },

  loadWorktrees: async () => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    try {
      const worktrees = await commands.listWorktrees(activeTabId, {
        silent: true,
      });
      set({ worktrees });
    } catch (err) {
      console.error("Failed to load worktrees:", err);
      set({ error: String(err) });
    }
  },

  addWorktree: async (path, branch = null, newBranch = null) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "collaboration", true);
    set({ error: null });
    try {
      await commands.addWorktree(activeTabId, path, branch, newBranch, {
        errorPrefix: "Failed to add worktree",
      });
      await get().loadWorktrees();
    } catch (err) {
      console.error("Failed to add worktree:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "collaboration", false);
    }
  },

  removeWorktree: async (worktreePath, force = false) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "collaboration", true);
    set({ error: null });
    try {
      await commands.removeWorktree(activeTabId, worktreePath, force, {
        errorPrefix: "Failed to remove worktree",
      });
      await get().loadWorktrees();
    } catch (err) {
      console.error("Failed to remove worktree:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "collaboration", false);
    }
  },

  pruneWorktrees: async () => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "collaboration", true);
    set({ error: null });
    try {
      await commands.pruneWorktrees(activeTabId, {
        errorPrefix: "Failed to prune worktrees",
      });
      await get().loadWorktrees();
    } catch (err) {
      console.error("Failed to prune worktrees:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "collaboration", false);
    }
  },

  loadSubmodules: async () => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    try {
      const submodules = await commands.listSubmodules(activeTabId, {
        silent: true,
      });
      set({ submodules });
    } catch (err) {
      console.error("Failed to load submodules:", err);
      set({ error: String(err) });
    }
  },

  initSubmodules: async (paths) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "collaboration", true);
    set({ error: null });
    try {
      await commands.initSubmodules(activeTabId, paths, {
        errorPrefix: "Failed to initialize submodules",
      });
      await get().loadSubmodules();
    } catch (err) {
      console.error("Failed to init submodules:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "collaboration", false);
    }
  },

  updateSubmodules: async (paths, recursive = true) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "collaboration", true);
    set({ error: null });
    try {
      await commands.updateSubmodules(activeTabId, paths, recursive, {
        errorPrefix: "Failed to update submodules",
      });
      await get().loadSubmodules();
    } catch (err) {
      console.error("Failed to update submodules:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "collaboration", false);
    }
  },

  syncSubmodules: async (paths) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "collaboration", true);
    set({ error: null });
    try {
      await commands.syncSubmodules(activeTabId, paths, {
        errorPrefix: "Failed to sync submodules",
      });
      await get().loadSubmodules();
    } catch (err) {
      console.error("Failed to sync submodules:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "collaboration", false);
    }
  },

  addSubmodule: async (url, path) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "collaboration", true);
    set({ error: null });
    try {
      await commands.addSubmodule(activeTabId, url, path, {
        errorPrefix: "Failed to add submodule",
      });
      await get().loadSubmodules();
      await get().refreshAll();
    } catch (err) {
      console.error("Failed to add submodule:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "collaboration", false);
    }
  },

  cherryPickCommit: async (oid) => {
    const { activeTabId } = get();
    if (!activeTabId) throw new Error("No active repository");
    setLoading(get, set, "collaboration", true);
    set({ error: null });
    try {
      const res = await commands.cherryPickCommit(activeTabId, oid, {
        errorPrefix: "Cherry-pick failed",
      });
      // Targeted refresh: commits + status after cherry-pick
      await get().refreshCommitsAndStatus();
      return res as "success" | "conflicts";
    } catch (err) {
      console.error("Failed to cherry-pick:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "collaboration", false);
    }
  },

  cherryPickAbort: async () => {
    const { activeTabId } = get();
    if (!activeTabId) throw new Error("No active repository");
    setLoading(get, set, "collaboration", true);
    set({ error: null });
    try {
      await commands.cherryPickAbort(activeTabId, {
        errorPrefix: "Cherry-pick abort failed",
      });
      // Targeted refresh: commits + status after cherry-pick abort
      await get().refreshCommitsAndStatus();
    } catch (err) {
      console.error("Failed to abort cherry-pick:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "collaboration", false);
    }
  },

  revertCommit: async (oid) => {
    const { activeTabId } = get();
    if (!activeTabId) throw new Error("No active repository");
    setLoading(get, set, "collaboration", true);
    set({ error: null });
    try {
      const res = await commands.revertCommit(activeTabId, oid, {
        errorPrefix: "Revert failed",
      });
      // Targeted refresh: commits + status after revert
      await get().refreshCommitsAndStatus();
      return res as "success" | "conflicts";
    } catch (err) {
      console.error("Failed to revert commit:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "collaboration", false);
    }
  },

  revertAbort: async () => {
    const { activeTabId } = get();
    if (!activeTabId) throw new Error("No active repository");
    setLoading(get, set, "collaboration", true);
    set({ error: null });
    try {
      await commands.revertAbort(activeTabId, {
        errorPrefix: "Revert abort failed",
      });
      // Targeted refresh: commits + status after revert abort
      await get().refreshCommitsAndStatus();
    } catch (err) {
      console.error("Failed to abort revert:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "collaboration", false);
    }
  },

  resetToCommit: async (oid, mode) => {
    const { activeTabId } = get();
    if (!activeTabId) throw new Error("No active repository");
    setLoading(get, set, "collaboration", true);
    set({ error: null });
    try {
      await commands.resetToCommit(activeTabId, oid, mode, {
        errorPrefix: "Reset failed",
      });
      // Targeted refresh: commits + status after reset
      await get().refreshCommitsAndStatus();
    } catch (err) {
      console.error("Failed to reset to commit:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "collaboration", false);
    }
  },

  loadCommitTree: async (oid: string) => {
    const { activeTabId } = get();
    if (!activeTabId) return;
    setLoading(get, set, "diff", true);
    set({ commitTree: [], error: null });
    try {
      const tree = await commands.getCommitTree(activeTabId, oid, {
        silent: true,
      });
      set({ commitTree: tree });
    } catch (err) {
      console.error("Failed to load commit tree:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "diff", false);
    }
  },

  startComparison: async (base: string, target: string) => {
    const { activeTabId } = get();
    if (!activeTabId) return;
    setLoading(get, set, "diff", true);
    set({
      compareBase: base,
      compareTarget: target,
      compareDiff: [],
      selectedCompareFile: null,
      compareFileDiff: null,
      error: null,
    });
    try {
      const diffs = await commands.getCompareDiff(activeTabId, base, target, {
        silent: true,
      });
      set({ compareDiff: diffs });

      // Auto select first file if available
      if (diffs.length > 0) {
        const firstFile = diffs[0].newPath || diffs[0].oldPath;
        if (firstFile) {
          await get().selectCompareFile(firstFile);
        }
      }
    } catch (err) {
      console.error("Failed to load comparison diff:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "diff", false);
    }
  },

  selectCompareFile: async (filePath: string | null) => {
    set({ selectedCompareFile: filePath, compareFileDiff: null, error: null });
    if (!filePath) return;
    const { activeTabId, compareBase, compareTarget } = get();
    if (!activeTabId || !compareBase || !compareTarget) return;

    try {
      const diff = get().compareDiff.find(
        (d) => d.newPath === filePath || d.oldPath === filePath,
      );
      if (diff) {
        set({ compareFileDiff: diff });
      }
    } catch (err) {
      console.error("Failed to select compare file:", err);
      set({ error: String(err) });
      throw err;
    }
  },
});
