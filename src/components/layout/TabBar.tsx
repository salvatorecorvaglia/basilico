/* ═══════════════════════════════════════════════════════
   Basilico — TabBar Component
   Repository tabs with close buttons
   ═══════════════════════════════════════════════════════ */

import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Plus, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useRepoStore } from "../../store/repo-store";
import "./TabBar.css";

export function TabBar() {
  const { tabs, activeTabId, switchTab, closeTab, openRepository } =
    useRepoStore(
      useShallow((s) => ({
        tabs: s.tabs,
        activeTabId: s.activeTabId,
        switchTab: s.switchTab,
        closeTab: s.closeTab,
        openRepository: s.openRepository,
      })),
    );

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
      <div className="tabbar-tabs" role="tablist">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;

          return (
            // The wrapper is pure layout. It previously carried its own
            // onClick, which duplicated the tab button's — every child either
            // handled the event or stopped it, so the only clickable area it
            // added was the padding between the two buttons.
            <div
              key={tab.id}
              className={`tabbar-tab ${isActive ? "active" : ""}`}
              title={tab.path}
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                className="tabbar-tab-button"
                onClick={() => switchTab(tab.id)}
                aria-label={tab.name}
              >
                <FolderOpen size={14} className="tabbar-tab-icon" />
                <span className="tabbar-tab-name truncate">{tab.name}</span>
              </button>
              <button
                type="button"
                className="tabbar-tab-close"
                onClick={() => closeTab(tab.id)}
                aria-label={`Close tab for ${tab.name}`}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="tabbar-add"
        onClick={handleOpenRepo}
        title="Open Repository"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
