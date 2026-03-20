using ConversaCore.Cards;
using System.Collections.Generic;
using System.Linq;

namespace ConversaCore.TopicFlow;

/// <summary>
/// Helper class for injecting repeat/continuation prompts into existing adaptive cards.
/// This allows any card to become "repeatable" by adding continuation UI elements.
/// </summary>
public static class RepeatPromptInjector
{
    /// <summary>
    /// Injects continuation prompt UI elements into an existing adaptive card,
    /// making it look like part of the original design.
    /// </summary>
    /// <param name="originalCard">The original adaptive card to enhance</param>
    /// <param name="promptText">Text to display for the continuation prompt</param>
    /// <param name="currentCount">Current iteration count for progress display</param>
    /// <param name="itemType">Type of item being repeated (e.g., "beneficiary", "contact")</param>
    /// <returns>Enhanced card with embedded continuation prompt</returns>
    public static AdaptiveCardModel InjectRepeatPrompt(
        AdaptiveCardModel originalCard,
        string promptText = "Would you like to add another?",
        int currentCount = 1,
        string itemType = "item")
    {
        // Create a copy of the original card - preserve all original structure
        var enhancedCard = new AdaptiveCardModel
        {
            Type = originalCard.Type,
            Version = originalCard.Version,
            Schema = originalCard.Schema,
            Body = new List<CardElement>(originalCard.Body ?? new List<CardElement>()),
            Actions = new List<CardAction>(originalCard.Actions ?? new List<CardAction>())
        };

        // Add visual separator
        enhancedCard.Body.Add(new CardElement
        {
            Type = "TextBlock",
            Text = " ",  // Empty space for separation
            Size = "Small"
        });

        // Add progress indicator
        enhancedCard.Body.Add(new CardElement
        {
            Type = "Container",
            Style = "emphasis",
            Items = new List<CardElement>
            {
                new CardElement
                {
                    Type = "TextBlock", 
                    Text = $"✅ {itemType} #{currentCount} completed!",
                    Weight = "Bolder",
                    Color = "Good",
                    Size = "Medium"
                }
            }
        });

        // Add continuation prompt
        enhancedCard.Body.Add(new CardElement
        {
            Type = "TextBlock",
            Text = promptText,
            Wrap = true,
            Size = "Medium",
            Weight = "Bolder"
        });

        // Add choice set for user response
        enhancedCard.Body.Add(new CardElement
        {
            Type = "Input.ChoiceSet",
            Id = "user_response",
            Choices = new List<CardChoice>
            {
                new CardChoice 
                { 
                    Title = $"➕ Yes, add another {itemType}", 
                    Value = "continue" 
                },
                new CardChoice 
                { 
                    Title = $"✅ No, I'm done adding {itemType}s", 
                    Value = "stop" 
                }
            },
            Value = "continue"  // Default to continue
        });

        // Update submit button text to reflect the dual purpose
        if (enhancedCard.Actions != null && enhancedCard.Actions.Any())
        {
            var submitAction = enhancedCard.Actions.FirstOrDefault(a => a.Type == "Action.Submit");
            if (submitAction != null)
            {
                submitAction.Title = $"Save {itemType} & Continue";
            }
        }
        else
        {
            // Ensure there's always a submit action
            enhancedCard.Actions = new List<CardAction>
            {
                new CardAction
                {
                    Type = "Action.Submit",
                    Title = $"Save {itemType} & Continue"
                }
            };
        }

        return enhancedCard;
    }

    /// <summary>
    /// Checks if a user response indicates they want to stop the repeat loop.
    /// </summary>
    /// <param name="userResponse">The user's response value</param>
    /// <returns>True if the user wants to stop, false if they want to continue</returns>
    public static bool IsStopResponse(string? userResponse)
    {
        if (string.IsNullOrWhiteSpace(userResponse))
            return false;

        var response = userResponse.ToLowerInvariant().Trim();
        return response == "stop" || 
               response == "no" || 
               response == "done" || 
               response == "finished" ||
               response == "exit";
    }
}