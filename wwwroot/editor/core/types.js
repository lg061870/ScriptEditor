(function(){
  function normalizeType(type){
    const value=String(type??'').trim().toLowerCase();
    return value.length?value:'string';
  }
  function typesCompatible(outputType,inputType){
    const source=normalizeType(outputType);
    const target=normalizeType(inputType);
    if(source==='adaptive-card'&&target==='adaptive-card')return true;
    if(source==='adaptive-model'&&target==='adaptive-model')return true;
    if(source==='adaptive-submission'&&(target==='adaptive-submission'||target==='any'))return true;
    if(source===target)return true;
    if(source==='any'||target==='any')return true;
    return false;
  }
  window.EditorTypes = {
    typesCompatible,
    normalizeType
  };
})();
