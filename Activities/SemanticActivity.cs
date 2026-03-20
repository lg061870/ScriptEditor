using ConversaCore.Interfaces;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;
using Microsoft.SemanticKernel.Connectors.OpenAI;
using System.Diagnostics;
using System.Text.Json;

namespace ConversaCore.TopicFlow;

/// <summary>
/// Base class for semantic (LLM-driven) activities compatible with SK 1.66.
/// Provides background execution, async completion callbacks, and event signaling.
/// </summary>
public abstract class SemanticActivity : TopicFlowActivity, IAsyncNotifiableActivity {
    private static readonly ActivitySource _otelSource = new("ConversaCore.Semantic");

    protected readonly Kernel _kernel;
    protected readonly IChatCompletionService _chatCompletion;
    protected readonly ILogger _semanticLogger;

    private string? _cachedSystemPrompt;

    public string ModelId { get; set; }
    public float Temperature { get; set; }
    public int MaxTokens { get; set; }
    public bool RequireJsonOutput { get; set; }
    public string? JsonSchemaHint { get; set; }

    /// <summary> Indicates whether the activity should execute asynchronously in background. </summary>
    public bool RunInBackground { get; set; }

    /// <summary> User-supplied callback to execute when async reasoning completes. </summary>
    public Func<TopicWorkflowContext, Task<TopicFlowActivity?>>? OnAsyncCompletedCallback { get; private set; }

    /// <summary> Raised when the semantic query completes asynchronously. </summary>
    public event EventHandler<AsyncQueryCompletedEventArgs>? AsyncCompleted;

    /// <summary> Optional configuration for extracting structured data intelligence from responses. </summary>
    private DataIntelligenceConfig? _dataIntelligenceConfig;

    protected SemanticActivity(
        string activityId,
        Kernel kernel,
        ILogger logger,
        IOptions<SemanticActivityOptions>? options = null)
        : base(activityId, null) {

        _kernel = kernel ?? throw new ArgumentNullException(nameof(kernel));
        _semanticLogger = logger ?? throw new ArgumentNullException(nameof(logger));
        _chatCompletion = kernel.GetRequiredService<IChatCompletionService>();

        var cfg = options?.Value ?? new SemanticActivityOptions();
        ModelId = cfg.DefaultModelId;
        Temperature = cfg.DefaultTemperature;
        MaxTokens = cfg.DefaultMaxTokens;
        RequireJsonOutput = cfg.RequireJsonOutput;
    }

    // ============================================================
    // CALLBACK REGISTRATION
    // ============================================================
    public void OnAsyncCompleted(Func<TopicWorkflowContext, Task<TopicFlowActivity?>> callback) {
        OnAsyncCompletedCallback = async ctx =>
        {
            // Execute user-defined callback (e.g., AttachQueryPayloadAsync)
            var activity = await callback(ctx);

            // ✅ Build event args and raise AsyncCompleted
            if (AsyncCompleted != null) {
                try {
                    var args = new AsyncQueryCompletedEventArgs(
                        ctx,
                        output: null,        // no specific payload — semantic result already in context
                        queryId: Id,
                        activity: activity   // attach the created activity
                    );

                    AsyncCompleted.Invoke(this, args);
                } catch (Exception ex) {
                    _semanticLogger.LogWarning(
                        ex,
                        "[{ActivityId}] ⚠ Failed to raise AsyncCompleted event after callback.",
                        Id
                    );

                    return null;
                }
            }

            return null;
        };
    }

    protected void RaiseAsyncCompleted(TopicWorkflowContext context, TopicFlowActivity nextActivity) {
        try {
            var queryId = nextActivity.Id;
            var output = context.GetValue<object>($"{Id}_Result");

            _semanticLogger.LogInformation(
                "[{ActivityId}] 📡 Raising AsyncCompleted event for next activity {NextActivityId}",
                Id, queryId);

            AsyncCompleted?.Invoke(this, new AsyncQueryCompletedEventArgs(context, output, queryId));
        } catch (Exception ex) {
            _semanticLogger.LogWarning(ex,
                "[{ActivityId}] ⚠ Failed to raise AsyncCompleted event.", Id);
        }
    }

    // ============================================================
    // EXECUTION ENTRY POINT
    // ============================================================
    protected override async Task<ActivityResult> RunActivity(
        TopicWorkflowContext context,
        object? input = null,
        CancellationToken cancellationToken = default) {

        if (RunInBackground) {
            _semanticLogger.LogInformation("[{ActivityId}] 🚀 Running semantic activity in background.", Id);

            _ = Task.Run(async () => {
                try {
                    var result = await RunSemanticCoreAsync(context, input, cancellationToken);

                    // 🔹 Run user-provided callback (if any)
                    TopicFlowActivity? nextActivity = null;
                    if (OnAsyncCompletedCallback != null) {
                        try {
                            _semanticLogger.LogDebug("[{ActivityId}] 🔁 Executing OnAsyncCompleted callback...", Id);
                            nextActivity = await OnAsyncCompletedCallback(context);
                        } catch (Exception cbEx) {
                            _semanticLogger.LogWarning(cbEx,
                                "[{ActivityId}] ⚠ OnAsyncCompleted callback failed.", Id);
                        }
                    }

                    // 🔹 Raise AsyncCompleted event
                    if (nextActivity != null)
                        RaiseAsyncCompleted(context, nextActivity);

                    _semanticLogger.LogInformation("[{ActivityId}] ✅ Background semantic activity completed.", Id);
                } catch (Exception ex) {
                    _semanticLogger.LogError(ex, "[{ActivityId}] ❌ Background semantic activity failed.", Id);
                }
            }, cancellationToken);

            return ActivityResult.Continue($"[{Id}] running in background");
        }

        // Default synchronous path
        return await RunSemanticCoreAsync(context, input, cancellationToken);
    }

    // ============================================================
    // CORE SEMANTIC EXECUTION LOGIC
    // ============================================================
    private async Task<ActivityResult> RunSemanticCoreAsync(
        TopicWorkflowContext context,
        object? input,
        CancellationToken cancellationToken) {

        using var otelActivity = _otelSource.StartActivity("SemanticActivity.Run", ActivityKind.Internal);
        otelActivity?.SetTag("activity.id", Id);
        otelActivity?.SetTag("model.id", ModelId);
        otelActivity?.SetTag("temperature", Temperature);
        otelActivity?.SetTag("require.json", RequireJsonOutput);

        var stopwatch = Stopwatch.StartNew();

        try {
            _semanticLogger.LogInformation("Executing semantic activity {ActivityId}", Id);

            // Build prompts
            var systemPrompt = _cachedSystemPrompt ??= await BuildSystemPromptAsync(context, input);
            var userPrompt = await BuildUserPromptAsync(context, input);
            var fullPrompt = $"{systemPrompt}\n\nUser: {userPrompt}";

            var exec = new OpenAIPromptExecutionSettings {
                ModelId = ModelId,
                Temperature = Temperature,
                MaxTokens = MaxTokens
            };

            if (RequireJsonOutput) {
                exec.ResponseFormat = "json_object";
                fullPrompt += "\n\nRespond with valid JSON only. No text outside the object.";
            }

            _semanticLogger.LogDebug("[{ActivityId}] Sending prompt to {ModelId}", Id, ModelId);

            // Run the OpenAI call
            var response = await _chatCompletion.GetChatMessageContentAsync(
                fullPrompt,
                exec,
                cancellationToken: cancellationToken);

            var text = response.Content ?? string.Empty;
            stopwatch.Stop();

            var tokens = response.Metadata?.TryGetValue("token_count", out var tk) == true
                ? Convert.ToInt32(tk)
                : 0;

            otelActivity?.SetTag("duration.ms", stopwatch.Elapsed.TotalMilliseconds);
            otelActivity?.SetTag("tokens.used", tokens);
            otelActivity?.SetTag("response.length", text.Length);

            _semanticLogger.LogInformation(
                "[{ActivityId}] Model={ModelId}, Tokens={Tokens}, Duration={Duration} ms",
                Id, ModelId, tokens, stopwatch.ElapsedMilliseconds);

            var processed = await ProcessResponseAsync(context, input, text);
            processed = await OnResponseReadyAsync(context, processed);
            await StoreResultsInContextAsync(context, processed);

            // After storing the raw/JSON result, optionally project any
            // configured intelligence signals into the aggregated store.
            await ExtractAndMergeIntelligenceAsync(context, processed);

            return ActivityResult.Continue(processed, processed);
        } catch (OperationCanceledException) {
            stopwatch.Stop();
            _semanticLogger.LogWarning("[{ActivityId}] Canceled", Id);
            return ActivityResult.Continue("Operation canceled.");
        } catch (JsonException ex) {
            stopwatch.Stop();
            _semanticLogger.LogWarning(ex, "[{ActivityId}] Invalid JSON", Id);
            return await HandleErrorAsync(context, input, ex, "Invalid JSON format received.");
        } catch (Exception ex) {
            stopwatch.Stop();
            _semanticLogger.LogError(ex, "[{ActivityId}] Error executing semantic activity", Id);
            return await HandleErrorAsync(context, input, ex);
        }
    }

    // ============================================================
    // PROMPT BUILDERS
    // ============================================================
    protected abstract Task<string> BuildSystemPromptAsync(TopicWorkflowContext context, object? input);
    protected abstract Task<string> BuildUserPromptAsync(TopicWorkflowContext context, object? input);

    // ============================================================
    // RESPONSE PROCESSING / CONTEXT STORAGE
    // ============================================================
    protected virtual async Task<string> ProcessResponseAsync(
        TopicWorkflowContext context, object? input, string response) {
        await Task.CompletedTask;

        if (RequireJsonOutput) {
            try { JsonDocument.Parse(response); } catch (JsonException) {
                _semanticLogger.LogWarning("[{ActivityId}] Attempting JSON cleanup", Id);
                response = ExtractJsonFromResponse(response);
            }
        }
        return response;
    }

    protected virtual async Task<string> OnResponseReadyAsync(
        TopicWorkflowContext context, string response) {
        await Task.CompletedTask;
        return response.Trim();
    }

    protected async Task StoreResultsInContextAsync(
        TopicWorkflowContext context, string response) {
        await Task.CompletedTask;
        var key = $"{Id}_Result";
        context.SetValue(key, response);

        if (RequireJsonOutput) {
            try {
                var jsonDoc = JsonDocument.Parse(response);
                context.SetValue($"{key}_Json", jsonDoc);
            } catch (JsonException ex) {
                _semanticLogger.LogWarning(ex,
                    "[{ActivityId}] JSON parse failed during storage", Id);
            }
        }

        _semanticLogger.LogDebug("[{ActivityId}] Stored result in context (Key={Key})", Id, key);
    }

    protected virtual async Task<ActivityResult> HandleErrorAsync(
        TopicWorkflowContext context, object? input, Exception ex, string? userMessage = null) {
        await Task.CompletedTask;
        var msg = userMessage ?? "Sorry, an error occurred while processing your request.";
        context.SetValue($"{Id}_Error", ex.Message);
        return ActivityResult.Continue(msg);
    }

    // ============================================================
    // UTILITIES
    // ============================================================
    private static string ExtractJsonFromResponse(string text) {
        try {
            int start = text.IndexOf('{');
            int end = text.LastIndexOf('}');
            if (start >= 0 && end > start) return text[start..(end + 1)];
            start = text.IndexOf('[');
            end = text.LastIndexOf(']');
            if (start >= 0 && end > start) return text[start..(end + 1)];
        } catch { }
        return text;
    }

    // ============================================================
    // DATA INTELLIGENCE CONFIGURATION & EXTRACTION
    // ============================================================

    /// <summary>
    /// Enables data-intelligence extraction for this semantic activity
    /// with an explicit configuration describing how to map JSON/text
    /// fields into logical intelligence paths.
    /// </summary>
    public SemanticActivity WithDataIntelligence(Action<DataIntelligenceConfig> configure)
    {
        if (configure == null) return this;

        _dataIntelligenceConfig ??= new DataIntelligenceConfig();
        configure(_dataIntelligenceConfig);
        return this;
    }

    /// <summary>
    /// Enables generic data-intelligence extraction with no manual
    /// mappings. The activity will treat the semantic response as a
    /// single JSON object and, for each top-level property, store the
    /// value directly into the workflow context using the property
    /// name as the key.
    /// </summary>
    public SemanticActivity WithDataIntelligence()
    {
        _dataIntelligenceConfig ??= new DataIntelligenceConfig();
        _dataIntelligenceConfig.AutoMapAllJsonProperties = true;
        return this;
    }

    /// <summary>
    /// Parses the semantic response according to the configured
    /// DataIntelligence mappings and merges any extracted signals
    /// into the TopicWorkflowContext intelligence store.
    /// </summary>
    private async Task ExtractAndMergeIntelligenceAsync(TopicWorkflowContext context, string response)
    {
        await Task.CompletedTask;

        if (_dataIntelligenceConfig == null)
            return;

        JsonElement? rootJson = null;

        // Prefer an already-parsed JSON result if available.
        if (RequireJsonOutput || _dataIntelligenceConfig.PreferJson || _dataIntelligenceConfig.AutoMapAllJsonProperties)
        {
            if (context.TryGetValue($"{Id}_Result_Json", out object? jsonObj) && jsonObj is JsonDocument doc)
            {
                rootJson = doc.RootElement;
            }
            else
            {
                try
                {
                    using var parsed = JsonDocument.Parse(response);
                    rootJson = parsed.RootElement.Clone();
                }
                catch
                {
                    // If JSON parsing fails, we silently skip JSON-based mappings.
                    rootJson = null;
                }
            }
        }

        // If AutoMapAllJsonProperties is enabled and we have a
        // JSON object, push each top-level property directly into
        // the workflow context using its name as the key.
        if (_dataIntelligenceConfig.AutoMapAllJsonProperties &&
            rootJson is { ValueKind: JsonValueKind.Object } obj)
        {
            foreach (var prop in obj.EnumerateObject())
            {
                var raw = JsonElementToDotNet(prop.Value);
                if (raw != null)
                {
                    context.SetValue(prop.Name, raw);
                }
            }
        }

        if (_dataIntelligenceConfig.Mappings.Count == 0)
            return;

        foreach (var mapping in _dataIntelligenceConfig.Mappings)
        {
            if (mapping.SourceKind == DataIntelligenceSourceKind.Json)
            {
                if (rootJson is null)
                    continue;

                if (TryExtractFromJson(rootJson.Value, mapping.JsonPath, out var raw))
                {
                    var value = mapping.Convert != null ? mapping.Convert(raw) : raw;
                    if (value != null)
                    {
                        context.MergeIntelligence(
                            mapping.IntelligencePath,
                            value,
                            mapping.DefaultConfidence,
                            mapping.SourceLabel ?? "Semantic",
                            Id);
                    }
                }
            }
            else if (mapping.SourceKind == DataIntelligenceSourceKind.Text)
            {
                if (string.IsNullOrWhiteSpace(response))
                    continue;

                var value = mapping.Convert != null ? mapping.Convert(response) : response;
                if (value != null)
                {
                    context.MergeIntelligence(
                        mapping.IntelligencePath,
                        value,
                        mapping.DefaultConfidence,
                        mapping.SourceLabel ?? "Semantic",
                        Id);
                }
            }
        }
    }

    private static bool TryExtractFromJson(JsonElement root, string jsonPath, out object? value)
    {
        value = null;
        if (string.IsNullOrWhiteSpace(jsonPath))
            return false;

        var segments = jsonPath.Split('.', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var cursor = root;

        foreach (var segment in segments)
        {
            if (cursor.ValueKind != JsonValueKind.Object)
                return false;

            if (!cursor.TryGetProperty(segment, out var next))
                return false;

            cursor = next;
        }

        value = JsonElementToDotNet(cursor);
        return value != null;
    }

    private static object? JsonElementToDotNet(JsonElement element)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.String:
                return element.GetString();
            case JsonValueKind.Number:
                if (element.TryGetInt64(out var i64))
                    return i64;
                if (element.TryGetDouble(out var dbl))
                    return dbl;
                return null;
            case JsonValueKind.True:
            case JsonValueKind.False:
                return element.GetBoolean();
            case JsonValueKind.Null:
            case JsonValueKind.Undefined:
                return null;
            default:
                return element.ToString();
        }
    }
}

/// <summary>
/// Configuration for extracting structured data intelligence from
/// semantic activity responses.
/// </summary>
public sealed class DataIntelligenceConfig
{
    /// <summary>
    /// When true, the extractor will first attempt to parse the
    /// semantic response as JSON even if RequireJsonOutput is false.
    /// </summary>
    public bool PreferJson { get; set; } = true;

    /// <summary>
    /// When true and no explicit mappings are provided, the extractor
    /// will treat the response as a JSON object and write each
    /// top-level property directly into the workflow context using
    /// the property name as the key.
    /// </summary>
    public bool AutoMapAllJsonProperties { get; set; } = false;

    /// <summary>
    /// Collection of mapping rules describing how to transform
    /// JSON or plain-text responses into intelligence signals.
    /// </summary>
    public List<DataIntelligenceMapping> Mappings { get; } = new();
}

public enum DataIntelligenceSourceKind
{
    Json,
    Text
}

/// <summary>
/// Describes how to map a fragment of a semantic response into a
/// logical intelligence path inside TopicWorkflowContext.
/// </summary>
public sealed class DataIntelligenceMapping
{
    /// <summary>
    /// Where to pull the source value from (JSON vs raw text).
    /// </summary>
    public DataIntelligenceSourceKind SourceKind { get; set; } = DataIntelligenceSourceKind.Json;

    /// <summary>
    /// JSON path expressed as dot-separated property names
    /// (e.g., "person.first_name"). Ignored for text mappings.
    /// </summary>
    public string JsonPath { get; set; } = string.Empty;

    /// <summary>
    /// Logical intelligence path (e.g., "Person.FirstName").
    /// </summary>
    public string IntelligencePath { get; set; } = string.Empty;

    /// <summary>
    /// Default confidence score in [0,1] for this mapping.
    /// </summary>
    public double DefaultConfidence { get; set; } = 0.7;

    /// <summary>
    /// Human-readable label describing the source of this signal
    /// (e.g., "SemanticExtraction", "Card").
    /// </summary>
    public string? SourceLabel { get; set; }
        = "SemanticExtraction";

    /// <summary>
    /// Optional converter allowing custom transformation of the
    /// raw extracted value before it is stored as intelligence.
    /// For JSON mappings the input is the extracted fragment; for
    /// text mappings the input is the full response string.
    /// </summary>
    public Func<object?, object?>? Convert { get; set; }
        = null;
}

/// <summary>
/// Default configuration options for SemanticActivity.
/// </summary>
public class SemanticActivityOptions {
    public string DefaultModelId { get; set; } = "gpt-4o-mini";
    public float DefaultTemperature { get; set; } = 0.7f;
    public int DefaultMaxTokens { get; set; } = 2048;
    public bool RequireJsonOutput { get; set; } = false;
}
