using System.Text.Json;
using System.Text.Json.Serialization;

namespace ScriptEditor.Models;

public sealed class DiagramDocument
{
    public DiagramViewport Viewport { get; set; } = new();

    public List<DiagramNode> Nodes { get; set; } = [];

    public List<DiagramEdge> Edges { get; set; } = [];

    public List<DiagramAdaptiveCardDefinition> Cards { get; set; } = [];

    public List<DiagramAdaptiveModelDefinition> Models { get; set; } = [];
}

public sealed class DiagramViewport
{
    public double PanX { get; set; } = 24;

    public double PanY { get; set; } = 18;

    public double Zoom { get; set; } = 1;
}

public sealed class DiagramNode
{
    public string Id { get; set; } = string.Empty;

    public string Type { get; set; } = "generic";

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Name { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool Collapsed { get; set; }

    public double X { get; set; }

    public double Y { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public double? Width { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public double? Height { get; set; }

    public Dictionary<string, string> Data { get; set; } = [];

    public List<DiagramPort> Ports { get; set; } = [];

    public DiagramContextUsage Context { get; set; } = new();
}

public sealed class DiagramContextUsage
{
    public List<string> Reads { get; set; } = [];

    public List<string> Writes { get; set; } = [];
}

public sealed class DiagramPort
{
    public string Id { get; set; } = string.Empty;

    public string Name { get; set; } = "Port";

    public string Direction { get; set; } = "input";

    public string Type { get; set; } = "string";

    public string Position { get; set; } = "left";
}

public sealed class DiagramAdaptiveModelDefinition
{
    public string Id { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string BaseType { get; set; } = "BaseCardModel";

    public List<DiagramAdaptiveModelPropertyDefinition> Properties { get; set; } = [];
}

public sealed class DiagramAdaptiveModelPropertyDefinition
{
    public string Name { get; set; } = string.Empty;

    public string Type { get; set; } = "string";

    public bool Required { get; set; }

    public string? DefaultValue { get; set; }

    public string? Description { get; set; }
}

public sealed class DiagramAdaptiveCardDefinition
{
    public string Id { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string BaseType { get; set; } = "AdaptiveFormCardLayout";

    public string ModelRef { get; set; } = string.Empty;

    public List<DiagramAdaptiveCardFieldDefinition> Fields { get; set; } = [];
}

public sealed class DiagramAdaptiveCardFieldDefinition
{
    public string Id { get; set; } = string.Empty;

    public string Label { get; set; } = string.Empty;

    public string InputType { get; set; } = "text";

    public string? Placeholder { get; set; }

    public bool Required { get; set; }
}

[JsonConverter(typeof(DiagramEndpointJsonConverter))]
public sealed class DiagramEndpoint
{
    public string Node { get; set; } = string.Empty;

    public string Port { get; set; } = string.Empty;
}

public sealed class DiagramEdge
{
    public string Id { get; set; } = string.Empty;

    public DiagramEndpoint From { get; set; } = new();

    public DiagramEndpoint? To { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public double? LooseX { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public double? LooseY { get; set; }
}

public sealed class DiagramEndpointJsonConverter : JsonConverter<DiagramEndpoint>
{
    public override DiagramEndpoint Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.String)
        {
            return new DiagramEndpoint
            {
                Port = reader.GetString() ?? string.Empty
            };
        }

        if (reader.TokenType != JsonTokenType.StartObject)
        {
            throw new JsonException($"Expected string or object for endpoint, found {reader.TokenType}.");
        }

        var endpoint = new DiagramEndpoint();

        while (reader.Read())
        {
            if (reader.TokenType == JsonTokenType.EndObject)
            {
                return endpoint;
            }

            if (reader.TokenType != JsonTokenType.PropertyName)
            {
                continue;
            }

            var propertyName = reader.GetString() ?? string.Empty;
            reader.Read();

            if (propertyName.Equals("node", StringComparison.OrdinalIgnoreCase))
            {
                endpoint.Node = reader.TokenType == JsonTokenType.String ? reader.GetString() ?? string.Empty : string.Empty;
                continue;
            }

            if (propertyName.Equals("port", StringComparison.OrdinalIgnoreCase))
            {
                endpoint.Port = reader.TokenType == JsonTokenType.String ? reader.GetString() ?? string.Empty : string.Empty;
                continue;
            }

            if (propertyName.Equals("id", StringComparison.OrdinalIgnoreCase))
            {
                endpoint.Port = reader.TokenType == JsonTokenType.String ? reader.GetString() ?? string.Empty : endpoint.Port;
                continue;
            }

            reader.Skip();
        }

        throw new JsonException("Unexpected end of endpoint object.");
    }

    public override void Write(Utf8JsonWriter writer, DiagramEndpoint value, JsonSerializerOptions options)
    {
        writer.WriteStartObject();
        writer.WriteString("node", value.Node ?? string.Empty);
        writer.WriteString("port", value.Port ?? string.Empty);
        writer.WriteEndObject();
    }
}

public static class DiagramDocumentFactory
{
    public static DiagramDocument CreateDefault()
    {
        return new DiagramDocument
        {
            Viewport = new DiagramViewport
            {
                PanX = 24,
                PanY = 18,
                Zoom = 1
            },
            Nodes = [],
            Edges = [],
            Cards = [],
            Models = []
        };
    }
}


