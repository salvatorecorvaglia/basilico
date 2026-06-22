import Editor from "@monaco-editor/react";
import {
  AlertTriangle,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as commands from "../../lib/tauri-commands";
import { useDarkMode } from "../../lib/use-dark-mode";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import "./MergeEditor.css";

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

interface ConflictBlock {
  start: number; // 0-indexed line index
  sep: number;
  end: number;
  ours: string;
  theirs: string;
}

export function MergeEditor() {
  const isDark = useDarkMode();
  const {
    activeConflictedPath,
    conflictStages,
    loadConflictStages,
    resolveConflictStages,
  } = useRepoStore();
  const { setActiveView, addNotification, openConfirm } = useUIStore();

  const [mergedValue, setMergedValue] = useState<string>("");
  const [oursValue, setOursValue] = useState<string>("");
  const [theirsValue, setTheirsValue] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [activeBlockIndex, setActiveBlockIndex] = useState<number>(0);

  // Load conflict content
  useEffect(() => {
    if (!activeConflictedPath) return;

    setLoading(true);
    const fetchStages = async () => {
      try {
        // Fetch ours/theirs from index stages
        await loadConflictStages(activeConflictedPath);

        // Fetch current working dir content with conflict markers
        const contentPair = await commands.getFileContentPair(
          useRepoStore.getState().activeTabId || "",
          activeConflictedPath,
          false,
        );
        setMergedValue(contentPair.modified);
      } catch (err) {
        addNotification({
          type: "error",
          message: `Failed to load conflict files: ${err}`,
        });
        setActiveView("staging");
      } finally {
        setLoading(false);
      }
    };

    fetchStages();
  }, [
    activeConflictedPath,
    loadConflictStages,
    setActiveView,
    addNotification,
  ]);

  // Sync ours and theirs from store
  useEffect(() => {
    if (conflictStages) {
      setOursValue(conflictStages.ours || "");
      setTheirsValue(conflictStages.theirs || "");
    }
  }, [conflictStages]);

  // Parse conflict blocks from mergedValue
  const conflictBlocks = useMemo((): ConflictBlock[] => {
    const lines = mergedValue.split("\n");
    const blocks: ConflictBlock[] = [];
    let currentStart = -1;
    let currentSep = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("<<<<<<<")) {
        currentStart = i;
      } else if (line.startsWith("=======")) {
        currentSep = i;
      } else if (line.startsWith(">>>>>>>")) {
        if (currentStart !== -1 && currentSep !== -1) {
          blocks.push({
            start: currentStart,
            sep: currentSep,
            end: i,
            ours: lines.slice(currentStart + 1, currentSep).join("\n"),
            theirs: lines.slice(currentSep + 1, i).join("\n"),
          });
        }
        currentStart = -1;
        currentSep = -1;
      }
    }
    return blocks;
  }, [mergedValue]);

  // Adjust active block index if out of range
  useEffect(() => {
    if (
      conflictBlocks.length > 0 &&
      activeBlockIndex >= conflictBlocks.length
    ) {
      setActiveBlockIndex(conflictBlocks.length - 1);
    }
  }, [conflictBlocks, activeBlockIndex]);

  const handleResolveBlock = (choice: "ours" | "theirs" | "both") => {
    if (conflictBlocks.length === 0) return;
    const block = conflictBlocks[activeBlockIndex];

    const lines = mergedValue.split("\n");
    let replacement = "";
    if (choice === "ours") {
      replacement = block.ours;
    } else if (choice === "theirs") {
      replacement = block.theirs;
    } else {
      replacement =
        block.ours + (block.ours && block.theirs ? "\n" : "") + block.theirs;
    }

    const newLines = [
      ...lines.slice(0, block.start),
      ...(replacement ? [replacement] : []),
      ...lines.slice(block.end + 1),
    ];

    setMergedValue(newLines.join("\n"));

    // Move to next block if available
    if (activeBlockIndex < conflictBlocks.length - 1) {
      setActiveBlockIndex((prev) => prev + 1);
    }
  };

  const doSave = async () => {
    if (!activeConflictedPath) return;
    try {
      await resolveConflictStages(activeConflictedPath, mergedValue);
      addNotification({
        type: "success",
        message: `Resolved conflict in ${activeConflictedPath.split("/").pop()}`,
      });
      setActiveView("staging");
    } catch (err) {
      addNotification({
        type: "error",
        message: `Failed to save resolution: ${err}`,
      });
    }
  };

  const handleSave = () => {
    if (!activeConflictedPath) return;

    if (conflictBlocks.length > 0) {
      openConfirm({
        title: "Save with Conflicts?",
        message: `There are still ${conflictBlocks.length} unresolved conflict markers in the file. Are you sure you want to save?`,
        confirmLabel: "Save Anyway",
        isDanger: true,
        onConfirm: doSave,
      });
    } else {
      doSave();
    }
  };

  if (!activeConflictedPath) return null;

  return (
    <div className="merge-editor-view">
      {/* Header */}
      <div className="merge-header">
        <div className="merge-header-title">
          <AlertTriangle size={18} className="text-warning animate-pulse" />
          <div className="merge-header-info">
            <h2>Conflict Resolution Tool</h2>
            <span className="text-mono text-secondary truncate">
              {activeConflictedPath}
            </span>
          </div>
        </div>

        <div className="merge-header-actions">
          {conflictBlocks.length > 0 ? (
            <span className="conflict-badge warning">
              {conflictBlocks.length} conflict
              {conflictBlocks.length > 1 ? "s" : ""} remaining
            </span>
          ) : (
            <span className="conflict-badge success">
              <Check size={12} /> All markers cleared
            </span>
          )}

          <button
            className="merge-btn merge-btn-outline"
            onClick={() => setActiveView("staging")}
          >
            <X size={14} /> Cancel
          </button>
          <button className="merge-btn" onClick={handleSave}>
            <CheckSquare size={14} /> Save Resolution
          </button>
        </div>
      </div>

      {/* Main workspace */}
      {loading ? (
        <div className="merge-loader">
          <span className="spinner-large" />
          <p>Loading conflict stages...</p>
        </div>
      ) : (
        <div className="merge-workspace">
          {/* Top Panel: Side-by-Side Ours vs Theirs */}
          <div className="merge-stages-group">
            <div className="merge-stage-panel ours">
              <div className="merge-panel-title">Ours (Local Changes)</div>
              <div className="merge-panel-editor-container">
                <Editor
                  value={oursValue}
                  language={getLanguageFromPath(activeConflictedPath)}
                  theme={isDark ? "basilico-dark" : "basilico-light"}
                  height="100%"
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 12,
                    fontFamily:
                      "JetBrains Mono, Fira Code, Menlo, Monaco, Consolas, monospace",
                    scrollBeyondLastLine: false,
                    lineNumbers: "on",
                    folding: true,
                  }}
                />
              </div>
            </div>

            <div className="merge-stage-panel theirs">
              <div className="merge-panel-title">Theirs (Incoming Changes)</div>
              <div className="merge-panel-editor-container">
                <Editor
                  value={theirsValue}
                  language={getLanguageFromPath(activeConflictedPath)}
                  theme={isDark ? "basilico-dark" : "basilico-light"}
                  height="100%"
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 12,
                    fontFamily:
                      "JetBrains Mono, Fira Code, Menlo, Monaco, Consolas, monospace",
                    scrollBeyondLastLine: false,
                    lineNumbers: "on",
                    folding: true,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Conflict resolver bar */}
          {conflictBlocks.length > 0 && (
            <div className="conflict-control-bar">
              <span className="conflict-index">
                Conflict {activeBlockIndex + 1} of {conflictBlocks.length}
              </span>
              <div className="conflict-nav-buttons">
                <button
                  disabled={activeBlockIndex === 0}
                  onClick={() => setActiveBlockIndex((prev) => prev - 1)}
                  className="nav-arrow-btn"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  disabled={activeBlockIndex === conflictBlocks.length - 1}
                  onClick={() => setActiveBlockIndex((prev) => prev + 1)}
                  className="nav-arrow-btn"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <div className="conflict-resolutions">
                <button
                  className="resolve-btn resolve-ours"
                  onClick={() => handleResolveBlock("ours")}
                >
                  Accept Ours
                </button>
                <button
                  className="resolve-btn resolve-theirs"
                  onClick={() => handleResolveBlock("theirs")}
                >
                  Accept Theirs
                </button>
                <button
                  className="resolve-btn resolve-both"
                  onClick={() => handleResolveBlock("both")}
                >
                  Accept Both
                </button>
              </div>
            </div>
          )}

          {/* Bottom Panel: Merged result editor */}
          <div className="merge-result-panel">
            <div className="merge-panel-title">Merged Result (Editable)</div>
            <div className="merge-panel-editor-container">
              <Editor
                value={mergedValue}
                onChange={(val) => setMergedValue(val || "")}
                language={getLanguageFromPath(activeConflictedPath)}
                theme={isDark ? "basilico-dark" : "basilico-light"}
                height="100%"
                options={{
                  readOnly: false,
                  minimap: { enabled: false },
                  fontSize: 12,
                  fontFamily:
                    "JetBrains Mono, Fira Code, Menlo, Monaco, Consolas, monospace",
                  scrollBeyondLastLine: false,
                  lineNumbers: "on",
                  folding: true,
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
