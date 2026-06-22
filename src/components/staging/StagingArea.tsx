/* ═══════════════════════════════════════════════════════
   Basilico — StagingArea Component
   Displays Staged, Unstaged, and Untracked files
   ═══════════════════════════════════════════════════════ */

import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  Plus,
  Trash2,
  Undo2,
} from "lucide-react";
import { useState } from "react";
import {
  getDirectory,
  getFileName,
  getStatusColor,
  getStatusIcon,
} from "../../lib/utils";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import { CommitBox } from "./CommitBox";
import "./StagingArea.css";

export function StagingArea() {
  const {
    status,
    selectedFilePath,
    selectLocalFile,
    stageFiles,
    unstageFiles,
    discardChanges,
    saveStash,
    cherryPickAbort,
    revertAbort,
  } = useRepoStore();

  const { setActiveView, addNotification, openPrompt, openConfirm } =
    useUIStore();

  const [stagedOpen, setStagedOpen] = useState(true);
  const [unstagedOpen, setUnstagedOpen] = useState(true);

  const handleSaveStashPrompt = () => {
    openPrompt({
      title: "Save Stash",
      description: "Enter a message to describe your stash (optional).",
      fields: [
        {
          name: "message",
          label: "Stash Message",
          placeholder: "e.g., work in progress",
          required: false,
        },
      ],
      submitLabel: "Next",
      onSubmit: (values) => {
        const message = values.message || "";
        openConfirm({
          title: "Include Untracked Files?",
          message: "Would you like to include untracked files in the stash?",
          confirmLabel: "Include Untracked",
          cancelLabel: "Only Tracked Files",
          onConfirm: async () => {
            try {
              await saveStash(message.trim(), true);
              addNotification({
                type: "success",
                message: "Stash saved successfully",
              });
            } catch (err) {
              addNotification({
                type: "error",
                message: `Failed to save stash: ${err}`,
              });
            }
          },
          onCancel: async () => {
            try {
              await saveStash(message.trim(), false);
              addNotification({
                type: "success",
                message: "Stash saved successfully",
              });
            } catch (err) {
              addNotification({
                type: "error",
                message: `Failed to save stash: ${err}`,
              });
            }
          },
        });
      },
    });
  };

  if (!status) {
    return (
      <div className="staging-area-empty">
        <p>No repository status available</p>
      </div>
    );
  }

  const { staged, unstaged, untracked, conflicted } = status;
  const totalUnstaged = unstaged.length + untracked.length;

  const handleStageAll = () => {
    const allUnstaged = [...unstaged.map((f) => f.path), ...untracked];
    if (allUnstaged.length > 0) {
      stageFiles(allUnstaged);
    }
  };

  const handleUnstageAll = () => {
    const allStaged = staged.map((f) => f.path);
    if (allStaged.length > 0) {
      unstageFiles(allStaged);
    }
  };

  const handleFileClick = (
    path: string,
    isStaged: boolean,
    isConflicted = false,
  ) => {
    selectLocalFile(path, isStaged);
    if (isConflicted) {
      useRepoStore.getState().loadConflictStages(path);
      setActiveView("conflict-resolver");
    }
  };

  const handleCheckboxChange = (path: string, currentlyStaged: boolean) => {
    if (currentlyStaged) {
      unstageFiles([path]);
    } else {
      stageFiles([path]);
    }
  };

  const isCherryPicking =
    status.state === "CherryPick" || status.state === "CherryPickSequence";
  const isReverting =
    status.state === "Revert" || status.state === "RevertSequence";

  const handleCherryPickAbort = async () => {
    try {
      await cherryPickAbort();
      addNotification({
        type: "success",
        message: "Cherry-pick aborted successfully",
      });
    } catch (err) {
      addNotification({ type: "error", message: `Abort failed: ${err}` });
    }
  };

  const handleRevertAbort = async () => {
    try {
      await revertAbort();
      addNotification({
        type: "success",
        message: "Revert aborted successfully",
      });
    } catch (err) {
      addNotification({ type: "error", message: `Abort failed: ${err}` });
    }
  };

  // Shared context menu renderer
  const renderContextMenuContent = (
    filePath: string,
    isStaged: boolean,
    isUntracked: boolean,
    isConflicted: boolean,
  ) => (
    <ContextMenu.Portal>
      <ContextMenu.Content className="radix-context-menu">
        {!isConflicted && (
          <ContextMenu.Item
            className="context-menu-item"
            onSelect={() => {
              if (isStaged) {
                unstageFiles([filePath]);
              } else {
                stageFiles([filePath]);
              }
            }}
          >
            {isStaged ? <Undo2 size={12} /> : <Plus size={12} />}
            <span>{isStaged ? "Unstage File" : "Stage File"}</span>
          </ContextMenu.Item>
        )}
        {!isStaged && !isConflicted && (
          <ContextMenu.Item
            className="context-menu-item danger"
            onSelect={() => {
              openConfirm({
                title: isUntracked ? "Delete File" : "Discard Changes",
                message: isUntracked
                  ? `Are you sure you want to permanently delete ${getFileName(filePath)}?`
                  : `Are you sure you want to discard all changes in ${getFileName(filePath)}? This action cannot be undone.`,
                confirmLabel: isUntracked ? "Delete" : "Discard",
                isDanger: true,
                onConfirm: () => discardChanges([filePath]),
              });
            }}
          >
            <Trash2 size={12} />
            <span>{isUntracked ? "Delete File" : "Discard Changes"}</span>
          </ContextMenu.Item>
        )}
        <ContextMenu.Separator className="context-menu-divider" />
        <ContextMenu.Item
          className="context-menu-item"
          onSelect={() => {
            selectLocalFile(filePath, isStaged);
            setActiveView("blame");
          }}
        >
          <Clock size={12} />
          <span>View Blame</span>
        </ContextMenu.Item>
        <ContextMenu.Item
          className="context-menu-item"
          onSelect={() => {
            selectLocalFile(filePath, isStaged);
            setActiveView("history");
          }}
        >
          <Calendar size={12} />
          <span>View File History</span>
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu.Portal>
  );

  return (
    <div className="staging-area">
      <div className="staging-lists">
        {/* Cherry-Pick Active Banner */}
        {isCherryPicking && (
          <div className="staging-state-banner">
            <div className="staging-state-banner-info">
              <AlertTriangle size={14} />
              <span>Cherry-pick conflict in progress</span>
            </div>
            <div className="staging-state-banner-actions">
              <button
                type="button"
                className="staging-banner-btn"
                onClick={handleCherryPickAbort}
              >
                Abort Cherry-Pick
              </button>
            </div>
          </div>
        )}

        {/* Revert Active Banner */}
        {isReverting && (
          <div className="staging-state-banner">
            <div className="staging-state-banner-info">
              <AlertTriangle size={14} />
              <span>Revert conflict in progress</span>
            </div>
            <div className="staging-state-banner-actions">
              <button
                type="button"
                className="staging-banner-btn"
                onClick={handleRevertAbort}
              >
                Abort Revert
              </button>
            </div>
          </div>
        )}

        {/* Conflicted Files */}
        {conflicted.length > 0 && (
          <div className="staging-section conflicted">
            <div className="staging-section-header">
              <span className="staging-section-title">
                <AlertTriangle size={14} className="text-warning" />
                Merge Conflicts
              </span>
              <span className="staging-count badge-warning">
                {conflicted.length}
              </span>
            </div>
            <div className="staging-list">
              {conflicted.map((file) => (
                <ContextMenu.Root key={file}>
                  <ContextMenu.Trigger>
                    <div
                      className={`staging-file-row ${selectedFilePath === file ? "selected" : ""}`}
                      onClick={() => handleFileClick(file, false, true)}
                    >
                      <span
                        className="staging-file-status"
                        style={{ color: "var(--color-warning)" }}
                      >
                        !
                      </span>
                      <div className="staging-file-paths truncate">
                        <span className="file-name">{getFileName(file)}</span>
                        <span className="file-dir">{getDirectory(file)}</span>
                      </div>
                    </div>
                  </ContextMenu.Trigger>
                  {renderContextMenuContent(file, false, false, true)}
                </ContextMenu.Root>
              ))}
            </div>
          </div>
        )}

        {/* Staged Changes */}
        <div className="staging-section">
          <div
            className="staging-section-header"
            onClick={() => setStagedOpen(!stagedOpen)}
          >
            <button type="button" className="staging-chevron">
              {stagedOpen ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
            </button>
            <span className="staging-section-title">Staged Changes</span>
            <span className="staging-count">{staged.length}</span>
            <button
              type="button"
              className="staging-action-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleSaveStashPrompt();
              }}
              title="Stash staged and unstaged changes"
              style={{ marginLeft: staged.length > 0 ? "8px" : "auto" }}
            >
              Stash...
            </button>
            {staged.length > 0 && (
              <button
                type="button"
                className="staging-action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleUnstageAll();
                }}
                style={{ marginLeft: "8px" }}
              >
                Unstage All
              </button>
            )}
          </div>

          {stagedOpen && (
            <div className="staging-list">
              {staged.length === 0 ? (
                <div className="staging-empty-text">No staged changes</div>
              ) : (
                staged.map((file) => (
                  <ContextMenu.Root key={file.path}>
                    <ContextMenu.Trigger>
                      <div
                        className={`staging-file-row ${selectedFilePath === file.path ? "selected" : ""}`}
                        onClick={() => handleFileClick(file.path, true)}
                      >
                        <input
                          type="checkbox"
                          checked={true}
                          onChange={() => handleCheckboxChange(file.path, true)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span
                          className="staging-file-status"
                          style={{ color: getStatusColor(file.status) }}
                        >
                          {getStatusIcon(file.status)}
                        </span>
                        <div className="staging-file-paths truncate">
                          <span className="file-name">
                            {getFileName(file.path)}
                          </span>
                          <span className="file-dir">
                            {getDirectory(file.path)}
                          </span>
                        </div>
                      </div>
                    </ContextMenu.Trigger>
                    {renderContextMenuContent(file.path, true, false, false)}
                  </ContextMenu.Root>
                ))
              )}
            </div>
          )}
        </div>

        {/* Unstaged Changes */}
        <div className="staging-section">
          <div
            className="staging-section-header"
            onClick={() => setUnstagedOpen(!unstagedOpen)}
          >
            <button type="button" className="staging-chevron">
              {unstagedOpen ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
            </button>
            <span className="staging-section-title">Unstaged Changes</span>
            <span className="staging-count">{totalUnstaged}</span>
            {totalUnstaged > 0 && (
              <button
                type="button"
                className="staging-action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStageAll();
                }}
              >
                Stage All
              </button>
            )}
          </div>

          {unstagedOpen && (
            <div className="staging-list">
              {totalUnstaged === 0 ? (
                <div className="staging-empty-text">No unstaged changes</div>
              ) : (
                <>
                  {/* Modified / Deleted files */}
                  {unstaged.map((file) => (
                    <ContextMenu.Root key={file.path}>
                      <ContextMenu.Trigger>
                        <div
                          className={`staging-file-row ${selectedFilePath === file.path ? "selected" : ""}`}
                          onClick={() => handleFileClick(file.path, false)}
                        >
                          <input
                            type="checkbox"
                            checked={false}
                            onChange={() =>
                              handleCheckboxChange(file.path, false)
                            }
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span
                            className="staging-file-status"
                            style={{ color: getStatusColor(file.status) }}
                          >
                            {getStatusIcon(file.status)}
                          </span>
                          <div className="staging-file-paths truncate">
                            <span className="file-name">
                              {getFileName(file.path)}
                            </span>
                            <span className="file-dir">
                              {getDirectory(file.path)}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="staging-discard-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              openConfirm({
                                title: "Discard Changes",
                                message: `Are you sure you want to discard all changes in ${getFileName(file.path)}? This action cannot be undone.`,
                                confirmLabel: "Discard",
                                isDanger: true,
                                onConfirm: () => discardChanges([file.path]),
                              });
                            }}
                            title="Discard changes"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </ContextMenu.Trigger>
                      {renderContextMenuContent(file.path, false, false, false)}
                    </ContextMenu.Root>
                  ))}

                  {/* Untracked files */}
                  {untracked.map((file) => (
                    <ContextMenu.Root key={file}>
                      <ContextMenu.Trigger>
                        <div
                          className={`staging-file-row ${selectedFilePath === file ? "selected" : ""}`}
                          onClick={() => handleFileClick(file, false)}
                        >
                          <input
                            type="checkbox"
                            checked={false}
                            onChange={() => handleCheckboxChange(file, false)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span
                            className="staging-file-status"
                            style={{ color: "var(--color-success)" }}
                          >
                            ?
                          </span>
                          <div className="staging-file-paths truncate">
                            <span className="file-name">
                              {getFileName(file)}
                            </span>
                            <span className="file-dir">
                              {getDirectory(file)}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="staging-discard-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              openConfirm({
                                title: "Delete File",
                                message: `Are you sure you want to delete ${getFileName(file)}? This will permanently delete the file.`,
                                confirmLabel: "Delete",
                                isDanger: true,
                                onConfirm: () => discardChanges([file]),
                              });
                            }}
                            title="Delete file"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </ContextMenu.Trigger>
                      {renderContextMenuContent(file, false, true, false)}
                    </ContextMenu.Root>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Commit Box at bottom */}
      <CommitBox />
    </div>
  );
}
