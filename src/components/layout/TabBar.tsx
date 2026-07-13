/* ═══════════════════════════════════════════════════════
   Basilico — TabBar Component
   Repository tabs with close buttons
   ═══════════════════════════════════════════════════════ */

import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Plus, X } from "lucide-react";
import { useRepoStore } from "../../store/repo-store";
import "./TabBar.css";

export function TabBar() {
  const { tabs, activeTabId, switchTab, closeTab, openRepository } =
    useRepoStore();

  const handleOpenRepo = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Open Repository",
    });

    if (selected) {
      await openRepository(selected as string);
    }
  };

  return (
    <div className="tabbar">
      <div className="tabbar-tabs">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const handleKeyDown = (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              switchTab(tab.id);
            }
          };

          return (
            <div
              key={tab.id}
              className={`tabbar-tab ${isActive ? "active" : ""}`}
              onClick={() => switchTab(tab.id)}
              title={tab.path}
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                className="tabbar-tab-button"
                onClick={(e) => {
                  e.stopPropagation();
                  switchTab(tab.id);
                }}
                onKeyDown={handleKeyDown}
                aria-label={tab.name}
              >
                <FolderOpen size={14} className="tabbar-tab-icon" />
                <span className="tabbar-tab-name truncate">{tab.name}</span>
              </button>
              <button
                type="button"
                className="tabbar-tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                aria-label={`Close tab for ${tab.name}`}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>

      <button
        className="tabbar-add"
        onClick={handleOpenRepo}
        title="Open Repository"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
