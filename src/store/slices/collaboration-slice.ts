import type { StateCreator } from "zustand";
import type { FileDiff, TreeEntryInfo } from "../../lib/git-types";
import * as commands from "../../lib/tauri-commands";
import { withActiveRepo, withLoading } from "../store-helpers";
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
  mergeBranch: (branchName: string) => Promise<commands.MergeOutcome>;
  abortMerge: () => Promise<void>;
  resolveConflict: (filePath: string) => Promise<void>;
  fetch: (remote: string) => Promise<void>;
  pull: (
    remote: string,
    branch: string,
    mode?: commands.PullMode | null,
  ) => Promise<commands.MergeOutcome>;
  push: (remote: string, branch: string, force: boolean) => Promise<void>;
  cherryPickCommit: (oid: string) => Promise<commands.MergeOutcome>;
  cherryPickAbort: () => Promise<void>;
  revertCommit: (oid: string) => Promise<commands.MergeOutcome>;
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
    await withActiveRepo(
      get,
      set,
      "branches",
      "Failed to checkout branch",
      async (activeTabId) => {
        await commands.checkoutBranch(activeTabId, branchName, {
          errorPrefix: "Failed to checkout branch",
        });
        set({ selectedFilePath: null, localDiff: null });
        // The working tree, HEAD and the worktree list's branch labels move;
        // stashes and remotes cannot.
        await get().refresh([
          "refs",
          "log",
          "repoInfo",
          "worktrees",
          "submodules",
        ]);
      },
    );
  },

  createBranch: async (name, startPoint = null) => {
    await withActiveRepo(
      get,
      set,
      "branches",
      "Failed to create branch",
      async (activeTabId) => {
        await commands.createBranch(activeTabId, name, startPoint, {
          errorPrefix: "Failed to create branch",
        });
        await get().refreshBranches();
      },
    );
  },

  deleteBranch: async (name, isRemote) => {
    await withActiveRepo(
      get,
      set,
      "branches",
      "Failed to delete branch",
      async (activeTabId) => {
        await commands.deleteBranch(activeTabId, name, isRemote, {
          errorPrefix: "Failed to delete branch",
        });
        await get().refreshBranches();
      },
    );
  },

  renameBranch: async (currentName, newName) => {
    await withActiveRepo(
      get,
      set,
      "branches",
      "Failed to rename branch",
      async (activeTabId) => {
        await commands.renameBranch(activeTabId, currentName, newName, {
          errorPrefix: "Failed to rename branch",
        });
        await get().refreshBranches();
      },
    );
  },

  deleteTag: async (name) => {
    await withActiveRepo(
      get,
      set,
      "collaboration",
      "Failed to delete tag",
      async (activeTabId) => {
        await commands.deleteTag(activeTabId, name, {
          errorPrefix: "Failed to delete tag",
        });
        await get().refreshBranches();
      },
    );
  },

  createTag: async (name, targetOid, message = null, force = false) => {
    await withActiveRepo(
      get,
      set,
      "collaboration",
      "Failed to create tag",
      async (activeTabId) => {
        await commands.createTag(activeTabId, name, targetOid, message, force, {
          errorPrefix: "Failed to create tag",
        });
        await get().refreshBranches();
      },
    );
  },

  pushTag: async (remote, tagName) => {
    await withActiveRepo(
      get,
      set,
      "collaboration",
      "Failed to push tag",
      async (activeTabId) => {
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
    await withActiveRepo(
      get,
      set,
      "collaboration",
      "Failed to abort merge",
      async (activeTabId) => {
        await commands.abortMerge(activeTabId, {
          errorPrefix: "Failed to abort merge",
        });
        await get().refreshCommitsAndStatus();
      },
    );
  },

  resolveConflict: async (filePath) => {
    await withActiveRepo(
      get,
      set,
      "collaboration",
      "Failed to resolve conflict",
      async (activeTabId) => {
        await commands.resolveConflict(activeTabId, filePath, {
          errorPrefix: "Failed to resolve conflict",
        });
        await get().refreshStatus();
      },
    );
  },

  fetch: async (remote) => {
    await withActiveRepo(
      get,
      set,
      "collaboration",
      "Fetch failed",
      async (activeTabId) => {
        await commands.fetch(activeTabId, remote, {
          errorPrefix: "Fetch failed",
        });
        // Only remote-tracking refs move.
        await get().refresh(["refs", "log"]);
      },
    );
  },

  pull: async (remote, branch, mode = null) => {
    const { activeTabId } = get();
    if (!activeTabId) return "conflicts";

    return await withLoading(
      get,
      set,
      "collaboration",
      "Pull failed",
      async () => {
        const result = await commands.pull(activeTabId, remote, branch, mode, {
          errorPrefix: "Pull failed",
        });
        // HEAD and the working tree move, and a conflicted pull changes the
        // repository state.
        await get().refresh(["refs", "log", "repoInfo", "submodules"]);
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
    // `branch` is the local branch; the backend pushes it to its upstream when
    // that upstream is on `remote`, so the lease has to read the same
    // tracking ref — not `<remote>/<local name>`, which differs whenever the
    // upstream has another name.
    const upstream = branches.find(
      (b) => !b.isRemote && b.name === branch,
    )?.upstream;
    const trackingName =
      upstream?.startsWith(`${remote}/`) === true
        ? upstream
        : `${remote}/${branch}`;
    const expectedRemoteOid =
      branches.find((b) => b.isRemote && b.name === trackingName)?.oid ?? null;

    await withLoading(get, set, "collaboration", "Push failed", async () => {
      await commands.push(
        activeTabId,
        remote,
        branch,
        force,
        expectedRemoteOid,
        { errorPrefix: "Push failed" },
      );
      // Only the remote-tracking ref (and possibly the upstream) moves.
      await get().refresh(["refs", "log"]);
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
        return res;
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
        return res;
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
        // The root folder only; CommitDetail fetches deeper folders as they
        // are expanded.
        const tree = await commands.getCommitTree(activeTabId, oid, "", {
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
