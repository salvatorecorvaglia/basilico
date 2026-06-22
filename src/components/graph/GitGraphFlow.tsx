/* ═══════════════════════════════════════════════════════
   Basilico — GitGraphFlow (React Flow Redesign)
   Fully interactive, zoomable, and pannable commit DAG graph
   ═══════════════════════════════════════════════════════ */

import {
  Background,
  Controls,
  type Edge,
  Handle,
  MiniMap,
  type Node,
  Position,
  ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { GraphCommit } from "../../lib/git-types";
import { useRepoStore } from "../../store/repo-store";
import "./GitGraphFlow.css";

const LANE_WIDTH = 40;
const ROW_HEIGHT = 50;

function CommitNode({ data }: { data: any }) {
  const commit = data.commit as GraphCommit;
  const isSelected = data.isSelected;
  const isMerge = data.isMerge;

  // Custom colors matching the design system
  const fallbackColors = [
    "#6366f1",
    "#10b981",
    "#f59e0b",
    "#a855f7",
    "#ec4899",
    "#06b6d4",
    "#f97316",
    "#14b8a6",
    "#3b82f6",
    "#e11d48",
  ];

  const docStyle =
    typeof window !== "undefined"
      ? getComputedStyle(document.documentElement)
      : null;
  const color = docStyle
    ? docStyle.getPropertyValue(`--lane-${commit.lane % 10}`).trim() ||
      fallbackColors[commit.lane % 10]
    : fallbackColors[commit.lane % 10];

  const headRef = commit.refs.find((r) => r.kind === "Head");
  const tagRef = commit.refs.find((r) => r.kind === "Tag");

  return (
    <div
      className={`git-node-wrapper ${isSelected ? "selected" : ""}`}
      style={{
        width: 12,
        height: 12,
        borderRadius: "50%",
        background: isMerge ? "var(--bg-surface)" : color,
        border: `2px solid ${color}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: isSelected ? "var(--shadow-glow)" : "none",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />

      {/* Visual text details aligned flush to node */}
      <div className="node-info-label">
        <span className="font-semibold text-primary">{commit.shortOid}</span>
        <span className="truncate max-w-[120px]">{commit.message}</span>
        {headRef && <span className="node-ref-badge head">{headRef.name}</span>}
        {tagRef && <span className="node-ref-badge tag">{tagRef.name}</span>}
      </div>
    </div>
  );
}

export function GitGraphFlow() {
  const { commits, selectedCommitOid, selectCommit } = useRepoStore();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  const nodeTypes = useMemo(() => ({ commitNode: CommitNode }), []);

  // Sync graph commits changes
  useEffect(() => {
    if (commits.length === 0) return;

    // Cache commit indices for edge calculations
    const commitIndices = new Map<string, number>();
    for (let i = 0; i < commits.length; i++) {
      commitIndices.set(commits[i].oid, i);
    }

    const docStyle =
      typeof window !== "undefined"
        ? getComputedStyle(document.documentElement)
        : null;
    const fallbackColors = [
      "#6366f1",
      "#10b981",
      "#f59e0b",
      "#a855f7",
      "#ec4899",
      "#06b6d4",
      "#f97316",
      "#14b8a6",
      "#3b82f6",
      "#e11d48",
    ];

    const laneColors = Array.from({ length: 10 }, (_, i) => {
      return docStyle
        ? docStyle.getPropertyValue(`--lane-${i}`).trim() || fallbackColors[i]
        : fallbackColors[i];
    });

    // 1. Generate nodes
    const graphNodes: Node[] = commits.map((commit, idx) => {
      const isSelected = commit.oid === selectedCommitOid;
      const isMerge = commit.parentOids.length > 1;

      return {
        id: commit.oid,
        type: "commitNode",
        position: {
          x: commit.lane * LANE_WIDTH + 30,
          y: idx * ROW_HEIGHT + 30,
        },
        data: {
          commit,
          isSelected,
          isMerge,
        },
      };
    });

    // 2. Generate edges
    const graphEdges: Edge[] = [];
    commits.forEach((commit) => {
      commit.edges.forEach((edge, edgeIdx) => {
        // Connect commit node to parent node
        const targetIdx = commitIndices.get(edge.toOid);
        if (targetIdx !== undefined) {
          const color = laneColors[edge.fromLane % laneColors.length];
          graphEdges.push({
            id: `${commit.oid}-${edge.toOid}-${edgeIdx}`,
            source: commit.oid,
            target: edge.toOid,
            type: "bezier",
            animated: commit.oid === selectedCommitOid,
            style: {
              stroke: color,
              strokeWidth: 2,
              opacity: edge.isMerge ? 0.4 : 0.7,
            },
          });
        }
      });
    });

    setNodes(graphNodes);
    setEdges(graphEdges);
  }, [commits, selectedCommitOid]);

  const onNodeClick = useCallback(
    (_: any, node: Node) => {
      selectCommit(node.id);
    },
    [selectCommit],
  );

  return (
    <div className="git-graph-container">
      <div className="git-graph-header">Interactive Git Graph</div>
      <div className="git-graph-wrapper">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.2}
          maxZoom={1.5}
        >
          <Background color="var(--border-default)" gap={16} size={1} />
          <Controls showInteractive={false} />
          <MiniMap
            nodeColor={(node) => {
              const commit = node.data.commit as GraphCommit;
              const fallbackColors = ["#6366f1", "#10b981", "#f59e0b"];
              return fallbackColors[commit.lane % 3];
            }}
            maskStrokeColor="var(--border-default)"
            zoomable
            pannable
          />
        </ReactFlow>
      </div>
    </div>
  );
}
