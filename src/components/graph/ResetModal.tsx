import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import "./ResetModal.css";

type ResetMode = "soft" | "mixed" | "hard";

export function ResetModal() {
  const { resetModalOpen, resetCommitOid, closeResetModal, addNotification } =
    useUIStore();
  const { resetToCommit } = useRepoStore();

  const [mode, setMode] = useState<ResetMode>("mixed");
  const [confirmHard, setConfirmHard] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleReset = async () => {
    if (!resetCommitOid) return;
    if (mode === "hard" && !confirmHard) {
      addNotification({
        type: "warning",
        message: "Please confirm hard reset",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await resetToCommit(resetCommitOid, mode);
      addNotification({
        type: "success",
        message: `Successfully reset current branch (${mode}) to ${resetCommitOid.slice(0, 7)}`,
      });
      closeResetModal();
      // Reset confirmations
      setConfirmHard(false);
    } catch (err) {
      addNotification({
        type: "error",
        message: `Reset failed: ${err}`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setConfirmHard(false);
    closeResetModal();
  };

  const isOpen = resetModalOpen && !!resetCommitOid;

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="reset-modal-overlay" />
        <Dialog.Content className="reset-modal-content">
          {resetCommitOid && (
            <>
              {/* Header */}
              <div className="reset-modal-header">
                <div className="reset-modal-title-group">
                  <AlertTriangle className="reset-warn-icon" size={18} />
                  <Dialog.Title asChild>
                    <h2>Reset Current Branch</h2>
                  </Dialog.Title>
                </div>
                <Dialog.Close asChild>
                  <button
                    className="reset-modal-close-btn"
                    disabled={isSubmitting}
                    aria-label="Close dialog"
                  >
                    <X size={16} />
                  </button>
                </Dialog.Close>
              </div>

              {/* Body */}
              <div className="reset-modal-body">
                <Dialog.Description asChild>
                  <p className="reset-intro">
                    Reset the current branch HEAD to commit{" "}
                    <span className="text-mono text-primary font-semibold">
                      {resetCommitOid.slice(0, 8)}
                    </span>
                    .
                  </p>
                </Dialog.Description>

                {/* Mode Selector */}
                <div className="reset-modes-list">
                  {/* Mixed Option */}
                  <label
                    className={`reset-mode-option ${mode === "mixed" ? "active" : ""}`}
                  >
                    <input
                      type="radio"
                      name="resetMode"
                      value="mixed"
                      checked={mode === "mixed"}
                      onChange={() => setMode("mixed")}
                    />
                    <div className="reset-mode-details">
                      <span className="reset-mode-name">Mixed (--mixed)</span>
                      <span className="reset-mode-desc">
                        Keeps working directory changes, resets the staging
                        index. Staged changes are unstaged. (Recommended/Safe)
                      </span>
                    </div>
                  </label>

                  {/* Soft Option */}
                  <label
                    className={`reset-mode-option ${mode === "soft" ? "active" : ""}`}
                  >
                    <input
                      type="radio"
                      name="resetMode"
                      value="soft"
                      checked={mode === "soft"}
                      onChange={() => setMode("soft")}
                    />
                    <div className="reset-mode-details">
                      <span className="reset-mode-name">Soft (--soft)</span>
                      <span className="reset-mode-desc">
                        Keeps all staged and unstaged modifications intact. Only
                        moves HEAD. (Safe)
                      </span>
                    </div>
                  </label>

                  {/* Hard Option */}
                  <label
                    className={`reset-mode-option option-danger ${
                      mode === "hard" ? "active-danger" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="resetMode"
                      value="hard"
                      checked={mode === "hard"}
                      onChange={() => setMode("hard")}
                    />
                    <div className="reset-mode-details">
                      <span className="reset-mode-name text-danger">
                        Hard (--hard)
                      </span>
                      <span className="reset-mode-desc text-danger">
                        Discards ALL changes (both staged and unstaged). Files
                        in working tree match target commit exactly.
                        (Destructive)
                      </span>
                    </div>
                  </label>
                </div>

                {/* Hard Reset Danger Confirmation */}
                {mode === "hard" && (
                  <div className="reset-danger-warning animate-slide-down">
                    <div className="warning-banner">
                      <AlertTriangle size={16} />
                      <span>
                        WARNING: This will permanently delete all uncommitted
                        changes on disk.
                      </span>
                    </div>
                    <label className="confirm-checkbox-label">
                      <input
                        type="checkbox"
                        checked={confirmHard}
                        onChange={(e) => setConfirmHard(e.target.checked)}
                      />
                      <span>
                        I understand that this action is irreversible and I want
                        to discard my local changes.
                      </span>
                    </label>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="reset-modal-footer">
                <button
                  type="button"
                  className="reset-btn reset-btn-cancel"
                  onClick={handleClose}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`reset-btn ${
                    mode === "hard" ? "reset-btn-danger" : "reset-btn-primary"
                  }`}
                  onClick={handleReset}
                  disabled={isSubmitting || (mode === "hard" && !confirmHard)}
                >
                  {isSubmitting ? (
                    <span className="animate-spin mr-2">⏳</span>
                  ) : null}
                  Reset Current Branch ({mode.toUpperCase()})
                </button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
