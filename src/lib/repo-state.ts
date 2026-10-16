/* ═══════════════════════════════════════════════════════
   Basilico — Repository state labels
   ═══════════════════════════════════════════════════════ */

const LABELS: Record<string, string> = {
  Merge: "Merging",
  Revert: "Reverting",
  RevertSequence: "Reverting",
  CherryPick: "Cherry-picking",
  CherryPickSequence: "Cherry-picking",
  Bisect: "Bisecting",
  Rebase: "Rebasing",
  RebaseInteractive: "Rebasing",
  RebaseMerge: "Rebasing",
  ApplyMailbox: "Applying patches",
  ApplyMailboxOrRebase: "Rebasing",
};

/**
 * What the repository is in the middle of, in words — or `null` when it is
 * not in the middle of anything. The raw names ("CherryPickSequence") were
 * shown to users as-is.
 *
 * Takes a plain string: recent-repository entries persisted by older versions
 * carry the state untyped, and an unknown value is shown rather than dropped.
 */
export function describeRepoState(
  state: string | null | undefined,
): string | null {
  if (!state || state === "Clean") return null;
  return LABELS[state] ?? state;
}
