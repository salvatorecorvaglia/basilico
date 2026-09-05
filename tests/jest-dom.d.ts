// @testing-library/jest-dom@7 ships a vitest augmentation that still targets
// vitest's old single-parameter `Assertion<T>`. Vitest 5 declares
// `Assertion<R, T>` and `Matchers<R, T>`, and a module augmentation only merges
// when its type parameters match the original declaration exactly — so that
// bundled augmentation is silently dropped (the mismatch error it produces is
// hidden by `skipLibCheck`) and every `toBeInTheDocument`-style matcher is
// missing at type level while working fine at runtime.
//
// Re-declare it here against vitest 5's shape. `Matchers` is what `Assertion`
// extends, so augmenting it covers `expect()`, `expect.soft()` and
// `expect.poll()` alike. Drop this file once jest-dom supports vitest 5.
import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

declare module "vitest" {
  interface Matchers<
    R extends void | Promise<void> = void | Promise<void>,
    T = unknown,
  > extends TestingLibraryMatchers<T, R> {}
}
