import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default defineConfig(async (env) => {
  // @ts-expect-error baseConfig could be a promise or function
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
      // `pnpm test:coverage`. Report-only for now: no thresholds, so the
      // numbers are visible without failing a build over them.
      coverage: {
        provider: "v8",
        include: ["src/**/*.{ts,tsx}"],
        exclude: ["src/main.tsx", "src/vite-env.d.ts"],
        reporter: ["text-summary", "html", "lcov"],
        reportsDirectory: "coverage",
      },
    },
  });
});
