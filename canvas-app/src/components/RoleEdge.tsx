import { useState } from 'react';
import {
  BaseEdge,
  getBezierPath,
  useStore,
  type EdgeProps,
  type Edge,
  type ReactFlowState,
} from '@xyflow/react';
import type { DiagramPortRole } from '../schema/diagram';
import { edgeLineStyle } from '../rendering/portStyle';
import {
  findBlockingObstacles,
  buildDetourPath,
  buildLoopPath,
  buildTopLoopPath,
  OBSTACLE_MARGIN,
  type Rect,
} from '../rendering/edgeRouting';
import { useDiagramStore } from '../store/diagramStore';

export interface RoleEdgeData extends Record<string, unknown> {
  /** The edge's *source* port role (mapping/toReactFlow.ts resolves this
   * from the source node's own port list) -- an edge's line style always
   * follows where it comes FROM, not where it lands. */
  sourceRole?: DiagramPortRole;
  /** Phase 4.6: resolved once in mapping/toReactFlow.ts (it needs both
   * nodes' x positions and the edge's own DiagramEdge.isLoop flag, neither
   * of which this component has on its own) -- true routes via
   * buildLoopPath's dedicated bottom channel instead of the generic
   * obstacle-aware router, regardless of whether anything is in the way. */
  isLoop?: boolean;
  /** This edge's 0-based position among all concurrent loop edges
   * (mapping/toReactFlow.ts), so multiple loops stack onto slightly
   * different channel heights instead of overlapping. Meaningless when
   * `isLoop` is false. */
  loopLaneIndex?: number;
  /** Callback to request deletion of this edge when the delete button is clicked */
  onDelete?: (edgeId: string) => void;
  /** Purely visual / synthesized edge (e.g. repeat loop return) */
  isVirtual?: boolean;
  /** Custom stroke color overriding default role color */
  strokeColor?: string;
  /** Custom dash array overriding default role dash */
  strokeDasharray?: string;
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

/** Every node's own bottom edge, source/target included -- a loop's
 * shared channel has to clear their footprints too, not just nodes in
 * between (see buildLoopPath's doc comment). */
const selectAllNodeBottoms = (state: ReactFlowState): number[] => {
  const bottoms: number[] = [];
  for (const node of state.nodeLookup.values()) {
    const { height } = node.measured;
    if (!height) continue;
    bottoms.push(node.internals.positionAbsolute.y + height);
  }
  return bottoms;
};

const selectAllNodeTops = (state: ReactFlowState): number[] => {
  const tops: number[] = [];
  for (const node of state.nodeLookup.values()) {
    tops.push(node.internals.positionAbsolute.y);
  }
  return tops;
};

/**
 * Phase 4.2: line style (solid/dashed, color) follows the source port's
 * role. Phase 4.5: geometry is no longer always the plain two-point
 * Bezier -- every OTHER node's measured bounding box is checked against
 * the direct source->target line (rendering/edgeRouting.ts), and only an
 * edge that line would actually pass through gets routed around it; an
 * unobstructed edge keeps the exact same Bezier as before. Phase 4.6: a
 * loop edge (`data.isLoop`) skips both of those entirely and always
 * routes via buildLoopPath's dedicated bottom channel, per the n8n
 * self-loop pattern -- a loop reads as "this loops" from its route alone,
 * not only when something happens to be in its way.
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
  selected,
}: EdgeProps<RoleEdgeType>) {
  const [isHovered, setIsHovered] = useState(false);
  const excludeIds = new Set([source, target]);
  const obstacles = useStore(selectObstacleRects(excludeIds));
  const allNodeBottoms = useStore(selectAllNodeBottoms);
  const allNodeTops = useStore(selectAllNodeTops);
  const defaultLineStyle = edgeLineStyle(data?.sourceRole);
  const stroke = data?.strokeColor ?? defaultLineStyle.stroke;
  const strokeWidth = defaultLineStyle.strokeWidth;
  const strokeDasharray = data?.strokeDasharray ?? defaultLineStyle.strokeDasharray;

  let edgePath: string;
  let labelX = (sourceX + targetX) / 2;
  let labelY = (sourceY + targetY) / 2;

  if (data?.isVirtual) {
    edgePath = buildTopLoopPath(sourceX, sourceY, targetX, targetY, allNodeTops, data.loopLaneIndex ?? 0);
    labelX = (sourceX + targetX) / 2;
    const highestTop = allNodeTops.length > 0 ? Math.min(...allNodeTops) : Math.min(sourceY, targetY);
    labelY = Math.min(highestTop - 50, sourceY - 50, targetY - 50) - (data.loopLaneIndex ?? 0) * 18;
  } else if (data?.isLoop) {
    edgePath = buildLoopPath(sourceX, sourceY, targetX, targetY, allNodeBottoms, data.loopLaneIndex ?? 0);
    labelX = (sourceX + targetX) / 2;
    const maxBottom = allNodeBottoms.length > 0 ? Math.max(...allNodeBottoms) : Math.max(sourceY, targetY) + 60;
    labelY = maxBottom + 20 + (data.loopLaneIndex ?? 0) * 16;
  } else {
    const blocking = findBlockingObstacles(sourceX, sourceY, targetX, targetY, obstacles, OBSTACLE_MARGIN);
    if (blocking.length > 0) {
      edgePath = buildDetourPath(sourceX, sourceY, targetX, targetY, blocking);
    } else {
      const [bezierPath, bx, by] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
      edgePath = bezierPath;
      labelX = bx;
      labelY = by;
    }
  }

  const activeStroke = selected && !data?.isVirtual
    ? '#2563eb'
    : (isHovered && !data?.isVirtual ? '#3b82f6' : stroke);
  const activeStrokeWidth = selected && !data?.isVirtual
    ? Math.max((strokeWidth ?? 2) + 1.5, 3.5)
    : (isHovered && !data?.isVirtual ? (strokeWidth ?? 2) + 1 : strokeWidth);

  return (
    <g
      className={`role-edge-group ${data?.isVirtual ? 'role-edge-virtual' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ cursor: data?.isVirtual ? 'default' : 'pointer' }}
    >
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        interactionWidth={data?.isVirtual ? 0 : 24}
        style={{
          stroke: activeStroke,
          strokeWidth: activeStrokeWidth,
          strokeDasharray,
          pointerEvents: data?.isVirtual ? 'none' : undefined,
          filter: selected && !data?.isVirtual ? 'drop-shadow(0 0 3px rgba(37,99,235,0.7))' : undefined,
          transition: 'stroke 0.15s ease, stroke-width 0.15s ease',
        }}
      />
      {(selected || isHovered) && !data?.isVirtual && (
        <foreignObject
          x={labelX - 10}
          y={labelY - 10}
          width={20}
          height={20}
          className="role-edge-delete-container nodrag nopan"
          style={{ overflow: 'visible', pointerEvents: 'none' }}
        >
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <button
              type="button"
              data-testid={`delete-edge-${id}`}
              onClick={(e) => {
                e.stopPropagation();
                if (typeof data?.onDelete === 'function') {
                  (data.onDelete as (edgeId: string) => void)(id);
                } else {
                  useDiagramStore.getState().removeEdges([id], 'Canvas');
                }
              }}
              title="Delete connector"
              style={{
                pointerEvents: 'auto',
                width: 12,
                height: 12,
                borderRadius: '50%',
                backgroundColor: selected ? '#ef4444' : '#f87171',
                color: '#ffffff',
                border: '1px solid #ffffff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#dc2626';
                e.currentTarget.style.transform = 'scale(1.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = selected ? '#ef4444' : '#f87171';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <svg
                width="6"
                height="6"
                viewBox="0 0 10 10"
                fill="none"
                stroke="#ffffff"
                strokeWidth="2"
                strokeLinecap="round"
                style={{ pointerEvents: 'none', display: 'block' }}
              >
                <line x1="2" y1="2" x2="8" y2="8" />
                <line x1="8" y1="2" x2="2" y2="8" />
              </svg>
            </button>
          </div>
        </foreignObject>
      )}
    </g>
  );
}
