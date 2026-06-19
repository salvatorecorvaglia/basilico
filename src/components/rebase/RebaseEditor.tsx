/* ═══════════════════════════════════════════════════════
   Basilico — RebaseEditor Component
   Visual interactive rebase tool with drag-and-drop
   ═══════════════════════════════════════════════════════ */

import { useState } from 'react';
import { 
  Play, 
  Trash2, 
  AlertTriangle, 
  ArrowUp, 
  ArrowDown, 
  Menu, 
  XCircle, 
  HelpCircle,
  Info
} from 'lucide-react';
import { useRepoStore } from '../../store/repo-store';
import { useUIStore } from '../../store/ui-store';
import './RebaseEditor.css';
import { RebaseTodoItem } from '../../lib/git-types';

export function RebaseEditor() {
  const { 
    rebaseTodoItems, 
    rebaseStatus, 
    writeRebaseTodo, 
    stepRebase 
  } = useRepoStore();

  const { addNotification } = useUIStore();
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // If no rebase active
  if (!rebaseStatus || rebaseStatus.status === 'none') {
    return (
      <div className="rebase-empty animate-fade-in">
        <HelpCircle size={48} strokeWidth={1} className="text-secondary" />
        <h3>No active rebase session</h3>
        <p>You can start an interactive rebase from the Command Palette (Ctrl+Shift+P) or by right-clicking a commit in the graph.</p>
      </div>
    );
  }

  const handleActionChange = (index: number, action: RebaseTodoItem['action']) => {
    const updated = [...rebaseTodoItems];
    updated[index] = { ...updated[index], action };
    writeRebaseTodo(updated);
  };

  // Reordering functions
  const moveUp = (index: number) => {
    if (index === 0) return;
    const updated = [...rebaseTodoItems];
    const temp = updated[index];
    updated[index] = updated[index - 1];
    updated[index - 1] = temp;
    writeRebaseTodo(updated);
  };

  const moveDown = (index: number) => {
    if (index === rebaseTodoItems.length - 1) return;
    const updated = [...rebaseTodoItems];
    const temp = updated[index];
    updated[index] = updated[index + 1];
    updated[index + 1] = temp;
    writeRebaseTodo(updated);
  };

  // Drag and Drop
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (index: number) => {
    if (draggedIndex === null || draggedIndex === index) return;
    const updated = [...rebaseTodoItems];
    const [removed] = updated.splice(draggedIndex, 1);
    updated.splice(index, 0, removed);
    setDraggedIndex(null);
    writeRebaseTodo(updated);
  };

  // Step controls
  const handleStep = async (action: 'continue' | 'skip' | 'abort') => {
    try {
      const res = await stepRebase(action);
      if (res.status === 'finished') {
        addNotification({ type: 'success', message: 'Interactive rebase completed!' });
      } else if (res.status === 'conflict') {
        addNotification({ 
          type: 'warning', 
          message: 'Conflicts detected! Resolve them in the staging area and click Continue.' 
        });
      }
    } catch (err) {
      addNotification({ type: 'error', message: `Rebase step failed: ${err}` });
    }
  };

  return (
    <div className="rebase-editor animate-fade-in">
      <div className="rebase-header">
        <div className="rebase-header-left">
          <h2>Interactive Rebase</h2>
          <span className="badge-rebase-state">
            {rebaseStatus.status}
          </span>
        </div>

        <div className="rebase-controls">
          {rebaseStatus.status === 'conflict' && (
            <div className="rebase-conflict-warning">
              <AlertTriangle size={14} />
              <span>Resolve conflicts in Staging before continuing</span>
            </div>
          )}
          {rebaseStatus.status === 'edit' && (
            <div className="rebase-info-banner">
              <Info size={14} />
              <span>Edit files, stage, then click Continue</span>
            </div>
          )}
          {rebaseStatus.status === 'reword' && (
            <div className="rebase-info-banner">
              <Info size={14} />
              <span>Click Continue to reword commit</span>
            </div>
          )}
          <button 
            className="rebase-btn btn-continue" 
            onClick={() => handleStep('continue')}
            title="Apply next commit or continue after conflict resolution"
          >
            <Play size={12} />
            <span>Continue</span>
          </button>
          <button 
            className="rebase-btn btn-skip" 
            onClick={() => handleStep('skip')}
            title="Skip current commit and continue"
          >
            <XCircle size={12} />
            <span>Skip</span>
          </button>
          <button 
            className="rebase-btn btn-abort" 
            onClick={() => handleStep('abort')}
            title="Abort rebase and return to original HEAD"
          >
            <Trash2 size={12} />
            <span>Abort</span>
          </button>
        </div>
      </div>

      <div className="rebase-todo-list custom-scrollbar">
        <div className="rebase-list-header">
          <span className="col-drag"></span>
          <span className="col-action">Action</span>
          <span className="col-oid">Commit</span>
          <span className="col-summary">Message</span>
          <span className="col-reorder">Reorder</span>
        </div>

        <div className="rebase-list-body">
          {rebaseTodoItems.map((item, index) => {
            const isCurrent = rebaseStatus.currentOid === item.oid;
            return (
              <div 
                key={item.oid}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(index)}
                className={`rebase-row ${isCurrent ? 'current' : ''} ${draggedIndex === index ? 'dragging' : ''}`}
              >
                <div className="col-drag drag-handle" title="Drag to reorder">
                  <Menu size={14} />
                </div>

                <div className="col-action">
                  <select 
                    value={item.action} 
                    onChange={(e) => handleActionChange(index, e.target.value as RebaseTodoItem['action'])}
                  >
                    <option value="pick">pick (use commit)</option>
                    <option value="reword">reword (edit message)</option>
                    <option value="edit">edit (stop to edit files)</option>
                    <option value="squash">squash (meld into previous)</option>
                    <option value="fixup">fixup (squash discard log)</option>
                    <option value="drop">drop (discard commit)</option>
                  </select>
                </div>

                <div className="col-oid text-mono text-secondary">
                  {item.oid.slice(0, 7)}
                </div>

                <div className="col-summary truncate">
                  {isCurrent && <span className="current-marker">Applying ▸</span>}
                  <span className={item.action === 'drop' ? 'text-strike text-tertiary' : 'text-primary'}>
                    {item.summary}
                  </span>
                </div>

                <div className="col-reorder">
                  <button 
                    disabled={index === 0} 
                    onClick={() => moveUp(index)} 
                    title="Move Up"
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button 
                    disabled={index === rebaseTodoItems.length - 1} 
                    onClick={() => moveDown(index)} 
                    title="Move Down"
                  >
                    <ArrowDown size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
