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
  WorktreeInfo,
  SubmoduleInfo,
  UserSettings,
  TreeEntryInfo,
  ConflictStages,
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

  // Phase 5 State
  worktrees: WorktreeInfo[];
  submodules: SubmoduleInfo[];
  settings: UserSettings | null;

  // Phase 7 State
  commitTree: TreeEntryInfo[];
  compareDiff: FileDiff[];
  compareBase: string | null;
  compareTarget: string | null;
  selectedCompareFile: string | null;
  compareFileDiff: FileDiff | null;

  // Phase 9 State
  conflictStages: ConflictStages | null;
  activeConflictedPath: string | null;

  // Phase 10 State
  selectedStashIndex: number | null;
  stashDiff: FileDiff[];
  selectedStashFile: string | null;
  selectedStashFileDiff: FileDiff | null;

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
  stepRebase: (action: string, commitMessage?: string | null) => Promise<RebaseStatus>;
  startBisect: (bad: string, good: string) => Promise<void>;
  markBisect: (status: string) => Promise<void>;
  resetBisect: () => Promise<void>;
  searchCommits: (query: string) => Promise<void>;
  grepCode: (query: string) => Promise<void>;

  // Phase 5 Actions
  loadWorktrees: () => Promise<void>;
  addWorktree: (path: string, branch?: string | null, newBranch?: string | null) => Promise<void>;
  removeWorktree: (worktreePath: string, force?: boolean) => Promise<void>;
  pruneWorktrees: () => Promise<void>;
  loadSubmodules: () => Promise<void>;
  initSubmodules: (paths: string[]) => Promise<void>;
  updateSubmodules: (paths: string[], recursive?: boolean) => Promise<void>;
  syncSubmodules: (paths: string[]) => Promise<void>;
  addSubmodule: (url: string, path: string) => Promise<void>;
  loadSettings: () => Promise<void>;
  saveSettings: (settings: UserSettings) => Promise<void>;
  generateSshKey: (comment: string) => Promise<string>;

  // Phase 6 Actions
  cherryPickCommit: (oid: string) => Promise<'success' | 'conflicts'>;
  cherryPickAbort: () => Promise<void>;
  revertCommit: (oid: string) => Promise<'success' | 'conflicts'>;
  revertAbort: () => Promise<void>;
  resetToCommit: (oid: string, mode: 'soft' | 'mixed' | 'hard') => Promise<void>;
  cleanRepository: (dryRun: boolean, cleanDirs: boolean, includeIgnored: boolean) => Promise<string[]>;

  // Phase 7 Actions
  loadCommitTree: (oid: string) => Promise<void>;
  startComparison: (base: string, target: string) => Promise<void>;
  selectCompareFile: (filePath: string | null) => Promise<void>;

  // Phase 9 Actions
  loadConflictStages: (filePath: string) => Promise<void>;
  resolveConflictStages: (filePath: string, mergedContent: string) => Promise<void>;

  // Phase 10 Actions
  loadStashDetail: (index: number) => Promise<void>;
  selectStashFile: (filePath: string | null) => Promise<void>;
  createBranchFromStash: (index: number, branchName: string) => Promise<void>;
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
  worktrees: [],
  submodules: [],
  settings: null,
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
  isLoading: false,
  isRefreshing: false,
  error: null,

  openRepository: async (path: string) => {
    set({ isLoading: true, error: null });

    try {
      const info = await commands.openRepo(path, { errorPrefix: 'Failed to open repository' });

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
    commands.closeRepo(tabId, { silent: true }).catch(() => {});
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
      const status = await commands.getStatus(activeTabId, { silent: true });
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
        commands.getStatus(activeTabId, { silent: true }),
        commands.listBranches(activeTabId, { silent: true }),
        commands.listTags(activeTabId, { silent: true }),
        commands.listRemotes(activeTabId, { silent: true }),
        commands.getLog(activeTabId, 500, { silent: true }),
        commands.listStashes(activeTabId, { silent: true }),
      ]);

      set({ status, branches, tags, remotes, commits, stashes });

      // Load worktrees and submodules in background (non-blocking)
      commands.listWorktrees(activeTabId, { silent: true })
        .then(worktrees => set({ worktrees }))
        .catch(() => set({ worktrees: [] }));
      commands.listSubmodules(activeTabId, { silent: true })
        .then(submodules => set({ submodules }))
        .catch(() => set({ submodules: [] }));
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
      const diff = await commands.getCommitDiff(activeTabId, oid, { silent: true });
      set({ commitDiff: diff });
    } catch (err) {
      console.error('Failed to load commit diff:', err);
    }
  },

  loadMoreCommits: async (count: number) => {
    const { activeTabId, commits } = get();
    if (!activeTabId) return;

    try {
      const moreCommits = await commands.getLog(activeTabId, commits.length + count, { silent: true });
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
      const diff = await commands.getFileDiff(activeTabId, path, isStaged, { silent: true });
      set({ localDiff: diff });
    } catch (err) {
      console.error('Failed to load local file diff:', err);
    }
  },

  stageFiles: async (files) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    try {
      await commands.stageFiles(activeTabId, files, { errorPrefix: 'Failed to stage files' });
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
      await commands.unstageFiles(activeTabId, files, { errorPrefix: 'Failed to unstage files' });
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
      await commands.discardChanges(activeTabId, files, { errorPrefix: 'Failed to discard changes' });
      
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
      await commands.applyPatch(activeTabId, patch, location, { errorPrefix: 'Failed to apply patch' });
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
      await commands.createCommit(activeTabId, message, null, null, amend, { errorPrefix: 'Failed to commit' });
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
      await commands.checkoutBranch(activeTabId, branchName, { errorPrefix: 'Failed to checkout branch' });
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
      await commands.createBranch(activeTabId, name, startPoint, { errorPrefix: 'Failed to create branch' });
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
      await commands.deleteBranch(activeTabId, name, isRemote, { errorPrefix: 'Failed to delete branch' });
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
      await commands.renameBranch(activeTabId, currentName, newName, { errorPrefix: 'Failed to rename branch' });
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
      await commands.deleteTag(activeTabId, name, { errorPrefix: 'Failed to delete tag' });
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
      const result = await commands.mergeBranch(activeTabId, branchName, { errorPrefix: 'Failed to merge' });
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
      await commands.abortMerge(activeTabId, { errorPrefix: 'Failed to abort merge' });
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
      await commands.resolveConflict(activeTabId, filePath, { errorPrefix: 'Failed to resolve conflict' });
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
      await commands.fetch(activeTabId, remote, { errorPrefix: 'Fetch failed' });
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
      const result = await commands.pull(activeTabId, remote, branch, { errorPrefix: 'Pull failed' });
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
      await commands.push(activeTabId, remote, branch, force, { errorPrefix: 'Push failed' });
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
      const list = await commands.listStashes(activeTabId, { silent: true });
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
      await commands.saveStash(activeTabId, message, includeUntracked, { errorPrefix: 'Failed to save stash' });
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
      await commands.applyStash(activeTabId, index, { errorPrefix: 'Failed to apply stash' });
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
      await commands.popStash(activeTabId, index, { errorPrefix: 'Failed to pop stash' });
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
      await commands.dropStash(activeTabId, index, { errorPrefix: 'Failed to drop stash' });
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
      await commands.createTag(activeTabId, name, targetOid, message, force, { errorPrefix: 'Failed to create tag' });
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
      await commands.pushTag(activeTabId, remote, tagName, { errorPrefix: 'Failed to push tag' });
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
      const items = await commands.rebaseInit(activeTabId, upstream, { errorPrefix: 'Failed to initialize rebase' });
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
      await commands.rebaseWriteTodo(activeTabId, items, { errorPrefix: 'Failed to write rebase todo' });
      set({ rebaseTodoItems: items });
    } catch (err) {
      console.error('Failed to write rebase todo:', err);
      set({ error: String(err) });
      throw err;
    }
  },

  stepRebase: async (action, commitMessage = null) => {
    const { activeTabId } = get();
    if (!activeTabId) throw new Error('No active repository');

    set({ isLoading: true, error: null });
    try {
      const status = await commands.rebaseStep(activeTabId, action, commitMessage, { errorPrefix: 'Failed to step rebase' });
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
      const state = await commands.bisectStart(activeTabId, bad, good, { errorPrefix: 'Failed to start bisect' });
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
      const state = await commands.bisectMark(activeTabId, status, { errorPrefix: 'Failed to mark bisect' });
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
      await commands.bisectReset(activeTabId, { errorPrefix: 'Failed to reset bisect' });
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
      const results = await commands.searchCommits(activeTabId, query, { errorPrefix: 'Failed to search commits' });
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
      const results = await commands.grepCode(activeTabId, query, { errorPrefix: 'Failed to search code' });
      set({ grepSearchResults: results });
    } catch (err) {
      console.error('Failed to grep code:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Phase 5: Worktree Actions ──

  loadWorktrees: async () => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    try {
      const worktrees = await commands.listWorktrees(activeTabId, { silent: true });
      set({ worktrees });
    } catch (err) {
      console.error('Failed to load worktrees:', err);
    }
  },

  addWorktree: async (path, branch = null, newBranch = null) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isLoading: true });
    try {
      await commands.addWorktree(activeTabId, path, branch, newBranch, { errorPrefix: 'Failed to add worktree' });
      await get().loadWorktrees();
    } catch (err) {
      console.error('Failed to add worktree:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  removeWorktree: async (worktreePath, force = false) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isLoading: true });
    try {
      await commands.removeWorktree(activeTabId, worktreePath, force, { errorPrefix: 'Failed to remove worktree' });
      await get().loadWorktrees();
    } catch (err) {
      console.error('Failed to remove worktree:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  pruneWorktrees: async () => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    try {
      await commands.pruneWorktrees(activeTabId, { errorPrefix: 'Failed to prune worktrees' });
      await get().loadWorktrees();
    } catch (err) {
      console.error('Failed to prune worktrees:', err);
      set({ error: String(err) });
      throw err;
    }
  },

  // ── Phase 5: Submodule Actions ──

  loadSubmodules: async () => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    try {
      const submodules = await commands.listSubmodules(activeTabId, { silent: true });
      set({ submodules });
    } catch (err) {
      console.error('Failed to load submodules:', err);
    }
  },

  initSubmodules: async (paths) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isLoading: true });
    try {
      await commands.initSubmodules(activeTabId, paths, { errorPrefix: 'Failed to initialize submodules' });
      await get().loadSubmodules();
    } catch (err) {
      console.error('Failed to init submodules:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  updateSubmodules: async (paths, recursive = true) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isLoading: true });
    try {
      await commands.updateSubmodules(activeTabId, paths, recursive, { errorPrefix: 'Failed to update submodules' });
      await get().loadSubmodules();
    } catch (err) {
      console.error('Failed to update submodules:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  syncSubmodules: async (paths) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    try {
      await commands.syncSubmodules(activeTabId, paths, { errorPrefix: 'Failed to sync submodules' });
      await get().loadSubmodules();
    } catch (err) {
      console.error('Failed to sync submodules:', err);
      set({ error: String(err) });
      throw err;
    }
  },

  addSubmodule: async (url, path) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isLoading: true });
    try {
      await commands.addSubmodule(activeTabId, url, path, { errorPrefix: 'Failed to add submodule' });
      await get().loadSubmodules();
      await get().refreshAll();
    } catch (err) {
      console.error('Failed to add submodule:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Phase 5: Settings Actions ──

  loadSettings: async () => {
    try {
      const settings = await commands.getSettings({ silent: true });
      set({ settings });
      localStorage.setItem('basilico-theme', settings.theme);

      // Apply theme preset color to CSS custom variables
      const THEME_PRESETS = [
        { id: 'sage-green',      color: '#2ea043' },
        { id: 'royal-blue',      color: '#1f6feb' },
        { id: 'amethyst-purple',  color: '#8b5cf6' },
        { id: 'amber-gold',      color: '#d29922' },
        { id: 'crimson-red',     color: '#f85149' },
        { id: 'ocean-teal',      color: '#2dd4bf' },
      ];
      const preset = THEME_PRESETS.find(p => p.id === settings.theme);
      if (preset) {
        document.documentElement.style.setProperty('--accent-primary', preset.color);
        document.documentElement.style.setProperty('--accent-primary-hover', preset.color + 'cc');
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  },

  saveSettings: async (settings) => {
    try {
      await commands.saveSettings(settings, { errorPrefix: 'Failed to save settings' });
      set({ settings });
      localStorage.setItem('basilico-theme', settings.theme);

      // Apply theme preset color to CSS custom variables
      const THEME_PRESETS = [
        { id: 'sage-green',      color: '#2ea043' },
        { id: 'royal-blue',      color: '#1f6feb' },
        { id: 'amethyst-purple',  color: '#8b5cf6' },
        { id: 'amber-gold',      color: '#d29922' },
        { id: 'crimson-red',     color: '#f85149' },
        { id: 'ocean-teal',      color: '#2dd4bf' },
      ];
      const preset = THEME_PRESETS.find(p => p.id === settings.theme);
      if (preset) {
        document.documentElement.style.setProperty('--accent-primary', preset.color);
        document.documentElement.style.setProperty('--accent-primary-hover', preset.color + 'cc');
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
      set({ error: String(err) });
      throw err;
    }
  },

  generateSshKey: async (comment) => {
    try {
      const pubKey = await commands.generateSshKey(comment, { errorPrefix: 'Failed to generate SSH key' });
      return pubKey;
    } catch (err) {
      console.error('Failed to generate SSH key:', err);
      set({ error: String(err) });
      throw err;
    }
  },

  // ── Phase 6 Actions ──

  cherryPickCommit: async (oid) => {
    const { activeTabId } = get();
    if (!activeTabId) throw new Error('No active repository');
    set({ isLoading: true });
    try {
      const res = await commands.cherryPickCommit(activeTabId, oid, { errorPrefix: 'Cherry-pick failed' });
      await get().refreshAll();
      return res as 'success' | 'conflicts';
    } catch (err) {
      console.error('Failed to cherry-pick:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  cherryPickAbort: async () => {
    const { activeTabId } = get();
    if (!activeTabId) throw new Error('No active repository');
    set({ isLoading: true });
    try {
      await commands.cherryPickAbort(activeTabId, { errorPrefix: 'Cherry-pick abort failed' });
      await get().refreshAll();
    } catch (err) {
      console.error('Failed to abort cherry-pick:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  revertCommit: async (oid) => {
    const { activeTabId } = get();
    if (!activeTabId) throw new Error('No active repository');
    set({ isLoading: true });
    try {
      const res = await commands.revertCommit(activeTabId, oid, { errorPrefix: 'Revert failed' });
      await get().refreshAll();
      return res as 'success' | 'conflicts';
    } catch (err) {
      console.error('Failed to revert commit:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  revertAbort: async () => {
    const { activeTabId } = get();
    if (!activeTabId) throw new Error('No active repository');
    set({ isLoading: true });
    try {
      await commands.revertAbort(activeTabId, { errorPrefix: 'Revert abort failed' });
      await get().refreshAll();
    } catch (err) {
      console.error('Failed to abort revert:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  resetToCommit: async (oid, mode) => {
    const { activeTabId } = get();
    if (!activeTabId) throw new Error('No active repository');
    set({ isLoading: true });
    try {
      await commands.resetToCommit(activeTabId, oid, mode, { errorPrefix: 'Reset failed' });
      await get().refreshAll();
    } catch (err) {
      console.error('Failed to reset to commit:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  cleanRepository: async (dryRun, cleanDirs, includeIgnored) => {
    const { activeTabId } = get();
    if (!activeTabId) throw new Error('No active repository');
    set({ isLoading: true });
    try {
      const res = await commands.cleanRepository(activeTabId, dryRun, cleanDirs, includeIgnored, { errorPrefix: 'Clean failed' });
      if (!dryRun) {
        await get().refreshAll();
      }
      return res;
    } catch (err) {
      console.error('Failed to clean repository:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Phase 7 Actions ──

  loadCommitTree: async (oid: string) => {
    const { activeTabId } = get();
    if (!activeTabId) return;
    set({ isLoading: true, commitTree: [] });
    try {
      const tree = await commands.getCommitTree(activeTabId, oid, { silent: true });
      set({ commitTree: tree });
    } catch (err) {
      console.error('Failed to load commit tree:', err);
      set({ error: String(err) });
    } finally {
      set({ isLoading: false });
    }
  },

  startComparison: async (base: string, target: string) => {
    const { activeTabId } = get();
    if (!activeTabId) return;
    set({ 
      isLoading: true, 
      compareBase: base, 
      compareTarget: target, 
      compareDiff: [], 
      selectedCompareFile: null,
      compareFileDiff: null 
    });
    try {
      const diffs = await commands.getCompareDiff(activeTabId, base, target, { silent: true });
      set({ compareDiff: diffs });
      
      // Auto select first file if available
      if (diffs.length > 0) {
        const firstFile = diffs[0].newPath || diffs[0].oldPath;
        if (firstFile) {
          await get().selectCompareFile(firstFile);
        }
      }
    } catch (err) {
      console.error('Failed to load comparison diff:', err);
      set({ error: String(err) });
    } finally {
      set({ isLoading: false });
    }
  },

  selectCompareFile: async (filePath: string | null) => {
    set({ selectedCompareFile: filePath, compareFileDiff: null });
    if (!filePath) return;
    const { activeTabId, compareBase, compareTarget } = get();
    if (!activeTabId || !compareBase || !compareTarget) return;

    try {
      const diff = get().compareDiff.find(d => d.newPath === filePath || d.oldPath === filePath);
      if (diff) {
        set({ compareFileDiff: diff });
      }
    } catch (err) {
      console.error('Failed to select compare file:', err);
    }
  },

  // ── Phase 9 Actions ──

  loadConflictStages: async (filePath: string) => {
    const { activeTabId } = get();
    if (!activeTabId) return;
    set({ isLoading: true, conflictStages: null, activeConflictedPath: filePath });
    try {
      const stages = await commands.getConflictStages(activeTabId, filePath, { silent: true });
      set({ conflictStages: stages });
    } catch (err) {
      console.error('Failed to load conflict stages:', err);
      set({ error: String(err) });
    } finally {
      set({ isLoading: false });
    }
  },

  resolveConflictStages: async (filePath: string, mergedContent: string) => {
    const { activeTabId } = get();
    if (!activeTabId) return;
    set({ isLoading: true });
    try {
      await commands.saveMergedResolution(activeTabId, filePath, mergedContent, { errorPrefix: 'Failed to resolve conflict' });
      set({ conflictStages: null, activeConflictedPath: null });
      await get().refreshAll();
    } catch (err) {
      console.error('Failed to resolve conflict:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Phase 10 Actions ──

  loadStashDetail: async (index) => {
    const { activeTabId, stashes } = get();
    if (!activeTabId) return;

    set({ selectedStashIndex: index, stashDiff: [], selectedStashFile: null, selectedStashFileDiff: null, isLoading: true });
    try {
      const stash = stashes.find(s => s.index === index);
      if (!stash) {
        throw new Error(`Stash at index ${index} not found`);
      }
      const diff = await commands.getStashDiff(activeTabId, stash.oid, { silent: true });
      set({ stashDiff: diff });

      // Automatically select first file
      if (diff.length > 0) {
        const firstFile = diff[0].newPath || diff[0].oldPath;
        if (firstFile) {
          await get().selectStashFile(firstFile);
        }
      }
    } catch (err) {
      console.error('Failed to load stash diff:', err);
      set({ error: String(err) });
    } finally {
      set({ isLoading: false });
    }
  },

  selectStashFile: async (filePath) => {
    set({ selectedStashFile: filePath, selectedStashFileDiff: null });
    if (!filePath) return;

    const diff = get().stashDiff.find(d => d.newPath === filePath || d.oldPath === filePath);
    if (diff) {
      set({ selectedStashFileDiff: diff });
    }
  },

  createBranchFromStash: async (index, branchName) => {
    const { activeTabId, stashes } = get();
    if (!activeTabId) return;

    set({ isLoading: true });
    try {
      const stash = stashes.find(s => s.index === index);
      if (!stash) {
        throw new Error(`Stash at index ${index} not found`);
      }
      
      // 1. Create a branch from stash parent (stash.oid + "^1")
      await commands.createBranch(activeTabId, branchName, `${stash.oid}^1`, { errorPrefix: 'Failed to branch from stash' });
      
      // 2. Checkout that new branch
      await get().checkoutBranch(branchName);
      
      // 3. Pop the stash (applies to workspace and drops)
      await commands.popStash(activeTabId, index, { errorPrefix: 'Failed to pop stash' });
      
      await get().refreshAll();
    } catch (err) {
      console.error('Failed to create branch from stash:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },
}));
