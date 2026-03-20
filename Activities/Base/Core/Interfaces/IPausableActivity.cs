namespace ConversaCore.TopicFlow.Core.Interfaces; 
public interface IPausableActivity {
    bool IsPaused { get; }
    Task PauseAsync(string reason, CancellationToken cancellationToken = default);
    Task ResumeAsync(string? input = null, CancellationToken cancellationToken = default);
}