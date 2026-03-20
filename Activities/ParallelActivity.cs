using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace ConversaCore.TopicFlow; 
/// <summary>
/// Executes multiple child activities in parallel and waits for all to complete.
/// </summary>
public class ParallelActivity : TopicFlowActivity {
    private readonly IList<TopicFlowActivity> _activities;

    /// <summary>
    /// Continue execution even if one branch errors.
    /// </summary>
    public bool ContinueOnError { get; set; }

    /// <summary>
    /// Optional message to surface when all branches have completed.
    /// </summary>
    public string? CompleteMessage { get; set; }

    public ParallelActivity(string id, IEnumerable<TopicFlowActivity> activities)
        : base(id) {
        if (activities == null || !activities.Any())
            throw new ArgumentNullException(nameof(activities), "At least one activity must be provided.");
        _activities = new List<TopicFlowActivity>(activities);
    }

    public static ParallelActivity Create(string id, params TopicFlowActivity[] activities)
        => new ParallelActivity(id, activities);

    public static ParallelActivity Create(string id, params Action<TopicWorkflowContext>[] actions) {
        if (actions == null || actions.Length == 0)
            throw new ArgumentNullException(nameof(actions), "At least one action must be provided.");

        var activities = new List<TopicFlowActivity>();
        for (int i = 0; i < actions.Length; i++) {
            var action = actions[i] ?? throw new ArgumentNullException(nameof(actions), $"Action at index {i} is null.");
            activities.Add(SimpleActivity.Create($"{id}_Branch{i}", action));
        }
        return new ParallelActivity(id, activities);
    }

    /// <inheritdoc/>
    protected override async Task<ActivityResult> RunActivity(
        TopicWorkflowContext context,
        object? input = null,
        CancellationToken cancellationToken = default) {
        var statusKey = $"{Id}_BranchStatus";
        var resultsKey = $"{Id}_BranchResults";

        var branchStatus = context.GetValue<Dictionary<string, bool>>(statusKey)
                           ?? _activities.ToDictionary(a => a.Id, _ => false);
        var branchResults = context.GetValue<Dictionary<string, object?>>(resultsKey)
                            ?? new Dictionary<string, object?>();

        context.SetValue(statusKey, branchStatus);
        context.SetValue(resultsKey, branchResults);

        // Handle user input if a branch is waiting
        if (input != null) {
            var waitingId = context.GetValue<string>($"{Id}_WaitingActivityId");
            if (!string.IsNullOrEmpty(waitingId)) {
                var waitingActivity = _activities.FirstOrDefault(a => a.Id == waitingId);
                if (waitingActivity != null) {
                    var result = await waitingActivity.RunAsync(context, input, cancellationToken);
                    if (!result.IsWaiting) {
                        branchStatus[waitingId] = true;
                        branchResults[waitingId] = result.ModelContext ?? (object?)result.Message;
                        context.SetValue($"{Id}_WaitingActivityId", null);
                    }
                    else {
                        context.SetValue($"{Id}_WaitingActivityId", waitingId);
                        return result;
                    }
                }
            }
        }

        // Kick off remaining branches
        var tasks = _activities
            .Where(a => !branchStatus[a.Id])
            .ToDictionary(a => a.Id, a => a.RunAsync(context, null, cancellationToken));

        while (tasks.Count > 0) {
            var completed = await Task.WhenAny(tasks.Values);
            var kv = tasks.First(kv => kv.Value == completed);
            var activityId = kv.Key;
            tasks.Remove(activityId);

            try {
                var result = await completed;
                if (result.IsWaiting) {
                    context.SetValue($"{Id}_WaitingActivityId", activityId);
                    return result;
                }

                branchStatus[activityId] = true;
                branchResults[activityId] = result.ModelContext ?? (object?)result.Message;
            } catch (Exception ex) {
                if (ContinueOnError) {
                    branchStatus[activityId] = true;
                    branchResults[activityId] = ex;
                }
                else {
                    throw;
                }
            }
        }

        // All branches done
        context.RemoveValue(statusKey);
        context.RemoveValue(resultsKey);
        context.RemoveValue($"{Id}_WaitingActivityId");

        context.SetValue(Id, branchResults);

        if (!string.IsNullOrEmpty(CompleteMessage)) {
            return ActivityResult.Continue(CompleteMessage);
        }

        return ActivityResult.Continue();
    }
}
