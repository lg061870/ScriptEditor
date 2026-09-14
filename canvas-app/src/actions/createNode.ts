import type { DiagramNode, DiagramPort } from '../schema/diagram';
import { getActivityDefinition, resolveActivityPortDefs, type ActivityPortDef } from '../registry/activityDefinitions';

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

/** Turns a resolved list of port templates into real, node-scoped
 * DiagramPort instances. Shared by createDiagramNode (initial creation)
 * and diagramStore.ts's updateNodeData (Phase 4.4: regenerating a
 * branching node's ports whenever its case-list field changes) so both
 * paths produce identically-shaped ports for the same type+data. */
export function buildPortsFromDefs(nodeId: string, portDefs: ActivityPortDef[]): DiagramPort[] {
  return portDefs.map((template) => ({
    id: `${nodeId}-${template.idSuffix}`,
    name: template.name,
    direction: template.direction,
    role: template.role,
    type: template.type,
    position: template.position,
  }));
}

/** Phase 4.1/4.4: a seeded type's ports come from its own definition
 * (registry/activityDefinitions.ts, sourced from docs/activity-shapes.md) --
 * role is explicit per port, never inferred. An unseeded type (the other
 * types of the 36-shape catalog, pending Phase 5) falls back to a generic
 * main-role Input/Output pair. Seeded types get their defaultData;
 * unseeded types get an empty data dict. */
export function createDiagramNode(type: string, position: { x: number; y: number }): DiagramNode {
  const definition = getActivityDefinition(type);
  const id = nextNodeId();
  const data = definition ? { ...definition.defaultData } : {};
  const ports = buildPortsFromDefs(id, resolveActivityPortDefs(type, data));

  return {
    id,
    type,
    x: position.x,
    y: position.y,
    data,
    ports,
    context: { reads: [], writes: [] },
  };
}
