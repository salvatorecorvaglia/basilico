import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PromptModal } from "../../../src/components/layout/PromptModal";
import { useUIStore } from "../../../src/store/ui-store";

describe("PromptModal", () => {
  beforeEach(() => {
    useUIStore.setState({ promptOptions: null });
  });

  // Same class of bug as ConfirmModal: the dialog used to close immediately
  // on submit, before the async action resolved, losing any in-flight state
  // and letting a double-click submit twice.
  it("disables the buttons and keeps the dialog open while the action is pending", async () => {
    const user = userEvent.setup();
    let resolveSubmit: () => void = () => {};
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );

    useUIStore.setState({
      promptOptions: {
        title: "Create Tag",
        fields: [{ name: "name", label: "Tag Name", required: true }],
        submitLabel: "Create",
        onSubmit,
      },
    });

    render(<PromptModal />);

    await user.type(screen.getByLabelText(/Tag Name/), "v1.0.0");
    const submitBtn = screen.getByRole("button", { name: "Create" });
    await user.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(submitBtn).toBeDisabled());
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    // A second click while pending must not submit again.
    await user.click(submitBtn);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    expect(useUIStore.getState().promptOptions).not.toBeNull();

    resolveSubmit();
    await waitFor(() => {
      expect(useUIStore.getState().promptOptions).toBeNull();
    });
  });

  it("keeps the dialog open and re-enables the buttons if the action fails", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error("boom"));

    useUIStore.setState({
      promptOptions: {
        title: "Create Tag",
        fields: [{ name: "name", label: "Tag Name", required: true }],
        submitLabel: "Create",
        onSubmit,
      },
    });

    render(<PromptModal />);

    await user.type(screen.getByLabelText(/Tag Name/), "v1.0.0");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create" })).toBeEnabled();
    });
    expect(useUIStore.getState().promptOptions).not.toBeNull();
  });
});
