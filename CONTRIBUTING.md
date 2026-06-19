# Contributing to Basilico 🌿

Thank you for your interest in contributing to **Basilico**! We are building a fast, modern, and beautiful Git client, and we welcome contributions of all kinds: bug fixes, feature implementations, documentation improvements, and bug reports.

This document guides you through the process of setting up your development environment and submitting changes.

---

## 🤝 Code of Conduct

We want to foster a welcoming, collaborative, and inclusive environment. By participating in this project, you agree to:
- Be respectful and considerate of other contributors.
- Focus on what is best for the community.
- Gracefully accept constructive criticism.

---

## 🛠️ Development Setup

Basilico is a hybrid desktop application built with **Tauri 2**, **Rust**, **React 19**, and **TypeScript**.

### Prerequisites

To build and run the project, ensure you have the following installed:
1. **Node.js** (v18 or higher) & **npm** (included with Node.js)
2. **Rust toolchain** (via [rustup](https://rustup.rs/))
3. **Platform-specific Tauri dependencies**:
   - **macOS**: Xcode Command Line Tools (`xcode-select --install`).
   - **Windows**: Microsoft Visual Studio C++ Build Tools (see [Tauri Windows Setup Guide](https://tauri.app/v2/guides/prerequisites/)).
   - **Linux**: System libraries such as `libwebkit2gtk`, `libappindicator`, and `librsvg` (see [Tauri Linux Setup Guide](https://tauri.app/v2/guides/prerequisites/)).

### Running the App

1. **Clone the repository:**
   ```bash
   git clone https://github.com/salvatorecorvaglia/basilico.git
   cd basilico
   ```

2. **Install frontend dependencies:**
   ```bash
   npm install
   ```

3. **Start in Development Mode:**
   To run the application in a single terminal (Vite frontend and Tauri native wrapper together):
   ```bash
   npm run tauri dev
   ```

   Alternatively, you can run them separately in two terminal split sessions:
   - **Terminal 1 (Frontend Dev Server):**
     ```bash
     npm run dev
     ```
   - **Terminal 2 (Tauri Rust App):**
     ```bash
     cd src-tauri && cargo run
     ```

---

## 📂 Project Structure

A quick overview of where things live:
- `src-tauri/` — Rust backend (Tauri commands, custom Git integration via `git2`, watchers, configurations).
- `src/` — React frontend.
  - `src/components/` — UI components (Commit graph, diff explorer, panels, modals).
  - `src/store/` — Zustand state management (`repo-store.ts`, `ui-store.ts`).
  - `src/index.css` — Global styling and tailormade visual themes.

---

## 🌿 Contribution Workflow

### 1. Find or Create an Issue
Before writing code, please check existing issues or open a new one to discuss your proposed changes. We have templates for:
- 🐛 **Bug Report**
- ✨ **Feature Request**
- 🛠️ **Task / Improvement**

### 2. Create a Branch
Use a descriptive branch name from the `main` branch:
- `feat/feature-name` — for new features.
- `fix/bug-name` — for bug fixes.
- `docs/doc-name` — for documentation updates.
- `refactor/refactor-name` — for code restructuring.
- `chore/chore-name` — for minor tooling changes.

### 3. Code Standards & Linting

We run strict automated checks on every pull request. Ensure your changes pass local checks:

#### Frontend (React / TypeScript)
- Check compilation and run typescript checks:
  ```bash
  npm run build
  ```
- Make sure there are no lint or type-check errors in the IDE before committing.

#### Backend (Rust)
- Format your code:
  ```bash
  cargo fmt --manifest-path src-tauri/Cargo.toml --all
  ```
- Lint your code using Clippy:
  ```bash
  cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
  ```
- Run tests:
  ```bash
  cargo test --manifest-path src-tauri/Cargo.toml
  ```

---

## 💬 Commit Messages

We recommend following the **Conventional Commits** specification:
```text
<type>(<scope>): <description>

[optional body]
```

Common types:
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation-only changes
- `style`: Changes that do not affect the meaning of the code (formatting, white-space, etc.)
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process, auxiliary tools, or libraries

Example:
`feat(graph): add O(1) index caching to optimize canvas rendering`

---

## 🚀 Submitting a Pull Request

1. **Push your branch** to your fork or the repository.
2. **Open a Pull Request** against the `main` branch.
3. **Fill out the Pull Request Template** in detail. Make sure to:
   - Provide a clear summary of the changes.
   - Link the relevant issue (e.g., `Fixes #123`).
   - Describe how the changes were tested (manual/unit tests).
4. **Ensure CI passes**. Once the PR is opened, GitHub Actions will automatically run:
   - Frontend compilation and build checks.
   - Rust formatting verification (`cargo fmt --check`).
   - Rust clippy lint analysis and unit testing.

We will review your pull request as soon as possible. Thank you for contributing to Basilico!
