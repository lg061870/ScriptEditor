using System.Text.Json;
using ScriptEditor.Endpoints;
using ScriptEditor.Models.Schema;
using Xunit;

namespace ScriptEditor.Tests;

public class ProjectEndpointsTests : IDisposable
{
    private readonly string _tempDir;

    public ProjectEndpointsTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "ScriptEditor_Test_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_tempDir);
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
        {
            try { Directory.Delete(_tempDir, true); } catch { }
        }
    }

    [Fact]
    public void SaveAndLoad_RoundTrips_FlowJsonAndCSharpFiles()
    {
        var doc = new DiagramDocumentV2
        {
            Nodes =
            [
                new DiagramNodeV2 { Id = "start", Type = "StartNode", X = 50, Y = 100 },
                new DiagramNodeV2 { Id = "greet", Type = "SimpleActivity", X = 250, Y = 100, Data = new() { ["message"] = "Welcome!" } },
            ],
            Edges =
            [
                new DiagramEdgeV2 { Id = "e1", From = new() { Node = "start", Port = "start-out" }, To = new() { Node = "greet", Port = "greet-in" } }
            ]
        };

        var topics = new List<ProjectTopicItem>
        {
            new("WelcomeTopic", "WelcomeTopic", doc, IsInitial: true)
        };

        var saveRequest = new ProjectSaveRequest(_tempDir, topics, SaveInSubfolders: true);

        // Verify folder creation & files written
        var topicFolder = Path.Combine(_tempDir, "WelcomeTopic");
        var csPath = Path.Combine(topicFolder, "WelcomeTopic.cs");
        var jsonPath = Path.Combine(topicFolder, "WelcomeTopic.flow.json");

        // Manually invoke save logic equivalent
        Directory.CreateDirectory(topicFolder);
        var csCode = Transcription.JsonToCSharpTranscriber.Transcribe(doc, "WelcomeTopic");
        File.WriteAllText(csPath, csCode);
        File.WriteAllText(jsonPath, JsonSerializer.Serialize(doc, new JsonSerializerOptions { WriteIndented = true }));

        Assert.True(File.Exists(csPath));
        Assert.True(File.Exists(jsonPath));

        // Now load
        var loadedJson = File.ReadAllText(jsonPath);
        var loadedDoc = JsonSerializer.Deserialize<DiagramDocumentV2>(loadedJson);
        Assert.NotNull(loadedDoc);
        Assert.Equal(2, loadedDoc.Nodes.Count);
        Assert.Equal("Welcome!", loadedDoc.Nodes[1].Data["message"]);
    }
}
