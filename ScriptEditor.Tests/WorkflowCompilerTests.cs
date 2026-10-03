using ConversaCore.Registration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
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

    [Fact]
    public void CompileAndLoad_AdaptiveCardActivity_WithRequiredToggle_Succeeds()
    {
        var document = new DiagramDocumentV2
        {
            Nodes =
            [
                MakeNode("card1", "ContactInfo", "AdaptiveCardActivity", new()
                {
                    ["submissionContextKey"] = "contact_info_submission",
                    ["required"] = "true",
                }),
            ],
            Edges = [],
        };

        var result = WorkflowCompiler.CompileAndLoad(document);

        Assert.True(result.Success, string.Join("; ", result.Diagnostics.Select(d => d.Message)));
        Assert.Contains("IsRequired = true", result.GeneratedCSharp);
        Assert.Contains("class ContactInfoModel : BaseCardModel", result.GeneratedCSharp);
    }

    [Fact]
    public void CompileAndLoad_PublishHostNotificationActivity_WithScaffoldedFactory_Succeeds()
    {
        var document = new DiagramDocumentV2
        {
            Nodes =
            [
                MakeNode("notify1", "LeadDetailsStarted", "PublishHostNotificationActivity", new()
                {
                    ["eventName"] = "lead_details_started",
                }),
            ],
            Edges = [],
        };

        var result = WorkflowCompiler.CompileAndLoad(document);

        Assert.True(result.Success, string.Join("; ", result.Diagnostics.Select(d => d.Message)));
        Assert.Contains("CreateLeadDetailsStartedPayload", result.GeneratedCSharp);
        Assert.Contains("throw new NotImplementedException", result.GeneratedCSharp);
    }

    [Fact]
    public void CompileAndLoad_InvokeToolActivity_WithScaffoldedToolAndRequest_Succeeds()
    {
        var document = new DiagramDocumentV2
        {
            Nodes =
            [
                MakeNode("tool1", "LeadScoring", "InvokeToolActivity", new()
                {
                    ["toolId"] = "LeadScoringTool",
                    ["resultContextKey"] = "lead_score_result",
                }),
            ],
            Edges = [],
        };

        var result = WorkflowCompiler.CompileAndLoad(document);

        Assert.True(result.Success, string.Join("; ", result.Diagnostics.Select(d => d.Message)));
        Assert.Contains("CreateLeadScoringRequest", result.GeneratedCSharp);
        Assert.Contains("CreateLeadScoringExecutionContext", result.GeneratedCSharp);
        Assert.Contains("throw new NotImplementedException", result.GeneratedCSharp);
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

    [Fact]
    public async Task CompileAndLoad_RegistersInDynamicCatalog_AndExecutesInConversationRuntime()
    {
        var document = new DiagramDocumentV2
        {
            Nodes =
            [
                MakeNode("n1", "Welcome", "SimpleActivity", new() { ["message"] = "Live ConversaCore Test" }),
                MakeNode("n2", "Bye", "EndActivity", new() { ["endMessage"] = "Done!" }),
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
        Assert.True(result.Success);
        Assert.NotNull(result.CompiledType);

        var catalog = new ScriptEditor.Runtime.DynamicTopicCatalog();
        catalog.SetWorkflowType(result.CompiledType);

        var services = new Microsoft.Extensions.DependencyInjection.ServiceCollection();
        services.AddLogging();
        services.AddScoped<ConversaCore.Context.IConversationContext>(_ =>
            new ConversaCore.Context.ConversationContext(
                Guid.NewGuid().ToString("N"), "test-user", Microsoft.Extensions.Logging.Abstractions.NullLogger<ConversaCore.Context.ConversationContext>.Instance));
        services.AddSingleton(catalog);
        services.AddSingleton<ConversaCore.Runtime.ITopicCatalog>(sp => sp.GetRequiredService<ScriptEditor.Runtime.DynamicTopicCatalog>());

        new ConversaCore.Registration.ConversaCoreBuilder(services)
            .AddConversationRuntime("editor.current");

        await using var provider = services.BuildServiceProvider();
        await using var scope = provider.CreateAsyncScope();
        var runtime = scope.ServiceProvider.GetRequiredService<ConversaCore.Runtime.IConversationRuntime>();

        // Starting the runtime activates the compiled workflow
        await runtime.StartAsync();
        Assert.NotNull(runtime.ConversationId);
    }

    [Fact]
    public void CompileAndLoadWorkspace_MultipleTopics_CompilesAllTypesAndResolvesTarget()
    {
        var mainDoc = new DiagramDocumentV2
        {
            Nodes = [MakeNode("n1", "Welcome", "SimpleActivity", new() { ["message"] = "Hello from Main" })],
            Edges = [],
        };
        var quoteDoc = new DiagramDocumentV2
        {
            Nodes = [MakeNode("q1", "QuoteInfo", "SimpleActivity", new() { ["message"] = "Quote price: $100" })],
            Edges = [],
        };

        var topics = new List<WorkspaceTopicInput>
        {
            new("MainConversation", mainDoc),
            new("QuoteTopic", quoteDoc),
        };

        var result = WorkflowCompiler.CompileAndLoadWorkspace(topics, targetTopicName: "QuoteTopic");

        Assert.True(result.Success, string.Join("; ", result.Diagnostics.Select(d => d.Message)));
        Assert.Equal("ScriptEditor.Generated.QuoteTopic", result.TargetTypeName);
        Assert.Equal(2, result.CompiledTypes.Count);
        Assert.Contains(result.CompiledTypes, t => t.Name == "MainConversation");
        Assert.Contains(result.CompiledTypes, t => t.Name == "QuoteTopic");

        var catalog = new ScriptEditor.Runtime.DynamicTopicCatalog();
        catalog.SetWorkflowTypes(result.CompiledTypes, initialTopicName: "MainConversation");

        Assert.True(catalog.Contains("MainConversation"));
        Assert.True(catalog.Contains("QuoteTopic"));
        Assert.True(catalog.TryGetDescriptor("editor.current", out var currentDesc));
        Assert.NotNull(currentDesc);
        Assert.Equal("MainConversation", currentDesc.TopicId);

        Assert.True(catalog.TryGetDescriptor("QuoteTopic", out var quoteDesc));
        Assert.NotNull(quoteDesc);
        Assert.Equal("QuoteTopic", quoteDesc.TopicId);
    }

    [Fact]
    public void CompileAndLoad_AdaptiveCardActivity_WithInsuranceFields_DeducesModelAndCompilesSuccessfully()
    {
        var cardFieldsJson = """
        {
          "title": "📇 Contact Information",
          "desc": "Fill out your details",
          "submitText": "Submit",
          "fields": [
            { "id": "full_name", "type": "input-text", "label": "Full Name", "required": true },
            { "id": "phone_number", "type": "input-tel", "label": "Phone Number", "required": true },
            { "id": "email_address", "type": "input-email", "label": "Email Address", "required": false },
            { "id": "age", "type": "input-number", "label": "Age", "min": 18, "max": 99, "required": true },
            { "id": "date_of_birth", "type": "input-date", "label": "Date of Birth", "required": true },
            { "id": "coverage_type", "type": "input-tagselect", "label": "Coverage Type", "choices": [{"title": "Term", "value": "term"}], "required": true },
            { "id": "has_insurance", "type": "input-radio", "label": "Has Insurance", "choices": [{"title": "Yes", "value": "yes"}], "required": true },
            { "id": "preferred_contact", "type": "input-choice", "label": "Contact Method", "choices": [{"title": "Email", "value": "email"}], "required": true },
            { "id": "selected_conditions", "type": "input-checklist", "label": "Conditions", "choices": [{"title": "None", "value": "none"}], "required": false },
            { "id": "consent_contact", "type": "input-toggle", "label": "I consent", "required": true }
          ]
        }
        """;

        var document = new DiagramDocumentV2
        {
            Nodes =
            [
                MakeNode("cardNode", "ContactCard", "AdaptiveCardActivity", new()
                {
                    ["cardFields"] = cardFieldsJson,
                    ["submissionContextKey"] = "contact_submission",
                    ["required"] = "true"
                }),
                MakeNode("endNode", "Bye", "EndActivity", new() { ["endMessage"] = "Done" }),
            ],
            Edges =
            [
                new DiagramEdgeV2
                {
                    Id = "e1",
                    From = new DiagramEndpointV2 { Node = "cardNode", Port = "cardNode-out" },
                    To = new DiagramEndpointV2 { Node = "endNode", Port = "endNode-in" },
                },
            ],
        };

        var csharp = JsonToCSharpTranscriber.Transcribe(document, "CardConversation");
        Assert.Contains("public class ContactCardModel : BaseCardModel", csharp);
        Assert.Contains("public string? FullName { get; set; }", csharp);
        Assert.Contains("public string? PhoneNumber { get; set; }", csharp);
        Assert.Contains("public string? EmailAddress { get; set; }", csharp);
        Assert.Contains("public int? Age { get; set; }", csharp);
        Assert.Contains("public DateTime? DateOfBirth { get; set; }", csharp);
        Assert.Contains("public string? CoverageType { get; set; }", csharp);
        Assert.Contains("public string? HasInsurance { get; set; }", csharp);
        Assert.Contains("public string? PreferredContact { get; set; }", csharp);
        Assert.Contains("public List<string>? SelectedConditions { get; set; }", csharp);
        Assert.Contains("public bool? ConsentContact { get; set; }", csharp);
        Assert.Contains("[Required(ErrorMessage = \"Full Name is required.\")]", csharp);
        Assert.Contains("[JsonPropertyName(\"full_name\")]", csharp);

        var result = WorkflowCompiler.CompileAndLoad(document, "CardConversation");
        Assert.True(result.Success, string.Join("; ", result.Diagnostics.Select(d => d.Message)));
        Assert.Equal("ScriptEditor.Generated.CardConversation", result.GeneratedTypeName);
    }

    [Fact]
    public void CompileAndLoad_PromptActivity_DirectAndInComposite_Succeeds()
    {
        var stepsJson = """
        [
            {
                "type": "PromptActivity",
                "name": "AskStep_1",
                "data": {
                    "message": "Que es esto?",
                    "systemPrompt": "You are an assistant.",
                    "temperature": "0.7"
                }
            }
        ]
        """;

        var document = new DiagramDocumentV2
        {
            Nodes =
            [
                MakeNode("compNode", "MyComposite", "CompositeActivity", new()
                {
                    ["steps"] = stepsJson,
                }),
                MakeNode("promptNode", "AskDirect", "PromptActivity", new()
                {
                    ["userPromptTemplate"] = "Direct prompt template",
                    ["systemPrompt"] = "You are direct assistant."
                }),
                MakeNode("endNode", "Bye", "EndActivity", new() { ["endMessage"] = "Done" }),
            ],
            Edges =
            [
                new DiagramEdgeV2
                {
                    Id = "e1",
                    From = new DiagramEndpointV2 { Node = "compNode", Port = "compNode-out" },
                    To = new DiagramEndpointV2 { Node = "promptNode", Port = "promptNode-in" },
                },
                new DiagramEdgeV2
                {
                    Id = "e2",
                    From = new DiagramEndpointV2 { Node = "promptNode", Port = "promptNode-out" },
                    To = new DiagramEndpointV2 { Node = "endNode", Port = "endNode-in" },
                },
            ],
        };

        var csharp = JsonToCSharpTranscriber.Transcribe(document, "PromptConversation");
        Assert.Contains("new PromptActivity(\"AskStep_1\", new Kernel(), _logger)", csharp);
        Assert.Contains("UserPromptTemplate = \"Que es esto?\"", csharp);
        Assert.Contains("SystemPrompt = \"You are an assistant.\"", csharp);

        var result = WorkflowCompiler.CompileAndLoad(document, "PromptConversation");
        Assert.True(result.Success, string.Join("; ", result.Diagnostics.Select(d => d.Message)));
        Assert.Equal("ScriptEditor.Generated.PromptConversation", result.GeneratedTypeName);
    }

    [Fact]
    public void CompileAndLoad_SetVariableAndSwitchActivities_Succeeds()
    {
        var document = new DiagramDocumentV2
        {
            Nodes =
            [
                MakeNode("set1", "SetVar", "SetVariableActivity", new()
                {
                    ["variableName"] = "Global_Example",
                    ["value"] = "case-a",
                    ["isGlobal"] = "true",
                    ["validateNaming"] = "true"
                }),
                MakeNode("sw1", "SwitchNode", "SwitchActivity", new()
                {
                    ["valueContextKey"] = "Global_Example",
                    ["caseKeys"] = "case-a | case-b",
                    ["loopAfterCase"] = "false",
                    ["defaultCase"] = ""
                }),
                MakeNode("msgA", "CaseA", "SimpleActivity", new() { ["message"] = "Option A" }),
                MakeNode("msgB", "CaseB", "SimpleActivity", new() { ["message"] = "Option B" })
            ],
            Edges =
            [
                new DiagramEdgeV2
                {
                    Id = "e1",
                    From = new DiagramEndpointV2 { Node = "set1", Port = "set1-out" },
                    To = new DiagramEndpointV2 { Node = "sw1", Port = "sw1-in" }
                },
                new DiagramEdgeV2
                {
                    Id = "e2",
                    From = new DiagramEndpointV2 { Node = "sw1", Port = "sw1-case-case-a" },
                    To = new DiagramEndpointV2 { Node = "msgA", Port = "msgA-in" }
                },
                new DiagramEdgeV2
                {
                    Id = "e3",
                    From = new DiagramEndpointV2 { Node = "sw1", Port = "sw1-case-case-b" },
                    To = new DiagramEndpointV2 { Node = "msgB", Port = "msgB-in" }
                }
            ]
        };

        var csharp = JsonToCSharpTranscriber.Transcribe(document, "SwitchWorkflow");
        Assert.Contains("new SetVariableActivity(\"SetVar\", \"Global_Example\", \"case-a\", _conversationContext, NullLogger<SetVariableActivity>.Instance, true)", csharp);
        Assert.Contains(".When(\"Global_Example\", \"case-a\")", csharp);
        Assert.Contains(".When(\"Global_Example\", \"case-b\")", csharp);

        var result = WorkflowCompiler.CompileAndLoad(document, "SwitchWorkflow");
        Assert.True(result.Success, string.Join("; ", result.Diagnostics.Select(d => d.Message)));
        Assert.Equal("ScriptEditor.Generated.SwitchWorkflow", result.GeneratedTypeName);
    }

    [Fact]
    public void CompileAndLoad_ParallelActivity_Succeeds()
    {
        var document = new DiagramDocumentV2
        {
            Nodes =
            [
                MakeNode("p1", "ParallelJobs", "ParallelActivity", new()
                {
                    ["branches"] = "Branch 1 | Branch 2",
                    ["branchCount"] = "2",
                    ["continueOnError"] = "true",
                    ["completeMessage"] = "All jobs completed"
                }),
                MakeNode("msg1", "BotMessage1", "SimpleActivity", new() { ["message"] = "Task 1" }),
                MakeNode("msg2", "BotMessage2", "SimpleActivity", new() { ["message"] = "Task 2" })
            ],
            Edges =
            [
                new DiagramEdgeV2
                {
                    Id = "e1",
                    From = new DiagramEndpointV2 { Node = "p1", Port = "p1-branch-branch-1" },
                    To = new DiagramEndpointV2 { Node = "msg1", Port = "msg1-in" }
                },
                new DiagramEdgeV2
                {
                    Id = "e2",
                    From = new DiagramEndpointV2 { Node = "p1", Port = "p1-branch-branch-2" },
                    To = new DiagramEndpointV2 { Node = "msg2", Port = "msg2-in" }
                }
            ]
        };

        var csharp = JsonToCSharpTranscriber.Transcribe(document, "ParallelWorkflow");
        Assert.Contains("new ParallelActivity(\"ParallelJobs\"", csharp);
        Assert.Contains("ContinueOnError = true", csharp);
        Assert.Contains("CompleteMessage = \"All jobs completed\"", csharp);

        var result = WorkflowCompiler.CompileAndLoad(document, "ParallelWorkflow");
        Assert.True(result.Success, string.Join("; ", result.Diagnostics.Select(d => d.Message)));
        Assert.Equal("ScriptEditor.Generated.ParallelWorkflow", result.GeneratedTypeName);
    }

    [Fact]
    public void CompileAndLoad_SimpleActivity_WithVariables_Succeeds()
    {
        var document = new DiagramDocumentV2
        {
            Nodes =
            [
                MakeNode("set1", "InitUser", "SetVariableActivity", new() { ["variableName"] = "Global_UserName", ["value"] = "Alice" }),
                MakeNode("msg1", "GreetUser", "SimpleActivity", new() { ["message"] = "Welcome, {Global_UserName}! Your session is active." }),
                MakeNode("end1", "EndSession", "EndActivity", new() { ["endMessage"] = "Bye" })
            ],
            Edges =
            [
                new DiagramEdgeV2
                {
                    Id = "e1",
                    From = new DiagramEndpointV2 { Node = "set1", Port = "set1-out" },
                    To = new DiagramEndpointV2 { Node = "msg1", Port = "msg1-in" }
                },
                new DiagramEdgeV2
                {
                    Id = "e2",
                    From = new DiagramEndpointV2 { Node = "msg1", Port = "msg1-out" },
                    To = new DiagramEndpointV2 { Node = "end1", Port = "end1-in" }
                }
            ]
        };

        var csharp = JsonToCSharpTranscriber.Transcribe(document, "DynamicMessageWorkflow");
        Assert.Contains("Global_UserName", csharp);

        var result = WorkflowCompiler.CompileAndLoad(document, "DynamicMessageWorkflow");
        Assert.True(result.Success, string.Join("; ", result.Diagnostics.Select(d => d.Message)));
    }

    [Fact]
    public async Task Runtime_Execute_Workflow_With_Variables()
    {
        var document = new DiagramDocumentV2
        {
            Nodes =
            [
                MakeNode("node1", "Set Var", "SetVariableActivity", new() { ["variableName"] = "Global_Example", ["value"] = "hello from outside" }),
                MakeNode("node2", "Bot Message", "SimpleActivity", new() { ["message"] = "{Global_Example}" }),
            ],
            Edges =
            [
                new DiagramEdgeV2
                {
                    Id = "e1",
                    From = new DiagramEndpointV2 { Node = "node1", Port = "node1-out" },
                    To = new DiagramEndpointV2 { Node = "node2", Port = "node2-in" }
                }
            ]
        };

        var compileResult = WorkflowCompiler.CompileAndLoadWorkspace(
            [new WorkspaceTopicInput("MainConversation", document)],
            "MainConversation"
        );
        Assert.True(compileResult.Success, string.Join("; ", compileResult.Diagnostics.Select(d => d.Message)));

        var catalog = new ScriptEditor.Runtime.DynamicTopicCatalog();
        catalog.SetWorkflowTypes(compileResult.CompiledTypes, "MainConversation");

        var services = new Microsoft.Extensions.DependencyInjection.ServiceCollection();
        services.AddLogging();
        services.AddSingleton(catalog);
        services.AddSingleton<ConversaCore.Runtime.ITopicCatalog>(catalog);
        services.AddScoped<ConversaCore.Context.IConversationContext>(_ => new ConversaCore.Context.ConversationContext(
            Guid.NewGuid().ToString("N"), "editor", Microsoft.Extensions.Logging.Abstractions.NullLogger<ConversaCore.Context.ConversationContext>.Instance));
        services.AddTransient<Microsoft.SemanticKernel.Kernel>(sp => new Microsoft.SemanticKernel.Kernel(sp));

        new ConversaCore.Registration.ConversaCoreBuilder(services)
            .AddConversationRuntime("editor.current", new ConversaCore.Runtime.TopicRouterOptions { FallbackTopicId = "editor.fallback" });

        var sp = services.BuildServiceProvider();
        var runtime = sp.GetRequiredService<ConversaCore.Runtime.IConversationRuntime>();

        var emittedMessages = new List<string>();
        var sub = runtime.Subscribe();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        var readTask = Task.Run(async () =>
        {
            try
            {
                await foreach (var item in sub.ReadAllAsync(cts.Token))
                {
                    emittedMessages.Add($"{item.GetType().Name}: {item}");
                }
            }
            catch (OperationCanceledException) { }
        });

        await runtime.StartAsync(cts.Token);
        await Task.Delay(500);
        cts.Cancel();
        await readTask;
        Assert.Contains(emittedMessages, m => m.Contains("hello from outside"));
    }

    [Fact]
    public void CompileAndLoad_RepeatLoopActivity_AllModes_Succeeds()
    {
        var document = new DiagramDocumentV2
        {
            Nodes =
            [
                MakeNode("loop1", "PromptLoop", "RepeatActivity", new() { ["loopMode"] = "user_prompt", ["continuePrompt"] = "Add another item?" }),
                MakeNode("loop2", "CountLoop", "RepeatActivity", new() { ["loopMode"] = "fixed_count", ["iterations"] = "3" }),
                MakeNode("loop3", "WhileLoop", "RepeatActivity", new() { ["loopMode"] = "while_condition", ["condition"] = "ctx => true" }),
                MakeNode("loop4", "CollLoop", "RepeatActivity", new() { ["loopMode"] = "collection", ["collectionKey"] = "orderItems" }),
            ],
            Edges = []
        };

        var result = WorkflowCompiler.CompileAndLoad(document);
        Assert.True(result.Success, string.Join("; ", result.Diagnostics.Select(d => d.Message)));
        Assert.Equal("ScriptEditor.Generated.MainConversation", result.GeneratedTypeName);
    }
}




