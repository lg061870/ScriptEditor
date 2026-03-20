using ConversaCore.TopicFlow.Activities;
using Microsoft.Extensions.Logging;
using Microsoft.SemanticKernel;
using System.Text.RegularExpressions;

namespace ConversaCore.TopicFlow.Activities;

/// <summary>
/// General-purpose prompt activity for custom AI interactions within ConversaCore workflows.
/// Supports templated prompts with context variable substitution.
/// </summary>
public class PromptActivity : SemanticActivity
{
    public string SystemPrompt { get; set; } = string.Empty;
    public string UserPromptTemplate { get; set; } = string.Empty;

    public PromptActivity(string activityId, Kernel kernel, ILogger logger) 
        : base(activityId, kernel, logger)
    {
        Temperature = 0.7f; // Balanced temperature for most use cases
    }

    protected override async Task<string> BuildSystemPromptAsync(TopicWorkflowContext context, object? input)
    {
        await Task.CompletedTask;

        if (string.IsNullOrEmpty(SystemPrompt))
        {
            return "You are a helpful AI assistant. Provide clear, accurate, and relevant responses to user queries.";
        }

        // Substitute context variables in system prompt
        return SubstituteContextVariables(SystemPrompt, context);
    }

    protected override async Task<string> BuildUserPromptAsync(TopicWorkflowContext context, object? input)
    {
        await Task.CompletedTask;

        var userPrompt = UserPromptTemplate;

        if (string.IsNullOrEmpty(userPrompt))
        {
            // If no template provided, use the input directly
            userPrompt = input?.ToString() ?? "Please provide a helpful response.";
        }
        else
        {
            // Substitute context variables and input
            userPrompt = SubstituteContextVariables(userPrompt, context);
            
            // Replace {input} placeholder with actual input
            if (input != null)
            {
                userPrompt = userPrompt.Replace("{input}", input.ToString());
            }
        }

        return userPrompt;
    }

    /// <summary>
    /// Substitute context variables in prompt templates.
    /// Supports patterns like {variableName} and {context.keyName}
    /// </summary>
    private string SubstituteContextVariables(string template, TopicWorkflowContext context)
    {
        if (string.IsNullOrEmpty(template))
            return template;

        // Pattern to match {variableName} or {context.keyName}
        var pattern = @"\{([^}]+)\}";
        
        return Regex.Replace(template, pattern, match =>
        {
            var variableName = match.Groups[1].Value;
            
            try
            {
                // Handle context.keyName pattern
                if (variableName.StartsWith("context."))
                {
                    var contextKey = variableName.Substring(8); // Remove "context."
                    return context.GetValue<object>(contextKey)?.ToString() ?? match.Value;
                }
                
                // Handle direct variable names
                return context.GetValue<object>(variableName)?.ToString() ?? match.Value;
            }
            catch (Exception ex)
            {
                _semanticLogger.LogWarning(ex, "Failed to substitute context variable {VariableName}", variableName);
                return match.Value; // Return original if substitution fails
            }
        });
    }

    /// <summary>
    /// Set the system prompt for this activity
    /// </summary>
    public PromptActivity WithSystemPrompt(string systemPrompt)
    {
        SystemPrompt = systemPrompt;
        return this;
    }

    /// <summary>
    /// Set the user prompt template for this activity
    /// </summary>
    public PromptActivity WithUserPrompt(string userPromptTemplate)
    {
        UserPromptTemplate = userPromptTemplate;
        return this;
    }

    /// <summary>
    /// Configure this activity to require JSON output
    /// </summary>
    public PromptActivity AsJsonResponse()
    {
        RequireJsonOutput = true;
        return this;
    }

    /// <summary>
    /// Set the temperature for this activity
    /// </summary>
    public PromptActivity WithTemperature(float temperature)
    {
        Temperature = temperature;
        return this;
    }

    /// <summary>
    /// Set the model for this activity
    /// </summary>
    public PromptActivity WithModel(string modelId)
    {
        ModelId = modelId;
        return this;
    }
}