# Basilico 🌿

**A fast, modern, and beautiful Git GUI client.**

Basilico is designed to provide a premium, visually stunning desktop experience for managing Git repositories. By pairing a high-performance Rust backend powered by `libgit2` bindings with a modern, highly responsive React frontend, Basilico offers lightning-fast operations, rich repository visualizations, and robust safety guarantees.

---

## ✨ Features

- **🛠 Core Git Operations**: 
  - Effortless staging, committing, pushing, pulling, merging, tagging, cherry-picking, and reverting commits.
  - **Granular Line Staging**: Line-level staging and unstaging directly from the side-by-side or unified diff views.
  - **Drag-and-Drop Branch Resetting**: Drag-and-drop actions on the commit graph timeline to reset the current branch to a target commit.
  - **Repository Initialization & Cloning**: Directly initialize new git repositories or clone remote repositories from the Welcome Screen.
  - Interactive stashing capabilities, complete with a dedicated `StashInspector` UI supporting untracked file diffs.
  - Soft, mixed, and hard modes for `git reset` via a custom `ResetModal` UI.
  - Client-side branch, tag, and reference validation/sanitization matching standard Git specifications before creation.
  - **Remote Branch Deletion**: Delete remote branches by pushing specs directly to the remote repository.
  - **Advanced Interactive Rebase**: Interactive rebase support including squash, fixup, and drop operations in both the UI and Rust backend, running in an automated multi-step execution loop.
  - **Initial Commit Support for Signed Commits**: Resolve the symbolic target of `HEAD` and initialize empty repositories with a signed commit.
- **🔍 Advanced Inspection & Comparison**:
  - **Reflog Inspector**: A complete reflog inspector view with terminal-like output to view Git ref updates and commit/checkout history.
  - **Revision Compare**: Select and compare revisions, explore file trees, and view side-by-side or inline diffs with integrated line number displays.
  - **Git Blame**: An integrated blame view with detailed modification history tracking for individual lines.
  - **Conflict Resolver**: Interactive merge conflict resolution interface to handle conflicts quickly and safely.
  - **Git Bisect**: Interactive Git Bisect wizard to isolate bug-introducing commits with mark options (`good`/`bad`/`skip`), featuring a dedicated "Exit Bisect" button to reset the backend state.
  - **GPG Commit Signatures**: Verify commit signatures, displaying signer identity, key ID, and validation status (Verified, Bad Signature, Unknown Key, etc.).
  - **History & Code Search**: Filter repository commit history by message or author, and run fast codebase text searches via integrated `git grep`.
- **📂 Workspace & Collaboration**:
  - **Recent Repositories Dashboard**: A dashboard of recently opened repositories with timestamps on a modernized welcome screen layout.
  - **External Tools Integration**: Settings and execution integration for external merge and diff tools.
  - **Extended User Settings**: Added configurations for GitHub Personal Access Tokens (PAT), Gemini API keys, issue autolink patterns, and git hook bypasses.
  - Submodule and worktree management with built-in path traversal security checks.
  - Secure SSH key generation options with comment sanitization.
  - Automated Git author configuration check before commit creation.
  - **Repository Session Persistence**: Persist open repository tabs and the active repository path across application sessions using `localStorage`, restoring them automatically on startup.
- **🎨 Premium Aesthetics & UI**:
  - Unified design system utilizing **Tailwind CSS v4** and modern CSS custom variables.
  - **Early Theme Loader**: An early-loading script (`theme-loader.js`) that reads and applies user theme preferences immediately on app startup, eliminating visual flashes.
  - Curated, dynamic accent theme presets (Sage Green, Royal Blue, Amethyst Purple, Amber Gold, Crimson Red, Ocean Teal) with dark/light variants.
  - **Theme-Aware Commit Graph**: Beautiful commit graph rendering that automatically updates to match the current accent theme and light/dark modes.
  - Modular sidebar navigation trees (`BranchTree`, `RemoteTree`, `TagTree`, `StashTree`, `SubmoduleTree`, `WorktreeTree`) with rich custom context actions.
  - **Radix UI Accessibility**: Fully accessible overlays, context menus, and navigation tabs with robust keyboard navigation, ARIA roles, and focus styling.
  - Raycast/Cursor inspired Command Palette for keyboard-driven navigation.
  - Dynamic dark/light Monaco Diff Editor integrations syncing with active theme presets and system color schemes in real-time.
  - **Fault Tolerance**: Dedicated panel-level error boundaries (`PanelErrorBoundary`) and a root React `ErrorBoundary` that gracefully handle runtime exceptions with a recovery UI.
- **🚀 Underlying Architecture**:
  - **Rust Backend**: Multithreaded command runner leveraging Rust `git2` bindings for maximum performance, with heavy or blocking Git operations offloaded to asynchronous Tokio tasks (`tokio::task::spawn_blocking`) to keep the UI thread completely stall-free.
  - **State Management & Caching**: Highly optimized Zustand `repo-store` split into modular slices (`collaboration`, `git-data`, `settings`, `staging`, `tabs`) using a granular, domain-specific `loadingStates` tracker. Application settings are cached in-memory in the Rust `AppState` to eliminate redundant disk reads on Git command invocations.
  - **Optimized File Watcher**: A live repository file system watcher that watches the root directory non-recursively, `.git` recursively, and top-level subdirectories selectively (ignoring build artifacts and dependencies) to avoid reaching file watch limits.
  - **Commit Tree & Merge Tool Performance**: Optimized `get_commit_tree` by skipping blob size checks when listing directory contents, and implemented a delayed external merge tool temporary directory cleanup to keep staging files alive.
  - **Error Mapping**: Automated translation of raw Git/Rust CLI error outputs to user-friendly actionable feedback notifications.
  - **Auto-Updater**: Seamless integration with Tauri's native updater, pointing to GitHub releases JSON to check for production updates with custom progress toast notifications and application restart support.
  - **Subprocess Hardening**: Thread-safe, hardened command-line subprocess execution with robust error isolation for Git helper operations (such as `bisect` and `gpg`), running pre-commit hooks via `git hook run pre-commit` for improved error propagation.
  - **Windows Git Credential Helper**: Custom credential helper resolution and execution logic in the Rust backend on Windows, allowing secure retrieval of HTTPS credentials without flashing terminal windows.

---

## 📁 Repository Structure

Here is a high-level overview of the workspace layout:

- **[`src-tauri/`](src-tauri)**: The native Rust backend.
  - **[`src/lib.rs`](src-tauri/src/lib.rs)**: Defines native commands, setup configurations, and window layout initialization.
  - **[`Cargo.toml`](src-tauri/Cargo.toml)**: Cargo dependency manifest, leveraging `git2` and `tokio`.
- **[`src/`](src)**: The React and TypeScript frontend.
  - **[`src/components/`](src/components)**: Core visual components (diff view, commit graph, modals, settings, staging, etc.).
  - **[`src/lib/`](src/lib)**: Shared utility helpers, API types, and Tauri command wrappers.
  - **[`src/store/`](src/store)**: State slices managed via Zustand.
  - **[`src/styles/`](src/styles)**: Premium design-system variables (`theme.css` and `index.css`).
- **[`package.json`](package.json)**: Node.js scripts and frontend/devDependencies configurations.
- **[`vite.config.ts`](vite.config.ts)**: Configures the Vite dev server and bundler.

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed:
- **Node.js** (v22 or higher recommended; v18 minimum)
- **Rust Toolchain** (via [rustup](https://rustup.rs/))
- **System dependencies** required for Tauri development (see the [Tauri Prerequisites Guide](https://v2.tauri.app/start/prerequisites/))

### Installation & Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/salvatorecorvaglia/basilico.git
   cd basilico
   ```
2. Install pnpm dependencies:
   ```bash
   pnpm install
   ```

### Running the App

To start the Vite dev server and launch the Tauri native application window simultaneously:
```bash
pnpm tauri dev
```

Alternatively, you can run the frontend and native wrapper in separate terminals:
- **Terminal 1 (Vite Dev Server)**:
  ```bash
  pnpm dev
  ```
- **Terminal 2 (Tauri Wrapper)**:
  ```bash
  cd src-tauri
  cargo run
  ```

---

## 🧪 Testing and Verification

To ensure code quality and stability, run the local verification suite:

### Frontend
Run the Biome linter check:
```bash
pnpm run lint
```

Auto-apply safe lint fixes and formatting:
```bash
pnpm run lint:fix
```

Auto-format all source files:
```bash
pnpm run format
```

Run frontend unit tests:
```bash
pnpm vitest run
```

Verify that the React frontend builds and typechecks without errors:
```bash
pnpm run build
```

### Backend (Rust)
Run the Rust unit and integration test suites:
```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Format checking:
```bash
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
```

Linter checks:
```bash
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
```

## 📦 Production Builds & Installation Notes

Since these builds are signed with self-generated credentials or built on public runner systems without official developer licenses, your operating system might show security warnings:

### macOS ("App is damaged and can't be opened")
This is macOS Gatekeeper protecting your system from unsigned apps. To run Basilico:
1. Move `Basilico.app` to your `/Applications` directory.
2. Open your terminal and run:
   ```bash
   xattr -cr /Applications/Basilico.app
   ```
3. Launch the app normally.

### Windows (SmartScreen / Startup Issues)
1. **Windows SmartScreen**: Click **"More Info"** -> **"Run anyway"**.
2. **Missing WebView2 Runtime**: Basilico requires the Microsoft WebView2 Runtime. If you are on an older Windows version and the application fails to load, download and install the [Evergreen Bootstrapper from Microsoft](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).

---

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 🔐 Security

If you discover a security vulnerability, please see our [Security Policy](SECURITY.md).

## 📝 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

---

**Author**: [Salvatore Corvaglia](https://github.com/salvatorecorvaglia)
