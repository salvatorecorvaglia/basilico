// @vitest-environment node
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import manifest from "../../package.json";

const require = createRequire(import.meta.url);

describe("test toolchain compatibility", () => {
  it("pins the runner and coverage provider to the same installed version", () => {
    const runner = manifest.devDependencies.vitest;
    const coverage = manifest.devDependencies["@vitest/coverage-v8"];
    expect(runner).toMatch(/^\d+\.\d+\.\d+$/);
    expect(coverage).toBe(runner);
    expect(require("vitest/package.json").version).toBe(runner);
    expect(require("@vitest/coverage-v8/package.json").version).toBe(runner);
    expect(
      require("@vitest/coverage-v8/package.json").peerDependencies.vitest,
    ).toBe(runner);
  });
});
