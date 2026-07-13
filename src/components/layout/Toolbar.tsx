/* ═══════════════════════════════════════════════════════
   Basilico — Toolbar Component
   Top action bar with repository selector, branch popover, and actions
   ═══════════════════════════════════════════════════════ */

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Popover from "@radix-ui/react-popover";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  Code,
  Command,
  FolderGit2,
  FolderPlus,
  GitBranch,
  Moon,
  RefreshCw,
  Search,
  Settings,
  Sun,
  Terminal,
} from "lucide-react";
import { useEffect, useState } from "react";
import { openExternalTool } from "../../lib/tauri-commands";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import "./Toolbar.css";

export function Toolbar() {
  const {
    status,
    isRefreshing,
    refreshAll,
    fetch,
    pull,
    push,
    branches,
    checkoutBranch,
    tabs,
    activeTabId,
    switchTab,
    openRepository,
  } = useRepoStore();

  const {
    toggleCommandPalette,
    toggleSettings,
    activeView,
    setActiveView,
    addNotification,
  } = useUIStore();

  const [isFetching, setIsFetching] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isPushing, setIsPushing] = useState(false);

  const [branchPopoverOpen, setBranchPopoverOpen] = useState(false);
  const [branchSearch, setBranchSearch] = useState("");

  const [isDarkMode, setIsDarkMode] = useState(true);

  const handleLaunchTool = async (tool: string) => {
    if (!activeTabId) return;
    try {
      await openExternalTool(activeTabId, tool);
    } catch (err) {
      addNotification({
        type: "error",
        message: `Failed to launch ${tool}: ${err}`,
      });
    }
  };

  // Sync native color scheme with light-dark switcher
  useEffect(() => {
    const isDark =
      document.documentElement.classList.contains("dark") ||
      getComputedStyle(document.documentElement)
        .getPropertyValue("color-scheme")
        .includes("dark");
    setIsDarkMode(isDark);
  }, []);

  const toggleColorScheme = () => {
    const nextDark = !isDarkMode;
    setIsDarkMode(nextDark);
    document.documentElement.style.colorScheme = nextDark ? "dark" : "light";
    if (nextDark) {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
    }
  };

  const handleCheckout = async (name: string) => {
    try {
      await checkoutBranch(name);
      addNotification({
        type: "success",
        message: `Checked out branch "${name}"`,
      });
      setBranchPopoverOpen(false);
      setBranchSearch("");
    } catch (err) {
      addNotification({
        type: "error",
        message: `Failed to checkout branch: ${err}`,
      });
    }
  };

  const handleOpenRepo = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Open Git Repository",
    });
    if (selected) {
      await openRepository(selected as string);
    }
  };

  const handleFetch = async () => {
    setIsFetching(true);
    try {
      await fetch("origin");
      addNotification({
        type: "success",
        message: "Fetch completed successfully",
      });
    } catch (err) {
      addNotification({ type: "error", message: `Fetch failed: ${err}` });
    } finally {
      setIsFetching(false);
    }
  };

  const handlePull = async () => {
    if (!status?.branch) return;
    setIsPulling(true);
    try {
      const res = await pull("origin", status.branch);
      if (res === "conflicts") {
        addNotification({
          type: "warning",
          message:
            "Pull resulted in conflicts. Please resolve conflicts in the staging area.",
        });
      } else {
        addNotification({
          type: "success",
          message: "Pull completed successfully",
        });
      }
    } catch (err) {
      addNotification({ type: "error", message: `Pull failed: ${err}` });
    } finally {
      setIsPulling(false);
    }
  };

  const handlePush = async (force = false) => {
    if (!status?.branch) return;
    setIsPushing(true);
    try {
      await push("origin", status.branch, force);
      addNotification({
        type: "success",
        message: "Push completed successfully",
      });
    } catch (err) {
      addNotification({ type: "error", message: `Push failed: ${err}` });
    } finally {
      setIsPushing(false);
    }
  };

  const totalModifications = status
    ? status.staged.length + status.unstaged.length + status.untracked.length
    : 0;

  const isAnySyncing = isFetching || isPulling || isPushing;

  const filteredBranches = branches.filter((b) =>
    b.name.toLowerCase().includes(branchSearch.toLowerCase()),
  );
  const localBranches = filteredBranches.filter((b) => !b.isRemote);
  const remoteBranches = filteredBranches.filter((b) => b.isRemote);

  const activeTabName =
    tabs.find((t) => t.id === activeTabId)?.name || "Select Repository";

  return (
    <div className="toolbar">
      <div className="toolbar-section toolbar-left">
        {/* Repository Dropdown Selector */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              className="toolbar-btn toolbar-repo-selector"
              title="Switch active repository"
            >
              <FolderGit2
                size={13}
                style={{ color: "var(--accent-primary)" }}
              />
              <span className="truncate">{activeTabName}</span>
              <ChevronDown size={11} className="opacity-60" />
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="radix-dropdown-content toolbar-repo-dropdown"
              align="start"
            >
              <div className="popover-section-header">Active Repositories</div>
              {tabs.map((tab) => (
                <DropdownMenu.Item
                  key={tab.id}
                  className={`dropdown-item ${tab.id === activeTabId ? "active" : ""}`}
                  onSelect={() => switchTab(tab.id)}
                >
                  <span className="truncate">{tab.name}</span>
                  {tab.id === activeTabId && <Check size={12} />}
                </DropdownMenu.Item>
              ))}

              <DropdownMenu.Separator className="dropdown-divider" />

              <DropdownMenu.Item
                className="dropdown-item"
                onSelect={handleOpenRepo}
              >
                <div className="flex items-center gap-2">
                  <FolderPlus size={13} />
                  <span>Open Repository...</span>
                </div>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        {activeTabId && (
          <div className="toolbar-launcher-group">
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => handleLaunchTool("vscode")}
              title="Open in VS Code"
            >
              <Code size={13} />
            </button>
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => handleLaunchTool("terminal")}
              title="Open in Terminal"
            >
              <Terminal size={13} />
            </button>
          </div>
        )}

        {/* Branch Selector Popover */}
        <Popover.Root
          open={branchPopoverOpen}
          onOpenChange={setBranchPopoverOpen}
        >
          <Popover.Trigger asChild>
            <button
              className="toolbar-btn toolbar-branch-trigger"
              title="Switch active branch"
            >
              <GitBranch size={13} />
              <span className="truncate">{status?.branch || "No branch"}</span>
              <ChevronDown size={11} className="opacity-60" />
            </button>
          </Popover.Trigger>

          <Popover.Portal>
            <Popover.Content
              className="radix-popover-content toolbar-branch-popover"
              align="start"
              sideOffset={6}
            >
              <div className="popover-search-wrapper">
                <Search size={12} className="popover-search-icon" />
                <input
                  type="text"
                  className="popover-search-input"
                  placeholder="Search branches..."
                  value={branchSearch}
                  onChange={(e) => setBranchSearch(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="popover-branch-list custom-scrollbar">
                {localBranches.length === 0 && remoteBranches.length === 0 ? (
                  <div className="popover-empty">No branches found</div>
                ) : (
                  <>
                    {localBranches.length > 0 && (
                      <div className="popover-section-header">
                        Local Branches
                      </div>
                    )}
                    {localBranches.map((branch) => (
                      <button
                        key={branch.name}
                        type="button"
                        className={`popover-item ${branch.isHead ? "active" : ""}`}
                        onClick={() => handleCheckout(branch.name)}
                      >
                        <span className="truncate">{branch.name}</span>
                        {branch.isHead && <Check size={12} />}
                      </button>
                    ))}

                    {remoteBranches.length > 0 && (
                      <div className="popover-section-header">
                        Remote Branches
                      </div>
                    )}
                    {remoteBranches.map((branch) => (
                      <button
                        key={branch.name}
                        type="button"
                        className="popover-item remote"
                        onClick={() => handleCheckout(branch.name)}
                      >
                        <span className="truncate">{branch.name}</span>
                        {branch.isHead && <Check size={12} />}
                      </button>
                    ))}
                  </>
                )}
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        {status && (status.ahead > 0 || status.behind > 0) && (
          <div className="toolbar-sync-status">
            {status.ahead > 0 && (
              <span className="toolbar-ahead" title={`${status.ahead} ahead`}>
                ↑{status.ahead}
              </span>
            )}
            {status.behind > 0 && (
              <span
                className="toolbar-behind"
                title={`${status.behind} behind`}
              >
                ↓{status.behind}
              </span>
            )}
          </div>
        )}

        {/* Sync Controls */}
        <div className="toolbar-sync-actions">
          <button
            type="button"
            className={`toolbar-icon-btn ${isFetching ? "spinning" : ""}`}
            onClick={handleFetch}
            title="Fetch from remote (origin)"
            aria-label="Fetch from remote (origin)"
            disabled={isAnySyncing}
          >
            <RefreshCw size={13} />
          </button>
          <button
            type="button"
            className={`toolbar-icon-btn ${isPulling ? "spinning" : ""}`}
            onClick={handlePull}
            title="Pull from remote (origin)"
            aria-label="Pull from remote (origin)"
            disabled={!status?.branch || isAnySyncing}
          >
            <ArrowDownToLine size={13} />
          </button>
          <button
            type="button"
            className={`toolbar-icon-btn ${isPushing ? "spinning" : ""}`}
            onClick={() => handlePush(false)}
            title="Push to remote (origin)"
            aria-label="Push to remote (origin)"
            disabled={!status?.branch || isAnySyncing}
          >
            <ArrowUpFromLine size={13} />
          </button>
        </div>
      </div>

      {/* Center Segmented View Switcher */}
      <div className="toolbar-section toolbar-center">
        <div className="toolbar-segmented">
          <button
            type="button"
            className={`toolbar-segment-btn ${activeView === "graph" ? "active" : ""}`}
            onClick={() => setActiveView("graph")}
          >
            History
          </button>
          <button
            type="button"
            className={`toolbar-segment-btn ${activeView === "staging" ? "active" : ""}`}
            onClick={() => {
              setActiveView("staging");
              // Automatically select first file if staging opens and none selected
              if (status && !useRepoStore.getState().selectedFilePath) {
                const firstFile =
                  status.conflicted[0] ||
                  status.staged[0]?.path ||
                  status.unstaged[0]?.path ||
                  status.untracked[0];
                if (firstFile) {
                  const isStaged = status.staged.some(
                    (f) => f.path === firstFile,
                  );
                  useRepoStore.getState().selectLocalFile(firstFile, isStaged);
                }
              }
            }}
          >
            Staging
            {totalModifications > 0 && (
              <span className="toolbar-badge-count">{totalModifications}</span>
            )}
          </button>
          <button
            type="button"
            className={`toolbar-segment-btn ${activeView === "reflog" ? "active" : ""}`}
            onClick={() => setActiveView("reflog")}
          >
            Reflog
          </button>
        </div>
      </div>

      <div className="toolbar-section toolbar-right">
        {/* Color Scheme Switcher */}
        <button
          type="button"
          className="toolbar-icon-btn"
          onClick={toggleColorScheme}
          title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          aria-label="Toggle Color Scheme"
        >
          {isDarkMode ? <Sun size={13} /> : <Moon size={13} />}
        </button>

        <button
          type="button"
          className={`toolbar-icon-btn ${isRefreshing ? "spinning" : ""}`}
          onClick={refreshAll}
          title="Refresh repository"
          aria-label="Refresh repository"
        >
          <RefreshCw size={13} />
        </button>

        <button
          type="button"
          className="toolbar-icon-btn"
          onClick={() => setActiveView("search")}
          title="Search (Ctrl+F)"
          aria-label="Search repository"
        >
          <Search size={13} />
        </button>

        <button
          type="button"
          className="toolbar-icon-btn"
          onClick={toggleCommandPalette}
          title="Command Palette (Ctrl+Shift+P)"
          aria-label="Open Command Palette"
        >
          <Command size={13} />
        </button>

        <button
          type="button"
          className="toolbar-icon-btn"
          onClick={toggleSettings}
          title="Settings (⌘,)"
          aria-label="Open Settings"
        >
          <Settings size={13} />
        </button>
      </div>
    </div>
  );
}
