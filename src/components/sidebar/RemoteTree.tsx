/* ═══════════════════════════════════════════════════════
   Basilico — RemoteTree Component
   Remote branches tree grouped by remote
   ═══════════════════════════════════════════════════════ */

import * as ContextMenu from "@radix-ui/react-context-menu";
import { ArrowLeftRight, CircleDot, Globe, Trash } from "lucide-react";
import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { BranchInfo, RemoteInfo } from "../../lib/git-types";
import { useGitAction } from "../../lib/use-git-action";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";

interface RemoteTreeProps {
  branches: BranchInfo[];
  remotes: RemoteInfo[];
}

export function useRemoteTree({ branches, remotes }: RemoteTreeProps) {
  const { checkoutBranch, deleteBranch, startComparison } = useRepoStore(
    useShallow((s) => ({
      checkoutBranch: s.checkoutBranch,
      deleteBranch: s.deleteBranch,
      startComparison: s.startComparison,
    })),
  );
  const { addNotification, setActiveView, openConfirm } = useUIStore(
    useShallow((s) => ({
      addNotification: s.addNotification,
      setActiveView: s.setActiveView,
      openConfirm: s.openConfirm,
    })),
  );
  const runGitAction = useGitAction();
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);

  // Memoize remote branch filtering
  const remoteBranches = useMemo(
    () => branches.filter((b) => b.isRemote),
    [branches],
  );

  const handleCheckout = (name: string) =>
    runGitAction(() => checkoutBranch(name), {
      successMessage: `Checked out branch "${name}"`,
      errorPrefix: "Failed to checkout branch",
    });

  const handleDeleteRemoteBranch = (name: string) => {
    openConfirm({
      title: "Delete Branch",
      message: `Are you sure you want to delete remote branch "${name}"? This action cannot be undone.`,
      confirmLabel: "Delete Branch",
      isDanger: true,
      onConfirm: () =>
        runGitAction(() => deleteBranch(name, true), {
          successMessage: `Deleted branch "${name}"`,
          errorPrefix: "Failed to delete branch",
        }),
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
                  aria-pressed={selectedBranch === branch.name}
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
                      startComparison(branch.name, activeBranch).catch((err) =>
                        addNotification({
                          type: "error",
                          message: `Comparison failed: ${err}`,
                        }),
                      );
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
