import type { StateCreator } from "zustand";
import type {
  BlameLine,
  BranchInfo,
  FileDiff,
  FileHistoryEntry,
  GraphCommit,
  RemoteInfo,
  RepoInfo,
  RepoStatus,
  TagInfo,
} from "../../lib/git-types";
import * as commands from "../../lib/tauri-commands";
import {
  beginLoading,
  beginRefresh,
  beginRequest,
  watchRequest,
} from "../store-helpers";
import type { RepoState } from "../types";

// The initial commit page size. A refresh must fetch at least this many, but
// if the user has scrolled further via loadMoreCommits, refetching only this
// many would silently truncate the list back down and lose their place —
// so refreshes request max(this, what's already loaded) instead.
const DEFAULT_COMMIT_PAGE_SIZE = 500;

/**
 * Fetch the commit log only if it could have changed.
 *
 * `get_log` walks the entire history (a topological sort yields nothing until
 * it has seen every commit) and returns hundreds of commits, and every
 * refresh — after a fetch, push, checkout, stash, or a watcher event — used
 * to pay for it. The ref fingerprint costs a few milliseconds; when it and
 * the graph filters match what the loaded log was built from, the log is
 * still current and is kept as is. That also keeps pages loaded with
 * "load more", which a refetch would have had to request again.
 *
 * Returns `null` for "unchanged, keep the current log".
 */
async function fetchLogIfChanged(
  get: () => RepoState,
  tabId: string,
  set: (state: Partial<RepoState>) => void,
): Promise<{ commits: GraphCommit[]; key: string | null } | null> {
  const finish = beginLoading(get, set, "commits");
  try {
    const {
      firstParentOnly,
      hideRemoteBranches,
      pathFilter,
      commits: loaded,
      logKey,
    } = get();

    // Without a usable fingerprint the log cannot be proven current: fetch it.
    let fingerprint: string | null = null;
    try {
      const value: unknown = await commands.getLogFingerprint(
        tabId,
        hideRemoteBranches,
        { silent: true },
      );
      if (typeof value === "string" && value.length > 0) fingerprint = value;
    } catch {
      // Fall through to fetching the log.
    }
    const key = fingerprint
      ? `${fingerprint}|${firstParentOnly}|${hideRemoteBranches}|${pathFilter}`
      : null;
    if (key !== null && key === logKey && loaded.length > 0) return null;

    const commits = await commands.getLog(
      tabId,
      Math.max(DEFAULT_COMMIT_PAGE_SIZE, loaded.length),
      firstParentOnly,
      hideRemoteBranches,
      pathFilter,
      { silent: true },
    );
    return { commits, key };
  } finally {
    finish();
  }
}

/**
 * The remote that repository-wide actions should target.
 *
 * Fetch, pull and push used to be hardcoded to `"origin"`, which meant a
 * repository whose remote is named anything else — a clone renamed to
 * `upstream`, a fork layout, a `git remote add` with a custom name — could not
 * sync at all from the UI. Several read-only surfaces reached for `remotes[0]`
 * instead, which is libgit2's ordering rather than a meaningful choice and
 * picks the wrong remote on any fork that has both `origin` and `upstream`.
 *
 * Preference order: whichever remote the checked-out branch actually tracks,
 * then a remote literally named `origin`, then the first remote, then nothing.
 * The tracked remote comes first: in a fork layout a branch tracking
 * `upstream/main` must sync with `upstream`, even though `origin` exists.
 */
export function selectDefaultRemote(state: {
  remotes: RemoteInfo[];
  branches: BranchInfo[];
}): string | null {
  // This runs inside every subscriber's render, so it must not throw: a
  // partially-populated store (a test fixture, a slice reset mid-flight) would
  // otherwise take the whole panel down rather than simply reporting "no
  // remote".
  const remotes = state.remotes ?? [];
  const branches = state.branches ?? [];
  if (remotes.length === 0) return null;

  const headUpstream = branches.find((b) => b.isHead && !b.isRemote)?.upstream;
  const tracked = headUpstream ? splitUpstream(headUpstream, remotes) : null;
  if (tracked) return tracked.remote;

  const origin = remotes.find((r) => r.name === "origin");
  if (origin) return origin.name;

  return remotes[0].name;
}

/**
 * Split a remote-tracking name (`upstream/feature/x`) into its remote and
 * branch. Remote names may contain `/` themselves, so the longest configured
 * remote that prefixes the name wins.
 */
function splitUpstream(
  upstream: string,
  remotes: RemoteInfo[],
): { remote: string; branch: string } | null {
  const match = [...remotes]
    .sort((a, b) => b.name.length - a.name.length)
    .find((r) => upstream.startsWith(`${r.name}/`));
  if (!match) return null;
  return { remote: match.name, branch: upstream.slice(match.name.length + 1) };
}

/** Where pull and push go for the checked-out branch. */
export interface SyncTarget {
  remote: string;
  /** The checked-out local branch. */
  localBranch: string;
  /** The branch on `remote`: the upstream's name, or `localBranch` if none. */
  remoteBranch: string;
  /** False when the branch has no upstream yet (its first push publishes it). */
  hasUpstream: boolean;
}

/**
 * Resolve the pull/push target from the branch's upstream tracking config.
 *
 * Pull and push used to target `<default remote>/<same name>` regardless of
 * what the branch tracks, so a branch tracking a differently-named branch —
 * or one on another remote — synced with the wrong ref. On a detached HEAD
 * there is no branch to sync, which the old code turned into pushing a
 * branch literally named `HEAD`; this returns `null` instead.
 */
export function selectSyncTarget(state: {
  remotes: RemoteInfo[];
  branches: BranchInfo[];
  status: RepoStatus | null;
}): SyncTarget | null {
  const localBranch = state.status?.branch;
  if (!localBranch || localBranch === "HEAD") return null;

  const remotes = state.remotes ?? [];
  const branches = state.branches ?? [];
  const local =
    branches.find((b) => !b.isRemote && b.name === localBranch) ??
    branches.find((b) => b.isHead && !b.isRemote);
  const tracked = local?.upstream
    ? splitUpstream(local.upstream, remotes)
    : null;
  if (tracked) {
    return {
      remote: tracked.remote,
      localBranch,
      remoteBranch: tracked.branch,
      hasUpstream: true,
    };
  }

  const remote = selectDefaultRemote(state);
  if (!remote) return null;
  return { remote, localBranch, remoteBranch: localBranch, hasUpstream: false };
}

/** The fetch URL of [`selectDefaultRemote`], for building forge deep links. */
export function selectDefaultRemoteUrl(state: {
  remotes: RemoteInfo[];
  branches: BranchInfo[];
}): string | null {
  const name = selectDefaultRemote(state);
  if (!name) return null;
  return (state.remotes ?? []).find((r) => r.name === name)?.url ?? null;
}

/** What a targeted refresh can reload besides status (always reloaded). */
export type RefreshPart =
  | "refs"
  | "log"
  | "repoInfo"
  | "stashes"
  | "remotes"
  | "worktrees"
  | "submodules";

export const ALL_REFRESH_PARTS: readonly RefreshPart[] = [
  "refs",
  "log",
  "repoInfo",
  "stashes",
  "remotes",
  "worktrees",
  "submodules",
];

export interface GitDataSlice {
  repoInfo: RepoInfo | null;
  status: RepoStatus | null;
  branches: BranchInfo[];
  tags: TagInfo[];
  remotes: RemoteInfo[];
  commits: GraphCommit[];
  firstParentOnly: boolean;
  hideRemoteBranches: boolean;
  pathFilter: string;
  selectedCommitOid: string | null;
  commitDiff: FileDiff[];
  blameLines: BlameLine[];
  fileHistory: FileHistoryEntry[];

  refreshGeneration: number;
  /** False once the backend has returned a short page. */
  hasMoreCommits: boolean;
  /**
   * The ref fingerprint and graph filters the loaded `commits` were built
   * from; a refresh with the same key skips refetching the log.
   */
  logKey: string | null;

  refreshStatus: () => Promise<void>;
  refreshCommitsAndStatus: () => Promise<void>;
  refreshBranches: () => Promise<void>;
  refreshAll: () => Promise<void>;
  /**
   * Refresh status plus only the listed parts — what an action can actually
   * have changed. `refreshAll` is every part; after a push, say, re-listing
   * stashes, remotes, worktrees and submodules was wasted work.
   */
  refresh: (parts: readonly RefreshPart[]) => Promise<void>;
  /**
   * Refresh after a watcher event. `refsChanged` means HEAD or a ref moved
   * outside the app (a CLI commit, checkout, fetch…), so the log reloads too.
   */
  refreshOnFileSystemChange: (refsChanged?: boolean) => Promise<void>;
  selectCommit: (oid: string | null) => Promise<void>;
  loadMoreCommits: (count: number) => Promise<void>;
  setGraphFilters: (filters: {
    firstParentOnly?: boolean;
    hideRemoteBranches?: boolean;
    pathFilter?: string;
  }) => Promise<void>;
  listMergedBranches: (targetBranch?: string) => Promise<BranchInfo[]>;
  loadFileBlame: (filePath: string, commitOid?: string | null) => Promise<void>;
  loadFileHistory: (filePath: string) => Promise<void>;
}

export const createGitDataSlice: StateCreator<
  RepoState,
  [],
  [],
  GitDataSlice
> = (set, get) => ({
  repoInfo: null,
  status: null,
  branches: [],
  tags: [],
  remotes: [],
  commits: [],
  firstParentOnly: false,
  hideRemoteBranches: false,
  pathFilter: "",
  selectedCommitOid: null,
  commitDiff: [],
  blameLines: [],
  fileHistory: [],

  refreshGeneration: 0,
  hasMoreCommits: true,
  logKey: null,

  refreshStatus: async () => {
    const { activeTabId, refreshGeneration } = get();
    if (!activeTabId) return;

    const statusTicket = beginRequest(get, "status");
    const finishRefresh = beginRefresh(get, set);
    try {
      const status = await commands.getStatus(activeTabId, { silent: true });
      // Guard: only apply if still the same tab and no newer request won
      if (
        get().refreshGeneration === refreshGeneration &&
        statusTicket.isCurrent()
      ) {
        set({ status });
      }
    } catch (err) {
      console.error("Failed to refresh status:", err);
      throw err;
    } finally {
      finishRefresh();
    }
  },

  refreshCommitsAndStatus: async () => {
    const { activeTabId, refreshGeneration } = get();
    if (!activeTabId) return;

    const statusTicket = beginRequest(get, "status");
    const logTicket = beginRequest(get, "log");
    const finishRefresh = beginRefresh(get, set);
    try {
      const [status, log] = await Promise.all([
        commands.getStatus(activeTabId, { silent: true }),
        fetchLogIfChanged(get, activeTabId, set),
      ]);
      // Guard: only apply if still the same tab, field by field
      if (get().refreshGeneration === refreshGeneration) {
        const update: Partial<RepoState> = {};
        if (statusTicket.isCurrent()) update.status = status;
        if (log && logTicket.isCurrent()) {
          update.commits = log.commits;
          update.logKey = log.key;
          update.hasMoreCommits = true;
        }
        set(update);
      }
    } catch (err) {
      console.error("Failed to refresh commits and status:", err);
      throw err;
    } finally {
      finishRefresh();
    }
  },

  refreshBranches: async () => {
    const { activeTabId, refreshGeneration } = get();
    if (!activeTabId) return;

    const refsTicket = beginRequest(get, "refs");
    try {
      const [branches, tags] = await Promise.all([
        commands.listBranches(activeTabId, { silent: true }),
        commands.listTags(activeTabId, { silent: true }),
      ]);
      // Guard: only apply if still the same tab and no newer request won
      if (
        get().refreshGeneration === refreshGeneration &&
        refsTicket.isCurrent()
      ) {
        set({ branches, tags });
      }
    } catch (err) {
      console.error("Failed to refresh branches:", err);
      throw err;
    }
  },

  refreshAll: () => get().refresh(ALL_REFRESH_PARTS),

  refresh: async (parts) => {
    const { activeTabId, refreshGeneration } = get();
    if (!activeTabId) return;
    const want = new Set(parts);
    const extraTickets = Object.fromEntries(
      ["remotes", "stashes", "repoInfo", "worktrees", "submodules"]
        .filter((part) => want.has(part as RefreshPart))
        .map((part) => [part, beginRequest(get, part)]),
    );

    const statusTicket = beginRequest(get, "status");
    const refsTicket = want.has("refs") ? beginRequest(get, "refs") : null;
    const logTicket = want.has("log") ? beginRequest(get, "log") : null;
    const finishRefresh = beginRefresh(get, set);
    try {
      const safeCall = async <T>(promise: Promise<T>): Promise<T | null> => {
        try {
          return await promise;
        } catch (e) {
          console.warn("Secondary refresh call failed:", e);
          return null;
        }
      };
      const skip = Promise.resolve(null);

      const [status, branches, tags, remotes, log, stashes, repoInfo] =
        await Promise.all([
          commands.getStatus(activeTabId, { silent: true }),
          want.has("refs")
            ? commands.listBranches(activeTabId, { silent: true })
            : skip,
          want.has("refs")
            ? safeCall(commands.listTags(activeTabId, { silent: true }))
            : skip,
          want.has("remotes")
            ? safeCall(commands.listRemotes(activeTabId, { silent: true }))
            : skip,
          want.has("log") ? fetchLogIfChanged(get, activeTabId, set) : skip,
          want.has("stashes")
            ? safeCall(commands.listStashes(activeTabId, { silent: true }))
            : skip,
          want.has("repoInfo")
            ? commands.getRepoInfo(activeTabId, { silent: true })
            : skip,
        ]);

      // Guard: only apply if still the same tab
      if (get().refreshGeneration === refreshGeneration) {
        // Fields a newer refresh already wrote keep that newer value.
        const update: Partial<RepoState> = {};
        if (remotes && extraTickets.remotes.isCurrent())
          update.remotes = remotes;
        if (stashes && extraTickets.stashes.isCurrent())
          update.stashes = stashes;
        if (repoInfo && extraTickets.repoInfo.isCurrent())
          update.repoInfo = repoInfo;
        if (statusTicket.isCurrent()) update.status = status;
        if (refsTicket?.isCurrent()) {
          if (branches) update.branches = branches;
          if (tags) update.tags = tags;
        }
        if (log && logTicket?.isCurrent()) {
          update.commits = log.commits;
          update.logKey = log.key;
          update.hasMoreCommits = true;
        }
        set(update);

        // Load worktrees and submodules in background (non-blocking)
        if (want.has("worktrees")) {
          commands
            .listWorktrees(activeTabId, { silent: true })
            .then((worktrees) => {
              if (extraTickets.worktrees.isCurrent()) {
                set({ worktrees });
              }
            })
            .catch((err) => console.warn("Background refresh failed:", err));
        }
        if (want.has("submodules")) {
          commands
            .listSubmodules(activeTabId, { silent: true })
            .then((submodules) => {
              if (extraTickets.submodules.isCurrent()) {
                set({ submodules });
              }
            })
            .catch((err) => console.warn("Background refresh failed:", err));
        }
      }
    } catch (err) {
      console.error("Failed to refresh:", err);
      throw err;
    } finally {
      finishRefresh();
    }
  },

  refreshOnFileSystemChange: async (refsChanged = false) => {
    const { activeTabId, refreshGeneration } = get();
    if (!activeTabId) return;

    const statusTicket = beginRequest(get, "status");
    const refsTicket = beginRequest(get, "refs");
    const logTicket = refsChanged ? beginRequest(get, "log") : null;
    const finishRefresh = beginRefresh(get, set);
    try {
      // A plain file save refreshes status, branches and tags only: the commit
      // log is expensive (500 commits + graph layout) and a save does not
      // change it. When a ref moved — a commit, checkout or fetch made from a
      // terminal or an IDE — the log is stale too; without reloading it the
      // sidebar showed the new branch tip while the graph never included it.
      const [status, branches, tags, log] = await Promise.all([
        commands.getStatus(activeTabId, { silent: true }),
        commands.listBranches(activeTabId, { silent: true }),
        commands.listTags(activeTabId, { silent: true }),
        refsChanged
          ? fetchLogIfChanged(get, activeTabId, set)
          : Promise.resolve(null),
      ]);
      // Guard: only apply if still the same tab, field by field
      if (get().refreshGeneration === refreshGeneration) {
        const update: Partial<RepoState> = {};
        if (statusTicket.isCurrent()) update.status = status;
        if (refsTicket.isCurrent()) {
          update.branches = branches;
          update.tags = tags;
        }
        if (log && logTicket?.isCurrent()) {
          update.commits = log.commits;
          update.logKey = log.key;
          update.hasMoreCommits = true;
        }
        set(update);
      }
    } catch (err) {
      console.error("Failed to refresh on file change:", err);
    } finally {
      finishRefresh();
    }
  },

  selectCommit: async (oid: string | null) => {
    const request = beginRequest(get, "commitDiff");
    set({ selectedCommitOid: oid, commitDiff: [] });

    if (!oid) return;

    const { activeTabId } = get();
    if (!activeTabId) return;

    const finishLoading = beginLoading(get, set, "diff");
    try {
      const diff = await commands.getCommitDiff(activeTabId, oid, {
        silent: true,
      });
      // Guard: only apply if still the same tab and this commit is still selected
      if (request.isCurrent() && get().selectedCommitOid === oid) {
        set({ commitDiff: diff });
      }
    } catch (err) {
      if (!request.isCurrent()) return;
      console.error("Failed to load commit diff:", err);
      throw err;
    } finally {
      finishLoading();
    }
  },

  loadMoreCommits: async (count: number) => {
    const {
      activeTabId,
      commits,
      loadingStates,
      firstParentOnly,
      hideRemoteBranches,
      pathFilter,
      refreshGeneration,
      hasMoreCommits,
    } = get();
    if (!activeTabId || loadingStates.commits || !hasMoreCommits) return;

    const request = beginRequest(get, "logPage");
    const logVersion = get().logKey;
    const logRequest = watchRequest(get, "log");
    const finishLoading = beginLoading(get, set, "commits");
    try {
      // Request only the next page. The backend still walks the preceding
      // commits to keep graph lanes aligned, but no longer re-serialises them,
      // so scrolling is linear in what is actually new rather than quadratic.
      const page = await commands.getLog(
        activeTabId,
        count,
        firstParentOnly,
        hideRemoteBranches,
        pathFilter,
        { silent: true },
        commits.length,
      );

      // Guard: a tab switch during the fetch must not paste this tab's commits
      // over the newly active one.
      if (
        !request.isCurrent() ||
        !logRequest.isCurrent() ||
        get().refreshGeneration !== refreshGeneration ||
        get().firstParentOnly !== firstParentOnly ||
        get().hideRemoteBranches !== hideRemoteBranches ||
        get().pathFilter !== pathFilter ||
        get().logKey !== logVersion ||
        get().commits !== commits
      )
        return;

      if (page.length === 0) {
        set({ hasMoreCommits: false });
        return;
      }

      // Defensive de-duplication: if the history changed underneath us the
      // page boundary can overlap, and duplicate keys would break the list.
      const seen = new Set(get().commits.map((c) => c.oid));
      const fresh = page.filter((c) => !seen.has(c.oid));

      set({
        commits: [...get().commits, ...fresh],
        hasMoreCommits: page.length >= count,
      });
    } catch (err) {
      if (!request.isCurrent()) return;
      console.error("Failed to load more commits:", err);
      throw err;
    } finally {
      finishLoading();
    }
  },

  setGraphFilters: async (filters) => {
    set({
      firstParentOnly: filters.firstParentOnly ?? get().firstParentOnly,
      hideRemoteBranches:
        filters.hideRemoteBranches ?? get().hideRemoteBranches,
      pathFilter: filters.pathFilter ?? get().pathFilter,
    });
    await get().refreshCommitsAndStatus();
  },

  listMergedBranches: async (targetBranch) => {
    const { activeTabId } = get();
    if (!activeTabId) return [];
    try {
      return await commands.listMergedBranches(activeTabId, targetBranch, {
        errorPrefix: "Failed to detect merged branches",
      });
    } catch (err) {
      console.error("Failed to list merged branches:", err);
      return [];
    }
  },

  loadFileBlame: async (filePath, commitOid = null) => {
    const request = beginRequest(get, "blameLines");
    const { activeTabId } = get();
    if (!activeTabId) return;

    const finishLoading = beginLoading(get, set, "blame");
    set({ blameLines: [] });
    try {
      const lines = await commands.getFileBlame(
        activeTabId,
        filePath,
        commitOid,
        { silent: true },
      );
      if (request.isCurrent()) {
        set({ blameLines: lines });
      }
    } catch (err) {
      if (!request.isCurrent()) return;
      console.error("Failed to load file blame:", err);
      throw err;
    } finally {
      finishLoading();
    }
  },

  loadFileHistory: async (filePath) => {
    const request = beginRequest(get, "fileHistory");
    const { activeTabId } = get();
    if (!activeTabId) return;

    const finishLoading = beginLoading(get, set, "history");
    set({ fileHistory: [] });
    try {
      const history = await commands.getFileHistory(
        activeTabId,
        filePath,
        null,
        { silent: true },
      );
      if (request.isCurrent()) {
        set({ fileHistory: history });
      }
    } catch (err) {
      if (!request.isCurrent()) return;
      console.error("Failed to load file history:", err);
      throw err;
    } finally {
      finishLoading();
    }
  },
});
