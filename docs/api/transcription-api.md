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

Response `200 OK` (actual, verified via a live curl round-trip against `dotnet run`):

```json
{"cSharp":"public partial class MainConversation : TopicFlow\n{\n    protected override void BuildWorkflow()\n    {\n        Add(new SimpleActivity(\"greet\"));\n        Add(new EndActivity());\n    }\n}"}
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
`SimpleActivity → EndActivity` graph. This is the **actual response body**,
captured from a live curl round-trip against `dotnet run` (not a
hypothetical example):

```json
{"viewport":{"panX":24,"panY":18,"zoom":1},"nodes":[{"id":"n1","type":"SimpleActivity","name":"greet","collapsed":false,"x":0,"y":0,"width":null,"height":null,"data":{},"ports":[{"id":"n1-in","name":"Input","direction":"input","role":"main","type":"flow","position":"left"},{"id":"n1-out","name":"Output","direction":"output","role":"main","type":"flow","position":"right"}],"context":{"reads":[],"writes":[]}},{"id":"n2","type":"EndActivity","name":null,"collapsed":false,"x":260,"y":0,"width":null,"height":null,"data":{},"ports":[{"id":"n2-in","name":"Input","direction":"input","role":"main","type":"flow","position":"left"}],"context":{"reads":[],"writes":[]}}],"edges":[{"id":"e1","from":{"node":"n1","port":"n1-out"},"to":{"node":"n2","port":"n2-in"},"looseX":null,"looseY":null,"isLoop":null}],"cards":[],"models":[]}
```

## Verification

Compiled and run for real (.NET 9 SDK, `dotnet build` then `dotnet run`), and
both endpoints curl-tested live — the response bodies above are the actual
output, not hand-written examples. One bug was caught this way and fixed:
the first version of `Models/Schema/DiagramSchemaV2.cs` serialized enums in
PascalCase (`"role":"Main"`) instead of the documented lowercase/kebab-case
(`"role":"main"`); see `docs/schema/diagram-schema-v2.md` for the fix.

Building this required `InsuranceSemanticV2` (the sibling repo providing
`ConversaCore`, which `ScriptEditor.sln` references) to be present at
`../InsuranceSemanticV2` next to this repo — without it, the whole project
fails to build with hundreds of unrelated `CS0246` errors from the existing
`Activities/*.cs` files, since none of the code in this PR touches or depends
on that.
