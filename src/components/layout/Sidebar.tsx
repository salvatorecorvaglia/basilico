/* ═══════════════════════════════════════════════════════
   Basilico — Sidebar Component
   Branch/tag/remote/stash tree view — decomposed into sub-components
   ═══════════════════════════════════════════════════════ */

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useRepoStore } from "../../store/repo-store";
import { BranchTree } from "../sidebar/BranchTree";
import { RemoteTree } from "../sidebar/RemoteTree";
import { StashTree } from "../sidebar/StashTree";
import { SubmoduleTree } from "../sidebar/SubmoduleTree";
import { TagTree } from "../sidebar/TagTree";
import { WorktreeTree } from "../sidebar/WorktreeTree";
import { SubmoduleModal } from "../submodule/SubmoduleModal";
import { WorktreeModal } from "../worktree/WorktreeModal";
import "./Sidebar.css";

interface TreeSectionProps {
  title: string;
  icon: React.ReactNode;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
  action?: React.ReactNode;
}

function TreeSection({
  title,
  icon,
  count,
  children,
  defaultOpen = true,
  action,
}: TreeSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="sidebar-section">
      <div
        className="sidebar-section-header"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="sidebar-chevron">
          {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        <span className="sidebar-section-icon">{icon}</span>
        <span className="sidebar-section-title">{title}</span>
        <span className="sidebar-section-count">{count}</span>
        {action && (
          <div
            className="sidebar-section-action-wrapper"
            onClick={(e) => e.stopPropagation()}
          >
            {action}
          </div>
        )}
      </div>
      {isOpen && <div className="sidebar-section-content">{children}</div>}
    </div>
  );
}

export function Sidebar() {
  // Use granular selectors to avoid re-rendering the entire sidebar on every store change
  const isLoading = useRepoStore((s) => s.isLoading);
  const branches = useRepoStore((s) => s.branches);
  const tags = useRepoStore((s) => s.tags);
  const remotes = useRepoStore((s) => s.remotes);
  const stashes = useRepoStore((s) => s.stashes);
  const worktrees = useRepoStore((s) => s.worktrees);
  const submodules = useRepoStore((s) => s.submodules);

  const [worktreeModalOpen, setWorktreeModalOpen] = useState(false);
  const [submoduleModalOpen, setSubmoduleModalOpen] = useState(false);

  // Render loading skeleton
  if (isLoading && branches.length === 0) {
    return (
      <div className="sidebar">
        <div
          className="sidebar-content"
          style={{
            padding: "var(--space-4)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-6)",
          }}
        >
          {[1, 2, 3, 4].map((sectionIndex) => (
            <div
              key={sectionIndex}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-3)",
              }}
            >
              <div
                className="skeleton-shimmer skeleton-line"
                style={{
                  width: "60%",
                  height: "14px",
                  marginBottom: "var(--space-2)",
                }}
              />
              {[1, 2, 3].map((itemIndex) => (
                <div
                  key={itemIndex}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-3)",
                    paddingLeft: "var(--space-2)",
                  }}
                >
                  <div
                    className="skeleton-shimmer skeleton-avatar"
                    style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                    }}
                  />
                  <div
                    className="skeleton-shimmer skeleton-line"
                    style={{
                      width: `${40 + (itemIndex % 3) * 15}%`,
                      height: "12px",
                      marginBottom: 0,
                    }}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Delegate to sub-components which return { count, icon, action?, content }
  const branchTree = BranchTree({ branches });
  const remoteTree = RemoteTree({ branches, remotes });
  const tagTree = TagTree({ tags });
  const stashTree = StashTree({ stashes });
  const worktreeTree = WorktreeTree({
    worktrees,
    onOpenModal: () => setWorktreeModalOpen(true),
  });
  const submoduleTree = SubmoduleTree({
    submodules,
    onOpenModal: () => setSubmoduleModalOpen(true),
  });

  return (
    <div className="sidebar">
      <div className="sidebar-content">
        {/* Local Branches */}
        <TreeSection
          title="Branches"
          icon={branchTree.icon}
          count={branchTree.count}
          defaultOpen={true}
          action={branchTree.action}
        >
          {branchTree.content}
        </TreeSection>

        {/* Remote Branches */}
        <TreeSection
          title="Remotes"
          icon={remoteTree.icon}
          count={remoteTree.count}
          defaultOpen={false}
        >
          {remoteTree.content}
        </TreeSection>

        {/* Tags */}
        <TreeSection
          title="Tags"
          icon={tagTree.icon}
          count={tagTree.count}
          defaultOpen={false}
          action={tagTree.action}
        >
          {tagTree.content}
        </TreeSection>

        {/* Stashes */}
        <TreeSection
          title="Stashes"
          icon={stashTree.icon}
          count={stashTree.count}
          defaultOpen={false}
        >
          {stashTree.content}
        </TreeSection>

        {/* Worktrees */}
        <TreeSection
          title="Worktrees"
          icon={worktreeTree.icon}
          count={worktreeTree.count}
          defaultOpen={false}
          action={worktreeTree.action}
        >
          {worktreeTree.content}
        </TreeSection>

        {/* Submodules */}
        <TreeSection
          title="Submodules"
          icon={submoduleTree.icon}
          count={submoduleTree.count}
          defaultOpen={false}
          action={submoduleTree.action}
        >
          {submoduleTree.content}
        </TreeSection>
      </div>

      {/* Worktree Modal */}
      {worktreeModalOpen && (
        <WorktreeModal
          isOpen={worktreeModalOpen}
          onClose={() => setWorktreeModalOpen(false)}
        />
      )}
      {/* Submodule Modal */}
      {submoduleModalOpen && (
        <SubmoduleModal
          isOpen={submoduleModalOpen}
          onClose={() => setSubmoduleModalOpen(false)}
        />
      )}
    </div>
  );
}
