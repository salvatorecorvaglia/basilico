/* ═══════════════════════════════════════════════════════
   Basilico — TabBar Component
   Repository tabs with close buttons
   ═══════════════════════════════════════════════════════ */

import { GitBranch, Plus, X } from 'lucide-react';
import { useRepoStore } from '../../store/repo-store';
import { open } from '@tauri-apps/plugin-dialog';
import './TabBar.css';

export function TabBar() {
  const { tabs, activeTabId, switchTab, closeTab, openRepository } = useRepoStore();

  const handleOpenRepo = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Open Repository',
    });

    if (selected) {
      await openRepository(selected as string);
    }
  };

  return (
    <div className="tabbar">
      <div className="tabbar-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tabbar-tab ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => switchTab(tab.id)}
            title={tab.path}
          >
            <GitBranch size={14} className="tabbar-tab-icon" />
            <span className="tabbar-tab-name truncate">{tab.name}</span>
            <span
              className="tabbar-tab-close"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              role="button"
              tabIndex={0}
            >
              <X size={12} />
            </span>
          </button>
        ))}
      </div>

      <button className="tabbar-add" onClick={handleOpenRepo} title="Open Repository">
        <Plus size={16} />
      </button>
    </div>
  );
}
