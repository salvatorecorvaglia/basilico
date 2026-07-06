/* ═══════════════════════════════════════════════════════
   Basilico — BranchTree Component
   Local branch tree section with context menus
   ═══════════════════════════════════════════════════════ */

import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  ArrowLeftRight,
  CircleDot,
  Edit,
  GitBranch,
  GitMerge,
  Plus,
  Trash,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { BranchInfo } from "../../lib/git-types";
import { validateBranchName } from "../../lib/git-validation";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";

interface BranchTreeProps {
  branches: BranchInfo[];
}

export function BranchTree({ branches }: BranchTreeProps) {
  const {
    checkoutBranch,
    createBranch,
    deleteBranch,
    renameBranch,
    mergeBranch,
    startComparison,
  } = useRepoStore();
  const { addNotification, setActiveView, openPrompt, openConfirm } =
    useUIStore();

  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);

  // Memoize branch filtering
  const localBranches = useMemo(
    () => branches.filter((b) => !b.isRemote),
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

  const handleCreateBranch = () => {
    openPrompt({
      title: "Create Branch",
      description: "Enter a name for the new local branch.",
      fields: [
        {
          name: "name",
          label: "Branch Name",
          placeholder: "e.g. feature/login",
          required: true,
        },
      ],
      submitLabel: "Create Branch",
      onSubmit: async (values) => {
        const name = values.name.trim();
        // Client-side branch name validation
        const validationError = validateBranchName(name);
        if (validationError) {
          addNotification({ type: "error", message: validationError });
          return;
        }
        try {
          await createBranch(name);
          addNotification({
            type: "success",
            message: `Created branch "${name}"`,
          });
        } catch (err) {
          addNotification({
            type: "error",
            message: `Failed to create branch: ${err}`,
          });
        }
      },
    });
  };

  const handleDeleteBranch = (name: string) => {
    openConfirm({
      title: "Delete Branch",
      message: `Are you sure you want to delete local branch "${name}"? This action cannot be undone.`,
      confirmLabel: "Delete Branch",
      isDanger: true,
      onConfirm: async () => {
        try {
          await deleteBranch(name, false);
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

  const handleRenameBranch = (name: string) => {
    openPrompt({
      title: "Rename Branch",
      description: `Enter a new name for branch "${name}".`,
      fields: [
        {
          name: "newName",
          label: "New Branch Name",
          placeholder: "e.g. feature/new-login",
          defaultValue: name,
          required: true,
        },
      ],
      submitLabel: "Rename Branch",
      onSubmit: async (values) => {
        const newName = values.newName.trim();
        if (newName === name) return;
        // Client-side branch name validation
        const validationError = validateBranchName(newName);
        if (validationError) {
          addNotification({ type: "error", message: validationError });
          return;
        }
        try {
          await renameBranch(name, newName);
          addNotification({
            type: "success",
            message: `Renamed branch to "${newName}"`,
          });
        } catch (err) {
          addNotification({
            type: "error",
            message: `Failed to rename branch: ${err}`,
          });
        }
      },
    });
  };

  const handleMergeBranch = (name: string) => {
    openConfirm({
      title: "Merge Branch",
      message: `Are you sure you want to merge branch "${name}" into the active branch?`,
      confirmLabel: "Merge Branch",
      onConfirm: async () => {
        try {
          const result = await mergeBranch(name);
          if (result === "conflicts") {
            addNotification({
              type: "warning",
              message: `Merge conflict in workspace! Please resolve conflicts in the staging area.`,
            });
          } else {
            addNotification({
              type: "success",
              message: `Merged branch "${name}" successfully`,
            });
          }
        } catch (err) {
          addNotification({
            type: "error",
            message: `Failed to merge: ${err}`,
          });
        }
      },
    });
  };

  return {
    count: localBranches.length,
    icon: <GitBranch size={13} />,
    action: (
      <button
        type="button"
        className="sidebar-header-btn"
        onClick={handleCreateBranch}
        title="Create new branch"
      >
        <Plus size={13} />
      </button>
    ),
    content: localBranches.map((branch) => (
      <ContextMenu.Root key={branch.name}>
        <ContextMenu.Trigger>
          <button
            type="button"
            className={`sidebar-item ${branch.isHead ? "active" : ""} ${selectedBranch === branch.name ? "selected" : ""}`}
            onClick={() => setSelectedBranch(branch.name)}
            onDoubleClick={() => handleCheckout(branch.name)}
            title={branch.name}
          >
            <CircleDot
              size={11}
              className={`sidebar-item-dot ${branch.isHead ? "head" : ""}`}
            />
            <span className="sidebar-item-name truncate">{branch.name}</span>
            {branch.isHead && <span className="sidebar-badge head">HEAD</span>}
            {(branch.ahead > 0 || branch.behind > 0) && (
              <span className="sidebar-sync">
                {branch.ahead > 0 && (
                  <span className="sidebar-ahead">↑{branch.ahead}</span>
                )}
                {branch.behind > 0 && (
                  <span className="sidebar-behind">↓{branch.behind}</span>
                )}
              </span>
            )}
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
            <ContextMenu.Item
              className="context-menu-item"
              onSelect={() => handleMergeBranch(branch.name)}
            >
              <GitMerge size={12} />
              <span>Merge into Active Branch</span>
            </ContextMenu.Item>
            <ContextMenu.Item
              className="context-menu-item"
              onSelect={() => handleRenameBranch(branch.name)}
            >
              <Edit size={12} />
              <span>Rename Branch...</span>
            </ContextMenu.Item>
            <ContextMenu.Separator className="context-menu-divider" />
            <ContextMenu.Item
              className="context-menu-item danger"
              onSelect={() => handleDeleteBranch(branch.name)}
            >
              <Trash size={12} />
              <span>Delete Branch</span>
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    )),
  };
}
