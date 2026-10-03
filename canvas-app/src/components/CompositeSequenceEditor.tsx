import { useState, useMemo } from 'react';
import {
  parseCompositeSteps,
  getActivityIcon,
  getActivityDefinition,
  type CompositeChildStep,
} from '../registry/activityDefinitions';
import { ActivityPickerPopover } from './ActivityPickerPopover';

export interface CompositeSequenceEditorProps {
  nodeId: string;
  data: Record<string, string>;
  onUpdateData: (nodeId: string, key: string, value: string) => void;
  selectedStepId?: string;
  onSelectStepId?: (stepId: string) => void;
}

export function CompositeSequenceEditor({
  nodeId,
  data,
  onUpdateData,
  selectedStepId,
  onSelectStepId,
}: CompositeSequenceEditorProps) {
  const steps = useMemo(() => parseCompositeSteps(data), [data.steps]);
  const [localSelectedIndex, setLocalSelectedIndex] = useState<number>(0);
  const [showAddMenu, setShowAddMenu] = useState(false);

  // Sync selected index if selectedStepId is provided
  const activeIndex = useMemo(() => {
    if (selectedStepId) {
      const foundIdx = steps.findIndex((s) => s.id === selectedStepId);
      if (foundIdx >= 0) return foundIdx;
    }
    return Math.min(localSelectedIndex, Math.max(0, steps.length - 1));
  }, [selectedStepId, steps, localSelectedIndex]);

  const activeStep: CompositeChildStep | undefined = steps[activeIndex];

  const updateSteps = (newSteps: CompositeChildStep[]) => {
    onUpdateData(nodeId, 'steps', JSON.stringify(newSteps));
    onUpdateData(nodeId, 'childCount', String(newSteps.length));
  };

  const handleSelectStep = (index: number) => {
    setLocalSelectedIndex(index);
    if (steps[index]) {
      onSelectStepId?.(steps[index].id);
    }
  };

  const handleMoveStep = (fromIndex: number, direction: -1 | 1) => {
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= steps.length) return;
    const next = [...steps];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    updateSteps(next);
    handleSelectStep(toIndex);
  };

  const handleDeleteStep = (index: number) => {
    if (steps.length <= 1) {
      alert('A Composite Sequence must have at least one child step.');
      return;
    }
    const next = steps.filter((_, i) => i !== index);
    updateSteps(next);
    handleSelectStep(Math.max(0, index - 1));
  };

  const handleAddStep = (type: string, namePrefix: string, initialData: Record<string, string>) => {
    setShowAddMenu(false);
    const count = steps.filter((s) => s.type === type).length + 1;
    const newStep: CompositeChildStep = {
      id: `step_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type,
      name: `${namePrefix}_${count}`,
      data: initialData,
    };
    const next = [...steps, newStep];
    updateSteps(next);
    handleSelectStep(next.length - 1);
  };

  const handleUpdateActiveStepName = (name: string) => {
    if (!activeStep) return;
    const next = steps.map((s, i) => (i === activeIndex ? { ...s, name } : s));
    updateSteps(next);
  };

  const handleUpdateActiveStepData = (paramKey: string, paramValue: string) => {
    if (!activeStep) return;
    const next = steps.map((s, i) =>
      i === activeIndex
        ? { ...s, data: { ...s.data, [paramKey]: paramValue } }
        : s
    );
    updateSteps(next);
  };

  const handleUpdateActiveStepMultipleData = (updates: Record<string, string>) => {
    if (!activeStep) return;
    const next = steps.map((s, i) =>
      i === activeIndex
        ? { ...s, data: { ...s.data, ...updates } }
        : s
    );
    updateSteps(next);
  };

  const getStepIcon = (type: string) => getActivityIcon(type);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Top Configuration */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            cursor: 'pointer',
            background: '#f9fafb',
            padding: 8,
            borderRadius: 6,
            border: '1px solid #e5e7eb',
          }}
        >
          <input
            type="checkbox"
            checked={data.isolateContext === 'true'}
            onChange={(e) => onUpdateData(nodeId, 'isolateContext', e.target.checked ? 'true' : 'false')}
            style={{ marginTop: 2, cursor: 'pointer' }}
            data-testid="composite-isolate-context-checkbox"
          />
          <div>
            <span style={{ fontWeight: 600, color: '#1f2937' }}>Isolate Context</span>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6b7280', lineHeight: 1.3 }}>
              When checked, child activities execute in an isolated sandbox context so intermediate variables do not pollute the parent workflow.
            </p>
          </div>
        </label>

        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#4b5563', marginBottom: 4 }}>
            Complete Message (Optional)
          </label>
          <input
            type="text"
            value={data.completeMessage ?? ''}
            onChange={(e) => onUpdateData(nodeId, 'completeMessage', e.target.value)}
            placeholder="e.g. Composite sequence completed"
            style={{
              width: '100%',
              padding: '6px 8px',
              fontSize: 12,
              border: '1px solid #d1d5db',
              borderRadius: 6,
              boxSizing: 'border-box',
              outline: 'none',
            }}
            data-testid="composite-complete-message-input"
          />
        </div>
      </div>

      {/* Reference Use Case Callout Banner */}
      <div
        style={{
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: 6,
          padding: '8px 10px',
          fontSize: 11,
        }}
        data-testid="composite-reference-usecase-banner"
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontWeight: 700, color: '#1e40af', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>💡</span> Reference Use Case: Legal & Compliance Disclosures
          </span>
        </div>
        <p style={{ margin: 0, color: '#1e3a8a', lineHeight: 1.35, fontSize: 10.5 }}>
          For instance, to comply with legal requirements, the user must review and accept both federal and state disclosures before proceeding. Rather than 3 separate canvas nodes, this composite activity groups the notice, disclosure consent, and audit log steps into a single atomic sequence.
        </p>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '2px 0' }} />

      {/* Sequential Pipeline Manager */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Sequential Steps ({steps.length})
          </span>
          <span style={{ fontSize: 10, color: '#9ca3af' }}>Runs in top-to-bottom order</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {steps.map((step, idx) => {
            const isCurrent = idx === activeIndex;
            return (
              <div
                key={step.id || idx}
                onClick={() => handleSelectStep(idx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  borderRadius: 6,
                  border: isCurrent ? '1.5px solid #3b82f6' : '1px solid #e5e7eb',
                  background: isCurrent ? '#eff6ff' : '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                data-testid={`composite-step-item-${idx}`}
              >
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: isCurrent ? '#2563eb' : '#e5e7eb',
                    color: isCurrent ? '#ffffff' : '#4b5563',
                    fontSize: 10,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {idx + 1}
                </span>

                <span style={{ fontSize: 13, flexShrink: 0 }}>{getStepIcon(step.type)}</span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {step.name}
                  </div>
                  <div style={{ fontSize: 10, color: '#6b7280' }}>{step.type}</div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  {idx > 0 && (
                    <button
                      type="button"
                      title="Move Up"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveStep(idx, -1);
                      }}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 10, color: '#6b7280', padding: 2 }}
                    >
                      ▲
                    </button>
                  )}
                  {idx < steps.length - 1 && (
                    <button
                      type="button"
                      title="Move Down"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveStep(idx, 1);
                      }}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 10, color: '#6b7280', padding: 2 }}
                    >
                      ▼
                    </button>
                  )}
                  <button
                    type="button"
                    title="Remove Step"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteStep(idx);
                    }}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: '#ef4444', padding: 2, marginLeft: 2 }}
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Add Step Button */}
        <div style={{ position: 'relative', marginTop: 8 }}>
          <button
            type="button"
            onClick={() => setShowAddMenu(!showAddMenu)}
            style={{
              width: '100%',
              padding: '6px 8px',
              fontSize: 11,
              fontWeight: 600,
              color: '#2563eb',
              background: '#f8fafc',
              border: '1px dashed #cbd5e1',
              borderRadius: 6,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
            data-testid="composite-add-step-btn"
          >
            <span>+ Add Step to Pipeline</span>
          </button>

          <ActivityPickerPopover
            isOpen={showAddMenu}
            onClose={() => setShowAddMenu(false)}
            onSelectActivity={handleAddStep}
          />
        </div>
      </div>

      {/* Active Step Details */}
      {activeStep && (
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
          data-testid="composite-active-step-form"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#1e40af' }}>
              Step {activeIndex + 1} Properties
            </span>
            <span style={{ fontSize: 10, color: '#64748b' }}>{activeStep.type}</span>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, color: '#4b5563', marginBottom: 4, fontWeight: 500 }}>
              Step Name / Identifier
            </label>
            <input
              type="text"
              value={activeStep.name}
              onChange={(e) => handleUpdateActiveStepName(e.target.value)}
              style={{
                width: '100%',
                padding: '5px 8px',
                fontSize: 12,
                border: '1px solid #d1d5db',
                borderRadius: 4,
                boxSizing: 'border-box',
              }}
              data-testid="composite-step-name-input"
            />
          </div>

          {activeStep.type === 'SimpleActivity' && (
            <div>
              <label style={{ display: 'block', fontSize: 11, color: '#4b5563', marginBottom: 4, fontWeight: 500 }}>
                Message Text
              </label>
              <textarea
                value={activeStep.data.message ?? ''}
                onChange={(e) => handleUpdateActiveStepData('message', e.target.value)}
                rows={2}
                style={{
                  width: '100%',
                  padding: '5px 8px',
                  fontSize: 12,
                  border: '1px solid #d1d5db',
                  borderRadius: 4,
                  boxSizing: 'border-box',
                }}
                data-testid="composite-step-message-input"
              />
            </div>
          )}

          {activeStep.type === 'DelayActivity' && (
            <div>
              <label style={{ display: 'block', fontSize: 11, color: '#4b5563', marginBottom: 4, fontWeight: 500 }}>
                Duration (ms)
              </label>
              <input
                type="number"
                value={activeStep.data.durationMs ?? '1000'}
                onChange={(e) => handleUpdateActiveStepData('durationMs', e.target.value)}
                style={{
                  width: '100%',
                  padding: '5px 8px',
                  fontSize: 12,
                  border: '1px solid #d1d5db',
                  borderRadius: 4,
                  boxSizing: 'border-box',
                }}
                data-testid="composite-step-duration-input"
              />
            </div>
          )}

          {activeStep.type === 'PromptActivity' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#4b5563', marginBottom: 2, fontWeight: 500 }}>
                  Prompt Question / User Template
                </label>
                <textarea
                  value={activeStep.data.userPromptTemplate ?? activeStep.data.message ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    handleUpdateActiveStepMultipleData({ userPromptTemplate: val, message: val });
                  }}
                  rows={2}
                  placeholder="e.g. Que es esto? or {context.Basics_UserPrompt}"
                  style={{
                    width: '100%',
                    padding: '5px 8px',
                    fontSize: 12,
                    border: '1px solid #d1d5db',
                    borderRadius: 4,
                    boxSizing: 'border-box',
                  }}
                  data-testid="composite-step-prompt-input"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#4b5563', marginBottom: 2, fontWeight: 500 }}>
                  System Prompt (Optional)
                </label>
                <input
                  type="text"
                  value={activeStep.data.systemPrompt ?? ''}
                  onChange={(e) => handleUpdateActiveStepData('systemPrompt', e.target.value)}
                  placeholder="e.g. You are a helpful assistant."
                  style={{
                    width: '100%',
                    padding: '5px 8px',
                    fontSize: 12,
                    border: '1px solid #d1d5db',
                    borderRadius: 4,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#4b5563', marginBottom: 2, fontWeight: 500 }}>
                  Temperature (Optional)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={activeStep.data.temperature ?? '0.7'}
                  onChange={(e) => handleUpdateActiveStepData('temperature', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '5px 8px',
                    fontSize: 12,
                    border: '1px solid #d1d5db',
                    borderRadius: 4,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
          )}


          {activeStep.type === 'SetVariableActivity' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#4b5563', marginBottom: 2, fontWeight: 500 }}>
                  Variable Name
                </label>
                <input
                  type="text"
                  value={activeStep.data.variableName ?? ''}
                  onChange={(e) => handleUpdateActiveStepData('variableName', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '5px 8px',
                    fontSize: 12,
                    border: '1px solid #d1d5db',
                    borderRadius: 4,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#4b5563', marginBottom: 2, fontWeight: 500 }}>
                  Value / Expression
                </label>
                <input
                  type="text"
                  value={activeStep.data.value ?? ''}
                  onChange={(e) => handleUpdateActiveStepData('value', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '5px 8px',
                    fontSize: 12,
                    border: '1px solid #d1d5db',
                    borderRadius: 4,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
          )}

          {!['SimpleActivity', 'DelayActivity', 'PromptActivity', 'SetVariableActivity'].includes(activeStep.type) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(() => {
                const def = getActivityDefinition(activeStep.type);
                if (!def || def.fields.length === 0) {
                  return (
                    <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic', padding: '4px 0' }}>
                      No additional parameters required for this activity.
                    </div>
                  );
                }
                return def.fields.map((field) => (
                  <div key={field.key}>
                    <label style={{ display: 'block', fontSize: 11, color: '#4b5563', marginBottom: 2, fontWeight: 500 }}>
                      {field.label}
                    </label>
                    {field.kind === 'textarea' ? (
                      <textarea
                        value={activeStep.data[field.key] ?? ''}
                        onChange={(e) => handleUpdateActiveStepData(field.key, e.target.value)}
                        rows={2}
                        style={{
                          width: '100%',
                          padding: '5px 8px',
                          fontSize: 12,
                          border: '1px solid #d1d5db',
                          borderRadius: 4,
                          boxSizing: 'border-box',
                        }}
                      />
                    ) : (
                      <input
                        type={field.kind === 'number' ? 'number' : 'text'}
                        value={activeStep.data[field.key] ?? ''}
                        onChange={(e) => handleUpdateActiveStepData(field.key, e.target.value)}
                        style={{
                          width: '100%',
                          padding: '5px 8px',
                          fontSize: 12,
                          border: '1px solid #d1d5db',
                          borderRadius: 4,
                          boxSizing: 'border-box',
                        }}
                      />
                    )}
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
