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
import { useCallback, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { reportError } from "../../lib/git-error";
import type { WorktreeInfo } from "../../lib/git-types";
import * as commands from "../../lib/tauri-commands";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import "./ToolModal.css";

interface WorktreeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WorktreeModal({ open, onOpenChange }: WorktreeModalProps) {
  const { activeTabId, branches, openRepository, refreshAll, openInIde } =
    useRepoStore(
      useShallow((s) => ({
        activeTabId: s.activeTabId,
        branches: s.branches,
        openRepository: s.openRepository,
        refreshAll: s.refreshAll,
        openInIde: s.openInIde,
      })),
    );
  const { addNotification, openConfirm } = useUIStore(
    useShallow((s) => ({
      addNotification: s.addNotification,
      openConfirm: s.openConfirm,
    })),
  );

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

  // Reset the form when the modal opens — and only then.
  //
  // `branches` was in the dependency list, and it gets a fresh array identity on
  // every refreshAll / refreshBranches / refreshOnFileSystemChange. The file
  // watcher fires those on any save in the repository, so an unrelated save
  // while the "Add worktree" form was open collapsed the form and discarded the
  // path the user was part-way through typing. The default branch is read
  // through a ref so opening still picks up the current list without making
  // every later change to it re-run this.
  const branchesRef = useRef(branches);
  branchesRef.current = branches;

  useEffect(() => {
    if (open) {
      fetchWorktrees();
      setShowAddForm(false);
      setNewPath("");
      setSelectedBranch(branchesRef.current[0]?.name || "main");
    }
  }, [open, fetchWorktrees]);

  const handleSwitchTab = async (wtPath: string) => {
    try {
      await openRepository(wtPath);
      addNotification({
        type: "success",
        message: `Opened workspace tab for worktree "${wtPath}"`,
      });
      onOpenChange(false);
    } catch (err) {
      reportError(err, "Failed to open worktree tab");
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
      reportError(err, "Failed to open worktree in editor");
    }
  };

  // Removing a worktree deletes a linked working directory, so it goes through
  // the same confirmation every other destructive action in the app uses.
  const handleRemoveWorktree = (wtPath: string) => {
    if (!activeTabId) return;
    openConfirm({
      title: "Remove Worktree",
      message: `Remove the worktree at "${wtPath}"? Its working directory will be deleted. Any uncommitted changes there cannot be recovered.`,
      confirmLabel: "Remove Worktree",
      isDanger: true,
      onConfirm: async () => {
        try {
          await commands.removeWorktree(activeTabId, wtPath, false);
          addNotification({
            type: "success",
            message: `Removed worktree at "${wtPath}"`,
          });
          await fetchWorktrees();
          await refreshAll();
        } catch (err) {
          reportError(err, "Failed to remove worktree");
        }
      },
    });
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
      reportError(err, "Failed to add worktree");
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="settings-overlay" />
        <Dialog.Content className="settings-modal tool-modal tool-modal-worktree">
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
                type="button"
                className="settings-close-btn"
                aria-label="Close Worktrees"
              >
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          {/* Body */}
          <div className="settings-body tool-modal-body">
            {/* Top Toolbar */}
            <div className="worktree-toolbar">
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
              <form className="tool-modal-form" onSubmit={handleAddWorktree}>
                <div>
                  <label
                    className="tool-modal-label"
                    htmlFor="worktree-path-input"
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
                    className="tool-modal-label"
                    htmlFor="worktree-branch-select"
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

                <div className="tool-modal-form-footer">
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
              <div className="tool-modal-state">
                <span className="spinner-large" />
                <p className="tool-modal-state-text">Loading worktrees...</p>
              </div>
            ) : worktreeList.length === 0 ? (
              <div className="tool-modal-state">
                <FolderTree className="tool-modal-state-icon" size={32} />
                <p className="tool-modal-strong">No Worktrees Found</p>
                <p className="tool-modal-small">
                  Only the main workspace directory exists. Click &quot;Add
                  Worktree&quot; to create a new linked worktree.
                </p>
              </div>
            ) : (
              <div className="tool-modal-list tool-modal-list-tall">
                {worktreeList.map((wt, idx) => (
                  <div className="tool-modal-row" key={wt.path}>
                    <div className="tool-modal-row-main">
                      <div className="tool-modal-row-title">
                        <span className="tool-modal-mono-strong">
                          {wt.name}
                        </span>
                        {wt.branch && (
                          <span className="commit-ref ref-branch worktree-badge">
                            <GitBranch size={9} /> {wt.branch}
                          </span>
                        )}
                        {idx === 0 && (
                          <span className="commit-ref ref-head tool-modal-tiny">
                            Main
                          </span>
                        )}
                      </div>
                      <div className="tool-modal-meta truncate">{wt.path}</div>
                    </div>

                    <div className="tool-modal-actions">
                      <button
                        type="button"
                        className="hunk-btn hunk-btn-primary tool-modal-btn-sm"
                        onClick={() => handleSwitchTab(wt.path)}
                        title="Open worktree as active tab"
                      >
                        <span>Open Tab</span>
                      </button>

                      <button
                        type="button"
                        className="hunk-btn hunk-btn-secondary tool-modal-btn-sm"
                        onClick={() => handleOpenInIde(wt.path)}
                        title="Open in external IDE"
                      >
                        <ExternalLink size={11} />
                      </button>

                      {idx > 0 && (
                        <button
                          type="button"
                          className="hunk-btn hunk-btn-secondary tool-modal-btn-sm tool-modal-btn-danger"
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
