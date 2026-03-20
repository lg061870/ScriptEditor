namespace ConversaCore.TopicFlow;

/// <summary>
/// Represents the result of running an activity.
/// Each result communicates the next step for the workflow engine
/// — whether to continue, wait for input, spawn a sub-topic, or end.
/// </summary>
public class ActivityResult {
    /// <summary>
    /// True if the workflow should pause and wait for user input.
    /// </summary>
    public bool IsWaiting { get; private set; }

    /// <summary>
    /// True if the workflow should pause and wait for a sub-topic to complete.
    /// </summary>
    public bool IsWaitingForSubTopic { get; private set; }

    /// <summary>
    /// Name of the sub-topic to wait for (when <see cref="IsWaitingForSubTopic"/> is true).
    /// </summary>
    public string? SubTopicName { get; private set; }

    /// <summary>
    /// Optional chat message returned by the activity.
    /// </summary>
    public string? Message { get; private set; }

    /// <summary>
    /// Optional strongly-typed payload or model context.
    /// </summary>
    public object? ModelContext { get; private set; }

    /// <summary>
    /// True if the workflow should terminate after this result.
    /// </summary>
    public bool IsEnd { get; private set; }

    /// <summary>
    /// True if the activity was cancelled before completion.
    /// </summary>
    public bool IsCancelled { get; private set; }

    private ActivityResult() { }

    // ------------------------------------------------------------------------
    // FACTORY HELPERS
    // ------------------------------------------------------------------------

    /// <summary> Continue workflow with no data. </summary>
    public static ActivityResult Continue() => new();

    /// <summary> Continue workflow with a simple message string. </summary>
    public static ActivityResult Continue(string message) =>
        new() { Message = message };

    /// <summary> Continue workflow with a payload/model context. </summary>
    public static ActivityResult Continue(object payload) =>
        new() { ModelContext = payload };

    /// <summary> Continue workflow with both a message and payload. </summary>
    public static ActivityResult Continue(string message, object? modelContext) =>
        new() { Message = message, ModelContext = modelContext };

    /// <summary> End the workflow with a message. </summary>
    public static ActivityResult End(string message) =>
        new() { IsEnd = true, Message = message };

    /// <summary> End the workflow with a payload. </summary>
    public static ActivityResult End(object payload) =>
        new() { IsEnd = true, ModelContext = payload };

    /// <summary> Wait for user input, optionally providing a text prompt. </summary>
    public static ActivityResult WaitForInput(string? prompt = null) =>
        new() { IsWaiting = true, Message = prompt };

    /// <summary> Wait for user input and include a structured payload. </summary>
    public static ActivityResult WaitForInput(object payload, object? modelContext = null) =>
        new() { IsWaiting = true, ModelContext = payload, Message = null };

    /// <summary>
    /// Wait for a sub-topic to complete before resuming.
    /// </summary>
    public static ActivityResult WaitForSubTopic(string subTopicName, string? message = null) =>
        new() {
            IsWaitingForSubTopic = true,
            SubTopicName = subTopicName,
            Message = message ?? $"Waiting for sub-topic '{subTopicName}' to complete."
        };

    /// <summary>
    /// Wait for a sub-topic to complete, providing additional context/payload.
    /// </summary>
    public static ActivityResult WaitForSubTopic(string subTopicName, object? modelContext, string? message = null) =>
        new() {
            IsWaitingForSubTopic = true,
            SubTopicName = subTopicName,
            ModelContext = modelContext,
            Message = message ?? $"Waiting for sub-topic '{subTopicName}' to complete."
        };

    /// <summary>
    /// Create a result that signals cancellation by user or orchestrator.
    /// </summary>
    public static ActivityResult Cancelled(string? message = null) =>
        new() {
            IsCancelled = true,
            Message = message ?? "Activity cancelled."
        };

    // ------------------------------------------------------------------------
    // UTILITIES
    // ------------------------------------------------------------------------

    /// <summary>
    /// Allows deconstruction of the result into its message and payload.
    /// Useful for pattern matching and concise unpacking.
    /// </summary>
    public void Deconstruct(out string? message, out object? modelContext) {
        message = Message;
        modelContext = ModelContext;
    }

    /// <summary>
    /// Returns a readable summary for debugging.
    /// </summary>
    public override string ToString() {
        var flags = new List<string>();
        if (IsWaiting) flags.Add("WaitForInput");
        if (IsWaitingForSubTopic) flags.Add($"WaitForSubTopic:{SubTopicName}");
        if (IsEnd) flags.Add("End");
        if (IsCancelled) flags.Add("Cancelled");
        if (flags.Count == 0) flags.Add("Continue");

        return $"ActivityResult[{string.Join(',', flags)}] " +
               $"Message={(Message ?? "null")}, ModelContext={(ModelContext ?? "null")}";
    }
}
