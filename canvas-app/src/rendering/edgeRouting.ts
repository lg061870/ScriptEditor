/**
 * Phase 4.5: obstacle-aware edge routing. Acceptance criteria: a custom
 * edge path function that detects intervening node bounding boxes between
 * source and target and routes around them, rather than the fixed
 * two-point Bezier every edge uses today.
 *
 * Scope, deliberate: this detects and avoids every obstacle the *direct*
 * source->target line would have passed through, and routes a single
 * clean detour (above or below, whichever is the shorter deviation) that
 * clears the full vertical extent of all of them at once. It does not
 * re-verify the detour corridor itself against every other node in the
 * document, nor attempt a globally shortest path (e.g. A* over a grid) --
 * for the node-and-edge densities this canvas actually has, a single
 * detour band is enough to solve the real problem (an edge drawn straight
 * through an unrelated node) without the complexity of full pathfinding.
 * Dedicated loop-channel routing for backward edges is Phase 4.6, not
 * this.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Liang-Barsky segment/rectangle clipping: the segment intersects the
 * rect iff the clipped parametric range is non-empty. Also true when
 * the segment starts or ends inside the rect (both bracket the range from clamping to [0,1]). */
export function segmentIntersectsRect(x1: number, y1: number, x2: number, y2: number, rect: Rect): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - rect.x, rect.x + rect.width - x1, y1 - rect.y, rect.y + rect.height - y1];

  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false; // parallel to this edge and outside it
      continue;
    }
    const r = q[i] / p[i];
    if (p[i] < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return t0 <= t1;
}

function expandRect(rect: Rect, margin: number): Rect {
  return { x: rect.x - margin, y: rect.y - margin, width: rect.width + margin * 2, height: rect.height + margin * 2 };
}

/** Which of `obstacles` the direct source->target segment actually
 * passes through, each expanded by `margin` so the routed detour clears
 * them with visible breathing room rather than grazing an edge. */
export function findBlockingObstacles(sourceX: number, sourceY: number, targetX: number, targetY: number, obstacles: Rect[], margin: number): Rect[] {
  return obstacles.filter((rect) => segmentIntersectsRect(sourceX, sourceY, targetX, targetY, expandRect(rect, margin)));
}

/** Picks a single Y that clears every blocking obstacle's full vertical
 * extent, on whichever side (above the topmost, or below the bottommost)
 * is the smaller deviation from the source/target midline. */
export function chooseDetourY(sourceY: number, targetY: number, blocking: Rect[]): number {
  const topY = Math.min(...blocking.map((r) => r.y));
  const bottomY = Math.max(...blocking.map((r) => r.y + r.height));
  const midY = (sourceY + targetY) / 2;
  return Math.abs(midY - topY) <= Math.abs(midY - bottomY) ? topY : bottomY;
}

/** Renders a polyline through `points` as an SVG path, rounding each
 * interior corner to `radius` (clamped to half of whichever adjacent
 * segment is shorter, so it never overshoots a short segment -- this
 * degrades gracefully to a sharp corner rather than a malformed curve
 * when two waypoints are very close together, e.g. source and target
 * nearly vertically aligned). */
export function roundedPolylinePath(points: Point[], radius: number): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`;

  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    const v1 = { x: curr.x - prev.x, y: curr.y - prev.y };
    const v2 = { x: next.x - curr.x, y: next.y - curr.y };
    const len1 = Math.hypot(v1.x, v1.y);
    const len2 = Math.hypot(v2.x, v2.y);
    const r = Math.min(radius, len1 / 2, len2 / 2);

    if (r <= 0 || len1 === 0 || len2 === 0) {
      d += ` L ${curr.x},${curr.y}`;
      continue;
    }

    const inPoint = { x: curr.x - (v1.x / len1) * r, y: curr.y - (v1.y / len1) * r };
    const outPoint = { x: curr.x + (v2.x / len2) * r, y: curr.y + (v2.y / len2) * r };
    d += ` L ${inPoint.x},${inPoint.y} Q ${curr.x},${curr.y} ${outPoint.x},${outPoint.y}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x},${last.y}`;
  return d;
}

export const OBSTACLE_MARGIN = 16;
export const DETOUR_CORNER_RADIUS = 14;

/** Builds a detour path (source -> above/below the blocking obstacles ->
 * target) as three segments with rounded corners. Caller decides whether
 * to use this at all (only when findBlockingObstacles found something --
 * an unobstructed edge should keep the plain Bezier it already had). */
export function buildDetourPath(sourceX: number, sourceY: number, targetX: number, targetY: number, blocking: Rect[]): string {
  const detourY = chooseDetourY(sourceY, targetY, blocking);
  return roundedPolylinePath(
    [
      { x: sourceX, y: sourceY },
      { x: sourceX, y: detourY },
      { x: targetX, y: detourY },
      { x: targetX, y: targetY },
    ],
    DETOUR_CORNER_RADIUS,
  );
}
