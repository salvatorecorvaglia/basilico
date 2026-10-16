import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invokeMock(cmd, args),
}));

type ProgressCallback = (event: { payload: unknown }) => void;
let progressCallback: ProgressCallback | null = null;
vi.mock("@tauri-apps/api/event", () => ({
  listen: (name: string, cb: ProgressCallback) => {
    if (name === "git:progress") progressCallback = cb;
    return Promise.resolve(() => {});
  },
}));

import {
  formatBytes,
  NetworkProgress,
} from "../../../src/components/layout/NetworkProgress";
import { useRepoStore } from "../../../src/store/repo-store";

function emit(payload: Record<string, unknown>) {
  act(() => {
    progressCallback?.({
      payload: {
        key: "/repos/app",
        operation: "fetch",
        phase: "receiving",
        current: 0,
        total: 0,
        bytes: 0,
        done: false,
        ...payload,
      },
    });
  });
}

describe("NetworkProgress", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(true);
    progressCallback = null;
    useRepoStore.setState({
      tabs: [
        { id: "/repos/app", path: "/repos/app", name: "app", isActive: true },
      ],
    });
  });

  it("shows nothing while no network operation runs", async () => {
    const { container } = render(<NetworkProgress />);
    await waitFor(() => expect(progressCallback).not.toBeNull());
    expect(container).toBeEmptyDOMElement();
  });

  it("shows progress, cancels on request, and disappears when done", async () => {
    const user = userEvent.setup();
    render(<NetworkProgress />);
    await waitFor(() => expect(progressCallback).not.toBeNull());

    emit({ current: 45, total: 100, bytes: 2 * 1024 * 1024 });
    expect(screen.getByText("Fetching app")).toBeInTheDocument();
    expect(
      screen.getByText("Receiving objects 45% · 2.0 MB"),
    ).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "45",
    );

    await user.click(
      screen.getByRole("button", { name: /Cancel fetch of app/ }),
    );
    expect(invokeMock).toHaveBeenCalledWith("cancel_network_operation", {
      key: "/repos/app",
    });
    expect(screen.getByText("Cancelling…")).toBeInTheDocument();

    emit({ done: true });
    expect(screen.queryByText("Fetching app")).not.toBeInTheDocument();
  });

  it("names a clone by its destination folder", async () => {
    render(<NetworkProgress />);
    await waitFor(() => expect(progressCallback).not.toBeNull());
    emit({ key: "/home/me/code/new-project", operation: "clone" });
    expect(screen.getByText("Cloning new-project")).toBeInTheDocument();
  });

  it("formats transfer sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
