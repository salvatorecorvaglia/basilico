/* ═══════════════════════════════════════════════════════
   Basilico — App Root Component
   Layout assembly with tab management
   ═══════════════════════════════════════════════════════ */

import { useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
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
import { CompareView } from './components/compare/CompareView';
import { FileViewerModal } from './components/graph/FileViewerModal';
import { MergeEditor } from './components/staging/MergeEditor';
import { PullRequestReview } from './components/layout/PullRequestReview';
import { StashInspector } from './components/staging/StashInspector';
import { NotificationToast } from './components/layout/NotificationToast';
import { PromptModal } from './components/layout/PromptModal';
import { ConfirmModal } from './components/layout/ConfirmModal';
import { open } from '@tauri-apps/plugin-dialog';
import { useRepoStore } from './store/repo-store';
import { useUIStore } from './store/ui-store';
import './App.css';

function matchesShortcut(e: KeyboardEvent, shortcutStr: string): boolean {
  const parts = shortcutStr.split('+');
  let meta = false;
  let shift = false;
  let key = '';
  for (const part of parts) {
    if (part === 'CmdOrCtrl') {
      meta = e.metaKey || e.ctrlKey;
    } else if (part === 'Shift') {
      shift = e.shiftKey;
    } else {
      key = part.toLowerCase();
    }
  }
  
  if (key === 'enter') return meta && shift === e.shiftKey && e.key === 'Enter';
  if (key === ',') return meta && shift === e.shiftKey && e.key === ',';
  return meta && shift === e.shiftKey && e.key.toLowerCase() === key;
}

function App() {
  const { tabs, activeTabId, loadSettings, settings, refreshAll, openRepository } = useRepoStore();
  const { sidebarVisible, activeView, toggleSettings, toggleCommandPalette, setActiveView, addNotification } = useUIStore();

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Listen to file system changes from Rust watcher
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const setupListener = async () => {
      unsubscribe = await listen<{ repoPath: string }>('repo:changed', (event) => {
        const currentActive = useRepoStore.getState().activeTabId;
        if (currentActive === event.payload.repoPath) {
          refreshAll();
        }
      });
    };

    setupListener();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [refreshAll]);

  // Open repository via file dialog (shared by both shortcut paths)
  const handleOpenRepo = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Open Git Repository',
    });
    if (selected) {
      await openRepository(selected as string);
    }
  }, [openRepository]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputFocused = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('.monaco-editor')
      );

      const shortcuts = settings?.keyboardShortcuts;

      // Command palette — always global (works even in input fields)
      const cmdPaletteShortcut = shortcuts?.commandPalette || 'CmdOrCtrl+Shift+P';
      if (matchesShortcut(e, cmdPaletteShortcut)) {
        e.preventDefault();
        toggleCommandPalette();
        return;
      }

      // Open repo — always global
      if (matchesShortcut(e, 'CmdOrCtrl+o')) {
        e.preventDefault();
        handleOpenRepo();
        return;
      }

      // All remaining shortcuts respect input focus
      if (isInputFocused) return;

      const openSettingsShortcut = shortcuts?.openSettings || 'CmdOrCtrl+,';
      if (matchesShortcut(e, openSettingsShortcut)) {
        e.preventDefault();
        toggleSettings();
      } else if (matchesShortcut(e, shortcuts?.search || 'CmdOrCtrl+F')) {
        e.preventDefault();
        setActiveView('search');
      } else if (matchesShortcut(e, shortcuts?.staging || 'CmdOrCtrl+Shift+S')) {
        e.preventDefault();
        setActiveView('staging');
      } else if (matchesShortcut(e, shortcuts?.refresh || 'CmdOrCtrl+R')) {
        e.preventDefault();
        refreshAll().then(() => addNotification({ type: 'success', message: 'Repository refreshed successfully' }));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [settings, toggleSettings, toggleCommandPalette, setActiveView, refreshAll, addNotification, handleOpenRepo]);

  const hasOpenRepo = tabs.length > 0 && activeTabId;

  return (
    <div className="app">
      {/* Notifications */}
      <NotificationToast />

      {/* Global prompts/confirms */}
      <PromptModal />
      <ConfirmModal />

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

      {/* File Viewer Modal */}
      <FileViewerModal />

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
                    defaultSize="18%"
                    minSize="12%"
                    maxSize="30%"
                  >
                    <Sidebar />
                  </Panel>
                  <Separator className="resize-handle resize-handle-horizontal" />
                </>
              )}

              {/* Center Panel (depends on activeView) */}
              <Panel id="center" minSize="40%">
                {activeView === 'graph' ? (
                  <Group orientation="vertical">
                    {/* Commit List + Graph */}
                    <Panel id="graph" defaultSize="60%" minSize="30%">
                      <CommitList />
                    </Panel>

                    <Separator className="resize-handle resize-handle-vertical" />

                    {/* Commit Detail */}
                    <Panel id="detail" defaultSize="40%" minSize="15%">
                      <CommitDetail />
                    </Panel>
                  </Group>
                ) : activeView === 'staging' ? (
                  <Group orientation="horizontal">
                    {/* Staging area */}
                    <Panel id="staging-panel" defaultSize="30%" minSize="20%">
                      <StagingArea />
                    </Panel>

                    <Separator className="resize-handle resize-handle-horizontal" />

                    {/* Diff viewer */}
                    <Panel id="diff-panel" defaultSize="70%" minSize="45%">
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
                ) : activeView === 'compare' ? (
                  <CompareView />
                ) : activeView === 'conflict-resolver' ? (
                  <MergeEditor />
                ) : activeView === 'pull-requests' ? (
                  <PullRequestReview />
                ) : activeView === 'stash-inspector' ? (
                  <StashInspector />
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
