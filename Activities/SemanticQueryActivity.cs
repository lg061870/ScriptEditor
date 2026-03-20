using ConversaCore.Interfaces;
using Microsoft.Extensions.Logging;
using Microsoft.SemanticKernel;
using System.Text.Json;

namespace ConversaCore.TopicFlow;

/// <summary>
/// A semantic reasoning activity that applies a structured JSON rule set (TRuleSet)
/// to a given data input (TInput), producing a typed output (TOutput).
/// </summary>
public class SemanticQueryActivity<TRuleSet, TInput, TOutput> : SemanticActivity
    where TRuleSet : IDomainRuleSet
    where TInput : class
    where TOutput : IDomainOutput {
    private readonly TRuleSet _ruleSet;
    private readonly TInput? _staticInput;
    private readonly Func<TInput>? _inputFactory;
    private readonly string? _outputGuidelinesPrompt;

    private readonly JsonSerializerOptions _jsonOptions = new() {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public SemanticQueryActivity(
        string id,
        Kernel kernel,
        ILogger logger,
        TRuleSet ruleSet,
        TInput input,
        string? outputGuidelinesPrompt = null)
        : base(id, kernel, logger) {
        _ruleSet = ruleSet ?? throw new ArgumentNullException(nameof(ruleSet));
        _staticInput = input ?? throw new ArgumentNullException(nameof(input));
        _outputGuidelinesPrompt = outputGuidelinesPrompt;
        RequireJsonOutput = true;
    }

    public SemanticQueryActivity(
        string id,
        Kernel kernel,
        ILogger logger,
        TRuleSet ruleSet,
        Func<TInput> inputFactory,
        string? outputGuidelinesPrompt = null,
        bool runInBackground = false)
        : base(id, kernel, logger) {
        _ruleSet = ruleSet ?? throw new ArgumentNullException(nameof(ruleSet));
        _inputFactory = inputFactory ?? throw new ArgumentNullException(nameof(inputFactory));
        _outputGuidelinesPrompt = outputGuidelinesPrompt;
        RunInBackground = runInBackground;
        RequireJsonOutput = true;
    }

    // ============================================================
    // INPUT RESOLUTION
    // ============================================================
    private TInput ResolveInput() {
        if (_inputFactory != null) {
            var input = _inputFactory();
            if (input == null)
                throw new InvalidOperationException($"Input factory for '{Id}' returned null.");
            return input;
        }

        if (_staticInput == null)
            throw new InvalidOperationException($"No input or input factory defined for '{Id}'.");

        return _staticInput;
    }

    // ============================================================
    // PROMPT BUILDERS
    // ============================================================
    protected override Task<string> BuildSystemPromptAsync(TopicWorkflowContext context, object? userInput) {
        var input = ResolveInput();
        var ruleJson = _ruleSet.ToJson();
        var inputJson = JsonSerializer.Serialize(input, _jsonOptions);
        var schemaJson = BuildOutputSchemaExample<TOutput>();

        var sysPrompt =
$@"You are a precise analytical reasoning engine.
Your task is to apply the provided JSON-based rule set to the input data
and produce a structured decision strictly matching the expected JSON schema.

### EXPECTED OUTPUT FORMAT
{schemaJson}

### RULE SET
{ruleJson}

### INPUT DATA
{inputJson}

### OUTPUT REQUIREMENTS
- Output ONLY valid JSON matching the expected format above.
- Do NOT include commentary, markdown, or text outside JSON.
- Apply all rules consistently.
- If uncertain, make the best determination using the provided rules.
- If no rule applies, output empty or null properties.";

        if (!string.IsNullOrWhiteSpace(_outputGuidelinesPrompt))
            sysPrompt += "\n\n### ADDITIONAL OUTPUT GUIDELINES\n" + _outputGuidelinesPrompt;

        return Task.FromResult(sysPrompt);
    }

    protected override Task<string> BuildUserPromptAsync(TopicWorkflowContext context, object? userInput) {
        var msg = userInput?.ToString() ?? "Apply the rules above to the input and return the decision JSON.";
        return Task.FromResult(msg);
    }

    // ============================================================
    // RESPONSE HANDLING
    // ============================================================
    protected override async Task<string> ProcessResponseAsync(
        TopicWorkflowContext context,
        object? input,
        string response) {
        response = await base.ProcessResponseAsync(context, input, response);

        try {
            if (response.StartsWith("\"") && response.EndsWith("\"")) {
                try { response = JsonSerializer.Deserialize<string>(response) ?? response; } catch { }
            }

            var obj = JsonSerializer.Deserialize<TOutput>(response, _jsonOptions);
            if (obj != null) {
                var key = $"output_query_{Id.ToLowerInvariant()}";
                context.SetValue(key, obj);
                context.SetValue($"{key}_json", response);
                context.SetValue("qualifiedCarriers", obj);
                context.SetValue($"{key}_status", "completed");

                _semanticLogger.LogInformation("[{ActivityId}] ✅ Stored semantic output under '{ContextKey}'", Id, key);
            }
            else {
                context.SetValue($"{Id}_status", "failed_null_output");
            }
        } catch (JsonException ex) {
            _semanticLogger.LogWarning(ex,
                "[{ActivityId}] ⚠️ Failed to parse JSON response into {OutputType}.", Id, typeof(TOutput).Name);
            context.SetValue($"{Id}_raw_response", response);
            context.SetValue($"{Id}_status", "failed_parse_error");
        }

        return response.Trim();
    }

    // ============================================================
    // SCHEMA GENERATION UTILITIES
    // ============================================================
    private static string BuildOutputSchemaExample<T>() {
        try {
            var instance = Activator.CreateInstance<T>();
            if (instance != null) {
                PopulateExampleValues(instance);
                return JsonSerializer.Serialize(instance, new JsonSerializerOptions {
                    WriteIndented = true,
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                });
            }

            return JsonSerializer.Serialize(DescribeType(typeof(T)), new JsonSerializerOptions { WriteIndented = true });
        } catch {
            return JsonSerializer.Serialize(DescribeType(typeof(T)), new JsonSerializerOptions { WriteIndented = true });
        }
    }

    private static void PopulateExampleValues(object obj) {
        var type = obj.GetType();

        if (typeof(System.Collections.IList).IsAssignableFrom(type)) {
            var list = obj as System.Collections.IList;
            var elemType = type.IsGenericType
                ? type.GetGenericArguments()[0]
                : (type.IsArray ? type.GetElementType() ?? typeof(object) : typeof(object));

            for (int i = 0; i < 2; i++) {
                var elem = Activator.CreateInstance(elemType);
                if (elem != null) {
                    PopulateExampleValues(elem);
                    list?.Add(elem);
                }
            }
            return;
        }

        foreach (var prop in type.GetProperties()) {
            if (!prop.CanWrite) continue;
            var propType = Nullable.GetUnderlyingType(prop.PropertyType) ?? prop.PropertyType;

            try {
                if (propType == typeof(string)) prop.SetValue(obj, prop.Name);
                else if (propType.IsEnum) prop.SetValue(obj, Enum.GetValues(propType).GetValue(0));
                else if (propType == typeof(int) || propType == typeof(double) || propType == typeof(decimal)) prop.SetValue(obj, 0);
                else if (propType == typeof(bool)) prop.SetValue(obj, false);
                else if (typeof(System.Collections.IList).IsAssignableFrom(propType)) {
                    var list = Activator.CreateInstance(propType) as System.Collections.IList;
                    var elemType = propType.IsGenericType
                        ? propType.GetGenericArguments()[0]
                        : (propType.IsArray ? propType.GetElementType() ?? typeof(object) : typeof(object));

                    for (int i = 0; i < 2; i++) {
                        var elem = Activator.CreateInstance(elemType);
                        if (elem != null) {
                            PopulateExampleValues(elem);
                            list?.Add(elem);
                        }
                    }
                    prop.SetValue(obj, list);
                }
                else if (propType.IsClass && propType != typeof(string)) {
                    var sub = Activator.CreateInstance(propType);
                    if (sub != null) {
                        PopulateExampleValues(sub);
                        prop.SetValue(obj, sub);
                    }
                }
            } catch { }
        }
    }

    private static object DescribeType(Type type) {
        type = Nullable.GetUnderlyingType(type) ?? type;
        if (type == typeof(string)) return "string";
        if (type.IsPrimitive || type == typeof(decimal)) return 0;
        if (type == typeof(bool)) return false;

        if (typeof(System.Collections.IEnumerable).IsAssignableFrom(type) && type != typeof(string)) {
            var elemType = type.IsArray
                ? type.GetElementType() ?? typeof(object)
                : (type.IsGenericType ? type.GetGenericArguments()[0] : typeof(object));
            return new List<object> { DescribeType(elemType!) };
        }

        var props = type.GetProperties()
            .Where(p => p.GetMethod != null)
            .ToDictionary(
                p => char.ToLowerInvariant(p.Name[0]) + p.Name.Substring(1),
                p => DescribeType(Nullable.GetUnderlyingType(p.PropertyType) ?? p.PropertyType));

        return props;
    }

    // ============================================================
    // STATIC BUILDERS
    // ============================================================
    public static Task<SemanticQueryActivity<TRuleSet, TInput, TOutput>> CreateAsync(
        string id,
        Kernel kernel,
        ILogger logger,
        TRuleSet ruleSet,
        TInput? input = null,
        Func<TInput>? inputFactory = null,
        string? outputGuidelinesPrompt = null,
        bool runInBackground = false) {
        if (ruleSet == null) throw new ArgumentNullException(nameof(ruleSet));
        if (kernel == null) throw new ArgumentNullException(nameof(kernel));
        if (logger == null) throw new ArgumentNullException(nameof(logger));
        if (input == null && inputFactory == null)
            throw new ArgumentException("Either input or inputFactory must be provided.");

        var activity = inputFactory != null
            ? new SemanticQueryActivity<TRuleSet, TInput, TOutput>(id, kernel, logger, ruleSet, inputFactory, outputGuidelinesPrompt, runInBackground)
            : new SemanticQueryActivity<TRuleSet, TInput, TOutput>(id, kernel, logger, ruleSet, input!, outputGuidelinesPrompt);

        return Task.FromResult(activity);
    }
}
