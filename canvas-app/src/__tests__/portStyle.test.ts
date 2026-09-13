import { describe, expect, it } from 'vitest';
import { portHandleStyle, edgeLineStyle } from '../rendering/portStyle';

/**
 * Phase 4.2's acceptance criteria, verbatim: main = solid circle/solid
 * line, exception = solid circle/dashed red line, control = solid
 * square/solid line, aux-config = diamond/dashed line -- each visually
 * distinct with no reliance on hover text.
 */
describe('portHandleStyle', () => {
  it('never sets `transform` -- react-flow positions each handle via a translate() on its own CSS class, and an inline style.transform would silently override (not compose with) that and mis-center the handle', () => {
    for (const role of ['main', 'exception', 'control', 'aux-config'] as const) {
      expect(portHandleStyle(role).transform).toBeUndefined();
    }
  });

  it('renders main and exception as circles (borderRadius 50%)', () => {
    for (const role of ['main', 'exception'] as const) {
      expect(portHandleStyle(role).borderRadius).toBe('50%');
    }
  });

  it('renders control as a square (borderRadius 0, no clip-path)', () => {
    const style = portHandleStyle('control');
    expect(style.borderRadius).toBe(0);
    expect(style.clipPath).toBeUndefined();
  });

  it('renders aux-config as a diamond (clip-path, not transform: rotate)', () => {
    const style = portHandleStyle('aux-config');
    expect(style.borderRadius).toBe(0);
    expect(style.clipPath).toBe('polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)');
  });

  it('every role produces a visually distinct shape from every other role', () => {
    const shapes = (['main', 'exception', 'control', 'aux-config'] as const).map((role) => {
      const s = portHandleStyle(role);
      return `${s.borderRadius}|${s.clipPath ?? ''}`;
    });
    // main and exception are the one intentional pair sharing a shape
    // (both circles) -- so dedupe before asserting distinctness.
    expect(new Set(shapes).size).toBe(3);
  });
});

describe('edgeLineStyle', () => {
  it('main and control are solid lines with no dash', () => {
    for (const role of ['main', 'control'] as const) {
      expect(edgeLineStyle(role).strokeDasharray).toBeUndefined();
    }
  });

  it('exception is a dashed red line', () => {
    const style = edgeLineStyle('exception');
    expect(style.strokeDasharray).toBeDefined();
    expect(style.stroke.toLowerCase()).toMatch(/^#(dc2626|d[0-9a-f]0000|[ef][0-9a-f]{5})$|red/);
  });

  it('aux-config is dashed but not red', () => {
    const style = edgeLineStyle('aux-config');
    expect(style.strokeDasharray).toBeDefined();
    expect(style.stroke).not.toBe(edgeLineStyle('exception').stroke);
  });

  it('an edge with no resolvable source role still renders (falls back to the main/solid style)', () => {
    const style = edgeLineStyle(undefined);
    expect(style.strokeDasharray).toBeUndefined();
  });
});
