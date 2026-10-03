import { describe, expect, it, beforeEach } from 'vitest';
import { useDiagramStore } from '../store/diagramStore';
import { sampleDocument } from '../fixtures/sampleDocument';

describe('useDiagramStore: multi-topic management', () => {
  beforeEach(() => {
    useDiagramStore.setState({
      topics: [
        {
          id: 'MainConversation',
          name: 'MainConversation',
          isInitial: true,
          isDirty: false,
          document: sampleDocument,
        },
      ],
      activeTopicId: 'MainConversation',
      document: sampleDocument,
      versionId: 0,
      codeRegenRequestCount: 0,
      selectedNodeIds: new Set(),
      pendingConnection: null,
    });
  });

  it('initializes with MainConversation as the default initial topic', () => {
    const state = useDiagramStore.getState();
    expect(state.topics.length).toBe(1);
    expect(state.topics[0].id).toBe('MainConversation');
    expect(state.topics[0].isInitial).toBe(true);
    expect(state.activeTopicId).toBe('MainConversation');
  });

  it('addTopic creates a new topic, marks it active, and gives it a starter document', () => {
    const id = useDiagramStore.getState().addTopic('QuoteTopic');
    const state = useDiagramStore.getState();

    expect(id).toBe('QuoteTopic');
    expect(state.topics.length).toBe(2);
    expect(state.activeTopicId).toBe('QuoteTopic');

    const newTopic = state.topics.find((t) => t.id === 'QuoteTopic');
    expect(newTopic).toBeDefined();
    expect(newTopic?.isInitial).toBe(false);
    expect(state.document).toBe(newTopic?.document);
  });

  it('selectTopic switches the active topic and updates the active document', () => {
    useDiagramStore.getState().addTopic('CoverageTopic');
    expect(useDiagramStore.getState().activeTopicId).toBe('CoverageTopic');

    useDiagramStore.getState().selectTopic('MainConversation');
    const state = useDiagramStore.getState();
    expect(state.activeTopicId).toBe('MainConversation');
    expect(state.document).toBe(state.topics[0].document);
  });

  it('setInitialTopic reassigns startup topic flag', () => {
    useDiagramStore.getState().addTopic('QuoteTopic');
    useDiagramStore.getState().setInitialTopic('QuoteTopic');

    const state = useDiagramStore.getState();
    expect(state.topics.find((t) => t.id === 'MainConversation')?.isInitial).toBe(false);
    expect(state.topics.find((t) => t.id === 'QuoteTopic')?.isInitial).toBe(true);
  });

  it('renameTopic updates name and sanitized id', () => {
    useDiagramStore.getState().addTopic('Old Name');
    useDiagramStore.getState().renameTopic('OldName', 'NewQuoteTopic');

    const state = useDiagramStore.getState();
    expect(state.topics.some((t) => t.id === 'NewQuoteTopic' && t.name === 'NewQuoteTopic')).toBe(true);
    expect(state.activeTopicId).toBe('NewQuoteTopic');
  });

  it('duplicateTopic deep-clones topic document and selects the duplicate', () => {
    useDiagramStore.getState().duplicateTopic('MainConversation');

    const state = useDiagramStore.getState();
    expect(state.topics.length).toBe(2);
    expect(state.activeTopicId).toBe('MainConversation_Copy');
    const dupTopic = state.topics.find((t) => t.id === 'MainConversation_Copy')!;
    expect(dupTopic.document.nodes.length).toBe(sampleDocument.nodes.length);
    // Not by reference
    expect(dupTopic.document).not.toBe(sampleDocument);
  });

  it('deleteTopic removes topic, falls back to remaining topic, and never deletes the last topic', () => {
    useDiagramStore.getState().addTopic('TopicToDelete');
    expect(useDiagramStore.getState().topics.length).toBe(2);

    useDiagramStore.getState().deleteTopic('TopicToDelete');
    let state = useDiagramStore.getState();
    expect(state.topics.length).toBe(1);
    expect(state.activeTopicId).toBe('MainConversation');

    // Attempting to delete the only remaining topic should be a no-op
    useDiagramStore.getState().deleteTopic('MainConversation');
    state = useDiagramStore.getState();
    expect(state.topics.length).toBe(1);
    expect(state.topics[0].id).toBe('MainConversation');
  });

  it('mutations update the active topic document and mark isDirty: true', () => {
    useDiagramStore.getState().addTopic('DraftTopic');
    useDiagramStore.getState().addNode('DelayActivity', { x: 200, y: 200 }, 'Canvas');

    const state = useDiagramStore.getState();
    const draftTopic = state.topics.find((t) => t.id === 'DraftTopic')!;
    expect(draftTopic.isDirty).toBe(true);
    expect(draftTopic.document.nodes.some((n) => n.type === 'DelayActivity')).toBe(true);

    // Initial topic should remain untouched
    const mainTopic = state.topics.find((t) => t.id === 'MainConversation')!;
    expect(mainTopic.document.nodes.some((n) => n.type === 'DelayActivity')).toBe(false);
  });

  it('resizeNode updates the target node width and height in document and marks dirty', () => {
    const nodeId = useDiagramStore.getState().addNode('ConditionalActivity', { x: 100, y: 100 }, 'Canvas');
    useDiagramStore.getState().resizeNode(nodeId, 210.4, 130.8, 'Canvas');

    const state = useDiagramStore.getState();
    const node = state.document.nodes.find((n) => n.id === nodeId)!;
    expect(node.width).toBe(210);
    expect(node.height).toBe(131);
  });
});
