import type { DiagramDocument } from '../schema/diagram';

/**
 * Phase 3.3: thin client for the two /api/transcribe endpoints
 * (Endpoints/TranscriptionEndpoints.cs). Default matches this project's
 * own Properties/launchSettings.json ("http" profile, port 5093) --
 * override with VITE_API_BASE_URL for a different backend port/host.
 */
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  (typeof window !== 'undefined' && window.location.port !== '5173' && window.location.origin
    ? window.location.origin
    : 'http://localhost:5093');

/** Mirrors ScriptEditor.Transcription.ParseDiagnostic (Phase 3.5). */
export interface ParseDiagnostic {
  severity: string;
  message: string;
  line: number | null;
}

/**
 * Phase 3.5: thrown for a 400 from /csharp-to-json specifically, carrying
 * the structured diagnostics CSharpToJsonParser produced (real Roslyn
 * syntax errors, or a structural issue like a missing BuildWorkflow()) --
 * distinct from a network/5xx failure, which callers should treat as
 * "sync failed," not "here are diagnostics to show."
 */
export class CSharpParseError extends Error {
  diagnostics: ParseDiagnostic[];
  constructor(diagnostics: ParseDiagnostic[]) {
    super(diagnostics[0]?.message ?? 'C# parse error');
    this.name = 'CSharpParseError';
    this.diagnostics = diagnostics;
  }
}

export async function jsonToCSharp(document: DiagramDocument, className?: string): Promise<string> {
  const url = className
    ? `${API_BASE_URL}/api/transcribe/json-to-csharp?className=${encodeURIComponent(className)}`
    : `${API_BASE_URL}/api/transcribe/json-to-csharp`;
  const response = await fetch(url, {
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

/** Mirrors ScriptEditor.Transcription.CompileDiagnostic (Phase 3.4). */
export interface CompileDiagnostic {
  severity: string;
  message: string;
  line: number | null;
}

/** Mirrors ScriptEditor.Transcription.CompileResult (Phase 3.4). Returned
 * by /api/transcribe/run, the explicit "Run"/"Reset" action WorkflowCompiler.cs's
 * own doc comment describes -- real Roslyn CSharpCompilation.Emit + a
 * collectible AssemblyLoadContext load against the real ConversaCore.dll
 * reference, not a simulation. */
export interface CompileResult {
  success: boolean;
  diagnostics: CompileDiagnostic[];
  generatedTypeName: string | null;
  generatedCSharp: string;
}

export interface TopicRunItem {
  name: string;
  document: DiagramDocument;
  isInitial?: boolean;
}

export interface MultiTopicRunRequest {
  topics: TopicRunItem[];
  initialTopicName?: string;
  targetTopicName?: string;
}

export async function compileAndRun(
  documentOrRequest: DiagramDocument | MultiTopicRunRequest,
): Promise<CompileResult> {
  const isWorkspace = 'topics' in documentOrRequest;
  const url = isWorkspace
    ? `${API_BASE_URL}/api/transcribe/run-workspace`
    : `${API_BASE_URL}/api/transcribe/run`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(documentOrRequest),
  });
  if (!response.ok) {
    throw new Error(`run failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function csharpToJson(code: string): Promise<DiagramDocument> {
  const response = await fetch(`${API_BASE_URL}/api/transcribe/csharp-to-json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) {
    if (response.status === 400) {
      const body: { diagnostics: ParseDiagnostic[] } = await response.json();
      throw new CSharpParseError(body.diagnostics ?? []);
    }
    throw new Error(`csharp-to-json failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}
