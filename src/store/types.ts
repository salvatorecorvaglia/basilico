import type {
  BisectState,
  BlameLine,
  BranchInfo,
  ConflictStages,
  FileDiff,
  FileHistoryEntry,
  GraphCommit,
  GrepMatch,
  RebaseStatus,
  RebaseTodoItem,
  RemoteInfo,
  RepoInfo,
  RepoStatus,
  RepoTab,
  StashInfo,
  SubmoduleInfo,
  TagInfo,
  TreeEntryInfo,
  UserSettings,
  WorktreeInfo,
} from "../lib/git-types";

export interface LoadingStates {
  global: boolean;
  commits: boolean;
  status: boolean;
  diff: boolean;
  staging: boolean;
  branches: boolean;
  blame: boolean;
  history: boolean;
  stashes: boolean;
  search: boolean;
  collaboration: boolean;
  settings: boolean;
}

export const INITIAL_LOADING_STATES: LoadingStates = {
  global: false,
  commits: false,
  status: false,
  diff: false,
  staging: false,
  branches: false,
  blame: false,
  history: false,
  stashes: false,
  search: false,
  collaboration: false,
  settings: false,
};

export interface RepoState {
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

  // Loading states — per-domain flags prevent concurrent operations from clobbering each other
  loadingStates: LoadingStates;
  // Derived: true if ANY domain is loading (for backward-compatible simple checks)
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;

  // Generation counter — incremented on tab switch to detect stale async responses
  refreshGeneration: number;

  // Actions
  openRepository: (path: string) => Promise<void>;
  closeTab: (tabId: string) => void;
  switchTab: (tabId: string) => void;
  refreshStatus: () => Promise<void>;
  refreshCommitsAndStatus: () => Promise<void>;
  refreshBranches: () => Promise<void>;
  refreshAll: () => Promise<void>;
  refreshOnFileSystemChange: () => Promise<void>;
  selectCommit: (oid: string | null) => Promise<void>;
  loadMoreCommits: (count: number) => Promise<void>;

  // Staging & Local Diff Actions
  selectLocalFile: (path: string | null, isStaged: boolean) => Promise<void>;
  stageFiles: (files: string[]) => Promise<void>;
  unstageFiles: (files: string[]) => Promise<void>;
  discardChanges: (files: string[]) => Promise<void>;
  applyPatch: (
    patch: string,
    location: "index" | "workdir" | "both",
  ) => Promise<void>;

  // Commit Actions
  commit: (message: string, amend?: boolean) => Promise<void>;

  // Branch Actions
  checkoutBranch: (branchName: string) => Promise<void>;
  createBranch: (name: string, startPoint?: string | null) => Promise<void>;
  deleteBranch: (name: string, isRemote: boolean) => Promise<void>;
  renameBranch: (currentName: string, newName: string) => Promise<void>;

  // Tag Actions
  deleteTag: (name: string) => Promise<void>;
  createTag: (
    name: string,
    targetOid: string,
    message?: string | null,
    force?: boolean,
  ) => Promise<void>;
  pushTag: (remote: string, tagName: string) => Promise<void>;

  // Phase 3 Actions
  loadFileBlame: (filePath: string, commitOid?: string | null) => Promise<void>;
  loadFileHistory: (filePath: string) => Promise<void>;
  loadStashes: () => Promise<void>;
  saveStash: (message: string, includeUntracked: boolean) => Promise<void>;
  applyStash: (index: number) => Promise<void>;
  popStash: (index: number) => Promise<void>;
  dropStash: (index: number) => Promise<void>;

  // Merge Actions
  mergeBranch: (branchName: string) => Promise<"success" | "conflicts">;
  abortMerge: () => Promise<void>;
  resolveConflict: (filePath: string) => Promise<void>;

  // Remote Actions
  fetch: (remote: string) => Promise<void>;
  pull: (remote: string, branch: string) => Promise<"success" | "conflicts">;
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
  stepRebase: (
    action: string,
    commitMessage?: string | null,
  ) => Promise<RebaseStatus>;
  startBisect: (bad: string, good: string) => Promise<void>;
  markBisect: (status: string) => Promise<void>;
  resetBisect: () => Promise<void>;
  searchCommits: (query: string) => Promise<void>;
  grepCode: (query: string) => Promise<void>;

  // Phase 5 Actions
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
  loadSettings: () => Promise<void>;
  saveSettings: (settings: UserSettings) => Promise<void>;
  generateSshKey: (comment: string) => Promise<string>;

  // Phase 6 Actions
  cherryPickCommit: (oid: string) => Promise<"success" | "conflicts">;
  cherryPickAbort: () => Promise<void>;
  revertCommit: (oid: string) => Promise<"success" | "conflicts">;
  revertAbort: () => Promise<void>;
  resetToCommit: (
    oid: string,
    mode: "soft" | "mixed" | "hard",
  ) => Promise<void>;

  // Phase 7 Actions
  loadCommitTree: (oid: string) => Promise<void>;
  startComparison: (base: string, target: string) => Promise<void>;
  selectCompareFile: (filePath: string | null) => Promise<void>;

  // Phase 9 Actions
  loadConflictStages: (filePath: string) => Promise<void>;
  resolveConflictStages: (
    filePath: string,
    mergedContent: string,
  ) => Promise<void>;

  // Phase 10 Actions
  loadStashDetail: (index: number) => Promise<void>;
  selectStashFile: (filePath: string | null) => Promise<void>;
  createBranchFromStash: (index: number, branchName: string) => Promise<void>;
}
