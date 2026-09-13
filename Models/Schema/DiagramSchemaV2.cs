using System.Text.Json.Serialization;

namespace ScriptEditor.Models.Schema;

// Diagram JSON SSOT schema v2 (Phase 0.3).
//
// Mirrors ../../canvas-app/src/schema/diagram.ts field-for-field so the
// frontend and the Roslyn transcription API (Phase 0.5+) agree on wire
// shape without a mapping layer.
//
// v1 (see ../DiagramDocument.cs) is untouched and still backs the old
// wwwroot/editor.js canvas; this is a draft for the new app, not a
// replacement of v1 yet. NOT wired into Program.cs or any endpoint here --
// Phase 0.5's stub endpoints reference these types to keep the API and the
// schema in sync from day one.

/// <summary>
/// Every port on every one of the 36 catalog shapes (docs/activity-shapes.md)
/// is one of exactly these four roles -- confirmed by grepping every shape's
/// port table. <see cref="Main"/> covers plain Input/Output; <see cref="Exception"/>
/// and <see cref="Control"/> are always separate named ports; <see cref="AuxConfig"/>
/// is only ever AdaptiveCardActivity's Card/Model inputs today, but exists as a
/// role (not a special case) for the next shape that needs a non-flow input.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<DiagramPortRoleV2>))]
public enum DiagramPortRoleV2
{
    [JsonStringEnumMemberName("main")]
    Main,
    [JsonStringEnumMemberName("exception")]
    Exception,
    [JsonStringEnumMemberName("control")]
    Control,
    [JsonStringEnumMemberName("aux-config")]
    AuxConfig
}

[JsonConverter(typeof(JsonStringEnumConverter<DiagramPortDirectionV2>))]
public enum DiagramPortDirectionV2
{
    [JsonStringEnumMemberName("input")]
    Input,
    [JsonStringEnumMemberName("output")]
    Output
}

/// <summary>
/// Coarse rendering hint only -- Phase 4.3 auto-stacks same-side ports by
/// index/count, so this is not a pixel offset, just which edge of the node
/// the port belongs on.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<DiagramPortSideV2>))]
public enum DiagramPortSideV2
{
    [JsonStringEnumMemberName("left")]
    Left,
    [JsonStringEnumMemberName("right")]
    Right,
    [JsonStringEnumMemberName("top")]
    Top,
    [JsonStringEnumMemberName("bottom")]
    Bottom
}

public sealed class DiagramPortV2
{
    public string Id { get; set; } = string.Empty;

    public string Name { get; set; } = "Port";

    [JsonConverter(typeof(JsonStringEnumConverter<DiagramPortDirectionV2>))]
    public DiagramPortDirectionV2 Direction { get; set; } = DiagramPortDirectionV2.Input;

    /// <summary>
    /// Explicit, always-set at creation time -- replaces the old
    /// isExceptionPort/isControlPort substring-matching heuristic
    /// (wwwroot/editor.js) entirely. See Phase 4.1.
    /// </summary>
    [JsonConverter(typeof(JsonStringEnumConverter<DiagramPortRoleV2>))]
    public DiagramPortRoleV2 Role { get; set; } = DiagramPortRoleV2.Main;

    /// <summary>
    /// Payload/compatibility type, e.g. "flow" | "string" | "model". Two ports
    /// connect only if direction is output-&gt;input AND type matches (or
    /// either side is "any") -- the one part of the v1 model that already
    /// worked correctly (editor.js:1071-1078) and is preserved as-is.
    /// </summary>
    public string Type { get; set; } = "string";

    [JsonConverter(typeof(JsonStringEnumConverter<DiagramPortSideV2>))]
    public DiagramPortSideV2 Position { get; set; } = DiagramPortSideV2.Left;
}

public sealed class DiagramContextUsageV2
{
    public List<string> Reads { get; set; } = [];

    public List<string> Writes { get; set; } = [];
}

public sealed class DiagramNodeV2
{
    public string Id { get; set; } = string.Empty;

    public string Type { get; set; } = "generic";

    public string? Name { get; set; }

    public bool Collapsed { get; set; }

    public double X { get; set; }

    public double Y { get; set; }

    public double? Width { get; set; }

    public double? Height { get; set; }

    public Dictionary<string, string> Data { get; set; } = [];

    /// <summary>
    /// One entry per actual port instance -- for branching activities
    /// (SwitchActivity, DecisionActivity, ...) this means one Main-role
    /// output port per case, not one generic "Output" port fanning out
    /// (Phase 4.4). The schema already supports this: it's a list sized
    /// per node instance, not a fixed per-type template.
    /// </summary>
    public List<DiagramPortV2> Ports { get; set; } = [];

    public DiagramContextUsageV2 Context { get; set; } = new();
}

public sealed class DiagramEndpointV2
{
    public string Node { get; set; } = string.Empty;

    public string Port { get; set; } = string.Empty;
}

public sealed class DiagramEdgeV2
{
    public string Id { get; set; } = string.Empty;

    public DiagramEndpointV2 From { get; set; } = new();

    public DiagramEndpointV2? To { get; set; }

    public double? LooseX { get; set; }

    public double? LooseY { get; set; }

    /// <summary>
    /// True for a backward edge (target column &lt; source column) that
    /// should route through the dedicated loop channel (Phase 4.6) instead
    /// of the general obstacle-aware router (Phase 4.5). Optional so
    /// existing edges don't need migration; an explicit flag lets an author
    /// force loop-style routing on an edge that isn't geometrically
    /// backward. Rete.js's Connection type has the same concept built in
    /// (isLoop), confirmed while spiking -- see docs/adr/0001-canvas-library-choice.md.
    /// </summary>
    public bool? IsLoop { get; set; }
}

public sealed class DiagramViewportV2
{
    public double PanX { get; set; } = 24;

    public double PanY { get; set; } = 18;

    public double Zoom { get; set; } = 1;
}

public sealed class DiagramAdaptiveModelPropertyDefinitionV2
{
    public string Name { get; set; } = string.Empty;

    public string Type { get; set; } = "string";

    public bool Required { get; set; }

    public string? DefaultValue { get; set; }

    public string? Description { get; set; }
}

public sealed class DiagramAdaptiveModelDefinitionV2
{
    public string Id { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string BaseType { get; set; } = "BaseCardModel";

    public List<DiagramAdaptiveModelPropertyDefinitionV2> Properties { get; set; } = [];
}

public sealed class DiagramAdaptiveCardFieldDefinitionV2
{
    public string Id { get; set; } = string.Empty;

    public string Label { get; set; } = string.Empty;

    public string InputType { get; set; } = "text";

    public string? Placeholder { get; set; }

    public bool Required { get; set; }
}

public sealed class DiagramAdaptiveCardDefinitionV2
{
    public string Id { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string BaseType { get; set; } = "AdaptiveFormCardLayout";

    public string ModelRef { get; set; } = string.Empty;

    public List<DiagramAdaptiveCardFieldDefinitionV2> Fields { get; set; } = [];
}

public sealed class DiagramDocumentV2
{
    public DiagramViewportV2 Viewport { get; set; } = new();

    public List<DiagramNodeV2> Nodes { get; set; } = [];

    public List<DiagramEdgeV2> Edges { get; set; } = [];

    public List<DiagramAdaptiveCardDefinitionV2> Cards { get; set; } = [];

    public List<DiagramAdaptiveModelDefinitionV2> Models { get; set; } = [];
}
