using System;
using System.Threading;
using System.Threading.Tasks;

namespace ConversaCore.TopicFlow; 
/// <summary>
/// Emits a fallback message when no other topic matches.
/// </summary>
public class FallbackActivity : TopicFlowActivity {
    private readonly string _message;

    public FallbackActivity(string id, string message)
        : base(id) {
        _message = message ?? throw new ArgumentNullException(nameof(message));
    }

    /// <inheritdoc/>
    protected override Task<ActivityResult> RunActivity(
        TopicWorkflowContext context,
        object? input = null,
        CancellationToken cancellationToken = default) {
        TransitionTo(ActivityState.Running, input);

        // Mark in context that fallback was triggered
        context.SetValue("FallbackTriggered", true);

        TransitionTo(ActivityState.Completed, _message);

        // End the workflow with the fallback message
        return Task.FromResult(ActivityResult.End(_message));
    }
}
