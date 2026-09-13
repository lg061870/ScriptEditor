import { Position, type Edge, type Node } from '@xyflow/react';
import type { DiagramDocument, DiagramPort, DiagramPortSide } from '../schema/diagram';

export interface DiagramNodeData extends Record<string, unknown> {
  label: string;
  type: string;
  ports: DiagramPort[];
  /** Raw activity parameters (DiagramNode.data) -- the collapsed node's
   * summary line (Phase 1.2) and the Inspector's field form (Phase 1.5)
   * both read from this. */
  rawData: Record<string, string>;
}

const SIDE_TO_POSITION: Record<DiagramPortSide, Position> = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
};

export function sideToPosition(side: DiagramPortSide): Position {
  return SIDE_TO_POSITION[side];
}

/** DiagramDocument.nodes -> React Flow nodes. Each DiagramPort is passed
 * through as-is (component decides Handle type/position from it) rather
 * than pre-flattened, so the mapping stays a straight structural copy. */
export function toReactFlowNodes(document: DiagramDocument): Node<DiagramNodeData>[] {
  return document.nodes.map((node) => ({
    id: node.id,
    type: 'diagramNode',
    position: { x: node.x, y: node.y },
    data: {
      label: node.name ?? node.type,
      type: node.type,
      ports: node.ports,
      rawData: node.data,
    },
  }));
}

/** DiagramDocument.edges -> React Flow edges. Dangling edges (no `to`,
 * mid-drag per the schema's looseX/looseY) are dropped -- React Flow has
 * no concept of an edge without a target, and dangling-edge UX is Phase 1.4
 * ("+ add node" from a dangling handle), not this task. */
export function toReactFlowEdges(document: DiagramDocument): Edge[] {
  return document.edges
    .filter((edge) => edge.to !== undefined)
    .map((edge) => ({
      id: edge.id,
      source: edge.from.node,
      sourceHandle: edge.from.port,
      target: edge.to!.node,
      targetHandle: edge.to!.port,
    }));
}
