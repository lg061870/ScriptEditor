using ConversaCore.Core;
using ConversaCore.Events;   // for TopicStateMachine<TState>
using ConversaCore.Interfaces;
using ConversaCore.Models;         // for TopicWorkflowContext, ActivityResult
using ConversaCore.StateMachine;
using ConversaCore.Topics;         // for ITopic, TopicResult
using Microsoft.Extensions.Logging;

namespace ConversaCore.TopicFlow;

/// <summary>
/// Represents a flow of TopicFlowActivity nodes executed in queue order.
/// Activities enqueue when added, execution moves forward automatically.
/// A finite state machine (FSM) governs lifecycle transitions.
/// </summary>
public abstract class TopicFlow : ITopic, ITerminable {
    // ================================
    // TERMINATION SUPPORT
    // ================================
    
    /// <summary>
    /// Flag indicating whether this topic has been terminated.
    /// </summary>
    private bool _isTerminated = false;

    /// <summary>
    /// Gets whether this topic has been terminated.
    /// </summary>
    /// <summary>
    /// Gets whether this topic has been terminated.
    /// </summary>
    public bool IsTerminated => _isTerminated;

    /// <summary>
    /// Terminates the topic and all its activities, releasing resources and unsubscribing from events.
    /// </summary>
    public virtual void Terminate() {
        if (_isTerminated) return;

        _logger.LogInformation("[TopicFlow:{Name}] Terminating (CurrentState={State})", Name, State);

        // Cancel running state
        if (State == FlowState.Running || State == FlowState.WaitingForInput) {
            _logger.LogDebug("[TopicFlow:{Name}] Canceling ongoing operations", Name);
            _isRunning = false;

            try {
                _fsm.ForceState(FlowState.Failed, "Terminated while active");
                OnTopicLifecycleChanged(TopicLifecycleState.Failed, "Topic terminated");
            } catch (Exception ex) {
                _logger.LogWarning(ex, "[TopicFlow:{Name}] Exception during state transition in termination", Name);
            }
        }

        // Terminate current activity first
        if (_currentActivityId != null && _activities.TryGetValue(_currentActivityId, out var current)) {
            if (current is ITerminable t) {
                _logger.LogDebug("[TopicFlow:{Name}] Terminating current activity {ActivityId}", Name, current.Id);
                TryTerminateActivitySafely(t, current.Id);
            }
        }

        // Terminate the rest
        foreach (var activity in _activities.Values.ToList()) {
            if (activity.Id == _currentActivityId) continue;
            if (activity is ITerminable t) {
                _logger.LogDebug("[TopicFlow:{Name}] Terminating activity {ActivityId}", Name, activity.Id);
                TryTerminateActivitySafely(t, activity.Id);
            }
        }

        // Clear data structures
        ClearActivities();

        // Unregister events
        TopicLifecycleChanged = null;
        ActivityCreated = null;
        ActivityCompleted = null;
        TopicInserted = null;
        ActivityLifecycleChanged = null;
        CustomEventTriggered = null;
        AsyncActivityCompleted = null;

        // Reset FSM
        try {
            _fsm.ForceState(FlowState.Failed, "Terminated");
        } catch (Exception ex) {
            _logger.LogWarning(ex, "[TopicFlow:{Name}] Exception resetting FSM on termination", Name);
        }

        _currentActivityId = null;
        _isRunning = false;
        _isTerminated = true;

        _logger.LogInformation("[TopicFlow:{Name}] Terminated successfully", Name);
    }

    /// <summary>
    /// Helper for safe termination of individual activities.
    /// </summary>
    private void TryTerminateActivitySafely(ITerminable terminable, string id) {
        try {
            terminable.Terminate();
        } catch (Exception ex) {
            _logger.LogWarning(ex, "[TopicFlow:{Name}] Exception terminating activity {ActivityId}", Name, id);
        }
    }

    /// <summary>
    /// Asynchronously terminates the topic and all its activities.
    /// </summary>
    public virtual async Task TerminateAsync(CancellationToken cancellationToken = default) {
        if (_isTerminated) return;

        _logger.LogInformation("[TopicFlow:{Name}] Asynchronously terminating", Name);

        Terminate(); // perform sync cleanup

        var terminables = _activities.Values.OfType<ITerminable>()
            .Where(a => !a.IsTerminated)
            .ToList();

        if (terminables.Count > 0) {
            _logger.LogDebug("[TopicFlow:{Name}] Waiting for {Count} async terminations", Name, terminables.Count);

            var allTasks = Task.WhenAll(terminables.Select(t => t.TerminateAsync(cancellationToken)));

            try {
                var finished = await Task.WhenAny(allTasks, Task.Delay(TimeSpan.FromSeconds(5), cancellationToken));

                if (finished == allTasks)
                    _logger.LogDebug("[TopicFlow:{Name}] All async terminations completed", Name);
                else
                    _logger.LogWarning("[TopicFlow:{Name}] Timeout waiting for async terminations", Name);
            } catch (Exception ex) {
                _logger.LogError(ex, "[TopicFlow:{Name}] Exception during async termination", Name);
            }
        }

        _logger.LogInformation("[TopicFlow:{Name}] Async termination completed", Name);
    }

    /// <summary>
    /// Resets the topic flow and rebuilds the FSM/activities.
    /// </summary>
    public virtual void Reset() {
        _logger.LogInformation("[TopicFlow:{Name}] Reset called (CurrentState={State})", Name, State);

        if (_isTerminated) {
            _logger.LogWarning("[TopicFlow:{Name}] Cannot reset terminated topic. Recreate instead.", Name);
            return;
        }

        foreach (var act in _activities.Values.ToList()) {
            try {
                _logger.LogDebug("[TopicFlow:{Name}] Resetting {ActivityId} ({State})", Name, act.Id, act.CurrentState);
                act.Reset();
            } catch (Exception ex) {
                _logger.LogWarning(ex, "[TopicFlow:{Name}] Exception resetting {ActivityId}", Name, act.Id);
            }
        }

        ClearActivities();

        try {
            _fsm.Reset(FlowState.Idle);
            _fsm.ClearTransitionHistory();
        } catch (Exception ex) {
            _logger.LogWarning(ex, "[TopicFlow:{Name}] FSM reset failed — forcing Idle", Name);
            _fsm.ForceState(FlowState.Idle, "Forced reset after error");
        }

        _currentActivityId = null;
        _isRunning = false;
        _isTerminated = false; // ✅ Allow reuse after reset

        _logger.LogInformation("[TopicFlow:{Name}] Reset complete (FSM={State})", Name, _fsm.CurrentState);
        OnTopicLifecycleChanged(TopicLifecycleState.Created);
    }

    /// <summary>
    /// Clears all activities and the activity queue. For use in derived classes.
    /// </summary>
    protected void ClearActivities()
    {
        _activities.Clear();
        _activityQueue.Clear();
    }
    public enum FlowState {
        Idle,
        Starting,
        Running,
        WaitingForInput,
        Completed,
        Failed
    }

    private readonly Dictionary<string, TopicFlowActivity> _activities = new();
    private Queue<string> _activityQueue = new();
    private readonly TopicWorkflowContext _context;
    private readonly ILogger _logger;
    private readonly TopicStateMachine<FlowState> _fsm;

    private string? _currentActivityId;
    private bool _isRunning;

    public event EventHandler<TopicLifecycleEventArgs>? TopicLifecycleChanged;
    public event EventHandler<ActivityCreatedEventArgs>? ActivityCreated;
    public event EventHandler<ActivityCompletedEventArgs>? ActivityCompleted;
    public event EventHandler<TopicInsertedEventArgs>? TopicInserted;
    public event EventHandler<ActivityLifecycleEventArgs>? ActivityLifecycleChanged;
    public event EventHandler<CustomEventTriggeredEventArgs>? CustomEventTriggered;
    public event EventHandler<AsyncQueryCompletedEventArgs>? AsyncActivityCompleted;

    public TopicFlow(TopicWorkflowContext context, ILogger logger, string name = "TopicFlow") {
        _context = context ?? throw new ArgumentNullException(nameof(context));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));

        Name = name;

        _fsm = new TopicStateMachine<FlowState>(FlowState.Idle);
        _fsm.ConfigureTransition(FlowState.Idle, FlowState.Starting);
        _fsm.ConfigureTransition(FlowState.Starting, FlowState.Running);
        _fsm.ConfigureTransition(FlowState.Running, FlowState.WaitingForInput);
        _fsm.ConfigureTransition(FlowState.Running, FlowState.Completed);
        _fsm.ConfigureTransition(FlowState.Running, FlowState.Failed);
        _fsm.ConfigureTransition(FlowState.WaitingForInput, FlowState.Running);

        OnTopicLifecycleChanged(TopicLifecycleState.Created);
    }

    public TopicWorkflowContext Context => _context;
    public virtual string Name { get; protected set; }
    public virtual int Priority { get; protected set; } = 0;
    public FlowState State => _fsm.CurrentState;

    // ================================
    // Add / Remove
    // ================================

    public TopicFlow Add(TopicFlowActivity activity) {
        if (activity == null)
            throw new ArgumentNullException(nameof(activity));

        if (_activities.ContainsKey(activity.Id))
            throw new InvalidOperationException(
                $"Activity '{activity.Id}' already exists in this flow.");

        if (_isTerminated)
            throw new InvalidOperationException(
                $"Cannot add activity '{activity.Id}' to terminated topic '{Name}'.");

        _activities[activity.Id] = activity;
        _activityQueue.Enqueue(activity.Id);

        _logger.LogInformation("[TopicFlow:{Topic}] Added activity {ActivityId} to queue",
                               Name, activity.Id);

        // Basic lifecycle forwarding
        activity.ActivityLifecycleChanged += (s, e) =>
        {
            if (!_isTerminated)
                ActivityLifecycleChanged?.Invoke(this, e);
        };

        // Completion logic for activities that may finish while the flow
        // is in WaitingForInput (e.g., AdaptiveCardActivity after
        // OnInputCollected, or container activities resuming children).
        activity.ActivityCompleted += (s, e) =>
        {
            if (_isTerminated) return;

            _logger.LogInformation(
                "[TopicFlow:{Topic}] Activity {ActivityId} completed (FlowState={State}, CurrentActivity={CurrentId})",
                Name, e.ActivityId, State, _currentActivityId ?? "<null>");

            // When the flow is waiting for input and the currently active
            // activity completes (typically as a result of external input),
            // bubble this completion through the TopicFlow-level
            // ActivityCompleted event. DomainAgentService listens to that
            // and will call StepAsync to advance the queue.
            if (State == FlowState.WaitingForInput &&
                _currentActivityId == e.ActivityId)
            {
                _logger.LogInformation(
                    "[TopicFlow:{Topic}] Bubbling ActivityCompleted for current activity {ActivityId} while WaitingForInput",
                    Name, e.ActivityId);
                OnActivityCompleted(e.ActivityId);
            }
            else
            {
                _logger.LogDebug(
                    "[TopicFlow:{Topic}] ActivityCompleted for {ActivityId} ignored for bubbling (FlowState={State}, CurrentActivity={CurrentId})",
                    Name, e.ActivityId, State, _currentActivityId ?? "<null>");
            }
        };

        // ============================================================
        // CORRECT ASYNC-COMPLETION FORWARDING
        // ============================================================
        if (activity is IAsyncNotifiableActivity asyncActivity) {
            asyncActivity.AsyncCompleted += (s, args) =>
            {
                if (_isTerminated) return;

                AsyncActivityCompleted?.Invoke(this, args);
            };
        }

        return this;
    }

    public TopicFlow AddRange(IEnumerable<TopicFlowActivity> activities) {
        foreach (var activity in activities)
            Add(activity);

        return this;
    }

    /// <summary>
    /// Inserts a new activity immediately after the currently running activity,
    /// preserving the original queue order.
    /// </summary>
    public void InsertNext(TopicFlowActivity activity) {
        if (activity == null)
            throw new ArgumentNullException(nameof(activity));

        if (_isTerminated)
            throw new InvalidOperationException("Cannot insert into a terminated topic flow.");

        // Register activity in dictionary
        _activities[activity.Id] = activity;

        // Rebuild queue with the new activity inserted right after current activity
        var newQueue = new Queue<string>();

        bool inserted = false;

        while (_activityQueue.Count > 0) {
            var id = _activityQueue.Dequeue();
            newQueue.Enqueue(id);

            // Insert AFTER current activity
            if (id == _currentActivityId && !inserted) {
                newQueue.Enqueue(activity.Id);
                inserted = true;
            }
        }

        // Replace original queue
        _activityQueue = newQueue;

        _logger?.LogInformation(
            "[TopicFlow:{Topic}] InsertNext → Activity '{ActivityId}' inserted after '{CurrentId}'.",
            Name, activity.Id, _currentActivityId);
    }

    public bool RemoveActivity(string activityId) {
        if (string.IsNullOrWhiteSpace(activityId))
            throw new ArgumentNullException(nameof(activityId));
        var removed = _activities.Remove(activityId);
        if (removed)
            _logger.LogInformation("Removed activity {ActivityId}", activityId);
        return removed;
    }

    public IEnumerable<TopicFlowActivity> GetAllActivities() => _activities.Values;

    // ================================
    // Event helpers
    // ================================
    protected void OnTopicLifecycleChanged(TopicLifecycleState state, object? data = null) =>
        TopicLifecycleChanged?.Invoke(this, new TopicLifecycleEventArgs(Name, state, data));

    protected void OnActivityCreated(string activityId, object? content) =>
        ActivityCreated?.Invoke(this, new ActivityCreatedEventArgs(activityId, content, _context));

    protected void OnActivityCompleted(string activityId) =>
        ActivityCompleted?.Invoke(this, new ActivityCompletedEventArgs(activityId, _context));

    protected void OnTopicInserted(string topicName) =>
        TopicInserted?.Invoke(this, new TopicInsertedEventArgs(topicName, _context));

    // ================================
    // ITopic
    // ================================
    public virtual Task<float> CanHandleAsync(string message, CancellationToken cancellationToken = default)
        => Task.FromResult(0.0f);

    public virtual async Task<TopicResult> ProcessMessageAsync(string message, CancellationToken cancellationToken = default) {
        if (State == FlowState.WaitingForInput)
            return await ResumeAsync(message, cancellationToken);
        else
            return await RunAsync(cancellationToken);
    }

    // ================================
    // Execution
    // ================================
    public virtual async Task<TopicResult> RunAsync(CancellationToken cancellationToken = default) {
        if (_activityQueue.Count == 0) {
            _logger.LogInformation("queue is empty but here I am", _currentActivityId);
            throw new InvalidOperationException("Cannot run flow with no activities.");
        }

        await _fsm.TryTransitionAsync(FlowState.Starting, "RunAsync invoked");
        OnTopicLifecycleChanged(TopicLifecycleState.Starting);

        _currentActivityId = _activityQueue.Peek();
        _isRunning = true;

        _logger.LogInformation("Flow starting at {ActivityId}", _currentActivityId);

        await _fsm.TryTransitionAsync(FlowState.Running, "Flow started");
        OnTopicLifecycleChanged(TopicLifecycleState.Running);

        return await StepAsync(null, cancellationToken);
    }

    public async Task<TopicResult> ResumeAsync(string message, CancellationToken cancellationToken = default) {
        _logger.LogInformation(
            "[TopicFlow:{Name}] ResumeAsync invoked with message='{Message}' (State={State})",
            Name,
            message,
            State);

        if (State != FlowState.WaitingForInput)
            throw new InvalidOperationException($"Flow is not waiting for input (state: {State}).");

        await _fsm.TryTransitionAsync(FlowState.Running, "Resuming after input");
        OnTopicLifecycleChanged(TopicLifecycleState.Resuming);

        return await StepAsync(message, cancellationToken);
    }

    public virtual async Task<TopicResult> StepAsync(object? input, CancellationToken ct) {
        // Temporary debug instrumentation to track queue and state
        void LogQueueState(string phase)
            => _logger.LogInformation(
                "[Flow.Trace] {Phase} | Topic={Topic} | State={State} | Count={Count} | Current={CurrentId} | Queue=[{Queue}]",
                phase,
                Name,
                State,
                _activityQueue.Count,
                _currentActivityId ?? "<null>",
                string.Join(", ", _activityQueue.ToArray()));

        LogQueueState("StepAsync.Begin");

        if (!_isRunning) {
            _logger.LogWarning("StepAsync called but _isRunning=false. Attempting to recover.");
            _isRunning = true;
        }

        if (State == FlowState.WaitingForInput) {
            _logger.LogInformation("[TopicFlow:{Name}] StepAsync invoked while WaitingForInput – treating as implicit resume.", Name);
            await _fsm.TryTransitionAsync(FlowState.Running, "Implicit resume via StepAsync");
            OnTopicLifecycleChanged(TopicLifecycleState.Resuming);
        }
        else if (State != FlowState.Running && State != FlowState.Starting && State != FlowState.Idle) {
            _logger.LogWarning("StepAsync invoked but flow state={State}. Attempting to transition to Running.", State);

            if (State == FlowState.Completed) {
                _logger.LogInformation("[TopicFlow] Recovering flow from Completed state in StepAsync");
                _fsm.ForceState(FlowState.Running, "Forced recovery in StepAsync from Completed state");
                _isRunning = true;
                OnTopicLifecycleChanged(TopicLifecycleState.Running);
            }
            else {
                return TopicResult.CreateResponse($"Cannot step flow while in state {State}.", _context, requiresInput: true);
            }
        }

        while (_activityQueue.Count > 0) {
            if (ct.IsCancellationRequested) {
                await _fsm.TryTransitionAsync(FlowState.Failed, "Cancelled");
                OnTopicLifecycleChanged(TopicLifecycleState.Failed, "Cancelled");
                return TopicResult.CreateResponse("Flow cancelled.", _context, requiresInput: true);
            }

            if (string.IsNullOrWhiteSpace(_currentActivityId) ||
                !_activities.TryGetValue(_currentActivityId, out var activity)) {
                _logger.LogError("[Flow.Trace] Current activity '{ActivityId}' not found (State={State}, QueueCount={Count}).", _currentActivityId ?? "<null>", State, _activityQueue.Count);
                await _fsm.TryTransitionAsync(FlowState.Failed, "Activity not found");
                OnTopicLifecycleChanged(TopicLifecycleState.Failed, "Activity not found");
                return TopicResult.CreateResponse("Error: activity not found.", _context, requiresInput: true);
            }

            // 🛑 Skip completed/failed activities before running
            if (activity.CurrentState == ActivityState.Completed ||
                activity.CurrentState == ActivityState.Failed) {
                _logger.LogDebug("Skipping finished activity {Id} ({State})", activity.Id, activity.CurrentState);
                _activityQueue.Dequeue();
                _currentActivityId = _activityQueue.Count > 0 ? _activityQueue.Peek() : null;
                continue;
            }

            _logger.LogInformation("[Flow.Trace] Executing activity {ActivityId} (Topic={Topic}, State={State})", activity.Id, Name, State);
            LogQueueState("Before RunAsync");

            ActivityResult ar;
            try {
                ar = await activity.RunAsync(_context, input, ct);
            } catch (Exception ex) {
                _logger.LogError(ex, "Activity {ActivityId} threw.", activity.Id);
                await _fsm.TryTransitionAsync(FlowState.Failed, ex.Message);
                OnTopicLifecycleChanged(TopicLifecycleState.Failed, ex);
                return TopicResult.CreateResponse($"Error: {ex.Message}", _context, requiresInput: true);
            }

            input = null;

            if (ar.ModelContext != null)
                OnActivityCreated(activity.Id, ar.ModelContext);

            if (!string.IsNullOrEmpty(ar.Message))
                OnActivityCreated(activity.Id, ar.Message);

            // 🕒 Handle waiting
            if (ar.IsWaiting) {
                LogQueueState("WaitingForInput.Triggered");
                await _fsm.TryTransitionAsync(FlowState.WaitingForInput, "Activity requested input");
                OnTopicLifecycleChanged(TopicLifecycleState.WaitingForUserInput, ar);
                return TopicResult.CreateResponse(ar.Message ?? "Waiting for user input…", _context, requiresInput: true);
            }

            // 🧩 Handle sub-topic wait
            if (ar.IsWaitingForSubTopic) {
                _logger.LogInformation("[Flow.Trace] Activity {ActivityId} waiting for sub-topic '{SubTopic}' (Topic={Topic})", activity.Id, ar.SubTopicName, Name);
                await _fsm.TryTransitionAsync(FlowState.WaitingForInput, "Activity waiting for sub-topic");
                OnTopicLifecycleChanged(TopicLifecycleState.WaitingForSubTopic, ar);
                return TopicResult.CreateSubTopicTrigger(ar.SubTopicName!, ar.Message, _context);
            }

            // 🏁 Handle activity end
            if (ar.IsEnd) {
                _logger.LogInformation("[Flow.Trace] Activity {ActivityId} signaled end of topic {Topic}", activity.Id, Name);
                OnActivityCompleted(activity.Id);
                await _fsm.TryTransitionAsync(FlowState.Completed, "Activity signaled end");
                OnTopicLifecycleChanged(TopicLifecycleState.Completed, ar);
                return TopicResult.CreateCompleted(ar.Message ?? string.Empty, _context);
            }

            // ✅ Only dequeue when not waiting
            if (!ar.IsWaiting && !ar.IsWaitingForSubTopic) {
                OnActivityCompleted(activity.Id);
                _activityQueue.Dequeue();
                _currentActivityId = _activityQueue.Count > 0 ? _activityQueue.Peek() : null;
                LogQueueState("After Dequeue");
            }

            if (_currentActivityId == null) {
                var waiting = _activities.Values.FirstOrDefault(a => a.CurrentState == ActivityState.WaitingForUserInput);
                if (waiting != null)
                    _logger.LogWarning("[Flow.Warn] Queue exhausted but found waiting activity: {WaitingId}", waiting.Id);

                await _fsm.TryTransitionAsync(FlowState.Completed, "Queue exhausted");
                OnTopicLifecycleChanged(TopicLifecycleState.Completed, ar);
                return TopicResult.CreateCompleted(string.Empty, _context);
            }

            _logger.LogInformation("[Flow.Trace] Dequeued next activity: {ActivityId} (Topic={Topic}, State={State})", _currentActivityId, Name, State);
        }

        LogQueueState("StepAsync.End.BeforeComplete");

        _logger.LogWarning("[Flow.Trace] Final queue dump: {Dump}",
            string.Join(", ", _activities.Select(a => $"{a.Value.Id}:{a.Value.CurrentState}")));

        await _fsm.TryTransitionAsync(FlowState.Completed, "Queue exhausted (safety)");
        OnTopicLifecycleChanged(TopicLifecycleState.Completed);
        return TopicResult.CreateCompleted(string.Empty, _context);
    }


    public TopicFlowActivity? GetCurrentActivity() {
        if (_currentActivityId != null && _activities.TryGetValue(_currentActivityId, out var act))
            return act;
        return null;
    }
}
