import { describe, expect, it } from 'vitest';
import { getActivityDefinition } from '../registry/activityDefinitions';

/**
 * Phase 5.4's acceptance criteria (#36): EventTriggerActivity, TriggerTopic,
 * ExecuteTopicActivity, CompleteTopicActivity, MultipleTopicsMatchedActivity,
 * SemanticResponse, SemanticQueryActivity, SignInActivity all present with
 * parameters/ports matching docs/activity-shapes.md exactly.
 */
describe('Phase 5.4: Events/Subroutines + Semantic/AI + Security parity', () => {
  it('all 8 types are seeded, completing full 36-shape catalog coverage', () => {
    const types = [
      'EventTriggerActivity',
      'TriggerTopicActivity',
      'ExecuteTopicActivity',
      'CompleteTopicActivity',
      'MultipleTopicsMatchedActivity',
      'SemanticResponse',
      'SemanticQueryActivity',
      'SignInActivity',
    ];
    for (const type of types) {
      expect(getActivityDefinition(type), `${type} should be seeded`).toBeDefined();
    }
  });

  it('TriggerTopicActivity uses `topicToTrigger` (the real constructor param name), not the old `subTopicName`', () => {
    const def = getActivityDefinition('TriggerTopicActivity')!;
    expect(def.defaultData.topicToTrigger).toBe('QuoteGenerationTopic');
    expect(def.defaultData.subTopicName).toBeUndefined();
  });

  it('EventTriggerActivity matches the doc defaults', () => {
    expect(getActivityDefinition('EventTriggerActivity')!.defaultData).toEqual({
      eventName: 'CustomEvent',
      waitForResponse: 'false',
      responseContextKey: '',
      timeoutMs: '300000',
    });
  });

  it('ExecuteTopicActivity: topicName is real, resultContextKey is doc-parity only', () => {
    const def = getActivityDefinition('ExecuteTopicActivity')!;
    expect(def.defaultData).toEqual({ topicName: 'SubTopicName', resultContextKey: 'execute-topic-activity-1_TopicResult' });
  });

  it('CompleteTopicActivity matches the doc defaults', () => {
    expect(getActivityDefinition('CompleteTopicActivity')!.defaultData).toEqual({
      completionMessage: 'Topic completed',
      completionDataKey: 'SubTopicCompletionData',
      resumeTopicKey: 'NextTopic',
    });
  });

  it('MultipleTopicsMatchedActivity matches the doc default (fully real, literal constructor)', () => {
    expect(getActivityDefinition('MultipleTopicsMatchedActivity')!.defaultData).toEqual({
      message: 'I found multiple matches. Can you clarify?',
    });
  });

  it('SemanticResponse matches the doc defaults', () => {
    expect(getActivityDefinition('SemanticResponse')!.defaultData).toEqual({
      collection: 'insurance_basics_intel',
      userPromptKey: 'Basics_UserPrompt',
      skipLlmThreshold: '0.9',
    });
  });

  it('SemanticQueryActivity matches the doc defaults (none transcribable -- the deepest generic-type gap in the catalog)', () => {
    expect(getActivityDefinition('SemanticQueryActivity')!.defaultData).toEqual({
      ruleSetType: 'DomainRuleSet',
      inputSource: 'context',
      outputContextKey: 'output_query_semantic-query-activity-1',
      runInBackground: 'false',
    });
  });

  it('SignInActivity matches the doc default (fully real, literal constructor)', () => {
    expect(getActivityDefinition('SignInActivity')!.defaultData).toEqual({ message: 'Please sign in to continue' });
  });
});
