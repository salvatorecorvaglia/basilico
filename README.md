# Basilico 🌿

**A fast, modern, and beautiful Git GUI client.**

Basilico is designed to provide a premium, visually stunning desktop experience for managing Git repositories. By pairing a high-performance Rust backend powered by `libgit2` bindings with a modern, highly responsive React frontend, Basilico offers lightning-fast operations, rich repository visualizations, and robust safety guarantees.

---

## ✨ Features

- **📊 Beautiful Commit Graph**: Visualize your project's commit history, branches, and tags with a fluid, theme-aware interactive timeline.
- **🔄 Interactive Rebase**: Squash, fixup, drop, or reorder commits easily through a streamlined visual interface.
- **📝 Granular Line-Level Staging**: Stage and unstage individual hunks or even specific lines of code directly from unified or side-by-side diff views.
- **🔏 GPG Signature Verification**: Seamlessly check commit authenticity and view signatures directly in the application.
- **🧭 Git Bisect Wizard**: Quickly find buggy commits with an intuitive step-by-step bisect flow.
- **📂 Multi-Repository Management**: Quickly switch between open repositories, or clone/initialize repositories straight from the modernized dashboard.
- **⚡ Fast Directory Watching**: Highly optimized file watcher handles large repositories gracefully without exceeding OS watch limits.
- **⚙️ Integrated Settings & Tools**: Generate and manage SSH keys, configure GitHub Personal Access Tokens (PATs), configure your Gemini API keys for AI tasks, and launch external merge/diff tools.
- **🌳 Worktrees & Submodules**: Full support for listing, adding, and pruning Git worktrees and submodules.
- **📦 Stash Inspector**: Create, list, apply, pop, and inspect stashes with line-by-line diff support.

---

## 🚀 Getting Started

### Prerequisites

To build Basilico from source, you will need the following tools installed on your system:

1. **Node.js** (v18 or higher recommended)
2. **pnpm** (fast, disk-efficient package manager)
3. **Rust** toolchain (Rustup, cargo, compiler)
4. System dependencies for Tauri compilation (refer to the [Tauri v2 Setup Guide](https://v2.tauri.app/start/prerequisites/) for your operating system).

### Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/salvatorecorvaglia/basilico.git
   cd basilico
   ```

2. **Install frontend dependencies**:
   ```bash
   pnpm install
   ```

3. **Start the development server**:
   ```bash
   pnpm tauri dev
   ```
   This will run Vite in the background and open the Tauri application window with hot reloading and developer tools enabled.

### Testing

Run frontend unit tests using Vitest:
```bash
pnpm test
```

### Formatting & Linting

We use Biome for formatting and linting frontend code:
```bash
# Check code style and run linter
pnpm lint

# Format code automatically
pnpm format

# Run linter and apply safe auto-fixes
pnpm lint:fix
```

### Production Build

To compile a production bundle and generate installers:
```bash
pnpm tauri build
```
The compiled binaries will be outputted to `src-tauri/target/release/` or wrapped inside OS-specific installer formats under `src-tauri/target/release/bundle/`.

---

## 💻 Platform-Specific Installation Notes

### macOS
If you run into Gatekeeper warnings when launching the built app (since the release binary might not be code-signed locally):
1. Locate the app in `Finder`.
2. Right-click (or Control-click) the application icon and choose **Open**.
3. Click **Open** in the confirmation dialog.

### Windows
If Windows SmartScreen blocks execution of unsigned binaries, click **More info** and then choose **Run anyway**.

---

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 🔐 Security

If you discover a security vulnerability, please see our [Security Policy](SECURITY.md).

## 📝 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

---

**Author**: [Salvatore Corvaglia](https://github.com/salvatorecorvaglia)