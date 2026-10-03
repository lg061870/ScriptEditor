import { describe, expect, it, beforeEach } from 'vitest';
import { useDiagramStore } from '../store/diagramStore';
import { sampleDocument } from '../fixtures/sampleDocument';

describe('useDiagramStore: local persistence and project storage actions', () => {
  beforeEach(() => {
    localStorage.clear();
    useDiagramStore.getState().resetToStarter();
  });

  it('initializes with default starter topic and null projectPath', () => {
    const state = useDiagramStore.getState();
    expect(state.topics.length).toBe(1);
    expect(state.activeTopicId).toBe('MainConversation');
    expect(state.projectPath).toBeNull();
  });

  it('setProjectPath updates projectPath in store', () => {
    useDiagramStore.getState().setProjectPath('C:\\MyProject\\Topics');
    expect(useDiagramStore.getState().projectPath).toBe('C:\\MyProject\\Topics');
  });

  it('markWorkspaceSaved clears isDirty flag on all topics and updates lastSavedAt', () => {
    useDiagramStore.getState().addTopic('DirtyTopic');
    useDiagramStore.getState().addNode('DelayActivity', { x: 0, y: 0 }, 'Canvas');

    expect(useDiagramStore.getState().topics.some((t) => t.isDirty)).toBe(true);

    useDiagramStore.getState().markWorkspaceSaved();

    expect(useDiagramStore.getState().topics.every((t) => !t.isDirty)).toBe(true);
    expect(useDiagramStore.getState().lastSavedAt).not.toBeNull();
  });

  it('resetToStarter clears all user-added topics and restores sample starter', () => {
    useDiagramStore.getState().addTopic('TempTopic1');
    useDiagramStore.getState().addTopic('TempTopic2');
    useDiagramStore.getState().setProjectPath('C:\\Temp\\Path');

    expect(useDiagramStore.getState().topics.length).toBe(3);

    useDiagramStore.getState().resetToStarter();

    const state = useDiagramStore.getState();
    expect(state.topics.length).toBe(1);
    expect(state.topics[0].id).toBe('MainConversation');
    expect(state.activeTopicId).toBe('MainConversation');
    expect(state.projectPath).toBeNull();
  });

  it('loadWorkspace replaces entire workspace with imported topics', () => {
    const customTopics = [
      {
        id: 'CustomTopic1',
        name: 'CustomTopic1',
        isInitial: true,
        document: sampleDocument,
      },
      {
        id: 'CustomTopic2',
        name: 'CustomTopic2',
        isInitial: false,
        document: sampleDocument,
      },
    ];

    useDiagramStore.getState().loadWorkspace(customTopics as any, 'CustomTopic2', 'C:\\Loaded\\Path');

    const state = useDiagramStore.getState();
    expect(state.topics.length).toBe(2);
    expect(state.activeTopicId).toBe('CustomTopic2');
    expect(state.projectPath).toBe('C:\\Loaded\\Path');
  });
});
