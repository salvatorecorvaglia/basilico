import { AlertTriangle, GitMerge, XCircle } from "lucide-react";
import type React from "react";
import { useShallow } from "zustand/react/shallow";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import "./ConflictBanner.css";
import { reportError } from "../../lib/git-error";
import type { RepoState } from "../../lib/git-types";

/** The operation a repository state belongs to. */
type Operation = "rebase" | "cherry-pick" | "revert" | "merge";

/**
 * Classify `RepositoryState`. Order matters: `RebaseMerge` contains "Merge",
 * and used to be treated as a merge — so Abort ran `git merge --abort`, which
 * fails mid-rebase, and the user had no way out without a terminal.
 */
function operationOf(state: RepoState): Operation | null {
  if (state.startsWith("Rebase") || state === "ApplyMailboxOrRebase") {
    return "rebase";
  }
  if (state.startsWith("CherryPick")) return "cherry-pick";
  if (state.startsWith("Revert")) return "revert";
  if (state === "Merge") return "merge";
  return null;
}

const OPERATION_LABEL: Record<Operation, string> = {
  rebase: "Rebase",
  "cherry-pick": "Cherry-pick",
  revert: "Revert",
  merge: "Merge",
};

/** What to do next when nothing is left unresolved. */
const NEXT_STEP: Record<Operation, string> = {
  rebase: "Continue or abort it from the Rebase view.",
  "cherry-pick": "Commit to conclude it, or abort.",
  revert: "Commit to conclude it, or abort.",
  merge: "All conflicts are resolved — commit to conclude the merge.",
};

export const ConflictBanner: React.FC = () => {
  const { status, abortMerge, cherryPickAbort, revertAbort, stepRebase } =
    useRepoStore(
      useShallow((s) => ({
        status: s.status,
        abortMerge: s.abortMerge,
        cherryPickAbort: s.cherryPickAbort,
        revertAbort: s.revertAbort,
        stepRebase: s.stepRebase,
      })),
    );
  const { setActiveView } = useUIStore(
    useShallow((s) => ({ setActiveView: s.setActiveView })),
  );

  if (!status) return null;

  const operation = operationOf(status.state);
  const count = status.conflicted?.length || 0;
  if (!operation && count === 0) return null;

  const firstConflictedFile = status.conflicted?.[0];
  const label = operation ? OPERATION_LABEL[operation] : "Conflicts";

  const handleOpenResolver = () => {
    if (firstConflictedFile) {
      useRepoStore
        .getState()
        .loadConflictStages(firstConflictedFile)
        .catch((err) => reportError(err, "Failed to load conflict"));
    }
    setActiveView("conflict-resolver");
  };

  const handleAbort = async () => {
    // Each of these rethrows after raising its own toast, and this is bound
    // straight to onClick — so without a catch, aborting a conflicted merge
    // that fails leaves an unhandled rejection.
    try {
      switch (operation) {
        case "rebase":
          await stepRebase("abort");
          break;
        case "cherry-pick":
          await cherryPickAbort();
          break;
        case "revert":
          await revertAbort();
          break;
        default:
          await abortMerge();
      }
    } catch (err) {
      reportError(err, "Abort failed");
    }
  };

  return (
    <div className="conflict-banner" role="alert">
      <div className="conflict-banner-info">
        <div className="conflict-banner-icon">
          <AlertTriangle size={18} />
        </div>
        <div>
          <span className="conflict-banner-title">
            {count > 0
              ? `${label}: conflicts to resolve`
              : `${label} in progress`}
          </span>
          <span className="conflict-banner-desc">
            {count > 0
              ? ` — ${count} file${count > 1 ? "s" : ""} need${count > 1 ? "" : "s"} manual resolution.`
              : operation
                ? ` — ${NEXT_STEP[operation]}`
                : ""}
          </span>
        </div>
      </div>
      <div className="conflict-banner-actions">
        {count > 0 && (
          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={handleOpenResolver}
          >
            <GitMerge size={14} />
            <span>Open Merge Editor</span>
          </button>
        )}
        {operation === "rebase" && (
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => setActiveView("rebase")}
          >
            <span>Open Rebase</span>
          </button>
        )}
        {operation && (
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={handleAbort}
          >
            <XCircle size={14} />
            <span>Abort</span>
          </button>
        )}
      </div>
    </div>
  );
};
