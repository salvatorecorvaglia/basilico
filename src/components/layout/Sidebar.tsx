/* ═══════════════════════════════════════════════════════
   Basilico — Sidebar Component
   Branch/tag/remote/stash tree view
   ═══════════════════════════════════════════════════════ */

import {
  Archive,
  ArrowLeftRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock,
  Download,
  Edit,
  FolderOpen,
  FolderTree,
  GitBranch,
  GitMerge,
  GitPullRequest,
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
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
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

  const {
    addNotification,
    setActiveView,
    openCleanModal,
    activeView,
    openPrompt,
    openConfirm,
  } = useUIStore();

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    targetName: string;
    type: "branch" | "tag" | "stash" | "worktree" | "submodule";
    isRemote?: boolean;
  } | null>(null);

  const [worktreeModalOpen, setWorktreeModalOpen] = useState(false);
  const [submoduleModalOpen, setSubmoduleModalOpen] = useState(false);

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

  const openMenu = (
    e: React.MouseEvent,
    targetName: string,
    type: "branch" | "tag" | "stash" | "worktree" | "submodule",
    isRemote?: boolean,
  ) => {
    e.preventDefault();
    const menuWidth = 200;
    const menuHeight =
      type === "branch"
        ? 240
        : type === "tag"
          ? 180
          : type === "worktree"
            ? 180
            : type === "submodule"
              ? 200
              : 150;
    const x =
      e.clientX + menuWidth > window.innerWidth
        ? e.clientX - menuWidth
        : e.clientX;
    const y =
      e.clientY + menuHeight > window.innerHeight
        ? e.clientY - menuHeight
        : e.clientY;
    setContextMenu({
      x,
      y,
      targetName,
      type,
      isRemote,
    });
  };

  const handleContextMenu = (
    e: React.MouseEvent,
    branchName: string,
    isRemote: boolean,
  ) => {
    openMenu(e, branchName, "branch", isRemote);
  };

  const handleTagContextMenu = (e: React.MouseEvent, tagName: string) => {
    openMenu(e, tagName, "tag");
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

  const handleStashContextMenu = (e: React.MouseEvent, index: number) => {
    openMenu(e, index.toString(), "stash");
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
    <div className="sidebar" onClick={() => setContextMenu(null)}>
      <div className="sidebar-content">
        {/* Local Branches */}
        <TreeSection
          title="Branches"
          icon={<GitBranch size={14} />}
          count={localBranches.length}
          defaultOpen={true}
          action={
            <button
              className="sidebar-header-btn"
              onClick={handleCreateBranch}
              title="Create new branch"
            >
              <Plus size={13} />
            </button>
          }
        >
          {localBranches.map((branch) => (
            <button
              key={branch.name}
              className={`sidebar-item ${branch.isHead ? "active" : ""}`}
              onClick={() => handleCheckout(branch.name)}
              onContextMenu={(e) => handleContextMenu(e, branch.name, false)}
              title={branch.name}
            >
              <CircleDot
                size={12}
                className={`sidebar-item-dot ${branch.isHead ? "head" : ""}`}
              />
              <span className="sidebar-item-name truncate">{branch.name}</span>
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
          ))}
        </TreeSection>

        {/* Remote Branches */}
        <TreeSection
          title="Remotes"
          icon={<Globe size={14} />}
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
                  <Globe size={12} />
                  <span className="truncate">{remote.name}</span>
                  <span className="sidebar-remote-url truncate text-tertiary">
                    {remote.url}
                  </span>
                </div>
                {remoteBranchesForRemote.map((branch) => (
                  <button
                    key={branch.name}
                    className="sidebar-item sidebar-item-nested"
                    onClick={() => handleCheckout(branch.name)}
                    onContextMenu={(e) =>
                      handleContextMenu(e, branch.name, true)
                    }
                    title={branch.name}
                  >
                    <span className="sidebar-item-name truncate">
                      {branch.name.replace(`${remote.name}/`, "")}
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </TreeSection>

        {/* Tags */}
        <TreeSection
          title="Tags"
          icon={<Tag size={14} />}
          count={tags.length}
          defaultOpen={false}
          action={
            <button
              className="sidebar-header-btn"
              onClick={handleCreateTagPrompt}
              title="Create new tag"
            >
              <Plus size={13} />
            </button>
          }
        >
          {tags.map((tag) => (
            <button
              key={tag.name}
              className="sidebar-item"
              onClick={() => handleCheckoutTag(tag.name)}
              onContextMenu={(e) => handleTagContextMenu(e, tag.name)}
              title={tag.message || tag.name}
            >
              <Tag size={12} className="sidebar-item-tag-icon" />
              <span className="sidebar-item-name truncate">{tag.name}</span>
              {tag.isAnnotated && (
                <span className="sidebar-badge annotated">A</span>
              )}
            </button>
          ))}
        </TreeSection>

        {/* Stashes */}
        <TreeSection
          title="Stashes"
          icon={<Archive size={14} />}
          count={stashes.length}
          defaultOpen={false}
        >
          {stashes.length === 0 ? (
            <div className="sidebar-empty">No stashes</div>
          ) : (
            stashes.map((stash) => (
              <button
                key={stash.index}
                className="sidebar-item"
                onClick={() => handleStashSelect(stash.index)}
                onContextMenu={(e) => handleStashContextMenu(e, stash.index)}
                title={stash.message}
              >
                <Archive size={12} className="sidebar-item-dot" />
                <span className="sidebar-item-name truncate">
                  {stash.message}
                </span>
              </button>
            ))
          )}
        </TreeSection>

        {/* Reflog Link */}
        <div
          className="sidebar-reflog-item"
          style={{ marginTop: "var(--space-2)" }}
        >
          <button
            className="sidebar-item"
            onClick={() => setActiveView("reflog")}
          >
            <Clock size={12} className="sidebar-item-dot" />
            <span
              className="sidebar-item-name truncate"
              style={{
                fontWeight: "var(--weight-semibold)",
                color: "var(--text-primary)",
              }}
            >
              Reflog (HEAD)
            </span>
          </button>
        </div>

        {/* Pull Requests Link */}
        <div
          className="sidebar-pr-item"
          style={{ marginTop: "var(--space-1)" }}
        >
          <button
            className={`sidebar-item ${activeView === "pull-requests" ? "active" : ""}`}
            onClick={() => setActiveView("pull-requests")}
          >
            <GitPullRequest
              size={12}
              className="sidebar-item-dot"
              style={{ color: "var(--accent-teal)" }}
            />
            <span
              className="sidebar-item-name truncate"
              style={{
                fontWeight: "var(--weight-semibold)",
                color: "var(--text-primary)",
              }}
            >
              Pull Requests
            </span>
          </button>
        </div>

        {/* Clean Repository Link */}
        <div
          className="sidebar-clean-item"
          style={{ marginTop: "var(--space-1)" }}
        >
          <button className="sidebar-item" onClick={openCleanModal}>
            <Trash
              size={12}
              className="sidebar-item-dot"
              style={{ color: "var(--color-danger)" }}
            />
            <span
              className="sidebar-item-name truncate"
              style={{
                fontWeight: "var(--weight-semibold)",
                color: "var(--text-primary)",
              }}
            >
              Clean Repository...
            </span>
          </button>
        </div>

        {/* Worktrees */}
        <TreeSection
          title="Worktrees"
          icon={<FolderTree size={14} />}
          count={worktrees.length}
          defaultOpen={false}
          action={
            <button
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
              <button
                key={wt.path}
                className="sidebar-item"
                title={wt.path}
                onContextMenu={(e) => openMenu(e, wt.path, "worktree")}
                onDoubleClick={() => openRepository(wt.path)}
              >
                <FolderOpen size={12} className="sidebar-item-dot" />
                <span className="sidebar-item-name truncate">{wt.name}</span>
                {wt.branch && (
                  <span className="sidebar-badge head">{wt.branch}</span>
                )}
              </button>
            ))
          )}
        </TreeSection>

        {/* Submodules */}
        <TreeSection
          title="Submodules"
          icon={<Package size={14} />}
          count={submodules.length}
          defaultOpen={false}
          action={
            <button
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
              <button
                key={sm.name}
                className="sidebar-item"
                title={sm.url || sm.path}
                onContextMenu={(e) => openMenu(e, sm.path, "submodule")}
                onDoubleClick={() => {
                  // Open submodule as a new tab
                  const repoPath = useRepoStore.getState().repoInfo?.path;
                  if (repoPath) {
                    openRepository(`${repoPath}/${sm.path}`);
                  }
                }}
              >
                <Package size={12} className="sidebar-item-dot" />
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
            ))
          )}
        </TreeSection>
      </div>

      {/* Floating Context Menu */}
      {contextMenu && (
        <div
          className="sidebar-context-menu animate-fade-in"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === "branch" ? (
            <>
              <button
                className="context-menu-item"
                onClick={() => {
                  handleCheckout(contextMenu.targetName);
                  setContextMenu(null);
                }}
              >
                <CircleDot size={12} />
                <span>Checkout Branch</span>
              </button>
              <button
                className="context-menu-item"
                onClick={() => {
                  const activeBranch =
                    branches.find((b) => b.isHead)?.name || "HEAD";
                  startComparison(contextMenu.targetName, activeBranch);
                  setActiveView("compare");
                  setContextMenu(null);
                }}
              >
                <ArrowLeftRight size={12} />
                <span>Compare with Current Branch...</span>
              </button>
              {!contextMenu.isRemote && (
                <>
                  <button
                    className="context-menu-item"
                    onClick={() => {
                      handleMergeBranch(contextMenu.targetName);
                      setContextMenu(null);
                    }}
                  >
                    <GitMerge size={12} />
                    <span>Merge into Active Branch</span>
                  </button>
                  <button
                    className="context-menu-item"
                    onClick={() => {
                      handleRenameBranch(contextMenu.targetName);
                      setContextMenu(null);
                    }}
                  >
                    <Edit size={12} />
                    <span>Rename Branch...</span>
                  </button>
                </>
              )}
              <button
                className="context-menu-item context-menu-danger"
                onClick={() => {
                  handleDeleteBranch(
                    contextMenu.targetName,
                    !!contextMenu.isRemote,
                  );
                  setContextMenu(null);
                }}
              >
                <Trash size={12} />
                <span>Delete Branch</span>
              </button>
            </>
          ) : contextMenu.type === "tag" ? (
            <>
              <button
                className="context-menu-item"
                onClick={() => {
                  handleCheckoutTag(contextMenu.targetName);
                  setContextMenu(null);
                }}
              >
                <Tag size={12} />
                <span>Checkout Tag</span>
              </button>
              <button
                className="context-menu-item"
                onClick={() => {
                  handlePushTag(contextMenu.targetName);
                  setContextMenu(null);
                }}
              >
                <Globe size={12} />
                <span>Push Tag to Remote</span>
              </button>
              <button
                className="context-menu-item context-menu-danger"
                onClick={() => {
                  handleDeleteTag(contextMenu.targetName);
                  setContextMenu(null);
                }}
              >
                <Trash size={12} />
                <span>Delete Tag</span>
              </button>
            </>
          ) : contextMenu.type === "worktree" ? (
            <>
              <button
                className="context-menu-item"
                onClick={() => {
                  openRepository(contextMenu.targetName);
                  setContextMenu(null);
                }}
              >
                <FolderOpen size={12} />
                <span>Open in New Tab</span>
              </button>
              <button
                className="context-menu-item"
                onClick={async () => {
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
                  setContextMenu(null);
                }}
              >
                <Scissors size={12} />
                <span>Prune Stale Worktrees</span>
              </button>
              <button
                className="context-menu-item context-menu-danger"
                onClick={() => {
                  const target = contextMenu.targetName;
                  openConfirm({
                    title: "Remove Worktree",
                    message: `Remove worktree at "${target}"?`,
                    confirmLabel: "Remove Worktree",
                    isDanger: true,
                    onConfirm: async () => {
                      try {
                        await removeWorktree(target, false);
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
                  setContextMenu(null);
                }}
              >
                <Trash size={12} />
                <span>Remove Worktree</span>
              </button>
            </>
          ) : contextMenu.type === "submodule" ? (
            <>
              <button
                className="context-menu-item"
                onClick={() => {
                  const repoPath = useRepoStore.getState().repoInfo?.path;
                  if (repoPath)
                    openRepository(`${repoPath}/${contextMenu.targetName}`);
                  setContextMenu(null);
                }}
              >
                <FolderOpen size={12} />
                <span>Open in New Tab</span>
              </button>
              <button
                className="context-menu-item"
                onClick={async () => {
                  try {
                    await initSubmodules([contextMenu.targetName]);
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
                  setContextMenu(null);
                }}
              >
                <Download size={12} />
                <span>Init Submodule</span>
              </button>
              <button
                className="context-menu-item"
                onClick={async () => {
                  try {
                    await updateSubmodules([contextMenu.targetName], true);
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
                  setContextMenu(null);
                }}
              >
                <RefreshCw size={12} />
                <span>Update Submodule</span>
              </button>
              <button
                className="context-menu-item"
                onClick={async () => {
                  try {
                    await syncSubmodules([contextMenu.targetName]);
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
                  setContextMenu(null);
                }}
              >
                <RefreshCw size={12} />
                <span>Sync Submodule</span>
              </button>
            </>
          ) : (
            <>
              <button
                className="context-menu-item"
                onClick={() => {
                  handleApplyStash(parseInt(contextMenu.targetName, 10));
                  setContextMenu(null);
                }}
              >
                <Check size={12} />
                <span>Apply Stash</span>
              </button>
              <button
                className="context-menu-item"
                onClick={() => {
                  handlePopStash(parseInt(contextMenu.targetName, 10));
                  setContextMenu(null);
                }}
              >
                <RotateCcw size={12} />
                <span>Pop Stash</span>
              </button>
              <button
                className="context-menu-item context-menu-danger"
                onClick={() => {
                  handleDropStash(parseInt(contextMenu.targetName, 10));
                  setContextMenu(null);
                }}
              >
                <Trash size={12} />
                <span>Drop Stash</span>
              </button>
            </>
          )}
        </div>
      )}

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
