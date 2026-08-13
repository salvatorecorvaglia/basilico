import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the design system against the two ways it previously rotted:
 * component styles hardcoding colours instead of using tokens, and referencing
 * tokens that were never defined — which renders nothing at all, silently.
 */

const ROOT = join(__dirname, "..", "..");
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

  /**
   * The hex check above only ever matched `#rrggbb`, so 74 `rgba()` literals
   * accumulated behind it — a whole hardcoded palette in ReflogInspector.css,
   * plus `rgba(255,255,255,…)` overlays that assume a dark background and are
   * invisible in light mode.
   *
   * Neutral black/white alphas are still allowed: they are shadows and scrims,
   * which are genuinely colourless and read correctly over any theme.
   */
  const NEUTRAL_RGBA =
    /^rgba?\(\s*(0\s*,\s*0\s*,\s*0|255\s*,\s*255\s*,\s*255)\s*(,|\/|\))/;

  it("keeps functional colour notations out of component stylesheets", () => {
    const offenders: string[] = [];

    for (const file of components) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/\b(?:rgba?|hsla?)\([^)]*\)/g)) {
        if (NEUTRAL_RGBA.test(m[0])) continue;
        offenders.push(`${file.replace(ROOT, "")}: ${m[0]}`);
      }
    }

    expect(
      offenders,
      "rgb()/hsl() literals bypass the theme exactly as hex does — add a token in src/styles/theme.css instead (neutral black/white alphas are allowed for shadows and scrims)",
    ).toEqual([]);
  });

  /**
   * The stylesheet scan cannot see inline `style={{ ... }}` in components, and
   * two undefined tokens were hiding there: `--danger-color` and
   * `--accent-info` do not exist, so those rules silently fell back to their
   * hardcoded hex forever. The real tokens are `--color-danger`/`--color-info`.
   */
  it("defines every token referenced from component inline styles", () => {
    const tsxFiles: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (full.endsWith(".tsx") || full.endsWith(".ts")) {
          tsxFiles.push(full);
        }
      }
    };
    walk(COMPONENTS);

    const missing: string[] = [];
    const hardcoded: string[] = [];

    for (const file of tsxFiles) {
      const text = readFileSync(file, "utf8");

      for (const m of text.matchAll(REFERENCE)) {
        const token = m[1];
        if (token && !themeTokens.has(token)) {
          missing.push(`${file.replace(ROOT, "")}: ${token}`);
        }
      }

      // A literal colour inside a `style={{ ... }}` object, with no var() at all.
      for (const m of text.matchAll(
        /(?:color|background|backgroundColor|borderColor|fill|stroke)\s*:\s*"(#[0-9a-fA-F]{3,8})"/g,
      )) {
        hardcoded.push(`${file.replace(ROOT, "")}: ${m[1]}`);
      }
    }

    expect(
      [...new Set(missing)].sort(),
      "these tokens are referenced from inline styles but never defined, so the value silently falls back",
    ).toEqual([]);

    expect(
      [...new Set(hardcoded)].sort(),
      "hardcoded colours in inline styles bypass the theme — use var(--token) instead",
    ).toEqual([]);
  });
});
