import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  config: vi.fn(),
  defineTheme: vi.fn(),
  setTheme: vi.fn(),
  diagnostics: vi.fn(),
  editorWorker: vi.fn(),
  jsonWorker: vi.fn(),
  observe: vi.fn(),
  disconnect: vi.fn(),
  onMutation: (() => {}) as () => void,
}));
vi.mock("@monaco-editor/react", () => ({
  loader: {
    config: harness.config,
    init: async () => ({
      editor: { defineTheme: harness.defineTheme, setTheme: harness.setTheme },
    }),
  },
}));
vi.mock("monaco-editor/editor/editor.api", () => ({
  editor: { defineTheme: harness.defineTheme, setTheme: harness.setTheme },
  languages: {
    json: { jsonDefaults: { setDiagnosticsOptions: harness.diagnostics } },
  },
}));
vi.mock("monaco-editor/basic-languages/monaco.contribution", () => ({}));
vi.mock("monaco-editor/language/json/monaco.contribution", () => ({}));
vi.mock("monaco-editor/editor/editor.worker.js?worker", () => ({
  default: class {
    constructor() {
      harness.editorWorker();
    }
  },
}));
vi.mock("monaco-editor/language/json/json.worker.js?worker", () => ({
  default: class {
    constructor() {
      harness.jsonWorker();
    }
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  document.documentElement.removeAttribute("style");
  vi.stubGlobal(
    "MutationObserver",
    class {
      constructor(callback: () => void) {
        harness.onMutation = callback;
      }
      observe = harness.observe;
      disconnect = harness.disconnect;
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("style");
});
async function setup() {
  const module = await import("../../src/lib/monaco-setup");
  await Promise.resolve();
  return module;
}

describe("bundled Monaco bootstrap", () => {
  it("uses bundled workers, routes JSON separately, and disables read-only diagnostics", async () => {
    await setup();
    expect(harness.config).toHaveBeenCalledWith({
      monaco: expect.objectContaining({ editor: expect.any(Object) }),
    });
    expect(harness.diagnostics).toHaveBeenCalledWith({
      validate: false,
      allowComments: true,
      schemaValidation: "ignore",
    });
    const environment = self.MonacoEnvironment;
    expect(typeof environment?.getWorker).toBe("function");
    environment?.getWorker?.("", "json");
    environment?.getWorker?.("", "editorWorkerService");
    expect(harness.jsonWorker).toHaveBeenCalledOnce();
    expect(harness.editorWorker).toHaveBeenCalledOnce();
  });

  it("resolves nested light-dark colors and redraws editors after a scheme/accent change", async () => {
    document.documentElement.style.colorScheme = "light";
    document.documentElement.style.setProperty(
      "--bg-surface",
      "light-dark(rgb(250, 251, 252), rgb(11, 12, 13))",
    );
    await setup();
    expect(harness.defineTheme).toHaveBeenCalledWith(
      "basilico-light",
      expect.objectContaining({
        colors: expect.objectContaining({
          "editor.background": "rgb(250, 251, 252)",
        }),
      }),
    );
    expect(harness.observe).toHaveBeenCalledWith(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "style"],
    });
    document.documentElement.style.colorScheme = "dark";
    harness.onMutation();
    expect(harness.setTheme).toHaveBeenLastCalledWith("basilico-dark");
    expect(harness.defineTheme).toHaveBeenLastCalledWith(
      "basilico-light",
      expect.objectContaining({
        colors: expect.objectContaining({
          "editor.background": "rgb(11, 12, 13)",
        }),
      }),
    );
    document.documentElement.style.setProperty("--bg-surface", "#123456");
    harness.onMutation();
    expect(harness.defineTheme).toHaveBeenLastCalledWith(
      "basilico-light",
      expect.objectContaining({
        colors: expect.objectContaining({ "editor.background": "#123456" }),
      }),
    );
  });

  it("falls back to the OS scheme when there is no explicit override", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
    } as MediaQueryList);
    await setup();
    harness.onMutation();
    expect(harness.setTheme).toHaveBeenLastCalledWith("basilico-dark");
    vi.restoreAllMocks();
  });
});

describe("editor teardown", () => {
  it("detaches both diff models before disposing the view", async () => {
    const { disposeModelsOnUnmount } = await setup();
    const events: string[] = [];
    const editor = {
      dispose() {
        events.push("dispose");
      },
      getOriginalEditor: () => ({
        setModel: (model: null) => {
          expect(model).toBeNull();
          events.push("original");
        },
      }),
      getModifiedEditor: () => ({
        setModel: (model: null) => {
          expect(model).toBeNull();
          events.push("modified");
        },
      }),
    };
    disposeModelsOnUnmount(editor);
    editor.dispose();
    expect(events).toEqual(["original", "modified", "dispose"]);
  });

  it("disposes a plain editor even when its model is already torn down", async () => {
    const { disposeModelsOnUnmount } = await setup();
    const dispose = vi.fn();
    const editor = {
      dispose,
      setModel: vi.fn(() => {
        throw new Error("already disposed");
      }),
    };
    disposeModelsOnUnmount(editor);
    expect(() => editor.dispose()).not.toThrow();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
