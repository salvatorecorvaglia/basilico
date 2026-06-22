import { ArrowLeft, Clock, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import "./BlameView.css";

export function BlameView() {
  const {
    selectedFilePath,
    blameLines,
    loadFileBlame,
    selectCommit,
    selectedCommitOid,
    isLoading,
  } = useRepoStore();
  const { setActiveView } = useUIStore();
  const [currentCommitOid, setCurrentCommitOid] = useState<string | null>(
    selectedCommitOid,
  );

  useEffect(() => {
    if (selectedFilePath) {
      loadFileBlame(selectedFilePath, currentCommitOid);
    }
  }, [selectedFilePath, currentCommitOid, loadFileBlame]);

  if (!selectedFilePath) {
    return (
      <div className="blame-view-empty">
        <p>
          No file selected for blame. Please select a file from staging or
          history.
        </p>
        <button className="blame-btn" onClick={() => setActiveView("graph")}>
          Back to History
        </button>
      </div>
    );
  }

  const handleLineCommitClick = (oid: string) => {
    if (!oid) return;
    selectCommit(oid);
    setActiveView("graph");
  };

  const handleBlameBefore = (parentSpec: string) => {
    if (!parentSpec) return;
    setCurrentCommitOid(parentSpec);
  };

  return (
    <div className="blame-view animate-fade-in">
      <div className="blame-header">
        <button
          className="blame-back-btn"
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
        {currentCommitOid && (
          <button
            className="blame-reset-btn"
            onClick={() => setCurrentCommitOid(null)}
            title="Reset blame to HEAD/Workdir"
          >
            <RefreshCw size={12} />
            <span>Reset</span>
          </button>
        )}
      </div>

      <div className="blame-container">
        {isLoading ? (
          <div className="blame-loader">
            <span className="spinner-large" />
            <p>Computing line-by-line blame...</p>
          </div>
        ) : blameLines.length === 0 ? (
          <div className="blame-empty">
            <p>No blame data available for this file.</p>
          </div>
        ) : (
          <div className="blame-lines text-mono">
            {blameLines.map((line, idx) => {
              // Highlight color grouping by commit to visually distinguish blocks
              const oidInt = parseInt(line.commitOid.slice(0, 4) || "0", 16);
              const colorGroup = Number.isNaN(oidInt) ? 0 : oidInt % 6;

              return (
                <div key={idx} className="blame-line-row">
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
                      >
                        <Clock size={11} />
                      </button>
                    )}
                  </div>

                  {/* Line Number */}
                  <div className="blame-line-number text-tertiary">
                    {line.lineNo}
                  </div>

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
