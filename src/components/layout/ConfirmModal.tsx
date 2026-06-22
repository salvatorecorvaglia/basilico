import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Info, X } from "lucide-react";
import { useCallback } from "react";
import { useUIStore } from "../../store/ui-store";
import "./ConfirmModal.css";

export function ConfirmModal() {
  const { confirmOptions, closeConfirm } = useUIStore();

  const handleCancel = useCallback(() => {
    if (confirmOptions?.onCancel) {
      confirmOptions.onCancel();
    }
    closeConfirm();
  }, [confirmOptions, closeConfirm]);

  const handleConfirm = useCallback(() => {
    if (confirmOptions) {
      confirmOptions.onConfirm();
      closeConfirm();
    }
  }, [confirmOptions, closeConfirm]);

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
                    className="confirm-close-btn"
                    aria-label="Close dialog"
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
                >
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
