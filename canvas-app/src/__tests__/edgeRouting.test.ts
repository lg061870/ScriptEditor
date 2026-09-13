import { describe, expect, it } from 'vitest';
import {
  segmentIntersectsRect,
  findBlockingObstacles,
  chooseDetourY,
  roundedPolylinePath,
  buildDetourPath,
  type Rect,
} from '../rendering/edgeRouting';

/**
 * Phase 4.5's acceptance criteria: a custom edge path function that
 * detects intervening node bounding boxes between source and target and
 * routes around them, rather than the fixed two-point Bezier every edge
 * uses today.
 */
describe('segmentIntersectsRect', () => {
  const rect: Rect = { x: 100, y: 100, width: 50, height: 50 };

  it('detects a segment that passes straight through the rect', () => {
    expect(segmentIntersectsRect(0, 125, 200, 125, rect)).toBe(true);
  });

  it('detects a segment that starts inside the rect', () => {
    expect(segmentIntersectsRect(120, 120, 300, 300, rect)).toBe(true);
  });

  it('reports no intersection for a segment that passes well above the rect', () => {
    expect(segmentIntersectsRect(0, 0, 200, 0, rect)).toBe(false);
  });

  it('reports no intersection for a segment entirely to the left of the rect', () => {
    expect(segmentIntersectsRect(0, 125, 50, 125, rect)).toBe(false);
  });

  it('detects a vertical segment passing through the rect', () => {
    expect(segmentIntersectsRect(125, 0, 125, 300, rect)).toBe(true);
  });

  it('does not intersect a segment that merely grazes past a corner outside the rect', () => {
    // Diagonal line from top-left area to bottom-right area, offset far
    // enough not to clip the rect at (100,100)-(150,150).
    expect(segmentIntersectsRect(0, 0, 50, 50, rect)).toBe(false);
  });
});

describe('findBlockingObstacles', () => {
  it('returns only the obstacles the direct line actually passes through', () => {
    const inTheWay: Rect = { x: 100, y: 90, width: 40, height: 40 };
    const offToTheSide: Rect = { x: 100, y: 500, width: 40, height: 40 };

    const blocking = findBlockingObstacles(0, 100, 300, 100, [inTheWay, offToTheSide], 0);

    expect(blocking).toEqual([inTheWay]);
  });

  it('applies the margin so a near-miss still counts as blocking', () => {
    // Line at y=100 passes 5px below a 40px-tall rect ending at y=95 --
    // clear with 0 margin, blocked once expanded by a 16px margin.
    const nearMiss: Rect = { x: 100, y: 55, width: 40, height: 40 };
    expect(findBlockingObstacles(0, 100, 300, 100, [nearMiss], 0)).toEqual([]);
    expect(findBlockingObstacles(0, 100, 300, 100, [nearMiss], 16)).toEqual([nearMiss]);
  });

  it('returns an empty array when nothing is in the way', () => {
    expect(findBlockingObstacles(0, 0, 100, 100, [], 16)).toEqual([]);
  });
});

describe('chooseDetourY', () => {
  it('routes above when the obstacle sits below the midline (shorter deviation upward)', () => {
    const obstacle: Rect = { x: 0, y: 150, width: 50, height: 50 }; // spans 150-200
    // midline is 100; top (150) is closer to 100 than bottom (200) is.
    expect(chooseDetourY(100, 100, [obstacle])).toBe(150);
  });

  it('routes below when the obstacle sits above the midline (shorter deviation downward)', () => {
    const obstacle: Rect = { x: 0, y: 0, width: 50, height: 50 }; // spans 0-50
    // midline is 100; bottom (50) is closer to 100 than top (0) is.
    expect(chooseDetourY(100, 100, [obstacle])).toBe(50);
  });

  it('clears the full union of multiple obstacles, not just one', () => {
    const a: Rect = { x: 0, y: 40, width: 20, height: 20 }; // top 40
    const b: Rect = { x: 100, y: 60, width: 20, height: 20 }; // bottom 80
    // midline 0; top of union is 40 (closer than bottom 80) -> route above at y=40.
    expect(chooseDetourY(0, 0, [a, b])).toBe(40);
  });
});

describe('roundedPolylinePath', () => {
  it('produces a plain move-to for a single point', () => {
    expect(roundedPolylinePath([{ x: 1, y: 2 }], 10)).toBe('M 1,2');
  });

  it('produces a straight line (no rounding needed) for two points', () => {
    const d = roundedPolylinePath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      10,
    );
    expect(d).toBe('M 0,0 L 100,0');
  });

  it('rounds an interior corner on a 3-point step path', () => {
    const d = roundedPolylinePath(
      [
        { x: 0, y: 0 },
        { x: 0, y: 100 },
        { x: 100, y: 100 },
      ],
      10,
    );
    // Starts at the origin, approaches the corner short by the radius, curves, then continues.
    expect(d).toMatch(/^M 0,0 L 0,90 Q 0,100 10,100 L 100,100$/);
  });

  it('clamps the corner radius to half the shorter adjacent segment rather than overshooting it', () => {
    const d = roundedPolylinePath(
      [
        { x: 0, y: 0 },
        { x: 0, y: 4 }, // 4px segment, shorter than a 10px radius -- clamps to 2px
        { x: 100, y: 4 },
      ],
      10,
    );
    expect(d).toBe('M 0,0 L 0,2 Q 0,4 2,4 L 100,4');
  });

  it('produces a sharp (unrounded) corner when an adjacent segment has zero length', () => {
    const d = roundedPolylinePath(
      [
        { x: 0, y: 0 },
        { x: 0, y: 0 }, // duplicate point -- zero-length segment
        { x: 100, y: 0 },
      ],
      10,
    );
    expect(d).toBe('M 0,0 L 0,0 L 100,0');
  });
});

describe('buildDetourPath', () => {
  it('routes source -> detourY -> target as a 3-segment path clearing the blocking obstacle', () => {
    const obstacle: Rect = { x: 100, y: 90, width: 40, height: 40 }; // spans 90-130
    const d = buildDetourPath(0, 100, 300, 100, [obstacle]);

    // Should route above (closer deviation): detourY = 90.
    expect(d).toContain('M 0,100');
    expect(d).toMatch(/90/); // the detour height appears somewhere in the path
    expect(d).toContain('300,100'); // ends at the target
  });
});
