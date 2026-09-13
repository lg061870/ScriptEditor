import { Handle, type NodeProps, type Node } from '@xyflow/react';
import { sideToPosition, type DiagramNodeData } from '../mapping/toReactFlow';

export type DiagramNodeType = Node<DiagramNodeData>;

/** Phase 1.1: minimal rendering -- just proves the schema -> React Flow
 * mapping works (type/label + ports). Phase 1.2 replaces the body with
 * the collapsed n8n-style icon+title+summary treatment. */
export function DiagramNode({ data }: NodeProps<DiagramNodeType>) {
  return (
    <div style={{ padding: 10, border: '1px solid #333', borderRadius: 6, background: '#fff', minWidth: 160 }}>
      {data.ports.map((port) => (
        <Handle
          key={port.id}
          id={port.id}
          type={port.direction === 'input' ? 'target' : 'source'}
          position={sideToPosition(port.position)}
        />
      ))}
      <div style={{ fontWeight: 600 }}>{data.label}</div>
      <div style={{ fontSize: 11, color: '#666' }}>{data.type}</div>
    </div>
  );
}
