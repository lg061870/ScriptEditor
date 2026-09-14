using ScriptEditor.Models.Schema;
using ScriptEditor.Transcription;

namespace ScriptEditor.Endpoints;

/// <summary>Phase 3.4: the heavy "Run"/"Reset" action -- real Roslyn
/// CSharpCompilation.Emit + assembly load, gated behind an explicit call,
/// never triggered by Phase 3.3's instant text-level sync.</summary>
public sealed record RunResponse(bool Success, List<CompileDiagnostic> Diagnostics, string? GeneratedTypeName, string GeneratedCSharp);

public static class WorkflowEndpoints
{
    public static void MapWorkflowEndpoints(this WebApplication app)
    {
        app.MapPost("/api/workflow/run", (DiagramDocumentV2 document) =>
        {
            var result = WorkflowCompiler.CompileAndLoad(document);
            return Results.Ok(new RunResponse(result.Success, result.Diagnostics, result.GeneratedTypeName, result.GeneratedCSharp));
        })
        .WithName("RunWorkflow");
    }
}
