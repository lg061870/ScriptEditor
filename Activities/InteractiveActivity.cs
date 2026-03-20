using System;
using System.Threading.Tasks;

namespace ConversaCore.TopicFlow; 
/// <summary>
/// An activity that displays a message or question and waits for user input before continuing.
/// </summary>
public class InteractiveActivity : TopicFlowActivity {
    private readonly Func<TopicWorkflowContext, object?, Task<object?>>? _interaction;
    private readonly string? _message;
    private Task<object?>? _activeInteractionTask;

    /// <summary>
    /// Gets or sets the name of the context key where user input will be stored.
    /// Defaults to the activity ID.
    /// </summary>
    public string? InputContextKey { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether user input is required
    /// before the activity can continue.
    /// </summary>
    public bool IsInputRequired { get; set; } = true;
    
    /// <summary>
    /// Terminates the activity, releasing resources and unsubscribing from events.
    /// Special handling for interactive activities with ongoing interaction tasks.
    /// </summary>
    public override void Terminate()
    {
        // Cancel any ongoing interaction task first
        if (_activeInteractionTask != null && !_activeInteractionTask.IsCompleted)
        {
            // We cannot cancel the task directly, but we'll set the token to canceled
            // so if the task checks for cancellation, it will notice
            _cancellationTokenSource?.Cancel();
        }
        
        // Clear the reference to potentially prevent memory leaks
        _activeInteractionTask = null;
        
        // Call base implementation to handle common termination logic
        base.Terminate();
    }

    public InteractiveActivity(string id, string message)
        : base(id) {
        _message = message ?? throw new ArgumentNullException(nameof(message));
        InputContextKey = id;
    }

    public InteractiveActivity(string id,
        Func<TopicWorkflowContext, object?, Task<object?>> interaction)
        : base(id) {
        _interaction = interaction ?? throw new ArgumentNullException(nameof(interaction));
        InputContextKey = id;
    }

    public static InteractiveActivity Create(string id, string message) =>
        new InteractiveActivity(id, message);

    public static InteractiveActivity Create(string id,
        Func<TopicWorkflowContext, object?, Task<object?>> interaction) =>
        new InteractiveActivity(id, interaction);



    /// <inheritdoc/>
    protected override async Task<ActivityResult> RunActivity(
        TopicWorkflowContext context,
        object? input = null,
        CancellationToken cancellationToken = default) {

        object? model = null;
        TransitionTo(ActivityState.Running, input);

        // --- Handle input mapping ---
        if (input != null && !string.IsNullOrEmpty(InputContextKey)) {
            context.SetValue(InputContextKey, input);

            if (ModelType != null && input is System.Collections.Generic.IDictionary<string, object> dict) {
                try {
                    var json = System.Text.Json.JsonSerializer.Serialize(dict);
                    model = System.Text.Json.JsonSerializer.Deserialize(
                        json,
                        ModelType,
                        new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true }
                    );
                    if (!string.IsNullOrEmpty(ModelContextKey))
                        context.SetValue(ModelContextKey, model);
                } catch {
                    TransitionTo(ActivityState.ValidationFailed, input);
                    return ActivityResult.Continue(new { Error = "Invalid input format." });
                }
            }
        }

        // --- Case 1: Static message prompt ---
        if (_message != null) {
            if (input == null) {
                // First render
                TransitionTo(ActivityState.Rendered, _message);
                return ActivityResult.WaitForInput(_message);
            }

            // Input came in
            TransitionTo(ActivityState.Completed, input);
            return ActivityResult.Continue(model ?? input);
        }

        // --- Case 2: Dynamic interaction function provided ---
        if (_interaction != null) {
            if (input == null) {
                // First render
                _activeInteractionTask = _interaction(context, null);
                var firstPayload = await _activeInteractionTask;
                TransitionTo(ActivityState.Rendered, firstPayload);
                return IsInputRequired
                    ? ActivityResult.WaitForInput(firstPayload?.ToString())
                    : ActivityResult.Continue(firstPayload ?? string.Empty);
            }

            // Input came in
            _activeInteractionTask = _interaction(context, input);
            var payload = await _activeInteractionTask;
            TransitionTo(ActivityState.InputCollected, input);
            TransitionTo(ActivityState.Completed, payload);
            return ActivityResult.Continue(payload ?? model ?? input);
        }

        // --- Invalid configuration ---
        TransitionTo(ActivityState.Failed, "No message or interaction function configured.");
        throw new InvalidOperationException(
            $"InteractiveActivity '{Id}' has neither a message nor an interaction function."
        );
    }
}
