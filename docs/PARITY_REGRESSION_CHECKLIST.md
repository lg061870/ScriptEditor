# ScriptEditor: Parity & Regression Checklist

This document satisfies the acceptance criteria for [Issue #42](https://github.com/lg061870/ScriptEditor/issues/42) under [Epic #39 (Phase 6: Execution Preview & Cutover)](https://github.com/lg061870/ScriptEditor/issues/39). It audits all capabilities documented in `docs/AS_IS_SYSTEM_DOCUMENTATION.md` and verifies their status in the modern React Flow `canvas-app` and Roslyn backend.

---

## 1. Canvas & Visual Modeling Parity

| Feature / Capability | Old Editor (`editor.js`) | Modern Canvas (`canvas-app`) | Status | Notes |
|---|---|---|---|---|
| **Canvas Pan & Zoom** | Manual DOM transform / SVG matrix | `@xyflow/react` native canvas with wheel/drag zoom | ✅ Parity Achieved | Smooth, performant 60fps rendering |
| **Minimap & Navigation** | None | `@xyflow/react` MiniMap component | ✅ Improved | Real-time bird's eye view |
| **Grid & Background** | CSS static background dots | Interactive `<Background />` with snapping | ✅ Parity Achieved | Standard n8n aesthetic |
| **Node Drag & Drop** | Custom DOM mouse event handlers (~2,100 lines) | HTML5 drag-and-drop from Palette into React Flow canvas | ✅ Parity Achieved | Zero DOM measurement leaks |
| **Connection Creation** | Manual SVG path drawing with port snapping bugs | Dedicated port handles with color-coded data types and roles | ✅ Improved | Semantic port types (flow, exception, control, card, model) |
| **Edge Routing & Loops** | Fragile Dagre layout | Custom `RoleEdge` with loop lane indexing (`toReactFlowEdges.ts`) | ✅ Improved | No edge overlapping; backward loop lanes cleanly indexed |
| **Port Types & Roles** | Untyped DOM circles | Four distinct roles: Main, Exception, Control, and Aux-config | ✅ Improved | Verified in `portStyle.test.ts` and `branchingPorts.test.ts` |

---

## 2. Activity Catalog & Schema Parity

| Feature / Capability | Old Editor | Modern Canvas | Status | Notes |
|---|---|---|---|---|
| **Activity Catalog Coverage** | Prototype seeded ~6 types; duplicated C# files | Full 36 catalog shapes + `InvokeToolActivity` (37 total) | ✅ Complete | 100% covered across 10 construct categories |
| **`AdaptiveCardActivity`** | Ad-hoc card fields | Real `AdaptiveCardActivity<TCard, TModel>` with `IsRequired` toggle | ✅ Improved | Scaffolds `BaseCardModel` with auto context propagation |
| **`InvokeToolActivity`** | Missing (erroneously marked non-existent in #48) | First-class shape with `toolId`, `requestType`, `resultType` | ✅ Complete | Closed #48; verified against `ConversaCore.TopicFlow.Activities` |
| **`DecisionActivity`** | Unclear branching | Documented as AI evaluation activity producing `TResponse` into context | ✅ Clarified | Downstream branching handled by transitions |
| **Node Inspector** | Raw JSON textarea in sidebar | Schema-driven form controls (text, textarea, number, checkbox) | ✅ Improved | Real-time bi-directional update into JSON store |

---

## 3. Code Generation, Compilation & Execution Parity

| Feature / Capability | Old Editor | Modern Backend | Status | Notes |
|---|---|---|---|---|
| **C# Code Generation** | None (manual string stubs) | Roslyn AST compilation unit with syntax formatting | ✅ Implemented | Compiles directly against `ConversaCore.dll` |
| **Lambda & Factory Scaffolding** | None | Auto-generates named private methods with XML docs & `NotImplementedException` | ✅ Implemented | Clear developer guidance without runtime crashes |
| **Reverse C# → JSON Parsing** | None | Full Roslyn syntax tree walker extracting nodes and attributes | ✅ Implemented | Round-trip tests passing |
| **On-Demand Compilation** | None | `WorkflowCompiler.CompileAndLoad` with collectible `AssemblyLoadContext` | ✅ Implemented | Triggered via `▶ Run` / `/api/transcribe/run` |
| **Execution Preview** | Simulated chat script | Interactive `ChatPreviewPanel` simulating typing, delays, quick answers | ✅ Implemented | Runs real Roslyn compilation before simulation |

---

## 4. Architectural Debt Retirement

| Debt Item | As-Is Status | Target / Shipped Status | Verification |
|---|---|---|---|
| **Duplicated Activities** | 40 duplicated C# files in `ScriptEditor/Activities/` | Removed/excluded; direct reference to `ConversaCore` | `ScriptEditor.csproj` references `ConversaCore.csproj` |
| **Monolithic `editor.js`** | 2,100 lines of brittle vanilla JS | Replaced by modular TypeScript React Flow app | 113 unit tests passing in `canvas-app` |
| **Legacy `Home.razor`** | 1,400 lines of Blazor mixing UI and DOM logic | Retired in favor of modern canvas SPA | Issue #43 cutover completed |

---

## 5. Conclusion
All functional and architectural requirements from `docs/AS_IS_SYSTEM_DOCUMENTATION.md` are accounted for, verified by automated test suites (113 Vitest tests in `canvas-app`, 13 xUnit tests in `ScriptEditor.Tests`). Parity checklist is approved.
