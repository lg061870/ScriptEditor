import { useState, useRef, useEffect, useCallback, type MouseEvent, type KeyboardEvent } from 'react';
import { useDiagramStore } from '../store/diagramStore';
import type { TopicDocument } from '../schema/diagram';

export interface TopicTabBarProps {
  nodeCount?: number;
  edgeCount?: number;
  hasPendingChanges?: boolean;
  isActivePanel?: boolean;
}

export function TopicTabBar({
  nodeCount = 0,
  edgeCount = 0,
  hasPendingChanges = false,
  isActivePanel = false,
}: TopicTabBarProps) {
  const topics = useDiagramStore((s) => s.topics);
  const activeTopicId = useDiagramStore((s) => s.activeTopicId);
  const selectTopic = useDiagramStore((s) => s.selectTopic);
  const addTopic = useDiagramStore((s) => s.addTopic);
  const renameTopic = useDiagramStore((s) => s.renameTopic);
  const deleteTopic = useDiagramStore((s) => s.deleteTopic);
  const duplicateTopic = useDiagramStore((s) => s.duplicateTopic);
  const setInitialTopic = useDiagramStore((s) => s.setInitialTopic);

  // Inline rename state
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>('');
  const editInputRef = useRef<HTMLInputElement | null>(null);

  // Context menu state
  const [menuTopic, setMenuTopic] = useState<{ topic: TopicDocument; x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (editingTopicId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTopicId]);

  useEffect(() => {
    function handleClickOutside(event: globalThis.MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuTopic(null);
      }
    }
    if (menuTopic) {
      window.addEventListener('mousedown', handleClickOutside);
      return () => window.removeEventListener('mousedown', handleClickOutside);
    }
  }, [menuTopic]);

  const handleStartRename = useCallback((topic: TopicDocument) => {
    setEditingTopicId(topic.id);
    setEditName(topic.name);
    setMenuTopic(null);
  }, []);

  const handleCommitRename = useCallback(() => {
    if (editingTopicId && editName.trim()) {
      renameTopic(editingTopicId, editName.trim());
    }
    setEditingTopicId(null);
  }, [editingTopicId, editName, renameTopic]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        handleCommitRename();
      } else if (e.key === 'Escape') {
        setEditingTopicId(null);
      }
    },
    [handleCommitRename],
  );

  const handleContextMenu = useCallback((e: MouseEvent, topic: TopicDocument) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuTopic({ topic, x: e.clientX, y: e.clientY });
  }, []);

  const handleAddTopic = useCallback(() => {
    const newId = addTopic();
    // Prompt rename or select
    const newTopic = useDiagramStore.getState().topics.find((t) => t.id === newId);
    if (newTopic) {
      setEditingTopicId(newTopic.id);
      setEditName(newTopic.name);
    }
  }, [addTopic]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 32,
        background: isActivePanel ? '#f0f1fa' : '#f8fafc',
        borderBottom: isActivePanel ? '1px solid #c7c9e5' : '1px solid #e5e7eb',
        paddingLeft: 4,
        paddingRight: 10,
        userSelect: 'none',
        fontSize: 12,
        fontFamily: 'Segoe UI, system-ui, -apple-system, sans-serif',
        transition: 'background 0.15s ease, border-color 0.15s ease',
      }}
      data-testid="canvas-document-header"
      data-topic-bar="true"
      data-active={isActivePanel ? 'true' : 'false'}
    >
      {/* Document tabs strip */}
      <div style={{ display: 'flex', alignItems: 'center', height: '100%', overflowX: 'auto', gap: 2 }}>
        {topics.map((topic) => {
          const isActive = topic.id === activeTopicId;
          const isEditing = topic.id === editingTopicId;

          return (
            <div
              key={topic.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => selectTopic(topic.id)}
              onDoubleClick={() => handleStartRename(topic)}
              onContextMenu={(e) => handleContextMenu(e, topic)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '0 10px',
                height: 32,
                cursor: 'pointer',
                background: isActive ? '#ffffff' : 'transparent',
                color: isActive ? '#1e1e24' : '#6b7280',
                fontWeight: isActive ? 600 : 400,
                borderTop: isActive ? '2px solid #6264a7' : '2px solid transparent',
                borderRight: '1px solid #e5e7eb',
                borderLeft: '1px solid transparent',
                borderBottom: isActive ? '1px solid #ffffff' : 'none',
                marginBottom: isActive ? -1 : 0,
                transition: 'background 0.1s, color 0.1s',
              }}
              title={
                topic.isInitial
                  ? `${topic.name} (Startup Topic) - Right-click for options, double-click to rename`
                  : `${topic.name} - Right-click for options, double-click to rename`
              }
              data-active={isActive ? 'true' : undefined}
            >
              {/* Initial topic badge */}
              {topic.isInitial ? (
                <span
                  style={{
                    fontSize: 11,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#6264a7',
                  }}
                  title="Startup Topic (Initial conversation entry point)"
                >
                  🏠
                </span>
              ) : (
                <span style={{ fontSize: 11, color: '#9ca3af' }}>📄</span>
              )}

              {/* Title / Inline Rename Input */}
              {isEditing ? (
                <input
                  ref={editInputRef}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={handleCommitRename}
                  onKeyDown={handleKeyDown}
                  style={{
                    width: Math.max(editName.length * 8, 80),
                    fontSize: 12,
                    padding: '1px 4px',
                    border: '1px solid #6264a7',
                    borderRadius: 2,
                    outline: 'none',
                    background: '#fff',
                    color: '#1e1e24',
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span style={{ whiteSpace: 'nowrap' }}>
                  {topic.name}
                  {topic.isDirty && <span style={{ color: '#6264a7', marginLeft: 2 }}>*</span>}
                </span>
              )}

              {/* Tab menu button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleContextMenu(e, topic);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#9ca3af',
                  cursor: 'pointer',
                  padding: '1px 2px',
                  borderRadius: 2,
                  fontSize: 10,
                  display: 'flex',
                  alignItems: 'center',
                  opacity: isActive ? 0.8 : 0.4,
                }}
                title="Topic options"
              >
                ▾
              </button>

              {/* Close button (allowed if > 1 topic exists) */}
              {topics.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteTopic(topic.id);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#9ca3af',
                    cursor: 'pointer',
                    padding: '0 2px',
                    fontSize: 13,
                    lineHeight: '13px',
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Close topic"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}

        {/* ＋ Add Topic button */}
        <button
          type="button"
          onClick={handleAddTopic}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 26,
            height: 26,
            background: 'transparent',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            color: '#6b7280',
            fontSize: 16,
            fontWeight: 500,
            transition: 'background 0.1s, color 0.1s',
          }}
          title="Add new topic (＋)"
        >
          ＋
        </button>
      </div>

      {/* Right-side status indicators */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#9ca3af', fontSize: 11 }}>
        <span>
          {nodeCount} {nodeCount === 1 ? 'node' : 'nodes'} · {edgeCount} {edgeCount === 1 ? 'edge' : 'edges'}
        </span>
        {hasPendingChanges ? (
          <span style={{ color: '#d97706', display: 'flex', alignItems: 'center', gap: 4 }}>● edited</span>
        ) : (
          <span style={{ color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}>✔ in sync</span>
        )}
      </div>

      {/* Context Menu Modal */}
      {menuTopic && (
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: menuTopic.y + 4,
            left: menuTopic.x,
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.12)',
            borderRadius: 4,
            zIndex: 9999,
            padding: '4px 0',
            minWidth: 170,
            fontSize: 12,
            fontFamily: 'Segoe UI, sans-serif',
          }}
        >
          <button
            type="button"
            onClick={() => {
              setInitialTopic(menuTopic.topic.id);
              setMenuTopic(null);
            }}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '6px 12px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: menuTopic.topic.isInitial ? '#6264a7' : '#1f2937',
              fontWeight: menuTopic.topic.isInitial ? 600 : 400,
            }}
          >
            <span>🏠</span>
            <span>{menuTopic.topic.isInitial ? 'Startup Topic (Current)' : 'Set as Startup Topic'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleStartRename(menuTopic.topic)}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '6px 12px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: '#1f2937',
            }}
          >
            <span>✎</span>
            <span>Rename Topic</span>
          </button>

          <button
            type="button"
            onClick={() => {
              duplicateTopic(menuTopic.topic.id);
              setMenuTopic(null);
            }}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '6px 12px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: '#1f2937',
            }}
          >
            <span>⎘</span>
            <span>Duplicate Topic</span>
          </button>

          {topics.length > 1 && (
            <>
              <div style={{ height: 1, background: '#f3f4f6', margin: '4px 0' }} />
              <button
                type="button"
                onClick={() => {
                  deleteTopic(menuTopic.topic.id);
                  setMenuTopic(null);
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 12px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  color: '#dc2626',
                }}
              >
                <span>✕</span>
                <span>Close Topic</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
