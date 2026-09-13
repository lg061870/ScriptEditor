/**
 * Phase 6.1: walks the current DiagramDocument to drive the chat preview
 * pane -- a "realistically stubbed execution" (this task's own acceptance
 * criteria), not a real ConversaCore runtime. There is no backend
 * execution to call yet (that's Phase 6.2, which wires this pane to the
 * Phase 3.4 on-demand compile+load); everything here runs client-side
 * against the same DiagramDocument the canvas/code panel already read.
 *
 * Traversal follows the EDGE graph (each node's main-role output port's
 * wired connection), not document.nodes array order. This is deliberately
 * ahead of what JsonToCSharpTranscriber.cs currently compiles --
 * BuildWorkflow() only emits Add(...) calls in array order today (see
 * that file's own doc comment) and doesn't respect branching topology at
 * all yet. Previewing the authored graph is what "runs the current flow"
 * means to whoever is looking at this panel; conflating it with the
 * compiler's current array-order limitation would make the preview less
 * useful, not more honest. The gap between the two is real and already
 * tracked (#46, Dynamic ConversaCore Reflection Catalog) -- not something
 * this module should paper over, so it's flagged here rather than assumed
 * away silently.
 *
 * Grounding: every field this reads (message, endMessage, durationMs,
 * answers, prompt, ...) was verified against the real ConversaCore
 * classes during Phase 5 -- see registry/activityDefinitions.ts's own
 * per-type comments. Where a type's real behavior can't be represented
 * (no Kernel/TopicWorkflowContext/ILogger to actually run against, no
 * real adaptive-card schema, no real sub-topic execution), this falls
 * back to getNodeSummary()'s already-grounded one-line description
 * rendered as a system-style status line, exactly like the rest of this
 * app already discloses an unmodeled gap rather than faking it.
 */
import type { DiagramDocument, DiagramEdge, DiagramNode } from '../schema/diagram';
import { getNodeSummary } from '../registry/activityDefinitions';

export type ChatStep =
  | { kind: 'bot'; text: string }
  | { kind: 'user'; text: string }
  | { kind: 'system'; text: string }
  | { kind: 'card-stub'; title: string; note: string }
  | { kind: 'delay'; ms: number };

export type WaitKind = 'text' | 'choice' | 'click' | null;

export interface AdvanceResult {
  steps: ChatStep[];
  /** The node the walk is paused at (waiting on the user), or the node
   * about to be visited on the next call when resuming a text/choice/click
   * wait. Null once the walk has ended or hit a dead end. */
  currentNodeId: string | null;
  waiting: WaitKind;
  waitOptions?: string[];
  waitButtonLabel?: string;
  ended: boolean;
  deadEnd: boolean;
  /** Sticky until the next node that sets or clears it -- mirrors
   * CustomChatWindowV3.razor's own suggestion-chip row living alongside
   * (not inside) the message list. */
  suggestionChips?: string[];
  promptAttention?: { text: string; durationMs: number } | null;
}

export function findEntryNode(document: DiagramDocument): DiagramNode | null {
  const targeted = new Set(document.edges.filter((e) => e.to).map((e) => e.to!.node));
  return document.nodes.find((n) => !targeted.has(n.id)) ?? document.nodes[0] ?? null;
}

function findNode(document: DiagramDocument, nodeId: string): DiagramNode | undefined {
  return document.nodes.find((n) => n.id === nodeId);
}

function mainOutputPorts(node: DiagramNode) {
  return node.ports.filter((p) => p.direction === 'output' && p.role === 'main');
}

function edgeFromPort(document: DiagramDocument, portId: string): DiagramEdge | undefined {
  return document.edges.find((e) => e.from.port === portId && e.to);
}

/** Result of visiting one node exactly once, either freshly (`resumeValue`
 * undefined) or as the resume of a wait left over from the previous call
 * (`resumeValue` set). Only ever produced for the first node an
 * `advance()` call touches -- every later node in the same call is always
 * a fresh visit. */
type VisitOutcome =
  | { kind: 'auto'; steps: ChatStep[]; suggestionChips?: string[]; promptAttention?: AdvanceResult['promptAttention'] }
  | { kind: 'auto-branch'; steps: ChatStep[]; chosenPortName: string }
  | { kind: 'wait'; steps: ChatStep[]; waiting: WaitKind; waitOptions?: string[]; waitButtonLabel?: string }
  | { kind: 'end'; steps: ChatStep[] };

function visitNode(node: DiagramNode, resumeValue: string | undefined): VisitOutcome {
  const data = node.data;
  const summary = () => getNodeSummary(node.type, data);
  const branchPorts = mainOutputPorts(node);
  const isBranching = branchPorts.length > 1;

  if (isBranching) {
    if (resumeValue === undefined) {
      return { kind: 'wait', steps: [], waiting: 'choice', waitOptions: branchPorts.map((p) => p.name) };
    }
    return { kind: 'auto-branch', steps: [{ kind: 'user', text: resumeValue }], chosenPortName: resumeValue };
  }

  switch (node.type) {
    case 'SimpleActivity':
      return { kind: 'auto', steps: [{ kind: 'bot', text: data.message || summary() }] };

    case 'EndActivity':
      return { kind: 'end', steps: data.endMessage ? [{ kind: 'bot', text: data.endMessage }] : [] };

    case 'CompleteTopicActivity':
      return { kind: 'end', steps: [{ kind: 'bot', text: data.completionMessage || summary() }] };

    case 'GreetingActivity':
      return { kind: 'auto', steps: [{ kind: 'bot', text: data.greeting || summary() }] };

    case 'MultipleTopicsMatchedActivity':
      return { kind: 'auto', steps: [{ kind: 'bot', text: data.message || summary() }] };

    case 'ResetActivity':
      return { kind: 'auto', steps: [{ kind: 'bot', text: data.resetMessage || summary() }] };

    case 'WaitForUserInputActivity':
    case 'InteractiveActivity': {
      const prompt = data.prompt || data.message || summary();
      if (resumeValue === undefined) {
        return { kind: 'wait', steps: [{ kind: 'bot', text: prompt }], waiting: 'text' };
      }
      return { kind: 'auto', steps: [{ kind: 'user', text: resumeValue }] };
    }

    case 'QuickAnswerActivity': {
      const options = (data.answers || '').split('|').map((s) => s.trim()).filter(Boolean);
      if (resumeValue === undefined) {
        return { kind: 'wait', steps: [], waiting: 'choice', waitOptions: options.length > 0 ? options : ['Continue'] };
      }
      return { kind: 'auto', steps: [{ kind: 'user', text: resumeValue }] };
    }

    case 'SignInActivity': {
      if (resumeValue === undefined) {
        return {
          kind: 'wait',
          steps: [{ kind: 'bot', text: data.message || summary() }],
          waiting: 'click',
          waitButtonLabel: 'Sign In',
        };
      }
      return { kind: 'auto', steps: [{ kind: 'user', text: 'Signed in' }] };
    }

    case 'AdaptiveCardActivity': {
      if (resumeValue === undefined) {
        return {
          kind: 'wait',
          steps: [
            {
              kind: 'card-stub',
              title: node.name || 'Form',
              note: 'Real card/model schema has no literal JSON representation yet (see registry/activityDefinitions.ts) -- shown as a stub.',
            },
          ],
          waiting: 'click',
          waitButtonLabel: 'Continue',
        };
      }
      return { kind: 'auto', steps: [] };
    }

    case 'ChatPromptAttentionActivity': {
      const durationMs = Number.parseInt(data.durationMs || '3000', 10) || 3000;
      return {
        kind: 'auto',
        steps: [{ kind: 'system', text: `✦ Prompt attention: ${data.message || summary()}` }],
        promptAttention: { text: data.message || summary(), durationMs },
      };
    }

    case 'ShowSuggestionsActivity': {
      const chips = (data.suggestions || '').split('|').map((s) => s.trim()).filter(Boolean);
      return { kind: 'auto', steps: [], suggestionChips: chips };
    }

    case 'DelayActivity': {
      const ms = Number.parseInt(data.durationMs || '1000', 10) || 1000;
      return { kind: 'auto', steps: [{ kind: 'delay', ms: Math.min(ms, 1500) }] };
    }

    case 'EventTriggerActivity':
      return { kind: 'auto', steps: [{ kind: 'system', text: `📡 Event '${data.eventName || 'CustomEvent'}' triggered` }] };

    case 'TriggerTopicActivity':
      return { kind: 'auto', steps: [{ kind: 'system', text: `🔀 Subtopic '${data.topicToTrigger || '?'}' invoked` }] };

    case 'ExecuteTopicActivity':
      return { kind: 'auto', steps: [{ kind: 'system', text: `🔀 Subtopic '${data.topicName || '?'}' executed` }] };

    case 'PromptActivity':
    case 'SemanticResponseActivity':
    case 'SemanticQueryActivity':
    case 'DecisionActivity':
      return { kind: 'auto', steps: [{ kind: 'system', text: `🧠 ${summary()}` }] };

    case 'SetVariableActivity':
    case 'GlobalVariableActivity':
    case 'DumpCtxActivity':
      return { kind: 'auto', steps: [{ kind: 'system', text: `🔧 ${summary()}` }] };

    case 'OnErrorActivity':
    case 'FallbackActivity':
    case 'EscalateActivity':
    case 'CompositeActivity':
    case 'ParallelActivity':
    case 'ForEachActivity':
    case 'RepeatActivity':
      return { kind: 'auto', steps: [{ kind: 'system', text: `⚙️ ${summary()} (not simulated further)` }] };

    default:
      return { kind: 'auto', steps: [{ kind: 'system', text: `▸ ${summary()}` }] };
  }
}

/** Resolves which edge a just-visited (non-branching) node continues on. */
function resolveNextEdge(document: DiagramDocument, node: DiagramNode, chosenPortName?: string): DiagramEdge | undefined {
  const ports = mainOutputPorts(node);
  const port = chosenPortName ? ports.find((p) => p.name === chosenPortName) : ports[0];
  if (!port) return undefined;
  return edgeFromPort(document, port.id);
}

/**
 * Advances the simulation by exactly one "turn": from `currentNodeId`
 * (null to (re)start from the entry node) it resumes any wait with
 * `resumeValue`, then auto-walks forward through pass-through nodes until
 * it hits another node that needs user input, an EndActivity/
 * CompleteTopicActivity, or a dead end (no wired outgoing edge).
 */
export function advance(document: DiagramDocument, currentNodeId: string | null, resumeValue?: string): AdvanceResult {
  const steps: ChatStep[] = [];
  let suggestionChips: AdvanceResult['suggestionChips'];
  let promptAttention: AdvanceResult['promptAttention'] = null;
  let nodeId = currentNodeId;
  let firstVisitResume = resumeValue;

  if (nodeId === null) {
    const entry = findEntryNode(document);
    if (!entry) {
      return { steps: [{ kind: 'system', text: 'No nodes on the canvas yet.' }], currentNodeId: null, waiting: null, ended: false, deadEnd: true };
    }
    nodeId = entry.id;
    firstVisitResume = undefined;
  } else {
    const node = findNode(document, nodeId);
    if (!node) {
      return { steps: [{ kind: 'system', text: 'The node the preview was waiting on no longer exists -- resetting.' }], currentNodeId: null, waiting: null, ended: false, deadEnd: true };
    }
    const outcome = visitNode(node, firstVisitResume);
    steps.push(...outcome.steps);
    if (outcome.kind === 'wait') {
      // Shouldn't happen (a resume always carries a value), but stay put defensively.
      return { steps, currentNodeId: nodeId, waiting: outcome.waiting, waitOptions: outcome.waitOptions, waitButtonLabel: outcome.waitButtonLabel, ended: false, deadEnd: false };
    }
    if (outcome.kind === 'end') {
      return { steps, currentNodeId: null, waiting: null, ended: true, deadEnd: false };
    }
    const nextEdge = outcome.kind === 'auto-branch' ? resolveNextEdge(document, node, outcome.chosenPortName) : resolveNextEdge(document, node);
    if (outcome.kind === 'auto') {
      if (outcome.suggestionChips) suggestionChips = outcome.suggestionChips;
      if (outcome.promptAttention) promptAttention = outcome.promptAttention;
    }
    if (!nextEdge?.to) {
      return { steps, currentNodeId: null, waiting: null, ended: false, deadEnd: true, suggestionChips, promptAttention };
    }
    nodeId = nextEdge.to.node;
  }

  // Auto-walk forward from `nodeId` (a fresh node every iteration here).
  for (;;) {
    const node = findNode(document, nodeId);
    if (!node) {
      return { steps, currentNodeId: null, waiting: null, ended: false, deadEnd: true, suggestionChips, promptAttention };
    }
    const outcome = visitNode(node, undefined);
    steps.push(...outcome.steps);

    if (outcome.kind === 'wait') {
      return { steps, currentNodeId: node.id, waiting: outcome.waiting, waitOptions: outcome.waitOptions, waitButtonLabel: outcome.waitButtonLabel, ended: false, deadEnd: false, suggestionChips, promptAttention };
    }
    if (outcome.kind === 'end') {
      return { steps, currentNodeId: null, waiting: null, ended: true, deadEnd: false, suggestionChips, promptAttention };
    }
    if (outcome.kind === 'auto') {
      if (outcome.suggestionChips) suggestionChips = outcome.suggestionChips;
      if (outcome.promptAttention) promptAttention = outcome.promptAttention;
    }

    const nextEdge = outcome.kind === 'auto-branch' ? resolveNextEdge(document, node, outcome.chosenPortName) : resolveNextEdge(document, node);
    if (!nextEdge?.to) {
      return { steps, currentNodeId: null, waiting: null, ended: false, deadEnd: true, suggestionChips, promptAttention };
    }
    nodeId = nextEdge.to.node;
  }
}
