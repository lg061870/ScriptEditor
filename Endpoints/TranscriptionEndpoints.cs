using ScriptEditor.Models.Schema;
using ScriptEditor.Transcription;

namespace ScriptEditor.Endpoints;

// Both directions are real: json-to-csharp (Phase 3.1, JsonToCSharpTranscriber)
// and csharp-to-json (Phase 3.2, CSharpToJsonParser).

public sealed record JsonToCSharpResponse(string CSharp);

public sealed record CSharpToJsonRequest(string Code);

public sealed record CSharpToJsonErrorResponse(string Error);

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
            catch (FormatException ex)
            {
                // Real Phase 3.5 (syntax-error surfacing without corrupting
                // the last-valid document) belongs on the frontend, which
                // must keep its own last-good state and only apply a
                // successful parse -- this 400 is what makes that possible.
                return Results.BadRequest(new CSharpToJsonErrorResponse(ex.Message));
            }
        })
        .WithName("TranscribeCSharpToJson");
    }
}
