/* ═══════════════════════════════════════════════════════
   Basilico — Toolbar Component
   Top action bar with branch selector and actions
   ═══════════════════════════════════════════════════════ */

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  Command,
  GitBranch,
  RefreshCw,
  Search,
  Settings,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [branchSearch, setBranchSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    if (!branchDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setBranchDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [branchDropdownOpen]);

  // Close dropdown on Escape key
  useEffect(() => {
    if (!branchDropdownOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setBranchDropdownOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [branchDropdownOpen]);

  const handleCheckout = async (name: string) => {
    try {
      await checkoutBranch(name);
      addNotification({
        type: "success",
        message: `Checked out branch "${name}"`,
      });
      setBranchDropdownOpen(false);
      setBranchSearch("");
    } catch (err) {
      addNotification({
        type: "error",
        message: `Failed to checkout branch: ${err}`,
      });
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

  return (
    <div className="toolbar">
      <div className="toolbar-section toolbar-left">
        {/* Branch selector */}
        <div className="toolbar-branch-wrapper" ref={dropdownRef}>
          <button
            className={`toolbar-btn toolbar-branch ${branchDropdownOpen ? "active" : ""}`}
            onClick={() => {
              setBranchDropdownOpen(!branchDropdownOpen);
              setBranchSearch("");
            }}
            title="Switch branch"
          >
            <GitBranch size={14} />
            <span className="truncate">{status?.branch || "No branch"}</span>
            <ChevronDown size={12} className="toolbar-branch-chevron" />
          </button>

          {branchDropdownOpen && (
            <div className="toolbar-branch-dropdown animate-slide-down">
              <div className="branch-dropdown-search-wrapper">
                <Search size={12} className="branch-dropdown-search-icon" />
                <input
                  type="text"
                  className="branch-dropdown-search"
                  placeholder="Search branches..."
                  value={branchSearch}
                  onChange={(e) => setBranchSearch(e.target.value)}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div className="branch-dropdown-list custom-scrollbar">
                {localBranches.length === 0 && remoteBranches.length === 0 ? (
                  <div className="branch-dropdown-empty">No branches found</div>
                ) : (
                  <>
                    {localBranches.length > 0 && (
                      <div className="branch-dropdown-section-header">
                        Local Branches
                      </div>
                    )}
                    {localBranches.map((branch) => (
                      <button
                        key={branch.name}
                        className={`branch-dropdown-item ${branch.isHead ? "active" : ""}`}
                        onClick={() => handleCheckout(branch.name)}
                      >
                        <span className="branch-dropdown-item-name truncate">
                          {branch.name}
                        </span>
                        {branch.isHead && (
                          <Check size={12} className="branch-active-check" />
                        )}
                      </button>
                    ))}

                    {remoteBranches.length > 0 && (
                      <div className="branch-dropdown-section-header">
                        Remote Branches
                      </div>
                    )}
                    {remoteBranches.map((branch) => (
                      <button
                        key={branch.name}
                        className="branch-dropdown-item remote"
                        onClick={() => handleCheckout(branch.name)}
                      >
                        <span className="branch-dropdown-item-name truncate">
                          {branch.name}
                        </span>
                        {branch.isHead && (
                          <Check size={12} className="branch-active-check" />
                        )}
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

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
            className={`toolbar-icon-btn ${isFetching ? "spinning" : ""}`}
            onClick={handleFetch}
            title="Fetch from remote (origin)"
            aria-label="Fetch from remote (origin)"
            disabled={isAnySyncing}
          >
            <RefreshCw size={13} />
          </button>
          <button
            className={`toolbar-icon-btn ${isPulling ? "spinning" : ""}`}
            onClick={handlePull}
            title="Pull from remote (origin)"
            aria-label="Pull from remote (origin)"
            disabled={!status?.branch || isAnySyncing}
          >
            <ArrowDownToLine size={13} />
          </button>
          <button
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
            className={`toolbar-segment-btn ${activeView === "graph" ? "active" : ""}`}
            onClick={() => setActiveView("graph")}
          >
            History
          </button>
          <button
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
        </div>
      </div>

      <div className="toolbar-section toolbar-right">
        <button
          className={`toolbar-btn toolbar-icon-btn ${isRefreshing ? "spinning" : ""}`}
          onClick={refreshAll}
          title="Refresh repository"
          aria-label="Refresh repository"
        >
          <RefreshCw size={14} />
        </button>
        <button
          className="toolbar-btn toolbar-icon-btn"
          onClick={() => setActiveView("search")}
          title="Search (Ctrl+F)"
          aria-label="Search repository"
        >
          <Search size={14} />
        </button>
        <button
          className="toolbar-btn toolbar-icon-btn"
          onClick={toggleCommandPalette}
          title="Command Palette (Ctrl+Shift+P)"
          aria-label="Open Command Palette"
        >
          <Command size={14} />
        </button>
        <button
          className="toolbar-btn toolbar-icon-btn"
          onClick={toggleSettings}
          title="Settings (⌘,)"
          aria-label="Open Settings"
        >
          <Settings size={14} />
        </button>
      </div>
    </div>
  );
}
