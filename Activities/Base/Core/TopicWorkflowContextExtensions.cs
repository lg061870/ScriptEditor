using System.Text.Json;

namespace ConversaCore.TopicFlow.Core;

public static class TopicWorkflowContextExtensions
{
    public static bool IsYes(this TopicWorkflowContext ctx, string key)
    {
        var value = ctx.GetValue<object?>(key);

        if (value is null)
            return false;

        if (value is JsonElement jsonElement)
        {
            if (jsonElement.ValueKind == JsonValueKind.String)
                value = jsonElement.GetString();
            else if (jsonElement.ValueKind == JsonValueKind.True)
                return true;
            else if (jsonElement.ValueKind == JsonValueKind.False)
                return false;
            else
                return false;
        }

        return value switch
        {
            bool b => b,
            string s => s.Trim().ToLowerInvariant() switch
            {
                "yes" or "y" or "true" or "1" => true,
                _ => false
            },
            _ => false
        };
    }

    public static bool IsNo(this TopicWorkflowContext ctx, string key)
    {
        var value = ctx.GetValue<object?>(key);

        return value switch
        {
            bool b => !b,
            string s => s.Trim().ToLowerInvariant() switch
            {
                "no" or "n" or "false" or "0" => true,
                _ => false
            },
            _ => false
        };
    }

    public static bool IsUnknown(this TopicWorkflowContext ctx, string key)
        => ctx.GetValue<bool?>(key) is null;
}
