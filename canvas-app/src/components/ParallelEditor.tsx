import { useState, useEffect, useRef } from 'react';
import { parseParallelBranchLabels } from '../registry/activityDefinitions';

export interface ParallelEditorProps {
  nodeId: string;
  nodeTitle?: string;
  data: Record<string, string>;
  onChange: (updates: Record<string, string>) => void;
}

export function ParallelEditor({
  nodeId: _nodeId,
  nodeTitle: _nodeTitle,
  data,
  onChange,
}: ParallelEditorProps) {
  const [branches, setBranches] = useState<string[]>(() =>
    parseParallelBranchLabels(data.branches, data.branchCount)
  );
  const [continueOnError, setContinueOnError] = useState<boolean>(
    data.continueOnError === 'true'
  );
  const [completeMessage, setCompleteMessage] = useState<string>(
    data.completeMessage || ''
  );
  const [includeJoinPort, setIncludeJoinPort] = useState<boolean>(
    data.includeJoinPort === 'true'
  );

  // External sync
  const prevBranchesRef = useRef(data.branches);
  const prevCountRef = useRef(data.branchCount);
  useEffect(() => {
    if (
      (data.branches !== undefined && data.branches !== prevBranchesRef.current) ||
      (data.branchCount !== undefined && data.branchCount !== prevCountRef.current)
    ) {
      prevBranchesRef.current = data.branches;
      prevCountRef.current = data.branchCount;
      setBranches(parseParallelBranchLabels(data.branches, data.branchCount));
    }
  }, [data.branches, data.branchCount]);

  const prevErrorRef = useRef(data.continueOnError);
  useEffect(() => {
    if (data.continueOnError !== undefined && data.continueOnError !== prevErrorRef.current) {
      prevErrorRef.current = data.continueOnError;
      setContinueOnError(data.continueOnError === 'true');
    }
  }, [data.continueOnError]);

  const prevMsgRef = useRef(data.completeMessage);
  useEffect(() => {
    if (data.completeMessage !== undefined && data.completeMessage !== prevMsgRef.current) {
      prevMsgRef.current = data.completeMessage;
      setCompleteMessage(data.completeMessage);
    }
  }, [data.completeMessage]);

  const prevJoinRef = useRef(data.includeJoinPort);
  useEffect(() => {
    if (data.includeJoinPort !== undefined && data.includeJoinPort !== prevJoinRef.current) {
      prevJoinRef.current = data.includeJoinPort;
      setIncludeJoinPort(data.includeJoinPort === 'true');
    }
  }, [data.includeJoinPort]);

  const handleBranchChange = (index: number, val: string) => {
    const updated = [...branches];
    updated[index] = val;
    setBranches(updated);
    onChange({
      branches: updated.join(' | '),
      branchCount: String(updated.length),
    });
  };

  const handleAddBranch = () => {
    const nextName = `Branch ${branches.length + 1}`;
    const updated = [...branches, nextName];
    setBranches(updated);
    onChange({
      branches: updated.join(' | '),
      branchCount: String(updated.length),
    });
  };

  const handleDeleteBranch = (index: number) => {
    if (branches.length <= 1) return; // Keep at least 1 branch
    const updated = branches.filter((_, i) => i !== index);
    setBranches(updated);
    onChange({
      branches: updated.join(' | '),
      branchCount: String(updated.length),
    });
  };

  const handlePreset = (count: number) => {
    const updated = Array.from({ length: count }, (_, i) => `Branch ${i + 1}`);
    setBranches(updated);
    onChange({
      branches: updated.join(' | '),
      branchCount: String(updated.length),
    });
  };

  const handleContinueOnErrorChange = (checked: boolean) => {
    setContinueOnError(checked);
    onChange({ continueOnError: checked ? 'true' : 'false' });
  };

  const handleCompleteMessageChange = (val: string) => {
    setCompleteMessage(val);
    onChange({ completeMessage: val });
  };

  const handleJoinPortChange = (checked: boolean) => {
    setIncludeJoinPort(checked);
    onChange({ includeJoinPort: checked ? 'true' : 'false' });
  };

  return (
    <div data-testid="parallel-editor" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
          Concurrent Execution
        </span>
        <span
          data-testid="parallel-branch-count-badge"
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: '#0891b2',
            background: '#ecfeff',
            border: '1px solid #cffafe',
            padding: '1px 6px',
            borderRadius: 4,
          }}
        >
          {branches.length} branches
        </span>
      </div>

      <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.35 }}>
        All branches execute concurrently in parallel with no inter-branch communication.
      </div>

      {/* Branches List */}
      <div
        data-testid="parallel-branches-container"
        style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Branch Output Ports
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              onClick={() => handlePreset(2)}
              title="Set 2 branches"
              style={{
                fontSize: 9.5,
                fontWeight: 600,
                color: '#475569',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: 3,
                padding: '1px 4px',
                cursor: 'pointer',
              }}
            >
              2
            </button>
            <button
              type="button"
              onClick={() => handlePreset(3)}
              title="Set 3 branches"
              style={{
                fontSize: 9.5,
                fontWeight: 600,
                color: '#475569',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: 3,
                padding: '1px 4px',
                cursor: 'pointer',
              }}
            >
              3
            </button>
            <button
              type="button"
              onClick={() => handlePreset(4)}
              title="Set 4 branches"
              style={{
                fontSize: 9.5,
                fontWeight: 600,
                color: '#475569',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: 3,
                padding: '1px 4px',
                cursor: 'pointer',
              }}
            >
              4
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {branches.map((b, index) => (
            <div
              key={index}
              data-testid={`parallel-branch-item-${index}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                padding: '4px 6px',
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#0891b2',
                  background: '#ecfeff',
                  borderRadius: 3,
                  padding: '2px 5px',
                  lineHeight: 1,
                  flexShrink: 0,
                }}
              >
                {index + 1}
              </span>
              <input
                type="text"
                data-testid={`parallel-branch-input-${index}`}
                value={b}
                onChange={(e) => handleBranchChange(index, e.target.value)}
                placeholder={`Branch ${index + 1}`}
                style={{
                  flex: 1,
                  border: 'none',
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: '#1e293b',
                  background: 'transparent',
                  outline: 'none',
                  minWidth: 0,
                }}
              />
              {branches.length > 1 && (
                <button
                  type="button"
                  data-testid={`parallel-delete-branch-btn-${index}`}
                  onClick={() => handleDeleteBranch(index)}
                  title="Remove branch"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: 12,
                    lineHeight: 1,
                    padding: '2px 4px',
                    borderRadius: 3,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          data-testid="parallel-add-branch-btn"
          onClick={handleAddBranch}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            background: '#ffffff',
            border: '1px dashed #0891b2',
            borderRadius: 6,
            padding: '5px 8px',
            fontSize: 11,
            fontWeight: 600,
            color: '#0891b2',
            cursor: 'pointer',
            marginTop: 2,
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#ecfeff')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
        >
          <span>+</span> Add Parallel Branch
        </button>
      </div>

      {/* Execution Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Execution Options
        </span>

        {/* Continue on error toggle */}
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            cursor: 'pointer',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 6,
            padding: '8px 10px',
          }}
        >
          <input
            type="checkbox"
            data-testid="parallel-continue-on-error-toggle"
            checked={continueOnError}
            onChange={(e) => handleContinueOnErrorChange(e.target.checked)}
            style={{ marginTop: 2, accentColor: '#0891b2', cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: '#1e293b' }}>
              Continue On Error
            </span>
            <span style={{ fontSize: 10.5, color: '#64748b', lineHeight: 1.3 }}>
              Allow other sibling branches to finish even if one branch encounters an error.
            </span>
          </div>
        </label>

        {/* Complete Message */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#334155' }}>
            Completion Message (Optional)
          </label>
          <input
            type="text"
            data-testid="parallel-complete-message-input"
            value={completeMessage}
            onChange={(e) => handleCompleteMessageChange(e.target.value)}
            placeholder="e.g. All parallel jobs completed"
            style={{
              padding: '6px 8px',
              border: '1px solid #cbd5e1',
              borderRadius: 6,
              fontSize: 11.5,
              color: '#0f172a',
              outline: 'none',
              background: '#ffffff',
            }}
          />
          <span style={{ fontSize: 10, color: '#94a3b8' }}>
            Message emitted or logged when all concurrent branches finish.
          </span>
        </div>

        {/* Optional Done Port Toggle */}
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            cursor: 'pointer',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 6,
            padding: '8px 10px',
          }}
        >
          <input
            type="checkbox"
            data-testid="parallel-join-port-toggle"
            checked={includeJoinPort}
            onChange={(e) => handleJoinPortChange(e.target.checked)}
            style={{ marginTop: 2, accentColor: '#0891b2', cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: '#1e293b' }}>
              Completion (Join) Port
            </span>
            <span style={{ fontSize: 10.5, color: '#64748b', lineHeight: 1.3 }}>
              Render a downstream &ldquo;Done&rdquo; port that triggers after all branches finish.
            </span>
          </div>
        </label>
      </div>
    </div>
  );
}
