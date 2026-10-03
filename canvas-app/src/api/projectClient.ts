import { API_BASE_URL } from './transcriptionClient';
import type { DiagramDocument, TopicDocument } from '../schema/diagram';

export interface ProjectTopicPayload {
  id: string;
  name: string;
  document: DiagramDocument;
  isInitial: boolean;
  isDirty?: boolean;
}

export interface ProjectStatusResponse {
  exists: boolean;
  path: string;
  flowJsonCount: number;
  cSharpCount: number;
  discoveredTopics: string[];
  error?: string | null;
}

export interface ProjectSaveResponse {
  success: boolean;
  savedCount: number;
  savedFiles: string[];
  message: string;
}

export interface ProjectLoadResponse {
  success: boolean;
  topics: ProjectTopicPayload[];
  activeTopicId: string | null;
  message: string;
}

export async function getProjectStatus(path: string): Promise<ProjectStatusResponse> {
  const url = `${API_BASE_URL}/api/project/status?path=${encodeURIComponent(path)}`;
  const response = await fetch(url);
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to check project status: ${err || response.statusText}`);
  }
  return response.json();
}

export async function saveProject(
  projectPath: string,
  topics: TopicDocument[],
  saveInSubfolders = true,
): Promise<ProjectSaveResponse> {
  const payload = {
    projectPath,
    topics: topics.map((t) => ({
      id: t.id,
      name: t.name,
      document: t.document,
      isInitial: t.isInitial,
      isDirty: false,
    })),
    saveInSubfolders,
  };

  const response = await fetch(`${API_BASE_URL}/api/project/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Save project failed: ${err || response.statusText}`);
  }
  return response.json();
}

export async function loadProject(projectPath: string): Promise<ProjectLoadResponse> {
  const response = await fetch(`${API_BASE_URL}/api/project/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Load project failed: ${err || response.statusText}`);
  }
  return response.json();
}
