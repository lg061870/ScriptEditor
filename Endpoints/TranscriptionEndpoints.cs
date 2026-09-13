using ScriptEditor.Models.Schema;
using ScriptEditor.Transcription;

namespace ScriptEditor.Endpoints;

// json-to-csharp is now real (Phase 3.1, JsonToCSharpTranscriber).
// csharp-to-json is still the Phase 0.5 stub -- real parsing is Phase 3.2.

public sealed record JsonToCSharpResponse(string CSharp);

public sealed record CSharpToJsonRequest(string Code);

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
            // Stub: the real Phase 3.2 parser will walk the C# AST's
            // BuildWorkflow() Add(...) calls and reconstruct this document.
            var fixture = new DiagramDocumentV2
            {
                Nodes =
                [
                    new DiagramNodeV2
                    {
                        Id = "n1",
                        Type = "SimpleActivity",
                        Name = "greet",
                        X = 0,
                        Y = 0,
                        Ports =
                        [
                            new DiagramPortV2 { Id = "n1-in", Name = "Input", Direction = DiagramPortDirectionV2.Input, Role = DiagramPortRoleV2.Main, Type = "flow", Position = DiagramPortSideV2.Left },
                            new DiagramPortV2 { Id = "n1-out", Name = "Output", Direction = DiagramPortDirectionV2.Output, Role = DiagramPortRoleV2.Main, Type = "flow", Position = DiagramPortSideV2.Right }
                        ]
                    },
                    new DiagramNodeV2
                    {
                        Id = "n2",
                        Type = "EndActivity",
                        X = 260,
                        Y = 0,
                        Ports =
                        [
                            new DiagramPortV2 { Id = "n2-in", Name = "Input", Direction = DiagramPortDirectionV2.Input, Role = DiagramPortRoleV2.Main, Type = "flow", Position = DiagramPortSideV2.Left }
                        ]
                    }
                ],
                Edges =
                [
                    new DiagramEdgeV2
                    {
                        Id = "e1",
                        From = new DiagramEndpointV2 { Node = "n1", Port = "n1-out" },
                        To = new DiagramEndpointV2 { Node = "n2", Port = "n2-in" }
                    }
                ]
            };

            return Results.Ok(fixture);
        })
        .WithName("TranscribeCSharpToJson");
    }
}
