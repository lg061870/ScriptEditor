using ConversaCore.TopicFlow;
using System;

namespace ConversaCore.Interfaces;

/// <summary>
/// Interface for activities that can trigger topic transitions.
/// Enables consistent event subscription patterns for nested container activities.
/// </summary>
public interface ITopicTriggeredActivity
{
    /// <summary>
    /// Event fired when this activity triggers a topic transition
    /// </summary>
    event EventHandler<TopicTriggeredEventArgs>? TopicTriggered;

    /// <summary>
    /// Whether this activity should wait for the triggered topic to complete
    /// before continuing execution
    /// </summary>
    bool WaitForCompletion { get; }
}