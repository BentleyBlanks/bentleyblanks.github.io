// 《台儿庄：血战滕县》后期里的眼皮（2026-10-29）。纯字符串与取参，零 three（契约 2）。
//
// 完整画质的合成（Script_PostComposite）用这一份（原来白盒画质的输出 pass 也共用，2026-10-31 已删），
// 原来白盒那份是上下对称的一条缝、过渡只有屏高 2.5%，炸飞时一眨眼就是两道硬边（用户 2026-10-29：「眨眼的 mask 边缘过于锐利」）。
//
// 形状：上下两片眼皮，上眼皮走 upperShare 那一段（合拢处在屏高 1 − upperShare），中间弓起（curvature）、略斜（tilt），
// 边缘按 feather 平滑过渡；合到九成以上整片黑下去。
// 近爆的眨眼另给一组（uLidSoft，见 Data_Tuning_BlastReaction.BLAST_FLINCH.lidEdge）：
//   · feather 放宽到屏高的大半 —— 眼皮贴着眼球、就在瞳孔前面两三毫米，在视网膜上根本成不了一条边，
//     过渡宽度约等于「瞳孔直径 / 眼皮到瞳孔的距离」≈ 4 / 3 弧度，比整个竖直视野还宽；
//   · pupilDim：眼皮盖住一部分瞳孔，进眼的光整体少了 —— 眨眼看到的是整片暗下去、上面先暗一点，不是一条线扫下来。
// 开场剧情的闭眼（Data_Tuning_FirstLevel.OPENING_PERCEPTION 的 lid*）不带这一组，看到的仍是画出来的两片眼皮。
//
// 同一天第二轮（用户：「都加上」）又加了两样，也只在近爆时有：
//   · 透光跟着画面亮度走（uLidLight）：眼皮是散光的皮肉，透进来的是外面整片光的平均 —— 在画面上取 4×3 个点的显示亮度，
//     按行 / 列插出一片很缓的明暗，乘到透光颜色上（上面是天就上面亮，火光在哪边哪边亮）。
//     取点的那个函数 LidSceneLuma 由各个 pass 自己给（合成要过曝光与色调映射，白盒的输入已经是显示线性）。
//   · 火光残影（uAfterimage）：火球正对着眼睛时视网膜被漂白的那一块，钉在画面上的同一个位置 ——
//     亮的暖色印子（闭着眼最清楚）一秒内变成暗的、偏青的斑，几秒退掉。时间曲线在 Script_BlastFlinch，数在 BLAST_FLINCH.afterimage。
// 睁眼后亮一下走曝光（合成乘在 uExposure 上，白盒乘在输入上），睁眼后发糊走恍惚的发糊通道，都不在这里。

/** 放在 uv 声明之后；EyelidAperture(uv, 闭合 0..1) → 透进来的比例（1 = 全开）；EyeView 做最后一步。 */
export const EYELID_GLSL = /* glsl */ `
uniform vec4 uLidShape;      // feather, curvature, tilt, upper lid share
uniform vec2 uLidSoft;       // x：近爆眨眼的 feather（0 = 用 uLidShape.x），y：盖住瞳孔的整体变暗
uniform vec3 uLidLight;      // x：透光跟着画面亮度走时的参考亮度（0 = 固定颜色），y：散光后留下的明暗分布，z：最多亮几倍
uniform vec4 uAfterimage;    // xy：火光在画面上的位置（uv），z：印子半径（屏高的比例），w：宽高比
uniform vec4 uAfterimageAmp; // x：正残像（亮、暖），y：负残像（暗、偏青），z：形状种子
// 画面某一点的显示亮度（曝光、色调映射之后，线性）：用这一段的 pass 自己定义。
float LidSceneLuma(vec2 uv);
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
// 一列三个点（下、中、上）与这一列的平均。
vec4 LidColumn(float x){
  float a = LidSceneLuma(vec2(x, 1.0 / 6.0)), b = LidSceneLuma(vec2(x, 0.5)), c = LidSceneLuma(vec2(x, 5.0 / 6.0));
  return vec4(a, b, c, (a + b + c) / 3.0);
}
// 透光的亮度倍数：4×3 个点的行平均管上下、列平均管左右，按 uLidLight.y 跟整片平均混，再除以参考亮度。
float LidLightScale(vec2 uv){
  vec4 c0 = LidColumn(0.125), c1 = LidColumn(0.375), c2 = LidColumn(0.625), c3 = LidColumn(0.875);
  vec3 rows = (c0.xyz + c1.xyz + c2.xyz + c3.xyz) * 0.25;
  float avg = (rows.x + rows.y + rows.z) / 3.0;
  float row = uv.y < 0.5 ? mix(rows.x, rows.y, clamp((uv.y - 1.0 / 6.0) * 3.0, 0.0, 1.0))
                         : mix(rows.y, rows.z, clamp((uv.y - 0.5) * 3.0, 0.0, 1.0));
  float t = clamp(uv.x * 4.0 - 0.5, 0.0, 3.0);
  float column = t < 1.0 ? mix(c0.w, c1.w, t) : t < 2.0 ? mix(c1.w, c2.w, t - 1.0) : mix(c2.w, c3.w, t - 2.0);
  float local = row * column / max(avg, 1e-4);
  return clamp(mix(avg, local, uLidLight.y) / max(uLidLight.x, 1e-4), 0.0, uLidLight.z);
}
// 残影的形状：软的一团，横着略宽（火球往两边散），边上带一点不规则。
float AfterimageBlob(vec2 uv){
  vec2 d = (uv - uAfterimage.xy) * vec2(uAfterimage.w * 0.85, 1.0) / max(uAfterimage.z, 1e-3);
  float a = atan(d.y, d.x);
  float r = length(d) * (1.0 + 0.07 * sin(a * 3.0 + uAfterimageAmp.z) + 0.05 * sin(a * 5.0 - uAfterimageAmp.z * 1.7));
  return exp(-r * r * 1.4);
}
// 最后一步（显示线性）：color = 这一点的颜色，glow = 眼皮透光（参考亮度下的颜色）。
vec3 EyeView(vec3 color, vec2 uv, float eyeClosure, vec3 glow){
  float aperture = EyelidAperture(uv, eyeClosure);
  if (aperture < 0.999 && uLidLight.x > 0.0) glow *= LidLightScale(uv);
  color = max(color, vec3(0.0));
  if (uAfterimageAmp.x + uAfterimageAmp.y > 0.002) {
    float blob = AfterimageBlob(uv);
    float pos = uAfterimageAmp.x * blob, neg = uAfterimageAmp.y * blob;
    // 负残像：漂白的那块对火光的橙黄不灵了，看过去发暗、偏青；正残像是亮的暖色，压在眼皮的暗红上最清楚。
    color = color * (1.0 - neg * vec3(0.55, 0.45, 0.3)) + pos * vec3(0.12, 0.07, 0.025);
    glow = glow * (1.0 - neg * 0.8) + pos * vec3(0.55, 0.30, 0.10);
  }
  return color * aperture + glow * (1.0 - aperture);
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

/** 每帧：透光跟着画面亮度走的 [参考亮度, 明暗分布, 最多几倍]（Script_Main.BlastLidLight），不给就是固定颜色。 */
export function LidLightArray(lidLight) {
  if (!Array.isArray(lidLight) || !(lidLight[0] > 0)) return [0, 0, 1];
  return [lidLight[0], Math.min(1, Math.max(0, lidLight[1] || 0)), Math.max(1, lidLight[2] || 1)];
}

/**
 * 每帧：火光残影 [u, v, 半径, 宽高比, 正, 负, 种子]（Script_Main.BlastAfterimage）→ 两个 vec4 的数；不给就全零（不画）。
 */
export function AfterimageArrays(afterimage) {
  if (!Array.isArray(afterimage) || !(afterimage[2] > 0)) return { shape: [0.5, 0.5, 0, 1], amp: [0, 0, 0, 0] };
  const [u, v, radius, aspect, positive, negative, seed] = afterimage;
  return { shape: [u, v, radius, aspect || 1], amp: [Math.max(0, positive || 0), Math.max(0, negative || 0), seed || 0, 0] };
}
