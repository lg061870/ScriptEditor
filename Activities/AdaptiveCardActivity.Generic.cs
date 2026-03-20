using ConversaCore.Cards;
using ConversaCore.Events;
using ConversaCore.Models;
using ConversaCore.Validation;
using Microsoft.Extensions.Logging;
using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ConversaCore.TopicFlow;

/// <summary>
/// Interface exposing semantic lifecycle events of an AdaptiveCardActivity.
/// Consumers (like InsuranceAgentService) can subscribe without knowing the generic type.
/// </summary>
public interface IAdaptiveCardActivity {
    // === Card JSON lifecycle ===
    event EventHandler<CardJsonEventArgs> CardJsonEmitted;
    event EventHandler<CardJsonEventArgs> CardJsonSending;
    event EventHandler<CardJsonEventArgs> CardJsonSent;
    event EventHandler<CardJsonRenderedEventArgs> CardJsonRendered;

    // === Data + Model lifecycle ===
    event EventHandler<CardDataReceivedEventArgs> CardDataReceived;
    event EventHandler<ModelBoundEventArgs> ModelBound;
    event EventHandler<ValidationFailedEventArgs> ValidationFailed;

    // === Called externally by service ===
    void OnInputCollected(AdaptiveCardInputCollectedEventArgs e);
}

/// <summary>
/// Base activity for rendering an AdaptiveCard, waiting for input,
/// and then binding/validating the result.
/// </summary>
public abstract class AdaptiveCardActivity<TModel> : TopicFlowActivity, IAdaptiveCardActivity
    where TModel : class {
    protected readonly TopicWorkflowContext Context;
    protected readonly ILogger<AdaptiveCardActivity<TModel>> _logger;
    protected readonly string _customMessage;

    // 🆕 NEW: marks whether this card is mandatory before user can continue
    public bool IsRequired { get; init; } = false;

    // === Semantic Events ===
    public event EventHandler<CardJsonEventArgs>? CardJsonEmitted;
    public event EventHandler<CardJsonEventArgs>? CardJsonSending;
    public event EventHandler<CardJsonEventArgs>? CardJsonSent;
    public event EventHandler<CardJsonRenderedEventArgs>? CardJsonRendered;
    public event EventHandler<CardDataReceivedEventArgs>? CardDataReceived;
    public event EventHandler<ModelBoundEventArgs>? ModelBound;
    public event EventHandler<ValidationFailedEventArgs>? ValidationFailed;

    public event EventHandler<TModel>? ModelBoundTyped;

    protected AdaptiveCardActivity(
        string id,
        TopicWorkflowContext context,
        ILogger<AdaptiveCardActivity<TModel>> logger,
        string? modelContextKey = null,
        string? customMessage = null
    ) : base(id) {
        Context = context ?? throw new ArgumentNullException(nameof(context));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _customMessage = customMessage ?? "Please fill out the form.";

        // Use provided key, or fall back to type name
        ModelContextKey = !string.IsNullOrWhiteSpace(modelContextKey)
            ? modelContextKey
            : typeof(TModel).Name;

        SubmissionContextKey = $"{id}_raw";

        ModelBound += (_, e) => {
            if (e.Model is BaseCardModel baseModel) {
                try {
                    baseModel.UpdateContext(Context);
                    _logger.LogInformation(
                        "[{ActivityId}] ✅ Auto-updated Context on ModelBound ({ModelType})",
                        Id, e.Model.GetType().Name);
                } catch (Exception ex) {
                    _logger.LogError(
                        ex, "[{ActivityId}] ⚠️ Failed auto-context update on ModelBound ({ModelType})",
                        Id, e.Model.GetType().Name);
                }
            }
        };
    }


    protected override Dictionary<ActivityState, HashSet<ActivityState>> AllowedTransitions =>
        new()
        {
            { ActivityState.Idle,               new() { ActivityState.Created } },
            { ActivityState.Created,            new() { ActivityState.Running, ActivityState.Failed } },
            { ActivityState.Running,            new() { ActivityState.Rendered, ActivityState.Completed, ActivityState.Failed, ActivityState.ValidationFailed } },
            { ActivityState.Rendered,           new() { ActivityState.WaitingForUserInput, ActivityState.Completed, ActivityState.Failed } },
            { ActivityState.WaitingForUserInput,new() { ActivityState.InputCollected, ActivityState.Completed, ActivityState.Failed } },
            { ActivityState.InputCollected,     new() { ActivityState.Completed, ActivityState.ValidationFailed } },
            { ActivityState.ValidationFailed,   new() { ActivityState.WaitingForUserInput, ActivityState.Failed } },
            { ActivityState.Completed,          new() { } }, // terminal
            { ActivityState.Failed,             new() { } }  // terminal
        };

    // ================================
    // Abstract / Virtual Methods
    // ================================

    protected abstract string GetCardJson(TopicWorkflowContext context);

    /// <summary>
    /// Default model binding: serialize dictionary to JSON, then deserialize into TModel.
    /// Includes flexible converters for robust parsing.
    /// </summary>
    protected virtual TModel? BindModel(Dictionary<string, object> data) {
        var json = JsonSerializer.Serialize(data);
        var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        options.Converters.Add(new FlexibleIntConverter());
        options.Converters.Add(new FlexibleDecimalConverter());
        options.Converters.Add(new FlexibleDoubleConverter());
        options.Converters.Add(new FlexibleBoolConverter());
        options.Converters.Add(new FlexibleStringListConverter());
        options.Converters.Add(new FlexibleDateTimeConverter());

        _logger.LogDebug("[Binding] Activity {ActivityId} binding data to {ModelType}: {Json}",
            Id, typeof(TModel).Name, json);

        return JsonSerializer.Deserialize<TModel>(json, options);
    }

    public void OnInputCollected(AdaptiveCardInputCollectedEventArgs e) {
        if (CurrentState != ActivityState.WaitingForUserInput)
            return;

        TransitionTo(ActivityState.InputCollected, e.Data);
        CardDataReceived?.Invoke(this, new CardDataReceivedEventArgs(e.Data));

        RunInputCollected(e.Data);
    }

    /// <summary>
    /// Handles input collection: bind → validate → re-render on errors.
    /// </summary>
    protected virtual void RunInputCollected(Dictionary<string, object> data) {
        try {
            var model = BindModel(data);
            if (model == null)
                throw new InvalidOperationException("Model binding returned null.");

            // 🧩 Run DataAnnotations validation
            var context = new ValidationContext(model);
            var results = new List<ValidationResult>();
            bool isValid = Validator.TryValidateObject(model, context, results, validateAllProperties: true);

            // ✅ Enforce: every validation result must have MemberNames
            foreach (var r in results) {
                if (r != ValidationResult.Success && (r.MemberNames == null || !r.MemberNames.Any())) {
                    var msg = $"Validation error '{r.ErrorMessage}' did not specify MemberNames. " +
                              $"Attribute type={r.GetType().Name} must set validationContext.MemberName.";
                    _logger.LogError("[Validation] {ActivityId} {Message}", Id, msg);
                    throw new InvalidOperationException(msg);
                }
            }

            var cardJson = GetCardJsonWithMetadata();

            // ─────────────────────────────
            // ⚠️ INVALID → Inject errors & re-render
            // ─────────────────────────────
            if (!isValid) {
                _logger.LogWarning("[Validation] Activity {ActivityId} failed for model {ModelType}. Errors: {Errors}",
                    Id, typeof(TModel).Name,
                    string.Join(" | ", results.Select(r => $"{string.Join(",", r.MemberNames)}: {r.ErrorMessage}")));

                foreach (var r in results)
                    _logger.LogDebug("[Validation] -> {Members}: {Message}",
                        string.Join(",", r.MemberNames), r.ErrorMessage);

                try {
                    cardJson = AdaptiveCardValidationHelper.InjectErrors(cardJson, results, data, typeof(TModel));
                } catch (Exception injectEx) {
                    _logger.LogError(injectEx, "[Validation] Failed to inject errors into card JSON for {ActivityId}", Id);
                }

                // 🔹 Fire the ValidationFailed state + event
                TransitionTo(ActivityState.ValidationFailed, results);

                ValidationFailed?.Invoke(this, new ValidationFailedEventArgs(
                    new ValidationException(
                        results.FirstOrDefault() ?? new ValidationResult("Validation failed"),
                        null,
                        model)));

                // 🔹 Emit updated card (replace existing one)
                CardJsonEmitted?.Invoke(this,
                    new CardJsonEventArgs(cardJson, "⚠️ Please fix the highlighted errors", RenderMode.Replace, Id, null, IsRequired));

                CardJsonSending?.Invoke(this,
                    new CardJsonEventArgs(string.Empty, "Please fix the form.", RenderMode.Replace, Id, null, IsRequired));

                CardJsonSent?.Invoke(this,
                    new CardJsonEventArgs(cardJson, "Sent to client (with validation errors)", RenderMode.Replace, Id, null, IsRequired));

                CardJsonRendered?.Invoke(this,
                    new CardJsonRenderedEventArgs(cardJson));

                TransitionTo(ActivityState.WaitingForUserInput);
                return;
            }

            // ─────────────────────────────
            // ✅ VALID → Save + success render
            // ─────────────────────────────
            if (!string.IsNullOrEmpty(ModelContextKey))
                Context.SetValue(ModelContextKey!, model);

            _logger.LogInformation("[Validation] Activity {ActivityId} succeeded. Model {ModelType} bound.",
                Id, typeof(TModel).Name);

            try {
                var successCardJson = AdaptiveCardValidationHelper.InjectSuccessState(cardJson, data);

                // Once validation succeeds, the card is no longer "required" input.
                // Mark IsRequired = false on the success lifecycle events so hosts
                // (DomainAgentService, InsuranceAgentService, etc.) can re-enable
                // the bottom prompt via PromptInputStateChanged(true, cardId).
                CardJsonEmitted?.Invoke(this,
                    new CardJsonEventArgs(successCardJson, "✅ Validation successful", RenderMode.Replace, Id, null, false));

                CardJsonSending?.Invoke(this,
                    new CardJsonEventArgs(string.Empty, "Validation passed", RenderMode.Replace, Id, null, false));

                CardJsonSent?.Invoke(this,
                    new CardJsonEventArgs(successCardJson, "Sent clean card to client", RenderMode.Replace, Id, null, false));

                CardJsonRendered?.Invoke(this,
                    new CardJsonRenderedEventArgs(successCardJson));
            } catch (Exception successEx) {
                _logger.LogError(successEx, "[Validation] Failed to inject success state for {ActivityId}", Id);
            }

            ModelBoundTyped?.Invoke(this, model);
            ModelBound?.Invoke(this, new ModelBoundEventArgs(model));

            TransitionTo(ActivityState.Completed, model);
        } catch (Exception ex) {
            _logger.LogError(ex, "[Validation] Exception during RunInputCollected for {ActivityId}", Id);

            TransitionTo(ActivityState.ValidationFailed, ex);
            ValidationFailed?.Invoke(this, new ValidationFailedEventArgs(ex));

            var cardJson = GetCardJsonWithMetadata();

            CardJsonEmitted?.Invoke(this,
                new CardJsonEventArgs(cardJson, "⚠️ Validation failed", RenderMode.Replace, Id, null, IsRequired));

            CardJsonSending?.Invoke(this,
                new CardJsonEventArgs(string.Empty, "Validation failed.", RenderMode.Replace, Id, null, IsRequired));

            CardJsonSent?.Invoke(this,
                new CardJsonEventArgs(cardJson, "Sent to client (validation exception)", RenderMode.Replace, Id, null, IsRequired));

            CardJsonRendered?.Invoke(this,
                new CardJsonRenderedEventArgs(cardJson));

            TransitionTo(ActivityState.WaitingForUserInput);
        }
    }

    // ================================
    // Lifecycle
    // ================================

    protected override Task<ActivityResult> RunActivity(
        TopicWorkflowContext context,
        object? input = null,
        CancellationToken cancellationToken = default) {
        if (input != null)
            throw new InvalidOperationException(
                $"{nameof(AdaptiveCardActivity<TModel>)} does not accept direct input. " +
                $"Use {nameof(OnInputCollected)} instead.");

        var cardJson = GetCardJsonWithMetadata();

        _logger.LogInformation("[Lifecycle] Rendering AdaptiveCard for {ActivityId}", Id);

        TransitionTo(ActivityState.Rendered);

        // 🧩 Emit the card lifecycle events (now including IsRequired)
        _logger.LogDebug("[AdaptiveCard] Emitting CardJsonEmitted for {ActivityId} (len={Len})", Id, cardJson?.Length ?? 0);
        CardJsonEmitted?.Invoke(this,
            new CardJsonEventArgs(cardJson, "Generated JSON", RenderMode.Replace, Id, null, IsRequired));

        _logger.LogDebug("[AdaptiveCard] Emitting CardJsonSending for {ActivityId}", Id);
        CardJsonSending?.Invoke(this,
            new CardJsonEventArgs(string.Empty, _customMessage, RenderMode.Replace, Id, null, IsRequired));

        _logger.LogInformation("[AdaptiveCard] Emitting CardJsonSent for {ActivityId} (IsRequired={IsRequired}, len={Len})", Id, IsRequired, cardJson?.Length ?? 0);
        CardJsonSent?.Invoke(this,
            new CardJsonEventArgs(cardJson, "Sent to client", RenderMode.Replace, Id, null, IsRequired));

        _logger.LogDebug("[AdaptiveCard] Emitting CardJsonRendered ack for {ActivityId}", Id);
        CardJsonRendered?.Invoke(this,
            new CardJsonRenderedEventArgs(cardJson));

        // 🕒 Transition to waiting state
        TransitionTo(ActivityState.WaitingForUserInput);

        var payload = new {
            Type = "AdaptiveCard",
            CardJson = cardJson,
            Message = _customMessage
        };

        return Task.FromResult(ActivityResult.WaitForInput(JsonSerializer.Serialize(payload.Message)));
    }

    // ================================
    // Protected Event Invokers
    // ================================
    protected virtual void OnCardJsonEmitted(CardJsonEventArgs e)
        => CardJsonEmitted?.Invoke(this, e);

    protected virtual void OnCardJsonSending(CardJsonEventArgs e)
        => CardJsonSending?.Invoke(this, e);

    protected virtual void OnCardJsonSent(CardJsonEventArgs e)
        => CardJsonSent?.Invoke(this, e);

    protected virtual void OnCardJsonRendered(CardJsonRenderedEventArgs e)
        => CardJsonRendered?.Invoke(this, e);

    /// <summary>
    /// Returns the AdaptiveCard JSON with injected metadata (_metadata.activityId, _metadata.isRequired)
    /// </summary>
    private string GetCardJsonWithMetadata() {
        var baseJson = GetCardJson(Context);
        return AdaptiveCardValidationHelper.InjectMetadata(baseJson, Id, IsRequired, _logger);
    }

}

/// <summary>
/// Generic activity that renders an AdaptiveCard using a card factory,
/// and binds submissions into a typed model.
/// </summary>
public class AdaptiveCardActivity<TCard, TModel> : AdaptiveCardActivity<TModel>
    where TCard : class, new()
    where TModel : class {
    private readonly Func<TCard, object> _cardFactory;
    private readonly Action<ActivityState, ActivityState, object?>? _onTransition;

    public AdaptiveCardActivity(
        string id,
        TopicWorkflowContext context,
        Func<TCard, object> cardFactory,
        string? modelContextKey = null,
        ILogger<AdaptiveCardActivity<TModel>>? logger = null,
        Action<ActivityState, ActivityState, object?>? onTransition = null,
        string? customMessage = null
    ) : base(id, context,
             logger ?? Microsoft.Extensions.Logging.Abstractions.NullLogger<AdaptiveCardActivity<TModel>>.Instance,
             modelContextKey ?? typeof(TModel).Name,
             customMessage) {
        _cardFactory = cardFactory ?? throw new ArgumentNullException(nameof(cardFactory));
        _onTransition = onTransition;
    }


    protected override string GetCardJson(TopicWorkflowContext context) {
        var card = _cardFactory(new TCard());
        var options = new JsonSerializerOptions {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            WriteIndented = false
        };
        return JsonSerializer.Serialize(card, options);
    }

    protected override void OnStateTransition(ActivityState from, ActivityState to, object? data) {
        base.OnStateTransition(from, to, data);
        _onTransition?.Invoke(from, to, data);

        // ✅ Notify service when a required card completes
        //if (to == ActivityState.Completed && IsRequired) {
        //    try {
        //        OnCardJsonSent(new CardJsonEventArgs(
        //            GetCardJson(Context),
        //            "Required card completed",
        //            RenderMode.Replace,
        //            Id,
        //            isRequired: false // re-enable input after completion
        //        ));
        //    } catch (Exception ex) {
        //        _logger.LogError(ex, "[{ActivityId}] Error emitting CardJsonSent on completion", Id);
        //    }
        //}
    }
}

// ============================
// Flexible Converters
// ============================

public class FlexibleIntConverter : JsonConverter<int> {
    public override int Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
        if (reader.TokenType == JsonTokenType.String && int.TryParse(reader.GetString(), out var value))
            return value;
        if (reader.TokenType == JsonTokenType.Number)
            return reader.GetInt32();
        return 0;
    }
    public override void Write(Utf8JsonWriter writer, int value, JsonSerializerOptions options)
        => writer.WriteNumberValue(value);
}

public class FlexibleDecimalConverter : JsonConverter<decimal> {
    public override decimal Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
        if (reader.TokenType == JsonTokenType.String && decimal.TryParse(reader.GetString(), out var value))
            return value;
        if (reader.TokenType == JsonTokenType.Number)
            return reader.GetDecimal();
        return 0m;
    }
    public override void Write(Utf8JsonWriter writer, decimal value, JsonSerializerOptions options)
        => writer.WriteNumberValue(value);
}

public class FlexibleDoubleConverter : JsonConverter<double> {
    public override double Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
        if (reader.TokenType == JsonTokenType.String && double.TryParse(reader.GetString(), out var value))
            return value;
        if (reader.TokenType == JsonTokenType.Number)
            return reader.GetDouble();
        return 0d;
    }
    public override void Write(Utf8JsonWriter writer, double value, JsonSerializerOptions options)
        => writer.WriteNumberValue(value);
}

/// <summary>
/// Converter that allows List<string> properties to bind from either a JSON array
/// or a comma-delimited string (e.g. "HeartDisease,Cancer"). This is useful for
/// adaptive card multi-select inputs that may post as a single string.
/// </summary>
public class FlexibleStringListConverter : JsonConverter<List<string>> {
    public override List<string> Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
        // Case 1: already an array
        if (reader.TokenType == JsonTokenType.StartArray) {
            var list = new List<string>();
            while (reader.Read() && reader.TokenType != JsonTokenType.EndArray) {
                if (reader.TokenType == JsonTokenType.String) {
                    list.Add(reader.GetString() ?? string.Empty);
                } else {
                    // Fallback: best-effort string representation for non-string items
                    list.Add(reader.GetString() ?? string.Empty);
                }
            }
            return list;
        }

        // Case 2: a single comma-delimited string
        if (reader.TokenType == JsonTokenType.String) {
            var raw = reader.GetString() ?? string.Empty;
            return raw
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .ToList();
        }

        // Fallback: single scalar value as string
        return new List<string> { reader.GetString() ?? string.Empty };
    }

    public override void Write(Utf8JsonWriter writer, List<string> value, JsonSerializerOptions options) {
        writer.WriteStartArray();
        foreach (var s in value ?? Enumerable.Empty<string>()) {
            writer.WriteStringValue(s);
        }
        writer.WriteEndArray();
    }
}

public class FlexibleBoolConverter : JsonConverter<bool> {
    public override bool Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
        if (reader.TokenType == JsonTokenType.String) {
            var str = reader.GetString()?.ToLowerInvariant();
            if (str == "true" || str == "1") return true;
            if (str == "false" || str == "0") return false;
            return false;
        }
        if (reader.TokenType == JsonTokenType.Number)
            return reader.GetInt32() != 0;
        if (reader.TokenType == JsonTokenType.True) return true;
        if (reader.TokenType == JsonTokenType.False) return false;
        return false;
    }
    public override void Write(Utf8JsonWriter writer, bool value, JsonSerializerOptions options)
        => writer.WriteBooleanValue(value);
}

public class FlexibleDateTimeConverter : JsonConverter<DateTime> {
    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
        if (reader.TokenType == JsonTokenType.String &&
            DateTime.TryParse(reader.GetString(), out var value))
            return value;

        if (reader.TokenType == JsonTokenType.Number) {
            try { return DateTimeOffset.FromUnixTimeSeconds(reader.GetInt64()).DateTime; } catch { return default; }
        }

        return default;
    }
    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
        => writer.WriteStringValue(value.ToString("o"));
}
