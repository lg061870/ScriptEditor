using System;
using System.Threading;
using System.Threading.Tasks;

namespace ConversaCore.TopicFlow; 
/// <summary>
/// An activity that introduces a delay in the workflow execution.
/// </summary>
public class DelayActivity : TopicFlowActivity {
    private readonly TimeSpan? _fixedDelay;
    private readonly Func<TopicWorkflowContext, Task<TimeSpan>>? _delayProvider;

    /// <summary>
    /// Gets or sets an optional message to display during the delay.
    /// </summary>
    public string? Message { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the UI should display a typing indicator during the delay.
    /// </summary>
    public bool ShowTypingIndicator { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the delay should be client-side or server-side.
    /// If true, the server will wait; if false, the client will wait.
    /// </summary>
    public bool IsServerSideDelay { get; set; } = true;

    public DelayActivity(string id, TimeSpan delay) : base(id) {
        _fixedDelay = delay;
    }

    public DelayActivity(string id, Func<TopicWorkflowContext, Task<TimeSpan>> delayProvider) : base(id) {
        _delayProvider = delayProvider ?? throw new ArgumentNullException(nameof(delayProvider));
    }

    // === Factory Helpers ===
    public static DelayActivity Create(string id, int milliseconds)
        => new DelayActivity(id, TimeSpan.FromMilliseconds(milliseconds));

    public static DelayActivity Create(string id, TimeSpan delay)
        => new DelayActivity(id, delay);

    public static DelayActivity Create(string id, Func<TopicWorkflowContext, Task<TimeSpan>> delayProvider)
        => new DelayActivity(id, delayProvider);

    /// <inheritdoc/>
    protected override async Task<ActivityResult> RunActivity(
        TopicWorkflowContext context,
        object? input = null,
        CancellationToken cancellationToken = default) {
        // Resolve delay
        TimeSpan delay = _delayProvider != null
            ? await _delayProvider(context)
            : _fixedDelay ?? TimeSpan.Zero;

        if (IsServerSideDelay) {
            // Server blocks here
            if (delay > TimeSpan.Zero)
                await Task.Delay(delay, cancellationToken);

            // Surface message if provided
            if (!string.IsNullOrEmpty(Message))
                return ActivityResult.Continue(Message);

            return ActivityResult.Continue();
        }
        else {
            // Tell UI to wait — this becomes a surfaced payload
            var payload = new DelayPayload {
                Type = "Delay",
                DelayMs = (int)delay.TotalMilliseconds,
                ShowTypingIndicator = ShowTypingIndicator,
                Message = Message
            };

            return ActivityResult.WaitForInput(payload);
        }
    }

    /// <summary>
    /// Serializable payload so UI can interpret delays (client-side mode).
    /// </summary>
    public class DelayPayload {
        public string Type { get; set; } = "Delay";
        public int DelayMs { get; set; }
        public bool ShowTypingIndicator { get; set; }
        public string? Message { get; set; }
    }
}
