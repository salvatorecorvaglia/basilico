/* ═══════════════════════════════════════════════════════
   Basilico — StagingArea Component
   Displays Staged, Unstaged, and Untracked files
   ═══════════════════════════════════════════════════════ */

import { useState } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  Trash2, 
  AlertTriangle,
  Clock,
  Calendar
} from 'lucide-react';
import { useRepoStore } from '../../store/repo-store';
import { useUIStore } from '../../store/ui-store';
import { CommitBox } from './CommitBox';
import { getFileName, getDirectory, getStatusColor, getStatusIcon } from '../../lib/utils';
import './StagingArea.css';

export function StagingArea() {
  const { 
    status, 
    selectedFilePath, 
    selectLocalFile, 
    stageFiles, 
    unstageFiles, 
    discardChanges,
    saveStash
  } = useRepoStore();

  const { setActiveView, addNotification } = useUIStore();

  const [stagedOpen, setStagedOpen] = useState(true);
  const [unstagedOpen, setUnstagedOpen] = useState(true);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    filePath: string;
  } | null>(null);

  const handleFileContextMenu = (e: React.MouseEvent, filePath: string) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      filePath,
    });
  };

  const handleSaveStashPrompt = async () => {
    const message = prompt('Enter stash message (optional):');
    if (message === null) return; // User cancelled

    const includeUntracked = confirm('Include untracked files in the stash?');
    
    try {
      await saveStash(message.trim(), includeUntracked);
      addNotification({ type: 'success', message: 'Stash saved successfully' });
    } catch (err) {
      addNotification({ type: 'error', message: `Failed to save stash: ${err}` });
    }
  };

  if (!status) {
    return (
      <div className="staging-area-empty">
        <p>No repository status available</p>
      </div>
    );
  }

  const { staged, unstaged, untracked, conflicted } = status;
  const totalUnstaged = unstaged.length + untracked.length;

  const handleStageAll = () => {
    const allUnstaged = [
      ...unstaged.map(f => f.path),
      ...untracked
    ];
    if (allUnstaged.length > 0) {
      stageFiles(allUnstaged);
    }
  };

  const handleUnstageAll = () => {
    const allStaged = staged.map(f => f.path);
    if (allStaged.length > 0) {
      unstageFiles(allStaged);
    }
  };

  const handleFileClick = (path: string, isStaged: boolean) => {
    selectLocalFile(path, isStaged);
  };

  const handleCheckboxChange = (path: string, currentlyStaged: boolean) => {
    if (currentlyStaged) {
      unstageFiles([path]);
    } else {
      stageFiles([path]);
    }
  };

  return (
    <div className="staging-area" onClick={() => setContextMenu(null)}>
      <div className="staging-lists">
        {/* Conflicted Files */}
        {conflicted.length > 0 && (
          <div className="staging-section conflicted">
            <div className="staging-section-header">
              <span className="staging-section-title">
                <AlertTriangle size={14} className="text-warning" />
                Merge Conflicts
              </span>
              <span className="staging-count badge-warning">{conflicted.length}</span>
            </div>
            <div className="staging-list">
              {conflicted.map((file) => (
                <div 
                  key={file} 
                  className={`staging-file-row ${selectedFilePath === file ? 'selected' : ''}`}
                  onClick={() => handleFileClick(file, false)}
                  onContextMenu={(e) => handleFileContextMenu(e, file)}
                >
                  <span className="staging-file-icon text-warning">⚠</span>
                  <div className="staging-file-paths truncate">
                    <span className="file-name">{getFileName(file)}</span>
                    <span className="file-dir">{getDirectory(file)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Staged Changes */}
        <div className="staging-section">
          <div className="staging-section-header" onClick={() => setStagedOpen(!stagedOpen)}>
            <button className="staging-chevron">
              {stagedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            <span className="staging-section-title">Staged Changes</span>
            <span className="staging-count">{staged.length}</span>
            <button 
              className="staging-action-btn" 
              onClick={(e) => { e.stopPropagation(); handleSaveStashPrompt(); }}
              title="Stash staged and unstaged changes"
              style={{ marginLeft: staged.length > 0 ? '8px' : 'auto' }}
            >
              Stash...
            </button>
            {staged.length > 0 && (
              <button 
                className="staging-action-btn" 
                onClick={(e) => { e.stopPropagation(); handleUnstageAll(); }}
                style={{ marginLeft: '8px' }}
              >
                Unstage All
              </button>
            )}
          </div>

          {stagedOpen && (
            <div className="staging-list">
              {staged.length === 0 ? (
                <div className="staging-empty-text">No staged changes</div>
              ) : (
                staged.map((file) => (
                  <div 
                    key={file.path} 
                    className={`staging-file-row ${selectedFilePath === file.path ? 'selected' : ''}`}
                    onClick={() => handleFileClick(file.path, true)}
                    onContextMenu={(e) => handleFileContextMenu(e, file.path)}
                  >
                    <input 
                      type="checkbox" 
                      checked={true}
                      onChange={() => handleCheckboxChange(file.path, true)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span 
                      className="staging-file-status"
                      style={{ color: getStatusColor(file.status) }}
                    >
                      {getStatusIcon(file.status)}
                    </span>
                    <div className="staging-file-paths truncate">
                      <span className="file-name">{getFileName(file.path)}</span>
                      <span className="file-dir">{getDirectory(file.path)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Unstaged Changes */}
        <div className="staging-section">
          <div className="staging-section-header" onClick={() => setUnstagedOpen(!unstagedOpen)}>
            <button className="staging-chevron">
              {unstagedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            <span className="staging-section-title">Unstaged Changes</span>
            <span className="staging-count">{totalUnstaged}</span>
            {totalUnstaged > 0 && (
              <button 
                className="staging-action-btn" 
                onClick={(e) => { e.stopPropagation(); handleStageAll(); }}
              >
                Stage All
              </button>
            )}
          </div>

          {unstagedOpen && (
            <div className="staging-list">
              {totalUnstaged === 0 ? (
                <div className="staging-empty-text">No unstaged changes</div>
              ) : (
                <>
                  {/* Modified / Deleted files */}
                  {unstaged.map((file) => (
                    <div 
                      key={file.path} 
                      className={`staging-file-row ${selectedFilePath === file.path ? 'selected' : ''}`}
                      onClick={() => handleFileClick(file.path, false)}
                      onContextMenu={(e) => handleFileContextMenu(e, file.path)}
                    >
                      <input 
                        type="checkbox" 
                        checked={false}
                        onChange={() => handleCheckboxChange(file.path, false)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span 
                        className="staging-file-status"
                        style={{ color: getStatusColor(file.status) }}
                      >
                        {getStatusIcon(file.status)}
                      </span>
                      <div className="staging-file-paths truncate">
                        <span className="file-name">{getFileName(file.path)}</span>
                        <span className="file-dir">{getDirectory(file.path)}</span>
                      </div>
                      <button 
                        className="staging-discard-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Are you sure you want to discard all changes in ${getFileName(file.path)}?`)) {
                            discardChanges([file.path]);
                          }
                        }}
                        title="Discard changes"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}

                  {/* Untracked files */}
                  {untracked.map((file) => (
                    <div 
                      key={file} 
                      className={`staging-file-row ${selectedFilePath === file ? 'selected' : ''}`}
                      onClick={() => handleFileClick(file, false)}
                      onContextMenu={(e) => handleFileContextMenu(e, file)}
                    >
                      <input 
                        type="checkbox" 
                        checked={false}
                        onChange={() => handleCheckboxChange(file, false)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span className="staging-file-status text-add">?</span>
                      <div className="staging-file-paths truncate">
                        <span className="file-name">{getFileName(file)}</span>
                        <span className="file-dir">{getDirectory(file)}</span>
                      </div>
                      <button 
                        className="staging-discard-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Are you sure you want to delete ${getFileName(file)}?`)) {
                            discardChanges([file]);
                          }
                        }}
                        title="Delete file"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Commit Box at bottom */}
      <CommitBox />

      {/* File Context Menu */}
      {contextMenu && (
        <div 
          className="sidebar-context-menu animate-fade-in"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button 
            className="context-menu-item" 
            onClick={() => {
              const isStaged = status.staged.some(f => f.path === contextMenu.filePath);
              selectLocalFile(contextMenu.filePath, isStaged);
              setActiveView('blame');
              setContextMenu(null);
            }}
          >
            <Clock size={12} />
            <span>View Blame</span>
          </button>
          <button 
            className="context-menu-item" 
            onClick={() => {
              const isStaged = status.staged.some(f => f.path === contextMenu.filePath);
              selectLocalFile(contextMenu.filePath, isStaged);
              setActiveView('history');
              setContextMenu(null);
            }}
          >
            <Calendar size={12} />
            <span>View File History</span>
          </button>
        </div>
      )}
    </div>
  );
}
