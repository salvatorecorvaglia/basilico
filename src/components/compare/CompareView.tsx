import { useState, useEffect } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { X, ArrowLeftRight, FileCode, CheckCircle } from 'lucide-react';
import { useRepoStore } from '../../store/repo-store';
import { useUIStore } from '../../store/ui-store';
import * as commands from '../../lib/tauri-commands';
import { getFileName, getDirectory, getStatusColor, getStatusIcon } from '../../lib/utils';
import './CompareView.css';

function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'rs':
      return 'rust';
    case 'py':
      return 'python';
    case 'go':
      return 'go';
    case 'java':
      return 'java';
    case 'cpp':
    case 'cc':
    case 'h':
      return 'cpp';
    case 'cs':
      return 'csharp';
    case 'css':
      return 'css';
    case 'html':
      return 'html';
    case 'json':
      return 'json';
    case 'md':
      return 'markdown';
    case 'sh':
    case 'bash':
      return 'shell';
    case 'yml':
    case 'yaml':
      return 'yaml';
    default:
      return 'plaintext';
  }
}

export function CompareView() {
  const { 
    activeTabId, 
    compareDiff, 
    compareBase, 
    compareTarget, 
    selectedCompareFile, 
    compareFileDiff,
    selectCompareFile,
    startComparison
  } = useRepoStore();

  const { setActiveView, addNotification } = useUIStore();
  const [splitView, setSplitView] = useState(true);
  const [contents, setContents] = useState<{ original: string; modified: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeTabId || !selectedCompareFile || !compareBase || !compareTarget) {
      setContents(null);
      return;
    }

    setLoading(true);
    commands.getFileContentPairRevisions(activeTabId, selectedCompareFile, compareBase, compareTarget)
      .then((data) => {
        setContents(data);
      })
      .catch((err) => {
        console.error('Failed to load file contents for comparison:', err);
        setContents(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [activeTabId, selectedCompareFile, compareBase, compareTarget]);

  if (!compareBase || !compareTarget) {
    return (
      <div className="compare-view-empty">
        <ArrowLeftRight size={40} strokeWidth={1} />
        <h3>No Comparison Active</h3>
        <p>Compare branches or commits from context menus to see details</p>
      </div>
    );
  }

  const handleSwap = () => {
    startComparison(compareTarget, compareBase)
      .then(() => {
        addNotification({ type: 'info', message: 'Swapped comparison direction' });
      })
      .catch((err: any) => {
        addNotification({ type: 'error', message: `Swap failed: ${err}` });
      });
  };

  const handleClose = () => {
    setActiveView('graph');
  };

  return (
    <div className="compare-view animate-fade-in">
      {/* Header */}
      <div className="compare-header">
        <div className="compare-info truncate">
          <span className="compare-badge">Comparing</span>
          <span className="compare-ref text-mono" title={compareBase}>{compareBase.slice(0, 15)}</span>
          <span className="compare-arrow">➔</span>
          <span className="compare-ref text-mono" title={compareTarget}>{compareTarget.slice(0, 15)}</span>
        </div>

        <div className="compare-header-actions">
          <button className="compare-header-btn" onClick={handleSwap} title="Swap comparison direction">
            <ArrowLeftRight size={13} />
            <span>Swap Direction</span>
          </button>

          <div className="compare-header-sep" />

          <button 
            className={`compare-header-btn ${splitView ? 'active' : ''}`}
            onClick={() => setSplitView(!splitView)}
            title="Toggle Split/Inline Diff"
            disabled={!selectedCompareFile}
          >
            <span>{splitView ? 'Split' : 'Inline'}</span>
          </button>

          <button className="compare-header-btn close-btn" onClick={handleClose} title="Exit comparison">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Main Content Pane */}
      <div className="compare-workspace">
        {/* Left Side: Changed Files List */}
        <div className="compare-sidebar">
          <div className="compare-sidebar-title">
            <span>Changed Files</span>
            <span className="compare-files-count">{compareDiff.length}</span>
          </div>

          <div className="compare-files-list">
            {compareDiff.length === 0 ? (
              <div className="compare-no-changes">
                <CheckCircle size={28} className="text-success" />
                <h3>No Differences</h3>
                <p>Revisions match exactly.</p>
              </div>
            ) : (
              compareDiff.map((file, idx) => {
                const filePath = file.newPath || file.oldPath || '';
                const isSelected = selectedCompareFile === filePath;

                return (
                  <div
                    key={idx}
                    className={`compare-file-row ${isSelected ? 'selected' : ''}`}
                    onClick={() => selectCompareFile(filePath)}
                  >
                    <span 
                      className="compare-file-status"
                      style={{ color: getStatusColor(file.status) }}
                    >
                      {getStatusIcon(file.status)}
                    </span>
                    <div className="compare-file-paths truncate">
                      <span className="file-name">{getFileName(filePath)}</span>
                      <span className="file-dir">{getDirectory(filePath)}</span>
                    </div>
                    <span className="compare-file-stats text-mono">
                      <span className="stat-add">+{file.stats.additions}</span>
                      <span className="stat-del">-{file.stats.deletions}</span>
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Monaco Diff Editor */}
        <div className="compare-editor-pane">
          {!selectedCompareFile ? (
            <div className="editor-empty-placeholder">
              <FileCode size={48} strokeWidth={1} />
              <h3>No File Selected</h3>
              <p>Select a file from the list to view differences</p>
            </div>
          ) : compareFileDiff?.isBinary ? (
            <div className="editor-empty-placeholder">
              <FileCode size={48} strokeWidth={1} />
              <h3>Binary File</h3>
              <p>Differences are not displayed for binary assets</p>
            </div>
          ) : loading ? (
            <div className="editor-loader">
              <span className="spinner-large" />
              <p>Loading diff contents...</p>
            </div>
          ) : contents ? (
            <div className="editor-container">
              <div className="editor-file-banner">
                <span className="editor-filename">{selectedCompareFile}</span>
              </div>
              <div className="editor-wrapper">
                <DiffEditor
                  original={contents.original}
                  modified={contents.modified}
                  language={getLanguageFromPath(selectedCompareFile)}
                  theme="vs-dark"
                  height="100%"
                  options={{
                    renderSideBySide: splitView,
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 12,
                    fontFamily: 'JetBrains Mono, Fira Code, Menlo, Monaco, Consolas, monospace',
                    scrollBeyondLastLine: false,
                    diffWordWrap: 'off',
                    scrollbar: {
                      vertical: 'visible',
                      horizontal: 'visible',
                    },
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="editor-empty-placeholder">
              <p>Failed to load file contents</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
