import type { StateCreator } from 'zustand';
import type { RepoState } from '../types';
import type { UserSettings } from '../../lib/git-types';
import * as commands from '../../lib/tauri-commands';
import { applyThemeToDOM } from '../../lib/theme-presets';

export interface SettingsSlice {
  settings: UserSettings | null;
  loadSettings: () => Promise<void>;
  saveSettings: (settings: UserSettings) => Promise<void>;
  generateSshKey: (comment: string) => Promise<string>;
}

export const createSettingsSlice: StateCreator<RepoState, [], [], SettingsSlice> = (set) => ({
  settings: null,

  loadSettings: async () => {
    try {
      const settings = await commands.getSettings({ silent: true });
      set({ settings });
      localStorage.setItem('basilico-theme', settings.theme);
      applyThemeToDOM(settings.theme);
    } catch (err) {
      console.error('Failed to load settings:', err);
      set({ error: String(err) });
      throw err;
    }
  },

  saveSettings: async (settings) => {
    try {
      await commands.saveSettings(settings, { errorPrefix: 'Failed to save settings' });
      set({ settings });
      localStorage.setItem('basilico-theme', settings.theme);
      applyThemeToDOM(settings.theme);
    } catch (err) {
      console.error('Failed to save settings:', err);
      set({ error: String(err) });
      throw err;
    }
  },

  generateSshKey: async (comment) => {
    try {
      const pubKey = await commands.generateSshKey(comment, { errorPrefix: 'Failed to generate SSH key' });
      return pubKey;
    } catch (err) {
      console.error('Failed to generate SSH key:', err);
      set({ error: String(err) });
      throw err;
    }
  },
});
