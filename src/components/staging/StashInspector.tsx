/* ═══════════════════════════════════════════════════════
   Basilico — StashInspector Component
   Visual workspace to explore and manage git stashes
   ═══════════════════════════════════════════════════════ */

import { DiffEditor } from "@monaco-editor/react";
import {
  Archive,
  ArrowLeftRight,
  ChevronRight,
  CornerDownLeft,
  FileCode,
  GitBranch,
  Info,
  Play,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  type FileContentPair,
  getFileContentPairRevisions,
} from "../../lib/tauri-commands";
import { useDarkMode } from "../../lib/use-dark-mode";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import "./StashInspector.css";

function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js":
    case "jsx":
      return "javascript";
    case "ts":
    case "tsx":
      return "typescript";
    case "rs":
      return "rust";
    case "py":
      return "python";
    case "go":
      return "go";
    case "java":
      return "java";
    case "cpp":
    case "cc":
    case "h":
      return "cpp";
    case "cs":
      return "csharp";
    case "css":
      return "css";
    case "html":
      return "html";
    case "json":
      return "json";
    case "md":
      return "markdown";
    case "sh":
    case "bash":
      return "shell";
    case "yml":
    case "yaml":
      return "yaml";
    default:
      return "plaintext";
  }
}

export function StashInspector() {
  const isDark = useDarkMode();
  const {
    activeTabId,
    stashes,
    selectedStashIndex,
    stashDiff,
    selectedStashFile,
    selectedStashFileDiff,
    selectStashFile,
    createBranchFromStash,
    applyStash,
    popStash,
    dropStash,
  } = useRepoStore();

  const { addNotification, setActiveView, openConfirm, openPrompt } =
    useUIStore();
  const [splitView, setSplitView] = useState(true);
  const [contents, setContents] = useState<FileContentPair | null>(null);
  const [loadingContents, setLoadingContents] = useState(false);

  const selectedStash = stashes.find((s) => s.index === selectedStashIndex);

  // Fetch file content pair for Monaco Diff Editor when selected stash or file changes
  useEffect(() => {
    if (
      !activeTabId ||
      selectedStashIndex === null ||
      !selectedStashFile ||
      !selectedStash
    ) {
      setContents(null);
      return;
    }

    setLoadingContents(true);
    // Base: stash parent commit (stash.oid + "^1")
    // Target: stash merge commit (stash.oid)
    getFileContentPairRevisions(
      activeTabId,
      selectedStashFile,
      `${selectedStash.oid}^1`,
      selectedStash.oid,
    )
      .then((data) => {
        setContents(data);
      })
      .catch((err) => {
        console.error("Failed to load stash file contents:", err);
        setContents(null);
      })
      .finally(() => {
        setLoadingContents(false);
      });
  }, [activeTabId, selectedStashIndex, selectedStashFile, selectedStash]);

  if (selectedStashIndex === null || !selectedStash) {
    return (
      <div className="stash-inspector-empty">
        <Archive size={48} strokeWidth={1} />
        <h3>No Stash Selected</h3>
        <p>Select a stash entry in the sidebar to inspect its content</p>
      </div>
    );
  }

  const handlePop = async () => {
    try {
      await popStash(selectedStashIndex);
      addNotification({
        type: "success",
        message: `Popped stash@{${selectedStashIndex}} successfully`,
      });
      setActiveView("graph");
    } catch (err) {
      addNotification({
        type: "error",
        message: `Failed to pop stash: ${err}`,
      });
    }
  };

  const handleApply = async () => {
    try {
      await applyStash(selectedStashIndex);
      addNotification({
        type: "success",
        message: `Applied stash@{${selectedStashIndex}} successfully`,
      });
      setActiveView("graph");
    } catch (err) {
      addNotification({
        type: "error",
        message: `Failed to apply stash: ${err}`,
      });
    }
  };

  const handleDrop = () => {
    openConfirm({
      title: "Delete Stash",
      message: `Are you sure you want to delete stash@{${selectedStashIndex}}? This action cannot be undone.`,
      confirmLabel: "Delete Stash",
      isDanger: true,
      onConfirm: async () => {
        try {
          await dropStash(selectedStashIndex);
          addNotification({
            type: "success",
            message: `Dropped stash@{${selectedStashIndex}} successfully`,
          });
          setActiveView("graph");
        } catch (err) {
          addNotification({
            type: "error",
            message: `Failed to drop stash: ${err}`,
          });
        }
      },
    });
  };

  const handleBranch = () => {
    openPrompt({
      title: "Create Branch from Stash",
      description: `Create branch from stash@{${selectedStashIndex}}. Enter new branch name:`,
      fields: [
        {
          name: "branchName",
          label: "Branch Name",
          placeholder: "e.g. feature-stash",
          required: true,
        },
      ],
      submitLabel: "Create & Pop",
      onSubmit: async (values) => {
        const branchName = values.branchName || "";
        if (branchName.trim()) {
          try {
            await createBranchFromStash(selectedStashIndex, branchName.trim());
            addNotification({
              type: "success",
              message: `Created branch "${branchName.trim()}" and popped stash@{${selectedStashIndex}}`,
            });
            setActiveView("graph");
          } catch (err) {
            addNotification({
              type: "error",
              message: `Failed to branch from stash: ${err}`,
            });
          }
        }
      },
    });
  };

  return (
    <div className="stash-inspector animate-fade-in">
      {/* Header Panel */}
      <div className="stash-inspector-header">
        <div className="stash-meta">
          <div className="stash-title">
            <Archive size={16} className="stash-icon-accent" />
            <span className="stash-index">
              stash@{"{"}
              {selectedStashIndex}
              {"}"}
            </span>
            <span className="stash-oid text-tertiary text-mono">
              {selectedStash.oid.slice(0, 8)}
            </span>
          </div>
          <p className="stash-msg truncate" title={selectedStash.message}>
            {selectedStash.message}
          </p>
        </div>

        <div className="stash-actions">
          <button
            className="stash-action-btn btn-secondary"
            onClick={handleApply}
            title="Apply stash changes and keep the stash in list"
          >
            <Play size={13} />
            <span>Apply</span>
          </button>

          <button
            className="stash-action-btn btn-secondary"
            onClick={handlePop}
            title="Apply stash changes and remove from stash list"
          >
            <CornerDownLeft size={13} />
            <span>Pop</span>
          </button>

          <button
            className="stash-action-btn btn-secondary"
            onClick={handleBranch}
            title="Create branch from the stash base commit and apply changes"
          >
            <GitBranch size={13} />
            <span>Branch</span>
          </button>

          <button
            className="stash-action-btn btn-danger"
            onClick={handleDrop}
            title="Discard this stash entry permanently"
          >
            <Trash2 size={13} />
            <span>Drop</span>
          </button>
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="stash-inspector-body">
        {/* Left Sidebar: Stashed Files */}
        <div className="stash-files-list">
          <div className="stash-list-header">
            <span>Stashed Modifications ({stashDiff.length})</span>
          </div>
          <div className="stash-files-scroll font-medium">
            {stashDiff.length === 0 ? (
              <div className="stash-files-empty">
                <Info size={16} />
                <p>No changes found in this stash entry</p>
              </div>
            ) : (
              stashDiff.map((file) => {
                const filePath = file.newPath || file.oldPath || "";
                const isSelected = selectedStashFile === filePath;

                return (
                  <button
                    key={filePath}
                    className={`stash-file-item ${isSelected ? "active" : ""}`}
                    onClick={() => selectStashFile(filePath)}
                    title={filePath}
                  >
                    <ChevronRight size={12} className="chevron" />
                    <span className="file-name truncate">{filePath}</span>
                    <span className="file-stats text-mono">
                      <span className="add">+{file.stats.additions}</span>
                      <span className="del">-{file.stats.deletions}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Diff View */}
        <div className="stash-diff-editor">
          <div className="stash-editor-header">
            <div className="selected-file-title truncate">
              {selectedStashFile ? (
                <>
                  <FileCode size={14} />
                  <span className="truncate">{selectedStashFile}</span>
                </>
              ) : (
                <span>No file selected</span>
              )}
            </div>

            {selectedStashFile && (
              <button
                className={`layout-toggle-btn ${splitView ? "active" : ""}`}
                onClick={() => setSplitView(!splitView)}
                title="Toggle Split / Inline diff"
              >
                <ArrowLeftRight size={13} />
                <span>{splitView ? "Split" : "Unified"}</span>
              </button>
            )}
          </div>

          <div className="stash-editor-container">
            {selectedStashFile ? (
              loadingContents ? (
                <div className="stash-loader">
                  <span className="spinner-large" />
                  <p>Retrieving stashed diff...</p>
                </div>
              ) : selectedStashFileDiff?.isBinary ? (
                <div className="stash-diff-placeholder">
                  <FileCode size={40} strokeWidth={1} />
                  <h3>Binary File</h3>
                  <p>Diffing binary file content is not supported</p>
                </div>
              ) : contents ? (
                <DiffEditor
                  original={contents.original}
                  modified={contents.modified}
                  language={getLanguageFromPath(selectedStashFile)}
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
                  onMount={(editor: any) => {
                    const originalDispose = editor.dispose;
                    editor.dispose = () => {
                      try {
                        editor.setModel(null);
                      } catch (e) {
                        // Ignore
                      }
                      originalDispose.call(editor);
                    };
                  }}
                />
              ) : (
                <div className="stash-diff-placeholder">
                  <p>Unable to retrieve stashed content</p>
                </div>
              )
            ) : (
              <div className="stash-diff-placeholder">
                <FileCode size={48} strokeWidth={1} />
                <h3>No File Selected</h3>
                <p>
                  Select a stashed file from the list to view its diff contents
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
