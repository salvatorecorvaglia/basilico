/* ═══════════════════════════════════════════════════════
   Basilico — StashTree Component
   Stash tree section with apply/pop/drop context menus
   ═══════════════════════════════════════════════════════ */

import * as ContextMenu from "@radix-ui/react-context-menu";
import { Archive, Check, RotateCcw, Trash } from "lucide-react";
import type { StashInfo } from "../../lib/git-types";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";

interface StashTreeProps {
  stashes: StashInfo[];
}

export function StashTree({ stashes }: StashTreeProps) {
  const { applyStash, popStash, dropStash, loadStashDetail } = useRepoStore();
  const { addNotification, setActiveView, openConfirm } = useUIStore();

  const handleStashSelect = async (index: number) => {
    await loadStashDetail(index);
    setActiveView("stash-inspector");
  };

  const handleApplyStash = async (index: number) => {
    try {
      await applyStash(index);
      addNotification({
        type: "success",
        message: `Stash applied successfully`,
      });
    } catch (err) {
      addNotification({
        type: "error",
        message: `Failed to apply stash: ${err}`,
      });
    }
  };

  const handlePopStash = async (index: number) => {
    try {
      await popStash(index);
      addNotification({
        type: "success",
        message: `Stash popped successfully`,
      });
    } catch (err) {
      addNotification({
        type: "error",
        message: `Failed to pop stash: ${err}`,
      });
    }
  };

  const handleDropStash = (index: number) => {
    openConfirm({
      title: "Drop Stash",
      message: `Are you sure you want to drop stash@{${index}}? This action cannot be undone.`,
      confirmLabel: "Drop Stash",
      isDanger: true,
      onConfirm: async () => {
        try {
          await dropStash(index);
          addNotification({
            type: "success",
            message: `Stash dropped successfully`,
          });
        } catch (err) {
          addNotification({
            type: "error",
            message: `Failed to drop stash: ${err}`,
          });
        }
      },
    });
  };

  return {
    count: stashes.length,
    icon: <Archive size={13} />,
    content:
      stashes.length === 0 ? (
        <div className="sidebar-empty">No stashes</div>
      ) : (
        stashes.map((stash) => (
          <ContextMenu.Root key={stash.index}>
            <ContextMenu.Trigger>
              <button
                type="button"
                className="sidebar-item"
                onClick={() => handleStashSelect(stash.index)}
                title={stash.message}
              >
                <Archive size={11} className="sidebar-item-dot" />
                <span className="sidebar-item-name truncate">
                  {stash.message}
                </span>
              </button>
            </ContextMenu.Trigger>
            <ContextMenu.Portal>
              <ContextMenu.Content className="radix-context-menu">
                <ContextMenu.Item
                  className="context-menu-item"
                  onSelect={() => handleApplyStash(stash.index)}
                >
                  <Check size={12} />
                  <span>Apply Stash</span>
                </ContextMenu.Item>
                <ContextMenu.Item
                  className="context-menu-item"
                  onSelect={() => handlePopStash(stash.index)}
                >
                  <RotateCcw size={12} />
                  <span>Pop Stash</span>
                </ContextMenu.Item>
                <ContextMenu.Separator className="context-menu-divider" />
                <ContextMenu.Item
                  className="context-menu-item danger"
                  onSelect={() => handleDropStash(stash.index)}
                >
                  <Trash size={12} />
                  <span>Drop Stash</span>
                </ContextMenu.Item>
              </ContextMenu.Content>
            </ContextMenu.Portal>
          </ContextMenu.Root>
        ))
      ),
  };
}
