import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the shared UI primitives the way design-tokens.test.ts guards the
 * token layer.
 *
 * src/styles/primitives.css exists because twelve stylesheets had each grown
 * their own button. Adoption stalled: the primitives are used at a handful of
 * call sites while dozens of bespoke button rules remain. This does not force a
 * migration — there is no visual regression suite to make one safe — but it
 * does stop the debt growing, and makes its size visible.
 */

const ROOT = join(__dirname, "..", "..");

function cssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...cssFiles(full));
    else if (extname(full) === ".css") out.push(full);
  }
  return out;
}

/** Rules that re-derive a button's shape rather than tweaking an existing one. */
function bespokeButtonRules(): { count: number; files: Set<string> } {
  const files = new Set<string>();
  let count = 0;

  const sheets = [
    ...cssFiles(join(ROOT, "src", "components")),
    join(ROOT, "src", "App.css"),
  ];

  for (const file of sheets) {
    const css = readFileSync(file, "utf8");
    for (const match of css.matchAll(/^([^\s@{][^{]*?)\{(.*?)^\}/gms)) {
      const lastSelector = (match[1] ?? "").split(",").pop()?.trim() ?? "";
      const body = match[2] ?? "";
      if (!/\.[a-z0-9-]*btn[a-z0-9-]*$/.test(lastSelector)) continue;
      if (!body.includes("padding")) continue;
      if (!body.includes("font-size") && !body.includes("cursor")) continue;
      count++;
      files.add(file);
    }
  }
  return { count, files };
}

/**
 * The count as measured when this guard was added. Lower it when a stylesheet
 * migrates to the `.btn` primitives; never raise it.
 */
const BASELINE = 48;

describe("shared UI primitives", () => {
  it("does not grow the number of bespoke button definitions", () => {
    const { count, files } = bespokeButtonRules();
    expect(
      count,
      `New bespoke button rules were added (${count} > ${BASELINE}) across ` +
        `${files.size} stylesheets. Use the .btn primitives in ` +
        `src/styles/primitives.css instead of re-deriving a button.`,
    ).toBeLessThanOrEqual(BASELINE);
  });

  it("keeps the baseline honest when stylesheets migrate", () => {
    const { count } = bespokeButtonRules();
    expect(
      count,
      `Bespoke button rules are down to ${count}. Lower BASELINE in this file ` +
        `to ${count} so the ratchet keeps holding.`,
    ).toBe(BASELINE);
  });

  it("still defines the primitives the guard points people at", () => {
    const primitives = readFileSync(
      join(ROOT, "src", "styles", "primitives.css"),
      "utf8",
    );
    for (const cls of [
      ".btn",
      ".btn-primary",
      ".btn-secondary",
      ".btn-danger",
      ".btn-ghost",
    ]) {
      expect(primitives).toContain(`${cls} {`);
    }
  });
});
