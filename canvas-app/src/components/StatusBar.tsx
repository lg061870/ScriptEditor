export interface StatusBarProps {
  nodeCount: number;
  edgeCount: number;
  activePane?: string;
}

export function StatusBar({ nodeCount, edgeCount, activePane }: StatusBarProps) {

  return (
    <footer
      data-testid="ide-status-bar"
      style={{
        height: 24,
        background: '#007acc',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        fontSize: 11,
        fontFamily: 'Segoe UI, system-ui, -apple-system, sans-serif',
        flexShrink: 0,
        zIndex: 20,
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10 }}>✓</span> Ready
        </span>
        <span style={{ opacity: 0.8 }}>|</span>
        <span>Nodes: <strong>{nodeCount}</strong></span>
        <span>Edges: <strong>{edgeCount}</strong></span>
        {activePane && (
          <>
            <span style={{ opacity: 0.8 }}>|</span>
            <span style={{ textTransform: 'capitalize' }}>Pane: <strong>{activePane}</strong></span>
          </>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ opacity: 0.9 }}>Topic: <code>editor.current</code></span>
        <span style={{ opacity: 0.8 }}>|</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80' }}></span>
          Roslyn Live
        </span>
      </div>
    </footer>
  );
}
