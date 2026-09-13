import type { DiagramNode, DiagramPort } from '../schema/diagram';
import { getActivityDefinition } from '../registry/activityDefinitions';

let nodeCounter = 0;
let edgeCounter = 0;

export function nextNodeId(): string {
  nodeCounter += 1;
  return `node-${Date.now()}-${nodeCounter}`;
}

export function nextEdgeId(): string {
  edgeCounter += 1;
  return `edge-${Date.now()}-${edgeCounter}`;
}

/** Every new node gets one generic Input/Output main-role port pair --
 * branching activities generating one port per case is Phase 4.4, not
 * this task. Seeded types (registry/activityDefinitions.ts) get their
 * defaultData; unseeded types get an empty data dict. */
export function createDiagramNode(type: string, position: { x: number; y: number }): DiagramNode {
  const definition = getActivityDefinition(type);
  const id = nextNodeId();
  const ports: DiagramPort[] = [
    { id: `${id}-in`, name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' },
    { id: `${id}-out`, name: 'Output', direction: 'output', role: 'main', type: 'flow', position: 'right' },
  ];

  return {
    id,
    type,
    x: position.x,
    y: position.y,
    data: definition ? { ...definition.defaultData } : {},
    ports,
    context: { reads: [], writes: [] },
  };
}
