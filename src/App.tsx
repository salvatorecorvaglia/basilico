/* ═══════════════════════════════════════════════════════
   Basilico — App Root Component
   Layout assembly with tab management
   ═══════════════════════════════════════════════════════ */

import { useEffect } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { TabBar } from './components/layout/TabBar';
import { Toolbar } from './components/layout/Toolbar';
import { StatusBar } from './components/layout/StatusBar';
import { Sidebar } from './components/layout/Sidebar';
import { CommitList } from './components/graph/CommitList';
import { CommitDetail } from './components/graph/CommitDetail';
import { WelcomeScreen } from './components/WelcomeScreen';
import { StagingArea } from './components/staging/StagingArea';
import { DiffView } from './components/diff/DiffView';
import { BlameView } from './components/blame/BlameView';
import { FileHistory } from './components/history/FileHistory';
import { ReflogView } from './components/reflog/ReflogView';
import { RepoSearch } from './components/search/RepoSearch';
import { CommandPalette } from './components/command-palette/CommandPalette';
import { RebaseEditor } from './components/rebase/RebaseEditor';
import { BisectWizard } from './components/bisect/BisectWizard';
import { SettingsModal } from './components/settings/SettingsModal';
import { ResetModal } from './components/graph/ResetModal';
import { CleanModal } from './components/clean/CleanModal';
import { useRepoStore } from './store/repo-store';
import { useUIStore } from './store/ui-store';
import './App.css';

function App() {
  const { tabs, activeTabId, loadSettings } = useRepoStore();
  const { sidebarVisible, activeView, toggleSettings, toggleCommandPalette } = useUIStore();

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === ',') {
        e.preventDefault();
        toggleSettings();
      } else if (meta && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        toggleCommandPalette();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleSettings, toggleCommandPalette]);

  const hasOpenRepo = tabs.length > 0 && activeTabId;

  return (
    <div className="app">
      {/* Tab Bar */}
      <TabBar />

      {/* Command Palette Overlay */}
      <CommandPalette />

      {/* Settings Modal */}
      <SettingsModal />

      {/* Reset Modal */}
      <ResetModal />

      {/* Clean Modal */}
      <CleanModal />

      {hasOpenRepo ? (
        <>
          {/* Toolbar */}
          <Toolbar />

          {/* Main Content */}
          <div className="app-content">
            <Group orientation="horizontal">
              {/* Sidebar */}
              {sidebarVisible && (
                <>
                  <Panel
                    id="sidebar"
                    defaultSize={18}
                    minSize={12}
                    maxSize={30}
                  >
                    <Sidebar />
                  </Panel>
                  <Separator className="resize-handle resize-handle-horizontal" />
                </>
              )}

              {/* Center Panel (depends on activeView) */}
              <Panel id="center" minSize={40}>
                {activeView === 'graph' ? (
                  <Group orientation="vertical">
                    {/* Commit List + Graph */}
                    <Panel id="graph" defaultSize={60} minSize={30}>
                      <CommitList />
                    </Panel>

                    <Separator className="resize-handle resize-handle-vertical" />

                    {/* Commit Detail */}
                    <Panel id="detail" defaultSize={40} minSize={15}>
                      <CommitDetail />
                    </Panel>
                  </Group>
                ) : activeView === 'staging' ? (
                  <Group orientation="horizontal">
                    {/* Staging area */}
                    <Panel id="staging-panel" defaultSize={30} minSize={20}>
                      <StagingArea />
                    </Panel>

                    <Separator className="resize-handle resize-handle-horizontal" />

                    {/* Diff viewer */}
                    <Panel id="diff-panel" defaultSize={70} minSize={45}>
                      <DiffView />
                    </Panel>
                  </Group>
                ) : activeView === 'blame' ? (
                  <BlameView />
                ) : activeView === 'history' ? (
                  <FileHistory />
                ) : activeView === 'reflog' ? (
                  <ReflogView />
                ) : activeView === 'search' ? (
                  <RepoSearch />
                ) : activeView === 'rebase' ? (
                  <RebaseEditor />
                ) : activeView === 'bisect' ? (
                  <BisectWizard />
                ) : (
                  <div className="view-fallback">
                    <h3>{activeView.toUpperCase()} View</h3>
                    <p>Coming soon in later phases</p>
                  </div>
                )}
              </Panel>
            </Group>
          </div>

          {/* Status Bar */}
          <StatusBar />
        </>
      ) : (
        <WelcomeScreen />
      )}
    </div>
  );
}

export default App;
