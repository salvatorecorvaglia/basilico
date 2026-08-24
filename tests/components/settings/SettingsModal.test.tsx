import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invokeMock(cmd, args),
}));

import { SettingsModal } from "../../../src/components/settings/SettingsModal";
import type { UserSettings } from "../../../src/lib/git-types";
import { useRepoStore } from "../../../src/store/repo-store";
import { useUIStore } from "../../../src/store/ui-store";

const SETTINGS: UserSettings = {
  theme: "sage",
  sshKeyPath: null,
  gitAuthorName: null,
  gitAuthorEmail: null,
  keyboardShortcuts: {},
};

describe("SettingsModal", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "get_settings") return Promise.resolve(SETTINGS);
      if (cmd === "list_ssh_keys") return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    useRepoStore.setState({ settings: null });
    useUIStore.setState({ settingsOpen: true });
  });

  it("resets the SSH tab, comment, and generated key when reopened", async () => {
    const user = userEvent.setup();
    render(<SettingsModal />);

    await waitFor(() => {
      expect(screen.getByText("Appearance")).toBeInTheDocument();
    });

    await user.click(screen.getByText("SSH Keys"));
    const commentInput = screen.getByPlaceholderText("e.g. me@github.com");
    await user.type(commentInput, "me@example.com");

    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "get_settings") return Promise.resolve(SETTINGS);
      if (cmd === "list_ssh_keys") return Promise.resolve([]);
      if (cmd === "generate_ssh_key")
        return Promise.resolve("ssh-ed25519 AAAA...");
      return Promise.resolve(undefined);
    });
    await user.click(screen.getByText("Generate"));
    await waitFor(() => {
      expect(screen.getByText("ssh-ed25519 AAAA...")).toBeInTheDocument();
    });

    // Close without saving, then reopen — the modal stays mounted the whole
    // time (Radix Dialog just stops rendering its content), which is exactly
    // the scenario where stale local state used to survive.
    act(() => {
      useUIStore.setState({ settingsOpen: false });
    });
    act(() => {
      useUIStore.setState({ settingsOpen: true });
    });

    await waitFor(() => {
      expect(screen.getByText("Appearance").className).toContain("active");
    });
    expect(screen.queryByText("ssh-ed25519 AAAA...")).not.toBeInTheDocument();

    await user.click(screen.getByText("SSH Keys"));
    expect(screen.getByPlaceholderText("e.g. me@github.com")).toHaveValue("");
  });

  it("does not save twice on a fast double-click, and disables Save while saving", async () => {
    const user = userEvent.setup();
    render(<SettingsModal />);

    await waitFor(() => {
      expect(screen.getByText("Save Settings")).toBeInTheDocument();
    });

    let releaseSave: () => void = () => {};
    const pendingSave = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "save_settings") return pendingSave;
      return Promise.resolve(undefined);
    });

    const saveButton = screen.getByText("Save Settings");
    await user.click(saveButton);
    await user.click(saveButton);

    expect(
      invokeMock.mock.calls.filter((c) => c[0] === "save_settings"),
    ).toHaveLength(1);
    expect(screen.getByText("Saving…")).toBeDisabled();

    releaseSave();
    await waitFor(() => {
      expect(useUIStore.getState().settingsOpen).toBe(false);
    });
  });
});
