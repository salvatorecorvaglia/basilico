/* ═══════════════════════════════════════════════════════
   Basilico — Submodule Modal
   Dialog for adding new git submodules
   ═══════════════════════════════════════════════════════ */

import { Package, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import "./SubmoduleModal.css";

interface SubmoduleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SubmoduleModal({ isOpen, onClose }: SubmoduleModalProps) {
  const { addSubmodule } = useRepoStore();
  const { addNotification } = useUIStore();

  const [url, setUrl] = useState("");
  const [path, setPath] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setUrl("");
      setPath("");
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
    if (!url.trim() || !path.trim()) return;
    setIsSubmitting(true);
    try {
      await addSubmodule(url.trim(), path.trim());
      addNotification({
        type: "success",
        message: `Submodule added at "${path}"`,
      });
      onClose();
    } catch (err) {
      addNotification({
        type: "error",
        message: `Failed to add submodule: ${err}`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="submodule-overlay" onClick={onClose}>
      <div className="submodule-modal" onClick={(e) => e.stopPropagation()}>
        <div className="submodule-header">
          <h3>
            <Package size={16} />
            Add Submodule
          </h3>
          <button className="settings-close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="submodule-body">
          <div className="submodule-field">
            <label>Repository URL</label>
            <input
              className="submodule-input"
              type="text"
              placeholder="https://github.com/user/repo.git"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div className="submodule-field">
            <label>Destination Path</label>
            <input
              className="submodule-input"
              type="text"
              placeholder="libs/my-submodule"
              value={path}
              onChange={(e) => setPath(e.target.value)}
            />
          </div>
        </div>

        <div className="submodule-footer">
          <button
            className="settings-btn settings-btn-outline"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="settings-btn"
            onClick={handleSubmit}
            disabled={!url.trim() || !path.trim() || isSubmitting}
          >
            <Plus size={14} />
            {isSubmitting ? "Adding..." : "Add Submodule"}
          </button>
        </div>
      </div>
    </div>
  );
}
