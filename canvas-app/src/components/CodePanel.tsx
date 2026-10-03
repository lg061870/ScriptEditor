import { useCallback, useEffect, useRef, useState } from 'react';
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react';
import type { editor as MonacoEditorNS } from 'monaco-editor';
import type { DiagramDocument } from '../schema/diagram';
import { jsonToCSharp, csharpToJson, CSharpParseError, type ParseDiagnostic } from '../api/transcriptionClient';
import { useDiagramStore } from '../store/diagramStore';
import '../monacoSetup';

export interface CodePanelProps {
  document: DiagramDocument;
  height?: number;
  isActive?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

const DEBOUNCE_MS = 350;

type SyncStatus = 'idle' | 'syncing' | 'error';

/**
 * Phase 3.3: bidirectional, debounced sync with the real transcription API
 * (Endpoints/TranscriptionEndpoints.cs), replacing Phase 2.4's static
 * local template.
 *
 * Canvas/Inspector -> code (regen direction): watches
 * store.codeRegenRequestCount, not `document` directly -- that counter
 * only bumps for non-CodeEditor-origin mutations (ADR 0002 / Phase 2.3),
 * so a CodeEditor-origin mutation applied below does NOT re-trigger a
 * redundant json-to-csharp call. This is the loop-prevention rule made
 * real, not just tested against the store in isolation.
 *
 * Code -> canvas (parse direction): debounced from the editor's onChange
 * handler directly, NOT from a useEffect watching `codeText` -- codeText
 * also changes when a server response arrives from the regen direction,
 * and watching it generically would re-parse-and-round-trip text nobody
 * typed, on every regen. Debouncing the event handler itself means only
 * actual keystrokes ever trigger a csharp-to-json call.
 *
 * Phase 3.5 (CONCEPT_OF_OPERATIONS.md line 333): a real C# editor (Monaco)
 * replaces the plain textarea specifically so a syntax error has an actual
 * gutter to report diagnostics in. On a parse failure, diagnostics are
 * rendered as Monaco markers (squiggles + gutter dots) AND as a list below
 * the editor -- but `replaceDocument` is only ever called from the
 * `.then()` of a *successful* parse, so the last-valid JSON document is
 * never touched by a syntax error; only what's on screen changes.
 */
export function CodePanel({
  document,
  height = 220,
  isActive = false,
  isCollapsed = false,
  onToggleCollapse,
}: CodePanelProps) {
  const codeRegenRequestCount = useDiagramStore((s) => s.codeRegenRequestCount);
  const activeTopic = useDiagramStore((s) => s.topics.find((t) => t.id === s.activeTopicId));
  const [activeTab, setActiveTab] = useState<'csharp' | 'json'>('csharp');
  const [codeText, setCodeText] = useState('');
  const [jsonText, setJsonText] = useState(() => JSON.stringify(document, null, 2));
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [diagnostics, setDiagnostics] = useState<ParseDiagnostic[]>([]);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const editTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jsonEditTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  const applyMarkers = useCallback((diags: ParseDiagnostic[]) => {
    const editorInstance = editorRef.current;
    const monaco = monacoRef.current;
    const model = editorInstance?.getModel();
    if (!monaco || !model) return;

    const markers: MonacoEditorNS.IMarkerData[] = diags.map((d) => {
      const line = Math.min(Math.max(d.line ?? 1, 1), model.getLineCount());
      return {
        severity: monaco.MarkerSeverity.Error,
        message: d.message,
        startLineNumber: line,
        startColumn: 1,
        endLineNumber: line,
        endColumn: model.getLineMaxColumn(line),
      };
    });
    monaco.editor.setModelMarkers(model, 'roslyn', markers);
  }, []);

  useEffect(() => {
    // Keep JSON structure synced from document whenever diagram document updates
    try {
      setJsonText(JSON.stringify(document, null, 2));
      setJsonError(null);
    } catch {
      // ignore
    }

    const handle = setTimeout(() => {
      setStatus('syncing');
      const topicName = activeTopic?.name || 'MainConversation';
      jsonToCSharp(document, topicName)
        .then((csharp) => {
          setCodeText(csharp);
          setDiagnostics([]);
          applyMarkers([]);
          setStatus('idle');
        })
        .catch(() => setStatus('error'));
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeRegenRequestCount, document, activeTopic?.id, activeTopic?.name]);

  const onChangeText = useCallback(
    (value: string | undefined) => {
      const next = value ?? '';
      setCodeText(next);
      if (editTimer.current) clearTimeout(editTimer.current);
      editTimer.current = setTimeout(() => {
        setStatus('syncing');
        csharpToJson(next)
          .then((parsed) => {
            useDiagramStore.getState().replaceDocument(parsed, 'CodeEditor');
            setDiagnostics([]);
            applyMarkers([]);
            setStatus('idle');
          })
          .catch((err: unknown) => {
            if (err instanceof CSharpParseError) {
              // Deliberately do NOT call replaceDocument here -- the
              // last-valid JSON document must survive a syntax error
              // untouched. Only the editor's own diagnostics update.
              setDiagnostics(err.diagnostics);
              applyMarkers(err.diagnostics);
            }
            setStatus('error');
          });
      }, DEBOUNCE_MS);
    },
    [applyMarkers],
  );

  const onChangeJson = useCallback(
    (value: string | undefined) => {
      const next = value ?? '';
      setJsonText(next);
      if (jsonEditTimer.current) clearTimeout(jsonEditTimer.current);
      jsonEditTimer.current = setTimeout(() => {
        try {
          const parsed = JSON.parse(next);
          if (parsed && typeof parsed === 'object' && Array.isArray(parsed.nodes)) {
            useDiagramStore.getState().replaceDocument(parsed as DiagramDocument, 'CodeEditor');
            setJsonError(null);
            setStatus('idle');
          } else {
            setJsonError('JSON must be a valid DiagramDocument object with a "nodes" array.');
            setStatus('error');
          }
        } catch (err: any) {
          setJsonError(err.message || 'Invalid JSON syntax');
          setStatus('error');
        }
      }, DEBOUNCE_MS);
    },
    [],
  );

  const handleMount: OnMount = useCallback((editorInstance, monaco) => {
    editorRef.current = editorInstance;
    monacoRef.current = monaco;
  }, []);

  return (
    <div
      style={{
        height: isCollapsed ? 28 : height,
        flexShrink: 0,
        borderTop: '1px solid #2d2d2d',
        boxShadow: isActive ? 'inset 0 0 0 1px #6264a7' : undefined,
        background: '#1e1e1e',
        color: '#e5e7eb',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'box-shadow 0.15s ease',
      }}
      data-testid="code-panel"
      data-collapsed={isCollapsed ? 'true' : 'false'}
      data-active={isActive ? 'true' : 'false'}
    >
      {/* VS-styled Tool Window Header with Tab Well */}
      <div
        style={{
          height: 28,
          background: isActive ? '#282833' : '#252526',
          borderBottom: isActive ? '1px solid #3c3c4f' : '1px solid #1e1e1e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 10px',
          fontSize: 11,
          flexShrink: 0,
          userSelect: 'none',
          transition: 'background 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* C# Code Tab */}
          <button
            type="button"
            data-testid="code-panel-tab-csharp"
            onClick={() => {
              setActiveTab('csharp');
              if (isCollapsed) onToggleCollapse?.();
            }}
            style={{
              padding: '4px 12px',
              fontWeight: 600,
              fontSize: 11,
              color: activeTab === 'csharp' ? '#ffffff' : '#9ca3af',
              background: activeTab === 'csharp' ? '#1e1e1e' : 'transparent',
              border: 'none',
              borderTop: activeTab === 'csharp' ? (isActive ? '2px solid #6264a7' : '2px solid #007acc') : '2px solid transparent',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
              outline: 'none',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: activeTab === 'csharp' ? (isActive ? '#6264a7' : '#007acc') : '#5a5a60',
                flexShrink: 0,
              }}
            />
            <span>📄</span> {activeTopic ? `${activeTopic.name}.cs` : 'MainConversation.cs'}
          </button>

          {/* JSON Structure Tab */}
          <button
            type="button"
            data-testid="code-panel-tab-json"
            onClick={() => {
              setActiveTab('json');
              if (isCollapsed) onToggleCollapse?.();
            }}
            style={{
              padding: '4px 12px',
              fontWeight: 600,
              fontSize: 11,
              color: activeTab === 'json' ? '#ffffff' : '#9ca3af',
              background: activeTab === 'json' ? '#1e1e1e' : 'transparent',
              border: 'none',
              borderTop: activeTab === 'json' ? (isActive ? '2px solid #6264a7' : '2px solid #007acc') : '2px solid transparent',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
              outline: 'none',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: activeTab === 'json' ? (isActive ? '#6264a7' : '#007acc') : '#5a5a60',
                flexShrink: 0,
              }}
            />
            <span>&#123; &#125;</span> {activeTopic ? `${activeTopic.name}.json` : 'diagram.json'}
          </button>

          {activeTab === 'csharp' && diagnostics.length > 0 && (
            <div
              style={{
                padding: '4px 10px',
                fontWeight: 600,
                fontSize: 11,
                color: '#f87171',
                background: '#2d2d2d',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>⚠</span> Errors ({diagnostics.length})
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span data-testid="code-panel-status" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#9ca3af' }}>
            {status === 'syncing' && <span style={{ color: '#60a5fa' }}>● Syncing…</span>}
            {status === 'error' && activeTab === 'csharp' && diagnostics.length === 0 && <span style={{ color: '#f87171' }}>✕ Sync failed</span>}
            {status === 'error' && activeTab === 'csharp' && diagnostics.length > 0 && <span style={{ color: '#f87171' }}>✕ {diagnostics.length} error(s)</span>}
            {status === 'error' && activeTab === 'json' && <span style={{ color: '#f87171' }}>✕ Invalid JSON</span>}
            {status === 'idle' && <span style={{ color: '#4ade80' }}>✓ In sync</span>}
          </span>
          <button
            type="button"
            data-testid={isCollapsed ? 'expand-code-panel-button' : 'collapse-code-panel-button'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse?.();
            }}
            title={isCollapsed ? 'Expand Code Panel (up)' : 'Collapse Code Panel (down)'}
            aria-label={isCollapsed ? 'Expand Code Panel' : 'Collapse Code Panel'}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: 3,
              fontSize: 11,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isCollapsed ? '▲' : '▼'}
          </button>
        </div>
      </div>
      {!isCollapsed && (
        <>
          <div style={{ flex: 1, minHeight: 0 }} data-testid="code-panel-editor">
            <Editor
              key={activeTab}
              path={activeTab === 'csharp' ? `${activeTopic?.name || 'MainConversation'}.cs` : `${activeTopic?.name || 'diagram'}.json`}
              height="100%"
              language={activeTab === 'csharp' ? 'csharp' : 'json'}
              theme="vs-dark"
              value={activeTab === 'csharp' ? codeText : jsonText}
              onMount={handleMount}
              onChange={activeTab === 'csharp' ? onChangeText : onChangeJson}
              options={{
                fontSize: 12,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
              }}
            />
          </div>
          {activeTab === 'csharp' && diagnostics.length > 0 && (
            <div
              data-testid="code-panel-diagnostics"
              style={{
                flexShrink: 0,
                maxHeight: 72,
                overflow: 'auto',
                borderTop: '1px solid #1f2937',
                background: '#2a0f12',
                fontSize: 11,
                fontFamily: 'ui-monospace, Consolas, monospace',
              }}
            >
              {diagnostics.map((d, i) => (
                <div key={i} style={{ padding: '2px 12px', color: '#fca5a5' }}>
                  {d.line !== null ? `Line ${d.line}: ` : ''}
                  {d.message}
                </div>
              ))}
            </div>
          )}
          {activeTab === 'json' && jsonError && (
            <div
              data-testid="code-panel-json-diagnostics"
              style={{
                flexShrink: 0,
                maxHeight: 72,
                overflow: 'auto',
                borderTop: '1px solid #1f2937',
                background: '#2a0f12',
                fontSize: 11,
                fontFamily: 'ui-monospace, Consolas, monospace',
                padding: '4px 12px',
                color: '#fca5a5',
              }}
            >
              <span>✕ Syntax Error: </span> {jsonError}
            </div>
          )}
        </>
      )}
    </div>
  );
}
