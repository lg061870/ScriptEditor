import { useState, useEffect, useRef } from 'react';
import { useDiagramStore } from '../store/diagramStore';
import { getProjectStatus, saveProject, loadProject, type ProjectStatusResponse } from '../api/projectClient';

export interface ProjectStorageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProjectStorageModal({ isOpen, onClose }: ProjectStorageModalProps) {
  const topics = useDiagramStore((s) => s.topics);
  const activeTopicId = useDiagramStore((s) => s.activeTopicId);
  const projectPath = useDiagramStore((s) => s.projectPath);
  const lastSavedAt = useDiagramStore((s) => s.lastSavedAt);
  const setProjectPath = useDiagramStore((s) => s.setProjectPath);
  const resetToStarter = useDiagramStore((s) => s.resetToStarter);
  const loadWorkspace = useDiagramStore((s) => s.loadWorkspace);
  const markWorkspaceSaved = useDiagramStore((s) => s.markWorkspaceSaved);

  const [inputPath, setInputPath] = useState(projectPath || '');
  const [inspectStatus, setInspectStatus] = useState<ProjectStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (projectPath) {
      setInputPath(projectPath);
      handleInspectPath(projectPath);
    }
  }, [projectPath]);

  if (!isOpen) return null;

  async function handleInspectPath(pathToInspect: string) {
    const trimmed = pathToInspect.trim();
    if (!trimmed) {
      setInspectStatus(null);
      return;
    }
    setIsLoading(true);
    setMessage(null);
    try {
      const res = await getProjectStatus(trimmed);
      setInspectStatus(res);
      setProjectPath(trimmed);
    } catch (err: any) {
      setInspectStatus(null);
      setMessage({ text: err.message || 'Failed to inspect path', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSaveToProject() {
    const trimmed = inputPath.trim();
    if (!trimmed) {
      setMessage({ text: 'Please enter a target project directory.', type: 'error' });
      return;
    }
    setIsLoading(true);
    setMessage(null);
    try {
      const res = await saveProject(trimmed, topics, true);
      markWorkspaceSaved();
      setProjectPath(trimmed);
      setMessage({
        text: `${res.message} (${res.savedFiles.length} files written)`,
        type: 'success',
      });
      handleInspectPath(trimmed);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to save to project', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLoadFromProject() {
    const trimmed = inputPath.trim();
    if (!trimmed) {
      setMessage({ text: 'Please enter a project directory to load from.', type: 'error' });
      return;
    }
    if (!confirm('Loading topics from the project folder will replace your current workspace. Proceed?')) {
      return;
    }
    setIsLoading(true);
    setMessage(null);
    try {
      const res = await loadProject(trimmed);
      if (res.topics && res.topics.length > 0) {
        loadWorkspace(res.topics as any, res.activeTopicId || undefined, trimmed);
        markWorkspaceSaved();
        setMessage({ text: res.message, type: 'success' });
        handleInspectPath(trimmed);
      } else {
        setMessage({ text: 'No topic files (.flow.json or .cs) found in directory.', type: 'info' });
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to load from project', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  }

  function handleExportJson() {
    const workspace = {
      topics,
      activeTopicId,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(workspace, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversa-workspace-${Date.now().toString(36)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ text: 'Exported workspace JSON successfully.', type: 'success' });
  }

  function handleImportJsonClick() {
    fileInputRef.current?.click();
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (parsed.topics && Array.isArray(parsed.topics)) {
          loadWorkspace(parsed.topics, parsed.activeTopicId);
          setMessage({ text: `Imported ${parsed.topics.length} topic(s) from JSON.`, type: 'success' });
        } else {
          setMessage({ text: 'Invalid workspace JSON format: missing topics array.', type: 'error' });
        }
      } catch (err: any) {
        setMessage({ text: `Failed to parse JSON file: ${err.message}`, type: 'error' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function handleResetDraft() {
    if (confirm('Are you sure you want to reset the entire workspace to the default starter sample? All uncommitted local drafts will be cleared.')) {
      resetToStarter();
      setMessage({ text: 'Reset workspace to default starter sample.', type: 'info' });
    }
  }

  return (
    <div
      data-testid="project-storage-modal"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        fontFamily: 'Segoe UI, system-ui, -apple-system, sans-serif',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 620,
          maxHeight: '90vh',
          background: '#ffffff',
          borderRadius: 8,
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #e5e7eb',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#f8fafc',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>💾</span>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#1e293b' }}>
              Workspace & Project Storage
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 18,
              cursor: 'pointer',
              color: '#64748b',
              padding: '2px 6px',
              borderRadius: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Notification Message */}
          {message && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background:
                  message.type === 'success' ? '#f0fdf4' : message.type === 'error' ? '#fef2f2' : '#f0f9ff',
                color:
                  message.type === 'success' ? '#166534' : message.type === 'error' ? '#991b1b' : '#075985',
                border:
                  message.type === 'success'
                    ? '1px solid #bbf7d0'
                    : message.type === 'error'
                    ? '1px solid #fecaca'
                    : '1px solid #bae6fd',
              }}
            >
              <span>{message.type === 'success' ? '✓' : message.type === 'error' ? '⚠' : 'ℹ'}</span>
              <span>{message.text}</span>
            </div>
          )}

          {/* Section 1: Local Storage Autosave Status */}
          <div
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              padding: 14,
              background: '#f8fafc',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }}></span>
                <strong style={{ fontSize: 13, color: '#0f172a' }}>Local Storage Autosave: Active</strong>
              </div>
              <span style={{ fontSize: 11, color: '#64748b' }}>
                {lastSavedAt ? `Saved at ${lastSavedAt}` : 'Continuous buffer'}
              </span>
            </div>
            <p style={{ margin: '0 0 10px 0', fontSize: 12, color: '#475569', lineHeight: 1.4 }}>
              Your workspace ({topics.length} topic{topics.length > 1 ? 's' : ''}) is automatically preserved in your browser's local storage and survives page refreshes and browser restarts.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={handleExportJson}
                style={{
                  padding: '5px 12px',
                  borderRadius: 4,
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontWeight: 500,
                  color: '#334155',
                }}
              >
                📤 Export JSON
              </button>
              <button
                type="button"
                onClick={handleImportJsonClick}
                style={{
                  padding: '5px 12px',
                  borderRadius: 4,
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontWeight: 500,
                  color: '#334155',
                }}
              >
                📥 Import JSON
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={handleFileSelected}
              />
              <button
                type="button"
                onClick={handleResetDraft}
                style={{
                  padding: '5px 12px',
                  borderRadius: 4,
                  border: '1px solid #fecaca',
                  background: '#fff',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontWeight: 500,
                  color: '#dc2626',
                  marginLeft: 'auto',
                }}
              >
                🔄 Reset to Starter
              </button>
            </div>
          </div>

          {/* Section 2: Project Folder Binding */}
          <div
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              padding: 14,
              background: '#ffffff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <strong style={{ fontSize: 13, color: '#0f172a' }}>Target Project Folder (C# Code + Flow JSON)</strong>
              {projectPath && (
                <button
                  type="button"
                  onClick={() => {
                    setProjectPath(null);
                    setInputPath('');
                    setInspectStatus(null);
                    setMessage({ text: 'Disconnected from project folder. Operating in Scratchpad mode.', type: 'info' });
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    fontSize: 11,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Unlink Folder
                </button>
              )}
            </div>
            <p style={{ margin: '0 0 10px 0', fontSize: 12, color: '#475569', lineHeight: 1.4 }}>
              Point to a folder in your solution (e.g. <code>InsuranceAgent/Topics</code>) to save generated <code>.cs</code> files and companion <code>.flow.json</code> diagrams directly to disk.
            </p>

            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input
                type="text"
                value={inputPath}
                onChange={(e) => setInputPath(e.target.value)}
                placeholder="e.g. C:\Users\...\InsuranceAgent\Topics"
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  borderRadius: 4,
                  border: '1px solid #cbd5e1',
                  fontSize: 12,
                  fontFamily: 'Consolas, monospace',
                }}
              />
              <button
                type="button"
                onClick={() => handleInspectPath(inputPath)}
                disabled={isLoading || !inputPath.trim()}
                style={{
                  padding: '6px 12px',
                  borderRadius: 4,
                  border: '1px solid #cbd5e1',
                  background: '#f1f5f9',
                  fontSize: 12,
                  cursor: isLoading ? 'default' : 'pointer',
                  fontWeight: 500,
                  color: '#334155',
                }}
              >
                Inspect
              </button>
            </div>

            {/* Folder inspection info */}
            {inspectStatus && (
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 4,
                  padding: '8px 10px',
                  fontSize: 11,
                  color: '#334155',
                  marginBottom: 10,
                }}
              >
                {inspectStatus.exists ? (
                  <div>
                    <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ Directory exists.</span> Found{' '}
                    <strong>{inspectStatus.flowJsonCount}</strong> .flow.json and{' '}
                    <strong>{inspectStatus.cSharpCount}</strong> C# topic file(s).
                    {inspectStatus.discoveredTopics.length > 0 && (
                      <div style={{ marginTop: 4, color: '#64748b' }}>
                        Topics: {inspectStatus.discoveredTopics.slice(0, 6).join(', ')}
                        {inspectStatus.discoveredTopics.length > 6 ? ` (+${inspectStatus.discoveredTopics.length - 6} more)` : ''}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ color: '#d97706' }}>
                    ⚠ Directory does not exist yet. It will be created when you click "Save to Project".
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={handleSaveToProject}
                disabled={isLoading || !inputPath.trim()}
                data-testid="modal-save-to-project-btn"
                style={{
                  flex: 1,
                  padding: '8px 14px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#2563eb',
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: isLoading || !inputPath.trim() ? 'default' : 'pointer',
                  opacity: isLoading || !inputPath.trim() ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                💾 Save Topics to Project
              </button>

              <button
                type="button"
                onClick={handleLoadFromProject}
                disabled={isLoading || !inputPath.trim() || !inspectStatus?.exists}
                data-testid="modal-load-from-project-btn"
                style={{
                  flex: 1,
                  padding: '8px 14px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#334155',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: isLoading || !inputPath.trim() || !inspectStatus?.exists ? 'default' : 'pointer',
                  opacity: isLoading || !inputPath.trim() || !inspectStatus?.exists ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                📂 Load Topics from Project
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'flex-end',
            background: '#f8fafc',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 16px',
              borderRadius: 4,
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              color: '#334155',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
