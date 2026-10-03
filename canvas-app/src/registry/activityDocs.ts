/**
 * Contextual Help, Reference Use Cases, and Graphical Explanations for ScriptEditor activities.
 * 
 * Provides conversational designers and developers with real-world scenarios,
 * visual flow diagrams, and runtime execution models directly in the inspector.
 */

export interface ActivityDoc {
  type: string;
  category: string;
  summary: string;
  referenceUseCase: string;
  graphicalExplanation: string;
  runtimeOutcome: string;
  bestPractices?: string[];
}

export const ACTIVITY_DOCS: Record<string, ActivityDoc> = {
  CompositeActivity: {
    type: 'CompositeActivity',
    category: 'Sequence',
    summary: 'Executes a sequential sub-pipeline of child activities atomically as a single unified shape on the canvas.',
    referenceUseCase: 
      'To comply with regulatory standards (e.g., insurance or banking disclosures), the user must be informed of statutory notices and accept both Federal and State disclaimers before being issued an account or quote. Rather than cluttering the top-level canvas with three separate intermediate shapes, a CompositeActivity bundles: (1) Notice Message, (2) Disclosure Consent Form, and (3) Compliance Verification into one cohesive "Process Steps" stage.',
    graphicalExplanation: [
      '┌─────────────────────────────────────────────────────────────┐',
      '│ 📦 Process Steps (CompositeActivity)                        │',
      '│  ├─ ① 💬 Step1_Notice (SimpleActivity)                      │',
      '│  │    "Please review mandatory statutory disclosures..."    │',
      '│  ├─ ② 📇 Step2_Disclosures (AdaptiveCardActivity)           │',
      '│  │    [✓] Federal Disclosures  [✓] State Disclaimers        │',
      '│  └─ ③ ⚡ Step3_VerifyLog (InvokeToolActivity)               │',
      '│       Logs signed compliance timestamp to audit log         │',
      '└─────────────────────────────────────────────────────────────┘',
      '                               │',
      '                        (Single Output)',
      '                               ▼',
      '               [Next Activity: IssuePolicyQuote]',
    ].join('\n'),
    runtimeOutcome: 
      'Executes child activities sequentially from top to bottom. If "Isolate Context" is enabled, intermediate variables are sandboxed. The parent workflow proceeds to the next node only once all internal steps finish successfully.',
    bestPractices: [
      'Use CompositeActivity for sequential, tightly-coupled multi-step tasks to keep your main canvas clean.',
      'Use "Isolate Context" if the child steps compute temporary scratchpad values you do not want leaking into the parent topic.',
      'For complex multi-branching sub-dialogs, prefer TriggerTopicActivity (Subtopics) instead.',
    ],
  },

  PromptActivity: {
    type: 'PromptActivity',
    category: 'Semantic/AI',
    summary: 'Leverages Semantic Kernel AI to reason over conversational context and generate intelligent, dynamic responses or risk assessments.',
    referenceUseCase: 
      'Assessing risk or policy eligibility based on unstructured conversational history. When a user describes their lifestyle or coverage needs, PromptActivity injects conversation history and rules into the system prompt to classify risk score and produce an empathetic summary.',
    graphicalExplanation: [
      '┌─────────────────────────────────────────────────────────────┐',
      '│ ❓ Risk Analysis AI (PromptActivity)                        │',
      '│  ├─ System: "You are an empathetic underwriting assistant"  │',
      '│  ├─ Template: "Evaluate user risk: {context.UserQuery}"     │',
      '│  └─ Temperature: 0.7                                        │',
      '└─────────────────────────────────────────────────────────────┘',
      '                               │',
      '                               ▼',
      '                   [Risk Score Stored in Context]',
    ].join('\n'),
    runtimeOutcome: 
      'Invokes the configured Semantic Kernel LLM model with the resolved prompt template. The AI response is automatically written to topic workflow context for subsequent activities.',
    bestPractices: [
      'Provide clear persona guidelines in the System Prompt.',
      'Use {context.VariableName} syntax to inject variables collected by previous activities.',
    ],
  },

  AdaptiveCardActivity: {
    type: 'AdaptiveCardActivity',
    category: 'I/O',
    summary: 'Renders an interactive Microsoft Adaptive Card form (inputs, toggles, dropdowns, submit buttons) to collect structured user data.',
    referenceUseCase: 
      'Collecting applicant contact and coverage information. Displays a unified card containing Full Name, Phone, Date of Birth, and Coverage Type pills with real-time validation before submission.',
    graphicalExplanation: [
      '┌─────────────────────────────────────────────────────────────┐',
      '│ 📇 Contact Information (AdaptiveCardActivity)               │',
      '│  [ Full Name: _______________________ ]                     │',
      '│  [ Coverage: (•) Term   ( ) Whole   ( ) Universal ]         │',
      '│  [ [Submit Application] ]                                   │',
      '└─────────────────────────────────────────────────────────────┘',
      '                               │',
      '                     (On Valid Submission)',
      '                               ▼',
      '                 [ContactFormModel Saved to Context]',
    ].join('\n'),
    runtimeOutcome: 
      'Renders the Adaptive Card in the user chat client and halts execution until the user submits the form. Form fields are validated, strongly-typed into a C# model, and populated into context.',
    bestPractices: [
      'Use the built-in Adaptive Card Designer in the Inspector to visually configure form fields.',
      'Set "Required" validation on critical fields so the user cannot submit an incomplete form.',
    ],
  },

  SimpleActivity: {
    type: 'SimpleActivity',
    category: 'I/O',
    summary: 'Sends a direct message or prompt to the user in the chat interface.',
    referenceUseCase: 
      'Sending greetings, acknowledgement messages, or status updates (e.g. "Welcome to Northwind Insurance! Let me help you find the right coverage.").',
    graphicalExplanation: [
      '┌──────────────────────────────────────────────┐',
      '│ 💬 WelcomeMessage (SimpleActivity)           │',
      '│ "Welcome! Let me help you find coverage."    │',
      '└──────────────────────────────────────────────┘',
      '                       │',
      '                       ▼',
      '             [Next Workflow Step]',
    ].join('\n'),
    runtimeOutcome: 
      'Dispatches the text message through the conversation output channel and immediately proceeds to the next node connected to its output port.',
  },

  TriggerTopicActivity: {
    type: 'TriggerTopicActivity',
    category: 'Events & Subroutines',
    summary: 'Transfers conversational control to another topic workflow or subroutine.',
    referenceUseCase: 
      'Modularizing a large bot into reusable topics. For example, triggering a standalone "QuoteTopic" or "EscalateToAgent" topic from multiple different parts of the main flow.',
    graphicalExplanation: [
      '┌──────────────────────────────────────────────┐',
      '│ 🔀 CallSubtopic (TriggerTopicActivity)       │',
      '│ Target Topic: "QuoteCalculationTopic"        │',
      '│ Wait For Completion: True                    │',
      '└──────────────────────────────────────────────┘',
      '                       │',
      '                       ▼',
      '           [Switches to Subtopic Flow]',
    ].join('\n'),
    runtimeOutcome: 
      'Executes the specified target topic. If "Wait For Completion" is true, the current workflow pauses until the target subtopic finishes, then resumes on its output port.',
  },

  DelayActivity: {
    type: 'DelayActivity',
    category: 'Sequence',
    summary: 'Pauses workflow execution for a specified duration in milliseconds, optionally showing a typing indicator.',
    referenceUseCase: 
      'Simulating realistic agent typing delays before sending a detailed response, or pacing rapid informational messages so the user can comfortably read them.',
    graphicalExplanation: [
      '┌──────────────────────────────────────────────┐',
      '│ ⏳ Pause (DelayActivity)                     │',
      '│ Duration: 1500 ms (Typing Indicator: True)   │',
      '└──────────────────────────────────────────────┘',
      '                       │',
      '                       ▼',
      '             [Resumes after 1.5s]',
    ].join('\n'),
    runtimeOutcome: 
      'Pauses the conversation thread asynchronously for the specified time without blocking the backend server thread.',
  },

  EndActivity: {
    type: 'EndActivity',
    category: 'Sequence',
    summary: 'Gracefully terminates the conversation or current topic session, optionally sending a concluding message.',
    referenceUseCase: 
      'Wrapping up a support ticket or closing a completed transaction with "Thank you for choosing Northwind Insurance! Have a great day."',
    graphicalExplanation: [
      '┌──────────────────────────────────────────────┐',
      '│ ⏹️ Goodbye (EndActivity)                     │',
      '│ "Thank you! Have a great day."               │',
      '└──────────────────────────────────────────────┘',
      '                       │',
      '                       ▼',
      '                [Session Ended]',
    ].join('\n'),
    runtimeOutcome: 
      'Marks the topic flow as terminated (IsTerminated = true), clears active conversation state, and emits the closing message.',
  },

  SetVariableActivity: {
    type: 'SetVariableActivity',
    category: 'Variables & State',
    summary: 'Sets or updates a named variable in the active TopicWorkflowContext.',
    referenceUseCase: 
      'Initializing default flags (e.g. `is_authenticated = false`), setting a calculated quote amount, or storing state before branching.',
    graphicalExplanation: [
      '┌──────────────────────────────────────────────┐',
      '│ 🔧 SetVar (SetVariableActivity)              │',
      '│ Variable: "policy_tier" = "PremiumGold"      │',
      '└──────────────────────────────────────────────┘',
      '                       │',
      '                       ▼',
      '      [context.policy_tier updated in state]',
    ].join('\n'),
    runtimeOutcome: 
      'Evaluates the value and writes it to the TopicWorkflowContext dictionary under the specified variable name.',
  },

  InvokeToolActivity: {
    type: 'InvokeToolActivity',
    category: 'Events & Subroutines',
    summary: 'Executes an external C# backend tool or service implementation via IToolExecutor.',
    referenceUseCase: 
      'Calling an external API or database (e.g., CreditCheckTool or FetchPolicyRates) using context inputs, and storing the returned result payload into context.',
    graphicalExplanation: [
      '┌──────────────────────────────────────────────┐',
      '│ ⚡ CheckRates (InvokeToolActivity)           │',
      '│ Tool ID: "RateCalculatorTool"                │',
      '│ Result Key: "rate_calculation_result"        │',
      '└──────────────────────────────────────────────┘',
      '                       │',
      '                       ▼',
      '           [Result Saved to Context]',
    ].join('\n'),
    runtimeOutcome: 
      'Executes the configured IToolExecutor implementation and stores the result object into context.',
  },

  ConditionalActivity: {
    type: 'ConditionalActivity',
    category: 'Selection & Logic',
    summary: 'Evaluates a conditional key or expression and branches execution along distinct True/False or case pathways.',
    referenceUseCase:
      'Checking user eligibility (e.g. "If is_eligible == true"), subscription tiers, or input validation status, branching downstream execution to the approved pathway or alternative fallback.',
    graphicalExplanation: [
      '                     [Start / Previous Activity]',
      '                                  │',
      '                                  ▼',
      '                           ◆─────────────◆',
      '                          ╱  Condition    ╲',
      '                         ╱     Check       ╲',
      '                        ◆───────────────────◆',
      '                         │ (True)     │ (False)',
      '                         ▼            ▼',
      '                    ┌────────┐   ┌─────────┐',
      '                    │If Block│   │ElseBlock│',
      '                    └────────┘   └─────────┘',
    ].join('\n'),
    runtimeOutcome:
      'Evaluates the selector key or condition against configured cases. If a match is found, execution transitions to the matching branch port; otherwise it falls back to the default branch or exception port.',
    bestPractices: [
      'Provide clear downstream pathways for both True and False (or each case) to avoid dead ends in dialogue.',
      'Connect the Exception port on the bottom vertex to handle unexpected null or missing context keys.',
    ],
  },
};

/**
 * Returns documentation for a given activity type, falling back to dynamic metadata.
 */
export function getActivityDoc(type: string): ActivityDoc {
  if (ACTIVITY_DOCS[type]) {
    return ACTIVITY_DOCS[type];
  }

  return {
    type,
    category: 'General',
    summary: `Executes ${type} within the topic workflow.`,
    referenceUseCase: `Used in conversation flows that require ${type} processing. Configure parameters in the inspector to customize behavior.`,
    graphicalExplanation: [
      '┌──────────────────────────────────────────────┐',
      `│ ⚙️ ${type}                                    │`,
      '└──────────────────────────────────────────────┘',
      '                       │',
      '                       ▼',
      '              [Next Workflow Node]',
    ].join('\n'),
    runtimeOutcome: `Runs ${type} and transitions along its configured output ports upon completion.`,
  };
}
