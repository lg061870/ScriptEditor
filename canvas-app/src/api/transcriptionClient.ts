import type { DiagramDocument } from '../schema/diagram';

/**
 * Phase 3.3: thin client for the two /api/transcribe endpoints
 * (Endpoints/TranscriptionEndpoints.cs). Default matches this project's
 * own Properties/launchSettings.json ("http" profile, port 5093) --
 * override with VITE_API_BASE_URL for a different backend port/host.
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5093';

export async function jsonToCSharp(document: DiagramDocument): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/transcribe/json-to-csharp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(document),
  });
  if (!response.ok) {
    throw new Error(`json-to-csharp failed: ${response.status} ${response.statusText}`);
  }
  const data: { cSharp: string } = await response.json();
  return data.cSharp;
}

export async function csharpToJson(code: string): Promise<DiagramDocument> {
  const response = await fetch(`${API_BASE_URL}/api/transcribe/csharp-to-json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) {
    throw new Error(`csharp-to-json failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}
