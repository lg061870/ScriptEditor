using System.Text.Json;
using ScriptEditor.Models.Schema;
using ScriptEditor.Transcription;

namespace ScriptEditor.Endpoints;

public sealed record ProjectTopicItem(
    string Id,
    string Name,
    DiagramDocumentV2 Document,
    bool IsInitial = false,
    bool IsDirty = false
);

public sealed record ProjectSaveRequest(
    string ProjectPath,
    List<ProjectTopicItem> Topics,
    bool SaveInSubfolders = true
);

public sealed record ProjectSaveResponse(
    bool Success,
    int SavedCount,
    List<string> SavedFiles,
    string Message
);

public sealed record ProjectLoadRequest(
    string ProjectPath
);

public sealed record ProjectLoadResponse(
    bool Success,
    List<ProjectTopicItem> Topics,
    string? ActiveTopicId,
    string Message
);

public sealed record ProjectStatusResponse(
    bool Exists,
    string Path,
    int FlowJsonCount,
    int CSharpCount,
    List<string> DiscoveredTopics,
    string? Error = null
);

public static class ProjectEndpoints
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public static void MapProjectEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/project");

        group.MapGet("/status", (string path) =>
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                return Results.BadRequest(new ProjectStatusResponse(false, "", 0, 0, [], "Path cannot be empty."));
            }

            try
            {
                var fullPath = Path.GetFullPath(path);
                if (!Directory.Exists(fullPath))
                {
                    return Results.Ok(new ProjectStatusResponse(false, fullPath, 0, 0, []));
                }

                var flowFiles = Directory.GetFiles(fullPath, "*.flow.json", SearchOption.AllDirectories);
                var csFiles = Directory.GetFiles(fullPath, "*Topic.cs", SearchOption.AllDirectories)
                    .Concat(Directory.GetFiles(fullPath, "*Conversation.cs", SearchOption.AllDirectories))
                    .Distinct()
                    .ToArray();

                var topics = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (var f in flowFiles)
                {
                    var name = Path.GetFileNameWithoutExtension(Path.GetFileNameWithoutExtension(f));
                    if (!string.IsNullOrEmpty(name)) topics.Add(name);
                }
                foreach (var cs in csFiles)
                {
                    var name = Path.GetFileNameWithoutExtension(cs);
                    if (!string.IsNullOrEmpty(name)) topics.Add(name);
                }

                return Results.Ok(new ProjectStatusResponse(
                    true,
                    fullPath,
                    flowFiles.Length,
                    csFiles.Length,
                    topics.OrderBy(t => t).ToList()
                ));
            }
            catch (Exception ex)
            {
                return Results.Ok(new ProjectStatusResponse(false, path, 0, 0, [], ex.Message));
            }
        })
        .WithName("GetProjectStatus");

        group.MapPost("/save", (ProjectSaveRequest request) =>
        {
            if (string.IsNullOrWhiteSpace(request.ProjectPath))
            {
                return Results.BadRequest(new ProjectSaveResponse(false, 0, [], "ProjectPath is required."));
            }

            try
            {
                var fullPath = Path.GetFullPath(request.ProjectPath);
                Directory.CreateDirectory(fullPath);

                var writtenFiles = new List<string>();

                foreach (var topic in request.Topics)
                {
                    var topicName = !string.IsNullOrWhiteSpace(topic.Name) ? topic.Name.Trim() : topic.Id.Trim();
                    if (string.IsNullOrEmpty(topicName)) continue;

                    // Check if subfolder exists or should be used
                    string targetFolder;
                    var subfolder = Path.Combine(fullPath, topicName);
                    if (request.SaveInSubfolders || Directory.Exists(subfolder))
                    {
                        Directory.CreateDirectory(subfolder);
                        targetFolder = subfolder;
                    }
                    else
                    {
                        targetFolder = fullPath;
                    }

                    // 1. Transcribe and save C# file
                    var csCode = JsonToCSharpTranscriber.Transcribe(topic.Document, topicName);
                    var csPath = Path.Combine(targetFolder, $"{topicName}.cs");
                    File.WriteAllText(csPath, csCode);
                    writtenFiles.Add(csPath);

                    // 2. Save companion .flow.json
                    var jsonContent = JsonSerializer.Serialize(topic.Document, JsonOptions);
                    var jsonPath = Path.Combine(targetFolder, $"{topicName}.flow.json");
                    File.WriteAllText(jsonPath, jsonContent);
                    writtenFiles.Add(jsonPath);
                }

                return Results.Ok(new ProjectSaveResponse(
                    true,
                    request.Topics.Count,
                    writtenFiles,
                    $"Successfully saved {request.Topics.Count} topic(s) to '{fullPath}'."
                ));
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new ProjectSaveResponse(false, 0, [], $"Save error: {ex.Message}"));
            }
        })
        .WithName("SaveProject");

        group.MapPost("/load", (ProjectLoadRequest request) =>
        {
            if (string.IsNullOrWhiteSpace(request.ProjectPath))
            {
                return Results.BadRequest(new ProjectLoadResponse(false, [], null, "ProjectPath is required."));
            }

            try
            {
                var fullPath = Path.GetFullPath(request.ProjectPath);
                if (!Directory.Exists(fullPath))
                {
                    return Results.BadRequest(new ProjectLoadResponse(false, [], null, $"Directory '{fullPath}' not found."));
                }

                var loadedTopics = new List<ProjectTopicItem>();
                var seenTopicNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                // 1. First look for .flow.json files (preferred: preserves node positions and viewport)
                var flowFiles = Directory.GetFiles(fullPath, "*.flow.json", SearchOption.AllDirectories);
                foreach (var flowPath in flowFiles)
                {
                    try
                    {
                        var rawJson = File.ReadAllText(flowPath);
                        var doc = JsonSerializer.Deserialize<DiagramDocumentV2>(rawJson, JsonOptions);
                        if (doc != null)
                        {
                            var fileName = Path.GetFileNameWithoutExtension(Path.GetFileNameWithoutExtension(flowPath));
                            var topicId = fileName;
                            seenTopicNames.Add(topicId);
                            loadedTopics.Add(new ProjectTopicItem(
                                topicId,
                                topicId,
                                doc,
                                IsInitial: loadedTopics.Count == 0,
                                IsDirty: false
                            ));
                        }
                    }
                    catch
                    {
                        // Ignore individual file parse errors and continue
                    }
                }

                // 2. Look for any .cs topic files that don't yet have a .flow.json
                var csFiles = Directory.GetFiles(fullPath, "*.cs", SearchOption.AllDirectories);
                foreach (var csPath in csFiles)
                {
                    var baseName = Path.GetFileNameWithoutExtension(csPath);
                    if (seenTopicNames.Contains(baseName)) continue;
                    // Skip card models, cards, designer files
                    if (baseName.EndsWith("Card", StringComparison.OrdinalIgnoreCase) ||
                        baseName.EndsWith("Model", StringComparison.OrdinalIgnoreCase) ||
                        baseName.EndsWith("Context", StringComparison.OrdinalIgnoreCase) ||
                        baseName.StartsWith("I", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    try
                    {
                        var csCode = File.ReadAllText(csPath);
                        // Check if it inherits from TopicFlow or ConversationTopic
                        if (csCode.Contains(": TopicFlow") || csCode.Contains(": ConversationTopic") || csCode.Contains("TopicFlowActivity"))
                        {
                            var doc = CSharpToJsonParser.Parse(csCode);
                            seenTopicNames.Add(baseName);
                            loadedTopics.Add(new ProjectTopicItem(
                                baseName,
                                baseName,
                                doc,
                                IsInitial: loadedTopics.Count == 0,
                                IsDirty: false
                            ));
                        }
                    }
                    catch
                    {
                        // Ignore parse errors on arbitrary CS files
                    }
                }

                if (loadedTopics.Count == 0)
                {
                    return Results.Ok(new ProjectLoadResponse(
                        true,
                        [],
                        null,
                        $"No topic files found in '{fullPath}'."
                    ));
                }

                var initialTopic = loadedTopics.FirstOrDefault(t => t.IsInitial) ?? loadedTopics[0];
                return Results.Ok(new ProjectLoadResponse(
                    true,
                    loadedTopics,
                    initialTopic.Id,
                    $"Loaded {loadedTopics.Count} topic(s) from '{fullPath}'."
                ));
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new ProjectLoadResponse(false, [], null, $"Load error: {ex.Message}"));
            }
        })
        .WithName("LoadProject");
    }
}
