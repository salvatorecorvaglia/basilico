/* ═══════════════════════════════════════════════════════
   Basilico — WorktreeTree Component
   Worktree tree section with open/prune/remove context menus
   ═══════════════════════════════════════════════════════ */

import * as ContextMenu from "@radix-ui/react-context-menu";
import { FolderOpen, FolderTree, Plus, Scissors, Trash } from "lucide-react";
import type { WorktreeInfo } from "../../lib/git-types";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";

interface WorktreeTreeProps {
  worktrees: WorktreeInfo[];
  onOpenModal: () => void;
}

export function WorktreeTree({ worktrees, onOpenModal }: WorktreeTreeProps) {
  const { openRepository, removeWorktree, pruneWorktrees } = useRepoStore();
  const { addNotification, openConfirm } = useUIStore();

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
                  onSelect={async () => {
                    try {
                      await pruneWorktrees();
                      addNotification({
                        type: "success",
                        message: "Stale worktrees pruned",
                      });
                    } catch (err) {
                      addNotification({
                        type: "error",
                        message: `Prune failed: ${err}`,
                      });
                    }
                  }}
                >
                  <Scissors size={12} />
                  <span>Prune Stale Worktrees</span>
                </ContextMenu.Item>
                <ContextMenu.Separator className="context-menu-divider" />
                <ContextMenu.Item
                  className="context-menu-item danger"
                  onSelect={() => {
                    openConfirm({
                      title: "Remove Worktree",
                      message: `Remove worktree at "${wt.path}"?`,
                      confirmLabel: "Remove Worktree",
                      isDanger: true,
                      onConfirm: async () => {
                        try {
                          await removeWorktree(wt.path, false);
                          addNotification({
                            type: "success",
                            message: "Worktree removed",
                          });
                        } catch (err) {
                          addNotification({
                            type: "error",
                            message: `Remove failed: ${err}`,
                          });
                        }
                      },
                    });
                  }}
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
