import { useState, useMemo, useEffect, useRef } from 'react';
import type { DiagramDocument } from '../schema/diagram';
import { getGuaranteedUpstreamVariables } from '../analysis/scopeAnalysis';

export interface SwitchEditorProps {
  nodeId: string;
  nodeTitle?: string;
  data: Record<string, string>;
  document: DiagramDocument;
  onChange: (updates: Record<string, string>) => void;
}

export function SwitchEditor({
  nodeId,
  nodeTitle: _nodeTitle,
  data,
  document,
  onChange,
}: SwitchEditorProps) {
  const inScopeVars = useMemo(
    () => getGuaranteedUpstreamVariables(document, nodeId),
    [document, nodeId]
  );

  // Target Variable to evaluate
  const [valueKey, setValueKey] = useState<string>(() => {
    return data.valueContextKey || (inScopeVars[0]?.name ?? '');
  });

  // Cases parsing helper
  const parseCases = (raw: string | undefined): string[] => {
    if (!raw) return ['case-a', 'case-b'];
    return raw
      .split('|')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  };

  const [cases, setCases] = useState<string[]>(() => parseCases(data.caseKeys));
  const [defaultCase, setDefaultCase] = useState<string>(data.defaultCase || '');
  const [loopAfterCase, setLoopAfterCase] = useState<boolean>(data.loopAfterCase === 'true');

  // Auto-sync when in-scope variables become available or change
  useEffect(() => {
    if (inScopeVars.length > 0) {
      const isCurrentValid = valueKey && inScopeVars.some((v) => v.name === valueKey);
      if (!isCurrentValid || valueKey === 'SwitchKey') {
        const newVar = inScopeVars[0].name;
        setValueKey(newVar);
        if (data.valueContextKey !== newVar) {
          onChange({
            valueContextKey: newVar,
          });
        }
      }
    }
  }, [inScopeVars, valueKey, data.valueContextKey, onChange]);

  // Keep internal state in sync if data changes externally
  const prevValueKeyRef = useRef(data.valueContextKey);
  useEffect(() => {
    if (data.valueContextKey !== undefined && data.valueContextKey !== prevValueKeyRef.current) {
      prevValueKeyRef.current = data.valueContextKey;
      setValueKey(data.valueContextKey);
    }
  }, [data.valueContextKey]);

  const prevCaseKeysRef = useRef(data.caseKeys);
  useEffect(() => {
    if (data.caseKeys !== undefined && data.caseKeys !== prevCaseKeysRef.current) {
      prevCaseKeysRef.current = data.caseKeys;
      setCases(parseCases(data.caseKeys));
    }
  }, [data.caseKeys]);

  const prevDefaultCaseRef = useRef(data.defaultCase);
  useEffect(() => {
    if (data.defaultCase !== undefined && data.defaultCase !== prevDefaultCaseRef.current) {
      prevDefaultCaseRef.current = data.defaultCase;
      setDefaultCase(data.defaultCase);
    }
  }, [data.defaultCase]);

  const prevLoopRef = useRef(data.loopAfterCase);
  useEffect(() => {
    if (data.loopAfterCase !== undefined && data.loopAfterCase !== prevLoopRef.current) {
      prevLoopRef.current = data.loopAfterCase;
      setLoopAfterCase(data.loopAfterCase === 'true');
    }
  }, [data.loopAfterCase]);

  const handleValueKeyChange = (newKey: string) => {
    setValueKey(newKey);
    onChange({ valueContextKey: newKey });
  };

  const handleCaseChange = (index: number, val: string) => {
    const updated = [...cases];
    updated[index] = val;
    setCases(updated);
    onChange({ caseKeys: updated.join(' | ') });
  };

  const handleAddCase = () => {
    const nextName = `case-${String.fromCharCode(97 + cases.length)}`;
    const updated = [...cases, nextName];
    setCases(updated);
    onChange({ caseKeys: updated.join(' | ') });
  };

  const handleDeleteCase = (index: number) => {
    if (cases.length <= 1) return; // Keep at least one case
    const updated = cases.filter((_, i) => i !== index);
    setCases(updated);
    onChange({ caseKeys: updated.join(' | ') });
  };

  const handleDefaultCaseChange = (val: string) => {
    setDefaultCase(val);
    onChange({ defaultCase: val });
  };

  const handleLoopToggle = (checked: boolean) => {
    setLoopAfterCase(checked);
    onChange({ loopAfterCase: checked ? 'true' : 'false' });
  };

  const selectedVarObj = inScopeVars.find((v) => v.name === valueKey);
  const typeStr = selectedVarObj ? selectedVarObj.type : 'string';
  const effectiveKey = valueKey || data.valueContextKey || 'SwitchKey';

  const previewCasesStr = cases.join(' | ');

  return (
    <div data-testid="switch-editor" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
          Switch Logic
        </span>
        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>
          {cases.length} branches
        </span>
      </div>

      {/* In-Scope Target Variables */}
      <div
        data-testid="switch-scope-container"
        style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: '10px 12px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            In-Scope Target Variable
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
                data-testid={`switch-var-chip-${v.name}`}
                onClick={() => handleValueKeyChange(v.name)}
                title={`Click to evaluate ${v.name}`}
                style={{
                  background: valueKey === v.name ? '#eff6ff' : '#ffffff',
                  border: valueKey === v.name ? '1.5px solid #3b82f6' : '1px solid #cbd5e1',
                  color: valueKey === v.name ? '#1d4ed8' : '#334155',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  boxShadow: valueKey === v.name ? '0 1px 2px rgba(59,130,246,0.15)' : 'none',
                }}
              >
                <span>{v.name}</span>
                <span style={{ fontSize: 9, color: '#64748b', fontWeight: 400 }}>:{v.type}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* No incoming variables notice */}
      {inScopeVars.length === 0 && (
        <div
          data-testid="switch-no-vars-hint"
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
            Connect an upstream activity (like <em>Set Variable</em>) to this shape's input port to evaluate its variables, or enter a custom key below.
          </div>
        </div>
      )}

      {/* Target Variable Dropdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Evaluate Variable / Key
        </label>
        {inScopeVars.length > 0 ? (
          <select
            data-testid="switch-target-var-select"
            value={valueKey}
            onChange={(e) => handleValueKeyChange(e.target.value)}
            style={{
              padding: '6px 8px',
              fontSize: 11,
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              fontFamily: 'monospace',
              fontWeight: 600,
              color: '#1e293b',
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
            data-testid="switch-target-var-input"
            value={valueKey}
            onChange={(e) => handleValueKeyChange(e.target.value)}
            placeholder="e.g. status, userRole, category"
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
        )}
      </div>

      {/* Branching Cases Manager */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Branching Cases (Output Ports)
          </label>
          <span style={{ fontSize: 10, color: '#64748b' }}>{cases.length} ports</span>
        </div>

        <div
          data-testid="switch-cases-container"
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 6,
            padding: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {cases.map((c, i) => (
            <div
              key={i}
              data-testid={`switch-case-row-${i}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 4,
                padding: '4px 6px',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#ec4899',
                  flexShrink: 0,
                }}
                title={`Output Port: ${c}`}
              />
              <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>Case:</span>
              <input
                type="text"
                data-testid={`switch-case-input-${i}`}
                value={c}
                onChange={(e) => handleCaseChange(i, e.target.value)}
                style={{
                  flex: 1,
                  border: '1px solid #cbd5e1',
                  borderRadius: 3,
                  padding: '3px 6px',
                  fontSize: 11,
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  color: '#1e293b',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                data-testid={`switch-case-delete-${i}`}
                onClick={() => handleDeleteCase(i)}
                title="Delete this case branch"
                disabled={cases.length <= 1}
                style={{
                  border: 'none',
                  background: 'none',
                  color: cases.length <= 1 ? '#cbd5e1' : '#94a3b8',
                  cursor: cases.length <= 1 ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                  lineHeight: 1,
                  padding: '0 4px',
                }}
              >
                ×
              </button>
            </div>
          ))}

          <button
            type="button"
            data-testid="switch-add-case-btn"
            onClick={handleAddCase}
            style={{
              border: '1px dashed #cbd5e1',
              background: '#f8fafc',
              color: '#2563eb',
              fontSize: 10.5,
              fontWeight: 600,
              padding: 5,
              borderRadius: 4,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              marginTop: 2,
            }}
          >
            <span>＋</span> Add Case Branch
          </button>
        </div>
      </div>

      {/* Default Fallback Port */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Default Fallback Port
          </label>
          {defaultCase ? (
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                color: '#b45309',
                background: '#fef3c7',
                border: '1px solid #fde68a',
                padding: '1px 6px',
                borderRadius: 10,
                textTransform: 'uppercase',
              }}
            >
              Active
            </span>
          ) : (
            <span style={{ fontSize: 10, color: '#94a3b8' }}>Optional</span>
          )}
        </div>

        {defaultCase ? (
          <div
            data-testid="switch-default-port-card"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#fffbeb',
              border: '1.5px solid #fde68a',
              borderRadius: 6,
              padding: '6px 10px',
              gap: 8,
              boxShadow: '0 1px 2px rgba(245, 158, 11, 0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: '#f59e0b',
                  boxShadow: '0 0 0 2px #fef3c7',
                  flexShrink: 0,
                }}
                title="Default Port (Amber)"
              />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e', fontFamily: 'monospace' }}>
                    Default Port
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      color: '#d97706',
                      background: '#fef3c7',
                      padding: '1px 4px',
                      borderRadius: 3,
                    }}
                  >
                    Output
                  </span>
                </div>
                <span style={{ fontSize: 9.5, color: '#b45309', marginTop: 1 }}>
                  Fallback branch when no cases match
                </span>
              </div>
            </div>

            <button
              type="button"
              data-testid="switch-remove-default-port-btn"
              onClick={() => handleDefaultCaseChange('')}
              title="Remove default port"
              style={{
                border: '1px solid #fde68a',
                background: '#ffffff',
                color: '#b45309',
                cursor: 'pointer',
                fontSize: 14,
                lineHeight: 1,
                padding: '3px 8px',
                borderRadius: 4,
                fontWeight: 700,
                transition: 'all 0.15s ease',
              }}
            >
              ×
            </button>
          </div>
        ) : (
          <button
            type="button"
            data-testid="switch-add-default-port-btn"
            onClick={() => handleDefaultCaseChange('Default')}
            style={{
              border: '1.5px dashed #f59e0b',
              background: '#fffbeb',
              color: '#d97706',
              fontSize: 11,
              fontWeight: 700,
              padding: '7px 10px',
              borderRadius: 6,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'background 0.15s ease, border-color 0.15s ease',
              boxShadow: '0 1px 2px rgba(245, 158, 11, 0.05)',
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#f59e0b',
                display: 'inline-block',
              }}
            />
            <span>＋ Add Default Port</span>
          </button>
        )}
      </div>

      {/* Loop After Case Checkbox */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 5,
          padding: '6px 8px',
        }}
      >
        <input
          type="checkbox"
          id="switch-loop-after-case"
          data-testid="switch-loop-checkbox"
          checked={loopAfterCase}
          onChange={(e) => handleLoopToggle(e.target.checked)}
          style={{ cursor: 'pointer' }}
        />
        <label
          htmlFor="switch-loop-after-case"
          style={{ fontSize: 11, cursor: 'pointer', color: '#334155', fontWeight: 500 }}
        >
          Loop Back After Branch Execution
        </label>
      </div>

      {/* Live Shape & C# Preview Card */}
      <div
        style={{
          background: '#f8fafc',
          borderLeft: '3px solid #ec4899',
          borderRadius: 4,
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        }}
      >
        <span style={{ fontSize: 9.5, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>
          Shape Label Preview
        </span>
        <span
          data-testid="switch-preview-label"
          style={{ fontSize: 11, fontWeight: 700, color: '#ec4899', fontFamily: 'monospace' }}
        >
          Switch on {effectiveKey}: [{previewCasesStr}]
        </span>
        <span style={{ fontSize: 9.5, color: '#475569', fontFamily: 'monospace', marginTop: 2, lineHeight: 1.3 }}>
          switch (context.Get&lt;{typeStr}&gt;("{effectiveKey}")) &#123; ... &#125;
        </span>
      </div>
    </div>
  );
}
