import {WAX_PHYSICS_MATERIALS,WAX_PHYSICS_STORAGE,WaxPhysicsSettings,SetWaxPhysicsSettings} from './Data_WaxPhysicsSettings.mjs?v=ear028-physics-settings-20260912';

export function CreatePhysicsSettings(section){
  let stored=null,loadFailed=false;
  try{stored=JSON.parse(localStorage.getItem(WAX_PHYSICS_STORAGE)||'null');}catch{loadFailed=true;}
  SetWaxPhysicsSettings(stored);
  section.innerHTML=`<h3 id="debug-title">Debug</h3><details id="physics-settings"><summary>物理模拟<span aria-hidden="true">＋</span></summary><div class="physics-content">
    <p class="physics-intro">按材质调节耳垢。关闭设置后生效，当前耳垢与后续客人都会使用这些参数。</p>
    <label class="physics-material-label" for="physics-material">耳垢材质</label><select id="physics-material">${Object.entries(WAX_PHYSICS_MATERIALS).map(([id,{label}])=>`<option value="${id}">${label}</option>`).join('')}</select>
    <p class="physics-note">倍数以各材质原有特性为基准。</p><div id="physics-fields"></div>
    <button id="physics-reset" type="button">恢复全部默认参数</button><p id="physics-status" role="status" aria-live="polite">${loadFailed?'未能读取已存参数，已使用默认值。':'参数保存在本机，可随时恢复默认值。'}</p>
  </div></details>`;
  const Find=id=>section.querySelector('#'+id),material=Find('physics-material'),fields=Find('physics-fields'),status=Find('physics-status');
  function Format(field,value){return (field.step===1?value.toFixed(0):value.toFixed(2))+' '+field.unit;}
  function Render(){
    const type=material.value,values=WaxPhysicsSettings()[type];
    fields.innerHTML=WAX_PHYSICS_MATERIALS[type].fields.map(field=>`<div class="physics-field"><div><label for="physics-${field.id}">${field.label}</label><output id="physics-${field.id}-value" for="physics-${field.id}">${Format(field,values[field.id])}</output></div><input id="physics-${field.id}" data-parameter="${field.id}" type="range" min="${field.min}" max="${field.max}" step="${field.step}" value="${values[field.id]}" aria-describedby="physics-${field.id}-hint"><p id="physics-${field.id}-hint">${field.hint}</p></div>`).join('');
  }
  function Save(message){
    try{localStorage.setItem(WAX_PHYSICS_STORAGE,JSON.stringify(WaxPhysicsSettings()));status.textContent=message+'，已保存到本机。';}
    catch{status.textContent=message+'；本机存储不可用，仅本次会话有效。';}
  }
  fields.addEventListener('input',event=>{
    const id=event.target.dataset.parameter,field=WAX_PHYSICS_MATERIALS[material.value].fields.find(f=>f.id===id);if(!field)return;
    const next=WaxPhysicsSettings();next[material.value][id]=event.target.valueAsNumber;
    const values=SetWaxPhysicsSettings(next)[material.value];event.target.value=values[id];Find('physics-'+id+'-value').textContent=Format(field,values[id]);Save('参数已更新');
  });
  material.addEventListener('change',Render);
  Find('physics-reset').addEventListener('click',()=>{SetWaxPhysicsSettings();Render();Save('全部材质已恢复默认');});
  Render();
  return {Snapshot:WaxPhysicsSettings};
}
