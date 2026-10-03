import { useState, useEffect, useMemo, useRef, type ChangeEvent } from 'react';
import type { DiagramDocument } from '../schema/diagram';
import { getAvailableUpstreamVariables } from '../analysis/scopeAnalysis';

export interface BotMessageEditorProps {
  nodeId: string;
  nodeTitle?: string;
  data: Record<string, string>;
  document: DiagramDocument;
  onChange: (updates: Record<string, string>) => void;
}

export function BotMessageEditor({
  nodeId,
  nodeTitle: _nodeTitle,
  data,
  document,
  onChange,
}: BotMessageEditorProps) {
  const inScopeVars = useMemo(
    () => getAvailableUpstreamVariables(document, nodeId),
    [document, nodeId]
  );

  const inScopeVarNames = useMemo(
    () => new Set(inScopeVars.map((v) => v.name)),
    [inScopeVars]
  );

  const rawMessage = data.message ?? '';

  // Extract variables used in the current message
  const usedVars = useMemo(() => {
    const matches = rawMessage.match(/\{([a-zA-Z0-9_]+)\}/g);
    if (!matches) return [];
    return Array.from(new Set(matches.map((m) => m.slice(1, -1))));
  }, [rawMessage]);

  // Identify out-of-scope variables
  const outOfScopeVars = useMemo(() => {
    return usedVars.filter((v) => !inScopeVarNames.has(v));
  }, [usedVars, inScopeVarNames]);

  const hasOutOfScope = outOfScopeVars.length > 0;

  // Determine initial mode: 'direct' if message is purely {varName}, otherwise 'template'
  const isDirectMatch = /^\{[a-zA-Z0-9_]+\}$/.test(rawMessage.trim());
  const initialMode = (data.compositionMode as 'template' | 'direct') || (isDirectMatch ? 'direct' : 'template');
  const [mode, setMode] = useState<'template' | 'direct'>(initialMode);

  // Synchronize hasScopeError with node data if out-of-scope status changed
  useEffect(() => {
    const expected = hasOutOfScope ? 'true' : 'false';
    if (data.hasScopeError !== expected) {
      onChange({ hasScopeError: expected });
    }
  }, [hasOutOfScope, data.hasScopeError, onChange]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  const handleMessageChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const nextMessage = e.target.value;
    const matches = nextMessage.match(/\{([a-zA-Z0-9_]+)\}/g);
    const tokens = matches ? Array.from(new Set(matches.map((m) => m.slice(1, -1)))) : [];
    const outOfScope = tokens.filter((v) => !inScopeVarNames.has(v));

    onChange({
      message: nextMessage,
      compositionMode: mode,
      hasScopeError: outOfScope.length > 0 ? 'true' : 'false',
    });
  };

  const handleModeChange = (newMode: 'template' | 'direct') => {
    setMode(newMode);
    if (newMode === 'direct') {
      const targetVar = inScopeVars[0]?.name || 'Global_Example';
      const isOut = !inScopeVarNames.has(targetVar);
      onChange({
        message: `{${targetVar}}`,
        compositionMode: 'direct',
        hasScopeError: isOut ? 'true' : 'false',
      });
    } else {
      onChange({
        compositionMode: 'template',
        hasScopeError: hasOutOfScope ? 'true' : 'false',
      });
    }
  };

  const handleInsertVariable = (varName: string) => {
    const textarea = textareaRef.current;
    const token = `{${varName}}`;

    let nextMessage = '';
    if (!textarea) {
      nextMessage = rawMessage ? `${rawMessage} ${token}` : token;
    } else {
      const isFocused = typeof globalThis.document !== 'undefined' && globalThis.document.activeElement === textarea;
      const start = isFocused && textarea.selectionStart != null ? textarea.selectionStart : rawMessage.length;
      const end = isFocused && textarea.selectionEnd != null ? textarea.selectionEnd : rawMessage.length;
      nextMessage = rawMessage.substring(0, start) + token + rawMessage.substring(end);
    }

    const matches = nextMessage.match(/\{([a-zA-Z0-9_]+)\}/g);
    const tokens = matches ? Array.from(new Set(matches.map((m) => m.slice(1, -1)))) : [];
    const outOfScope = tokens.filter((v) => !inScopeVarNames.has(v));

    onChange({
      message: nextMessage,
      compositionMode: 'template',
      hasScopeError: outOfScope.length > 0 ? 'true' : 'false',
    });

    if (textarea) {
      const start = textarea.selectionStart != null ? textarea.selectionStart : rawMessage.length;
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(start + token.length, start + token.length);
      });
    }
  };

  const handleDirectVarSelect = (varName: string) => {
    const isOut = !inScopeVarNames.has(varName);
    onChange({
      message: `{${varName}}`,
      compositionMode: 'direct',
      hasScopeError: isOut ? 'true' : 'false',
    });
  };

  const handleRemoveOutOfScope = () => {
    let updated = rawMessage;
    for (const v of outOfScopeVars) {
      updated = updated.replaceAll(`{${v}}`, '');
    }
    updated = updated.replace(/[ \t]{2,}/g, ' ');
    onChange({
      message: updated,
      compositionMode: mode,
      hasScopeError: 'false',
    });
  };

  const handleReplaceVar = (oldVar: string, newVar: string) => {
    const updated = rawMessage.replaceAll(`{${oldVar}}`, `{${newVar}}`);
    const nextUsed = Array.from(new Set((updated.match(/\{([a-zA-Z0-9_]+)\}/g) || []).map((m) => m.slice(1, -1))));
    const remainingOutOfScope = nextUsed.filter((v) => !inScopeVarNames.has(v));
    onChange({
      message: updated,
      compositionMode: mode,
      hasScopeError: remainingOutOfScope.length > 0 ? 'true' : 'false',
    });
  };

  // Generate simulated preview elements with in-scope values and out-of-scope warning badges
  const previewElements = useMemo(() => {
    if (!rawMessage) return <span style={{ color: '#94a3b8' }}>(Empty message)</span>;

    const regex = /\{([a-zA-Z0-9_]+)\}/g;
    const elements: React.ReactNode[] = [];
    let lastIdx = 0;
    let m: RegExpExecArray | null;

    while ((m = regex.exec(rawMessage)) !== null) {
      const before = rawMessage.slice(lastIdx, m.index);
      if (before) {
        elements.push(<span key={lastIdx}>{before}</span>);
      }
      const varName = m[1];
      const inScopeVar = inScopeVars.find((v) => v.name === varName);

      if (inScopeVar) {
        let sampleVal = inScopeVar.defaultValue;
        if (!sampleVal) {
          if (inScopeVar.type === 'int') sampleVal = '10482';
          else if (inScopeVar.type === 'double') sampleVal = '250.00';
          else if (inScopeVar.type === 'boolean') sampleVal = 'true';
          else sampleVal = inScopeVar.name.toLowerCase().includes('name') ? 'Alice Smith' : 'SampleValue';
        }
        elements.push(
          <span
            key={m.index}
            data-testid={`preview-resolved-${varName}`}
            style={{
              color: '#15803d',
              fontWeight: 600,
              background: '#dcfce7',
              padding: '0 4px',
              borderRadius: 3,
            }}
          >
            [{sampleVal}]
          </span>
        );
      } else {
        elements.push(
          <span
            key={m.index}
            data-testid={`preview-unresolved-${varName}`}
            style={{
              color: '#b91c1c',
              fontWeight: 700,
              background: '#fee2e2',
              border: '1px solid #fca5a5',
              padding: '0 4px',
              borderRadius: 3,
            }}
            title={`Variable '{${varName}}' is not in scope!`}
          >
            ⚠️ {`{${varName}} (Out of Scope)`}
          </span>
        );
      }
      lastIdx = m.index + m[0].length;
    }

    const after = rawMessage.slice(lastIdx);
    if (after) {
      elements.push(<span key={lastIdx}>{after}</span>);
    }

    return elements;
  }, [rawMessage, inScopeVars]);

  // Render backdrop text with red squiggly underlines for out-of-scope variables
  const renderBackdropTokens = (text: string) => {
    if (!text) return null;
    const regex = /\{([a-zA-Z0-9_]+)\}/g;
    const elements: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const textBefore = text.slice(lastIndex, match.index);
      if (textBefore) {
        elements.push(<span key={lastIndex} style={{ color: 'transparent' }}>{textBefore}</span>);
      }
      const varName = match[1];
      const isOutOfScope = !inScopeVarNames.has(varName);

      elements.push(
        <span
          key={match.index}
          data-testid={isOutOfScope ? `out-of-scope-token-${varName}` : `in-scope-token-${varName}`}
          style={{
            color: 'transparent',
            textDecoration: isOutOfScope ? 'underline wavy #ef4444 2px' : 'none',
            textDecorationSkipInk: 'none',
            background: isOutOfScope ? 'rgba(239, 68, 68, 0.16)' : 'rgba(59, 130, 246, 0.08)',
            borderRadius: 2,
          }}
        >
          {match[0]}
        </span>
      );
      lastIndex = match.index + match[0].length;
    }

    const textAfter = text.slice(lastIndex);
    if (textAfter) {
      elements.push(<span key={lastIndex} style={{ color: 'transparent' }}>{textAfter}</span>);
    }

    if (text.endsWith('\n')) {
      elements.push(<span key="newline-pad" style={{ color: 'transparent' }}>{'\n '}</span>);
    }

    return elements;
  };

  const directVarName = rawMessage.replace(/^\{|\}$/g, '');
  const directVarOutOfScope = mode === 'direct' && Boolean(directVarName) && !inScopeVarNames.has(directVarName);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Composition Mode Tabs */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>
          Message Composition
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            background: '#f1f5f9',
            padding: 2,
            borderRadius: 6,
            gap: 2,
            border: '1px solid #e2e8f0',
          }}
        >
          <button
            type="button"
            onClick={() => handleModeChange('template')}
            data-testid="mode-tab-template"
            style={{
              padding: '5px 8px',
              textAlign: 'center',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              borderRadius: 4,
              border: 'none',
              background: mode === 'template' ? '#ffffff' : 'transparent',
              color: mode === 'template' ? '#1e293b' : '#64748b',
              boxShadow: mode === 'template' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            Text & Variables
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('direct')}
            data-testid="mode-tab-direct"
            style={{
              padding: '5px 8px',
              textAlign: 'center',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              borderRadius: 4,
              border: 'none',
              background: mode === 'direct' ? '#ffffff' : 'transparent',
              color: mode === 'direct' ? '#1e293b' : '#64748b',
              boxShadow: mode === 'direct' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            Variable Only
          </button>
        </div>
      </div>

      {mode === 'template' ? (
        <>
          {/* Available Variables Toolset */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              padding: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                ⚡ Upstream Variables ({inScopeVars.length})
              </span>
              <span style={{ fontSize: 10, color: '#94a3b8' }}>
                Click to insert at cursor
              </span>
            </div>

            {inScopeVars.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {inScopeVars.map((v) => (
                  <button
                    key={v.name}
                    type="button"
                    onClick={() => handleInsertVariable(v.name)}
                    data-testid={`insert-var-${v.name}`}
                    title={`Source: ${v.sourceNodeName} (${v.sourceNodeType})\nType: ${v.type}`}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: 14,
                      padding: '3px 8px',
                      fontSize: 11,
                      fontFamily: 'monospace',
                      color: '#1e293b',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      transition: 'all 0.15s ease',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                    }}
                  >
                    <span style={{ color: '#2563eb', fontWeight: 600 }}>+</span>
                    <span>{`{${v.name}}`}</span>
                    <span
                      style={{
                        fontSize: 9,
                        background: '#f1f5f9',
                        color: '#64748b',
                        padding: '1px 4px',
                        borderRadius: 6,
                        border: '1px solid #e2e8f0',
                      }}
                    >
                      {v.type}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div
                style={{
                  fontSize: 11,
                  color: '#64748b',
                  background: '#f1f5f9',
                  padding: '8px 10px',
                  borderRadius: 5,
                  lineHeight: 1.4,
                  border: '1px dashed #cbd5e1',
                }}
              >
                💡 No upstream variables found yet. Connect a <strong>Set Variable</strong>, <strong>Prompt</strong>, or <strong>Adaptive Card</strong> upstream to insert dynamic values.
              </div>
            )}
          </div>

          {/* Message Textarea with squiggly underline backdrop */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: hasOutOfScope ? '#dc2626' : '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Message Text {hasOutOfScope && <span style={{ color: '#dc2626' }}>• Out of Scope</span>}
              </label>
              <span style={{ fontSize: 10, color: hasOutOfScope ? '#dc2626' : '#64748b', fontWeight: hasOutOfScope ? 700 : 400 }}>
                {hasOutOfScope
                  ? `⚠️ ${outOfScopeVars.length} invalid variable${outOfScopeVars.length > 1 ? 's' : ''}`
                  : usedVars.length > 0
                  ? `${usedVars.length} variable${usedVars.length > 1 ? 's' : ''} in scope`
                  : 'Static text'}
              </span>
            </div>

            <div style={{ position: 'relative', width: '100%' }}>
              {/* Highlight backdrop with red squiggly underlines */}
              <div
                ref={backdropRef}
                aria-hidden="true"
                data-testid="bot-message-backdrop"
                style={{
                  position: 'absolute',
                  inset: 0,
                  padding: '8px 10px',
                  fontSize: 12,
                  lineHeight: 1.5,
                  fontFamily: 'inherit',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  overflow: 'hidden',
                  pointerEvents: 'none',
                  boxSizing: 'border-box',
                  borderRadius: 6,
                  border: hasOutOfScope ? '1.5px solid #ef4444' : '1px solid #cbd5e1',
                  background: hasOutOfScope ? '#fffbfa' : '#ffffff',
                }}
              >
                {renderBackdropTokens(rawMessage)}
              </div>

              {/* Editable Textarea overlay */}
              <textarea
                ref={textareaRef}
                value={rawMessage}
                onChange={handleMessageChange}
                onScroll={handleScroll}
                data-testid="bot-message-textarea"
                placeholder="Enter message text... Type {variableName} or click a variable chip above to insert."
                style={{
                  position: 'relative',
                  width: '100%',
                  minHeight: 90,
                  padding: '8px 10px',
                  fontSize: 12,
                  lineHeight: 1.5,
                  border: hasOutOfScope ? '1.5px solid #ef4444' : '1px solid #cbd5e1',
                  borderRadius: 6,
                  outline: 'none',
                  resize: 'vertical',
                  background: 'transparent',
                  color: '#1e293b',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                  caretColor: '#1e293b',
                  boxShadow: hasOutOfScope ? '0 0 0 2px rgba(239, 68, 68, 0.15)' : 'none',
                }}
              />
            </div>

            {/* Out-of-scope validation alert and quick fixes */}
            {hasOutOfScope && (
              <div
                data-testid="out-of-scope-warning"
                style={{
                  marginTop: 8,
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 6,
                  padding: '9px 11px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#dc2626', fontSize: 11, fontWeight: 700 }}>
                    <span>⚠️</span>
                    <span>
                      {outOfScopeVars.length === 1
                        ? `Variable {${outOfScopeVars[0]}} is not in scope`
                        : `${outOfScopeVars.length} variables are not in scope`}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      background: '#fee2e2',
                      color: '#b91c1c',
                      padding: '1px 6px',
                      borderRadius: 4,
                      border: '1px solid #fca5a5',
                    }}
                  >
                    Not Allowed
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#7f1d1d', lineHeight: 1.4 }}>
                  {outOfScopeVars.length === 1 ? (
                    <>
                      The variable <code style={{ background: '#fee2e2', padding: '1px 4px', borderRadius: 3, fontWeight: 600 }}>{`{${outOfScopeVars[0]}}`}</code> is not defined in any connected upstream node. Variables must exist upstream to be used here.
                    </>
                  ) : (
                    <>
                      The variables {outOfScopeVars.map((v) => <code key={v} style={{ background: '#fee2e2', padding: '1px 4px', borderRadius: 3, fontWeight: 600, marginRight: 4 }}>{`{${v}}`}</code>)} are not defined upstream.
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <button
                    type="button"
                    onClick={handleRemoveOutOfScope}
                    data-testid="remove-out-of-scope-btn"
                    style={{
                      background: '#dc2626',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 4,
                      padding: '4px 9px',
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                    title="Remove all out-of-scope variables from message text"
                  >
                    <span>✕</span>
                    <span>Remove {outOfScopeVars.length === 1 ? `{${outOfScopeVars[0]}}` : 'invalid variables'}</span>
                  </button>
                  {inScopeVars.length > 0 && outOfScopeVars.length === 1 && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, color: '#991b1b', fontWeight: 500 }}>or replace with:</span>
                      {inScopeVars.map((v) => (
                        <button
                          key={v.name}
                          type="button"
                          onClick={() => handleReplaceVar(outOfScopeVars[0], v.name)}
                          data-testid={`replace-with-${v.name}`}
                          style={{
                            background: '#ffffff',
                            color: '#1e40af',
                            border: '1px solid #bfdbfe',
                            borderRadius: 4,
                            padding: '3px 7px',
                            fontSize: 10,
                            fontFamily: 'monospace',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                          title={`Replace {${outOfScopeVars[0]}} with {${v.name}}`}
                        >
                          {`{${v.name}}`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Variable Only Mode */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: directVarOutOfScope ? '#dc2626' : '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Select Output Variable {directVarOutOfScope && <span style={{ color: '#dc2626' }}>• Out of Scope</span>}
          </label>
          {inScopeVars.length > 0 ? (
            <select
              value={directVarName}
              onChange={(e) => handleDirectVarSelect(e.target.value)}
              data-testid="bot-message-direct-var-select"
              style={{
                width: '100%',
                padding: '6px 8px',
                fontSize: 12,
                border: directVarOutOfScope ? '1.5px solid #ef4444' : '1px solid #cbd5e1',
                borderRadius: 5,
                background: '#ffffff',
                color: directVarOutOfScope ? '#dc2626' : '#1e293b',
                outline: 'none',
              }}
            >
              {directVarOutOfScope && (
                <option value={directVarName} disabled style={{ color: '#dc2626', fontWeight: 600 }}>
                  ⚠️ {directVarName} (Out of scope - invalid)
                </option>
              )}
              {inScopeVars.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} ({v.type}) — from {v.sourceNodeName}
                </option>
              ))}
            </select>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                type="text"
                value={directVarName}
                onChange={(e) => handleDirectVarSelect(e.target.value)}
                placeholder="Enter variable name (e.g. TheWorldPart)"
                data-testid="bot-message-direct-var-input"
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  fontSize: 12,
                  border: '1px solid #cbd5e1',
                  borderRadius: 5,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <span style={{ fontSize: 10, color: '#64748b' }}>
                💡 No upstream variables detected. Connect an upstream activity to supply variables.
              </span>
            </div>
          )}

          {directVarOutOfScope && (
            <div
              data-testid="direct-var-out-of-scope-warning"
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 6,
                padding: '8px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ color: '#dc2626', fontSize: 11, fontWeight: 700 }}>
                ⚠️ Variable '{directVarName}' is no longer in scope
              </div>
              <div style={{ fontSize: 11, color: '#7f1d1d' }}>
                This variable was removed from the diagram. Please switch to an available in-scope variable.
              </div>
              {inScopeVars.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleDirectVarSelect(inScopeVars[0].name)}
                  data-testid="fix-direct-var-btn"
                  style={{
                    alignSelf: 'flex-start',
                    background: '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 4,
                    padding: '4px 8px',
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Switch to {`{${inScopeVars[0].name}}`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Live Runtime Preview */}
      <div
        style={{
          background: hasOutOfScope ? '#fffbfa' : '#f0fdf4',
          border: hasOutOfScope ? '1px solid #fecaca' : '1px solid #bbf7d0',
          borderRadius: 6,
          padding: '8px 10px',
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: hasOutOfScope ? '#b91c1c' : '#166534',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            marginBottom: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>{hasOutOfScope ? '⚠️ Live Simulation Preview (Unresolved Tokens)' : '👁️ Live Simulation Preview'}</span>
          </div>
          {hasOutOfScope && (
            <span style={{ fontSize: 9.5, color: '#dc2626', fontWeight: 600 }}>
              {outOfScopeVars.length} out of scope
            </span>
          )}
        </div>
        <div
          data-testid="bot-message-preview"
          style={{
            fontSize: 11,
            color: hasOutOfScope ? '#7f1d1d' : '#14532d',
            lineHeight: 1.4,
            background: '#ffffff',
            padding: '6px 8px',
            borderRadius: 4,
            border: hasOutOfScope ? '1px solid #fca5a5' : '1px solid #dcfce7',
            wordBreak: 'break-word',
          }}
        >
          {previewElements}
        </div>
      </div>
    </div>
  );
}

