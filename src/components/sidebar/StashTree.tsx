/* ═══════════════════════════════════════════════════════
   Basilico — StashTree Component
   Stash tree section with apply/pop/drop context menus
   ═══════════════════════════════════════════════════════ */

import * as ContextMenu from "@radix-ui/react-context-menu";
import { Archive, Check, RotateCcw, Trash } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { StashInfo } from "../../lib/git-types";
import { useGitAction } from "../../lib/use-git-action";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";

interface StashTreeProps {
  stashes: StashInfo[];
}

export function useStashTree({ stashes }: StashTreeProps) {
  const { applyStash, popStash, dropStash, loadStashDetail } = useRepoStore(
    useShallow((s) => ({
      applyStash: s.applyStash,
      popStash: s.popStash,
      dropStash: s.dropStash,
      loadStashDetail: s.loadStashDetail,
    })),
  );
  const { setActiveView, openConfirm } = useUIStore(
    useShallow((s) => ({
      setActiveView: s.setActiveView,
      openConfirm: s.openConfirm,
    })),
  );
  const runGitAction = useGitAction();

  const handleStashSelect = async (index: number) => {
    await loadStashDetail(index);
    setActiveView("stash-inspector");
  };

  const handleApplyStash = (index: number) =>
    runGitAction(() => applyStash(index), {
      successMessage: "Stash applied successfully",
      errorPrefix: "Failed to apply stash",
    });

  const handlePopStash = (index: number) =>
    runGitAction(() => popStash(index), {
      successMessage: "Stash popped successfully",
      errorPrefix: "Failed to pop stash",
    });

  const handleDropStash = (index: number) => {
    openConfirm({
      title: "Drop Stash",
      message: `Are you sure you want to drop stash@{${index}}? This action cannot be undone.`,
      confirmLabel: "Drop Stash",
      isDanger: true,
      onConfirm: () =>
        runGitAction(() => dropStash(index), {
          successMessage: "Stash dropped successfully",
          errorPrefix: "Failed to drop stash",
        }),
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
