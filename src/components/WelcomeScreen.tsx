/* ═══════════════════════════════════════════════════════
   Basilico — WelcomeScreen
   Shown when no repository is open
   ═══════════════════════════════════════════════════════ */

import * as Dialog from "@radix-ui/react-dialog";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ArrowRight,
  Code,
  Download,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Search,
  Star,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { openExternalTool } from "../lib/tauri-commands";
import { useRepoStore } from "../store/repo-store";
import "./WelcomeScreen.css";

export function WelcomeScreen() {
  const {
    openRepository,
    cloneRepository,
    initializeRepository,
    isLoading,
    recentRepos,
    pinRecentRepo,
    removeRecentRepo,
  } = useRepoStore();

  const [cloneOpen, setCloneOpen] = useState(false);
  const [initOpen, setInitOpen] = useState(false);

  const [cloneUrl, setCloneUrl] = useState("");
  const [clonePath, setClonePath] = useState("");
  const [initPath, setInitPath] = useState("");

  const [searchQuery, setSearchQuery] = useState("");

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

  const handleBrowseClonePath = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Destination Directory",
    });
    if (selected) {
      setClonePath(selected as string);
    }
  };

  const handleBrowseInitPath = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Directory to Initialize",
    });
    if (selected) {
      setInitPath(selected as string);
    }
  };

  const handleCloneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloneUrl.trim() || !clonePath) return;
    try {
      await cloneRepository(cloneUrl.trim(), clonePath);
      setCloneOpen(false);
      setCloneUrl("");
      setClonePath("");
    } catch (err) {
      console.error(err);
    }
  };

  const handleInitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!initPath) return;
    try {
      await initializeRepository(initPath);
      setInitOpen(false);
      setInitPath("");
    } catch (err) {
      console.error(err);
    }
  };

  const handleLaunchTool = async (path: string, tool: string) => {
    try {
      await openExternalTool(path, tool);
    } catch (err) {
      console.error(`Failed to launch ${tool}:`, err);
    }
  };

  const filteredRecents = recentRepos.filter(
    (repo) =>
      repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      repo.path.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const hasRecent = recentRepos.length > 0;

  return (
    <div className={`welcome ${hasRecent ? "welcome-dashboard-layout" : ""}`}>
      {hasRecent ? (
        <div className="welcome-dashboard animate-scale-in">
          {/* Left Column: Actions */}
          <div className="welcome-dashboard-left">
            <div className="welcome-logo">
              <div className="welcome-logo-icon">
                <img src="/basilico-logo-icon-transparent.svg" alt="Basilico Logo" />
              </div>
              <h1 className="welcome-title">Basilico</h1>
              <p className="welcome-subtitle">Modern Git, at your fingertips</p>
            </div>

            <div className="welcome-actions">
              <button
                type="button"
                className="welcome-btn welcome-btn-primary"
                onClick={handleOpenRepo}
                disabled={isLoading}
              >
                <FolderOpen size={20} />
                <div className="welcome-btn-text">
                  <span className="welcome-btn-label">
                    Open Local Repository
                  </span>
                  <span className="welcome-btn-hint">
                    Browse to an existing Git repository on disk
                  </span>
                </div>
                <ArrowRight size={16} className="welcome-btn-arrow" />
              </button>

              <button
                type="button"
                className="welcome-btn"
                onClick={() => setCloneOpen(true)}
                disabled={isLoading}
              >
                <Download size={20} />
                <div className="welcome-btn-text">
                  <span className="welcome-btn-label">
                    Clone Remote Repository
                  </span>
                  <span className="welcome-btn-hint">
                    Clone from GitHub, GitLab, or custom URL
                  </span>
                </div>
                <ArrowRight size={16} className="welcome-btn-arrow" />
              </button>

              <button
                type="button"
                className="welcome-btn"
                onClick={() => setInitOpen(true)}
                disabled={isLoading}
              >
                <FolderPlus size={20} />
                <div className="welcome-btn-text">
                  <span className="welcome-btn-label">
                    Initialize New Repository
                  </span>
                  <span className="welcome-btn-hint">
                    Create a brand new empty Git repository
                  </span>
                </div>
                <ArrowRight size={16} className="welcome-btn-arrow" />
              </button>
            </div>

            <div className="welcome-hint">
              <kbd>
                {typeof window !== "undefined" &&
                navigator.userAgent.includes("Mac")
                  ? "⌘"
                  : "Ctrl"}
              </kbd>{" "}
              + <kbd>O</kbd> to open a repository
            </div>
          </div>

          {/* Right Column: Recent Repositories */}
          <div className="welcome-dashboard-right">
            <div className="welcome-recent-header">
              <h3 className="welcome-recent-title">Recent Repositories</h3>
              <div className="welcome-recent-search">
                <Search size={14} className="welcome-recent-search-icon" />
                <input
                  type="text"
                  placeholder="Filter recent repositories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="welcome-recent-list scrollable-area">
              {filteredRecents.length === 0 ? (
                <div className="welcome-recent-empty">
                  {searchQuery
                    ? "No matching repositories found"
                    : "No recent repositories"}
                </div>
              ) : (
                filteredRecents.map((repo) => (
                  <div
                    key={repo.path}
                    className="welcome-recent-card"
                    onClick={() => openRepository(repo.path)}
                  >
                    <div className="welcome-recent-card-left truncate">
                      <FolderOpen
                        size={16}
                        className="welcome-recent-card-icon"
                      />
                      <div className="welcome-recent-card-info truncate">
                        <div className="welcome-recent-card-name truncate">
                          {repo.name}
                        </div>
                        <div
                          className="welcome-recent-card-path truncate"
                          title={repo.path}
                        >
                          {repo.path}
                        </div>
                        {(repo.headBranch || repo.state) && (
                          <div className="welcome-recent-card-meta">
                            {repo.headBranch && (
                              <span className="welcome-recent-card-branch">
                                <GitBranch
                                  size={10}
                                  style={{ marginRight: "3px" }}
                                />
                                {repo.headBranch}
                              </span>
                            )}
                            {repo.state && repo.state !== "Clean" && (
                              <span className="welcome-recent-card-state text-warning">
                                {repo.state}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div
                      className="welcome-recent-card-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="welcome-card-btn"
                        onClick={() => handleLaunchTool(repo.path, "vscode")}
                        title="Open in VS Code"
                      >
                        <Code size={13} />
                      </button>
                      <button
                        className="welcome-card-btn"
                        onClick={() => handleLaunchTool(repo.path, "terminal")}
                        title="Open in Terminal"
                      >
                        <Terminal size={13} />
                      </button>
                      <button
                        className={`welcome-card-btn welcome-btn-pin ${repo.isPinned ? "pinned" : ""}`}
                        onClick={() => pinRecentRepo(repo.path, !repo.isPinned)}
                        title={
                          repo.isPinned ? "Unpin repository" : "Pin repository"
                        }
                      >
                        <Star
                          size={13}
                          fill={repo.isPinned ? "var(--accent-gold)" : "none"}
                        />
                      </button>
                      <button
                        className="welcome-card-btn welcome-btn-remove"
                        onClick={() => removeRecentRepo(repo.path)}
                        title="Remove from recents"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="welcome-content animate-fade-in">
          {/* Logo */}
          <div className="welcome-logo">
            <div className="welcome-logo-icon">
              <img src="/basilico-logo-icon-transparent.svg" alt="Basilico Logo" />
            </div>
            <h1 className="welcome-title">Basilico</h1>
            <p className="welcome-subtitle">Modern Git, at your fingertips</p>
          </div>

          {/* Actions */}
          <div className="welcome-actions">
            <button
              type="button"
              className="welcome-btn welcome-btn-primary"
              onClick={handleOpenRepo}
              disabled={isLoading}
            >
              <FolderOpen size={20} />
              <div className="welcome-btn-text">
                <span className="welcome-btn-label">Open Local Repository</span>
                <span className="welcome-btn-hint">
                  Browse to an existing Git repository on disk
                </span>
              </div>
              <ArrowRight size={16} className="welcome-btn-arrow" />
            </button>

            <button
              type="button"
              className="welcome-btn"
              onClick={() => setCloneOpen(true)}
              disabled={isLoading}
            >
              <Download size={20} />
              <div className="welcome-btn-text">
                <span className="welcome-btn-label">
                  Clone Remote Repository
                </span>
                <span className="welcome-btn-hint">
                  Clone from GitHub, GitLab, or custom URL
                </span>
              </div>
              <ArrowRight size={16} className="welcome-btn-arrow" />
            </button>

            <button
              type="button"
              className="welcome-btn"
              onClick={() => setInitOpen(true)}
              disabled={isLoading}
            >
              <FolderPlus size={20} />
              <div className="welcome-btn-text">
                <span className="welcome-btn-label">
                  Initialize New Repository
                </span>
                <span className="welcome-btn-hint">
                  Create a brand new empty Git repository
                </span>
              </div>
              <ArrowRight size={16} className="welcome-btn-arrow" />
            </button>
          </div>

          {/* Keyboard shortcut hint */}
          <div className="welcome-hint">
            <kbd>
              {typeof window !== "undefined" &&
              navigator.userAgent.includes("Mac")
                ? "⌘"
                : "Ctrl"}
            </kbd>{" "}
            + <kbd>O</kbd> to open a repository
          </div>
        </div>
      )}

      {/* Clone Dialog */}
      <Dialog.Root
        open={cloneOpen}
        onOpenChange={(open) => {
          if (!isLoading) setCloneOpen(open);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="welcome-overlay" />
          <Dialog.Content className="welcome-modal">
            <div className="welcome-modal-header">
              <Dialog.Title asChild>
                <h3>Clone Repository</h3>
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  className="welcome-modal-close"
                  aria-label="Close"
                  disabled={isLoading}
                >
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>
            <form onSubmit={handleCloneSubmit}>
              <div className="welcome-modal-body">
                <div className="welcome-field">
                  <label htmlFor="clone-url">Source URL</label>
                  <input
                    id="clone-url"
                    type="text"
                    placeholder="https://github.com/user/repo.git or git@github.com:user/repo.git"
                    value={cloneUrl}
                    onChange={(e) => setCloneUrl(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>
                <div className="welcome-field">
                  <label htmlFor="clone-path">Destination Path</label>
                  <div className="welcome-field-row">
                    <input
                      id="clone-path"
                      type="text"
                      placeholder="Select target folder..."
                      value={clonePath}
                      readOnly
                      required
                    />
                    <button
                      type="button"
                      className="welcome-field-btn"
                      onClick={handleBrowseClonePath}
                      disabled={isLoading}
                    >
                      Browse...
                    </button>
                  </div>
                </div>
              </div>
              <div className="welcome-modal-footer">
                <button
                  type="button"
                  className="welcome-btn-cancel"
                  onClick={() => setCloneOpen(false)}
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="welcome-btn-submit"
                  disabled={!cloneUrl.trim() || !clonePath || isLoading}
                >
                  {isLoading ? "Cloning..." : "Clone"}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Init Dialog */}
      <Dialog.Root
        open={initOpen}
        onOpenChange={(open) => {
          if (!isLoading) setInitOpen(open);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="welcome-overlay" />
          <Dialog.Content className="welcome-modal">
            <div className="welcome-modal-header">
              <Dialog.Title asChild>
                <h3>Initialize Repository</h3>
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  className="welcome-modal-close"
                  aria-label="Close"
                  disabled={isLoading}
                >
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>
            <form onSubmit={handleInitSubmit}>
              <div className="welcome-modal-body">
                <div className="welcome-field">
                  <label htmlFor="init-path">Directory Path</label>
                  <div className="welcome-field-row">
                    <input
                      id="init-path"
                      type="text"
                      placeholder="Select empty folder..."
                      value={initPath}
                      readOnly
                      required
                    />
                    <button
                      type="button"
                      className="welcome-field-btn"
                      onClick={handleBrowseInitPath}
                      disabled={isLoading}
                    >
                      Browse...
                    </button>
                  </div>
                </div>
              </div>
              <div className="welcome-modal-footer">
                <button
                  type="button"
                  className="welcome-btn-cancel"
                  onClick={() => setInitOpen(false)}
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="welcome-btn-submit"
                  disabled={!initPath || isLoading}
                >
                  {isLoading ? "Initializing..." : "Initialize"}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Background decoration */}
      <div className="welcome-bg-decoration" />
    </div>
  );
}
