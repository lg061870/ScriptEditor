using System.Text.Json.Serialization;
using ConversaCore.Cards;
using Microsoft.Extensions.Logging;

namespace ConversaCore.TopicFlow.Activities;

/// <summary>
/// Model for the inline "ask a question" prompt.
/// This is a very lightweight card model so that the
/// UI can style it like a normal chat message while
/// still flowing through the AdaptiveCardActivity
/// lifecycle and validation pipeline.
/// </summary>
public class WaitForUserInputModel : BaseCardModel
{
    /// <summary>
    /// Free-form question the user types into the textbox.
    /// </summary>
    [JsonPropertyName("user_input")]
    public string? UserInput { get; set; }

    public override void UpdateContext(TopicWorkflowContext context)
    {
        base.UpdateContext(context);

        if (!string.IsNullOrWhiteSpace(UserInput))
        {
            // Treat this as the latest user message so
            // downstream activities (like SemanticResponseActivity)
            // can reuse the existing "LastUserMessage" convention.
            context.SetValue("LastUserMessage", UserInput);
        }
    }
}

/// <summary>
/// Adaptive-card-based "fake user message" activity.
///
/// Renders a minimal card with a short prompt (e.g. "Ask &gt;")
/// and a single multiline text box. The front-end can style this
/// to appear like a regular chat message rather than a full card,
/// but it still uses the AdaptiveCardActivity generic pipeline
/// so input collection, validation, and events behave consistently.
/// </summary>
public class WaitForUserInputActivity : AdaptiveCardActivity<WaitForUserInputModel>
{
    private readonly string _prompt;

    public WaitForUserInputActivity(
        string id,
        TopicWorkflowContext context,
        ILogger<AdaptiveCardActivity<WaitForUserInputModel>> logger,
        string prompt,
        string? modelContextKey = null,
        string? customMessage = null)
        : base(
            id,
            context,
            logger,
            modelContextKey,
            customMessage ?? prompt)
    {
        _prompt = prompt;

        // This gate is usually required before the flow can
        // move on, so mark the card as required. The UI can
        // use this to temporarily disable the main prompt box
        // if desired.
        IsRequired = true;
    }

    /// <summary>
    /// Builds a very small adaptive card:
    /// - One TextBlock with the prompt text.
    /// - One Input.Text for the user's question.
    /// - One Action.Submit button.
    ///
    /// The renderer can style this to blend into the chat
    /// as a "fake user" message.
    /// </summary>
    protected override string GetCardJson(TopicWorkflowContext context)
    {
        var card = new AdaptiveCardModel();

        card.Body.Add(new CardElement
        {
            Type = "TextBlock",
            Text = _prompt,
            Wrap = true,
            Size = "Medium"
        });

        card.Body.Add(new CardElement
        {
            Type = "Input.Text",
            Id = "user_input",
            Placeholder = "Ask >",
            // Host should render this as a wider, multi-line
            // textarea-style control for richer questions.
            IsMultiline = true,
            Rows = 4,
            Width = "100%"
        });

        card.Actions.Add(new CardAction
        {
            Type = "Action.Submit",
            Title = "Send"
        });

        return System.Text.Json.JsonSerializer.Serialize(
            card,
            new System.Text.Json.JsonSerializerOptions
            {
                PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase,
                WriteIndented = false
            });
    }
}
