import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invokeMock(cmd, args),
}));

import { SubmoduleModal } from "../../../src/components/modals/SubmoduleModal";
import type { SubmoduleInfo } from "../../../src/lib/git-types";
import { useRepoStore } from "../../../src/store/repo-store";
import { useUIStore } from "../../../src/store/ui-store";

const SUBMODULES: SubmoduleInfo[] = [
  {
    name: "lib-a",
    path: "vendor/a",
    url: "https://example.com/a.git",
    headOid: "a1",
    status: "up-to-date",
  },
  {
    name: "lib-b",
    path: "vendor/b",
    url: null,
    headOid: null,
    status: "uninitialized",
  },
];

const argsOf = (cmd: string) =>
  invokeMock.mock.calls.filter((c) => c[0] === cmd).pop()?.[1];

describe("SubmoduleModal", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string) =>
      cmd === "list_submodules"
        ? Promise.resolve(SUBMODULES)
        : Promise.resolve(undefined),
    );
    useRepoStore.setState({
      activeTabId: "/repo",
      submodules: [],
      refreshAll: vi.fn().mockResolvedValue(undefined),
    });
    useUIStore.setState({ notifications: [] });
  });

  it("lists submodules with their status", async () => {
    render(<SubmoduleModal open onOpenChange={() => {}} />);

    expect(await screen.findByText("lib-a")).toBeInTheDocument();
    expect(screen.getByText("Up-to-date")).toBeInTheDocument();
    expect(screen.getByText("uninitialized")).toBeInTheDocument();
    expect(screen.getByText("https://example.com/a.git")).toBeInTheDocument();
  });

  it("shows the empty state when there are none", async () => {
    invokeMock.mockResolvedValue([]);
    render(<SubmoduleModal open onOpenChange={() => {}} />);
    expect(await screen.findByText("No Submodules Found")).toBeInTheDocument();
  });

  it("updates all submodules recursively", async () => {
    const user = userEvent.setup();
    render(<SubmoduleModal open onOpenChange={() => {}} />);

    await user.click(await screen.findByRole("button", { name: "Update All" }));
    await waitFor(() =>
      expect(argsOf("update_submodules")).toEqual({
        repoPath: "/repo",
        paths: [],
        recursive: true,
      }),
    );
    expect(useRepoStore.getState().refreshAll).toHaveBeenCalled();
  });

  it("syncs submodule URLs", async () => {
    const user = userEvent.setup();
    render(<SubmoduleModal open onOpenChange={() => {}} />);

    await user.click(await screen.findByRole("button", { name: "Sync URLs" }));
    await waitFor(() =>
      expect(argsOf("sync_submodules")).toEqual({
        repoPath: "/repo",
        paths: [],
      }),
    );
  });

  it("adds a submodule from the trimmed URL and path", async () => {
    const user = userEvent.setup();
    render(<SubmoduleModal open onOpenChange={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Add Submodule" }));
    await user.type(
      screen.getByPlaceholderText("https://github.com/org/repo.git"),
      " https://example.com/c.git ",
    );
    await user.type(
      screen.getByPlaceholderText("vendor/my-submodule"),
      " vendor/c ",
    );
    await user.click(screen.getByRole("button", { name: "Confirm Add" }));

    await waitFor(() =>
      expect(argsOf("add_submodule")).toEqual({
        repoPath: "/repo",
        url: "https://example.com/c.git",
        path: "vendor/c",
      }),
    );
  });

  it("reports a failed update", async () => {
    const user = userEvent.setup();
    invokeMock.mockImplementation((cmd: string) =>
      cmd === "update_submodules"
        ? Promise.reject(new Error("network down"))
        : Promise.resolve(SUBMODULES),
    );
    render(<SubmoduleModal open onOpenChange={() => {}} />);

    await user.click(await screen.findByRole("button", { name: "Update All" }));
    await waitFor(() =>
      expect(
        useUIStore.getState().notifications.some((n) => n.type === "error"),
      ).toBe(true),
    );
  });
});
