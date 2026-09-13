import { useEffect, useRef, useState } from 'react';
import type { DiagramDocument } from '../schema/diagram';
import { advance, type ChatStep } from '../execution/simulateFlow';
import { compileAndRun, type CompileDiagnostic } from '../api/transcriptionClient';

export interface ChatPreviewPanelProps {
  document: DiagramDocument;
  onClose: () => void;
}

type CompileStatus =
  | { kind: 'compiling' }
  | { kind: 'success'; typeName: string | null }
  | { kind: 'error'; diagnostics: CompileDiagnostic[] }
  | { kind: 'network-error'; message: string };

/**
 * Phase 6.1/6.2 (#40/#41): a preview panel modeled on ConversaCore.UI's
 * own CustomChatWindowV3.razor (`..\InsuranceSemanticV2\ConversaCore.UI\
 * Components\`) -- bot/user message bubbles, a per-message quick-reply
 * chip row, a typing indicator during a DelayActivity's pause, and an
 * input row that highlights via a `prompt-attention`-style state while a
 * ChatPromptAttentionActivity is active, same as the real component's
 * `IsPromptAttentionActive`/`PromptAttentionText`. AdaptiveCardActivity
 * renders as an explicitly-labeled stub (see execution/simulateFlow.ts)
 * rather than the real AdaptiveCardRenderer.razor, since there's no real
 * card/model JSON anywhere in this schema yet to render from.
 *
 * Every open/Reset first calls /api/transcribe/run (#41's "on-demand
 * compile+load" -- a real Roslyn CSharpCompilation.Emit + assembly load
 * against the actual ConversaCore.dll reference, not a simulation). Only
 * on a successful compile does it then walk the simulated flow
 * (execution/simulateFlow.ts) below -- running the stubbed preview
 * against a diagram that doesn't even compile would misrepresent it as
 * more real than it is. A failed compile shows the real Roslyn
 * diagnostics instead. WorkflowCompiler.CompileAndLoad still doesn't
 * instantiate a running instance (needs a live TopicWorkflowContext/
 * ILogger this app has no host for) -- see that file's own scope-boundary
 * comment -- so the chat itself stays the client-side simulation from
 * #40 even after a successful real compile.
 */
export function ChatPreviewPanel({ document, onClose }: ChatPreviewPanelProps) {
  const [compileStatus, setCompileStatus] = useState<CompileStatus>({ kind: 'compiling' });
  const [messages, setMessages] = useState<ChatStep[]>([]);
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<'text' | 'choice' | 'click' | null>(null);
  const [waitOptions, setWaitOptions] = useState<string[] | undefined>();
  const [waitButtonLabel, setWaitButtonLabel] = useState<string | undefined>();
  const [ended, setEnded] = useState(false);
  const [deadEnd, setDeadEnd] = useState(false);
  const [typing, setTyping] = useState(false);
  const [suggestionChips, setSuggestionChips] = useState<string[]>([]);
  const [promptAttention, setPromptAttention] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [playing, setPlaying] = useState(false);

  const aliveRef = useRef(true);
  const attentionTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Every call to runTurn/handleReset stamps a new run id and checks it
  // after each await -- guards against two turns racing and both writing
  // to `messages` (duplicating every bubble). Not just a React StrictMode
  // dev-mode artifact: the same race is reachable by a fast double-click
  // on Reset, or the auto-start effect re-running before its own state
  // update (`started`) has committed -- a plain boolean state flag isn't
  // enough to guard against that since both invocations read it as
  // false. A ref is synchronous and doesn't have that gap.
  const runIdRef = useRef(0);
  const autoStartedRef = useRef(false);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      clearTimeout(attentionTimerRef.current);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, typing]);

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  async function playSteps(steps: ChatStep[], myRun: number) {
    setPlaying(true);
    for (const step of steps) {
      if (!aliveRef.current || runIdRef.current !== myRun) return;
      if (step.kind === 'delay') {
        setTyping(true);
        await sleep(step.ms);
        if (!aliveRef.current || runIdRef.current !== myRun) return;
        setTyping(false);
        continue;
      }
      setMessages((m) => [...m, step]);
      if (step.kind !== 'user') await sleep(220);
      if (!aliveRef.current || runIdRef.current !== myRun) return;
    }
    setPlaying(false);
  }

  async function runTurn(fromNodeId: string | null, resumeValue?: string) {
    const myRun = ++runIdRef.current;
    const result = advance(document, fromNodeId, resumeValue);
    setCurrentNodeId(result.currentNodeId);
    setWaiting(result.waiting);
    setWaitOptions(result.waitOptions);
    setWaitButtonLabel(result.waitButtonLabel);
    setEnded(result.ended);
    setDeadEnd(result.deadEnd);
    if (result.suggestionChips !== undefined) setSuggestionChips(result.suggestionChips);

    clearTimeout(attentionTimerRef.current);
    if (result.promptAttention) {
      setPromptAttention(result.promptAttention.text);
      attentionTimerRef.current = setTimeout(() => {
        if (aliveRef.current && runIdRef.current === myRun) setPromptAttention(null);
      }, result.promptAttention.durationMs);
    }

    await playSteps(result.steps, myRun);
  }

  async function handleReset() {
    const myRun = ++runIdRef.current;
    clearTimeout(attentionTimerRef.current);
    setMessages([]);
    setSuggestionChips([]);
    setPromptAttention(null);
    setInputValue('');
    setEnded(false);
    setDeadEnd(false);
    setWaiting(null);
    setCompileStatus({ kind: 'compiling' });

    let result;
    try {
      result = await compileAndRun(document);
    } catch (err) {
      if (!aliveRef.current || runIdRef.current !== myRun) return;
      setCompileStatus({ kind: 'network-error', message: err instanceof Error ? err.message : String(err) });
      return;
    }
    if (!aliveRef.current || runIdRef.current !== myRun) return;

    if (!result.success) {
      setCompileStatus({ kind: 'error', diagnostics: result.diagnostics });
      return;
    }
    setCompileStatus({ kind: 'success', typeName: result.generatedTypeName });
    void runTurn(null);
  }

  // Auto-start the very first time the panel is opened, and re-run
  // automatically on later document edits ONLY if no turn has been played
  // yet -- once the preview is mid-conversation, an edit shouldn't yank
  // the transcript out from under the user; they reset explicitly instead
  // (same model as the reference component's own "Reset conversation").
  // Guarded with a ref, not state: React StrictMode (and any other fast
  // double-invoke) runs this effect body twice back to back, before
  // either invocation's state updates have committed -- a `started`
  // state flag would read false both times and start two concurrent
  // turns, each appending its own copy of every message.
  useEffect(() => {
    if (!autoStartedRef.current) {
      autoStartedRef.current = true;
      void handleReset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSend() {
    const text = inputValue.trim();
    if (!text || waiting !== 'text' || playing) return;
    setInputValue('');
    void runTurn(currentNodeId, text);
  }

  function handleChoice(option: string) {
    if (waiting !== 'choice' || playing) return;
    void runTurn(currentNodeId, option);
  }

  function handleClickContinue() {
    if (waiting !== 'click' || playing) return;
    void runTurn(currentNodeId, '');
  }

  const inputEnabled = waiting === 'text' && !playing && compileStatus.kind === 'success';

  return (
    <aside
      style={{
        width: 320,
        flexShrink: 0,
        borderLeft: '1px solid #e5e7eb',
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        fontSize: 12,
      }}
      data-testid="chat-preview-panel"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          borderBottom: '1px solid #e5e7eb',
          background: '#f9fafb',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: '#d1fae5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
            }}
          >
            🤖
          </span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              Live Preview
              <CompileBadge status={compileStatus} />
            </div>
            <div style={{ fontSize: 10, color: '#6b7280' }}>
              {compileStatus.kind === 'compiling'
                ? 'Compiling against ConversaCore…'
                : compileStatus.kind === 'error' || compileStatus.kind === 'network-error'
                  ? 'Compile failed -- fix the flow and Reset to retry'
                  : ended
                    ? 'Conversation ended'
                    : deadEnd
                      ? 'No further connection from here'
                      : 'Simulated execution'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={() => void handleReset()} title="Recompile and reset" style={resetButtonStyle}>
            ↺ Run
          </button>
          <button type="button" onClick={onClose} aria-label="Close preview" style={closeButtonStyle}>
            ×
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8, background: '#fafafa' }}>
        {(compileStatus.kind === 'error' || compileStatus.kind === 'network-error') && (
          <CompileErrorPanel status={compileStatus} />
        )}
        {messages.map((step, i) => (
          <MessageBubble key={i} step={step} />
        ))}
        {typing && (
          <div style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic' }} data-testid="typing-indicator">
            ⏳ …
          </div>
        )}
        {waiting === 'choice' && waitOptions && !playing && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 30 }}>
            {waitOptions.map((opt) => (
              <button key={opt} type="button" onClick={() => handleChoice(opt)} style={chipButtonStyle}>
                {opt}
              </button>
            ))}
          </div>
        )}
        {waiting === 'click' && !playing && (
          <div style={{ paddingLeft: 30 }}>
            <button type="button" onClick={handleClickContinue} style={primaryButtonStyle}>
              {waitButtonLabel ?? 'Continue'}
            </button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {suggestionChips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 10px', borderTop: '1px solid #f3f4f6' }}>
          {suggestionChips.map((s) => (
            <span key={s} style={suggestionChipStyle}>
              {s}
            </span>
          ))}
        </div>
      )}

      <div
        style={{
          padding: 8,
          borderTop: '1px solid #e5e7eb',
          background: promptAttention ? '#fffbeb' : '#fff',
          transition: 'background 150ms',
        }}
        data-testid="chat-input-row"
      >
        {promptAttention && (
          <div style={{ fontSize: 10, color: '#b45309', marginBottom: 4 }} data-testid="prompt-attention-label">
            {promptAttention}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            value={inputValue}
            disabled={!inputEnabled}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSend();
            }}
            placeholder={inputEnabled ? 'Type your message…' : ended ? 'Conversation ended' : deadEnd ? 'Flow ends here' : 'Waiting…'}
            style={{
              flex: 1,
              border: '1px solid #d1d5db',
              borderRadius: 6,
              padding: '6px 8px',
              fontSize: 12,
              background: inputEnabled ? '#fff' : '#f3f4f6',
            }}
          />
          <button type="button" onClick={handleSend} disabled={!inputEnabled || !inputValue.trim()} style={primaryButtonStyle}>
            Send
          </button>
        </div>
      </div>
    </aside>
  );
}

function CompileBadge({ status }: { status: CompileStatus }) {
  if (status.kind === 'compiling') {
    return <span style={{ ...badgeStyle, background: '#f3f4f6', color: '#6b7280' }}>compiling…</span>;
  }
  if (status.kind === 'success') {
    return (
      <span style={{ ...badgeStyle, background: '#d1fae5', color: '#047857' }} title={status.typeName ?? undefined}>
        ✓ compiled
      </span>
    );
  }
  return <span style={{ ...badgeStyle, background: '#fee2e2', color: '#b91c1c' }}>✕ compile failed</span>;
}

function CompileErrorPanel({ status }: { status: Extract<CompileStatus, { kind: 'error' | 'network-error' }> }) {
  return (
    <div style={{ border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 8, padding: 8 }}>
      <div style={{ fontWeight: 700, color: '#b91c1c', marginBottom: 4 }}>
        {status.kind === 'network-error' ? 'Could not reach the transcription API' : 'This flow does not compile'}
      </div>
      {status.kind === 'network-error' ? (
        <div style={{ fontSize: 11, color: '#7f1d1d' }}>{status.message}</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {status.diagnostics
            .filter((d) => d.severity === 'Error')
            .map((d, i) => (
              <li key={i} style={{ fontSize: 11, color: '#7f1d1d' }}>
                {d.line != null ? `Line ${d.line}: ` : ''}
                {d.message}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

function MessageBubble({ step }: { step: ChatStep }) {
  if (step.kind === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ background: '#4f46e5', color: '#fff', borderRadius: '12px 12px 2px 12px', padding: '6px 10px', maxWidth: '85%' }}>
          {step.text}
        </div>
      </div>
    );
  }
  if (step.kind === 'system') {
    return <div style={{ fontSize: 10, color: '#6b7280', fontStyle: 'italic', paddingLeft: 30 }}>{step.text}</div>;
  }
  if (step.kind === 'card-stub') {
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <Avatar />
        <div style={{ border: '2px dashed #a5b4fc', borderRadius: 10, padding: 8, maxWidth: '90%', background: '#eef2ff' }}>
          <div style={{ fontWeight: 700, color: '#4338ca', marginBottom: 2 }}>▣ {step.title}</div>
          <div style={{ fontSize: 10, color: '#6b7280' }}>{step.note}</div>
        </div>
      </div>
    );
  }
  // 'bot'
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
      <Avatar />
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px 12px 12px 2px', padding: '6px 10px', maxWidth: '85%' }}>
        {step.text}
      </div>
    </div>
  );
}

function Avatar() {
  return (
    <span
      style={{
        width: 20,
        height: 20,
        borderRadius: '50%',
        background: '#d1fae5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        flexShrink: 0,
      }}
    >
      🤖
    </span>
  );
}

const badgeStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  borderRadius: 999,
  padding: '1px 6px',
  fontFamily: 'monospace',
};

const chipButtonStyle: React.CSSProperties = {
  border: '1px solid #c7d2fe',
  background: '#eef2ff',
  color: '#4338ca',
  borderRadius: 999,
  padding: '4px 10px',
  fontSize: 11,
  cursor: 'pointer',
};

const suggestionChipStyle: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  background: '#f9fafb',
  color: '#6b7280',
  borderRadius: 999,
  padding: '3px 8px',
  fontSize: 10,
};

const primaryButtonStyle: React.CSSProperties = {
  border: 'none',
  background: '#4f46e5',
  color: '#fff',
  borderRadius: 6,
  padding: '6px 12px',
  fontSize: 12,
  cursor: 'pointer',
};

const resetButtonStyle: React.CSSProperties = {
  border: '1px solid #d1d5db',
  background: '#fff',
  color: '#374151',
  borderRadius: 6,
  padding: '4px 8px',
  fontSize: 11,
  cursor: 'pointer',
};

const closeButtonStyle: React.CSSProperties = {
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontSize: 16,
  color: '#6b7280',
  lineHeight: 1,
};
