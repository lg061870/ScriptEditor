using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ConversaCore.Cards;
using ConversaCore.Context;
using Microsoft.Extensions.Logging;

namespace ConversaCore.TopicFlow;

/// <summary>
/// Activity that promotes topic-level context variables to conversation-global scope.
/// Inspired by Copilot Studio's Global Variables pattern for cross-topic data sharing.
/// </summary>
public class GlobalVariableActivity : TopicFlowActivity
{
    protected readonly IConversationContext ConversationContext;
    protected readonly ILogger<GlobalVariableActivity> Logger;
    
    /// <summary>
    /// Function to determine which context keys should be promoted to global scope.
    /// Return true to promote the key-value pair to conversation-global storage.
    /// </summary>
    public Func<string, object?, bool> ShouldPromoteToGlobal { get; set; } = (key, value) => true;

    public GlobalVariableActivity(
        string id,
        IConversationContext conversationContext,
        ILogger<GlobalVariableActivity> logger)
        : base(id, logger)
    {
        ConversationContext = conversationContext ?? throw new ArgumentNullException(nameof(conversationContext));
        Logger = logger ?? throw new ArgumentNullException(nameof(logger));
        
        Name = "Global Variable Promotion";
        Description = "Promotes topic context variables to conversation-global scope";
    }

    protected override Task<ActivityResult> RunActivity(
        TopicWorkflowContext context,
        object? input = null,
        CancellationToken cancellationToken = default)
    {
        var promotedCount = 0;
        var allKeys = context.GetKeys().ToList();

        Logger.LogInformation("[{ActivityId}] Evaluating {KeyCount} context keys for global promotion", 
            Id, allKeys.Count);

        foreach (var key in allKeys)
        {
            var value = context.GetValue<object>(key);
            
            if (ShouldPromoteToGlobal(key, value))
            {
                // Store in conversation context with Global_ prefix to avoid conflicts
                var globalKey = $"Global_{key}";
                if (value != null)
                    ConversationContext.SetValue(globalKey, value);
                
                Logger.LogDebug("[{ActivityId}] Promoted {Key} → {GlobalKey}", Id, key, globalKey);
                promotedCount++;
            }
        }

        Logger.LogInformation("[{ActivityId}] Promoted {PromotedCount} variables to global scope", 
            Id, promotedCount);

        return Task.FromResult(ActivityResult.Continue($"Promoted {promotedCount} variables to global scope"));
    }
}

/// <summary>
/// Strongly-typed version for promoting specific models to global scope.
/// </summary>
public class GlobalVariableActivity<T> : TopicFlowActivity
    where T : class
{
    protected readonly IConversationContext ConversationContext;
    protected readonly ILogger<GlobalVariableActivity<T>> Logger;
    
    /// <summary>
    /// The context key to read the model from topic-level context.
    /// </summary>
    public string SourceKey { get; set; }
    
    /// <summary>
    /// The key to store the model in conversation-global context.
    /// If null, defaults to "Global_{typeof(T).Name}".
    /// </summary>
    public string? GlobalKey { get; set; }

    public GlobalVariableActivity(
        string id,
        string sourceKey,
        IConversationContext conversationContext,
        ILogger<GlobalVariableActivity<T>> logger,
        string? globalKey = null)
        : base(id, logger)
    {
        ConversationContext = conversationContext ?? throw new ArgumentNullException(nameof(conversationContext));
        Logger = logger ?? throw new ArgumentNullException(nameof(logger));
        SourceKey = sourceKey ?? throw new ArgumentNullException(nameof(sourceKey));
        GlobalKey = globalKey ?? $"Global_{typeof(T).Name}";
        
        Name = $"Global Variable Promotion ({typeof(T).Name})";
        Description = $"Promotes {typeof(T).Name} model to conversation-global scope";
    }

    protected override Task<ActivityResult> RunActivity(
        TopicWorkflowContext context,
        object? input = null,
        CancellationToken cancellationToken = default)
    {
        var value = context.GetValue<T>(SourceKey);
        
        if (value != null)
        {
            ConversationContext.SetValue(GlobalKey!, value);
            Logger.LogInformation("[{ActivityId}] Promoted {ModelType} from {SourceKey} to {GlobalKey}", 
                Id, typeof(T).Name, SourceKey, GlobalKey);
            
            return Task.FromResult(ActivityResult.Continue($"Promoted {typeof(T).Name} to global scope"));
        }
        else
        {
            Logger.LogWarning("[{ActivityId}] No {ModelType} found at {SourceKey} to promote", 
                Id, typeof(T).Name, SourceKey);
            
            return Task.FromResult(ActivityResult.Continue($"No {typeof(T).Name} found to promote"));
        }
    }
}

/// <summary>
/// Builder pattern for creating GlobalVariableActivity instances.
/// </summary>
public static class GlobalVariableActivityBuilder
{
    /// <summary>
    /// Creates a general GlobalVariableActivity with custom promotion logic.
    /// </summary>
    public static GlobalVariableActivity Create(
        string id,
        IConversationContext conversationContext,
        ILogger<GlobalVariableActivity> logger,
        Func<string, object?, bool>? promotionFilter = null)
    {
        var activity = new GlobalVariableActivity(id, conversationContext, logger);
        
        if (promotionFilter != null)
        {
            activity.ShouldPromoteToGlobal = promotionFilter;
        }
        
        return activity;
    }

    /// <summary>
    /// Creates a strongly-typed GlobalVariableActivity for a specific model type.
    /// </summary>
    public static GlobalVariableActivity<T> CreateFor<T>(
        string id,
        string sourceKey,
        IConversationContext conversationContext,
        ILogger<GlobalVariableActivity<T>> logger,
        string? globalKey = null)
        where T : class
    {
        return new GlobalVariableActivity<T>(id, sourceKey, conversationContext, logger, globalKey);
    }

    /// <summary>
    /// Creates a GlobalVariableActivity that only promotes BaseCardModel instances.
    /// This ensures only validated form data gets promoted to global scope.
    /// </summary>
    public static GlobalVariableActivity CreateForModels(
        string id,
        IConversationContext conversationContext,
        ILogger<GlobalVariableActivity> logger)
    {
        return Create(id, conversationContext, logger, (key, value) =>
            value is BaseCardModel || key.EndsWith("Model", StringComparison.OrdinalIgnoreCase));
    }
}