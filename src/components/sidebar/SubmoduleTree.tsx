/* ═══════════════════════════════════════════════════════
   Basilico — SubmoduleTree Component
   Submodule tree section with init/update/sync context menus
   ═══════════════════════════════════════════════════════ */

import * as ContextMenu from "@radix-ui/react-context-menu";
import { Download, FolderOpen, Package, Plus, RefreshCw } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { SubmoduleInfo } from "../../lib/git-types";
import { useGitAction } from "../../lib/use-git-action";
import { useRepoStore } from "../../store/repo-store";

interface SubmoduleTreeProps {
  submodules: SubmoduleInfo[];
  onOpenModal: () => void;
}

export function useSubmoduleTree({
  submodules,
  onOpenModal,
}: SubmoduleTreeProps) {
  const { openRepository, initSubmodules, updateSubmodules, syncSubmodules } =
    useRepoStore(
      useShallow((s) => ({
        openRepository: s.openRepository,
        initSubmodules: s.initSubmodules,
        updateSubmodules: s.updateSubmodules,
        syncSubmodules: s.syncSubmodules,
      })),
    );
  const runGitAction = useGitAction();

  const handleOpenSubmodule = (path: string) => {
    const repoPath = useRepoStore.getState().repoInfo?.path;
    if (repoPath) {
      openRepository(`${repoPath}/${path}`);
    }
  };

  const handleInitSubmodule = (path: string) =>
    runGitAction(() => initSubmodules([path]), {
      successMessage: "Submodule initialized",
      errorPrefix: "Init failed",
    });

  const handleUpdateSubmodule = (path: string) =>
    runGitAction(() => updateSubmodules([path], true), {
      successMessage: "Submodule updated",
      errorPrefix: "Update failed",
    });

  const handleSyncSubmodule = (path: string) =>
    runGitAction(() => syncSubmodules([path]), {
      successMessage: "Submodule synced",
      errorPrefix: "Sync failed",
    });

  return {
    count: submodules.length,
    icon: <Package size={13} />,
    action: (
      <button
        type="button"
        className="sidebar-header-btn"
        onClick={onOpenModal}
        title="Add submodule"
      >
        <Plus size={13} />
      </button>
    ),
    content:
      submodules.length === 0 ? (
        <div className="sidebar-empty">No submodules</div>
      ) : (
        submodules.map((sm) => (
          <ContextMenu.Root key={sm.name}>
            <ContextMenu.Trigger>
              <button
                type="button"
                className="sidebar-item"
                title={sm.url || sm.path}
                onDoubleClick={() => handleOpenSubmodule(sm.path)}
              >
                <Package size={11} className="sidebar-item-dot" />
                <span className="sidebar-item-name truncate">{sm.name}</span>
                <span
                  className={`sidebar-badge ${
                    sm.status === "dirty"
                      ? "annotated"
                      : sm.status === "up-to-date"
                        ? "head"
                        : ""
                  }`}
                >
                  {sm.status === "dirty"
                    ? "●"
                    : sm.status === "up-to-date"
                      ? "✓"
                      : sm.status === "initialized"
                        ? "○"
                        : "?"}
                </span>
              </button>
            </ContextMenu.Trigger>
            <ContextMenu.Portal>
              <ContextMenu.Content className="radix-context-menu">
                <ContextMenu.Item
                  className="context-menu-item"
                  onSelect={() => handleOpenSubmodule(sm.path)}
                >
                  <FolderOpen size={12} />
                  <span>Open in New Tab</span>
                </ContextMenu.Item>
                <ContextMenu.Item
                  className="context-menu-item"
                  onSelect={() => handleInitSubmodule(sm.path)}
                >
                  <Download size={12} />
                  <span>Init Submodule</span>
                </ContextMenu.Item>
                <ContextMenu.Item
                  className="context-menu-item"
                  onSelect={() => handleUpdateSubmodule(sm.path)}
                >
                  <RefreshCw size={12} />
                  <span>Update Submodule</span>
                </ContextMenu.Item>
                <ContextMenu.Item
                  className="context-menu-item"
                  onSelect={() => handleSyncSubmodule(sm.path)}
                >
                  <RefreshCw size={12} />
                  <span>Sync Submodule</span>
                </ContextMenu.Item>
              </ContextMenu.Content>
            </ContextMenu.Portal>
          </ContextMenu.Root>
        ))
      ),
  };
}
