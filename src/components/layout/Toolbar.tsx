/* ═══════════════════════════════════════════════════════
   Basilico — Toolbar Component
   Top action bar with branch selector and actions
   ═══════════════════════════════════════════════════════ */

import {
  GitBranch,
  ArrowDownToLine,
  ArrowUpFromLine,
  RefreshCw,
  Search,
  Command,
} from 'lucide-react';
import { useRepoStore } from '../../store/repo-store';
import { useUIStore } from '../../store/ui-store';
import './Toolbar.css';

export function Toolbar() {
  const { status, isRefreshing, refreshAll } = useRepoStore();
  const { toggleCommandPalette } = useUIStore();

  return (
    <div className="toolbar">
      <div className="toolbar-section toolbar-left">
        {/* Branch selector */}
        <button className="toolbar-btn toolbar-branch" title="Current branch">
          <GitBranch size={14} />
          <span className="truncate">{status?.branch || 'No branch'}</span>
        </button>

        {status && (status.ahead > 0 || status.behind > 0) && (
          <div className="toolbar-sync-status">
            {status.ahead > 0 && (
              <span className="toolbar-ahead" title={`${status.ahead} ahead`}>
                ↑{status.ahead}
              </span>
            )}
            {status.behind > 0 && (
              <span className="toolbar-behind" title={`${status.behind} behind`}>
                ↓{status.behind}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="toolbar-section toolbar-center">
        <button className="toolbar-btn" title="Fetch (Ctrl+Shift+F)">
          <RefreshCw size={14} />
          <span>Fetch</span>
        </button>
        <button className="toolbar-btn" title="Pull (Ctrl+Shift+P)">
          <ArrowDownToLine size={14} />
          <span>Pull</span>
        </button>
        <button className="toolbar-btn" title="Push (Ctrl+Shift+U)">
          <ArrowUpFromLine size={14} />
          <span>Push</span>
        </button>
      </div>

      <div className="toolbar-section toolbar-right">
        <button
          className={`toolbar-btn toolbar-icon-btn ${isRefreshing ? 'spinning' : ''}`}
          onClick={refreshAll}
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>
        <button className="toolbar-btn toolbar-icon-btn" title="Search (Ctrl+F)">
          <Search size={14} />
        </button>
        <button
          className="toolbar-btn toolbar-icon-btn"
          onClick={toggleCommandPalette}
          title="Command Palette (Ctrl+Shift+P)"
        >
          <Command size={14} />
        </button>
      </div>
    </div>
  );
}
