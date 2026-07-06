/* ═══════════════════════════════════════════════════════
   Basilico — SubmoduleTree Component
   Submodule tree section with init/update/sync context menus
   ═══════════════════════════════════════════════════════ */

import * as ContextMenu from "@radix-ui/react-context-menu";
import { Download, FolderOpen, Package, Plus, RefreshCw } from "lucide-react";
import type { SubmoduleInfo } from "../../lib/git-types";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";

interface SubmoduleTreeProps {
  submodules: SubmoduleInfo[];
  onOpenModal: () => void;
}

export function SubmoduleTree({ submodules, onOpenModal }: SubmoduleTreeProps) {
  const { openRepository, initSubmodules, updateSubmodules, syncSubmodules } =
    useRepoStore();
  const { addNotification } = useUIStore();

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
                onDoubleClick={() => {
                  const repoPath = useRepoStore.getState().repoInfo?.path;
                  if (repoPath) {
                    openRepository(`${repoPath}/${sm.path}`);
                  }
                }}
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
                  onSelect={() => {
                    const repoPath = useRepoStore.getState().repoInfo?.path;
                    if (repoPath) {
                      openRepository(`${repoPath}/${sm.path}`);
                    }
                  }}
                >
                  <FolderOpen size={12} />
                  <span>Open in New Tab</span>
                </ContextMenu.Item>
                <ContextMenu.Item
                  className="context-menu-item"
                  onSelect={async () => {
                    try {
                      await initSubmodules([sm.path]);
                      addNotification({
                        type: "success",
                        message: `Submodule initialized`,
                      });
                    } catch (err) {
                      addNotification({
                        type: "error",
                        message: `Init failed: ${err}`,
                      });
                    }
                  }}
                >
                  <Download size={12} />
                  <span>Init Submodule</span>
                </ContextMenu.Item>
                <ContextMenu.Item
                  className="context-menu-item"
                  onSelect={async () => {
                    try {
                      await updateSubmodules([sm.path], true);
                      addNotification({
                        type: "success",
                        message: `Submodule updated`,
                      });
                    } catch (err) {
                      addNotification({
                        type: "error",
                        message: `Update failed: ${err}`,
                      });
                    }
                  }}
                >
                  <RefreshCw size={12} />
                  <span>Update Submodule</span>
                </ContextMenu.Item>
                <ContextMenu.Item
                  className="context-menu-item"
                  onSelect={async () => {
                    try {
                      await syncSubmodules([sm.path]);
                      addNotification({
                        type: "success",
                        message: `Submodule synced`,
                      });
                    } catch (err) {
                      addNotification({
                        type: "error",
                        message: `Sync failed: ${err}`,
                      });
                    }
                  }}
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
