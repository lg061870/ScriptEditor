using ConversaCore.Context;
using ConversaCore.DTO;
using ConversaCore.Events;
using ConversaCore.Interfaces;
using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace ConversaCore.TopicFlow;

/// <summary>
/// An activity that triggers custom events to communicate with the UI layer.
/// Supports both fire-and-forget events (continues execution immediately)
/// and blocking events (waits for UI response before continuing).
/// </summary>
public class EventTriggerActivity : TopicFlowActivity, ICustomEventTriggeredActivity {
    private readonly ILogger? _logger;
    private readonly IConversationContext? _conversationContext;
    private readonly string _eventName;
    private readonly object? _eventData;
    private readonly bool _waitForResponse;
    private readonly string? _responseContextKey;
    private readonly TimeSpan _responseTimeout;

    public event EventHandler<CustomEventTriggeredEventArgs>? CustomEventTriggered;

    protected override Dictionary<ActivityState, HashSet<ActivityState>> AllowedTransitions =>
        new() {
            { ActivityState.Idle,      new() { ActivityState.Created } },
            { ActivityState.Created,   new() { ActivityState.Running, ActivityState.Failed } },
            { ActivityState.Running,   new() { ActivityState.Completed, ActivityState.Failed, ActivityState.WaitingForUserInput } },
            { ActivityState.WaitingForUserInput, new() { ActivityState.Completed, ActivityState.Failed } },
            { ActivityState.Completed, new() { } },
            { ActivityState.Failed,    new() { } }
        };

    public EventTriggerActivity(
        string id,
        string eventName,
        object? eventData = null,
        bool waitForResponse = false,
        string? responseContextKey = null,
        TimeSpan? responseTimeout = null,
        ILogger? logger = null,
        IConversationContext? conversationContext = null)
        : base(id) {

        if (string.IsNullOrWhiteSpace(eventName))
            throw new ArgumentException("Event name cannot be null or empty", nameof(eventName));

        if (waitForResponse && string.IsNullOrWhiteSpace(responseContextKey))
            throw new ArgumentException("Response context key is required when waiting for response", nameof(responseContextKey));

        _eventName = eventName;
        _eventData = eventData;
        _waitForResponse = waitForResponse;
        _responseContextKey = responseContextKey;
        _responseTimeout = responseTimeout ?? TimeSpan.FromMinutes(5);
        _logger = logger;
        _conversationContext = conversationContext;
    }

    public static EventTriggerActivity CreateFireAndForget(
        string eventName,
        object? data = null,
        bool waitForResponse = false,
        ILogger? logger = null,
        IConversationContext? conversationContext = null) {
        // ✅ Normalize known payload types
        object? normalizedData = data switch {
            null => null,
            string s => s, // already serialized
            _ when data.GetType().IsPrimitive => data, // e.g. int, bool, double
            UiProgressEvent or UiSearchEvent => data, // domain DTOs remain strongly typed
            _ => SafeNormalize(data)
        };

        logger?.LogDebug(
            "[EventTriggerActivity] CreateFireAndForget → Event={Event} | DataType={Type}",
            eventName,
            normalizedData?.GetType().Name ?? "null"
        );

        return new EventTriggerActivity(
            id: eventName, // Fire-and-forget can safely reuse eventName
            eventName: eventName,
            eventData: normalizedData,
            waitForResponse: waitForResponse,
            responseContextKey: null,
            responseTimeout: null,
            logger: logger,
            conversationContext: conversationContext
        );
    }

    public static EventTriggerActivity CreateWaitForResponse(
        string id,
        string eventName,
        string responseContextKey,
        object? eventData = null,
        TimeSpan? responseTimeout = null,
        ILogger? logger = null,
        IConversationContext? conversationContext = null) {
        // ✅ Normalize but preserve DTOs
        object? normalizedData = eventData switch {
            null => null,
            string s => s,
            _ when eventData.GetType().IsPrimitive => eventData,
            UiProgressEvent or UiSearchEvent => eventData,
            _ => SafeNormalize(eventData)
        };

        logger?.LogDebug(
            "[EventTriggerActivity] CreateWaitForResponse → Event={Event} | DataType={Type}",
            eventName,
            normalizedData?.GetType().Name ?? "null"
        );

        return new EventTriggerActivity(
            id: id,
            eventName: eventName,
            eventData: normalizedData,
            waitForResponse: true,
            responseContextKey: responseContextKey,
            responseTimeout: responseTimeout,
            logger: logger,
            conversationContext: conversationContext
        );
    }

    // -----------------------------------------------------------------------------
    // 🔒 Helper: safe normalization with exception guard
    // -----------------------------------------------------------------------------
    private static object? SafeNormalize(object source) {
        try {
            var json = JsonSerializer.Serialize(source);
            return JsonSerializer.Deserialize<object?>(json);
        } catch (Exception ex) {
            // Defensive fallback — do not throw, just return stringified data
            return $"[SerializationError:{source.GetType().Name}] {ex.Message}";
        }
    }

    protected override async Task<ActivityResult> RunActivity(
        TopicWorkflowContext context,
        object? input = null,
        CancellationToken cancellationToken = default) {
        // ✅ Early cancellation check
        if (cancellationToken.IsCancellationRequested) {
            _logger?.LogWarning("[EventTriggerActivity] Cancelled before event trigger: {EventName}", _eventName);
            TransitionTo(ActivityState.Failed, "Cancelled");
            return ActivityResult.Cancelled($"Cancelled before triggering event '{_eventName}'");
        }

        TransitionTo(ActivityState.Running, input);

        try {
            _logger?.LogWarning(
                "[DEBUG] EventTriggerActivity.RunActivity CALLED - EventName={EventName}, ActivityId={ActivityId}, ThreadId={ThreadId}",
                _eventName, Id, Environment.CurrentManagedThreadId);

            _logger?.LogInformation(
                "[EventTriggerActivity] Triggering custom event '{EventName}' (WaitForResponse: {WaitForResponse})",
                _eventName, _waitForResponse);

            // 🧩 Resolve Lazy<T> or Func<T> payloads right before event dispatch
            object? resolvedEventData = _eventData switch {
                Lazy<object?> lazy => lazy.Value,
                Func<object?> func => func(),
                _ => _eventData
            };

            // Handle nested Lazy (rare but possible)
            if (resolvedEventData is Lazy<object?> nestedLazy)
                resolvedEventData = nestedLazy.Value;

            // Optional debug tracing
            _logger?.LogDebug(
                "[EventTriggerActivity] Resolved event data type = {Type}",
                resolvedEventData?.GetType().Name ?? "null");

            // Optional: dump JSON payload preview (safe serialization)
            try {
                var json = JsonSerializer.Serialize(resolvedEventData,
                    new JsonSerializerOptions { WriteIndented = false });
                _logger?.LogInformation("[EventTriggerActivity] Payload ready for '{EventName}': {PayloadJson}",
                    _eventName, json);
            } catch { /* swallow serialization errors */ }

            var eventArgs = new CustomEventTriggeredEventArgs(_eventName, resolvedEventData, context, _waitForResponse);
            CustomEventTriggered?.Invoke(this, eventArgs);

            _logger?.LogInformation(
                "[EventTriggerActivity] Custom event '{EventName}' triggered successfully",
                _eventName);

            if (_waitForResponse) {
                TransitionTo(ActivityState.WaitingForUserInput, eventArgs);
                context.SetValue($"{Id}_WaitingForEvent", _eventName);
                context.SetValue($"{Id}_ResponseKey", _responseContextKey);

                _logger?.LogInformation("[EventTriggerActivity] Waiting for UI response for event '{EventName}'", _eventName);

                // ✅ Timeout + cancellation linked
                using var timeoutCts = new CancellationTokenSource(_responseTimeout);
                using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token);

                try {
                    await Task.Delay(Timeout.Infinite, linkedCts.Token);
                } catch (OperationCanceledException) when (timeoutCts.IsCancellationRequested) {
                    _logger?.LogWarning("[EventTriggerActivity] Timeout waiting for UI response: {EventName}", _eventName);
                    TransitionTo(ActivityState.Failed, "Timeout waiting for response");
                    return ActivityResult.Cancelled($"Timeout waiting for response to '{_eventName}'");
                } catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) {
                    _logger?.LogWarning("[EventTriggerActivity] Operation cancelled externally while waiting for UI response: {EventName}", _eventName);
                    TransitionTo(ActivityState.Failed, "Cancelled externally");
                    return ActivityResult.Cancelled($"Cancelled externally while waiting for '{_eventName}'");
                }

                // ✅ Use the resolved event data, not the original lazy
                return ActivityResult.WaitForInput(
                    new { Event = _eventName, Data = resolvedEventData },
                    context);
            }
            else {
                TransitionTo(ActivityState.Completed, eventArgs);

                _logger?.LogInformation(
                    "[EventTriggerActivity] Fire-and-forget event '{EventName}' completed",
                    _eventName);

                return ActivityResult.Continue(
                    $"Event '{_eventName}' triggered successfully",
                    new { Event = _eventName, Data = resolvedEventData });
            }
        } catch (Exception ex) {
            _logger?.LogError(ex, "[EventTriggerActivity] Failed to trigger event '{EventName}'", _eventName);
            TransitionTo(ActivityState.Failed, ex);
            throw;
        }
    }


    public void HandleUIResponse(TopicWorkflowContext context, object? responseData) {
        if (!_waitForResponse) {
            _logger?.LogWarning("[EventTriggerActivity] HandleUIResponse called but activity is not waiting for response");
            return;
        }

        if (CurrentState != ActivityState.WaitingForUserInput) {
            _logger?.LogWarning("[EventTriggerActivity] HandleUIResponse called but activity is not in waiting state (current: {State})", CurrentState);
            return;
        }

        try {
            _logger?.LogInformation("[EventTriggerActivity] Received UI response for event '{EventName}'", _eventName);

            if (!string.IsNullOrEmpty(_responseContextKey)) {
                context.SetValue(_responseContextKey, responseData);
                _logger?.LogDebug("[EventTriggerActivity] Stored response data in context key '{Key}'", _responseContextKey);
            }

            context.RemoveValue($"{Id}_WaitingForEvent");
            context.RemoveValue($"{Id}_ResponseKey");

            TransitionTo(ActivityState.Completed, responseData);
            _logger?.LogInformation("[EventTriggerActivity] Successfully completed after receiving UI response");
        } catch (Exception ex) {
            _logger?.LogError(ex, "[EventTriggerActivity] Error handling UI response for event '{EventName}'", _eventName);
            TransitionTo(ActivityState.Failed, ex);
        }
    }

    public (string EventName, string? ResponseKey, bool IsWaiting) GetWaitingInfo() =>
        (_eventName, _responseContextKey, CurrentState == ActivityState.WaitingForUserInput);

    public override string ToString() {
        var mode = _waitForResponse ? "WaitForResponse" : "FireAndForget";
        return $"EventTriggerActivity({Id}: {_eventName}, {mode})";
    }
}
