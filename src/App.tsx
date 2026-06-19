/* ═══════════════════════════════════════════════════════
   Basilico — App Root Component
   Layout assembly with tab management
   ═══════════════════════════════════════════════════════ */

import { Group, Panel, Separator } from 'react-resizable-panels';
import { TabBar } from './components/layout/TabBar';
import { Toolbar } from './components/layout/Toolbar';
import { StatusBar } from './components/layout/StatusBar';
import { Sidebar } from './components/layout/Sidebar';
import { CommitList } from './components/graph/CommitList';
import { CommitDetail } from './components/graph/CommitDetail';
import { WelcomeScreen } from './components/WelcomeScreen';
import { useRepoStore } from './store/repo-store';
import { useUIStore } from './store/ui-store';
import './App.css';

function App() {
  const { tabs, activeTabId } = useRepoStore();
  const { sidebarVisible } = useUIStore();

  const hasOpenRepo = tabs.length > 0 && activeTabId;

  return (
    <div className="app">
      {/* Tab Bar */}
      <TabBar />

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

              {/* Center: Graph + Detail */}
              <Panel id="center" minSize={40}>
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
