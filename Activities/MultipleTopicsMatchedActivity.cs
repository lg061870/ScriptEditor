using System.Threading;
using System.Threading.Tasks;

namespace ConversaCore.TopicFlow; 
/// <summary>
/// Emits a clarification prompt when multiple topics match.
/// Useful when confidence scores are too close and user needs to disambiguate.
/// </summary>
public class MultipleTopicsMatchedActivity : TopicFlowActivity {
    private readonly string _message;

    /// <summary>
    /// Initializes a new instance of the <see cref="MultipleTopicsMatchedActivity"/> class.
    /// </summary>
    /// <param name="id">Unique identifier for this activity.</param>
    /// <param name="message">Clarification message to surface.</param>
    public MultipleTopicsMatchedActivity(string id, string message)
        : base(id) {
        _message = string.IsNullOrWhiteSpace(message)
            ? "🤔 I found multiple possible matches, can you clarify?"
            : message;
    }

    /// <inheritdoc/>
    protected override Task<ActivityResult> RunActivity(
        TopicWorkflowContext context,
        object? input = null,
        CancellationToken cancellationToken = default) {
        // Surface clarification message and continue flow
        return Task.FromResult(ActivityResult.Continue(_message));
    }
}
