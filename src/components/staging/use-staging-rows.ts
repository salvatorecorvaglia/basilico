/* ═══════════════════════════════════════════════════════
   Basilico — Staging Row Model
   Flattens the staged/unstaged/untracked sections into one virtualizable list
   ═══════════════════════════════════════════════════════ */

import { useMemo } from "react";
import type { FileStatus, RepoStatus } from "../../lib/git-types";

/**
 * One rendered line in the staging list.
 *
 * Sections are flattened into a single row list so one virtualizer can cover
 * the whole scroll area — otherwise a large merge, or a `.gitignore` change
 * that re-tracks thousands of files, renders every row as a real DOM node.
 */
export type StagingRow =
  | { id: string; kind: "header-conflicted"; count: number }
  | { id: string; kind: "conflicted-file"; file: string }
  | { id: string; kind: "header-staged"; count: number }
  | { id: string; kind: "empty-staged" }
  | { id: string; kind: "staged-file"; file: FileStatus }
  | { id: string; kind: "header-unstaged"; count: number }
  | { id: string; kind: "empty-unstaged" }
  | { id: string; kind: "unstaged-file"; file: FileStatus }
  | { id: string; kind: "untracked-file"; file: string };

export interface StagingSections {
  staged: FileStatus[];
  unstaged: FileStatus[];
  untracked: string[];
  conflicted: string[];
  totalUnstaged: number;
}

/** Split a repository status into the four sections the list renders. */
export function stagingSections(status: RepoStatus | null): StagingSections {
  const staged = status?.staged ?? [];
  const unstaged = status?.unstaged ?? [];
  const untracked = status?.untracked ?? [];
  const conflicted = status?.conflicted ?? [];
  return {
    staged,
    unstaged,
    untracked,
    conflicted,
    totalUnstaged: unstaged.length + untracked.length,
  };
}

/**
 * Build the flat row list. Pure and exported separately from the hook so the
 * ordering and collapse behaviour can be asserted without rendering.
 */
export function buildStagingRows(
  sections: StagingSections,
  stagedOpen: boolean,
  unstagedOpen: boolean,
): StagingRow[] {
  const { staged, unstaged, untracked, conflicted, totalUnstaged } = sections;
  const result: StagingRow[] = [];

  if (conflicted.length > 0) {
    result.push({
      id: "header-conflicted",
      kind: "header-conflicted",
      count: conflicted.length,
    });
    for (const file of conflicted) {
      result.push({ id: `conflicted:${file}`, kind: "conflicted-file", file });
    }
  }

  result.push({
    id: "header-staged",
    kind: "header-staged",
    count: staged.length,
  });
  if (stagedOpen) {
    if (staged.length === 0) {
      result.push({ id: "empty-staged", kind: "empty-staged" });
    } else {
      for (const file of staged) {
        result.push({
          id: `staged:${file.path}`,
          kind: "staged-file",
          file,
        });
      }
    }
  }

  result.push({
    id: "header-unstaged",
    kind: "header-unstaged",
    count: totalUnstaged,
  });
  if (unstagedOpen) {
    if (totalUnstaged === 0) {
      result.push({ id: "empty-unstaged", kind: "empty-unstaged" });
    } else {
      for (const file of unstaged) {
        result.push({
          id: `unstaged:${file.path}`,
          kind: "unstaged-file",
          file,
        });
      }
      for (const file of untracked) {
        result.push({
          id: `untracked:${file}`,
          kind: "untracked-file",
          file,
        });
      }
    }
  }

  return result;
}

/** Memoized [`buildStagingRows`] for the component. */
export function useStagingRows(
  sections: StagingSections,
  stagedOpen: boolean,
  unstagedOpen: boolean,
): StagingRow[] {
  const { staged, unstaged, untracked, conflicted, totalUnstaged } = sections;
  return useMemo(
    () =>
      buildStagingRows(
        { staged, unstaged, untracked, conflicted, totalUnstaged },
        stagedOpen,
        unstagedOpen,
      ),
    [
      staged,
      unstaged,
      untracked,
      conflicted,
      totalUnstaged,
      stagedOpen,
      unstagedOpen,
    ],
  );
}
