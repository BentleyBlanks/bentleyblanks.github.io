// 烟场样式（纯数据 + 纯函数，零依赖）：路边 / 中景那几种烟柱的「长什么样」。
//
// 「烟放在哪」归各关自己（第一关见 Data_FirstLevelDistantSmoke，按路线与地块撒点）；
// 「一根烟柱多高多宽、什么透明度、活多久」是效果本身的定义，放在这里 ——
// 特效预览窗口直接拿样式出预览，不必为此载入第一关的路线、地块与地形。

/** 六种烟场样式，frame 对应烟体图集的帧（0 浓黑烟柱 … 5 间歇土烟）。 */
export const PLUME_STYLES = Object.freeze([
  { type:"sootColumn", frame:0, height:9, width:4.6, base:.9, aspect:1.08, opacity:.23, life:18 },
  { type:"billowColumn", frame:1, height:7, width:6.0, base:1.3, aspect:.95, opacity:.35, life:12 },
  { type:"dustBank", frame:2, height:2.8, width:6.0, base:2.2, aspect:.45, opacity:.25, life:10 },
  { type:"windShear", frame:3, height:3.6, width:7.0, base:2.0, aspect:.34, opacity:.25, life:11 },
  { type:"groundScreen", frame:4, height:2.6, width:6.0, base:1.4, aspect:.62, opacity:.38, life:10 },
  { type:"burstDust", frame:5, height:5.0, width:6.5, base:.8, aspect:.84, opacity:.43, life:11 },
].map(Object.freeze));

/**
 * 一根烟柱的 backdrop 参数（交给 VfxSystem.SmokeSource 的 options.backdrop）。
 * random 依次抽两次：种子、寿命抖动（调用方的随机序列靠这个顺序保持稳定）。
 * tier 为 "middle" 时高与冠宽放大 1.5 倍。
 */
export function PlumeProfile(style, scale, random, tier = "near") {
  const size = tier === "middle" ? 1.5 : 1;
  return Object.freeze({type:style.type,frame:style.frame,seed:Math.floor(random()*0xffffffff),
    height:style.height*scale*size,baseWidth:style.base*scale,crownWidth:style.width*scale*size,
    aspect:style.aspect,opacity:style.opacity,life:style.life*(.85+random()*.3),spread:scale*.65,
    driftX:-(style.frame===3?3.5:2.4)*scale,driftZ:-.5*scale,nearFade:2.4});
}
