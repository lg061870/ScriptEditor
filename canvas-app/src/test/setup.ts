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
