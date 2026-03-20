namespace ConversaCore.TopicFlow {
    /// <summary>
    /// Represents a transition from one activity to another.
    /// </summary>
    public class Transition {
        /// <summary>
        /// Gets the ID of the target activity.
        /// </summary>
        public string TargetActivityId { get; }

        /// <summary>
        /// Gets the condition required for the transition to be valid.
        /// </summary>
        public Func<TopicWorkflowContext, bool>? Condition { get; }

        /// <summary>
        /// Initializes a new instance of the <see cref="Transition"/> class.
        /// </summary>
        /// <param name="targetActivityId">The target activity ID.</param>
        /// <param name="condition">Optional predicate for whether this transition is valid.</param>
        public Transition(string targetActivityId, Func<TopicWorkflowContext, bool>? condition = null) {
            TargetActivityId = targetActivityId ?? throw new ArgumentNullException(nameof(targetActivityId));
            Condition = condition;
        }
    }
}
