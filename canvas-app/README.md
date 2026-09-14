# canvas-app

Standalone frontend for the ScriptEditor n8n-style diagram editor. Replaces
`wwwroot/editor.js` + `Home.razor` as the canvas surface (see
`../docs/superpowers/plans/2026-09-12-n8n-canvas-rewrite.md` for the full
roadmap). This is a plain Vite + React + TypeScript app — no dependency on
the ASP.NET Core / Blazor host beyond calling its transcription API
(`../` project, Phase 0.5) over HTTP.

Canvas library: [React Flow](https://reactflow.dev/) (`@xyflow/react`),
chosen over Rete.js per `../docs/adr/0001-canvas-library-choice.md`.

## Running

```bash
npm install
npm run dev
```

Opens a blank React Flow canvas (pan/zoom/background grid/controls/minimap)
at the printed local URL. No nodes or edges yet — this is the Phase 0.2
scaffold; the actual diagram schema (Phase 0.3), palette, and node/edge
components land in Phase 1.

## Type-checking

```bash
npx tsc --noEmit -p tsconfig.app.json
```

## Relationship to the rest of the repo

- `../docs/n8n-feature-gap-analysis.md` — why the old canvas was replaced.
- `../docs/CONCEPT_OF_OPERATIONS.md` — the JSON-single-source-of-truth
  architecture this app must implement (canvas and code are both passive
  projections of one JSON document; see the Origin-token sync protocol in
  `../docs/adr/0002-origin-token-sync-protocol.md`).
- `../docs/activity-shapes.md` — the 36-shape catalog this canvas must
  eventually support at full parity (Phase 5).
- `../spike/reactflow-demo/`, `../spike/rete-demo/` — throwaway Phase 0.1
  spike code that informed the library choice; not a dependency of this
  app, safe to delete once this app is underway.
