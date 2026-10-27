// 《台儿庄：血战滕县》落地扬尘与粒子之间的前后关系（2026-10-28）。纯字符串与 uniform 工厂，零 three（契约 2）。
//
// 问题（用户：「两个爆炸一起放、或者在扬尘里往外看，雾效重叠显示不对，更远的烟居然出现在面前的烟之前」）：
//   落地扬尘（Script_DustFieldRenderer）在降分辨率那一趟画好，主场景里一张全屏片按 hdr·T + C 叠上去；
//   烟、火、溅射土这些粒子是另外画的透明物，都不写深度。原来全屏片和三个烟池同一个 renderOrder（6），
//   three 只好按创建先后排：排在它前面画的烟一律被尘盖住（哪怕烟更近），排在它后面画的透明物一律盖在尘上（哪怕更远）。
//
// 做法：
//   1. 尘那一趟多写一张「尘的前沿深度」：沿视线按不透明度加权的平均视深度，r = Σ z·α、g = Σ α
//     （与颜色同一次绘制，MRT 的第二张；按同一个「前面盖后面」的混合叠，前面那团的权重大）。
//   2. 全屏片挪到所有粒子之前画（DUST_COMPOSITE_RENDER_ORDER）。
//   3. 之后画的粒子片元比尘的前沿远，就乘上尘的透过率（等于藏在尘后面）；比前沿近，照常画在尘上面。
//      前沿前后 ±0.6 m 平滑过渡（粒子本身是软的，硬切会在尘边上描出一圈）。
// 没有降分辨率尘的帧 uDustOcclusion = 0，粒子着色器走原路，逐位不变。
//
// 近似在哪：透过率用的是整条视线上的尘（到场景深度为止），粒子若正好埋在一团很厚的尘中间，后半截尘也算在它前面了。
// 尘与尘之间的前后由 DustFieldSystem.SortForCamera 按到尘团质心的距离排（远的先画）。

/** 尘的合成片（以及没开降分辨率时尘团本身）的 renderOrder：排在贴地尘环（5）、体积烟（5）、烟池（6）之前。 */
export const DUST_COMPOSITE_RENDER_ORDER = 4.5;

/** 粒子着色器共用：放在 uResolution 声明之后。DustBehindTransmittance(视深度) → 1 = 不被尘挡，T = 整个在尘后面。 */
export const DUST_OCCLUSION_GLSL = /* glsl */ `
uniform sampler2D uDustHalf;    // 降分辨率尘：rgb 预乘散射，a 累积透过率
uniform sampler2D uDustFront;   // 尘的前沿视深度：r = Σ z·α，g = Σ α
uniform float uDustOcclusion;   // 1 = 本帧有降分辨率尘
float DustBehindTransmittance(float viewDepth){
  if (uDustOcclusion < 0.5) return 1.0;
  vec2 dustUv = gl_FragCoord.xy / uResolution;
  vec4 front = texture2D(uDustFront, dustUv);
  if (front.g < 0.004) return 1.0;
  float dustDepth = front.r / front.g;
  float dustT = texture2D(uDustHalf, dustUv).a;
  return mix(1.0, dustT, smoothstep(dustDepth - 0.6, dustDepth + 0.6, viewDepth));
}
`;

/** Vfx 的共享 uniform 里放这三项（所有粒子材质按引用拿到同一份；DustFieldSystem 每帧填）。 */
export function DustOcclusionUniforms() {
  return { uDustHalf: { value: null }, uDustFront: { value: null }, uDustOcclusion: { value: 0 } };
}
