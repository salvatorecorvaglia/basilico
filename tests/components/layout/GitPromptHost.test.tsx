import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invokeMock(cmd, args),
}));

type PromptCallback = (event: { payload: unknown }) => void;
let promptCallback: PromptCallback | null = null;
vi.mock("@tauri-apps/api/event", () => ({
  listen: (name: string, cb: PromptCallback) => {
    if (name === "git:prompt") promptCallback = cb;
    return Promise.resolve(() => {});
  },
}));

import { GitPromptHost } from "../../../src/components/layout/GitPromptHost";
import { useUIStore } from "../../../src/store/ui-store";

function emit(payload: Record<string, unknown>) {
  act(() => {
    promptCallback?.({ payload });
  });
}

describe("GitPromptHost", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(true);
    promptCallback = null;
    useUIStore.setState({ promptOptions: null, confirmOptions: null });
  });

  it("asks for HTTPS credentials and sends them back to the waiting operation", async () => {
    render(<GitPromptHost />);
    await waitFor(() => expect(promptCallback).not.toBeNull());

    emit({
      kind: "credentials",
      id: "p1",
      url: "https://git.example.com/team/repo.git",
      username: "me",
      retry: false,
    });

    const prompt = useUIStore.getState().promptOptions;
    expect(prompt?.title).toBe("Sign in to remote");
    expect(
      prompt?.fields.find((f) => f.name === "username")?.defaultValue,
    ).toBe("me");
    expect(prompt?.fields.find((f) => f.name === "password")?.type).toBe(
      "password",
    );

    await prompt?.onSubmit({ username: "me", password: "s3cret" });
    expect(invokeMock).toHaveBeenCalledWith("answer_git_prompt", {
      id: "p1",
      answer: { username: "me", password: "s3cret" },
    });
  });

  it("declines when the credentials prompt is cancelled", async () => {
    render(<GitPromptHost />);
    await waitFor(() => expect(promptCallback).not.toBeNull());
    emit({
      kind: "credentials",
      id: "p2",
      url: "https://x",
      username: null,
      retry: true,
    });

    const prompt = useUIStore.getState().promptOptions;
    expect(prompt?.description).toMatch(/rejected/);
    prompt?.onCancel?.();
    expect(invokeMock).toHaveBeenCalledWith("answer_git_prompt", {
      id: "p2",
      answer: null,
    });
  });

  it("shows an unknown host's fingerprint and records the decision", async () => {
    render(<GitPromptHost />);
    await waitFor(() => expect(promptCallback).not.toBeNull());
    emit({
      kind: "hostKey",
      id: "h1",
      host: "git.example.com",
      keyType: "ssh-ed25519",
      fingerprint: "SHA256:abc123",
    });

    const confirm = useUIStore.getState().confirmOptions;
    expect(confirm?.message).toContain("git.example.com");
    expect(confirm?.message).toContain("SHA256:abc123");

    await confirm?.onConfirm();
    expect(invokeMock).toHaveBeenCalledWith("answer_git_prompt", {
      id: "h1",
      answer: { accept: true },
    });

    invokeMock.mockClear();
    emit({
      kind: "hostKey",
      id: "h2",
      host: "git.example.com",
      keyType: "ssh-ed25519",
      fingerprint: "SHA256:abc123",
    });
    useUIStore.getState().confirmOptions?.onCancel?.();
    expect(invokeMock).toHaveBeenCalledWith("answer_git_prompt", {
      id: "h2",
      answer: { accept: false },
    });
  });
});
