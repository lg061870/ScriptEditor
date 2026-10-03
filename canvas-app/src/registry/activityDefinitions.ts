/**
 * Activity registry: per-activity-type metadata driving the collapsed node
 * summary (Phase 1.2), the palette (Phase 1.3), the Inspector's field form
 * (Phase 1.5), and (Phase 4.1) each type's real port list.
 *
 * Originally seeded with 6 activity types from docs/conops_interactive_prototype.html
 * (Phase 1); Phase 5 (#33-#36) extended this to all 36 shapes in
 * docs/activity-shapes.md, verified field-by-field against the real
 * ConversaCore classes (not just copied from the doc -- several doc
 * fields turned out to have no basis in the actual framework, flagged
 * per-field below rather than silently included). `getActivityDefinition`
 * returns undefined for any type outside this catalog (e.g.
 * InvokeToolActivity, #37); callers fall back to generic behavior (plain
 * type name as summary/title, a raw key-value field editor, a generic
 * main-role Input/Output port pair) rather than a lookup crash.
 */

import type { DiagramPortDirection, DiagramPortRole, DiagramPortSide } from '../schema/diagram';

export type ActivityFieldKind = 'text' | 'textarea' | 'number' | 'boolean' | 'topic' | 'select';

export interface ActivityFieldOption {
  value: string;
  label: string;
}

export interface ActivityFieldDef {
  key: string;
  label: string;
  kind: ActivityFieldKind;
  options?: ActivityFieldOption[];
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
const EXCEPTION_OUTPUT: ActivityPortDef = { idSuffix: 'exc', name: 'Exception', direction: 'output', role: 'exception', type: 'flow', position: 'bottom' };
const CONTROL_OUTPUT: ActivityPortDef = { idSuffix: 'control', name: 'Control', direction: 'output', role: 'control', type: 'flow', position: 'right' };

const CARD_INPUT: ActivityPortDef = { idSuffix: 'card', name: 'Card', direction: 'input', role: 'aux-config', type: 'adaptive-card', position: 'left' };
const MODEL_INPUT: ActivityPortDef = { idSuffix: 'model', name: 'Model', direction: 'input', role: 'aux-config', type: 'adaptive-model', position: 'left' };
const ADAPTIVE_CARD_PORTS: ActivityPortDef[] = [MAIN_INPUT, MAIN_OUTPUT, EXCEPTION_OUTPUT, CARD_INPUT, MODEL_INPUT, CONTROL_OUTPUT];

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

export interface CompositeChildStep {
  id: string;
  type: string;
  name: string;
  data: Record<string, string>;
}

export const DEFAULT_COMPOSITE_STEPS: CompositeChildStep[] = [
  { id: 'step_1', type: 'SimpleActivity', name: 'Step1_Notice', data: { message: 'Starting composite sequence...' } },
];

export function parseCompositeSteps(rawData?: Record<string, string>): CompositeChildStep[] {
  if (rawData?.steps) {
    try {
      const parsed = JSON.parse(rawData.steps);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {
      // ignore
    }
  }
  return DEFAULT_COMPOSITE_STEPS;
}

/** Splits a delimited case-list field into trimmed, non-empty labels --
 * e.g. "case-a | case-b" (pipe, SwitchActivity/ConditionalActivity). */
function parseDelimitedLabels(raw: string | undefined, delimiter: string): string[] {
  if (!raw) return [];
  return raw
    .split(delimiter)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
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

/**
 * Ports for ConditionalActivity (If..Else condition):
 * - Input: left vertex
 * - Yes (first branch): right vertex
 * - No (second branch): bottom vertex (replaces where exception port was)
 * - Exception: top vertex (introducing balanced 4-vertex diamond symmetry)
 * - Control: hidden control output
 */
function conditionalPorts(data: Record<string, string>): ActivityPortDef[] {
  const cases = parseDelimitedLabels(data.cases || 'Yes | No', '|');
  const used = new Set<string>();
  const portDefs: ActivityPortDef[] = [MAIN_INPUT];

  cases.forEach((label, index) => {
    let idSuffix = `case-${slugify(label) || index}`;
    while (used.has(idSuffix)) idSuffix = `${idSuffix}-${index}`;
    used.add(idSuffix);
    // First case (Yes) on right apex, second case (No) on bottom apex, any additional on right
    const position: DiagramPortSide = index === 1 ? 'bottom' : 'right';
    portDefs.push({ idSuffix, name: label, direction: 'output', role: 'main', type: 'flow', position });
  });

  const hasDefault = Boolean(data.defaultBranch?.trim());
  if (hasDefault) {
    portDefs.push(DEFAULT_PORT);
  }

  // Exception port on top apex of the diamond shape
  portDefs.push({ idSuffix: 'exc', name: 'Exception', direction: 'output', role: 'exception', type: 'flow', position: 'top' });
  portDefs.push(CONTROL_OUTPUT);

  return portDefs;
}

export function parseParallelBranchLabels(rawBranches?: string, branchCount?: string): string[] {
  if (rawBranches && rawBranches.trim().length > 0) {
    const list = parseDelimitedLabels(rawBranches, '|');
    if (list.length > 0) return list;
  }
  const count = parseInt(branchCount || '2', 10);
  const n = isNaN(count) || count < 1 ? 2 : count;
  return Array.from({ length: n }, (_, i) => `Branch ${i + 1}`);
}

function parallelPorts(data: Record<string, string>): ActivityPortDef[] {
  const branchLabels = parseParallelBranchLabels(data.branches, data.branchCount);
  const used = new Set<string>();
  const branchDefs: ActivityPortDef[] = branchLabels.map((label, index) => {
    let idSuffix = `branch-${slugify(label) || index + 1}`;
    while (used.has(idSuffix)) idSuffix = `${idSuffix}-${index + 1}`;
    used.add(idSuffix);
    return { idSuffix, name: label, direction: 'output', role: 'main', type: 'flow', position: 'right' };
  });

  const hasJoinPort = data.includeJoinPort === 'true';
  const joinPort: ActivityPortDef = {
    idSuffix: 'branch-done',
    name: 'Done',
    direction: 'output',
    role: 'control',
    type: 'flow',
    position: 'right',
  };

  return [MAIN_INPUT, ...branchDefs, ...(hasJoinPort ? [joinPort] : []), EXCEPTION_OUTPUT];
}

function repeatPorts(): ActivityPortDef[] {
  return [
    MAIN_INPUT,
    { idSuffix: 'loop-body', name: 'Loop Body', direction: 'output', role: 'main', type: 'flow', position: 'right' },
    { idSuffix: 'loop-done', name: 'Done', direction: 'output', role: 'main', type: 'flow', position: 'right' },
    EXCEPTION_OUTPUT,
    CONTROL_OUTPUT,
  ];
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
    // Phase 5.3: docs/activity-shapes.md's Card/Model parameters describe
    // the Card/Model *ports* (aux-config, below) -- "(not connected)" is
    // their unwired default, not a text value -- so they're not listed as
    // `fields` here (cardName/modelName previously stood in for them as
    // plain text, which doesn't match either the doc or the real class:
    // AdaptiveCardActivity<TCard,TModel> needs an actual cardFactory
    // lambda + generic type args, no literal JSON form, the same gap
    // already flagged in JsonToCSharpTranscriber.cs). submissionContextKey/
    // required ARE the real SubmissionContextKey/IsRequired properties.
    defaultData: {
      submissionContextKey: 'adaptive-card-activity-1',
      required: 'true',
    },
    fields: [
      { key: 'submissionContextKey', label: 'Submission Context Key', kind: 'text' },
      { key: 'required', label: 'Required', kind: 'boolean' },
    ],
    ports: ADAPTIVE_CARD_PORTS,
    getSummary: (data) => `Submission: ${data.submissionContextKey || 'adaptive-card-activity-1'} (Required: ${data.required !== 'false'})`,
  },
  {
    type: 'QuickAnswerActivity',
    title: 'Quick Choices',
    category: 'Interaction',
    color: '#f59e0b',
    defaultData: {
      question: 'Would you like an instant quote or to talk to an agent?',
      optionsMode: 'static',
      answers: 'Instant Quote | Talk to Agent | More Info',
      answersVariable: '',
      outputVariable: 'selectedChoice',
      required: 'true',
    },
    fields: [
      { key: 'question', label: 'Question', kind: 'textarea' },
      { key: 'optionsMode', label: 'Options Mode', kind: 'text' },
      { key: 'answers', label: 'Answers (pipe-separated)', kind: 'text' },
      { key: 'answersVariable', label: 'Options Variable Name', kind: 'text' },
      { key: 'outputVariable', label: 'Save Selection to Variable', kind: 'text' },
      { key: 'required', label: 'Required', kind: 'boolean' },
    ],
    ports: STANDARD_PORTS,
    getSummary: (data) => {
      const q = data.question || 'Choose an option';
      const isVar = data.optionsMode === 'variable' || (data.answersVariable && data.optionsMode !== 'static');
      const opts = isVar ? `{${data.answersVariable || 'choices'}}` : `[${data.answers || ''}]`;
      const out = data.outputVariable ? ` -> {${data.outputVariable}}` : '';
      return `Q: ${q} ${opts}${out}`;
    },
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
    defaultData: {
      childCount: '1',
      isolateContext: 'false',
      completeMessage: 'Composite completed',
      steps: JSON.stringify(DEFAULT_COMPOSITE_STEPS),
    },
    fields: [
      { key: 'isolateContext', label: 'Isolate Context', kind: 'boolean' },
      { key: 'completeMessage', label: 'Complete Message', kind: 'text' },
    ],
    ports: STANDARD_PORTS,
    getSummary: (data) => {
      const steps = parseCompositeSteps(data);
      return `${steps.length} sequential step${steps.length === 1 ? '' : 's'} (isolated: ${data.isolateContext === 'true'})`;
    },
  },
  {
    type: 'StartNode',
    title: 'Start',
    category: 'Sequence',
    color: '#10b981',
    defaultData: {},
    fields: [],
    ports: [MAIN_OUTPUT],
    getSummary: () => 'Workflow Entry Point',
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
    // EndActivity terminates the flow -- 1 input, 0 outputs (terminal node).
    ports: [MAIN_INPUT],
    getSummary: (data) => data?.endMessage || 'End conversation',
  },
  {
    type: 'PromptActivity',
    title: 'Risk Analysis AI',
    category: 'AI',
    color: '#8b5cf6',
    // Phase 5.3: real class is PromptActivity : SemanticActivity, ctor
    // (activityId, Kernel, ILogger) -- Kernel/ILogger have no literal JSON
    // form (generic-fallback transcription only, unchanged by this
    // rename). systemPrompt/userPromptTemplate/temperature ARE the real
    // settable SystemPrompt/UserPromptTemplate/Temperature properties --
    // replaces the previous prompt/model fields, which matched neither
    // the doc nor the real class.
    defaultData: {
      systemPrompt: 'You are an empathetic insurance assistant.',
      userPromptTemplate: 'User message: {context.Basics_UserPrompt}.',
      temperature: '0.7',
    },
    fields: [
      { key: 'systemPrompt', label: 'System Prompt', kind: 'textarea' },
      { key: 'userPromptTemplate', label: 'User Prompt Template', kind: 'textarea' },
      { key: 'temperature', label: 'Temperature', kind: 'number' },
    ],
    ports: STANDARD_PORTS,
    getSummary: (data) => `Prompt: ${data.systemPrompt}`,
  },
  {
    type: 'TriggerTopicActivity',
    title: 'Call Subtopic',
    category: 'Flow',
    color: '#8b5cf6',
    // Phase 5.4: field renamed from `subTopicName` to `topicToTrigger`,
    // matching both docs/activity-shapes.md and the real constructor's
    // own parameter name (TriggerTopicActivity(string id, string
    // topicToTrigger, ...)) exactly. Also renamed in Transcription/
    // JsonToCSharpTranscriber.cs and CSharpToJsonParser.cs, which DO have
    // a per-type case for this (one of Phase 3.1's original 4
    // verified-compilable types), so both directions of the JSON<->C#
    // round trip needed updating, not just the registry.
    defaultData: { topicToTrigger: 'QuoteGenerationTopic', waitForCompletion: 'true' },
    fields: [
      { key: 'topicToTrigger', label: 'Topic To Trigger', kind: 'topic' },
      { key: 'waitForCompletion', label: 'Wait For Completion', kind: 'boolean' },
    ],
    ports: STANDARD_PORTS,
    getSummary: (data) => `Subtopic: ${data.topicToTrigger} (Wait: ${data.waitForCompletion})`,
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
  // statements a port-based edge could target.
  // So these ports make branching *expressible on the canvas*
  // (this task's actual scope, a Phase 4/Ports-&-Routing concern); making
  // JsonToCSharpTranscriber emit real per-case C# for each of them is a
  // separate, larger Phase 3-adjacent gap, consistent with Phase 3.1's
  // already-documented best-effort/"may not compile" fallback for any
  // type without a specific generator.
  {
    type: 'ConditionalActivity',
    title: 'If Then Else',
    category: 'Logic',
    color: '#ec4899',
    defaultData: { selectorKey: 'ConditionKey', cases: 'Yes | No', defaultBranch: '' },
    fields: [
      { key: 'selectorKey', label: 'Selector Key', kind: 'text' },
      { key: 'cases', label: 'Cases (pipe-separated)', kind: 'text' },
      { key: 'defaultBranch', label: 'Default Branch', kind: 'text' },
    ],
    ports: conditionalPorts,
    getSummary: (data) => (data.selectorKey ? `If ${data.selectorKey}` : 'If-Else Condition'),
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
    title: 'While',
    category: 'Logic',
    color: '#0891b2',
    defaultData: {
      loopMode: 'while predicate',
      collectionKey: 'BasicsLearningLoop_Collection',
      continuePrompt: 'custom predicate controls continuation',
      iterationVariable: 'count',
    },
    fields: [
      { key: 'iterationVariable', label: 'Counter Variable', kind: 'text' },
      {
        key: 'loopMode',
        label: 'Loop Mode',
        kind: 'select',
        options: [
          { value: 'user_prompt', label: 'User Prompted (Ask user to continue)' },
          { value: 'fixed_count', label: 'Fixed Count (Repeat N times)' },
          { value: 'while_condition', label: 'While Condition (Repeat while true)' },
        ],
      },
      { key: 'continuePrompt', label: 'Continue Prompt', kind: 'text' },
      { key: 'collectionKey', label: 'Collection Key (Context variable)', kind: 'text' },
      { key: 'iterations', label: 'Iterations (Count)', kind: 'number' },
      { key: 'condition', label: 'Condition Expression', kind: 'text' },
    ],
    ports: repeatPorts,
    getSummary: (data) =>
      data.loopMode === 'fixed_count'
        ? `While ${data.iterations || 3} times`
        : data.loopMode === 'while_condition'
        ? `While: ${data.condition || 'true'}`
        : `While prompt: "${data.continuePrompt || 'Would you like to add another?'}"`,
  },
  {
    type: 'ForEachActivity',
    title: 'For Each',
    category: 'Logic',
    color: '#0891b2',
    defaultData: { collectionKey: 'Items', itemKey: 'item', indexKey: 'index', loopMode: 'for_each' },
    fields: [
      { key: 'collectionKey', label: 'Collection Key', kind: 'text' },
      { key: 'itemKey', label: 'Item Key', kind: 'text' },
      { key: 'indexKey', label: 'Index Key', kind: 'text' },
    ],
    ports: repeatPorts,
    getSummary: (data) => `For each ${data.itemKey || 'item'} in ${data.collectionKey || 'Items'}`,
  },
  {
    type: 'ParallelActivity',
    title: 'Parallel Branches',
    category: 'Logic',
    color: '#0891b2',
    defaultData: { branchCount: '2', branches: 'Branch 1 | Branch 2', continueOnError: 'false', completeMessage: '', includeJoinPort: 'false' },
    fields: [
      { key: 'branches', label: 'Branches (pipe-separated)', kind: 'text' },
      { key: 'branchCount', label: 'Branch Count', kind: 'number' },
      { key: 'continueOnError', label: 'Continue On Error', kind: 'boolean' },
      { key: 'completeMessage', label: 'Complete Message', kind: 'text' },
    ],
    ports: parallelPorts,
    getSummary: (data) => `${parseParallelBranchLabels(data.branches, data.branchCount).length} parallel branches`,
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
  // Phase 5.3: Variables & State + I/O categories (docs/activity-shapes.md).
  {
    type: 'SetVariableActivity',
    title: 'Set Variable',
    category: 'Variables & State',
    color: '#0d9488',
    defaultData: { variableName: 'Global_Example', value: '', isGlobal: 'true', validateNaming: 'true' },
    fields: [
      { key: 'variableName', label: 'Variable Name', kind: 'text' },
      { key: 'value', label: 'Value', kind: 'text' },
      { key: 'isGlobal', label: 'Is Global', kind: 'boolean' },
      { key: 'validateNaming', label: 'Validate Naming', kind: 'boolean' },
    ],
    ports: STANDARD_PORTS,
    getSummary: (data) => `Set ${data.variableName || 'Variable'} = ${data.value ?? ''}`,
  },
  {
    type: 'GlobalVariableActivity',
    title: 'Promote to Global',
    category: 'Variables & State',
    color: '#0d9488',
    defaultData: { promotionMode: 'all', sourceKey: '', globalKey: 'Global_<Key>' },
    fields: [
      {
        key: 'promotionMode',
        label: 'Promotion Mode',
        kind: 'select',
        options: [
          { value: 'all', label: 'All Context Variables' },
          { value: 'specific', label: 'Specific Variable' },
        ],
      },
      { key: 'sourceKey', label: 'Source Key', kind: 'text' },
      { key: 'globalKey', label: 'Global Key', kind: 'text' },
    ],
    ports: STANDARD_PORTS,
    getSummary: (data) =>
      data.promotionMode === 'specific' || Boolean(data.sourceKey)
        ? `Promote ${data.sourceKey || 'variable'} → ${data.globalKey && data.globalKey !== 'Global_<Key>' ? data.globalKey : (data.sourceKey ? (data.sourceKey.startsWith('Global_') ? data.sourceKey : `Global_${data.sourceKey}`) : 'Global_...')}`
        : 'Promote all variables to global scope',
  },
  {
    type: 'DumpCtxActivity',
    title: 'Dump Context',
    category: 'Variables & State',
    color: '#0d9488',
    defaultData: { developmentMode: 'true', outputType: 'DumpCtx' },
    fields: [
      { key: 'developmentMode', label: 'Development Mode', kind: 'boolean' },
      { key: 'outputType', label: 'Output Type', kind: 'text' },
    ],
    ports: STANDARD_PORTS,
    getSummary: (data) => `Dump context (${data.developmentMode !== 'false' ? 'Dev mode' : 'Silent'})`,
  },
  {
    type: 'ResetActivity',
    title: 'Reset Session',
    category: 'Variables & State',
    color: '#0d9488',
    defaultData: { resetMessage: 'Session reset completed' },
    fields: [{ key: 'resetMessage', label: 'Reset Message', kind: 'textarea' }],
    ports: STANDARD_PORTS,
    getSummary: (data) => data.resetMessage || 'Reset session',
  },
  {
    type: 'WaitForUserInputActivity',
    title: 'Wait For User Input',
    category: 'Interaction',
    color: '#f59e0b',
    // Catalog previously used the doc heading's shorthand
    // 'WaitForUserInput' as the literal type string; the real class is
    // WaitForUserInputActivity (extends AdaptiveCardActivity<WaitForUserInputModel>)
    // -- same category of bug as PromptAttentionActivity/SemanticResponse,
    // fixed as part of #38's drift pass. Still needs TopicWorkflowContext/
    // ILogger, the same generic-fallback gap as AdaptiveCardActivity
    // itself, so this remains best-effort even with the correct class
    // name. prompt/modelContextKey both map to
    // real constructor params; `required` is kept for doc-parity (the
    // real class always sets IsRequired = true internally, not
    // configurable via a field).
    defaultData: { prompt: 'Ask your question about insurance basics:', modelContextKey: 'wait_for_user_input', required: 'true' },
    fields: [
      { key: 'prompt', label: 'Prompt', kind: 'textarea' },
      { key: 'modelContextKey', label: 'Model Context Key', kind: 'text' },
      { key: 'required', label: 'Required (always true on the real class)', kind: 'boolean' },
    ],
    ports: STANDARD_PORTS,
    getSummary: (data) => data.prompt || 'Wait for user input',
  },
  {
    type: 'ShowSuggestionsActivity',
    title: 'Show Suggestions',
    category: 'Interaction',
    color: '#f59e0b',
    // Real signature: ShowSuggestionsActivity(string id, IEnumerable<string>
    // suggestions, string? eventName = null) -- fully literal, no framework
    // service dependency. Both fields map directly.
    defaultData: { suggestions: 'Option 1 | Option 2', eventName: 'UpdateSuggestions' },
    fields: [
      { key: 'suggestions', label: 'Suggestions (pipe-separated)', kind: 'text' },
      { key: 'eventName', label: 'Event Name', kind: 'text' },
    ],
    ports: STANDARD_PORTS,
    getSummary: (data) => `Suggest: [${data.suggestions}]`,
  },
  {
    type: 'InteractiveActivity',
    title: 'Interactive Prompt',
    category: 'Interaction',
    color: '#f59e0b',
    // Real signature: InteractiveActivity(string id, string message) --
    // fully literal. inputContextKey/inputRequired map to the real
    // InputContextKey/IsInputRequired properties. modelContextKey has no
    // basis in this class (kept for doc-parity only).
    defaultData: {
      message: 'Please provide your input',
      inputContextKey: 'interactive-activity-1',
      modelContextKey: 'interactive-activity-1_model',
      inputRequired: 'true',
    },
    fields: [
      { key: 'message', label: 'Message', kind: 'textarea' },
      { key: 'inputContextKey', label: 'Input Context Key', kind: 'text' },
      { key: 'modelContextKey', label: 'Model Context Key (not yet transcribable)', kind: 'text' },
      { key: 'inputRequired', label: 'Input Required', kind: 'boolean' },
    ],
    ports: STANDARD_PORTS,
    getSummary: (data) => data.message || 'Wait for interactive input',
  },
  {
    type: 'ChatPromptAttentionActivity',
    title: 'Prompt Attention',
    category: 'Interaction',
    color: '#f59e0b',
    // Real class is ChatPromptAttentionActivity -- the catalog previously
    // used PromptAttentionActivity, which doesn't exist in ConversaCore.
    // Since BuildGenericFallback uses the type string as the literal C#
    // class name, that mismatch made this shape uncompilable. Fixed as
    // part of #38's drift pass.
    defaultData: { message: 'Please answer to continue', durationMs: '3000', eventName: 'PromptAttention' },
    fields: [
      { key: 'message', label: 'Message', kind: 'textarea' },
      { key: 'durationMs', label: 'Duration (ms)', kind: 'number' },
      { key: 'eventName', label: 'Event Name', kind: 'text' },
    ],
    ports: STANDARD_PORTS,
    getSummary: (data) => data.message || 'Prompt attention',
  },
  // Phase 5.4: Events/Subroutines + Semantic/AI + Security categories
  // (docs/activity-shapes.md).
  {
    type: 'EventTriggerActivity',
    title: 'Trigger Event',
    category: 'Logic',
    color: '#7c3aed',
    // Real signature: EventTriggerActivity(string id, string eventName,
    // object? eventData = null, bool waitForResponse = false, string?
    // responseContextKey = null, TimeSpan? responseTimeout = null,
    // ILogger? logger = null, IConversationContext? conversationContext =
    // null) -- fully literal aside from the optional logger/context.
    // timeoutMs maps to the real responseTimeout TimeSpan param (same
    // millisecond convention as DelayActivity's durationMs, Phase 5.1).
    defaultData: { eventName: 'CustomEvent', waitForResponse: 'false', responseContextKey: '', timeoutMs: '300000' },
    fields: [
      { key: 'eventName', label: 'Event Name', kind: 'text' },
      { key: 'waitForResponse', label: 'Wait For Response', kind: 'boolean' },
      { key: 'responseContextKey', label: 'Response Context Key', kind: 'text' },
      { key: 'timeoutMs', label: 'Timeout (ms)', kind: 'number' },
    ],
    ports: STANDARD_PORTS,
    getSummary: (data) => `Trigger: ${data.eventName}`,
  },
  {
    type: 'ExecuteTopicActivity',
    title: 'Execute Topic',
    category: 'Logic',
    color: '#7c3aed',
    // Real signature: ExecuteTopicActivity(string id, string topicName,
    // ITopicRegistry topicRegistry) -- topicName maps directly;
    // ITopicRegistry is a framework service with no literal JSON form
    // (generic-fallback transcription only). resultContextKey has no
    // basis in the real class (no matching property found).
    defaultData: { topicName: 'SubTopicName', resultContextKey: 'execute-topic-activity-1_TopicResult' },
    fields: [
      { key: 'topicName', label: 'Topic Name', kind: 'text' },
      { key: 'resultContextKey', label: 'Result Context Key (not yet transcribable)', kind: 'text' },
    ],
    ports: STANDARD_PORTS,
    getSummary: (data) => `Execute: ${data.topicName}`,
  },
  {
    type: 'CompleteTopicActivity',
    title: 'Complete Topic',
    category: 'Logic',
    color: '#7c3aed',
    // Real signature: CompleteTopicActivity(string id, object?
    // completionData = null, string? completionMessage = null, ILogger?
    // logger = null, IConversationContext? conversationContext = null).
    // completionMessage maps directly (CompletionMessage). completionData
    // is a real param too, but it's `object?`, not a "data key" string --
    // completionDataKey doesn't match its actual shape. resumeTopicKey has
    // no basis in the class at all.
    defaultData: { completionMessage: 'Topic completed', completionDataKey: 'SubTopicCompletionData', resumeTopicKey: 'NextTopic' },
    fields: [
      { key: 'completionMessage', label: 'Completion Message', kind: 'textarea' },
      { key: 'completionDataKey', label: 'Completion Data Key (not yet transcribable)', kind: 'text' },
      { key: 'resumeTopicKey', label: 'Resume Topic Key (not yet transcribable)', kind: 'text' },
    ],
    ports: STANDARD_PORTS,
    getSummary: (data) => data.completionMessage || 'Complete topic',
  },
  {
    type: 'MultipleTopicsMatchedActivity',
    title: 'Multiple Topics Matched',
    category: 'Logic',
    color: '#7c3aed',
    // Real signature: MultipleTopicsMatchedActivity(string id, string
    // message) -- fully literal, message maps directly.
    defaultData: { message: 'I found multiple matches. Can you clarify?' },
    fields: [{ key: 'message', label: 'Message', kind: 'textarea' }],
    ports: STANDARD_PORTS,
    getSummary: (data) => data.message || 'Multiple topics matched',
  },
  {
    type: 'InvokeToolActivity',
    title: 'Invoke Tool',
    category: 'Tools',
    color: '#0284c7',
    // Real signature: InvokeToolActivity<TTool, TRequest, TResult>(
    //   string id, string toolId, IToolExecutor executor,
    //   Func<TopicWorkflowContext, TRequest> requestFactory,
    //   Func<TopicWorkflowContext, ToolExecutionContext> executionContextFactory,
    //   string resultContextKey, ILogger<TopicFlowActivity>? logger = null)
    // toolId maps to the tool identifier, resultContextKey stores the ToolResult<TResult>.
    // C# transcription scaffolds Create<ActivityId>Request and Create<ActivityId>ExecutionContext.
    defaultData: {
      toolId: 'LeadScoringTool',
      toolType: 'LeadScoringTool',
      requestType: 'LeadScoringRequest',
      resultType: 'LeadScoringResult',
      resultContextKey: 'lead_score_result',
    },
    fields: [
      { key: 'toolId', label: 'Tool ID', kind: 'text' },
      { key: 'toolType', label: 'Tool Type (C# class)', kind: 'text' },
      { key: 'requestType', label: 'Request Type (C# class)', kind: 'text' },
      { key: 'resultType', label: 'Result Type (C# class)', kind: 'text' },
      { key: 'resultContextKey', label: 'Result Context Key', kind: 'text' },
    ],
    ports: STANDARD_PORTS,
    getSummary: (data) => `Invoke tool ${data.toolId || data.toolType || 'unconfigured'}`,
  },
  {
    type: 'SemanticResponseActivity',
    title: 'Semantic Response',
    category: 'AI',
    color: '#8b5cf6',
    // Real class is SemanticResponseActivity -- the catalog previously
    // used SemanticResponse, which doesn't exist in ConversaCore. Since
    // BuildGenericFallback uses the type string as the literal C# class
    // name, that mismatch made this shape uncompilable. Fixed as part of
    // #38's drift pass. Real ctor needs Kernel/ILogger (generic-fallback
    // gap, same as PromptActivity).
    // collection maps to the real collectionName param; userPromptKey
    // maps to the real UserPromptContextKey property; skipLlmThreshold
    // maps to the real SkipLLMThreshold property.
    defaultData: { collection: 'insurance_basics_intel', userPromptKey: 'Basics_UserPrompt', skipLlmThreshold: '0.9' },
    fields: [
      { key: 'collection', label: 'Collection', kind: 'text' },
      { key: 'userPromptKey', label: 'User Prompt Key', kind: 'text' },
      { key: 'skipLlmThreshold', label: 'Skip LLM Threshold', kind: 'number' },
    ],
    ports: STANDARD_PORTS,
    getSummary: (data) => `Semantic response from ${data.collection}`,
  },
  {
    type: 'SemanticQueryActivity',
    title: 'Semantic Query',
    category: 'AI',
    color: '#8b5cf6',
    // The deepest structural gap in the catalog: real class is
    // SemanticQueryActivity<TRuleSet, TInput, TOutput> (3 generic type
    // params, each constrained to a real interface), needs Kernel/ILogger
    // plus concrete typed ruleSet/input instances passed into its
    // constructor. None of the doc's parameters (ruleSetType/inputSource/
    // outputContextKey/runInBackground) correspond to anything in this
    // signature -- kept entirely for doc-parity, not transcribable at all.
    defaultData: { ruleSetType: 'DomainRuleSet', inputSource: 'context', outputContextKey: 'output_query_semantic-query-activity-1', runInBackground: 'false' },
    fields: [
      { key: 'ruleSetType', label: 'Rule Set Type (not yet transcribable)', kind: 'text' },
      { key: 'inputSource', label: 'Input Source (not yet transcribable)', kind: 'text' },
      { key: 'outputContextKey', label: 'Output Context Key (not yet transcribable)', kind: 'text' },
      { key: 'runInBackground', label: 'Run In Background (not yet transcribable)', kind: 'boolean' },
    ],
    ports: STANDARD_PORTS,
    getSummary: (data) => `Query: ${data.ruleSetType}`,
  },
  {
    type: 'SignInActivity',
    title: 'Sign In',
    category: 'Security',
    color: '#dc2626',
    // Real signature: SignInActivity(string id, string message) --
    // fully literal, message maps directly.
    defaultData: { message: 'Please sign in to continue' },
    fields: [{ key: 'message', label: 'Message', kind: 'textarea' }],
    ports: STANDARD_PORTS,
    getSummary: (data) => data.message || 'Sign in',
  },
];

const BY_TYPE: Record<string, ActivityDefinition> = Object.fromEntries(
  DEFINITIONS.map((definition) => [definition.type, definition]),
);

export const ACTIVITY_ICONS: Record<string, string> = {
  // Sequence
  StartNode: '🚀',
  SimpleActivity: '💬',
  CompositeActivity: '📦',
  DelayActivity: '⏱️',
  EndActivity: '🛑',
  // Selection
  ConditionalActivity: '⚖️',
  DecisionActivity: '🔀',
  SwitchActivity: '🎛️',
  // Iteration
  RepeatActivity: '🔁',
  ForEachActivity: '🔄',
  // Concurrency
  ParallelActivity: '🔀',
  // Exception Handling
  FallbackActivity: '🛟',
  EscalateActivity: '📢',
  // Variables & State
  SetVariableActivity: '📝',
  GlobalVariableActivity: '🌐',
  DumpCtxActivity: '🗂️',
  ResetActivity: '🔄',
  // I/O
  WaitForUserInputActivity: '⏳',
  PromptActivity: '❓',
  QuickAnswerActivity: '⚡',
  AdaptiveCardActivity: '🪪',
  ShowSuggestionsActivity: '💡',
  InteractiveActivity: '👆',
  ChatPromptAttentionActivity: '⚠️',
  // Events & Subroutines
  EventTriggerActivity: '⚡',
  TriggerTopicActivity: '📞',
  ExecuteTopicActivity: '▶️',
  CompleteTopicActivity: '🏁',
  MultipleTopicsMatchedActivity: '🔀',
  InvokeToolActivity: '🛠️',
  // Semantic/AI
  SemanticResponseActivity: '🤖',
  SemanticQueryActivity: '🔍',
  // Security
  SignInActivity: '🔐',
};

export const ACTIVITY_DESCRIPTIONS: Record<string, string> = {
  StartNode: 'Conversation Entry Point. Execution begins here.',
  SimpleActivity: 'Sends a text response or message to the conversation',
  CompositeActivity: 'Executes a sequential pipeline of child activities',
  DelayActivity: 'Pauses execution for a specified duration in milliseconds',
  EndActivity: 'Terminates the current topic flow execution',
  ConditionalActivity: 'Branches flow based on a boolean condition',
  DecisionActivity: 'Multi-way branching based on decision rules',
  SwitchActivity: 'Evaluates an expression and branches to matching cases',
  RepeatActivity: 'Repeats a flow block while or until a condition is met',
  ForEachActivity: 'Iterates sequentially over items in a collection',
  ParallelActivity: 'Executes multiple branch flows concurrently',
  FallbackActivity: 'Executes alternate logic when a primary activity fails',
  EscalateActivity: 'Escalates execution or transfers to a human agent',
  SetVariableActivity: 'Assigns values or expressions to context variables',
  GlobalVariableActivity: 'Reads or writes global workspace variables',
  DumpCtxActivity: 'Logs current context variables for debugging and diagnostics',
  ResetActivity: 'Resets topic variables and clears conversation state',
  WaitForUserInputActivity: 'Pauses and waits for the next incoming user message',
  PromptActivity: 'Prompts user for input and waits for their response',
  QuickAnswerActivity: 'Returns an instant automated answer from FAQ or knowledge',
  AdaptiveCardActivity: 'Displays an interactive adaptive card form or UI card',
  ShowSuggestionsActivity: 'Presents quick reply suggestion chips to the user',
  InteractiveActivity: 'Renders an interactive custom UI widget',
  ChatPromptAttentionActivity: 'Displays a high-priority banner or attention prompt',
  EventTriggerActivity: 'Listens for and triggers on external system events',
  TriggerTopicActivity: 'Executes another topic flow as an embedded subroutine',
  ExecuteTopicActivity: 'Transfers execution control to another topic flow',
  CompleteTopicActivity: 'Marks the topic flow as successfully completed',
  MultipleTopicsMatchedActivity: 'Disambiguates when multiple topic intents match',
  InvokeToolActivity: 'Invokes an external tool, function, or API plugin',
  SemanticResponseActivity: 'Generates an AI response using semantic rules or LLM',
  SemanticQueryActivity: 'Performs semantic vector search across knowledge base',
  SignInActivity: 'Requests user authentication or OAuth credentials',
};

export function getActivityIcon(type: string): string {
  return ACTIVITY_ICONS[type] ?? '⚙️';
}

export function getActivityDescription(type: string): string {
  return ACTIVITY_DESCRIPTIONS[type] ?? getActivityDefinition(type)?.getSummary({}) ?? type;
}

export function getActivityDefinition(type: string): ActivityDefinition | undefined {
  return BY_TYPE[type];
}

export function getNodeSummary(type: string, data?: Record<string, string>): string {
  return getActivityDefinition(type)?.getSummary(data ?? {}) ?? type;
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
