using ConversaCore.Registration;
using ConversaCore.Runtime;
using ConversaCore.Topics;
using ConversaCore.TopicFlow;
using ConversaCore.TopicFlow.Activities;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace ScriptEditor.Runtime;

public class DynamicTopicCatalog : ITopicCatalog
{
    private readonly object _lock = new();
    private TopicDescriptor _currentDescriptor;

    private readonly Dictionary<string, TopicDescriptor> _namedDescriptors = new(StringComparer.OrdinalIgnoreCase);
    private readonly TopicDescriptor _fallbackDescriptor;

    public DynamicTopicCatalog()
    {
        _currentDescriptor = CreateDefaultDescriptor();
        _fallbackDescriptor = CreateFallbackDescriptor();
    }

    private static TopicDescriptor CreateDefaultDescriptor()
    {
        return new TopicDescriptor(
            "editor.current",
            sp => new DefaultEditorTopic(
                sp.GetRequiredService<TopicWorkflowContext>(),
                sp.GetRequiredService<ILogger<DefaultEditorTopic>>()),
            "ScriptEditor Active Workflow");
    }

    private static TopicDescriptor CreateFallbackDescriptor()
    {
        return new TopicDescriptor(
            "editor.fallback",
            sp => new EditorFallbackTopic(
                sp.GetRequiredService<TopicWorkflowContext>(),
                sp.GetRequiredService<ILogger<EditorFallbackTopic>>()),
            "ScriptEditor Fallback Handler")
        {
            Classification = TopicClassification.System
        };
    }

    public void SetWorkflowType(Type topicFlowType)
    {
        lock (_lock)
        {
            _namedDescriptors.Clear();
            var desc = new TopicDescriptor(
                "editor.current",
                sp =>
                {
                    var logger = sp.GetRequiredService<ILoggerFactory>().CreateLogger(topicFlowType.FullName ?? "GeneratedWorkflow");
                    return (ITopic)ActivatorUtilities.CreateInstance(sp, topicFlowType, logger);
                },
                "ScriptEditor Active Workflow");
            _currentDescriptor = desc;
            _namedDescriptors[topicFlowType.Name] = desc;
        }
    }

    public void SetWorkflowTypes(IEnumerable<Type> topicFlowTypes, string? initialTopicName = null)
    {
        lock (_lock)
        {
            _namedDescriptors.Clear();
            TopicDescriptor? initialDesc = null;

            foreach (var type in topicFlowTypes)
            {
                var typeName = type.Name;
                var desc = new TopicDescriptor(
                    typeName,
                    sp =>
                    {
                        var logger = sp.GetRequiredService<ILoggerFactory>().CreateLogger(type.FullName ?? typeName);
                        return (ITopic)ActivatorUtilities.CreateInstance(sp, type, logger);
                    },
                    $"ScriptEditor Topic: {typeName}");

                _namedDescriptors[typeName] = desc;

                if (!string.IsNullOrWhiteSpace(initialTopicName) &&
                    string.Equals(typeName, initialTopicName, StringComparison.OrdinalIgnoreCase))
                {
                    initialDesc = desc;
                }
            }

            if (initialDesc != null)
            {
                _currentDescriptor = initialDesc;
            }
            else if (_namedDescriptors.Count > 0)
            {
                _currentDescriptor = _namedDescriptors.Values.First();
            }
        }
    }

    public void ResetToDefault()
    {
        lock (_lock)
        {
            _namedDescriptors.Clear();
            _currentDescriptor = CreateDefaultDescriptor();
        }
    }

    public int Count
    {
        get
        {
            lock (_lock)
            {
                return Descriptors.Count;
            }
        }
    }

    public IReadOnlyCollection<TopicDescriptor> Descriptors
    {
        get
        {
            lock (_lock)
            {
                var list = new List<TopicDescriptor> { _currentDescriptor, _fallbackDescriptor };
                foreach (var d in _namedDescriptors.Values)
                {
                    if (d != _currentDescriptor)
                    {
                        list.Add(d);
                    }
                }
                return list;
            }
        }
    }

    public bool Contains(string topicId)
    {
        lock (_lock)
        {
            return string.Equals(topicId, "editor.current", StringComparison.OrdinalIgnoreCase) ||
                   string.Equals(topicId, "editor.fallback", StringComparison.OrdinalIgnoreCase) ||
                   string.Equals(topicId, _currentDescriptor.TopicId, StringComparison.OrdinalIgnoreCase) ||
                   _namedDescriptors.ContainsKey(topicId);
        }
    }

    public bool TryGetDescriptor(string topicId, out TopicDescriptor? descriptor)
    {
        lock (_lock)
        {
            if (string.Equals(topicId, "editor.fallback", StringComparison.OrdinalIgnoreCase))
            {
                descriptor = _fallbackDescriptor;
                return true;
            }

            if (string.Equals(topicId, "editor.current", StringComparison.OrdinalIgnoreCase))
            {
                descriptor = _currentDescriptor;
                return true;
            }

            if (_namedDescriptors.TryGetValue(topicId, out descriptor))
            {
                return true;
            }

            if (string.Equals(topicId, _currentDescriptor.TopicId, StringComparison.OrdinalIgnoreCase))
            {
                descriptor = _currentDescriptor;
                return true;
            }
            descriptor = null;
            return false;
        }
    }

    public TopicDescriptor GetDescriptor(string topicId)
    {
        if (TryGetDescriptor(topicId, out var descriptor) && descriptor != null)
        {
            return descriptor;
        }
        throw new KeyNotFoundException($"Topic '{topicId}' not found in catalog.");
    }
}

public sealed class EditorFallbackTopic : TopicFlow
{
    public EditorFallbackTopic(TopicWorkflowContext context, ILogger<EditorFallbackTopic> logger)
        : base(context, logger, "EditorFallbackTopic")
    {
        Add(new SimpleActivity(
            "fallback_reply",
            "I'm listening! The workflow completed its initial output. You can edit nodes on the canvas and click **Run** to execute new behavior!"));
    }

    public override Task<float> CanHandleAsync(string message, CancellationToken cancellationToken = default) =>
        Task.FromResult(1f);
}

public sealed class DefaultEditorTopic : TopicFlow
{
    public DefaultEditorTopic(TopicWorkflowContext context, ILogger<DefaultEditorTopic> logger)
        : base(context, logger, "DefaultEditorTopic")
    {
        Add(new SimpleActivity(
            "ready_prompt",
            "Welcome to ConversaCore Live Preview. Click **Run Workflow** on the canvas to execute your diagram!"));
    }

    public override Task<float> CanHandleAsync(string message, CancellationToken cancellationToken = default) =>
        Task.FromResult(1f);
}
