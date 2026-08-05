import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the design system against the two ways it previously rotted:
 * component styles hardcoding colours instead of using tokens, and referencing
 * tokens that were never defined — which renders nothing at all, silently.
 */

const ROOT = join(__dirname, "..", "..", "..");
const COMPONENTS = join(ROOT, "src", "components");
const STYLES = join(ROOT, "src", "styles");

function cssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...cssFiles(full));
    else if (extname(full) === ".css") out.push(full);
  }
  return out;
}

const DEFINITION = /^\s*(--[\w-]+)\s*:/gm;
const REFERENCE = /var\((--[\w-]+)\s*[,)]/g;

function definedTokens(files: string[]): Set<string> {
  const set = new Set<string>();
  for (const f of files) {
    for (const m of readFileSync(f, "utf8").matchAll(DEFINITION)) {
      if (m[1]) set.add(m[1]);
    }
  }
  return set;
}

describe("design tokens", () => {
  const themeTokens = definedTokens(cssFiles(STYLES));
  const components = cssFiles(COMPONENTS);

  it("finds the stylesheets", () => {
    expect(themeTokens.size).toBeGreaterThan(40);
    expect(components.length).toBeGreaterThan(10);
  });

  it("defines every token the components reference", () => {
    const missing: string[] = [];

    for (const file of components) {
      const text = readFileSync(file, "utf8");
      // A component may define its own local custom property (the GPG badge
      // sets --sig-color on itself); those count as defined.
      const local = definedTokens([file]);

      for (const m of text.matchAll(REFERENCE)) {
        const token = m[1];
        if (!token) continue;
        if (!themeTokens.has(token) && !local.has(token)) {
          missing.push(`${file.replace(ROOT, "")}: ${token}`);
        }
      }
    }

    expect(
      [...new Set(missing)].sort(),
      "these tokens are referenced but never defined, so the declaration is dropped and the rule renders nothing",
    ).toEqual([]);
  });

  it("keeps colours out of component stylesheets", () => {
    const offenders: string[] = [];

    for (const file of components) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
        offenders.push(`${file.replace(ROOT, "")}: ${m[0]}`);
      }
    }

    expect(
      offenders,
      "hardcoded colours bypass the theme and do not adapt to light/dark — add a token in src/styles/theme.css instead",
    ).toEqual([]);
  });
});
