using ScriptEditor.Models.Schema;

namespace ScriptEditor.Endpoints;

// Phase 0.5 stub: both endpoints return a hardcoded fixture, ignoring the
// request body's actual content, matching this phase's acceptance criteria
// ("both returning a hardcoded fixture response"). Real Roslyn-backed
// transcription is Phase 3.1 (json-to-csharp) and Phase 3.2 (csharp-to-json).
//
// NOT COMPILED: no .NET SDK was available in the sandbox this was written in
// (network policy blocked the SDK download). Run `dotnet build` before
// relying on this file -- see docs/schema/diagram-schema-v2.md.

public sealed record JsonToCSharpResponse(string CSharp);

public sealed record CSharpToJsonRequest(string Code);

public static class TranscriptionEndpoints
{
    public static void MapTranscriptionEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/transcribe");

        group.MapPost("/json-to-csharp", (DiagramDocumentV2 document) =>
        {
            // Stub: the real Phase 3.1 transcriber will walk `document.Nodes`
            // in edge order and emit one Add(new XActivity(...)) per node.
            const string fixture = """
                public partial class MainConversation : TopicFlow
                {
                    protected override void BuildWorkflow()
                    {
                        Add(new SimpleActivity("greet"));
                        Add(new EndActivity());
                    }
                }
                """;

            return Results.Ok(new JsonToCSharpResponse(fixture));
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
