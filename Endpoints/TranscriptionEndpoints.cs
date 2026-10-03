using ScriptEditor.Models.Schema;
using ScriptEditor.Transcription;

namespace ScriptEditor.Endpoints;

// json-to-csharp (Phase 3.1, JsonToCSharpTranscriber), csharp-to-json
// (Phase 3.2, CSharpToJsonParser), and run (Phase 6.2, WorkflowCompiler --
// the "explicit Run/Reset action" WorkflowCompiler.cs's own doc comment
// already described; #23 built the compile+load mechanism itself but
// deliberately left wiring an actual endpoint/button to it for this
// phase, per #23's own acceptance criteria only covering the mechanism).

public sealed record JsonToCSharpResponse(string CSharp);

public sealed record CSharpToJsonRequest(string Code);

public sealed record CSharpToJsonErrorResponse(List<ParseDiagnostic> Diagnostics);

public sealed record TopicRunItem(string Name, DiagramDocumentV2 Document, bool IsInitial = false);

public sealed record MultiTopicRunRequest(
    List<TopicRunItem> Topics,
    string? InitialTopicName = null,
    string? TargetTopicName = null
);

public static class TranscriptionEndpoints
{
    public static void MapTranscriptionEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/transcribe");

        group.MapPost("/json-to-csharp", (DiagramDocumentV2 document, string? className) =>
        {
            var cleanName = !string.IsNullOrWhiteSpace(className) ? className.Trim() : "MainConversation";
            var csharp = JsonToCSharpTranscriber.Transcribe(document, cleanName);
            return Results.Ok(new JsonToCSharpResponse(csharp));
        })
        .WithName("TranscribeJsonToCSharp");

        group.MapPost("/csharp-to-json", (CSharpToJsonRequest request) =>
        {
            try
            {
                var document = CSharpToJsonParser.Parse(request.Code);
                return Results.Ok(document);
            }
            catch (CSharpParseException ex)
            {
                // Phase 3.5: structured diagnostics (severity/message/line),
                // not just a string -- the frontend surfaces these in the
                // code editor gutter and, critically, never applies them to
                // the JSON store, so the last-valid document survives a
                // syntax error untouched (CONCEPT_OF_OPERATIONS.md line 333).
                return Results.BadRequest(new CSharpToJsonErrorResponse(ex.Diagnostics));
            }
        })
        .WithName("TranscribeCSharpToJson");

        group.MapPost("/run", (DiagramDocumentV2 document, string? className, ScriptEditor.Runtime.DynamicTopicCatalog catalog) =>
        {
            var cleanName = !string.IsNullOrWhiteSpace(className) ? className.Trim() : "MainConversation";
            var result = WorkflowCompiler.CompileAndLoad(document, cleanName);
            if (result.Success && result.CompiledType != null)
            {
                catalog.SetWorkflowType(result.CompiledType);
            }
            return Results.Ok(new
            {
                result.Success,
                result.Diagnostics,
                result.GeneratedTypeName,
                result.GeneratedCSharp
            });
        })
        .WithName("TranscribeAndRun");

        group.MapPost("/run-workspace", (MultiTopicRunRequest request, ScriptEditor.Runtime.DynamicTopicCatalog catalog) =>
        {
            var inputs = request.Topics.Select(t => new WorkspaceTopicInput(t.Name, t.Document));
            var targetName = !string.IsNullOrWhiteSpace(request.TargetTopicName)
                ? request.TargetTopicName
                : request.InitialTopicName;
            var result = WorkflowCompiler.CompileAndLoadWorkspace(inputs, targetName);
            if (result.Success && result.CompiledTypes.Count > 0)
            {
                catalog.SetWorkflowTypes(result.CompiledTypes, targetName);
            }
            return Results.Ok(new
            {
                result.Success,
                result.Diagnostics,
                GeneratedTypeName = result.TargetTypeName,
                GeneratedCSharp = result.CombinedCSharp
            });
        })
        .WithName("TranscribeAndRunWorkspace");
    }
}
