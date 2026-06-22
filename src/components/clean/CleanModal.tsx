import {
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  File,
  Folder,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import "./CleanModal.css";

type Step = "setup" | "preview" | "result";

export function CleanModal() {
  const { cleanModalOpen, closeCleanModal, addNotification } = useUIStore();
  const { cleanRepository } = useRepoStore();

  const [step, setStep] = useState<Step>("setup");
  const [cleanDirs, setCleanDirs] = useState(true);
  const [includeIgnored, setIncludeIgnored] = useState(false);
  const [paths, setPaths] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!cleanModalOpen) return null;

  const handleDryRun = async () => {
    setIsSubmitting(true);
    try {
      const results = await cleanRepository(true, cleanDirs, includeIgnored);
      setPaths(results);
      setStep("preview");
    } catch (err) {
      addNotification({ type: "error", message: `Dry-run failed: ${err}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExecuteClean = async () => {
    setIsSubmitting(true);
    try {
      const results = await cleanRepository(false, cleanDirs, includeIgnored);
      setPaths(results);
      setStep("result");
      addNotification({
        type: "success",
        message: `Successfully cleaned ${results.length} item(s)`,
      });
    } catch (err) {
      addNotification({ type: "error", message: `Clean failed: ${err}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setStep("setup");
    setPaths([]);
    setIncludeIgnored(false);
    closeCleanModal();
  };

  return (
    <div className="clean-modal-overlay animate-fade-in" onClick={handleClose}>
      <div className="clean-modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="clean-modal-header">
          <div className="clean-modal-title-group">
            <Trash2 className="clean-icon" size={18} />
            <h2>Clean Repository</h2>
          </div>
          <button
            className="clean-modal-close-btn"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            <X size={16} />
          </button>
        </div>

        {/* Wizard Steps indicator */}
        <div className="clean-wizard-steps">
          <span
            className={`wizard-step-node ${step === "setup" ? "active" : ""}`}
          >
            1. Configure
          </span>
          <ChevronRight size={12} className="wizard-step-sep" />
          <span
            className={`wizard-step-node ${step === "preview" ? "active" : ""}`}
          >
            2. Preview
          </span>
          <ChevronRight size={12} className="wizard-step-sep" />
          <span
            className={`wizard-step-node ${step === "result" ? "active" : ""}`}
          >
            3. Completed
          </span>
        </div>

        {/* Body */}
        <div className="clean-modal-body">
          {step === "setup" && (
            <div className="clean-step-setup animate-fade-in">
              <p className="clean-desc">
                Clean operations remove untracked files and directories from
                your working tree.
              </p>

              <div className="clean-options-group">
                <label className="clean-option-checkbox">
                  <input
                    type="checkbox"
                    checked={cleanDirs}
                    onChange={(e) => setCleanDirs(e.target.checked)}
                  />
                  <div className="option-label-details">
                    <span className="option-title">
                      Clean Untracked Directories (-d)
                    </span>
                    <span className="option-desc">
                      Remove entire directories that are not tracked by Git.
                    </span>
                  </div>
                </label>

                <label className="clean-option-checkbox option-warning-label">
                  <input
                    type="checkbox"
                    checked={includeIgnored}
                    onChange={(e) => setIncludeIgnored(e.target.checked)}
                  />
                  <div className="option-label-details">
                    <span className="option-title">
                      Include Ignored Files (-x)
                    </span>
                    <span className="option-desc">
                      Remove files and directories matched by your `.gitignore`
                      rules (e.g. build targets, node_modules).
                    </span>
                  </div>
                </label>
              </div>

              {includeIgnored && (
                <div className="clean-warning-callout">
                  <AlertTriangle size={16} />
                  <span>
                    Warning: Including ignored files can wipe out
                    configurations, secrets, build artifacts, or dependencies.
                    Proceed with caution.
                  </span>
                </div>
              )}
            </div>
          )}

          {step === "preview" && (
            <div className="clean-step-preview animate-fade-in">
              {paths.length === 0 ? (
                <div className="clean-empty-preview">
                  <CheckCircle size={32} className="empty-success-icon" />
                  <h3>Working directory is clean</h3>
                  <p>No untracked files or directories match your criteria.</p>
                </div>
              ) : (
                <>
                  <div className="preview-heading">
                    <AlertTriangle size={14} className="preview-warn-icon" />
                    <span>
                      The following {paths.length} item(s) will be permanently
                      deleted:
                    </span>
                  </div>

                  <div className="preview-paths-list text-mono">
                    {paths.map((p, idx) => (
                      <div key={idx} className="preview-path-item">
                        {p.endsWith("/") ? (
                          <Folder size={12} className="path-icon-folder" />
                        ) : (
                          <File size={12} className="path-icon-file" />
                        )}
                        <span className="path-text truncate" title={p}>
                          {p}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {step === "result" && (
            <div className="clean-step-result animate-fade-in">
              <div className="clean-result-success">
                <CheckCircle size={36} className="result-success-icon" />
                <h3>Repository Clean Completed</h3>
                <p>Deleted {paths.length} untracked items successfully.</p>
              </div>

              {paths.length > 0 && (
                <div className="result-paths-list text-mono">
                  {paths.map((p, idx) => (
                    <div key={idx} className="result-path-item">
                      <CheckCircle size={10} className="result-check-icon" />
                      <span className="path-text truncate" title={p}>
                        {p}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="clean-modal-footer">
          {step === "setup" && (
            <>
              <button
                className="clean-btn clean-btn-secondary"
                onClick={handleClose}
              >
                Cancel
              </button>
              <button
                className="clean-btn clean-btn-primary"
                onClick={handleDryRun}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <span className="spinner-small" />
                ) : (
                  "Scan Repository (Dry Run)"
                )}
              </button>
            </>
          )}

          {step === "preview" && (
            <>
              <button
                className="clean-btn clean-btn-secondary"
                onClick={() => setStep("setup")}
                disabled={isSubmitting}
              >
                Back
              </button>
              {paths.length > 0 ? (
                <button
                  className="clean-btn clean-btn-danger"
                  onClick={handleExecuteClean}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <span className="spinner-small" />
                  ) : (
                    "Clean Repository (Delete Files)"
                  )}
                </button>
              ) : (
                <button
                  className="clean-btn clean-btn-secondary"
                  onClick={handleClose}
                >
                  Close
                </button>
              )}
            </>
          )}

          {step === "result" && (
            <button
              className="clean-btn clean-btn-secondary"
              onClick={handleClose}
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
