# Basilico 🌿

**Fast, modern, and beautiful Git GUI client**

**Basilico** is designed to provide a premium, visually stunning desktop experience for managing Git repositories. By pairing a high-performance Rust backend powered by `libgit2` bindings with a modern, highly responsive React frontend, Basilico offers lightning-fast operations, rich repository visualizations, and robust safety guarantees.

---

## ✨ Features

- **📊 Beautiful Commit Graph & Topology Filters**: Visualize your project's commit history, branches, and tags with a fluid, theme-aware interactive timeline and topology filters.
- **🔄 Visual Interactive Rebase & Autosquash**: Squash, fixup, drop, reorder commits, or perform autosquashes (`fixup!`/`squash!`) with inline summary editing.
- **🩺 Git Doctor Diagnostics**: Perform full health checks on repository status, SSH setup, OS watch limits, submodules, and environment configurations.
- **🔗 Forge Deep Links & Autolink Parsing**: Open commits, branches, lines, and issue references directly in GitHub, GitLab, Bitbucket, Azure DevOps, or Codeberg.
- **⚡ External IDE Integration & Vim Navigation**: Open repositories and files in external editors (VS Code, Cursor, Zed, etc.) and navigate commit lists using Vim keybindings (`j`/`k`).
- **🧹 Merged Branch Sweeper**: Detect and safely clean up merged branches across your local and remote repositories.
- **📝 Granular Line-Level Staging**: Stage and unstage individual hunks or specific lines of code directly from unified or side-by-side diff views.
- **🔏 GPG Signature Verification**: Seamlessly check commit authenticity and view signatures directly in the application.
- **🧭 Git Bisect Wizard**: Quickly locate buggy commits with an intuitive step-by-step bisect flow.
- **🌳 Worktrees & Submodules Modals**: Full visual modals for listing, adding, removing, and inspecting Git worktrees and submodules.
- **📦 Stash Inspector**: Create, list, apply, pop, and inspect stashes with line-by-line diff support.
- **📂 Multi-Repository Management**: Quickly switch between open repositories, or clone/initialize repositories straight from the dashboard.
- **⚙️ Integrated Settings & Tools**: Generate and manage SSH keys, configure GitHub Personal Access Tokens (PATs), and launch external merge/diff tools.

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

Run frontend unit tests (components & Zustand stores) using Vitest:
```bash
pnpm test
```

Run backend Rust unit tests:
```bash
cd src-tauri && cargo test
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

Since pre-built release binaries may not be notarized with an Apple Developer certificate, macOS Gatekeeper may block the app or display a warning saying **`"Basilico" is damaged and can't be opened`** (*`"Basilico" è danneggiato e non può essere aperto`*).

To resolve this and allow Basilico to open:

1. **Remove Quarantine Attribute** (Recommended):
   Open Terminal and run:
   ```bash
   xattr -cr /Applications/Basilico.app
   ```
   *(If the app is in your Downloads folder, use `xattr -cr ~/Downloads/Basilico.app` instead).*

2. **Alternative (First Launch via Finder)**:
   - Locate `Basilico.app` in `Finder`.
   - Right-click (or Control-click) the application icon and choose **Open**.
   - Click **Open** in the confirmation dialog.

### Windows
If Windows SmartScreen blocks execution of unsigned binaries, click **More info** and then choose **Run anyway**.

---

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📜 Changelog

Detailed release history and version changes can be found in [CHANGELOG.md](CHANGELOG.md).

## 🔐 Security

If you discover a security vulnerability, please see our [Security Policy](SECURITY.md).

## 📝 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

---

**Author**: [Salvatore Corvaglia](https://github.com/salvatorecorvaglia)