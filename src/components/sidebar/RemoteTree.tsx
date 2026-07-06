/* ═══════════════════════════════════════════════════════
   Basilico — RemoteTree Component
   Remote branches tree grouped by remote
   ═══════════════════════════════════════════════════════ */

import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  ArrowLeftRight,
  CircleDot,
  Globe,
  Trash,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { BranchInfo, RemoteInfo } from "../../lib/git-types";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";

interface RemoteTreeProps {
  branches: BranchInfo[];
  remotes: RemoteInfo[];
}

export function RemoteTree({ branches, remotes }: RemoteTreeProps) {
  const { checkoutBranch, deleteBranch, startComparison } = useRepoStore();
  const { addNotification, setActiveView, openConfirm } = useUIStore();
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);

  // Memoize remote branch filtering
  const remoteBranches = useMemo(
    () => branches.filter((b) => b.isRemote),
    [branches],
  );

  const handleCheckout = async (name: string) => {
    try {
      await checkoutBranch(name);
      addNotification({
        type: "success",
        message: `Checked out branch "${name}"`,
      });
    } catch (err) {
      addNotification({
        type: "error",
        message: `Failed to checkout branch: ${err}`,
      });
    }
  };

  const handleDeleteRemoteBranch = (name: string) => {
    openConfirm({
      title: "Delete Branch",
      message: `Are you sure you want to delete remote branch "${name}"? This action cannot be undone.`,
      confirmLabel: "Delete Branch",
      isDanger: true,
      onConfirm: async () => {
        try {
          await deleteBranch(name, true);
          addNotification({
            type: "success",
            message: `Deleted branch "${name}"`,
          });
        } catch (err) {
          addNotification({
            type: "error",
            message: `Failed to delete branch: ${err}`,
          });
        }
      },
    });
  };

  return {
    count: remoteBranches.length,
    icon: <Globe size={13} />,
    content: remotes.map((remote) => {
      const remoteBranchesForRemote = remoteBranches.filter((b) =>
        b.name.startsWith(`${remote.name}/`),
      );
      return (
        <div key={remote.name} className="sidebar-remote-group">
          <div className="sidebar-remote-header">
            <Globe size={11} className="text-tertiary" />
            <span className="truncate">{remote.name}</span>
            <span className="sidebar-remote-url truncate text-tertiary">
              {remote.url}
            </span>
          </div>
          {remoteBranchesForRemote.map((branch) => (
            <ContextMenu.Root key={branch.name}>
              <ContextMenu.Trigger>
                <button
                  type="button"
                  className={`sidebar-item sidebar-item-nested ${selectedBranch === branch.name ? "selected" : ""}`}
                  onClick={() => setSelectedBranch(branch.name)}
                  onDoubleClick={() => handleCheckout(branch.name)}
                  title={branch.name}
                >
                  <span className="sidebar-item-name truncate">
                    {branch.name.replace(`${remote.name}/`, "")}
                  </span>
                </button>
              </ContextMenu.Trigger>
              <ContextMenu.Portal>
                <ContextMenu.Content className="radix-context-menu">
                  <ContextMenu.Item
                    className="context-menu-item"
                    onSelect={() => handleCheckout(branch.name)}
                  >
                    <CircleDot size={12} />
                    <span>Checkout Branch</span>
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className="context-menu-item"
                    onSelect={() => {
                      const activeBranch =
                        branches.find((b) => b.isHead)?.name || "HEAD";
                      startComparison(branch.name, activeBranch);
                      setActiveView("compare");
                    }}
                  >
                    <ArrowLeftRight size={12} />
                    <span>Compare with Current Branch...</span>
                  </ContextMenu.Item>
                  <ContextMenu.Separator className="context-menu-divider" />
                  <ContextMenu.Item
                    className="context-menu-item danger"
                    onSelect={() => handleDeleteRemoteBranch(branch.name)}
                  >
                    <Trash size={12} />
                    <span>Delete Remote Branch</span>
                  </ContextMenu.Item>
                </ContextMenu.Content>
              </ContextMenu.Portal>
            </ContextMenu.Root>
          ))}
        </div>
      );
    }),
  };
}
