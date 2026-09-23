import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Info, X } from "lucide-react";
import { useCallback, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useUIStore } from "../../store/ui-store";
import "./ConfirmModal.css";

export function ConfirmModal() {
  const { confirmOptions, closeConfirm } = useUIStore(
    useShallow((s) => ({
      confirmOptions: s.confirmOptions,
      closeConfirm: s.closeConfirm,
    })),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCancel = useCallback(() => {
    if (isSubmitting) return;
    if (confirmOptions?.onCancel) {
      confirmOptions.onCancel();
    }
    closeConfirm();
  }, [confirmOptions, closeConfirm, isSubmitting]);

  // Stay open and keep the buttons disabled until the action settles — closing
  // immediately (the previous behavior) let a slow or failing confirm action
  // hide behind a dialog that was already gone, with only an easy-to-miss
  // toast to show for it, and let a double-click fire the action twice.
  const handleConfirm = useCallback(async () => {
    if (!confirmOptions || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await confirmOptions.onConfirm();
      closeConfirm();
    } catch {
      // The action's own error handling (or invokeCommand's built-in toast)
      // already surfaced the failure; keep the dialog open so the user can
      // retry or cancel instead of silently losing their place.
    } finally {
      setIsSubmitting(false);
    }
  }, [confirmOptions, closeConfirm, isSubmitting]);

  const isOpen = !!confirmOptions;

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="confirm-overlay" />
        <Dialog.Content className="confirm-modal">
          {confirmOptions && (
            <>
              {/* Header */}
              <div className="confirm-header">
                <div className="confirm-title-group">
                  {confirmOptions.isDanger ? (
                    <AlertTriangle className="confirm-icon-danger" size={18} />
                  ) : (
                    <Info className="confirm-icon-info" size={18} />
                  )}
                  <Dialog.Title asChild>
                    <h3>{confirmOptions.title}</h3>
                  </Dialog.Title>
                </div>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="confirm-close-btn"
                    aria-label="Close dialog"
                    disabled={isSubmitting}
                  >
                    <X size={16} />
                  </button>
                </Dialog.Close>
              </div>

              {/* Body */}
              <div className="confirm-body">
                <Dialog.Description asChild>
                  <p className="confirm-message">{confirmOptions.message}</p>
                </Dialog.Description>
              </div>

              {/* Footer */}
              <div className="confirm-footer">
                <button
                  type="button"
                  className="confirm-btn confirm-btn-outline"
                  onClick={handleCancel}
                  disabled={isSubmitting}
                >
                  {confirmOptions.cancelLabel ?? "Cancel"}
                </button>
                <button
                  type="button"
                  className={`confirm-btn ${
                    confirmOptions.isDanger
                      ? "confirm-btn-danger"
                      : "confirm-btn-primary"
                  }`}
                  onClick={handleConfirm}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <span className="animate-spin mr-2">⏳</span>
                  ) : null}
                  {confirmOptions.confirmLabel ?? "Confirm"}
                </button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
