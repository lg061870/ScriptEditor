(function(){
  function clearSvg(svg){ while(svg.firstChild) svg.removeChild(svg.firstChild); }
  function curve(s,t){
    const dx=t.x-s.x;
    const dy=t.y-s.y;
    if(Math.abs(dx)<=1||Math.abs(dy)<=1) return `M ${s.x} ${s.y} L ${t.x} ${t.y}`;
    const b=Math.max(60,Math.abs(dx)*0.42);
    return `M ${s.x} ${s.y} C ${s.x+b} ${s.y}, ${t.x-b} ${t.y}, ${t.x} ${t.y}`;
  }

  function renderEdges(ctx){
    const {state, svg, portById, portMeta, isExceptionPort, portPoint, SVG_NS} = ctx;
    clearSvg(svg);
    state.doc.edges.forEach((edge)=>{
      const sourcePort=portById(edge.from); if(!sourcePort) return;
      const sourceMeta=portMeta(edge.from);
      const targetMeta=edge.to?portMeta(edge.to):null;
      const isExceptionEdge=isExceptionPort(sourceMeta?.port)||isExceptionPort(targetMeta?.port);
      const edgeStroke=isExceptionEdge?'#d94a5f':'#5f6478';
      const sourcePoint=portPoint(sourcePort); if(!sourcePoint) return;
      let targetPoint=null;
      if(edge.to){
        const tp=portById(edge.to);
        targetPoint=tp?portPoint(tp):null;
      }
      if(!targetPoint) return;
      const path=document.createElementNS(SVG_NS,'path');
      path.classList.add('edge-path');
      if(isExceptionEdge) path.classList.add('edge-path--exception');
      path.dataset.edgeId=edge.id;
      path.dataset.from=edge.from;
      if(edge.to) path.dataset.to=edge.to;
      path.setAttribute('fill','none');
      path.setAttribute('stroke',edgeStroke);
      path.setAttribute('stroke-width','3');
      path.setAttribute('stroke-linecap','round');
      path.setAttribute('stroke-linejoin','round');
      path.setAttribute('d',curve(sourcePoint,targetPoint));
      svg.appendChild(path);
    });

    if(state.mode==='connect' && state.connectFromPortId){
      const src=portById(state.connectFromPortId);
      const sp=src?portPoint(src):null;
      if(sp){
        const previewSourceMeta=portMeta(state.connectFromPortId);
        const previewIsException=isExceptionPort(previewSourceMeta?.port);
        const previewStroke=previewIsException?'#d94a5f':'#5f6478';
        const prev=document.createElementNS(SVG_NS,'path');
        prev.classList.add('edge-path','connection-preview');
        if(previewIsException) prev.classList.add('edge-path--exception');
        prev.setAttribute('fill','none');
        prev.setAttribute('stroke',previewStroke);
        prev.setAttribute('stroke-width','3');
        prev.setAttribute('stroke-linecap','round');
        prev.setAttribute('stroke-linejoin','round');
        prev.setAttribute('stroke-dasharray','7 5');
        prev.setAttribute('opacity','0.65');
        prev.setAttribute('d',curve(sp,{x:state.previewX,y:state.previewY}));
        svg.appendChild(prev);
      }
    }
  }

  window.EditorRendering=window.EditorRendering||{};
  window.EditorRendering.renderEdges=renderEdges;
})();
