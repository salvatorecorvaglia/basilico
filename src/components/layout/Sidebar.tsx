/* ═══════════════════════════════════════════════════════
   Basilico — Sidebar Component
   Branch/tag/remote/stash tree view — decomposed into sub-components
   ═══════════════════════════════════════════════════════ */

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useRepoStore } from "../../store/repo-store";
import { SubmoduleModal } from "../modals/SubmoduleModal";
import { WorktreeModal } from "../modals/WorktreeModal";
import { useBranchTree } from "../sidebar/BranchTree";
import { useRemoteTree } from "../sidebar/RemoteTree";
import { useStashTree } from "../sidebar/StashTree";
import { useSubmoduleTree } from "../sidebar/SubmoduleTree";
import { useTagTree } from "../sidebar/TagTree";
import { useWorktreeTree } from "../sidebar/WorktreeTree";
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
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        className="sidebar-section-header"
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
      >
        <span className="sidebar-chevron">
          {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        <span className="sidebar-section-icon">{icon}</span>
        <span className="sidebar-section-title">{title}</span>
        <span className="sidebar-section-count">{count}</span>
        {action && (
          // biome-ignore lint/a11y/noStaticElementInteractions: no interaction of its own; the handler only stops the header toggle from firing
          <div
            role="presentation"
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

  // These are hooks (they call useState/useMemo/store selectors internally),
  // so — like any hook — they must run unconditionally on every render, never
  // after a conditional early return, or React sees a different number of
  // hooks between the loading and loaded renders and throws.
  const branchTree = useBranchTree({ branches });
  const remoteTree = useRemoteTree({ branches, remotes });
  const tagTree = useTagTree({ tags });
  const stashTree = useStashTree({ stashes });
  const worktreeTree = useWorktreeTree({
    worktrees,
    onOpenModal: () => setWorktreeModalOpen(true),
  });
  const submoduleTree = useSubmoduleTree({
    submodules,
    onOpenModal: () => setSubmoduleModalOpen(true),
  });

  // Render loading skeleton
  if (isLoading && branches.length === 0) {
    return (
      <div className="sidebar">
        <div className="sidebar-content sidebar-skeleton">
          {[1, 2, 3, 4].map((sectionIndex) => (
            <div key={sectionIndex} className="skeleton-stack">
              <div className="skeleton-shimmer skeleton-line sidebar-skeleton-heading" />
              {[1, 2, 3].map((itemIndex) => (
                <div
                  key={itemIndex}
                  className="skeleton-row sidebar-skeleton-item"
                >
                  <div className="skeleton-shimmer skeleton-dot" />
                  <div
                    className="skeleton-shimmer skeleton-line flush"
                    // Staggered widths: the one genuinely dynamic value.
                    style={{ width: `${40 + (itemIndex % 3) * 15}%` }}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

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
          open={worktreeModalOpen}
          onOpenChange={setWorktreeModalOpen}
        />
      )}
      {/* Submodule Modal */}
      {submoduleModalOpen && (
        <SubmoduleModal
          open={submoduleModalOpen}
          onOpenChange={setSubmoduleModalOpen}
        />
      )}
    </div>
  );
}
