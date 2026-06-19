/* ═══════════════════════════════════════════════════════
   Basilico — CommitDetail Component
   Shows details of the selected commit
   ═══════════════════════════════════════════════════════ */

import { FileText, Copy, Check, Clock, Calendar, Tag } from 'lucide-react';
import { useState } from 'react';
import { useRepoStore } from '../../store/repo-store';
import { useUIStore } from '../../store/ui-store';
import { formatDateTime, getStatusIcon, getStatusColor, getFileName, getDirectory } from '../../lib/utils';
import './CommitDetail.css';

export function CommitDetail() {
  const { commits, selectedCommitOid, commitDiff, selectLocalFile, createTag } = useRepoStore();
  const { setActiveView, addNotification } = useUIStore();
  const [copiedOid, setCopiedOid] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    filePath: string;
  } | null>(null);

  const commit = commits.find((c) => c.oid === selectedCommitOid);

  if (!commit) {
    return (
      <div className="commit-detail-empty">
        <FileText size={32} strokeWidth={1} />
        <p>Select a commit to view details</p>
      </div>
    );
  }

  const handleCopyOid = () => {
    navigator.clipboard.writeText(commit.oid);
    setCopiedOid(true);
    setTimeout(() => setCopiedOid(false), 2000);
  };

  const handleCreateTagPrompt = async () => {
    if (!commit) return;
    const name = prompt('Enter new tag name:');
    if (!name || !name.trim()) return;

    const message = prompt('Enter tag message (optional, leave empty for lightweight tag):');

    try {
      await createTag(name.trim(), commit.oid, message?.trim() || null);
      addNotification({ type: 'success', message: `Created tag "${name}" at ${commit.oid.slice(0, 7)}` });
    } catch (err) {
      addNotification({ type: 'error', message: `Failed to create tag: ${err}` });
    }
  };

  const handleFileContextMenu = (e: React.MouseEvent, filePath: string) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      filePath,
    });
  };

  return (
    <div className="commit-detail" onClick={() => setContextMenu(null)}>
      {/* Header */}
      <div className="commit-detail-header">
        <div className="commit-detail-message">{commit.message}</div>
        <div className="commit-detail-meta">
          <div className="commit-detail-author">
            <strong>{commit.authorName}</strong>
            <span className="text-secondary"> &lt;{commit.authorEmail}&gt;</span>
          </div>
          <div className="commit-detail-date text-secondary">
            {formatDateTime(commit.authorDate)}
          </div>
        </div>

        <div className="commit-detail-oid">
          <span className="text-mono text-secondary">{commit.oid}</span>
          <button className="commit-detail-copy" onClick={handleCopyOid} title="Copy SHA">
            {copiedOid ? <Check size={12} /> : <Copy size={12} />}
          </button>
          <button 
            className="commit-detail-action-btn" 
            onClick={handleCreateTagPrompt} 
            title="Create Tag at this commit"
            style={{ 
              background: 'none', 
              border: 'none', 
              color: 'var(--accent-color)', 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '4px',
              fontSize: '11px',
              marginLeft: '8px'
            }}
          >
            <Tag size={12} />
            <span>Tag...</span>
          </button>
        </div>

        {commit.parentOids.length > 0 && (
          <div className="commit-detail-parents">
            <span className="text-tertiary">Parents:</span>
            {commit.parentOids.map((parent) => (
              <span key={parent} className="commit-detail-parent-oid text-mono">
                {parent.slice(0, 7)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Changed files */}
      <div className="commit-detail-files">
        <div className="commit-detail-files-header">
          <span>Changed files</span>
          <span className="commit-detail-files-count">{commitDiff.length}</span>
        </div>

        <div className="commit-detail-files-list">
          {commitDiff.map((file, i) => {
            const filePath = file.newPath || file.oldPath || '';
            return (
              <div 
                key={i} 
                className="commit-detail-file"
                onClick={() => selectLocalFile(filePath, false)}
                onContextMenu={(e) => handleFileContextMenu(e, filePath)}
                style={{ cursor: 'pointer' }}
              >
                <span
                  className="commit-detail-file-status"
                  style={{ color: getStatusColor(file.status) }}
                >
                  {getStatusIcon(file.status)}
                </span>
                <span className="commit-detail-file-dir text-tertiary truncate">
                  {getDirectory(filePath)}
                  {getDirectory(filePath) && '/'}
                </span>
                <span className="commit-detail-file-name truncate">
                  {getFileName(filePath)}
                </span>
                <span className="commit-detail-file-stats text-mono">
                  <span className="stat-add">+{file.stats.additions}</span>
                  <span className="stat-del">-{file.stats.deletions}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* File Context Menu */}
      {contextMenu && (
        <div 
          className="sidebar-context-menu animate-fade-in"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button 
            className="context-menu-item" 
            onClick={() => {
              selectLocalFile(contextMenu.filePath, false);
              setActiveView('blame');
              setContextMenu(null);
            }}
          >
            <Clock size={12} />
            <span>View Blame</span>
          </button>
          <button 
            className="context-menu-item" 
            onClick={() => {
              selectLocalFile(contextMenu.filePath, false);
              setActiveView('history');
              setContextMenu(null);
            }}
          >
            <Calendar size={12} />
            <span>View File History</span>
          </button>
        </div>
      )}
    </div>
  );
}
