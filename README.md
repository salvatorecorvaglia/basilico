# Basilico 🌿

**A fast, modern, and beautiful Git GUI client.**

Basilico is designed to provide a premium, visually stunning desktop experience for managing Git repositories. By pairing a high-performance Rust backend powered by `libgit2` bindings with a modern, highly responsive React frontend, Basilico offers lightning-fast operations, rich repository visualizations, and robust safety guarantees.

---

## ✨ Features

- **📊 Visual Git Commit Graph**: An interactive, high-performance, canvas-based Directed Acyclic Graph (DAG) for visualizing repository history with $O(1)$ index caching and smooth animation-frame throttling.
- **🛠 Core Git Operations**: 
  - Effortless staging, committing, pushing, pulling, merging, and tagging.
  - Interactive stashing capabilities, complete with a dedicated `StashInspector` UI.
  - Soft, mixed, and hard modes for `git reset` via a custom `ResetModal` UI.
- **🔍 Advanced Inspection & Comparison**:
  - **Revision Compare**: Select and compare revisions, explore file trees, and view side-by-side or inline diffs.
  - **Git Blame**: An integrated blame view with detailed modification history tracking for individual lines.
  - **Conflict Resolver**: Interactive merge conflict resolution interface to handle conflicts quickly and safely.
- **📂 Workspace & Collaboration**:
  - Submodule and worktree management.
  - Secure SSH key generation options with comment sanitization.
  - A Pull Request review dashboard to streamline code reviews.
- **🎨 Premium Aesthetics**:
  - Standardized CSS color variables and theme accents using modern CSS `color-mix` functions.
  - Seamless Light/Dark theme configuration.
  - Fully accessible (a11y) interactive elements, input fields, and custom scroll containers.
- **🚀 Underlying Architecture**:
  - **Rust Backend**: Multithreaded command runner leveraging Rust `git2` bindings for maximum performance.
  - **State Management**: Highly optimized Zustand `repo-store` split into modular slices (`collaboration`, `git-data`, `settings`, `staging`, `tabs`).
  - **Watcher**: A live repository file system watcher using `notify` to automatically refresh application state on local edits.

---

## 📁 Repository Structure

Here is a high-level overview of the workspace layout:

- **[`src-tauri/`](file:///Users/salvatorecorvaglia/github/basilico/src-tauri)**: The native Rust backend.
  - **[`src/lib.rs`](file:///Users/salvatorecorvaglia/github/basilico/src-tauri/src/lib.rs)**: Defines native commands, setup configurations, and window layout initialization.
  - **[`Cargo.toml`](file:///Users/salvatorecorvaglia/github/basilico/src-tauri/Cargo.toml)**: Cargo dependency manifest, leveraging `git2` and `tokio`.
- **[`src/`](file:///Users/salvatorecorvaglia/github/basilico/src)**: The React and TypeScript frontend.
  - **[`src/components/`](file:///Users/salvatorecorvaglia/github/basilico/src/components)**: Core visual components (diff view, commit graph, modals, settings, staging, etc.).
  - **[`src/store/`](file:///Users/salvatorecorvaglia/github/basilico/src/store)**: State slices managed via Zustand.
  - **[`src/styles/`](file:///Users/salvatorecorvaglia/github/basilico/src/styles)**: Premium design-system variables (`theme.css` and `index.css`).
- **[`package.json`](file:///Users/salvatorecorvaglia/github/basilico/package.json)**: Node.js scripts and frontend/devDependencies configurations.
- **[`vite.config.ts`](file:///Users/salvatorecorvaglia/github/basilico/vite.config.ts)**: Configures the Vite dev server and bundler.

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
2. Install NPM dependencies:
   ```bash
   npm install
   ```

### Running the App

To start the Vite dev server and launch the Tauri native application window simultaneously:
```bash
npm run tauri dev
```

Alternatively, you can run the frontend and native wrapper in separate terminals:
- **Terminal 1 (Vite Dev Server)**:
  ```bash
  npm run dev
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
npm run lint
```

Auto-apply safe lint fixes and formatting:
```bash
npm run lint:fix
```

Auto-format all source files:
```bash
npm run format
```

Verify that the React frontend builds and typechecks without errors:
```bash
npm run build
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

---

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 🔐 Security

If you discover a security vulnerability, please see our [Security Policy](SECURITY.md).

## 📝 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

---

**Author**: [Salvatore Corvaglia](https://github.com/salvatorecorvaglia)
