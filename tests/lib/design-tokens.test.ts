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
  /**
   * The neutral-alpha exemption above was written to allow shadows and scrims,
   * but it is matched against the *value* alone, so it also waved through the
   * exact bug its own comment describes: `rgba(255, 255, 255, 0.08)` used as a
   * `background` is a lightening overlay, and on the near-white surfaces of
   * light mode it lightens almost nothing. Hover feedback in the Reflog table,
   * the conflict banner's secondary button and the Blame gutter all vanished.
   *
   * So the exemption is split by *property*: neutral alphas stay legal in a
   * shadow, where they genuinely are colourless depth, and are rejected as a
   * fill or a border, where they stand in for a theme surface that has a token.
   */
  const SURFACE_PROPERTY =
    /(?:^|[;{])\s*(background|background-color|border|border-color|border-top|border-right|border-bottom|border-left)\s*:\s*[^;{}]*$/;

  it("keeps neutral alphas out of surface colours", () => {
    const offenders: string[] = [];

    for (const file of components) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/\b(?:rgba?|hsla?)\([^)]*\)/g)) {
        if (!NEUTRAL_RGBA.test(m[0])) continue;
        const before = text.slice(0, m.index);
        if (!SURFACE_PROPERTY.test(before)) continue;
        const line = before.split("\n").length;
        offenders.push(`${file.replace(ROOT, "")}:${line}: ${m[0]}`);
      }
    }

    expect(
      offenders,
      "a black/white alpha used as a fill or border is a lightening/darkening overlay that assumes one theme — on the near-white surfaces of light mode it does almost nothing. Use a surface token (--bg-hover, --bg-elevated, --border-hover). Neutral alphas remain allowed in box-shadow.",
    ).toEqual([]);
  });

  /**
   * Three stylesheets had drifted almost entirely off the spacing and type
   * scales — ReflogInspector.css carried 74 raw pixel values against 89 token
   * references. They have been normalised; this pins them there. The budget is
   * a ceiling per file, not a global rule, so the stylesheets that were never
   * cleaned up are not held to a standard nothing else enforces yet.
   *
   * Only properties that have a scale are counted. `width`/`height` are
   * excluded on purpose: table column widths and icon sizes are geometry, and
   * there is no token scale for them to snap to.
   */
  const SCALED_PROPERTY =
    /\b(padding|padding-top|padding-right|padding-bottom|padding-left|margin|margin-top|margin-right|margin-bottom|margin-left|gap|row-gap|column-gap|border-radius|font-size|font-weight)\s*:\s*([^;{}]*)/g;

  const PX_BUDGET: Record<string, number> = {
    "ReflogInspector.css": 0,
    "RepoSearch.css": 0,
    "ConflictBanner.css": 0,
  };

  it("keeps the normalised stylesheets on the spacing and type scales", () => {
    const over: string[] = [];

    for (const file of components) {
      const name = file.split("/").pop() as string;
      const budget = PX_BUDGET[name];
      if (budget === undefined) continue;

      const text = readFileSync(file, "utf8");
      let raw = 0;
      for (const m of text.matchAll(SCALED_PROPERTY)) {
        if (/\d+px/.test(m[2] ?? "")) raw++;
      }
      if (raw > budget) over.push(`${name}: ${raw} raw px (budget ${budget})`);
    }

    expect(
      over,
      "these stylesheets were normalised onto the design tokens — use var(--space-*), var(--radius-*), var(--font-size-*) and var(--weight-*) rather than reintroducing pixel values",
    ).toEqual([]);
  });
  /**
   * Dark mode is produced two ways — `light-dark()` for engines that support
   * it, and plain-value blocks for those that do not — and they must not
   * disagree. They previously did: the fallback keyed off
   * `@media (prefers-color-scheme: dark)` alone, which reports the *OS* setting
   * and ignores the inline `color-scheme` an explicit choice writes, so it
   * outranked the light-dark() result whenever the OS was dark and picking
   * "Light" changed nothing at all.
   *
   * The values now live once as `--dark-*` and the two blocks only assign them,
   * so a value cannot drift. This pins the remaining risk: one block gaining a
   * token the other never got.
   */
  it("assigns the same tokens in both dark-mode blocks", () => {
    const theme = readFileSync(join(STYLES, "theme.css"), "utf8");

    const block = (selector: string): Set<string> => {
      const at = theme.indexOf(selector);
      expect(at, `${selector} not found in theme.css`).toBeGreaterThan(-1);
      const open = theme.indexOf("{", at);
      const close =
        theme.indexOf("\n  }", open) + 1 || theme.indexOf("\n}", open);
      const body = theme.slice(open, close);
      return new Set(
        [...body.matchAll(/(--[\w-]+)\s*:\s*var\(--dark-/g)].map(
          (m) => m[1] as string,
        ),
      );
    };

    const media = block(':root:not([data-color-scheme="light"])');
    const explicit = block(':root[data-color-scheme="dark"] {');

    expect(media.size).toBeGreaterThan(30);
    expect(
      [...explicit].sort(),
      "the OS-dark block and the explicit-dark block must assign the same tokens, or one theme path will be missing a colour",
    ).toEqual([...media].sort());
  });

  /**
   * The fallback block must stay scoped. Unscoped, it beats `light-dark()`
   * whenever the OS is dark, which is the bug above.
   */
  it("scopes the prefers-color-scheme fallback so an explicit light choice wins", () => {
    const theme = readFileSync(join(STYLES, "theme.css"), "utf8");
    const media = theme.slice(
      theme.indexOf("@media (prefers-color-scheme: dark)"),
    );

    for (const m of media.matchAll(/^\s{2}(:root[^{]*)\{/gm)) {
      expect(
        m[1],
        "every :root rule inside the dark media query must exclude an explicit light choice",
      ).toContain('data-color-scheme="light"');
    }
  });
  /**
   * The shared primitives must be owned by primitives.css alone.
   *
   * `.btn-secondary` and `.btn-danger` used to be declared inside
   * ReflogInspector.css with no namespace at all, so they leaked out of that
   * component and silently styled StashInspector's buttons too — editing the
   * reflog restyled the stash inspector. This pins the ownership.
   *
   * It also guards a subtler hazard: component stylesheets are imported by
   * their components, which load before styles/index.css, so the primitives are
   * bundled *last*. A component redeclaring one of these names at the same
   * specificity would silently lose, rather than override as its author
   * intended — the override has to be more specific (`.x.btn-secondary`).
   */
  it("declares the shared primitives only in primitives.css", () => {
    const primitives = readFileSync(join(STYLES, "primitives.css"), "utf8");
    const owned = new Set(
      [...primitives.matchAll(/^\.([\w-]+)/gm)].map((m) => m[1] as string),
    );
    expect(owned.has("btn")).toBe(true);
    expect(owned.has("empty-state")).toBe(true);
    expect(owned.has("view-header")).toBe(true);

    const offenders: string[] = [];
    for (const file of components) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/^\.([\w-]+)\s*[{,:]/gm)) {
        if (owned.has(m[1] as string)) {
          offenders.push(`${file.replace(ROOT, "")}: .${m[1]}`);
        }
      }
    }

    expect(
      offenders,
      "these redeclare a shared primitive from a component stylesheet, which leaks the class to every other component using it. Scope the override instead (.your-class.btn-secondary), which is also what makes it win — the primitives are bundled after component styles.",
    ).toEqual([]);
  });
});
