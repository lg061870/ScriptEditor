using ConversaCore.Interfaces;
using ConversaCore.TopicFlow.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.SemanticKernel;
using System.Text;
using System.Text.Json;

namespace ConversaCore.TopicFlow;

/// <summary>
/// SemanticResponseActivity intelligently combines developer and user prompts,
/// uses vector retrieval, and can skip LLM calls when high-confidence data is found.
/// Supports lambda-based prompt factories and response handlers for dynamic flows.
/// </summary>
public class SemanticResponseActivity : SemanticActivity {
    private readonly IVectorDatabaseService? _vectorDb;
    private readonly string _collectionName;

    // 💡 New dynamic factories
    private Func<TopicWorkflowContext, string>? _promptFactory;
    private Func<TopicWorkflowContext, string, Task>? _responseHandler;

    public string DeveloperPrompt { get; set; } = string.Empty;
    public string? UserPrompt { get; set; }
    public string UserPromptContextKey { get; set; } = "Fallback_UserPrompt";
    public double SkipLLMThreshold { get; set; } = 0.9;

    private List<DocumentSearchResult>? _cachedResults;

    public SemanticResponseActivity(
        string id,
        Kernel kernel,
        ILogger logger,
        IVectorDatabaseService? vectorDb = null,
        string collectionName = "default_documents")
        : base(id, kernel, logger) {
        _vectorDb = vectorDb;
        _collectionName = collectionName;
    }

    // ------------------------------------------------------------------------
    // 🧩 Fluent Builders
    // ------------------------------------------------------------------------
    public SemanticResponseActivity WithDeveloperPrompt(string prompt) {
        DeveloperPrompt = prompt;
        return this;
    }

    public SemanticResponseActivity WithSkipLLMThreshold(double threshold) {
        SkipLLMThreshold = Math.Clamp(threshold, 0.0, 1.0);
        return this;
    }

    public SemanticResponseActivity WithUserPrompt(string? prompt) {
        UserPrompt = prompt;
        return this;
    }

    public SemanticResponseActivity WithPromptFactory(Func<TopicWorkflowContext, string> factory) {
        _promptFactory = factory;
        return this;
    }

    public SemanticResponseActivity WithResponseHandler(Func<TopicWorkflowContext, string, Task> handler) {
        _responseHandler = handler;
        return this;
    }

    // ------------------------------------------------------------------------
    // PROMPT BUILDERS
    // ------------------------------------------------------------------------
    protected override async Task<string> BuildSystemPromptAsync(TopicWorkflowContext context, object? input) {
        await Task.CompletedTask;
        return $@"
You are an expert assistant.
Follow the developer's instructions exactly as written.

## Developer Instructions
{DeveloperPrompt}

Use available evidence and prior context where possible.
If no relevant evidence exists, reason based on your own knowledge.
";
    }

    protected override async Task<string> BuildUserPromptAsync(TopicWorkflowContext context, object? input) {
        // 🧩 Priority: dynamic factory → explicit → input → context
        var userText =
            _promptFactory?.Invoke(context) ??
            UserPrompt ??
            input?.ToString() ??
            context.GetValue<string>(UserPromptContextKey) ??
            string.Empty;

        var builder = new StringBuilder();

        // 🔍 Retrieve vector evidence
        if (_vectorDb != null && !string.IsNullOrWhiteSpace(userText)) {
            _cachedResults = await _vectorDb.SearchAsync(
                _collectionName, userText, limit: 5, minRelevanceScore: 0.7);

            if (_cachedResults.Count > 0) {
                builder.AppendLine("## Retrieved Evidence");
                foreach (var result in _cachedResults)
                    builder.AppendLine($"- {result.Content.Trim()}");
                builder.AppendLine();
            }
        }

        // Include prior context
        if (context.TryGetValue($"{Id}_PreviousOutput", out var prev)) {
            builder.AppendLine("## Prior Activity Output");
            builder.AppendLine(prev?.ToString());
            builder.AppendLine();
        }

        builder.AppendLine("## User Input / Query");
        builder.AppendLine(userText);
        builder.AppendLine("Respond according to the developer's instructions.");

        return builder.ToString();
    }

    // ------------------------------------------------------------------------
    // CORE EXECUTION OVERRIDE with LLM avoidance heuristic
    // ------------------------------------------------------------------------
    protected override async Task<ActivityResult> RunActivity(
        TopicWorkflowContext context,
        object? input = null,
        CancellationToken cancellationToken = default) {
        // 🧩 Refresh evidence if not previously cached
        if (_cachedResults == null && _vectorDb != null) {
            var userPrompt = context.GetValue<string>(UserPromptContextKey);
            if (!string.IsNullOrWhiteSpace(userPrompt)) {
                _cachedResults = await _vectorDb.SearchAsync(
                    _collectionName,
                    userPrompt,
                    limit: 5,
                    minRelevanceScore: 0.7,
                    cancellationToken);
            }
        }

        // 🧮 Skip LLM if high-confidence retrieval is available
        if (_cachedResults is { Count: > 0 }) {
            double avgScore = _cachedResults.Average(r => r.RelevanceScore);

            if (avgScore >= SkipLLMThreshold) {
                var formatted = TryFormatRetrievedEvidence(_cachedResults, DeveloperPrompt);

                _semanticLogger.LogInformation(
                    "[{ActivityId}] Skipping LLM (avgScore={Score:F2}) – using retrieval-only synthesis",
                    Id, avgScore);

                context.SetValue($"{Id}_WasLLMSkipped", true);
                context.SetValue($"{Id}_RetrievedEvidence", _cachedResults);

                // Persist output to context
                await StoreResultsInContextAsync(context, formatted);

                // 🔁 Trigger response handler if configured
                if (_responseHandler != null) {
                    try {
                        await _responseHandler(context, formatted);
                    } catch (Exception ex) {
                        _semanticLogger.LogError(ex, "[{ActivityId}] Response handler threw exception during retrieval-only path", Id);
                    }
                }

                // Continue workflow with both raw and typed payloads
                return ActivityResult.Continue(formatted, formatted);
            }
        }

        // ⚙️ Default path: LLM inference
        context.SetValue($"{Id}_WasLLMSkipped", false);

        ActivityResult result;
        try {
            result = await base.RunActivity(context, input, cancellationToken);
        } catch (OperationCanceledException) {
            _semanticLogger.LogWarning("[{ActivityId}] LLM call cancelled.", Id);
            return ActivityResult.Cancelled("Semantic LLM inference cancelled.");
        }

        // 💬 Invoke response handler for post-processing
        if (_responseHandler != null && result.ModelContext is string text) {
            try {
                await _responseHandler(context, text);
            } catch (Exception ex) {
                _semanticLogger.LogError(ex, "[{ActivityId}] Response handler threw exception during LLM path", Id);
            }
        }

        return result ?? ActivityResult.Continue();
    }

    // ------------------------------------------------------------------------
    // UTIL: Format retrieved evidence when skipping LLM
    // ------------------------------------------------------------------------
    private static string TryFormatRetrievedEvidence(List<DocumentSearchResult> results, string developerPrompt) {
        var normalized = developerPrompt.ToLowerInvariant();
        bool wantsJson = normalized.Contains("json");
        bool wantsCsv = normalized.Contains("csv");

        if (wantsJson) {
            var json = results.Select(r => new {
                id = r.Id,
                text = r.Content,
                score = Math.Round(r.RelevanceScore, 3)
            });
            return JsonSerializer.Serialize(json, new JsonSerializerOptions { WriteIndented = true });
        }

        if (wantsCsv) {
            var sb = new StringBuilder("id,score,content\n");
            foreach (var r in results)
                sb.AppendLine($"\"{r.Id}\",{r.RelevanceScore:F2},\"{r.Content.Replace("\"", "\"\"")}\"");
            return sb.ToString();
        }

        var plain = new StringBuilder("Top Retrieved Evidence:\n");
        foreach (var r in results)
            plain.AppendLine($"- ({r.RelevanceScore:F2}) {r.Content}");

        return plain.ToString();
    }
}
