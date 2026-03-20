using System;
using System.Threading;
using System.Threading.Tasks;

namespace ConversaCore.TopicFlow; 
/// <summary>
/// Emits a sign-in prompt message and immediately continues.
/// </summary>
public class SignInActivity : TopicFlowActivity {
    private readonly string _message;

    public SignInActivity(string id, string message) : base(id) {
        _message = message ?? throw new ArgumentNullException(nameof(message));
    }

    /// <inheritdoc/>
    protected override Task<ActivityResult> RunActivity(
        TopicWorkflowContext context,
        object? input = null,
        CancellationToken cancellationToken = default) {
        // Surface the sign-in prompt and then continue
        return Task.FromResult(ActivityResult.Continue(_message));
    }
}
