using ScriptEditor.Transcription;

namespace ScriptEditor.Tests;

/// <summary>
/// Phase 3.5's explicit acceptance criteria (CONCEPT_OF_OPERATIONS.md line
/// 333): "the Roslyn parser reports diagnostics ... but does not corrupt
/// or overwrite the valid JSON document state." These tests cover the
/// parser half of that: a real syntax error must throw (never silently
/// fall through to a wrong/partial document, since
/// CSharpSyntaxTree.ParseText itself never throws -- it's error-tolerant
/// by design), and the thrown exception must carry enough structured
/// diagnostic data (severity, message, a source line where one exists)
/// for the frontend to surface it without corrupting its own state. The
/// "does not overwrite the last-valid document" half is a frontend
/// behavior (CodePanel.tsx only calls replaceDocument on a successful
/// parse) and isn't re-verified here.
/// </summary>
public class SyntaxErrorHandlingTests
{
    [Fact]
    public void Parse_UnbalancedBrace_ThrowsWithAtLeastOneErrorDiagnostic()
    {
        const string brokenCode = """
            public partial class MainConversation : TopicFlow
            {
                public MainConversation(TopicWorkflowContext context, ILogger logger) : base(context, logger, "MainConversation")
                {
                    BuildWorkflow();
                }

                private void BuildWorkflow()
                {
                    Add(new SimpleActivity("n1", "hi"));
            }
            """;

        var ex = Assert.Throws<CSharpParseException>(() => CSharpToJsonParser.Parse(brokenCode));

        Assert.NotEmpty(ex.Diagnostics);
        Assert.All(ex.Diagnostics, d => Assert.Equal("Error", d.Severity));
    }

    [Fact]
    public void Parse_MissingSemicolon_ThrowsWithALineNumber()
    {
        const string brokenCode = """
            public partial class MainConversation : TopicFlow
            {
                public MainConversation(TopicWorkflowContext context, ILogger logger) : base(context, logger, "MainConversation")
                {
                    BuildWorkflow();
                }

                private void BuildWorkflow()
                {
                    Add(new SimpleActivity("n1", "hi"))
                }
            }
            """;

        var ex = Assert.Throws<CSharpParseException>(() => CSharpToJsonParser.Parse(brokenCode));

        Assert.NotEmpty(ex.Diagnostics);
        Assert.Contains(ex.Diagnostics, d => d.Line is not null);
    }

    [Fact]
    public void Parse_MissingBuildWorkflowMethod_ThrowsStructuredDiagnostic()
    {
        const string codeWithoutBuildWorkflow = """
            public partial class MainConversation : TopicFlow
            {
                public MainConversation(TopicWorkflowContext context, ILogger logger) : base(context, logger, "MainConversation")
                {
                }
            }
            """;

        var ex = Assert.Throws<CSharpParseException>(() => CSharpToJsonParser.Parse(codeWithoutBuildWorkflow));

        var diagnostic = Assert.Single(ex.Diagnostics);
        Assert.Equal("Error", diagnostic.Severity);
        Assert.Contains("BuildWorkflow", diagnostic.Message);
    }

    [Fact]
    public void Parse_ValidCode_DoesNotThrow()
    {
        const string validCode = """
            public partial class MainConversation : TopicFlow
            {
                public MainConversation(TopicWorkflowContext context, ILogger logger) : base(context, logger, "MainConversation")
                {
                    BuildWorkflow();
                }

                private void BuildWorkflow()
                {
                    Add(new SimpleActivity("n1", "hi"));
                }
            }
            """;

        var document = CSharpToJsonParser.Parse(validCode);

        Assert.Single(document.Nodes);
    }
}
