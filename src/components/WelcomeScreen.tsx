/* ═══════════════════════════════════════════════════════
   Basilico — WelcomeScreen
   Shown when no repository is open
   ═══════════════════════════════════════════════════════ */

import * as Dialog from "@radix-ui/react-dialog";
import { open } from "@tauri-apps/plugin-dialog";
import { ArrowRight, Download, FolderOpen, FolderPlus, X } from "lucide-react";
import { useState } from "react";
import { useRepoStore } from "../store/repo-store";
import "./WelcomeScreen.css";

export function WelcomeScreen() {
  const { openRepository, cloneRepository, initializeRepository, isLoading } =
    useRepoStore();

  const [cloneOpen, setCloneOpen] = useState(false);
  const [initOpen, setInitOpen] = useState(false);

  const [cloneUrl, setCloneUrl] = useState("");
  const [clonePath, setClonePath] = useState("");
  const [initPath, setInitPath] = useState("");

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

  return (
    <div className="welcome">
      <div className="welcome-content animate-fade-in">
        {/* Logo */}
        <div className="welcome-logo">
          <div className="welcome-logo-icon">🌿</div>
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
              <span className="welcome-btn-label">Clone Remote Repository</span>
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
          <kbd>⌘</kbd> + <kbd>O</kbd> to open a repository
        </div>
      </div>

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
                    autoFocus
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
