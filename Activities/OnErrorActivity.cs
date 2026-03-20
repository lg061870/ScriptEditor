using System.Threading;
using System.Threading.Tasks;

namespace ConversaCore.TopicFlow; 
/// <summary>
/// Emits a friendly error message when something goes wrong.
/// </summary>
public class OnErrorActivity : TopicFlowActivity {
    private readonly string _message;

    /// <summary>
    /// Initializes a new instance of the <see cref="OnErrorActivity"/> class.
    /// </summary>
    /// <param name="id">Unique identifier for this activity.</param>
    /// <param name="message">Error message to emit.</param>
    public OnErrorActivity(string id, string message)
        : base(id) {
        _message = string.IsNullOrWhiteSpace(message)
            ? "⚠️ An unknown error occurred."
            : message;
    }

    /// <inheritdoc/>
    protected override Task<ActivityResult> RunActivity(
        TopicWorkflowContext context,
        object? input = null,
        CancellationToken cancellationToken = default) {
        // Surface error message but continue flow
        return Task.FromResult(ActivityResult.Continue(_message));
    }
}
