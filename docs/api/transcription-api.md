# Transcription API

Two endpoints, hosted from the existing `ScriptEditor.csproj` (extended, not a
new project — `Endpoints/TranscriptionEndpoints.cs`, wired in `Program.cs`).

`json-to-csharp` is real as of Phase 3.1 — `Transcription/JsonToCSharpTranscriber.cs`,
built with Roslyn `SyntaxFactory`. `csharp-to-json` is still the Phase 0.5
stub (hardcoded fixture, ignores the request body); real parsing is Phase 3.2.

Request/response DTOs are `Models/Schema/DiagramSchemaV2.cs`
(`docs/schema/diagram-schema-v2.md`).

## `POST /api/transcribe/json-to-csharp`

Request body: a `DiagramDocumentV2`. Real transcription
(`Transcription/JsonToCSharpTranscriber.cs`) — output depends on the actual
nodes/data sent.

```bash
curl -s -X POST http://localhost:5000/api/transcribe/json-to-csharp \
  -H "Content-Type: application/json" \
  -d '{
    "viewport": { "panX": 0, "panY": 0, "zoom": 1 },
    "nodes": [
      { "id": "n1", "type": "SimpleActivity", "name": "Welcome", "x": 0, "y": 0,
        "data": { "message": "Hi there!" }, "ports": [], "context": { "reads": [], "writes": [] } },
      { "id": "n2", "type": "DelayActivity", "name": "Pause1", "x": 260, "y": 0,
        "data": { "durationSec": "2", "showTyping": "true" }, "ports": [], "context": { "reads": [], "writes": [] } },
      { "id": "n3", "type": "EndActivity", "x": 520, "y": 0,
        "data": {}, "ports": [], "context": { "reads": [], "writes": [] } }
    ],
    "edges": [], "cards": [], "models": []
  }'
```

Response `200 OK` (actual, verified via a live curl round-trip against `dotnet run`,
and the generated class shape/statements were separately compiled and
confirmed to build with 0 errors against the real local Activity classes —
see the "Compilability" section below):

```json
{"cSharp":"public partial class MainConversation : TopicFlow\n{\n    public MainConversation(TopicWorkflowContext context, ILogger logger) : base(context, logger, \"MainConversation\")\n    {\n        BuildWorkflow();\n    }\n\n    private void BuildWorkflow()\n    {\n        Add(new SimpleActivity(\"Welcome\", \"Hi there!\"));\n        Add(new DelayActivity(\"Pause1\", TimeSpan.FromSeconds(2)) { ShowTypingIndicator = true });\n        Add(new EndActivity(\"n5\"));\n    }\n}\n"}
```

### Compilability

Only four activity types get real, verified-compilable generation:
`SimpleActivity`, `EndActivity`, `DelayActivity`, `TriggerTopicActivity` —
these were checked against their actual constructors/properties in
`Activities/*.cs`, and the exact generated shape was separately compiled
(as a real subclass, not just inspected) with 0 errors.

Every other activity type (including two of the six prototype-seeded types,
`PromptActivity` and `QuickAnswerActivity`, plus `AdaptiveCardActivity`) uses
a best-effort generic fallback that is **not guaranteed to compile** — those
three specifically need constructor-injected framework dependencies
(a live `Kernel`, a `TopicWorkflowContext`, a typed `ILogger<T>`, and for
`AdaptiveCardActivity` also compile-time generic type arguments and a
card-factory lambda) that have no literal representation anywhere in
`DiagramNodeV2`. The generated code marks every such statement with a
`// best-effort: ... this may not compile` comment rather than presenting it
as equivalent to the four verified types. Fixing this for real needs a
per-activity constructor/property catalog (`CONCEPT_OF_OPERATIONS.md` §4.3's
"Dynamic ConversaCore Reflection Catalog") — out of scope for this task.

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
