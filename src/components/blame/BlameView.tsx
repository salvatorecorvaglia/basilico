import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowLeft, Clock, ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import "./BlameView.css";
import { reportError } from "../../lib/git-error";

export function BlameView() {
  const file = useRepoStore((s) => s.selectedFilePath);
  const repo = useRepoStore((s) => s.activeTabId);
  const target = useUIStore((s) => s.blameTarget);
  const match = target?.repoPath === repo && target.filePath === file;
  return (
    <FileBlame
      key={`${repo}:${file}:${match ? target.line : "default"}`}
      targetLine={match ? target.line : undefined}
    />
  );
}

function FileBlame({ targetLine }: { targetLine?: number }) {
  const {
    selectedFilePath,
    blameLines,
    loadFileBlame,
    selectCommit,
    selectedCommitOid,
    isLoading,
    openInIde,
    settings,
  } = useRepoStore(
    useShallow((s) => ({
      selectedFilePath: s.selectedFilePath,
      blameLines: s.blameLines,
      loadFileBlame: s.loadFileBlame,
      selectCommit: s.selectCommit,
      selectedCommitOid: s.selectedCommitOid,
      isLoading: s.loadingStates.blame,
      openInIde: s.openInIde,
      settings: s.settings,
    })),
  );
  const { setActiveView } = useUIStore(
    useShallow((s) => ({ setActiveView: s.setActiveView })),
  );
  const [currentCommitOid, setCurrentCommitOid] = useState<string | null>(
    targetLine ? null : selectedCommitOid,
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: blameLines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 24,
    overscan: 8,
    initialRect: { width: 1000, height: 600 },
  });
  useEffect(() => {
    if (targetLine && blameLines.length)
      virtualizer.scrollToIndex(
        Math.min(targetLine - 1, blameLines.length - 1),
        { align: "center" },
      );
  }, [targetLine, blameLines.length, virtualizer]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setError(false);
    if (selectedFilePath) {
      loadFileBlame(selectedFilePath, currentCommitOid).catch((err) => {
        if (active) {
          setError(true);
          reportError(err, "Failed to load blame");
        }
      });
    }
    return () => {
      active = false;
    };
  }, [selectedFilePath, currentCommitOid, loadFileBlame]);

  if (!selectedFilePath) {
    return (
      <div className="blame-view-empty">
        <p>
          No file selected for blame. Please select a file from staging or
          history.
        </p>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setActiveView("graph")}
        >
          Back to History
        </button>
      </div>
    );
  }

  const handleLineCommitClick = (oid: string) => {
    if (!oid) return;
    selectCommit(oid).catch((err) => reportError(err, "Failed to load commit"));
    setActiveView("graph");
  };

  const handleBlameBefore = (parentSpec: string) => {
    if (!parentSpec) return;
    setCurrentCommitOid(parentSpec);
  };

  const handleOpenInIde = (lineNo?: number) => {
    if (!selectedFilePath) return;
    // Repo-relative: Rust joins it against the repository root with the
    // platform separator rather than a hardcoded "/".
    openInIde(selectedFilePath, lineNo, true).catch((err) => {
      console.error("Failed to open file in editor:", err);
    });
  };

  const canvasStyle = { height: virtualizer.getTotalSize() };
  return (
    <div className="blame-view animate-fade-in">
      <div className="blame-header">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setActiveView("graph")}
          title="Back to Graph"
        >
          <ArrowLeft size={14} />
          <span>Back</span>
        </button>
        <div className="blame-file-info truncate">
          <span className="blame-file-title text-tertiary">Blame: </span>
          <span className="blame-file-name">{selectedFilePath}</span>
          {currentCommitOid && (
            <span className="blame-revision text-mono text-secondary">
              &nbsp;@{" "}
              {currentCommitOid.includes("^")
                ? currentCommitOid
                : currentCommitOid.slice(0, 8)}
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm blame-btn-editor"
          onClick={() => handleOpenInIde()}
          title={`Open file in ${settings?.externalEditor || "code"}`}
        >
          <ExternalLink size={12} />
          <span>Open in {settings?.externalEditor || "Code"}</span>
        </button>
        {currentCommitOid && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setCurrentCommitOid(null)}
            title="Reset blame to HEAD/Workdir"
          >
            <RefreshCw size={12} />
            <span>Reset</span>
          </button>
        )}
      </div>

      <div
        className="blame-container"
        ref={scrollRef}
        role="region"
        aria-label="Blame source lines"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to focus this scroll region to scroll virtualized rows.
        tabIndex={0}
      >
        {error ? (
          <p role="alert">
            Blame could not be displayed. See the error notification or open
            this file in your editor.
          </p>
        ) : isLoading ? (
          <div className="blame-loader">
            <span className="spinner-large" />
            <p>Computing line-by-line blame...</p>
          </div>
        ) : blameLines.length === 0 ? (
          <div className="blame-empty">
            <p>No blame data available for this file.</p>
          </div>
        ) : (
          <div className="blame-lines text-mono" style={canvasStyle}>
            {virtualizer.getVirtualItems().map((item) => {
              const line = blameLines[item.index];
              // Highlight color grouping by commit to visually distinguish blocks
              const oidInt = parseInt(line.commitOid.slice(0, 4) || "0", 16);
              const colorGroup = Number.isNaN(oidInt) ? 0 : oidInt % 6;

              const rowStyle = {
                height: item.size,
                transform: `translateY(${item.start}px)`,
              };
              return (
                <div
                  key={item.key}
                  className={`blame-line-row${line.lineNo === targetLine ? " blame-line-target" : ""}`}
                  style={rowStyle}
                >
                  {/* Blame Gutter */}
                  <div className={`blame-gutter color-group-${colorGroup}`}>
                    <button
                      className="blame-gutter-oid text-mono"
                      type="button"
                      onClick={() => handleLineCommitClick(line.commitOid)}
                      title={`Jump to commit: ${line.commitSummary}\n\nSHA: ${line.commitOid}`}
                    >
                      {line.shortOid || "-------"}
                    </button>
                    <span
                      className="blame-gutter-author truncate"
                      title={`${line.authorName} <${line.authorEmail}>`}
                    >
                      {line.authorName}
                    </span>
                    {line.commitOid && (
                      <button
                        className="blame-gutter-parent"
                        type="button"
                        onClick={() => handleBlameBefore(`${line.commitOid}^`)}
                        title="Blame parent (before this commit)"
                        aria-label="Blame parent (before this commit)"
                      >
                        <Clock size={11} />
                      </button>
                    )}
                  </div>

                  {/* Line Number */}
                  <button
                    type="button"
                    className="blame-line-number text-tertiary"
                    onClick={() => handleOpenInIde(line.lineNo)}
                    title={`Open line ${line.lineNo} in external editor`}
                  >
                    {line.lineNo}
                  </button>

                  {/* Line Content */}
                  <pre className="blame-line-content">
                    {line.lineContent || " "}
                  </pre>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
