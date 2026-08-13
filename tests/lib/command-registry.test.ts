import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The Rust command registry in `lib.rs` and the typed wrappers in
 * `tauri-commands.ts` have to agree, but nothing enforces it — a renamed or
 * removed command only fails at runtime, when the user clicks the button.
 * These tests compare the two lists so the mismatch surfaces at build time.
 */

const ROOT = join(__dirname, "..", "..");

function registeredRustCommands(): Set<string> {
  const src = readFileSync(join(ROOT, "src-tauri", "src", "lib.rs"), "utf8");
  const handler = src.slice(
    src.indexOf("generate_handler!["),
    src.indexOf("])", src.indexOf("generate_handler![")),
  );

  const names = new Set<string>();
  for (const line of handler.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || !trimmed) continue;
    // Entries look like `commands::repo::open_repo,`
    const match = trimmed.match(/^commands::[\w:]*::(\w+)\s*,?$/);
    if (match?.[1]) names.add(match[1]);
  }
  return names;
}

function invokedCommands(): Set<string> {
  const src = readFileSync(
    join(ROOT, "src", "lib", "tauri-commands.ts"),
    "utf8",
  );
  const names = new Set<string>();
  // invokeCommand<T>("command_name", ...)
  for (const m of src.matchAll(/invokeCommand<[^>]*>\(\s*"([a-z0-9_]+)"/g)) {
    if (m[1]) names.add(m[1]);
  }
  return names;
}

describe("Tauri command registry", () => {
  const rust = registeredRustCommands();
  const ts = invokedCommands();

  it("parses both sides", () => {
    // Guards the tests themselves: a parsing change that silently produced an
    // empty set would make every assertion below vacuously pass.
    expect(rust.size).toBeGreaterThan(50);
    expect(ts.size).toBeGreaterThan(50);
  });

  it("invokes only commands the backend registers", () => {
    const missing = [...ts].filter((name) => !rust.has(name)).sort();
    expect(
      missing,
      `these commands are invoked from the frontend but are not in generate_handler![] — they will fail at runtime: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("has no registered command without a typed wrapper", () => {
    const unused = [...rust].filter((name) => !ts.has(name)).sort();
    expect(
      unused,
      `these commands are registered in Rust but never invoked — either dead code or a missing wrapper: ${unused.join(", ")}`,
    ).toEqual([]);
  });
});
