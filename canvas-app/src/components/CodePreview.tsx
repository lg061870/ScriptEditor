import { useMemo } from 'react';
import type { DiagramDocument } from '../schema/diagram';
import { generateCSharp } from '../codegen/generateCSharp';

export interface CodePreviewProps {
  document: DiagramDocument;
}

/** Phase 2.4: read-only panel, live-templated from the current JSON on
 * every render (no debounce, no API call -- that's Phase 3.3's job once a
 * real Roslyn transcriber exists at the other end). Proves the JSON SSOT
 * can drive a second, independent projection beyond the canvas itself. */
export function CodePreview({ document }: CodePreviewProps) {
  const code = useMemo(() => generateCSharp(document), [document]);

  return (
    <div
      style={{
        height: 200,
        flexShrink: 0,
        borderTop: '1px solid #e5e7eb',
        background: '#0b1021',
        color: '#e5e7eb',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '4px 12px',
          fontSize: 11,
          fontWeight: 600,
          color: '#9ca3af',
          borderBottom: '1px solid #1f2937',
          flexShrink: 0,
        }}
      >
        C# Preview (static template -- not yet Roslyn-backed)
      </div>
      <pre
        data-testid="code-preview"
        style={{
          margin: 0,
          padding: 12,
          overflow: 'auto',
          fontSize: 12,
          fontFamily: 'ui-monospace, Consolas, monospace',
          lineHeight: 1.5,
          flex: 1,
        }}
      >
        {code}
      </pre>
    </div>
  );
}
