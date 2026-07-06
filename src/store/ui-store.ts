/* ═══════════════════════════════════════════════════════
   Basilico — UI Store
   Panel state, modals, and view management
   ═══════════════════════════════════════════════════════ */

import { create } from "zustand";
import type { ActiveView } from "../lib/git-types";

interface Notification {
  id: string;
  type: "success" | "error" | "info" | "warning";
  message: string;
  timeout?: number;
}

export interface PromptField {
  name: string;
  label: string;
  placeholder?: string;
  type?: "text" | "textarea" | "checkbox";
  defaultValue?: string;
  required?: boolean;
}

export interface PromptOptions {
  title: string;
  description?: string;
  fields: PromptField[];
  submitLabel?: string;
  onSubmit: (values: Record<string, string>) => void | Promise<void>;
  onCancel?: () => void;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDanger?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

interface UIState {
  // Panels
  sidebarVisible: boolean;
  sidebarWidth: number;
  detailPanelVisible: boolean;
  detailPanelHeight: number;

  // Active view
  activeView: ActiveView;

  // Command palette
  commandPaletteOpen: boolean;

  // Settings modal
  settingsOpen: boolean;

  // Reset modal (Phase 6)
  resetModalOpen: boolean;
  resetCommitOid: string | null;

  // File Viewer (Phase 7)
  fileViewerOpen: boolean;
  fileViewerPath: string | null;
  fileViewerOid: string | null;

  // Custom modals
  promptOptions: PromptOptions | null;
  confirmOptions: ConfirmOptions | null;

  // Notifications
  notifications: Notification[];

  // Actions
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  toggleDetailPanel: () => void;
  setDetailPanelHeight: (height: number) => void;
  setActiveView: (view: ActiveView) => void;
  toggleCommandPalette: () => void;
  toggleSettings: () => void;
  openResetModal: (oid: string) => void;
  closeResetModal: () => void;
  openFileViewer: (filePath: string, oid: string) => void;
  closeFileViewer: () => void;
  openPrompt: (options: PromptOptions) => void;
  closePrompt: () => void;
  openConfirm: (options: ConfirmOptions) => void;
  closeConfirm: () => void;
  addNotification: (notification: Omit<Notification, "id">) => void;
  removeNotification: (id: string) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  sidebarVisible: true,
  sidebarWidth: 240,
  detailPanelVisible: true,
  detailPanelHeight: 300,
  activeView: "graph",
  commandPaletteOpen: false,
  settingsOpen: false,
  resetModalOpen: false,
  resetCommitOid: null,
  fileViewerOpen: false,
  fileViewerPath: null,
  fileViewerOid: null,
  promptOptions: null,
  confirmOptions: null,
  notifications: [],

  toggleSidebar: () =>
    set((state) => ({ sidebarVisible: !state.sidebarVisible })),

  setSidebarWidth: (width: number) => set({ sidebarWidth: width }),

  toggleDetailPanel: () =>
    set((state) => ({ detailPanelVisible: !state.detailPanelVisible })),

  setDetailPanelHeight: (height: number) => set({ detailPanelHeight: height }),

  setActiveView: (view: ActiveView) => set({ activeView: view }),

  toggleCommandPalette: () =>
    set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),

  toggleSettings: () => set((state) => ({ settingsOpen: !state.settingsOpen })),

  openResetModal: (oid: string) =>
    set({ resetModalOpen: true, resetCommitOid: oid }),

  closeResetModal: () => set({ resetModalOpen: false, resetCommitOid: null }),

  openFileViewer: (filePath: string, oid: string) =>
    set({ fileViewerOpen: true, fileViewerPath: filePath, fileViewerOid: oid }),

  closeFileViewer: () =>
    set({ fileViewerOpen: false, fileViewerPath: null, fileViewerOid: null }),

  openPrompt: (options) => set({ promptOptions: options }),

  closePrompt: () => set({ promptOptions: null }),

  openConfirm: (options) => set({ confirmOptions: options }),

  closeConfirm: () => set({ confirmOptions: null }),

  addNotification: (notification) => {
    const id = crypto.randomUUID();

    // De-duplication and merging logic for errors to prevent duplicate toasts
    if (notification.type === "error") {
      const existing = get().notifications.find(
        (n) => n.type === "error" && n.message === notification.message,
      );

      if (existing) {
        return;
      }
    }

    const timeout =
      notification.timeout ??
      (notification.type === "success"
        ? 3000
        : notification.type === "warning"
          ? 6000
          : notification.type === "error"
            ? 10000
            : 4000);
    const newNotification = { ...notification, id, timeout };

    // Cap notification count to prevent unbounded accumulation
    const MAX_NOTIFICATIONS = 5;
    const current = get().notifications;
    let updated = [...current, newNotification];
    if (updated.length > MAX_NOTIFICATIONS) {
      const oldest = updated[0];
      // Clean up the timeout for the removed notification
      const oldTimeoutId = activeTimeouts.get(oldest.id);
      if (oldTimeoutId) {
        clearTimeout(oldTimeoutId);
        activeTimeouts.delete(oldest.id);
      }
      updated = updated.slice(updated.length - MAX_NOTIFICATIONS);
    }

    set({ notifications: updated });

    // Auto-remove after timeout
    const timeoutId = setTimeout(() => {
      get().removeNotification(id);
    }, timeout);
    activeTimeouts.set(id, timeoutId);
  },

  removeNotification: (id: string) => {
    const timeoutId = activeTimeouts.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      activeTimeouts.delete(id);
    }
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },
}));

// Module-level map to track active timeout handles per notification ID to prevent leaks
const activeTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
