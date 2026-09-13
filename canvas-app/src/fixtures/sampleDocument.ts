import type { DiagramDocument } from '../schema/diagram';

/**
 * Hardcoded fixture for Phase 1.1 -- proves the schema -> React Flow
 * mapping end to end. Same SimpleActivity -> EndActivity shape as the
 * Phase 0.5 transcription API's csharp-to-json stub fixture
 * (docs/api/transcription-api.md), so the two match once a real
 * transcriber replaces both stubs in Phase 3.
 */
export const sampleDocument: DiagramDocument = {
  viewport: { panX: 24, panY: 18, zoom: 1 },
  nodes: [
    {
      id: 'n1',
      type: 'SimpleActivity',
      name: 'greet',
      x: 0,
      y: 0,
      data: { message: 'Thanks for chatting! How can I help you today?' },
      ports: [
        { id: 'n1-in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' },
        { id: 'n1-out', name: 'Output', direction: 'output', role: 'main', type: 'flow', position: 'right' },
      ],
      context: { reads: [], writes: [] },
    },
    {
      id: 'n2',
      type: 'EndActivity',
      x: 260,
      y: 0,
      data: {},
      ports: [
        { id: 'n2-in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' },
      ],
      context: { reads: [], writes: [] },
    },
  ],
  edges: [
    { id: 'e1', from: { node: 'n1', port: 'n1-out' }, to: { node: 'n2', port: 'n2-in' } },
  ],
  cards: [],
  models: [],
};
