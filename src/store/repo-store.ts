/* ═══════════════════════════════════════════════════════
   Basilico — Repository Store
   Per-tab repository state management
   ═══════════════════════════════════════════════════════ */

import { create } from 'zustand';
import type {
  RepoTab,
  RepoInfo,
  RepoStatus,
  BranchInfo,
  TagInfo,
  RemoteInfo,
  GraphCommit,
  FileDiff,
  BlameLine,
  FileHistoryEntry,
  ReflogEntry,
  StashInfo,
  RebaseTodoItem,
  RebaseStatus,
  BisectState,
  GrepMatch,
} from '../lib/git-types';
import * as commands from '../lib/tauri-commands';

interface RepoState {
  // Tabs
  tabs: RepoTab[];
  activeTabId: string | null;

  // Active repo data
  repoInfo: RepoInfo | null;
  status: RepoStatus | null;
  branches: BranchInfo[];
  tags: TagInfo[];
  remotes: RemoteInfo[];
  commits: GraphCommit[];

  // Selected commit
  selectedCommitOid: string | null;
  commitDiff: FileDiff[];

  // Phase 3 State
  blameLines: BlameLine[];
  fileHistory: FileHistoryEntry[];
  reflogEntries: ReflogEntry[];
  stashes: StashInfo[];

  // Staging area & local diffs
  selectedFilePath: string | null;
  selectedFileIsStaged: boolean;
  localDiff: FileDiff | null;

  // Loading states
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;

  // Actions
  openRepository: (path: string) => Promise<void>;
  closeTab: (tabId: string) => void;
  switchTab: (tabId: string) => void;
  refreshStatus: () => Promise<void>;
  refreshAll: () => Promise<void>;
  selectCommit: (oid: string | null) => Promise<void>;
  loadMoreCommits: (count: number) => Promise<void>;
  
  // Staging & Local Diff Actions
  selectLocalFile: (path: string | null, isStaged: boolean) => Promise<void>;
  stageFiles: (files: string[]) => Promise<void>;
  unstageFiles: (files: string[]) => Promise<void>;
  discardChanges: (files: string[]) => Promise<void>;
  applyPatch: (patch: string, location: 'index' | 'workdir' | 'both') => Promise<void>;

  // Commit Actions
  commit: (message: string, amend?: boolean) => Promise<void>;

  // Branch Actions
  checkoutBranch: (branchName: string) => Promise<void>;
  createBranch: (name: string, startPoint?: string | null) => Promise<void>;
  deleteBranch: (name: string, isRemote: boolean) => Promise<void>;
  renameBranch: (currentName: string, newName: string) => Promise<void>;

  // Tag Actions
  deleteTag: (name: string) => Promise<void>;
  createTag: (name: string, targetOid: string, message?: string | null, force?: boolean) => Promise<void>;
  pushTag: (remote: string, tagName: string) => Promise<void>;

  // Phase 3 Actions
  loadFileBlame: (filePath: string, commitOid?: string | null) => Promise<void>;
  loadFileHistory: (filePath: string) => Promise<void>;
  loadReflog: () => Promise<void>;
  loadStashes: () => Promise<void>;
  saveStash: (message: string, includeUntracked: boolean) => Promise<void>;
  applyStash: (index: number) => Promise<void>;
  popStash: (index: number) => Promise<void>;
  dropStash: (index: number) => Promise<void>;

  // Merge Actions
  mergeBranch: (branchName: string) => Promise<'success' | 'conflicts'>;
  abortMerge: () => Promise<void>;
  resolveConflict: (filePath: string) => Promise<void>;

  // Remote Actions
  fetch: (remote: string) => Promise<void>;
  pull: (remote: string, branch: string) => Promise<'success' | 'conflicts'>;
  push: (remote: string, branch: string, force: boolean) => Promise<void>;

  // Phase 4 State
  rebaseTodoItems: RebaseTodoItem[];
  rebaseStatus: RebaseStatus | null;
  bisectState: BisectState | null;
  commitSearchResults: GraphCommit[];
  grepSearchResults: GrepMatch[];

  // Phase 4 Actions
  initRebase: (upstream: string) => Promise<void>;
  writeRebaseTodo: (items: RebaseTodoItem[]) => Promise<void>;
  stepRebase: (action: string) => Promise<RebaseStatus>;
  startBisect: (bad: string, good: string) => Promise<void>;
  markBisect: (status: string) => Promise<void>;
  resetBisect: () => Promise<void>;
  searchCommits: (query: string) => Promise<void>;
  grepCode: (query: string) => Promise<void>;
}

export const useRepoStore = create<RepoState>((set, get) => ({
  // Initial state
  tabs: [],
  activeTabId: null,
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
  reflogEntries: [],
  stashes: [],
  rebaseTodoItems: [],
  rebaseStatus: null,
  bisectState: null,
  commitSearchResults: [],
  grepSearchResults: [],
  selectedFilePath: null,
  selectedFileIsStaged: false,
  localDiff: null,
  isLoading: false,
  isRefreshing: false,
  error: null,

  openRepository: async (path: string) => {
    set({ isLoading: true, error: null });

    try {
      const info = await commands.openRepo(path);

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
          tabs: [
            ...state.tabs.map((t) => ({ ...t, isActive: false })),
            newTab,
          ],
          activeTabId: tabId,
          repoInfo: info,
        }));

        // Load all data
        await get().refreshAll();
      }
    } catch (err) {
      set({ error: String(err) });
    } finally {
      set({ isLoading: false });
    }
  },

  closeTab: (tabId: string) => {
    const { tabs, activeTabId } = get();
    const filtered = tabs.filter((t) => t.id !== tabId);

    if (activeTabId === tabId) {
      const newActive = filtered.length > 0 ? filtered[filtered.length - 1].id : null;
      set({
        tabs: filtered,
        activeTabId: newActive,
        repoInfo: null,
        status: null,
        branches: [],
        tags: [],
        remotes: [],
        commits: [],
        selectedCommitOid: null,
        commitDiff: [],
      });

      // If there's a new active tab, reload its data
      if (newActive) {
        get().refreshAll();
      }
    } else {
      set({ tabs: filtered });
    }

    // Tell Rust to clean up
    commands.closeRepo(tabId).catch(() => {});
  },

  switchTab: (tabId: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => ({ ...t, isActive: t.id === tabId })),
      activeTabId: tabId,
      selectedCommitOid: null,
      commitDiff: [],
    }));

    // Reload data for the new active tab
    get().refreshAll();
  },

  refreshStatus: async () => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isRefreshing: true });
    try {
      const status = await commands.getStatus(activeTabId);
      set({ status });
    } catch (err) {
      console.error('Failed to refresh status:', err);
    } finally {
      set({ isRefreshing: false });
    }
  },

  refreshAll: async () => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isRefreshing: true });
    try {
      const [status, branches, tags, remotes, commits, stashes] = await Promise.all([
        commands.getStatus(activeTabId),
        commands.listBranches(activeTabId),
        commands.listTags(activeTabId),
        commands.listRemotes(activeTabId),
        commands.getLog(activeTabId, 500),
        commands.listStashes(activeTabId),
      ]);

      set({ status, branches, tags, remotes, commits, stashes });
    } catch (err) {
      console.error('Failed to refresh:', err);
      set({ error: String(err) });
    } finally {
      set({ isRefreshing: false });
    }
  },

  selectCommit: async (oid: string | null) => {
    set({ selectedCommitOid: oid, commitDiff: [] });

    if (!oid) return;

    const { activeTabId } = get();
    if (!activeTabId) return;

    try {
      const diff = await commands.getCommitDiff(activeTabId, oid);
      set({ commitDiff: diff });
    } catch (err) {
      console.error('Failed to load commit diff:', err);
    }
  },

  loadMoreCommits: async (count: number) => {
    const { activeTabId, commits } = get();
    if (!activeTabId) return;

    try {
      const moreCommits = await commands.getLog(activeTabId, commits.length + count);
      set({ commits: moreCommits });
    } catch (err) {
      console.error('Failed to load more commits:', err);
    }
  },

  selectLocalFile: async (path, isStaged) => {
    set({ selectedFilePath: path, selectedFileIsStaged: isStaged, localDiff: null });
    if (!path) return;

    const { activeTabId } = get();
    if (!activeTabId) return;

    try {
      const diff = await commands.getFileDiff(activeTabId, path, isStaged);
      set({ localDiff: diff });
    } catch (err) {
      console.error('Failed to load local file diff:', err);
    }
  },

  stageFiles: async (files) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    try {
      await commands.stageFiles(activeTabId, files);
      await get().refreshAll();
      
      // Refresh current diff if it's selected
      const { selectedFilePath } = get();
      if (selectedFilePath && files.includes(selectedFilePath)) {
        await get().selectLocalFile(selectedFilePath, true);
      }
    } catch (err) {
      console.error('Failed to stage files:', err);
      set({ error: String(err) });
    }
  },

  unstageFiles: async (files) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    try {
      await commands.unstageFiles(activeTabId, files);
      await get().refreshAll();

      // Refresh current diff if it's selected
      const { selectedFilePath } = get();
      if (selectedFilePath && files.includes(selectedFilePath)) {
        await get().selectLocalFile(selectedFilePath, false);
      }
    } catch (err) {
      console.error('Failed to unstage files:', err);
      set({ error: String(err) });
    }
  },

  discardChanges: async (files) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    try {
      await commands.discardChanges(activeTabId, files);
      
      // Reset selected file if discarded
      const { selectedFilePath } = get();
      if (selectedFilePath && files.includes(selectedFilePath)) {
        set({ selectedFilePath: null, localDiff: null });
      }

      await get().refreshAll();
    } catch (err) {
      console.error('Failed to discard changes:', err);
      set({ error: String(err) });
    }
  },

  applyPatch: async (patch, location) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    try {
      await commands.applyPatch(activeTabId, patch, location);
      await get().refreshAll();

      // Refresh current diff if one is selected
      const { selectedFilePath, selectedFileIsStaged } = get();
      if (selectedFilePath) {
        await get().selectLocalFile(selectedFilePath, selectedFileIsStaged);
      }
    } catch (err) {
      console.error('Failed to apply patch:', err);
      set({ error: String(err) });
      throw err;
    }
  },

  commit: async (message, amend = false) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isLoading: true });
    try {
      await commands.createCommit(activeTabId, message, null, null, amend);
      set({ selectedFilePath: null, localDiff: null });
      await get().refreshAll();
    } catch (err) {
      console.error('Failed to commit:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  checkoutBranch: async (branchName) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isLoading: true });
    try {
      await commands.checkoutBranch(activeTabId, branchName);
      set({ selectedFilePath: null, localDiff: null });
      await get().refreshAll();
    } catch (err) {
      console.error('Failed to checkout branch:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  createBranch: async (name, startPoint = null) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    try {
      await commands.createBranch(activeTabId, name, startPoint);
      await get().refreshAll();
    } catch (err) {
      console.error('Failed to create branch:', err);
      set({ error: String(err) });
      throw err;
    }
  },

  deleteBranch: async (name, isRemote) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    try {
      await commands.deleteBranch(activeTabId, name, isRemote);
      await get().refreshAll();
    } catch (err) {
      console.error('Failed to delete branch:', err);
      set({ error: String(err) });
      throw err;
    }
  },

  renameBranch: async (currentName, newName) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    try {
      await commands.renameBranch(activeTabId, currentName, newName);
      await get().refreshAll();
    } catch (err) {
      console.error('Failed to rename branch:', err);
      set({ error: String(err) });
      throw err;
    }
  },

  deleteTag: async (name) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    try {
      await commands.deleteTag(activeTabId, name);
      await get().refreshAll();
    } catch (err) {
      console.error('Failed to delete tag:', err);
      set({ error: String(err) });
      throw err;
    }
  },

  mergeBranch: async (branchName) => {
    const { activeTabId } = get();
    if (!activeTabId) return 'conflicts';

    set({ isLoading: true });
    try {
      const result = await commands.mergeBranch(activeTabId, branchName);
      await get().refreshAll();
      return result;
    } catch (err) {
      console.error('Failed to merge branch:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  abortMerge: async () => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isLoading: true });
    try {
      await commands.abortMerge(activeTabId);
      await get().refreshAll();
    } catch (err) {
      console.error('Failed to abort merge:', err);
      set({ error: String(err) });
    } finally {
      set({ isLoading: false });
    }
  },

  resolveConflict: async (filePath) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    try {
      await commands.resolveConflict(activeTabId, filePath);
      await get().refreshAll();
    } catch (err) {
      console.error('Failed to resolve conflict:', err);
      set({ error: String(err) });
    }
  },

  fetch: async (remote) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isRefreshing: true });
    try {
      await commands.fetch(activeTabId, remote);
      await get().refreshAll();
    } catch (err) {
      console.error('Failed to fetch:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isRefreshing: false });
    }
  },

  pull: async (remote, branch) => {
    const { activeTabId } = get();
    if (!activeTabId) return 'conflicts';

    set({ isLoading: true });
    try {
      const result = await commands.pull(activeTabId, remote, branch);
      await get().refreshAll();
      return result;
    } catch (err) {
      console.error('Failed to pull:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  push: async (remote, branch, force) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isLoading: true });
    try {
      await commands.push(activeTabId, remote, branch, force);
      await get().refreshAll();
    } catch (err) {
      console.error('Failed to push:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Phase 3: Blame Actions ──

  loadFileBlame: async (filePath, commitOid = null) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isLoading: true, blameLines: [] });
    try {
      const lines = await commands.getFileBlame(activeTabId, filePath, commitOid);
      set({ blameLines: lines });
    } catch (err) {
      console.error('Failed to load file blame:', err);
      set({ error: String(err) });
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Phase 3: History Actions ──

  loadFileHistory: async (filePath) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isLoading: true, fileHistory: [] });
    try {
      const history = await commands.getFileHistory(activeTabId, filePath);
      set({ fileHistory: history });
    } catch (err) {
      console.error('Failed to load file history:', err);
      set({ error: String(err) });
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Phase 3: Reflog Actions ──

  loadReflog: async () => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isLoading: true, reflogEntries: [] });
    try {
      const entries = await commands.getReflog(activeTabId);
      set({ reflogEntries: entries });
    } catch (err) {
      console.error('Failed to load reflog:', err);
      set({ error: String(err) });
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Phase 3: Stash Actions ──

  loadStashes: async () => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    try {
      const list = await commands.listStashes(activeTabId);
      set({ stashes: list });
    } catch (err) {
      console.error('Failed to load stashes:', err);
    }
  },

  saveStash: async (message, includeUntracked) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isLoading: true });
    try {
      await commands.saveStash(activeTabId, message, includeUntracked);
      await get().refreshAll();
    } catch (err) {
      console.error('Failed to save stash:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  applyStash: async (index) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isLoading: true });
    try {
      await commands.applyStash(activeTabId, index);
      await get().refreshAll();
    } catch (err) {
      console.error('Failed to apply stash:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  popStash: async (index) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isLoading: true });
    try {
      await commands.popStash(activeTabId, index);
      await get().refreshAll();
    } catch (err) {
      console.error('Failed to pop stash:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  dropStash: async (index) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    try {
      await commands.dropStash(activeTabId, index);
      await get().refreshAll();
    } catch (err) {
      console.error('Failed to drop stash:', err);
      set({ error: String(err) });
      throw err;
    }
  },

  // ── Phase 3: Tag Creation & Push ──

  createTag: async (name, targetOid, message = null, force = false) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    try {
      await commands.createTag(activeTabId, name, targetOid, message, force);
      await get().refreshAll();
    } catch (err) {
      console.error('Failed to create tag:', err);
      set({ error: String(err) });
      throw err;
    }
  },

  pushTag: async (remote, tagName) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isLoading: true });
    try {
      await commands.pushTag(activeTabId, remote, tagName);
      await get().refreshAll();
    } catch (err) {
      console.error('Failed to push tag:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Phase 4: Rebase, Bisect, Search Actions ──

  initRebase: async (upstream) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isLoading: true, error: null });
    try {
      const items = await commands.rebaseInit(activeTabId, upstream);
      set({ rebaseTodoItems: items, rebaseStatus: { status: 'stepping', currentOid: null, message: 'Rebase initialized' } });
    } catch (err) {
      console.error('Failed to initialize rebase:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  writeRebaseTodo: async (items) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    try {
      await commands.rebaseWriteTodo(activeTabId, items);
      set({ rebaseTodoItems: items });
    } catch (err) {
      console.error('Failed to write rebase todo:', err);
      set({ error: String(err) });
      throw err;
    }
  },

  stepRebase: async (action) => {
    const { activeTabId } = get();
    if (!activeTabId) throw new Error('No active repository');

    set({ isLoading: true, error: null });
    try {
      const status = await commands.rebaseStep(activeTabId, action);
      set({ rebaseStatus: status });
      await get().refreshAll();
      return status;
    } catch (err) {
      console.error('Failed to step rebase:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  startBisect: async (bad, good) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isLoading: true, error: null });
    try {
      const state = await commands.bisectStart(activeTabId, bad, good);
      set({ bisectState: state });
      await get().refreshAll();
    } catch (err) {
      console.error('Failed to start bisect:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  markBisect: async (status) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isLoading: true, error: null });
    try {
      const state = await commands.bisectMark(activeTabId, status);
      set({ bisectState: state });
      await get().refreshAll();
    } catch (err) {
      console.error('Failed to mark bisect:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  resetBisect: async () => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isLoading: true, error: null });
    try {
      await commands.bisectReset(activeTabId);
      set({ bisectState: null });
      await get().refreshAll();
    } catch (err) {
      console.error('Failed to reset bisect:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  searchCommits: async (query) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    if (!query.trim()) {
      set({ commitSearchResults: [] });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const results = await commands.searchCommits(activeTabId, query);
      set({ commitSearchResults: results });
    } catch (err) {
      console.error('Failed to search commits:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  grepCode: async (query) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    if (!query.trim()) {
      set({ grepSearchResults: [] });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const results = await commands.grepCode(activeTabId, query);
      set({ grepSearchResults: results });
    } catch (err) {
      console.error('Failed to grep code:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },
}));
