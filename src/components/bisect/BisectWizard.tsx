/* ═══════════════════════════════════════════════════════
   Basilico — BisectWizard Component
   Interactive visual Git bisect wizard
   ═══════════════════════════════════════════════════════ */

import {
  Check,
  CornerDownRight,
  HelpCircle,
  Play,
  RotateCcw,
  X,
} from "lucide-react";
import { useState } from "react";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import "./BisectWizard.css";

export function BisectWizard() {
  const { bisectState, startBisect, markBisect, resetBisect, commits } =
    useRepoStore();

  const { addNotification, openConfirm } = useUIStore();

  // Form states for setup
  const [badCommit, setBadCommit] = useState("HEAD");
  const [goodCommit, setGoodCommit] = useState("");
  const [isStarting, setIsStarting] = useState(false);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goodCommit.trim()) {
      addNotification({
        type: "warning",
        message: "Good commit is required to start bisecting",
      });
      return;
    }

    setIsStarting(true);
    try {
      await startBisect(badCommit.trim() || "HEAD", goodCommit.trim());
      addNotification({ type: "success", message: "Bisect session started!" });
    } catch (err) {
      addNotification({
        type: "error",
        message: `Failed to start bisect: ${err}`,
      });
    } finally {
      setIsStarting(false);
    }
  };

  const handleMark = async (status: "good" | "bad" | "skip") => {
    try {
      await markBisect(status);
      addNotification({
        type: "info",
        message: `Marked commit as ${status.toUpperCase()}`,
      });
    } catch (err) {
      addNotification({
        type: "error",
        message: `Failed to mark commit: ${err}`,
      });
    }
  };

  const handleReset = () => {
    openConfirm({
      title: "Abort Bisect",
      message: "Are you sure you want to abort the active bisect session?",
      confirmLabel: "Abort Session",
      isDanger: true,
      onConfirm: async () => {
        try {
          await resetBisect();
          addNotification({ type: "success", message: "Bisect session reset" });
        } catch (err) {
          addNotification({
            type: "error",
            message: `Failed to reset bisect: ${err}`,
          });
        }
      },
    });
  };

  const handleExitDirectly = async () => {
    try {
      await resetBisect();
      addNotification({ type: "success", message: "Bisect session closed" });
    } catch (err) {
      addNotification({
        type: "error",
        message: `Failed to exit bisect: ${err}`,
      });
    }
  };

  // Find commit message for current checked out commit
  const currentCommitDetails = commits.find(
    (c) => c.oid === bisectState?.currentOid,
  );

  // If not bisecting, show setup form
  if (!bisectState?.isBisecting) {
    return (
      <div className="bisect-wizard setup animate-fade-in">
        <div className="bisect-header">
          <h2>Start Git Bisect</h2>
          <p className="subtitle text-tertiary">
            Binary search your repository history to find the commit that
            introduced a bug.
          </p>
        </div>

        <form onSubmit={handleStart} className="bisect-setup-form">
          <div className="form-group">
            <label>Known BAD Commit (e.g. revision, SHA, branch)</label>
            <input
              type="text"
              placeholder="HEAD"
              value={badCommit}
              onChange={(e) => setBadCommit(e.target.value)}
            />
            <span className="help-text">
              Usually the latest commit containing the bug.
            </span>
          </div>

          <div className="form-group">
            <label>Known GOOD Commit (e.g. revision, SHA, tag)</label>
            <input
              type="text"
              placeholder="e.g. v1.2.0 or commit SHA"
              value={goodCommit}
              onChange={(e) => setGoodCommit(e.target.value)}
              required
            />
            <span className="help-text">
              A past commit where you verify the code worked correctly.
            </span>
          </div>

          <button
            type="submit"
            className="bisect-submit-btn"
            disabled={isStarting}
          >
            <Play size={14} />
            <span>{isStarting ? "Initializing..." : "Start Bisecting"}</span>
          </button>
        </form>
      </div>
    );
  }

  // Determine if bisect has finished (e.g., found the first bad commit)
  const isFinished = bisectState.message.includes("first bad commit");

  return (
    <div className="bisect-wizard active-session animate-fade-in">
      <div className="bisect-header">
        <div className="bisect-header-left">
          <h2>Git Bisect Session</h2>
          <span
            className={`badge-bisect-state ${isFinished ? "finished" : "testing"}`}
          >
            {isFinished ? "Finished" : "Testing"}
          </span>
        </div>
        <button
          className={isFinished ? "bisect-exit-btn" : "bisect-abort-btn"}
          onClick={isFinished ? handleExitDirectly : handleReset}
          title={isFinished ? "Exit Bisect" : "Abort Bisect"}
        >
          <RotateCcw size={12} />
          <span>{isFinished ? "Exit Bisect" : "Abort Bisect"}</span>
        </button>
      </div>

      <div className="bisect-body">
        {isFinished ? (
          <div className="bisect-finished-panel">
            <div className="finished-title text-success">
              <Check size={20} />
              <span>First Bad Commit Found!</span>
            </div>
            <div className="bisect-log-output text-mono">
              {bisectState.message}
            </div>
          </div>
        ) : (
          <>
            <div className="bisect-status-card">
              <div className="bisect-card-label">Progress Estimate</div>
              <div className="bisect-steps-info">
                {bisectState.stepsRemaining !== null ? (
                  <>
                    <span>
                      Roughly <b>{bisectState.stepsRemaining}</b> steps
                      remaining
                    </span>
                    <span className="commits-left text-tertiary">
                      ({bisectState.message.split("after this").shift()?.trim()}
                      )
                    </span>
                  </>
                ) : (
                  <span>{bisectState.message}</span>
                )}
              </div>
            </div>

            <div className="bisect-commit-card">
              <div className="bisect-card-label">Currently Testing Commit</div>
              {bisectState.currentOid ? (
                <div className="commit-test-details">
                  <div className="commit-sha text-mono text-success">
                    {bisectState.currentOid}
                  </div>
                  {currentCommitDetails ? (
                    <>
                      <div className="commit-message truncate">
                        {currentCommitDetails.message}
                      </div>
                      <div className="commit-author text-tertiary">
                        By {currentCommitDetails.authorName}
                      </div>
                    </>
                  ) : (
                    <div className="commit-message-loading text-tertiary italic">
                      Querying commit details...
                    </div>
                  )}
                </div>
              ) : (
                <div className="commit-test-details text-tertiary italic">
                  No active commit OID retrieved
                </div>
              )}
            </div>

            <div className="bisect-actions">
              <button
                className="bisect-action-btn btn-bad"
                onClick={() => handleMark("bad")}
                title="Mark this commit as containing the bug"
              >
                <X size={16} />
                <span>Mark BAD (Confirms Bug)</span>
              </button>
              <button
                className="bisect-action-btn btn-good"
                onClick={() => handleMark("good")}
                title="Mark this commit as NOT containing the bug"
              >
                <Check size={16} />
                <span>Mark GOOD (Works Fine)</span>
              </button>
              <button
                className="bisect-action-btn btn-skip"
                onClick={() => handleMark("skip")}
                title="Skip this commit (e.g. if code does not build or cannot be tested)"
              >
                <HelpCircle size={16} />
                <span>Skip Commit</span>
              </button>
            </div>
          </>
        )}

        <div className="bisect-terminal-logs">
          <div className="terminal-header">Git output console</div>
          <div className="terminal-body text-mono">
            <CornerDownRight size={12} className="text-secondary" />
            <pre>{bisectState.message}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}
