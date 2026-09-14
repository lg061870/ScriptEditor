# Diagram JSON SSOT schema v2 (Phase 0.3)

Draft schema for the new canvas app. Not wired in anywhere yet — v1
(`Models/DiagramDocument.cs`) still backs the old `wwwroot/editor.js` canvas
untouched, per the roadmap's global constraint. This draft becomes load-bearing
starting Phase 1.1 (canvas renders a hardcoded fixture matching this schema)
and Phase 0.5 (the transcription API stub endpoints below already reference it).

**Files:**
- `canvas-app/src/schema/diagram.ts` — TypeScript types, frontend-facing.
- `Models/Schema/DiagramSchemaV2.cs` — C# DTOs, API-facing.

The two are kept field-for-field identical (same names, camelCase on the wire
via `System.Text.Json`'s default policy) so there's no translation layer
between the canvas and the transcription API.

## What changed from v1

Structurally, almost nothing — `DiagramDocument` → `DiagramNode` → `DiagramPort`
/ `DiagramEdge` is the same shape as `Models/DiagramDocument.cs`. Two additions:

1. **`DiagramPort.role`** (new, required, one of `main` / `exception` /
   `control` / `aux-config`). v1 has no such field — the current canvas infers
   a port's kind by substring-matching its `Name` (e.g. a port literally named
   `"Exception"` is treated as an exception port). That's the mechanism this
   schema replaces, per the roadmap's Phase 4.1 and the governing note in
   `docs/n8n-feature-gap-analysis.md` §3: *"kind (like Exception/Control) is
   inferred by substring-matching, not a real field."* v2 makes it a real,
   always-set field. `direction` and `type` are unchanged — they already
   worked correctly (`wwwroot/editor.js:1071-1078`) and gate connection
   legality exactly as before.

2. **`DiagramEdge.isLoop`** (new, optional). Not in the original roadmap text
   for 0.3, but added as a direct result of the Phase 0.1 spike: Rete.js's
   `Connection` type ships a built-in `isLoop` flag (see
   `docs/adr/0001-canvas-library-choice.md`), and Phase 4.6 needs *some* way
   to route a "loop" edge through a dedicated channel — geometric inference
   (target column < source column) alone can't cover every case an author
   might want routed that way. Optional so it costs nothing until Phase 4.6
   uses it.

Nothing else changes. In particular, the schema does **not** need a new shape
to support dynamic per-case ports (Phase 4.4) — `DiagramNode.ports` is already
a plain list sized per node instance, not a fixed per-type template. What
Phase 4.4 changes is population logic (`SwitchActivity` etc. must generate one
`main`-role output port per case instead of one generic `Output` port), not
this schema.

## Port coverage check against `docs/activity-shapes.md`

Every one of the 36 shapes' port tables was checked (`grep -A6 '| Port |
Direction |'` across the whole catalog). The complete, exhaustive set of
port names/directions used across all 36 shapes is:

| Port name | Direction | → v2 role |
|---|---|---|
| Input | input | `main` |
| Output | output | `main` |
| Exception | output | `exception` |
| Control | output | `control` |
| Card (AdaptiveCardActivity only) | input | `aux-config` |
| Model (AdaptiveCardActivity only) | input | `aux-config` |

No shape uses any port name outside this set. The four-value `DiagramPortRole`
enum is therefore a complete, closed mapping for the current catalog — no
shape needs a fifth role, and `aux-config` is deliberately named generically
(not `card-config`) so the next non-flow input a future shape needs doesn't
require a schema change, only a new port instance with `role: aux-config`.

## Example: `SwitchActivity` under the v2 schema (post-Phase-4.4 population)

```json
{
  "id": "n1",
  "type": "SwitchActivity",
  "x": 0, "y": 0,
  "data": { "cases": "[\"Case A\",\"Case B\",\"Case C\"]" },
  "ports": [
    { "id": "n1-in", "name": "Input", "direction": "input", "role": "main", "type": "flow", "position": "left" },
    { "id": "n1-case-0", "name": "Case A", "direction": "output", "role": "main", "type": "flow", "position": "right" },
    { "id": "n1-case-1", "name": "Case B", "direction": "output", "role": "main", "type": "flow", "position": "right" },
    { "id": "n1-case-2", "name": "Case C", "direction": "output", "role": "main", "type": "flow", "position": "right" },
    { "id": "n1-exc", "name": "Exception", "direction": "output", "role": "exception", "type": "flow", "position": "right" }
  ],
  "context": { "reads": [], "writes": [] }
}
```

(Today's v1 model instead has a single generic `Output` port for all three
cases — this is exactly gap #4 in `docs/n8n-feature-gap-analysis.md`, fixed
structurally by v2 + Phase 4.4's population logic, not by this doc alone.)

## Verification

Both halves are now confirmed, not just drafted:

- `canvas-app/src/schema/diagram.ts` type-checks cleanly (`npx tsc --noEmit`).
- `Models/Schema/DiagramSchemaV2.cs` compiles (`dotnet build`, 0 errors) and
  was exercised live through the Phase 0.5 stub API
  (`docs/api/transcription-api.md`).

One real bug was caught by that live test and is already fixed: the first
version used `[JsonConverter(typeof(JsonStringEnumConverter<T>))]` with no
naming policy, which serializes enum members in their C# PascalCase spelling
(`"role":"Main"`, `"direction":"Input"`, `"position":"Left"`) — not the
lowercase/kebab-case values this doc and the TS types declare
(`"main"`, `"input"`, `"left"`, and critically `"aux-config"`, which no
built-in naming policy produces from `AuxConfig`). Fixed by adding
`[JsonStringEnumMemberName("...")]` (new in .NET 9) to every enum member,
pinning the exact wire string. Re-verified via a live curl round-trip — see
`docs/api/transcription-api.md` for the actual (not hypothetical) response
body.
