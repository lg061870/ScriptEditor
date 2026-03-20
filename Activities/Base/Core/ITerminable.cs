namespace ConversaCore.TopicFlow.Core;

/// <summary>
/// Interface for components that can be explicitly terminated.
/// Implementing this interface allows for proper cleanup and resource release
/// when an object is no longer needed but before it's garbage collected.
/// </summary>
public interface ITerminable
{
    /// <summary>
    /// Terminates the component, releasing resources and unsubscribing from events.
    /// This should be called when the component is no longer needed to prevent memory leaks.
    /// </summary>
    /// <returns>True if termination was successful, false if already terminated or failed.</returns>
    bool Terminate();
    
    /// <summary>
    /// Gets whether the component has already been terminated.
    /// </summary>
    bool IsTerminated { get; }
}