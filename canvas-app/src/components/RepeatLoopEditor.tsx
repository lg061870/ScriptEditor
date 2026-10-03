import { useState, useMemo } from 'react';
import type { DiagramDocument } from '../schema/diagram';
import { getGuaranteedUpstreamVariables } from '../analysis/scopeAnalysis';

export interface RepeatLoopEditorProps {
  nodeId: string;
  nodeTitle?: string;
  data: Record<string, string>;
  document: DiagramDocument;
  onChange: (updates: Record<string, string>) => void;
}

export type RepeatLoopMode = 'user_prompt' | 'fixed_count' | 'while_condition';

const PROMPT_PRESETS = [
  'Would you like to continue?',
  'Would you like to add another item?',
  'Do you have another question?',
  'Would you like to add another attendee?',
];

const ITERATION_PRESETS = [2, 3, 5, 10];

export function RepeatLoopEditor({
  nodeId,
  nodeTitle: _nodeTitle,
  data,
  document,
  onChange,
}: RepeatLoopEditorProps) {
  const [iterationVariable, setIterationVariable] = useState<string>(
    data.iterationVariable || 'count'
  );

  const availableVars = useMemo(() => {
    const upstream = getGuaranteedUpstreamVariables(document, nodeId);
    const loopVars = [
      { name: iterationVariable.trim() || 'count', type: 'int' as const },
    ];
    const seen = new Set<string>();
    const res: typeof upstream = [];
    for (const v of [...loopVars, ...upstream]) {
      if (!seen.has(v.name)) {
        seen.add(v.name);
        res.push(v as any);
      }
    }
    return res;
  }, [document, nodeId, iterationVariable]);

  // Normalize initial loop mode
  const initialMode = useMemo<RepeatLoopMode>(() => {
    const raw = (data.loopMode || '').toLowerCase();
    if (raw.includes('prompt') || raw === 'user_prompt') return 'user_prompt';
    if (raw.includes('while') || raw.includes('predicate') || raw === 'while_condition') return 'while_condition';
    return 'fixed_count';
  }, [data.loopMode]);

  const [mode, setMode] = useState<RepeatLoopMode>(initialMode);

  // User prompt state
  const [continuePrompt, setContinuePrompt] = useState<string>(
    data.continuePrompt || 'Would you like to continue?'
  );

  // Fixed count state
  const [iterations, setIterations] = useState<number>(() => {
    const parsed = parseInt(data.iterations || '3', 10);
    return isNaN(parsed) || parsed < 1 ? 3 : parsed;
  });

  // While condition state
  const [conditionMode, setConditionMode] = useState<'builder' | 'raw'>(() => {
    return data.condition && data.condition.includes('=>') ? 'raw' : 'builder';
  });

  const [conditionVar, setConditionVar] = useState<string>(() => {
    if (data.conditionVariable) return data.conditionVariable;
    return `${nodeId}_Iteration`;
  });

  const [operator, setOperator] = useState<string>(data.conditionOperator || '<');
  const [conditionValue, setConditionValue] = useState<string>(data.conditionValue || '5');
  const [rawCondition, setRawCondition] = useState<string>(
    data.condition || `ctx => ctx.GetValue<int>("${nodeId}_Iteration") < 5`
  );

  // Advanced fields
  const [collectionKey, setCollectionKey] = useState<string>(
    data.collectionKey || ''
  );

  // Compute active condition string
  const activeCondition = useMemo(() => {
    if (conditionMode === 'raw') {
      return rawCondition.trim() || 'ctx => true';
    }
    // Simple builder
    const varType = availableVars.find((v) => v.name === conditionVar)?.type || 'int';
    const cast = varType === 'string' ? '<string>' : (varType === 'boolean' ? '<bool>' : '<int>');
    const val = varType === 'string' && !conditionValue.startsWith('"') ? `"${conditionValue}"` : conditionValue;
    return `ctx.GetValue${cast}("${conditionVar}") ${operator} ${val}`;
  }, [conditionMode, rawCondition, conditionVar, operator, conditionValue, availableVars]);

  // Notify diagram store
  const notifyChange = (
    newMode: RepeatLoopMode,
    newPrompt: string,
    newIterations: number,
    newCondition: string,
    newCollection: string,
    newIterVar: string = iterationVariable
  ) => {
    onChange({
      loopMode: newMode,
      continuePrompt: newPrompt,
      iterations: String(newIterations),
      condition: newCondition,
      conditionVariable: conditionVar,
      conditionOperator: operator,
      conditionValue: conditionValue,
      collectionKey: newCollection,
      iterationVariable: newIterVar,
    });
  };

  const handleIterationVariableChange = (val: string) => {
    setIterationVariable(val);
    notifyChange(mode, continuePrompt, iterations, activeCondition, collectionKey, val);
  };

  const handleModeChange = (newMode: RepeatLoopMode) => {
    setMode(newMode);
    notifyChange(newMode, continuePrompt, iterations, activeCondition, collectionKey, iterationVariable);
  };

  const handlePromptChange = (val: string) => {
    setContinuePrompt(val);
    notifyChange(mode, val, iterations, activeCondition, collectionKey, iterationVariable);
  };

  const handleIterationsChange = (val: number) => {
    const safe = Math.max(1, Math.min(val, 9999));
    setIterations(safe);
    notifyChange(mode, continuePrompt, safe, activeCondition, collectionKey, iterationVariable);
  };

  const handleBuilderChange = (vName: string, op: string, vVal: string) => {
    setConditionVar(vName);
    setOperator(op);
    setConditionValue(vVal);

    const varType = availableVars.find((v) => v.name === vName)?.type || 'int';
    const cast = varType === 'string' ? '<string>' : (varType === 'boolean' ? '<bool>' : '<int>');
    const val = varType === 'string' && !vVal.startsWith('"') ? `"${vVal}"` : vVal;
    const condStr = `ctx.GetValue${cast}("${vName}") ${op} ${val}`;

    onChange({
      loopMode: mode,
      continuePrompt,
      iterations: String(iterations),
      condition: condStr,
      conditionVariable: vName,
      conditionOperator: op,
      conditionValue: vVal,
      collectionKey,
      iterationVariable,
    });
  };

  const handleRawConditionChange = (val: string) => {
    setRawCondition(val);
    notifyChange(mode, continuePrompt, iterations, val, collectionKey, iterationVariable);
  };

  // C# Code Preview Generation
  const previewCode = useMemo(() => {
    const id = nodeId || 'LoopNode';
    const init = iterationVariable && iterationVariable.trim() !== 'count' ? ` { IterationKey = "${iterationVariable.trim()}" }` : '';
    if (mode === 'user_prompt') {
      return `Add(new RepeatLoopActivity("${id}", continuePrompt: "${continuePrompt}")${init});`;
    }
    if (mode === 'while_condition') {
      const expr = activeCondition.includes('=>') ? activeCondition : `ctx => ${activeCondition}`;
      return `Add(new RepeatLoopActivity("${id}", ${expr})${init});`;
    }
    return `Add(new RepeatLoopActivity("${id}", ${iterations})${init});`;
  }, [nodeId, mode, continuePrompt, iterations, activeCondition, iterationVariable]);

  return (
    <div data-testid="repeat-loop-editor" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Counter / Iteration Variable */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label
            htmlFor="repeat-iter-var"
            style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}
          >
            Counter / Iteration Variable
          </label>
          <span style={{ fontSize: 9.5, color: '#0284c7', background: '#e0f2fe', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
            Context Int
          </span>
        </div>
        <input
          id="repeat-iter-var"
          type="text"
          value={iterationVariable}
          onChange={(e) => handleIterationVariableChange(e.target.value)}
          placeholder="count"
          data-testid="repeat-iteration-variable-input"
          style={{
            width: '100%',
            padding: '6px 8px',
            fontSize: 12,
            fontFamily: 'monospace',
            borderRadius: 6,
            border: '1px solid #cbd5e1',
            outline: 'none',
            boxSizing: 'border-box',
            background: '#ffffff',
          }}
        />
        <span style={{ fontSize: 10, color: '#64748b' }}>
          Created in context on each iteration (1, 2, 3...) — available to all loop body activities.
        </span>
      </div>

      {/* Segmented Mode Selector */}
      <div>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>
          Loop Mode
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, background: '#f1f5f9', padding: 3, borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <button
            type="button"
            data-testid="mode-prompt-btn"
            onClick={() => handleModeChange('user_prompt')}
            style={{
              padding: '6px 4px',
              fontSize: 11,
              fontWeight: mode === 'user_prompt' ? 700 : 500,
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              background: mode === 'user_prompt' ? '#ffffff' : 'transparent',
              color: mode === 'user_prompt' ? '#0284c7' : '#64748b',
              boxShadow: mode === 'user_prompt' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              transition: 'all 0.15s ease',
            }}
          >
            <span style={{ fontSize: 13 }}>💬</span>
            <span>Prompted</span>
          </button>

          <button
            type="button"
            data-testid="mode-fixed-btn"
            onClick={() => handleModeChange('fixed_count')}
            style={{
              padding: '6px 4px',
              fontSize: 11,
              fontWeight: mode === 'fixed_count' ? 700 : 500,
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              background: mode === 'fixed_count' ? '#ffffff' : 'transparent',
              color: mode === 'fixed_count' ? '#059669' : '#64748b',
              boxShadow: mode === 'fixed_count' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              transition: 'all 0.15s ease',
            }}
          >
            <span style={{ fontSize: 13 }}>🔢</span>
            <span>Fixed Count</span>
          </button>

          <button
            type="button"
            data-testid="mode-while-btn"
            onClick={() => handleModeChange('while_condition')}
            style={{
              padding: '6px 4px',
              fontSize: 11,
              fontWeight: mode === 'while_condition' ? 700 : 500,
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              background: mode === 'while_condition' ? '#ffffff' : 'transparent',
              color: mode === 'while_condition' ? '#7c3aed' : '#64748b',
              boxShadow: mode === 'while_condition' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              transition: 'all 0.15s ease',
            }}
          >
            <span style={{ fontSize: 13 }}>⚙️</span>
            <span>Condition</span>
          </button>
        </div>
      </div>

      {/* Mode-Specific Configuration Section */}
      {mode === 'user_prompt' && (
        <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
              Continue Prompt (Question)
            </label>
            <span style={{ fontSize: 10, color: '#0284c7', background: '#e0f2fe', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
              User decides
            </span>
          </div>

          <input
            type="text"
            data-testid="continue-prompt-input"
            value={continuePrompt}
            onChange={(e) => handlePromptChange(e.target.value)}
            placeholder="e.g. Would you like to add another item?"
            style={{
              width: '100%',
              padding: '7px 10px',
              fontSize: 12,
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              boxSizing: 'border-box',
              outline: 'none',
              background: '#ffffff',
            }}
          />

          <div>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>
              Quick Suggestions:
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {PROMPT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handlePromptChange(preset)}
                  style={{
                    padding: '3px 7px',
                    fontSize: 10,
                    borderRadius: 4,
                    border: '1px solid #bae6fd',
                    background: continuePrompt === preset ? '#0284c7' : '#f0f9ff',
                    color: continuePrompt === preset ? '#ffffff' : '#0369a1',
                    cursor: 'pointer',
                    transition: 'all 0.1s ease',
                  }}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {mode === 'fixed_count' && (
        <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
              Iterations (Exact Count)
            </label>
            <span style={{ fontSize: 10, color: '#059669', background: '#d1fae5', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
              Hard Cap
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => handleIterationsChange(iterations - 1)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                cursor: 'pointer',
                fontSize: 16,
                fontWeight: 'bold',
                color: '#334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              -
            </button>
            <input
              type="number"
              data-testid="iterations-count-input"
              value={iterations}
              min={1}
              max={9999}
              onChange={(e) => handleIterationsChange(parseInt(e.target.value, 10) || 1)}
              style={{
                flex: 1,
                padding: '6px 10px',
                fontSize: 14,
                fontWeight: 700,
                textAlign: 'center',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                boxSizing: 'border-box',
                outline: 'none',
                background: '#ffffff',
              }}
            />
            <button
              type="button"
              onClick={() => handleIterationsChange(iterations + 1)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                cursor: 'pointer',
                fontSize: 16,
                fontWeight: 'bold',
                color: '#334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              +
            </button>
          </div>

          <div>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>
              Presets:
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {ITERATION_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleIterationsChange(preset)}
                  style={{
                    flex: 1,
                    padding: '4px 0',
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 4,
                    border: '1px solid #a7f3d0',
                    background: iterations === preset ? '#059669' : '#ecfdf5',
                    color: iterations === preset ? '#ffffff' : '#065f46',
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  {preset}×
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {mode === 'while_condition' && (
        <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
              Condition Logic
            </label>
            <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: 4, padding: 1 }}>
              <button
                type="button"
                onClick={() => setConditionMode('builder')}
                style={{
                  padding: '2px 7px',
                  fontSize: 10,
                  fontWeight: conditionMode === 'builder' ? 700 : 500,
                  borderRadius: 3,
                  border: 'none',
                  cursor: 'pointer',
                  background: conditionMode === 'builder' ? '#ffffff' : 'transparent',
                  color: conditionMode === 'builder' ? '#7c3aed' : '#64748b',
                }}
              >
                Builder
              </button>
              <button
                type="button"
                onClick={() => setConditionMode('raw')}
                style={{
                  padding: '2px 7px',
                  fontSize: 10,
                  fontWeight: conditionMode === 'raw' ? 700 : 500,
                  borderRadius: 3,
                  border: 'none',
                  cursor: 'pointer',
                  background: conditionMode === 'raw' ? '#ffffff' : 'transparent',
                  color: conditionMode === 'raw' ? '#7c3aed' : '#64748b',
                }}
              >
                Raw C#
              </button>
            </div>
          </div>

          {conditionMode === 'builder' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Variable Selector */}
              <div>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 3 }}>
                  Loop Variable
                </span>
                <select
                  value={conditionVar}
                  onChange={(e) => handleBuilderChange(e.target.value, operator, conditionValue)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: 12,
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    outline: 'none',
                  }}
                >
                  {availableVars.map((v) => {
                    const isIterVar = v.name === (iterationVariable.trim() || 'count') || v.name === `${nodeId}_Iteration`;
                    return (
                      <option key={v.name} value={v.name}>
                        {isIterVar
                          ? `Loop Iteration Counter (${v.name})`
                          : `${v.name} (${v.type})`}
                      </option>
                    );
                  })}
                  <option value="__custom__">Custom / Context variable...</option>
                </select>

                {conditionVar !== (iterationVariable.trim() || 'count') && conditionVar !== `${nodeId}_Iteration` && !availableVars.some((v) => v.name === conditionVar) && (
                  <input
                    type="text"
                    value={conditionVar}
                    onChange={(e) => handleBuilderChange(e.target.value, operator, conditionValue)}
                    placeholder="e.g. myCounter"
                    style={{
                      marginTop: 6,
                      width: '100%',
                      padding: '6px 8px',
                      fontSize: 12,
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                )}

                {conditionVar !== (iterationVariable.trim() || 'count') && conditionVar !== `${nodeId}_Iteration` && (
                  <div style={{ marginTop: 6, fontSize: 10, color: '#92400e', background: '#fef3c7', padding: '6px 8px', borderRadius: 4, border: '1px solid #fde68a', lineHeight: 1.4 }}>
                    ⚠️ <strong>Variable Notice:</strong> Ensure an activity inside your loop body increments or modifies <code>{conditionVar}</code>. If it is never changed, the condition remains true and could hang the flow. (For automatic iteration count, select <em>Loop Iteration Counter ({iterationVariable.trim() || 'count'})</em>).
                  </div>
                )}
              </div>

              {/* Operator and Value row */}
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 6 }}>
                <div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 3 }}>
                    Operator
                  </span>
                  <select
                    value={operator}
                    onChange={(e) => handleBuilderChange(conditionVar, e.target.value, conditionValue)}
                    style={{
                      width: '100%',
                      padding: '6px 6px',
                      fontSize: 12,
                      fontWeight: 600,
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      outline: 'none',
                    }}
                  >
                    <option value="<">&lt; (less)</option>
                    <option value="<=">&le; (less/equal)</option>
                    <option value=">">&gt; (greater)</option>
                    <option value=">=">&ge; (greater/equal)</option>
                    <option value="==">== (equals)</option>
                    <option value="!=">!= (not equals)</option>
                  </select>
                </div>

                <div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 3 }}>
                    Target Value
                  </span>
                  <input
                    type="text"
                    value={conditionValue}
                    onChange={(e) => handleBuilderChange(conditionVar, operator, e.target.value)}
                    placeholder="e.g. 5"
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      fontSize: 12,
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div>
              <span style={{ fontSize: 10, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 3 }}>
                C# Predicate Lambda Expression
              </span>
              <textarea
                rows={3}
                value={rawCondition}
                onChange={(e) => handleRawConditionChange(e.target.value)}
                placeholder="ctx => ctx.GetValue<int>(&quot;count&quot;) < 5"
                style={{
                  width: '100%',
                  padding: '7px 8px',
                  fontFamily: 'monospace',
                  fontSize: 11,
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  boxSizing: 'border-box',
                  outline: 'none',
                  resize: 'vertical',
                }}
              />
              {availableVars.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <span style={{ fontSize: 10, color: '#94a3b8', display: 'block', marginBottom: 3 }}>
                    Click variable to insert:
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {availableVars.map((v) => (
                      <button
                        key={v.name}
                        type="button"
                        onClick={() => handleRawConditionChange(`${rawCondition} ctx.GetValue<${v.type}>("${v.name}")`)}
                        style={{
                          padding: '2px 6px',
                          fontSize: 10,
                          fontFamily: 'monospace',
                          borderRadius: 4,
                          border: '1px solid #e2e8f0',
                          background: '#f1f5f9',
                          color: '#475569',
                          cursor: 'pointer',
                        }}
                      >
                        +{v.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Plain-English Behavior & C# Preview Card */}
      <div style={{ background: '#f0f9ff', padding: 12, borderRadius: 8, border: '1px solid #bae6fd', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#0369a1' }}>
          <span>💡</span>
          <span>HOW THIS LOOP RUNS</span>
        </div>

        <div style={{ fontSize: 11, color: '#0c4a6e', lineHeight: 1.45 }}>
          {mode === 'user_prompt' && (
            <span>
              The bot executes the <strong>Loop Body</strong>, then prompts the user:{' '}
              <em>"{continuePrompt}"</em>. If the user answers Yes, it repeats; if No, it proceeds to <strong>Done</strong>.
            </span>
          )}
          {mode === 'fixed_count' && (
            <span>
              The bot executes the <strong>Loop Body</strong> exactly <strong>{iterations} {iterations === 1 ? 'time' : 'times'}</strong>, then automatically proceeds down the <strong>Done</strong> branch.
            </span>
          )}
          {mode === 'while_condition' && (
            <span>
              The bot repeats the <strong>Loop Body</strong> as long as condition{' '}
              <code style={{ background: '#e0f2fe', padding: '1px 4px', borderRadius: 3, fontWeight: 600 }}>{activeCondition}</code>{' '}
              evaluates to <strong style={{ color: '#059669' }}>true</strong>. Once <strong style={{ color: '#dc2626' }}>false</strong>, it exits to <strong>Done</strong>.
            </span>
          )}
        </div>

        <div style={{ marginTop: 2, paddingTop: 6, borderTop: '1px dashed #bae6fd' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#0284c7', display: 'block', marginBottom: 2 }}>
            Generated C# Code:
          </span>
          <code style={{ fontSize: 10, fontFamily: 'monospace', color: '#0f172a', background: '#ffffff', padding: '4px 6px', borderRadius: 4, display: 'block', border: '1px solid #e0f2fe', overflowX: 'auto', whiteSpace: 'nowrap' }}>
            {previewCode}
          </code>
        </div>
      </div>

      {/* Advanced Properties Collapsible Drawer */}
      <details style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
        <summary style={{ fontSize: 11, fontWeight: 600, color: '#64748b', cursor: 'pointer', outline: 'none', userSelect: 'none' }}>
          ⚙️ Advanced (Collection & Context Key)
        </summary>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 10, fontWeight: 600, color: '#64748b' }}>
            Collection Key (Optional context variable)
          </label>
          <input
            type="text"
            value={collectionKey}
            onChange={(e) => {
              setCollectionKey(e.target.value);
              notifyChange(mode, continuePrompt, iterations, activeCondition, e.target.value);
            }}
            placeholder="BasicsLearningLoop_Collection"
            style={{
              padding: '5px 8px',
              fontSize: 11,
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
        </div>
      </details>
    </div>
  );
}
