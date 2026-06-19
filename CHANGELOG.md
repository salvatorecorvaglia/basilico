# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
