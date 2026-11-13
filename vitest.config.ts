import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default defineConfig(async (env) => {
  const baseConfig = await (typeof viteConfig === "function"
    ? viteConfig(env)
    : viteConfig);
  return mergeConfig(baseConfig, {
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: "./vitest.setup.ts",
      // Deliberately not `passWithNoTests`: a broken include glob or a renamed
      // test directory would otherwise report a green run with zero tests.
      passWithNoTests: false,
      // Keep every application module in the report, including untested UI.
      // Global floors prevent backsliding; safety-critical helpers have a
      // stricter gate. Raise floors as meaningful coverage grows.
      coverage: {
        provider: "v8",
        include: ["src/**/*.{ts,tsx}"],
        exclude: ["src/main.tsx", "src/vite-env.d.ts"],
        reporter: ["text-summary", "html", "lcov", "json-summary"],
        thresholds: {
          statements: 62,
          branches: 55,
          functions: 58,
          lines: 65,
          "src/lib/{conflict-blocks,hunk-patch,git-validation}.ts": {
            statements: 95,
            branches: 90,
            functions: 95,
            lines: 95,
          },
          "src/store/store-helpers.ts": {
            statements: 95,
            branches: 95,
            functions: 95,
            lines: 95,
          },
        },
        reportsDirectory: "coverage",
      },
    },
  });
});
