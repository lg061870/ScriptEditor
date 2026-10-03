import { useState, useMemo, useEffect } from 'react';
import type { DiagramNode, DiagramPortSide } from '../schema/diagram';
import { getActivityDefinition, type ActivityFieldDef } from '../registry/activityDefinitions';
import { getActivityDoc } from '../registry/activityDocs';
import { AdaptiveCardFormEditor } from './AdaptiveCardFormEditor';
import { CompositeSequenceEditor } from './CompositeSequenceEditor';
import { ConditionEditor } from './ConditionEditor';
import { SwitchEditor } from './SwitchEditor';
import { ParallelEditor } from './ParallelEditor';
import { BotMessageEditor } from './BotMessageEditor';
import { SetVariableEditor } from './SetVariableEditor';
import { QuickChoicesEditor } from './QuickChoicesEditor';
import { RepeatLoopEditor } from './RepeatLoopEditor';
import { ForEachEditor } from './ForEachEditor';
import { GlobalVariableEditor } from './GlobalVariableEditor';
import { ErrorBoundary } from './ErrorBoundary';
import { useDiagramStore } from '../store/diagramStore';

export interface InspectorProps {
  node: DiagramNode;
  onUpdateData: (nodeId: string, key: string, value: string) => void;
  onClose: () => void;
  width?: number;
  isActive?: boolean;
}

/** Phase 1.5 side panel: full field editing for the selected node. Seeded
 * types (registry/activityDefinitions.ts) get a real form control per
 * field, matching that type's parameter table. Unseeded types (every
 * other one of the 36 activity-shapes.md shapes, pending Phase 5) fall
 * back to a raw key/value editor over DiagramNode.data -- still editable,
 * just not schema-driven yet. Every edit calls onUpdateData, which
 * App.tsx applies to the JSON document; the canvas node's summary line
 * updates from the same state on the next render. */
export function Inspector({ node, onUpdateData, onClose, width = 280, isActive = false }: InspectorProps) {
  const definition = getActivityDefinition(node.type);
  const doc = getActivityDoc(node.type);
  const document = useDiagramStore((state) => state.document);
  const [activityName, setActivityName] = useState(
    node.customName?.trim() || node.data?.customName?.trim() || (definition?.title ?? node.type)
  );

  useEffect(() => {
    setActivityName(node.customName?.trim() || node.data?.customName?.trim() || (definition?.title ?? node.type));
  }, [node.id, node.customName, node.data?.customName, definition?.title, node.type]);

  const displayTitle = activityName.trim() || definition?.title || node.type;
  const title = displayTitle;

  const nodePorts = useMemo(() => {
    const storeNode = document.nodes.find((n) => n.id === node.id);
    const rawPorts = storeNode?.ports || node.ports || [];
    return rawPorts
      .filter((p) => p.role !== 'control')
      .map((p) => ({
        ...p,
        position: (p.position || (p.direction === 'input' ? 'left' : (p.role === 'exception' ? 'bottom' : 'right'))) as DiagramPortSide,
      }));
  }, [document.nodes, node.id, node.ports]);

  return (
    <aside
      style={{
        width,
        flexShrink: 0,
        borderLeft: '1px solid #e5e7eb',
        boxShadow: isActive ? 'inset 0 0 0 1px #6264a7' : undefined,
        background: '#fff',
        fontSize: 12,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        height: '100%',
        transition: 'box-shadow 0.15s ease',
      }}
      data-testid="inspector-panel"
      data-active={isActive ? 'true' : 'false'}
    >
      {/* Tool Window Header */}
      <div
        style={{
          height: 28,
          background: isActive ? '#f0f1fa' : '#f3f4f6',
          borderBottom: isActive ? '1px solid #c7c9e5' : '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 8px 0 10px',
          fontSize: 11,
          fontWeight: 700,
          color: isActive ? '#2e3058' : '#374151',
          letterSpacing: '0.02em',
          userSelect: 'none',
          flexShrink: 0,
          transition: 'background 0.15s ease, color 0.15s ease',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: isActive ? '#6264a7' : '#9ca3af', flexShrink: 0 }} />
          <span style={{ fontSize: 12 }}>⚙</span> PROPERTIES: {definition?.title ?? node.type}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close inspector"
          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: '#6b7280', padding: '0 4px', lineHeight: 1 }}
        >
          ×
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {/* Activity Name / Label in-place editor */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Activity Name
            </label>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: 10,
                color: '#64748b',
                background: '#f1f5f9',
                padding: '1px 6px',
                borderRadius: 4,
                border: '1px solid #e2e8f0',
              }}
              title={`Framework activity class: ${node.type}`}
              data-testid="inspector-activity-type-badge"
            >
              {node.type}
            </span>
          </div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type="text"
              value={activityName}
              onChange={(e) => {
                setActivityName(e.target.value);
                useDiagramStore.getState().renameNode(node.id, e.target.value, 'Inspector');
              }}
              placeholder={`e.g. Process Steps, ${definition?.title ?? node.type}`}
              style={{
                width: '100%',
                padding: '6px 28px 6px 8px',
                fontSize: 12,
                fontWeight: 600,
                color: '#1f2937',
                border: '1.5px solid #cbd5e1',
                borderRadius: 6,
                background: '#f8fafc',
                boxSizing: 'border-box',
                outline: 'none',
                transition: 'border-color 0.15s ease, background 0.15s ease',
              }}
              onFocus={(e) => {
                e.target.style.background = '#ffffff';
                e.target.style.borderColor = '#3b82f6';
              }}
              onBlur={(e) => {
                e.target.style.background = '#f8fafc';
                e.target.style.borderColor = '#cbd5e1';
                useDiagramStore.getState().renameNode(node.id, activityName, 'Inspector');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  (e.target as HTMLInputElement).blur();
                }
              }}
              data-testid="inspector-activity-name-input"
            />
            <span
              style={{
                position: 'absolute',
                right: 8,
                color: '#94a3b8',
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Click to rename shape"
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M11.5 2.5a1.768 1.768 0 0 1 2.5 2.5L5 14H2v-3L11.5 2.5z" />
                <path d="M9.5 4.5l2 2" />
              </svg>
            </span>
          </div>
        </div>

        {/* Contextual Help & Reference Use Case */}
        <div style={{ marginBottom: 14 }}>
          <details
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              overflow: 'hidden',
            }}
            data-testid="inspector-activity-doc-details"
          >
            <summary
              style={{
                padding: '7px 10px',
                fontSize: 11,
                fontWeight: 600,
                color: '#334155',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                userSelect: 'none',
                background: '#f1f5f9',
              }}
            >
              <span>💡</span>
              <span style={{ flex: 1 }}>How to Use & Reference Case</span>
            </summary>
            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 11 }}>
              <div>
                <span style={{ fontWeight: 600, color: '#1e293b' }}>Summary: </span>
                <span style={{ color: '#475569' }}>{doc.summary}</span>
              </div>

              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 5, padding: 8 }}>
                <div style={{ fontWeight: 700, color: '#1e40af', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>📋</span> Real-World Reference Scenario
                </div>
                <p style={{ margin: 0, color: '#1e3a8a', lineHeight: 1.4 }}>
                  {doc.referenceUseCase}
                </p>
              </div>

              <div>
                <div style={{ fontWeight: 700, color: '#334155', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>📊</span> Graphical Explanation (ScriptEditor)
                </div>
                <pre
                  style={{
                    margin: 0,
                    padding: 8,
                    background: '#1e293b',
                    color: '#e2e8f0',
                    borderRadius: 4,
                    fontSize: 9.5,
                    lineHeight: 1.35,
                    overflowX: 'auto',
                    fontFamily: 'Consolas, Monaco, monospace',
                  }}
                  data-testid="inspector-graphical-explanation"
                >
                  {doc.graphicalExplanation}
                </pre>
              </div>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4, padding: 6 }}>
                <span style={{ fontWeight: 600, color: '#1e293b' }}>Runtime Outcome: </span>
                <span style={{ color: '#475569' }}>{doc.runtimeOutcome}</span>
              </div>

              {doc.bestPractices && doc.bestPractices.length > 0 && (
                <div>
                  <div style={{ fontWeight: 600, color: '#334155', marginBottom: 2 }}>Best Practices:</div>
                  <ul style={{ margin: 0, paddingLeft: 16, color: '#475569' }}>
                    {doc.bestPractices.map((bp, i) => (
                      <li key={i} style={{ marginBottom: 2 }}>{bp}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>
        </div>


        <ErrorBoundary key={node.id} fallbackTitle="Inspector Editor Error">
          {node.type === 'AdaptiveCardActivity' ? (
            <>
              <AdaptiveCardFormEditor
                key={node.id}
                nodeId={node.id}
                nodeTitle={title}
                initialFieldsJson={node.data.cardFields}
                onChange={(fieldsJson) => {
                  onUpdateData(node.id, 'cardFields', fieldsJson);
                }}
              />
              {definition && definition.fields.length > 0 && (
                <details style={{ marginTop: 14, borderTop: '1px solid #e5e7eb', paddingTop: 8 }}>
                  <summary style={{ fontSize: 11, fontWeight: 600, color: '#64748b', cursor: 'pointer', outline: 'none', userSelect: 'none' }}>
                    ⚙️ Activity Properties
                  </summary>
                  <div style={{ marginTop: 8 }}>
                    {definition.fields.map((field) => (
                      <FieldControl
                        key={field.key}
                        field={field}
                        value={node.data[field.key] ?? ''}
                        onChange={(value) => onUpdateData(node.id, field.key, value)}
                      />
                    ))}
                  </div>
                </details>
              )}
            </>
          ) : node.type === 'CompositeActivity' ? (
            <CompositeSequenceEditor
              key={node.id}
              nodeId={node.id}
              data={node.data}
              onUpdateData={onUpdateData}
            />
          ) : node.type === 'ConditionalActivity' ? (
            <>
              <ConditionEditor
                key={node.id}
                nodeId={node.id}
                nodeTitle={title}
                data={node.data}
                document={document}
                onChange={(updates) => {
                  Object.entries(updates).forEach(([k, v]) => {
                    onUpdateData(node.id, k, v);
                  });
                }}
              />
              {definition && definition.fields.length > 0 && (
                <details style={{ marginTop: 14, borderTop: '1px solid #e5e7eb', paddingTop: 8 }}>
                  <summary style={{ fontSize: 11, fontWeight: 600, color: '#64748b', cursor: 'pointer', outline: 'none', userSelect: 'none' }}>
                    ⚙️ Advanced Branching Properties
                  </summary>
                  <div style={{ marginTop: 8 }}>
                    {definition.fields.map((field) => (
                      <FieldControl
                        key={field.key}
                        field={field}
                        value={node.data[field.key] ?? ''}
                        onChange={(value) => onUpdateData(node.id, field.key, value)}
                      />
                    ))}
                  </div>
                </details>
              )}
            </>
          ) : node.type === 'SwitchActivity' ? (
            <>
              <SwitchEditor
                key={node.id}
                nodeId={node.id}
                nodeTitle={title}
                data={node.data}
                document={document}
                onChange={(updates) => {
                  Object.entries(updates).forEach(([k, v]) => {
                    onUpdateData(node.id, k, v);
                  });
                }}
              />
              {definition && definition.fields.length > 0 && (
                <details style={{ marginTop: 14, borderTop: '1px solid #e5e7eb', paddingTop: 8 }}>
                  <summary style={{ fontSize: 11, fontWeight: 600, color: '#64748b', cursor: 'pointer', outline: 'none', userSelect: 'none' }}>
                    ⚙️ Advanced Properties
                  </summary>
                  <div style={{ marginTop: 8 }}>
                    {definition.fields.map((field) => (
                      <FieldControl
                        key={field.key}
                        field={field}
                        value={node.data[field.key] ?? ''}
                        onChange={(value) => onUpdateData(node.id, field.key, value)}
                      />
                    ))}
                  </div>
                </details>
              )}
            </>
          ) : node.type === 'ParallelActivity' ? (
            <>
              <ParallelEditor
                key={node.id}
                nodeId={node.id}
                nodeTitle={title}
                data={node.data}
                onChange={(updates) => {
                  Object.entries(updates).forEach(([k, v]) => {
                    onUpdateData(node.id, k, v);
                  });
                }}
              />
              {definition && definition.fields.length > 0 && (
                <details style={{ marginTop: 14, borderTop: '1px solid #e5e7eb', paddingTop: 8 }}>
                  <summary style={{ fontSize: 11, fontWeight: 600, color: '#64748b', cursor: 'pointer', outline: 'none', userSelect: 'none' }}>
                    ⚙️ Advanced Properties
                  </summary>
                  <div style={{ marginTop: 8 }}>
                    {definition.fields.map((field) => (
                      <FieldControl
                        key={field.key}
                        field={field}
                        value={node.data[field.key] ?? ''}
                        onChange={(value) => onUpdateData(node.id, field.key, value)}
                      />
                    ))}
                  </div>
                </details>
              )}
            </>
          ) : node.type === 'SimpleActivity' ? (
            <>
              <BotMessageEditor
                key={node.id}
                nodeId={node.id}
                nodeTitle={title}
                data={node.data}
                document={document}
                onChange={(updates) => {
                  Object.entries(updates).forEach(([k, v]) => {
                    onUpdateData(node.id, k, v);
                  });
                }}
              />
              {definition && definition.fields.length > 0 && (
                <details style={{ marginTop: 14, borderTop: '1px solid #e5e7eb', paddingTop: 8 }}>
                  <summary style={{ fontSize: 11, fontWeight: 600, color: '#64748b', cursor: 'pointer', outline: 'none', userSelect: 'none' }}>
                    ⚙️ Activity Properties
                  </summary>
                  <div style={{ marginTop: 8 }}>
                    {definition.fields.map((field) => (
                      <FieldControl
                        key={field.key}
                        field={field}
                        value={node.data[field.key] ?? ''}
                        onChange={(value) => onUpdateData(node.id, field.key, value)}
                      />
                    ))}
                  </div>
                </details>
              )}
            </>
          ) : node.type === 'QuickAnswerActivity' ? (
            <>
              <QuickChoicesEditor
                key={node.id}
                nodeId={node.id}
                data={node.data}
                onUpdateData={onUpdateData}
              />
              {definition && definition.fields.length > 0 && (
                <details style={{ marginTop: 14, borderTop: '1px solid #e5e7eb', paddingTop: 8 }}>
                  <summary style={{ fontSize: 11, fontWeight: 600, color: '#64748b', cursor: 'pointer', outline: 'none', userSelect: 'none' }}>
                    ⚙️ Activity Properties
                  </summary>
                  <div style={{ marginTop: 8 }}>
                    {definition.fields.map((field) => (
                      <FieldControl
                        key={field.key}
                        field={field}
                        value={node.data[field.key] ?? ''}
                        onChange={(value) => onUpdateData(node.id, field.key, value)}
                      />
                    ))}
                  </div>
                </details>
              )}
            </>
          ) : (node.type === 'RepeatActivity' || node.type === 'RepeatLoopActivity') ? (
            <RepeatLoopEditor
              key={node.id}
              nodeId={node.id}
              nodeTitle={title}
              data={node.data}
              document={document}
              onChange={(updates) => {
                Object.entries(updates).forEach(([k, v]) => {
                  onUpdateData(node.id, k, v);
                });
              }}
            />
          ) : node.type === 'ForEachActivity' ? (
            <ForEachEditor
              key={node.id}
              nodeId={node.id}
              nodeTitle={title}
              data={node.data}
              document={document}
              onChange={(updates) => {
                Object.entries(updates).forEach(([k, v]) => {
                  onUpdateData(node.id, k, v);
                });
              }}
            />
          ) : node.type === 'SetVariableActivity' ? (
            <>
              <SetVariableEditor
                key={node.id}
                nodeId={node.id}
                nodeTitle={title}
                data={node.data}
                document={document}
                onChange={(updates) => {
                  Object.entries(updates).forEach(([k, v]) => {
                    onUpdateData(node.id, k, v);
                  });
                }}
              />
              {definition && definition.fields.filter(f => !['variableName', 'value', 'isGlobal', 'validateNaming'].includes(f.key)).length > 0 && (
                <details style={{ marginTop: 14, borderTop: '1px solid #e5e7eb', paddingTop: 8 }}>
                  <summary style={{ fontSize: 11, fontWeight: 600, color: '#64748b', cursor: 'pointer', outline: 'none', userSelect: 'none' }}>
                    ⚙️ Advanced Properties
                  </summary>
                  <div style={{ marginTop: 8 }}>
                    {definition.fields
                      .filter(f => !['variableName', 'value', 'isGlobal', 'validateNaming'].includes(f.key))
                      .map((field) => (
                        <FieldControl
                          key={field.key}
                          field={field}
                          value={node.data[field.key] ?? ''}
                          onChange={(value) => onUpdateData(node.id, field.key, value)}
                        />
                      ))}
                  </div>
                </details>
              )}
            </>
          ) : node.type === 'GlobalVariableActivity' ? (
            <GlobalVariableEditor
              key={node.id}
              nodeId={node.id}
              nodeTitle={title}
              data={node.data}
              document={document}
              onChange={(updates) => {
                Object.entries(updates).forEach(([k, v]) => {
                  onUpdateData(node.id, k, v);
                });
              }}
            />
          ) : node.type === 'DumpCtxActivity' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                  <span>🗂️ Context Diagnostics</span>
                </div>
                Dumps all active topic variables into the conversation transcript as formatted JSON when in development mode. In production mode, this activity silently continues.
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', backgroundColor: '#ffffff' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>Development Mode</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Only dumps context when enabled</div>
                </div>
                <input
                  type="checkbox"
                  checked={node.data.developmentMode !== 'false'}
                  onChange={(e) => onUpdateData(node.id, 'developmentMode', e.target.checked ? 'true' : 'false')}
                  style={{ width: 16, height: 16, accentColor: '#0d9488', cursor: 'pointer' }}
                />
              </div>
            </div>
          ) : node.type === 'ResetActivity' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                  <span>🔄 Reset Conversation</span>
                </div>
                Clears all conversation messages, topic chain, and activity completion flags, returning the bot to an initial state and sending the reset message below.
              </div>

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
                  Reset Message
                </label>
                <textarea
                  rows={3}
                  value={node.data.resetMessage ?? 'Session reset completed'}
                  placeholder="e.g. Session reset completed"
                  onChange={(e) => onUpdateData(node.id, 'resetMessage', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: 12,
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            </div>
          ) : definition ? (
            definition.fields.map((field) => (
              <FieldControl
                key={field.key}
                field={field}
                value={node.data[field.key] ?? ''}
                onChange={(value) => onUpdateData(node.id, field.key, value)}
              />
            ))
          ) : (
            <RawDataEditor data={node.data} onChange={(key, value) => onUpdateData(node.id, key, value)} />
          )}
        </ErrorBoundary>

        {/* Ports & Flow Direction Section */}
        {nodePorts.length > 0 && (
          <div style={{ marginTop: 18, borderTop: '1px solid #e2e8f0', paddingTop: 14 }} data-testid="inspector-ports-section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Ports & Flow Direction
              </label>
              <span style={{ fontSize: 9.5, color: '#94a3b8' }}>Attach to shape edge</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {nodePorts.map((port) => {
                const currentSide = port.position;
                const isInput = port.direction === 'input';
                const isExc = port.role === 'exception';

                const badgeBg = isInput ? '#eff6ff' : isExc ? '#fef2f2' : '#f0fdf4';
                const badgeColor = isInput ? '#2563eb' : isExc ? '#dc2626' : '#16a34a';
                const badgeBorder = isInput ? '#bfdbfe' : isExc ? '#fecaca' : '#bbf7d0';

                const SIDES: { side: DiagramPortSide; label: string; icon: string }[] = [
                  { side: 'left', label: 'Left', icon: '←' },
                  { side: 'top', label: 'Top', icon: '↑' },
                  { side: 'right', label: 'Right', icon: '→' },
                  { side: 'bottom', label: 'Bottom', icon: '↓' },
                ];

                return (
                  <div
                    key={port.id}
                    data-testid={`port-direction-row-${port.id}`}
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: 6,
                      padding: '8px 10px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: 3,
                            background: badgeBg,
                            color: badgeColor,
                            border: `1px solid ${badgeBorder}`,
                            textTransform: 'uppercase',
                          }}
                        >
                          {isInput ? 'In' : isExc ? 'Exc' : 'Out'}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#1e293b' }}>
                          {port.name}
                        </span>
                      </div>
                      <span style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace' }}>
                        {currentSide}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3 }}>
                      {SIDES.map(({ side, label, icon }) => {
                        const isSelected = currentSide === side;
                        return (
                          <button
                            key={side}
                            type="button"
                            data-testid={`port-side-btn-${port.id}-${side}`}
                            onClick={() => useDiagramStore.getState().updatePortSide(node.id, port.id, side, 'Inspector')}
                            title={`Position ${port.name} on ${label}`}
                            style={{
                              padding: '5px 2px',
                              fontSize: 10,
                              fontWeight: isSelected ? 700 : 500,
                              color: isSelected ? '#ffffff' : '#475569',
                              background: isSelected ? '#2563eb' : '#ffffff',
                              border: isSelected ? '1px solid #1d4ed8' : '1px solid #cbd5e1',
                              borderRadius: 4,
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 1,
                              lineHeight: 1.1,
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <span style={{ fontSize: 11 }}>{icon}</span>
                            <span>{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '8px 12px', borderTop: '1px solid #e5e7eb', background: '#f9fafb', flexShrink: 0 }}>
        <button
          type="button"
          data-testid="inspector-delete-node-btn"
          onClick={() => useDiagramStore.getState().removeNodes([node.id], 'Inspector')}
          style={{
            width: '100%',
            padding: '6px 10px',
            fontSize: 11.5,
            fontWeight: 600,
            color: '#dc2626',
            background: '#ffffff',
            border: '1px solid #fca5a5',
            borderRadius: 4,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#fee2e2';
            e.currentTarget.style.borderColor = '#dc2626';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#ffffff';
            e.currentTarget.style.borderColor = '#fca5a5';
          }}
        >
          <span>🗑️</span>
          <span>Delete Activity</span>
        </button>
      </div>
    </aside>
  );
}

function TopicFieldControl({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const topics = useDiagramStore((s) => s.topics);
  const activeTopicId = useDiagramStore((s) => s.activeTopicId);
  const addTopic = useDiagramStore((s) => s.addTopic);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState(value);

  useEffect(() => {
    setCustomValue(value);
  }, [value]);

  // Build the list of available topic options
  const topicOptions = useMemo(() => {
    const list = topics.map((t) => ({
      id: t.id,
      name: t.name,
      isCurrent: t.id === activeTopicId,
    }));
    // If current value is non-empty and not in the store's topics, keep it visible as an option
    if (value && !list.some((t) => t.id === value)) {
      list.push({
        id: value,
        name: value,
        isCurrent: value === activeTopicId,
      });
    }
    return list;
  }, [topics, activeTopicId, value]);

  const isCurrentTopicSelected = Boolean(value && value === activeTopicId);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === '__custom__') {
      setIsCustomMode(true);
      setCustomValue(value);
    } else {
      onChange(val);
    }
  };

  const handleQuickAddTopic = () => {
    const defaultName = `Topic_${topics.length + 1}`;
    const newId = addTopic(defaultName);
    onChange(newId);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {isCustomMode ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="text"
            data-testid="topic-to-trigger-custom-input"
            value={customValue}
            onChange={(e) => {
              setCustomValue(e.target.value);
              onChange(e.target.value);
            }}
            placeholder="Enter custom topic name..."
            style={{
              flex: 1,
              boxSizing: 'border-box',
              fontSize: 12,
              padding: '6px 8px',
              border: '1px solid #d1d5db',
              borderRadius: 4,
            }}
          />
          <button
            type="button"
            data-testid="switch-to-dropdown-btn"
            onClick={() => setIsCustomMode(false)}
            title="Pick from existing topics"
            style={{
              fontSize: 11,
              padding: '5px 8px',
              background: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: 4,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              color: '#374151',
              fontWeight: 500,
            }}
          >
            ▾ List
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select
            data-testid="topic-to-trigger-select"
            value={value}
            onChange={handleSelectChange}
            style={{
              flex: 1,
              boxSizing: 'border-box',
              fontSize: 12,
              padding: '6px 8px',
              border: isCurrentTopicSelected ? '1px solid #f59e0b' : '1px solid #d1d5db',
              borderRadius: 4,
              background: '#ffffff',
              color: '#1f2937',
              cursor: 'pointer',
            }}
          >
            {!value && (
              <option value="" disabled>
                -- Select a Topic --
              </option>
            )}
            {topicOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.name && opt.name !== opt.id ? `${opt.name} (${opt.id})` : opt.id}
                {opt.isCurrent ? ' • [Current Topic]' : ''}
              </option>
            ))}
            <option value="__custom__">✏️ Enter Custom Topic Name...</option>
          </select>
          <button
            type="button"
            data-testid="add-topic-from-inspector-btn"
            onClick={handleQuickAddTopic}
            title="Create a new topic in workspace and select it"
            style={{
              fontSize: 11,
              padding: '5px 8px',
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: 4,
              color: '#4f46e5',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            + New
          </button>
        </div>
      )}

      {/* Warning when calling current topic (Potential Infinite Loop Notice) */}
      {isCurrentTopicSelected && (
        <div
          data-testid="recursive-topic-warning"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 6,
            padding: '6px 8px',
            background: '#fffbeb',
            border: '1px solid #fef3c7',
            borderRadius: 4,
            fontSize: 11,
            color: '#b45309',
            lineHeight: 1.35,
          }}
        >
          <span style={{ fontSize: 13, flexShrink: 0 }}>⚠️</span>
          <div>
            <strong>Self-referential topic:</strong> Calling the current topic may create an infinite loop. Ensure your flow includes a conditional termination branch.
          </div>
        </div>
      )}
    </div>
  );
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: ActivityFieldDef;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.kind === 'topic' || field.key === 'topicToTrigger') {
    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 600, marginBottom: 3, color: '#374151' }}>{field.label}</div>
        <TopicFieldControl value={value} onChange={onChange} />
      </div>
    );
  }

  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <div style={{ fontWeight: 600, marginBottom: 3, color: '#374151' }}>{field.label}</div>
      {field.kind === 'textarea' && (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, padding: 6, border: '1px solid #d1d5db', borderRadius: 4 }}
        />
      )}
      {field.kind === 'text' && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, padding: 6, border: '1px solid #d1d5db', borderRadius: 4 }}
        />
      )}
      {field.kind === 'number' && (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, padding: 6, border: '1px solid #d1d5db', borderRadius: 4 }}
        />
      )}
      {field.kind === 'boolean' && (
        <input
          type="checkbox"
          checked={value === 'true'}
          onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
        />
      )}
      {field.kind === 'select' && (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            fontSize: 12,
            padding: 6,
            border: '1px solid #d1d5db',
            borderRadius: 4,
            background: '#ffffff',
            color: '#1f2937',
            cursor: 'pointer',
          }}
        >
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
    </label>
  );
}

function RawDataEditor({
  data,
  onChange,
}: {
  data: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const entries = Object.entries(data);
  return (
    <div>
      <div style={{ color: '#9ca3af', marginBottom: 8 }}>
        No form defined yet for this activity type (Phase 5) -- editing raw parameters:
      </div>
      {entries.length === 0 && <div style={{ color: '#9ca3af' }}>(no parameters)</div>}
      {entries.map(([key, value]) => (
        <label key={key} style={{ display: 'block', marginBottom: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 3, color: '#374151' }}>{key}</div>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(key, e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, padding: 6, border: '1px solid #d1d5db', borderRadius: 4 }}
          />
        </label>
      ))}
    </div>
  );
}
