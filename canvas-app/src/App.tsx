import { ReactFlow, Background, Controls, MiniMap } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { DiagramNode } from './components/DiagramNode';
import { toReactFlowNodes, toReactFlowEdges } from './mapping/toReactFlow';
import { sampleDocument } from './fixtures/sampleDocument';

const nodeTypes = { diagramNode: DiagramNode };

export default function App() {
  const nodes = toReactFlowNodes(sampleDocument);
  const edges = toReactFlowEdges(sampleDocument);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView>
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
