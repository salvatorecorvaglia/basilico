/* ═══════════════════════════════════════════════════════
   Basilico — Sidebar Component
   Branch/tag/remote/stash tree view with Radix Context Menu integration
   ═══════════════════════════════════════════════════════ */

import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  Archive,
  ArrowLeftRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Download,
  Edit,
  FolderOpen,
  FolderTree,
  GitBranch,
  GitMerge,
  Globe,
  Package,
  Plus,
  RefreshCw,
  RotateCcw,
  Scissors,
  Tag,
  Trash,
} from "lucide-react";
import { useState } from "react";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import { SubmoduleModal } from "../submodule/SubmoduleModal";
import { WorktreeModal } from "../worktree/WorktreeModal";
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
        className="sidebar-section-header"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="sidebar-chevron">
          {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        <span className="sidebar-section-icon">{icon}</span>
        <span className="sidebar-section-title">{title}</span>
        <span className="sidebar-section-count">{count}</span>
        {action && (
          <div
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
  const {
    branches,
    tags,
    remotes,
    stashes,
    worktrees,
    submodules,
    checkoutBranch,
    createBranch,
    deleteBranch,
    renameBranch,
    mergeBranch,
    deleteTag,
    pushTag,
    applyStash,
    popStash,
    dropStash,
    selectedCommitOid,
    createTag,
    removeWorktree,
    pruneWorktrees,
    initSubmodules,
    updateSubmodules,
    syncSubmodules,
    openRepository,
    startComparison,
    loadStashDetail,
    isLoading,
  } = useRepoStore();

  const { addNotification, setActiveView, openPrompt, openConfirm } =
    useUIStore();

  const [worktreeModalOpen, setWorktreeModalOpen] = useState(false);
  const [submoduleModalOpen, setSubmoduleModalOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Render loading skeleton
  if (isLoading && branches.length === 0) {
    return (
      <div className="sidebar">
        <div
          className="sidebar-content"
          style={{
            padding: "var(--space-4)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-6)",
          }}
        >
          {[1, 2, 3, 4].map((sectionIndex) => (
            <div
              key={sectionIndex}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-3)",
              }}
            >
              <div
                className="skeleton-shimmer skeleton-line"
                style={{
                  width: "60%",
                  height: "14px",
                  marginBottom: "var(--space-2)",
                }}
              />
              {[1, 2, 3].map((itemIndex) => (
                <div
                  key={itemIndex}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-3)",
                    paddingLeft: "var(--space-2)",
                  }}
                >
                  <div
                    className="skeleton-shimmer skeleton-avatar"
                    style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                    }}
                  />
                  <div
                    className="skeleton-shimmer skeleton-line"
                    style={{
                      width: `${40 + (itemIndex % 3) * 15}%`,
                      height: "12px",
                      marginBottom: 0,
                    }}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const localBranches = branches.filter((b) => !b.isRemote);
  const remoteBranches = branches.filter((b) => b.isRemote);

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

  const handleCheckoutTag = async (name: string) => {
    try {
      await checkoutBranch(`refs/tags/${name}`);
      addNotification({
        type: "success",
        message: `Checked out tag "${name}" (detached HEAD)`,
      });
    } catch (err) {
      addNotification({
        type: "error",
        message: `Failed to checkout tag: ${err}`,
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

  const handleCreateTagPrompt = () => {
    openPrompt({
      title: "Create Tag",
      description:
        "Create a new lightweight or annotated tag at the selected commit.",
      fields: [
        {
          name: "name",
          label: "Tag Name",
          placeholder: "e.g. v1.0.0",
          required: true,
        },
        {
          name: "message",
          label: "Tag Message (optional)",
          placeholder: "e.g. Release version 1.0.0",
          type: "textarea",
        },
      ],
      submitLabel: "Create Tag",
      onSubmit: async (values) => {
        const name = values.name.trim();
        const msg = values.message.trim();
        const target = selectedCommitOid || "HEAD";
        try {
          await createTag(name, target, msg || null);
          addNotification({
            type: "success",
            message: `Created tag "${name}" at ${target.slice(0, 7)}`,
          });
        } catch (err) {
          addNotification({
            type: "error",
            message: `Failed to create tag: ${err}`,
          });
        }
      },
    });
  };

  const handleDeleteBranch = (name: string, isRemote: boolean) => {
    openConfirm({
      title: "Delete Branch",
      message: `Are you sure you want to delete ${isRemote ? "remote" : "local"} branch "${name}"? This action cannot be undone.`,
      confirmLabel: "Delete Branch",
      isDanger: true,
      onConfirm: async () => {
        try {
          await deleteBranch(name, isRemote);
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

  const handleDeleteTag = (name: string) => {
    openConfirm({
      title: "Delete Tag",
      message: `Are you sure you want to delete tag "${name}"?`,
      confirmLabel: "Delete Tag",
      isDanger: true,
      onConfirm: async () => {
        try {
          await deleteTag(name);
          addNotification({
            type: "success",
            message: `Deleted tag "${name}"`,
          });
        } catch (err) {
          addNotification({
            type: "error",
            message: `Failed to delete tag: ${err}`,
          });
        }
      },
    });
  };

  const handlePushTag = async (name: string) => {
    try {
      await pushTag("origin", name);
      addNotification({
        type: "success",
        message: `Successfully pushed tag "${name}" to remote`,
      });
    } catch (err) {
      addNotification({ type: "error", message: `Failed to push tag: ${err}` });
    }
  };

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

  return (
    <div className="sidebar">
      <div className="sidebar-content">
        {/* Local Branches */}
        <TreeSection
          title="Branches"
          icon={<GitBranch size={13} />}
          count={localBranches.length}
          defaultOpen={true}
          action={
            <button
              type="button"
              className="sidebar-header-btn"
              onClick={handleCreateBranch}
              title="Create new branch"
            >
              <Plus size={13} />
            </button>
          }
        >
          {localBranches.map((branch) => (
            <ContextMenu.Root key={branch.name}>
              <ContextMenu.Trigger>
                <button
                  type="button"
                  className={`sidebar-item ${branch.isHead ? "active" : ""} ${selectedBranch === branch.name ? "selected" : ""}`}
                  onClick={() => {
                    setSelectedBranch(branch.name);
                    setSelectedTag(null);
                  }}
                  onDoubleClick={() => handleCheckout(branch.name)}
                  title={branch.name}
                >
                  <CircleDot
                    size={11}
                    className={`sidebar-item-dot ${branch.isHead ? "head" : ""}`}
                  />
                  <span className="sidebar-item-name truncate">
                    {branch.name}
                  </span>
                  {branch.isHead && (
                    <span className="sidebar-badge head">HEAD</span>
                  )}
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
                    onSelect={() => handleDeleteBranch(branch.name, false)}
                  >
                    <Trash size={12} />
                    <span>Delete Branch</span>
                  </ContextMenu.Item>
                </ContextMenu.Content>
              </ContextMenu.Portal>
            </ContextMenu.Root>
          ))}
        </TreeSection>

        {/* Remote Branches */}
        <TreeSection
          title="Remotes"
          icon={<Globe size={13} />}
          count={remoteBranches.length}
          defaultOpen={false}
        >
          {remotes.map((remote) => {
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
                        onClick={() => {
                          setSelectedBranch(branch.name);
                          setSelectedTag(null);
                        }}
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
                          onSelect={() => handleDeleteBranch(branch.name, true)}
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
          })}
        </TreeSection>

        {/* Tags */}
        <TreeSection
          title="Tags"
          icon={<Tag size={13} />}
          count={tags.length}
          defaultOpen={false}
          action={
            <button
              type="button"
              className="sidebar-header-btn"
              onClick={handleCreateTagPrompt}
              title="Create new tag"
            >
              <Plus size={13} />
            </button>
          }
        >
          {tags.map((tag) => (
            <ContextMenu.Root key={tag.name}>
              <ContextMenu.Trigger>
                <button
                  type="button"
                  className={`sidebar-item ${selectedTag === tag.name ? "selected" : ""}`}
                  onClick={() => {
                    setSelectedTag(tag.name);
                    setSelectedBranch(null);
                  }}
                  onDoubleClick={() => handleCheckoutTag(tag.name)}
                  title={tag.message || tag.name}
                >
                  <Tag size={11} className="sidebar-item-tag-icon" />
                  <span className="sidebar-item-name truncate">{tag.name}</span>
                  {tag.isAnnotated && (
                    <span className="sidebar-badge annotated">A</span>
                  )}
                </button>
              </ContextMenu.Trigger>
              <ContextMenu.Portal>
                <ContextMenu.Content className="radix-context-menu">
                  <ContextMenu.Item
                    className="context-menu-item"
                    onSelect={() => handleCheckoutTag(tag.name)}
                  >
                    <Tag size={12} />
                    <span>Checkout Tag</span>
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className="context-menu-item"
                    onSelect={() => handlePushTag(tag.name)}
                  >
                    <Globe size={12} />
                    <span>Push Tag to Remote</span>
                  </ContextMenu.Item>
                  <ContextMenu.Separator className="context-menu-divider" />
                  <ContextMenu.Item
                    className="context-menu-item danger"
                    onSelect={() => handleDeleteTag(tag.name)}
                  >
                    <Trash size={12} />
                    <span>Delete Tag</span>
                  </ContextMenu.Item>
                </ContextMenu.Content>
              </ContextMenu.Portal>
            </ContextMenu.Root>
          ))}
        </TreeSection>

        {/* Stashes */}
        <TreeSection
          title="Stashes"
          icon={<Archive size={13} />}
          count={stashes.length}
          defaultOpen={false}
        >
          {stashes.length === 0 ? (
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
          )}
        </TreeSection>

        {/* Worktrees */}
        <TreeSection
          title="Worktrees"
          icon={<FolderTree size={13} />}
          count={worktrees.length}
          defaultOpen={false}
          action={
            <button
              type="button"
              className="sidebar-header-btn"
              onClick={() => setWorktreeModalOpen(true)}
              title="Add worktree"
            >
              <Plus size={13} />
            </button>
          }
        >
          {worktrees.length === 0 ? (
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
                    <span className="sidebar-item-name truncate">
                      {wt.name}
                    </span>
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
          )}
        </TreeSection>

        {/* Submodules */}
        <TreeSection
          title="Submodules"
          icon={<Package size={13} />}
          count={submodules.length}
          defaultOpen={false}
          action={
            <button
              type="button"
              className="sidebar-header-btn"
              onClick={() => setSubmoduleModalOpen(true)}
              title="Add submodule"
            >
              <Plus size={13} />
            </button>
          }
        >
          {submodules.length === 0 ? (
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
                    <span className="sidebar-item-name truncate">
                      {sm.name}
                    </span>
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
          )}
        </TreeSection>
      </div>

      {/* Worktree Modal */}
      {worktreeModalOpen && (
        <WorktreeModal
          isOpen={worktreeModalOpen}
          onClose={() => setWorktreeModalOpen(false)}
        />
      )}
      {/* Submodule Modal */}
      {submoduleModalOpen && (
        <SubmoduleModal
          isOpen={submoduleModalOpen}
          onClose={() => setSubmoduleModalOpen(false)}
        />
      )}
    </div>
  );
}
