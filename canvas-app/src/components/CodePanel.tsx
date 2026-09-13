import { useCallback, useEffect, useRef, useState } from 'react';
import type { DiagramDocument } from '../schema/diagram';
import { jsonToCSharp, csharpToJson } from '../api/transcriptionClient';
import { useDiagramStore } from '../store/diagramStore';

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
 * Code -> canvas (parse direction): debounced from the textarea's onChange
 * handler directly, NOT from a useEffect watching `codeText` -- codeText
 * also changes when a server response arrives from the regen direction,
 * and watching it generically would re-parse-and-round-trip text nobody
 * typed, on every regen. Debouncing the event handler itself means only
 * actual keystrokes ever trigger a csharp-to-json call.
 */
export function CodePanel({ document }: CodePanelProps) {
  const codeRegenRequestCount = useDiagramStore((s) => s.codeRegenRequestCount);
  const [codeText, setCodeText] = useState('');
  const [status, setStatus] = useState<SyncStatus>('idle');
  const editTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      setStatus('syncing');
      jsonToCSharp(document)
        .then((csharp) => {
          setCodeText(csharp);
          setStatus('idle');
        })
        .catch(() => setStatus('error'));
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeRegenRequestCount]);

  const onChangeText = useCallback((value: string) => {
    setCodeText(value);
    if (editTimer.current) clearTimeout(editTimer.current);
    editTimer.current = setTimeout(() => {
      setStatus('syncing');
      csharpToJson(value)
        .then((parsed) => {
          useDiagramStore.getState().replaceDocument(parsed, 'CodeEditor');
          setStatus('idle');
        })
        .catch(() => setStatus('error'));
    }, DEBOUNCE_MS);
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
          {status === 'error' && 'Sync failed'}
        </span>
      </div>
      <textarea
        data-testid="code-panel-textarea"
        value={codeText}
        onChange={(e) => onChangeText(e.target.value)}
        spellCheck={false}
        style={{
          margin: 0,
          padding: 12,
          overflow: 'auto',
          fontSize: 12,
          fontFamily: 'ui-monospace, Consolas, monospace',
          lineHeight: 1.5,
          flex: 1,
          background: 'transparent',
          color: 'inherit',
          border: 'none',
          outline: 'none',
          resize: 'none',
        }}
      />
    </div>
  );
}
