import { useEffect } from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';
import { useUIStore } from '../../store/ui-store';
import './ConfirmModal.css';

export function ConfirmModal() {
  const { confirmOptions, closeConfirm } = useUIStore();

  // Escape key handler
  useEffect(() => {
    if (!confirmOptions) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmOptions]);

  if (!confirmOptions) return null;

  const handleCancel = () => {
    if (confirmOptions.onCancel) {
      confirmOptions.onCancel();
    }
    closeConfirm();
  };

  const handleConfirm = () => {
    confirmOptions.onConfirm();
    closeConfirm();
  };

  const isDanger = confirmOptions.isDanger ?? false;

  return (
    <div className="confirm-overlay animate-fade-in" onClick={handleCancel}>
      <div className="confirm-modal animate-scale-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="confirm-header">
          <div className="confirm-title-group">
            {isDanger ? (
              <AlertTriangle className="confirm-icon-danger" size={18} />
            ) : (
              <Info className="confirm-icon-info" size={18} />
            )}
            <h3>{confirmOptions.title}</h3>
          </div>
          <button className="confirm-close-btn" onClick={handleCancel}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="confirm-body">
          <p className="confirm-message">{confirmOptions.message}</p>
        </div>

        {/* Footer */}
        <div className="confirm-footer">
          <button
            type="button"
            className="confirm-btn confirm-btn-outline"
            onClick={handleCancel}
          >
            {confirmOptions.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            className={`confirm-btn ${isDanger ? 'confirm-btn-danger' : 'confirm-btn-primary'}`}
            onClick={handleConfirm}
          >
            {confirmOptions.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
