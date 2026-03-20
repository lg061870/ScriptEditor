using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace ConversaCore.TopicFlow; 
/// <summary>
/// An activity that chooses one branch to execute based on a context value.
/// Works like a "switch/case" statement inside a workflow.
/// </summary>
public class SwitchActivity : TopicFlowActivity {
    private readonly string _valueContextKey;
    private readonly Dictionary<string, TopicFlowActivity> _cases;
    private readonly TopicFlowActivity? _defaultCase;

    /// <summary>
    /// Gets or sets a value indicating whether to return to this activity
    /// after executing a case. When true, the switch will be re-evaluated
    /// after the selected case completes.
    /// </summary>
    public bool LoopAfterCase { get; set; }

    public SwitchActivity(
        string id,
        string valueContextKey,
        Dictionary<string, TopicFlowActivity> cases,
        TopicFlowActivity? defaultCase = null
    ) : base(id) {
        if (string.IsNullOrEmpty(valueContextKey))
            throw new ArgumentNullException(nameof(valueContextKey));
        if (cases == null || cases.Count == 0)
            throw new ArgumentException("At least one case must be provided.", nameof(cases));

        _valueContextKey = valueContextKey;
        _cases = cases;
        _defaultCase = defaultCase;
    }

    /// <summary>
    /// Factory: create from case dictionary of activities.
    /// </summary>
    public static SwitchActivity Create(
        string id,
        string valueContextKey,
        Dictionary<string, TopicFlowActivity> cases,
        TopicFlowActivity? defaultCase = null
    ) => new SwitchActivity(id, valueContextKey, cases, defaultCase);

    /// <summary>
    /// Factory: create from dictionary of delegates (auto-wraps them in SimpleActivity).
    /// </summary>
    public static SwitchActivity Create(
        string id,
        string valueContextKey,
        Dictionary<string, Action<TopicWorkflowContext>> cases,
        Action<TopicWorkflowContext>? defaultAction = null
    ) {
        if (cases == null || cases.Count == 0)
            throw new ArgumentException("At least one case must be provided.", nameof(cases));

        var activityCases = new Dictionary<string, TopicFlowActivity>();
        foreach (var kvp in cases) {
            var caseId = $"{id}_Case_{kvp.Key}";
            activityCases[kvp.Key] = SimpleActivity.Create(caseId, kvp.Value);
        }

        TopicFlowActivity? defaultCase = null;
        if (defaultAction != null) {
            defaultCase = SimpleActivity.Create($"{id}_Default", defaultAction);
        }

        return new SwitchActivity(id, valueContextKey, activityCases, defaultCase);
    }

    /// <inheritdoc/>
    protected override async Task<ActivityResult> RunActivity(
        TopicWorkflowContext context,
        object? input = null,
        CancellationToken cancellationToken = default) {
        // Detect loop re-entry
        var resumingFromCase = context.GetValue<bool>($"{Id}_ResumingFromCase");
        if (resumingFromCase) {
            context.SetValue($"{Id}_ResumingFromCase", false);
            if (!LoopAfterCase) {
                return ActivityResult.Continue();
            }
        }

        // Choose case
        var switchValue = context.GetValue<string>(_valueContextKey);
        TopicFlowActivity? selectedCase = null;

        if (switchValue != null && _cases.TryGetValue(switchValue, out var matchedCase)) {
            selectedCase = matchedCase;
        }
        else if (_defaultCase != null) {
            selectedCase = _defaultCase;
        }

        if (selectedCase == null) {
            // Nothing to do → just continue
            return ActivityResult.Continue();
        }

        // Execute the selected case
        var result = await selectedCase.RunAsync(context, input, cancellationToken);

        if (result.IsWaiting) {
            // Bubble up waiting state
            return result;
        }

        // Mark so next call knows we’re coming back from case
        context.SetValue($"{Id}_ResumingFromCase", true);

        if (LoopAfterCase) {
            // Loop back into the Switch itself
            return ActivityResult.Continue(Id);
        }

        // Normal: continue after the Switch
        return ActivityResult.Continue();
    }
}
