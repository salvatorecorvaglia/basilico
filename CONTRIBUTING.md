# Contributing to Basilico 🌿

Thank you for your interest in contributing to **Basilico**! We are excited to build a fast, modern, and beautiful Git GUI client, and we welcome contributions of all kinds: bug fixes, new features, documentation improvements, design suggestions, and bug reports.

This document provides guidelines and instructions to help you get started with contributing to this repository.

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
We use **Biome** to format and lint our TypeScript, React, and CSS code. Ensure your code passes all Biome checks before submitting a PR.

- **Check Linting**: `pnpm lint`
- **Format Code**: `pnpm format`
- **Fix Linting Errors**: `pnpm lint:fix`

- Use **React 19** best practices (e.g., hooks, functional components, concurrent rendering features).
- Write type-safe TypeScript code. Avoid `any` types wherever possible.
- Use Tailwind CSS v4 class naming patterns, maintaining consistent layouts with our flexbox, grid, and spacing utilities.

### Rust Backend Standards
- Format your Rust code with `cargo fmt`.
- Ensure there are no warnings or errors reported by `cargo clippy`.
- Follow idiomatic Rust guidelines (explicit error handling, proper ownership and borrowing, avoidance of `unwrap()` in production-ready command handlers).
- Errors should be propagated to the frontend via the custom `Error` wrapper in `src-tauri/src/error.rs`.

---

## Testing Guidelines

Always verify that your changes do not break existing functionality:

- **Run Frontend Tests**:
  ```bash
  pnpm test
  ```
  We use **Vitest** and **React Testing Library** for frontend testing. If you are fixing a bug or adding a new feature, please add corresponding unit or integration tests under the relevant `__tests__` directory.

- **Run Backend Tests**:
  If you modify Rust files in `src-tauri`, run backend tests using:
  ```bash
  cd src-tauri
  cargo test
  ```

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
2. Make your code changes, and add corresponding tests if applicable.
3. Ensure formatting and linting pass (`pnpm format` and `pnpm lint`).
4. Ensure all unit tests pass (`pnpm test` and `cargo test`).
5. Push your branch to your fork on GitHub.
6. Open a Pull Request against the `main` branch of the original repository.
7. Provide a detailed summary of the changes in the PR description, referencing any relevant issues (e.g., `Closes #123`).
8. Respond to review comments and feedback in a timely manner.

---

Happy coding! 🌿