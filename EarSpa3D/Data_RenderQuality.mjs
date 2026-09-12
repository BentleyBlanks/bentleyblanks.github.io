export const RENDER_QUALITY_STORAGE = 'earspa3d.render.settings.v1';
const levels = [['off', '关闭'], ['low', '低'], ['mid', '中'], ['high', '高']];
export const RENDER_QUALITY_FIELDS = [
  {id:'resolution', label:'画面分辨率', hint:'低档更流畅，高档保留更多细节；自动根据设备调整。', options:[['auto','自动'],...levels.slice(1)]},
  {id:'shadows', label:'动态阴影', hint:'器具与耳垢投影。低 / 中 / 高使用 512 / 1024 / 2048 精度。', options:[['auto','自动'],...levels]},
  {id:'contact', label:'接触遮蔽', hint:'贴壁暗缝与短距离接触阴影。等级越高，接触光线采样越多。', options:levels},
  {id:'scattering', label:'皮肤散射', hint:'调整皮肤柔和透光与耳缘暖色散射强度。', options:levels},
  {id:'wetness', label:'湿润与油膜', hint:'调整湿润高光、油性凝胶透光和内部柔光。', options:levels},
  {id:'detail', label:'表面细节', hint:'调整皮纹、器具加工纹与凝胶细小凹凸；高等级增加凝胶细节层数。', options:levels},
  {id:'reflections', label:'环境反射', hint:'调整金属、皮肤及油膜的环境反射强度。', options:levels},
  {id:'fur', label:'绒羽细丝', hint:'低 / 中 / 高显示 2 / 4 / 6 层细丝，关闭后保留羽枝与完整接触。', options:levels},
];
export function NormalizeRenderQuality(input) {
  const source=input&&typeof input==='object'?input:{};
  return {enabled:typeof source.enabled==='boolean'?source.enabled:true,...Object.fromEntries(RENDER_QUALITY_FIELDS.map(field=>[field.id,field.options.some(([id])=>id===source[field.id])?source[field.id]:['resolution','shadows'].includes(field.id)?'auto':'high']))};
}
export function RenderQualityPreset(id='default') {
  if(!['low','mid','high'].includes(id))return NormalizeRenderQuality();
  return NormalizeRenderQuality({enabled:true,...Object.fromEntries(RENDER_QUALITY_FIELDS.map(field=>[field.id,id]))});
}
export function ResolveRenderQuality(input) {
  const settings=NormalizeRenderQuality(input),strength={off:0,low:.35,mid:.65,high:1};
  return {...settings,...Object.fromEntries(RENDER_QUALITY_FIELDS.filter(f=>!['resolution','shadows'].includes(f.id)).map(f=>[f.id,settings.enabled?strength[settings[f.id]]:0])),shadows:settings.enabled?settings.shadows:'off',contactSamples:settings.enabled?({off:0,low:1,mid:2,high:4}[settings.contact]):0,detailLayers:settings.enabled?({off:0,low:1,mid:2,high:3}[settings.detail]):0,furLayers:settings.enabled?({off:0,low:2,mid:4,high:6}[settings.fur]):0};
}
