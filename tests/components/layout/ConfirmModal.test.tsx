import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConfirmModal } from "../../../src/components/layout/ConfirmModal";
import { useUIStore } from "../../../src/store/ui-store";

describe("ConfirmModal", () => {
  beforeEach(() => {
    useUIStore.setState({ confirmOptions: null });
  });

  // The dialog used to close as soon as Confirm was clicked, before the
  // async action resolved — a slow or failing action then had no visible
  // in-flight state, and nothing stopped a double-click from firing it twice.
  it("disables the buttons and keeps the dialog open while the action is pending", async () => {
    const user = userEvent.setup();
    let resolveConfirm: () => void = () => {};
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        }),
    );

    useUIStore.setState({
      confirmOptions: {
        title: "Delete Branch",
        message: "Are you sure?",
        confirmLabel: "Delete",
        onConfirm,
      },
    });

    render(<ConfirmModal />);

    const confirmBtn = screen.getByRole("button", { name: "Delete" });
    await user.click(confirmBtn);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(confirmBtn).toBeDisabled());
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    // A second click while pending must not fire the action again.
    await user.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    // Still open — closing happens only once the action settles.
    expect(useUIStore.getState().confirmOptions).not.toBeNull();

    resolveConfirm();
    await waitFor(() => {
      expect(useUIStore.getState().confirmOptions).toBeNull();
    });
  });

  it("keeps the dialog open and re-enables the buttons if the action fails", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockRejectedValue(new Error("boom"));

    useUIStore.setState({
      confirmOptions: {
        title: "Delete Branch",
        message: "Are you sure?",
        confirmLabel: "Delete",
        onConfirm,
      },
    });

    render(<ConfirmModal />);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
    });
    // The failure did not close the dialog — the user can retry or cancel.
    expect(useUIStore.getState().confirmOptions).not.toBeNull();
  });
});
