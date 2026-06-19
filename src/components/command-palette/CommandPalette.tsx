/* ═══════════════════════════════════════════════════════
   Basilico — CommandPalette Component
   Floating command bar overlay (Cmd/Ctrl+Shift+P)
   ═══════════════════════════════════════════════════════ */

import { useState, useEffect, useRef } from 'react';
import { Terminal, Command, ArrowRight } from 'lucide-react';
import { useRepoStore } from '../../store/repo-store';
import { useUIStore } from '../../store/ui-store';
import './CommandPalette.css';

interface PaletteItem {
  id: string;
  name: string;
  category: string;
  shortcut?: string;
  action: () => void | Promise<void>;
}

export function CommandPalette() {
  const { commandPaletteOpen, toggleCommandPalette, setActiveView, addNotification } = useUIStore();
  const { 
    refreshAll, 
    fetch, 
    pull, 
    push, 
    createBranch, 
    initRebase,
    resetBisect,
    startBisect,
    status
  } = useRepoStore();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Define commands
  const commandsList: PaletteItem[] = [
    {
      id: 'history',
      name: 'Switch View to Commit History (Graph)',
      category: 'Navigation',
      shortcut: 'G H',
      action: () => setActiveView('graph'),
    },
    {
      id: 'staging',
      name: 'Switch View to Staging Area',
      category: 'Navigation',
      shortcut: 'G S',
      action: () => setActiveView('staging'),
    },
    {
      id: 'reflog',
      name: 'Switch View to HEAD Reflog',
      category: 'Navigation',
      shortcut: 'G R',
      action: () => setActiveView('reflog'),
    },
    {
      id: 'search',
      name: 'Switch View to Repository Search',
      category: 'Navigation',
      shortcut: 'G F',
      action: () => setActiveView('search'),
    },
    {
      id: 'refresh',
      name: 'Refresh Repository Data',
      category: 'Repository',
      shortcut: 'Ctrl+R',
      action: async () => {
        await refreshAll();
        addNotification({ type: 'success', message: 'Repository refreshed successfully' });
      },
    },
    {
      id: 'fetch',
      name: 'Fetch from remote (origin)',
      category: 'Remote Sync',
      shortcut: 'Ctrl+Shift+F',
      action: async () => {
        try {
          await fetch('origin');
          addNotification({ type: 'success', message: 'Fetch completed successfully' });
        } catch (err) {
          addNotification({ type: 'error', message: `Fetch failed: ${err}` });
        }
      },
    },
    {
      id: 'pull',
      name: 'Pull from remote (origin)',
      category: 'Remote Sync',
      shortcut: 'Ctrl+Shift+L',
      action: async () => {
        if (!status?.branch) return;
        try {
          const res = await pull('origin', status.branch);
          if (res === 'conflicts') {
            addNotification({ type: 'warning', message: 'Pull resulted in conflicts!' });
          } else {
            addNotification({ type: 'success', message: 'Pull completed successfully' });
          }
        } catch (err) {
          addNotification({ type: 'error', message: `Pull failed: ${err}` });
        }
      },
    },
    {
      id: 'push',
      name: 'Push to remote (origin)',
      category: 'Remote Sync',
      shortcut: 'Ctrl+Shift+P',
      action: async () => {
        if (!status?.branch) return;
        try {
          await push('origin', status.branch, false);
          addNotification({ type: 'success', message: 'Push completed successfully' });
        } catch (err) {
          addNotification({ type: 'error', message: `Push failed: ${err}` });
        }
      },
    },
    {
      id: 'branch-create',
      name: 'Create new branch...',
      category: 'Branch Management',
      action: async () => {
        const name = prompt('Enter new branch name:');
        if (name && name.trim()) {
          try {
            await createBranch(name.trim());
            addNotification({ type: 'success', message: `Created branch "${name}"` });
          } catch (err) {
            addNotification({ type: 'error', message: `Failed to create branch: ${err}` });
          }
        }
      },
    },
    {
      id: 'rebase-interactive',
      name: 'Start visual Interactive Rebase...',
      category: 'Interactive Rebase',
      action: async () => {
        const upstream = prompt('Enter upstream branch or commit to rebase onto (e.g. main, origin/main):');
        if (upstream && upstream.trim()) {
          try {
            await initRebase(upstream.trim());
            setActiveView('rebase');
            addNotification({ type: 'info', message: 'Rebase initialized' });
          } catch (err) {
            addNotification({ type: 'error', message: `Failed to initialize rebase: ${err}` });
          }
        }
      },
    },
    {
      id: 'bisect-start',
      name: 'Start Git Bisect session...',
      category: 'Git Bisect',
      action: async () => {
        const bad = prompt('Enter known BAD commit OID or revision (defaults to HEAD):', 'HEAD');
        if (bad === null) return;
        const good = prompt('Enter known GOOD commit OID or revision:');
        if (good && good.trim()) {
          try {
            await startBisect(bad.trim() || 'HEAD', good.trim());
            setActiveView('bisect');
            addNotification({ type: 'info', message: 'Bisect started' });
          } catch (err) {
            addNotification({ type: 'error', message: `Failed to start bisect: ${err}` });
          }
        }
      },
    },
    {
      id: 'bisect-reset',
      name: 'Reset / Abort active Bisect session',
      category: 'Git Bisect',
      action: async () => {
        try {
          await resetBisect();
          addNotification({ type: 'success', message: 'Bisect reset successfully' });
        } catch (err) {
          addNotification({ type: 'error', message: `Failed to reset bisect: ${err}` });
        }
      },
    },
  ];

  // Filter commands by query
  const filteredCommands = commandsList.filter((cmd) =>
    cmd.name.toLowerCase().includes(query.toLowerCase()) ||
    cmd.category.toLowerCase().includes(query.toLowerCase())
  );

  // Adjust selected index on filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Handle global key events for toggling command palette (Cmd/Ctrl+Shift+P)
  useEffect(() => {
    const handleKeyDownGlobal = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        toggleCommandPalette();
      } else if (e.key === '?') {
        // Only trigger cheat sheet if not inside form inputs
        const target = e.target as HTMLElement;
        if (target && target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          toggleCommandPalette();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDownGlobal);
    return () => window.removeEventListener('keydown', handleKeyDownGlobal);
  }, [toggleCommandPalette]);

  // Auto-focus input when opened
  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [commandPaletteOpen]);

  // Handle keyboard navigation inside the open palette
  const handleKeyDownPalette = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      toggleCommandPalette();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => 
        prev < filteredCommands.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => 
        prev > 0 ? prev - 1 : filteredCommands.length - 1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selectedCmd = filteredCommands[selectedIndex];
      if (selectedCmd) {
        selectedCmd.action();
        toggleCommandPalette();
      }
    }
  };

  // Scroll selected item into view automatically
  useEffect(() => {
    const listEl = listRef.current;
    if (listEl) {
      const activeEl = listEl.querySelector('.palette-row.active');
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!commandPaletteOpen) return null;

  return (
    <div className="palette-overlay animate-fade-in" onClick={toggleCommandPalette}>
      <div 
        className="palette-box" 
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDownPalette}
      >
        <div className="palette-search">
          <Command size={18} className="palette-search-icon" />
          <input 
            ref={inputRef}
            type="text" 
            placeholder="Type a command or action to run..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="palette-esc-badge">ESC</span>
        </div>

        <div ref={listRef} className="palette-results custom-scrollbar">
          {filteredCommands.length === 0 ? (
            <div className="palette-empty">No commands match your query</div>
          ) : (
            filteredCommands.map((cmd, index) => (
              <div 
                key={cmd.id} 
                className={`palette-row ${index === selectedIndex ? 'active' : ''}`}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => { cmd.action(); toggleCommandPalette(); }}
              >
                <div className="palette-row-left">
                  <Terminal size={14} className="palette-row-icon" />
                  <div className="palette-row-text">
                    <span className="palette-row-name">{cmd.name}</span>
                    <span className="palette-row-cat">{cmd.category}</span>
                  </div>
                </div>
                {cmd.shortcut ? (
                  <span className="palette-row-shortcut text-mono">{cmd.shortcut}</span>
                ) : (
                  <ArrowRight size={12} className="palette-row-arrow" />
                )}
              </div>
            ))
          )}
        </div>

        <div className="palette-footer">
          <span>Use <b>↑↓</b> to navigate, <b>Enter</b> to select, <b>ESC</b> to close</span>
        </div>
      </div>
    </div>
  );
}
