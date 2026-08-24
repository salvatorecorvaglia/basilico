import type { StateCreator } from "zustand";
import type { FileDiff, TreeEntryInfo } from "../../lib/git-types";
import * as commands from "../../lib/tauri-commands";
import { withLoading } from "../store-helpers";
import type { RepoState } from "../types";

export interface CollaborationSlice {
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
  commitTree: [],
  compareDiff: [],
  compareBase: null,
  compareTarget: null,
  selectedCompareFile: null,
  compareFileDiff: null,

  // All actions below now use withLoading() to eliminate boilerplate

  checkoutBranch: async (branchName) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    await withLoading(
      get,
      set,
      "branches",
      "Failed to checkout branch",
      async () => {
        await commands.checkoutBranch(activeTabId, branchName, {
          errorPrefix: "Failed to checkout branch",
        });
        set({ selectedFilePath: null, localDiff: null });
        await get().refreshAll();
      },
    );
  },

  createBranch: async (name, startPoint = null) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    await withLoading(
      get,
      set,
      "branches",
      "Failed to create branch",
      async () => {
        await commands.createBranch(activeTabId, name, startPoint, {
          errorPrefix: "Failed to create branch",
        });
        await get().refreshBranches();
      },
    );
  },

  deleteBranch: async (name, isRemote) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    await withLoading(
      get,
      set,
      "branches",
      "Failed to delete branch",
      async () => {
        await commands.deleteBranch(activeTabId, name, isRemote, {
          errorPrefix: "Failed to delete branch",
        });
        await get().refreshBranches();
      },
    );
  },

  renameBranch: async (currentName, newName) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    await withLoading(
      get,
      set,
      "branches",
      "Failed to rename branch",
      async () => {
        await commands.renameBranch(activeTabId, currentName, newName, {
          errorPrefix: "Failed to rename branch",
        });
        await get().refreshBranches();
      },
    );
  },

  deleteTag: async (name) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    await withLoading(
      get,
      set,
      "collaboration",
      "Failed to delete tag",
      async () => {
        await commands.deleteTag(activeTabId, name, {
          errorPrefix: "Failed to delete tag",
        });
        await get().refreshBranches();
      },
    );
  },

  createTag: async (name, targetOid, message = null, force = false) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    await withLoading(
      get,
      set,
      "collaboration",
      "Failed to create tag",
      async () => {
        await commands.createTag(activeTabId, name, targetOid, message, force, {
          errorPrefix: "Failed to create tag",
        });
        await get().refreshBranches();
      },
    );
  },

  pushTag: async (remote, tagName) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    await withLoading(
      get,
      set,
      "collaboration",
      "Failed to push tag",
      async () => {
        await commands.pushTag(activeTabId, remote, tagName, {
          errorPrefix: "Failed to push tag",
        });
        await get().refreshBranches();
      },
    );
  },

  mergeBranch: async (branchName) => {
    const { activeTabId } = get();
    if (!activeTabId) return "conflicts";

    return await withLoading(
      get,
      set,
      "collaboration",
      "Failed to merge branch",
      async () => {
        const result = await commands.mergeBranch(activeTabId, branchName, {
          errorPrefix: "Failed to merge",
        });
        await get().refreshCommitsAndStatus();
        return result;
      },
    );
  },

  abortMerge: async () => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    await withLoading(
      get,
      set,
      "collaboration",
      "Failed to abort merge",
      async () => {
        await commands.abortMerge(activeTabId, {
          errorPrefix: "Failed to abort merge",
        });
        await get().refreshCommitsAndStatus();
      },
    );
  },

  resolveConflict: async (filePath) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    await withLoading(
      get,
      set,
      "collaboration",
      "Failed to resolve conflict",
      async () => {
        await commands.resolveConflict(activeTabId, filePath, {
          errorPrefix: "Failed to resolve conflict",
        });
        await get().refreshStatus();
      },
    );
  },

  fetch: async (remote) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    await withLoading(get, set, "collaboration", "Fetch failed", async () => {
      await commands.fetch(activeTabId, remote, {
        errorPrefix: "Fetch failed",
      });
      await get().refreshAll();
    });
  },

  pull: async (remote, branch) => {
    const { activeTabId } = get();
    if (!activeTabId) return "conflicts";

    return await withLoading(
      get,
      set,
      "collaboration",
      "Pull failed",
      async () => {
        const result = await commands.pull(activeTabId, remote, branch, {
          errorPrefix: "Pull failed",
        });
        await get().refreshAll();
        return result;
      },
    );
  },

  push: async (remote, branch, force) => {
    const { activeTabId, branches } = get();
    if (!activeTabId) return;

    // The remote-tracking tip as currently known to the UI. Passing it lets the
    // backend detect that someone else pushed since our last fetch and refuse a
    // force push that would discard their commits.
    const expectedRemoteOid =
      branches.find((b) => b.isRemote && b.name === `${remote}/${branch}`)
        ?.oid ?? null;

    await withLoading(get, set, "collaboration", "Push failed", async () => {
      await commands.push(
        activeTabId,
        remote,
        branch,
        force,
        expectedRemoteOid,
        { errorPrefix: "Push failed" },
      );
      await get().refreshAll();
    });
  },

  cherryPickCommit: async (oid) => {
    const { activeTabId } = get();
    if (!activeTabId) throw new Error("No active repository");

    return await withLoading(
      get,
      set,
      "collaboration",
      "Cherry-pick failed",
      async () => {
        const res = await commands.cherryPickCommit(activeTabId, oid, {
          errorPrefix: "Cherry-pick failed",
        });
        await get().refreshCommitsAndStatus();
        return res as "success" | "conflicts";
      },
    );
  },

  cherryPickAbort: async () => {
    const { activeTabId } = get();
    if (!activeTabId) throw new Error("No active repository");

    await withLoading(
      get,
      set,
      "collaboration",
      "Cherry-pick abort failed",
      async () => {
        await commands.cherryPickAbort(activeTabId, {
          errorPrefix: "Cherry-pick abort failed",
        });
        await get().refreshCommitsAndStatus();
      },
    );
  },

  revertCommit: async (oid) => {
    const { activeTabId } = get();
    if (!activeTabId) throw new Error("No active repository");

    return await withLoading(
      get,
      set,
      "collaboration",
      "Revert failed",
      async () => {
        const res = await commands.revertCommit(activeTabId, oid, {
          errorPrefix: "Revert failed",
        });
        await get().refreshCommitsAndStatus();
        return res as "success" | "conflicts";
      },
    );
  },

  revertAbort: async () => {
    const { activeTabId } = get();
    if (!activeTabId) throw new Error("No active repository");

    await withLoading(
      get,
      set,
      "collaboration",
      "Revert abort failed",
      async () => {
        await commands.revertAbort(activeTabId, {
          errorPrefix: "Revert abort failed",
        });
        await get().refreshCommitsAndStatus();
      },
    );
  },

  resetToCommit: async (oid, mode) => {
    const { activeTabId } = get();
    if (!activeTabId) throw new Error("No active repository");

    await withLoading(get, set, "collaboration", "Reset failed", async () => {
      await commands.resetToCommit(activeTabId, oid, mode, {
        errorPrefix: "Reset failed",
      });
      await get().refreshCommitsAndStatus();
    });
  },

  loadCommitTree: async (oid: string) => {
    const { activeTabId, refreshGeneration } = get();
    if (!activeTabId) return;

    await withLoading(
      get,
      set,
      "diff",
      "Failed to load commit tree",
      async () => {
        set({ commitTree: [] });
        const tree = await commands.getCommitTree(activeTabId, oid, {
          silent: true,
        });
        // Guard: only apply if still the same tab and this commit is still selected
        if (
          get().refreshGeneration === refreshGeneration &&
          get().selectedCommitOid === oid
        ) {
          set({ commitTree: tree });
        }
      },
    );
  },

  startComparison: async (base: string, target: string) => {
    const { activeTabId, refreshGeneration } = get();
    if (!activeTabId) return;

    await withLoading(
      get,
      set,
      "diff",
      "Failed to load comparison diff",
      async () => {
        set({
          compareBase: base,
          compareTarget: target,
          compareDiff: [],
          selectedCompareFile: null,
          compareFileDiff: null,
        });
        const diffs = await commands.getCompareDiff(activeTabId, base, target, {
          silent: true,
        });
        // Guard: only apply if still the same tab and comparison is still current
        if (
          get().refreshGeneration !== refreshGeneration ||
          get().compareBase !== base ||
          get().compareTarget !== target
        ) {
          return;
        }
        set({ compareDiff: diffs });

        // Auto select first file if available
        if (diffs.length > 0) {
          const firstFile = diffs[0].newPath || diffs[0].oldPath;
          if (firstFile) {
            await get().selectCompareFile(firstFile);
          }
        }
      },
    );
  },

  selectCompareFile: async (filePath: string | null) => {
    set({ selectedCompareFile: filePath, compareFileDiff: null });
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
      throw err;
    }
  },
});
