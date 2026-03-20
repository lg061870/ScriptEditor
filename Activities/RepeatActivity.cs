using Microsoft.Extensions.Logging;
using ConversaCore.Events;
using ConversaCore.Cards;
using System.Text.Json;

namespace ConversaCore.TopicFlow.Activities;

/// <summary>
/// A flow control activity that executes a wrapped activity multiple times.
/// Handles iteration logic while delegating execution to the wrapped activity.
/// Implements IAdaptiveCardActivity to forward events from child activities.
/// </summary>
/// <typeparam name="TActivity">The type of activity to repeat</typeparam>
public class RepeatActivity<TActivity> : TopicFlowActivity, IAdaptiveCardActivity
    where TActivity : TopicFlowActivity
{
    private readonly Func<string, TopicWorkflowContext, TActivity> _activityFactory;
    private readonly int? _fixedIterations;
    private readonly string? _continuePrompt;
    private readonly Func<TopicWorkflowContext, bool>? _customShouldContinue;
    private readonly string _collectionContextKey;
    private readonly ILogger? _logger;
    
    private int _currentIteration = 0;
    private readonly List<object> _collectedResults = new();
    private TActivity? _currentActivity;
private TopicWorkflowContext? _activeContext; // Store the context for event handlers
private Dictionary<string, object>? _lastSubmittedData; // Store last submitted form data
private bool _continuationDecisionMade = false; // Flag to track if user made continuation choice
private bool _shouldContinueAfterCompletion = false; // User's continuation decision
private bool _shouldEnhanceNextCard = false; // Flag to control when to enhance cards with continuation prompts        // === IAdaptiveCardActivity Events - Forward from child activities ===
    public event EventHandler<CardJsonEventArgs>? CardJsonEmitted;
    public event EventHandler<CardJsonEventArgs>? CardJsonSending;
    public event EventHandler<CardJsonEventArgs>? CardJsonSent;
    public event EventHandler<CardJsonRenderedEventArgs>? CardJsonRendered;
    public event EventHandler<CardDataReceivedEventArgs>? CardDataReceived;
    public event EventHandler<ModelBoundEventArgs>? ModelBound;
    public event EventHandler<ValidationFailedEventArgs>? ValidationFailed;

    // === IAdaptiveCardActivity interface method ===
    public void OnInputCollected(AdaptiveCardInputCollectedEventArgs e)
    {
        _logger?.LogWarning("[RepeatActivity] OnInputCollected called with data keys: [{Keys}] on iteration {Iteration}", 
            string.Join(", ", e.Data.Keys), _currentIteration);
        
        foreach (var kvp in e.Data)
        {
            _logger?.LogWarning("[RepeatActivity] Input data: {Key} = '{Value}'", kvp.Key, kvp.Value);
        }

        // In UserPrompted mode, check if this is a continuation choice
        if (!string.IsNullOrEmpty(_continuePrompt) && _currentIteration > 1)
        {
            _logger?.LogWarning("[RepeatActivity] Checking for continuation choice - iteration {Iteration}, prompt: '{Prompt}'", 
                _currentIteration, _continuePrompt);
            
            // Check if the user is making a continuation choice
            if (e.Data.ContainsKey("user_response") && IsOnlyContinuationChoice(e.Data))
            {
                var userResponse = e.Data["user_response"]?.ToString();
                var shouldStop = RepeatPromptInjector.IsStopResponse(userResponse);

                _logger?.LogWarning("[RepeatActivity] DETECTED CONTINUATION CHOICE: '{Response}', Should stop: {ShouldStop}", 
                    userResponse, shouldStop);

                if (shouldStop)
                {
                    // User wants to stop - set flags and complete RepeatActivity
                    _logger?.LogInformation("[RepeatActivity] User chose to stop.");
                    _continuationDecisionMade = true;
                    _shouldContinueAfterCompletion = false;
                    
                    // Complete the RepeatActivity immediately
                    _activeContext!.SetValue(_collectionContextKey, _collectedResults);
                    OnCompleted(_collectedResults.LastOrDefault() ?? new object());
                    return;
                }
                else
                {
                    // User wants to continue - trigger next iteration immediately
                    _logger?.LogInformation("[RepeatActivity] User chose to continue. Starting next iteration immediately.");
                    _continuationDecisionMade = true;
                    _shouldContinueAfterCompletion = true;
                    
                    // Complete current iteration immediately without forwarding to child
                    var dummyResult = new { UserResponse = userResponse };
                    OnChildActivityCompleted(_currentActivity, new ActivityCompletedEventArgs(
                        _currentActivity?.Id ?? $"Iteration{_currentIteration}", dummyResult));
                    return;
                }
            }
        }

        // Normal form submission - forward to current activity
        if (_currentActivity is IAdaptiveCardActivity cardActivity)
        {
            cardActivity.OnInputCollected(e);
        }
    }

    /// <summary>
    /// Checks if the submitted data contains only a continuation choice (no form fields).
    /// </summary>
    private bool IsOnlyContinuationChoice(Dictionary<string, object> data)
    {
        _logger?.LogWarning("[RepeatActivity] IsOnlyContinuationChoice - analyzing data with {Count} keys", data.Count);
        
        // If the data only contains user_response and no other substantive fields, 
        // it's likely just a continuation choice
        var significantKeys = data.Keys.Where(k => 
            !string.IsNullOrEmpty(k) && 
            k != "user_response" && 
            !string.IsNullOrEmpty(data[k]?.ToString()?.Trim())).ToList();

        _logger?.LogWarning("[RepeatActivity] Significant keys found: [{Keys}] (excluding user_response)", 
            string.Join(", ", significantKeys));
        
        var isOnlyContinuation = significantKeys.Count == 0;
        _logger?.LogWarning("[RepeatActivity] IsOnlyContinuationChoice result: {Result}", isOnlyContinuation);
        
        return isOnlyContinuation;
    }

    /// <summary>
    /// Hook up event forwarding from child activity to our events.
    /// This ensures that cards rendered by child activities trigger our events.
    /// </summary>
    private void HookChildActivityEvents(TActivity? childActivity)
    {
        if (childActivity is IAdaptiveCardActivity cardActivity)
        {
            // Forward all card events from child to our events, with enhancement for continuation prompts
            cardActivity.CardJsonEmitted += (s, e) => CardJsonEmitted?.Invoke(this, e);
            cardActivity.CardJsonSending += (s, e) => CardJsonSending?.Invoke(this, e);
            cardActivity.CardJsonSent += (s, e) => {
                _logger?.LogWarning("[RepeatActivity] CardJsonSent event - BEFORE enhancement - CardId: {CardId}", e.CardId);
                _logger?.LogWarning("[RepeatActivity] CARD JSON BEFORE enhancement: {CardJson}", e.CardJson);
                
                // Only enhance if we just processed a beneficiary data submission
                // Don't enhance on fresh cards or after continuation choices
                CardJsonEventArgs enhancedEventArgs;
                if (_shouldEnhanceNextCard)
                {
                    _logger?.LogWarning("[RepeatActivity] ENHANCING: Flag is set, user just submitted beneficiary data");
                    enhancedEventArgs = EnhanceCardForContinuation(e);
                    _shouldEnhanceNextCard = false; // Reset flag
                }
                else
                {
                    _logger?.LogWarning("[RepeatActivity] NOT ENHANCING: Showing fresh form or after continuation choice");
                    enhancedEventArgs = e; // Pass through unchanged
                }
                
                _logger?.LogWarning("[RepeatActivity] CARD JSON AFTER enhancement: {CardJson}", enhancedEventArgs.CardJson);
                _logger?.LogWarning("[RepeatActivity] Enhancement changed: {Changed}", !e.CardJson.Equals(enhancedEventArgs.CardJson));
                
                CardJsonSent?.Invoke(this, enhancedEventArgs);
            };
            cardActivity.CardJsonRendered += (s, e) => CardJsonRendered?.Invoke(this, e);
            cardActivity.CardDataReceived += (s, e) => 
            {
                // Store the form data for potential use in validation failure handling
                _lastSubmittedData = new Dictionary<string, object>(e.Data);
                CardDataReceived?.Invoke(this, e);
            };
            cardActivity.ModelBound += (s, e) => ModelBound?.Invoke(this, e);
            cardActivity.ValidationFailed += OnChildValidationFailed;
        }

        // Hook activity completion to trigger next iteration
        if (childActivity != null)
        {
            // Forward simple message events from the repeated child
            // so that any messages (e.g. QA answers, empathy text)
            // inside the loop surface as normal bot messages.
            childActivity.MessageEmitted += (s, e) => OnMessageEmitted(e.Message);
            childActivity.ActivityCompleted += OnChildActivityCompleted;
        }
    }

    /// <summary>
    /// Enhances card JSON with continuation prompt if appropriate.
    /// </summary>
    private CardJsonEventArgs EnhanceCardForContinuation(CardJsonEventArgs originalArgs)
    {
        _logger?.LogWarning("[RepeatActivity] EnhanceCardForContinuation called - Iteration: {Iteration}, Prompt: '{Prompt}'", 
            _currentIteration, _continuePrompt ?? "null");
        _logger?.LogWarning("[RepeatActivity] Card enhancement context - CardId: {CardId}, Message: '{Message}'", 
            originalArgs.CardId, originalArgs.Message);
        
        // Only enhance if we're in UserPrompted mode and past the first iteration
        if (string.IsNullOrEmpty(_continuePrompt) || _currentIteration <= 1)
        {
            _logger?.LogWarning("[RepeatActivity] Skipping enhancement - no prompt or first iteration");
            return originalArgs;
        }

        try
        {
            // Parse the original card JSON
            var originalCard = JsonSerializer.Deserialize<AdaptiveCardModel>(originalArgs.CardJson);
            if (originalCard == null)
            {
                _logger?.LogWarning("[RepeatActivity] Could not parse card JSON for enhancement");
                return originalArgs;
            }

            // Inject continuation prompt
            var enhancedCard = RepeatPromptInjector.InjectRepeatPrompt(
                originalCard,
                promptText: _continuePrompt,
                currentCount: _currentIteration,
                itemType: "item" // Could be made configurable
            );

            // Serialize back to JSON
            var enhancedCardJson = JsonSerializer.Serialize(enhancedCard, new JsonSerializerOptions 
            { 
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase 
            });

            _logger?.LogWarning("[RepeatActivity] Enhancement completed - Original length: {OriginalLength}, Enhanced length: {EnhancedLength}", 
                originalArgs.CardJson.Length, enhancedCardJson.Length);

            // Return enhanced event args
            return new CardJsonEventArgs(enhancedCardJson, originalArgs.Message, originalArgs.RenderMode, originalArgs.CardId);
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "[RepeatActivity] Error enhancing card with continuation prompt");
            _logger?.LogWarning("[RepeatActivity] Enhancement failed - returning original card");
            return originalArgs; // Fall back to original if enhancement fails
        }
    }

    /// <summary>
    /// Handles completion of child activity and triggers next iteration if needed.
    /// </summary>
    private async void OnChildActivityCompleted(object? sender, ActivityCompletedEventArgs e)
    {
        _logger?.LogWarning("[RepeatActivity] OnChildActivityCompleted - ActivityId: {ActivityId}, Iteration: {Iteration}", 
            e.ActivityId, _currentIteration);
        _logger?.LogWarning("[RepeatActivity] Completion flags - HasDecision: {HasDecision}, ShouldContinue: {ShouldContinue}", 
            _continuationDecisionMade, _shouldContinueAfterCompletion);
        
        // Collect the result if there's meaningful data
        if (e.Context != null)
        {
            _collectedResults.Add(e.Context);
            _logger?.LogWarning("[RepeatActivity] Collected result from iteration {Iteration}, type: {Type}", 
                _currentIteration, e.Context.GetType().Name);
            
            // Check if this was beneficiary data submission (not continuation choice)
            if (!_continuationDecisionMade && !string.IsNullOrEmpty(_continuePrompt))
            {
                _logger?.LogWarning("[RepeatActivity] Beneficiary data collected - setting flag to enhance next card render");
                _shouldEnhanceNextCard = true;
            }
        }

        // Check continuation decision
        bool shouldContinue;
        if (_continuationDecisionMade)
        {
            // User already made continuation choice
            shouldContinue = _shouldContinueAfterCompletion;
            _logger?.LogWarning("[RepeatActivity] Using user's continuation decision: {ShouldContinue}", shouldContinue);
            
            // Reset flags for next iteration
            _continuationDecisionMade = false;
            _shouldContinueAfterCompletion = false;
        }
        else
        {
            // Use normal ShouldContinue logic (for fixed iterations or first iteration)
            shouldContinue = ShouldContinue(_activeContext!);
            _logger?.LogWarning("[RepeatActivity] Using normal ShouldContinue logic: {ShouldContinue}", shouldContinue);
        }

        if (shouldContinue)
        {
            _logger?.LogWarning("[RepeatActivity] DECISION: Starting iteration {NextIteration}", _currentIteration + 1);
            
            // Continue with next iteration
            await ContinueWithNextIteration();
        }
        else
        {
            _logger?.LogWarning("[RepeatActivity] DECISION: All iterations completed. Finishing RepeatActivity.");
            
            // Store collected results in context and complete
            _activeContext!.SetValue(_collectionContextKey, _collectedResults);

            // Signal that RepeatActivity is complete via normal
            // lifecycle transition so TopicFlow sees ActivityCompleted.
            var payload = ActivityResult.Continue(_collectedResults);
            _logger?.LogInformation("[RepeatActivity] Transitioning to Completed with {Count} collected results", _collectedResults.Count);
            TransitionTo(ActivityState.Completed, payload);
        }
    }

    /// <summary>
    /// Handles validation failures from child activities and checks for continuation choices.
    /// </summary>
    private void OnChildValidationFailed(object? sender, ValidationFailedEventArgs e)
    {
        // Forward the validation event first
        ValidationFailed?.Invoke(this, e);

        // In UserPrompted mode, check if this was a continuation choice rather than a form submission
        if (!string.IsNullOrEmpty(_continuePrompt) && _currentIteration > 1 && _lastSubmittedData != null)
        {
            // Check if the form data contains a continuation choice
            if (_lastSubmittedData.ContainsKey("user_response"))
            {
                var userResponse = _lastSubmittedData["user_response"]?.ToString();
                var isStopResponse = RepeatPromptInjector.IsStopResponse(userResponse);

                _logger?.LogInformation("[RepeatActivity] Validation failed, but user made continuation choice: '{Response}', Stop: {IsStop}", 
                    userResponse, isStopResponse);

                if (isStopResponse)
                {
                    // User wants to stop - complete the repeat activity
                    _logger?.LogInformation("[RepeatActivity] User chose to stop. Completing RepeatActivity.");
                    
                    // Store collected results and complete
                    _activeContext!.SetValue(_collectionContextKey, _collectedResults);
                    var payload = ActivityResult.Continue(_collectedResults);
                    _logger?.LogInformation("[RepeatActivity] Transitioning to Completed after user stop with {Count} collected results", _collectedResults.Count);
                    TransitionTo(ActivityState.Completed, payload);
                    return;
                }
            }
        }
    }

    /// <summary>
    /// Continues with the next iteration of the repeat loop.
    /// </summary>
    private async Task ContinueWithNextIteration()
    {
        try
        {
            _currentIteration++;
            
            // Create unique ID for this iteration
            var iterationId = $"{Id}_Iteration{_currentIteration}";
            
            _logger?.LogInformation("[RepeatActivity] Executing iteration {Iteration} with ID {IterationId}", 
                _currentIteration, iterationId);

            // Create the wrapped activity for this iteration
            _currentActivity = _activityFactory(iterationId, _activeContext!);
            
            // Hook up event forwarding if the child implements IAdaptiveCardActivity
            HookChildActivityEvents(_currentActivity);
            
            // Execute the wrapped activity
            var result = await _currentActivity.RunAsync(_activeContext!, null, CancellationToken.None);
            
            // Handle waiting states - activity might be waiting for user input
            if (result.IsWaiting)
            {
                _logger?.LogInformation("[RepeatActivity] Activity is waiting for input on iteration {Iteration}", _currentIteration);
                // Activity will complete later via the event handler
            }
            // Handle immediate completion (non-interactive activities)
            else if (!result.IsWaiting && !result.IsEnd)
            {
                _logger?.LogInformation("[RepeatActivity] Activity completed immediately on iteration {Iteration}", _currentIteration);
                // Trigger completion manually since OnChildActivityCompleted won't fire for immediate completion
                OnChildActivityCompleted(_currentActivity, new ActivityCompletedEventArgs(iterationId, result.ModelContext ?? new object()));
            }
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "[RepeatActivity] Error during iteration {Iteration}", _currentIteration);
            throw;
        }
    }

    /// <summary>
    /// Creates a RepeatActivity with a fixed number of iterations.
    /// </summary>
    public RepeatActivity(
        string id,
        Func<string, TopicWorkflowContext, TActivity> activityFactory,
        int iterations,
        string? collectionContextKey = null,
        ILogger? logger = null)
        : base(id)
    {
        if (iterations <= 0)
            throw new ArgumentException("Iterations must be greater than 0", nameof(iterations));
        
        _activityFactory = activityFactory ?? throw new ArgumentNullException(nameof(activityFactory));
        _fixedIterations = iterations;
        _collectionContextKey = collectionContextKey ?? $"{id}_Collection";
        _logger = logger;
    }

    /// <summary>
    /// Creates a RepeatActivity that prompts the user to continue.
    /// </summary>
    public RepeatActivity(
        string id,
        Func<string, TopicWorkflowContext, TActivity> activityFactory,
        string continuePrompt,
        string? collectionContextKey = null,
        ILogger? logger = null)
        : base(id)
    {
        _activityFactory = activityFactory ?? throw new ArgumentNullException(nameof(activityFactory));
        _continuePrompt = continuePrompt ?? throw new ArgumentNullException(nameof(continuePrompt));
        _collectionContextKey = collectionContextKey ?? $"{id}_Collection";
        _logger = logger;
    }

    /// <summary>
    /// Creates a RepeatActivity that uses a custom predicate to determine
    /// whether another iteration should run. This is useful for semantic
    /// loops driven by conversation context (e.g. "StillLearning" labels).
    /// </summary>
    public RepeatActivity(
        string id,
        Func<string, TopicWorkflowContext, TActivity> activityFactory,
        Func<TopicWorkflowContext, bool> shouldContinuePredicate,
        string? collectionContextKey = null,
        ILogger? logger = null)
        : base(id)
    {
        _activityFactory = activityFactory ?? throw new ArgumentNullException(nameof(activityFactory));
        _customShouldContinue = shouldContinuePredicate ?? throw new ArgumentNullException(nameof(shouldContinuePredicate));
        _collectionContextKey = collectionContextKey ?? $"{id}_Collection";
        _logger = logger;
    }

    protected override async Task<ActivityResult> RunActivity(
        TopicWorkflowContext context,
        object? input = null,
        CancellationToken cancellationToken = default)
    {
        _activeContext = context; // Store context for event handlers
        _logger?.LogInformation("[RepeatActivity] Starting repeat execution for {ActivityId}", Id);

        try
        {
            while (ShouldContinue(context))
            {
                _currentIteration++;
                
                // Create unique ID for this iteration
                var iterationId = $"{Id}_Iteration{_currentIteration}";
                
                _logger?.LogInformation("[RepeatActivity] Executing iteration {Iteration} with ID {IterationId}", 
                    _currentIteration, iterationId);

                // Create the wrapped activity for this iteration
                _currentActivity = _activityFactory(iterationId, context);
                
                // Hook up event forwarding if the child implements IAdaptiveCardActivity
                HookChildActivityEvents(_currentActivity);
                
                // Execute the wrapped activity
                var result = await _currentActivity.RunAsync(context, input, cancellationToken);
                
                // Collect the result if there's meaningful data
                if (result.ModelContext != null)
                {
                    _collectedResults.Add(result.ModelContext);
                    _logger?.LogInformation("[RepeatActivity] Collected result from iteration {Iteration}", _currentIteration);
                }
                
                // Handle waiting states - if activity is waiting for input, we should wait too
                if (result.IsWaiting)
                {
                    _logger?.LogInformation("[RepeatActivity] Activity is waiting for input on iteration {Iteration}", _currentIteration);
                    // Return the waiting result, preserving the activity's wait state
                    return result;
                }
                
                // Handle end states - if activity signals end, we should respect that
                if (result.IsEnd)
                {
                    _logger?.LogInformation("[RepeatActivity] Activity signaled end on iteration {Iteration}", _currentIteration);
                    break; // Exit the repeat loop
                }
            }

            // Store collected results in context
            context.SetValue(_collectionContextKey, _collectedResults);
            
            _logger?.LogInformation("[RepeatActivity] Completed {TotalIterations} iterations. Results stored in context key {ContextKey}", 
                _currentIteration, _collectionContextKey);

            return ActivityResult.Continue(_collectedResults);
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "[RepeatActivity] Error during repeat execution");
            throw; // Let the framework handle the exception
        }
    }

    /// <summary>
    /// Determines if the repeat loop should continue.
    /// </summary>
    private bool ShouldContinue(TopicWorkflowContext context)
    {
        // Custom predicate mode (semantic loop)
        if (_customShouldContinue != null)
        {
            var decision = _customShouldContinue(context);
            _logger?.LogInformation("[RepeatActivity] Custom predicate ShouldContinue => {Decision} (Iteration={Iteration})", decision, _currentIteration);
            return decision;
        }

        // Fixed iterations mode
        if (_fixedIterations.HasValue)
        {
            return _currentIteration < _fixedIterations.Value;
        }

        // User prompt mode
        if (!string.IsNullOrEmpty(_continuePrompt))
        {
            // On first iteration, always continue
            if (_currentIteration == 0)
                return true;

            // For subsequent iterations, check UserResponse from the latest model
            if (_collectedResults.Count > 0)
            {
                // Get the most recent result (should be BaseCardModel with UserResponse)
                var latestResult = _collectedResults[_collectedResults.Count - 1];
                
                if (latestResult is ConversaCore.Cards.BaseCardModel cardModel)
                {
                    var shouldStop = RepeatPromptInjector.IsStopResponse(cardModel.UserResponse);
                    _logger?.LogInformation("[RepeatActivity] User response: '{Response}', Should stop: {ShouldStop}", 
                        cardModel.UserResponse, shouldStop);
                    return !shouldStop; // Continue if NOT stop
                }
            }
            
            // Fallback: if we can't determine user response, stop to be safe
            _logger?.LogWarning("[RepeatActivity] Could not determine user response, stopping iteration");
            return false;
        }

        // Default: single iteration if no conditions specified
        return _currentIteration == 0;
    }

    /// <summary>
    /// Gets the collected results from all iterations.
    /// </summary>
    public IReadOnlyList<object> GetCollectedResults() => _collectedResults.AsReadOnly();

    /// <summary>
    /// Gets the current iteration number (1-based).
    /// </summary>
    public int CurrentIteration => _currentIteration;

    /// <summary>
    /// Gets the total number of planned iterations (if fixed).
    /// </summary>
    public int? TotalIterations => _fixedIterations;
}

/// <summary>
/// Factory methods for common RepeatActivity scenarios.
/// </summary>
public static class RepeatActivity
{
    /// <summary>
    /// Creates a RepeatActivity with fixed iterations.
    /// </summary>
    public static RepeatActivity<TActivity> FixedCount<TActivity>(
        string id,
        Func<string, TopicWorkflowContext, TActivity> activityFactory,
        int iterations,
        ILogger? logger = null)
        where TActivity : TopicFlowActivity
    {
        return new RepeatActivity<TActivity>(id, activityFactory, iterations, logger: logger);
    }

    /// <summary>
    /// Creates a RepeatActivity that prompts user to continue.
    /// </summary>
    public static RepeatActivity<TActivity> UserPrompted<TActivity>(
        string id,
        Func<string, TopicWorkflowContext, TActivity> activityFactory,
        string continuePrompt,
        ILogger? logger = null)
        where TActivity : TopicFlowActivity
    {
        return new RepeatActivity<TActivity>(id, activityFactory, continuePrompt, logger: logger);
    }

    /// <summary>
    /// Creates a RepeatActivity that continues while the provided predicate
    /// evaluates to true for the current TopicWorkflowContext.
    /// </summary>
    public static RepeatActivity<TActivity> While<TActivity>(
        string id,
        Func<string, TopicWorkflowContext, TActivity> activityFactory,
        Func<TopicWorkflowContext, bool> shouldContinue,
        ILogger? logger = null)
        where TActivity : TopicFlowActivity
    {
        return new RepeatActivity<TActivity>(id, activityFactory, shouldContinue, logger: logger);
    }
}