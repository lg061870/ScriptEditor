using Microsoft.Extensions.Logging;

namespace ConversaCore.TopicFlow;

public class QuickAnswerCard {
    // placeholder type used by AdaptiveCardActivity<TCard,TModel>
}

/// <summary>
/// QuickAnswerActivity implemented as an AdaptiveCard activity with a dynamic dictionary model.
/// This leverages the existing adaptive-card lifecycle, validation pipeline and model binding.
/// </summary>
public class QuickAnswerActivity : AdaptiveCardActivity<QuickAnswerCard, Dictionary<string, object>>
{
    public QuickAnswerActivity(string id, string question, IEnumerable<string> answers, TopicWorkflowContext context, ILogger<QuickAnswerActivity> logger, bool isRequired = false)
        : base(id, context,
              cardFactory: _ => {
                  var actionArray = answers.Select(a => new {
                      type = "Action.Submit",
                      title = a,
                      data = new Dictionary<string, object> { { "answer", a } }
                  }).ToArray();

                  var body = new object[] {
                      new {
                          type = "TextBlock",
                          text = question,
                          weight = "Bolder",
                          size = "Medium"
                      }
                  };

                  return new {
                      type = "AdaptiveCard",
                      version = "1.3",
                      body = body,
                      actions = actionArray
                  };
              },
              modelContextKey: id,
              logger: logger,
              customMessage: "Please choose an option")
    {
        SubmissionContextKey = id;
        IsRequired = isRequired;
    }
}