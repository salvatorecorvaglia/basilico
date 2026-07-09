/* ═══════════════════════════════════════════════════════
   Basilico — DiffView Component
   Monaco Diff Editor + Granular Hunk/Line Staging
   ═══════════════════════════════════════════════════════ */

import { DiffEditor } from "@monaco-editor/react";
import { Check, Eye, FileCode, Minus, Plus, Trash2 } from "lucide-react";
import type { editor } from "monaco-editor";
import { useEffect, useState } from "react";
import type { DiffHunkInfo } from "../../lib/git-types";
import {
  type FileContentPair,
  getFileContentPair,
} from "../../lib/tauri-commands";
import { useDarkMode } from "../../lib/use-dark-mode";
import { getLanguageFromPath } from "../../lib/utils";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import "./DiffView.css";

export function DiffView() {
  const isDark = useDarkMode();
  const {
    activeTabId,
    selectedFilePath,
    selectedFileIsStaged,
    localDiff,
    stageFiles,
    unstageFiles,
    discardChanges,
    applyPatch,
  } = useRepoStore();

  const { openConfirm, addNotification } = useUIStore();

  const [viewMode, setViewMode] = useState<"visual" | "hunk">("visual");
  const [splitView, setSplitView] = useState(true);
  const [contents, setContents] = useState<FileContentPair | null>(null);
  const [loadingContents, setLoadingContents] = useState(false);

  // Track checked line indices per hunk: key is hunkIndex, value is Set of lineIndices
  const [selectedLines, setSelectedLines] = useState<
    Record<number, Set<number>>
  >({});

  // Fetch full contents for Monaco editor when selected file changes
  useEffect(() => {
    if (!activeTabId || !selectedFilePath) {
      setContents(null);
      return;
    }

    setLoadingContents(true);
    setSelectedLines({});
    getFileContentPair(activeTabId, selectedFilePath, selectedFileIsStaged)
      .then((data) => {
        setContents(data);
      })
      .catch((err) => {
        console.error("Failed to load file contents:", err);
        setContents(null);
      })
      .finally(() => {
        setLoadingContents(false);
      });
  }, [activeTabId, selectedFilePath, selectedFileIsStaged]);

  if (!selectedFilePath) {
    return (
      <div className="diff-view-empty">
        <FileCode size={40} strokeWidth={1} />
        <h3>No File Selected</h3>
        <p>Select a file in the staging list to view its diff</p>
      </div>
    );
  }

  const handleStageFile = () => {
    if (selectedFileIsStaged) {
      unstageFiles([selectedFilePath]);
    } else {
      stageFiles([selectedFilePath]);
    }
  };

  const handleDiscardFile = () => {
    openConfirm({
      title: "Discard Changes",
      message: `Are you sure you want to discard all changes in ${selectedFilePath}? This action cannot be undone.`,
      confirmLabel: "Discard Changes",
      isDanger: true,
      onConfirm: () => {
        discardChanges([selectedFilePath]);
      },
    });
  };

  // Staging specific Hunk
  const handleStageHunk = async (hunk: DiffHunkInfo) => {
    const patch = constructHunkPatch(
      selectedFilePath,
      hunk,
      undefined,
      selectedFileIsStaged,
    );
    try {
      await applyPatch(patch, "index");
    } catch (err) {
      addNotification({
        type: "error",
        message: `Failed to ${selectedFileIsStaged ? "unstage" : "stage"} hunk: ${err}`,
      });
    }
  };

  // Staging selected lines
  const handleStageSelectedLines = async (
    hunkIndex: number,
    hunk: DiffHunkInfo,
  ) => {
    const lineIndices = selectedLines[hunkIndex];
    if (!lineIndices || lineIndices.size === 0) return;

    const patch = constructHunkPatch(
      selectedFilePath,
      hunk,
      lineIndices,
      selectedFileIsStaged,
    );
    try {
      await applyPatch(patch, "index");
      // Clear selection
      setSelectedLines((prev) => ({
        ...prev,
        [hunkIndex]: new Set(),
      }));
    } catch (err) {
      addNotification({
        type: "error",
        message: `Failed to ${selectedFileIsStaged ? "unstage" : "stage"} selected lines: ${err}`,
      });
    }
  };

  const handleLineCheck = (
    hunkIndex: number,
    lineIndex: number,
    checked: boolean,
  ) => {
    setSelectedLines((prev) => {
      const current = new Set(prev[hunkIndex] || []);
      if (checked) {
        current.add(lineIndex);
      } else {
        current.delete(lineIndex);
      }
      return {
        ...prev,
        [hunkIndex]: current,
      };
    });
  };

  // Helper to build patch string for hunk/lines
  const constructHunkPatch = (
    filePath: string,
    hunk: DiffHunkInfo,
    selectedLineIndices?: Set<number>,
    reverse = false,
  ): string => {
    let patch = `diff --git a/${filePath} b/${filePath}\n`;
    patch += `--- a/${filePath}\n`;
    patch += `+++ b/${filePath}\n`;

    const oldLines = hunk.oldLines;
    let newLines = hunk.newLines;

    // Adjust lines count in header if we do selective staging
    if (selectedLineIndices) {
      let newLineDelta = 0;
      hunk.lines.forEach((line, idx) => {
        const isSelected = selectedLineIndices.has(idx);
        if (line.origin === "+") {
          if (!isSelected) newLineDelta--;
        } else if (line.origin === "-") {
          if (!isSelected) newLineDelta++;
        }
      });
      newLines = (newLines as number) + newLineDelta;
    }

    if (reverse) {
      patch += `@@ -${hunk.newStart},${newLines} +${hunk.oldStart},${oldLines} @@\n`;
    } else {
      patch += `@@ -${hunk.oldStart},${oldLines} +${hunk.newStart},${newLines} @@\n`;
    }

    hunk.lines.forEach((line, idx) => {
      if (line.origin === " ") {
        patch += ` ${line.content}`;
      } else if (line.origin === "+") {
        const isSelected = selectedLineIndices
          ? selectedLineIndices.has(idx)
          : true;
        if (isSelected) {
          patch += reverse ? `-${line.content}` : `+${line.content}`;
        }
      } else if (line.origin === "-") {
        const isSelected = selectedLineIndices
          ? selectedLineIndices.has(idx)
          : true;
        if (isSelected) {
          patch += reverse ? `+${line.content}` : `-${line.content}`;
        } else {
          // Unselected deletion: keep original line
          patch += ` ${line.content}`;
        }
      }
    });

    return patch;
  };

  return (
    <div className="diff-view animate-fade-in">
      {/* Top Bar */}
      <div className="diff-view-header">
        <div className="diff-view-file-info truncate">
          <span className="diff-view-file-name truncate">
            {selectedFilePath}
          </span>
          {localDiff && (
            <span className="diff-view-file-stats text-mono">
              <span className="stat-add">+{localDiff.stats.additions}</span>
              <span className="stat-del">-{localDiff.stats.deletions}</span>
            </span>
          )}
        </div>

        <div className="diff-view-actions">
          {/* View mode toggle */}
          <div className="diff-segmented-control">
            <button
              type="button"
              className={`diff-control-btn ${viewMode === "visual" ? "active" : ""}`}
              onClick={() => setViewMode("visual")}
              title="Visual Split Diff"
            >
              <Eye size={13} />
              <span>Full View</span>
            </button>
            <button
              type="button"
              className={`diff-control-btn ${viewMode === "hunk" ? "active" : ""}`}
              onClick={() => setViewMode("hunk")}
              title="Granular Hunk Staging"
            >
              <FileCode size={13} />
              <span>Hunks</span>
            </button>
          </div>

          {/* Split/Inline toggle */}
          {viewMode === "visual" && (
            <div className="diff-segmented-control">
              <button
                type="button"
                className={`diff-control-btn ${splitView ? "active" : ""}`}
                onClick={() => setSplitView(true)}
                title="Split View"
              >
                <span>Split</span>
              </button>
              <button
                type="button"
                className={`diff-control-btn ${!splitView ? "active" : ""}`}
                onClick={() => setSplitView(false)}
                title="Unified/Inline View"
              >
                <span>Unified</span>
              </button>
            </div>
          )}

          {/* Stage / Unstage / Discard File */}
          <button
            className={`diff-btn ${selectedFileIsStaged ? "diff-btn-secondary" : "diff-btn-primary"}`}
            onClick={handleStageFile}
          >
            {selectedFileIsStaged ? "Unstage File" : "Stage File"}
          </button>

          {!selectedFileIsStaged && (
            <button
              className="diff-btn diff-btn-danger"
              onClick={handleDiscardFile}
              title="Discard all changes in this file"
            >
              <Trash2 size={13} />
              <span>Discard</span>
            </button>
          )}
        </div>
      </div>

      {/* Editor Content Area */}
      <div className="diff-view-content">
        {localDiff?.isBinary ? (
          <div className="diff-binary-placeholder">
            <FileCode size={48} strokeWidth={1} />
            <h3>Binary File</h3>
            <p>Diff visualization is not supported for binary assets</p>
          </div>
        ) : viewMode === "visual" ? (
          loadingContents ? (
            <div className="diff-loader">
              <span className="spinner-large" />
              <p>Loading file content diff...</p>
            </div>
          ) : contents ? (
            <DiffEditor
              original={contents.original}
              modified={contents.modified}
              language={getLanguageFromPath(selectedFilePath)}
              theme={isDark ? "basilico-dark" : "basilico-light"}
              height="100%"
              options={{
                renderSideBySide: splitView,
                readOnly: true,
                minimap: { enabled: false },
                scrollbar: {
                  vertical: "visible",
                  horizontal: "visible",
                },
                fontSize: 12,
                fontFamily:
                  "JetBrains Mono, Fira Code, Menlo, Monaco, Consolas, monospace",
                scrollBeyondLastLine: false,
                diffWordWrap: "off",
              }}
              onMount={(editor: editor.IStandaloneDiffEditor) => {
                const originalDispose = editor.dispose;
                editor.dispose = () => {
                  try {
                    editor.setModel(null);
                  } catch {
                    // Ignore
                  }
                  originalDispose.call(editor);
                };
              }}
            />
          ) : (
            <div className="diff-binary-placeholder">
              <p>Unable to load file diff contents</p>
            </div>
          )
        ) : (
          /* Granular Hunk Staging List */
          <div className="diff-hunk-list">
            {!localDiff || localDiff.hunks.length === 0 ? (
              <div className="diff-hunks-empty">
                <p>No changes found in this file</p>
              </div>
            ) : (
              localDiff.hunks.map((hunk, hunkIdx) => {
                const linesChecked = selectedLines[hunkIdx] || new Set();
                const hasSelectedLines = linesChecked.size > 0;

                return (
                  <div key={hunkIdx} className="diff-hunk-card">
                    {/* Hunk Header */}
                    <div className="diff-hunk-header">
                      <span className="hunk-range text-mono">
                        {hunk.header}
                      </span>
                      <div className="hunk-actions">
                        {hasSelectedLines && (
                          <button
                            type="button"
                            className="hunk-btn hunk-btn-primary"
                            onClick={() =>
                              handleStageSelectedLines(hunkIdx, hunk)
                            }
                          >
                            <Check size={11} />
                            <span>
                              Stage Selected Lines ({linesChecked.size})
                            </span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="hunk-btn hunk-btn-secondary"
                          onClick={() => handleStageHunk(hunk)}
                        >
                          {selectedFileIsStaged ? (
                            <>
                              <Minus size={11} />
                              <span>Unstage Hunk</span>
                            </>
                          ) : (
                            <>
                              <Plus size={11} />
                              <span>Stage Hunk</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Hunk Lines */}
                    <div className="diff-hunk-body text-mono">
                      {hunk.lines.map((line, lineIdx) => {
                        const isAdded = line.origin === "+";
                        const isRemoved = line.origin === "-";
                        const isChanged = isAdded || isRemoved;

                        let lineClass = "hunk-line";
                        if (isAdded) lineClass += " hunk-line-added";
                        if (isRemoved) lineClass += " hunk-line-removed";

                        return (
                          <div key={lineIdx} className={lineClass}>
                            {/* Checkbox for modified lines */}
                            {isChanged ? (
                              <input
                                type="checkbox"
                                className="hunk-line-checkbox"
                                checked={linesChecked.has(lineIdx)}
                                onChange={(e) =>
                                  handleLineCheck(
                                    hunkIdx,
                                    lineIdx,
                                    e.target.checked,
                                  )
                                }
                              />
                            ) : (
                              <div className="hunk-line-spacer" />
                            )}
                            <span className="hunk-line-number hunk-line-number-old">
                              {line.oldLineno !== null &&
                              line.oldLineno !== undefined
                                ? line.oldLineno
                                : ""}
                            </span>
                            <span className="hunk-line-number hunk-line-number-new">
                              {line.newLineno !== null &&
                              line.newLineno !== undefined
                                ? line.newLineno
                                : ""}
                            </span>
                            <span className="line-prefix">{line.origin}</span>
                            <span className="line-content">{line.content}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
