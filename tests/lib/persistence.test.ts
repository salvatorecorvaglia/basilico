import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STORAGE_KEYS } from "../../src/lib/persistence";

const ROOT = join(__dirname, "..", "..");

/**
 * `resources/theme-loader.js` runs before the bundle, to avoid a flash of the
 * wrong theme, so it cannot import `STORAGE_KEYS` and hardcodes the two theme
 * keys instead. If those ever diverge, the pre-paint theme and the theme React
 * applies disagree — which shows up as a flash the loader exists to prevent,
 * with nothing failing to explain it.
 */
describe("theme-loader key agreement", () => {
  const loader = readFileSync(
    join(ROOT, "resources", "theme-loader.js"),
    "utf8",
  );

  it("reads the same theme key the app writes", () => {
    expect(loader).toContain(`"${STORAGE_KEYS.theme}"`);
  });

  it("reads the same colour-scheme key the app writes", () => {
    expect(loader).toContain(`"${STORAGE_KEYS.colorScheme}"`);
  });

  it("does not read a basilico key the app never writes", () => {
    const known = new Set<string>(Object.values(STORAGE_KEYS));
    const used = loader.match(/"basilico-[a-z-]+"/g) ?? [];
    const unknown = used
      .map((q) => q.slice(1, -1))
      .filter((key) => !known.has(key));
    expect(unknown, "theme-loader.js reads keys nothing writes").toEqual([]);
  });
});

describe("STORAGE_KEYS", () => {
  it("has no duplicate values", () => {
    const values = Object.values(STORAGE_KEYS);
    expect(new Set(values).size).toBe(values.length);
  });
});
