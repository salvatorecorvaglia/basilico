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

export const getFileDiff = (path: string, filePath: string) =>
  invoke<FileDiff>('get_file_diff', { path, filePath });

// ── Branch Commands ──

export const listBranches = (path: string) =>
  invoke<BranchInfo[]>('list_branches', { path });

// ── Tag Commands ──

export const listTags = (path: string) =>
  invoke<TagInfo[]>('list_tags', { path });
