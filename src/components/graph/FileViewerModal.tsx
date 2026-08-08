import Editor from "@monaco-editor/react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Copy, Download, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { getFileContentAtRevision } from "../../lib/tauri-commands";
import { useDarkMode } from "../../lib/use-dark-mode";
import { getLanguageFromPath } from "../../lib/utils";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import "./FileViewerModal.css";
// Registers the bundled Monaco + workers; keeps it off the startup chunk.
import { disposeModelsOnUnmount } from "../../lib/monaco-setup";
import { useCopyFeedback } from "../../lib/use-copy-feedback";

export function FileViewerModal() {
  const isDark = useDarkMode();
  const { activeTabId } = useRepoStore(
    useShallow((s) => ({ activeTabId: s.activeTabId })),
  );
  const {
    fileViewerOpen,
    fileViewerPath,
    fileViewerOid,
    closeFileViewer,
    addNotification,
  } = useUIStore(
    useShallow((s) => ({
      fileViewerOpen: s.fileViewerOpen,
      fileViewerPath: s.fileViewerPath,
      fileViewerOid: s.fileViewerOid,
      closeFileViewer: s.closeFileViewer,
      addNotification: s.addNotification,
    })),
  );

  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const { isCopied, markCopied } = useCopyFeedback();
  const copied = isCopied();

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
    markCopied();
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
    // Radix owns the dialog semantics the hand-rolled overlay never had: focus
    // trap, focus restore on close, Escape, click-outside, role="dialog" and
    // aria-modal. Every other modal in the app is built this way.
    <Dialog.Root
      open={fileViewerOpen}
      onOpenChange={(open) => {
        if (!open) closeFileViewer();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="file-viewer-overlay animate-fade-in" />
        <Dialog.Content className="file-viewer-content">
          {/* Header */}
          <div className="file-viewer-header">
            <div className="file-viewer-title-group">
              <Dialog.Title className="file-viewer-name">
                {fileViewerPath.split("/").pop()}
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                Read-only contents of {fileViewerPath} at commit{" "}
                {fileViewerOid.slice(0, 7)}
              </Dialog.Description>
              <span
                className="file-viewer-path text-mono truncate"
                title={fileViewerPath}
              >
                {fileViewerPath} @ {fileViewerOid.slice(0, 7)}
              </span>
            </div>

            <div className="file-viewer-actions">
              <button
                type="button"
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
                type="button"
                className="viewer-action-btn"
                onClick={handleDownload}
                title="Save to disk"
                disabled={loading}
              >
                <Download size={14} />
                <span>Save</span>
              </button>
              <div className="viewer-action-sep" />
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="file-viewer-close-btn"
                  aria-label="Close file viewer"
                >
                  <X size={16} />
                </button>
              </Dialog.Close>
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
                theme={isDark ? "basilico-dark" : "basilico-light"}
                height="100%"
                onMount={disposeModelsOnUnmount}
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
