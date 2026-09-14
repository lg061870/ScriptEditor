import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement ResizeObserver, which React Flow relies on for
// its node-measurement pass; without this, mounting <ReactFlow> in tests
// throws.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverStub;

// jsdom doesn't implement document.queryCommandSupported or
// window.matchMedia, both of which monaco-editor touches during its own
// module-load/instantiation (Phase 3.5's CodePanel now imports it) --
// without these, any test that transitively renders CodePanel throws
// before a single test body runs.
if (typeof document.queryCommandSupported !== 'function') {
  document.queryCommandSupported = () => false;
}
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
