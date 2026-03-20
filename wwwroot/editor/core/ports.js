(function(){
  const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
  const CUSTOM_PORT_PATTERN=/^custom-(top|right|bottom|left)-(-?\d+(?:\.\d+)?)$/i;
  const STANDARD_PORT_ANCHORS={
    'left-upper':{edge:'left',ratio:24},
    'left-lower':{edge:'left',ratio:76},
    'left':{edge:'left',ratio:50},
    'right-upper':{edge:'right',ratio:24},
    'right-lower':{edge:'right',ratio:76},
    'right-middle':{edge:'right',ratio:50},
    'right':{edge:'right',ratio:50},
    'top-left':{edge:'top',ratio:24},
    'top-right':{edge:'top',ratio:76},
    'top':{edge:'top',ratio:50},
    'bottom-left':{edge:'bottom',ratio:24},
    'bottom-right':{edge:'bottom',ratio:76},
    'bottom':{edge:'bottom',ratio:50}
  };
  function normalizeType(type){
    const value=String(type??'').trim().toLowerCase();
    return value.length?value:'string';
  }
  function parseCustomPortPosition(position){
    const match=CUSTOM_PORT_PATTERN.exec(String(position??'').trim().toLowerCase());
    if(!match)return null;
    return {edge:match[1],ratio:clamp(Number.parseFloat(match[2]),0,100)};
  }
  function normPort(raw,ni,pi){
    if(!raw||typeof raw!=='object')return null;
    const dir=String(raw.direction||'input').toLowerCase()==='output'?'output':'input';
    const pos=String(raw.position||(dir==='output'?'right':'left')).toLowerCase();
    const genderRaw=String(raw.portGender||raw.gender||'').toLowerCase();
    const gender=genderRaw==='female'||genderRaw==='male'
     ? genderRaw
     : '';
    return {
     id:String(raw.id||`node-${ni+1}-port-${pi+1}`),
     name:String(raw.name||`Port ${pi+1}`),
     direction:dir,
     type:normalizeType(raw.type),
     position:parseCustomPortPosition(raw.position||pos)?String(raw.position):pos,
     portGender:gender
    };
  }
  window.EditorPorts = {
    normPort,
    parseCustomPortPosition,
    STANDARD_PORT_ANCHORS,
    CUSTOM_PORT_PATTERN,
    normalizeType
  };
})();
