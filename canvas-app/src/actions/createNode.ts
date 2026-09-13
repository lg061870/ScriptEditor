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

/** Phase 4.1: a seeded type's ports come from its own definition
 * (registry/activityDefinitions.ts, sourced from docs/activity-shapes.md) --
 * role is explicit per port, never inferred. An unseeded type (the other 30
 * of the 36-shape catalog, pending Phase 5) falls back to a generic
 * main-role Input/Output pair. Branching activities generating one port per
 * case is Phase 4.4, not this task. Seeded types get their defaultData;
 * unseeded types get an empty data dict. */
export function createDiagramNode(type: string, position: { x: number; y: number }): DiagramNode {
  const definition = getActivityDefinition(type);
  const id = nextNodeId();
  const portTemplates = definition?.ports ?? [
    { idSuffix: 'in', name: 'Input', direction: 'input' as const, role: 'main' as const, type: 'flow', position: 'left' as const },
    { idSuffix: 'out', name: 'Output', direction: 'output' as const, role: 'main' as const, type: 'flow', position: 'right' as const },
  ];
  const ports: DiagramPort[] = portTemplates.map((template) => ({
    id: `${id}-${template.idSuffix}`,
    name: template.name,
    direction: template.direction,
    role: template.role,
    type: template.type,
    position: template.position,
  }));

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
