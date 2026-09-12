// 参数与求解器共用一份范围；倍率保留各材质原有差异，不改变网格与接触精度。
const shell = [
  {id:'stretch',label:'拉伸弹性',min:.35,max:1.6,step:.05,value:.85,unit:'×',hint:'越低越容易拉长，恢复拉伸形变的力越弱。'},
  {id:'bend',label:'弯曲弹性',min:.4,max:1.8,step:.05,value:.85,unit:'×',hint:'越低越容易弯折、掀起，展平的力越弱。'},
  {id:'damping',label:'回弹阻尼',min:6,max:30,step:1,value:16,unit:'/秒',hint:'越高越快消耗运动，松手后的弹动越少。'},
  {id:'adhesion',label:'耳壁黏附强度',min:.4,max:1.8,step:.05,value:1,unit:'×',hint:'越高越难从耳壁剥离。'},
  {id:'cohesion',label:'断裂韧性',min:.4,max:1.8,step:.05,value:1,unit:'×',hint:'越高越能承受拉扯与弯折，越不容易碎裂。'},
];
const gel = [
  {...shell[0]},
  {...shell[2],value:10},
  {id:'viscosity',label:'内部黏性',min:.5,max:2,step:.05,value:1,unit:'×',hint:'越高越能抑制局部抖动，让拉扯更黏滞。'},
  {id:'relaxation',label:'变形保留速度',min:.1,max:.7,step:.02,value:.32,unit:'/秒',hint:'越高越快适应拉长后的形状。'},
  {id:'recovery',label:'形状恢复速度',min:.04,max:.3,step:.01,value:.12,unit:'/秒',hint:'越低越慢恢复原形，形变保留更久。'},
  {...shell[3]},
];
function Freeze(value){Object.freeze(value);for(const child of Object.values(value))if(child&&typeof child==='object'&&!Object.isFrozen(child))Freeze(child);return value;}
export const WAX_PHYSICS_MATERIALS=Freeze({
  dry:{label:'干性薄层',fields:shell},wet:{label:'黏性耳垢',fields:shell},impacted:{label:'紧实硬结',fields:shell},oily:{label:'油性凝胶',fields:gel},
});
export const WAX_PHYSICS_STORAGE='earspa3d.physics.settings.v1';
export function NormalizeWaxPhysicsSettings(value){
  return Object.fromEntries(Object.entries(WAX_PHYSICS_MATERIALS).map(([type,{fields}])=>[type,Object.fromEntries(fields.map(field=>{
    const raw=value?.[type]?.[field.id];
    const clamped=typeof raw==='number'&&Number.isFinite(raw)?Math.max(field.min,Math.min(field.max,raw)):field.value;
    return [field.id,Number((field.min+Math.round((clamped-field.min)/field.step)*field.step).toFixed(6))];
  }))]));
}
let current=Freeze(NormalizeWaxPhysicsSettings());
// 冻结的材质对象可由热循环直接读取；外部快照独立复制，不能借探针写入配置。
export function WaxPhysicsMaterial(type){return current[type]||current.dry;}
export function WaxPhysicsSettings(){return structuredClone(current);}
export function SetWaxPhysicsSettings(value){current=Freeze(NormalizeWaxPhysicsSettings(value));return WaxPhysicsSettings();}
