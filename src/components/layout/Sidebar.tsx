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
} from 'lucide-react';
import { useRepoStore } from '../../store/repo-store';
import './Sidebar.css';

interface TreeSectionProps {
  title: string;
  icon: React.ReactNode;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function TreeSection({ title, icon, count, children, defaultOpen = true }: TreeSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="sidebar-section">
      <button className="sidebar-section-header" onClick={() => setIsOpen(!isOpen)}>
        <span className="sidebar-chevron">
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className="sidebar-section-icon">{icon}</span>
        <span className="sidebar-section-title">{title}</span>
        <span className="sidebar-section-count">{count}</span>
      </button>
      {isOpen && <div className="sidebar-section-content">{children}</div>}
    </div>
  );
}

export function Sidebar() {
  const { branches, tags, remotes } = useRepoStore();

  const localBranches = branches.filter((b) => !b.isRemote);
  const remoteBranches = branches.filter((b) => b.isRemote);

  return (
    <div className="sidebar">
      <div className="sidebar-content">
        {/* Local Branches */}
        <TreeSection
          title="Branches"
          icon={<GitBranch size={14} />}
          count={localBranches.length}
          defaultOpen={true}
        >
          {localBranches.map((branch) => (
            <button
              key={branch.name}
              className={`sidebar-item ${branch.isHead ? 'active' : ''}`}
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
                  <button key={branch.name} className="sidebar-item sidebar-item-nested" title={branch.name}>
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
            <button key={tag.name} className="sidebar-item" title={tag.message || tag.name}>
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
    </div>
  );
}
