import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  COLOR_SCHEME_ATTRIBUTE,
  COLOR_SCHEME_STORAGE_KEY,
  setColorSchemePreference,
  useColorScheme,
} from "../../src/lib/color-scheme";

function Probe({ id }: { id: string }) {
  const { preference, isDark, setPreference } = useColorScheme();
  return (
    <div>
      <span data-testid={`${id}-preference`}>{preference}</span>
      <span data-testid={`${id}-dark`}>{String(isDark)}</span>
      <button type="button" onClick={() => setPreference("dark")}>
        {id}: go dark
      </button>
    </div>
  );
}

describe("useColorScheme", () => {
  beforeEach(() => {
    localStorage.clear();
    setColorSchemePreference("system");
  });

  /**
   * There are three live consumers — the toolbar toggle, Settings › Appearance,
   * and `useDarkMode` behind every Monaco view. They each used to hold their
   * own `useState`, so a change in one left the others showing a stale value:
   * an already-mounted diff kept Monaco on the previous theme.
   */
  it("keeps every consumer on the same value", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Probe id="toolbar" />
        <Probe id="settings" />
      </>,
    );

    expect(screen.getByTestId("toolbar-preference")).toHaveTextContent(
      "system",
    );
    expect(screen.getByTestId("settings-preference")).toHaveTextContent(
      "system",
    );

    await user.click(screen.getByText("settings: go dark"));

    // Both consumers move, not just the one that was clicked.
    expect(screen.getByTestId("settings-preference")).toHaveTextContent("dark");
    expect(screen.getByTestId("toolbar-preference")).toHaveTextContent("dark");
    expect(screen.getByTestId("toolbar-dark")).toHaveTextContent("true");
  });

  it("persists the preference and stamps the document", () => {
    setColorSchemePreference("light");

    expect(localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    // theme.css keys its plain-value fallback off this attribute, so an
    // explicit light choice can outrank `@media (prefers-color-scheme: dark)`.
    expect(document.documentElement.getAttribute(COLOR_SCHEME_ATTRIBUTE)).toBe(
      "light",
    );

    setColorSchemePreference("system");

    expect(document.documentElement.style.colorScheme).toBe("");
    expect(document.documentElement.hasAttribute(COLOR_SCHEME_ATTRIBUTE)).toBe(
      false,
    );
  });
});
