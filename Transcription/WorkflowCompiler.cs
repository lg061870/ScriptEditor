using System.Reflection;
using System.Runtime.Loader;
using ConversaCore.TopicFlow;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using ScriptEditor.Models.Schema;

namespace ScriptEditor.Transcription;

public sealed record CompileDiagnostic(string Severity, string Message, int? Line);

public sealed record CompileResult(bool Success, List<CompileDiagnostic> Diagnostics, string? GeneratedTypeName, string GeneratedCSharp, Type? CompiledType = null);

public sealed record WorkspaceTopicInput(string Name, DiagramDocumentV2 Document);

public sealed record WorkspaceCompileResult(
    bool Success,
    List<CompileDiagnostic> Diagnostics,
    string? TargetTypeName,
    string CombinedCSharp,
    List<Type> CompiledTypes,
    Type? TargetType
);

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
        var csharp = JsonToCSharpTranscriber.Transcribe(document, className);
        var wrapped = WrapStandaloneCSharp(csharp);

        try
        {
            var genDir = GetGeneratedTopicsDirectory();
            if (!Directory.Exists(genDir))
            {
                Directory.CreateDirectory(genDir);
            }
            File.WriteAllText(Path.Combine(genDir, $"{className}.cs"), wrapped);
        }
        catch
        {
            // Best-effort file disk sync
        }

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

        return new CompileResult(true, diagnostics, type?.FullName, csharp, type);
    }

    public static WorkspaceCompileResult CompileAndLoadWorkspace(
        IEnumerable<WorkspaceTopicInput> topics,
        string? targetTopicName = null)
    {
        var topicList = topics.ToList();
        if (topicList.Count == 0)
        {
            return new WorkspaceCompileResult(false, [new CompileDiagnostic("Error", "No topics provided to compile", null)], null, string.Empty, [], null);
        }

        var sb = new System.Text.StringBuilder();
        var genDir = GetGeneratedTopicsDirectory();
        try
        {
            if (!Directory.Exists(genDir))
            {
                Directory.CreateDirectory(genDir);
            }
        }
        catch { }

        foreach (var topic in topicList)
        {
            var cleanName = !string.IsNullOrWhiteSpace(topic.Name) ? topic.Name.Trim() : "MainConversation";
            var csharp = JsonToCSharpTranscriber.Transcribe(topic.Document, cleanName);

            try
            {
                File.WriteAllText(Path.Combine(genDir, $"{cleanName}.cs"), WrapStandaloneCSharp(csharp));
            }
            catch { }

            sb.AppendLine($"// --- Topic: {cleanName} ---");
            sb.AppendLine(csharp);
            sb.AppendLine();
        }

        var combinedCSharp = sb.ToString();
        var wrapped = WrapStandaloneCSharp(combinedCSharp);

        var syntaxTree = CSharpSyntaxTree.ParseText(wrapped);
        var references = GetReferences();

        var compilation = CSharpCompilation.Create(
            assemblyName: $"GeneratedWorkspace_{Guid.NewGuid():N}",
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
            return new WorkspaceCompileResult(false, diagnostics, null, combinedCSharp, [], null);
        }

        peStream.Seek(0, SeekOrigin.Begin);
        var context = new CollectibleAssemblyLoadContext();
        var assembly = context.LoadFromStream(peStream);

        var compiledTypes = assembly.GetTypes()
            .Where(t => typeof(TopicFlow).IsAssignableFrom(t) && !t.IsAbstract)
            .ToList();

        lock (UnloadLock)
        {
            _previousContext?.Unload();
            _previousContext = context;
        }

        Type? targetType = null;
        if (!string.IsNullOrWhiteSpace(targetTopicName))
        {
            targetType = compiledTypes.FirstOrDefault(t => string.Equals(t.Name, targetTopicName, StringComparison.OrdinalIgnoreCase));
        }
        targetType ??= compiledTypes.FirstOrDefault();

        return new WorkspaceCompileResult(true, diagnostics, targetType?.FullName, combinedCSharp, compiledTypes, targetType);
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
    private static string WrapStandaloneCSharp(string csharp) =>
        "#nullable enable\nusing System;\nusing System.Collections.Generic;\nusing System.Threading;\nusing System.Threading.Tasks;\nusing System.ComponentModel.DataAnnotations;\nusing System.Text.Json.Serialization;\nusing Microsoft.Extensions.Logging;\nusing Microsoft.Extensions.Logging.Abstractions;\nusing Microsoft.SemanticKernel;\nusing ConversaCore.TopicFlow;\nusing ConversaCore.TopicFlow.Activities;\nusing ConversaCore.Cards;\nusing ConversaCore.Tools;\nusing ConversaCore.Runtime;\nusing ConversaCore.Context;\n\nnamespace ScriptEditor.Generated\n{\n" + csharp + "\n}\n";

    private static string GetGeneratedTopicsDirectory()
    {
        var dir = new DirectoryInfo(Directory.GetCurrentDirectory());
        while (dir != null && !File.Exists(Path.Combine(dir.FullName, "ScriptEditor.sln")) && !File.Exists(Path.Combine(dir.FullName, "ScriptEditor.csproj")))
        {
            dir = dir.Parent;
        }

        if (dir != null)
        {
            var targetDir = File.Exists(Path.Combine(dir.FullName, "ScriptEditor.csproj")) ? dir.FullName : Path.Combine(dir.FullName, "ScriptEditor");
            var topicDir = Directory.Exists(Path.Combine(dir.FullName, "Topics")) ? Path.Combine(dir.FullName, "Topics", "Generated") : Path.Combine(targetDir, "Topics", "Generated");
            return topicDir;
        }

        return Path.Combine(AppContext.BaseDirectory, "Topics", "Generated");
    }

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
        EnsureLoaded(typeof(Microsoft.SemanticKernel.Kernel).Assembly);
        EnsureLoaded(typeof(Microsoft.Extensions.Options.IOptions<>).Assembly);
        EnsureLoaded(typeof(System.ComponentModel.DataAnnotations.RequiredAttribute).Assembly);
        EnsureLoaded(typeof(System.Text.Json.Serialization.JsonPropertyNameAttribute).Assembly);

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
