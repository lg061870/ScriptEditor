using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using System.Linq;

namespace ConversaCore.TopicFlow; 
/// <summary>
/// Clears conversation state and emits a reset message.
/// </summary>
public class ResetActivity : TopicFlowActivity {
    private readonly string _message;

    public ResetActivity(string id, string message) : base(id) {
        _message = message ?? throw new ArgumentNullException(nameof(message));
    }

    /// <inheritdoc/>
    protected override Task<ActivityResult> RunActivity(
        TopicWorkflowContext context,
        object? input = null,
        CancellationToken cancellationToken = default) {
        // Reset core context values
        context.SetValue("Messages", new List<(string Role, string Content)>());
        context.SetValue("TopicChain", new Queue<string>());
        context.SetValue("CurrentTopic", string.Empty);
        
        // Reset any activity-specific flags that might prevent cards from displaying
        context.SetValue("ShowComplianceCard_Rendered", false);
        context.SetValue("ShowComplianceCard_Sent", false);
        context.SetValue("ComplianceTopicState", null);
        
        // Clear all completion flags for topics and states
        foreach (var key in context.GetKeys().Where(k => k.EndsWith("_Completed") || k.EndsWith("State")))
        {
            context.SetValue(key, null);
        }
        
        // Reset all topic-related activity state
        foreach (var key in context.GetKeys().Where(k => k.Contains("Activity_") || k.Contains("_Decision")))
        {
            context.SetValue(key, null);
        }
        
        // Reset any compliance-related data
        context.SetValue("tcpa_consent", null);
        context.SetValue("ccpa_acknowledgment", null);
        context.SetValue("is_california_resident", null);
        context.SetValue("marketing_path", null);
        context.SetValue("next_topic", null);

        // Surface the reset message and continue
        return Task.FromResult(ActivityResult.Continue(_message));
    }
}
