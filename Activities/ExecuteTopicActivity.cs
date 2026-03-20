using System;
using System.Threading;
using System.Threading.Tasks;
using ConversaCore.Topics;

namespace ConversaCore.TopicFlow; 
/// <summary>
/// Activity that executes another topic by name and resumes flow when complete.
/// </summary>
public class ExecuteTopicActivity : TopicFlowActivity {
    private readonly string _topicName;
    private readonly ITopicRegistry _topicRegistry;

    public ExecuteTopicActivity(string id, string topicName, ITopicRegistry topicRegistry)
        : base(id) {
        _topicName = topicName ?? throw new ArgumentNullException(nameof(topicName));
        _topicRegistry = topicRegistry ?? throw new ArgumentNullException(nameof(topicRegistry));
    }

    /// <inheritdoc/>
    protected override async Task<ActivityResult> RunActivity(
        TopicWorkflowContext context,
        object? input = null,
        CancellationToken cancellationToken = default) {
        TransitionTo(ActivityState.Running, input);

        var topic = _topicRegistry.GetTopic(_topicName) as TopicFlow;
        if (topic == null) {
            TransitionTo(ActivityState.Failed, $"Topic '{_topicName}' not found or not a TopicFlow.");
            throw new InvalidOperationException($"ExecuteTopicActivity could not resolve topic '{_topicName}' as a TopicFlow.");
        }

        try {
            // Kick off the topic
            var result = await topic.RunAsync(cancellationToken);

            // Optionally persist subtopic result in parent context
            context.SetValue($"{Id}_TopicResult", result);

            TransitionTo(ActivityState.Completed, result);

            return ActivityResult.Continue();
        } catch (Exception ex) {
            TransitionTo(ActivityState.Failed, ex);
            throw;
        }

    }
}

/// <summary>
/// Example registry interface for topic lookup.
/// </summary>
public interface ITopicRegistry {
    ITopic? GetTopic(string name);
}
