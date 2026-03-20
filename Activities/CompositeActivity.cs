using ConversaCore.Events;
using ConversaCore.Interfaces;
using ConversaCore.Models;

namespace ConversaCore.TopicFlow; 
/// <summary>
/// CompositeActivity is a container that executes a sequence of child activities.
/// 
/// Responsibilities:
///  1. Run children one by one in declared order.
///  2. If a child waits for input → Composite waits.
///  3. When that child completes → Composite resumes automatically.
///  4. Bubble all relevant events to the parent orchestrator.
/// </summary>
public class CompositeActivity :
    TopicFlowActivity,
    IAdaptiveCardActivity,
    ITopicTriggeredActivity,
    ICustomEventTriggeredActivity {

    private readonly IList<TopicFlowActivity> _activities;
    private TopicFlowActivity? _waitingChild;
    private TopicWorkflowContext? _storedContext;

    private string CurrentIndexKey => $"{Id}_CurrentActivityIndex";

    // -----------------------------
    // Event forwarding interfaces
    // -----------------------------
    public event EventHandler<TopicTriggeredEventArgs>? TopicTriggered;
    public event EventHandler<CustomEventTriggeredEventArgs>? CustomEventTriggered;

    public new event EventHandler<ActivityLifecycleEventArgs>? ActivityLifecycleChanged;
    public new event EventHandler<ActivityCompletedEventArgs>? ActivityCompleted;

    public event EventHandler<CardJsonEventArgs>? CardJsonEmitted;
    public event EventHandler<CardJsonEventArgs>? CardJsonSending;
    public event EventHandler<CardJsonEventArgs>? CardJsonSent;
    public event EventHandler<CardJsonRenderedEventArgs>? CardJsonRendered;
    public event EventHandler<CardDataReceivedEventArgs>? CardDataReceived;
    public event EventHandler<ModelBoundEventArgs>? ModelBound;
    public event EventHandler<ValidationFailedEventArgs>? ValidationFailed;

    public bool WaitForCompletion =>
        _waitingChild is ITopicTriggeredActivity t ? t.WaitForCompletion : false;

    public bool IsolateContext { get; set; }
    public string? CompleteMessage { get; set; }

    // -----------------------------
    // Constructor / Factory
    // -----------------------------
    public CompositeActivity(string id, IEnumerable<TopicFlowActivity> activities)
        : base(id) {

        if (activities == null || !activities.Any())
            throw new ArgumentNullException(nameof(activities),
                "At least one child activity must be provided.");

        _activities = new List<TopicFlowActivity>(activities);
        foreach (var a in _activities) HookChildEvents(a);
    }

    public static CompositeActivity Create(string id, params TopicFlowActivity[] activities)
        => new CompositeActivity(id, activities);

    public static CompositeActivity Create(string id, params Action<TopicWorkflowContext>[] actions) {
        if (actions == null || actions.Length == 0)
            throw new ArgumentNullException(nameof(actions));

        var list = new List<TopicFlowActivity>();
        for (int i = 0; i < actions.Length; i++) {
            var act = actions[i] ?? throw new ArgumentNullException(nameof(actions), $"Action {i} is null");
            list.Add(SimpleActivity.Create($"{id}_Step{i + 1}", act));
        }
        return new CompositeActivity(id, list);
    }

    // ===========================================================
    // Allowed state transitions (explicit FSM)
    // ===========================================================
    protected override Dictionary<ActivityState, HashSet<ActivityState>> AllowedTransitions =>
        new() {
            { ActivityState.Idle, new() { ActivityState.Created } },
            { ActivityState.Created, new() { ActivityState.Running, ActivityState.Failed } },
            { ActivityState.Running, new() {
                ActivityState.WaitingForSubActivity,
                ActivityState.Completed,
                ActivityState.Failed
            }},
            { ActivityState.WaitingForSubActivity, new() {
                ActivityState.Running,
                ActivityState.Completed,
                ActivityState.Failed
            }},
            { ActivityState.Completed, new() { } },
            { ActivityState.Failed, new() { } }
        };

    // ===========================================================
    // Main run entrypoint
    // ===========================================================
    protected override async Task<ActivityResult> RunActivity(
        TopicWorkflowContext context,
        object? input = null,
        CancellationToken cancellationToken = default) {

        TransitionTo(ActivityState.Running, input);
        _storedContext = context;

        var currentIndex = context.GetValue<int>(CurrentIndexKey, 0);
        Console.WriteLine($"[CompositeActivity] Starting at index {currentIndex} / {_activities.Count}");

        // Execute sequentially
        while (currentIndex < _activities.Count) {
            var child = _activities[currentIndex];
            Console.WriteLine($"[CompositeActivity] → Running child {child.Id}");

            var childInput = (input != null && currentIndex == 0) ? input : null;
            var result = await child.RunAsync(context, childInput, cancellationToken);

            if (result.IsWaiting) {
                _waitingChild = child;
                context.SetValue(CurrentIndexKey, currentIndex);

                TransitionTo(ActivityState.WaitingForSubActivity,
                    $"Waiting for sub-activity '{child.Id}'");

                Console.WriteLine($"[CompositeActivity] 💤 Waiting for {child.Id}");
                return ActivityResult.WaitForInput($"Waiting for '{child.Id}' to complete");
            }

            // Advance to next child
            currentIndex++;
            context.SetValue(CurrentIndexKey, currentIndex);
        }

        // All children done
        context.SetValue(CurrentIndexKey, 0);
        TransitionTo(ActivityState.Completed, "Composite completed all children");

        if (!string.IsNullOrEmpty(CompleteMessage))
            return ActivityResult.Continue(CompleteMessage);

        return ActivityResult.Continue();
    }

    // ===========================================================
    // Continuation after a waiting child completes
    // ===========================================================
    private async Task ResumeAsync(TopicWorkflowContext context) {
        var index = context.GetValue<int>(CurrentIndexKey, 0) + 1;
        Console.WriteLine($"[CompositeActivity.ResumeAsync] ▶️ Resuming composite '{Id}' at index {index}");

        TransitionTo(ActivityState.Running, $"Resuming at index {index}");

        while (index < _activities.Count) {
            var child = _activities[index];
            Console.WriteLine($"[CompositeActivity.ResumeAsync] ➡️ Next child: {child.Id} ({child.GetType().Name})");

            var result = await child.RunAsync(context, null, CancellationToken.None);
            Console.WriteLine($"[CompositeActivity.ResumeAsync] Child {child.Id} finished RunAsync → IsWaiting={result.IsWaiting}");

            if (result.IsWaiting) {
                _waitingChild = child;
                context.SetValue(CurrentIndexKey, index);
                TransitionTo(ActivityState.WaitingForSubActivity, $"Waiting for sub-activity '{child.Id}'");
                Console.WriteLine($"[CompositeActivity.ResumeAsync] 💤 Waiting on {child.Id}");
                return;
            }

            index++;
            context.SetValue(CurrentIndexKey, index);
        }

        context.SetValue(CurrentIndexKey, 0);
        TransitionTo(ActivityState.Completed, "Composite resumed and completed all children");

        Console.WriteLine($"[CompositeActivity.ResumeAsync] 🏁 Composite '{Id}' fully completed all children");
        ActivityCompleted?.Invoke(this,
            new ActivityCompletedEventArgs(Id, ActivityResult.Continue("Composite completed")));
    }


    // ===========================================================
    // Event forwarding and continuation hooks
    // ===========================================================
    private void HookChildEvents(TopicFlowActivity child) {
        // Forward lifecycle events
        child.ActivityLifecycleChanged += (s, e) =>
            ActivityLifecycleChanged?.Invoke(s, e);

        // Forward message events so that SimpleActivity and other
        // children emitting messages are visible to the outer
        // orchestration. We can't invoke the base MessageEmitted
        // event directly from here, so we delegate to the protected
        // OnMessageEmitted helper on TopicFlowActivity.
        child.MessageEmitted += (s, e) =>
            OnMessageEmitted(e.Message);

        // Handle and forward completion
        child.ActivityCompleted += (s, e) => {
            Console.WriteLine($"[CompositeActivity] 🟡 Child completed event fired for {((TopicFlowActivity)s!).Id}");

            ActivityCompleted?.Invoke(s, e);

            // Resume if this was the waiting child
            if (_waitingChild != null && ReferenceEquals(s, _waitingChild)) {
                Console.WriteLine($"[CompositeActivity] ✅ Waiting child {_waitingChild.Id} completed. Resuming sequence...");

                _waitingChild = null;
                if (_storedContext != null) {
                    _ = Task.Run(async () => {
                        try {
                            Console.WriteLine($"[CompositeActivity] ⚙️ Calling ResumeAsync() after {_waitingChild?.Id ?? "unknown"} completion");
                            await ResumeAsync(_storedContext);
                        } catch (Exception ex) {
                            Console.WriteLine($"[CompositeActivity] ❌ ResumeAsync error: {ex}");
                            TransitionTo(ActivityState.Failed, ex);
                        }
                    });
                }
            }
        };


        // Forward topic and custom events
        if (child is ITopicTriggeredActivity t)
            t.TopicTriggered += (s, e) => TopicTriggered?.Invoke(s, e);

        if (child is ICustomEventTriggeredActivity c)
            c.CustomEventTriggered += (s, e) => CustomEventTriggered?.Invoke(s, e);

        // Forward adaptive card events
        if (child is IAdaptiveCardActivity ac) {
            ac.CardJsonEmitted += (s, e) => CardJsonEmitted?.Invoke(s, e);
            ac.CardJsonSending += (s, e) => CardJsonSending?.Invoke(s, e);
            ac.CardJsonSent += (s, e) => CardJsonSent?.Invoke(s, e);
            ac.CardJsonRendered += (s, e) => CardJsonRendered?.Invoke(s, e);
            ac.CardDataReceived += (s, e) => CardDataReceived?.Invoke(s, e);
            ac.ModelBound += (s, e) => ModelBound?.Invoke(s, e);
            ac.ValidationFailed += (s, e) => ValidationFailed?.Invoke(s, e);
        }
    }

    public void OnInputCollected(AdaptiveCardInputCollectedEventArgs e) {
        if (_waitingChild is IAdaptiveCardActivity cardChild)
            cardChild.OnInputCollected(e);
    }
}
