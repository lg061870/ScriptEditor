using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using ConversaCore.Context;

namespace ConversaCore.TopicFlow
{
    /// <summary>
    /// An activity that signals the completion of a topic and handles
    /// resuming any calling topic that might be waiting.
    /// </summary>
    public class CompleteTopicActivity : TopicFlowActivity
    {
        private readonly ILogger? _logger;
        private readonly IConversationContext? _conversationContext;
        
        /// <summary>
        /// Optional data to return to the calling topic.
        /// </summary>
        public object? CompletionData { get; }

        /// <summary>
        /// Optional message to include with the completion.
        /// </summary>
        public string? CompletionMessage { get; }

        public CompleteTopicActivity(
            string id, 
            object? completionData = null, 
            string? completionMessage = null,
            ILogger? logger = null, 
            IConversationContext? conversationContext = null)
            : base(id)
        {
            CompletionData = completionData;
            CompletionMessage = completionMessage;
            _logger = logger;
            _conversationContext = conversationContext;
        }

        protected override Task<ActivityResult> RunActivity(
            TopicWorkflowContext context,
            object? input = null,
            CancellationToken cancellationToken = default)
        {
            _logger?.LogInformation("[CompleteTopicActivity] Running {ActivityId}", Id);
            
            var currentTopic = _conversationContext?.CurrentTopicName ?? "Unknown";
            _logger?.LogInformation("[CompleteTopicActivity] Completing topic: {Topic}", currentTopic);

            // Signal completion to the conversation context
            _conversationContext?.SignalTopicCompletion(currentTopic, CompletionData);

            // Check if there's a calling topic waiting for this completion
            var callInfo = _conversationContext?.PopTopicCall(CompletionData);
            
            if (callInfo != null)
            {
                _logger?.LogInformation("[CompleteTopicActivity] Found waiting topic: {CallingTopic} (was waiting for {SubTopic})", 
                    callInfo.CallingTopicName, callInfo.SubTopicName);
                
                // Set the calling topic as the next topic to resume
                context.SetValue("NextTopic", callInfo.CallingTopicName);
                context.SetValue("ResumeData", callInfo.ResumeData);
                context.SetValue("SubTopicCompletionData", callInfo.CompletionData);
                
                // Return result that signals orchestrator to resume the calling topic
                var payload = new { 
                    Type = "Resume", 
                    Topic = callInfo.CallingTopicName,
                    CompletedSubTopic = callInfo.SubTopicName,
                    CompletionData = CompletionData,
                    ResumeData = callInfo.ResumeData
                };
                
                _logger?.LogInformation("[CompleteTopicActivity] Resuming calling topic with payload: {@Payload}", payload);
                return Task.FromResult(ActivityResult.End(payload));
            }
            else
            {
                _logger?.LogInformation("[CompleteTopicActivity] No waiting topic found, ending normally");
                
                // No calling topic waiting, just end normally
                var payload = new { 
                    Type = "Complete", 
                    Topic = currentTopic,
                    CompletionData = CompletionData,
                    Message = CompletionMessage
                };
                
                return Task.FromResult(ActivityResult.End(payload));
            }
        }
    }

    /// <summary>
    /// Extension methods for easily creating CompleteTopicActivity instances.
    /// </summary>
    public static class CompleteTopicActivityExtensions
    {
        /// <summary>
        /// Creates a CompleteTopicActivity with completion data.
        /// </summary>
        public static CompleteTopicActivity CompleteWith(
            this object completionData, 
            string? message = null,
            ILogger? logger = null,
            IConversationContext? conversationContext = null)
        {
            var id = $"complete-{Guid.NewGuid():N}";
            return new CompleteTopicActivity(id, completionData, message, logger, conversationContext);
        }

        /// <summary>
        /// Creates a CompleteTopicActivity with just a message.
        /// </summary>
        public static CompleteTopicActivity CompleteWithMessage(
            string message,
            ILogger? logger = null,
            IConversationContext? conversationContext = null)
        {
            var id = $"complete-{Guid.NewGuid():N}";
            return new CompleteTopicActivity(id, null, message, logger, conversationContext);
        }
    }
}