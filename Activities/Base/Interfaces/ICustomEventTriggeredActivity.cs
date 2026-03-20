using ConversaCore.Events;

namespace ConversaCore.Interfaces;

/// <summary>
/// Interface for activities that can trigger custom events.
/// </summary>
public interface ICustomEventTriggeredActivity {
    event EventHandler<CustomEventTriggeredEventArgs>? CustomEventTriggered;
}
