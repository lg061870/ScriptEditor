(() => {
const normalizeMode = (mode) => String(mode ?? '').toLowerCase() === 'vertical' ? 'vertical' : 'horizontal';

function nodeSize(node) {
 const type = String(node?.type ?? '').toLowerCase();
 const collapsed = Boolean(node?.collapsed);
 if (collapsed) return { w: 230, h: 58 };

 let fallback;
 if (type === 'chat-input' || type === 'prompt') fallback = { w: 500, h: 260 };
 else if (type === 'language-model') fallback = { w: 380, h: 760 };
 else if (type === 'chat-output') fallback = { w: 370, h: 240 };
 else if (type === 'delay') fallback = { w: 290, h: 230 };
 else if (type === 'simple-activity') fallback = { w: 360, h: 390 };
 else if (type === 'repeat-activity') fallback = { w: 380, h: 430 };
 else if (type === 'composite-activity') fallback = { w: 380, h: 410 };
 else if (type === 'wait-for-user-input') fallback = { w: 360, h: 420 };
 else if (type === 'semantic-response') fallback = { w: 390, h: 420 };
 else if (type === 'prompt-activity') fallback = { w: 390, h: 470 };
 else if (type === 'adaptive-card-activity' || type === 'adaptive-card' || type === 'adaptivecardactivity') fallback = { w: 390, h: 470 };
 else if (type === 'conditional-quick-answer') fallback = { w: 390, h: 420 };
 else if (type === 'quick-answer') fallback = { w: 360, h: 430 };
 else if (type === 'conditional-trigger-topic') fallback = { w: 390, h: 430 };
 else if (type === 'trigger-topic') fallback = { w: 360, h: 320 };
 else if (type.endsWith('-activity')) fallback = { w: 390, h: 380 };
 else fallback = { w: 340, h: 220 };

 const width = Number(node?.width);
 const height = Number(node?.height);
 return {
  w: Number.isFinite(width) && width > 0 ? width : fallback.w,
  h: Number.isFinite(height) && height > 0 ? height : fallback.h
 };
}

function portToNodeMap(nodes) {
 const map = new Map();
 for (const node of nodes) {
  const ports = Array.isArray(node?.ports) ? node.ports : [];
  for (const port of ports) {
   const portId = String(port?.id ?? '').trim();
   if (!portId) continue;
   map.set(portId, String(node?.id ?? ''));
  }
 }
 return map;
}


function edgePort(endpoint) {
 if (endpoint == null) return '';
 if (typeof endpoint === 'string') return endpoint.trim();
 if (typeof endpoint === 'object') {
  const candidate = endpoint.port ?? endpoint.id;
  return typeof candidate === 'string' ? candidate.trim() : '';
 }
 return '';
}

function edgeNode(endpoint) {
 if (endpoint && typeof endpoint === 'object' && typeof endpoint.node === 'string') {
  return endpoint.node.trim();
 }
 return '';
}
function buildGraph(nodes, edges) {
 const nodeById = new Map();
 for (const node of nodes) {
  const nodeId = String(node?.id ?? '').trim();
  if (!nodeId) continue;
  nodeById.set(nodeId, node);
 }

 const adjacency = new Map();
 const reverse = new Map();
 const indegree = new Map();
 const outdegree = new Map();
 for (const nodeId of nodeById.keys()) {
  adjacency.set(nodeId, new Set());
  reverse.set(nodeId, new Set());
  indegree.set(nodeId, 0);
  outdegree.set(nodeId, 0);
 }

 const portMap = portToNodeMap(nodes);
 for (const edge of edges) {
  const fromPort = edgePort(edge?.from ?? null);
  const toPort = edgePort(edge?.to ?? null);
  if (!toPort) continue;

  const fromNode = String(edge?.fromNode ?? edgeNode(edge?.from ?? null) ?? portMap.get(fromPort) ?? '').trim();
  const toNode = String(edge?.toNode ?? edgeNode(edge?.to ?? null) ?? portMap.get(toPort) ?? '').trim();
  if (!nodeById.has(fromNode) || !nodeById.has(toNode) || fromNode === toNode) continue;

  const nexts = adjacency.get(fromNode);
  if (!nexts || nexts.has(toNode)) continue;

  nexts.add(toNode);
  reverse.get(toNode)?.add(fromNode);
  indegree.set(toNode, (indegree.get(toNode) ?? 0) + 1);
  outdegree.set(fromNode, (outdegree.get(fromNode) ?? 0) + 1);
 }

 return { nodeById, adjacency, reverse, indegree, outdegree };
}

function layeredOrder(nodes, graph) {
 const ids = Array.from(graph.nodeById.keys());
 const indegree = new Map(graph.indegree);
 const layer = new Map();

 const entries = ids
  .filter((id) => (indegree.get(id) ?? 0) === 0)
  .sort((a, b) => a.localeCompare(b));

 const queue = [...entries];
 if (queue.length === 0 && ids.length > 0) {
  queue.push(ids.slice().sort((a, b) => a.localeCompare(b))[0]);
 }

 const processed = new Set();
 while (queue.length > 0) {
  const id = queue.shift();
  if (!id || processed.has(id)) continue;

  processed.add(id);
  const currentLayer = layer.get(id) ?? 0;

  const nexts = graph.adjacency.get(id);
  if (!nexts) continue;

  for (const nextId of nexts) {
   layer.set(nextId, Math.max(layer.get(nextId) ?? 0, currentLayer + 1));
   indegree.set(nextId, (indegree.get(nextId) ?? 0) - 1);
   if ((indegree.get(nextId) ?? 0) <= 0) {
    queue.push(nextId);
   }
  }
 }

 let maxLayer = Math.max(0, ...Array.from(layer.values()));
 const leftovers = ids.filter((id) => !processed.has(id)).sort((a, b) => a.localeCompare(b));
 for (const id of leftovers) {
  const preds = graph.reverse.get(id) ?? new Set();
  let candidate = -1;
  for (const pred of preds) {
   candidate = Math.max(candidate, layer.get(pred) ?? 0);
  }

  if (candidate >= 0) {
   layer.set(id, candidate + 1);
   maxLayer = Math.max(maxLayer, candidate + 1);
  } else {
   maxLayer += 1;
   layer.set(id, maxLayer);
  }
 }

 const groups = new Map();
 for (const node of nodes) {
  const id = String(node?.id ?? '');
  const key = layer.get(id) ?? 0;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(node);
 }

 for (const group of groups.values()) {
  group.sort((a, b) => {
   const ay = Number.isFinite(a?.y) ? a.y : 0;
   const by = Number.isFinite(b?.y) ? b.y : 0;
   if (ay !== by) return ay - by;
   return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
  });
 }

 return groups;
}

function placeHorizontal(groups) {
 const startX = 96;
 const startY = 84;
 const rowGap = 72;
 const colGap = 140;

 let xCursor = startX;
 const layerKeys = Array.from(groups.keys()).sort((a, b) => a - b);
 for (const key of layerKeys) {
  const nodes = groups.get(key) ?? [];
  let yCursor = startY;
  let layerWidth = 0;

  for (const node of nodes) {
   const size = nodeSize(node);
   node.x = Math.round(xCursor);
   node.y = Math.round(yCursor);
   yCursor += size.h + rowGap;
   layerWidth = Math.max(layerWidth, size.w);
  }

  xCursor += layerWidth + colGap;
 }
}

function placeVertical(groups) {
 const startX = 96;
 const startY = 84;
 const colGap = 72;
 const rowGap = 140;

 let yCursor = startY;
 const layerKeys = Array.from(groups.keys()).sort((a, b) => a - b);
 for (const key of layerKeys) {
  const nodes = groups.get(key) ?? [];
  let xCursor = startX;
  let layerHeight = 0;

  for (const node of nodes) {
   const size = nodeSize(node);
   node.x = Math.round(xCursor);
   node.y = Math.round(yCursor);
   xCursor += size.w + colGap;
   layerHeight = Math.max(layerHeight, size.h);
  }

  yCursor += layerHeight + rowGap;
 }
}

function arrangeDocument(rawDoc, mode) {
 if (!rawDoc || typeof rawDoc !== 'object') return rawDoc;

 const doc = rawDoc;
 const nodes = Array.isArray(doc.nodes) ? doc.nodes : [];
 const edges = Array.isArray(doc.edges) ? doc.edges : [];
 if (nodes.length === 0) return doc;

 const graph = buildGraph(nodes, edges);
 const groups = layeredOrder(nodes, graph);

 if (normalizeMode(mode) === 'vertical') {
  placeVertical(groups);
 } else {
  placeHorizontal(groups);
 }

 return doc;
}

window.scriptEditorLayout = window.scriptEditorLayout || {};
window.scriptEditorLayout.arrangeDocument = arrangeDocument;
})();






