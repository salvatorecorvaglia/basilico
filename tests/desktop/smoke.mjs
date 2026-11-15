// Real native webview + real IPC + disposable Git repositories. No command mocks.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const embedded = process.platform === "darwin";
if (!["linux", "darwin"].includes(process.platform)) {
  throw new Error(
    "This harness supports Linux WebKitWebDriver and the macOS desktop-tests build.",
  );
}
const binary = resolve(
  process.argv[2] ||
    (embedded
      ? "src-tauri/target/debug/basilico"
      : "src-tauri/target/release/basilico"),
);
assert.ok(existsSync(binary), `Build the native application first: ${binary}`);
async function unusedPort() {
  const server = createServer();
  await new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", done);
  });
  const port = server.address().port;
  await new Promise((done, fail) =>
    server.close((error) => (error ? fail(error) : done())),
  );
  return port;
}
const port = await unusedPort();
let nativePort = await unusedPort();
while (nativePort === port) nativePort = await unusedPort();
const output = resolve(
  process.env.BASILICO_SMOKE_OUTPUT || "test-results/desktop",
);
mkdirSync(output, { recursive: true });
const fixture = mkdtempSync(join(tmpdir(), "basilico-desktop-"));
const driverLog = [];
let session;
let driver;
let signal;
const elementKey = "element-6066-11e4-a52e-4f735466cecf";
const base = `http://127.0.0.1:${port}`;
function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: join(fixture, "no-global-config"),
    },
  }).trim();
}
function repository(name) {
  const path = join(fixture, name);
  mkdirSync(path);
  git(path, "init", "--initial-branch=main");
  git(path, "config", "user.name", "Native Test");
  git(path, "config", "user.email", "native@example.invalid");
  git(path, "config", "commit.gpgsign", "false");
  git(path, "config", "core.autocrlf", "false");
  writeFileSync(
    join(path, "source.txt"),
    `${Array.from({ length: 2000 }, (_, n) =>
      n === 1499 ? "needle at line 1500" : `source line ${n + 1}`,
    ).join("\n")}\n`,
  );
  writeFileSync(
    join(path, "partial.txt"),
    `${Array.from({ length: 30 }, (_, n) => `line ${n + 1}`).join("\n")}\n`,
  );
  git(path, "add", "--", "source.txt", "partial.txt");
  git(path, "commit", "-m", `Native fixture ${name}`);
  return path;
}
async function request(method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await response.json();
  if (!response.ok || data.value?.error)
    throw new Error(`${method} ${path}: ${JSON.stringify(data.value)}`);
  return data.value;
}
function command(method, path, body) {
  return request(method, `/session/${session}${path}`, body);
}
function evaluate(script, args = []) {
  return command("POST", "/execute/sync", { script, args });
}
async function until(label, check, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    if (signal) throw new Error(`Interrupted by ${signal}`);
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    if (driver && (driver.exitCode !== null || driver.signalCode !== null))
      throw new Error(
        `Native driver exited: ${driver.exitCode ?? driver.signalCode}`,
      );
    await delay(150);
  }
  throw new Error(`Timed out: ${label}${last ? ` (${last.message})` : ""}`);
}
async function element(selector, using = "css selector") {
  return until(
    selector,
    async () =>
      (
        await command("POST", "/element", {
          using,
          value: selector,
        })
      )[elementKey],
  );
}
async function click(selector, using = "css selector") {
  return command(
    "POST",
    `/element/${await element(selector, using)}/click`,
    {},
  );
}
async function focusInput(selector) {
  // Staging/amend refreshes temporarily disable the controlled inputs. WKWebView
  // needs an explicit click once enabled before it can accept keyboard events.
  return until(`enabled and focused input: ${selector}`, async () => {
    const id = await element(selector);
    if (!(await command("GET", `/element/${id}/enabled`))) return false;
    await command("POST", `/element/${id}/click`, {});
    const focused = await evaluate(
      "return document.activeElement === arguments[0] && !arguments[0].disabled",
      [{ [elementKey]: id }],
    );
    return focused && id;
  });
}
async function submitCommit(label) {
  // Watcher/staging refreshes can disable the button between WebDriver's
  // enabled check and its click. Retry only until a real form submit arrives;
  // once dispatched, a slow or failed commit must fail the persistence check.
  await evaluate(`
    window.__nativeCommitSubmitted = false;
    document.querySelector('.commit-box').addEventListener('submit', () => {
      window.__nativeCommitSubmitted = true;
    }, { once: true });
  `);
  await until(`${label} form submitted`, async () => {
    if (await evaluate("return window.__nativeCommitSubmitted")) return true;
    const id = await element(".commit-submit-btn");
    if (!(await command("GET", `/element/${id}/enabled`))) return false;
    await command("POST", `/element/${id}/click`, {});
    return evaluate("return window.__nativeCommitSubmitted");
  });
}
async function palette() {
  // Style reads flush layout even when an unfocused WKWebView throttles RAF.
  return evaluate(
    "return {scheme: getComputedStyle(document.documentElement).colorScheme, preference: document.documentElement.getAttribute('data-color-scheme'), background: getComputedStyle(document.querySelector('.blame-view')).backgroundColor, color: getComputedStyle(document.querySelector('.blame-view')).color, supports: CSS.supports('color', 'light-dark(white, black)'), scale: window.devicePixelRatio}",
  );
}

async function screenshot(name) {
  const png = await command("GET", "/screenshot");
  writeFileSync(join(output, `${name}.png`), Buffer.from(png, "base64"));
}
// Calls Tauri's actual native bridge, including its argument decoder.
async function invoke(name, args) {
  const result = await command("POST", "/execute/async", {
    script:
      "const done = arguments[arguments.length - 1]; window.__TAURI_INTERNALS__.invoke(arguments[0], arguments[1]).then(value => done({value}), error => done({error}));",
    args: [name, args],
  });
  assert.ok(!result.error, `${name}: ${JSON.stringify(result.error)}`);
  return result.value;
}
for (const name of ["SIGINT", "SIGTERM"])
  process.once(name, () => {
    signal = name;
  });

try {
  const a = repository("repo-a"),
    b = repository("repo-b");
  driver = spawn(
    embedded ? binary : "tauri-driver",
    embedded
      ? []
      : ["--port", String(port), "--native-port", String(nativePort)],
    {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        TAURI_WEBDRIVER_PORT: String(port),
        XDG_CONFIG_HOME: join(fixture, "config"),
        XDG_DATA_HOME: join(fixture, "data"),
        XDG_CACHE_HOME: join(fixture, "cache"),
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: join(fixture, "no-global-config"),
      },
    },
  );
  driver.on("error", (error) => {
    driverLog.push(String(error));
  });
  driver.on("exit", (code, signal) => {
    driverLog.push(`Native driver exit: code=${code}, signal=${signal}\n`);
  });
  for (const stream of [driver.stdout, driver.stderr])
    stream.on("data", (chunk) => {
      if (driverLog.join("").length < 1024 * 1024)
        driverLog.push(chunk.toString());
    });
  await until("WebDriver server", () => request("GET", "/status"), 90_000);
  const started = await request("POST", "/session", {
    capabilities: { alwaysMatch: { "tauri:options": { application: binary } } },
  });
  session = started.sessionId;
  assert.ok(session, "WebDriver must return a session id");
  await command("POST", "/timeouts", {
    script: 30_000,
    implicit: 0,
    pageLoad: 30_000,
  });
  await until("Tauri IPC bridge", () =>
    evaluate("return !!window.__TAURI_INTERNALS__?.invoke"),
  );
  await evaluate(
    "localStorage.setItem('basilico-open-repos', JSON.stringify(arguments[0])); localStorage.setItem('basilico-active-repo', arguments[0][0]); localStorage.setItem('basilico-color-scheme', 'light');",
    [[a, b]],
  );
  await command("POST", "/refresh", {});
  await element('[role="tab"][aria-label="repo-a"][aria-selected="true"]');
  await until("restored repository history", () =>
    evaluate(
      "return document.body.textContent.includes('Native fixture repo-a')",
    ),
  );

  // Switch tabs through the visible UI, then verify the corresponding history.
  await click('[role="tab"][aria-label="repo-b"]');
  await until("repository B history", () =>
    evaluate(
      "return document.body.textContent.includes('Native fixture repo-b')",
    ),
  );
  await click('[role="tab"][aria-label="repo-a"]');
  await element('[role="tab"][aria-label="repo-a"][aria-selected="true"]');
  await click('[aria-label="Search repository"]');
  await click(".search-tab-btn:nth-child(2)");
  const input = await element('[aria-label="Search working-tree code"]');
  await command("POST", `/element/${input}/value`, { text: "needle" });
  await click('.search-input-wrapper button[type="submit"]');
  await click(".grep-result");
  await until("matching working-tree blame row", () =>
    evaluate(
      "return document.querySelector('.blame-line-target')?.textContent.includes('needle at line 1500')",
    ),
  );
  assert.ok(
    await evaluate(
      "return document.querySelectorAll('.blame-line-row').length < 100",
    ),
    "Blame must render a bounded number of rows",
  );
  assert.equal(
    await evaluate(
      "return getComputedStyle(document.documentElement).colorScheme",
    ),
    "light",
  );
  const lightPalette = await palette();
  writeFileSync(
    join(output, "light-palette.json"),
    JSON.stringify(lightPalette, null, 2),
  );
  await screenshot("light-blame");
  // Use the actual preference action, including Monaco/theme synchronization.
  await click('button[aria-label^="Color scheme:"]');
  // WKWebView can report the root's new color-scheme before descendants
  // reflect the updated custom properties. Wait for the rendered surface too;
  // a broken palette must still fail rather than passing on the root alone.
  const darkPalette = await until("rendered dark palette", async () => {
    const rendered = await palette();
    return (
      rendered.scheme === "dark" &&
      rendered.preference === "dark" &&
      rendered.background !== lightPalette.background &&
      rendered.color !== lightPalette.color &&
      rendered
    );
  });
  writeFileSync(
    join(output, "dark-palette.json"),
    JSON.stringify(darkPalette, null, 2),
  );
  assert.notEqual(
    lightPalette.background,
    darkPalette.background,
    "Rendered light and dark backgrounds must differ",
  );
  await screenshot("dark-blame");

  // Exercise the real editor worker, keyboard-accessible hunk staging and
  // commit/amend controls rather than relying only on command-level tests.
  await evaluate(
    "window.__nativeWorkerChecks = {created: 0, errors: []}; const OriginalWorker = window.Worker; window.Worker = class extends OriginalWorker { constructor(...args) { super(...args); window.__nativeWorkerChecks.created++; this.addEventListener('error', event => window.__nativeWorkerChecks.errors.push(event.message || 'worker error')); } };",
  );
  const partial = `${Array.from({ length: 30 }, (_, n) =>
    n === 1
      ? "first edited line"
      : n === 24
        ? "second edited line"
        : `line ${n + 1}`,
  ).join("\n")}\n`;
  writeFileSync(join(a, "partial.txt"), partial);
  await click(".toolbar-segment-btn:nth-child(2)");
  await click(
    "//div[contains(@class,'staging-file-row')][.//span[@class='file-name' and text()='partial.txt']]",
    "xpath",
  );
  await element(".monaco-diff-editor");
  await until("bundled Monaco editor worker started", () =>
    evaluate("return window.__nativeWorkerChecks.created > 0"),
  );
  await screenshot("native-monaco");
  await click(".diff-control-btn:nth-child(2)");
  await until("two separate hunks", () =>
    evaluate(
      "return document.querySelectorAll('.diff-hunk-card').length === 2",
    ),
  );
  await click(".diff-hunk-card:first-child .hunk-btn");
  await until("first hunk staged", () =>
    git(a, "diff", "--cached", "--", "partial.txt").includes(
      "first edited line",
    ),
  );
  assert.ok(!git(a, "show", ":partial.txt").includes("second edited line"));
  const summary = await focusInput(".commit-summary-input");
  await command("POST", `/element/${summary}/value`, {
    text: "Native partial commit",
  });
  assert.equal(
    await command("GET", `/element/${summary}/property/value`),
    "Native partial commit",
  );
  await submitCommit("commit");
  await until(
    "partial commit persisted",
    () => git(a, "log", "-1", "--format=%s") === "Native partial commit",
  );
  assert.ok(!git(a, "show", "HEAD:partial.txt").includes("second edited line"));
  assert.equal(readFileSync(join(a, "partial.txt"), "utf8"), partial);
  await click(".commit-amend-label input");
  await until(
    "amend snapshot loaded",
    async () =>
      (await command(
        "GET",
        `/element/${await element(".commit-summary-input")}/property/value`,
      )) === "Native partial commit",
  );
  const amendSummary = await focusInput(".commit-summary-input");
  // WebKit's element-clear can leave React's controlled value unchanged and
  // the next keystrokes append to the old title. Replace it through keyboard
  // events so the browser and React observe the same edit.
  await command("POST", `/element/${amendSummary}/value`, {
    text: `${embedded ? "\uE03D" : "\uE009"}a\uE000\uE003`,
  });
  await command("POST", `/element/${amendSummary}/value`, {
    text: "Native amended commit",
  });
  assert.equal(
    await command("GET", `/element/${amendSummary}/property/value`),
    "Native amended commit",
  );
  await submitCommit("amend");
  await until(
    "amended commit persisted",
    () => git(a, "log", "-1", "--format=%s") === "Native amended commit",
  );
  assert.equal(git(a, "rev-list", "--count", "HEAD"), "2");
  assert.equal(readFileSync(join(a, "partial.txt"), "utf8"), partial);
  const workers = await evaluate("return window.__nativeWorkerChecks");
  assert.equal(
    workers.errors.length,
    0,
    "Bundled workers must start without network/CSP errors",
  );
  writeFileSync(join(output, "workers.json"), JSON.stringify(workers, null, 2));
  await command("POST", "/window/rect", { width: 800, height: 600 });
  const layout = await evaluate(`
    const rect = selector => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width };
      };
    return { left: rect('.toolbar-left'), center: rect('.toolbar-center'),
      right: rect('.toolbar-right'), commit: rect('.commit-submit-btn'), width: innerWidth, height: innerHeight };
  `);
  assert.ok(
    layout.left.right <= layout.center.left + 1,
    "Toolbar sections must not overlap",
  );
  assert.ok(
    layout.center.right <= layout.right.left + 1,
    "Toolbar actions must remain reachable",
  );
  assert.ok(
    layout.commit.left >= 0 &&
      layout.commit.right <= layout.width &&
      layout.commit.bottom <= layout.height,
    "Commit action must remain inside the minimum-size viewport",
  );
  writeFileSync(
    join(output, "minimum-layout.json"),
    JSON.stringify(layout, null, 2),
  );
  await screenshot("minimum-size-staging");
  await command("POST", "/window/rect", { width: 1400, height: 900 });

  // Native IPC must mutate only the selected fixture file and persist to Git.
  writeFileSync(join(a, "selected.txt"), "selected work\n");
  writeFileSync(join(a, "unselected.txt"), "keep private work\n");
  await invoke("stage_files", { path: a, files: ["selected.txt"] });
  assert.equal(git(a, "diff", "--cached", "--name-only"), "selected.txt");
  await invoke("create_commit", {
    path: a,
    message: "Native selected commit",
    authorName: null,
    authorEmail: null,
    amend: false,
    bypassHooks: true,
  });
  assert.equal(git(a, "log", "-1", "--format=%s"), "Native selected commit");
  assert.equal(
    readFileSync(join(a, "unselected.txt"), "utf8"),
    "keep private work\n",
  );
  assert.equal(git(a, "ls-files", "--", "unselected.txt"), "");
  // The actual filesystem watcher must refresh history after an external commit.
  git(a, "commit", "--allow-empty", "-m", "External watcher marker");
  await click(".toolbar-segment-btn:first-child");
  await until("filesystem watcher refreshed history", () =>
    evaluate(
      "return document.body.textContent.includes('External watcher marker')",
    ),
  );
  await screenshot("watcher-history");
  console.log(
    "Native desktop smoke passed: tab restoration, search, blame navigation/virtualization, both schemes, Monaco worker, partial staging, GUI commit/amend, selective commit, minimum-size layout, watcher refresh.",
  );
} catch (error) {
  const repositories = {};
  for (const name of ["repo-a", "repo-b"]) {
    const path = join(fixture, name);
    if (existsSync(join(path, ".git"))) {
      try {
        repositories[name] = {
          log: git(path, "log", "-3", "--format=%H %s"),
          status: git(path, "status", "--porcelain"),
          index: git(path, "diff", "--cached", "--stat"),
        };
      } catch (diagnosticError) {
        repositories[name] = { error: String(diagnosticError) };
      }
    }
  }
  writeFileSync(
    join(output, "git-state.json"),
    JSON.stringify(repositories, null, 2),
  );
  if (session) {
    await screenshot("failure").catch(() => {});
    const source = await command("GET", "/source").catch(
      () => "Page source unavailable",
    );
    writeFileSync(join(output, "failure.html"), String(source));
  }
  throw error;
} finally {
  if (session) await command("DELETE", "").catch(() => {});
  if (driver?.pid) {
    try {
      process.kill(-driver.pid, "SIGTERM");
    } catch {}
    await delay(250);
    try {
      process.kill(-driver.pid, "SIGKILL");
    } catch {}
  }
  writeFileSync(join(output, "driver.log"), driverLog.join(""));
  rmSync(fixture, { recursive: true, force: true });
}
