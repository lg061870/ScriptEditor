import type { DiagramDocument } from '../schema/diagram';

export interface GraphReachabilityResult {
  reachableNodeIds: Set<string>;
  freeFloatingNodeIds: string[];
}

/**
 * Computes graph reachability from the entry root (StartNode / StartActivity).
 * Any node not reachable via a chain of outgoing edges is designated free-floating.
 */
export function computeGraphReachability(document: DiagramDocument): GraphReachabilityResult {
  const nodeMap = new Map(document.nodes.map((n) => [n.id, n]));

  // 1. Identify root nodes:
  // Explicit StartNode is always the authoritative entry point.
  const startNodes = document.nodes.filter(
    (n) => n.type === 'StartNode' || n.type === 'StartActivity'
  );

  let rootIds: string[] = [];
  if (startNodes.length > 0) {
    rootIds = startNodes.map((n) => n.id);
  } else {
    // Graceful fallback for legacy test fixtures or documents without an explicit StartNode:
    // Compute in-degree from edges. Nodes with in-degree 0 are candidate roots.
    const inDegree = new Map<string, number>();
    for (const node of document.nodes) {
      inDegree.set(node.id, 0);
    }
    for (const edge of document.edges) {
      if (edge.to && inDegree.has(edge.to.node)) {
        inDegree.set(edge.to.node, (inDegree.get(edge.to.node) ?? 0) + 1);
      }
    }
    const zeroIn = document.nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0);
    if (zeroIn.length > 0) {
      rootIds = [zeroIn[0].id];
    } else if (document.nodes.length > 0) {
      rootIds = [document.nodes[0].id];
    }
  }

  // 2. Build adjacency list of outgoing edges
  const outgoing = new Map<string, string[]>();
  for (const node of document.nodes) {
    outgoing.set(node.id, []);
  }
  for (const edge of document.edges) {
    if (edge.to && outgoing.has(edge.from.node)) {
      outgoing.get(edge.from.node)!.push(edge.to.node);
    }
  }

  // 3. BFS traversal starting from rootIds
  const reachableNodeIds = new Set<string>();
  const queue = [...rootIds];
  for (const rootId of rootIds) {
    reachableNodeIds.add(rootId);
  }

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const neighbors = outgoing.get(currentId) ?? [];
    for (const neighborId of neighbors) {
      if (!reachableNodeIds.has(neighborId) && nodeMap.has(neighborId)) {
        reachableNodeIds.add(neighborId);
        queue.push(neighborId);
      }
    }
  }

  // 4. Any node not in reachableNodeIds is free-floating
  const freeFloatingNodeIds: string[] = [];
  for (const node of document.nodes) {
    if (!reachableNodeIds.has(node.id)) {
      freeFloatingNodeIds.push(node.id);
    }
  }

  return {
    reachableNodeIds,
    freeFloatingNodeIds,
  };
}
