using System;
using System.Threading;
using System.Threading.Tasks;
using ConversaCore.Context;
using Microsoft.Extensions.Logging;

namespace ConversaCore.TopicFlow.Activities
{
    /// <summary>
    /// Activity responsible for setting variables in the conversation context.
    /// This is the ONLY activity that should modify global variables, enforcing
    /// centralized control over context state management.
    /// </summary>
    public class SetVariableActivity : TopicFlowActivity
    {
        /// <summary>
        /// Gets or sets the name of the variable to set.
        /// Global variables should use the "Global_" prefix.
        /// </summary>
        public string VariableName { get; set; }
        
        /// <summary>
        /// Gets or sets the value to assign to the variable.
        /// </summary>
        public object? Value { get; set; }
        
        /// <summary>
        /// Gets or sets whether this is a global variable.
        /// Global variables are conversation-wide, local variables are topic-specific.
        /// </summary>
        public bool IsGlobal { get; set; } = true;
        
        /// <summary>
        /// Gets or sets whether to validate global variable naming conventions.
        /// </summary>
        public bool ValidateGlobalNaming { get; set; } = true;
        
        private readonly IConversationContext _conversationContext;
        private readonly ILogger<SetVariableActivity> _logger;

        public SetVariableActivity(
            string id,
            string variableName,
            object? value,
            IConversationContext conversationContext,
            ILogger<SetVariableActivity> logger,
            bool isGlobal = true)
            : base(id, logger)
        {
            VariableName = variableName ?? throw new ArgumentNullException(nameof(variableName));
            Value = value;
            IsGlobal = isGlobal;
            _conversationContext = conversationContext ?? throw new ArgumentNullException(nameof(conversationContext));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
            
            Name = $"Set Variable ({variableName})";
            Description = $"Sets {(isGlobal ? "global" : "local")} variable '{variableName}' to specified value";
        }

        protected override Task<ActivityResult> RunActivity(
            TopicWorkflowContext context,
            object? input = null,
            CancellationToken cancellationToken = default)
        {
            try
            {
                // Validate global variable naming convention
                if (IsGlobal && ValidateGlobalNaming && !VariableName.StartsWith("Global_"))
                {
                    var errorMsg = $"Global variables must use 'Global_' prefix. Variable: {VariableName}";
                    _logger.LogError("[{ActivityId}] {ErrorMessage}", Id, errorMsg);
                    throw new InvalidOperationException(errorMsg);
                }
                
                // Validate variable name
                if (string.IsNullOrWhiteSpace(VariableName))
                {
                    var errorMsg = "Variable name cannot be null or empty";
                    _logger.LogError("[{ActivityId}] {ErrorMessage}", Id, errorMsg);
                    throw new ArgumentException(errorMsg);
                }
                
                // Log the variable change
                _logger.LogInformation("[{ActivityId}] Setting {VariableType} variable '{VariableName}' = {Value} (Type: {ValueType})",
                    Id, 
                    IsGlobal ? "global" : "local",
                    VariableName,
                    Value?.ToString() ?? "null",
                    Value?.GetType().Name ?? "null");
                
                // Set the variable in appropriate context
                if (IsGlobal)
                {
                    if (Value != null)
                        _conversationContext.SetValue(VariableName, Value);
                }
                else
                {
                    // Local variables go into topic workflow context
                    context.SetValue(VariableName, Value);
                }
                
                var resultMessage = $"Set {(IsGlobal ? "global" : "local")} variable '{VariableName}'";
                _logger.LogDebug("[{ActivityId}] Successfully {ResultMessage}", Id, resultMessage);
                
                return Task.FromResult(ActivityResult.Continue(resultMessage));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[{ActivityId}] Failed to set variable '{VariableName}'", Id, VariableName);
                return Task.FromResult(ActivityResult.Continue($"Failed to set variable '{VariableName}': {ex.Message}"));
            }
        }
    }
    
    /// <summary>
    /// Generic version for strongly-typed variable setting.
    /// </summary>
    public class SetVariableActivity<T> : SetVariableActivity
    {
        public new T? Value 
        { 
            get => (T?)base.Value;
            set => base.Value = value;
        }

        public SetVariableActivity(
            string id,
            string variableName,
            T? value,
            IConversationContext conversationContext,
            ILogger<SetVariableActivity> logger,
            bool isGlobal = true)
            : base(id, variableName, value, conversationContext, logger, isGlobal)
        {
        }
    }
    
    /// <summary>
    /// Builder pattern for creating SetVariableActivity instances.
    /// </summary>
    public static class SetVariableActivityBuilder
    {
        /// <summary>
        /// Creates a SetVariableActivity for a global variable.
        /// </summary>
        public static SetVariableActivity CreateGlobal(
            string id,
            string variableName,
            object? value,
            IConversationContext conversationContext,
            ILogger<SetVariableActivity> logger)
        {
            return new SetVariableActivity(id, variableName, value, conversationContext, logger, isGlobal: true);
        }
        
        /// <summary>
        /// Creates a SetVariableActivity for a local variable.
        /// </summary>
        public static SetVariableActivity CreateLocal(
            string id,
            string variableName,
            object? value,
            IConversationContext conversationContext,
            ILogger<SetVariableActivity> logger)
        {
            return new SetVariableActivity(id, variableName, value, conversationContext, logger, isGlobal: false)
            {
                ValidateGlobalNaming = false // Don't validate naming for local variables
            };
        }
        
        /// <summary>
        /// Creates a strongly-typed SetVariableActivity for a global variable.
        /// </summary>
        public static SetVariableActivity<T> CreateGlobal<T>(
            string id,
            string variableName,
            T? value,
            IConversationContext conversationContext,
            ILogger<SetVariableActivity> logger)
        {
            return new SetVariableActivity<T>(id, variableName, value, conversationContext, logger, isGlobal: true);
        }
        
        /// <summary>
        /// Creates a strongly-typed SetVariableActivity for a local variable.
        /// </summary>
        public static SetVariableActivity<T> CreateLocal<T>(
            string id,
            string variableName,
            T? value,
            IConversationContext conversationContext,
            ILogger<SetVariableActivity> logger)
        {
            var activity = new SetVariableActivity<T>(id, variableName, value, conversationContext, logger, isGlobal: false);
            activity.ValidateGlobalNaming = false;
            return activity;
        }
    }
}