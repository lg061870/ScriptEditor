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
  /** Output port ids on this node that already have an outgoing edge --
   * Phase 1.4's "+" affordance only renders on ports NOT in this set. */
  connectedOutputPortIds: string[];
  /** Present only when a "+" click should be possible (App.tsx supplies
   * this); undefined disables the affordance entirely rather than
   * rendering a dead button. */
  onRequestAddNode?: (nodeId: string, portId: string) => void;
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

export interface ToReactFlowNodesOptions {
  onRequestAddNode?: (nodeId: string, portId: string) => void;
  /** When `nodes` is a fully-controlled prop (never React Flow's own
   * internal state), selection must round-trip through it too: React Flow
   * marks node(s) selected internally on click/marquee-drag and fires a
   * change, but the very next render hands it back a `nodes` array with no
   * `selected` field, which it treats as authoritative and reverts the
   * selection. Passing the current selection set back in here closes that
   * loop; a Set (not a single id) so marquee multi-select (Phase 1.6) can
   * mark more than one node selected at once. */
  selectedNodeIds?: ReadonlySet<string>;
}

/** DiagramDocument.nodes -> React Flow nodes. Each DiagramPort is passed
 * through as-is (component decides Handle type/position from it) rather
 * than pre-flattened, so the mapping stays a straight structural copy. */
export function toReactFlowNodes(
  document: DiagramDocument,
  options: ToReactFlowNodesOptions = {},
): Node<DiagramNodeData>[] {
  const connectedSourcePorts = new Set(document.edges.map((edge) => edge.from.port));

  return document.nodes.map((node) => ({
    id: node.id,
    type: 'diagramNode',
    position: { x: node.x, y: node.y },
    selected: options.selectedNodeIds?.has(node.id) ?? false,
    data: {
      label: node.name ?? node.type,
      type: node.type,
      ports: node.ports,
      rawData: node.data,
      connectedOutputPortIds: node.ports
        .filter((port) => port.direction === 'output' && connectedSourcePorts.has(port.id))
        .map((port) => port.id),
      onRequestAddNode: options.onRequestAddNode,
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
