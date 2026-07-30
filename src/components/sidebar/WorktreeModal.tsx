/* ═══════════════════════════════════════════════════════
   Basilico — Worktree Inspector Modal
   List, switch, add, remove, and open Git worktrees
   ═══════════════════════════════════════════════════════ */

import * as Dialog from "@radix-ui/react-dialog";
import {
  ExternalLink,
  FolderTree,
  GitBranch,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { WorktreeInfo } from "../../lib/git-types";
import * as commands from "../../lib/tauri-commands";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";

interface WorktreeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WorktreeModal({ open, onOpenChange }: WorktreeModalProps) {
  const { activeTabId, branches, openRepository, refreshAll, openInIde } =
    useRepoStore();
  const { addNotification } = useUIStore();

  const [worktreeList, setWorktreeList] = useState<WorktreeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchWorktrees = useCallback(async () => {
    if (!activeTabId) return;
    setLoading(true);
    try {
      const list = await commands.listWorktrees(activeTabId, { silent: true });
      setWorktreeList(list);
    } catch {
      setWorktreeList([]);
    } finally {
      setLoading(false);
    }
  }, [activeTabId]);

  useEffect(() => {
    if (open) {
      fetchWorktrees();
      setShowAddForm(false);
      setNewPath("");
      setSelectedBranch(branches[0]?.name || "main");
    }
  }, [open, fetchWorktrees, branches]);

  const handleSwitchTab = async (wtPath: string) => {
    try {
      await openRepository(wtPath);
      addNotification({
        type: "success",
        message: `Opened workspace tab for worktree "${wtPath}"`,
      });
      onOpenChange(false);
    } catch (err) {
      addNotification({
        type: "error",
        message: `Failed to open worktree tab: ${err}`,
      });
    }
  };

  const handleOpenInIde = async (wtPath: string) => {
    try {
      await openInIde(wtPath);
      addNotification({
        type: "success",
        message: `Opened worktree "${wtPath}" in external editor`,
      });
    } catch (err) {
      addNotification({
        type: "error",
        message: `Failed to open worktree in editor: ${err}`,
      });
    }
  };

  const handleRemoveWorktree = async (wtPath: string) => {
    if (!activeTabId) return;
    try {
      await commands.removeWorktree(activeTabId, wtPath, false);
      addNotification({
        type: "success",
        message: `Removed worktree at "${wtPath}"`,
      });
      await fetchWorktrees();
      await refreshAll();
    } catch (err) {
      addNotification({
        type: "error",
        message: `Failed to remove worktree: ${err}`,
      });
    }
  };

  const handleAddWorktree = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTabId || !newPath.trim()) return;
    setAdding(true);
    try {
      await commands.addWorktree(
        activeTabId,
        newPath.trim(),
        selectedBranch || undefined,
        undefined,
      );
      addNotification({
        type: "success",
        message: `Added worktree at "${newPath.trim()}"`,
      });
      setShowAddForm(false);
      setNewPath("");
      await fetchWorktrees();
      await refreshAll();
    } catch (err) {
      addNotification({
        type: "error",
        message: `Failed to add worktree: ${err}`,
      });
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="settings-overlay" />
        <Dialog.Content
          className="settings-modal"
          style={{ maxWidth: "620px", maxHeight: "80vh" }}
        >
          {/* Header */}
          <div className="settings-header">
            <Dialog.Title asChild>
              <h2>
                <FolderTree size={18} />
                Worktree Inspector
              </h2>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="settings-close-btn"
                aria-label="Close Worktrees"
              >
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          {/* Body */}
          <div className="settings-body" style={{ padding: "var(--space-4)" }}>
            {/* Top Toolbar */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginBottom: "var(--space-4)",
              }}
            >
              <button
                type="button"
                className={`settings-btn ${showAddForm ? "settings-btn-outline" : ""}`}
                onClick={() => setShowAddForm(!showAddForm)}
              >
                <Plus size={13} />
                <span>{showAddForm ? "Cancel" : "Add Worktree"}</span>
              </button>
            </div>

            {/* Add Worktree Form */}
            {showAddForm && (
              <form
                onSubmit={handleAddWorktree}
                style={{
                  padding: "var(--space-3)",
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "var(--radius-md)",
                  marginBottom: "var(--space-4)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-3)",
                }}
              >
                <div>
                  <label
                    htmlFor="worktree-path-input"
                    style={{
                      fontSize: "11px",
                      fontWeight: 500,
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Worktree Directory Path:
                  </label>
                  <input
                    id="worktree-path-input"
                    type="text"
                    className="settings-input"
                    placeholder="../basilico-feature"
                    value={newPath}
                    onChange={(e) => setNewPath(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label
                    htmlFor="worktree-branch-select"
                    style={{
                      fontSize: "11px",
                      fontWeight: 500,
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Checkout Branch:
                  </label>
                  <select
                    id="worktree-branch-select"
                    className="settings-input"
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                  >
                    {branches.map((b) => (
                      <option key={b.name} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="submit"
                    className="settings-btn"
                    disabled={adding}
                  >
                    <span>{adding ? "Adding..." : "Confirm Add Worktree"}</span>
                  </button>
                </div>
              </form>
            )}

            {/* Worktree List */}
            {loading ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "var(--space-6) 0",
                  color: "var(--text-tertiary)",
                }}
              >
                <span className="spinner-large" />
                <p style={{ marginTop: "var(--space-2)" }}>
                  Loading worktrees...
                </p>
              </div>
            ) : worktreeList.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "var(--space-6) 0",
                  color: "var(--text-tertiary)",
                }}
              >
                <FolderTree
                  size={32}
                  style={{
                    margin: "0 auto var(--space-2)",
                    color: "var(--text-tertiary)",
                  }}
                />
                <p style={{ fontWeight: 500 }}>No Worktrees Found</p>
                <p style={{ fontSize: "11px" }}>
                  Only the main workspace directory exists. Click &quot;Add
                  Worktree&quot; to create a new linked worktree.
                </p>
              </div>
            ) : (
              <div
                style={{
                  maxHeight: "320px",
                  overflowY: "auto",
                  border: "1px solid var(--border-color)",
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-secondary)",
                }}
              >
                {worktreeList.map((wt, idx) => (
                  <div
                    key={wt.path}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "var(--space-3)",
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
                          style={{ fontWeight: 600, fontFamily: "monospace" }}
                        >
                          {wt.name}
                        </span>
                        {wt.branch && (
                          <span
                            className="commit-ref ref-branch"
                            style={{
                              fontSize: "10px",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "2px",
                            }}
                          >
                            <GitBranch size={9} /> {wt.branch}
                          </span>
                        )}
                        {idx === 0 && (
                          <span
                            className="commit-ref ref-head"
                            style={{ fontSize: "10px" }}
                          >
                            Main
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: "10px",
                          color: "var(--text-tertiary)",
                          marginTop: "2px",
                        }}
                        className="truncate"
                      >
                        {wt.path}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--space-2)",
                      }}
                    >
                      <button
                        type="button"
                        className="hunk-btn hunk-btn-primary"
                        style={{ height: "24px", fontSize: "11px" }}
                        onClick={() => handleSwitchTab(wt.path)}
                        title="Open worktree as active tab"
                      >
                        <span>Open Tab</span>
                      </button>

                      <button
                        type="button"
                        className="hunk-btn hunk-btn-secondary"
                        style={{ height: "24px", fontSize: "11px" }}
                        onClick={() => handleOpenInIde(wt.path)}
                        title="Open in external IDE"
                      >
                        <ExternalLink size={11} />
                      </button>

                      {idx > 0 && (
                        <button
                          type="button"
                          className="hunk-btn hunk-btn-secondary"
                          style={{
                            height: "24px",
                            fontSize: "11px",
                            color: "var(--danger-color, #f85149)",
                          }}
                          onClick={() => handleRemoveWorktree(wt.path)}
                          title="Remove worktree"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
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
