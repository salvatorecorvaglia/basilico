/* ═══════════════════════════════════════════════════════
   Basilico — WorktreeTree Component
   Worktree tree section with open/prune/remove context menus
   ═══════════════════════════════════════════════════════ */

import * as ContextMenu from "@radix-ui/react-context-menu";
import { FolderOpen, FolderTree, Plus, Scissors, Trash } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { WorktreeInfo } from "../../lib/git-types";
import { useGitAction } from "../../lib/use-git-action";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";

interface WorktreeTreeProps {
  worktrees: WorktreeInfo[];
  onOpenModal: () => void;
}

export function useWorktreeTree({ worktrees, onOpenModal }: WorktreeTreeProps) {
  const { openRepository, removeWorktree, pruneWorktrees } = useRepoStore(
    useShallow((s) => ({
      openRepository: s.openRepository,
      removeWorktree: s.removeWorktree,
      pruneWorktrees: s.pruneWorktrees,
    })),
  );
  const { openConfirm } = useUIStore(
    useShallow((s) => ({
      openConfirm: s.openConfirm,
    })),
  );
  const runGitAction = useGitAction();

  const handlePruneWorktrees = () =>
    runGitAction(() => pruneWorktrees(), {
      successMessage: "Stale worktrees pruned",
      errorPrefix: "Prune failed",
    });

  const handleRemoveWorktree = (path: string) => {
    openConfirm({
      title: "Remove Worktree",
      message: `Remove worktree at "${path}"?`,
      confirmLabel: "Remove Worktree",
      isDanger: true,
      onConfirm: () =>
        runGitAction(() => removeWorktree(path, false), {
          successMessage: "Worktree removed",
          errorPrefix: "Remove failed",
        }),
    });
  };

  return {
    count: worktrees.length,
    icon: <FolderTree size={13} />,
    action: (
      <button
        type="button"
        className="sidebar-header-btn"
        onClick={onOpenModal}
        title="Add worktree"
      >
        <Plus size={13} />
      </button>
    ),
    content:
      worktrees.length === 0 ? (
        <div className="sidebar-empty">No worktrees</div>
      ) : (
        worktrees.map((wt) => (
          <ContextMenu.Root key={wt.path}>
            <ContextMenu.Trigger>
              <button
                type="button"
                className="sidebar-item"
                title={wt.path}
                onDoubleClick={() => openRepository(wt.path)}
              >
                <FolderOpen size={11} className="sidebar-item-dot" />
                <span className="sidebar-item-name truncate">{wt.name}</span>
                {wt.branch && (
                  <span className="sidebar-badge head">{wt.branch}</span>
                )}
              </button>
            </ContextMenu.Trigger>
            <ContextMenu.Portal>
              <ContextMenu.Content className="radix-context-menu">
                <ContextMenu.Item
                  className="context-menu-item"
                  onSelect={() => openRepository(wt.path)}
                >
                  <FolderOpen size={12} />
                  <span>Open in New Tab</span>
                </ContextMenu.Item>
                <ContextMenu.Item
                  className="context-menu-item"
                  onSelect={handlePruneWorktrees}
                >
                  <Scissors size={12} />
                  <span>Prune Stale Worktrees</span>
                </ContextMenu.Item>
                <ContextMenu.Separator className="context-menu-divider" />
                <ContextMenu.Item
                  className="context-menu-item danger"
                  onSelect={() => handleRemoveWorktree(wt.path)}
                >
                  <Trash size={12} />
                  <span>Remove Worktree</span>
                </ContextMenu.Item>
              </ContextMenu.Content>
            </ContextMenu.Portal>
          </ContextMenu.Root>
        ))
      ),
  };
}
