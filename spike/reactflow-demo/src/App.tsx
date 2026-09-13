import { useCallback, useState } from 'react';
import { ReactFlow, Background, Controls, addEdge, applyNodeChanges, applyEdgeChanges,
  type Node, type Edge, type OnConnect, type OnNodesChange, type OnEdgesChange } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { DynamicPortNode } from './DynamicPortNode';
import { LoopBackEdge } from './loopEdge';

const nodeTypes = { dynamicPort: DynamicPortNode };
const edgeTypes = { loopBack: LoopBackEdge };

const initialNodes: Node[] = [
  { id: 'switch', type: 'dynamicPort', position: { x: 0, y: 0 },
    data: { label: 'SwitchActivity', cases: ['Case A', 'Case B', 'Case C'] } },
  { id: 'middle', type: 'dynamicPort', position: { x: 260, y: 0 },
    data: { label: 'SimpleActivity', cases: ['Output'] } },
  { id: 'far', type: 'dynamicPort', position: { x: 520, y: 0 },
    data: { label: 'RepeatActivity', cases: ['Output'] } },
];

const initialEdges: Edge[] = [
  { id: 'e1', source: 'switch', sourceHandle: 'case-0', target: 'middle', targetHandle: 'in' },
  { id: 'e2', source: 'middle', sourceHandle: 'case-0', target: 'far', targetHandle: 'in' },
  // The proof edge: 'far' looping back to 'switch' must NOT cross through 'middle'.
  { id: 'loop', type: 'loopBack', source: 'far', sourceHandle: 'case-0', target: 'switch', targetHandle: 'in' },
];

export default function App() {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const onNodesChange: OnNodesChange = useCallback((c) => setNodes((n) => applyNodeChanges(c, n)), []);
  const onEdgesChange: OnEdgesChange = useCallback((c) => setEdges((e) => applyEdgeChanges(c, e)), []);
  const onConnect: OnConnect = useCallback((c) => setEdges((e) => addEdge(c, e)), []);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
