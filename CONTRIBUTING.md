# Contributing to Basilico 🌿

Thank you for your interest in contributing to **Basilico**! Basilico is a fast, modern, and beautiful Git GUI client built using **Tauri 2**, **Rust**, **React**, and **TypeScript**. 

By contributing, you help make Git GUI workflows faster, more elegant, and more accessible for developers worldwide.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [How Can I Contribute?](#how-can-i-contribute)
3. [Branching Strategy](#branching-strategy)
4. [Development Setup](#development-setup)
5. [Project Architecture](#project-architecture)
6. [Coding Guidelines](#coding-guidelines)
7. [Submitting a Pull Request](#submitting-a-pull-request)
8. [License](#license)

---

## Code of Conduct

We are committed to providing a welcoming, safe, and friendly environment for all contributors. We expect all participants to behave professionally, treat others with respect, and collaborate constructively.

---

## How Can I Contribute?

### 🐛 Reporting Bugs
Before creating a bug report, check the open issues to see if the problem has already been reported. If not, open a new issue using the [🐛-bug-report.md](.github/ISSUE_TEMPLATE/🐛-bug-report.md) template and include:
* A clear and descriptive title.
* Steps to reproduce the behavior.
* Expected vs. actual behavior.
* Screenshots or screen recordings, if applicable.
* Your operating system and environment details.

### ✨ Suggesting Features & Enhancements
If you have ideas to improve Basilico, check the existing requests first. If it's a new idea, open a feature request using the [✨-feature-request.md](.github/ISSUE_TEMPLATE/✨-feature-request.md) template describing:
* The problem your feature solves.
* How the proposed solution works.
* Mockups, designs, or examples of similar features.

### 🛠 Tasks & Improvements
For general performance optimization, documentation edits, or refactoring, use the [🛠-task---improvement.md](.github/ISSUE_TEMPLATE/🛠-task---improvement.md) template.

---

## Branching Strategy

* **`develop`**: This is the main development branch. All feature branches and bug fixes should target `develop` in their Pull Requests.
* **`main`**: This branch represents the stable production-ready releases. Merges into `main` are handled by maintainers during the release cycle and will trigger auto-tagging and packaging workflows.

When creating a branch:
```bash
git checkout develop
git pull origin develop
git checkout -b feature/your-feature-name
# or for bug fixes:
git checkout -b fix/your-bugfix-name
```

---

## Development Setup

### Prerequisites

Ensure you have the following installed on your local machine:
* **Node.js** (v22 or higher recommended; v18 minimum)
* **Rust Toolchain** (via [rustup](https://rustup.rs/))
* **System dependencies** required for Tauri development (see the [Tauri Prerequisites Guide](https://v2.tauri.app/start/prerequisites/)).

### Local Installation

1. Fork the repository and clone your fork:
   ```bash
   git clone https://github.com/YOUR-USERNAME/basilico.git
   cd basilico
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Running the App

To launch the unified frontend and native container (Vite + Tauri dev server):
```bash
npm run tauri dev
```

For advanced frontend debugging or split setups:
1. Start the Vite server (Terminal 1):
   ```bash
   npm run dev
   ```
2. Start the Tauri app wrapper (Terminal 2):
   ```bash
   cd src-tauri
   cargo run
   ```

---

## Project Architecture

Familiarize yourself with the layout before modifying code:
* **`src-tauri/`**: Rust backend.
  * [Cargo.toml](src-tauri/Cargo.toml): Dependency manifest.
  * [main.rs](src-tauri/src/main.rs): Minimal application entrypoint.
  * [lib.rs](src-tauri/src/lib.rs): Native commands, setup configurations, and window layout initialization.
  * [commands/](src-tauri/src/commands): Tauri commands representing operations such as staging, reset, merge, stash, and blame.
  * [git/](src-tauri/src/git): Underlying wrapper utilities interacting with `git2`/`libgit2` bindings.
  * Commands and logic are backed by `git2`/`libgit2` bindings for git operations, `tokio` for async runtime, `notify` for filesystem changes, and Tauri's updater plugin.
* **`src/`**: React frontend.
  * [main.tsx](src/main.tsx): React entrypoint.
  * [components](src/components): Shared visual components and views.
  * [lib/](src/lib): Shared utilities, helper constants, type definitions, and Tauri command bindings.
  * [styles](src/styles): Contains [theme.css](src/styles/theme.css) and [index.css](src/styles/index.css) defining design system variables and premium dark-mode styles.
  * [store](src/store): Zustand global state management stores.

---

## Coding Guidelines

### 🎨 Frontend & UI Style
* **Formatting & Linting**: We use **Biome** for code formatting, linting, and import sorting. Before committing, run `npm run lint:fix` or set up the Biome VS Code extension to automatically format your files on save.
* **Premium Aesthetics**: Basilico prioritizes visually stunning, premium dark-mode styling. Stick to the curated color palette and layout tokens defined in [theme.css](src/styles/theme.css).
* **Styling**: We use **Tailwind CSS v4** utility classes alongside standard CSS/Vanilla CSS custom variables for layout and visual styling. Maintain component purity and ensure component styling adheres strictly to our design tokens.
* **TypeScript & React**: Maintain strict type safety. Avoid using `any`. Write modern React functional components with hooks. Wrap error-prone visual component mounts in the custom React `ErrorBoundary` component to provide a fallback recovery UI instead of crashing the entire application.
* **State Management**: Use domain-specific loading states (`loadingStates`) defined in the Zustand `repo-store` rather than a global `isLoading` flag to prevent concurrent operations from clobbering each other.
* **Error Handling & Validation**: Use `validateBranchName` for branch creation input validation, and wrap Tauri command error results in `friendlyErrorMessage` before showing them to the user.

### 🦀 Rust Backend Style
* Follow standard idiomatic Rust styling guidelines.
* Avoid using `.unwrap()` on `Option` or `Result` types. Properly propagate errors using Tauri-compatible error structures (such as [error.rs](src-tauri/src/error.rs)).
* Use `parking_lot` primitives for synchronization instead of standard library mutexes when appropriate to avoid blocking async contexts.
* **Non-Blocking Operations**: Never execute synchronous, CPU-intensive, or blocking IO/Git actions (like heavy `git2` revision walks or diff parses) directly inside the main async Tauri commands. Always offload them using `tokio::task::spawn_blocking` to avoid stalling the async executor and the client UI thread.
* **Security & Path Validation**: Always perform path validation via `crate::git::utils::validate_path` on user-provided file paths or patch deltas in commands (such as submodules, worktrees, or patch applications) to prevent directory traversal vulnerabilities.

---

## Submitting a Pull Request

Before submitting a Pull Request, please run these local checks to ensure they pass CI:

### Pre-submission Checklist

1. **Version Consistency Check**:
   Ensure that the `version` field in [package.json](package.json) matches the `version` field in [tauri.conf.json](src-tauri/tauri.conf.json).
2. **Frontend Quality & Formatting**:
   Ensure all files are formatted and linted properly using Biome:
   ```bash
   npm run lint
   ```
   To automatically format and apply safe fixes:
   ```bash
   npm run lint:fix
   ```
   Verify frontend unit tests pass successfully:
   ```bash
   npx vitest run
   ```
   Verify the frontend builds and typechecks without errors:
   ```bash
   npm run build
   ```
3. **Rust Code Quality & Formatting**:
   Ensure Rust formatting is consistent:
   ```bash
   cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
   ```
   Run clippy lints to catch potential errors:
   ```bash
   cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
   ```
4. **Rust Tests**:
   Ensure all unit tests pass:
   ```bash
   cargo test --manifest-path src-tauri/Cargo.toml
   ```

### Creating the PR

* Keep your PR focused on a single concern/issue.
* Write a clear description of the changes using the template in [PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE/PULL_REQUEST_TEMPLATE.md).
* Link any relevant issues (e.g. `Fixes #123`).

---

Happy coding! 🌿
