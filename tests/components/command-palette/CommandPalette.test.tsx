import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invokeMock(cmd, args),
}));

import { CommandPalette } from "../../../src/components/command-palette/CommandPalette";
import { useRepoStore } from "../../../src/store/repo-store";
import { useUIStore } from "../../../src/store/ui-store";

describe("CommandPalette", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
    useUIStore.setState({ commandPaletteOpen: true, activeView: "graph" });
    useRepoStore.setState({ status: null });
  });

  it("resets the selected row to the top when the filter narrows the results", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);

    const input = screen.getByPlaceholderText(
      "Type a command or action to run...",
    );
    // Matches all 4 "Switch View to ..." Navigation commands.
    await user.type(input, "view");
    expect(screen.getAllByRole("option")).toHaveLength(4);

    await user.type(input, "{ArrowDown}{ArrowDown}");
    expect(screen.getAllByRole("option")[2]).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // Narrow to a single result — if the index weren't reset, it would still
    // point at position 2, which no longer exists.
    await user.clear(input);
    await user.type(input, "staging area");

    const remaining = screen.getAllByRole("option");
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toHaveAttribute("aria-selected", "true");
  });

  it("runs the currently highlighted command on Enter, not the first match", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);

    const input = screen.getByPlaceholderText(
      "Type a command or action to run...",
    );
    // Order: history, staging, reflog, search.
    await user.type(input, "view");
    await user.type(input, "{ArrowDown}{ArrowDown}");
    expect(screen.getAllByRole("option")[2]).toHaveTextContent(
      "Switch View to Reflog Inspector",
    );

    await user.type(input, "{Enter}");

    expect(useUIStore.getState().activeView).toBe("reflog");
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
  });
});
