using System;
using System.Threading;
using System.Threading.Tasks;

namespace ConversaCore.TopicFlow; 
/// <summary>
/// An activity that marks the end of a workflow.
/// </summary>
public class EndActivity : TopicFlowActivity {
    public string? EndMessage { get; set; }
    public object? Result { get; set; }
    public Func<TopicWorkflowContext, object?>? ResultFunction { get; set; }

    public EndActivity(string id, string? message = null)
        : base(id) {
        EndMessage = message;
    }

    public static EndActivity Create(string id, string message) =>
        new EndActivity(id, message);

    public static EndActivity CreateWithResult(string id, object result) =>
        new EndActivity(id) { Result = result };

    public static EndActivity CreateWithResultFunction(string id, Func<TopicWorkflowContext, object?> resultFunction) {
        if (resultFunction == null)
            throw new ArgumentNullException(nameof(resultFunction));

        return new EndActivity(id) { ResultFunction = resultFunction };
    }

    /// <inheritdoc/>
    protected override Task<ActivityResult> RunActivity(
        TopicWorkflowContext context,
        object? input = null,
        CancellationToken cancellationToken = default) {
        try {
            TransitionTo(ActivityState.Running, input);

            object? model = Result;
            if (ResultFunction != null) {
                model = ResultFunction(context);
            }

            TransitionTo(ActivityState.Finalizing, model);

            if (model != null) {
                context.SetValue("Result", model);
            }

            context.SetValue("IsCompleted", true);

            TransitionTo(ActivityState.Completed, model);

            // Use whichever form of End makes sense
            if (!string.IsNullOrEmpty(EndMessage))
                return Task.FromResult(ActivityResult.End(EndMessage));
            else if (model != null)
                return Task.FromResult(ActivityResult.End(model));
            else
                return Task.FromResult(ActivityResult.End(string.Empty));
        } catch (Exception ex) {
            TransitionTo(ActivityState.Failed, ex);
            throw;
        }
    }
}
