/* ═══════════════════════════════════════════════════════
   Basilico — Typed Tauri Command Wrappers
   ═══════════════════════════════════════════════════════ */

import { invoke } from "@tauri-apps/api/core";
import { useUIStore } from "../store/ui-store";
import type {
  AppError,
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
  SignatureInfo,
  StashInfo,
  SubmoduleInfo,
  TagInfo,
  TreeEntryInfo,
  UserSettings,
  WorktreeInfo,
} from "./git-types";

export interface InvokeOptions {
  silent?: boolean;
  errorPrefix?: string;
}

export function parseAppError(err: any): AppError {
  if (err && typeof err === "object" && "message" in err && "kind" in err) {
    return err as AppError;
  }
  return {
    message:
      typeof err === "string" ? err : err?.message || JSON.stringify(err),
    kind: "Unknown",
  };
}

async function invokeCommand<T>(
  cmd: string,
  args?: Record<string, any>,
  options?: InvokeOptions,
): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (err: any) {
    const appError = parseAppError(err);
    console.error(`[Tauri Command Error] ${cmd}:`, appError);

    if (!options?.silent) {
      const prefix = options?.errorPrefix ? `${options.errorPrefix}: ` : "";
      useUIStore.getState().addNotification({
        type: "error",
        message: `${prefix}${appError.message}`,
      });
    }

    throw appError;
  }
}

// ── Repository Commands ──

export const openRepo = (path: string, options?: InvokeOptions) =>
  invokeCommand<RepoInfo>("open_repo", { path }, options);

export const closeRepo = (path: string, options?: InvokeOptions) =>
  invokeCommand<void>("close_repo", { path }, options);

export const getStatus = (path: string, options?: InvokeOptions) =>
  invokeCommand<RepoStatus>("get_status", { path }, options);

export const listRemotes = (path: string, options?: InvokeOptions) =>
  invokeCommand<RemoteInfo[]>("list_remotes", { path }, options);

// ── Log Commands ──

export const getLog = (
  path: string,
  maxCommits?: number,
  options?: InvokeOptions,
) => invokeCommand<GraphCommit[]>("get_log", { path, maxCommits }, options);

// ── Diff Commands ──

export const getWorkdirDiff = (path: string, options?: InvokeOptions) =>
  invokeCommand<FileDiff[]>("get_workdir_diff", { path }, options);

export const getStagedDiff = (path: string, options?: InvokeOptions) =>
  invokeCommand<FileDiff[]>("get_staged_diff", { path }, options);

export const getCommitDiff = (
  path: string,
  oid: string,
  options?: InvokeOptions,
) => invokeCommand<FileDiff[]>("get_commit_diff", { path, oid }, options);

export const getFileDiff = (
  path: string,
  filePath: string,
  isStaged: boolean,
  options?: InvokeOptions,
) =>
  invokeCommand<FileDiff>(
    "get_file_diff",
    { path, filePath, isStaged },
    options,
  );

export interface FileContentPair {
  original: string;
  modified: string;
}

export const getFileContentPair = (
  path: string,
  filePath: string,
  isStaged: boolean,
  options?: InvokeOptions,
) =>
  invokeCommand<FileContentPair>(
    "get_file_content_pair",
    { path, filePath, isStaged },
    options,
  );

export const getFileContentAtRevision = (
  path: string,
  filePath: string,
  revision: string,
  options?: InvokeOptions,
) =>
  invokeCommand<string>(
    "get_file_content_at_revision",
    { path, filePath, revision },
    options,
  );

// ── Branch Commands ──

export const listBranches = (path: string, options?: InvokeOptions) =>
  invokeCommand<BranchInfo[]>("list_branches", { path }, options);

// ── Tag Commands ──

export const listTags = (path: string, options?: InvokeOptions) =>
  invokeCommand<TagInfo[]>("list_tags", { path }, options);

export const deleteTag = (
  path: string,
  name: string,
  options?: InvokeOptions,
) => invokeCommand<void>("delete_tag", { path, name }, options);

// ── Phase 2: Staging Commands ──

export const stageFiles = (
  path: string,
  files: string[],
  options?: InvokeOptions,
) => invokeCommand<void>("stage_files", { path, files }, options);

export const unstageFiles = (
  path: string,
  files: string[],
  options?: InvokeOptions,
) => invokeCommand<void>("unstage_files", { path, files }, options);

export const applyPatch = (
  path: string,
  patch: string,
  location: "index" | "workdir" | "both",
  options?: InvokeOptions,
) => invokeCommand<void>("apply_patch", { path, patch, location }, options);

export const discardChanges = (
  path: string,
  files: string[],
  options?: InvokeOptions,
) => invokeCommand<void>("discard_changes", { path, files }, options);

// ── Phase 2: Commit Commands ──

export const createCommit = (
  path: string,
  message: string,
  authorName?: string | null,
  authorEmail?: string | null,
  amend?: boolean,
  options?: InvokeOptions,
) =>
  invokeCommand<string>(
    "create_commit",
    { path, message, authorName, authorEmail, amend },
    options,
  );

// ── Phase 2: Branch Write Commands ──

export const createBranch = (
  path: string,
  name: string,
  startPoint?: string | null,
  options?: InvokeOptions,
) => invokeCommand<void>("create_branch", { path, name, startPoint }, options);

export const deleteBranch = (
  path: string,
  name: string,
  isRemote: boolean,
  options?: InvokeOptions,
) => invokeCommand<void>("delete_branch", { path, name, isRemote }, options);

export const checkoutBranch = (
  path: string,
  name: string,
  options?: InvokeOptions,
) => invokeCommand<void>("checkout_branch", { path, name }, options);

export const renameBranch = (
  path: string,
  currentName: string,
  newName: string,
  options?: InvokeOptions,
) =>
  invokeCommand<void>("rename_branch", { path, currentName, newName }, options);

// ── Phase 2: Merge Commands ──

export const mergeBranch = (
  path: string,
  branchName: string,
  options?: InvokeOptions,
) =>
  invokeCommand<"success" | "conflicts">(
    "merge_branch",
    { path, branchName },
    options,
  );

export const abortMerge = (path: string, options?: InvokeOptions) =>
  invokeCommand<void>("abort_merge", { path }, options);

export const getConflicts = (path: string, options?: InvokeOptions) =>
  invokeCommand<string[]>("get_conflicts", { path }, options);

export const resolveConflict = (
  path: string,
  filePath: string,
  options?: InvokeOptions,
) => invokeCommand<void>("resolve_conflict", { path, filePath }, options);

// ── Phase 2: Remote Commands ──

export const fetch = (path: string, remote: string, options?: InvokeOptions) =>
  invokeCommand<void>("fetch", { path, remote }, options);

export const push = (
  path: string,
  remote: string,
  branch: string,
  force: boolean,
  options?: InvokeOptions,
) => invokeCommand<void>("push", { path, remote, branch, force }, options);

export const pull = (
  path: string,
  remote: string,
  branch: string,
  options?: InvokeOptions,
) =>
  invokeCommand<"success" | "conflicts">(
    "pull",
    { path, remote, branch },
    options,
  );

// ── Phase 3: Blame Commands ──

export const getFileBlame = (
  path: string,
  filePath: string,
  commitOid?: string | null,
  options?: InvokeOptions,
) =>
  invokeCommand<BlameLine[]>(
    "get_file_blame",
    { path, filePath, commitOid },
    options,
  );

// ── Phase 3: History Commands ──

export const getFileHistory = (
  path: string,
  filePath: string,
  maxCommits?: number | null,
  options?: InvokeOptions,
) =>
  invokeCommand<FileHistoryEntry[]>(
    "get_file_history",
    { path, filePath, maxCommits },
    options,
  );

// ── Phase 3: Stash Commands ──

export const listStashes = (path: string, options?: InvokeOptions) =>
  invokeCommand<StashInfo[]>("list_stashes", { path }, options);

export const saveStash = (
  path: string,
  message: string,
  includeUntracked: boolean,
  options?: InvokeOptions,
) =>
  invokeCommand<void>(
    "save_stash",
    { path, message, includeUntracked },
    options,
  );

export const applyStash = (
  path: string,
  index: number,
  options?: InvokeOptions,
) => invokeCommand<void>("apply_stash", { path, index }, options);

export const popStash = (
  path: string,
  index: number,
  options?: InvokeOptions,
) => invokeCommand<void>("pop_stash", { path, index }, options);

export const dropStash = (
  path: string,
  index: number,
  options?: InvokeOptions,
) => invokeCommand<void>("drop_stash", { path, index }, options);

// ── Phase 3: Tag Creation & Push Commands ──

export const createTag = (
  path: string,
  name: string,
  targetOid: string,
  message?: string | null,
  force?: boolean,
  options?: InvokeOptions,
) =>
  invokeCommand<void>(
    "create_tag",
    { path, name, targetOid, message, force: !!force },
    options,
  );

export const pushTag = (
  path: string,
  remote: string,
  tagName: string,
  options?: InvokeOptions,
) => invokeCommand<void>("push_tag", { path, remote, tagName }, options);

// ── Phase 4: Rebase Commands ──

export const rebaseInit = (
  repoPath: string,
  upstream: string,
  options?: InvokeOptions,
) =>
  invokeCommand<RebaseTodoItem[]>(
    "rebase_init",
    { repoPath, upstream },
    options,
  );

export const rebaseWriteTodo = (
  repoPath: string,
  items: RebaseTodoItem[],
  options?: InvokeOptions,
) => invokeCommand<void>("rebase_write_todo", { repoPath, items }, options);

export const rebaseStep = (
  repoPath: string,
  action: string,
  commitMessage?: string | null,
  options?: InvokeOptions,
) =>
  invokeCommand<RebaseStatus>(
    "rebase_step",
    { repoPath, action, commitMessage },
    options,
  );

// ── Phase 4: Bisect Commands ──

export const bisectStart = (
  repoPath: string,
  bad: string,
  good: string,
  options?: InvokeOptions,
) =>
  invokeCommand<BisectState>("bisect_start", { repoPath, bad, good }, options);

export const bisectMark = (
  repoPath: string,
  status: string,
  options?: InvokeOptions,
) => invokeCommand<BisectState>("bisect_mark", { repoPath, status }, options);

export const bisectReset = (repoPath: string, options?: InvokeOptions) =>
  invokeCommand<void>("bisect_reset", { repoPath }, options);

// ── Phase 4: Search Commands ──

export const searchCommits = (
  repoPath: string,
  query: string,
  options?: InvokeOptions,
) =>
  invokeCommand<GraphCommit[]>("search_commits", { repoPath, query }, options);

export const grepCode = (
  repoPath: string,
  query: string,
  options?: InvokeOptions,
) => invokeCommand<GrepMatch[]>("grep_code", { repoPath, query }, options);

// ── Phase 5: Worktree Commands ──

export const listWorktrees = (repoPath: string, options?: InvokeOptions) =>
  invokeCommand<WorktreeInfo[]>("list_worktrees", { repoPath }, options);

export const addWorktree = (
  repoPath: string,
  path: string,
  branch?: string | null,
  newBranch?: string | null,
  options?: InvokeOptions,
) =>
  invokeCommand<void>(
    "add_worktree",
    { repoPath, path, branch, newBranch },
    options,
  );

export const removeWorktree = (
  repoPath: string,
  worktreePath: string,
  force: boolean,
  options?: InvokeOptions,
) =>
  invokeCommand<void>(
    "remove_worktree",
    { repoPath, worktreePath, force },
    options,
  );

export const pruneWorktrees = (repoPath: string, options?: InvokeOptions) =>
  invokeCommand<void>("prune_worktrees", { repoPath }, options);

// ── Phase 5: Submodule Commands ──

export const listSubmodules = (repoPath: string, options?: InvokeOptions) =>
  invokeCommand<SubmoduleInfo[]>("list_submodules", { repoPath }, options);

export const initSubmodules = (
  repoPath: string,
  paths: string[],
  options?: InvokeOptions,
) => invokeCommand<void>("init_submodules", { repoPath, paths }, options);

export const updateSubmodules = (
  repoPath: string,
  paths: string[],
  recursive: boolean,
  options?: InvokeOptions,
) =>
  invokeCommand<void>(
    "update_submodules",
    { repoPath, paths, recursive },
    options,
  );

export const syncSubmodules = (
  repoPath: string,
  paths: string[],
  options?: InvokeOptions,
) => invokeCommand<void>("sync_submodules", { repoPath, paths }, options);

export const addSubmodule = (
  repoPath: string,
  url: string,
  path: string,
  options?: InvokeOptions,
) => invokeCommand<void>("add_submodule", { repoPath, url, path }, options);

// ── Phase 5: Settings Commands ──

export const getSettings = (options?: InvokeOptions) =>
  invokeCommand<UserSettings>("get_settings", undefined, options);

export const saveSettings = (settings: UserSettings, options?: InvokeOptions) =>
  invokeCommand<void>("save_settings", { settings }, options);

export const generateSshKey = (comment: string, options?: InvokeOptions) =>
  invokeCommand<string>("generate_ssh_key", { comment }, options);

export const listSshKeys = (options?: InvokeOptions) =>
  invokeCommand<string[]>("list_ssh_keys", undefined, options);

// ── Phase 6: Commit & Repo Operations Commands ──

export const cherryPickCommit = (
  path: string,
  oid: string,
  options?: InvokeOptions,
) => invokeCommand<string>("cherry_pick_commit", { path, oid }, options);

export const cherryPickAbort = (path: string, options?: InvokeOptions) =>
  invokeCommand<void>("cherry_pick_abort", { path }, options);

export const revertCommit = (
  path: string,
  oid: string,
  options?: InvokeOptions,
) => invokeCommand<string>("revert_commit", { path, oid }, options);

export const revertAbort = (path: string, options?: InvokeOptions) =>
  invokeCommand<void>("revert_abort", { path }, options);

export const resetToCommit = (
  path: string,
  oid: string,
  mode: "soft" | "mixed" | "hard",
  options?: InvokeOptions,
) => invokeCommand<void>("reset_to_commit", { path, oid, mode }, options);

// ── Phase 7: Compare & Commit Tree Viewers Commands ──

export const getCommitTree = (
  path: string,
  oid: string,
  options?: InvokeOptions,
) => invokeCommand<TreeEntryInfo[]>("get_commit_tree", { path, oid }, options);

export const getCompareDiff = (
  path: string,
  base: string,
  target: string,
  options?: InvokeOptions,
) =>
  invokeCommand<FileDiff[]>(
    "get_compare_diff",
    { path, base, target },
    options,
  );

export const getFileContentPairRevisions = (
  path: string,
  filePath: string,
  base: string,
  target: string,
  options?: InvokeOptions,
) =>
  invokeCommand<FileContentPair>(
    "get_file_content_pair_revisions",
    { path, filePath, base, target },
    options,
  );

// ── Phase 9: Conflict Resolver Commands ──

export const getConflictStages = (
  repoPath: string,
  filePath: string,
  options?: InvokeOptions,
) =>
  invokeCommand<ConflictStages>(
    "get_conflict_stages",
    { repoPath, filePath },
    options,
  );

export const saveMergedResolution = (
  repoPath: string,
  filePath: string,
  mergedContent: string,
  options?: InvokeOptions,
) =>
  invokeCommand<void>(
    "save_merged_resolution",
    { repoPath, filePath, mergedContent },
    options,
  );

// ── Phase 10: GPG & Stash Inspector Commands ──

export const getCommitSignature = (
  repoPath: string,
  oidStr: string,
  options?: InvokeOptions,
) =>
  invokeCommand<SignatureInfo | null>(
    "get_commit_signature",
    { repoPath, oidStr },
    options,
  );

export const getStashDiff = (
  repoPath: string,
  stashOid: string,
  options?: InvokeOptions,
) =>
  invokeCommand<FileDiff[]>("get_stash_diff", { repoPath, stashOid }, options);
