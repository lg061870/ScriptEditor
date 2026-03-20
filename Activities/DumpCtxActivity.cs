using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace ConversaCore.TopicFlow; 
/// <summary>
/// Activity that dumps the entire workflow context to the chat window (development mode only).
/// </summary>
public class DumpCtxActivity : TopicFlowActivity {
    private readonly bool _isDevelopment;

    public DumpCtxActivity(string id, bool isDevelopment) : base(id) {
        _isDevelopment = isDevelopment;
    }

    protected override Task<ActivityResult> RunActivity(
        TopicWorkflowContext context,
        object? input = null,
        CancellationToken cancellationToken = default) {
        if (!_isDevelopment) {
            // In production: just silently continue
            return Task.FromResult(ActivityResult.Continue());
        }

        var dict = new Dictionary<string, object?>();

        foreach (var key in context.GetKeys()) {
            var value = context.GetValue<object>(key);

            if (value == null) {
                dict[key] = null;
            }
            else {
                var type = value.GetType();
                if (type.IsPrimitive || value is string) {
                    dict[key] = value;
                }
                else {
                    try {
                        dict[key] = JsonSerializer.Serialize(value, type);
                    } catch {
                        dict[key] = value.ToString();
                    }
                }
            }
        }

        var ctxDump = JsonSerializer.Serialize(
            dict,
            new JsonSerializerOptions { WriteIndented = true });

        var message = $"CTX Dump (dev mode):\n{ctxDump}";

        // ✅ Provide both a chat message AND a structured payload
        return Task.FromResult(
            ActivityResult.Continue(
                message, // ensures text is shown in chat
                new DumpCtxPayload {
                    Message = message
                }
            )
        );
    }

    public class DumpCtxPayload {
        public string Type { get; set; } = "DumpCtx";
        public string Message { get; set; } = string.Empty;
    }
}
