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
    // docs/activity-shapes.md lists a "Mode" parameter ("message or
    // action") alongside Message. The real class (Activities/
    // SimpleActivity.cs) has two constructors -- one taking a literal
    // message, one taking a Func<TopicWorkflowContext, object?,
    // Task<object?>> delegate for "action" mode -- and a delegate has no
    // literal JSON representation (the same category of gap
    // JsonToCSharpTranscriber.cs's own doc comment already flags for
    // PromptActivity/QuickAnswerActivity). `mode` is kept here for
    // doc-parity and shown as read-only intent; only "message" is
    // actually transcribable today.
    defaultData: { mode: 'message', message: 'Thank you for your response! How can I assist you further?' },
    fields: [
      { key: 'mode', label: 'Mode (only "message" is transcribable today)', kind: 'text' },
      { key: 'message', label: 'Message', kind: 'textarea' },
    ],
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
    // "Duration (ms)"/durationMs matches docs/activity-shapes.md's "Delay"
    // entry exactly (Phase 5.1) -- also renamed in Transcription/
    // JsonToCSharpTranscriber.cs and CSharpToJsonParser.cs (TimeSpan.
    // FromMilliseconds, not FromSeconds) so the field and the generated
    // C# stay consistent; showTyping isn't in the doc's minimal table but
    // is kept -- it's ShowTypingIndicator, a real settable property on
    // the real class, not a fabricated field.
    defaultData: { durationMs: '1000', showTyping: 'true' },
    fields: [
      { key: 'durationMs', label: 'Duration (ms)', kind: 'number' },
      { key: 'showTyping', label: 'Show Typing', kind: 'boolean' },
    ],
    ports: STANDARD_PORTS,
    getSummary: (data) => `Pause: ${data.durationMs}ms (Typing: ${data.showTyping})`,
  },
  {
    type: 'CompositeActivity',
    title: 'Composite Sequence',
    category: 'Flow',
    color: '#3b82f6',
    // docs/activity-shapes.md lists a "Child Count" parameter (childCount,
    // default 8), but the real class (CompositeActivity(string id,
    // IEnumerable<TopicFlowActivity> activities)) takes actual nested
    // child activities, not a count -- there's no factory or property
    // that turns a number into children. That's a structural gap in the
    // same category as SwitchActivity's nested-case constructor (#29's
    // comment) and isn't attempted here; childCount is kept for
    // doc-parity but doesn't drive anything transcribable yet.
    // isolateContext/completeMessage ARE real settable properties
    // (IsolateContext, CompleteMessage).
    defaultData: { childCount: '8', isolateContext: 'false', completeMessage: 'Composite completed' },
    fields: [
      { key: 'childCount', label: 'Child Count (not yet transcribable)', kind: 'number' },
      { key: 'isolateContext', label: 'Isolate Context', kind: 'boolean' },
      { key: 'completeMessage', label: 'Complete Message', kind: 'text' },
    ],
    ports: STANDARD_PORTS,
    getSummary: (data) => `${data.childCount} children (isolated: ${data.isolateContext})`,
  },
  {
    type: 'EndActivity',
    title: 'End Conversation',
    category: 'Flow',
    color: '#6b7280',
    // docs/activity-shapes.md also lists resultKey/completedFlagKey, but
    // the real class's RunActivity() hardcodes those context keys as the
    // literal strings "Result" and "IsCompleted" -- there's no
    // constructor param or property that makes them configurable, so
    // they're not included here (would be fields with no effect).
    // endMessage is the real, settable EndMessage (via the constructor's
    // `message` param).
    defaultData: { endMessage: 'Done' },
    fields: [{ key: 'endMessage', label: 'End Message', kind: 'textarea' }],
    // The one seeded type without a Control port -- docs/activity-shapes.md
    // agrees: EndActivity terminates the flow, so there's nothing left to
    // route a "control" continuation to.
    ports: [MAIN_INPUT, MAIN_OUTPUT, EXCEPTION_OUTPUT],
    getSummary: (data) => data.endMessage || 'End conversation',
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
  // Phase 5.2: Iteration + Concurrency + Exception Handling categories
  // (docs/activity-shapes.md). RepeatActivity, ForEachActivity, and
  // ParallelActivity all require passing an actual nested TopicFlowActivity
  // (or, for RepeatActivity, a Func<string, TopicWorkflowContext,
  // TActivity> factory delegate) into their real constructors -- the same
  // structural gap as CompositeActivity/SwitchActivity (#29/#33's
  // comments): there's no literal-JSON way to construct one yet, so their
  // doc parameters that don't correspond to a real settable property
  // (loopMode, branchCount) are kept for doc-parity only and flagged
  // per-field below. OnErrorActivity/FallbackActivity/EscalateActivity are
  // all simple single-string-message constructors with no such gap.
  {
    type: 'RepeatActivity',
    title: 'Repeat Loop',
    category: 'Logic',
    color: '#0891b2',
    // Real class: RepeatActivity<TActivity>, 3 constructors, all requiring
    // a Func<string, TopicWorkflowContext, TActivity> activityFactory
    // delegate (no literal JSON form). `continuePrompt` matches one
    // constructor's real string param; `collectionKey` matches the
    // optional collectionContextKey param; `loopMode` is a UI-only
    // concept (which of the 3 constructors to use) with no single
    // corresponding real field.
    defaultData: { loopMode: 'while predicate', collectionKey: 'BasicsLearningLoop_Collection', continuePrompt: 'custom predicate controls continuation' },
    fields: [
      { key: 'loopMode', label: 'Loop Mode (not yet transcribable)', kind: 'text' },
      { key: 'collectionKey', label: 'Collection Key', kind: 'text' },
      { key: 'continuePrompt', label: 'Continue Prompt', kind: 'text' },
    ],
    ports: STANDARD_PORTS,
    getSummary: (data) => `Repeat while: ${data.continuePrompt}`,
  },
  {
    type: 'ForEachActivity',
    title: 'For Each',
    category: 'Logic',
    color: '#0891b2',
    // itemKey/indexKey/startMessage/completeMessage are all real settable
    // properties (ItemContextKey/IndexContextKey/StartMessage/
    // CompleteMessage); collectionKey matches the real constructor's
    // collectionContextKey -- but that constructor also requires a
    // TopicFlowActivity childActivity, not yet representable.
    defaultData: { collectionKey: 'Items', itemKey: 'item', indexKey: 'index', startMessage: '', completeMessage: '' },
    fields: [
      { key: 'collectionKey', label: 'Collection Key', kind: 'text' },
      { key: 'itemKey', label: 'Item Key', kind: 'text' },
      { key: 'indexKey', label: 'Index Key', kind: 'text' },
      { key: 'startMessage', label: 'Start Message', kind: 'text' },
      { key: 'completeMessage', label: 'Complete Message', kind: 'text' },
    ],
    ports: STANDARD_PORTS,
    getSummary: (data) => `For each in ${data.collectionKey}`,
  },
  {
    type: 'ParallelActivity',
    title: 'Parallel Branches',
    category: 'Logic',
    color: '#0891b2',
    // continueOnError/completeMessage are real settable properties
    // (ContinueOnError/CompleteMessage). branchCount has no basis in the
    // real class -- ParallelActivity(string id, IEnumerable<TopicFlowActivity>
    // activities) takes actual branches, not a count.
    defaultData: { branchCount: '2', continueOnError: 'false', completeMessage: '' },
    fields: [
      { key: 'branchCount', label: 'Branch Count (not yet transcribable)', kind: 'number' },
      { key: 'continueOnError', label: 'Continue On Error', kind: 'boolean' },
      { key: 'completeMessage', label: 'Complete Message', kind: 'text' },
    ],
    ports: STANDARD_PORTS,
    getSummary: (data) => `${data.branchCount} parallel branches`,
  },
  {
    type: 'OnErrorActivity',
    title: 'On Error',
    category: 'Exception Handling',
    color: '#ef4444',
    // Real signature: OnErrorActivity(string id, string message) -- errorMessage maps directly.
    defaultData: { errorMessage: 'An unexpected error occurred.' },
    fields: [{ key: 'errorMessage', label: 'Error Message', kind: 'textarea' }],
    // Matches docs/activity-shapes.md exactly: no Exception port -- this
    // activity IS the error handler, it doesn't escalate its own errors
    // through a further Exception port.
    ports: [MAIN_INPUT, MAIN_OUTPUT, CONTROL_OUTPUT],
    getSummary: (data) => data.errorMessage || 'Handle error',
  },
  {
    type: 'FallbackActivity',
    title: 'Fallback',
    category: 'Exception Handling',
    color: '#ef4444',
    // Real signature: FallbackActivity(string id, string message) -- message
    // maps directly. fallbackFlagKey has no basis in the real class: its
    // RunActivity() hardcodes context.SetValue("FallbackTriggered", true) --
    // not configurable, so not included as a field (would have no effect).
    defaultData: { message: 'Sorry, I did not understand that.' },
    fields: [{ key: 'message', label: 'Message', kind: 'textarea' }],
    ports: STANDARD_PORTS,
    getSummary: (data) => data.message || 'Fallback message',
  },
  {
    type: 'EscalateActivity',
    title: 'Escalate to Human',
    category: 'Exception Handling',
    color: '#ef4444',
    // Real signature: EscalateActivity(string id, string message) --
    // escalationMessage maps directly. escalationFlagKey has no basis in
    // the real class (hardcodes context.SetValue("EscalationRequested", true)
    // the same way FallbackActivity does) -- not included as a field.
    defaultData: { escalationMessage: 'Transferring to a human agent' },
    fields: [{ key: 'escalationMessage', label: 'Escalation Message', kind: 'textarea' }],
    ports: STANDARD_PORTS,
    getSummary: (data) => data.escalationMessage || 'Escalate to human',
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
