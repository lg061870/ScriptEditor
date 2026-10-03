import { useState, useMemo, useEffect } from 'react';
import type { DiagramDocument } from '../schema/diagram';
import { getGuaranteedUpstreamVariables, type ScopeVariable } from '../analysis/scopeAnalysis';

export interface ConditionEditorProps {
  nodeId: string;
  nodeTitle?: string;
  data: Record<string, string>;
  document: DiagramDocument;
  onChange: (updates: Record<string, string>) => void;
}

export function ConditionEditor({
  nodeId,
  nodeTitle: _nodeTitle,
  data,
  document,
  onChange,
}: ConditionEditorProps) {
  const inScopeVars = useMemo(
    () => getGuaranteedUpstreamVariables(document, nodeId),
    [document, nodeId]
  );

  const initialMode = (data.conditionMode as 'simple' | 'expression') || 'simple';
  const [mode, setMode] = useState<'simple' | 'expression'>(initialMode);

  // Simple builder fields
  const [leftOperand, setLeftOperand] = useState<string>(() => {
    return data.leftOperand || (inScopeVars[0]?.name ?? '');
  });
  const [operator, setOperator] = useState<string>(data.operator || '==');
  const [rightOperandType, setRightOperandType] = useState<'literal' | 'variable'>(
    (data.rightOperandType as 'literal' | 'variable') || 'literal'
  );

  const leftVar = inScopeVars.find((v) => v.name === leftOperand);

  // Discover if the selected variable originates from a QuickAnswerActivity (with predefined choices)
  const sourceChoices = useMemo(() => {
    if (!leftVar) return [];
    const src = document.nodes.find((n) => n.id === leftVar.sourceNodeId);
    if (src?.type === 'QuickAnswerActivity' && src.data?.answers) {
      return src.data.answers.split('|').map((s) => s.trim()).filter(Boolean);
    }
    return [];
  }, [document.nodes, leftVar]);

  const [rightOperand, setRightOperand] = useState<string>(() => {
    if (data.rightOperand) return data.rightOperand;
    if (inScopeVars[0]?.type === 'string') {
      const src = document.nodes.find((n) => n.id === inScopeVars[0].sourceNodeId);
      if (src?.type === 'QuickAnswerActivity' && src.data?.answers) {
        const first = src.data.answers.split('|').map((s) => s.trim()).filter(Boolean)[0];
        if (first) return `"${first}"`;
      }
      return '""';
    }
    return '10';
  });

  // Expression field
  const [expression, setExpression] = useState<string>(() => {
    return data.expression || data.selectorKey || (inScopeVars[0] ? `${inScopeVars[0].name} == 10` : 'ConditionKey');
  });

  // Compute code & label
  const buildSimpleExpression = (left: string, op: string, _rightType: 'literal' | 'variable', right: string) => {
    if (!left) return data.selectorKey || 'ConditionKey';
    if (op === 'is_true') return `${left}`;
    if (op === 'is_false') return `!${left}`;
    if (op === 'is_null') return `${left} == null`;
    return `${left} ${op} ${right || '10'}`;
  };

  // Notify parent on changes
  const notifyChange = (
    newMode: 'simple' | 'expression',
    left: string,
    op: string,
    rType: 'literal' | 'variable',
    right: string,
    rawExpr: string
  ) => {
    const expr = newMode === 'simple'
      ? buildSimpleExpression(left, op, rType, right)
      : rawExpr;

    onChange({
      conditionMode: newMode,
      leftOperand: left,
      operator: op,
      rightOperandType: rType,
      rightOperand: right,
      expression: expr,
      selectorKey: expr,
    });
  };

  // Keep leftOperand valid and auto-sync to node data so canvas shape reflects immediately
  useEffect(() => {
    if (mode === 'simple') {
      if (inScopeVars.length > 0 && (!leftOperand || !inScopeVars.some((v) => v.name === leftOperand))) {
        const newLeft = inScopeVars[0].name;
        setLeftOperand(newLeft);
        let newRight = rightOperand;
        const leftV = inScopeVars[0];
        if (leftV.type === 'string' && (rightOperand === '10' || !rightOperand)) {
          const src = document.nodes.find((n) => n.id === leftV.sourceNodeId);
          if (src?.type === 'QuickAnswerActivity' && src.data?.answers) {
            const firstChoice = src.data.answers.split('|').map((s) => s.trim()).filter(Boolean)[0];
            if (firstChoice) newRight = `"${firstChoice}"`;
          } else {
            newRight = '""';
          }
          setRightOperand(newRight);
        }
        const synExpr = buildSimpleExpression(newLeft, operator, rightOperandType, newRight);
        setExpression(synExpr);
        if (data.selectorKey !== synExpr) {
          notifyChange(mode, newLeft, operator, rightOperandType, newRight, synExpr);
        }
      } else if (leftOperand && (data.selectorKey === 'ConditionKey' || !data.selectorKey)) {
        const synExpr = buildSimpleExpression(leftOperand, operator, rightOperandType, rightOperand);
        setExpression(synExpr);
        if (data.selectorKey !== synExpr) {
          notifyChange(mode, leftOperand, operator, rightOperandType, rightOperand, synExpr);
        }
      }
    }
  }, [inScopeVars, leftOperand, mode, operator, rightOperandType, rightOperand, data.selectorKey, document.nodes]);

  const getCSharpCode = (expr: string) => {
    if (mode === 'simple') {
      if (!leftOperand) {
        return '/* Connect an upstream variable node to build condition */';
      }
      const leftVar = inScopeVars.find((v) => v.name === leftOperand);
      const typeStr = leftVar ? leftVar.type : 'int';
      if (operator === 'is_true') return `context.Get<bool>("${leftOperand}") == true`;
      if (operator === 'is_false') return `context.Get<bool>("${leftOperand}") == false`;
      if (operator === 'is_null') return `context.Get<object>("${leftOperand}") == null`;

      if (rightOperandType === 'variable') {
        const rightVar = inScopeVars.find((v) => v.name === rightOperand);
        const rTypeStr = rightVar ? rightVar.type : typeStr;
        return `context.Get<${typeStr}>("${leftOperand}") ${operator} context.Get<${rTypeStr}>("${rightOperand}")`;
      }
      return `context.Get<${typeStr}>("${leftOperand}") ${operator} ${rightOperand}`;
    }
    return `/* C# Evaluated */ => ${expr}`;
  };

  const currentExpr = mode === 'simple'
    ? buildSimpleExpression(leftOperand, operator, rightOperandType, rightOperand)
    : expression;

  const handleModeChange = (newMode: 'simple' | 'expression') => {
    setMode(newMode);
    if (newMode === 'expression') {
      const synExpr = buildSimpleExpression(leftOperand, operator, rightOperandType, rightOperand);
      setExpression(synExpr);
      notifyChange(newMode, leftOperand, operator, rightOperandType, rightOperand, synExpr);
    } else {
      notifyChange(newMode, leftOperand, operator, rightOperandType, rightOperand, expression);
    }
  };

  const handleLeftOpChange = (newLeft: string) => {
    setLeftOperand(newLeft);
    let newRight = rightOperand;
    const targetVar = inScopeVars.find((v) => v.name === newLeft);
    if (targetVar?.type === 'string' && (rightOperand === '10' || !rightOperand)) {
      const src = document.nodes.find((n) => n.id === targetVar.sourceNodeId);
      if (src?.type === 'QuickAnswerActivity' && src.data?.answers) {
        const first = src.data.answers.split('|').map((s) => s.trim()).filter(Boolean)[0];
        if (first) {
          newRight = `"${first}"`;
          setRightOperand(newRight);
        }
      }
    }
    notifyChange(mode, newLeft, operator, rightOperandType, newRight, expression);
  };

  const handleOperatorChange = (newOp: string) => {
    setOperator(newOp);
    notifyChange(mode, leftOperand, newOp, rightOperandType, rightOperand, expression);
  };

  const handleRightTypeToggle = () => {
    const newType = rightOperandType === 'literal' ? 'variable' : 'literal';
    const newRight = newType === 'variable'
      ? inScopeVars.find((v) => v.name !== leftOperand)?.name || inScopeVars[0]?.name || ''
      : '10';
    setRightOperandType(newType);
    setRightOperand(newRight);
    notifyChange(mode, leftOperand, operator, newType, newRight, expression);
  };

  const handleRightOpChange = (newRight: string) => {
    setRightOperand(newRight);
    notifyChange(mode, leftOperand, operator, rightOperandType, newRight, expression);
  };

  const handleExpressionChange = (newExpr: string) => {
    setExpression(newExpr);
    notifyChange(mode, leftOperand, operator, rightOperandType, rightOperand, newExpr);
  };

  const handleChipClick = (v: ScopeVariable) => {
    if (mode === 'simple') {
      if (rightOperandType === 'variable') {
        handleRightOpChange(v.name);
      } else {
        handleLeftOpChange(v.name);
      }
    } else {
      handleExpressionChange(`${expression} ${v.name}`.trim());
    }
  };

  // Warnings for missing variables in expression mode
  const missingVariables = useMemo(() => {
    if (mode !== 'expression') return [];
    const tokens = expression.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
    const keywords = new Set(['true', 'false', 'null', 'context', 'Get', 'string', 'int', 'bool', 'double', 'float', 'long']);
    const inScopeSet = new Set(inScopeVars.map((v) => v.name));
    return Array.from(new Set(tokens.filter((t) => !keywords.has(t) && !inScopeSet.has(t))));
  }, [mode, expression, inScopeVars]);

  return (
    <div data-testid="condition-editor" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header with Mode Switcher */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
          Condition Logic
        </span>
        <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 6, padding: 2, border: '1px solid #e2e8f0' }}>
          <button
            type="button"
            data-testid="mode-simple-btn"
            onClick={() => handleModeChange('simple')}
            style={{
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 4,
              border: 'none',
              cursor: 'pointer',
              background: mode === 'simple' ? '#ec4899' : 'transparent',
              color: mode === 'simple' ? '#ffffff' : '#64748b',
              transition: 'all 0.15s',
            }}
          >
            Simple
          </button>
          <button
            type="button"
            data-testid="mode-expression-btn"
            onClick={() => handleModeChange('expression')}
            style={{
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 4,
              border: 'none',
              cursor: 'pointer',
              background: mode === 'expression' ? '#ec4899' : 'transparent',
              color: mode === 'expression' ? '#ffffff' : '#64748b',
              transition: 'all 0.15s',
            }}
          >
            Expression
          </button>
        </div>
      </div>

      {/* In-Scope Variables Box */}
      <div
        style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: '10px 12px',
        }}
        data-testid="in-scope-variables-container"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            In-Scope Variables
          </span>
          <span style={{ fontSize: 10, color: '#0284c7', fontWeight: 600 }}>
            {inScopeVars.length} available
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {inScopeVars.length === 0 ? (
            <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>
              No upstream variables found on incoming paths.
            </span>
          ) : (
            inScopeVars.map((v) => (
              <button
                key={v.name}
                type="button"
                data-testid={`variable-chip-${v.name}`}
                onClick={() => handleChipClick(v)}
                title={`Defined in ${v.sourceNodeName}. Click to use.`}
                style={{
                  background: '#ffffff',
                  border: '1px solid #93c5fd',
                  color: '#1d4ed8',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span>{v.name}</span>
                <span style={{ fontSize: 9, color: '#64748b', fontWeight: 400 }}>:{v.type}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Mode 1: Simple Builder */}
      {mode === 'simple' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {inScopeVars.length === 0 && (
            <div
              data-testid="no-incoming-vars-hint"
              style={{
                fontSize: 11,
                color: '#475569',
                background: '#f8fafc',
                border: '1px dashed #cbd5e1',
                borderRadius: 6,
                padding: '8px 10px',
                lineHeight: 1.4,
              }}
            >
              <span style={{ fontWeight: 600, color: '#334155' }}>💡 No incoming variables yet</span>
              <div style={{ marginTop: 2, color: '#64748b' }}>
                Connect a flow from an upstream activity (like <em>Set Variable</em>) to this shape to select its variables, or switch to <strong>Expression</strong> mode.
              </div>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 1fr', gap: 6, alignItems: 'center' }}>
            {/* Left Operand Select */}
            <select
              data-testid="condition-left-op-select"
              value={leftOperand}
              disabled={inScopeVars.length === 0}
              onChange={(e) => handleLeftOpChange(e.target.value)}
              style={{
                padding: '6px 8px',
                fontSize: 11,
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                background: inScopeVars.length === 0 ? '#f1f5f9' : '#ffffff',
                color: inScopeVars.length === 0 ? '#94a3b8' : '#1e293b',
                fontFamily: 'monospace',
                outline: 'none',
              }}
            >
              {inScopeVars.length === 0 ? (
                <option value="">-- No variables in scope --</option>
              ) : (
                inScopeVars.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name} ({v.type})
                  </option>
                ))
              )}
            </select>

            {/* Operator Select */}
            <select
              data-testid="condition-operator-select"
              value={operator}
              onChange={(e) => handleOperatorChange(e.target.value)}
              style={{
                padding: '6px 6px',
                fontSize: 11,
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                fontWeight: 600,
                outline: 'none',
              }}
            >
              <option value="==">==</option>
              <option value="!=">!=</option>
              <option value="&gt;">&gt;</option>
              <option value="&lt;">&lt;</option>
              <option value="&gt;=">&gt;=</option>
              <option value="&lt;=">&lt;=</option>
              <option value="is_true">is true</option>
              <option value="is_false">is false</option>
              <option value="is_null">is null</option>
            </select>

            {/* Right Operand */}
            {!['is_true', 'is_false', 'is_null'].includes(operator) && (
              rightOperandType === 'variable' ? (
                <select
                  data-testid="condition-right-op-select"
                  value={rightOperand}
                  onChange={(e) => handleRightOpChange(e.target.value)}
                  style={{
                    padding: '6px 8px',
                    fontSize: 11,
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    fontFamily: 'monospace',
                    outline: 'none',
                  }}
                >
                  {inScopeVars.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name} ({v.type})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  data-testid="condition-right-val-input"
                  data-test-operand="right"
                  aria-label="Right Operand"
                  id="condition-right-operand-input"
                  value={rightOperand}
                  onChange={(e) => handleRightOpChange(e.target.value)}
                  placeholder="Value"
                  style={{
                    padding: '6px 8px',
                    fontSize: 11,
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    fontFamily: 'monospace',
                    outline: 'none',
                  }}
                />
              )
            )}
          </div>

          {sourceChoices.length > 0 && rightOperandType === 'literal' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
              <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>Options:</span>
              {sourceChoices.map((choice) => {
                const formatted = `"${choice}"`;
                const isSelected = rightOperand === formatted || rightOperand === choice;
                return (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => handleRightOpChange(formatted)}
                    title={`Click to compare with "${choice}"`}
                    style={{
                      background: isSelected ? '#eff6ff' : '#f8fafc',
                      border: isSelected ? '1px solid #3b82f6' : '1px solid #cbd5e1',
                      color: isSelected ? '#1d4ed8' : '#334155',
                      borderRadius: 4,
                      padding: '2px 7px',
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    "{choice}"
                  </button>
                );
              })}
            </div>
          )}

          {!['is_true', 'is_false', 'is_null'].includes(operator) && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 10, color: '#64748b' }}>
              <span>
                Compare against{' '}
                <button
                  type="button"
                  data-testid="toggle-right-compare-type-btn"
                  onClick={handleRightTypeToggle}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2563eb',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    fontSize: 10,
                    padding: 0,
                  }}
                >
                  {rightOperandType === 'literal' ? 'another variable' : 'literal value'}
                </button>
              </span>
            </div>
          )}
        </div>
      ) : (
        /* Mode 2: Expression Mode */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <textarea
            data-testid="condition-expression-textarea"
            rows={3}
            value={expression}
            onChange={(e) => handleExpressionChange(e.target.value)}
            placeholder="e.g. var1 == var2 && var1 > 0"
            style={{
              padding: '8px 10px',
              fontSize: 12,
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              background: '#090d16',
              color: '#f8fafc',
              fontFamily: 'monospace',
              outline: 'none',
              resize: 'vertical',
            }}
          />
          <span style={{ fontSize: 10, color: '#64748b' }}>
            Supports C# operators: ==, !=, &lt;, &gt;, &lt;=, &gt;=, &amp;&amp;, ||, !
          </span>
          {missingVariables.length > 0 && (
            <div
              data-testid="out-of-scope-warning"
              style={{
                fontSize: 11,
                color: '#b91c1c',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 4,
                padding: '4px 8px',
              }}
            >
              ⚠️ Not in upstream scope: {missingVariables.join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Preview Card */}
      <div
        style={{
          background: '#f8fafc',
          borderLeft: '3px solid #10b981',
          borderRadius: 4,
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <span style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Shape Label Preview
        </span>
        <span
          data-testid="condition-preview-label"
          style={{ fontSize: 11, fontWeight: 700, color: '#ec4899', fontFamily: 'monospace' }}
        >
          If {currentExpr}
        </span>
        <span style={{ fontSize: 10, color: '#475569', fontFamily: 'monospace', marginTop: 2 }}>
          {getCSharpCode(currentExpr)}
        </span>
      </div>
    </div>
  );
}
