using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace ConversaCore.TopicFlow; 
/// <summary>
/// An activity that iterates over a collection and executes a child activity for each item.
/// </summary>
public class ForEachActivity : TopicFlowActivity {
    private readonly string _collectionContextKey;
    private readonly TopicFlowActivity _childActivity;

    /// <summary>
    /// Gets or sets the name of the context key where the current iteration item will be stored.
    /// </summary>
    public string ItemContextKey { get; set; } = "item";

    /// <summary>
    /// Gets or sets the name of the context key where the current iteration index will be stored.
    /// </summary>
    public string IndexContextKey { get; set; } = "index";

    /// <summary>
    /// Gets or sets an optional message to display before starting the iteration.
    /// </summary>
    public string? StartMessage { get; set; }

    /// <summary>
    /// Gets or sets an optional message to display after completing the iteration.
    /// </summary>
    public string? CompleteMessage { get; set; }

    public ForEachActivity(string id, string collectionContextKey, TopicFlowActivity childActivity)
        : base(id) {
        if (string.IsNullOrEmpty(collectionContextKey))
            throw new ArgumentNullException(nameof(collectionContextKey));

        _collectionContextKey = collectionContextKey;
        _childActivity = childActivity ?? throw new ArgumentNullException(nameof(childActivity));
    }

    public static ForEachActivity Create(string id, string collectionContextKey, TopicFlowActivity childActivity)
        => new ForEachActivity(id, collectionContextKey, childActivity);

    public static ForEachActivity Create(string id, string collectionContextKey, Action<TopicWorkflowContext> action) {
        var childId = $"{id}_Child";
        var childActivity = SimpleActivity.Create(childId, action);
        return new ForEachActivity(id, collectionContextKey, childActivity);
    }

    public static ForEachActivity CreateInteractive(string id, string collectionContextKey, Func<TopicWorkflowContext, string> messageFunction) {
        var childId = $"{id}_Child";
        var defaultMessage = messageFunction != null ? messageFunction(new TopicWorkflowContext()) : "Processing items...";
        var childActivity = new InteractiveActivity(childId, defaultMessage);
        return new ForEachActivity(id, collectionContextKey, childActivity);
    }

    /// <inheritdoc/>
    protected override async Task<ActivityResult> RunActivity(
        TopicWorkflowContext context,
        object? input = null,
        CancellationToken cancellationToken = default) {
        var collection = context.GetValue<IEnumerable<object>>(_collectionContextKey);
        if (collection == null)
            throw new InvalidOperationException($"Collection with key '{_collectionContextKey}' not found in context or is not enumerable.");

        var items = collection.ToList();
        var index = context.GetValue($"{Id}_index", 0);

        // Handle incoming input (if child was interactive)
        if (input != null)
            context.SetValue(_childActivity.Id, input);

        // Emit start message on very first run
        if (index == 0 && !string.IsNullOrEmpty(StartMessage)) {
            var startKey = $"{Id}_startMessageShown";
            if (!context.ContainsKey(startKey)) {
                context.SetValue(startKey, true);
                return ActivityResult.Continue(StartMessage);
            }
        }

        // Iteration complete
        if (index >= items.Count) {
            context.SetValue($"{Id}_index", 0);
            context.SetValue($"{Id}_startMessageShown", null);

            if (!string.IsNullOrEmpty(CompleteMessage))
                return ActivityResult.Continue(CompleteMessage);

            return ActivityResult.Continue();
        }

        // Current item execution
        var currentItem = items[index];
        context.SetValue(ItemContextKey, currentItem);
        context.SetValue(IndexContextKey, index);

        var result = await _childActivity.RunAsync(context, null, cancellationToken);

        if (result.IsWaiting) {
            // Forward waiting result
            return result;
        }

        // Advance index and loop again
        context.SetValue($"{Id}_index", index + 1);

        // Surface either child’s message or model
        if (!string.IsNullOrEmpty(result.Message))
            return ActivityResult.Continue(result.Message);
        if (result.ModelContext != null)
            return ActivityResult.Continue(result.ModelContext);

        return ActivityResult.Continue();
    }
}
