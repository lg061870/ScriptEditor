import { describe, expect, it } from 'vitest';
import { createDiagramNode } from '../actions/createNode';
import { getActivityDefinition } from '../registry/activityDefinitions';

/**
 * Phase 5.3's acceptance criteria (#35): SetVariableActivity,
 * GlobalVariableActivity, DumpCtxActivity, ResetActivity, WaitForUserInputActivity,
 * PromptActivity, QuickAnswer, AdaptiveCardActivity,
 * ShowSuggestionsActivity, InteractiveActivity, ChatPromptAttentionActivity,
 * GreetingActivity all present with parameters/ports matching
 * docs/activity-shapes.md exactly.
 */
describe('Phase 5.3: Variables & State + I/O parity', () => {
  it('all 12 types are seeded', () => {
    const types = [
      'SetVariableActivity',
      'GlobalVariableActivity',
      'DumpCtxActivity',
      'ResetActivity',
      'WaitForUserInputActivity',
      'PromptActivity',
      'QuickAnswerActivity',
      'AdaptiveCardActivity',
      'ShowSuggestionsActivity',
      'InteractiveActivity',
      'ChatPromptAttentionActivity',
      'GreetingActivity',
    ];
    for (const type of types) {
      expect(getActivityDefinition(type), `${type} should be seeded`).toBeDefined();
    }
  });

  it('SetVariableActivity matches the doc defaults', () => {
    expect(getActivityDefinition('SetVariableActivity')!.defaultData).toEqual({
      variableName: 'Global_Example',
      value: '',
      isGlobal: 'true',
      validateNaming: 'true',
    });
  });

  it('GlobalVariableActivity matches the doc defaults (none of which are transcribable -- the real class has no matching fields at all)', () => {
    expect(getActivityDefinition('GlobalVariableActivity')!.defaultData).toEqual({
      promotionMode: 'all',
      sourceKey: '',
      globalKey: 'Global_<Key>',
    });
  });

  it('DumpCtxActivity: developmentMode is real, outputType is doc-parity only', () => {
    expect(getActivityDefinition('DumpCtxActivity')!.defaultData).toEqual({
      developmentMode: 'true',
      outputType: 'DumpCtx',
    });
  });

  it('ResetActivity matches the doc default', () => {
    expect(getActivityDefinition('ResetActivity')!.defaultData).toEqual({ resetMessage: 'Session reset completed' });
  });

  it('WaitForUserInputActivity matches the doc defaults', () => {
    expect(getActivityDefinition('WaitForUserInputActivity')!.defaultData).toEqual({
      prompt: 'Ask your question about insurance basics:',
      modelContextKey: 'wait_for_user_input',
      required: 'true',
    });
  });

  it('PromptActivity uses systemPrompt/userPromptTemplate/temperature (the real settable properties), not the old prompt/model', () => {
    const def = getActivityDefinition('PromptActivity')!;
    expect(def.defaultData).toEqual({
      systemPrompt: 'You are an empathetic insurance assistant.',
      userPromptTemplate: 'User message: {context.Basics_UserPrompt}.',
      temperature: '0.7',
    });
    expect(def.defaultData.prompt).toBeUndefined();
    expect(def.defaultData.model).toBeUndefined();
  });

  it('QuickAnswerActivity uses `answers` (the real constructor param name), not the old `options`', () => {
    const def = getActivityDefinition('QuickAnswerActivity')!;
    expect(def.defaultData.answers).toBe('Instant Quote | Talk to Agent | More Info');
    expect(def.defaultData.options).toBeUndefined();
    expect(def.defaultData.required).toBe('true');
  });

  it('AdaptiveCardActivity uses submissionContextKey/required (real properties), not the old cardName/modelName text fields -- Card/Model are ports, not text', () => {
    const def = getActivityDefinition('AdaptiveCardActivity')!;
    expect(def.defaultData).toEqual({ submissionContextKey: 'adaptive-card-activity-1', required: 'true' });
    expect(def.defaultData.cardName).toBeUndefined();
    expect(def.defaultData.modelName).toBeUndefined();

    const node = createDiagramNode('AdaptiveCardActivity', { x: 0, y: 0 });
    expect(node.ports.map((p) => p.name)).toEqual(['Input', 'Output', 'Exception', 'Card', 'Model', 'Control']);
  });

  it('ShowSuggestionsActivity matches the doc defaults (fully real, no framework-service gap)', () => {
    expect(getActivityDefinition('ShowSuggestionsActivity')!.defaultData).toEqual({
      suggestions: 'Option 1 | Option 2',
      eventName: 'UpdateSuggestions',
    });
  });

  it('InteractiveActivity matches the doc defaults', () => {
    expect(getActivityDefinition('InteractiveActivity')!.defaultData).toEqual({
      message: 'Please provide your input',
      inputContextKey: 'interactive-activity-1',
      modelContextKey: 'interactive-activity-1_model',
      inputRequired: 'true',
    });
  });

  it('ChatPromptAttentionActivity matches the doc defaults', () => {
    expect(getActivityDefinition('ChatPromptAttentionActivity')!.defaultData).toEqual({
      message: 'Please answer to continue',
      durationMs: '3000',
      eventName: 'PromptAttention',
    });
  });

  it('GreetingActivity: greeting is doc-parity only -- the real class hardcodes its message with no parameter at all', () => {
    expect(getActivityDefinition('GreetingActivity')!.defaultData).toEqual({ greeting: 'Welcome! How can I help you?' });
  });

  it('every new/updated type produces the standard 4-port shape via createDiagramNode (except AdaptiveCardActivity, covered above)', () => {
    for (const type of [
      'SetVariableActivity',
      'GlobalVariableActivity',
      'DumpCtxActivity',
      'ResetActivity',
      'WaitForUserInputActivity',
      'ShowSuggestionsActivity',
      'InteractiveActivity',
      'ChatPromptAttentionActivity',
      'GreetingActivity',
    ]) {
      const node = createDiagramNode(type, { x: 0, y: 0 });
      expect(node.ports.map((p) => p.name), type).toEqual(['Input', 'Output', 'Exception', 'Control']);
    }
  });
});
