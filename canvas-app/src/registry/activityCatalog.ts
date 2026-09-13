/**
 * The 10 programming-language-construct categories from
 * docs/activity-shapes.md, and all 36 non-domain-specific shapes assigned
 * to one each. Category boundaries are inferred from how the roadmap's own
 * Phase 5 breakdown groups them (5.1 Sequence+Selection = 10 shapes,
 * 5.2 Iteration+Concurrency+ExceptionHandling = 6, 5.3 Variables&State+I/O
 * = 12, 5.4 Events/Subroutines+Semantic/AI+Security = 8 -- 10+6+12+8=36,
 * matching the catalog exactly), then split into the 10 individual
 * categories along standard control-construct lines.
 *
 * Drives the Phase 1.3 palette. Only the 6 types in ./activityDefinitions
 * have real summaries/fields; every other entry here is still listed
 * (draggable, creates a generic node) per this task's acceptance criteria,
 * pending Phase 5's full-catalog port.
 */

export const ACTIVITY_CATEGORIES = [
  'Sequence',
  'Selection',
  'Iteration',
  'Concurrency',
  'Exception Handling',
  'Variables & State',
  'I/O',
  'Events & Subroutines',
  'Semantic/AI',
  'Security',
] as const;

export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

export interface CatalogEntry {
  type: string;
  category: ActivityCategory;
}

export const ACTIVITY_CATALOG: CatalogEntry[] = [
  // Sequence
  { type: 'SimpleActivity', category: 'Sequence' },
  { type: 'CompositeActivity', category: 'Sequence' },
  { type: 'DelayActivity', category: 'Sequence' },
  { type: 'EndActivity', category: 'Sequence' },
  // Selection
  { type: 'ConditionalActivity', category: 'Selection' },
  { type: 'Conditional<QuickAnswer>', category: 'Selection' },
  { type: 'Conditional<TriggerTopic>', category: 'Selection' },
  { type: 'DecisionActivity', category: 'Selection' },
  { type: 'SwitchActivity', category: 'Selection' },
  { type: 'ChoiceActivity', category: 'Selection' },
  // Iteration
  { type: 'RepeatActivity', category: 'Iteration' },
  { type: 'ForEachActivity', category: 'Iteration' },
  // Concurrency
  { type: 'ParallelActivity', category: 'Concurrency' },
  // Exception Handling
  { type: 'OnErrorActivity', category: 'Exception Handling' },
  { type: 'FallbackActivity', category: 'Exception Handling' },
  { type: 'EscalateActivity', category: 'Exception Handling' },
  // Variables & State
  { type: 'SetVariableActivity', category: 'Variables & State' },
  { type: 'GlobalVariableActivity', category: 'Variables & State' },
  { type: 'DumpCtxActivity', category: 'Variables & State' },
  { type: 'ResetActivity', category: 'Variables & State' },
  // I/O
  { type: 'WaitForUserInput', category: 'I/O' },
  { type: 'PromptActivity', category: 'I/O' },
  { type: 'QuickAnswerActivity', category: 'I/O' },
  { type: 'AdaptiveCardActivity', category: 'I/O' },
  { type: 'ShowSuggestionsActivity', category: 'I/O' },
  { type: 'InteractiveActivity', category: 'I/O' },
  { type: 'PromptAttentionActivity', category: 'I/O' },
  { type: 'GreetingActivity', category: 'I/O' },
  // Events & Subroutines
  { type: 'EventTriggerActivity', category: 'Events & Subroutines' },
  { type: 'TriggerTopicActivity', category: 'Events & Subroutines' },
  { type: 'ExecuteTopicActivity', category: 'Events & Subroutines' },
  { type: 'CompleteTopicActivity', category: 'Events & Subroutines' },
  { type: 'MultipleTopicsMatchedActivity', category: 'Events & Subroutines' },
  // Semantic/AI
  { type: 'SemanticResponse', category: 'Semantic/AI' },
  { type: 'SemanticQueryActivity', category: 'Semantic/AI' },
  // Security
  { type: 'SignInActivity', category: 'Security' },
];

export function catalogByCategory(): Map<ActivityCategory, CatalogEntry[]> {
  const map = new Map<ActivityCategory, CatalogEntry[]>();
  for (const category of ACTIVITY_CATEGORIES) {
    map.set(category, []);
  }
  for (const entry of ACTIVITY_CATALOG) {
    map.get(entry.category)!.push(entry);
  }
  return map;
}
