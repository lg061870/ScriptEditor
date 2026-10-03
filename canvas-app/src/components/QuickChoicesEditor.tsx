import React, { useState } from 'react';

interface QuickChoicesEditorProps {
  nodeId: string;
  data: Record<string, string>;
  onUpdateData: (nodeId: string, key: string, value: string) => void;
}

export const QuickChoicesEditor: React.FC<QuickChoicesEditorProps> = ({
  nodeId,
  data,
  onUpdateData,
}) => {
  const question = data.question ?? 'Please choose an option:';
  const mode = data.optionsMode === 'variable' || (data.answersVariable && data.optionsMode !== 'static')
    ? 'variable'
    : 'static';
  const rawAnswers = data.answers ?? '';
  const answersVariable = data.answersVariable ?? '';
  const outputVariable = data.outputVariable ?? '';
  const isRequired = data.required !== 'false';

  const [newChoiceText, setNewChoiceText] = useState('');
  const [showRawText, setShowRawText] = useState(false);

  // Parse existing answers into chips
  const choiceChips = rawAnswers
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);

  const updateAnswers = (chips: string[]) => {
    onUpdateData(nodeId, 'answers', chips.join(' | '));
  };

  const handleAddChoice = () => {
    const text = newChoiceText.trim();
    if (!text) return;
    const next = [...choiceChips, text];
    updateAnswers(next);
    setNewChoiceText('');
  };

  const handleRemoveChoice = (index: number) => {
    const next = choiceChips.filter((_, i) => i !== index);
    updateAnswers(next);
  };

  const handleApplyPreset = (presetChips: string[]) => {
    updateAnswers(presetChips);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
      }}
      data-testid="quick-choices-editor"
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 16 }}>⚡</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
            Quick Choices Configuration
          </span>
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            background: '#fef3c7',
            color: '#b45309',
            padding: '2px 6px',
            borderRadius: 4,
          }}
        >
          Adaptive Card Based
        </span>
      </div>

      {/* 1. Prompt / Question */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: 11,
            fontWeight: 700,
            color: '#334155',
            marginBottom: 4,
          }}
        >
          Question / Prompt
        </label>
        <textarea
          value={question}
          onChange={(e) => onUpdateData(nodeId, 'question', e.target.value)}
          placeholder="e.g. Which coverage option would you like?"
          rows={2}
          style={{
            width: '100%',
            fontSize: 12,
            lineHeight: 1.4,
            padding: 8,
            border: '1.5px solid #cbd5e1',
            borderRadius: 6,
            background: '#f8fafc',
            boxSizing: 'border-box',
            resize: 'vertical',
            outline: 'none',
          }}
          data-testid="qc-question-input"
        />
        <div style={{ fontSize: 10, color: '#64748b', marginTop: 3 }}>
          Displayed as the prompt text in the chatbot with clickable buttons underneath.
        </div>
      </div>

      {/* 2. Options Source Mode */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: 11,
            fontWeight: 700,
            color: '#334155',
            marginBottom: 6,
          }}
        >
          Options Source
        </label>
        <div
          style={{
            display: 'flex',
            background: '#f1f5f9',
            borderRadius: 6,
            padding: 2,
            gap: 2,
          }}
        >
          <button
            type="button"
            onClick={() => {
              onUpdateData(nodeId, 'optionsMode', 'static');
            }}
            style={{
              flex: 1,
              padding: '6px 10px',
              fontSize: 11,
              fontWeight: mode === 'static' ? 700 : 500,
              background: mode === 'static' ? '#ffffff' : 'transparent',
              color: mode === 'static' ? '#0f172a' : '#64748b',
              border: 'none',
              borderRadius: 5,
              cursor: 'pointer',
              boxShadow: mode === 'static' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s ease',
            }}
            data-testid="qc-mode-static-btn"
          >
            🏷️ Static Choices
          </button>
          <button
            type="button"
            onClick={() => {
              onUpdateData(nodeId, 'optionsMode', 'variable');
            }}
            style={{
              flex: 1,
              padding: '6px 10px',
              fontSize: 11,
              fontWeight: mode === 'variable' ? 700 : 500,
              background: mode === 'variable' ? '#ffffff' : 'transparent',
              color: mode === 'variable' ? '#0f172a' : '#64748b',
              border: 'none',
              borderRadius: 5,
              cursor: 'pointer',
              boxShadow: mode === 'variable' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s ease',
            }}
            data-testid="qc-mode-variable-btn"
          >
            📦 From Context Variable
          </button>
        </div>
      </div>

      {/* 3A. Static Choices View */}
      {mode === 'static' ? (
        <div
          style={{
            background: '#fafafa',
            border: '1px solid #e5e7eb',
            borderRadius: 6,
            padding: 10,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>
              Buttons / Choice Chips ({choiceChips.length})
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                onClick={() => handleApplyPreset(['Yes', 'No'])}
                style={{
                  fontSize: 10,
                  padding: '2px 6px',
                  background: '#ffffff',
                  border: '1px solid #d1d5db',
                  borderRadius: 4,
                  cursor: 'pointer',
                  color: '#4b5563',
                }}
                title="Use Yes/No preset"
              >
                Yes / No
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset(['Accept', 'Decline'])}
                style={{
                  fontSize: 10,
                  padding: '2px 6px',
                  background: '#ffffff',
                  border: '1px solid #d1d5db',
                  borderRadius: 4,
                  cursor: 'pointer',
                  color: '#4b5563',
                }}
                title="Use Accept/Decline preset"
              >
                Accept / Decline
              </button>
            </div>
          </div>

          {/* Chips container */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              marginBottom: 8,
              minHeight: 28,
            }}
            data-testid="qc-chips-container"
          >
            {choiceChips.length === 0 ? (
              <span style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>
                No choices added yet. Type an option below and press Add.
              </span>
            ) : (
              choiceChips.map((chip, idx) => (
                <span
                  key={`${chip}-${idx}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    background: '#fef3c7',
                    border: '1px solid #fde68a',
                    color: '#92400e',
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '3px 8px',
                    borderRadius: 14,
                  }}
                  data-testid={`qc-chip-${idx}`}
                >
                  {chip}
                  <button
                    type="button"
                    onClick={() => handleRemoveChoice(idx)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#b45309',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 700,
                      padding: 0,
                      marginLeft: 2,
                      lineHeight: 1,
                    }}
                    title="Remove choice"
                    data-testid={`qc-chip-remove-${idx}`}
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>

          {/* Add input */}
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={newChoiceText}
              onChange={(e) => setNewChoiceText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddChoice();
                }
              }}
              placeholder="Add choice option..."
              style={{
                flex: 1,
                fontSize: 12,
                padding: '5px 8px',
                border: '1px solid #cbd5e1',
                borderRadius: 4,
                background: '#ffffff',
                outline: 'none',
              }}
              data-testid="qc-new-chip-input"
            />
            <button
              type="button"
              onClick={handleAddChoice}
              style={{
                padding: '5px 10px',
                fontSize: 11,
                fontWeight: 600,
                background: '#f59e0b',
                color: '#ffffff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
              data-testid="qc-add-chip-btn"
            >
              + Add
            </button>
          </div>

          {/* Raw Text Toggle */}
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              onClick={() => setShowRawText(!showRawText)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: 10,
                color: '#6b7280',
                textDecoration: 'underline',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {showRawText ? 'Hide pipe-separated text' : 'Edit raw pipe-separated text'}
            </button>
            {showRawText && (
              <input
                type="text"
                value={rawAnswers}
                onChange={(e) => onUpdateData(nodeId, 'answers', e.target.value)}
                placeholder="Option 1 | Option 2 | Option 3"
                style={{
                  width: '100%',
                  marginTop: 4,
                  fontSize: 11,
                  padding: '4px 6px',
                  border: '1px solid #d1d5db',
                  borderRadius: 4,
                  background: '#ffffff',
                  boxSizing: 'border-box',
                }}
                data-testid="qc-raw-answers-input"
              />
            )}
          </div>
        </div>
      ) : (
        /* 3B. Variable-Driven Choices View */
        <div
          style={{
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: 6,
            padding: 10,
          }}
        >
          <label
            style={{
              display: 'block',
              fontSize: 11,
              fontWeight: 700,
              color: '#1e40af',
              marginBottom: 4,
            }}
          >
            Options Variable Name
          </label>
          <input
            type="text"
            value={answersVariable}
            onChange={(e) => onUpdateData(nodeId, 'answersVariable', e.target.value)}
            placeholder="e.g. userVehicles, availablePlans, queryResults"
            style={{
              width: '100%',
              fontSize: 12,
              padding: '6px 8px',
              border: '1.5px solid #93c5fd',
              borderRadius: 4,
              background: '#ffffff',
              boxSizing: 'border-box',
              outline: 'none',
            }}
            data-testid="qc-answers-variable-input"
          />
          <div style={{ fontSize: 10, color: '#3b82f6', marginTop: 4, lineHeight: 1.4 }}>
            💡 Populated dynamically at runtime from{' '}
            <code style={{ background: '#dbeafe', padding: '1px 4px', borderRadius: 3 }}>
              context.GetValue(&quot;{answersVariable || 'variableName'}&quot;)
            </code>
            . Can be a <code style={{ background: '#dbeafe', padding: '1px 4px', borderRadius: 3 }}>List&lt;string&gt;</code> or pipe-delimited string.
          </div>
        </div>
      )}

      {/* 4. Output / Save Selection To Variable */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: 11,
            fontWeight: 700,
            color: '#334155',
            marginBottom: 4,
          }}
        >
          Save Selection to Variable (Optional)
        </label>
        <input
          type="text"
          value={outputVariable}
          onChange={(e) => onUpdateData(nodeId, 'outputVariable', e.target.value)}
          placeholder="e.g. selectedChoice, chosenPlan, userVehicle"
          style={{
            width: '100%',
            fontSize: 12,
            padding: '6px 8px',
            border: '1.5px solid #cbd5e1',
            borderRadius: 6,
            background: '#f8fafc',
            boxSizing: 'border-box',
            outline: 'none',
          }}
          data-testid="qc-output-variable-input"
        />
        <div style={{ fontSize: 10, color: '#64748b', marginTop: 3 }}>
          When the user taps a button, their choice is saved into this context variable for downstream nodes.
        </div>
      </div>

      {/* 5. Required Flag */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4, borderTop: '1px solid #f1f5f9' }}>
        <input
          type="checkbox"
          id={`qc-req-${nodeId}`}
          checked={isRequired}
          onChange={(e) => onUpdateData(nodeId, 'required', e.target.checked ? 'true' : 'false')}
          style={{ cursor: 'pointer' }}
          data-testid="qc-required-checkbox"
        />
        <label
          htmlFor={`qc-req-${nodeId}`}
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#334155',
            cursor: 'pointer',
          }}
        >
          Required (user must tap an option before proceeding)
        </label>
      </div>
    </div>
  );
};
