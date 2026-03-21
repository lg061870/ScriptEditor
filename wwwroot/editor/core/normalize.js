(function(){
  const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
  const asNumber=(v,f=0)=>{const n=Number.parseFloat(String(v??''));return Number.isFinite(n)?n:f;};
  const optionalNum=(v)=>{const n=Number.parseFloat(String(v??''));return Number.isFinite(n)?n:null;};
  const normalizeTypeKey=(type)=>String(type??'').trim().toLowerCase();
  const EXCEPTION_PORT_EXCLUDED_TYPES=new Set([
   'on-error-activity',
   'onerroractivity'
  ]);
  const shouldAddExceptionPort=(nodeType)=>!EXCEPTION_PORT_EXCLUDED_TYPES.has(normalizeTypeKey(nodeType));
  const NODE_MIN_WIDTHS={
   'chat-input':320,
   'prompt':320,
   'language-model':320,
   'chat-output':280,
   'delay':240,
   'simple-activity':300,
   'repeat-activity':340,
   'composite-activity':340,
   'wait-for-user-input':320,
   'semantic-response':340,
   'prompt-activity':360,
   'adaptive-card-activity':360,
   'adaptive-card':360,
   'conditional-quick-answer':360,
   'quick-answer':320,
   'conditional-trigger-topic':340,
   'trigger-topic':320,
   'generic':220
  };
  const NODE_MIN_HEIGHTS={
   'chat-input':260,
   'prompt':260,
   'language-model':720,
   'chat-output':230,
   'delay':230,
   'simple-activity':390,
   'repeat-activity':430,
   'composite-activity':410,
   'wait-for-user-input':420,
   'semantic-response':420,
   'prompt-activity':470,
   'adaptive-card-activity':470,
   'adaptive-card':470,
   'conditional-quick-answer':420,
   'quick-answer':430,
   'conditional-trigger-topic':430,
   'trigger-topic':320,
   'generic':180
  };
  const minNodeWidth=(type)=>{
   const key=String(type??'').trim().toLowerCase();
   if(NODE_MIN_WIDTHS[key]!=null)return NODE_MIN_WIDTHS[key];
   if(key.endsWith('-activity'))return 340;
   return NODE_MIN_WIDTHS.generic;
  };
  const minNodeHeight=(type)=>{
   const key=String(type??'').trim().toLowerCase();
   if(NODE_MIN_HEIGHTS[key]!=null)return NODE_MIN_HEIGHTS[key];
   if(key.endsWith('-activity'))return 280;
   return NODE_MIN_HEIGHTS.generic;
  };
  function normalizeNodeSize(value,min,max){
   if(value==null)return null;
   const n=Number.parseFloat(String(value));
   if(!Number.isFinite(n))return null;
   return clamp(n,min,max);
  }
  function parseDoc(input){
   if(typeof input==='string'){if(!input.trim())return null;try{return JSON.parse(input);}catch{return null;}}
   return input&&typeof input==='object'?input:null;
  }
  function endpointPort(raw){
   if(raw==null)return '';
   if(typeof raw==='string')return raw.trim();
   if(typeof raw==='object'){
    const candidate=raw.port??raw.id;
    return typeof candidate==='string'?candidate.trim():'';
   }
   return '';
  }
  function endpointNode(raw){
   if(raw&&typeof raw==='object'&&typeof raw.node==='string')return raw.node.trim();
   return '';
  }
  function normalizeType(type){
   const value=String(type??'').trim().toLowerCase();
   return value.length?value:'string';
  }
  function hasExceptionPort(node){
    return node.ports.some((port)=>String(port.name??'').toLowerCase()==='exception');
  }
  function nextExceptionPortId(node){
    const baseId=`${String(node?.id??'node').trim()||'node'}-exception-out`;
    if(!Array.isArray(node?.ports)||node.ports.every((port)=>String(port?.id??'')!==baseId)){
     return baseId;
    }
    let counter=2;
    let candidate=`${baseId}-${counter}`;
    while(node.ports.some((port)=>String(port?.id??'')===candidate)){
     counter+=1;
     candidate=`${baseId}-${counter}`;
    }
    return candidate;
  }
  function ensureExceptionPort(node){
    if(!node||!shouldAddExceptionPort(node.type))return false;
    node.ports=Array.isArray(node.ports)?node.ports:[];
    if(hasExceptionPort(node))return false;
    node.ports.push({
     id:nextExceptionPortId(node),
     name:'Exception',
     direction:'output',
     type:'any',
     position:'custom-bottom-85'
    });
    return true;
  }
  function normAdaptiveModelProperty(raw,mi,pi){
   if(!raw||typeof raw!=='object')return null;
   return {
    name:String(raw.name||`field${pi+1}`),
    type:normalizeType(raw.type),
    required:Boolean(raw.required),
    defaultValue:raw.defaultValue==null?null:String(raw.defaultValue),
    description:raw.description==null?null:String(raw.description)
   };
  }
  function normAdaptiveModel(raw,i){
   if(!raw||typeof raw!=='object')return null;
   const properties=Array.isArray(raw.properties)?raw.properties:[];
   return {
    id:String(raw.id||`adaptive-model-${i+1}`),
    name:String(raw.name||raw.id||`AdaptiveModel${i+1}`),
    baseType:String(raw.baseType||'BaseCardModel'),
    properties:properties.map((p,j)=>normAdaptiveModelProperty(p,i,j)).filter(Boolean)
   };
  }
  function normAdaptiveCardField(raw,ci,fi){
   if(!raw||typeof raw!=='object')return null;
   return {
    id:String(raw.id??''),
    label:String(raw.label??''),
    inputType:String(raw.inputType??'text'),
    placeholder:raw.placeholder==null?null:String(raw.placeholder),
    required:Boolean(raw.required),
    readOnly:Boolean(raw.readOnly),
    defaultValue:raw.defaultValue==null?null:String(raw.defaultValue),
    description:raw.description==null?null:String(raw.description),
    options:Array.isArray(raw.options)?raw.options.map((opt)=>String(opt??'')).filter((s)=>s.length>0):[]
   };
  }
  function normAdaptiveCard(raw,i){
   if(!raw||typeof raw!=='object')return null;
   const fields=Array.isArray(raw.fields)?raw.fields:[];
   return {
    id:String(raw.id||`adaptive-card-${i+1}`),
    name:String(raw.name||raw.id||`AdaptiveCard${i+1}`),
    baseType:String(raw.baseType||'AdaptiveFormCardLayout'),
    modelRef:String(raw.modelRef||''),
    fields:fields.map((f,j)=>normAdaptiveCardField(f,i,j)).filter(Boolean)
   };
  }
  function normEdge(raw,i){
   if(!raw||typeof raw!=='object')return null;
   const from=endpointPort(raw.from);
   if(!from)return null;
   const to=endpointPort(raw.to);
   if(!to)return null;
   const fromNode=endpointNode(raw.from);
   const toNode=endpointNode(raw.to);
   return {
    id:String(raw.id||`edge-${i+1}`),
    from,
    to,
    fromNode:fromNode||null,
    toNode:toNode||null,
    looseX:raw.looseX==null?null:asNumber(raw.looseX,0),
    looseY:raw.looseY==null?null:asNumber(raw.looseY,0)
   };
  }
  function normNode(raw, i) {
      if (!raw || typeof raw !== 'object') return null;

      const data = raw.data && typeof raw.data === 'object' ? raw.data : {};
      const incomingPorts = Array.isArray(raw.ports) ? raw.ports : [];

      const context = raw.context && typeof raw.context === 'object' ? raw.context : {};
      const reads = Array.isArray(context.reads) ? context.reads : [];
      const writes = Array.isArray(context.writes) ? context.writes : [];

      const node = {
          id: String(raw.id || `node-${i + 1}`),
          type: String(raw.type || 'generic'),
          name: typeof raw.name === 'string' ? raw.name.trim() : '',
          collapsed: Boolean(raw.collapsed),
          x: asNumber(raw.x, 0),
          y: asNumber(raw.y, 0),
          width: normalizeNodeSize(optionalNum(raw.width), minNodeWidth(raw.type), 1500),
          height: normalizeNodeSize(optionalNum(raw.height), minNodeHeight(raw.type), 1200),
          data: Object.fromEntries(Object.entries(data).map(([k, v]) => [String(k), String(v ?? '')])),
          context: {
              reads: reads.map((v) => String(v ?? '')).filter((v) => v.length > 0),
              writes: writes.map((v) => String(v ?? '')).filter((v) => v.length > 0)
          },

          // ⬇️ TEMP assign, will override below if needed
          ports: incomingPorts.map((p, j) => window.EditorPorts.normPort(p, i, j)).filter(Boolean)
      };

      // =========================================================
      // 🔥 ADD THIS BLOCK (adaptive-card ports injection)
      // =========================================================
      if (node.type === 'adaptive-card-activity' && node.ports.length === 0) {
          node.ports = [
              {
                  id: `${node.id}-card-in`,
                  name: 'Card',
                  direction: 'input',
                  type: 'adaptive-card',
                  position: 'custom-right-25',
                  portGender: 'female'
              },
              {
                  id: `${node.id}-model-in`,
                  name: 'Model',
                  direction: 'input',
                  type: 'adaptive-model',
                  position: 'custom-right-55',
                  portGender: 'female'
              },
              {
                  id: `${node.id}-out`,
                  name: 'Submit',
                  direction: 'output',
                  type: 'adaptive-submission',
                  position: 'custom-right-85',
                  portGender: 'male'
              }
          ].map((p, j) => window.EditorPorts.normPort(p, i, j)).filter(Boolean);
      }

      // =========================================================
      // Adaptive Card Definition (male output)
      // =========================================================
      if (node.type === 'adaptive-card-definition' && node.ports.length === 0) {
          node.ports = [
              {
                  id: `${node.id}-out`,
                  name: 'Card',
                  direction: 'output',
                  type: 'adaptive-card',
                  position: 'custom-right-50',
                  portGender: 'male'
              }
          ].map((p, j) => window.EditorPorts.normPort(p, i, j)).filter(Boolean);
      }

      // Adaptive Model Definition (male output)
      if (node.type === 'adaptive-model-definition' && node.ports.length === 0) {
          node.ports = [
              {
                  id: `${node.id}-out`,
                  name: 'Model',
                  direction: 'output',
                  type: 'adaptive-model',
                  position: 'custom-right-50',
                  portGender: 'male'
              }
          ].map((p, j) => window.EditorPorts.normPort(p, i, j)).filter(Boolean);
      }

      // =========================================================

      ensureExceptionPort(node);

      // Ensure adaptive-card-activity always has required ports, even for legacy nodes
      if (node.type === 'adaptive-card-activity') {
          const required = [
              { id: `${node.id}-card-in`, name: 'Card', direction: 'input', type: 'adaptive-card', position: 'custom-right-30', portGender: undefined },
              { id: `${node.id}-model-in`, name: 'Model', direction: 'input', type: 'adaptive-model', position: 'custom-right-60', portGender: undefined },
              { id: `${node.id}-out`, name: 'Submit', direction: 'output', type: 'adaptive-submission', position: 'custom-right-90', portGender: undefined }
          ];
          required.forEach((req, idx) => {
              const existing = node.ports.find((p) => p.id === req.id);
              if (existing) {
                  existing.position = req.position;
                  existing.portGender = req.portGender;
                  existing.direction = req.direction;
                  existing.type = req.type;
                  existing.name = existing.name || req.name;
              } else {
                  node.ports.push(window.EditorPorts.normPort(req, i, node.ports.length + idx));
              }
          });
      }

      // Generic safety net: ensure data + control ports exist for most nodes
      const typeKey = normalizeTypeKey(node.type);
      const inputExceptions = new Set(['chat-input']);
      const outputExceptions = new Set(['chat-output','end-activity']);
      const controlExceptions = new Set(['chat-input','chat-output','end-activity']);
      const isControlPort = (p)=>String(p?.name??'').toLowerCase().includes('control')||String(p?.id??'').toLowerCase().includes('control')||String(p?.type??'').toLowerCase()==='control';
      const hasInput = node.ports.some((p)=>p.direction==='input'&&!isControlPort(p));
      const hasOutput = node.ports.some((p)=>p.direction==='output'&&!isControlPort(p)&&!String(p?.name??'').toLowerCase().includes('exception'));
      const controlPorts = node.ports.filter((p)=>isControlPort(p));
      if (controlPorts.length > 1) {
          const keepControl = controlPorts.find((p)=>p.direction==='output') || controlPorts[0];
          node.ports = node.ports.filter((p)=>!isControlPort(p) || p === keepControl);
      }
      const hasControl = node.ports.some((p)=>isControlPort(p));
      if(!hasInput && !inputExceptions.has(typeKey)){
          node.ports.push(window.EditorPorts.normPort({
              id: `${node.id}-in`,
              name: 'Input',
              direction: 'input',
              type: 'string',
              position: 'custom-left-50',
              portGender: 'female'
          }, i, node.ports.length));
      }
      if(!hasOutput && !outputExceptions.has(typeKey)){
          node.ports.push(window.EditorPorts.normPort({
              id: `${node.id}-out`,
              name: 'Output',
              direction: 'output',
              type: 'string',
              position: 'custom-bottom-35',
              portGender: 'male'
          }, i, node.ports.length));
      }
      if(!hasControl && !controlExceptions.has(typeKey)){
          node.ports.push(window.EditorPorts.normPort({
              id: `${node.id}-control`,
              name: 'Control',
              direction: 'output',
              type: 'control',
              position: 'custom-top-50',
              portGender: 'male'
          }, i, node.ports.length));
      }

      // Keep canonical placement for default ports.
      node.ports.forEach((port) => {
          const id = String(port?.id ?? '').toLowerCase();
          const name = String(port?.name ?? '').toLowerCase();
          const type = String(port?.type ?? '').toLowerCase();
          const dir = String(port?.direction ?? '').toLowerCase();
          const isException =
              id.includes('exception') ||
              id.endsWith('-ex') ||
              name.includes('exception') ||
              name === 'error';
          const isControl =
              type === 'control' ||
              id.includes('control') ||
              name.includes('control');

          if (isException && dir === 'output') {
              port.position = 'custom-bottom-85';
              return;
          }

          if (isControl) {
              port.position = 'custom-top-50';
              return;
          }

          if (dir === 'output' && (name === 'output' || id.endsWith('-out'))) {
              port.position = 'custom-bottom-35';
              return;
          }

          if (dir === 'input' && (name === 'input' || id.endsWith('-in'))) {
              port.position = 'custom-left-50';
          }
      });

      return node;
  }
  function normalizeDoc(raw){
   const doc=raw&&typeof raw==='object'?raw:{};
   const vp=doc.viewport&&typeof doc.viewport==='object'?doc.viewport:{};
   const nodes=Array.isArray(doc.nodes)?doc.nodes:[];
   const edges=Array.isArray(doc.edges)?doc.edges:[];
   const cards=Array.isArray(doc.cards)?doc.cards:[];
   const models=Array.isArray(doc.models)?doc.models:[];
   return {
    viewport:{panX:asNumber(vp.panX,24),panY:asNumber(vp.panY,18),zoom:clamp(asNumber(vp.zoom,1),0.55,1.9)},
    nodes:nodes.map((n,i)=>normNode(n,i)).filter(Boolean),
    edges:edges.map((e,i)=>normEdge(e,i)).filter(Boolean),
    cards:cards.map((c,i)=>normAdaptiveCard(c,i)).filter(Boolean),
    models:models.map((m,i)=>normAdaptiveModel(m,i)).filter(Boolean)
   };
  }
  window.EditorCore = {
    normalizeDoc,
    normNode,
    normAdaptiveCard,
    normAdaptiveModel,
    normAdaptiveCardField,
    normAdaptiveModelProperty
  };
})();
