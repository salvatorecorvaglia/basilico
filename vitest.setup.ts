import "@testing-library/jest-dom/vitest";
import { beforeEach, vi } from "vitest";

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom never lays out content, so every element reports 0x0. @tanstack/
// react-virtual reads offsetWidth/offsetHeight to size its viewport, and
// with 0 it renders zero rows — a virtualized list would look empty (and
// its rows unqueryable) in any test, regardless of what it's actually
// rendering. A fixed non-zero size is a stand-in for "the window is big
// enough to show content", which is all a test needs.
if (typeof HTMLElement !== "undefined") {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    value: 600,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    value: 800,
  });
}

// jsdom (>= 30.1) implements the spec's "focus fixup": when the focused
// element is removed — e.g. RTL's cleanup unmounting a button user-event
// clicked in the previous test — the Document itself becomes the focused
// area. The next element.focus() then fires `blur` at the Window, and Radix
// menus close on window blur, so a context menu opened in a later test closes
// the instant it focuses its own content. Reset to "nothing focused" before
// each test: focusing then blur()-ing a throwaway element clears the focused
// area to null without the Document fallback.
beforeEach(() => {
  if (typeof document === "undefined") return;
  const resetter = document.createElement("button");
  document.body.appendChild(resetter);
  resetter.focus();
  resetter.blur();
  resetter.remove();
});

// jsdom doesn't implement scrollIntoView at all; anything that calls it
// (keyboard-navigated lists scrolling the active row into view) throws.
if (
  typeof HTMLElement !== "undefined" &&
  !HTMLElement.prototype.scrollIntoView
) {
  HTMLElement.prototype.scrollIntoView = vi.fn();
}

// jsdom doesn't implement matchMedia either; the app's own dark-mode
// detection (and Monaco's, if it ever mounts unmocked) reads it.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn(),
    putImageData: vi.fn(),
    createImageData: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    fillText: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    transform: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}
