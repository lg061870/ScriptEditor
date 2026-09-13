/**
 * Activity registry: per-activity-type metadata driving the collapsed node
 * summary (Phase 1.2), the palette (Phase 1.3), and the Inspector's field
 * form (Phase 1.5).
 *
 * Seeded with the 6 activity types already implemented in
 * docs/conops_interactive_prototype.html (same title/category/color/
 * defaultData/summary logic, ported as-is, not reinvented) -- the roadmap
 * explicitly calls for seeding these 6 and extending to the full 36-shape
 * catalog (docs/activity-shapes.md) in Phase 5. `getActivityDefinition`
 * returns undefined for every other type; callers fall back to generic
 * behavior (plain type name as summary/title, a raw key-value field editor)
 * rather than a lookup crash.
 */

export type ActivityFieldKind = 'text' | 'textarea' | 'number' | 'boolean';

export interface ActivityFieldDef {
  key: string;
  label: string;
  kind: ActivityFieldKind;
}

export interface ActivityDefinition {
  type: string;
  title: string;
  category: string;
  color: string;
  defaultData: Record<string, string>;
  fields: ActivityFieldDef[];
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
