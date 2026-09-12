import {RENDER_QUALITY_STORAGE,RENDER_QUALITY_FIELDS,NormalizeRenderQuality,RenderQualityPreset} from './Data_RenderQuality.mjs?v=ear040-render-settings-20260912';

export function CreateRenderQualitySettings(section,Apply) {
  let settings,loadFailed=false;
  try{settings=NormalizeRenderQuality(JSON.parse(localStorage.getItem(RENDER_QUALITY_STORAGE)||'null'));}catch{settings=NormalizeRenderQuality();loadFailed=true;}
  section.innerHTML=`<summary>画质<span aria-hidden="true">＋</span></summary><div class="quality-content">
    <p>即时调整，自动保存在本机。</p>
    <label class="slider-row" for="quality-enabled">模拟渲染效果<input id="quality-enabled" type="checkbox"></label>
    <label class="quality-field" for="quality-preset"><span>画质预设</span><select id="quality-preset"><option value="default">默认 · 设备自适应</option><option value="low">流畅</option><option value="mid">均衡</option><option value="high">精细</option><option value="custom" disabled>自定义</option></select></label>
    ${RENDER_QUALITY_FIELDS.map(f=>`<div class="quality-field"><label for="quality-${f.id}">${f.label}</label><select id="quality-${f.id}" data-quality="${f.id}" aria-describedby="quality-${f.id}-hint">${f.options.map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select><p id="quality-${f.id}-hint">${f.hint}</p></div>`).join('')}
    <button id="quality-reset" type="button">恢复默认画质</button><p id="quality-status" role="status" aria-live="polite">${loadFailed?'未能读取已存画质，已使用默认值。':'默认保留当前画面效果。'}</p></div>`;
  const Find=id=>section.querySelector('#quality-'+id);
  function Render(){
    Find('enabled').checked=settings.enabled;
    Find('preset').value=['default','low','mid','high'].find(id=>JSON.stringify(RenderQualityPreset(id))===JSON.stringify(settings))||'custom';
    for(const field of RENDER_QUALITY_FIELDS){Find(field.id).value=settings[field.id];Find(field.id).disabled=!settings.enabled&&field.id!=='resolution';}
  }
  function Change(message){
    settings=NormalizeRenderQuality(settings);Apply(settings);Render();
    try{localStorage.setItem(RENDER_QUALITY_STORAGE,JSON.stringify(settings));Find('status').textContent=message+'，已保存到本机。';}catch{Find('status').textContent=message+'；本机存储不可用，仅本次会话有效。';}
  }
  Find('enabled').onchange=event=>{settings.enabled=event.target.checked;Change(settings.enabled?'已启用所选效果':'模拟渲染效果已关闭，分项选择已保留');};
  Find('preset').onchange=event=>{settings=RenderQualityPreset(event.target.value);Change('画质预设已应用');};
  for(const field of RENDER_QUALITY_FIELDS)Find(field.id).onchange=event=>{settings[field.id]=event.target.value;Change(field.label+'已更新');};
  Find('reset').onclick=()=>{settings=NormalizeRenderQuality();Change('已恢复默认画质');};
  Render();Apply(settings);
  return {Snapshot:()=>({...settings})};
}
