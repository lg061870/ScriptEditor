using System.Text.Json;
using ConversaCore.TopicFlow;
using Microsoft.Extensions.Logging;
using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;
using Microsoft.SemanticKernel.Connectors.OpenAI;

namespace ConversaCore.TopicFlow;

/// <summary>
/// Generic decision activity that uses AI to analyze input data against rules/context and produce structured output.
/// Follows the AdaptiveCardActivity pattern with generic type parameters.
/// </summary>
/// <typeparam name="TInput">Type representing the input data (rules, context, etc.)</typeparam>
/// <typeparam name="TEvidence">Type representing the evidence to be analyzed</typeparam>
/// <typeparam name="TResponse">Type representing the expected response structure</typeparam>
public class DecisionActivity<TInput, TEvidence, TResponse> : TopicFlowActivity
    where TInput : class
    where TEvidence : class  
    where TResponse : class
{
    private readonly Kernel _kernel;
    private readonly ILogger _logger;
    private readonly TInput _input;
    private readonly string _evidenceContextKey;
    private readonly string _systemPrompt;
    private readonly string _userPromptTemplate;
    private readonly float _temperature;
    private readonly string _modelId;
    private readonly bool _requireJsonOutput;

    public DecisionActivity(
        string activityId,
        Kernel kernel,
        ILogger logger,
        TInput input,
        string evidenceContextKey,
        string systemPrompt,
        string userPromptTemplate,
        float temperature = 0.3f,
        string modelId = "gpt-4o",
        bool requireJsonOutput = true) : base(activityId)
    {
        _kernel = kernel ?? throw new ArgumentNullException(nameof(kernel));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _input = input ?? throw new ArgumentNullException(nameof(input));
        _evidenceContextKey = evidenceContextKey ?? throw new ArgumentNullException(nameof(evidenceContextKey));
        _systemPrompt = systemPrompt ?? throw new ArgumentNullException(nameof(systemPrompt));
        _userPromptTemplate = userPromptTemplate ?? throw new ArgumentNullException(nameof(userPromptTemplate));
        _temperature = temperature;
        _modelId = modelId;
        _requireJsonOutput = requireJsonOutput;
    }

    protected override async Task<ActivityResult> RunActivity(
        TopicWorkflowContext context,
        object? input = null,
        CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation($"Executing DecisionActivity: {Id}");

            // Get evidence from context
            var evidence = context.GetValue<TEvidence>(_evidenceContextKey);
            if (evidence == null)
            {
                var errorMsg = $"Evidence not found in context with key: {_evidenceContextKey}";
                _logger.LogError(errorMsg);
                return ActivityResult.End(errorMsg);
            }

            // Build prompts
            var systemPrompt = await BuildSystemPromptAsync(context);
            var userPrompt = await BuildUserPromptAsync(context, evidence);

            // Execute AI decision (with stricter JSON enforcement and repair loop)
            var response = await ExecuteAIDecisionAsync(systemPrompt, userPrompt, cancellationToken);

            // Process and store results
            await ProcessResponseAsync(context, response);

            _logger.LogInformation($"DecisionActivity {Id} completed successfully");
            return ActivityResult.Continue($"Decision analysis completed using {_modelId}");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error in DecisionActivity {Id}: {ex.Message}");
            return ActivityResult.End($"Decision analysis failed: {ex.Message}");
        }
    }

    protected virtual async Task<string> BuildSystemPromptAsync(TopicWorkflowContext context)
    {
        var prompt = _systemPrompt;

        // Add input data context
        var inputJson = JsonSerializer.Serialize(_input, new JsonSerializerOptions { WriteIndented = true });
        prompt += $"\n\nInput Data/Rules:\n{inputJson}";

        if (_requireJsonOutput)
        {
            var responseStructure = GetResponseStructure();
            prompt += $"\n\nYou must respond with valid JSON matching this structure:\n{responseStructure}";
        }

        return await Task.FromResult(prompt);
    }

    protected virtual async Task<string> BuildUserPromptAsync(TopicWorkflowContext context, TEvidence evidence)
    {
        var evidenceJson = JsonSerializer.Serialize(evidence, new JsonSerializerOptions { WriteIndented = true });
        
        // Replace template variables
        var userPrompt = _userPromptTemplate
            .Replace("{evidence}", evidenceJson)
            .Replace("{evidenceJson}", evidenceJson);

        // Replace context variables (e.g., {context.UserProfile})
        userPrompt = ReplaceContextVariables(userPrompt, context);

        return await Task.FromResult(userPrompt);
    }

    protected virtual async Task<string> ExecuteAIDecisionAsync(string systemPrompt, string userPrompt, CancellationToken cancellationToken)
    {
        var chatService = _kernel.GetRequiredService<IChatCompletionService>();

        // Prepare strict JSON output guideline
        var responseStructure = GetResponseStructure();
        var jsonGuidelines = "You MUST respond with ONLY valid JSON that matches the schema below. Do not include any extra explanation, markdown, or surrounding text. If you cannot fill a field, use null or an empty array where appropriate.\n\nSchema:\n" + responseStructure;

        var chatHistory = new ChatHistory();
        chatHistory.AddSystemMessage(systemPrompt + "\n\n" + jsonGuidelines);
        chatHistory.AddUserMessage(userPrompt);

        var executionSettings = new OpenAIPromptExecutionSettings
        {
            Temperature = Math.Max(0f, Math.Min(0.2f, _temperature)),
            ModelId = _modelId,
            MaxTokens = 4000
        };

        var attempt = 0;
        string lastResponse = string.Empty;

        while (attempt < 3 && !cancellationToken.IsCancellationRequested)
        {
            attempt++;
            var response = await chatService.GetChatMessageContentAsync(chatHistory, executionSettings, cancellationToken: cancellationToken);
            lastResponse = response.Content ?? string.Empty;

            var json = ExtractJsonFromResponse(lastResponse);
            if (IsValidJson(json))
            {
                return json;
            }

            // Ask the model to extract and return only the JSON
            var repairPrompt = "The previous response was not valid JSON. Extract the JSON object or array from the previous response and return ONLY the valid JSON that matches the schema. Do not include any extra text. Previous response:\n" + lastResponse;

            chatHistory = new ChatHistory();
            chatHistory.AddSystemMessage(systemPrompt + "\n\n" + jsonGuidelines);
            chatHistory.AddUserMessage(repairPrompt);

            await Task.Delay(250, cancellationToken).ContinueWith(_ => { });
        }

        return lastResponse;
    }

    protected virtual async Task ProcessResponseAsync(TopicWorkflowContext context, string response)
    {
        // Store raw response
        context.SetValue($"{Id}_RawResponse", response);

        if (_requireJsonOutput)
        {
            try
            {
                var jsonContent = response; // ExecuteAIDecisionAsync should return cleaned JSON when possible

                using var doc = JsonDocument.Parse(jsonContent);
                var jsonObject = JsonSerializer.Deserialize<object>(jsonContent);
                context.SetValue($"{Id}_JsonResult", jsonObject);

                var typedResponse = JsonSerializer.Deserialize<TResponse>(jsonContent);
                context.SetValue($"{Id}_TypedResponse", typedResponse);
                context.SetValue($"{Id}_Response", typedResponse);

                // Persist common fields for auditing
                try
                {
                    if (doc.RootElement.ValueKind == JsonValueKind.Object)
                    {
                        if (doc.RootElement.TryGetProperty("matched_rules", out var mr))
                        {
                            context.SetValue($"{Id}_MatchedRules", JsonSerializer.Deserialize<string[]>(mr.GetRawText()));
                        }
                        if (doc.RootElement.TryGetProperty("decision", out var dec))
                        {
                            context.SetValue($"{Id}_Decision", dec.ToString());
                        }
                        if (doc.RootElement.TryGetProperty("justification", out var just))
                        {
                            context.SetValue($"{Id}_Justification", just.ToString());
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(ex, "Failed to extract standard fields from JSON response for {Id}", Id);
                }

                _logger.LogInformation($"Successfully parsed JSON response for {Id}");
            }
            catch (JsonException ex)
            {
                _logger.LogWarning(ex, $"Failed to parse JSON response for {Id}, storing as raw text");
                context.SetValue($"{Id}_Response", response);
            }
        }
        else
        {
            context.SetValue($"{Id}_Response", response);
        }

        await Task.CompletedTask;
    }

    private string GetResponseStructure()
    {
        try
        {
            // Create a sample instance to show the expected JSON structure
            var sample = Activator.CreateInstance<TResponse>();
            return JsonSerializer.Serialize(sample, new JsonSerializerOptions { WriteIndented = true });
        }
        catch
        {
            // Fallback to type information
            return $"Object of type {typeof(TResponse).Name}";
        }
    }

    private string ExtractJsonFromResponse(string response)
    {
        // Try to extract JSON from response that might contain additional text
        var trimmed = response.Trim();
        
        // Look for JSON object boundaries
        var startIndex = trimmed.IndexOf('{');
        var lastIndex = trimmed.LastIndexOf('}');
        
        if (startIndex >= 0 && lastIndex > startIndex)
        {
            return trimmed.Substring(startIndex, lastIndex - startIndex + 1);
        }
        
        // Look for JSON array boundaries
        startIndex = trimmed.IndexOf('[');
        lastIndex = trimmed.LastIndexOf(']');
        
        if (startIndex >= 0 && lastIndex > startIndex)
        {
            return trimmed.Substring(startIndex, lastIndex - startIndex + 1);
        }
        
        // Return as-is if no JSON boundaries found
        return response;
    }

    private bool IsValidJson(string json)
    {
        if (string.IsNullOrWhiteSpace(json)) return false;
        try
        {
            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.ValueKind == JsonValueKind.Object || doc.RootElement.ValueKind == JsonValueKind.Array;
        }
        catch
        {
            return false;
        }
    }

    private string ReplaceContextVariables(string template, TopicWorkflowContext context)
    {
        // Simple variable replacement for {context.VariableName} patterns
        var result = template;
        
        // Basic replacement for common context variables
        // This could be enhanced with more sophisticated template parsing
        var commonKeys = new[] { "UserProfile", "LeadInfo", "DocumentEvidence", "ConversationEvidence" };
        
        foreach (var key in commonKeys)
        {
            var placeholder = $"{{context.{key}}}";
            if (result.Contains(placeholder))
            {
                try
                {
                    var value = context.GetValue<object>(key);
                    var valueStr = value?.ToString() ?? "null";
                    result = result.Replace(placeholder, valueStr);
                }
                catch
                {
                    // Ignore if key doesn't exist
                }
            }
        }
        
        return result;
    }
}