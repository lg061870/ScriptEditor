import { useMemo } from 'react';
import type { DiagramDocument } from '../schema/diagram';
import { getAvailableUpstreamVariables } from '../analysis/scopeAnalysis';

export interface GlobalVariableEditorProps {
  nodeId: string;
  nodeTitle?: string;
  data: Record<string, string>;
  document: DiagramDocument;
  onChange: (updates: Record<string, string>) => void;
}

export function GlobalVariableEditor({
  nodeId,
  nodeTitle: _nodeTitle,
  data,
  document,
  onChange,
}: GlobalVariableEditorProps) {
  const inScopeVars = useMemo(
    () => getAvailableUpstreamVariables(document, nodeId),
    [document, nodeId]
  );

  const promotionMode = data.promotionMode === 'specific' ? 'specific' : 'all';
  const sourceKey = data.sourceKey ?? '';
  const rawGlobalKey = data.globalKey ?? '';
  const effectiveGlobalKey =
    rawGlobalKey && rawGlobalKey !== 'Global_<Key>'
      ? rawGlobalKey
      : sourceKey
      ? sourceKey.startsWith('Global_')
        ? sourceKey
        : `Global_${sourceKey}`
      : 'Global_<Key>';

  const handleModeChange = (mode: 'all' | 'specific') => {
    if (mode === 'all') {
      onChange({
        promotionMode: 'all',
        sourceKey: '',
        globalKey: 'Global_<Key>',
      });
    } else {
      const defaultSource = inScopeVars[0]?.name || sourceKey || 'selectedVariable';
      const target = defaultSource.startsWith('Global_') ? defaultSource : `Global_${defaultSource}`;
      onChange({
        promotionMode: 'specific',
        sourceKey: defaultSource,
        globalKey: target,
      });
    }
  };

  const handleSourceKeyChange = (newSource: string) => {
    const trimmed = newSource.trim();
    const newGlobal = trimmed
      ? trimmed.startsWith('Global_')
        ? trimmed
        : `Global_${trimmed}`
      : 'Global_<Key>';

    onChange({
      promotionMode: 'specific',
      sourceKey: newSource,
      globalKey: newGlobal,
    });
  };

  const handleGlobalKeyChange = (newGlobal: string) => {
    onChange({
      promotionMode: 'specific',
      globalKey: newGlobal,
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Promotion Mode Toggle */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: 11,
            fontWeight: 600,
            color: '#475569',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            marginBottom: 6,
          }}
        >
          Promotion Scope
        </label>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={() => handleModeChange('all')}
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              border: promotionMode === 'all' ? '1px solid #0d9488' : '1px solid #cbd5e1',
              backgroundColor: promotionMode === 'all' ? '#f0fdfa' : '#ffffff',
              color: promotionMode === 'all' ? '#0f766e' : '#64748b',
              transition: 'all 0.15s ease',
            }}
          >
            🌐 All Variables
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('specific')}
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              border: promotionMode === 'specific' ? '1px solid #0d9488' : '1px solid #cbd5e1',
              backgroundColor: promotionMode === 'specific' ? '#f0fdfa' : '#ffffff',
              color: promotionMode === 'specific' ? '#0f766e' : '#64748b',
              transition: 'all 0.15s ease',
            }}
          >
            🎯 Specific Variable
          </button>
        </div>
      </div>

      {promotionMode === 'all' ? (
        <div
          style={{
            padding: 10,
            borderRadius: 6,
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            fontSize: 12,
            color: '#475569',
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 600, color: '#0f766e', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>🌐 Conversation-Global Scope</span>
          </div>
          Promotes all active topic-level context variables into the conversation-wide global store, prefixing each key with <code style={{ backgroundColor: '#e2e8f0', padding: '1px 4px', borderRadius: 3 }}>Global_</code> so subtopics can access them.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Source Variable Picker */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#475569',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Source Variable (Topic Scope)
              </label>
            </div>

            {inScopeVars.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                <select
                  value={sourceKey}
                  onChange={(e) => handleSourceKeyChange(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: 12,
                    backgroundColor: '#ffffff',
                    color: '#1e293b',
                    marginBottom: 6,
                  }}
                >
                  <option value="">-- Choose from available variables --</option>
                  {inScopeVars.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name} ({v.type}) - from {v.sourceNodeName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <input
              type="text"
              value={sourceKey}
              placeholder="e.g. userProfile"
              onChange={(e) => handleSourceKeyChange(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 8px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontSize: 12,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Target Global Key */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 11,
                fontWeight: 600,
                color: '#475569',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: 4,
              }}
            >
              Target Global Key
            </label>
            <input
              type="text"
              value={rawGlobalKey && rawGlobalKey !== 'Global_<Key>' ? rawGlobalKey : effectiveGlobalKey}
              placeholder="e.g. Global_userProfile"
              onChange={(e) => handleGlobalKeyChange(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 8px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontSize: 12,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Live Preview / Mapping Chip */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 10px',
              borderRadius: 6,
              backgroundColor: '#f0fdfa',
              border: '1px solid #ccfbf1',
              fontSize: 11,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
              <span style={{ color: '#64748b' }}>Topic:</span>
              <code style={{ color: '#0f766e', fontWeight: 600 }}>{sourceKey || '(none)'}</code>
            </div>
            <span style={{ color: '#0d9488', fontWeight: 700 }}>➔</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
              <span style={{ color: '#64748b' }}>Global:</span>
              <code style={{ color: '#0d9488', fontWeight: 600 }}>{effectiveGlobalKey}</code>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
