using ConversaCore.Events;
using ConversaCore.Interfaces;

namespace ConversaCore.TopicFlow;

/// <summary>
/// Lightweight activity that asks the UI to display suggestion chips ("pills")
/// outside the chat transcript. When a pill is clicked, the UI should send the
/// suggestion text back as a normal user message.
/// </summary>
public class ShowSuggestionsActivity : TopicFlowActivity, ICustomEventTriggeredActivity
{
    public const string DefaultEventName = "UpdateSuggestions";

    private readonly string _eventName;
    private readonly Func<TopicWorkflowContext, IEnumerable<string>> _suggestionsFactory;

    public event EventHandler<CustomEventTriggeredEventArgs>? CustomEventTriggered;

    public ShowSuggestionsActivity(
        string id,
        IEnumerable<string> suggestions,
        string? eventName = null)
        : base(id)
    {
        if (suggestions == null) throw new ArgumentNullException(nameof(suggestions));

        _eventName = string.IsNullOrWhiteSpace(eventName) ? DefaultEventName : eventName;
        var snapshot = suggestions.ToArray();
        _suggestionsFactory = _ => snapshot;
    }

    public ShowSuggestionsActivity(
        string id,
        Func<TopicWorkflowContext, IEnumerable<string>> suggestionsFactory,
        string? eventName = null)
        : base(id)
    {
        _suggestionsFactory = suggestionsFactory ?? throw new ArgumentNullException(nameof(suggestionsFactory));
        _eventName = string.IsNullOrWhiteSpace(eventName) ? DefaultEventName : eventName;
    }

    protected override Task<ActivityResult> RunActivity(
        TopicWorkflowContext context,
        object? input = null,
        CancellationToken cancellationToken = default)
    {
        var raw = _suggestionsFactory(context) ?? Array.Empty<string>();
        var suggestions = raw.Where(s => !string.IsNullOrWhiteSpace(s)).ToArray();

        // Store in context for downstream activities or debugging.
        context.SetValue($"{Id}_Suggestions", suggestions);

        var args = new CustomEventTriggeredEventArgs(_eventName, suggestions, context, waitForResponse: false);
        CustomEventTriggered?.Invoke(this, args);

        // Continue immediately; UI will render pills based on the event.
        return Task.FromResult(ActivityResult.Continue(new { Event = _eventName, Suggestions = suggestions }));
    }
}
