#!/usr/bin/env bash
set -euo pipefail
mkdir -p /workspace /results
# Copy the dirty working tree without modifying host dependencies or Git data.
tar -C /source --exclude='./.git' --exclude='./node_modules' --exclude='./src-tauri/target' --exclude='./dist' --exclude='./coverage' --exclude='./test-results' -cf - . | tar -C /workspace -xf -
cd /workspace
pnpm install --frozen-lockfile --store-dir /linux-pnpm-store > /results/install.log 2>&1
pnpm lint > /results/lint.log 2>&1
pnpm typecheck > /results/typecheck.log 2>&1
pnpm test:coverage > /results/frontend.log 2>&1
# Preserve coverage even when a later native check fails.
cp coverage/coverage-summary.json /results/coverage-summary.json
cargo test --locked --manifest-path src-tauri/Cargo.toml -- --test-threads=2 > /results/rust.log 2>&1
dbus-run-session -- bash -c 'printf "\n" | gnome-keyring-daemon --unlock --components=secrets > /results/keyring-daemon.log; cargo test --locked --manifest-path src-tauri/Cargo.toml --test native_credentials_test -- --ignored > /results/credentials.log 2>&1'
cargo test --locked --release --manifest-path tests/desktop/glib-check/Cargo.toml > /results/glib-optimized.log 2>&1
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings > /results/clippy.log 2>&1
pnpm tauri build --debug --no-bundle --config tests/desktop/tauri.linux.conf.json > /results/build.log 2>&1
BASILICO_SMOKE_OUTPUT=/results/screenshots WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1 dbus-run-session -- xvfb-run -a pnpm test:desktop /linux-target/debug/basilico > /results/desktop.log 2>&1
printf 'Linux frontend, Rust, native build and webview validation passed.\n'
