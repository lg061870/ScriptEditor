using System.Reflection;
using System.Runtime.Loader;
using ConversaCore.TopicFlow;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using ScriptEditor.Models.Schema;

namespace ScriptEditor.Transcription;

public sealed record CompileDiagnostic(string Severity, string Message, int? Line);

public sealed record CompileResult(bool Success, List<CompileDiagnostic> Diagnostics, string? GeneratedTypeName, string GeneratedCSharp);

/// <summary>
/// Phase 3.4: the dual-speed compilation lifecycle
/// (CONCEPT_OF_OPERATIONS.md line 51 -- "Roslyn in-memory compilation and
/// assembly loading occur on-demand when the chatbot's 'Reset' button is
/// pressed, eliminating compiler churn during drafting"). Phase 3.3's
/// text-level transcription stays instant and separate; THIS is the heavy
/// path, gated behind an explicit action (the /api/transcribe/run
/// endpoint), never triggered by a canvas mutation or keystroke.
///
/// Scope boundary, deliberate: this proves compile + emit + assembly load
/// + the generated type actually exists and derives from TopicFlow. It
/// does NOT instantiate a running instance (`new MainConversation(context,
/// logger)`) -- that needs a real TopicWorkflowContext and ILogger wired
/// through a live chat session, which is Phase 6's "Run/Execute Workflow"
/// + "Live chat preview pane" concern, not this one. Forcing that here
/// would mean fabricating throwaway DI dependencies just to prove a point
/// this task's acceptance criteria doesn't actually ask for.
/// </summary>
public static class WorkflowCompiler
{
    private static AssemblyLoadContext? _previousContext;
    private static readonly Lock UnloadLock = new();

    public static CompileResult CompileAndLoad(DiagramDocumentV2 document, string className = "MainConversation")
    {
        var csharp = JsonToCSharpTranscriber.Transcribe(document);

        // Deliberately NOT wrapped in `namespace ConversaCore.TopicFlow`
        // itself: TopicFlow (the base class) has the exact same simple
        // name as the last segment of its own namespace, and referencing
        // it unqualified from within a source block re-declaring that same
        // namespace -- when the class exists only in a referenced
        // assembly's metadata, not in this same syntax tree -- makes Roslyn
        // bind the bare name to the namespace instead of the type
        // ("'TopicFlow' is a namespace but is used like a type"), verified
        // empirically. A neutral namespace + `using ConversaCore.TopicFlow;`
        // resolves every bare name the same way without tripping that trap.
        // `using System;`/`using Microsoft.Extensions.Logging;` are needed
        // because, unlike Phase 3.1's scratch-file verification (which
        // compiled inside ScriptEditor.csproj and inherited its SDK-level
        // ImplicitUsings), this is a standalone CSharpSyntaxTree.ParseText
        // compilation with no implicit usings of its own.
        var wrapped = $"using System;\nusing Microsoft.Extensions.Logging;\nusing ConversaCore.TopicFlow;\n\nnamespace ScriptEditor.Generated\n{{\n{csharp}\n}}\n";

        var syntaxTree = CSharpSyntaxTree.ParseText(wrapped);
        var references = GetReferences();

        var compilation = CSharpCompilation.Create(
            assemblyName: $"GeneratedWorkflow_{Guid.NewGuid():N}",
            syntaxTrees: [syntaxTree],
            references: references,
            options: new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));

        using var peStream = new MemoryStream();
        var emitResult = compilation.Emit(peStream);

        var diagnostics = emitResult.Diagnostics
            .Where(d => d.Severity >= DiagnosticSeverity.Warning)
            .Select(d =>
            {
                var span = d.Location.GetLineSpan();
                int? line = span.IsValid ? span.StartLinePosition.Line + 1 : null;
                return new CompileDiagnostic(d.Severity.ToString(), d.GetMessage(), line);
            })
            .ToList();

        if (!emitResult.Success)
        {
            return new CompileResult(false, diagnostics, null, csharp);
        }

        peStream.Seek(0, SeekOrigin.Begin);
        var context = new CollectibleAssemblyLoadContext();
        var assembly = context.LoadFromStream(peStream);
        var type = assembly.GetType($"ScriptEditor.Generated.{className}");

        lock (UnloadLock)
        {
            // Matches CONOPS line 51's "Reset" semantics: each explicit
            // Run/Reset unloads the previous generated assembly rather
            // than accumulating one per click.
            _previousContext?.Unload();
            _previousContext = context;
        }

        return new CompileResult(true, diagnostics, type?.FullName, csharp);
    }

    // Nothing in ScriptEditor's own compiled IL references ConversaCore
    // types directly anymore (the local Activities/ shadow copies that used
    // to force an eager load were removed), so the CLR never lazily loads
    // ConversaCore.dll into the AppDomain on its own -- AppDomain.
    // CurrentDomain.GetAssemblies() alone silently omits it, verified
    // empirically. `typeof(ConversaCore.TopicFlow.TopicFlow)` forces the
    // load and gives its exact Location regardless of AppDomain state.
    //
    // Same problem, same fix, for Microsoft.Extensions.Logging.Abstractions
    // (ILogger, referenced by the `using Microsoft.Extensions.Logging;` in
    // the wrapped source): relying on it merely happening to already be
    // loaded in this AppDomain is fragile, not a real guarantee -- it was
    // only true by accident of ASP.NET Core's own host startup eagerly
    // loading it, and broke immediately (CS0246 on ILogger) the first time
    // this ran under a plain xunit test host instead of the web host
    // (#41's own WorkflowCompilerTests.cs caught this). Force it the same
    // explicit way as ConversaCore, rather than depend on incidental
    // process state that happens to differ between hosts.
    private static List<MetadataReference> GetReferences()
    {
        var loaded = AppDomain.CurrentDomain.GetAssemblies()
            .Where(a => !a.IsDynamic && !string.IsNullOrEmpty(a.Location))
            .ToList();

        void EnsureLoaded(Assembly assembly)
        {
            if (loaded.All(a => a.Location != assembly.Location))
            {
                loaded.Add(assembly);
            }
        }

        EnsureLoaded(typeof(ConversaCore.TopicFlow.TopicFlow).Assembly);
        EnsureLoaded(typeof(Microsoft.Extensions.Logging.ILogger).Assembly);

        return loaded
            .Select(a => (MetadataReference)MetadataReference.CreateFromFile(a.Location))
            .ToList();
    }
}

/// <summary>Collectible so each Run/Reset's generated assembly can actually
/// be unloaded, not just dereferenced -- required for AssemblyLoadContext
/// to reclaim it. Resolves nothing itself; all real dependencies
/// (ConversaCore's real TopicFlow/TopicWorkflowContext/activity types, via
/// the ProjectReference) are supplied as MetadataReferences at compile time
/// and resolved from the default load context at runtime, since they're
/// already loaded in this process.</summary>
internal sealed class CollectibleAssemblyLoadContext() : AssemblyLoadContext(isCollectible: true)
{
    protected override Assembly? Load(AssemblyName assemblyName) => null;
}
