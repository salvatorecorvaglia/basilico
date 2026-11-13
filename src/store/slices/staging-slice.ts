import type { StateCreator } from "zustand";
import type { ConflictStages, FileDiff, StashInfo } from "../../lib/git-types";
import * as commands from "../../lib/tauri-commands";
import {
  beginLoading,
  beginRequest,
  withActiveRepo,
  withLoading,
} from "../store-helpers";
import type { RepoState } from "../types";

export interface StagingSlice {
  commitDrafts: Record<string, { title: string; body: string }>;
  stashes: StashInfo[];
  selectedStashIndex: number | null;
  stashDiff: FileDiff[];
  selectedStashFile: string | null;
  selectedStashFileDiff: FileDiff | null;
  selectedFilePath: string | null;
  selectedFileIsStaged: boolean;
  localDiff: FileDiff | null;
  conflictStages: ConflictStages | null;
  activeConflictedPath: string | null;

  selectFileForBlame: (path: string) => void;
  selectLocalFile: (path: string | null, isStaged: boolean) => Promise<void>;
  stageFiles: (files: string[]) => Promise<void>;
  unstageFiles: (files: string[]) => Promise<void>;
  discardChanges: (files: string[]) => Promise<void>;
  applyPatch: (
    patch: string,
    location: "index" | "workdir" | "both",
  ) => Promise<void>;
  commit: (
    message: string,
    amend?: boolean,
    expectedHeadOid?: string,
  ) => Promise<void>;
  loadStashes: () => Promise<void>;
  saveStash: (message: string, includeUntracked: boolean) => Promise<void>;
  applyStash: (index: number) => Promise<void>;
  popStash: (index: number) => Promise<void>;
  dropStash: (index: number) => Promise<void>;
  loadStashDetail: (index: number) => Promise<void>;
  selectStashFile: (filePath: string | null) => Promise<void>;
  createBranchFromStash: (index: number, branchName: string) => Promise<void>;
  loadConflictStages: (filePath: string) => Promise<void>;
  resolveConflictStages: (
    filePath: string,
    mergedContent: string,
  ) => Promise<void>;
  resolveConflictWithSide: (
    filePath: string,
    side: "ours" | "theirs",
  ) => Promise<void>;
}

/**
 * The OID the UI believes sits at `index`, so the backend can detect a shifted
 * stash list and refuse to act on the wrong entry.
 */
function stashOidAt(get: () => RepoState, index: number): string | null {
  return get().stashes.find((s) => s.index === index)?.oid ?? null;
}

export const createStagingSlice: StateCreator<
  RepoState,
  [],
  [],
  StagingSlice
> = (set, get) => ({
  commitDrafts: {},
  stashes: [],
  selectedStashIndex: null,
  stashDiff: [],
  selectedStashFile: null,
  selectedStashFileDiff: null,
  selectedFilePath: null,
  selectedFileIsStaged: false,
  localDiff: null,
  conflictStages: null,
  activeConflictedPath: null,

  selectFileForBlame: (path) => {
    beginRequest(get, "localDiff");
    beginRequest(get, "blameLines");
    set({
      selectedFilePath: path,
      selectedFileIsStaged: false,
      localDiff: null,
      blameLines: [],
    });
  },

  selectLocalFile: async (path, isStaged) => {
    const request = beginRequest(get, "localDiff");
    set({
      selectedFilePath: path,
      selectedFileIsStaged: isStaged,
      localDiff: null,
    });
    if (!path) return;

    const { activeTabId } = get();
    if (!activeTabId) return;

    const finishLoading = beginLoading(get, set, "diff");
    try {
      const diff = await commands.getFileDiff(activeTabId, path, isStaged, {
        silent: true,
      });
      // Guard: only apply if still the same tab and the same file is still selected
      if (
        request.isCurrent() &&
        get().selectedFilePath === path &&
        get().selectedFileIsStaged === isStaged
      ) {
        set({ localDiff: diff });
      }
    } catch (err) {
      if (!request.isCurrent()) return;
      console.error("Failed to load local file diff:", err);
      throw err;
    } finally {
      finishLoading();
    }
  },

  stageFiles: async (files) => {
    await withActiveRepo(
      get,
      set,
      "staging",
      "Failed to stage files",
      async (activeTabId, context) => {
        await commands.stageFiles(activeTabId, files, {
          errorPrefix: "Failed to stage files",
        });
        if (!context.isCurrent()) return;

        // Targeted refresh: only status needed after staging
        await get().refreshStatus();
        if (!context.isCurrent()) return;

        // Refresh current diff if it's selected
        const { selectedFilePath } = get();
        if (selectedFilePath && files.includes(selectedFilePath)) {
          await get().selectLocalFile(selectedFilePath, true);
          if (!context.isCurrent()) return;
        }
      },
    );
  },

  unstageFiles: async (files) => {
    await withActiveRepo(
      get,
      set,
      "staging",
      "Failed to unstage files",
      async (activeTabId, context) => {
        await commands.unstageFiles(activeTabId, files, {
          errorPrefix: "Failed to unstage files",
        });
        if (!context.isCurrent()) return;

        // Targeted refresh: only status needed after unstaging
        await get().refreshStatus();
        if (!context.isCurrent()) return;

        // Refresh current diff if it's selected
        const { selectedFilePath } = get();
        if (selectedFilePath && files.includes(selectedFilePath)) {
          await get().selectLocalFile(selectedFilePath, false);
          if (!context.isCurrent()) return;
        }
      },
    );
  },

  discardChanges: async (files) => {
    await withActiveRepo(
      get,
      set,
      "staging",
      "Failed to discard changes",
      async (activeTabId, context) => {
        await commands.discardChanges(activeTabId, files, {
          errorPrefix: "Failed to discard changes",
        });
        if (!context.isCurrent()) return;

        // Reset selected file if discarded
        const { selectedFilePath } = get();
        if (selectedFilePath && files.includes(selectedFilePath)) {
          set({ selectedFilePath: null, localDiff: null });
        }

        // Targeted refresh: only status needed after discard
        await get().refreshStatus();
        if (!context.isCurrent()) return;
      },
    );
  },

  applyPatch: async (patch, location) => {
    await withActiveRepo(
      get,
      set,
      "staging",
      "Failed to apply patch",
      async (activeTabId, context) => {
        await commands.applyPatch(activeTabId, patch, location, {
          errorPrefix: "Failed to apply patch",
        });
        if (!context.isCurrent()) return;

        // Targeted refresh: only status needed after patch
        await get().refreshStatus();
        if (!context.isCurrent()) return;

        // Refresh current diff if one is selected
        const { selectedFilePath, selectedFileIsStaged } = get();
        if (selectedFilePath) {
          await get().selectLocalFile(selectedFilePath, selectedFileIsStaged);
          if (!context.isCurrent()) return;
        }
      },
    );
  },

  commit: async (message, amend = false, expectedHeadOid) => {
    const { activeTabId, settings } = get();
    if (!activeTabId) return;

    await withLoading(
      get,
      set,
      "staging",
      "Failed to commit",
      async (context) => {
        if (amend) {
          if (!expectedHeadOid)
            throw new Error("Reload the commit message before amending.");
          await commands.amendCommit(
            activeTabId,
            message,
            settings?.gitAuthorName || null,
            settings?.gitAuthorEmail || null,
            settings?.bypassHooks || false,
            expectedHeadOid,
            { errorPrefix: "Failed to amend" },
          );
          if (!context.isCurrent()) return;
        } else
          await commands.createCommit(
            activeTabId,
            message,
            settings?.gitAuthorName || null,
            settings?.gitAuthorEmail || null,
            amend,
            settings?.bypassHooks || false,
            {
              errorPrefix: "Failed to commit",
            },
          );
        if (context.isCurrent()) {
          set({ selectedFilePath: null, localDiff: null });
          // Targeted refresh: commits + status after commit
          await get().refreshCommitsAndStatus();
          if (!context.isCurrent()) return;
        }
      },
    );
  },

  loadStashes: async () => {
    const request = beginRequest(get, "stashes");
    const { activeTabId } = get();
    if (!activeTabId) return;

    try {
      const list = await commands.listStashes(activeTabId, { silent: true });
      if (request.isCurrent()) set({ stashes: list });
    } catch (err) {
      if (!request.isCurrent()) return;
      console.error("Failed to load stashes:", err);
    }
  },

  saveStash: async (message, includeUntracked) => {
    await withActiveRepo(
      get,
      set,
      "stashes",
      "Failed to save stash",
      async (activeTabId, context) => {
        await commands.saveStash(activeTabId, message, includeUntracked, {
          errorPrefix: "Failed to save stash",
        });
        if (!context.isCurrent()) return;

        // Targeted refresh: commits + status after stash save
        await get().refreshCommitsAndStatus();
        if (!context.isCurrent()) return;

        await get().loadStashes();
        if (!context.isCurrent()) return;
      },
    );
  },

  applyStash: async (index) => {
    await withActiveRepo(
      get,
      set,
      "stashes",
      "Failed to apply stash",
      async (activeTabId, context) => {
        await commands.applyStash(activeTabId, index, stashOidAt(get, index), {
          errorPrefix: "Failed to apply stash",
        });
        if (!context.isCurrent()) return;

        // Targeted refresh: commits + status after stash apply
        await get().refreshCommitsAndStatus();
        if (!context.isCurrent()) return;

        await get().loadStashes();
        if (!context.isCurrent()) return;
      },
    );
  },

  popStash: async (index) => {
    await withActiveRepo(
      get,
      set,
      "stashes",
      "Failed to pop stash",
      async (activeTabId, context) => {
        await commands.popStash(activeTabId, index, stashOidAt(get, index), {
          errorPrefix: "Failed to pop stash",
        });
        if (!context.isCurrent()) return;

        // Targeted refresh: commits + status after stash pop
        await get().refreshCommitsAndStatus();
        if (!context.isCurrent()) return;

        await get().loadStashes();
        if (!context.isCurrent()) return;
      },
    );
  },

  dropStash: async (index) => {
    await withActiveRepo(
      get,
      set,
      "stashes",
      "Failed to drop stash",
      async (activeTabId, context) => {
        await commands.dropStash(activeTabId, index, stashOidAt(get, index), {
          errorPrefix: "Failed to drop stash",
        });
        if (!context.isCurrent()) return;

        // Targeted refresh: commits + status after stash drop
        await get().refreshCommitsAndStatus();
        if (!context.isCurrent()) return;

        await get().loadStashes();
        if (!context.isCurrent()) return;
      },
    );
  },

  loadStashDetail: async (index) => {
    const request = beginRequest(get, "stashDiff");
    const { activeTabId, stashes } = get();
    if (!activeTabId) return;

    const finishLoading = beginLoading(get, set, "stashes");
    set({
      selectedStashIndex: index,
      stashDiff: [],
      selectedStashFile: null,
      selectedStashFileDiff: null,
    });
    try {
      const stash = stashes.find((s) => s.index === index);
      if (!stash) {
        throw new Error(`Stash at index ${index} not found`);
      }
      const diff = await commands.getStashDiff(activeTabId, stash.oid, {
        silent: true,
      });
      // Guard: only apply if still the same tab and the same stash is still selected
      if (!request.isCurrent() || get().selectedStashIndex !== index) {
        return;
      }
      set({ stashDiff: diff });

      // Automatically select first file
      if (diff.length > 0) {
        const firstFile = diff[0].newPath || diff[0].oldPath;
        if (firstFile) {
          await get().selectStashFile(firstFile);
        }
      }
    } catch (err) {
      if (!request.isCurrent()) return;
      console.error("Failed to load stash diff:", err);
      throw err;
    } finally {
      finishLoading();
    }
  },

  selectStashFile: async (filePath) => {
    set({ selectedStashFile: filePath, selectedStashFileDiff: null });
    if (!filePath) return;

    const diff = get().stashDiff.find(
      (d) => d.newPath === filePath || d.oldPath === filePath,
    );
    if (diff) {
      set({ selectedStashFileDiff: diff });
    }
  },

  createBranchFromStash: async (index, branchName) => {
    const { activeTabId, stashes } = get();
    if (!activeTabId) return;

    await withLoading(
      get,
      set,
      "stashes",
      "Failed to create branch from stash",
      async (context) => {
        const stash = stashes.find((s) => s.index === index);
        if (!stash) {
          throw new Error(`Stash at index ${index} not found`);
        }

        try {
          await commands.branchFromStash(activeTabId, branchName, stash.oid, {
            errorPrefix: "Failed to branch from stash",
          });
          if (!context.isCurrent()) return;
        } finally {
          // Even a conflicted application can have created and checked out the branch.
          // Refresh only if the user is still looking at the original repository.
          if (context.isCurrent()) {
            await get().refresh(["refs", "log", "repoInfo", "stashes"]);
          }
        }
        if (context.isCurrent()) {
        }
      },
    );
  },

  loadConflictStages: async (filePath: string) => {
    const request = beginRequest(get, "conflictStages");
    const { activeTabId } = get();
    if (!activeTabId) return;

    const finishLoading = beginLoading(get, set, "staging");
    set({
      conflictStages: null,
      activeConflictedPath: filePath,
    });
    try {
      const stages = await commands.getConflictStages(activeTabId, filePath, {
        silent: true,
      });
      // Guard: only apply if still the same tab and the same file is still active
      if (request.isCurrent() && get().activeConflictedPath === filePath) {
        set({ conflictStages: stages });
      }
    } catch (err) {
      if (!request.isCurrent()) return;
      console.error("Failed to load conflict stages:", err);
      throw err;
    } finally {
      finishLoading();
    }
  },

  resolveConflictStages: async (filePath: string, mergedContent: string) => {
    await withActiveRepo(
      get,
      set,
      "staging",
      "Failed to resolve conflict",
      async (activeTabId, context) => {
        await commands.saveMergedResolution(
          activeTabId,
          filePath,
          mergedContent,
          { errorPrefix: "Failed to resolve conflict" },
        );
        if (!context.isCurrent()) return;

        set({ conflictStages: null, activeConflictedPath: null });
        await get().refreshStatus();
        if (!context.isCurrent()) return;
      },
    );
  },

  resolveConflictWithSide: async (
    filePath: string,
    side: "ours" | "theirs",
  ) => {
    await withActiveRepo(
      get,
      set,
      "staging",
      `Failed to resolve conflict using ${side}`,
      async (activeTabId, context) => {
        // Resolved in the backend rather than by round-tripping the stage
        // through the renderer: the text path decoded blobs as UTF-8, which
        // corrupted binary files, and wrote an empty file when the chosen
        // side had deleted it.
        await commands.resolveConflictSide(activeTabId, filePath, side, {
          errorPrefix: `Failed to resolve conflict using ${side}`,
        });
        if (!context.isCurrent()) return;

        set({ conflictStages: null, activeConflictedPath: null });
        await get().refreshStatus();
        if (!context.isCurrent()) return;
      },
    );
  },
});
