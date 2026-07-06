import { describe, expect, it, beforeEach } from "vitest";
import { applyThemeToDOM } from "../theme-presets";

describe("theme-presets", () => {
  beforeEach(() => {
    // Reset attribute
    document.documentElement.removeAttribute("data-theme");
  });

  it("should apply theme to the document element", () => {
    applyThemeToDOM("royal-blue");
    expect(document.documentElement.getAttribute("data-theme")).toBe("royal-blue");
  });

  it("should apply ocean-teal theme preset", () => {
    applyThemeToDOM("ocean-teal");
    expect(document.documentElement.getAttribute("data-theme")).toBe("ocean-teal");
  });

  it("should not set unknown theme presets", () => {
    applyThemeToDOM("unknown-theme");
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });
});
