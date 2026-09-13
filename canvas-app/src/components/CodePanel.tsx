import { useCallback, useEffect, useRef, useState } from 'react';
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react';
import type { editor as MonacoEditorNS } from 'monaco-editor';
import type { DiagramDocument } from '../schema/diagram';
import { jsonToCSharp, csharpToJson, CSharpParseError, type ParseDiagnostic } from '../api/transcriptionClient';
import { useDiagramStore } from '../store/diagramStore';
import '../monacoSetup';

export interface CodePanelProps {
  document: DiagramDocument;
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
export function CodePanel({ document }: CodePanelProps) {
  const codeRegenRequestCount = useDiagramStore((s) => s.codeRegenRequestCount);
  const [codeText, setCodeText] = useState('');
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [diagnostics, setDiagnostics] = useState<ParseDiagnostic[]>([]);
  const editTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    const handle = setTimeout(() => {
      setStatus('syncing');
      jsonToCSharp(document)
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
  }, [codeRegenRequestCount]);

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

  const handleMount: OnMount = useCallback((editorInstance, monaco) => {
    editorRef.current = editorInstance;
    monacoRef.current = monaco;
  }, []);

  return (
    <div
      style={{
        height: 220,
        flexShrink: 0,
        borderTop: '1px solid #e5e7eb',
        background: '#0b1021',
        color: '#e5e7eb',
        display: 'flex',
        flexDirection: 'column',
      }}
      data-testid="code-panel"
    >
      <div
        style={{
          padding: '4px 12px',
          fontSize: 11,
          fontWeight: 600,
          color: '#9ca3af',
          borderBottom: '1px solid #1f2937',
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>C# (live, Roslyn-backed)</span>
        <span data-testid="code-panel-status">
          {status === 'syncing' && 'Syncing…'}
          {status === 'error' && diagnostics.length === 0 && 'Sync failed'}
          {status === 'error' && diagnostics.length > 0 && `${diagnostics.length} error(s)`}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }} data-testid="code-panel-editor">
        <Editor
          height="100%"
          language="csharp"
          theme="vs-dark"
          value={codeText}
          onMount={handleMount}
          onChange={onChangeText}
          options={{
            fontSize: 12,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
        />
      </div>
      {diagnostics.length > 0 && (
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
    </div>
  );
}
