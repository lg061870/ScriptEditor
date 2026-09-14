using ScriptEditor.Models.Schema;
using ScriptEditor.Transcription;

namespace ScriptEditor.Tests;

/// <summary>
/// WorkflowCompiler.CompileAndLoad had no direct test coverage before this
/// -- it was built in #23 (Phase 3.4) but never exercised outside manual
/// verification, and #41 (Phase 6.2) is the first caller to wire it to an
/// actual endpoint/button. Covers the two outcomes a real "Run" click can
/// hit: a document that compiles against the real ConversaCore.dll
/// reference, and one that doesn't (BuildGenericFallback emitting
/// `new {type}(...)` for a type string with no matching real class --
/// exactly the class of bug the #38 drift pass found and fixed for
/// PromptAttentionActivity/SemanticResponse/WaitForUserInput).
/// </summary>
public class WorkflowCompilerTests
{
    [Fact]
    public void CompileAndLoad_VerifiedCompilableTypes_Succeeds()
    {
        var document = new DiagramDocumentV2
        {
            Nodes =
            [
                MakeNode("n1", "Welcome", "SimpleActivity", new() { ["message"] = "Hi there!" }),
                MakeNode("n2", "Bye", "EndActivity", new() { ["endMessage"] = "Goodbye!" }),
            ],
            Edges =
            [
                new DiagramEdgeV2
                {
                    Id = "e1",
                    From = new DiagramEndpointV2 { Node = "n1", Port = "n1-out" },
                    To = new DiagramEndpointV2 { Node = "n2", Port = "n2-in" },
                },
            ],
        };

        var result = WorkflowCompiler.CompileAndLoad(document);

        Assert.True(result.Success, string.Join("; ", result.Diagnostics.Select(d => d.Message)));
        Assert.Equal("ScriptEditor.Generated.MainConversation", result.GeneratedTypeName);
        Assert.DoesNotContain(result.Diagnostics, d => d.Severity == "Error");
    }

    [Fact]
    public void CompileAndLoad_TypeStringWithNoMatchingRealClass_FailsWithDiagnostics()
    {
        // Mirrors exactly the bug #38 found and fixed for real catalog
        // entries: BuildGenericFallback uses the type string as a literal
        // C# class name, so a type with no matching class is a guaranteed
        // compile error (CS0246), not a warning or a silent no-op.
        var document = new DiagramDocumentV2
        {
            Nodes = [MakeNode("n1", "Bogus", "ThisActivityTypeDoesNotExistAnywhere", new())],
            Edges = [],
        };

        var result = WorkflowCompiler.CompileAndLoad(document);

        Assert.False(result.Success);
        Assert.Contains(result.Diagnostics, d => d.Severity == "Error");
        Assert.Null(result.GeneratedTypeName);
    }

    [Fact]
    public void CompileAndLoad_CalledTwiceInARow_DoesNotThrow()
    {
        // Matches CONCEPT_OF_OPERATIONS.md line 51's "Reset" semantics
        // (WorkflowCompiler.cs's own doc comment): each Run/Reset unloads
        // the previous generated assembly. A real "Run" button can be
        // clicked repeatedly against an unchanged or edited document --
        // this is the regression check that the collectible
        // AssemblyLoadContext lifecycle survives that.
        var document = new DiagramDocumentV2
        {
            Nodes = [MakeNode("n1", "Welcome", "SimpleActivity", new() { ["message"] = "Hi" })],
            Edges = [],
        };

        var first = WorkflowCompiler.CompileAndLoad(document);
        var second = WorkflowCompiler.CompileAndLoad(document);

        Assert.True(first.Success);
        Assert.True(second.Success);
    }

    private static DiagramNodeV2 MakeNode(string id, string name, string type, Dictionary<string, string> data) => new()
    {
        Id = id,
        Name = name,
        Type = type,
        Data = data,
        Ports =
        [
            new DiagramPortV2 { Id = $"{id}-in", Name = "Input", Direction = DiagramPortDirectionV2.Input, Role = DiagramPortRoleV2.Main, Type = "flow", Position = DiagramPortSideV2.Left },
            new DiagramPortV2 { Id = $"{id}-out", Name = "Output", Direction = DiagramPortDirectionV2.Output, Role = DiagramPortRoleV2.Main, Type = "flow", Position = DiagramPortSideV2.Right },
        ],
    };
}
