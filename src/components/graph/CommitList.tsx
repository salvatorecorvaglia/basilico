import { useRef, useCallback, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { 
  Check, 
  GitBranch, 
  Tag, 
  RotateCcw, 
  Scissors, 
  FolderSync,
  ArrowLeftRight
} from 'lucide-react';
import { useRepoStore } from '../../store/repo-store';
import { useUIStore } from '../../store/ui-store';
import { CommitGraph } from './CommitGraph';
import { formatRelativeTime, getInitials, stringToColor } from '../../lib/utils';
import type { RefLabel } from '../../lib/git-types';
import './CommitList.css';

const ROW_HEIGHT = 34;
const GRAPH_WIDTH = 120;

function RefBadge({ ref: refLabel }: { ref: RefLabel }) {
  const classes = ['commit-ref'];
  switch (refLabel.kind) {
    case 'Head':
      classes.push('ref-head');
      break;
    case 'LocalBranch':
      classes.push('ref-branch');
      break;
    case 'RemoteBranch':
      classes.push('ref-remote');
      break;
    case 'Tag':
      classes.push('ref-tag');
      break;
  }

  return <span className={classes.join(' ')}>{refLabel.name}</span>;
}

export function CommitList() {
  const { 
    commits, 
    selectedCommitOid, 
    selectCommit, 
    loadMoreCommits,
    checkoutBranch,
    createBranch,
    createTag,
    cherryPickCommit,
    revertCommit,
    startComparison
  } = useRepoStore();

  const { openResetModal, addNotification, setActiveView } = useUIStore();

  const parentRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(600);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    oid: string;
  } | null>(null);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Close context menu on any click outside
  useEffect(() => {
    const handleCloseMenu = () => setContextMenu(null);
    window.addEventListener('click', handleCloseMenu);
    return () => window.removeEventListener('click', handleCloseMenu);
  }, []);

  const virtualizer = useVirtualizer({
    count: commits.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;

    // Load more when near bottom
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 500) {
      loadMoreCommits(500);
    }
  }, [loadMoreCommits]);

  const handleRowContextMenu = (e: React.MouseEvent, oid: string) => {
    e.preventDefault();
    const menuWidth = 220;
    const menuHeight = 320;
    const x = e.clientX + menuWidth > window.innerWidth ? e.clientX - menuWidth : e.clientX;
    const y = e.clientY + menuHeight > window.innerHeight ? e.clientY - menuHeight : e.clientY;
    setContextMenu({
      x,
      y,
      oid,
    });
  };

  const handleCheckoutCommit = async (oid: string) => {
    try {
      await checkoutBranch(oid);
      addNotification({ 
        type: 'success', 
        message: `Checked out commit ${oid.slice(0, 7)} (detached HEAD)` 
      });
    } catch (err) {
      addNotification({ type: 'error', message: `Checkout failed: ${err}` });
    }
  };

  const handleCherryPick = async (oid: string) => {
    try {
      const res = await cherryPickCommit(oid);
      if (res === 'conflicts') {
        addNotification({ 
          type: 'warning', 
          message: `Cherry-pick conflict at commit ${oid.slice(0, 7)}. Please resolve conflicts in staging.` 
        });
      } else {
        addNotification({ 
          type: 'success', 
          message: `Successfully cherry-picked commit ${oid.slice(0, 7)}` 
        });
      }
    } catch (err) {
      addNotification({ type: 'error', message: `Cherry-pick failed: ${err}` });
    }
  };

  const handleRevert = async (oid: string) => {
    try {
      const res = await revertCommit(oid);
      if (res === 'conflicts') {
        addNotification({ 
          type: 'warning', 
          message: `Revert conflict at commit ${oid.slice(0, 7)}. Please resolve conflicts in staging.` 
        });
      } else {
        addNotification({ 
          type: 'success', 
          message: `Successfully reverted commit ${oid.slice(0, 7)}` 
        });
      }
    } catch (err) {
      addNotification({ type: 'error', message: `Revert failed: ${err}` });
    }
  };

  const handleCreateBranchPrompt = async (oid: string) => {
    const name = prompt('Enter new branch name:');
    if (name && name.trim()) {
      try {
        await createBranch(name.trim(), oid);
        addNotification({ 
          type: 'success', 
          message: `Created branch "${name}" at ${oid.slice(0, 7)}` 
        });
      } catch (err) {
        addNotification({ type: 'error', message: `Failed to create branch: ${err}` });
      }
    }
  };

  const handleCreateTagPrompt = async (oid: string) => {
    const name = prompt('Enter new tag name:');
    if (!name || !name.trim()) return;

    const message = prompt('Enter tag message (optional, leave empty for lightweight tag):');

    try {
      await createTag(name.trim(), oid, message?.trim() || null);
      addNotification({ 
        type: 'success', 
        message: `Created tag "${name}" at ${oid.slice(0, 7)}` 
      });
    } catch (err) {
      addNotification({ type: 'error', message: `Failed to create tag: ${err}` });
    }
  };

  if (commits.length === 0) {
    return (
      <div className="commit-list-empty">
        <p>No commits to display</p>
      </div>
    );
  }

  const maxLane = Math.max(...commits.map((c) => c.lane), 0);

  return (
    <div className="commit-list-container">
      {/* Header */}
      <div className="commit-list-header">
        <div className="commit-list-header-graph" style={{ width: GRAPH_WIDTH }}>
          Graph
        </div>
        <div className="commit-list-header-message">Description</div>
        <div className="commit-list-header-author">Author</div>
        <div className="commit-list-header-date">Date</div>
        <div className="commit-list-header-sha">SHA</div>
      </div>

      {/* Virtualized list */}
      <div
        ref={parentRef}
        className="commit-list-scroll"
        onScroll={handleScroll}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {/* Graph canvas overlay */}
          <CommitGraph
            commits={commits}
            rowHeight={ROW_HEIGHT}
            graphWidth={GRAPH_WIDTH}
            scrollOffset={virtualizer.scrollOffset ?? 0}
            containerHeight={containerHeight}
            maxLane={maxLane}
          />

          {/* Commit rows */}
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const commit = commits[virtualRow.index];
            const isSelected = commit.oid === selectedCommitOid;

            return (
              <div
                key={commit.oid}
                className={`commit-row ${isSelected ? 'selected' : ''}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                onClick={() => selectCommit(commit.oid)}
                onContextMenu={(e) => handleRowContextMenu(e, commit.oid)}
              >
                {/* Graph column spacer */}
                <div className="commit-col-graph" style={{ width: GRAPH_WIDTH }} />

                {/* Message + refs */}
                <div className="commit-col-message">
                  {commit.refs.map((ref, i) => (
                    <RefBadge key={i} ref={ref} />
                  ))}
                  <span className="commit-message truncate">{commit.message}</span>
                </div>

                {/* Author */}
                <div className="commit-col-author">
                  <span
                    className="commit-avatar"
                    style={{ background: stringToColor(commit.authorName) }}
                  >
                    {getInitials(commit.authorName)}
                  </span>
                  <span className="commit-author-name truncate">{commit.authorName}</span>
                </div>

                {/* Date */}
                <div className="commit-col-date">
                  {formatRelativeTime(commit.authorDate)}
                </div>

                {/* SHA */}
                <div className="commit-col-sha text-mono">
                  {commit.shortOid}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Commit Context Menu */}
      {contextMenu && (
        <div 
          className="sidebar-context-menu commit-context-menu" 
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button 
            className="context-menu-item" 
            onClick={() => handleCheckoutCommit(contextMenu.oid)}
          >
            <Check size={12} />
            <span>Checkout Commit (Detached HEAD)</span>
          </button>
          
          <button 
            className="context-menu-item" 
            onClick={() => handleCherryPick(contextMenu.oid)}
          >
            <Scissors size={12} />
            <span>Cherry-Pick Commit</span>
          </button>

          <button 
            className="context-menu-item" 
            onClick={() => handleRevert(contextMenu.oid)}
          >
            <RotateCcw size={12} />
            <span>Revert Commit</span>
          </button>

          <button 
            className="context-menu-item" 
            onClick={() => openResetModal(contextMenu.oid)}
          >
            <FolderSync size={12} />
            <span>Reset current branch to this commit...</span>
          </button>

          <div className="context-menu-divider" />

          <button 
            className="context-menu-item" 
            onClick={() => {
              startComparison(contextMenu.oid, 'HEAD').then(() => setActiveView('compare'));
              setContextMenu(null);
            }}
          >
            <ArrowLeftRight size={12} />
            <span>Compare with HEAD</span>
          </button>

          {selectedCommitOid && selectedCommitOid !== contextMenu.oid && (
            <button 
              className="context-menu-item" 
              onClick={() => {
                startComparison(selectedCommitOid, contextMenu.oid).then(() => setActiveView('compare'));
                setContextMenu(null);
              }}
            >
              <ArrowLeftRight size={12} />
              <span>Compare with Selected Commit</span>
            </button>
          )}

          <div className="context-menu-divider" />

          <button 
            className="context-menu-item" 
            onClick={() => handleCreateBranchPrompt(contextMenu.oid)}
          >
            <GitBranch size={12} />
            <span>Create Branch here...</span>
          </button>

          <button 
            className="context-menu-item" 
            onClick={() => handleCreateTagPrompt(contextMenu.oid)}
          >
            <Tag size={12} />
            <span>Create Tag here...</span>
          </button>
        </div>
      )}
    </div>
  );
}

