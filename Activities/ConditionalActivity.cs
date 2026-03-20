using Microsoft.Extensions.Logging;
using ConversaCore.Events;
using ConversaCore.Interfaces;

namespace ConversaCore.TopicFlow;

/// <summary>
/// A simple conditional activity that evaluates a condition and stores the result.
/// Used by FlowBuilder for routing decisions.
/// </summary>
public class ConditionalActivity : TopicFlowActivity
{
    private readonly Func<TopicWorkflowContext, string> _condition;

    /// <summary>
    /// Optional default decision label if the condition evaluation fails or returns null/empty.
    /// </summary>
    public string? DefaultDecision { get; set; }

    /// <summary>
    /// Branch map: condition value → target activityId
    /// </summary>
    private readonly Dictionary<string, string> _branches = new();

    public ConditionalActivity(string id, Func<TopicWorkflowContext, string> condition)
        : base(id)
    {
        _condition = condition ?? throw new ArgumentNullException(nameof(condition));
    }

    // === Factory Helpers ===

    public static ConditionalActivity Create(string id, Func<TopicWorkflowContext, string> condition)
        => new ConditionalActivity(id, condition);

    public static ConditionalActivity Create(
        string id,
        Func<TopicWorkflowContext, bool> condition,
        string trueLabel,
        string falseLabel)
    {
        if (condition == null) throw new ArgumentNullException(nameof(condition));
        return new ConditionalActivity(id, ctx => condition(ctx) ? trueLabel : falseLabel);
    }

    public static ConditionalActivity CreateBranch<T>(
        string id,
        string contextKey,
        Dictionary<T, string> branches,
        string? defaultDecision = null) where T : notnull
    {
        if (string.IsNullOrEmpty(contextKey))
            throw new ArgumentNullException(nameof(contextKey));
        if (branches == null || branches.Count == 0)
            throw new ArgumentNullException(nameof(branches));

        var activity = new ConditionalActivity(id, ctx => {
            var value = ctx.GetValue<T>(contextKey);
            foreach (var branch in branches)
            {
                if (Equals(value, branch.Key))
                    return branch.Value;
            }
            return defaultDecision ?? string.Empty;
        });

        activity.DefaultDecision = defaultDecision;
        return activity;
    }

    /// <summary>
    /// Add a branch mapping (used by FlowBuilder DSL).
    /// </summary>
    public void AddBranch(string conditionValue, string targetActivityId)
    {
        if (string.IsNullOrEmpty(conditionValue))
            throw new ArgumentNullException(nameof(conditionValue));
        if (string.IsNullOrEmpty(targetActivityId))
            throw new ArgumentNullException(nameof(targetActivityId));

        _branches[conditionValue] = targetActivityId;
    }

    /// <inheritdoc/>
    protected override Task<ActivityResult> RunActivity(
        TopicWorkflowContext context,
        object? input = null,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var decision = _condition(context);

            if (string.IsNullOrEmpty(decision))
            {
                if (!string.IsNullOrEmpty(DefaultDecision))
                    decision = DefaultDecision!;
                else
                    throw new InvalidOperationException($"Condition in activity '{Id}' returned null or empty.");
            }

            // Record decision in context so later activities or FSM can inspect it
            context.SetValue($"{Id}_Decision", decision);

            // If explicit branch mapping exists, record it
            if (_branches.TryGetValue(decision, out var targetId))
            {
                context.SetValue($"{Id}_Target", targetId);
            }

            // Surface decision as a message for logging/traceability
            return Task.FromResult(ActivityResult.Continue($"Condition evaluated → {decision}"));
        }
        catch (Exception ex)
        {
            if (!string.IsNullOrEmpty(DefaultDecision))
            {
                context.SetValue($"{Id}_Decision", DefaultDecision);
                return Task.FromResult(
                    ActivityResult.Continue($"⚠️ Condition error: {ex.Message}. Using default: {DefaultDecision}")
                );
            }
            throw new InvalidOperationException($"Error evaluating condition in activity '{Id}'", ex);
        }
    }
}

/// <summary>
/// A flow control activity that executes exactly one child activity based on runtime conditions.
/// Leverages lessons learned from RepeatActivity for clean event forwarding and state management.
/// </summary>
/// <typeparam name="TActivity">The type of activity to execute conditionally</typeparam>
public class ConditionalActivity<TActivity> : TopicFlowActivity, IAdaptiveCardActivity, ITopicTriggeredActivity, ICustomEventTriggeredActivity
    where TActivity : TopicFlowActivity
{
    private readonly Dictionary<string, Func<string, TopicWorkflowContext, TActivity>> _branchFactories;
    private readonly Func<TopicWorkflowContext, (string branch, bool shouldExecute)> _conditionEvaluator;
    private readonly string? _defaultBranch;
    private readonly ILogger? _logger;
    
    // State management (lessons from RepeatActivity)
    private TActivity? _currentActivity;
    private TopicWorkflowContext? _activeContext;
    private string? _selectedBranch;
    private bool _conditionEvaluated = false;
    private bool _activityCompleted = false;

    // === IAdaptiveCardActivity Events - Forward from child activities ===
    public event EventHandler<CardJsonEventArgs>? CardJsonEmitted;
    public event EventHandler<CardJsonEventArgs>? CardJsonSending;
    public event EventHandler<CardJsonEventArgs>? CardJsonSent;
    public event EventHandler<CardJsonRenderedEventArgs>? CardJsonRendered;
    public event EventHandler<CardDataReceivedEventArgs>? CardDataReceived;
    public event EventHandler<ModelBoundEventArgs>? ModelBound;
    public event EventHandler<ValidationFailedEventArgs>? ValidationFailed;
    
    /// <summary>
    /// Event fired when child TriggerTopicActivity triggers a topic
    /// </summary>
    public event EventHandler<TopicTriggeredEventArgs>? TopicTriggered;

    /// <summary>
    /// Event fired when child EventTriggerActivity triggers a custom event
    /// </summary>
    public event EventHandler<CustomEventTriggeredEventArgs>? CustomEventTriggered;

    /// <summary>
    /// ConditionalActivity itself doesn't wait, but forwards the child activity's WaitForCompletion behavior
    /// </summary>
    public bool WaitForCompletion => _currentActivity is ITopicTriggeredActivity triggeredActivity ? triggeredActivity.WaitForCompletion : false;

    private ConditionalActivity(
        string id,
        Func<TopicWorkflowContext, (string branch, bool shouldExecute)> conditionEvaluator,
        Dictionary<string, Func<string, TopicWorkflowContext, TActivity>> branchFactories,
        string? defaultBranch = null,
        ILogger? logger = null)
        : base(id)
    {
        _conditionEvaluator = conditionEvaluator ?? throw new ArgumentNullException(nameof(conditionEvaluator));
        _branchFactories = branchFactories ?? throw new ArgumentNullException(nameof(branchFactories));
        _defaultBranch = defaultBranch;
        _logger = logger;
    }

    // === Factory Methods ===

    /// <summary>
    /// Simple binary condition (if/else)
    /// </summary>
    public static ConditionalActivity<TActivity> If(
        string id,
        Func<TopicWorkflowContext, bool> condition,
        Func<string, TopicWorkflowContext, TActivity> trueFactory,
        Func<string, TopicWorkflowContext, TActivity> falseFactory,
        ILogger? logger = null)
    {
        var branches = new Dictionary<string, Func<string, TopicWorkflowContext, TActivity>>
        {
            ["true"] = trueFactory,
            ["false"] = falseFactory
        };

        return new ConditionalActivity<TActivity>(
            id,
            ctx => {
                var result = condition(ctx);
                return (result ? "true" : "false", true);
            },
            branches,
            defaultBranch: "false",
            logger: logger
        );
    }

    /// <summary>
    /// Multi-branch condition (switch/case)
    /// </summary>
    public static ConditionalActivity<TActivity> Switch(
        string id,
        Func<TopicWorkflowContext, string> branchSelector,
        Dictionary<string, Func<string, TopicWorkflowContext, TActivity>> branches,
        string? defaultBranch = null,
        ILogger? logger = null)
    {
        return new ConditionalActivity<TActivity>(
            id,
            ctx => {
                var branch = branchSelector(ctx);
                var shouldExecute = !string.IsNullOrEmpty(branch) && (branches.ContainsKey(branch) || !string.IsNullOrEmpty(defaultBranch));
                return (branch ?? defaultBranch ?? "", shouldExecute);
            },
            branches,
            defaultBranch: defaultBranch,
            logger: logger
        );
    }

    /// <summary>
    /// Context-aware condition with full control (most flexible)
    /// </summary>
    public static ConditionalActivity<TActivity> When(
        string id,
        Func<TopicWorkflowContext, (string branch, bool shouldExecute)> evaluator,
        Dictionary<string, Func<string, TopicWorkflowContext, TActivity>> branches,
        ILogger? logger = null)
    {
        return new ConditionalActivity<TActivity>(
            id,
            evaluator,
            branches,
            defaultBranch: null,
            logger: logger
        );
    }

    protected override async Task<ActivityResult> RunActivity(
        TopicWorkflowContext context,
        object? input = null,
        CancellationToken cancellationToken = default) {
        _logger?.LogInformation(
            "[ConditionalActivity.RunActivity] 🟢 START {Id} | Input={InputType} | State: evaluated={Evaluated}, branch={Branch}",
            Id,
            input?.GetType().Name ?? "null",
            _conditionEvaluated,
            _selectedBranch ?? "null");

        _activeContext = context;

        // If the selected branch activity has already completed (for example,
        // after a CompositeActivity resumed and finished following card input),
        // avoid re-running the child. Treat this as a no-op continuation so the
        // parent TopicFlow can advance to the next activity without causing an
        // invalid state transition on the child.
        if (_activityCompleted) {
            _logger?.LogInformation(
                "[ConditionalActivity] 🟢 Branch '{Branch}' for {Id} already completed; short-circuiting to Continue.",
                _selectedBranch ?? "null",
                Id);

            var storedResult = context.GetValue<object?>($"{Id}_result");
            return ActivityResult.Continue(storedResult ?? new object());
        }

        // Evaluate condition once
        if (!_conditionEvaluated) {
            _logger?.LogInformation("[ConditionalActivity] ⚙️ Evaluating condition for {Id}", Id);

            var (branch, shouldExecute) = _conditionEvaluator(context);
            _selectedBranch = branch;
            _conditionEvaluated = true;

            _logger?.LogInformation(
                "[ConditionalActivity] 🔍 Condition evaluated for {Id} → Branch='{Branch}', ShouldExecute={ShouldExecute}",
                Id, branch, shouldExecute);

            // Store condition result in context
            context.SetValue($"{Id}_branch", branch);
            context.SetValue($"{Id}_shouldExecute", shouldExecute);

            if (!shouldExecute) {
                _logger?.LogWarning(
                    "[ConditionalActivity] 🚫 Skipping execution for {Id} → Branch='{Branch}'",
                    Id, branch);
                return ActivityResult.Continue($"Condition evaluated → {branch} (skipped)");
            }
        }

        // Create and execute selected branch activity
        if (_currentActivity == null && _selectedBranch != null) {
            _logger?.LogInformation("[ConditionalActivity] 🏗️ Preparing to create branch '{Branch}' for {Id}", _selectedBranch, Id);

            if (!_branchFactories.TryGetValue(_selectedBranch, out var factory)) {
                _logger?.LogWarning(
                    "[ConditionalActivity] ⚠️ Branch '{Branch}' not found for {Id}, checking default '{DefaultBranch}'",
                    _selectedBranch, Id, _defaultBranch ?? "none");

                if (_defaultBranch != null && _branchFactories.TryGetValue(_defaultBranch, out factory)) {
                    _selectedBranch = _defaultBranch;
                    _logger?.LogWarning(
                        "[ConditionalActivity] ✅ Using default branch '{DefaultBranch}' for {Id}",
                        _defaultBranch, Id);
                }
                else {
                    throw new InvalidOperationException(
                        $"No factory found for branch '{_selectedBranch}' and no default branch configured in '{Id}'");
                }
            }

            var childId = $"{Id}_{_selectedBranch}";
            _logger?.LogInformation(
                "[ConditionalActivity] 🧩 Creating child activity '{ChildId}' (branch='{Branch}') for {Id}",
                childId, _selectedBranch, Id);

            _currentActivity = factory(childId, context);
            _logger?.LogInformation(
                "[ConditionalActivity] ✅ Created '{Type}' for branch '{Branch}'",
                _currentActivity.GetType().Name, _selectedBranch);

            SubscribeToActivityEvents(_currentActivity);
        }

        if (_currentActivity == null) {
            throw new InvalidOperationException($"Failed to create child activity for ConditionalActivity '{Id}'");
        }

        // Log pre-run state
        _logger?.LogInformation(
            "[ConditionalActivity] ▶️ Executing branch '{Branch}' (Child={ChildType}, Id={ChildId})",
            _selectedBranch,
            _currentActivity.GetType().Name,
            _currentActivity.Id);

        // Execute the selected branch activity
        var result = await _currentActivity.RunAsync(context, input, cancellationToken);

        // Log result snapshot
        _logger?.LogInformation(
            "[ConditionalActivity] ⏱️ Branch '{Branch}' execution returned → IsWaiting={IsWaiting}, Model={ModelType}",
            _selectedBranch,
            result.IsWaiting,
            result.ModelContext?.GetType().Name ?? "null");

        // Handle completion if activity is done
        if (!result.IsWaiting && !_activityCompleted) {
            _activityCompleted = true;
            context.SetValue($"{Id}_result", result.ModelContext);

            _logger?.LogInformation(
                "[ConditionalActivity] 🏁 Branch '{Branch}' completed for {Id} | ResultType={Type}",
                _selectedBranch,
                Id,
                result.ModelContext?.GetType().Name ?? "null");
        }
        else if (result.IsWaiting) {
            _logger?.LogInformation(
                "[ConditionalActivity] 💤 Branch '{Branch}' is waiting for user input or sub-activity completion",
                _selectedBranch);
        }

        _logger?.LogInformation(
            "[ConditionalActivity.RunActivity] 🔚 END {Id} | Branch={Branch} | Result.IsWaiting={IsWaiting}",
            Id,
            _selectedBranch ?? "null",
            result.IsWaiting);

        return result;
    }


    /// <summary>
    /// IAdaptiveCardActivity interface method - forward to child activity
    /// </summary>
    public void OnInputCollected(AdaptiveCardInputCollectedEventArgs e)
    {
        _logger?.LogWarning("[ConditionalActivity] Forwarding OnInputCollected to child activity in branch '{Branch}'", _selectedBranch);
        
        if (_currentActivity is IAdaptiveCardActivity cardActivity)
        {
            cardActivity.OnInputCollected(e);
        }
    }

    /// <summary>
    /// Subscribe to child activity events for forwarding (RepeatActivity pattern)
    /// 
    /// EVENT BUBBLING CHAIN:
    /// Child Activity (TriggerTopicActivity/CompositeActivity/AdaptiveCardActivity) 
    ///     ↓ fires event
    /// ConditionalActivity.SubscribeToActivityEvents() 
    ///     ↓ forwards via OnChildXxx handlers  
    /// ConditionalActivity events (TopicTriggered/CardJsonSent/etc)
    ///     ↓ bubbled up to parent
    /// InsuranceAgentService.HookTopicEvents() 
    ///     ↓ receives final events
    /// InsuranceAgentService event handlers (OnTopicTriggered/OnCardJsonSent/etc)
    /// </summary>
    private void SubscribeToActivityEvents(TActivity activity)
    {
        Console.WriteLine($"[ConditionalActivity.SubscribeToActivityEvents] Subscribing to events from child activity '{activity.Id}' (type: {activity.GetType().Name}) within ConditionalActivity '{this.Id}'");
        
        if (activity is IAdaptiveCardActivity cardActivity)
        {
            Console.WriteLine($"[ConditionalActivity.SubscribeToActivityEvents] Child '{activity.Id}' implements IAdaptiveCardActivity - subscribing to card events");
            cardActivity.CardJsonEmitted += OnChildCardJsonEmitted;
            cardActivity.CardJsonSending += OnChildCardJsonSending;
            cardActivity.CardJsonSent += OnChildCardJsonSent;
            cardActivity.CardJsonRendered += OnChildCardJsonRendered;
            cardActivity.CardDataReceived += OnChildCardDataReceived;
            cardActivity.ModelBound += OnChildModelBound;
            cardActivity.ValidationFailed += OnChildValidationFailed;
        }

        // Forward plain message events from the child so that any
        // SimpleActivity or other activities emitting messages inside
        // this ConditionalActivity are surfaced through the normal
        // MessageEmitted → DomainAgentService → ChatWindow pipeline.
        activity.MessageEmitted += (s, e) => OnMessageEmitted(e.Message);

        // Track completion so we know when the selected branch has
        // fully finished (including composites that resume after
        // input). This lets RunActivity short-circuit instead of
        // re-running a completed child and violating its FSM.
        activity.ActivityCompleted += OnChildActivityCompleted;
        
        // Forward TriggerTopicActivity-specific events and ITopicTriggeredActivity events
        // EVENT BUBBLING: Child.TopicTriggered → ConditionalActivity.TopicTriggered → InsuranceAgentService
        if (activity is ITopicTriggeredActivity topicTriggeredActivity)
        {
            Console.WriteLine($"[ConditionalActivity.SubscribeToActivityEvents] Child '{activity.Id}' implements ITopicTriggeredActivity - subscribing to TopicTriggered events");
            topicTriggeredActivity.TopicTriggered += OnChildTopicTriggered;
        }
        
        // Subscribe to EventTriggerActivity-specific events  
        if (activity is ICustomEventTriggeredActivity customEventTriggeredActivity)
        {
            Console.WriteLine($"[ConditionalActivity.SubscribeToActivityEvents] Child '{activity.Id}' implements ICustomEventTriggeredActivity - subscribing to CustomEventTriggered events");
            customEventTriggeredActivity.CustomEventTriggered += OnChildCustomEventTriggered;
        }
    }

    /// <summary>
    /// Unsubscribe from child activity events
    /// </summary>
    private void UnsubscribeFromActivityEvents(TActivity activity)
    {
        if (activity is IAdaptiveCardActivity cardActivity)
        {
            cardActivity.CardJsonEmitted -= OnChildCardJsonEmitted;
            cardActivity.CardJsonSending -= OnChildCardJsonSending;
            cardActivity.CardJsonSent -= OnChildCardJsonSent;
            cardActivity.CardJsonRendered -= OnChildCardJsonRendered;
            cardActivity.CardDataReceived -= OnChildCardDataReceived;
            cardActivity.ModelBound -= OnChildModelBound;
            cardActivity.ValidationFailed -= OnChildValidationFailed;
        }
        
        // Unsubscribe from TriggerTopicActivity-specific events
        if (activity is TriggerTopicActivity triggerActivity)
        {
            triggerActivity.TopicTriggered -= OnChildTopicTriggered;
        }
        
        // Unsubscribe from EventTriggerActivity-specific events
        if (activity is ICustomEventTriggeredActivity customEventActivity)
        {
            customEventActivity.CustomEventTriggered -= OnChildCustomEventTriggered;
        }

        activity.ActivityCompleted -= OnChildActivityCompleted;
    }

    // === Event Forwarding Methods (RepeatActivity Pattern) ===
    
    private void OnChildCardJsonEmitted(object? sender, CardJsonEventArgs e)
    {
        _logger?.LogWarning("[ConditionalActivity] Forwarding CardJsonEmitted from branch '{Branch}' - CardId: {CardId}", _selectedBranch, e.CardId);
        CardJsonEmitted?.Invoke(this, e);
    }

    private void OnChildCardJsonSending(object? sender, CardJsonEventArgs e)
    {
        _logger?.LogWarning("[ConditionalActivity] Forwarding CardJsonSending from branch '{Branch}' - CardId: {CardId}", _selectedBranch, e.CardId);
        CardJsonSending?.Invoke(this, e);
    }

    private void OnChildCardJsonSent(object? sender, CardJsonEventArgs e)
    {
        _logger?.LogWarning("[ConditionalActivity] Forwarding CardJsonSent from branch '{Branch}' - CardId: {CardId}", _selectedBranch, e.CardId);
        CardJsonSent?.Invoke(this, e);
    }

    private void OnChildCardJsonRendered(object? sender, CardJsonRenderedEventArgs e)
    {
        _logger?.LogWarning("[ConditionalActivity] Forwarding CardJsonRendered from branch '{Branch}'", _selectedBranch);
        CardJsonRendered?.Invoke(this, e);
    }

    private void OnChildCardDataReceived(object? sender, CardDataReceivedEventArgs e)
    {
        _logger?.LogWarning("[ConditionalActivity] Forwarding CardDataReceived from branch '{Branch}'", _selectedBranch);
        CardDataReceived?.Invoke(this, e);
    }

    private void OnChildModelBound(object? sender, ModelBoundEventArgs e)
    {
        _logger?.LogWarning("[ConditionalActivity] Forwarding ModelBound from branch '{Branch}'", _selectedBranch);
        ModelBound?.Invoke(this, e);
    }

    private void OnChildValidationFailed(object? sender, ValidationFailedEventArgs e)
    {
        _logger?.LogWarning("[ConditionalActivity] Forwarding ValidationFailed from branch '{Branch}'", _selectedBranch);
        ValidationFailed?.Invoke(this, e);
    }

    /// <summary>
    /// Forward TopicTriggered events from child activities (TriggerTopicActivity, CompositeActivity, etc.)
    /// 
    /// EVENT BUBBLING: Child Activity → ConditionalActivity.OnChildTopicTriggered → ConditionalActivity.TopicTriggered → InsuranceAgentService
    /// </summary>
    private void OnChildTopicTriggered(object? sender, TopicTriggeredEventArgs e) {
        var senderId = sender is TopicFlowActivity a ? a.Id : "Unknown";
        var senderTyp = sender?.GetType().Name ?? "Unknown";
        var thisPath = $"{_selectedBranch ?? "?"}@{Id}";
        var combined = string.IsNullOrEmpty(e.BranchPath)
            ? thisPath
            : $"{thisPath} → {e.BranchPath}";

        var enriched = new TopicTriggeredEventArgs(
            e.TopicName,
            senderId,
            combined
        );

        _logger?.LogWarning(
            "[ConditionalActivity.OnChildTopicTriggered] *** EVENT BUBBLE *** " +
            "Topic='{Topic}' via BranchPath='{Path}' (child '{ChildId}', type={ChildType})",
            e.TopicName, combined, senderId, senderTyp);

        // Forward enriched event to parent
        TopicTriggered?.Invoke(this, enriched);
    }


    /// <summary>
    /// Forward CustomEventTriggered events from child activities (EventTriggerActivity, CompositeActivity, etc.)
    /// 
    /// EVENT BUBBLING: Child Activity → ConditionalActivity.OnChildCustomEventTriggered → ConditionalActivity.CustomEventTriggered → InsuranceAgentService
    /// </summary>
    private void OnChildCustomEventTriggered(object? sender, CustomEventTriggeredEventArgs e)
    {
        var senderType = sender?.GetType().Name ?? "Unknown";
        var senderId = sender is TopicFlowActivity activity ? activity.Id : "Unknown";
        
        _logger?.LogWarning("[ConditionalActivity.OnChildCustomEventTriggered] *** EVENT BUBBLE *** Forwarding CustomEventTriggered from child '{ChildId}' ({ChildType}) in branch '{Branch}' - EventName: {EventName}, ConditionalActivity: {ConditionalId}", 
            senderId, senderType, _selectedBranch, e.EventName, this.Id);
        Console.WriteLine($"[ConditionalActivity.OnChildCustomEventTriggered] *** EVENT BUBBLE *** Forwarding CustomEventTriggered from child '{senderId}' ({senderType}) to parent: EventName='{e.EventName}', ConditionalActivity='{this.Id}', Branch='{_selectedBranch}'");
        
        // CRITICAL: Forward event to parent - this should reach InsuranceAgentService if properly subscribed
        Console.WriteLine($"[ConditionalActivity.OnChildCustomEventTriggered] About to forward CustomEventTriggered event to parent. Subscribers: {CustomEventTriggered?.GetInvocationList().Length ?? 0}");
        CustomEventTriggered?.Invoke(this, e);
        Console.WriteLine($"[ConditionalActivity.OnChildCustomEventTriggered] CustomEventTriggered event forwarded to parent");
    }

    /// <summary>
    /// Handles completion of the selected branch activity. This is
    /// especially important when the child is a CompositeActivity
    /// that resumes itself after input; in that case completion
    /// happens outside of our immediate RunActivity call.
    /// </summary>
    private void OnChildActivityCompleted(object? sender, ActivityCompletedEventArgs e)
    {
        _logger?.LogInformation(
            "[ConditionalActivity] 🏁 Child activity '{ChildId}' completed for branch '{Branch}' in {Id}",
            e.ActivityId,
            _selectedBranch ?? "null",
            Id);

        _activityCompleted = true;
    }
}
