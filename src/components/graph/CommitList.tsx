/* ═══════════════════════════════════════════════════════
   Basilico — CommitList Component
   Virtualized commit list with inline graph
   ═══════════════════════════════════════════════════════ */

import { useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRepoStore } from '../../store/repo-store';
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
  const { commits, selectedCommitOid, selectCommit, loadMoreCommits } = useRepoStore();
  const parentRef = useRef<HTMLDivElement>(null);

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
            containerHeight={parentRef.current?.clientHeight ?? 600}
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
    </div>
  );
}
