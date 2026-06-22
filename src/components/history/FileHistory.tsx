import { DiffEditor } from "@monaco-editor/react";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { getFileContentAtRevision } from "../../lib/tauri-commands";
import { formatDateTime } from "../../lib/utils";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import "./FileHistory.css";

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

export function FileHistory() {
  const {
    activeTabId,
    selectedFilePath,
    fileHistory,
    loadFileHistory,
    isLoading,
  } = useRepoStore();
  const { setActiveView } = useUIStore();
  const [selectedCommitOid, setSelectedCommitOid] = useState<string | null>(
    null,
  );

  // Diffs for Monaco
  const [originalContent, setOriginalContent] = useState("");
  const [modifiedContent, setModifiedContent] = useState("");
  const [loadingDiff, setLoadingDiff] = useState(false);

  useEffect(() => {
    if (selectedFilePath) {
      loadFileHistory(selectedFilePath);
      setSelectedCommitOid(null);
    }
  }, [selectedFilePath, loadFileHistory]);

  // Set the first commit as selected automatically if history loads
  useEffect(() => {
    if (fileHistory.length > 0 && !selectedCommitOid) {
      setSelectedCommitOid(fileHistory[0].commitOid);
    }
  }, [fileHistory, selectedCommitOid]);

  // Load content diff when selected commit changes
  useEffect(() => {
    if (!activeTabId || !selectedFilePath || !selectedCommitOid) {
      setOriginalContent("");
      setModifiedContent("");
      return;
    }

    setLoadingDiff(true);
    const selectedEntry = fileHistory.find(
      (h) => h.commitOid === selectedCommitOid,
    );
    // Renamed files can have a different path in older commits
    const pathInCommit = selectedEntry
      ? selectedEntry.filePath
      : selectedFilePath;

    // Fetch modified (at commit) and original (at parent commit)
    const modifiedPromise = getFileContentAtRevision(
      activeTabId,
      pathInCommit,
      selectedCommitOid,
    );
    const originalPromise = getFileContentAtRevision(
      activeTabId,
      pathInCommit,
      `${selectedCommitOid}^`,
    ).catch(() => ""); // Fallback to empty string for root commits

    Promise.all([originalPromise, modifiedPromise])
      .then(([orig, mod]) => {
        setOriginalContent(orig);
        setModifiedContent(mod);
      })
      .catch((err) => {
        console.error("Failed to load history diff content:", err);
        setOriginalContent("");
        setModifiedContent("");
      })
      .finally(() => {
        setLoadingDiff(false);
      });
  }, [activeTabId, selectedFilePath, selectedCommitOid, fileHistory]);

  if (!selectedFilePath) {
    return (
      <div className="file-history-empty">
        <p>
          No file selected for history. Please select a file from staging or
          details pane.
        </p>
        <button className="history-btn" onClick={() => setActiveView("graph")}>
          Back to Graph
        </button>
      </div>
    );
  }

  return (
    <div className="file-history animate-fade-in">
      {/* Header */}
      <div className="file-history-header">
        <button
          className="history-back-btn"
          onClick={() => setActiveView("graph")}
          title="Back to Graph"
        >
          <ArrowLeft size={14} />
          <span>Back</span>
        </button>
        <div className="history-file-info truncate">
          <span className="history-file-title text-tertiary">History: </span>
          <span className="history-file-name">{selectedFilePath}</span>
        </div>
      </div>

      <div className="file-history-body">
        {/* Left Commits List */}
        <div className="file-history-list">
          {isLoading ? (
            <div className="history-loader">
              <span className="spinner-medium" />
              <p>Loading file timeline...</p>
            </div>
          ) : fileHistory.length === 0 ? (
            <div className="history-list-empty">
              No commits found for this file.
            </div>
          ) : (
            fileHistory.map((entry) => {
              const isActive = entry.commitOid === selectedCommitOid;
              return (
                <div
                  key={entry.commitOid}
                  className={`history-commit-item ${isActive ? "active" : ""}`}
                  onClick={() => setSelectedCommitOid(entry.commitOid)}
                >
                  <div className="commit-item-dot" />
                  <div className="commit-item-main">
                    <div
                      className="commit-item-summary truncate"
                      title={entry.commitSummary}
                    >
                      {entry.commitSummary}
                    </div>
                    <div className="commit-item-meta text-xs text-secondary truncate">
                      <span>{entry.authorName}</span>
                      <span> &bull; </span>
                      <span>{formatDateTime(entry.authorDate)}</span>
                    </div>
                    <div className="commit-item-oid text-xs text-mono text-tertiary truncate">
                      {entry.shortOid}
                      {entry.filePath !== selectedFilePath && (
                        <span
                          className="commit-item-renamed"
                          title={`Renamed from: ${entry.filePath}`}
                        >
                          &nbsp;(renamed)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Monaco Diff Panel */}
        <div className="file-history-diff">
          {loadingDiff ? (
            <div className="diff-loader">
              <span className="spinner-large" />
              <p>Loading commit diff content...</p>
            </div>
          ) : selectedCommitOid ? (
            <DiffEditor
              original={originalContent}
              modified={modifiedContent}
              language={getLanguageFromPath(selectedFilePath)}
              theme="vs-dark"
              height="100%"
              options={{
                renderSideBySide: true,
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
              }}
            />
          ) : (
            <div className="history-diff-empty">
              Select a commit to view diff details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
