import { useEffect, useRef, useState } from 'react';
import type { DiagramDocument } from '../schema/diagram';
import { advance, type ChatStep } from '../execution/simulateFlow';

export interface ChatPreviewPanelProps {
  document: DiagramDocument;
  onClose: () => void;
}

/**
 * Phase 6.1: a preview panel modeled on ConversaCore.UI's own
 * CustomChatWindowV3.razor (`..\InsuranceSemanticV2\ConversaCore.UI\
 * Components\`) -- bot/user message bubbles, a per-message quick-reply
 * chip row, a typing indicator during a DelayActivity's pause, and an
 * input row that highlights via a `prompt-attention`-style state while a
 * ChatPromptAttentionActivity is active, same as the real component's
 * `IsPromptAttentionActive`/`PromptAttentionText`. AdaptiveCardActivity
 * renders as an explicitly-labeled stub (see execution/simulateFlow.ts)
 * rather than the real AdaptiveCardRenderer.razor, since there's no real
 * card/model JSON anywhere in this schema yet to render from.
 *
 * Execution itself is client-side simulation (execution/simulateFlow.ts),
 * not a call to a real ConversaCore runtime -- this task's own acceptance
 * criteria allows "a real (or realistically stubbed) execution", and
 * wiring this pane to the Phase 3.4 on-demand compile+load is Phase 6.2's
 * job, not this one's.
 */
export function ChatPreviewPanel({ document, onClose }: ChatPreviewPanelProps) {
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

  function handleReset() {
    clearTimeout(attentionTimerRef.current);
    setMessages([]);
    setSuggestionChips([]);
    setPromptAttention(null);
    setInputValue('');
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
      handleReset();
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

  const inputEnabled = waiting === 'text' && !playing;

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
            <div style={{ fontWeight: 700, fontSize: 12 }}>Live Preview</div>
            <div style={{ fontSize: 10, color: '#6b7280' }}>
              {ended ? 'Conversation ended' : deadEnd ? 'No further connection from here' : 'Simulated execution'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={handleReset} title="Reset conversation" style={resetButtonStyle}>
            ↺ Reset
          </button>
          <button type="button" onClick={onClose} aria-label="Close preview" style={closeButtonStyle}>
            ×
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8, background: '#fafafa' }}>
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
