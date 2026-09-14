import { Handle, type NodeProps, type Node } from '@xyflow/react';
import { sideToPosition, type DiagramNodeData } from '../mapping/toReactFlow';
import { getActivityDefinition, getNodeSummary } from '../registry/activityDefinitions';
import { portHandleStyle, portStackOffsetStyle, computePortStackPositions } from '../rendering/portStyle';

export type DiagramNodeType = Node<DiagramNodeData>;

/** Collapsed n8n-style node (Phase 1.2): icon + title + one summary line
 * only -- no inline parameter fields. Full field editing is the Inspector
 * side panel (Phase 1.5), opened by selecting this node. */
export function DiagramNode({ id, data, selected }: NodeProps<DiagramNodeType>) {
  const definition = getActivityDefinition(data.type);
  const title = definition?.title ?? data.label;
  const summary = getNodeSummary(data.type, data.rawData);
  const color = definition?.color ?? '#6b7280';
  const connected = new Set(data.connectedOutputPortIds);
  const danglingOutputPorts = data.ports.filter(
    (port) => port.direction === 'output' && !connected.has(port.id),
  );
  // Phase 4.3: same-side ports are auto-spaced by index/count, not a
  // hand-set offset -- stackPositions[i] corresponds to data.ports[i].
  const stackPositions = computePortStackPositions(data.ports);

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        border: selected ? `1.5px solid ${color}` : '1px solid #d1d5db',
        borderRadius: 8,
        background: '#fff',
        minWidth: 200,
        maxWidth: 240,
        boxShadow: selected ? `0 0 0 2px ${color}33` : '0 1px 2px rgba(0,0,0,0.05)',
      }}
    >
      {data.ports.map((port, index) => {
        const { index: sideIndex, count: sideCount } = stackPositions[index];
        return (
          <Handle
            key={port.id}
            id={port.id}
            type={port.direction === 'input' ? 'target' : 'source'}
            position={sideToPosition(port.position)}
            title={`${port.name} (${port.role})`}
            style={{ ...portHandleStyle(port.role), ...portStackOffsetStyle(port.position, sideIndex, sideCount) }}
          />
        );
      })}
      {/* Phase 1.4: "+" on every unconnected output port -- opens the
          palette in "connecting from" mode; picking an activity creates
          it pre-wired to this exact port. Phase 4.3: aligned to the same
          computed side position as the port's own Handle above (not a
          separate hand-set index*24px stack) so it sits on top of its
          actual port rather than drifting from it once a side has more
          than one port. */}
      {data.onRequestAddNode &&
        danglingOutputPorts.map((port) => {
          const portIndex = data.ports.findIndex((p) => p.id === port.id);
          const { index: sideIndex, count: sideCount } = stackPositions[portIndex];
          const top = portStackOffsetStyle(port.position, sideIndex, sideCount).top ?? '50%';
          return (
            <button
              key={port.id}
              type="button"
              title={`Add node from ${port.name}`}
              onClick={(event) => {
                event.stopPropagation();
                data.onRequestAddNode!(id, port.id);
              }}
              style={{
                position: 'absolute',
                right: -14,
                top,
                transform: 'translateY(-50%)',
                width: 18,
                height: 18,
                borderRadius: '50%',
                border: `1px solid ${color}`,
                background: '#fff',
                color,
                fontSize: 12,
                lineHeight: '16px',
                padding: 0,
                cursor: 'pointer',
                zIndex: 1,
              }}
            >
              +
            </button>
          );
        })}
      <div
        aria-hidden
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: color,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {title.slice(0, 2).toUpperCase()}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title}
        </div>
        <div
          style={{
            fontSize: 11,
            color: '#6b7280',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 1,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {summary}
        </div>
      </div>
    </div>
  );
}
