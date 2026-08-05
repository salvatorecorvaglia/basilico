import { AlertTriangle, GitMerge, XCircle } from "lucide-react";
import type React from "react";
import { useShallow } from "zustand/react/shallow";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import "./ConflictBanner.css";

export const ConflictBanner: React.FC = () => {
  const { status, abortMerge, cherryPickAbort, revertAbort } = useRepoStore(
    useShallow((s) => ({
      status: s.status,
      abortMerge: s.abortMerge,
      cherryPickAbort: s.cherryPickAbort,
      revertAbort: s.revertAbort,
    })),
  );
  const { setActiveView } = useUIStore(
    useShallow((s) => ({ setActiveView: s.setActiveView })),
  );

  if (!status) return null;

  const isConflicted =
    (status.conflicted && status.conflicted.length > 0) ||
    status.state.includes("Merge") ||
    status.state.includes("Rebase") ||
    status.state.includes("CherryPick") ||
    status.state.includes("Revert");

  if (!isConflicted) return null;

  const count = status.conflicted?.length || 0;
  const firstConflictedFile = status.conflicted?.[0];

  const handleOpenResolver = () => {
    if (firstConflictedFile) {
      useRepoStore.getState().loadConflictStages(firstConflictedFile);
    }
    setActiveView("conflict-resolver");
  };

  const handleAbort = async () => {
    if (status.state.includes("CherryPick")) {
      await cherryPickAbort();
    } else if (status.state.includes("Revert")) {
      await revertAbort();
    } else {
      await abortMerge();
    }
  };

  return (
    <div className="conflict-banner">
      <div className="conflict-banner-info">
        <div className="conflict-banner-icon">
          <AlertTriangle size={18} />
        </div>
        <div>
          <span className="conflict-banner-title">
            Conflict State Detected ({status.state})
          </span>
          <span className="conflict-banner-desc">
            {count > 0
              ? ` — ${count} file${count > 1 ? "s" : ""} require manual resolution.`
              : " — Working tree contains unmerged conflict markers."}
          </span>
        </div>
      </div>
      <div className="conflict-banner-actions">
        <button
          type="button"
          className="conflict-banner-btn conflict-banner-btn-primary"
          onClick={handleOpenResolver}
        >
          <GitMerge size={14} />
          <span>Open Merge Editor</span>
        </button>
        <button
          type="button"
          className="conflict-banner-btn conflict-banner-btn-secondary"
          onClick={handleAbort}
        >
          <XCircle size={14} />
          <span>Abort</span>
        </button>
      </div>
    </div>
  );
};
