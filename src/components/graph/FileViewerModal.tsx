import Editor from "@monaco-editor/react";
import { Check, Copy, Download, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getFileContentAtRevision } from "../../lib/tauri-commands";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import "./FileViewerModal.css";

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

export function FileViewerModal() {
  const { activeTabId } = useRepoStore();
  const {
    fileViewerOpen,
    fileViewerPath,
    fileViewerOid,
    closeFileViewer,
    addNotification,
  } = useUIStore();

  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (!fileViewerOpen || !fileViewerPath || !fileViewerOid || !activeTabId) {
      setContent("");
      return;
    }

    setLoading(true);
    getFileContentAtRevision(activeTabId, fileViewerPath, fileViewerOid)
      .then((data) => {
        setContent(data);
      })
      .catch((err) => {
        console.error("Failed to load file revision content:", err);
        addNotification({
          type: "error",
          message: `Failed to load file content: ${err}`,
        });
        setContent("");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [
    fileViewerOpen,
    fileViewerPath,
    fileViewerOid,
    activeTabId,
    addNotification,
  ]);

  if (!fileViewerOpen || !fileViewerPath || !fileViewerOid) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const filename = fileViewerPath.split("/").pop() || "file";
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    addNotification({
      type: "success",
      message: `Saved ${filename} to downloads`,
    });
  };

  return (
    <div
      className="file-viewer-overlay animate-fade-in"
      onClick={closeFileViewer}
    >
      <div className="file-viewer-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="file-viewer-header">
          <div className="file-viewer-title-group">
            <span className="file-viewer-name">
              {fileViewerPath.split("/").pop()}
            </span>
            <span
              className="file-viewer-path text-mono truncate"
              title={fileViewerPath}
            >
              {fileViewerPath} @ {fileViewerOid.slice(0, 7)}
            </span>
          </div>

          <div className="file-viewer-actions">
            <button
              className="viewer-action-btn"
              onClick={handleCopy}
              title="Copy content"
              disabled={loading}
            >
              {copied ? (
                <Check size={14} className="text-success" />
              ) : (
                <Copy size={14} />
              )}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
            <button
              className="viewer-action-btn"
              onClick={handleDownload}
              title="Save to disk"
              disabled={loading}
            >
              <Download size={14} />
              <span>Save</span>
            </button>
            <div className="viewer-action-sep" />
            <button className="file-viewer-close-btn" onClick={closeFileViewer}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Editor Area */}
        <div className="file-viewer-body">
          {loading ? (
            <div className="file-viewer-loader">
              <span className="spinner-large" />
              <p>Fetching file content at {fileViewerOid.slice(0, 7)}...</p>
            </div>
          ) : (
            <Editor
              value={content}
              language={getLanguageFromPath(fileViewerPath)}
              theme="vs-dark"
              height="100%"
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 12,
                fontFamily:
                  "JetBrains Mono, Fira Code, Menlo, Monaco, Consolas, monospace",
                scrollBeyondLastLine: false,
                lineNumbers: "on",
                scrollbar: {
                  vertical: "visible",
                  horizontal: "visible",
                },
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
