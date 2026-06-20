/* ═══════════════════════════════════════════════════════
   Basilico — CommitDetail Component
   Shows details of the selected commit (changes & file tree)
   ═══════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import { 
  FileText, 
  Copy, 
  Check, 
  Clock, 
  Calendar, 
  Tag, 
  ChevronRight, 
  ChevronDown, 
  Folder, 
  File, 
  Layers,
  ShieldCheck
} from 'lucide-react';
import { useRepoStore } from '../../store/repo-store';
import { useUIStore } from '../../store/ui-store';
import { getCommitSignature } from '../../lib/tauri-commands';
import { formatDateTime, getStatusIcon, getStatusColor, getFileName, getDirectory } from '../../lib/utils';
import type { TreeEntryInfo, SignatureInfo } from '../../lib/git-types';
import './CommitDetail.css';

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  size: number | null;
  children: TreeNode[];
}

function buildFileTree(entries: TreeEntryInfo[]): TreeNode {
  const root: TreeNode = {
    name: 'root',
    path: '',
    isDir: true,
    size: null,
    children: []
  };

  for (const entry of entries) {
    const parts = entry.path.split('/');
    let current = root;
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      
      const isLast = i === parts.length - 1;
      
      let child = current.children.find(c => c.name === part);
      if (!child) {
        child = {
          name: part,
          path: currentPath,
          isDir: !isLast || entry.isDir,
          size: isLast ? entry.size : null,
          children: []
        };
        current.children.push(child);
      }
      current = child;
    }
  }

  const sortTree = (node: TreeNode) => {
    node.children.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortTree);
  };
  sortTree(root);

  return root;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

interface TreeViewNodeProps {
  node: TreeNode;
  level: number;
  onFileClick: (path: string) => void;
}

function TreeViewNode({ node, level, onFileClick }: TreeViewNodeProps) {
  const [isOpen, setIsOpen] = useState(level === 0);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.isDir) {
      setIsOpen(!isOpen);
    } else {
      onFileClick(node.path);
    }
  };

  const hasChildren = node.children.length > 0;

  return (
    <div className="tree-node" style={{ paddingLeft: level > 0 ? '12px' : '0' }}>
      {level > 0 && (
        <div 
          className={`tree-node-row ${node.isDir ? 'dir' : 'file'}`} 
          onClick={handleClick}
        >
          {node.isDir ? (
            <span className="tree-node-chevron">
              {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
          ) : (
            <span className="tree-node-spacer" />
          )}
          
          <span className="tree-node-icon">
            {node.isDir ? (
              <Folder size={12} className="icon-folder" />
            ) : (
              <File size={12} className="icon-file" />
            )}
          </span>
          
          <span className="tree-node-name truncate">{node.name}</span>
          
          {!node.isDir && node.size !== null && (
            <span className="tree-node-size text-mono">
              {formatBytes(node.size)}
            </span>
          )}
        </div>
      )}

      {node.isDir && (isOpen || level === 0) && hasChildren && (
        <div className="tree-node-children">
          {node.children.map((child, idx) => (
            <TreeViewNode 
              key={idx} 
              node={child} 
              level={level + 1} 
              onFileClick={onFileClick} 
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CommitDetail() {
  const { 
    activeTabId,
    commits, 
    selectedCommitOid, 
    commitDiff, 
    selectLocalFile, 
    createTag,
    commitTree,
    loadCommitTree,
    isLoading
  } = useRepoStore();

  const { setActiveView, addNotification, openFileViewer, openPrompt } = useUIStore();
  const [copiedOid, setCopiedOid] = useState(false);
  const [activeTab, setActiveTab] = useState<'changes' | 'tree'>('changes');
  const [sigInfo, setSigInfo] = useState<SignatureInfo | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    filePath: string;
  } | null>(null);

  const commit = commits.find((c) => c.oid === selectedCommitOid);

  // Lazy-load tree when tab changes
  useEffect(() => {
    if (activeTab === 'tree' && selectedCommitOid) {
      loadCommitTree(selectedCommitOid);
    }
  }, [activeTab, selectedCommitOid, loadCommitTree]);

  // Load GPG signature details
  useEffect(() => {
    setSigInfo(null);
    if (!activeTabId || !selectedCommitOid) return;

    getCommitSignature(activeTabId, selectedCommitOid)
      .then((info) => {
        setSigInfo(info);
      })
      .catch((err) => {
        console.error('Failed to load commit signature:', err);
      });
  }, [activeTabId, selectedCommitOid]);

  // Reset tab on commit change
  useEffect(() => {
    setActiveTab('changes');
  }, [selectedCommitOid]);

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

  const handleCreateTagPrompt = () => {
    if (!commit) return;
    openPrompt({
      title: 'Create Tag',
      description: `Create a new tag at commit ${commit.oid.slice(0, 7)}.`,
      fields: [
        {
          name: 'name',
          label: 'Tag Name',
          placeholder: 'e.g. v1.2.0',
          required: true,
        },
        {
          name: 'message',
          label: 'Tag Message (optional)',
          placeholder: 'e.g. Release version',
          type: 'textarea',
        }
      ],
      submitLabel: 'Create Tag',
      onSubmit: async (values) => {
        const name = values.name.trim();
        const message = values.message.trim();
        try {
          await createTag(name, commit.oid, message || null);
          addNotification({ type: 'success', message: `Created tag "${name}" at ${commit.oid.slice(0, 7)}` });
        } catch (err) {
          addNotification({ type: 'error', message: `Failed to create tag: ${err}` });
        }
      }
    });
  };

  const handleFileContextMenu = (e: React.MouseEvent, filePath: string) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      filePath,
    });
  };

  const nestedTree = buildFileTree(commitTree);

  return (
    <div className="commit-detail" onClick={() => setContextMenu(null)}>
      {/* Header */}
      <div className="commit-detail-header">
        <div className="commit-detail-message">{commit.message}</div>
        <div className="commit-detail-meta">
          <div className="commit-detail-author" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
            <strong>{commit.authorName}</strong>
            <span className="text-secondary"> &lt;{commit.authorEmail}&gt;</span>
            {sigInfo && (
              <span className="commit-gpg-badge" title={`GPG Key ID: ${sigInfo.keyId}\nSigner: ${sigInfo.signer}`}>
                <ShieldCheck size={12} />
                <span>Verified</span>
              </span>
            )}
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

      {/* Tabs Selector */}
      <div className="commit-detail-tabs-bar">
        <button 
          className={`commit-detail-tab-btn ${activeTab === 'changes' ? 'active' : ''}`}
          onClick={() => setActiveTab('changes')}
        >
          <Layers size={12} />
          <span>Changes ({commitDiff.length})</span>
        </button>
        <button 
          className={`commit-detail-tab-btn ${activeTab === 'tree' ? 'active' : ''}`}
          onClick={() => setActiveTab('tree')}
        >
          <Folder size={12} />
          <span>File Tree</span>
        </button>
      </div>

      {/* Tab Panels */}
      <div className="commit-detail-panel-content">
        {activeTab === 'changes' ? (
          <div className="commit-detail-files">
            <div className="commit-detail-files-list">
              {isLoading && commitDiff.length === 0 ? (
                <div style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', height: '28px', gap: 'var(--space-2)' }}>
                      <div className="skeleton-shimmer skeleton-line" style={{ width: '16px', height: '12px', marginBottom: 0 }} />
                      <div className="skeleton-shimmer skeleton-line" style={{ width: `${40 + (i % 3) * 15}%`, height: '12px', marginBottom: 0 }} />
                      <div className="skeleton-shimmer skeleton-line" style={{ width: '50px', height: '12px', marginBottom: 0, marginLeft: 'auto' }} />
                    </div>
                  ))}
                </div>
              ) : commitDiff.length === 0 ? (
                <div className="commit-detail-no-changes">No files modified in this commit</div>
              ) : (
                commitDiff.map((file, i) => {
                  const filePath = file.newPath || file.oldPath || '';
                  return (
                    <div 
                      key={i} 
                      className="commit-detail-file"
                      onClick={() => {
                        selectLocalFile(filePath, false);
                        setActiveView('staging');
                      }}
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
                })
              )}
            </div>
          </div>
        ) : (
          <div className="commit-detail-tree">
            {isLoading && commitTree.length === 0 ? (
              <div className="tree-loader">
                <span className="spinner-small" />
                <p>Loading commit tree...</p>
              </div>
            ) : commitTree.length === 0 ? (
              <div className="tree-empty">Unable to read tree structure</div>
            ) : (
              <div className="tree-viewport">
                <TreeViewNode 
                  node={nestedTree} 
                  level={0} 
                  onFileClick={(path) => openFileViewer(path, commit.oid)} 
                />
              </div>
            )}
          </div>
        )}
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
