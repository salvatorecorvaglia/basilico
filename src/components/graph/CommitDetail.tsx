/* ═══════════════════════════════════════════════════════
   Basilico — CommitDetail Component
   Shows details of the selected commit
   ═══════════════════════════════════════════════════════ */

import { FileText, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { useRepoStore } from '../../store/repo-store';
import { formatDateTime, getStatusIcon, getStatusColor, getFileName, getDirectory } from '../../lib/utils';
import './CommitDetail.css';

export function CommitDetail() {
  const { commits, selectedCommitOid, commitDiff } = useRepoStore();
  const [copiedOid, setCopiedOid] = useState(false);

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

  return (
    <div className="commit-detail">
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
              <div key={i} className="commit-detail-file">
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
    </div>
  );
}
