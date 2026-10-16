import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { ResetModal } from "../../../src/components/graph/ResetModal";
import { useRepoStore } from "../../../src/store/repo-store";
import { useUIStore } from "../../../src/store/ui-store";

const OID = "b".repeat(40);

describe("ResetModal", () => {
  beforeEach(() => {
    useRepoStore.setState({
      resetToCommit: vi.fn().mockResolvedValue(undefined),
    });
    useUIStore.setState({
      resetModalOpen: true,
      resetCommitOid: OID,
      notifications: [],
    });
  });

  it("stays closed without a target commit", () => {
    useUIStore.setState({ resetCommitOid: null });
    render(<ResetModal />);
    expect(screen.queryByText("Reset Current Branch")).not.toBeInTheDocument();
  });

  it("defaults to a mixed reset and closes once done", async () => {
    const user = userEvent.setup();
    render(<ResetModal />);

    await user.click(
      screen.getByRole("button", { name: /Reset Current Branch \(MIXED\)/ }),
    );
    expect(useRepoStore.getState().resetToCommit).toHaveBeenCalledWith(
      OID,
      "mixed",
    );
    await waitFor(() =>
      expect(useUIStore.getState().resetModalOpen).toBe(false),
    );
  });

  it("performs a soft reset when chosen", async () => {
    const user = userEvent.setup();
    render(<ResetModal />);

    await user.click(screen.getByRole("radio", { name: /Soft/ }));
    await user.click(
      screen.getByRole("button", { name: /Reset Current Branch \(SOFT\)/ }),
    );
    expect(useRepoStore.getState().resetToCommit).toHaveBeenCalledWith(
      OID,
      "soft",
    );
  });

  it("requires an explicit acknowledgement before a hard reset", async () => {
    const user = userEvent.setup();
    render(<ResetModal />);

    await user.click(screen.getByRole("radio", { name: /Hard/ }));
    const submit = screen.getByRole("button", {
      name: /Reset Current Branch \(HARD\)/,
    });
    expect(submit).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: /irreversible/ }));
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(useRepoStore.getState().resetToCommit).toHaveBeenCalledWith(
      OID,
      "hard",
    );
  });

  it("forgets the hard-reset acknowledgement when cancelled", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ResetModal />);

    await user.click(screen.getByRole("radio", { name: /Hard/ }));
    await user.click(screen.getByRole("checkbox", { name: /irreversible/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(useUIStore.getState().resetModalOpen).toBe(false);

    useUIStore.getState().openResetModal(OID);
    rerender(<ResetModal />);
    expect(
      await screen.findByRole("checkbox", { name: /irreversible/ }),
    ).not.toBeChecked();
  });

  it("stays open and reports the error when the reset fails", async () => {
    const user = userEvent.setup();
    useRepoStore.setState({
      resetToCommit: vi.fn().mockRejectedValue(new Error("locked index")),
    });
    render(<ResetModal />);

    await user.click(
      screen.getByRole("button", { name: /Reset Current Branch/ }),
    );
    await waitFor(() =>
      expect(
        useUIStore.getState().notifications.some((n) => n.type === "error"),
      ).toBe(true),
    );
    expect(useUIStore.getState().resetModalOpen).toBe(true);
  });
});
