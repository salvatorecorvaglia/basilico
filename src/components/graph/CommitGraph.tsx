/* ═══════════════════════════════════════════════════════
   Basilico — CommitGraph Canvas Renderer
   Draws DAG lanes, nodes, and edges on a canvas
   ═══════════════════════════════════════════════════════ */

import { useRef, useEffect } from 'react';
import type { GraphCommit } from '../../lib/git-types';

const LANE_COLORS = [
  '#58a6ff', '#3fb950', '#f0883e', '#bc8cff', '#f85149',
  '#2dd4bf', '#d2a8ff', '#ffa657', '#ff7b72', '#79c0ff',
];

const NODE_RADIUS = 4;
const LANE_WIDTH = 16;
const LANE_OFFSET = 16;

interface CommitGraphProps {
  commits: GraphCommit[];
  rowHeight: number;
  graphWidth: number;
  scrollOffset: number;
  containerHeight: number;
  maxLane: number;
}

export function CommitGraph({
  commits,
  rowHeight,
  graphWidth,
  scrollOffset,
  containerHeight,
  maxLane,
}: CommitGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    canvas.width = graphWidth * dpr;
    canvas.height = containerHeight * dpr;
    canvas.style.width = `${graphWidth}px`;
    canvas.style.height = `${containerHeight}px`;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, graphWidth, containerHeight);

    // Calculate visible range with overscan
    const startIdx = Math.max(0, Math.floor(scrollOffset / rowHeight) - 5);
    const endIdx = Math.min(
      commits.length,
      Math.ceil((scrollOffset + containerHeight) / rowHeight) + 5
    );

    // Draw edges first (behind nodes)
    for (let i = startIdx; i < endIdx; i++) {
      const commit = commits[i];
      const y = i * rowHeight + rowHeight / 2 - scrollOffset;

      for (const edge of commit.edges) {
        const fromX = LANE_OFFSET + edge.fromLane * LANE_WIDTH;
        const toX = LANE_OFFSET + edge.toLane * LANE_WIDTH;

        // Find target commit index
        const targetIdx = commits.findIndex((c) => c.oid === edge.toOid);
        if (targetIdx === -1) continue;

        const toY = targetIdx * rowHeight + rowHeight / 2 - scrollOffset;
        const color = LANE_COLORS[edge.fromLane % LANE_COLORS.length];

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = edge.isMerge ? 0.5 : 0.7;

        ctx.beginPath();
        ctx.moveTo(fromX, y);

        if (fromX === toX) {
          // Straight line
          ctx.lineTo(toX, toY);
        } else {
          // Curved line for merge/branch edges
          const midY = y + (toY - y) * 0.4;
          ctx.bezierCurveTo(fromX, midY, toX, midY, toX, toY);
        }

        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Draw vertical lane lines for context
    for (let lane = 0; lane <= maxLane && lane < 6; lane++) {
      const x = LANE_OFFSET + lane * LANE_WIDTH;
      ctx.strokeStyle = LANE_COLORS[lane % LANE_COLORS.length];
      ctx.globalAlpha = 0.08;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, containerHeight);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Draw nodes
    for (let i = startIdx; i < endIdx; i++) {
      const commit = commits[i];
      const x = LANE_OFFSET + commit.lane * LANE_WIDTH;
      const y = i * rowHeight + rowHeight / 2 - scrollOffset;
      const color = LANE_COLORS[commit.lane % LANE_COLORS.length];

      const isMerge = commit.parentOids.length > 1;
      const hasRefs = commit.refs.length > 0;

      // Node glow for ref commits
      if (hasRefs) {
        ctx.beginPath();
        ctx.arc(x, y, NODE_RADIUS + 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.15;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Node outline
      ctx.beginPath();
      ctx.arc(x, y, NODE_RADIUS, 0, Math.PI * 2);

      if (isMerge) {
        // Merge commits: hollow circle
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.fillStyle = '#0d1117';
        ctx.fill();
        ctx.stroke();
      } else {
        // Regular commits: filled circle
        ctx.fillStyle = color;
        ctx.fill();
      }
    }
  }, [commits, rowHeight, graphWidth, scrollOffset, containerHeight, maxLane]);

  return (
    <canvas
      ref={canvasRef}
      className="commit-graph-canvas"
      style={{
        position: 'absolute',
        top: 0,
        left: 12,
        pointerEvents: 'none',
        zIndex: 1,
      }}
    />
  );
}
