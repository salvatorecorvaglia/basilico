FROM node:26-bookworm-slim AS node
FROM rust:1.96-bookworm
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && npm install --global pnpm@12.23.0 \
 && apt-get update \
 && apt-get install -y --no-install-recommends python3 libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf webkit2gtk-driver xvfb xauth dbus-x11 gnome-keyring libsecret-tools \
 && rm -rf /var/lib/apt/lists/* \
 && cargo install tauri-driver --version 2.1.0 --locked --jobs 2
RUN rustup component add clippy rustfmt
WORKDIR /workspace
ENV CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=/linux-target
