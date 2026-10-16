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
import { useShallow } from "zustand/react/shallow";
import { reportError } from "../../lib/git-error";
import type { DanglingCommitInfo, DoctorReport } from "../../lib/git-types";
import * as commands from "../../lib/tauri-commands";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import "../modals/ToolModal.css";

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
  const { activeTabId, createBranch, refreshAll } = useRepoStore(
    useShallow((s) => ({
      activeTabId: s.activeTabId,
      createBranch: s.createBranch,
      refreshAll: s.refreshAll,
    })),
  );
  const { addNotification, openPrompt } = useUIStore(
    useShallow((s) => ({
      addNotification: s.addNotification,
      openPrompt: s.openPrompt,
    })),
  );

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
      reportError(err, "Garbage collection failed");
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
      reportError(err, "Integrity check failed");
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
          reportError(err, "Failed to restore commit");
        }
      },
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="settings-overlay" />
        <Dialog.Content className="settings-modal tool-modal tool-modal-doctor">
          {/* Header */}
          <div className="settings-header">
            <Dialog.Title asChild>
              <h2>
                <Activity size={18} />
                Git Doctor & Health Diagnostics
              </h2>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="settings-close-btn"
                aria-label="Close Doctor"
              >
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          {/* Body */}
          <div className="settings-body tool-modal-body">
            {loadingHealth ? (
              <div className="tool-modal-state">
                <span className="spinner-large" />
                <p className="tool-modal-state-text">
                  Analyzing repository health...
                </p>
              </div>
            ) : (
              <>
                {/* Storage Metrics Cards */}
                {report && (
                  <div className="doctor-metrics">
                    <div className="doctor-metric">
                      <div className="doctor-metric-label">
                        <HardDrive size={12} /> Total Repo Size
                      </div>
                      <div className="doctor-metric-value">
                        {formatBytes(report.totalSizeBytes)}
                      </div>
                      <div className="tool-modal-meta">
                        Git dir: {formatBytes(report.gitSizeBytes)}
                      </div>
                    </div>

                    <div className="doctor-metric">
                      <div className="doctor-metric-label">
                        <Database size={12} /> Loose / Packfiles
                      </div>
                      <div className="doctor-metric-value">
                        {report.looseObjectsCount} loose
                      </div>
                      <div className="tool-modal-meta">
                        {report.packfilesCount} packfile(s)
                      </div>
                    </div>

                    <div className="doctor-metric">
                      <div className="doctor-metric-label">
                        <LifeBuoy size={12} /> Lost Work Candidates
                      </div>
                      <div
                        className={`doctor-metric-value ${dangling.length > 0 ? "highlight" : ""}`}
                      >
                        {dangling.length} commit(s)
                      </div>
                      <div className="tool-modal-meta">Unreachable commits</div>
                    </div>
                  </div>
                )}

                {/* Maintenance Operations */}
                <div className="settings-section doctor-section">
                  <div className="settings-section-title">
                    Maintenance & Optimization
                  </div>
                  {report && !report.hasCommitGraph && (
                    <p className="doctor-hint">
                      This repository has no commit-graph, so history operations
                      (log, rebase, merge-base) are slower than they need to be.
                      Garbage collection writes one.
                    </p>
                  )}
                  <div className="doctor-actions">
                    <button
                      type="button"
                      className="settings-btn doctor-action-btn"
                      onClick={handleRunGc}
                      disabled={runningGc}
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
                      className="settings-btn settings-btn-outline doctor-action-btn"
                      onClick={handleRunFsck}
                      disabled={runningFsck}
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
                    <div className="doctor-output">{fsckOutput}</div>
                  )}
                </div>

                {/* Lost Work / Dangling Commits Section */}
                <div className="settings-section">
                  <div className="settings-section-title">
                    Lost Work Recovery (Unreachable Commits)
                  </div>

                  {dangling.length === 0 ? (
                    <div className="doctor-dangling-empty">
                      <CheckCircle
                        className="tool-modal-state-icon accent"
                        size={20}
                      />
                      No orphaned commits found. All commits are attached to
                      active branches.
                    </div>
                  ) : (
                    <div className="tool-modal-list doctor-dangling-list">
                      {dangling.map((c) => (
                        <div className="tool-modal-row compact" key={c.oid}>
                          <div className="tool-modal-row-main">
                            <div className="tool-modal-row-title">
                              <span className="doctor-dangling-oid">
                                {c.shortOid}
                              </span>
                              <span className="truncate tool-modal-strong">
                                {c.message}
                              </span>
                            </div>
                            <div className="tool-modal-meta truncate">
                              Action: {c.actionSubject || "Dangling commit"} —{" "}
                              {c.authorName}
                            </div>
                          </div>

                          <button
                            type="button"
                            className="hunk-btn hunk-btn-primary tool-modal-btn-sm"
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
