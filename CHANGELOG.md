# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.11.0] - 2026-07-19

### Added

- **Remote Branch Deletion**: Implemented remote branch deletion support in the `delete_branch` command, which now pushes a deletion spec (`:refs/heads/<branch>`) to the remote repository.
- **Rebase Drop Action**: Supported the `drop`/`d` action in the `rebase_step` command, setting a detached `HEAD` and checking out the parent commit tree.
- **Direct Bisect Exit**: Added direct exit functionality (with a new "Exit Bisect" button) to the `BisectWizard` UI and integrated backend state reset.

### Changed

- **Optimized File Watcher**: Refactored the file watcher to watch the root directory non-recursively, `.git` recursively, and top-level subdirectories selectively (ignoring build artifacts and dependencies) to avoid reaching file watch limits.
- **Settings Caching**: Implemented in-memory settings caching in `AppState` to eliminate redundant disk reads on Git command invocations.
- **Git Hook Execution**: Updated the `create_commit` command to run pre-commit hooks via `git hook run pre-commit` rather than invoking the script file directly, improving error propagation.
- **Initial Commit Support for Signed Commits**: Improved `create_commit` signature flow to resolve the symbolic target of `HEAD` and initialize empty repositories with a signed commit.
- **Commit Tree Performance**: Optimized `get_commit_tree` by skipping blob size checks when listing directory contents.
- **Merge Tool Cleanup Delay**: Delayed external merge tool temporary directory cleanup by 10 minutes (via a background thread) to keep staging files alive for processes that delegate execution and exit immediately.
- **CI and Release Validation**: Integrated Cargo.toml version validation in CI and release workflows, and added Vitest testing executions to CI/CD gates.
- **Tauri Runtime Generics**: Refactored settings command handlers and helpers to be generic over Tauri runtime types.

## [0.10.1] - 2026-07-17

### Added

- **Glib Dependency**: Added optional `glib` dependency in `Cargo.toml`.

### Changed

- **Dependency Updates**:
  - Upgraded `dompurify` override in `pnpm-workspace.yaml` to `^3.4.12` and updated lockfiles.
  - Updated Rust crate dependencies in `Cargo.lock`.

## [0.10.0] - 2026-07-16

### Added

- **Recent Repositories Dashboard**: Added a dashboard of recently opened repositories with timestamps on a modernized welcome screen layout.
- **Reflog Inspector**: Integrated a complete reflog inspector view with terminal-like output to view Git ref updates and commit/checkout history.
- **External Tools Integration**: Added settings and execution integration for external merge and diff tools.
- **Extended User Settings**: Added configurations for GitHub Personal Access Tokens (PAT), Gemini API keys, issue autolink patterns, and git hook bypasses.
- **Granular Line Staging**: Implemented line-level staging and unstaging directly from the side-by-side or unified diff views.
- **Drag-and-Drop Branch Resetting**: Supported drag-and-drop actions on the commit graph timeline to reset the current branch to a target commit.

### Changed

- **Safer Command Invocations**: Refactored Tauri command handlers to propagate Tokio task join errors via standard `From` traits, simplifying async error handling and cleaning up Rust code structure.
- **Robust File Watcher Fallback**: Re-engineered the recursive directory watcher with a fallback mechanism when standard fs-polling fails or lacks file system permissions.
- **Git Reference/Tag Validation**: Refactored git-validation utilities to support cleaner branch/tag formatting checks.

### Fixed

- **Git Merge Temp Directory Handling**: Resolved file cleanup issues with temporary merge directories during conflicts.
- **Rebase Squash & Hook Logic**: Fixed rebase squash handling and rebase auto-stepping loops, and refactored pre-commit/post-commit hook execution.
- **Argument Injection Protection**: Hardened Git commands (including worktree and bisect paths) and validated Git OID inputs to prevent potential command/argument injections.
- **Stability & Performance**: Prevented editor memory leaks by adding event listener cleanups on unmount, and resolved potential UI/graph rendering stalls on broken repository history structures.

## [0.9.0] - 2026-07-13

### Added

- **GPG Signature Verification**: Implemented GPG signature verification for commits, adding robust validation and error handling in the backend.
- **Interactive Rebase**: Added advanced interactive rebase support including squash, fixup, and drop operations in the UI and Rust backend.
- **Repository Initialization & Cloning**: Added commands and UI elements on the Welcome Screen to initialize new repositories or clone existing remote repositories.
- **Diff View Line Numbers**: Integrated line number displays within the side-by-side and unified diff views.
- **Theme Loader**: Added an early-loading script (`theme-loader.js`) to apply user theme preferences immediately on app startup, eliminating visual flashes.
- **Git Reference/Tag Validation**: Implemented client-side validation and sanitization checks for git tags and reference names before creation.

### Changed

- **Theme-Aware Commit Graph**: Enhanced `CommitGraph` rendering to be fully theme-aware with dynamic styling and added a theme guard layout wrapper.
- **Tab Accessibility**: Improved keyboard navigation, tab indexing, roles, and focus styling on tab elements (`TabBar`).
- **Layout Robustness**: Added a `PanelErrorBoundary` wrapper component to gracefully catch layout and panel-level runtime errors.
- **CI/CD & Autoupdater**: Updated release workflows and switched the auto-updater endpoint to point to GitHub releases JSON.
- **Dependency Clean-up**: Removed `package-lock.json` to resolve dependency conflicts.

### Fixed

- **Subprocess Hardening**: Hardened command-line subprocess execution and error safety in the Rust backend for `bisect` and `gpg` operations.

## [0.8.0] - 2026-07-09

### Added

- **Repository Session Persistence**: Persist the list of open repositories and the active repository path across application sessions using `localStorage`, automatically restoring them on application startup.
- **Tauri Installation Notes**: Added macOS Gatekeeper and Windows installation/troubleshooting notes to the `README.md`.

### Changed

- **CI/CD Workflows**: Updated CI/CD testing and release configurations in `.github/workflows/ci.yml` and `.github/workflows/release.yml`.
- **Git Ignore**: Updated `.gitignore` rules to keep workspace files clean.

### Fixed

- **Tauri Startup Crash**: Resolved application startup crash in release builds when signed keys are absent by disabling the updater plugin instead of deleting its config.

## [0.7.1] - 2026-07-06

### Added

- **Windows Credential Helper Support**: Implemented Windows-specific custom Git credential helper resolution and execution logic in the Rust backend for secure credential retrieval on Windows platforms.

### Changed

- **CI/CD & Workspace**: Enabled esbuild in `pnpm-workspace.yaml` and updated CI/CD workflow configurations (`.github/workflows/ci.yml` and `.github/workflows/release.yml`).

## [0.7.0] - 2026-07-06

### Added

- **Automatic App Updates**: Integrated Tauri's updater and process relaunch plugins (`@tauri-apps/plugin-updater` and `@tauri-apps/plugin-process`) to automatically check for updates in production builds. Features include interactive toast notifications with real-time download completion percentages and a "Restart now" action to complete the update process.

### Changed

- **Rust Backend**: Refactored the application setup closure parameter to `_app` in `src-tauri/src/lib.rs` to prevent compiler warnings about unused variables.

## [0.6.1] - 2026-07-06

### Fixed

- **Windows Console Window Flash**: Fixed console windows flashing briefly during background Git/process execution (such as during refresh/fetch) on Windows by setting the `CREATE_NO_WINDOW` creation flag on all spawned command-line subprocesses.

## [0.6.0] - 2026-07-06

### Added

- **Stash Inspector**: Added support for viewing diffs of untracked files in stashes. The backend now retrieves the 3rd parent commit of a stash (which contains untracked files in Git) and includes those files with an "untracked" status in the returned diffs.
- **Sidebar Trees**: Split branch, remote, tag, stash, submodule, and worktree layouts from the main Sidebar view into modular subcomponents (`BranchTree`, `RemoteTree`, `TagTree`, `StashTree`, `SubmoduleTree`, `WorktreeTree`) with rich custom context menu actions.
- **Client-Side Validation & Mapping**:
  - Implemented standard Git reference formatting rules via `validateBranchName` for robust branch validation before creation.
  - Implemented a user-friendly error mapper (`friendlyErrorMessage`) that converts raw Git CLI and Rust errors to actionable feedback notifications.
- **Testing & QA**: Added comprehensive Vitest test coverage for helper functions (`error-messages`, `git-validation`, `theme-presets`) and store slices (`collaboration-slice`, `git-data-slice`, `tabs-slice`).

### Changed

- **Refactoring & Code Quality**:
  - Centralized language detection logic in the frontend by introducing the `getLanguageFromPath` helper utility in `utils.ts`, replacing duplicate extension-to-language mappings across Monaco Editor components (`CompareView`, `DiffView`, `FileViewerModal`, `FileHistory`, `MergeEditor`, `StashInspector`).
  - Reformatted `index.html` structure.
- **Asynchronous Execution**: Offloaded synchronous or blocking operations in `rebase`, `bisect`, `gpg`, `settings`, `submodule`, and `worktree` commands to asynchronous Tokio worker threads (`tokio::task::spawn_blocking`) in the Rust backend.
- **Git Rebase auto-stepping**: Refactored `rebase_step` command to loop and automatically process non-pausing actions (picks, squashes, fixups) until complete, conflicted, or explicitly paused.
- **Git Author Verification**: Updated `create_commit` to explicitly verify that the local Git author name and email are configured, returning a clean error if missing instead of silently using fallback details.
- **Dynamic Accent Themes**: Updated the theme preset manager to dynamically alter the root document's `data-theme` attribute instead of individual inline style definitions, supporting light/dark responsive accents.
- **Monaco Themes**: Re-engineered Monaco Editor theme registrations to dynamically read CSS variables and automatically re-apply on system or accent theme changes using a DOM `MutationObserver`.

### Removed

- **Welcome Screen**: Removed the development-only "Open Basilico Repository" button and its associated CSS styling.

### Security

- **Path Traversal Protection**: Implemented strict path validation (`validate_path`) in backend commands for `apply_patch`, `add_submodule`, and `add_worktree` to prevent directory traversal vulnerabilities.

## [0.5.0] - 2026-06-27

### Added

- **Frontend State Management**: Introduced a multi-domain `loadingStates` tracker in the Zustand store to handle loading status individually per-domain (e.g., status, commits, branches, stashes) and prevent concurrent operations from clobbering each other.
- **UI & Error Handling**: Implemented a React `ErrorBoundary` component to gracefully catch client-side runtime errors and display a recovery UI.
- **Testing**: Added comprehensive frontend unit tests for Tauri commands, store actions/helpers, and utility functions using Vitest.

### Changed

- **Performance & Concurrency**: Offloaded blocking Git operations to asynchronous Tokio blocking tasks (`tokio::task::spawn_blocking`) in the Rust backend to prevent UI thread/tokio runtime stalls during heavy Git operations.
- **State Management**: Refactored frontend repository store slices (`collaboration`, `git-data`, `staging`, `tabs`) to utilize the new granular domain-specific loading states instead of the global `isLoading` flag.
- **UI & Helpers**: Migrated toast notification ID generation in `ui-store` to use `crypto.randomUUID()`.
- **Refactoring**: Removed unnecessary newline in `list_remotes` command in the Rust backend.
- **Frontend State Management**: Refactored Zustand store slices (`staging-slice`, `git-data-slice`, `collaboration-slice`) to use standard action helpers and optimize state transitions.
- **Code Quality**: Cleaned up code formatting, normalized project documentation links across `README.md` and `CONTRIBUTING.md`, and refactored docstrings/code comments in Tauri command files (`blame.rs`, `branch.rs`, `conflict_resolver.rs`, `diff.rs`, `history.rs`, `mod.rs`, `remote.rs`).

### Removed

- **Unused Features**: Removed unused Pull Request review (`PullRequestReview`), Reflog (`ReflogView`), and Repository Cleaning (`CleanModal`) features and their corresponding Tauri backend commands to streamline the application structure.

## [0.4.0] - 2026-06-23

### Added

- **Theme System**: Implemented a comprehensive theme system using CSS variables, offering dark mode support across all UI components.
- **Security**: Added path validation utilities in the Rust backend to prevent directory traversal attacks.

### Changed

- **UI & Styling Modernization**:
  - Modernized CSS variables using `color-mix` functions for cohesive styling.
  - Standardized all modal views (`CleanModal`, `ResetModal`, `ConfirmModal`, `PromptModal`, `SettingsModal`) using fixed positioning and z-index constants.
  - Enhanced sidebar branch and tag selection behavior.
  - Refactored tab navigation bar (`TabBar`) and staging area (`StagingArea`) components.
- **Dependency & Performance Optimization**:
  - Streamlined the interface by removing the React Flow-based `GitGraphFlow` visualization and its heavy layout dependencies.
  - Configured Monaco Editor to load web workers locally to improve performance and privacy rather than fetching them via CDN.
- **Tooling & Code Quality**:
  - Applied `rustfmt` to clean up and format the Rust backend codebase.
  - Suppressed certain Biome linting errors and disabled the `noImportantStyles` rule in `biome.json`.
  - Removed obsolete VS Code extensions configuration.

### Fixed

- **Memory Leak Resolution**: Patched memory leaks by ensuring proper disposal of Monaco Editor instances across key views (`CompareView`, `DiffView`, `FileHistory`, `StashInspector`).
- **Git Operations**: Refined SSH credential resolution and conflict handling in the Rust backend.

## [0.3.0] - 2026-06-22

### Added

- **Code Quality & Tooling**:
  - Integrated Biome as the project's default formatter, linter, and import organizer.
  - Added new npm scripts: `npm run lint`, `npm run lint:fix`, and `npm run format`.
  - Added default VS Code workspace settings to enable Biome auto-formatting and auto-fixing on save.
  - Added a Biome check step to the CI pipeline (`ci.yml` and `release.yml`).
- **Core Git Client Operations**:
  - Fast-forward and merge commit logic.
  - Rebase backend commands and operations.
  - Retrieval and tracking of repository metadata (`repoInfo`) during directory loading and state refreshing.
- **Testing & QA**:
  - Integrated Vitest testing library for frontend component and command testing.
  - Added frontend test configuration setup and Welcome Screen unit tests.
  - Expanded Rust backend unit tests covering branch merging (both fast-forward and merge commits), commit creation, commit amend, reset actions, and rebase setup operations.

### Changed

- **Performance & Optimization**:
  - Optimized diff parser using a path-to-index lookup map to achieve $O(1)$ lookup complexity per hunk/line.
  - Migrated commit search command to run using direct git CLI execution instead of repository revision walking.
- **Core Git Client Operations**:
  - Refactored commit and amend logic for improved robustness.
  - Updated SSH credentials check to prioritize `id_basilico` and `id_ed25519` key files.
  - Refactored submodule status retrieval using direct repository state checks instead of opening submodule repo directories.
  - Updated staging file discard behavior to safely manage directories and symlinks.
- **Frontend UI & UX**:
  - Added visual loading states to synchronize toolbar actions.
  - Restricted the dev-only open repository button on the welcome screen to development builds.
  - Improved GPG badge on commit details to display key verification status.
- **Documentation**:
  - Overhauled the contributing guide and project documentation files.

### Removed

- **Unused Dependencies**:
  - Removed unused Tauri plugins (`shell`, `fs`, and `store`) from the project dependencies and configuration files.

## [0.2.0] - 2026-06-20

### Added

- **Core Git Client Operations**:
  - Git merging backend operations and interface actions.
- **Modals & Management Panels**:
  - Secure SSH key generation options with comment sanitization.
- **Infrastructure & Styling**:
  - Standardized CSS color variables and theme accents using modern CSS `color-mix` functions.
  - Dynamic app version display in the status bar.
  - Dedicated `TempRepo` test utility for Tauri backend testing.
  - Automated release workflows for building macOS, Windows, and Linux Tauri targets.

### Changed

- **State Management**: Modularized the unified Zustand `repo-store` into smaller slices (`collaboration`, `git-data`, `settings`, `staging`, `tabs`).
- **Performance & Polish**:
  - Implemented debounced file system watcher refreshes to optimize rendering performance.
  - Enabled lazy loading of primary application views in the React frontend.
- **Security & Capabilities**:
  - Disabled Tauri auto-updater configuration and restricted default Tauri capabilities to the minimum required permissions.
  - Enabled the `vendored-openssl` feature for the `git2` cargo dependency to simplify compilation on Unix targets.
- **Accessibility & UI**:
  - Improved accessibility (a11y) attributes across interactive list elements, input fields, and custom scroll containers.
  - Updated fallback UI and visual component layouts.
  - Refactored `App.tsx` by extracting inline view-rendering functions.
- **Testing & Safety**: Improved deletion logic for staged/unstaged files and expanded staging deletion test coverage.

## [0.1.0] - 2026-06-20

### Added

- **Core Git Client Operations**:
  - Full staging, committing, and core repository management workspace.
  - Stash management (create, drop, pop) and branch operations.
  - Interactive stashing capabilities, along with a dedicated `StashInspector` UI element.
  - Git tagging capabilities integrated with the visual UI.
- **Visual Git Commit Graph**:
  - High-performance, canvas-based interactive Directed Acyclic Graph (DAG) for repository history.
  - Optimizations with $O(1)$ index caching and animation frame throttling.
- **Advanced Workspace Views**:
  - Revision comparison view supporting file tree exploration and diff rendering.
  - Integrated Git blame view and detailed file modification history tracking.
  - Interactive merge conflict resolver view.
  - Pull Request review dashboard.
- **Modals & Management Panels**:
  - Soft, mixed, and hard modes for `git reset` via a custom `ResetModal` UI.
  - Management modals for submodules, worktrees, and application settings.
  - Global application toast notification, prompt modals, and confirmation dialogs.
- **Infrastructure & Styling**:
  - Light/dark themes with dynamic theme accent color configuration and standardized CSS font variables.
  - Multithreaded Tauri backend command architecture utilizing the Rust `git2` bindings.
  - Live repository file system watcher tracking state changes.
  - Keyboard shortcuts to open repositories.
  - CI workflows for automated lint checks, TypeScript verification, Rust testing, and release builds.
  - MIT License documentation and Security reporting policy.

### Changed

- **Error Handling Architecture**: Standardized Rust command handlers to bubble up descriptive `AppError` types instead of generic strings to the React frontend.
- **State Management**: Optimized `AppState` to track repository paths in a unified `HashSet` and track watcher sessions using unique UUID identifiers.
- **Performance & Polish**:
  - Enhanced git diff parsing logic with complete unit test suites.
  - Standardized process execution and Git credential helper logic.
  - Refactored Tauri command handlers to be modular and clean.
  - Streamlined dashboard pane layouts and sizing metrics.
  - Standardized line-wrapping and styling formatting across both frontend and backend modules.

### Removed
- **Unused Dependencies**: Pruned unused package packages and cargo crates.

## [0.0.1] - 2026-06-19

### Added

- First implementation of Basilico.
