/**
 * Diagram JSON SSOT schema v2 (Phase 0.3).
 *
 * Mirrors ../../../Models/Schema/DiagramSchemaV2.cs field-for-field so the
 * frontend and the Roslyn transcription API (Phase 0.5+) agree on wire
 * shape without a mapping layer. This is the type the canvas, the JSON
 * store (Phase 2), and the transcriber (Phase 3) all read/write --
 * canvas and code are both passive projections of a DiagramDocumentV2.
 *
 * v1 (see ../../../Models/DiagramDocument.cs) is untouched and still
 * backs the old wwwroot/editor.js canvas; this is a draft for the new
 * app, not a replacement of v1 yet.
 */

/** Every port on every one of the 36 catalog shapes (docs/activity-shapes.md)
 * is one of exactly these four roles -- confirmed by grepping every shape's
 * port table. `main` covers plain Input/Output; `exception` and `control`
 * are always separate named ports; `aux-config` is only ever
 * AdaptiveCardActivity's Card/Model inputs today, but exists as a role
 * (not a special case) for the next shape that needs a non-flow input. */
export type DiagramPortRole = 'main' | 'exception' | 'control' | 'aux-config';

export type DiagramPortDirection = 'input' | 'output';

/** Coarse rendering hint only -- Phase 4.3 auto-stacks same-side ports by
 * index/count, so this is not a pixel offset, just which edge of the node
 * the port belongs on. */
export type DiagramPortSide = 'left' | 'right' | 'top' | 'bottom';

export interface DiagramPort {
  id: string;
  name: string;
  direction: DiagramPortDirection;
  /** Explicit, always-set at creation time -- replaces the old
   * isExceptionPort/isControlPort substring-matching heuristic
   * (wwwroot/editor.js) entirely. See Phase 4.1. */
  role: DiagramPortRole;
  /** Payload/compatibility type, e.g. 'flow' | 'string' | 'model'. Two
   * ports connect only if direction is output->input AND type matches
   * (or either side is 'any') -- the one part of the v1 model that
   * already worked correctly (editor.js:1071-1078) and is preserved as-is. */
  type: string;
  position: DiagramPortSide;
}

export interface DiagramContextUsage {
  reads: string[];
  writes: string[];
}

export interface DiagramNode {
  id: string;
  type: string;
  name?: string;
  collapsed?: boolean;
  x: number;
  y: number;
  width?: number;
  height?: number;
  data: Record<string, string>;
  /** One entry per actual port instance -- for branching activities
   * (SwitchActivity, DecisionActivity, ...) this means one `main`-role
   * output port per case, not one generic "Output" port fanning out
   * (Phase 4.4). The schema already supports this: it's an array sized
   * per node instance, not a fixed per-type template. */
  ports: DiagramPort[];
  context: DiagramContextUsage;
}

export interface DiagramEndpoint {
  node: string;
  port: string;
}

export interface DiagramEdge {
  id: string;
  from: DiagramEndpoint;
  to?: DiagramEndpoint;
  /** Present (position) instead of `to` while the edge is being dragged
   * and hasn't landed on a target port yet -- matches v1's dangling-edge
   * support in DiagramValidator. */
  looseX?: number;
  looseY?: number;
  /** True for a backward edge (target column < source column) that should
   * route through the dedicated loop channel (Phase 4.6) instead of the
   * general obstacle-aware router (Phase 4.5). Optional/inferred-if-absent
   * so existing edges don't need migration; an explicit flag lets an
   * author force loop-style routing on an edge that isn't geometrically
   * backward. Rete.js's Connection type has the same concept built in
   * (`isLoop`), confirmed while spiking -- see docs/adr/0001-canvas-library-choice.md. */
  isLoop?: boolean;
}

export interface DiagramViewport {
  panX: number;
  panY: number;
  zoom: number;
}

export interface DiagramAdaptiveModelPropertyDefinition {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: string;
  description?: string;
}

export interface DiagramAdaptiveModelDefinition {
  id: string;
  name: string;
  baseType: string;
  properties: DiagramAdaptiveModelPropertyDefinition[];
}

export interface DiagramAdaptiveCardFieldDefinition {
  id: string;
  label: string;
  inputType: string;
  placeholder?: string;
  required: boolean;
}

export interface DiagramAdaptiveCardDefinition {
  id: string;
  name: string;
  baseType: string;
  modelRef: string;
  fields: DiagramAdaptiveCardFieldDefinition[];
}

export interface DiagramDocument {
  viewport: DiagramViewport;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  cards: DiagramAdaptiveCardDefinition[];
  models: DiagramAdaptiveModelDefinition[];
}
