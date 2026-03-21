using ConversaCore.Cards;
using System;
using System.Collections.Generic;

namespace InsuranceAgent.Topics;

/// <summary>
/// Adaptive card for collecting contact and health details.
/// Ported from Copilot Studio JSON.
/// </summary>
public class ContactHealthCard
{
    public AdaptiveCardModel Create(
        string? address = "",
        string? cityState = "",
        string? dob = "",
        bool hospitalizedPast5Years = false,
        bool currentlyTakingMedications = false,
        string? medications = "",
        string? medicalConditions = "",
        bool tobaccoUseLast12Months = false)
    {
        var bodyElements = new List<CardElement>
        {
            // Header
            new CardElement
            {
                Type = "TextBlock",
                Text = "📋 Contact & Health Details",
                Weight = "Bolder",
                Size = "Medium"
            },

            // Address Section
            new CardElement
            {
                Type = "TextBlock",
                Text = "🏠 Address",
                Wrap = true
            },
            new CardElement
            {
                Type = "Input.Text",
                Id = "address",
                Text = "Street address",
                Value = address ?? ""
            },

            // City & State
            new CardElement
            {
                Type = "TextBlock",
                Text = "🌆 City & State",
                Wrap = true
            },
            new CardElement
            {
                Type = "Input.Text",
                Id = "city_state",
                Text = "e.g., Denver, CO",
                Value = cityState ?? ""
            },

            // Date of Birth
            new CardElement
            {
                Type = "TextBlock",
                Text = "🎂 Date of Birth",
                Wrap = true
            },
            new CardElement
            {
                Type = "Input.Date",
                Id = "dob",
                Value = dob ?? ""
            },

            // Health Questions
            new CardElement
            {
                Type = "TextBlock",
                Text = "🏥 Have you been hospitalized in the last 5 years?",
                Wrap = true
            },
            new CardElement
            {
                Type = "Input.Toggle",
                Id = "hospitalized_past_5_years",
                Text = "Yes",
                Value = hospitalizedPast5Years ? "true" : "false"
            },

            new CardElement
            {
                Type = "TextBlock",
                Text = "💊 Are you currently taking any medications?",
                Wrap = true
            },
            new CardElement
            {
                Type = "Input.Toggle",
                Id = "currently_taking_medications",
                Text = "Yes",
                Value = currentlyTakingMedications ? "true" : "false"
            },

            new CardElement
            {
                Type = "TextBlock",
                Text = "🗒️ List any medications (optional)",
                Wrap = true
            },
            new CardElement
            {
                Type = "Input.Text",
                Id = "medications",
                Text = "Separate with commas",
                Value = medications ?? ""
            },

            new CardElement
            {
                Type = "TextBlock",
                Text = "🩺 List any medical conditions (optional)",
                Wrap = true
            },
            new CardElement
            {
                Type = "Input.Text",
                Id = "medical_conditions",
                Text = "Separate with commas",
                Value = medicalConditions ?? ""
            },

            new CardElement
            {
                Type = "TextBlock",
                Text = "🚭 Used tobacco in the past 12 months?",
                Wrap = true
            },
            new CardElement
            {
                Type = "Input.Toggle",
                Id = "tobacco_use_last_12_months",
                Text = "Yes",
                Value = tobaccoUseLast12Months ? "true" : "false"
            }
        };

        var actions = new List<CardAction>
        {
            new CardAction
            {
                Type = "Action.Submit",
                Title = "➡️ Next"
            }
        };

        return new AdaptiveCardModel
        {
            Type = "AdaptiveCard",
            Schema = "https://adaptivecards.io/schemas/adaptive-card.json",
            Version = "1.5",
            Body = bodyElements,
            Actions = actions
        };
    }
}