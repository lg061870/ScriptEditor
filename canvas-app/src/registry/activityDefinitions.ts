/**
 * Activity registry: per-activity-type metadata driving the collapsed node
 * summary (Phase 1.2), the palette (Phase 1.3), the Inspector's field form
 * (Phase 1.5), and (Phase 4.1) each type's real port list.
 *
 * Seeded with the 6 activity types already implemented in
 * docs/conops_interactive_prototype.html (same title/category/color/
 * defaultData/summary logic, ported as-is, not reinvented) -- the roadmap
 * explicitly calls for seeding these 6 and extending to the full 36-shape
 * catalog (docs/activity-shapes.md) in Phase 5. `getActivityDefinition`
 * returns undefined for every other type; callers fall back to generic
 * behavior (plain type name as summary/title, a raw key-value field editor,
 * a generic main-role Input/Output port pair) rather than a lookup crash.
 */

import type { DiagramPortDirection, DiagramPortRole, DiagramPortSide } from '../schema/diagram';

export type ActivityFieldKind = 'text' | 'textarea' | 'number' | 'boolean';

export interface ActivityFieldDef {
  key: string;
  label: string;
  kind: ActivityFieldKind;
}

/**
 * A port template: everything about a port except its id, which
 * createDiagramNode derives per node instance as `${nodeId}-${idSuffix}`.
 * idSuffix/name/role pairs come straight from docs/activity-shapes.md's
 * port tables via the name->role mapping in
 * docs/schema/diagram-schema-v2.md ("Port coverage check"): Input/Output
 * are always `main`, Exception is always `exception`, Control is always
 * `control`, and AdaptiveCardActivity's Card/Model are the catalog's only
 * `aux-config` ports today.
 */
export interface ActivityPortDef {
  idSuffix: string;
  name: string;
  direction: DiagramPortDirection;
  role: DiagramPortRole;
  type: string;
  position: DiagramPortSide;
}

const MAIN_INPUT: ActivityPortDef = { idSuffix: 'in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' };
const MAIN_OUTPUT: ActivityPortDef = { idSuffix: 'out', name: 'Output', direction: 'output', role: 'main', type: 'flow', position: 'right' };
const EXCEPTION_OUTPUT: ActivityPortDef = { idSuffix: 'exc', name: 'Exception', direction: 'output', role: 'exception', type: 'flow', position: 'right' };
const CONTROL_OUTPUT: ActivityPortDef = { idSuffix: 'control', name: 'Control', direction: 'output', role: 'control', type: 'flow', position: 'right' };

/** Input/Output/Exception/Control -- the shape every seeded type but
 * AdaptiveCardActivity has, per docs/activity-shapes.md. */
const STANDARD_PORTS: ActivityPortDef[] = [MAIN_INPUT, MAIN_OUTPUT, EXCEPTION_OUTPUT, CONTROL_OUTPUT];

export interface ActivityDefinition {
  type: string;
  title: string;
  category: string;
  color: string;
  defaultData: Record<string, string>;
  fields: ActivityFieldDef[];
  ports: ActivityPortDef[];
  getSummary: (data: Record<string, string>) => string;
}

const DEFINITIONS: ActivityDefinition[] = [
  {
    type: 'SimpleActivity',
    title: 'Bot Message',
    category: 'Messaging',
    color: '#3b82f6',
    defaultData: { message: 'Thank you for your response! How can I assist you further?' },
    fields: [{ key: 'message', label: 'Message', kind: 'textarea' }],
    ports: STANDARD_PORTS,
    getSummary: (data) => data.message || 'Send static bot message',
  },
  {
    type: 'AdaptiveCardActivity',
    title: 'User Form',
    category: 'Cards',
    color: '#10b981',
    defaultData: { cardName: 'LeadIntakeCard', modelName: 'LeadIntakeModel' },
    fields: [
      { key: 'cardName', label: 'Card Name', kind: 'text' },
      { key: 'modelName', label: 'Model Name', kind: 'text' },
    ],
    // The catalog's one shape with aux-config ports (docs/activity-shapes.md):
    // Card/Model are extra config inputs alongside the regular flow Input,
    // not part of the main in/out chain.
    ports: [
      MAIN_INPUT,
      MAIN_OUTPUT,
      EXCEPTION_OUTPUT,
      { idSuffix: 'card', name: 'Card', direction: 'input', role: 'aux-config', type: 'card', position: 'left' },
      { idSuffix: 'model', name: 'Model', direction: 'input', role: 'aux-config', type: 'model', position: 'left' },
      CONTROL_OUTPUT,
    ],
    getSummary: (data) => `Card: ${data.cardName} (${data.modelName})`,
  },
  {
    type: 'QuickAnswerActivity',
    title: 'Quick Choices',
    category: 'Interaction',
    color: '#f59e0b',
    defaultData: {
      question: 'Would you like an instant quote or to talk to an agent?',
      options: 'Instant Quote | Talk to Agent | More Info',
    },
    fields: [
      { key: 'question', label: 'Question', kind: 'textarea' },
      { key: 'options', label: 'Options (pipe-separated)', kind: 'text' },
    ],
    ports: STANDARD_PORTS,
    getSummary: (data) => `Q: ${data.question} [${data.options}]`,
  },
  {
    type: 'DelayActivity',
    title: 'Pacing Pause',
    category: 'Flow',
    color: '#3b82f6',
    defaultData: { durationSec: '2', showTyping: 'true' },
    fields: [
      { key: 'durationSec', label: 'Duration (sec)', kind: 'number' },
      { key: 'showTyping', label: 'Show Typing', kind: 'boolean' },
    ],
    ports: STANDARD_PORTS,
    getSummary: (data) => `Pause: ${data.durationSec}s (Typing: ${data.showTyping})`,
  },
  {
    type: 'PromptActivity',
    title: 'Risk Analysis AI',
    category: 'AI',
    color: '#8b5cf6',
    defaultData: { prompt: 'Analyze customer lead profile and score risk tier.', model: 'gpt-4o-mini' },
    fields: [
      { key: 'prompt', label: 'Prompt', kind: 'textarea' },
      { key: 'model', label: 'Model', kind: 'text' },
    ],
    ports: STANDARD_PORTS,
    getSummary: (data) => `Prompt: ${data.prompt}`,
  },
  {
    type: 'TriggerTopicActivity',
    title: 'Call Subtopic',
    category: 'Flow',
    color: '#8b5cf6',
    defaultData: { subTopicName: 'QuoteGenerationTopic', waitForCompletion: 'true' },
    fields: [
      { key: 'subTopicName', label: 'Sub-topic Name', kind: 'text' },
      { key: 'waitForCompletion', label: 'Wait For Completion', kind: 'boolean' },
    ],
    ports: STANDARD_PORTS,
    getSummary: (data) => `Subtopic: ${data.subTopicName} (Wait: ${data.waitForCompletion})`,
  },
];

const BY_TYPE: Record<string, ActivityDefinition> = Object.fromEntries(
  DEFINITIONS.map((definition) => [definition.type, definition]),
);

export function getActivityDefinition(type: string): ActivityDefinition | undefined {
  return BY_TYPE[type];
}

export function getNodeSummary(type: string, data: Record<string, string>): string {
  return getActivityDefinition(type)?.getSummary(data) ?? type;
}

export function listSeededActivityDefinitions(): ActivityDefinition[] {
  return DEFINITIONS;
}
