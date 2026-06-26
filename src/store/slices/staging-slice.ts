import type { StateCreator } from "zustand";
import type { ConflictStages, FileDiff, StashInfo } from "../../lib/git-types";
import * as commands from "../../lib/tauri-commands";
import type { RepoState } from "../types";

/** Helper to update a single loading domain flag */
function setLoading(
  get: () => RepoState,
  set: (s: Partial<RepoState>) => void,
  domain: keyof RepoState["loadingStates"],
  value: boolean,
) {
  set({ loadingStates: { ...get().loadingStates, [domain]: value } });
}

export interface StagingSlice {
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

  selectLocalFile: (path: string | null, isStaged: boolean) => Promise<void>;
  stageFiles: (files: string[]) => Promise<void>;
  unstageFiles: (files: string[]) => Promise<void>;
  discardChanges: (files: string[]) => Promise<void>;
  applyPatch: (
    patch: string,
    location: "index" | "workdir" | "both",
  ) => Promise<void>;
  commit: (message: string, amend?: boolean) => Promise<void>;
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
}

export const createStagingSlice: StateCreator<
  RepoState,
  [],
  [],
  StagingSlice
> = (set, get) => ({
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

  selectLocalFile: async (path, isStaged) => {
    set({
      selectedFilePath: path,
      selectedFileIsStaged: isStaged,
      localDiff: null,
      error: null,
    });
    if (!path) return;

    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "diff", true);
    try {
      const diff = await commands.getFileDiff(activeTabId, path, isStaged, {
        silent: true,
      });
      set({ localDiff: diff });
    } catch (err) {
      console.error("Failed to load local file diff:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "diff", false);
    }
  },

  stageFiles: async (files) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "staging", true);
    set({ error: null });
    try {
      await commands.stageFiles(activeTabId, files, {
        errorPrefix: "Failed to stage files",
      });
      await get().refreshAll();

      // Refresh current diff if it's selected
      const { selectedFilePath } = get();
      if (selectedFilePath && files.includes(selectedFilePath)) {
        await get().selectLocalFile(selectedFilePath, true);
      }
    } catch (err) {
      console.error("Failed to stage files:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "staging", false);
    }
  },

  unstageFiles: async (files) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "staging", true);
    set({ error: null });
    try {
      await commands.unstageFiles(activeTabId, files, {
        errorPrefix: "Failed to unstage files",
      });
      await get().refreshAll();

      // Refresh current diff if it's selected
      const { selectedFilePath } = get();
      if (selectedFilePath && files.includes(selectedFilePath)) {
        await get().selectLocalFile(selectedFilePath, false);
      }
    } catch (err) {
      console.error("Failed to unstage files:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "staging", false);
    }
  },

  discardChanges: async (files) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "staging", true);
    set({ error: null });
    try {
      await commands.discardChanges(activeTabId, files, {
        errorPrefix: "Failed to discard changes",
      });

      // Reset selected file if discarded
      const { selectedFilePath } = get();
      if (selectedFilePath && files.includes(selectedFilePath)) {
        set({ selectedFilePath: null, localDiff: null });
      }

      await get().refreshAll();
    } catch (err) {
      console.error("Failed to discard changes:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "staging", false);
    }
  },

  applyPatch: async (patch, location) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "staging", true);
    set({ error: null });
    try {
      await commands.applyPatch(activeTabId, patch, location, {
        errorPrefix: "Failed to apply patch",
      });
      await get().refreshAll();

      // Refresh current diff if one is selected
      const { selectedFilePath, selectedFileIsStaged } = get();
      if (selectedFilePath) {
        await get().selectLocalFile(selectedFilePath, selectedFileIsStaged);
      }
    } catch (err) {
      console.error("Failed to apply patch:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "staging", false);
    }
  },

  commit: async (message, amend = false) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "staging", true);
    set({ error: null });
    try {
      await commands.createCommit(activeTabId, message, null, null, amend, {
        errorPrefix: "Failed to commit",
      });
      set({ selectedFilePath: null, localDiff: null });
      await get().refreshAll();
    } catch (err) {
      console.error("Failed to commit:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "staging", false);
    }
  },

  loadStashes: async () => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    try {
      const list = await commands.listStashes(activeTabId, { silent: true });
      set({ stashes: list });
    } catch (err) {
      console.error("Failed to load stashes:", err);
      set({ error: String(err) });
    }
  },

  saveStash: async (message, includeUntracked) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "stashes", true);
    set({ error: null });
    try {
      await commands.saveStash(activeTabId, message, includeUntracked, {
        errorPrefix: "Failed to save stash",
      });
      await get().refreshAll();
    } catch (err) {
      console.error("Failed to save stash:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "stashes", false);
    }
  },

  applyStash: async (index) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "stashes", true);
    set({ error: null });
    try {
      await commands.applyStash(activeTabId, index, {
        errorPrefix: "Failed to apply stash",
      });
      await get().refreshAll();
    } catch (err) {
      console.error("Failed to apply stash:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "stashes", false);
    }
  },

  popStash: async (index) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "stashes", true);
    set({ error: null });
    try {
      await commands.popStash(activeTabId, index, {
        errorPrefix: "Failed to pop stash",
      });
      await get().refreshAll();
    } catch (err) {
      console.error("Failed to pop stash:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "stashes", false);
    }
  },

  dropStash: async (index) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "stashes", true);
    set({ error: null });
    try {
      await commands.dropStash(activeTabId, index, {
        errorPrefix: "Failed to drop stash",
      });
      await get().refreshAll();
    } catch (err) {
      console.error("Failed to drop stash:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "stashes", false);
    }
  },

  loadStashDetail: async (index) => {
    const { activeTabId, stashes } = get();
    if (!activeTabId) return;

    setLoading(get, set, "stashes", true);
    set({
      selectedStashIndex: index,
      stashDiff: [],
      selectedStashFile: null,
      selectedStashFileDiff: null,
      error: null,
    });
    try {
      const stash = stashes.find((s) => s.index === index);
      if (!stash) {
        throw new Error(`Stash at index ${index} not found`);
      }
      const diff = await commands.getStashDiff(activeTabId, stash.oid, {
        silent: true,
      });
      set({ stashDiff: diff });

      // Automatically select first file
      if (diff.length > 0) {
        const firstFile = diff[0].newPath || diff[0].oldPath;
        if (firstFile) {
          await get().selectStashFile(firstFile);
        }
      }
    } catch (err) {
      console.error("Failed to load stash diff:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "stashes", false);
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

    setLoading(get, set, "stashes", true);
    set({ error: null });
    try {
      const stash = stashes.find((s) => s.index === index);
      if (!stash) {
        throw new Error(`Stash at index ${index} not found`);
      }

      // 1. Create a branch from stash parent (stash.oid + "^1")
      await commands.createBranch(activeTabId, branchName, `${stash.oid}^1`, {
        errorPrefix: "Failed to branch from stash",
      });

      // 2. Checkout that new branch
      await get().checkoutBranch(branchName);

      // 3. Pop the stash (applies to workspace and drops)
      await commands.popStash(activeTabId, index, {
        errorPrefix: "Failed to pop stash",
      });

      await get().refreshAll();
    } catch (err) {
      console.error("Failed to create branch from stash:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "stashes", false);
    }
  },

  loadConflictStages: async (filePath: string) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "staging", true);
    set({
      conflictStages: null,
      activeConflictedPath: filePath,
      error: null,
    });
    try {
      const stages = await commands.getConflictStages(activeTabId, filePath, {
        silent: true,
      });
      set({ conflictStages: stages });
    } catch (err) {
      console.error("Failed to load conflict stages:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "staging", false);
    }
  },

  resolveConflictStages: async (filePath: string, mergedContent: string) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "staging", true);
    set({ error: null });
    try {
      await commands.saveMergedResolution(
        activeTabId,
        filePath,
        mergedContent,
        { errorPrefix: "Failed to resolve conflict" },
      );
      set({ conflictStages: null, activeConflictedPath: null });
      await get().refreshAll();
    } catch (err) {
      console.error("Failed to resolve conflict:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "staging", false);
    }
  },
});
