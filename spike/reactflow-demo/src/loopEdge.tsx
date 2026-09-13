import { type EdgeProps } from '@xyflow/react';

// A minimal "channel" router: if the edge goes backward (target left of source),
// drop below the row, run left, then rise into the target — never a straight
// line through whatever sits between them.
export function LoopBackEdge({ sourceX, sourceY, targetX, targetY, id, markerEnd }: EdgeProps) {
  const channelY = Math.max(sourceY, targetY) + 80;
  const path = `M ${sourceX} ${sourceY} L ${sourceX} ${channelY} L ${targetX} ${channelY} L ${targetX} ${targetY}`;
  return <path id={id} className="react-flow__edge-path" d={path} markerEnd={markerEnd} />;
}
