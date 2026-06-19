/* ═══════════════════════════════════════════════════════
   Basilico — Sidebar Component
   Branch/tag/remote/stash tree view
   ═══════════════════════════════════════════════════════ */

import { useState } from 'react';
import {
  GitBranch,
  Tag,
  Globe,
  ChevronRight,
  ChevronDown,
  CircleDot,
  Archive,
  Plus,
  GitMerge,
  Edit,
  Trash
} from 'lucide-react';
import { useRepoStore } from '../../store/repo-store';
import { useUIStore } from '../../store/ui-store';
import './Sidebar.css';

interface TreeSectionProps {
  title: string;
  icon: React.ReactNode;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
  action?: React.ReactNode;
}

function TreeSection({ title, icon, count, children, defaultOpen = true, action }: TreeSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="sidebar-section">
      <div className="sidebar-section-header" onClick={() => setIsOpen(!isOpen)}>
        <span className="sidebar-chevron">
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className="sidebar-section-icon">{icon}</span>
        <span className="sidebar-section-title">{title}</span>
        <span className="sidebar-section-count">{count}</span>
        {action && <div className="sidebar-section-action-wrapper" onClick={(e) => e.stopPropagation()}>{action}</div>}
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
    checkoutBranch, 
    createBranch, 
    deleteBranch, 
    renameBranch,
    mergeBranch,
    deleteTag
  } = useRepoStore();

  const { addNotification } = useUIStore();

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    targetName: string;
    type: 'branch' | 'tag';
    isRemote?: boolean;
  } | null>(null);

  const localBranches = branches.filter((b) => !b.isRemote);
  const remoteBranches = branches.filter((b) => b.isRemote);

  const handleCheckout = async (name: string) => {
    try {
      await checkoutBranch(name);
      addNotification({ type: 'success', message: `Checked out branch "${name}"` });
    } catch (err) {
      addNotification({ type: 'error', message: `Failed to checkout branch: ${err}` });
    }
  };

  const handleCheckoutTag = async (name: string) => {
    try {
      await checkoutBranch(`refs/tags/${name}`);
      addNotification({ type: 'success', message: `Checked out tag "${name}" (detached HEAD)` });
    } catch (err) {
      addNotification({ type: 'error', message: `Failed to checkout tag: ${err}` });
    }
  };

  const handleCreateBranch = async () => {
    const name = prompt('Enter new branch name:');
    if (name && name.trim()) {
      try {
        await createBranch(name.trim());
        addNotification({ type: 'success', message: `Created branch "${name}"` });
      } catch (err) {
        addNotification({ type: 'error', message: `Failed to create branch: ${err}` });
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent, branchName: string, isRemote: boolean) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      targetName: branchName,
      type: 'branch',
      isRemote,
    });
  };

  const handleTagContextMenu = (e: React.MouseEvent, tagName: string) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      targetName: tagName,
      type: 'tag',
    });
  };

  const handleDeleteBranch = async (name: string, isRemote: boolean) => {
    if (confirm(`Are you sure you want to delete ${isRemote ? 'remote' : 'local'} branch "${name}"?`)) {
      try {
        await deleteBranch(name, isRemote);
        addNotification({ type: 'success', message: `Deleted branch "${name}"` });
      } catch (err) {
        addNotification({ type: 'error', message: `Failed to delete branch: ${err}` });
      }
    }
  };

  const handleDeleteTag = async (name: string) => {
    if (confirm(`Are you sure you want to delete tag "${name}"?`)) {
      try {
        await deleteTag(name);
        addNotification({ type: 'success', message: `Deleted tag "${name}"` });
      } catch (err) {
        addNotification({ type: 'error', message: `Failed to delete tag: ${err}` });
      }
    }
  };

  const handleRenameBranch = async (name: string) => {
    const newName = prompt(`Rename branch "${name}" to:`, name);
    if (newName && newName.trim() && newName.trim() !== name) {
      try {
        await renameBranch(name, newName.trim());
        addNotification({ type: 'success', message: `Renamed branch to "${newName}"` });
      } catch (err) {
        addNotification({ type: 'error', message: `Failed to rename branch: ${err}` });
      }
    }
  };

  const handleMergeBranch = async (name: string) => {
    if (confirm(`Are you sure you want to merge branch "${name}" into the active branch?`)) {
      try {
        const result = await mergeBranch(name);
        if (result === 'conflicts') {
          addNotification({ 
            type: 'warning', 
            message: `Merge conflict in workspace! Please resolve conflicts in the staging area.` 
          });
        } else {
          addNotification({ type: 'success', message: `Merged branch "${name}" successfully` });
        }
      } catch (err) {
        addNotification({ type: 'error', message: `Failed to merge: ${err}` });
      }
    }
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
              className={`sidebar-item ${branch.isHead ? 'active' : ''}`}
              onClick={() => handleCheckout(branch.name)}
              onContextMenu={(e) => handleContextMenu(e, branch.name, false)}
              title={branch.name}
            >
              <CircleDot size={12} className={`sidebar-item-dot ${branch.isHead ? 'head' : ''}`} />
              <span className="sidebar-item-name truncate">{branch.name}</span>
              {branch.isHead && <span className="sidebar-badge head">HEAD</span>}
              {(branch.ahead > 0 || branch.behind > 0) && (
                <span className="sidebar-sync">
                  {branch.ahead > 0 && <span className="sidebar-ahead">↑{branch.ahead}</span>}
                  {branch.behind > 0 && <span className="sidebar-behind">↓{branch.behind}</span>}
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
              b.name.startsWith(`${remote.name}/`)
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
                    onContextMenu={(e) => handleContextMenu(e, branch.name, true)}
                    title={branch.name}
                  >
                    <span className="sidebar-item-name truncate">
                      {branch.name.replace(`${remote.name}/`, '')}
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
              {tag.isAnnotated && <span className="sidebar-badge annotated">A</span>}
            </button>
          ))}
        </TreeSection>
 
        {/* Stashes (placeholder for Phase 3) */}
        <TreeSection
          title="Stashes"
          icon={<Archive size={14} />}
          count={0}
          defaultOpen={false}
        >
          <div className="sidebar-empty">No stashes</div>
        </TreeSection>
      </div>

      {/* Floating Context Menu */}
      {contextMenu && (
        <div 
          className="sidebar-context-menu animate-fade-in" 
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === 'branch' ? (
            <>
              <button 
                className="context-menu-item" 
                onClick={() => { handleCheckout(contextMenu.targetName); setContextMenu(null); }}
              >
                <CircleDot size={12} />
                <span>Checkout Branch</span>
              </button>
              {!contextMenu.isRemote && (
                <>
                  <button 
                    className="context-menu-item" 
                    onClick={() => { handleMergeBranch(contextMenu.targetName); setContextMenu(null); }}
                  >
                    <GitMerge size={12} />
                    <span>Merge into Active Branch</span>
                  </button>
                  <button 
                    className="context-menu-item" 
                    onClick={() => { handleRenameBranch(contextMenu.targetName); setContextMenu(null); }}
                  >
                    <Edit size={12} />
                    <span>Rename Branch...</span>
                  </button>
                </>
              )}
              <button 
                className="context-menu-item context-menu-danger" 
                onClick={() => { handleDeleteBranch(contextMenu.targetName, !!contextMenu.isRemote); setContextMenu(null); }}
              >
                <Trash size={12} />
                <span>Delete Branch</span>
              </button>
            </>
          ) : (
            <>
              <button 
                className="context-menu-item" 
                onClick={() => { handleCheckoutTag(contextMenu.targetName); setContextMenu(null); }}
              >
                <Tag size={12} />
                <span>Checkout Tag</span>
              </button>
              <button 
                className="context-menu-item context-menu-danger" 
                onClick={() => { handleDeleteTag(contextMenu.targetName); setContextMenu(null); }}
              >
                <Trash size={12} />
                <span>Delete Tag</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
