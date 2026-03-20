using System.Text.Json;

namespace ScriptEditor.Models;

public sealed class EditorWorkspace
{
    public List<WorkspaceScript> Scripts { get; set; } = [];

    public string ActiveScriptId { get; set; } = string.Empty;

    public string TargetProjectFolder { get; set; } = string.Empty;
}

public sealed class WorkspaceScript
{
    public string Id { get; set; } = string.Empty;

    public DiagramDocument Document { get; set; } = new();
}

public static class EditorWorkspaceFactory
{
    public static EditorWorkspace CreateDefault()
    {
        return new EditorWorkspace
        {
            ActiveScriptId = "MainConversation",
            Scripts =
            [
                new WorkspaceScript
                {
                    Id = "MainConversation",
                    Document = DiagramDocumentFactory.CreateDefault()
                }
            ]
        };
    }

    public static DiagramDocument CreateEmptyScriptDocument()
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

    public static DiagramDocument CloneDocument(DiagramDocument document)
    {
        var json = JsonSerializer.Serialize(document);
        return JsonSerializer.Deserialize<DiagramDocument>(json) ?? new DiagramDocument();
    }

    public static string GenerateNextScriptId(IEnumerable<WorkspaceScript> scripts, string prefix = "Script")
    {
        var existingIds = new HashSet<string>(scripts.Select(static s => s.Id), StringComparer.OrdinalIgnoreCase);
        var counter = 1;

        while (existingIds.Contains($"{prefix}{counter}"))
        {
            counter++;
        }

        return $"{prefix}{counter}";
    }
}



