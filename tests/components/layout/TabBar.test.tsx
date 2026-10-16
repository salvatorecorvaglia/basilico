import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const openDialog = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openDialog(...args),
}));

import { TabBar } from "../../../src/components/layout/TabBar";
import { useRepoStore } from "../../../src/store/repo-store";
import { useUIStore } from "../../../src/store/ui-store";

const TABS = [
  { id: "/a", path: "/a", name: "alpha", isActive: true },
  { id: "/b", path: "/b", name: "beta", isActive: false },
];

describe("TabBar", () => {
  beforeEach(() => {
    openDialog.mockReset();
    useRepoStore.setState({
      tabs: TABS,
      activeTabId: "/a",
      switchTab: vi.fn(),
      closeTab: vi.fn(),
      openRepository: vi.fn().mockResolvedValue(undefined),
    });
    useUIStore.setState({ notifications: [] });
  });

  it("marks only the active tab as selected", () => {
    render(<TabBar />);
    expect(screen.getByRole("tab", { name: "alpha" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "beta" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("switches and closes the tab that was clicked", async () => {
    const user = userEvent.setup();
    render(<TabBar />);

    await user.click(screen.getByRole("tab", { name: "beta" }));
    expect(useRepoStore.getState().switchTab).toHaveBeenCalledWith("/b");

    await user.click(screen.getByLabelText("Close tab for beta"));
    expect(useRepoStore.getState().closeTab).toHaveBeenCalledWith("/b");
    // Closing must not also switch to the tab being closed.
    expect(useRepoStore.getState().switchTab).toHaveBeenCalledTimes(1);
  });

  it("opens the folder picked in the dialog", async () => {
    const user = userEvent.setup();
    openDialog.mockResolvedValue("/picked");
    render(<TabBar />);

    await user.click(screen.getByTitle("Open Repository"));
    await waitFor(() =>
      expect(useRepoStore.getState().openRepository).toHaveBeenCalledWith(
        "/picked",
      ),
    );
  });

  it("does nothing when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    openDialog.mockResolvedValue(null);
    render(<TabBar />);

    await user.click(screen.getByTitle("Open Repository"));
    await waitFor(() => expect(openDialog).toHaveBeenCalled());
    expect(useRepoStore.getState().openRepository).not.toHaveBeenCalled();
  });

  it("reports a failed open instead of leaving an unhandled rejection", async () => {
    const user = userEvent.setup();
    openDialog.mockResolvedValue("/broken");
    useRepoStore.setState({
      openRepository: vi.fn().mockRejectedValue(new Error("not a repo")),
    });
    render(<TabBar />);

    await user.click(screen.getByTitle("Open Repository"));
    await waitFor(() =>
      expect(
        useUIStore.getState().notifications.some((n) => n.type === "error"),
      ).toBe(true),
    );
  });
});
