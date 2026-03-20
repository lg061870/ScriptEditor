using ConversaCore.Cards;
using ConversaCore.Core;
using ConversaCore.Events;
using ConversaCore.Models;
using Microsoft.Extensions.Logging;
using System.Text.Json;
using ConversaCore.TopicFlow.Core.Interfaces;

namespace ConversaCore.TopicFlow;


/// <summary>
/// Base class for all workflow activities with lifecycle and transition handling.
/// Provides automatic context propagation for BaseCardModel descendants.
/// </summary>
public abstract class TopicFlowActivity : ITerminable, IPausableActivity {
    // ======================================================
    // EVENTS
    // ======================================================
    public event EventHandler<ActivityLifecycleEventArgs>? ActivityLifecycleChanged;
    public event EventHandler<ActivityCompletedEventArgs>? ActivityCompleted;
    public event EventHandler<MessageEmittedEventArgs>? MessageEmitted;

    // ======================================================
    // CONSTRUCTOR + PROPERTIES
    // ======================================================
    protected readonly ILogger<TopicFlowActivity>? _logger;
    public virtual bool IsRequired => false;

    protected TopicFlowActivity(string id, ILogger<TopicFlowActivity>? logger = null) {
        if (string.IsNullOrEmpty(id))
            throw new ArgumentNullException(nameof(id));

        Id = id;
        SubmissionContextKey = id;
        _logger = logger;

        TransitionTo(ActivityState.Created);
    }

    public string Id { get; }
    public string? Name { get; set; }
    public string? Description { get; set; }
    public object? Metadata { get; set; }

    public Type? ModelType { get; set; }
    public string? ModelContextKey { get; set; }
    public string? SubmissionContextKey { get; set; }
    public Func<object, object?>? CustomDeserializer { get; set; }

    // The active workflow context for this activity instance
    protected TopicWorkflowContext? Context { get; private set; }

    // ======================================================
    // TERMINATION SUPPORT
    // ======================================================
    private bool _isTerminated = false;
    protected CancellationTokenSource? _cancellationTokenSource;

    public bool IsTerminated => _isTerminated;

    public virtual void Reset() => CurrentState = ActivityState.Idle;

    public virtual void Terminate() {
        if (_isTerminated) return;

        _logger?.LogDebug("[{ActivityId}] Terminating {ActivityType}", Id, GetType().Name);

        try {
            _cancellationTokenSource?.Cancel();
            _cancellationTokenSource?.Dispose();
            _cancellationTokenSource = null;
        } catch (Exception ex) {
            _logger?.LogWarning(ex, "[{ActivityId}] Cancellation cleanup failed", Id);
        }

        if (CurrentState == ActivityState.WaitingForUserInput || CurrentState == ActivityState.Rendered) {
            _logger?.LogDebug("[{ActivityId}] Forcing Failed state during termination", Id);
            try {
                TransitionTo(ActivityState.Failed, "Terminated");
            } catch (Exception ex) {
                _logger?.LogWarning(ex, "[{ActivityId}] Forced transition failed", Id);
            }
        }

        ActivityLifecycleChanged = null;
        ActivityCompleted = null;
        ModelType = null;
        CustomDeserializer = null;
        CurrentState = ActivityState.Idle;
        _isTerminated = true;

        _logger?.LogDebug("[{ActivityId}] Activity terminated", Id);
    }

    public virtual async Task TerminateAsync(CancellationToken cancellationToken = default) {
        try {
            Terminate();
            await PerformAsyncCleanupAsync(cancellationToken);
        } catch (Exception ex) {
            _logger?.LogError(ex, "[{ActivityId}] Async termination failed", Id);
        }
    }

    protected virtual Task PerformAsyncCleanupAsync(CancellationToken cancellationToken = default)
        => Task.CompletedTask;

    // ======================================================
    // FSM (STATE + TRANSITIONS)
    // ======================================================
    public ActivityState CurrentState { get; private set; } = ActivityState.Idle;

    protected virtual Dictionary<ActivityState, HashSet<ActivityState>> AllowedTransitions => new()
    {
        { ActivityState.Idle,      new() { ActivityState.Created } },
        { ActivityState.Created,   new() { ActivityState.Running, ActivityState.Failed } },
        { ActivityState.Running,   new() { ActivityState.Completed, ActivityState.Failed, ActivityState.Rendered, ActivityState.WaitingForUserInput, ActivityState.Finalizing } },
        { ActivityState.Finalizing, new() { ActivityState.Completed, ActivityState.Failed } },
        { ActivityState.Completed, new() { } },
        { ActivityState.Failed,    new() { } }
    };

    protected void TransitionTo(ActivityState newState, object? data = null) {
        if (CurrentState == newState) return;

        if (!AllowedTransitions.TryGetValue(CurrentState, out var allowed) ||
            !allowed.Contains(newState)) {
            throw new InvalidOperationException(
                $"Invalid transition: {CurrentState} → {newState} (Activity={Id})");
        }

        var previous = CurrentState;
        CurrentState = newState;

        _logger?.LogDebug("[{ActivityId}] Transition {From} → {To}", Id, previous, newState);
        ActivityLifecycleChanged?.Invoke(this, new ActivityLifecycleEventArgs(Id, newState, data));

        OnStateTransition(previous, newState, data);

        if (newState == ActivityState.Completed) {
            OnCompleted(data);
            ActivityCompleted?.Invoke(this, new ActivityCompletedEventArgs(Id, data ?? new object()));
        }
    }

    protected virtual void OnStateTransition(ActivityState from, ActivityState to, object? data) { }

    // ======================================================
    // CORE EXECUTION
    // ======================================================
    public virtual async Task<ActivityResult> RunAsync(
        TopicWorkflowContext context,
        object? input = null,
        CancellationToken cancellationToken = default) {
        Context = context;
        TransitionTo(ActivityState.Running, input);

        try {
            // Save submission payload
            if (input != null && !string.IsNullOrEmpty(SubmissionContextKey))
                context.SetValue(SubmissionContextKey, input);

            // Deserialize to model if applicable
            if (ModelType != null && !string.IsNullOrEmpty(ModelContextKey)) {
                try {
                    object? model = CustomDeserializer != null
                        ? CustomDeserializer(input)
                        : JsonSerializer.Deserialize(input?.ToString() ?? "{}", ModelType,
                            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                    context.SetValue(ModelContextKey, model);
                } catch (Exception ex) {
                    _logger?.LogWarning(ex, "[{ActivityId}] Model deserialization failed", Id);
                }
            }

            var result = await RunActivity(context, input, cancellationToken);

            if (result?.ModelContext != null && !string.IsNullOrEmpty(ModelContextKey))
                context.SetValue(ModelContextKey, result.ModelContext);

            if (result != null && result.IsWaiting) {
                _logger?.LogInformation("[{ActivityId}] Waiting for input", Id);
            }
            else {
                // Only transition to Completed if the activity didn't already
                // transition itself to Failed or Completed inside RunActivity.
                if (CurrentState != ActivityState.Failed &&
                    CurrentState != ActivityState.Completed) {
                    TransitionTo(ActivityState.Completed, result);
                }
            }

            return result!;
        } catch (Exception ex) {
            TransitionTo(ActivityState.Failed, ex);
            _logger?.LogError(ex, "[{ActivityId}] Activity failed", Id);
            throw;
        }
    }

    protected abstract Task<ActivityResult> RunActivity(
        TopicWorkflowContext context,
        object? input = null,
        CancellationToken cancellationToken = default);

    // ======================================================
    // AUTOMATIC CONTEXT PROPAGATION
    // ======================================================
    protected virtual async Task HandleActivityCompletionAsync(ActivityState from, ActivityState to, object? data) {
        if (to != ActivityState.Completed || data == null) return;
        if (Context == null) return;

        if (data is BaseCardModel cardModel) {
            try {
                cardModel.UpdateContext(Context);
                _logger?.LogInformation("[{ActivityId}] ✅ Auto-updated Context from {ModelType}",
                    Id, data.GetType().Name);
            } catch (Exception ex) {
                _logger?.LogError(ex, "[{ActivityId}] ⚠️ Failed auto-context update ({ModelType})",
                    Id, data.GetType().Name);
            }
        }

        await Task.CompletedTask;
    }

    protected virtual void OnCompleted(object? data) {
        // Automatically trigger context propagation
        _ = HandleActivityCompletionAsync(CurrentState, ActivityState.Completed, data);
    }

    protected virtual void OnMessageEmitted(string message) {
        if (string.IsNullOrWhiteSpace(message))
            return;

        MessageEmitted?.Invoke(this, new MessageEmittedEventArgs(Id, message, Context));
    }

    // ======================================================
    // PAUSING / RESUMING SUPPORT
    // ======================================================

    /// <summary>
    /// Indicates whether the activity is currently paused.
    /// </summary>
    public virtual bool IsPaused =>
        CurrentState == ActivityState.WaitingForUserInput ||
        CurrentState == ActivityState.WaitingForSubActivity ||
        CurrentState == ActivityState.Rendered;

    /// <summary>
    /// Pauses the activity gracefully. Derived classes may override to capture additional state.
    /// </summary>
    public virtual Task PauseAsync(string reason, CancellationToken cancellationToken = default) {
        if (!IsPaused) {
            _logger?.LogDebug("[{ActivityId}] Pause requested but activity not in a pausable state ({State})", Id, CurrentState);
            return Task.CompletedTask;
        }

        _logger?.LogInformation("[{ActivityId}] ⏸️ Activity paused. Reason: {Reason}", Id, reason);
        try {
            ActivityLifecycleChanged?.Invoke(this, new ActivityLifecycleEventArgs(Id, ActivityState.WaitingForUserInput, reason));
        } catch (Exception ex) {
            _logger?.LogWarning(ex, "[{ActivityId}] PauseAsync event dispatch failed", Id);
        }

        return Task.CompletedTask;
    }

    /// <summary>
    /// Resumes a previously paused activity.
    /// </summary>
    public virtual Task ResumeAsync(string? input = null, CancellationToken cancellationToken = default) {
        if (!IsPaused) {
            _logger?.LogDebug("[{ActivityId}] Resume ignored (activity not paused)", Id);
            return Task.CompletedTask;
        }

        _logger?.LogInformation("[{ActivityId}] ▶️ Activity resuming from paused state", Id);

        try {
            ActivityLifecycleChanged?.Invoke(this, new ActivityLifecycleEventArgs(Id, ActivityState.Running, input));
        } catch (Exception ex) {
            _logger?.LogWarning(ex, "[{ActivityId}] ResumeAsync event dispatch failed", Id);
        }

        return Task.CompletedTask;
    }
}

/// <summary>
/// Common lifecycle states. Only a subset is valid per subtype.
/// </summary>
public enum ActivityState {
    Idle,
    Created,
    Running,
    Completed,
    Failed,

    // Extended by subclasses and container activities
    Rendered,

    /// <summary>
    /// The activity is paused waiting for user input
    /// (typical for AdaptiveCard-based activities).
    /// </summary>
    WaitingForUserInput,

    /// <summary>
    /// The activity is paused while waiting for one of its
    /// child/sub-activities to complete (used by container activities).
    /// </summary>
    WaitingForSubActivity,

    InputCollected,
    ValidationFailed,
    Triggered,
    Finalizing
}
