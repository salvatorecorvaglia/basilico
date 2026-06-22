/* ═══════════════════════════════════════════════════════
   Basilico — Settings Modal
   Theme preset trigger, Git default author, SSH key generator, keyboard shortcuts
   ═══════════════════════════════════════════════════════ */

import * as Dialog from "@radix-ui/react-dialog";
import {
  Check,
  Copy,
  GitBranch,
  Key,
  Keyboard,
  Palette,
  Plus,
  Shield,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { UserSettings } from "../../lib/git-types";
import * as commands from "../../lib/tauri-commands";
import { applyThemeToDOM } from "../../lib/theme-presets";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import "./SettingsModal.css";

type SettingsTab = "appearance" | "git" | "ssh" | "shortcuts";

const THEME_PRESETS = [
  { id: "sage-green", name: "Sage Green", color: "#2ea043" },
  { id: "royal-blue", name: "Royal Blue", color: "#1f6feb" },
  { id: "amethyst-purple", name: "Amethyst Purple", color: "#8b5cf6" },
  { id: "amber-gold", name: "Amber Gold", color: "#d29922" },
  { id: "crimson-red", name: "Crimson Red", color: "#f85149" },
  { id: "ocean-teal", name: "Ocean Teal", color: "#2dd4bf" },
];

const SHORTCUT_LABELS: Record<string, string> = {
  commandPalette: "Command Palette",
  openSettings: "Open Settings",
  search: "Search",
  staging: "Toggle Staging",
  commit: "Commit",
  refresh: "Refresh",
};

function formatShortcutKeys(shortcut: string): string[] {
  return shortcut
    .split("+")
    .map((k) =>
      k === "CmdOrCtrl" ? "⌘" : k === "Shift" ? "⇧" : k === "Enter" ? "↵" : k,
    );
}

export function SettingsModal() {
  const { settingsOpen, toggleSettings, addNotification } = useUIStore();
  const { settings, loadSettings, saveSettings } = useRepoStore();

  const [activeTab, setActiveTab] = useState<SettingsTab>("appearance");
  const [draft, setDraft] = useState<UserSettings | null>(null);
  const [sshKeys, setSshKeys] = useState<string[]>([]);
  const [sshComment, setSshComment] = useState("");
  const [generatedPubKey, setGeneratedPubKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Load settings on open
  useEffect(() => {
    if (settingsOpen) {
      loadSettings();
      commands
        .listSshKeys()
        .then(setSshKeys)
        .catch(() => setSshKeys([]));
    }
  }, [settingsOpen, loadSettings]);

  // Sync draft to loaded settings
  useEffect(() => {
    if (settings) {
      setDraft({ ...settings });
    }
  }, [settings]);

  const handleSave = useCallback(async () => {
    if (!draft) return;
    try {
      await saveSettings(draft);
      // Apply accent color to CSS root dynamically
      applyThemeToDOM(draft.theme);
      addNotification({ type: "success", message: "Settings saved" });
      toggleSettings();
    } catch {
      addNotification({ type: "error", message: "Failed to save settings" });
    }
  }, [draft, saveSettings, addNotification, toggleSettings]);

  const handleGenerateSshKey = async () => {
    if (!sshComment.trim()) return;
    setIsGenerating(true);
    try {
      const pubKey = await commands.generateSshKey(sshComment.trim());
      setGeneratedPubKey(pubKey);
      // Refresh key list
      const keys = await commands.listSshKeys();
      setSshKeys(keys);
      addNotification({
        type: "success",
        message: "SSH key generated successfully",
      });
    } catch (err) {
      addNotification({
        type: "error",
        message: `SSH key generation failed: ${err}`,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyPubKey = () => {
    if (generatedPubKey) {
      navigator.clipboard.writeText(generatedPubKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog.Root open={settingsOpen} onOpenChange={toggleSettings}>
      <Dialog.Portal>
        <Dialog.Overlay className="settings-overlay" />
        <Dialog.Content className="settings-modal">
          {draft && (
            <>
              {/* Header */}
              <div className="settings-header">
                <Dialog.Title asChild>
                  <h2>
                    <Palette size={18} />
                    Settings
                  </h2>
                </Dialog.Title>
                <Dialog.Close asChild>
                  <button
                    className="settings-close-btn"
                    aria-label="Close settings"
                  >
                    <X size={16} />
                  </button>
                </Dialog.Close>
              </div>

              {/* Navigation */}
              <div className="settings-nav">
                <button
                  type="button"
                  className={`settings-nav-btn ${activeTab === "appearance" ? "active" : ""}`}
                  onClick={() => setActiveTab("appearance")}
                >
                  <Palette size={13} /> Appearance
                </button>
                <button
                  type="button"
                  className={`settings-nav-btn ${activeTab === "git" ? "active" : ""}`}
                  onClick={() => setActiveTab("git")}
                >
                  <GitBranch size={13} /> Git
                </button>
                <button
                  type="button"
                  className={`settings-nav-btn ${activeTab === "ssh" ? "active" : ""}`}
                  onClick={() => setActiveTab("ssh")}
                >
                  <Key size={13} /> SSH Keys
                </button>
                <button
                  type="button"
                  className={`settings-nav-btn ${activeTab === "shortcuts" ? "active" : ""}`}
                  onClick={() => setActiveTab("shortcuts")}
                >
                  <Keyboard size={13} /> Shortcuts
                </button>
              </div>

              {/* Body */}
              <div className="settings-body">
                {activeTab === "appearance" && (
                  <div className="settings-section">
                    <div className="settings-section-title">Accent Theme</div>
                    <div className="theme-presets">
                      {THEME_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          className={`theme-preset-btn ${draft.theme === preset.id ? "active" : ""}`}
                          onClick={() =>
                            setDraft({ ...draft, theme: preset.id })
                          }
                        >
                          <span
                            className="theme-swatch"
                            style={{ background: preset.color }}
                          />
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === "git" && (
                  <div className="settings-section">
                    <div className="settings-section-title">
                      Git Author Defaults
                    </div>
                    <div className="settings-field">
                      <label htmlFor="settings-git-name">Author Name</label>
                      <input
                        id="settings-git-name"
                        className="settings-input"
                        type="text"
                        placeholder="e.g. Mario Rossi"
                        value={draft.gitAuthorName || ""}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            gitAuthorName: e.target.value || null,
                          })
                        }
                      />
                    </div>
                    <div className="settings-field">
                      <label htmlFor="settings-git-email">Author Email</label>
                      <input
                        id="settings-git-email"
                        className="settings-input"
                        type="email"
                        placeholder="e.g. mario.rossi@basilico.com"
                        value={draft.gitAuthorEmail || ""}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            gitAuthorEmail: e.target.value || null,
                          })
                        }
                      />
                    </div>
                  </div>
                )}

                {activeTab === "ssh" && (
                  <>
                    <div className="settings-section">
                      <div className="settings-section-title">
                        Detected SSH Keys
                      </div>
                      {sshKeys.length > 0 ? (
                        <div className="ssh-key-list">
                          {sshKeys.map((key) => (
                            <div key={key} className="ssh-key-item">
                              <Shield size={14} />
                              <span>~/.ssh/{key}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="settings-empty">
                          No SSH keys found in ~/.ssh
                        </div>
                      )}
                    </div>

                    <div className="settings-section">
                      <div className="settings-section-title">
                        Generate New SSH Key (Ed25519)
                      </div>
                      <div className="ssh-generate-section">
                        <div className="settings-field">
                          <label htmlFor="settings-ssh-comment">
                            Comment / Email
                          </label>
                          <input
                            id="settings-ssh-comment"
                            className="settings-input"
                            type="text"
                            placeholder="e.g. me@github.com"
                            value={sshComment}
                            onChange={(e) => setSshComment(e.target.value)}
                          />
                        </div>
                        <button
                          type="button"
                          className="settings-btn"
                          onClick={handleGenerateSshKey}
                          disabled={!sshComment.trim() || isGenerating}
                        >
                          <Plus size={14} />
                          {isGenerating ? "Generating..." : "Generate"}
                        </button>
                      </div>

                      {generatedPubKey && (
                        <>
                          <div className="ssh-pubkey-output">
                            {generatedPubKey}
                          </div>
                          <button
                            type="button"
                            className={`ssh-copy-btn ${copied ? "copied" : ""}`}
                            onClick={handleCopyPubKey}
                          >
                            {copied ? <Check size={12} /> : <Copy size={12} />}
                            {copied ? "Copied!" : "Copy Public Key"}
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}

                {activeTab === "shortcuts" && (
                  <div className="settings-section">
                    <div className="settings-section-title">
                      Keyboard Shortcuts
                    </div>
                    <div className="shortcut-list">
                      {Object.entries(draft.keyboardShortcuts).map(
                        ([action, shortcut]) => (
                          <div key={action} className="shortcut-row">
                            <span className="shortcut-label">
                              {SHORTCUT_LABELS[action] || action}
                            </span>
                            <div className="shortcut-keys">
                              {formatShortcutKeys(shortcut).map((key, i) => (
                                <span key={i} className="shortcut-key">
                                  {key}
                                </span>
                              ))}
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="settings-footer">
                <button
                  type="button"
                  className="settings-btn settings-btn-outline"
                  onClick={toggleSettings}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="settings-btn"
                  onClick={handleSave}
                >
                  Save Settings
                </button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
