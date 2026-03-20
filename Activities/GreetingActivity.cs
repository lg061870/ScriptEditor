using ConversaCore.Models;
using System.Threading;
using System.Threading.Tasks;

namespace ConversaCore.TopicFlow; 
/// <summary>
/// Emits a greeting message as the first activity in the conversation flow.
/// </summary>
public class GreetingActivity : TopicFlowActivity {
    public GreetingActivity(string id) : base(id) { }

    /// <inheritdoc/>
    protected override Task<ActivityResult> RunActivity(
        TopicWorkflowContext context,
        object? input = null,
        CancellationToken cancellationToken = default) {
        const string text = "👋 Welcome! I can help you navigate options. What would you like to do?";

        // ✅ Surface greeting message and continue to the next activity
        OnMessageEmitted(text);
        return Task.FromResult(ActivityResult.Continue(text));
    }
}
