/* ═══════════════════════════════════════════════════════
   Basilico — Typed Tauri Command Wrappers
   ═══════════════════════════════════════════════════════ */

import { invoke } from '@tauri-apps/api/core';
import type {
  RepoInfo,
  RepoStatus,
  RemoteInfo,
  BranchInfo,
  TagInfo,
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
} from './git-types';

// ── Repository Commands ──

export const openRepo = (path: string) =>
  invoke<RepoInfo>('open_repo', { path });

export const closeRepo = (path: string) =>
  invoke<void>('close_repo', { path });

export const getStatus = (path: string) =>
  invoke<RepoStatus>('get_status', { path });

export const listRemotes = (path: string) =>
  invoke<RemoteInfo[]>('list_remotes', { path });

// ── Log Commands ──

export const getLog = (path: string, maxCommits?: number) =>
  invoke<GraphCommit[]>('get_log', { path, maxCommits });

// ── Diff Commands ──

export const getWorkdirDiff = (path: string) =>
  invoke<FileDiff[]>('get_workdir_diff', { path });

export const getStagedDiff = (path: string) =>
  invoke<FileDiff[]>('get_staged_diff', { path });

export const getCommitDiff = (path: string, oid: string) =>
  invoke<FileDiff[]>('get_commit_diff', { path, oid });

export const getFileDiff = (path: string, filePath: string, isStaged: boolean) =>
  invoke<FileDiff>('get_file_diff', { path, filePath, isStaged });

export interface FileContentPair {
  original: string;
  modified: string;
}

export const getFileContentPair = (path: string, filePath: string, isStaged: boolean) =>
  invoke<FileContentPair>('get_file_content_pair', { path, filePath, isStaged });

export const getFileContentAtRevision = (path: string, filePath: string, revision: string) =>
  invoke<string>('get_file_content_at_revision', { path, filePath, revision });

// ── Branch Commands ──

export const listBranches = (path: string) =>
  invoke<BranchInfo[]>('list_branches', { path });

// ── Tag Commands ──

export const listTags = (path: string) =>
  invoke<TagInfo[]>('list_tags', { path });

export const deleteTag = (path: string, name: string) =>
  invoke<void>('delete_tag', { path, name });

// ── Phase 2: Staging Commands ──

export const stageFiles = (path: string, files: string[]) =>
  invoke<void>('stage_files', { path, files });

export const unstageFiles = (path: string, files: string[]) =>
  invoke<void>('unstage_files', { path, files });

export const applyPatch = (path: string, patch: string, location: 'index' | 'workdir' | 'both') =>
  invoke<void>('apply_patch', { path, patch, location });

export const discardChanges = (path: string, files: string[]) =>
  invoke<void>('discard_changes', { path, files });

// ── Phase 2: Commit Commands ──

export const createCommit = (
  path: string,
  message: string,
  authorName?: string | null,
  authorEmail?: string | null,
  amend?: boolean
) => invoke<string>('create_commit', { path, message, authorName, authorEmail, amend });

// ── Phase 2: Branch Write Commands ──

export const createBranch = (path: string, name: string, startPoint?: string | null) =>
  invoke<void>('create_branch', { path, name, startPoint });

export const deleteBranch = (path: string, name: string, isRemote: boolean) =>
  invoke<void>('delete_branch', { path, name, isRemote });

export const checkoutBranch = (path: string, name: string) =>
  invoke<void>('checkout_branch', { path, name });

export const renameBranch = (path: string, currentName: string, newName: string) =>
  invoke<void>('rename_branch', { path, currentName, newName });

// ── Phase 2: Merge Commands ──

export const mergeBranch = (path: string, branchName: string) =>
  invoke<'success' | 'conflicts'>('merge_branch', { path, branchName });

export const abortMerge = (path: string) =>
  invoke<void>('abort_merge', { path });

export const getConflicts = (path: string) =>
  invoke<string[]>('get_conflicts', { path });

export const resolveConflict = (path: string, filePath: string) =>
  invoke<void>('resolve_conflict', { path, filePath });

// ── Phase 2: Remote Commands ──

export const fetch = (path: string, remote: string) =>
  invoke<void>('fetch', { path, remote });

export const push = (path: string, remote: string, branch: string, force: boolean) =>
  invoke<void>('push', { path, remote, branch, force });

export const pull = (path: string, remote: string, branch: string) =>
  invoke<'success' | 'conflicts'>('pull', { path, remote, branch });

// ── Phase 3: Blame Commands ──

export const getFileBlame = (path: string, filePath: string, commitOid?: string | null) =>
  invoke<BlameLine[]>('get_file_blame', { path, filePath, commitOid });

// ── Phase 3: History Commands ──

export const getFileHistory = (path: string, filePath: string, maxCommits?: number | null) =>
  invoke<FileHistoryEntry[]>('get_file_history', { path, filePath, maxCommits });

// ── Phase 3: Reflog Commands ──

export const getReflog = (path: string, maxEntries?: number | null) =>
  invoke<ReflogEntry[]>('get_reflog', { path, maxEntries });

// ── Phase 3: Stash Commands ──

export const listStashes = (path: string) =>
  invoke<StashInfo[]>('list_stashes', { path });

export const saveStash = (path: string, message: string, includeUntracked: boolean) =>
  invoke<void>('save_stash', { path, message, includeUntracked });

export const applyStash = (path: string, index: number) =>
  invoke<void>('apply_stash', { path, index });

export const popStash = (path: string, index: number) =>
  invoke<void>('pop_stash', { path, index });

export const dropStash = (path: string, index: number) =>
  invoke<void>('drop_stash', { path, index });

// ── Phase 3: Tag Creation & Push Commands ──

export const createTag = (
  path: string,
  name: string,
  targetOid: string,
  message?: string | null,
  force?: boolean
) => invoke<void>('create_tag', { path, name, targetOid, message, force: !!force });

export const pushTag = (path: string, remote: string, tagName: string) =>
  invoke<void>('push_tag', { path, remote, tagName });

// ── Phase 4: Rebase Commands ──

export const rebaseInit = (repoPath: string, upstream: string) =>
  invoke<RebaseTodoItem[]>('rebase_init', { repoPath, upstream });

export const rebaseWriteTodo = (repoPath: string, items: RebaseTodoItem[]) =>
  invoke<void>('rebase_write_todo', { repoPath, items });

export const rebaseStep = (repoPath: string, action: string) =>
  invoke<RebaseStatus>('rebase_step', { repoPath, action });

// ── Phase 4: Bisect Commands ──

export const bisectStart = (repoPath: string, bad: string, good: string) =>
  invoke<BisectState>('bisect_start', { repoPath, bad, good });

export const bisectMark = (repoPath: string, status: string) =>
  invoke<BisectState>('bisect_mark', { repoPath, status });

export const bisectReset = (repoPath: string) =>
  invoke<void>('bisect_reset', { repoPath });

// ── Phase 4: Search Commands ──

export const searchCommits = (repoPath: string, query: string) =>
  invoke<GraphCommit[]>('search_commits', { repoPath, query });

export const grepCode = (repoPath: string, query: string) =>
  invoke<GrepMatch[]>('grep_code', { repoPath, query });

// ── Phase 5: Worktree Commands ──

export const listWorktrees = (repoPath: string) =>
  invoke<WorktreeInfo[]>('list_worktrees', { repoPath });

export const addWorktree = (
  repoPath: string,
  path: string,
  branch?: string | null,
  newBranch?: string | null,
) => invoke<void>('add_worktree', { repoPath, path, branch, newBranch });

export const removeWorktree = (repoPath: string, worktreePath: string, force: boolean) =>
  invoke<void>('remove_worktree', { repoPath, worktreePath, force });

export const pruneWorktrees = (repoPath: string) =>
  invoke<void>('prune_worktrees', { repoPath });

// ── Phase 5: Submodule Commands ──

export const listSubmodules = (repoPath: string) =>
  invoke<SubmoduleInfo[]>('list_submodules', { repoPath });

export const initSubmodules = (repoPath: string, paths: string[]) =>
  invoke<void>('init_submodules', { repoPath, paths });

export const updateSubmodules = (repoPath: string, paths: string[], recursive: boolean) =>
  invoke<void>('update_submodules', { repoPath, paths, recursive });

export const syncSubmodules = (repoPath: string, paths: string[]) =>
  invoke<void>('sync_submodules', { repoPath, paths });

export const addSubmodule = (repoPath: string, url: string, path: string) =>
  invoke<void>('add_submodule', { repoPath, url, path });

// ── Phase 5: Settings Commands ──

export const getSettings = () =>
  invoke<UserSettings>('get_settings');

export const saveSettings = (settings: UserSettings) =>
  invoke<void>('save_settings', { settings });

export const generateSshKey = (comment: string) =>
  invoke<string>('generate_ssh_key', { comment });

export const listSshKeys = () =>
  invoke<string[]>('list_ssh_keys');

// ── Phase 6: Commit & Repo Operations Commands ──

export const cherryPickCommit = (path: string, oid: string) =>
  invoke<string>('cherry_pick_commit', { path, oid });

export const cherryPickAbort = (path: string) =>
  invoke<void>('cherry_pick_abort', { path });

export const revertCommit = (path: string, oid: string) =>
  invoke<string>('revert_commit', { path, oid });

export const revertAbort = (path: string) =>
  invoke<void>('revert_abort', { path });

export const resetToCommit = (path: string, oid: string, mode: 'soft' | 'mixed' | 'hard') =>
  invoke<void>('reset_to_commit', { path, oid, mode });

export const cleanRepository = (path: string, dryRun: boolean, cleanDirs: boolean, includeIgnored: boolean) =>
  invoke<string[]>('clean_repository', { path, dryRun, cleanDirs, includeIgnored });

// ── Phase 7: Compare & Commit Tree Viewers Commands ──

export const getCommitTree = (path: string, oid: string) =>
  invoke<TreeEntryInfo[]>('get_commit_tree', { path, oid });

export const getCompareDiff = (path: string, base: string, target: string) =>
  invoke<FileDiff[]>('get_compare_diff', { path, base, target });

export const getFileContentPairRevisions = (path: string, filePath: string, base: string, target: string) =>
  invoke<FileContentPair>('get_file_content_pair_revisions', { path, filePath, base, target });

// ── Phase 9: Conflict Resolver Commands ──

export const getConflictStages = (repoPath: string, filePath: string) =>
  invoke<ConflictStages>('get_conflict_stages', { repoPath, filePath });

export const saveMergedResolution = (repoPath: string, filePath: string, mergedContent: string) =>
  invoke<void>('save_merged_resolution', { repoPath, filePath, mergedContent });



