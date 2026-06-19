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
