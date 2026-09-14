import { describe, expect, it } from 'vitest';
import { portHandleStyle, edgeLineStyle, computePortStackPositions, portStackOffsetStyle } from '../rendering/portStyle';

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

/**
 * Phase 4.3's acceptance criteria, verbatim: multiple ports on one side of
 * a node are evenly spaced automatically (Handle positioning computed
 * from port index/count) -- no hand-set percentage offsets anywhere.
 */
describe('computePortStackPositions', () => {
  it('gives a lone port on a side index 0, count 1', () => {
    const [pos] = computePortStackPositions([{ position: 'left' }]);
    expect(pos).toEqual({ index: 0, count: 1 });
  });

  it('assigns each port on the same side a distinct 0-based index and the shared count, in input order', () => {
    const positions = computePortStackPositions([
      { position: 'right' },
      { position: 'left' },
      { position: 'right' },
      { position: 'right' },
    ]);
    expect(positions).toEqual([
      { index: 0, count: 3 }, // 1st right
      { index: 0, count: 1 }, // lone left
      { index: 1, count: 3 }, // 2nd right
      { index: 2, count: 3 }, // 3rd right
    ]);
  });

  it('tracks each of the four sides independently', () => {
    const positions = computePortStackPositions([
      { position: 'top' },
      { position: 'bottom' },
      { position: 'top' },
    ]);
    expect(positions).toEqual([
      { index: 0, count: 2 },
      { index: 0, count: 1 },
      { index: 1, count: 2 },
    ]);
  });
});

describe('portStackOffsetStyle', () => {
  it('leaves a lone port at react-flow\'s own default (no top/left override)', () => {
    expect(portStackOffsetStyle('left', 0, 1)).toEqual({});
  });

  it('evenly spaces 2 ports on a vertical side (left/right) via `top`, avoiding the exact corners', () => {
    expect(portStackOffsetStyle('right', 0, 2).top).toBe('33.33%');
    expect(portStackOffsetStyle('right', 1, 2).top).toBe('66.67%');
  });

  it('evenly spaces 3 ports on a horizontal side (top/bottom) via `left`, avoiding the exact corners', () => {
    expect(portStackOffsetStyle('bottom', 0, 3).left).toBe('25.00%');
    expect(portStackOffsetStyle('bottom', 1, 3).left).toBe('50.00%');
    expect(portStackOffsetStyle('bottom', 2, 3).left).toBe('75.00%');
  });

  it('never sets `transform` -- same cascade-conflict reason as portHandleStyle', () => {
    expect(portStackOffsetStyle('right', 0, 3).transform).toBeUndefined();
  });
});
