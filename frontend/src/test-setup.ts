import "@testing-library/jest-dom";

// jsdom does not implement Element.scrollIntoView. Several surfaces (the command
// palette, the screener table) scroll a selection into view, so stub it rather
// than guarding every call site in application code. Guarded for the plain
// `.test.ts` files, which run in the node environment where Element is absent.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom also lacks ResizeObserver. Several surfaces size themselves from their
// container, so provide a no-op implementation rather than guarding every use.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
