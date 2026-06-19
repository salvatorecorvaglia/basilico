/* ═══════════════════════════════════════════════════════
   Basilico — WelcomeScreen
   Shown when no repository is open
   ═══════════════════════════════════════════════════════ */

import { FolderOpen, ArrowRight } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useRepoStore } from '../store/repo-store';
import './WelcomeScreen.css';

export function WelcomeScreen() {
  const { openRepository, isLoading } = useRepoStore();

  const handleOpenRepo = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Open Git Repository',
    });

    if (selected) {
      await openRepository(selected as string);
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
            className="welcome-btn welcome-btn-primary"
            onClick={handleOpenRepo}
            disabled={isLoading}
          >
            <FolderOpen size={20} />
            <div className="welcome-btn-text">
              <span className="welcome-btn-label">Open Repository</span>
              <span className="welcome-btn-hint">Browse to a local Git repository</span>
            </div>
            <ArrowRight size={16} className="welcome-btn-arrow" />
          </button>

          <button
            className="welcome-btn-dev"
            onClick={() => openRepository('/Users/salvatorecorvaglia/github/basilico')}
            disabled={isLoading}
          >
            <span className="welcome-btn-dev-text">🌿 Open Basilico Repository (Dev)</span>
          </button>
        </div>

        {/* Keyboard shortcut hint */}
        <div className="welcome-hint">
          <kbd>⌘</kbd> + <kbd>O</kbd> to open a repository
        </div>
      </div>

      {/* Background decoration */}
      <div className="welcome-bg-decoration" />
    </div>
  );
}
