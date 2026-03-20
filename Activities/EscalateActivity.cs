using System.Threading;
using System.Threading.Tasks;

namespace ConversaCore.TopicFlow; 
/// <summary>
/// Emits an escalation message to connect with a human agent.
/// Marks the end of the automated workflow.
/// </summary>
public class EscalateActivity : TopicFlowActivity {
    private readonly string _message;

    public EscalateActivity(string id, string message) : base(id) {
        _message = message ?? throw new System.ArgumentNullException(nameof(message));
    }

    /// <inheritdoc/>
    protected override Task<ActivityResult> RunActivity(
        TopicWorkflowContext context,
        object? input = null,
        CancellationToken cancellationToken = default) {
        TransitionTo(ActivityState.Running, input);

        // Mark in context that escalation occurred
        context.SetValue("EscalationRequested", true);

        TransitionTo(ActivityState.Completed, _message);

        // Signal that the workflow ends and requires human intervention
        return Task.FromResult(ActivityResult.End(_message));
    }
}
