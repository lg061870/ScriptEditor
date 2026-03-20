using ConversaCore.Context;
using ConversaCore.Events;
using ConversaCore.Interfaces;
using Microsoft.Extensions.Logging;

namespace ConversaCore.TopicFlow;

/// <summary>
/// Simple fire-and-forget activity that asks the chat window to
/// briefly draw the user's attention to the text input prompt
/// (e.g., by pulsing/highlighting it and showing a short hint).
/// </summary>
public class ChatPromptAttentionActivity : TopicFlowActivity, ICustomEventTriggeredActivity
{
    public const string DefaultEventName = "PromptAttention";

    private readonly string? _message;
    private readonly int? _durationMs;
    private readonly ILogger<ChatPromptAttentionActivity>? _activityLogger;

    public event EventHandler<CustomEventTriggeredEventArgs>? CustomEventTriggered;

    /// <param name="id">Workflow-unique activity identifier.</param>
    /// <param name="message">Optional hint text to show near the prompt.</param>
    /// <param name="durationMs">Optional duration in milliseconds for any transient effect.</param>
    /// <param name="logger">Optional logger.</param>
    public ChatPromptAttentionActivity(
        string id,
        string? message = null,
        int? durationMs = null,
        ILogger<ChatPromptAttentionActivity>? logger = null)
        : base(id)
    {
        _message = message;
        _durationMs = durationMs;
        _activityLogger = logger;
    }

    protected override Task<ActivityResult> RunActivity(
        TopicWorkflowContext context,
        object? input = null,
        CancellationToken cancellationToken = default)
    {
        // Resolve the hint message: prefer the explicit constructor
        // value, but fall back to a context key if provided by the
        // topic (e.g., "PromptAttentionMessage").
        string? resolvedMessage = _message;

        if (string.IsNullOrWhiteSpace(resolvedMessage))
        {
            try
            {
                var fromContext = context.GetValue<string>("PromptAttentionMessage");
                if (!string.IsNullOrWhiteSpace(fromContext))
                    resolvedMessage = fromContext;
            }
            catch
            {
                // If the key is missing or context access fails,
                // silently fall back to a generic message.
            }
        }

        var payload = new ChatInteractionPayload
        {
            Type = ChatInteractionType.RequireUserAttention,
            Message = resolvedMessage,
            DurationMs = _durationMs
        };

        _activityLogger?.LogInformation(
            "[ChatPromptAttentionActivity] Emitting {Event} (Message='{Message}', DurationMs={Duration})",
            DefaultEventName,
            payload.Message,
            payload.DurationMs);

        var args = new CustomEventTriggeredEventArgs(DefaultEventName, payload, context, waitForResponse: false);
        CustomEventTriggered?.Invoke(this, args);

        // Continue the workflow immediately; the UI handles the visual effect.
        return Task.FromResult(ActivityResult.Continue(new
        {
            Event = DefaultEventName,
            payload.Type,
            payload.Message,
            payload.DurationMs
        }));
    }
}
