/* ═══════════════════════════════════════════════════════
   Basilico — Git Doctor & Lost Work Recovery Modal
   Storage diagnostics, git gc/fsck, and dangling commit recovery
   ═══════════════════════════════════════════════════════ */

import * as Dialog from "@radix-ui/react-dialog";
import {
  Activity,
  CheckCircle,
  Database,
  GitBranch,
  HardDrive,
  LifeBuoy,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { DanglingCommitInfo, DoctorReport } from "../../lib/git-types";
import * as commands from "../../lib/tauri-commands";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`;
}

interface GitDoctorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GitDoctorModal({ open, onOpenChange }: GitDoctorModalProps) {
  const { activeTabId, createBranch, refreshAll } = useRepoStore();
  const { addNotification, openPrompt } = useUIStore();

  const [report, setReport] = useState<DoctorReport | null>(null);
  const [dangling, setDangling] = useState<DanglingCommitInfo[]>([]);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [runningGc, setRunningGc] = useState(false);
  const [runningFsck, setRunningFsck] = useState(false);
  const [fsckOutput, setFsckOutput] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    if (!activeTabId) return;
    setLoadingHealth(true);
    try {
      const [rep, dang] = await Promise.all([
        commands.getRepoHealth(activeTabId, { silent: true }),
        commands.findDanglingCommits(activeTabId, { silent: true }),
      ]);
      setReport(rep);
      setDangling(dang);
    } catch {
      setReport(null);
      setDangling([]);
    } finally {
      setLoadingHealth(false);
    }
  }, [activeTabId]);

  useEffect(() => {
    if (open) {
      fetchHealth();
      setFsckOutput(null);
    }
  }, [open, fetchHealth]);

  const handleRunGc = async () => {
    if (!activeTabId) return;
    setRunningGc(true);
    try {
      const result = await commands.runGitGc(activeTabId);
      addNotification({
        type: "success",
        message: result || "Garbage collection completed",
      });
      await fetchHealth();
      await refreshAll();
    } catch (err) {
      addNotification({
        type: "error",
        message: `Garbage collection failed: ${err}`,
      });
    } finally {
      setRunningGc(false);
    }
  };

  const handleRunFsck = async () => {
    if (!activeTabId) return;
    setRunningFsck(true);
    try {
      const result = await commands.runGitFsck(activeTabId);
      setFsckOutput(result);
      addNotification({
        type: "info",
        message: "Database integrity check completed",
      });
    } catch (err) {
      addNotification({
        type: "error",
        message: `Integrity check failed: ${err}`,
      });
    } finally {
      setRunningFsck(false);
    }
  };

  const handleRestoreCommit = (commit: DanglingCommitInfo) => {
    openPrompt({
      title: "Restore Lost Work",
      description: `Create a new branch pointing to commit ${commit.shortOid} (${commit.message})`,
      fields: [
        {
          name: "branchName",
          label: "New Branch Name",
          placeholder: `recovered-${commit.shortOid}`,
          defaultValue: `recovered-${commit.shortOid}`,
          required: true,
        },
      ],
      submitLabel: "Restore to Branch",
      onSubmit: async (values) => {
        try {
          await createBranch(values.branchName.trim(), commit.oid);
          addNotification({
            type: "success",
            message: `Created branch "${values.branchName}" at ${commit.shortOid}`,
          });
          onOpenChange(false);
          await refreshAll();
        } catch (err) {
          addNotification({
            type: "error",
            message: `Failed to restore commit: ${err}`,
          });
        }
      },
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="settings-overlay" />
        <Dialog.Content
          className="settings-modal"
          style={{ maxWidth: "620px", maxHeight: "85vh" }}
        >
          {/* Header */}
          <div className="settings-header">
            <Dialog.Title asChild>
              <h2>
                <Activity size={18} />
                Git Doctor & Health Diagnostics
              </h2>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="settings-close-btn" aria-label="Close Doctor">
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          {/* Body */}
          <div className="settings-body" style={{ padding: "var(--space-4)" }}>
            {loadingHealth ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "var(--space-6) 0",
                  color: "var(--text-tertiary)",
                }}
              >
                <span className="spinner-large" />
                <p style={{ marginTop: "var(--space-2)" }}>
                  Analyzing repository health...
                </p>
              </div>
            ) : (
              <>
                {/* Storage Metrics Cards */}
                {report && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap: "var(--space-3)",
                      marginBottom: "var(--space-5)",
                    }}
                  >
                    <div
                      style={{
                        padding: "var(--space-3)",
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "var(--radius-md)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "11px",
                          color: "var(--text-tertiary)",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <HardDrive size={12} /> Total Repo Size
                      </div>
                      <div
                        style={{
                          fontSize: "16px",
                          fontWeight: 600,
                          marginTop: "4px",
                        }}
                      >
                        {formatBytes(report.totalSizeBytes)}
                      </div>
                      <div
                        style={{
                          fontSize: "10px",
                          color: "var(--text-tertiary)",
                          marginTop: "2px",
                        }}
                      >
                        Git dir: {formatBytes(report.gitSizeBytes)}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: "var(--space-3)",
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "var(--radius-md)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "11px",
                          color: "var(--text-tertiary)",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <Database size={12} /> Loose / Packfiles
                      </div>
                      <div
                        style={{
                          fontSize: "16px",
                          fontWeight: 600,
                          marginTop: "4px",
                        }}
                      >
                        {report.looseObjectsCount} loose
                      </div>
                      <div
                        style={{
                          fontSize: "10px",
                          color: "var(--text-tertiary)",
                          marginTop: "2px",
                        }}
                      >
                        {report.packfilesCount} packfile(s)
                      </div>
                    </div>

                    <div
                      style={{
                        padding: "var(--space-3)",
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "var(--radius-md)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "11px",
                          color: "var(--text-tertiary)",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <LifeBuoy size={12} /> Lost Work Candidates
                      </div>
                      <div
                        style={{
                          fontSize: "16px",
                          fontWeight: 600,
                          marginTop: "4px",
                          color:
                            dangling.length > 0
                              ? "var(--accent-primary)"
                              : "inherit",
                        }}
                      >
                        {dangling.length} commit(s)
                      </div>
                      <div
                        style={{
                          fontSize: "10px",
                          color: "var(--text-tertiary)",
                          marginTop: "2px",
                        }}
                      >
                        Unreachable commits
                      </div>
                    </div>
                  </div>
                )}

                {/* Maintenance Operations */}
                <div
                  className="settings-section"
                  style={{ marginBottom: "var(--space-5)" }}
                >
                  <div className="settings-section-title">
                    Maintenance & Optimization
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "var(--space-3)",
                      marginTop: "var(--space-2)",
                    }}
                  >
                    <button
                      type="button"
                      className="settings-btn"
                      onClick={handleRunGc}
                      disabled={runningGc}
                      style={{ flex: 1 }}
                    >
                      <Sparkles
                        size={13}
                        className={runningGc ? "animate-spin" : ""}
                      />
                      <span>
                        {runningGc
                          ? "Optimizing..."
                          : "Run Garbage Collection (git gc)"}
                      </span>
                    </button>

                    <button
                      type="button"
                      className="settings-btn settings-btn-outline"
                      onClick={handleRunFsck}
                      disabled={runningFsck}
                      style={{ flex: 1 }}
                    >
                      <Wrench
                        size={13}
                        className={runningFsck ? "animate-spin" : ""}
                      />
                      <span>
                        {runningFsck
                          ? "Checking..."
                          : "Check Integrity (git fsck)"}
                      </span>
                    </button>
                  </div>

                  {fsckOutput && (
                    <div
                      style={{
                        marginTop: "var(--space-3)",
                        padding: "var(--space-3)",
                        background: "var(--bg-tertiary)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "var(--radius-md)",
                        fontSize: "11px",
                        fontFamily: "monospace",
                        whiteSpace: "pre-wrap",
                        maxHeight: "120px",
                        overflowY: "auto",
                      }}
                    >
                      {fsckOutput}
                    </div>
                  )}
                </div>

                {/* Lost Work / Dangling Commits Section */}
                <div className="settings-section">
                  <div className="settings-section-title">
                    Lost Work Recovery (Unreachable Commits)
                  </div>

                  {dangling.length === 0 ? (
                    <div
                      style={{
                        textAlign: "center",
                        padding: "var(--space-4) 0",
                        color: "var(--text-tertiary)",
                        fontSize: "12px",
                      }}
                    >
                      <CheckCircle
                        size={20}
                        style={{
                          margin: "0 auto var(--space-2)",
                          color: "var(--accent-primary)",
                        }}
                      />
                      No orphaned commits found. All commits are attached to
                      active branches.
                    </div>
                  ) : (
                    <div
                      style={{
                        maxHeight: "200px",
                        overflowY: "auto",
                        border: "1px solid var(--border-color)",
                        borderRadius: "var(--radius-md)",
                        background: "var(--bg-secondary)",
                      }}
                    >
                      {dangling.map((c) => (
                        <div
                          key={c.oid}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "var(--space-2) var(--space-3)",
                            borderBottom: "1px solid var(--border-subtle)",
                            fontSize: "12px",
                          }}
                        >
                          <div
                            style={{
                              flex: 1,
                              minWidth: 0,
                              paddingRight: "var(--space-3)",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: "monospace",
                                  fontWeight: 600,
                                  color: "var(--accent-primary)",
                                }}
                              >
                                {c.shortOid}
                              </span>
                              <span
                                className="truncate"
                                style={{ fontWeight: 500 }}
                              >
                                {c.message}
                              </span>
                            </div>
                            <div
                              style={{
                                fontSize: "10px",
                                color: "var(--text-tertiary)",
                                marginTop: "2px",
                              }}
                              className="truncate"
                            >
                              Action: {c.actionSubject || "Dangling commit"} —{" "}
                              {c.authorName}
                            </div>
                          </div>

                          <button
                            type="button"
                            className="hunk-btn hunk-btn-primary"
                            style={{ fontSize: "11px", height: "24px" }}
                            onClick={() => handleRestoreCommit(c)}
                          >
                            <GitBranch size={11} />
                            <span>Restore to Branch</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="settings-footer">
            <button
              type="button"
              className="settings-btn settings-btn-outline"
              onClick={() => onOpenChange(false)}
            >
              Close
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
