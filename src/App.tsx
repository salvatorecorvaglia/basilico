/* ═══════════════════════════════════════════════════════
   Basilico — App Root Component
   Layout assembly with tab management
   ═══════════════════════════════════════════════════════ */

import { listen } from "@tauri-apps/api/event";
import { ArrowLeft, Wrench } from "lucide-react";
import React, { lazy, Suspense, useCallback, useEffect } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { BisectWizard } from "./components/bisect/BisectWizard";
import { CommandPalette } from "./components/command-palette/CommandPalette";
import { CommitDetail } from "./components/graph/CommitDetail";
import { CommitList } from "./components/graph/CommitList";
import { ResetModal } from "./components/graph/ResetModal";
import { Sidebar } from "./components/layout/Sidebar";
import { StatusBar } from "./components/layout/StatusBar";
import { TabBar } from "./components/layout/TabBar";
import { Toolbar } from "./components/layout/Toolbar";
import { RebaseEditor } from "./components/rebase/RebaseEditor";
import { RepoSearch } from "./components/search/RepoSearch";
import { SettingsModal } from "./components/settings/SettingsModal";
import { StagingArea } from "./components/staging/StagingArea";
import { WelcomeScreen } from "./components/WelcomeScreen";

// Lazy load Monaco Editor components to reduce initial bundle footprint
const DiffView = lazy(() =>
  import("./components/diff/DiffView").then((m) => ({ default: m.DiffView })),
);
const BlameView = lazy(() =>
  import("./components/blame/BlameView").then((m) => ({
    default: m.BlameView,
  })),
);
const FileHistory = lazy(() =>
  import("./components/history/FileHistory").then((m) => ({
    default: m.FileHistory,
  })),
);
const CompareView = lazy(() =>
  import("./components/compare/CompareView").then((m) => ({
    default: m.CompareView,
  })),
);
const FileViewerModal = lazy(() =>
  import("./components/graph/FileViewerModal").then((m) => ({
    default: m.FileViewerModal,
  })),
);
const MergeEditor = lazy(() =>
  import("./components/staging/MergeEditor").then((m) => ({
    default: m.MergeEditor,
  })),
);
const StashInspector = lazy(() =>
  import("./components/staging/StashInspector").then((m) => ({
    default: m.StashInspector,
  })),
);

import { open } from "@tauri-apps/plugin-dialog";
import { ConfirmModal } from "./components/layout/ConfirmModal";
import { NotificationToast } from "./components/layout/NotificationToast";
import { PromptModal } from "./components/layout/PromptModal";
import { useUpdater } from "./hooks/use-updater";
import { useRepoStore } from "./store/repo-store";
import { useUIStore } from "./store/ui-store";
import "./App.css";

function matchesShortcut(e: KeyboardEvent, shortcutStr: string): boolean {
  const parts = shortcutStr.split("+");
  let hasCmdOrCtrl = false;
  let hasShift = false;
  let key = "";
  for (const part of parts) {
    if (part === "CmdOrCtrl") {
      hasCmdOrCtrl = true;
    } else if (part === "Shift") {
      hasShift = true;
    } else {
      key = part.toLowerCase();
    }
  }

  const matchesMeta = (e.metaKey || e.ctrlKey) === hasCmdOrCtrl;
  const matchesShift = e.shiftKey === hasShift;

  if (key === "enter") return matchesMeta && matchesShift && e.key === "Enter";
  if (key === ",") return matchesMeta && matchesShift && e.key === ",";
  return matchesMeta && matchesShift && e.key.toLowerCase() === key;
}

interface ViewRouterProps {
  activeView: string;
}

const ViewRouter = React.memo(function ViewRouter({
  activeView,
}: ViewRouterProps) {
  switch (activeView) {
    case "graph":
      return (
        <Group orientation="vertical">
          {/* Commit List */}
          <Panel id="graph" defaultSize="60%" minSize="30%">
            <CommitList />
          </Panel>

          <Separator className="resize-handle resize-handle-vertical" />

          {/* Commit Detail */}
          <Panel id="detail" defaultSize="40%" minSize="15%">
            <CommitDetail />
          </Panel>
        </Group>
      );
    case "staging":
      return (
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
      );
    case "blame":
      return <BlameView />;
    case "history":
      return <FileHistory />;
    case "search":
      return <RepoSearch />;
    case "rebase":
      return <RebaseEditor />;
    case "bisect":
      return <BisectWizard />;
    case "compare":
      return <CompareView />;
    case "conflict-resolver":
      return <MergeEditor />;
    case "stash-inspector":
      return <StashInspector />;
    default:
      return (
        <div className="view-fallback">
          <div className="view-fallback-card animate-scale-in">
            <div className="view-fallback-icon">
              <Wrench size={24} />
            </div>
            <h3 className="view-fallback-title">
              {activeView
                ? activeView.charAt(0).toUpperCase() + activeView.slice(1)
                : "Unknown"}{" "}
              View
            </h3>
            <p className="view-fallback-desc">
              This view is currently under construction or coming in a later
              phase of Basilico.
            </p>
            <button
              className="view-fallback-btn"
              onClick={() => useUIStore.getState().setActiveView("graph")}
            >
              <ArrowLeft size={14} />
              <span>Back to Commit History</span>
            </button>
          </div>
        </div>
      );
  }
});

function App() {
  // Check for updates (production only)
  useUpdater();

  const {
    tabs,
    activeTabId,
    loadSettings,
    settings,
    refreshAll,
    openRepository,
  } = useRepoStore();
  const {
    sidebarVisible,
    activeView,
    toggleSettings,
    toggleCommandPalette,
    setActiveView,
    addNotification,
  } = useUIStore();

  // Load settings and restore tabs on mount
  useEffect(() => {
    const init = async () => {
      await loadSettings();

      const savedRepos = localStorage.getItem("basilico-open-repos");
      const savedActive = localStorage.getItem("basilico-active-repo");
      if (savedRepos) {
        try {
          const paths = JSON.parse(savedRepos) as string[];
          if (paths.length > 0) {
            const { restoreRepositories } = useRepoStore.getState();
            await restoreRepositories(paths, savedActive);
          }
        } catch (e) {
          console.error("Failed to parse saved repositories:", e);
        }
      }
    };
    init();
  }, [loadSettings]);

  // Listen to file system changes from Rust watcher
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const setupListener = async () => {
      unsubscribe = await listen<{ repoPath: string }>(
        "repo:changed",
        (event) => {
          const currentActive = useRepoStore.getState().activeTabId;
          if (currentActive === event.payload.repoPath) {
            // Debounce watcher refreshes on the frontend
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            timeoutId = setTimeout(() => {
              useRepoStore.getState().refreshOnFileSystemChange();
            }, 300);
          }
        },
      );
    };

    setupListener();

    return () => {
      if (unsubscribe) unsubscribe();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  // Open repository via file dialog (shared by both shortcut paths)
  const handleOpenRepo = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Open Git Repository",
    });
    if (selected) {
      await openRepository(selected as string);
    }
  }, [openRepository]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputFocused =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.closest(".monaco-editor"));

      const shortcuts = settings?.keyboardShortcuts;

      // Command palette — always global (works even in input fields)
      const cmdPaletteShortcut =
        shortcuts?.commandPalette || "CmdOrCtrl+Shift+P";
      if (matchesShortcut(e, cmdPaletteShortcut)) {
        e.preventDefault();
        toggleCommandPalette();
        return;
      }

      // Open repo — always global
      if (matchesShortcut(e, "CmdOrCtrl+o")) {
        e.preventDefault();
        handleOpenRepo();
        return;
      }

      // All remaining shortcuts respect input focus
      if (isInputFocused) return;

      const openSettingsShortcut = shortcuts?.openSettings || "CmdOrCtrl+,";
      if (matchesShortcut(e, openSettingsShortcut)) {
        e.preventDefault();
        toggleSettings();
      } else if (matchesShortcut(e, shortcuts?.search || "CmdOrCtrl+F")) {
        e.preventDefault();
        setActiveView("search");
      } else if (
        matchesShortcut(e, shortcuts?.staging || "CmdOrCtrl+Shift+S")
      ) {
        e.preventDefault();
        setActiveView("staging");
      } else if (matchesShortcut(e, shortcuts?.refresh || "CmdOrCtrl+R")) {
        e.preventDefault();
        refreshAll().then(() =>
          addNotification({
            type: "success",
            message: "Repository refreshed successfully",
          }),
        );
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    settings,
    toggleSettings,
    toggleCommandPalette,
    setActiveView,
    refreshAll,
    addNotification,
    handleOpenRepo,
  ]);

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

      {/* File Viewer Modal */}
      <Suspense fallback={null}>
        <FileViewerModal />
      </Suspense>

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
                <Suspense
                  fallback={
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        height: "100%",
                        color: "var(--text-secondary)",
                        fontSize: "14px",
                      }}
                    >
                      Loading view...
                    </div>
                  }
                >
                  <ViewRouter activeView={activeView} />
                </Suspense>
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
