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

public static class TranscriptionEndpoints
{
    public static void MapTranscriptionEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/transcribe");

        group.MapPost("/json-to-csharp", (DiagramDocumentV2 document) =>
        {
            var csharp = JsonToCSharpTranscriber.Transcribe(document);
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

        group.MapPost("/run", (DiagramDocumentV2 document) =>
        {
            var result = WorkflowCompiler.CompileAndLoad(document);
            return Results.Ok(result);
        })
        .WithName("TranscribeAndRun");
    }
}
