import { BaseEdge, getBezierPath, useStore, type EdgeProps, type Edge, type ReactFlowState } from '@xyflow/react';
import type { DiagramPortRole } from '../schema/diagram';
import { edgeLineStyle } from '../rendering/portStyle';
import { findBlockingObstacles, buildDetourPath, OBSTACLE_MARGIN, type Rect } from '../rendering/edgeRouting';

export interface RoleEdgeData extends Record<string, unknown> {
  /** The edge's *source* port role (mapping/toReactFlow.ts resolves this
   * from the source node's own port list) -- an edge's line style always
   * follows where it comes FROM, not where it lands. */
  sourceRole?: DiagramPortRole;
}

export type RoleEdgeType = Edge<RoleEdgeData>;

const selectObstacleRects = (excludeIds: Set<string>) => (state: ReactFlowState): Rect[] => {
  const rects: Rect[] = [];
  for (const node of state.nodeLookup.values()) {
    if (excludeIds.has(node.id)) continue;
    const { width, height } = node.measured;
    if (!width || !height) continue; // not yet measured (first render) -- skip rather than treat as a 0x0 obstacle
    rects.push({ x: node.internals.positionAbsolute.x, y: node.internals.positionAbsolute.y, width, height });
  }
  return rects;
};

/**
 * Phase 4.2: line style (solid/dashed, color) follows the source port's
 * role. Phase 4.5: geometry is no longer always the plain two-point
 * Bezier -- every OTHER node's measured bounding box is checked against
 * the direct source->target line (rendering/edgeRouting.ts), and only an
 * edge that line would actually pass through gets routed around it; an
 * unobstructed edge keeps the exact same Bezier as before.
 *
 * Reads react-flow's internal `nodeLookup` store (via useStore), not the
 * `useNodes()` hook: useNodes() returns exactly the `nodes` prop this app
 * passes in (a fresh plain-data array recomputed every render from
 * `document`, per mapping/toReactFlow.ts), which never carries the
 * `measured` dimensions react-flow's own layout pass computes internally
 * -- confirmed empirically (every node's `measured` came back undefined
 * via useNodes(), so every obstacle check silently found nothing).
 * `nodeLookup` holds react-flow's own internal, measured node records.
 */
export function RoleEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<RoleEdgeType>) {
  const excludeIds = new Set([source, target]);
  const obstacles = useStore(selectObstacleRects(excludeIds));
  const { stroke, strokeWidth, strokeDasharray } = edgeLineStyle(data?.sourceRole);

  const blocking = findBlockingObstacles(sourceX, sourceY, targetX, targetY, obstacles, OBSTACLE_MARGIN);
  const edgePath =
    blocking.length > 0
      ? buildDetourPath(sourceX, sourceY, targetX, targetY, blocking)
      : getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })[0];

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      markerEnd={markerEnd}
      style={{ stroke, strokeWidth, strokeDasharray }}
    />
  );
}
