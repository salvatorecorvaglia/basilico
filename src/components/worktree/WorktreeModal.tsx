/* ═══════════════════════════════════════════════════════
   Basilico — Worktree Modal
   Dialog for adding new git worktrees
   ═══════════════════════════════════════════════════════ */

import { FolderTree, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import "./WorktreeModal.css";

interface WorktreeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WorktreeModal({ isOpen, onClose }: WorktreeModalProps) {
  const { addWorktree, branches } = useRepoStore();
  const { addNotification } = useUIStore();

  const [path, setPath] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [existingBranch, setExistingBranch] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setPath("");
      setNewBranch("");
      setExistingBranch("");
    }
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const handleSubmit = async () => {
    if (!path.trim()) return;
    setIsSubmitting(true);
    try {
      await addWorktree(path.trim(), existingBranch || null, newBranch || null);
      addNotification({
        type: "success",
        message: `Worktree added at "${path}"`,
      });
      onClose();
    } catch (err) {
      addNotification({
        type: "error",
        message: `Failed to add worktree: ${err}`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const localBranches = branches.filter((b) => !b.isRemote);

  if (!isOpen) return null;

  return (
    <div className="worktree-overlay" onClick={onClose}>
      <div className="worktree-modal" onClick={(e) => e.stopPropagation()}>
        <div className="worktree-header">
          <h3>
            <FolderTree size={16} />
            Add Worktree
          </h3>
          <button className="settings-close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="worktree-body">
          <div className="worktree-field">
            <label>Worktree Path</label>
            <input
              className="worktree-input"
              type="text"
              placeholder="/path/to/worktree"
              value={path}
              onChange={(e) => setPath(e.target.value)}
            />
          </div>

          <div className="worktree-field">
            <label>Checkout Existing Branch (optional)</label>
            <select
              className="worktree-input"
              value={existingBranch}
              onChange={(e) => {
                setExistingBranch(e.target.value);
                if (e.target.value) setNewBranch("");
              }}
            >
              <option value="">— none —</option>
              {localBranches.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div className="worktree-field">
            <label>Or Create New Branch</label>
            <input
              className="worktree-input"
              type="text"
              placeholder="feature/my-branch"
              value={newBranch}
              onChange={(e) => {
                setNewBranch(e.target.value);
                if (e.target.value) setExistingBranch("");
              }}
              disabled={!!existingBranch}
            />
          </div>
        </div>

        <div className="worktree-footer">
          <button
            className="settings-btn settings-btn-outline"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="settings-btn"
            onClick={handleSubmit}
            disabled={!path.trim() || isSubmitting}
          >
            <Plus size={14} />
            {isSubmitting ? "Adding..." : "Add Worktree"}
          </button>
        </div>
      </div>
    </div>
  );
}
