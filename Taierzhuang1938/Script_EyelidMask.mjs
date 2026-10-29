// 《台儿庄：血战滕县》后期里的眼皮（2026-10-29）。纯字符串与取参，零 three（契约 2）。
//
// 完整画质的合成（Script_PostComposite）与白盒的输出（Script_WhiteboxRendering.WhiteboxOutputPass）共用这一份，
// 原来白盒那份是上下对称的一条缝、过渡只有屏高 2.5%，炸飞时一眨眼就是两道硬边（用户 2026-10-29：「眨眼的 mask 边缘过于锐利」）。
//
// 形状：上下两片眼皮，上眼皮走 upperShare 那一段（合拢处在屏高 1 − upperShare），中间弓起（curvature）、略斜（tilt），
// 边缘按 feather 平滑过渡；合到九成以上整片黑下去。
// 近爆的眨眼另给一组（uLidSoft，见 Data_Tuning_BlastReaction.BLAST_FLINCH.lidEdge）：
//   · feather 放宽到屏高的大半 —— 眼皮贴着眼球、就在瞳孔前面两三毫米，在视网膜上根本成不了一条边，
//     过渡宽度约等于「瞳孔直径 / 眼皮到瞳孔的距离」≈ 4 / 3 弧度，比整个竖直视野还宽；
//   · pupilDim：眼皮盖住一部分瞳孔，进眼的光整体少了 —— 眨眼看到的是整片暗下去、上面先暗一点，不是一条线扫下来。
// 开场剧情的闭眼（Data_Tuning_FirstLevel.OPENING_PERCEPTION 的 lid*）不带这一组，看到的仍是画出来的两片眼皮。

/** 放在 uv 声明之后；EyelidAperture(uv, 闭合 0..1) → 透进来的比例（1 = 全开）。 */
export const EYELID_GLSL = /* glsl */ `
uniform vec4 uLidShape;      // feather, curvature, tilt, upper lid share
uniform vec2 uLidSoft;       // x：近爆眨眼的 feather（0 = 用 uLidShape.x），y：盖住瞳孔的整体变暗
float EyelidAperture(vec2 uv, float eyeClosure){
  if (eyeClosure <= 0.0) return 1.0;
  float closure = clamp(eyeClosure, 0.0, 1.0);
  float f = uLidSoft.x > 0.0 ? uLidSoft.x : uLidShape.x;
  float x = uv.x * 2.0 - 1.0;
  float arc = uLidShape.y * x * x * closure, tilt = uLidShape.z * x * closure;
  float upper = 1.0 + f - closure * (uLidShape.w + f) - arc + tilt;
  float lower = -f + closure * (1.0 - uLidShape.w + f) + arc + tilt;
  float aperture = smoothstep(lower - f, lower + f, uv.y) * (1.0 - smoothstep(upper - f, upper + f, uv.y));
  aperture *= 1.0 - uLidSoft.y * closure;
  return aperture * (1.0 - smoothstep(0.90, 1.0, closure));
}
`;

/** uLidShape 的四个数（开场剧情那套眼皮）。 */
export function LidShapeArray(perception) {
  return [perception.lidFeather, perception.lidCurve, perception.lidTilt, perception.lidUpperShare];
}

/** 每帧：近爆眨眼给的 [feather, pupilDim]（Script_Main.BlastLidEdge），不给就是开场那套（0, 0）。 */
export function LidSoftArray(lidEdge) {
  return Array.isArray(lidEdge) ? [Math.max(0, lidEdge[0] || 0), Math.min(1, Math.max(0, lidEdge[1] || 0))] : [0, 0];
}
