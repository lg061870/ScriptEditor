import { useCallback, useEffect, useRef, useState } from 'react';
import type { DiagramDocument } from '../schema/diagram';
import { compileAndRun, type CompileDiagnostic, type MultiTopicRunRequest, API_BASE_URL } from '../api/transcriptionClient';
import { useDiagramStore } from '../store/diagramStore';

export interface ChatPreviewPanelProps {
  document: DiagramDocument;
  onClose: () => void;
  width?: number;
  dockedWidth?: number;
  onFloatingChange?: (isFloating: boolean) => void;
  isActive?: boolean;
}

type CompileStatus =
  | { kind: 'compiling' }
  | { kind: 'success'; typeName: string | null }
  | { kind: 'error'; diagnostics: CompileDiagnostic[] }
  | { kind: 'network-error'; message: string };

export type ChatStyleMode = 'SidebarChat' | 'FloatingChat' | 'ChatWindow';
export type ExecutionScope = 'full' | 'current';

/**
 * ConversaCore.UI Live Execution Host.
 *
 * Rather than a client-side simulated chat, this panel compiles the authored diagram
 * into a real in-memory C# topic assembly with Roslyn (/api/transcribe/run or /run-workspace)
 * and mounts the authentic ConversaCore.UI CustomChatWindowV3 component in an iframe.
 *
 * Supports Sidebar, Floating, and Full (ChatGPT) modes with smooth layout collapse
 * and Visual Studio active focus chrome.
 */
export function ChatPreviewPanel({
  document,
  onClose,
  width,
  dockedWidth,
  onFloatingChange,
  isActive = false,
}: ChatPreviewPanelProps) {
  const [compileStatus, setCompileStatus] = useState<CompileStatus>({ kind: 'compiling' });
  const [hasCompiledOnce, setHasCompiledOnce] = useState<boolean>(false);
  const [chatStyle, setChatStyle] = useState<ChatStyleMode>('SidebarChat');
  const [floatingMinimized, setFloatingMinimized] = useState<boolean>(false);
  const [runScope, setRunScope] = useState<ExecutionScope>('full');

  const topics = useDiagramStore((s) => s.topics);
  const activeTopicId = useDiagramStore((s) => s.activeTopicId);
  const initialTopic = topics.find((t) => t.isInitial) ?? topics[0];
  const activeTopic = topics.find((t) => t.id === activeTopicId) ?? initialTopic;

  const aliveRef = useRef(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const [hasPendingChanges, setHasPendingChanges] = useState<boolean>(false);

  const handleRestart = useCallback(() => {
    setCompileStatus({ kind: 'compiling' });
    setHasPendingChanges(false);

    const storeTopics = useDiagramStore.getState().topics;
    const storeActiveId = useDiagramStore.getState().activeTopicId;
    const storeInitialTopic = storeTopics.find((t) => t.isInitial) ?? storeTopics[0];
    const storeActiveTopic = storeTopics.find((t) => t.id === storeActiveId) ?? storeInitialTopic;

    const request: MultiTopicRunRequest = {
      topics: storeTopics.map((t) => ({
        name: t.name,
        document: t.document,
        isInitial: t.isInitial,
      })),
      initialTopicName: storeInitialTopic?.name ?? 'MainConversation',
      targetTopicName: (runScope === 'current' ? storeActiveTopic?.name : storeInitialTopic?.name) ?? 'MainConversation',
    };

    compileAndRun(request)
      .then((res) => {
        if (!aliveRef.current) return;
        if (res.success) {
          setCompileStatus({ kind: 'success', typeName: res.generatedTypeName });
          setHasCompiledOnce(true);
          // Post run-topic message to the persistent preview iframe
          if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage(
              {
                type: 'conversa-run-topic',
                topicName: res.generatedTypeName,
              },
              '*'
            );
          }
        } else {
          setCompileStatus({ kind: 'error', diagnostics: res.diagnostics });
        }
      })
      .catch((err) => {
        if (!aliveRef.current) return;
        setCompileStatus({
          kind: 'network-error',
          message: err instanceof Error ? err.message : String(err),
        });
      });
  }, [runScope]);

  // Listen for style cycle, minimize, and reset/recompile messages from CustomChatWindowV3
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.data && typeof event.data === 'object') {
        if (event.data.type === 'conversa-chat-style') {
          const mode = event.data.style as ChatStyleMode;
          if (mode === 'SidebarChat' || mode === 'FloatingChat' || mode === 'ChatWindow') {
            setChatStyle(mode);
          }
        } else if (event.data.type === 'conversa-floating-minimized') {
          setFloatingMinimized(Boolean(event.data.isMinimized));
        } else if (event.data.type === 'conversa-request-recompile') {
          handleRestart();
        }
      }
    }
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, [handleRestart]);

  // Compile once on mount
  useEffect(() => {
    handleRestart();
  }, [handleRestart]);

  // When document is edited, mark pending changes without auto-reloading or flickering
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setHasPendingChanges(true);
  }, [document]);

  const isFloating = chatStyle === 'FloatingChat' && hasCompiledOnce;
  const defaultWidth = chatStyle === 'ChatWindow' ? 620 : 380;
  const panelWidth = isFloating ? 0 : (dockedWidth ?? width ?? defaultWidth);

  useEffect(() => {
    onFloatingChange?.(isFloating);
  }, [isFloating, onFloatingChange]);

  return (
    <>
      <aside
        style={{
          width: panelWidth,
          flexShrink: 0,
          borderLeft: isFloating ? 'none' : '1px solid #e5e7eb',
          boxShadow: (!isFloating && isActive) ? 'inset 0 0 0 1px #6264a7' : undefined,
          display: 'flex',
          flexDirection: 'column',
          background: isFloating ? 'transparent' : '#fff',
          fontSize: 12,
          height: '100%',
          overflow: isFloating ? 'visible' : 'hidden',
          transition: 'width 0.2s ease, box-shadow 0.15s ease',
          position: 'relative',
        }}
        data-testid="chat-preview-panel"
        data-active={isActive ? 'true' : 'false'}
      >
        {/* Top Header Bar (only shown when docked in sidebar / full mode) */}
        {!isFloating && (
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: isActive ? '#6264a7' : '#9ca3af', flexShrink: 0 }} />
              <span style={{ fontSize: 12 }}>💬</span>
              <CompileBadge status={compileStatus} hasPendingChanges={hasPendingChanges} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <select
                aria-label="Execution Scope"
                value={runScope}
                onChange={(e) => setRunScope(e.target.value as ExecutionScope)}
                style={{
                  fontSize: 11,
                  height: 22,
                  padding: '0 4px',
                  borderRadius: 3,
                  border: '1px solid #d1d5db',
                  background: '#ffffff',
                  color: '#374151',
                  cursor: 'pointer',
                  maxWidth: 150,
                  outline: 'none',
                }}
                title="Select whether the chat runs the full multi-topic conversation starting at the initial topic, or runs the selected topic in isolation."
              >
                <option value="full">🌐 Full Flow ({initialTopic?.name ?? 'Initial'})</option>
                <option value="current">🎯 Topic ({activeTopic?.name ?? 'Current'})</option>
              </select>
              <button
                type="button"
                onClick={handleRestart}
                disabled={compileStatus.kind === 'compiling'}
                style={{
                  ...resetButtonStyle,
                  background: hasPendingChanges ? '#4f46e5' : '#fff',
                  color: hasPendingChanges ? '#fff' : '#374151',
                  borderColor: hasPendingChanges ? '#4338ca' : '#d1d5db',
                  opacity: compileStatus.kind === 'compiling' ? 0.7 : 1,
                  cursor: compileStatus.kind === 'compiling' ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
                title={hasPendingChanges ? 'Flow edited - click to update and restart preview' : 'Recompile and restart conversation'}
              >
                {compileStatus.kind === 'compiling' ? (
                  <>
                    <span style={{ display: 'inline-block', animation: 'conversa-spin 1s linear infinite' }}>⟳</span>
                    <span>Compiling…</span>
                  </>
                ) : (
                  '↺ Run'
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close preview"
                style={closeButtonStyle}
                title="Close"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* CSS Keyframes for Spinner Animation */}
        <style>{`
          @keyframes conversa-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>

        {/* Content Body: Loader (initial compile only) or Compile Errors */}
        {!hasCompiledOnce && compileStatus.kind === 'compiling' && (
          <div
            data-testid="chat-compiling-loader"
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
              padding: 24,
              background: '#f8fafc',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                border: '3px solid #e2e8f0',
                borderTopColor: '#6264a7',
                borderRadius: '50%',
                animation: 'conversa-spin 0.85s linear infinite',
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1e1b4b' }}>
                Compiling Workflow…
              </div>
              <div style={{ fontSize: 11, color: '#64748b', maxWidth: 230, lineHeight: 1.4 }}>
                Roslyn is compiling topic classes and booting conversational runtime
              </div>
            </div>
          </div>
        )}

        {(compileStatus.kind === 'error' || compileStatus.kind === 'network-error') && (
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, background: '#fafafa' }}>
            <CompileErrorPanel status={compileStatus} />
          </div>
        )}

        {/* Single Persistent Iframe Container: transitions between Docked and Floating without unmounting */}
        {hasCompiledOnce && (
          <div
            style={
              isFloating
                ? {
                    position: 'fixed',
                    bottom: 0,
                    right: 0,
                    zIndex: 9999,
                    width: floatingMinimized ? 110 : 440,
                    height: floatingMinimized ? 110 : 740,
                    maxWidth: '100vw',
                    maxHeight: '100vh',
                    pointerEvents: 'auto',
                    transition: 'width 0.25s ease, height 0.25s ease',
                  }
                : {
                    flex: 1,
                    minHeight: 0,
                    width: '100%',
                    height: '100%',
                    display:
                      compileStatus.kind === 'error' || compileStatus.kind === 'network-error'
                        ? 'none'
                        : 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                  }
            }
          >
            <iframe
              ref={iframeRef}
              src={`${API_BASE_URL}/preview-chat?style=${chatStyle}`}
              title="ConversaCore.UI CustomChatWindowV3"
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                flex: 1,
                background: 'transparent',
              }}
            />
          </div>
        )}
      </aside>
    </>
  );
}

function CompileBadge({ status, hasPendingChanges }: { status: CompileStatus; hasPendingChanges?: boolean }) {
  if (status.kind === 'compiling') {
    return (
      <span style={{ ...badgeStyle, background: '#fef3c7', color: '#92400e' }}>
        ● compiling…
      </span>
    );
  }
  if (hasPendingChanges) {
    return (
      <span style={{ ...badgeStyle, background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }} title="Flow edited - click Run to update preview">
        ● edited
      </span>
    );
  }
  if (status.kind === 'success') {
    return (
      <span style={{ ...badgeStyle, background: '#d1fae5', color: '#065f46' }}>
        ✓ compiled
      </span>
    );
  }
  return <span style={{ ...badgeStyle, background: '#fee2e2', color: '#b91c1c' }}>✕ failed</span>;
}

function CompileErrorPanel({ status }: { status: Extract<CompileStatus, { kind: 'error' | 'network-error' }> }) {
  return (
    <div style={{ border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 8, padding: 12 }}>
      <div style={{ fontWeight: 700, color: '#b91c1c', marginBottom: 6, fontSize: 12 }}>
        {status.kind === 'network-error' ? 'Could not reach the transcription API' : 'This flow does not compile'}
      </div>
      {status.kind === 'network-error' ? (
        <div style={{ fontSize: 11, color: '#7f1d1d' }}>{status.message}</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {status.diagnostics
            .filter((d) => d.severity === 'Error')
            .map((d, i) => (
              <li key={i} style={{ fontSize: 11, color: '#7f1d1d', lineHeight: 1.4 }}>
                {d.line != null ? <strong>Line {d.line}: </strong> : ''}
                {d.message}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

const badgeStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  padding: '1px 6px',
  borderRadius: 999,
  fontFamily: 'monospace',
};

const resetButtonStyle: React.CSSProperties = {
  border: '1px solid #d1d5db',
  background: '#fff',
  color: '#374151',
  borderRadius: 4,
  padding: '2px 7px',
  fontSize: 10,
  cursor: 'pointer',
  fontWeight: 600,
};

const closeButtonStyle: React.CSSProperties = {
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontSize: 12,
  color: '#6b7280',
  lineHeight: 1,
  padding: '2px 4px',
};
