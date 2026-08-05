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
import type { SubmoduleInfo } from "../../lib/git-types";
import * as commands from "../../lib/tauri-commands";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";

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
      addNotification({
        type: "error",
        message: `Failed to update submodules: ${err}`,
      });
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
      addNotification({
        type: "error",
        message: `Failed to sync submodules: ${err}`,
      });
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
      addNotification({
        type: "error",
        message: `Failed to add submodule: ${err}`,
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
          style={{ maxWidth: "600px", maxHeight: "80vh" }}
        >
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
          <div className="settings-body" style={{ padding: "var(--space-4)" }}>
            {/* Top Toolbar */}
            <div
              style={{
                display: "flex",
                gap: "var(--space-2)",
                marginBottom: "var(--space-4)",
              }}
            >
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
              <form
                onSubmit={handleAddSubmodule}
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
                    htmlFor="submodule-url-input"
                    style={{
                      fontSize: "11px",
                      fontWeight: 500,
                      display: "block",
                      marginBottom: "4px",
                    }}
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
                    htmlFor="submodule-path-input"
                    style={{
                      fontSize: "11px",
                      fontWeight: 500,
                      display: "block",
                      marginBottom: "4px",
                    }}
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

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
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
              <div
                style={{
                  textAlign: "center",
                  padding: "var(--space-6) 0",
                  color: "var(--text-tertiary)",
                }}
              >
                <span className="spinner-large" />
                <p style={{ marginTop: "var(--space-2)" }}>
                  Loading submodules...
                </p>
              </div>
            ) : submoduleList.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "var(--space-6) 0",
                  color: "var(--text-tertiary)",
                }}
              >
                <FolderGit2
                  size={32}
                  style={{
                    margin: "0 auto var(--space-2)",
                    color: "var(--text-tertiary)",
                  }}
                />
                <p style={{ fontWeight: 500 }}>No Submodules Found</p>
                <p style={{ fontSize: "11px" }}>
                  This repository has no configured Git submodules. Click
                  &quot;Add Submodule&quot; above to add one.
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
                {submoduleList.map((sm) => (
                  <div
                    key={sm.name}
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
                          {sm.name}
                        </span>
                        <span
                          className="truncate text-tertiary"
                          style={{ fontSize: "11px" }}
                        >
                          ({sm.path})
                        </span>
                      </div>
                      {sm.url && (
                        <div
                          style={{
                            fontSize: "10px",
                            color: "var(--text-tertiary)",
                            marginTop: "2px",
                          }}
                          className="truncate"
                        >
                          {sm.url}
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--space-2)",
                      }}
                    >
                      {sm.status === "up-to-date" ? (
                        <span
                          className="commit-ref ref-head"
                          style={{
                            fontSize: "10px",
                            display: "flex",
                            alignItems: "center",
                            gap: "3px",
                          }}
                        >
                          <CheckCircle size={10} /> Up-to-date
                        </span>
                      ) : (
                        <span
                          className="commit-ref ref-tag"
                          style={{
                            fontSize: "10px",
                            display: "flex",
                            alignItems: "center",
                            gap: "3px",
                          }}
                        >
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
