import { BaseEdge, getBezierPath, type EdgeProps, type Edge } from '@xyflow/react';
import type { DiagramPortRole } from '../schema/diagram';
import { edgeLineStyle } from '../rendering/portStyle';

export interface RoleEdgeData extends Record<string, unknown> {
  /** The edge's *source* port role (mapping/toReactFlow.ts resolves this
   * from the source node's own port list) -- an edge's line style always
   * follows where it comes FROM, not where it lands. */
  sourceRole?: DiagramPortRole;
}

export type RoleEdgeType = Edge<RoleEdgeData>;

/** Phase 4.2: replaces react-flow's plain default edge so line style
 * (solid/dashed, color) can follow the source port's role -- same bezier
 * geometry as the default edge, only the stroke differs. */
export function RoleEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<RoleEdgeType>) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const { stroke, strokeWidth, strokeDasharray } = edgeLineStyle(data?.sourceRole);

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      markerEnd={markerEnd}
      style={{ stroke, strokeWidth, strokeDasharray }}
    />
  );
}
