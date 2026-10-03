import { useState, useMemo } from 'react';
import type { DiagramDocument } from '../schema/diagram';
import { getAvailableUpstreamVariables } from '../analysis/scopeAnalysis';

export interface ForEachEditorProps {
  nodeId: string;
  nodeTitle?: string;
  data: Record<string, string>;
  document: DiagramDocument;
  onChange: (updates: Record<string, string>) => void;
}

export function ForEachEditor({
  nodeId,
  nodeTitle: _nodeTitle,
  data,
  document,
  onChange,
}: ForEachEditorProps) {
  const inScopeVars = useMemo(
    () => getAvailableUpstreamVariables(document, nodeId),
    [document, nodeId]
  );

  const [collectionKey, setCollectionKey] = useState<string>(data.collectionKey || 'Items');
  const [itemKey, setItemKey] = useState<string>(data.itemKey || 'item');
  const [indexKey, setIndexKey] = useState<string>(data.indexKey || 'index');

  const handleCollectionChange = (val: string) => {
    // Strip braces if entered as {Items}
    const clean = val.replace(/^\{|\}$/g, '').trim();
    setCollectionKey(clean);
    onChange({ collectionKey: clean });
  };

  const handleItemKeyChange = (val: string) => {
    const clean = val.replace(/^\{|\}$/g, '').trim();
    setItemKey(clean);
    onChange({ itemKey: clean });
  };

  const handleIndexKeyChange = (val: string) => {
    const clean = val.replace(/^\{|\}$/g, '').trim();
    setIndexKey(clean);
    onChange({ indexKey: clean });
  };

  // Find if collectionKey matches any known upstream variable
  const matchedVar = inScopeVars.find((v) => v.name === collectionKey);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Overview Banner */}
      <div
        style={{
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: 8,
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 12, color: '#166534' }}>
          <span>🔁</span>
          <span>For Each Collection Loop</span>
        </div>
        <p style={{ margin: 0, fontSize: 11, color: '#15803d', lineHeight: 1.4 }}>
          Iterates sequentially over a list or range. Executes connected <strong>Loop Body</strong> activities for each item, then exits through <strong>Done</strong>.
        </p>
      </div>

      {/* Collection Key Configuration */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Collection Variable (List / Range)
          </label>
          {matchedVar && (
            <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 600, background: '#dcfce7', padding: '1px 6px', borderRadius: 4 }}>
              ✓ Found upstream ({matchedVar.type})
            </span>
          )}
        </div>

        {inScopeVars.length > 0 ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={collectionKey}
              onChange={(e) => handleCollectionChange(e.target.value)}
              placeholder="e.g. Items or Numbers"
              data-testid="foreach-collection-input"
              style={{
                flex: 1,
                padding: '6px 8px',
                fontSize: 12,
                borderRadius: 5,
                border: '1px solid #cbd5e1',
                outline: 'none',
              }}
            />
            <select
              value={inScopeVars.some((v) => v.name === collectionKey) ? collectionKey : ''}
              onChange={(e) => {
                if (e.target.value) handleCollectionChange(e.target.value);
              }}
              style={{
                maxWidth: 140,
                padding: '6px 6px',
                fontSize: 11,
                borderRadius: 5,
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                color: '#334155',
                outline: 'none',
              }}
              title="Select an in-scope variable"
            >
              <option value="">Pick upstream...</option>
              {inScopeVars.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} ({v.type})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <input
            type="text"
            value={collectionKey}
            onChange={(e) => handleCollectionChange(e.target.value)}
            placeholder="e.g. Items or Numbers"
            data-testid="foreach-collection-input"
            style={{
              padding: '6px 8px',
              fontSize: 12,
              borderRadius: 5,
              border: '1px solid #cbd5e1',
              outline: 'none',
            }}
          />
        )}

        <div style={{ fontSize: 10, color: '#64748b' }}>
          💡 Connect an upstream <strong>Set Variable</strong> (e.g. <code>Items = ["Apple", "Orange"]</code> or <code>1..5</code>) or a tool that returns a list.
        </div>
      </div>

      {/* Output Variables (Injected per iteration) */}
      <div
        style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          📦 Variables Injected Into Loop Body
        </span>

        {/* Item Key */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#1e293b' }}>
            Current Item Variable:
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#0369a1', fontWeight: 700 }}>{'{'}</span>
            <input
              type="text"
              value={itemKey}
              onChange={(e) => handleItemKeyChange(e.target.value)}
              placeholder="item"
              data-testid="foreach-item-input"
              style={{
                flex: 1,
                padding: '5px 8px',
                fontSize: 12,
                fontFamily: 'monospace',
                fontWeight: 600,
                borderRadius: 5,
                border: '1px solid #cbd5e1',
                outline: 'none',
              }}
            />
            <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#0369a1', fontWeight: 700 }}>{'}'}</span>
          </div>
          <span style={{ fontSize: 10, color: '#64748b' }}>
            Use <code>{`{${itemKey || 'item'}}`}</code> in messages or activities inside the loop body.
          </span>
        </div>

        {/* Index Key */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#1e293b' }}>
            Current Index Variable (0-based):
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#0369a1', fontWeight: 700 }}>{'{'}</span>
            <input
              type="text"
              value={indexKey}
              onChange={(e) => handleIndexKeyChange(e.target.value)}
              placeholder="index"
              data-testid="foreach-index-input"
              style={{
                flex: 1,
                padding: '5px 8px',
                fontSize: 12,
                fontFamily: 'monospace',
                fontWeight: 600,
                borderRadius: 5,
                border: '1px solid #cbd5e1',
                outline: 'none',
              }}
            />
            <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#0369a1', fontWeight: 700 }}>{'}'}</span>
          </div>
          <span style={{ fontSize: 10, color: '#64748b' }}>
            Use <code>{`{${indexKey || 'index'}}`}</code> for current item index (0, 1, 2...).
          </span>
        </div>
      </div>

      {/* Ports Guide */}
      <div
        style={{
          borderTop: '1px solid #e2e8f0',
          paddingTop: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Output Branch Connections
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ background: '#0284c7', color: '#fff', borderRadius: 3, padding: '1px 5px', fontSize: 9, fontWeight: 700 }}>
              Loop Body
            </span>
            <span style={{ color: '#475569' }}>Executes for every item in <strong>{collectionKey || 'Items'}</strong>.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ background: '#059669', color: '#fff', borderRadius: 3, padding: '1px 5px', fontSize: 9, fontWeight: 700 }}>
              Done
            </span>
            <span style={{ color: '#475569' }}>Flow continues here once all items have been processed.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
