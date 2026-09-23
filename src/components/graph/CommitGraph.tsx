/* ═══════════════════════════════════════════════════════
   Basilico — CommitGraph Canvas Renderer
   Draws DAG lanes, nodes, and edges on a canvas
   ═══════════════════════════════════════════════════════ */

import { useEffect, useMemo, useRef } from "react";
import type { GraphCommit } from "../../lib/git-types";
import { useDarkMode } from "../../lib/use-dark-mode";
import { useRepoStore } from "../../store/repo-store";

/** Used only until the theme's `--lane-*` variables resolve. */
const FALLBACK_LANE_COLORS = [
  "#58a6ff",
  "#3fb950",
  "#f0883e",
  "#bc8cff",
  "#f85149",
  "#2dd4bf",
  "#d2a8ff",
  "#ffa657",
  "#ff7b72",
  "#79c0ff",
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
  const theme = useRepoStore((s) => s.settings?.theme);
  // The light/dark scheme is a separate source of truth from the accent preset
  // (`settings.theme`), so the colour memos below have to track both. Keyed on
  // the accent alone, toggling light/dark never re-read the CSS variables:
  // merge-node interiors kept the previous scheme's panel background until the
  // accent happened to change. `monaco-setup.ts` solves the same problem with a
  // MutationObserver; here the value is already reactive, so it just belongs in
  // the dependency list.
  const isDark = useDarkMode();

  // Cache commit indices for O(1) lookup during drawing
  const commitIndices = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < commits.length; i++) {
      map.set(commits[i].oid, i);
    }
    return map;
  }, [commits]);

  // Fetch theme colors dynamically from CSS variables only when theme changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `theme` and `isDark` are not read in the body — they are the cache keys. The body reads the DOM, which the linter cannot see changing, so these are exactly the values that must invalidate the memo.
  const laneColors = useMemo(() => {
    // Before settings load there is no accent yet, but the lane variables are
    // already resolvable — returning [] here made `laneColors[n % 0]` NaN, so
    // every edge was drawn with an invalid strokeStyle until settings arrived.
    if (typeof window === "undefined") return FALLBACK_LANE_COLORS;
    const docStyle = getComputedStyle(document.documentElement);
    return Array.from({ length: 10 }, (_, i) => {
      return (
        docStyle.getPropertyValue(`--lane-${i}`).trim() ||
        FALLBACK_LANE_COLORS[i]
      );
    });
  }, [theme, isDark]);

  // Merge-commit node interiors are filled with the panel background so the
  // ring reads as "hollow" against whatever theme is active — must track the
  // theme like laneColors above, not a hardcoded dark color that only looks
  // right in dark mode.
  // biome-ignore lint/correctness/useExhaustiveDependencies: as above — `--bg-surface` is a light-dark() token, so the memo must recompute when either the accent or the colour scheme changes.
  const nodeFillColor = useMemo(() => {
    if (typeof window === "undefined") return "#0d1117";
    const docStyle = getComputedStyle(document.documentElement);
    return docStyle.getPropertyValue("--bg-surface").trim() || "#0d1117";
  }, [theme, isDark]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      const dpr = window.devicePixelRatio || 1;

      ctx.save();
      ctx.scale(dpr, dpr);

      // Clear
      ctx.clearRect(0, 0, graphWidth, containerHeight);

      // Calculate visible range with overscan
      const startIdx = Math.max(0, Math.floor(scrollOffset / rowHeight) - 5);
      const endIdx = Math.min(
        commits.length,
        Math.ceil((scrollOffset + containerHeight) / rowHeight) + 5,
      );

      // Draw edges first (behind nodes)
      for (let i = startIdx; i < endIdx; i++) {
        const commit = commits[i];
        const y = i * rowHeight + rowHeight / 2 - scrollOffset;

        for (const edge of commit.edges) {
          const fromX = LANE_OFFSET + edge.fromLane * LANE_WIDTH;
          const toX = LANE_OFFSET + edge.toLane * LANE_WIDTH;

          // Find target commit index using O(1) Map cache instead of linear scanning
          const targetIdx = commitIndices.get(edge.toOid);
          if (targetIdx === undefined) continue;

          const toY = targetIdx * rowHeight + rowHeight / 2 - scrollOffset;
          const color = laneColors[edge.fromLane % laneColors.length];

          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = edge.isMerge ? 0.5 : 0.7;

          ctx.beginPath();
          ctx.moveTo(fromX, y);

          if (fromX === toX) {
            ctx.lineTo(toX, toY);
          } else {
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
        ctx.strokeStyle = laneColors[lane % laneColors.length];
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
        const color = laneColors[commit.lane % laneColors.length];

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
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.fillStyle = nodeFillColor;
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillStyle = color;
          ctx.fill();
        }
      }

      ctx.restore();
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [
    commits,
    commitIndices,
    laneColors,
    nodeFillColor,
    rowHeight,
    graphWidth,
    scrollOffset,
    containerHeight,
    maxLane,
  ]);

  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  return (
    <canvas
      ref={canvasRef}
      className="commit-graph-canvas"
      width={graphWidth * dpr}
      height={containerHeight * dpr}
      style={{
        position: "absolute",
        top: 0,
        left: 12,
        pointerEvents: "none",
        zIndex: 1,
        width: `${graphWidth}px`,
        height: `${containerHeight}px`,
      }}
    />
  );
}
