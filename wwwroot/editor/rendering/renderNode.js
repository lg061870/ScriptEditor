(function(){
  const esc=(v)=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;');

  function labelToKey(label){
    const parts=String(label??'').replace(/[^a-zA-Z0-9]+/g,' ').trim().split(/\s+/).filter((part)=>part.length>0);
    if(parts.length===0)return 'value';
    return parts.map((part,index)=>{
      const lower=part.toLowerCase();
      return index===0?lower:(lower.charAt(0).toUpperCase()+lower.slice(1));
    }).join('');
  }

  function normalizeKey(value){
    return String(value??'').replace(/[^a-zA-Z0-9]/g,'').toLowerCase();
  }

  function resolveFieldKey(node,field){
    const explicit=typeof field?.key==='string'?field.key.trim():'';
    if(explicit.length>0)return explicit;

    const data=node&&typeof node.data==='object'&&node.data!=null?node.data:{};
    const wanted=normalizeKey(field?.label);
    if(wanted.length>0){
      for(const key of Object.keys(data)){
        if(normalizeKey(key)===wanted)return key;
      }
    }

    const fieldValue=String(field?.value??'');
    if(fieldValue.length>0){
      for(const [key,value] of Object.entries(data)){
        if(String(value??'')===fieldValue)return key;
      }
    }

    return labelToKey(field?.label);
  }

  function renderStandardFields(fields,node){
    return fields.map((field)=>{
      const label=esc(field.label||'');
      const value=String(field.value??'');
      const editable=field.disabled?false:(field.editable!==false);
      const key=resolveFieldKey(node,field);

      if(field.multiline){
        if(editable){
          return `<div class="field-block"><label class="field-label">${label}</label><textarea class="node-field-textarea" data-node-field-key="${esc(key)}" spellcheck="false">${esc(value)}</textarea></div>`;
        }
        return `<div class="field-block"><label class="field-label">${label}</label><div class="textarea-mock">${esc(value).replaceAll('\n','<br>')}</div></div>`;
      }

      if(editable){
        return `<div class="field-block"><label class="field-label">${label}</label><input class="node-field-input" data-node-field-key="${esc(key)}" value="${esc(value)}" /></div>`;
      }

      const disabledClass=field.disabled?' input-mock--disabled':'';
      return `<div class="field-block"><label class="field-label">${label}</label><div class="input-mock${disabledClass}"><span>${esc(value)}</span></div></div>`;
    }).join('');
  }

  function renderFlowNode(node,options){
    const className=options.className?` ${options.className}`:'';
    const subtitle=options.subtitle?`<p class="node-subtitle">${esc(options.subtitle)}</p>`:'';
    const fields=Array.isArray(options.fields)?options.fields:[];
    const content=fields.length
      ? `<div class="node-content node-content--stack">${renderStandardFields(fields,node)}</div>`
      : '<div class="node-content"></div>';
    return `<article class="node node-flow${className}" data-node-id="${esc(node.id)}"><header class="node-header"><div class="node-title-row"><span class="node-mark">${esc(options.mark||'◌')}</span><h2>${esc(options.title||node.type)}</h2></div><span class="node-play">▷</span></header>${subtitle}<div class="node-divider"></div>${content}<footer class="node-footer"><span>${esc(options.footer||'Continue')}</span></footer>${window.EditorRendering.renderPorts(node)}</article>`;
  }

  function renderExtendedActivityNode(type,node){
    if(type==='choice-activity'||type==='choiceactivity'){
      return renderFlowNode(node,{
        className:'node-choice-activity',
        mark:'☰',
        title:'ChoiceActivity',
        subtitle:'Quick-reply question that waits for one selected option.',
        fields:[
          {label:'Question',value:node.data.question||'How would you like to continue?'},
          {label:'Options',value:node.data.options||'Option A | Option B',multiline:true},
          {label:'Submission Key',value:node.data.submissionContextKey||node.id}
        ],
        footer:'Choice selected'
      });
    }
    if(type==='complete-topic-activity'||type==='completetopicactivity'){
      return renderFlowNode(node,{
        className:'node-complete-topic-activity',
        mark:'✓',
        title:'CompleteTopicActivity',
        subtitle:'Completes current topic and optionally resumes caller topic.',
        fields:[
          {label:'Completion Message',value:node.data.completionMessage||'Topic completed'},
          {label:'Completion Data Key',value:node.data.completionDataKey||'SubTopicCompletionData'},
          {label:'Resume Topic Key',value:node.data.resumeTopicKey||'NextTopic'}
        ],
        footer:'Topic completion'
      });
    }
    if(type==='conditional-activity'||type==='conditionalactivity'){
      return renderFlowNode(node,{
        className:'node-conditional-activity',
        mark:'⎇',
        title:'ConditionalActivity',
        subtitle:'Selects a branch using a context value selector.',
        fields:[
          {label:'Selector Key',value:node.data.selectorKey||'ConditionKey'},
          {label:'Cases',value:node.data.cases||'case-a | case-b',multiline:true},
          {label:'Default Branch',value:node.data.defaultBranch||'(none)'}
        ],
        footer:'Branch select'
      });
    }
    if(type==='decision-activity'||type==='decisionactivity'){
      return renderFlowNode(node,{
        className:'node-decision-activity',
        mark:'◇',
        title:'DecisionActivity',
        subtitle:'Semantic decision engine over evidence + rule input.',
        fields:[
          {label:'Evidence Context Key',value:node.data.evidenceContextKey||'DecisionEvidence'},
          {label:'Model Id',value:node.data.modelId||'gpt-4o'},
          {label:'Temperature',value:node.data.temperature||'0.3'},
          {label:'Require JSON',value:node.data.requireJsonOutput||'true'}
        ],
        footer:'Decision output'
      });
    }
    if(type==='dump-ctx-activity'||type==='dumpctxactivity'){
      return renderFlowNode(node,{
        className:'node-dump-ctx-activity',
        mark:'#',
        title:'DumpCtxActivity',
        subtitle:'Dumps workflow context to message output (dev mode only).',
        fields:[
          {label:'Development Mode',value:node.data.isDevelopment||'true'},
          {label:'Output Type',value:node.data.payloadType||'DumpCtx'}
        ],
        footer:'Context dump'
      });
    }
    if(type==='end-activity'||type==='endactivity'){
      return renderFlowNode(node,{
        className:'node-end-activity',
        mark:'■',
        title:'EndActivity',
        subtitle:'Ends workflow and can set Result/IsCompleted context values.',
        fields:[
          {label:'End Message',value:node.data.endMessage||'Done'},
          {label:'Result Key',value:node.data.resultKey||'Result'},
          {label:'Completed Flag Key',value:node.data.completedKey||'IsCompleted'}
        ],
        footer:'End flow'
      });
    }
    if(type==='escalate-activity'||type==='escalateactivity'){
      return renderFlowNode(node,{
        className:'node-escalate-activity',
        mark:'!',
        title:'EscalateActivity',
        subtitle:'Requests human handoff and ends automation.',
        fields:[
          {label:'Escalation Message',value:node.data.message||'Transferring to a human agent'},
          {label:'Escalation Flag Key',value:node.data.escalationKey||'EscalationRequested'}
        ],
        footer:'Escalation'
      });
    }
    if(type==='event-trigger-activity'||type==='eventtriggeractivity'){
      return renderFlowNode(node,{
        className:'node-event-trigger-activity',
        mark:'⚡',
        title:'EventTriggerActivity',
        subtitle:'Raises custom UI event with optional wait-for-response mode.',
        fields:[
          {label:'Event Name',value:node.data.eventName||'CustomEvent'},
          {label:'Wait For Response',value:node.data.waitForResponse||'false'},
          {label:'Response Context Key',value:node.data.responseContextKey||'(none)'},
          {label:'Timeout (ms)',value:node.data.responseTimeoutMs||'300000'}
        ],
        footer:'UI event'
      });
    }
    if(type==='execute-topic-activity'||type==='executetopicactivity'){
      return renderFlowNode(node,{
        className:'node-execute-topic-activity',
        mark:'⇲',
        title:'ExecuteTopicActivity',
        subtitle:'Runs another topic flow by name and returns to caller.',
        fields:[
          {label:'Topic Name',value:node.data.topicName||'SubTopicName'},
          {label:'Result Context Key',value:node.data.resultContextKey||`${node.id}_TopicResult`}
        ],
        footer:'Sub-topic run'
      });
    }
    if(type==='fallback-activity'||type==='fallbackactivity'){
      return renderFlowNode(node,{
        className:'node-fallback-activity',
        mark:'↩',
        title:'FallbackActivity',
        subtitle:'Default fallback response when no route matches.',
        fields:[
          {label:'Message',value:node.data.message||'Sorry, I did not understand that.'},
          {label:'Fallback Flag Key',value:node.data.fallbackKey||'FallbackTriggered'}
        ],
        footer:'Fallback'
      });
    }
    if(type==='for-each-activity'||type==='foreachactivity'){
      return renderFlowNode(node,{
        className:'node-for-each-activity',
        mark:'⋯',
        title:'ForEachActivity',
        subtitle:'Iterates a context collection and runs child flow per item.',
        fields:[
          {label:'Collection Key',value:node.data.collectionContextKey||'Items'},
          {label:'Item Key',value:node.data.itemContextKey||'item'},
          {label:'Index Key',value:node.data.indexContextKey||'index'},
          {label:'Start Message',value:node.data.startMessage||''},
          {label:'Complete Message',value:node.data.completeMessage||''}
        ],
        footer:'Iteration'
      });
    }
    if(type==='global-variable-activity'||type==='globalvariableactivity'){
      return renderFlowNode(node,{
        className:'node-global-variable-activity',
        mark:'◎',
        title:'GlobalVariableActivity',
        subtitle:'Promotes topic context values to conversation-global scope.',
        fields:[
          {label:'Promotion Mode',value:node.data.mode||'all'},
          {label:'Source Key',value:node.data.sourceKey||'(all keys)'},
          {label:'Global Key',value:node.data.globalKey||'Global_<Key>'}
        ],
        footer:'Global context'
      });
    }
    if(type==='greeting-activity'||type==='greetingactivity'){
      return renderFlowNode(node,{
        className:'node-greeting-activity',
        mark:'G',
        title:'GreetingActivity',
        subtitle:'Entry greeting message to start user interaction.',
        fields:[
          {label:'Greeting',value:node.data.message||'Welcome! How can I help you?'}
        ],
        footer:'Greeting'
      });
    }
    if(type==='insurance-decision-activity'||type==='insurancedecisionactivity'){
      return renderFlowNode(node,{
        className:'node-insurance-decision-activity',
        mark:'⬢',
        title:'InsuranceDecisionActivity',
        subtitle:'Applies insurance carrier rules and emits match decisions.',
        fields:[
          {label:'Rules File Path',value:node.data.rulesFilePath||'rules/insurance.json'},
          {label:'User Profile Key',value:node.data.userProfileContextKey||'UserProfile'},
          {label:'Model Id',value:node.data.modelId||'gpt-4o'}
        ],
        footer:'Underwriting decision'
      });
    }
    if(type==='interactive-activity'||type==='interactiveactivity'){
      return renderFlowNode(node,{
        className:'node-interactive-activity',
        mark:'⌨',
        title:'InteractiveActivity',
        subtitle:'Renders a prompt and waits for user input.',
        fields:[
          {label:'Message',value:node.data.message||'Please provide your input'},
          {label:'Input Context Key',value:node.data.inputContextKey||node.id},
          {label:'Model Context Key',value:node.data.modelContextKey||`${node.id}_model`},
          {label:'Input Required',value:node.data.isInputRequired||'true'}
        ],
        footer:'User input'
      });
    }
    if(type==='multiple-topics-matched-activity'||type==='multipletopicsmatchedactivity'){
      return renderFlowNode(node,{
        className:'node-multiple-topics-matched-activity',
        mark:'≋',
        title:'MultipleTopicsMatchedActivity',
        subtitle:'Clarification prompt when intent routing has near ties.',
        fields:[
          {label:'Message',value:node.data.message||'I found multiple matches. Can you clarify?'}
        ],
        footer:'Clarification'
      });
    }
    if(type==='on-error-activity'||type==='onerroractivity'){
      return renderFlowNode(node,{
        className:'node-on-error-activity',
        mark:'⚠',
        title:'OnErrorActivity',
        subtitle:'Friendly error surface for workflow exception paths.',
        fields:[
          {label:'Error Message',value:node.data.message||'An unexpected error occurred.'}
        ],
        footer:'Error handler'
      });
    }
    if(type==='parallel-activity'||type==='parallelactivity'){
      return renderFlowNode(node,{
        className:'node-parallel-activity',
        mark:'∥',
        title:'ParallelActivity',
        subtitle:'Runs child branches in parallel and merges completion.',
        fields:[
          {label:'Branch Count',value:node.data.branchCount||'2'},
          {label:'Continue On Error',value:node.data.continueOnError||'false'},
          {label:'Complete Message',value:node.data.completeMessage||''}
        ],
        footer:'Parallel branches'
      });
    }
    if(type==='prompt-attention-activity'||type==='chatpromptattentionactivity'||type==='promptattentionactivity'){
      return renderFlowNode(node,{
        className:'node-prompt-attention-activity',
        mark:'✦',
        title:'PromptAttentionActivity',
        subtitle:'Emits UI event to highlight/pulse the prompt input area.',
        fields:[
          {label:'Message',value:node.data.message||'Please answer to continue'},
          {label:'Duration (ms)',value:node.data.durationMs||'3000'},
          {label:'Event Name',value:node.data.eventName||'PromptAttention'}
        ],
        footer:'Prompt attention'
      });
    }
    if(type==='reset-activity'||type==='resetactivity'){
      return renderFlowNode(node,{
        className:'node-reset-activity',
        mark:'↺',
        title:'ResetActivity',
        subtitle:'Clears workflow/session state and restarts baseline keys.',
        fields:[
          {label:'Reset Message',value:node.data.message||'Session reset completed'}
        ],
        footer:'Reset state'
      });
    }
    if(type==='semantic-query-activity'||type==='semanticqueryactivity'){
      return renderFlowNode(node,{
        className:'node-semantic-query-activity',
        mark:'◌',
        title:'SemanticQueryActivity',
        subtitle:'Rule-set semantic query that outputs typed JSON context.',
        fields:[
          {label:'Rule Set Type',value:node.data.ruleSetType||'DomainRuleSet'},
          {label:'Input Source',value:node.data.inputSource||'context'},
          {label:'Output Context Key',value:node.data.outputContextKey||`output_query_${node.id}`},
          {label:'Run In Background',value:node.data.runInBackground||'false'}
        ],
        footer:'Semantic query'
      });
    }
    if(type==='set-variable-activity'||type==='setvariableactivity'){
      return renderFlowNode(node,{
        className:'node-set-variable-activity',
        mark:'=',
        title:'SetVariableActivity',
        subtitle:'Sets local/global variables with naming validation rules.',
        fields:[
          {label:'Variable Name',value:node.data.variableName||'Global_Example'},
          {label:'Value',value:node.data.value||''},
          {label:'Is Global',value:node.data.isGlobal||'true'},
          {label:'Validate Naming',value:node.data.validateGlobalNaming||'true'}
        ],
        footer:'Set variable'
      });
    }
    if(type==='show-suggestions-activity'||type==='showsuggestionsactivity'){
      return renderFlowNode(node,{
        className:'node-show-suggestions-activity',
        mark:'⋮',
        title:'ShowSuggestionsActivity',
        subtitle:'Sends suggestion chips event to UI and continues flow.',
        fields:[
          {label:'Suggestions',value:node.data.suggestions||'Option 1 | Option 2',multiline:true},
          {label:'Event Name',value:node.data.eventName||'UpdateSuggestions'}
        ],
        footer:'Suggestion chips'
      });
    }
    if(type==='sign-in-activity'||type==='signinactivity'){
      return renderFlowNode(node,{
        className:'node-sign-in-activity',
        mark:'⇥',
        title:'SignInActivity',
        subtitle:'Prompts sign-in and continues execution.',
        fields:[
          {label:'Message',value:node.data.message||'Please sign in to continue'}
        ],
        footer:'Sign-in prompt'
      });
    }
    if(type==='switch-activity'||type==='switchactivity'){
      return renderFlowNode(node,{
        className:'node-switch-activity',
        mark:'⎇',
        title:'SwitchActivity',
        subtitle:'Switch/case branching using a context value key.',
        fields:[
          {label:'Value Context Key',value:node.data.valueContextKey||'SwitchKey'},
          {label:'Case Keys',value:node.data.caseKeys||'case-a | case-b',multiline:true},
          {label:'Loop After Case',value:node.data.loopAfterCase||'false'},
          {label:'Default Case',value:node.data.defaultCase||'(none)'}
        ],
        footer:'Switch branch'
      });
    }
    return null;
  }

  function renderNode(node,doc){
    const type=node.type.toLowerCase();
    if(type==='chat-input'){
      const t=esc(node.data.inputText||'Hello');
      return `<article class="node node-chat-input" data-node-id="${esc(node.id)}"><header class="node-header"><div class="node-title-row"><span class="node-mark">⧉</span><h2>Chat Input</h2></div><span class="node-play">▷</span></header><p class="node-subtitle">Get chat inputs from the Playground.</p><div class="node-divider"></div><div class="node-content"><label class="field-label">Input Text <span class="muted-dot">○</span></label><input class="node-field-input" data-node-field-key="inputText" value="${t}" /></div><footer class="node-footer"><span>Chat Message</span><span class="footer-glyph">⇄</span></footer>${window.EditorRendering.renderPorts(node)}</article>`;
    }
    if(type==='prompt'){
      const t=esc(node.data.template||'');
      return `<article class="node node-prompt" data-node-id="${esc(node.id)}"><header class="node-header"><div class="node-title-row"><span class="node-mark">{ }</span><h2>Prompt</h2></div><span class="node-play">▷</span></header><p class="node-subtitle">Create a prompt template with dynamic variables.</p><div class="node-divider"></div><div class="node-content"><label class="field-label">Template</label><textarea class="node-field-textarea" data-node-field-key="template" spellcheck="false">${t}</textarea></div><footer class="node-footer"><span>Prompt</span><span class="footer-glyph">⇄</span></footer>${window.EditorRendering.renderPorts(node)}</article>`;
    }
    if(type==='language-model'){
      const provider=esc(node.data.provider||'OpenAI');
      const model=esc(node.data.model||'gpt-4o-mini');
      const key=esc(node.data.apiKey||'OPENAI_API_KEY');
      return `<article class="node node-model" data-node-id="${esc(node.id)}"><header class="node-header"><div class="node-title-row"><span class="node-mark">⎇</span><h2>Language Model</h2></div><span class="node-play">▷</span></header><p class="node-subtitle">Runs a language model given a specified provider.</p><div class="node-divider"></div><div class="node-content node-content--stack"><div class="field-block"><label class="field-label">Model Provider <span class="muted-dot">○</span></label><input class="node-field-input" data-node-field-key="provider" value="${provider}" /></div><div class="field-block"><label class="field-label">Model Name <span class="muted-dot">○</span></label><input class="node-field-input" data-node-field-key="model" value="${model}" /></div><div class="field-block"><label class="field-label">OpenAI API Key <span class="muted-dot">○</span></label><input class="node-field-input" data-node-field-key="apiKey" value="${key}" /></div><div class="field-block"><label class="field-label">Input <span class="muted-dot">○</span></label><div class="input-mock input-mock--disabled"><span>Receiving input</span><span>🔒</span></div></div><div class="field-block"><label class="field-label">System Message <span class="muted-dot">○</span></label><div class="input-mock input-mock--disabled"><span>Receiving input</span><span>🔒</span></div></div></div><footer class="node-footer"><span>Model Response</span><span class="footer-glyph">⌄</span><span class="footer-glyph">⇄</span></footer>${window.EditorRendering.renderPorts(node)}</article>`;
    }
    if(type==='chat-output'){
      return `<article class="node node-output" data-node-id="${esc(node.id)}"><header class="node-header"><div class="node-title-row"><span class="node-mark">⧉</span><h2>Chat Output</h2></div><span class="node-play">▷</span></header><p class="node-subtitle">Display a chat message in the Playground.</p><div class="node-divider"></div><div class="node-content"><label class="field-label">Inputs<span class="required">*</span> <span class="muted-dot">○</span></label><div class="input-mock input-mock--disabled"><span>Receiving input</span><span>🔒</span></div></div><footer class="node-footer"><span>Output Message</span><span class="footer-glyph">⇄</span></footer>${window.EditorRendering.renderPorts(node)}</article>`;
    }
    if(type==='delay'){
      const d=node.data.durationMs||'1000';
      return renderFlowNode(node,{
        className:'node-delay',
        mark:'⏱',
        title:'Delay',
        subtitle:'Pause flow execution for a configured duration.',
        fields:[{label:'Duration (ms)',value:d}],
        footer:'Input only'
      });
    }
    if(type==='simple-activity'){
      return renderFlowNode(node,{
        className:'node-simple-activity',
        mark:'◇',
        title:'SimpleActivity',
        subtitle:'Runs a simple action or emits a static message, then continues.',
        fields:[
          {label:'Mode',value:node.data.mode||'message or action'},
          {label:'Message',value:node.data.message||'Learning mode intro message',multiline:true}
        ],
        footer:'Continue'
      });
    }
    if(type==='repeat-activity'){
      return renderFlowNode(node,{
        className:'node-repeat-activity',
        mark:'↻',
        title:'RepeatActivity',
        subtitle:'Executes a wrapped child activity in a loop.',
        fields:[
          {label:'Loop Mode',value:node.data.loopMode||'while predicate'},
          {label:'Collection Key',value:node.data.collectionContextKey||'BasicsLearningLoop_Collection'},
          {label:'Continue Prompt',value:node.data.continuePrompt||'custom predicate controls continuation'}
        ],
        footer:'Loop control'
      });
    }
    if(type==='composite-activity'){
      return renderFlowNode(node,{
        className:'node-composite-activity',
        mark:'▦',
        title:'CompositeActivity',
        subtitle:'Runs child activities sequentially and resumes after waits.',
        fields:[
          {label:'Child Count',value:node.data.childCount||'8'},
          {label:'Isolate Context',value:node.data.isolateContext||'false'},
          {label:'Complete Message',value:node.data.completeMessage||'Composite completed'}
        ],
        footer:'Sequence'
      });
    }
    if(type==='wait-for-user-input'){
      return renderFlowNode(node,{
        className:'node-wait-for-user-input',
        mark:'⌨',
        title:'WaitForUserInput',
        subtitle:'Adaptive card prompt that captures free-form user input.',
        fields:[
          {label:'Prompt',value:node.data.prompt||'Ask your question about insurance basics:'},
          {label:'Model Context Key',value:node.data.modelContextKey||'wait_for_user_input'},
          {label:'Required',value:node.data.isRequired||'true'}
        ],
        footer:'Wait for input'
      });
    }
    if(type==='semantic-response'){
      return renderFlowNode(node,{
        className:'node-semantic-response',
        mark:'◉',
        title:'SemanticResponse',
        subtitle:'Builds prompts, retrieves evidence, and may skip LLM by threshold.',
        fields:[
          {label:'Collection',value:node.data.collectionName||'insurance_basics_intel'},
          {label:'User Prompt Key',value:node.data.userPromptContextKey||'Basics_UserPrompt'},
          {label:'Skip LLM Threshold',value:node.data.skipLlmThreshold||'0.9'}
        ],
        footer:'Semantic output'
      });
    }
    if(type==='prompt-activity'){
      return renderFlowNode(node,{
        className:'node-prompt-activity',
        mark:'✎',
        title:'PromptActivity',
        subtitle:'Templated system/user prompt with context variable substitution.',
        fields:[
          {label:'System Prompt',value:node.data.systemPrompt||'You are an empathetic insurance assistant.',multiline:true},
          {label:'User Prompt Template',value:node.data.userPromptTemplate||'User message: {context.Basics_UserPrompt}.',multiline:true},
          {label:'Temperature',value:node.data.temperature||'0.7'}
        ],
        footer:'Prompt result'
      });
    }
    if(type==='conditional-quick-answer'){
      return renderFlowNode(node,{
        className:'node-conditional-quick-answer',
        mark:'?',
        title:'Conditional<QuickAnswer>',
        subtitle:'Switch branch that conditionally executes QuickAnswerActivity.',
        fields:[
          {label:'Selector Key',value:node.data.selectorKey||'Basics_LastDecisionLabel'},
          {label:'Branch Match',value:node.data.branchValue||'StillLearning -> ask'},
          {label:'Default Branch',value:node.data.defaultBranch||'(none)'}
        ],
        footer:'Branch'
      });
    }
    if(type==='quick-answer'){
      return renderFlowNode(node,{
        className:'node-quick-answer',
        mark:'☑',
        title:'QuickAnswerActivity',
        subtitle:'Adaptive card with one question and fixed answer buttons.',
        fields:[
          {label:'Question',value:node.data.question||'How would you like to continue?'},
          {label:'Answers',value:node.data.answers||'I need more info | Interview me',multiline:true},
          {label:'Required',value:node.data.isRequired||'true'}
        ],
        footer:'Selected answer'
      });
    }
    if(type==='conditional-trigger-topic'){
      return renderFlowNode(node,{
        className:'node-conditional-trigger-topic',
        mark:'⎇',
        title:'Conditional<TriggerTopic>',
        subtitle:'Switch route that selects which topic trigger branch to execute.',
        fields:[
          {label:'Selector Key',value:node.data.selectorKey||'Basics_NextMode'},
          {label:'Branches',value:node.data.branches||'CoverageEstimate, CompareTermVsWhole, Quote',multiline:true},
          {label:'Default Branch',value:node.data.defaultBranch||'(none)'}
        ],
        footer:'Routing'
      });
    }
    if(type==='trigger-topic'){
      return renderFlowNode(node,{
        className:'node-trigger-topic',
        mark:'⇢',
        title:'TriggerTopicActivity',
        subtitle:'Signals orchestrator to trigger another topic.',
        fields:[
          {label:'Topic To Trigger',value:node.data.topicToTrigger||'CoverageEstimateTopic'},
          {label:'Wait For Completion',value:node.data.waitForCompletion||'false'}
        ],
        footer:'Topic trigger'
      });
    }
    const extendedNode=renderExtendedActivityNode(type,node);
    if(extendedNode)return extendedNode;
    const adaptiveNode = window.EditorRendering.renderAdaptiveNode
      ? window.EditorRendering.renderAdaptiveNode(type,node,doc,renderFlowNode)
      : null;
    if(adaptiveNode)return adaptiveNode;
    return renderFlowNode(node,{
      className:'node-generic',
      mark:'◌',
      title:node.type,
      subtitle:'Generated from JSON.',
      fields:[],
      footer:'JSON node'
    });
  }

  window.EditorRendering=window.EditorRendering||{};
  window.EditorRendering.renderNode=renderNode;
})();
