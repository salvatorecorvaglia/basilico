/* ═══════════════════════════════════════════════════════
   Basilico — UI Store
   Panel state, modals, and view management
   ═══════════════════════════════════════════════════════ */

import { create } from 'zustand';
import type { ActiveView } from '../lib/git-types';

interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  timeout?: number;
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

  // Notifications
  notifications: Notification[];

  // Actions
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  toggleDetailPanel: () => void;
  setDetailPanelHeight: (height: number) => void;
  setActiveView: (view: ActiveView) => void;
  toggleCommandPalette: () => void;
  addNotification: (notification: Omit<Notification, 'id'>) => void;
  removeNotification: (id: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarVisible: true,
  sidebarWidth: 240,
  detailPanelVisible: true,
  detailPanelHeight: 300,
  activeView: 'graph',
  commandPaletteOpen: false,
  notifications: [],

  toggleSidebar: () =>
    set((state) => ({ sidebarVisible: !state.sidebarVisible })),

  setSidebarWidth: (width: number) =>
    set({ sidebarWidth: width }),

  toggleDetailPanel: () =>
    set((state) => ({ detailPanelVisible: !state.detailPanelVisible })),

  setDetailPanelHeight: (height: number) =>
    set({ detailPanelHeight: height }),

  setActiveView: (view: ActiveView) =>
    set({ activeView: view }),

  toggleCommandPalette: () =>
    set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),

  addNotification: (notification) => {
    const id = Math.random().toString(36).slice(2);
    const newNotification = { ...notification, id };

    set((state) => ({
      notifications: [...state.notifications, newNotification],
    }));

    // Auto-remove after timeout
    const timeout = notification.timeout ?? 4000;
    setTimeout(() => {
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
      }));
    }, timeout);
  },

  removeNotification: (id: string) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),
}));
