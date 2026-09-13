import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';

export type DynamicPortData = { label: string; cases: string[] };
export type DynamicPortNodeType = Node<DynamicPortData>;

export function DynamicPortNode({ data }: NodeProps<DynamicPortNodeType>) {
  const cases = data.cases;
  return (
    <div style={{ padding: 10, border: '1px solid #333', borderRadius: 6, background: '#fff', minWidth: 140 }}>
      <Handle type="target" position={Position.Left} id="in" />
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{data.label}</div>
      {cases.map((c, i) => (
        <div key={c} style={{ position: 'relative', fontSize: 11, padding: '4px 0' }}>
          {c}
          <Handle
            type="source"
            position={Position.Right}
            id={`case-${i}`}
            style={{ top: '50%' }}
          />
        </div>
      ))}
    </div>
  );
}
