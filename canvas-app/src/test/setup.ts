import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom doesn't implement ResizeObserver, which React Flow relies on for
// its node-measurement pass; without this, mounting <ReactFlow> in tests
// throws.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

import React from 'react';

globalThis.ResizeObserver = ResizeObserverStub;

globalThis.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ csharp: '// mock' }),
  text: async () => '// mock',
}) as any;

vi.mock('../components/CodePanel', () => ({
  CodePanel: (props: any) =>
    React.createElement(
      'div',
      {
        'data-testid': 'mock-code-panel',
        'data-active': props?.isActive ? 'true' : 'false',
        'data-collapsed': props?.isCollapsed ? 'true' : 'false',
        style: { height: props?.isCollapsed ? 28 : props?.height },
      },
      React.createElement(
        'button',
        {
          'data-testid': props?.isCollapsed ? 'expand-code-panel-button' : 'collapse-code-panel-button',
          onClick: props?.onToggleCollapse,
        },
        props?.isCollapsed ? '▲' : '▼',
      ),
    ),
}));

vi.mock('@monaco-editor/react', () => ({
  default: (props: any) => React.createElement('div', { 'data-testid': 'mock-monaco-editor', 'data-value': props.value }),
  loader: { config: vi.fn() },
}));

vi.mock('../monacoSetup', () => ({}));

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
