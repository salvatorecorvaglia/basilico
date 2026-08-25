# Basilico 🌿

**Fast, modern and beautiful Git GUI client**

**Basilico** is designed to provide a premium, visually stunning desktop experience for managing Git repositories. By pairing a high-performance Rust backend powered by `libgit2` bindings with a modern, highly responsive React frontend, Basilico offers lightning-fast operations, rich repository visualizations, and robust safety guarantees.

---

## ✨ Features

- **🚀 Push & Force-Push with Safety Guards**: Seamlessly push branches with dedicated right-click force-push options protected by danger confirmation dialogs.
- **📊 Beautiful Commit Graph & Topology Filters**: Visualize your project's commit history, branches, and tags with a fluid, theme-aware interactive timeline and topology filters.
- **🔄 Visual Interactive Rebase & Autosquash**: Squash, fixup, drop, reorder commits, or perform autosquashes (`fixup!`/`squash!`) with inline summary editing.
- **🔔 Automated Application Updater & Toast**: Integrated app updater (`UpdaterToast` & Zustand store) providing real-time release notifications, download progress, and binary relaunching.
- **👁️ Gitignore-Aware Repository Watcher**: High-efficiency, `.gitignore`-aware backend file watcher (`git2::is_path_ignored`) that avoids file watch limit exhaustion.
- **💻 Centralized Monaco Editor Integration**: Optimized Monaco setup (`monaco-setup.ts`) featuring local worker loading, syntax language registration, and dynamic theme synchronization.
- **🩺 Git Doctor Diagnostics**: Perform full health checks on repository status, SSH setup, OS watch limits, submodules, and environment configurations.
- **🔗 Forge Deep Links & Autolink Parsing**: Open commits, branches, lines, and issue references directly in GitHub, GitLab, Bitbucket, Azure DevOps, or Codeberg with safe URL protocol sanitization.
- **⚡ External IDE Integration & Keyboard Shortcuts**: Open repositories and files in external editors (VS Code, Cursor, Zed, etc.), match modular keybindings (`CmdOrCtrl+K`, `CmdOrCtrl+Shift+P`), and navigate commit lists using Vim keybindings (`j`/`k`).
- **🧹 Merged Branch Sweeper**: Detect and safely clean up merged branches across your local and remote repositories.
- **📝 Granular Line-Level Staging**: Stage and unstage individual hunks or specific lines of code directly from unified or side-by-side diff views.
- **🔏 GPG Signature Verification & Hardened Git Operations**: Check commit authenticity directly in the application with hardened GPG and Git CLI subprocess workflows.
- **🔒 SSH Host Key Verification**: Detects rotated or mismatched SSH host keys against your `known_hosts` file before connecting, guarding against man-in-the-middle attacks.
- **🧭 Git Bisect Wizard**: Quickly locate buggy commits with an intuitive step-by-step bisect flow.
- **⚔️ Conflict Resolution Workflow & Reflog Inspector**: Resolve merge/rebase conflicts with a dedicated `ConflictBanner` and side-based resolution controls, and inspect detailed repository reflog histories in real-time.
- **🌳 Worktrees & Submodules Modals**: Full visual modals for listing, adding, removing, locking/unlocking with custom reasons, and inspecting Git worktrees and submodules.
- **📦 Stash Inspector**: Create, list, apply, pop, and inspect stashes with line-by-line diff support.
- **⚡ Virtualized Staging Area**: Renders staged and unstaged file lists with row virtualization to stay smooth even on repositories with large changesets.
- **📂 Multi-Repository Management**: Quickly switch between open repositories, or clone/initialize repositories straight from the dashboard.
- **⚙️ Integrated Settings & Tools**: Generate and manage SSH keys, configure GitHub Personal Access Tokens (PATs), opt-in to GitHub CI status checks, and launch external merge/diff tools.

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

Run frontend unit and component test suites (UI components, state stores, keyboard shortcuts, autolink parsing, and reference validation under `tests/`) using Vitest:
```bash
pnpm test
```

Run backend Rust unit and integration test suites (`src-tauri/tests/`):
```bash
cd src-tauri && cargo test
```

### Formatting & Linting

We use Biome for formatting and linting frontend code with strict zero-warning enforcement (`--error-on-warnings`):
```bash
# Check code style and run linter (errors on warnings)
pnpm lint

# Format code automatically
pnpm format

# Run linter and apply safe auto-fixes
pnpm lint:fix
```

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