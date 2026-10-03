# Concept of Operations (CONOPS): Shipped ScriptEditor Architecture

**System Name:** ScriptEditor (ConversaCore Visual Workflow Studio)  
**Target Platform:** ConversaCore Conversational AI Engine (.NET 9)  
**Document Version:** 2.0 (Shipped Baseline)  
**Date:** September 2026  

---

## 1. Operational Vision & System Capabilities

**ScriptEditor** is a dual-surface visual diagramming and bi-directional C# code authoring environment engineered specifically for building agentic conversation flows on the **ConversaCore** conversational AI framework.

It provides conversation designers, domain developers, and full-stack AI engineers with an n8n-quality workflow canvas that remains completely synchronized with strongly-typed C# `TopicFlow` classes in real time.

```mermaid
flowchart LR
    subgraph Frontend [canvas-app: React 19 + React Flow]
        Chrome[Quiet Top Chrome Header]
        Palette[Categorized Activity Palette]
        Canvas[Node Graph Canvas]
        Inspector[Contextual Inspector Drawer]
        CodeView[Monaco C# Editor]
        Preview[Live Chat Simulator]
    end

    subgraph State [Zustand Store]
        JSON[Unified DiagramDocument SSOT]
    end

    subgraph Backend [ScriptEditor API: ASP.NET Core]
        API[/api/transcribe endpoints]
        Transcriber[JsonToCSharpTranscriber]
        Parser[CSharpToJsonParser]
        Compiler[WorkflowCompiler]
    end

    subgraph Target [ConversaCore Engine]
        Assembly[ConversaCore.dll]
    end

    Palette -->|Add Node| JSON
    Canvas <-->|Position / Wire| JSON
    Inspector <-->|Parameters / IsRequired| JSON
    JSON <-->|Origin-Tokened Sync| CodeView
    JSON -->|Debounced HTTP| API
    API --> Transcriber
    API --> Parser
    API --> Compiler
    Compiler -->|Roslyn Emit & Load| Assembly
    Canvas -->|Run| Preview
```

---

## 2. Core Architectural Pillars

### 2.1 JSON as the Exclusive Single Source of Truth (SSOT)
The JSON structure (`DiagramDocumentV2` / `diagram.ts`) is the sole authoritative state representation of a conversation topic:
* Neither the visual canvas nor the Monaco code editor maintains private state.
* Every user action (dragging a node, typing a parameter in the inspector, wiring a port, or editing C# code) dispatches a mutation directly into the central Zustand store.
* The canvas, inspector, and code panels are pure reactive projections of the JSON state.

### 2.2 Bi-Directional Synchronization with Origin-Token Loop Suppression
To enable simultaneous visual and code editing without race conditions, infinite loops, or text editor cursor jumping:
* Every mutation dispatched to the store carries an explicit `origin` token (`'Canvas'`, `'CodeEditor'`, or `'Inspector'`).
* **Canvas Mutation:** Changes from the canvas update the JSON store (`origin: 'Canvas'`). A debounced hook sends the JSON to `/api/transcribe/json-to-csharp`, updating the Monaco code view.
* **Code Mutation:** Changes in Monaco send the edited C# to `/api/transcribe/csharp-to-json`. The returned JSON document is committed to the store with `origin: 'CodeEditor'`.
* **Echo Suppression:** When the store updates with `origin: 'CodeEditor'`, the code generation hook suppresses re-triggering `/json-to-csharp`, preventing feedback ping-pong loops.

### 2.3 Dual-Speed Compilation Lifecycle
* **Text-Level Synchronization (0–350ms):** Syntax construction and AST parsing operate instantly as the user types or drags shapes, keeping code and diagram in sync.
* **On-Demand Compilation & Assembly Loading:** Heavy Roslyn `CSharpCompilation.Emit` and `AssemblyLoadContext` loading are triggered only when clicking the **▶ Run** button. This compiles the generated C# against the real `ConversaCore.dll` reference, validating diagnostic errors without stalling the interactive editing experience.

### 2.4 Scaffolded Delegate & Activity Code Generation
Many ConversaCore activities require domain logic, lambdas, or complex objects that cannot be expressed as simple scalar strings. ScriptEditor automatically bridges this gap:
* **Host Notifications (`PublishHostNotificationActivity<TPayload>`):** Emits an invocation pointing to a generated private method `Create<Id>Payload(TopicWorkflowContext context)` with XML doc comments, context retrieval hints, and `throw new NotImplementedException(...)`.
* **Tool Invocations (`InvokeToolActivity<TTool, TRequest, TResult>`):** Scaffolds `Create<Id>Request(TopicWorkflowContext context)` and `Create<Id>ExecutionContext(TopicWorkflowContext context)`, instantiating a complete `ToolExecutionContext`.
* **Adaptive Cards (`AdaptiveCardActivity<TCard, TModel>`):** Emits `cardFactory: c => c.Create()`, binds `modelContextKey`, honors the `{ IsRequired = true/false }` toggle configured in the Inspector, and scaffolds `TModel` inheriting from `ConversaCore.Cards.BaseCardModel`. When executed, `BaseCardModel.UpdateContext(Context)` automatically dumps card submission fields into the topic workflow context.

---

## 3. Shipped User Interface & Ergonomics

1. **Quiet Top-Level Chrome (`app-chrome-header`):**
   * Displays persistent application identity (`◈ ConversaCore / ScriptEditor ● Active`) and clean navigation.
   * Houses the primary **▶ Run Workflow** action cleanly separated from canvas-level controls, fulfilling n8n ergonomics and eliminating cluttered canvas toolbars.
2. **Category-Grouped Activity Palette:**
   * Organizes all 37 ConversaCore activity shapes into 10 clean categories (Sequence, Selection, Iteration, Concurrency, Exception Handling, Variables & State, I/O, Events & Subroutines, Semantic/AI, Security).
   * Supports both drag-and-drop onto the canvas and contextual "+" port clicking to add pre-wired activities.
3. **Contextual Node Inspector:**
   * Only appears when a single node is selected, avoiding screen clutter.
   * Renders structured form fields tailored to the activity schema, including required toggles, prompt textareas, context keys, and timing inputs.
4. **Docked Monaco C# Code Panel:**
   * Collapsible bottom panel providing real-time syntax-highlighted C# code transcription.
   * Supports direct editing with error diagnostics in the editor gutter.
5. **Live Chat Preview Panel:**
   * Modelled after ConversaCore's conversational chat interface.
   * Validates compilation with Roslyn before walking the flow graph, rendering user bubbles, bot responses, delay typing indicators, and form stubs.
