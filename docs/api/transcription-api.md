# Transcription API (Phase 0.5 stub)

Two endpoints, hosted from the existing `ScriptEditor.csproj` (extended, not a
new project — `Endpoints/TranscriptionEndpoints.cs`, wired in `Program.cs`).
Both currently return a **hardcoded fixture**, ignoring the request body's
actual content — this phase only proves the route/DTO shape exists. Real
Roslyn-backed logic lands in Phase 3.1 (`json-to-csharp`) and Phase 3.2
(`csharp-to-json`).

Request/response DTOs are `Models/Schema/DiagramSchemaV2.cs`
(`docs/schema/diagram-schema-v2.md`).

## `POST /api/transcribe/json-to-csharp`

Request body: a `DiagramDocumentV2` (the actual content is ignored by the
stub — any valid JSON matching the shape is accepted).

```bash
curl -s -X POST http://localhost:5000/api/transcribe/json-to-csharp \
  -H "Content-Type: application/json" \
  -d '{
    "viewport": { "panX": 24, "panY": 18, "zoom": 1 },
    "nodes": [
      { "id": "n1", "type": "SimpleActivity", "x": 0, "y": 0,
        "data": {}, "ports": [], "context": { "reads": [], "writes": [] } }
    ],
    "edges": [],
    "cards": [],
    "models": []
  }'
```

Response `200 OK`:

```json
{
  "cSharp": "public partial class MainConversation : TopicFlow\n{\n    protected override void BuildWorkflow()\n    {\n        Add(new SimpleActivity(\"greet\"));\n        Add(new EndActivity());\n    }\n}\n"
}
```

## `POST /api/transcribe/csharp-to-json`

Request body: `{ "code": "<C# source text>" }` (the actual text is ignored by
the stub).

```bash
curl -s -X POST http://localhost:5000/api/transcribe/csharp-to-json \
  -H "Content-Type: application/json" \
  -d '{ "code": "public partial class MainConversation : TopicFlow { }" }'
```

Response `200 OK`: a fixture `DiagramDocumentV2` — a two-node
`SimpleActivity → EndActivity` graph:

```json
{
  "viewport": { "panX": 24, "panY": 18, "zoom": 1 },
  "nodes": [
    {
      "id": "n1", "type": "SimpleActivity", "name": "greet",
      "collapsed": false, "x": 0, "y": 0, "data": {},
      "ports": [
        { "id": "n1-in", "name": "Input", "direction": "input", "role": "main", "type": "flow", "position": "left" },
        { "id": "n1-out", "name": "Output", "direction": "output", "role": "main", "type": "flow", "position": "right" }
      ],
      "context": { "reads": [], "writes": [] }
    },
    {
      "id": "n2", "type": "EndActivity",
      "collapsed": false, "x": 260, "y": 0, "data": {},
      "ports": [
        { "id": "n2-in", "name": "Input", "direction": "input", "role": "main", "type": "flow", "position": "left" }
      ],
      "context": { "reads": [], "writes": [] }
    }
  ],
  "edges": [
    { "id": "e1", "from": { "node": "n1", "port": "n1-out" }, "to": { "node": "n2", "port": "n2-in" } }
  ],
  "cards": [],
  "models": []
}
```

(Actual JSON key casing depends on `System.Text.Json`'s default camelCase
policy — verify against a real run once built; not confirmed in this
session, see below.)

## Not yet verified

No .NET SDK was available in the sandbox this was written in (network policy
blocked the SDK download from `builds.dotnet.microsoft.com`), so none of
`Endpoints/TranscriptionEndpoints.cs`, the `Program.cs` wiring, or the exact
request/response payloads above have been compiled or run. Before relying on
this:

```bash
dotnet build
dotnet run
# then re-run the curl commands above against the printed local URL
```
