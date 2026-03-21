(function(){
  function renderAdaptiveNode(type,node,doc,renderFlowNode){
    if(type==='adaptive-card-activity'||type==='adaptivecardactivity'||type==='adaptive-card'){
      const nodes=Array.isArray(doc?.nodes)?doc.nodes:[];
      const edges=Array.isArray(doc?.edges)?doc.edges:[];
      const cardPortId=`${node.id}-card-in`;
      const modelPortId=`${node.id}-model-in`;
      const cardEdge=edges.find((e)=>e.to===cardPortId)||null;
      const modelEdge=edges.find((e)=>e.to===modelPortId)||null;
      const resolveSourceNode=(edge)=>nodes.find((n)=>n.ports?.some?.((p)=>p.id===edge?.from))||null;
      const cardSource=cardEdge?resolveSourceNode(cardEdge):null;
      const modelSource=modelEdge?resolveSourceNode(modelEdge):null;
      const cardLabel=cardSource&&cardSource.type==='adaptive-card-definition'
        ? (cardSource.data?.name||cardSource.id)
        : '(not connected)';
      const modelLabel=modelSource&&modelSource.type==='adaptive-model-definition'
        ? (modelSource.data?.name||modelSource.id)
        : '(not connected)';
      return renderFlowNode(node,{
        className:'node-adaptive-card-activity',
        mark:'▣',
        title:'AdaptiveCardActivity',
        subtitle:'Binds a card layout + model schema from connected definition nodes.',
        fields:[
          {label:'Card',value:cardLabel},
          {label:'Model',value:modelLabel},
          {label:'Submission Context Key',value:node.data.submissionContextKey||node.id},
          {label:'Required',value:node.data.isRequired||'true'}
        ],
        footer:'Adaptive submission'
      });
    }

    if(type==='adaptive-card-definition'){
      return renderFlowNode(node,{
        className:'node-adaptive-card-definition',
        mark:'▣',
        title:'Adaptive Card Definition',
        subtitle:'Provides an adaptive card layout.',
        fields:[
          {label:'Id',value:node.data.id||node.id},
          {label:'Name',value:node.data.name||'(unnamed)'},
          {label:'JSON',value:(node.data.json||'').slice(0,60)+(node.data.json?.length>60?'…':'')}
        ],
        footer:'Card output'
      });
    }

    if(type==='adaptive-model-definition'){
      return renderFlowNode(node,{
        className:'node-adaptive-model-definition',
        mark:'⌗',
        title:'Adaptive Model Definition',
        subtitle:'Provides an adaptive card model schema.',
        fields:[
          {label:'Id',value:node.data.id||node.id},
          {label:'Name',value:node.data.name||'(unnamed)'},
          {label:'Properties',value:Array.isArray(node.data.properties)?node.data.properties.length:'0'}
        ],
        footer:'Model output'
      });
    }

    return null;
  }

  window.EditorRendering=window.EditorRendering||{};
  window.EditorRendering.renderAdaptiveNode=renderAdaptiveNode;
})();
