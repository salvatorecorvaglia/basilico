import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { BisectWizard } from "../../../src/components/bisect/BisectWizard";
import type { BisectState } from "../../../src/lib/git-types";
import { useRepoStore } from "../../../src/store/repo-store";
import { useUIStore } from "../../../src/store/ui-store";

const active = (over: Partial<BisectState> = {}): BisectState => ({
  isBisecting: true,
  message: "Bisecting: 3 revisions left to test after this (roughly 2 steps)",
  currentOid: "c".repeat(40),
  stepsRemaining: 2,
  ...over,
});

describe("BisectWizard", () => {
  beforeEach(() => {
    useRepoStore.setState({
      bisectState: null,
      commits: [],
      startBisect: vi.fn().mockResolvedValue(undefined),
      markBisect: vi.fn().mockResolvedValue(undefined),
      resetBisect: vi.fn().mockResolvedValue(undefined),
    });
    useUIStore.setState({ confirmOptions: null, notifications: [] });
  });

  it("requires a good commit before starting", async () => {
    const user = userEvent.setup();
    render(<BisectWizard />);

    // An empty field is already blocked by `required`; whitespace passes the
    // browser's check and must be caught by the wizard itself.
    await user.type(screen.getByLabelText(/Known GOOD Commit/), "   ");
    await user.click(screen.getByRole("button", { name: /Start/ }));

    expect(useRepoStore.getState().startBisect).not.toHaveBeenCalled();
    expect(
      useUIStore
        .getState()
        .notifications.some((n) =>
          n.message.includes("Good commit is required"),
        ),
    ).toBe(true);
  });

  it("starts with the bad and good revisions entered", async () => {
    const user = userEvent.setup();
    render(<BisectWizard />);

    const bad = screen.getByLabelText(/Known BAD Commit/);
    await user.clear(bad);
    await user.type(bad, "main");
    await user.type(screen.getByLabelText(/Known GOOD Commit/), "v1.0.0");
    await user.click(screen.getByRole("button", { name: /Start/ }));

    await waitFor(() => {
      expect(useRepoStore.getState().startBisect).toHaveBeenCalledWith(
        "main",
        "v1.0.0",
      );
    });
  });

  it("marks the current commit good, bad or skipped", async () => {
    const user = userEvent.setup();
    useRepoStore.setState({ bisectState: active() });
    render(<BisectWizard />);

    expect(screen.getByText("Testing")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Mark BAD/ }));
    await user.click(screen.getByRole("button", { name: /Mark GOOD/ }));
    await user.click(screen.getByRole("button", { name: /Skip Commit/ }));

    const mark = useRepoStore.getState().markBisect as ReturnType<typeof vi.fn>;
    expect(mark.mock.calls.map((c) => c[0])).toEqual(["bad", "good", "skip"]);
  });

  it("asks before aborting an unfinished session", async () => {
    const user = userEvent.setup();
    useRepoStore.setState({ bisectState: active() });
    render(<BisectWizard />);

    await user.click(screen.getByRole("button", { name: /Abort Bisect/ }));
    expect(useRepoStore.getState().resetBisect).not.toHaveBeenCalled();

    const confirm = useUIStore.getState().confirmOptions;
    expect(confirm?.isDanger).toBe(true);
    await confirm?.onConfirm();
    expect(useRepoStore.getState().resetBisect).toHaveBeenCalled();
  });

  it("reports the first bad commit and exits without asking", async () => {
    const user = userEvent.setup();
    useRepoStore.setState({
      bisectState: active({
        message: `${"c".repeat(40)} is the first bad commit`,
        stepsRemaining: null,
      }),
    });
    render(<BisectWizard />);

    expect(screen.getByText("First Bad Commit Found!")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Exit Bisect/ }));
    expect(useRepoStore.getState().resetBisect).toHaveBeenCalled();
    expect(useUIStore.getState().confirmOptions).toBeNull();
  });
});
