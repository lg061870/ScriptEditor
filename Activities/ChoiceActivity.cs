using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace ConversaCore.TopicFlow;

/// <summary>
/// Presents a question and a set of quick-reply options to the user, waits for selection,
/// then stores the selected answer in the workflow context under the activity's SubmissionContextKey.
/// </summary>
public class ChoiceActivity : TopicFlowActivity {
    public string Question { get; }
    public List<string> Options { get; }

    public ChoiceActivity(string id, string question, IEnumerable<string> options)
        : base(id) {
        Question = question ?? throw new ArgumentNullException(nameof(question));
        Options = new List<string>(options ?? throw new ArgumentNullException(nameof(options)));
        SubmissionContextKey = id;
    }

    protected override Task<ActivityResult> RunActivity(TopicWorkflowContext context, object? input = null, CancellationToken cancellationToken = default) {
        // If input provided, treat as selected option
        if (input != null) {
            // store in context
            if (!string.IsNullOrEmpty(SubmissionContextKey))
                context.SetValue(SubmissionContextKey, input);

            TransitionTo(ActivityState.Completed, input);
            return Task.FromResult(ActivityResult.Continue(input));
        }

        // First render: return a structured payload describing the question and choices
        var payload = new ChoicePayload {
            ActivityId = Id,
            Question = Question,
            Options = Options.ToArray(),
            ContextKey = SubmissionContextKey
        };

        TransitionTo(ActivityState.Rendered, payload);
        return Task.FromResult(ActivityResult.WaitForInput(payload));
    }

    public class ChoicePayload {
        public string ActivityId { get; set; } = string.Empty;
        public string Question { get; set; } = string.Empty;
        public string[] Options { get; set; } = Array.Empty<string>();
        public string? ContextKey { get; set; }
    }
}
