using System.Text.Json.Serialization;
using Microsoft.JSInterop;

namespace ScriptEditor.Components.Pages;

public partial class Home
{
    private DndDebugSnapshot _dndDebug = new();
    private bool _isDndDebugValid = true;
    private string _dndDebugStatus = "No drag/drop diagnostics captured yet.";

    private sealed class DndDebugSnapshot
    {
        [JsonPropertyName("sessionStartedAt")]
        public string SessionStartedAt { get; set; } = string.Empty;

        [JsonPropertyName("lastUpdatedAt")]
        public string LastUpdatedAt { get; set; } = string.Empty;

        [JsonPropertyName("initStartedAt")]
        public string InitStartedAt { get; set; } = string.Empty;

        [JsonPropertyName("initReadyAt")]
        public string InitReadyAt { get; set; } = string.Empty;

        [JsonPropertyName("initElapsedMs")]
        public int? InitElapsedMs { get; set; }

        [JsonPropertyName("initStartAt")]
        public string InitStartAt { get; set; } = string.Empty;

        [JsonPropertyName("initParseDoneAt")]
        public string InitParseDoneAt { get; set; } = string.Empty;

        [JsonPropertyName("initParseElapsedMs")]
        public int? InitParseElapsedMs { get; set; }

        [JsonPropertyName("initListenersReadyAt")]
        public string InitListenersReadyAt { get; set; } = string.Empty;

        [JsonPropertyName("initListenersElapsedMs")]
        public int? InitListenersElapsedMs { get; set; }

        [JsonPropertyName("blazorAfterRenderAt")]
        public string BlazorAfterRenderAt { get; set; } = string.Empty;

        [JsonPropertyName("beforeInitializeAt")]
        public string BeforeInitializeAt { get; set; } = string.Empty;

        [JsonPropertyName("afterInitializeInvokeAt")]
        public string AfterInitializeInvokeAt { get; set; } = string.Empty;

        [JsonPropertyName("restoreStartedAt")]
        public string RestoreStartedAt { get; set; } = string.Empty;

        [JsonPropertyName("restoreDoneAt")]
        public string RestoreDoneAt { get; set; } = string.Empty;

        [JsonPropertyName("restoreElapsedMs")]
        public int? RestoreElapsedMs { get; set; }

        [JsonPropertyName("pointerDownCount")]
        public int PointerDownCount { get; set; }

        [JsonPropertyName("dragStartCount")]
        public int DragStartCount { get; set; }

        [JsonPropertyName("dragEnterCount")]
        public int DragEnterCount { get; set; }

        [JsonPropertyName("dragOverCount")]
        public int DragOverCount { get; set; }

        [JsonPropertyName("dropCount")]
        public int DropCount { get; set; }

        [JsonPropertyName("dropAcceptedCount")]
        public int DropAcceptedCount { get; set; }

        [JsonPropertyName("dropRejectedMissingTemplateCount")]
        public int DropRejectedMissingTemplateCount { get; set; }

        [JsonPropertyName("dropRejectedUnknownTemplateCount")]
        public int DropRejectedUnknownTemplateCount { get; set; }

        [JsonPropertyName("dragEndCount")]
        public int DragEndCount { get; set; }

        [JsonPropertyName("lastTemplate")]
        public string LastTemplate { get; set; } = string.Empty;

        [JsonPropertyName("recentEvents")]
        public List<DndDebugEvent> RecentEvents { get; set; } = [];
    }

    private sealed class DndDebugEvent
    {
        [JsonPropertyName("at")]
        public string At { get; set; } = string.Empty;

        [JsonPropertyName("type")]
        public string Type { get; set; } = string.Empty;

        [JsonPropertyName("detail")]
        public string Detail { get; set; } = string.Empty;
    }

    private async Task RefreshDndDiagnosticsAsync(bool silent = false)
    {
        if (!_editorInitialized)
        {
            if (!silent)
            {
                _isDndDebugValid = false;
                _dndDebugStatus = "Editor is still initializing; diagnostics are not available yet.";
            }

            return;
        }

        try
        {
            var snapshot = await JS.InvokeAsync<DndDebugSnapshot?>("scriptEditor.getDndDebugStats", _editorRoot);
            if (snapshot is null)
            {
                _isDndDebugValid = false;
                _dndDebugStatus = "Diagnostics are unavailable in the browser context.";
                return;
            }

            snapshot.RecentEvents ??= [];
            _dndDebug = snapshot;
            _isDndDebugValid = true;

            if (!silent)
            {
                _dndDebugStatus = $"Diagnostics refreshed at {DateTime.Now:HH:mm:ss}.";
            }
        }
        catch (Exception ex)
        {
            _isDndDebugValid = false;
            _dndDebugStatus = $"Diagnostics refresh failed: {ex.Message}";
        }
    }

    private async Task ResetDndDiagnosticsAsync()
    {
        if (!_editorInitialized)
        {
            _isDndDebugValid = false;
            _dndDebugStatus = "Editor is still initializing; diagnostics are not available yet.";
            return;
        }

        try
        {
            var reset = await JS.InvokeAsync<bool>("scriptEditor.resetDndDebugStats", _editorRoot);
            if (!reset)
            {
                _isDndDebugValid = false;
                _dndDebugStatus = "Diagnostics reset is unavailable in the browser context.";
                return;
            }

            await RefreshDndDiagnosticsAsync(silent: true);
            _isDndDebugValid = true;
            _dndDebugStatus = $"Diagnostics reset at {DateTime.Now:HH:mm:ss}.";
        }
        catch (Exception ex)
        {
            _isDndDebugValid = false;
            _dndDebugStatus = $"Diagnostics reset failed: {ex.Message}";
        }
    }
}
