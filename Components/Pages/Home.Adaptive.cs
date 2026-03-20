using System.Text.Json;
using Microsoft.JSInterop;
using ScriptEditor.Models;

namespace ScriptEditor.Components.Pages;

public partial class Home
{
    private string _adaptiveCardsJsonDraft = "[]";
    private string _adaptiveModelsJsonDraft = "[]";
    private string _adaptiveDefsStatus = "Adaptive card/model definitions are synchronized.";
    private bool _isAdaptiveDefsValid = true;

    private async Task ApplyAdaptiveDefinitionEditsAsync()
    {
        if (!TryParseAdaptiveCards(_adaptiveCardsJsonDraft, out var cards, out var cardError))
        {
            _isAdaptiveDefsValid = false;
            _adaptiveDefsStatus = $"Cards JSON is invalid: {cardError}";
            return;
        }

        if (!TryParseAdaptiveModels(_adaptiveModelsJsonDraft, out var models, out var modelError))
        {
            _isAdaptiveDefsValid = false;
            _adaptiveDefsStatus = $"Models JSON is invalid: {modelError}";
            return;
        }

        ActiveDocument.Cards = cards;
        ActiveDocument.Models = models;

        _diagramJson = Serialize(ActiveDocument);
        RevalidateActiveScript();

        _isAdaptiveDefsValid = true;
        _adaptiveDefsStatus = $"Applied adaptive definitions at {DateTime.Now:HH:mm:ss}.";

        if (_editorInitialized)
        {
            await JS.InvokeVoidAsync("scriptEditor.applyDocument", _editorRoot, _diagramJson);
            await ApplyContextFocusAsync();
        }
    }

    private void PopulateAdaptiveDefinitionDrafts()
    {
        ActiveDocument.Cards ??= [];
        ActiveDocument.Models ??= [];

        _adaptiveCardsJsonDraft = JsonSerializer.Serialize(ActiveDocument.Cards, JsonOptions);
        _adaptiveModelsJsonDraft = JsonSerializer.Serialize(ActiveDocument.Models, JsonOptions);

        if (_isAdaptiveDefsValid)
        {
            _adaptiveDefsStatus = "Adaptive card/model definitions are synchronized.";
        }
    }

    private static bool TryParseAdaptiveCards(string rawJson, out List<DiagramAdaptiveCardDefinition> cards, out string error)
    {
        try
        {
            var parsed = JsonSerializer.Deserialize<List<DiagramAdaptiveCardDefinition>>(string.IsNullOrWhiteSpace(rawJson) ? "[]" : rawJson, JsonOptions) ?? [];
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            for (var i = 0; i < parsed.Count; i++)
            {
                var card = parsed[i] ?? new DiagramAdaptiveCardDefinition();
                card.Id = (card.Id ?? string.Empty).Trim();

                if (string.IsNullOrWhiteSpace(card.Id))
                {
                    cards = [];
                    error = $"Card at index {i} must include a non-empty 'id'.";
                    return false;
                }

                if (!seen.Add(card.Id))
                {
                    cards = [];
                    error = $"Card id '{card.Id}' is duplicated.";
                    return false;
                }

                card.Name = string.IsNullOrWhiteSpace(card.Name) ? card.Id : card.Name.Trim();
                card.BaseType = string.IsNullOrWhiteSpace(card.BaseType) ? "AdaptiveFormCardLayout" : card.BaseType.Trim();
                card.ModelRef = (card.ModelRef ?? string.Empty).Trim();
                card.Fields ??= [];

                for (var fieldIndex = 0; fieldIndex < card.Fields.Count; fieldIndex++)
                {
                    var field = card.Fields[fieldIndex] ?? new DiagramAdaptiveCardFieldDefinition();
                    field.Id = string.IsNullOrWhiteSpace(field.Id) ? $"field-{fieldIndex + 1}" : field.Id.Trim();
                    field.Label = string.IsNullOrWhiteSpace(field.Label) ? field.Id : field.Label.Trim();
                    field.InputType = string.IsNullOrWhiteSpace(field.InputType) ? "text" : field.InputType.Trim().ToLowerInvariant();
                    field.Placeholder = string.IsNullOrWhiteSpace(field.Placeholder) ? null : field.Placeholder.Trim();
                    card.Fields[fieldIndex] = field;
                }

                parsed[i] = card;
            }

            cards = parsed;
            error = string.Empty;
            return true;
        }
        catch (Exception ex)
        {
            cards = [];
            error = ex.Message;
            return false;
        }
    }

    private static bool TryParseAdaptiveModels(string rawJson, out List<DiagramAdaptiveModelDefinition> models, out string error)
    {
        try
        {
            var parsed = JsonSerializer.Deserialize<List<DiagramAdaptiveModelDefinition>>(string.IsNullOrWhiteSpace(rawJson) ? "[]" : rawJson, JsonOptions) ?? [];
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            for (var i = 0; i < parsed.Count; i++)
            {
                var model = parsed[i] ?? new DiagramAdaptiveModelDefinition();
                model.Id = (model.Id ?? string.Empty).Trim();

                if (string.IsNullOrWhiteSpace(model.Id))
                {
                    models = [];
                    error = $"Model at index {i} must include a non-empty 'id'.";
                    return false;
                }

                if (!seen.Add(model.Id))
                {
                    models = [];
                    error = $"Model id '{model.Id}' is duplicated.";
                    return false;
                }

                model.Name = string.IsNullOrWhiteSpace(model.Name) ? model.Id : model.Name.Trim();
                model.BaseType = string.IsNullOrWhiteSpace(model.BaseType) ? "BaseCardModel" : model.BaseType.Trim();
                model.Properties ??= [];

                for (var propertyIndex = 0; propertyIndex < model.Properties.Count; propertyIndex++)
                {
                    var property = model.Properties[propertyIndex] ?? new DiagramAdaptiveModelPropertyDefinition();
                    property.Name = (property.Name ?? string.Empty).Trim();

                    if (string.IsNullOrWhiteSpace(property.Name))
                    {
                        models = [];
                        error = $"Model '{model.Id}' has a property at index {propertyIndex} without a name.";
                        return false;
                    }

                    property.Type = string.IsNullOrWhiteSpace(property.Type) ? "string" : property.Type.Trim().ToLowerInvariant();
                    property.DefaultValue = string.IsNullOrWhiteSpace(property.DefaultValue) ? null : property.DefaultValue.Trim();
                    property.Description = string.IsNullOrWhiteSpace(property.Description) ? null : property.Description.Trim();
                    model.Properties[propertyIndex] = property;
                }

                parsed[i] = model;
            }

            models = parsed;
            error = string.Empty;
            return true;
        }
        catch (Exception ex)
        {
            models = [];
            error = ex.Message;
            return false;
        }
    }
}

