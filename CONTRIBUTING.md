# Contributing to Basilico 🌿

Thank you for your interest in contributing to **Basilico**! We welcome contributions, bug reports, feature requests, and security improvements from the community.

---

## How Can I Contribute?

### Reporting Bugs

If you find a bug or unexpected behavior, please check open issues first to see if it has already been reported. If not, open a new issue and include:
- A clear, descriptive title.
- Steps to reproduce the issue.
- Expected vs. actual behavior.
- Details about your environment (OS version, Basilico version, Git version).
- Relevant screenshots, logs, or error messages.

### Suggesting Enhancements

We are always looking for ways to improve Basilico. If you have an idea for a new feature or design enhancement:
- Check existing issues to see if the feature has been proposed.
- Open an issue describing the proposed feature, why it is useful, and how it should work or look.

### Submitting Pull Requests

If you are ready to write code or update documentation:
1. Find an existing issue to work on or create one to discuss your proposed changes first.
2. Fork the repository and set up your development environment.
3. Submit a pull request (PR) with your changes.

---

## Development Setup

To run and build Basilico locally, make sure you have installed the [Prerequisites](README.md#prerequisites). Then follow these steps:

1. **Fork the repository** on GitHub.
2. **Clone your fork** to your local machine:
   ```bash
   git clone https://github.com/your-username/basilico.git
   cd basilico
   ```
3. **Install dependencies**:
   ```bash
   pnpm install
   ```
4. **Start the development server**:
   ```bash
   pnpm tauri dev
   ```
   *Note: While you can run `pnpm dev` to run the frontend in a standard browser tab, many features rely on native Rust/Tauri APIs (such as file system access and git operations) and will only function properly when run inside the Tauri container via `pnpm tauri dev`.*

---

## Coding Guidelines

### Frontend Standards
We use **Biome** to format and lint our TypeScript, React, and CSS code. Ensure your code passes all Biome checks with zero warnings (`--error-on-warnings`) before submitting a PR.

- **Check Linting**: `pnpm lint`
- **Format Code**: `pnpm format`
- **Fix Linting Errors**: `pnpm lint:fix`

- Use **React 19** best practices (e.g., hooks, functional components, concurrent rendering features).
- Write strictly type-safe TypeScript code. Avoid `any` types in both application code and test files, using concrete interfaces or union types.
- Type-check with `pnpm exec tsc --noEmit` before opening a PR; CI runs it as a separate gate from linting.
- Use Tailwind CSS v4 class naming patterns, maintaining consistent layouts with our flexbox, grid, and spacing utilities.
- Keep view components focused. When one grows past a few hundred lines, extract the parts with a narrow interface: pure logic into a `use-*.ts` hook or plain module (see `src/components/staging/use-staging-rows.ts`, `src/components/graph/use-commit-actions.ts`), and self-contained JSX into its own component (`StagingContextMenu.tsx`, `CommitColumns.tsx`, `CommitContextMenu.tsx`). Prefer leaving a block inline over threading a dozen props through it — the goal is readability, not a line count.
- Never `await`-less a store action that re-throws. Store actions raise their own toast and then rethrow, so a fire-and-forget call needs its own `.catch` or it becomes an unhandled rejection the user never sees.
- Route every outbound link through `openExternalUrl` (`src/lib/utils.ts`) rather than a bare `href`, so the `https://`-only guard applies uniformly.

### Rust Backend Standards
- Format your Rust code with `cargo fmt`.
- Ensure there are no warnings or errors reported by `cargo clippy`.
- Follow idiomatic Rust guidelines (explicit error handling, proper ownership and borrowing, avoidance of `unwrap()` in production-ready command handlers).
- Modularize Tauri commands into domain-specific modules under `src-tauri/src/commands/` (e.g., `doctor.rs`, `ide.rs`, `branch.rs`, `rebase.rs`, `worktree.rs`, `submodule.rs`, `patch.rs`, `reflog.rs`, `hooks.rs`, `conflict_resolver.rs`), and Git internals under `src-tauri/src/git/` (e.g., `helpers.rs`, `credentials.rs`, `known_hosts.rs`, `graph.rs`).
- Errors should be propagated to the frontend via the custom `Error` wrapper in `src-tauri/src/error.rs`.
- Any frontend-supplied value that reaches a `git` argv slot must pass through `commands::validate_git_argument`, or be preceded by a `--` separator — several subcommands expose flags that execute arbitrary commands (`rebase --exec`, `clone --upload-pack`, `format-patch --output-directory`).
- Validate user-supplied paths with `git::utils::validate_path`, and with `validate_path_no_symlink` whenever the result is opened directly — a repository can commit a symlink pointing anywhere on disk, and both `fs::read_to_string` and `fs::write` follow it.
- Never assume `<repo>/.git` is a directory. In a linked worktree or a submodule it is a *file*; use `watcher::resolve_git_dirs`, or `Repository::path()` / `commondir()`, to find the real location.

---

## Testing Guidelines

Always verify that your changes do not break existing functionality:

- **Run Frontend Tests**:
  ```bash
  pnpm test
  ```
  We use **Vitest** and **React Testing Library** for frontend testing. When adding features or fixing bugs (in UI components, lib utilities, or Zustand state stores), add or update unit and component tests under the top-level `tests/` directory:
  - **Component Tests**: `tests/components/` (e.g., `DiffView.test.tsx`, `RebaseEditor.test.tsx`, `BranchTree.test.tsx`, `RemoteTree.test.tsx`, `StagingArea.test.tsx`, `use-staging-rows.test.ts`, `StatusBar.test.tsx`, `Toolbar.test.tsx`, `ConfirmModal.test.tsx`, `PromptModal.test.tsx`, `Sidebar.test.tsx`, `MergedBranchSweeperModal.test.tsx`, `CommandPalette.test.tsx`, `CommitList.test.tsx`, `GitDoctorModal.test.tsx`, `SettingsModal.test.tsx`, `MergeEditor.test.tsx`).
  - **Store & Utility Tests**: `tests/lib/` (e.g., `store.test.ts`, `hunk-patch.test.ts`, `design-tokens.test.ts`, `shortcuts.test.ts`, `forge-links.test.ts`, `autolink.test.ts`, `signature-status.test.ts`, `git-validation.test.ts`, `error-messages.test.ts`, `command-registry.test.ts`).

  Logic that is easier to assert directly than through a rendered component belongs in a plain module with its own test — `src/lib/hunk-patch.ts` (patch construction, both directions) and `src/components/staging/use-staging-rows.ts` (the staging list's row model) are the pattern to follow.

- **Run Backend Tests**:
  If you modify Rust files in `src-tauri`, run backend tests using:
  ```bash
  cd src-tauri
  cargo test
  ```
  Backend test suites are organized into dedicated test modules in `src-tauri/tests/` (`commands_tests.rs`, `git_tests.rs`, `watcher_tests.rs`, `backend_integration_test.rs`).

  Note: `git_tests.rs` also covers commit-graph lane assignment, pagination, and cache invalidation/bounding (`src-tauri/src/git/graph.rs`) plus diff parsing; `commands_tests.rs` covers repository health over linked worktrees, commit-tree metadata, and GPG status parsing; and SSH host key verification is unit-tested inline in `src-tauri/src/git/known_hosts.rs`.

  When fixing a bug, add the regression test **before** the fix and confirm it fails against the unchanged code — several defects here (a cache serving stripped rows, a reverse patch built with the forward rule) were invisible to the existing suite precisely because no test exercised the path that triggered them.

*Note: GitHub Actions enforces quality gates in parallel (version consistency across `package.json` / `tauri.conf.json` / `Cargo.toml`, strict linting with `--error-on-warnings`, TypeScript type-checking, Vitest frontend tests, `cargo fmt --check`, `cargo clippy -- -D warnings`, Rust tests, and npm/cargo dependency audits).*

---

## Commit Message Guidelines

We recommend using clear, structured, and descriptive commit messages (preferably following [Conventional Commits](https://www.conventionalcommits.org/)):

- **Format**: `<type>(<scope>): <description>`
- **Types**:
  - `feat`: A new user-facing feature.
  - `fix`: A bug fix.
  - `docs`: Documentation-only changes.
  - `style`: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc.).
  - `refactor`: A code change that neither fixes a bug nor adds a feature.
  - `perf`: A code change that improves performance.
  - `test`: Adding missing tests or correcting existing tests.
  - `chore`: Changes to the build process, auxiliary tools, or libraries.

*Example:* `feat(staging): support line-level staging in diff view`

---

## Pull Request Process

1. Create a descriptive branch name from the `main` branch (e.g., `feature/line-staging` or `bugfix/issue-watcher-limit`).
2. Make your code changes, and add corresponding unit tests if applicable.
3. Ensure formatting and linting pass (`pnpm format` and `pnpm lint`).
4. Ensure all unit tests pass (`pnpm test` and `cargo test`).
5. Push your branch to your fork on GitHub.
6. Open a Pull Request against the `main` branch of the original repository.
7. Provide a detailed summary of the changes in the PR description, referencing any relevant issues (e.g., `Closes #123`).
8. Respond to review comments and feedback in a timely manner.

---

Happy coding! 🌿