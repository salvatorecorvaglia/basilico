/* ═══════════════════════════════════════════════════════
   Basilico — Submodule Manager Modal
   List, update, sync, and add Git submodules
   ═══════════════════════════════════════════════════════ */

import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  CheckCircle,
  FolderGit2,
  Plus,
  RefreshCw,
  RotateCw,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { reportError } from "../../lib/git-error";
import type { SubmoduleInfo } from "../../lib/git-types";
import * as commands from "../../lib/tauri-commands";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import "./ToolModal.css";

interface SubmoduleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SubmoduleModal({ open, onOpenChange }: SubmoduleModalProps) {
  const { activeTabId, submodules, refreshAll } = useRepoStore(
    useShallow((s) => ({
      activeTabId: s.activeTabId,
      submodules: s.submodules,
      refreshAll: s.refreshAll,
    })),
  );
  const { addNotification } = useUIStore(
    useShallow((s) => ({ addNotification: s.addNotification })),
  );

  const [submoduleList, setSubmoduleList] =
    useState<SubmoduleInfo[]>(submodules);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newPath, setNewPath] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchSubmodules = useCallback(async () => {
    if (!activeTabId) return;
    setLoading(true);
    try {
      const list = await commands.listSubmodules(activeTabId, { silent: true });
      setSubmoduleList(list);
    } catch {
      setSubmoduleList([]);
    } finally {
      setLoading(false);
    }
  }, [activeTabId]);

  useEffect(() => {
    if (open) {
      fetchSubmodules();
      setShowAddForm(false);
      setNewUrl("");
      setNewPath("");
    }
  }, [open, fetchSubmodules]);

  const handleUpdateAll = async () => {
    if (!activeTabId) return;
    setUpdating(true);
    try {
      await commands.updateSubmodules(activeTabId, [], true);
      addNotification({
        type: "success",
        message: "Updated all submodules recursively",
      });
      await fetchSubmodules();
      await refreshAll();
    } catch (err) {
      reportError(err, "Failed to update submodules");
    } finally {
      setUpdating(false);
    }
  };

  const handleSyncUrls = async () => {
    if (!activeTabId) return;
    setSyncing(true);
    try {
      await commands.syncSubmodules(activeTabId, []);
      addNotification({
        type: "success",
        message: "Synced submodule URLs",
      });
      await fetchSubmodules();
    } catch (err) {
      reportError(err, "Failed to sync submodules");
    } finally {
      setSyncing(false);
    }
  };

  const handleAddSubmodule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTabId || !newUrl.trim() || !newPath.trim()) return;
    setAdding(true);
    try {
      await commands.addSubmodule(activeTabId, newUrl.trim(), newPath.trim());
      addNotification({
        type: "success",
        message: `Added submodule "${newPath.trim()}"`,
      });
      setShowAddForm(false);
      setNewUrl("");
      setNewPath("");
      await fetchSubmodules();
      await refreshAll();
    } catch (err) {
      reportError(err, "Failed to add submodule");
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="settings-overlay" />
        <Dialog.Content className="settings-modal tool-modal tool-modal-submodule">
          {/* Header */}
          <div className="settings-header">
            <Dialog.Title asChild>
              <h2>
                <FolderGit2 size={18} />
                Submodule Manager
              </h2>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="settings-close-btn"
                aria-label="Close Submodules"
              >
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          {/* Body */}
          <div className="settings-body tool-modal-body">
            {/* Top Toolbar */}
            <div className="submodule-toolbar">
              <button
                type="button"
                className="settings-btn settings-btn-outline"
                onClick={handleUpdateAll}
                disabled={updating || loading}
              >
                <RefreshCw
                  size={13}
                  className={updating ? "animate-spin" : ""}
                />
                <span>{updating ? "Updating..." : "Update All"}</span>
              </button>

              <button
                type="button"
                className="settings-btn settings-btn-outline"
                onClick={handleSyncUrls}
                disabled={syncing || loading}
              >
                <RotateCw size={13} className={syncing ? "animate-spin" : ""} />
                <span>{syncing ? "Syncing..." : "Sync URLs"}</span>
              </button>

              <button
                type="button"
                className={`settings-btn ${showAddForm ? "settings-btn-outline" : ""}`}
                onClick={() => setShowAddForm(!showAddForm)}
              >
                <Plus size={13} />
                <span>{showAddForm ? "Cancel" : "Add Submodule"}</span>
              </button>
            </div>

            {/* Add Submodule Form */}
            {showAddForm && (
              <form className="tool-modal-form" onSubmit={handleAddSubmodule}>
                <div>
                  <label
                    className="tool-modal-label"
                    htmlFor="submodule-url-input"
                  >
                    Repository URL:
                  </label>
                  <input
                    id="submodule-url-input"
                    type="text"
                    className="settings-input"
                    placeholder="https://github.com/org/repo.git"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label
                    className="tool-modal-label"
                    htmlFor="submodule-path-input"
                  >
                    Destination Path:
                  </label>
                  <input
                    id="submodule-path-input"
                    type="text"
                    className="settings-input"
                    placeholder="vendor/my-submodule"
                    value={newPath}
                    onChange={(e) => setNewPath(e.target.value)}
                    required
                  />
                </div>

                <div className="tool-modal-form-footer">
                  <button
                    type="submit"
                    className="settings-btn"
                    disabled={adding}
                  >
                    <span>{adding ? "Adding..." : "Confirm Add"}</span>
                  </button>
                </div>
              </form>
            )}

            {/* Submodule List */}
            {loading ? (
              <div className="tool-modal-state">
                <span className="spinner-large" />
                <p className="tool-modal-state-text">Loading submodules...</p>
              </div>
            ) : submoduleList.length === 0 ? (
              <div className="tool-modal-state">
                <FolderGit2 className="tool-modal-state-icon" size={32} />
                <p className="tool-modal-strong">No Submodules Found</p>
                <p className="tool-modal-small">
                  This repository has no configured Git submodules. Click
                  &quot;Add Submodule&quot; above to add one.
                </p>
              </div>
            ) : (
              <div className="tool-modal-list tool-modal-list-tall">
                {submoduleList.map((sm) => (
                  <div className="tool-modal-row" key={sm.name}>
                    <div className="tool-modal-row-main">
                      <div className="tool-modal-row-title">
                        <span className="tool-modal-mono-strong">
                          {sm.name}
                        </span>
                        <span className="truncate text-tertiary tool-modal-small">
                          ({sm.path})
                        </span>
                      </div>
                      {sm.url && (
                        <div className="tool-modal-meta truncate">{sm.url}</div>
                      )}
                    </div>

                    <div className="tool-modal-actions">
                      {sm.status === "up-to-date" ? (
                        <span className="commit-ref ref-head submodule-status">
                          <CheckCircle size={10} /> Up-to-date
                        </span>
                      ) : (
                        <span className="commit-ref ref-tag submodule-status">
                          <AlertTriangle size={10} /> {sm.status}
                        </span>
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
