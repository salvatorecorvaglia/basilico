/* ═══════════════════════════════════════════════════════
   Basilico — Git Type Definitions
   Mirrors Rust serde types for full type safety
   ═══════════════════════════════════════════════════════ */

// ── Repository ──

export interface RepoInfo {
  path: string;
  name: string;
  headBranch: string | null;
  isBare: boolean;
  isEmpty: boolean;
  state: string;
}

export interface RepoStatus {
  branch: string | null;
  ahead: number;
  behind: number;
  staged: FileStatus[];
  unstaged: FileStatus[];
  untracked: string[];
  conflicted: string[];
  state: string;
}

export interface FileStatus {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'typechange';
  isStaged: boolean;
}

// ── Branches ──

export interface BranchInfo {
  name: string;
  isHead: boolean;
  isRemote: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  oid: string;
}

// ── Remotes ──

export interface RemoteInfo {
  name: string;
  url: string | null;
  pushUrl: string | null;
}

// ── Tags ──

export interface TagInfo {
  name: string;
  oid: string;
  message: string | null;
  tagger: string | null;
  isAnnotated: boolean;
}

// ── Commit Graph ──

export interface GraphCommit {
  oid: string;
  shortOid: string;
  message: string;
  authorName: string;
  authorEmail: string;
  authorDate: number;
  committerName: string;
  committerDate: number;
  parentOids: string[];
  refs: RefLabel[];
  lane: number;
  edges: GraphEdge[];
}

export interface RefLabel {
  name: string;
  kind: 'LocalBranch' | 'RemoteBranch' | 'Tag' | 'Head';
}

export interface GraphEdge {
  fromLane: number;
  toLane: number;
  toOid: string;
  isMerge: boolean;
}

// ── Diffs ──

export interface FileDiff {
  oldPath: string | null;
  newPath: string | null;
  status: string;
  hunks: DiffHunkInfo[];
  stats: DiffStats;
  isBinary: boolean;
}

export interface DiffHunkInfo {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLineInfo[];
}

export interface DiffLineInfo {
  origin: '+' | '-' | ' ' | string;
  content: string;
  oldLineno: number | null;
  newLineno: number | null;
}

export interface DiffStats {
  additions: number;
  deletions: number;
}

// ── Tab ──

export interface RepoTab {
  id: string;
  path: string;
  name: string;
  isActive: boolean;
}

// ── UI State ──

export type ActiveView = 'graph' | 'staging' | 'diff' | 'blame' | 'history' | 'reflog' | 'search';

// ── Phase 3: Blame, History, Reflog, Stash Types ──

export interface BlameLine {
  lineNo: number;
  commitOid: string;
  shortOid: string;
  authorName: string;
  authorEmail: string;
  commitSummary: string;
  lineContent: string;
}

export interface FileHistoryEntry {
  commitOid: string;
  shortOid: string;
  authorName: string;
  authorEmail: string;
  authorDate: number;
  commitSummary: string;
  filePath: string;
}

export interface ReflogEntry {
  index: number;
  newOid: string;
  oldOid: string;
  selector: string;
  committerName: string;
  committerDate: number;
  message: string;
}

export interface StashInfo {
  index: number;
  name: string;
  oid: string;
  message: string;
}

