using System.Xml.Linq;
using Microsoft.AspNetCore.Components;

namespace ScriptEditor.Components.Pages;

public partial class Home
{
    private string _targetProjectFolderDraft = string.Empty;
    private string _targetProjectStatus = "Set a target project folder, then run verification.";
    private bool _isTargetProjectValid = true;
    private List<TargetProjectCheckItem> _targetProjectChecks = [];

    private sealed class TargetProjectCheckItem
    {
        public required string Code { get; init; }

        public required string Message { get; init; }

        public required string SeverityCss { get; init; }
    }

    private sealed class ProjectProbe
    {
        public required string Path { get; init; }

        public bool IsWebProject { get; init; }
    }

    private void PopulateTargetProjectDrafts()
    {
        _targetProjectFolderDraft = _workspace.TargetProjectFolder ?? string.Empty;
    }

    private void OnTargetProjectFolderInput(ChangeEventArgs args)
    {
        _targetProjectFolderDraft = args.Value?.ToString() ?? string.Empty;
        _workspace.TargetProjectFolder = _targetProjectFolderDraft;
    }

    private void UseCurrentWorkspaceFolder()
    {
        var currentFolder = Directory.GetCurrentDirectory();
        _targetProjectFolderDraft = currentFolder;
        _workspace.TargetProjectFolder = currentFolder;
        _isTargetProjectValid = true;
        _targetProjectStatus = $"Target project folder set to '{currentFolder}'.";
    }

    private Task VerifyConversaCoreWiringAsync()
    {
        _targetProjectChecks = [];

        var rawFolder = (_targetProjectFolderDraft ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(rawFolder))
        {
            AddTargetCheck("TARGET_FOLDER", "Set a project folder path before running verification.", "error");
            FinalizeTargetCheckStatus();
            return Task.CompletedTask;
        }

        string folderPath;
        try
        {
            folderPath = Path.GetFullPath(rawFolder);
        }
        catch (Exception ex)
        {
            AddTargetCheck("TARGET_FOLDER", $"Invalid folder path: {ex.Message}", "error");
            FinalizeTargetCheckStatus();
            return Task.CompletedTask;
        }

        if (!Directory.Exists(folderPath))
        {
            AddTargetCheck("TARGET_FOLDER", $"Folder does not exist: {folderPath}", "error");
            FinalizeTargetCheckStatus();
            return Task.CompletedTask;
        }

        _targetProjectFolderDraft = folderPath;
        _workspace.TargetProjectFolder = folderPath;
        AddTargetCheck("TARGET_FOLDER", $"Using folder: {folderPath}", "ok");

        var projectFiles = Directory.GetFiles(folderPath, "*.csproj", SearchOption.TopDirectoryOnly);
        if (projectFiles.Length == 0)
        {
            projectFiles = Directory.GetFiles(folderPath, "*.csproj", SearchOption.AllDirectories);
        }

        if (projectFiles.Length == 0)
        {
            AddTargetCheck("PROJECT_DISCOVERY", "No .csproj files were found in this folder.", "error");
            FinalizeTargetCheckStatus();
            return Task.CompletedTask;
        }

        var projectPath = ResolveTargetProjectPath(projectFiles);
        if (string.IsNullOrWhiteSpace(projectPath))
        {
            AddTargetCheck("PROJECT_DISCOVERY", "Unable to resolve a target .csproj file.", "error");
            FinalizeTargetCheckStatus();
            return Task.CompletedTask;
        }

        AddTargetCheck("PROJECT_FILE", $"Resolved project file: {projectPath}", "ok");
        VerifyConversaCoreReferences(projectPath);
        FinalizeTargetCheckStatus();
        return Task.CompletedTask;
    }

    private string ResolveTargetProjectPath(IEnumerable<string> projectFiles)
    {
        var probes = new List<ProjectProbe>();

        foreach (var path in projectFiles)
        {
            var isWeb = false;

            try
            {
                var project = XDocument.Load(path);
                var sdk = project.Root?.Attribute("Sdk")?.Value ?? string.Empty;
                isWeb = sdk.Contains("Microsoft.NET.Sdk.Web", StringComparison.OrdinalIgnoreCase);
            }
            catch
            {
                // Keep this as non-web if XML parsing fails.
            }

            probes.Add(new ProjectProbe
            {
                Path = path,
                IsWebProject = isWeb
            });
        }

        var orderedWebProjects = probes
            .Where(p => p.IsWebProject)
            .OrderBy(p => p.Path.Count(ch => ch == Path.DirectorySeparatorChar || ch == Path.AltDirectorySeparatorChar))
            .ThenBy(p => p.Path, StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (orderedWebProjects.Count == 1)
        {
            return orderedWebProjects[0].Path;
        }

        if (orderedWebProjects.Count > 1)
        {
            AddTargetCheck(
                "PROJECT_DISCOVERY",
                $"Found multiple web projects ({orderedWebProjects.Count}). Using '{orderedWebProjects[0].Path}'.",
                "warn");

            return orderedWebProjects[0].Path;
        }

        var orderedProjects = probes
            .OrderBy(p => p.Path.Count(ch => ch == Path.DirectorySeparatorChar || ch == Path.AltDirectorySeparatorChar))
            .ThenBy(p => p.Path, StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (orderedProjects.Count > 1)
        {
            AddTargetCheck(
                "PROJECT_DISCOVERY",
                $"Found multiple projects ({orderedProjects.Count}). No web SDK marker found; using '{orderedProjects[0].Path}'.",
                "warn");
        }

        return orderedProjects[0].Path;
    }

    private void VerifyConversaCoreReferences(string projectPath)
    {
        XDocument project;
        try
        {
            project = XDocument.Load(projectPath);
        }
        catch (Exception ex)
        {
            AddTargetCheck("PROJECT_PARSE", $"Could not read project file: {ex.Message}", "error");
            return;
        }

        var sdk = project.Root?.Attribute("Sdk")?.Value ?? string.Empty;
        if (sdk.Contains("Microsoft.NET.Sdk.Web", StringComparison.OrdinalIgnoreCase))
        {
            AddTargetCheck("PROJECT_SDK", "Project SDK is web (`Microsoft.NET.Sdk.Web`).", "ok");
        }
        else
        {
            AddTargetCheck("PROJECT_SDK", $"Project SDK is '{sdk}'. This may not be the target web app project.", "warn");
        }

        var projectReferences = project
            .Descendants()
            .Where(element => element.Name.LocalName == "ProjectReference")
            .Select(element => (element.Attribute("Include")?.Value ?? string.Empty).Trim())
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .ToList();

        var packageReferences = project
            .Descendants()
            .Where(element => element.Name.LocalName == "PackageReference")
            .Select(element => (element.Attribute("Include")?.Value ?? string.Empty).Trim())
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .ToList();

        var projectDirectory = Path.GetDirectoryName(projectPath) ?? string.Empty;
        var conversaProjectReferences = projectReferences
            .Where(IsConversaCoreReference)
            .Select(reference => new
            {
                Include = reference,
                ResolvedPath = ResolveRelativePath(projectDirectory, reference)
            })
            .ToList();

        var conversaPackageReferences = packageReferences
            .Where(IsConversaCoreReference)
            .ToList();

        if (conversaProjectReferences.Count == 0 && conversaPackageReferences.Count == 0)
        {
            AddTargetCheck(
                "CONVERSACORE_REFERENCE",
                "No ConversaCore reference found. Add either a ProjectReference to ConversaCore.csproj or a ConversaCore package reference.",
                "error");

            return;
        }

        foreach (var reference in conversaProjectReferences)
        {
            if (File.Exists(reference.ResolvedPath))
            {
                AddTargetCheck("CONVERSACORE_PROJECT_REF", $"ProjectReference OK: {reference.Include}", "ok");
            }
            else
            {
                AddTargetCheck(
                    "CONVERSACORE_PROJECT_REF",
                    $"ProjectReference is declared but missing on disk: {reference.Include} -> {reference.ResolvedPath}",
                    "error");
            }
        }

        foreach (var reference in conversaPackageReferences)
        {
            AddTargetCheck("CONVERSACORE_PACKAGE_REF", $"PackageReference detected: {reference}", "ok");
        }
    }

    private void FinalizeTargetCheckStatus()
    {
        var hasErrors = _targetProjectChecks.Any(check => string.Equals(check.SeverityCss, "error", StringComparison.Ordinal));
        _isTargetProjectValid = !hasErrors;

        _targetProjectStatus = hasErrors
            ? "Verification found wiring problems."
            : $"Verification completed successfully at {DateTime.Now:HH:mm:ss}.";
    }

    private void AddTargetCheck(string code, string message, string severityCss)
    {
        _targetProjectChecks.Add(new TargetProjectCheckItem
        {
            Code = code,
            Message = message,
            SeverityCss = severityCss
        });
    }

    private static bool IsConversaCoreReference(string reference)
    {
        return reference.Contains("ConversaCore", StringComparison.OrdinalIgnoreCase);
    }

    private static string ResolveRelativePath(string basePath, string relativePath)
    {
        if (Path.IsPathRooted(relativePath))
        {
            return Path.GetFullPath(relativePath);
        }

        return Path.GetFullPath(Path.Combine(basePath, relativePath));
    }
}
