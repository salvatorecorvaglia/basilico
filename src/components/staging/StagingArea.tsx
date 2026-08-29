/* ═══════════════════════════════════════════════════════
   Basilico — StagingArea Component
   Displays Staged, Unstaged, and Untracked files
   ═══════════════════════════════════════════════════════ */

import * as ContextMenu from "@radix-ui/react-context-menu";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertTriangle, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  getDirectory,
  getFileName,
  getStatusColor,
  getStatusIcon,
} from "../../lib/utils";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import { CommitBox } from "./CommitBox";
import { StagingContextMenu } from "./StagingContextMenu";
import {
  type StagingRow,
  stagingSections,
  useStagingRows,
} from "./use-staging-rows";
import { useStagingVimKeys } from "./use-staging-vim-keys";
import "./StagingArea.css";

const ESTIMATED_ROW_HEIGHT = 34;

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
    resolveConflictWithSide,
    settings,
  } = useRepoStore(
    useShallow((s) => ({
      status: s.status,
      selectedFilePath: s.selectedFilePath,
      selectLocalFile: s.selectLocalFile,
      stageFiles: s.stageFiles,
      unstageFiles: s.unstageFiles,
      discardChanges: s.discardChanges,
      saveStash: s.saveStash,
      cherryPickAbort: s.cherryPickAbort,
      revertAbort: s.revertAbort,
      resolveConflictWithSide: s.resolveConflictWithSide,
      settings: s.settings,
    })),
  );

  const { setActiveView, addNotification, openPrompt, openConfirm } =
    useUIStore(
      useShallow((s) => ({
        setActiveView: s.setActiveView,
        addNotification: s.addNotification,
        openPrompt: s.openPrompt,
        openConfirm: s.openConfirm,
      })),
    );

  const [stagedOpen, setStagedOpen] = useState(true);
  const [unstagedOpen, setUnstagedOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sections = stagingSections(status);
  const { staged, unstaged, untracked } = sections;

  const rows = useStagingRows(sections, stagedOpen, unstagedOpen);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 15,
    getItemKey: (index) => rows[index]?.id ?? index,
  });

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
        {
          name: "includeUntracked",
          label: "Untracked Files",
          placeholder: "Include untracked files in the stash",
          type: "checkbox",
          defaultValue: "false",
        },
      ],
      submitLabel: "Save Stash",
      onSubmit: async (values) => {
        const message = values.message || "";
        const includeUntracked = values.includeUntracked === "true";
        try {
          await saveStash(message.trim(), includeUntracked);
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
  };

  useStagingVimKeys({
    enabled: !!settings?.vimModeEnabled,
    status,
    selectedFilePath,
    selectLocalFile,
    stageFiles,
    unstageFiles,
    setActiveView,
  });

  if (!status) {
    return (
      <div className="staging-area-empty">
        <p>No repository status available</p>
      </div>
    );
  }

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
    // Both store actions rethrow after logging, so an un-caught call here
    // produced an unhandled rejection on every failure the user never saw.
    selectLocalFile(path, isStaged).catch((err) => {
      console.error("Failed to load diff for", path, err);
    });
    if (isConflicted) {
      useRepoStore
        .getState()
        .loadConflictStages(path)
        .catch((err) => {
          console.error("Failed to load conflict stages for", path, err);
        });
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

  const handleDragStart = (
    e: React.DragEvent,
    file: string,
    isStaged: boolean,
  ) => {
    e.dataTransfer.setData("text/plain", JSON.stringify({ file, isStaged }));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDropOnStaged = async (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const raw = e.dataTransfer.getData("text/plain");
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data?.file && !data.isStaged) {
        await stageFiles([data.file]);
      }
    } catch {
      // Ignore invalid drag payload
    }
  };

  const handleDropOnUnstaged = async (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const raw = e.dataTransfer.getData("text/plain");
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data?.file && data.isStaged) {
        await unstageFiles([data.file]);
      }
    } catch {
      // Ignore invalid drag payload
    }
  };

  const createKeyDownHandler = (
    file: string,
    isStaged: boolean,
    isConflicted = false,
  ) => {
    return (e: React.KeyboardEvent) => {
      if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        handleCheckboxChange(file, isStaged);
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleFileClick(file, isStaged, isConflicted);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (!isStaged && !isConflicted) {
          e.preventDefault();
          const isUntracked = untracked.includes(file);
          openConfirm({
            title: isUntracked ? "Delete File" : "Discard Changes",
            message: isUntracked
              ? `Are you sure you want to delete ${getFileName(file)}? This will permanently delete the file.`
              : `Are you sure you want to discard all changes in ${getFileName(file)}? This action cannot be undone.`,
            confirmLabel: isUntracked ? "Delete" : "Discard",
            isDanger: true,
            onConfirm: () => discardChanges([file]),
          });
        }
      }
    };
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
  // Thin wrapper so the four call sites below stay readable: the menu itself
  // lives in StagingContextMenu.tsx.
  const renderContextMenuContent = (
    filePath: string,
    isStaged: boolean,
    isUntracked: boolean,
    isConflicted: boolean,
  ) => (
    <StagingContextMenu
      filePath={filePath}
      isStaged={isStaged}
      isUntracked={isUntracked}
      isConflicted={isConflicted}
      stageFiles={stageFiles}
      unstageFiles={unstageFiles}
      discardChanges={discardChanges}
      selectLocalFile={selectLocalFile}
      resolveConflictWithSide={resolveConflictWithSide}
      setActiveView={setActiveView}
      addNotification={addNotification}
      openConfirm={openConfirm}
    />
  );

  const renderRow = (row: StagingRow) => {
    switch (row.kind) {
      case "header-conflicted":
        return (
          <div className="staging-section-header">
            <span className="staging-section-title">
              <AlertTriangle size={14} className="text-warning" />
              Merge Conflicts
            </span>
            <span className="staging-count badge-warning">{row.count}</span>
          </div>
        );

      case "conflicted-file":
        return (
          <ContextMenu.Root>
            <ContextMenu.Trigger>
              <div
                className={`staging-file-row ${selectedFilePath === row.file ? "selected" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => handleFileClick(row.file, false, true)}
                onKeyDown={createKeyDownHandler(row.file, false, true)}
              >
                <span
                  className="staging-file-status"
                  style={{ color: "var(--color-warning)" }}
                >
                  !
                </span>
                <div className="staging-file-paths truncate">
                  <span className="file-name">{getFileName(row.file)}</span>
                  <span className="file-dir">{getDirectory(row.file)}</span>
                </div>
              </div>
            </ContextMenu.Trigger>
            {renderContextMenuContent(row.file, false, false, true)}
          </ContextMenu.Root>
        );

      case "header-staged":
        return (
          <div
            role="button"
            tabIndex={0}
            aria-expanded={stagedOpen}
            className="staging-section-header"
            onClick={() => setStagedOpen(!stagedOpen)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setStagedOpen(!stagedOpen);
              }
            }}
          >
            <button type="button" className="staging-chevron">
              {stagedOpen ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
            </button>
            <span className="staging-section-title">Staged Changes</span>
            <span className="staging-count">{row.count}</span>
            <button
              type="button"
              className="staging-action-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleSaveStashPrompt();
              }}
              title="Stash staged and unstaged changes"
              style={{ marginLeft: row.count > 0 ? "8px" : "auto" }}
            >
              Stash...
            </button>
            {row.count > 0 && (
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
        );

      case "empty-staged":
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: drop target only; the Stage/Unstage buttons and row key handlers are the keyboard path
          <div
            role="presentation"
            className="staging-empty-text"
            onDragOver={handleDragOver}
            onDrop={handleDropOnStaged}
          >
            No staged changes (drag unstaged files here to stage)
          </div>
        );

      case "staged-file":
        return (
          <ContextMenu.Root>
            <ContextMenu.Trigger>
              <div
                className={`staging-file-row ${selectedFilePath === row.file.path ? "selected" : ""}`}
                role="button"
                tabIndex={0}
                draggable
                onDragStart={(e) => handleDragStart(e, row.file.path, true)}
                onDragOver={handleDragOver}
                onDrop={handleDropOnStaged}
                onClick={() => handleFileClick(row.file.path, true)}
                onKeyDown={createKeyDownHandler(row.file.path, true, false)}
              >
                <input
                  type="checkbox"
                  checked={true}
                  onChange={() => handleCheckboxChange(row.file.path, true)}
                  onClick={(e) => e.stopPropagation()}
                />
                <span
                  className="staging-file-status"
                  style={{ color: getStatusColor(row.file.status) }}
                >
                  {getStatusIcon(row.file.status)}
                </span>
                <div className="staging-file-paths truncate">
                  <span className="file-name">
                    {getFileName(row.file.path)}
                  </span>
                  <span className="file-dir">
                    {getDirectory(row.file.path)}
                  </span>
                </div>
              </div>
            </ContextMenu.Trigger>
            {renderContextMenuContent(row.file.path, true, false, false)}
          </ContextMenu.Root>
        );

      case "header-unstaged":
        return (
          <div
            role="button"
            tabIndex={0}
            aria-expanded={unstagedOpen}
            className="staging-section-header"
            onClick={() => setUnstagedOpen(!unstagedOpen)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setUnstagedOpen(!unstagedOpen);
              }
            }}
          >
            <button type="button" className="staging-chevron">
              {unstagedOpen ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
            </button>
            <span className="staging-section-title">Unstaged Changes</span>
            <span className="staging-count">{row.count}</span>
            {row.count > 0 && (
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
        );

      case "empty-unstaged":
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: drop target only; the Stage/Unstage buttons and row key handlers are the keyboard path
          <div
            role="presentation"
            className="staging-empty-text"
            onDragOver={handleDragOver}
            onDrop={handleDropOnUnstaged}
          >
            No unstaged changes
          </div>
        );

      case "unstaged-file":
        return (
          <ContextMenu.Root>
            <ContextMenu.Trigger>
              <div
                className={`staging-file-row ${selectedFilePath === row.file.path ? "selected" : ""}`}
                role="button"
                tabIndex={0}
                draggable
                onDragStart={(e) => handleDragStart(e, row.file.path, false)}
                onDragOver={handleDragOver}
                onDrop={handleDropOnUnstaged}
                onClick={() => handleFileClick(row.file.path, false)}
                onKeyDown={createKeyDownHandler(row.file.path, false, false)}
              >
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => handleCheckboxChange(row.file.path, false)}
                  onClick={(e) => e.stopPropagation()}
                />
                <span
                  className="staging-file-status"
                  style={{ color: getStatusColor(row.file.status) }}
                >
                  {getStatusIcon(row.file.status)}
                </span>
                <div className="staging-file-paths truncate">
                  <span className="file-name">
                    {getFileName(row.file.path)}
                  </span>
                  <span className="file-dir">
                    {getDirectory(row.file.path)}
                  </span>
                </div>
                <button
                  type="button"
                  className="staging-discard-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    openConfirm({
                      title: "Discard Changes",
                      message: `Are you sure you want to discard all changes in ${getFileName(row.file.path)}? This action cannot be undone.`,
                      confirmLabel: "Discard",
                      isDanger: true,
                      onConfirm: () => discardChanges([row.file.path]),
                    });
                  }}
                  title="Discard changes"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </ContextMenu.Trigger>
            {renderContextMenuContent(row.file.path, false, false, false)}
          </ContextMenu.Root>
        );

      case "untracked-file":
        return (
          <ContextMenu.Root>
            <ContextMenu.Trigger>
              <div
                className={`staging-file-row ${selectedFilePath === row.file ? "selected" : ""}`}
                role="button"
                tabIndex={0}
                onDragOver={handleDragOver}
                onDrop={handleDropOnUnstaged}
                onClick={() => handleFileClick(row.file, false)}
                onKeyDown={createKeyDownHandler(row.file, false, false)}
              >
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => handleCheckboxChange(row.file, false)}
                  onClick={(e) => e.stopPropagation()}
                />
                <span
                  className="staging-file-status"
                  style={{ color: "var(--color-success)" }}
                >
                  ?
                </span>
                <div className="staging-file-paths truncate">
                  <span className="file-name">{getFileName(row.file)}</span>
                  <span className="file-dir">{getDirectory(row.file)}</span>
                </div>
                <button
                  type="button"
                  className="staging-discard-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    openConfirm({
                      title: "Delete File",
                      message: `Are you sure you want to delete ${getFileName(row.file)}? This will permanently delete the file.`,
                      confirmLabel: "Delete",
                      isDanger: true,
                      onConfirm: () => discardChanges([row.file]),
                    });
                  }}
                  title="Delete file"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </ContextMenu.Trigger>
            {renderContextMenuContent(row.file, false, true, false)}
          </ContextMenu.Root>
        );

      default:
        return null;
    }
  };

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

        <div ref={scrollRef} className="staging-lists-virtual">
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              if (!row) return null;
              const isFileRow =
                row.kind !== "header-conflicted" &&
                row.kind !== "header-staged" &&
                row.kind !== "header-unstaged" &&
                row.kind !== "empty-staged" &&
                row.kind !== "empty-unstaged";
              return (
                <div
                  key={row.id}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  className={
                    isFileRow
                      ? "staging-virtual-row-item"
                      : "staging-virtual-row-section"
                  }
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {renderRow(row)}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Commit Box at bottom */}
      <CommitBox />
    </div>
  );
}
