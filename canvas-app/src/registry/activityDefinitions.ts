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
  /**
   * Phase 4.4: for the 5 branching types whose output actually depends on
   * a case/branch list, this is a function of the node's own `data` (so
   * ports regenerate whenever the Inspector edits that field) instead of
   * a fixed array. Every other seeded type keeps the plain array form.
   */
  ports: ActivityPortDef[] | ((data: Record<string, string>) => ActivityPortDef[]);
  getSummary: (data: Record<string, string>) => string;
}

/** Splits a delimited case-list field into trimmed, non-empty labels --
 * e.g. "case-a | case-b" (pipe, SwitchActivity/ConditionalActivity) or
 * "CoverageEstimate, CompareTermVsWhole, Quote" (comma, Conditional<TriggerTopic>). */
function parseDelimitedLabels(raw: string | undefined, delimiter: string): string[] {
  if (!raw) return [];
  return raw
    .split(delimiter)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Conditional<QuickAnswer>'s `branchMatch` field is comma-separated
 * "label -> action" pairs (e.g. "StillLearning -> ask"); the port
 * represents the matched *label* (the case being tested), not the action
 * it maps to -- the same role SwitchActivity's case keys play. */
function parseBranchMatchLabels(raw: string | undefined): string[] {
  return parseDelimitedLabels(raw, ',').map((segment) => segment.split('->')[0]?.trim() ?? segment);
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Turns case labels into output port templates -- id derived from the
 * label's own slug (not its position), so a case's port id (and therefore
 * any edge wired to it) stays stable across reordering or edits to other
 * cases in the same list; only adding/removing that specific case changes
 * its id. Collisions (two cases slugifying the same, or an empty slug)
 * fall back to a position-based suffix. */
function casePortDefs(labels: string[]): ActivityPortDef[] {
  const used = new Set<string>();
  return labels.map((label, index) => {
    let idSuffix = `case-${slugify(label) || index}`;
    while (used.has(idSuffix)) idSuffix = `${idSuffix}-${index}`;
    used.add(idSuffix);
    return { idSuffix, name: label, direction: 'output', role: 'main', type: 'flow', position: 'right' };
  });
}

const DEFAULT_PORT: ActivityPortDef = { idSuffix: 'case-default', name: 'Default', direction: 'output', role: 'main', type: 'flow', position: 'right' };

/**
 * Phase 4.4: builds a branching activity's full port list -- Input, one
 * output port per case (the "one real output port per case/branch"
 * acceptance criteria this task exists for, replacing a single generic
 * Output), an optional Default port when the type's default-branch field
 * is set, then Exception/Control. Cases/labels are read fresh from `data`
 * every time this runs, so editing the case-list field in the Inspector
 * regenerates the port list (store/diagramStore.ts's updateNodeData).
 */
function branchingPorts(
  caseLabels: (data: Record<string, string>) => string[],
  defaultBranchKey?: string,
): (data: Record<string, string>) => ActivityPortDef[] {
  return (data) => {
    const cases = casePortDefs(caseLabels(data));
    const hasDefault = defaultBranchKey ? Boolean(data[defaultBranchKey]?.trim()) : false;
    return [MAIN_INPUT, ...cases, ...(hasDefault ? [DEFAULT_PORT] : []), EXCEPTION_OUTPUT, CONTROL_OUTPUT];
  };
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
  // Phase 4.4: the 6 branching/"Selection" types (docs/activity-shapes.md).
  // docs/activity-shapes.md's own category note flags these as a *known
  // limitation of the current (old) editor* -- generic Output only, no
  // per-case ports -- "expected to be addressed by the upcoming
  // ScriptEditor rewrite". This is that fix, for 5 of the 6: real per-case
  // output ports driven by each type's actual case-list field.
  //
  // DecisionActivity is deliberately excluded from dynamic ports (kept on
  // STANDARD_PORTS below) even though this task's issue names it: its
  // real ConversaCore class (DecisionActivity<TInput,TEvidence,TResponse>)
  // has no case/branch/outcome list anywhere in its constructor or
  // fields, and neither does docs/activity-shapes.md's own parameter
  // table for it -- confirmed by reading the actual class. Inventing a
  // fake case-list field with no basis in the framework or the docs would
  // be fabricating a capability, not implementing one.
  //
  // Real, load-bearing limitation carried over from these types' actual
  // ConversaCore classes (not introduced here, not glossed over): only
  // ConditionalActivity's real branching (Dictionary<string,string> of
  // condition value -> target activity id, set via AddBranch) is
  // structurally compatible with routing different downstream nodes per
  // port. SwitchActivity's real cases are nested TopicFlowActivity
  // objects passed directly into its constructor, not separate Add()
  // statements a port-based edge could target, and ChoiceActivity's real
  // RunActivity() calls a single TransitionTo(...) regardless of which
  // option was chosen -- it doesn't branch execution per option at all.
  // So these ports make branching *expressible on the canvas* for all 5
  // (this task's actual scope, a Phase 4/Ports-&-Routing concern); making
  // JsonToCSharpTranscriber emit real per-case C# for each of them is a
  // separate, larger Phase 3-adjacent gap, consistent with Phase 3.1's
  // already-documented best-effort/"may not compile" fallback for any
  // type without a specific generator.
  {
    type: 'ConditionalActivity',
    title: 'Conditional Branch',
    category: 'Logic',
    color: '#ec4899',
    defaultData: { selectorKey: 'ConditionKey', cases: 'case-a | case-b', defaultBranch: '' },
    fields: [
      { key: 'selectorKey', label: 'Selector Key', kind: 'text' },
      { key: 'cases', label: 'Cases (pipe-separated)', kind: 'text' },
      { key: 'defaultBranch', label: 'Default Branch', kind: 'text' },
    ],
    ports: branchingPorts((data) => parseDelimitedLabels(data.cases, '|'), 'defaultBranch'),
    getSummary: (data) => `If ${data.selectorKey} in [${data.cases}]`,
  },
  {
    type: 'Conditional<QuickAnswer>',
    title: 'Branch on Quick Answer',
    category: 'Logic',
    color: '#ec4899',
    defaultData: { selectorKey: 'Basics_LastDecisionLabel', branchMatch: 'StillLearning -> ask', defaultBranch: '' },
    fields: [
      { key: 'selectorKey', label: 'Selector Key', kind: 'text' },
      { key: 'branchMatch', label: 'Branch Match (label -> action, comma-separated)', kind: 'text' },
      { key: 'defaultBranch', label: 'Default Branch', kind: 'text' },
    ],
    ports: branchingPorts((data) => parseBranchMatchLabels(data.branchMatch), 'defaultBranch'),
    getSummary: (data) => `Branch on ${data.selectorKey}: ${data.branchMatch}`,
  },
  {
    type: 'Conditional<TriggerTopic>',
    title: 'Branch to Topic',
    category: 'Logic',
    color: '#ec4899',
    defaultData: { selectorKey: 'Basics_NextMode', branches: 'CoverageEstimate, CompareTermVsWhole, Quote', defaultBranch: '' },
    fields: [
      { key: 'selectorKey', label: 'Selector Key', kind: 'text' },
      { key: 'branches', label: 'Branches (comma-separated)', kind: 'text' },
      { key: 'defaultBranch', label: 'Default Branch', kind: 'text' },
    ],
    ports: branchingPorts((data) => parseDelimitedLabels(data.branches, ','), 'defaultBranch'),
    getSummary: (data) => `Route ${data.selectorKey} to [${data.branches}]`,
  },
  {
    type: 'DecisionActivity',
    title: 'AI Decision',
    category: 'Logic',
    color: '#ec4899',
    defaultData: { evidenceContextKey: 'DecisionEvidence', modelId: 'gpt-4o', temperature: '0.3', requireJson: 'true' },
    fields: [
      { key: 'evidenceContextKey', label: 'Evidence Context Key', kind: 'text' },
      { key: 'modelId', label: 'Model Id', kind: 'text' },
      { key: 'temperature', label: 'Temperature', kind: 'number' },
      { key: 'requireJson', label: 'Require JSON', kind: 'boolean' },
    ],
    // Not dynamic -- see the file-level comment above for why.
    ports: STANDARD_PORTS,
    getSummary: (data) => `Decide from ${data.evidenceContextKey} (${data.modelId})`,
  },
  {
    type: 'SwitchActivity',
    title: 'Switch',
    category: 'Logic',
    color: '#ec4899',
    defaultData: { valueContextKey: 'SwitchKey', caseKeys: 'case-a | case-b', loopAfterCase: 'false', defaultCase: '' },
    fields: [
      { key: 'valueContextKey', label: 'Value Context Key', kind: 'text' },
      { key: 'caseKeys', label: 'Case Keys (pipe-separated)', kind: 'text' },
      { key: 'loopAfterCase', label: 'Loop After Case', kind: 'boolean' },
      { key: 'defaultCase', label: 'Default Case', kind: 'text' },
    ],
    ports: branchingPorts((data) => parseDelimitedLabels(data.caseKeys, '|'), 'defaultCase'),
    getSummary: (data) => `Switch on ${data.valueContextKey}: [${data.caseKeys}]`,
  },
  {
    type: 'ChoiceActivity',
    title: 'Quick Reply Choice',
    category: 'Logic',
    color: '#ec4899',
    defaultData: { question: 'How would you like to continue?', options: 'Option A | Option B', submissionKey: 'choice-activity-1' },
    fields: [
      { key: 'question', label: 'Question', kind: 'textarea' },
      { key: 'options', label: 'Options (pipe-separated)', kind: 'text' },
      { key: 'submissionKey', label: 'Submission Key', kind: 'text' },
    ],
    ports: branchingPorts((data) => parseDelimitedLabels(data.options, '|')),
    getSummary: (data) => `Q: ${data.question} [${data.options}]`,
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

/** Resolves a type's port templates against a specific node's current
 * `data` -- the one place that knows how to handle both the plain-array
 * and data-driven-function forms of ActivityDefinition.ports. Falls back
 * to a generic main-role Input/Output pair for an unseeded type. */
export function resolveActivityPortDefs(type: string, data: Record<string, string>): ActivityPortDef[] {
  const definition = getActivityDefinition(type);
  const ports = definition?.ports;
  if (typeof ports === 'function') return ports(data);
  if (ports) return ports;
  return [MAIN_INPUT, MAIN_OUTPUT];
}
