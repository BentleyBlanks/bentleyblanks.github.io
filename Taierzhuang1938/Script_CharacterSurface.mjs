import { ManagedTextureLoader } from "./Script_TextureImports.mjs";
// 人物表面层（2026-09-28，3A 迭代 B3）：日军呢子 / 钢盔 / 皮革、皮肤、装具、泥污磨损落灰。
// 口径：docs/Data_CharacterStandard.md「人物表面」；数值：Data_Tuning_Materials 的
// CHARACTER_SURFACE_PARTS / CHARACTER_GRIME / CHARACTER_SKIN / IJA_UNIFORM_COLORS / IJA_WOOL_DETAIL。
//
// 四条规矩：
//   · 部件按「模型 id × 材质名」查表（TagCharacterSurface），**在 ConfigureExternalPbr 之前**打标 ——
//     Script_Materials._UpgradeExternal 优先读标签里的 cls（皮肤接预积分散射、呢子换 Physical 加绒光）。
//   · program 数与进关预热是账（第一关 CPU / 编译都紧）：补丁 key 只随 GLSL 变，部件差异（呢子 / 装具、
//     配色、钢盔圆盘、平铺）一律 uniform；日军 COLOR_0 全白、打标时关掉顶点色，日军皮肤与国军皮肤共用程序。
//     合批变体（CHAR_BATCHED）不做依赖原 atlas UV 的东西，尸体层才能把同签名的分件拼成一张图集。
//   · 补丁一律走 Script_MaterialPatches 注册表，克隆走 CloneShadedMaterial；同一份源材质每种用法只出一份
//     变体（所有同模型的人共用，program 按部件共享，不按模型分）。国军布军装的换色仍在 Script_UniformColors，
//     它在自己的补丁后面接本层的公共段与泥污段（CharacterClothPatches）。
//   · 采样器：泥污 / 磨损 / 落灰是程序化的（零采样器，读蒙皮前的 position，不改顶点 → 蒙皮运动矢量不变）；
//     皮肤多一张微细节包，但同时摘掉 GLB 的 specularIntensityMap —— three 只读那张图的 alpha，而人物的
//     spec 图全是 RGB WebP（alpha 恒 1），摘掉逐像素无差，腾出的槽给细节包（皮肤仍是 16）；
//     呢子多一张细节包（呢子材质本来只有 13）。远景合批（BatchedMesh，多一个采样器）的皮肤、呢子与国军布
//     不采细节包。门禁 Script_SamplerBudgetTest、Script_CharacterSurfaceTest。
import * as THREE from "three";
import {
  CHARACTER_SURFACE_PARTS, CHARACTER_GRIME, CHARACTER_SKIN, IJA_UNIFORM_COLORS, IJA_WOOL_DETAIL, CLOTH_SHEEN,
  CHARACTER_WHITE_VERTEX_COLOR_MODELS,
} from "./Data_Tuning_Materials.mjs";
import { CloneShadedMaterial } from "./Script_Materials.mjs";
import { ApplyPatches, MakePatch, PatchesOf } from "./Script_MaterialPatches.mjs";

// 补丁 key 只随 GLSL 变，部件之间的差异全走 uniform（key 不同 = 程序不同 = 进关多编一份，见 Data_Tuning_Materials 抬头）。
export const CHARACTER_SURFACE_PATCH_KEYS = Object.freeze({
  common: "charCommon1", grime: "charGrime1", skin: "charSkin1", wool: "ijaWool2",
});

const F = (value) => Number(value).toFixed(5);
const Linear = (hex) => new THREE.Color(hex);
const Luma = (color) => color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;

/** 给一棵人物树里查得到部件的材质打标（幂等；同一份材质被多个人共用，只打一次）。 */
export function TagCharacterSurface(root, modelId) {
  const parts = CHARACTER_SURFACE_PARTS[modelId];
  if (!root || !parts) return 0;
  const whiteVertexColors = CHARACTER_WHITE_VERTEX_COLOR_MODELS.includes(modelId);
  let tagged = 0;
  root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const part = material && parts[material.name];
      if (!part || material.userData.characterSurface) continue;
      // COLOR_0 全白（门禁逐点查过）：关掉顶点色逐像素无差，少一个编译参数，日军的皮肤 / 眼球与国军共用程序。
      // 只动表里的材质 —— 带脸皮的 Material_FacialOral 的顶点色是口腔颜色，不能关。
      if (whiteVertexColors && material.vertexColors) { material.vertexColors = false; material.needsUpdate = true; }
      // 纯 JSON：Material.copy / clone 走 JSON 深拷 userData，换类与克隆都会带过去。
      material.userData.characterSurface = JSON.parse(JSON.stringify({ modelId, ...part }));
      tagged += 1;
    }
  });
  return tagged;
}

/** 一份材质的部件标签（没打过标返回 null）。 */
export function CharacterSurfaceOf(material) {
  return material?.userData?.characterSurface || null;
}

// ---------------------------------------------------------------------------
// 共享贴图（与 Script_UniformColors 的布纹包同一个模式：先挂一张中性 1×1，图到了原地换，不重编译）
// ---------------------------------------------------------------------------
function DetailTexture(file) {
  const neutral = new THREE.DataTexture(new Uint8Array([128, 128, 128, 128]), 1, 1, THREE.RGBAFormat);
  neutral.colorSpace = THREE.NoColorSpace;
  neutral.needsUpdate = true;
  const uniform = { value: neutral };
  if (typeof document !== "undefined") {
    // 数据表里的路径自带 ?v= 戳。
    new ManagedTextureLoader(undefined, { flipY: false }).load(new URL(file, import.meta.url).href, (texture) => {
      // 数据不是颜色；glTF 的 UV 朝向（flipY = false），与它骑着的 atlas 一致。
      texture.colorSpace = THREE.NoColorSpace;
      texture.flipY = false;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 4;
      texture.needsUpdate = true;
      uniform.value = texture;
      neutral.dispose();
    });
  }
  return uniform;
}

let shared = null;
function Shared() {
  if (shared) return shared;
  const G = CHARACTER_GRIME, S = CHARACTER_SKIN, I = IJA_UNIFORM_COLORS, W = IJA_WOOL_DETAIL;
  shared = {
    grime: {
      uCharGrimeShape: { value: new THREE.Vector4(G.mudTop, G.mudEdge, G.splashTop, G.splashDensity) },
      uCharGrimeScale: { value: new THREE.Vector2(G.noiseScale, G.splashScale) },
      uCharGrimeRough: { value: new THREE.Vector4(G.roughWet, G.roughDry, G.roughDust, G.roughWear) },
      // x 提亮, y 去饱和, z 泥里湿的比例
      uCharWear: { value: new THREE.Vector3(G.wearLift, G.wearDesat, G.wetShare) },
      uCharKnee: { value: new THREE.Vector3(...G.knee) },
      uCharMudWet: { value: Linear(G.mudWet) },
      uCharMudDry: { value: Linear(G.mudDry) },
      uCharDustTint: { value: Linear(G.dustTint) },
    },
    skin: {
      uCharSkinDetailMap: DetailTexture(S.detailTexture),
      uCharSkinTone: { value: Linear(S.tone) },
      // x 色相拉向 tone，y 去饱和，z 明度，w 凹处压暗
      uCharSkinGrade: { value: new THREE.Vector4(S.toneMix, S.desat, S.value, S.cavityAlbedo) },
      // x 细节法线权重，y 皮脂粗糙度起伏，z/w 淡出带
      uCharSkinNormal: { value: new THREE.Vector4(S.normalStrength, S.oilRoughness, S.fade[0], S.fade[1]) },
      // x 褶皱积泥，y 取模糊 mip 的偏置，z 污渍覆盖，w 污渍频率
      uCharSkinDirt: { value: new THREE.Vector4(S.creaseDirt, S.creaseBias, S.smudge, S.smudgeScale) },
      uCharSkinDirtTint: { value: Linear(S.dirtTint) },
      uCharSkinSweat: { value: new THREE.Vector2(S.sweat, S.sweatRoughness) },
    },
    wool: {
      uIjaWoolDetailMap: DetailTexture(W.texture),
      // x 布纹平铺，y 污渍平铺，z 布纹法线权重，w 斑驳平铺
      uIjaWoolTile: { value: new THREE.Vector4(W.weaveTile, W.grimeTile, W.normalStrength, W.mottleTile) },
      uIjaWoolFade: { value: new THREE.Vector2(W.normalFade[0], W.normalFade[1]) },
      uIjaWoolAlbedo: { value: new THREE.Vector3(W.weaveAlbedo, W.grimeAlbedo, W.mottleAlbedo) },
      uIjaWoolGrimeTint: { value: Linear(W.grimeTint) },
      uIjaWoolRough: { value: new THREE.Vector3(W.roughness, W.weaveRoughness, W.grimeRoughness) },
      uIjaLeather: { value: new THREE.Vector3(I.leatherValue, I.leatherDesat, I.leatherRoughness) },
      uIjaHelmetPaint: { value: Linear(I.helmetPaint) },
      uIjaHelmetSteel: { value: Linear(I.helmetSteel) },
      // x 开始磨损，y 圆盘边，z 崩口覆盖
      uIjaHelmetEdge: { value: new THREE.Vector3(I.helmetEdge[0], I.helmetEdge[1], I.helmetChips) },
      uIjaHelmetRough: { value: new THREE.Vector2(I.helmetRoughness, I.helmetWetRoughness) },
    },
    gear: { uCharGearTint: { value: Linear(I.gearTint) } },
  };
  return shared;
}

function Seed(text) {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return [(hash & 1023) / 51.2, ((hash >>> 10) & 1023) / 51.2, ((hash >>> 20) & 1023) / 51.2];
}

// ---------------------------------------------------------------------------
// GLSL
// ---------------------------------------------------------------------------

// 噪声（两个着色器都要）。平滑噪声是两组方向错开、互相扭曲的正弦（不散列、不插值）：第一版用的八角
// 散列值噪声、全在片元里算，ANGLE-D3D 的着色器编译器很吃不消 —— 人物预热的「等待着色器就绪」
// 26 s → 53 s（2026-09-28 A/B 实测）。现在低频的那几路（泥线、膝肘、袖口、落灰、皮肤污渍与汗）
// 都在**顶点**里算、插值下来（人物网格 2–5 cm 一个点，这些场都是十厘米量级），片元只做泥线那一刀
// （有符号距离插值后 smoothstep，边照样利）、溅点与细节包。
const NOISE_GLSL = /* glsl */`
float CharHash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
float CharNoise(vec3 p) {
  float a = sin(dot(p, vec3(1.00, 0.61, 0.37)) + 1.3 * sin(dot(p, vec3(-0.43, 0.89, 0.71)) * 1.7));
  float b = sin(dot(p, vec3(-0.72, 0.28, 1.13)) * 1.3 + 1.1 * sin(dot(p, vec3(0.57, -0.94, 0.21)) * 2.1 + 0.7));
  return 0.5 + 0.25 * (a + b);
}
float CharFbm(vec3 p) {
  return CharNoise(p) * 0.65 + CharNoise(p * 2.31 + 7.7) * 0.35;
}
`;

const COMMON_FRAGMENT = /* glsl */`
// 三个 vec4 varying 装下全部低频场（顶点里算好，D3D 按寄存器打包，少一个是一个）：
//   vCharRest   xyz 绑定姿势位置，w 皮肤污渍
//   vCharGrime  x 到泥线的有符号距离（米，负 = 线下）, y 湿, z 膝肘磨损, w 落灰
//   vCharGrime2 x 溅点覆盖, y 膝上的泥 / 袖口蹭脏, z 低频噪声, w 脸上的汗
varying vec4 vCharRest;
varying vec4 vCharGrime;
varying vec4 vCharGrime2;
const vec3 CHAR_LUMA = vec3(0.2126, 0.7152, 0.0722);
// 点：每个单位格一个随机大小、随机偏移的圆点（一次散列），density 是有点的格子比例。溅泥、漆面崩口用它。
float CharDots(vec3 p, float density) {
  float h = CharHash(floor(p));
  vec3 o = fract(vec3(h * 13.1, h * 71.7, h * 27.3)) - 0.5;
  float r = 0.22 + 0.2 * fract(h * 5.3);
  float d = length(fract(p) - 0.5 - o * 0.4);
  return (1.0 - smoothstep(r * 0.55, r, d)) * step(1.0 - density, fract(h * 3.7));
}
vec3 CharSafeNormalize(vec3 v) { return v * inversesqrt(max(dot(v, v), 1e-12)); }
// three 的 getTangentFrame 同款（那一份只在有切线空间法线贴图时才声明）。导数在一致控制流里求。
mat3 CharTangentFrame(vec3 n, vec2 uv) {
  vec3 q0 = dFdx(-vViewPosition), q1 = dFdy(-vViewPosition);
  vec2 st0 = dFdx(uv), st1 = dFdy(uv);
  vec3 q1perp = cross(q1, n), q0perp = cross(n, q0);
  vec3 t = q1perp * st0.x + q0perp * st1.x;
  vec3 b = q1perp * st0.y + q0perp * st1.y;
  float det = max(dot(t, t), dot(b, b));
  float scale = det == 0.0 ? 0.0 : inversesqrt(det);
  return mat3(t * scale, b * scale, n);
}
// 细节包骑的 uv：有反照率图用它，没有就按绑定姿势平面投影（腕环那种无贴图的皮）。
#if defined( USE_MAP )
  #define CHAR_SURFACE_UV vMapUv
#elif defined( USE_NORMALMAP )
  #define CHAR_SURFACE_UV vNormalMapUv
#else
  #define CHAR_SURFACE_UV (vec2(vCharRest.x + vCharRest.z * 0.7, vCharRest.y) / 1.9)
#endif`;

/** 公共段：绑定姿势的位置 / 法线 varying、噪声、按屏幕导数现算的切线基。 */
const COMMON_PATCH = MakePatch({
  key: CHARACTER_SURFACE_PATCH_KEYS.common,
  vertex: [
    ["#include <common>", `varying vec4 vCharRest;\nvarying vec4 vCharGrime;\nvarying vec4 vCharGrime2;\n${NOISE_GLSL}`],
    // 蒙皮之前的 position / normal：泥跟着布走，不随动作滑；不改 transformed，运动矢量不受影响。
    ["#include <begin_vertex>", "vCharRest = vec4(position, 0.0);\nvCharGrime = vec4(1.0, 0.0, 0.0, 0.0);\nvCharGrime2 = vec4(0.0);"],
  ],
  // 函数形式：编译那一刻按参数写 CHAR_BATCHED（BatchedMesh 的 USE_BATCHING 只进顶点着色器）。
  fragment: (shader) => [["#include <common>", (shader?.batching ? "#define CHAR_BATCHED\n" : "") + NOISE_GLSL + COMMON_FRAGMENT]],
});

/** 泥污 / 磨损 / 落灰（所有部件共用；强度按部件的 uCharGrimeRole）。 */
function GrimePatch(role, seed, heightOffset, part) {
  const G = CHARACTER_GRIME;
  const strengths = G.roles[role] || G.roles.gear;
  const uniforms = {
    uCharGrimeRole: { value: new THREE.Vector4(strengths.mud, strengths.knee, strengths.elbow, strengths.dust) },
    uCharGrimeSeed: { value: new THREE.Vector4(seed[0], seed[1], seed[2], heightOffset) },
    uCharElbow: { value: new THREE.Vector3(part?.elbowX ?? G.elbow[0], G.elbow[1], G.elbow[2]) },
    uCharCuff: { value: new THREE.Vector3(part?.cuffX ?? G.cuff[0], G.cuff[1], strengths.cuff || 0) },
  };
  const DECLARE = /* glsl */`
uniform vec4 uCharGrimeShape;   // x 泥线高, y 泥线起伏, z 溅点最高, w 溅点覆盖
uniform vec2 uCharGrimeScale;   // x 噪声频率, y 溅点频率
uniform vec3 uCharWear;         // x 提亮, y 去饱和, z 泥里湿的比例
uniform vec4 uCharGrimeRole;    // x 泥, y 膝, z 肘, w 落灰
uniform vec4 uCharGrimeSeed;    // xyz 噪声错位, w 高度偏移（刚体小件 = 抬走）`;
  return MakePatch({
    key: CHARACTER_SURFACE_PATCH_KEYS.grime,
    uniforms: (target) => { Object.assign(target, Shared().grime, uniforms); },
    vertex: [
      ["#include <common>", `${DECLARE}
uniform vec3 uCharCuff;         // x 袖口 |x|, y 往里多宽, z 强度
uniform vec3 uCharKnee;         // |x|, y, 半径
uniform vec3 uCharElbow;`],
      ["#include <begin_vertex>", /* glsl */`
{
  vec3 p = position + uCharGrimeSeed.xyz;
  float h = position.y + uCharGrimeSeed.w;
  float n = CharFbm(p * uCharGrimeScale.x);
  // 泥线：平均高度上下按噪声起伏。
  float edge = uCharGrimeShape.x + (n - 0.5) * 2.0 * uCharGrimeShape.y;
  // 湿：脚面几乎全湿，往上干壳（黄土色、粗糙）渐多，中间按噪声成片。
  float wetN = CharNoise(p * uCharGrimeScale.x * 2.3 + 4.1);
  float wetLevel = clamp(1.0 - h / max(edge, 0.05) + (wetN - 0.5) * 1.2 + (uCharWear.z - 0.5), 0.0, 1.0);
  // 膝（跪）：正面一圈磨白，中间一块软边的泥；肘（趴）：一圈磨白。
  vec2 kq = vec2(abs(position.x) - uCharKnee.x, h - uCharKnee.y) / uCharKnee.z;
  float knee = (1.0 - smoothstep(0.5, 1.0, length(kq) + (n - 0.5) * 0.6)) * smoothstep(-0.25, 0.35, normal.z) * uCharGrimeRole.y;
  vec2 eq = vec2(abs(position.x) - uCharElbow.x, h - uCharElbow.y) / uCharElbow.z;
  float elbow = (1.0 - smoothstep(0.45, 1.0, length(eq) + (n - 0.5) * 0.6)) * uCharGrimeRole.z;
  float kneeMud = knee * smoothstep(0.35, 0.95, n + 0.3 * (1.0 - length(kq)));
  // 袖口往里一段蹭脏（手在泥里、枪上）。
  float cuff = smoothstep(uCharCuff.x - uCharCuff.y, uCharCuff.x - uCharCuff.y * 0.3, abs(position.x))
    * smoothstep(1.15, 1.28, h) * smoothstep(0.35, 0.65, n + 0.2) * uCharCuff.z;
  // 落灰：朝上的面（肩、背包顶、帽顶），胸口以上。
  float dust = smoothstep(0.25, 0.85, normal.y) * smoothstep(1.0, 1.35, h) * smoothstep(0.3, 0.7, n) * uCharGrimeRole.w;
  // 溅点：线以上稀疏的小泥点，越高越少（点本身在片元里画）。
  float chance = uCharGrimeShape.w * (1.0 - smoothstep(edge, uCharGrimeShape.z, h));
  vCharGrime = vec4(h - edge, wetLevel, max(knee, elbow), dust);
  vCharGrime2.xyz = vec3(chance, max(kneeMud * 0.4, cuff * 0.55), n);
}`],
    ],
    fragment: [
      ["#include <common>", /* glsl */`${DECLARE}
uniform vec4 uCharGrimeRough;   // x 湿泥, y 干泥, z 落灰, w 磨损
uniform vec3 uCharMudWet, uCharMudDry, uCharDustTint;`],
      ["#include <color_fragment>", /* glsl */`
float charMud = 0.0, charWet = 0.0, charWear = vCharGrime.z, charDust = vCharGrime.w;
{
  float n = vCharGrime2.z;
  // 线以下是整片泥（有符号距离插值下来再切，边是利的）。
  float solid = 1.0 - smoothstep(-0.04, 0.02, vCharGrime.x);
  float splash = CharDots((vCharRest.xyz + uCharGrimeSeed.xyz) * uCharGrimeScale.y, vCharGrime2.x);
  charMud = max(solid, splash * 0.75) * uCharGrimeRole.x;
  charWet = max(solid * vCharGrime.y, splash * 0.3) * uCharGrimeRole.x;
  charMud = max(charMud, vCharGrime2.y);
  vec3 c = diffuseColor.rgb;
  float L = dot(c, CHAR_LUMA);
  c = mix(c, mix(c, vec3(L), uCharWear.y) * (1.0 + uCharWear.x), charWear * (1.0 - charMud));
  c = mix(c, mix(c, uCharDustTint * (0.7 + 0.6 * n), 0.55), charDust);
  float wetShare = clamp(charWet / max(charMud, 1e-3), 0.0, 1.0);
  // 泥保留一点底下布料的明暗（褶皱不被抹平），湿泥更暗。
  vec3 mudColor = mix(uCharMudDry, uCharMudWet, wetShare) * (0.8 + 0.4 * n) * clamp(0.75 + (L - 0.12) * 1.5, 0.6, 1.25);
  diffuseColor.rgb = mix(c, mudColor, charMud);
}`],
      ["#include <roughnessmap_fragment>", /* glsl */`
{
  roughnessFactor = mix(roughnessFactor, uCharGrimeRough.w, charWear * 0.6);
  roughnessFactor = mix(roughnessFactor, uCharGrimeRough.z, charDust * 0.7);
  float charMudRough = mix(uCharGrimeRough.y, uCharGrimeRough.x, clamp(charWet / max(charMud, 1e-3), 0.0, 1.0));
  roughnessFactor = mix(roughnessFactor, charMudRough, charMud);
}`],
      ["#include <metalnessmap_fragment>", "metalnessFactor *= 1.0 - charMud;"],
      // 泥糊住的布没有绒光。
      ["#include <lights_physical_fragment>", "#ifdef USE_SHEEN\n  material.sheenColor *= 1.0 - charMud * 0.85;\n#endif"],
    ],
  });
}

/** 皮肤：去粉偏黄褐、微细节（毛孔 / 皮纹）、褶皱积泥、污渍、脸上的汗。 */
function SkinPatch(tile, part) {
  const H = CHARACTER_SKIN.hands;
  const uniforms = {
    uCharSkinTile: { value: tile },
    // 逐部件（手那份皮更脏更暗）：x 污渍倍率、y 明度倍率。uniform，不分程序。
    uCharSkinPart: { value: new THREE.Vector2(part.hands ? H.dirt : 1, part.hands ? H.value : 1) },
  };
  return MakePatch({
    key: CHARACTER_SURFACE_PATCH_KEYS.skin,
    uniforms: (target) => { Object.assign(target, Shared().skin, uniforms); },
    // 污渍与汗是十厘米 / 几厘米的低频场：顶点里算（脸上 2114 个三角，点距一两厘米）。
    vertex: [
      ["#include <common>", "uniform vec4 uCharSkinDirt;"],
      ["#include <begin_vertex>", /* glsl */`
{
  float smudge = smoothstep(0.44, 0.7, CharFbm(position * uCharSkinDirt.w + 5.3));
  float face = smoothstep(1.45, 1.55, position.y) * (1.0 - smoothstep(0.1, 0.2, abs(position.x))) * smoothstep(-0.1, 0.4, normal.z);
  vCharRest.w = smudge;
  vCharGrime2.w = smoothstep(0.5, 0.78, CharNoise(position * 28.0 + 1.7)) * face;
}`],
    ],
    fragment: [
      ["#include <common>", /* glsl */`
// 远景人群 / 尸体层是 BatchedMesh：batchingTexture + batchingIdTexture 比蒙皮多一个采样器，
// 皮肤再挂细节包就是 17。远看不见毛孔，合批变体不采这张图（不声明 = 不占纹理单元）。
// three 的 USE_BATCHING 只进顶点着色器，片元这边用 CHAR_BATCHED（公共段按编译参数写）。
#ifndef CHAR_BATCHED
uniform sampler2D uCharSkinDetailMap;
#endif
uniform float uCharSkinTile;
uniform vec2 uCharSkinPart;
uniform vec3 uCharSkinTone, uCharSkinDirtTint;
uniform vec4 uCharSkinGrade, uCharSkinNormal, uCharSkinDirt;
uniform vec2 uCharSkinSweat;`],
      ["#include <color_fragment>", /* glsl */`
#ifdef CHAR_BATCHED
  vec4 charSkinTexel = vec4(0.5);
#else
  vec4 charSkinTexel = texture2D(uCharSkinDetailMap, CHAR_SURFACE_UV * uCharSkinTile);
#endif
float charSkinFade = 1.0 - smoothstep(uCharSkinNormal.z, uCharSkinNormal.w, length(vViewPosition));
float charSkinDirt = 0.0, charSkinSweat = 0.0;
{
  vec3 c = diffuseColor.rgb;
  float L = dot(c, CHAR_LUMA);
  vec3 toneN = uCharSkinTone / max(dot(uCharSkinTone, CHAR_LUMA), 1e-3);
  c = mix(c, L * toneN, uCharSkinGrade.x);
  c = mix(vec3(dot(c, CHAR_LUMA)), c, 1.0 - uCharSkinGrade.y) * uCharSkinGrade.z * uCharSkinPart.y;
  c *= 1.0 + (charSkinTexel.b - 0.5) * 2.0 * uCharSkinGrade.w * charSkinFade;
  // 褶皱积泥：atlas 比它自己的模糊 mip 暗的地方（指缝、指甲缝、关节纹、鼻翼）。
  #ifdef USE_MAP
    vec3 charBlur = texture2D(map, vMapUv, uCharSkinDirt.y).rgb;
    float charCavity = dot(sampledDiffuseColor.rgb - charBlur, CHAR_LUMA);
    charSkinDirt = smoothstep(-0.008, -0.06, charCavity) * uCharSkinDirt.x * uCharSkinPart.x;
  #endif
  // 大块污渍（泥手印、硝烟）与脸上的汗：顶点里算好的低频场。
  charSkinDirt = clamp(max(charSkinDirt, vCharRest.w * uCharSkinDirt.z * uCharSkinPart.x), 0.0, 1.0);
  c = mix(c, uCharSkinDirtTint * (0.7 + 0.6 * charSkinTexel.b), charSkinDirt * 0.75);
  charSkinSweat = vCharGrime2.w * uCharSkinSweat.x;
  diffuseColor.rgb = c;
}`],
      ["#include <roughnessmap_fragment>", /* glsl */`
roughnessFactor = clamp(roughnessFactor + (charSkinTexel.a - 0.5) * 2.0 * uCharSkinNormal.y * charSkinFade, 0.2, 1.0);
roughnessFactor = mix(roughnessFactor, 0.9, charSkinDirt * 0.7);
roughnessFactor = mix(roughnessFactor, uCharSkinSweat.y, charSkinSweat);`],
      ["#include <normal_fragment_maps>", /* glsl */`
{
  #if defined( USE_NORMALMAP_TANGENTSPACE )
    mat3 charSkinFrame = tbn;
  #else
    mat3 charSkinFrame = CharTangentFrame(normal, CHAR_SURFACE_UV);
  #endif
  vec2 charSkinN = (charSkinTexel.xy * 2.0 - 1.0) * uCharSkinNormal.x * charSkinFade;
  normal = normalize(normal + CharSafeNormalize(charSkinFrame[0]) * charSkinN.x + CharSafeNormalize(charSkinFrame[1]) * charSkinN.y);
}`],
    ],
  });
}

/** 日军呢子：换色 + 呢子细节；atlas 里的皮革（子弹盒、皮带、军靴）与九〇式钢盔分区处理。 */
function WoolPatch(part) {
  const target = Linear(part.officer ? IJA_UNIFORM_COLORS.officerWool : IJA_UNIFORM_COLORS.wool);
  const source = Linear(part.wool ?? 0x938049);
  const helmet = part.helmet || [0, 0, 0];
  const offset = Seed(`${part.modelId}|wool`).map((v) => (v / 20) % 1);
  const uniforms = {
    uIjaWoolTarget: { value: target },
    uIjaWoolBaseLuma: { value: Math.max(Luma(source), 1e-3) },
    // 布面遮罩的明度下限（近似 sRGB）：军官那张 atlas 整体暗一档，下限跟着降。
    uIjaWoolMask: { value: part.officer ? 0.14 : 0.24 },
    uIjaWoolOffset: { value: new THREE.Vector2(offset[0], offset[1]) },
    uIjaHelmet: { value: new THREE.Vector3(helmet[0], helmet[1], helmet[2]) },
    // 装具（gear）：同一份补丁，x = 开关、y 去饱和、z 明度（uniform 切换，不另编程序）。
    uIjaGear: { value: new THREE.Vector3(part.gear ? 1 : 0, IJA_UNIFORM_COLORS.gearDesat, IJA_UNIFORM_COLORS.gearValue) },
  };
  return MakePatch({
    key: CHARACTER_SURFACE_PATCH_KEYS.wool,
    uniforms: (targetUniforms) => { Object.assign(targetUniforms, Shared().wool, Shared().gear, uniforms); },
    fragment: [
      ["#include <common>", /* glsl */`
// 合批变体（远景人群、尸体层 = BatchedMesh）：尸体层把同签名的分件拼成一张图集、UV 重映射，
// 按原 atlas UV 定位的钢盔圆盘、按 UV 平铺的呢子细节、逐材质的装具开关在图集里都对不上 ——
// 这三样合批变体不做（远看也看不出），呢子与装具于是能在尸体层合成一只网格（少一组 draw）。
#ifndef CHAR_BATCHED
uniform sampler2D uIjaWoolDetailMap;
#endif
uniform vec4 uIjaWoolTile;
uniform vec2 uIjaWoolFade, uIjaWoolOffset, uIjaHelmetRough;
uniform vec3 uIjaWoolAlbedo, uIjaWoolRough, uIjaLeather, uIjaHelmet, uIjaHelmetEdge;
uniform vec3 uIjaWoolTarget, uIjaWoolGrimeTint, uIjaHelmetPaint, uIjaHelmetSteel, uIjaGear, uCharGearTint;
uniform float uIjaWoolBaseLuma, uIjaWoolMask;`],
      ["#include <color_fragment>", /* glsl */`
float ijaWoolMask = 0.0, ijaLeather = 0.0, ijaHelmet = 0.0, ijaHelmetEdge = 0.0, ijaHelmetWet = 0.0;
float ijaWeaveValue = 0.0, ijaGrime = 0.0;
vec4 ijaWeave = vec4(0.5);
#ifdef USE_MAP
{
  vec3 s = sqrt(max(diffuseColor.rgb, vec3(0.0)));            // 近似 sRGB，遮罩阈值按它定
  float mx = max(s.r, max(s.g, s.b)), mn = min(s.r, min(s.g, s.b));
  float chroma = max(mx - mn, 1e-4);
  float sat = chroma / max(mx, 1e-3);
  float hue = mx == s.r ? 60.0 * (s.g - s.b) / chroma : (mx == s.g ? 60.0 * (2.0 + (s.b - s.r) / chroma) : 240.0);
  hue = hue < 0.0 ? hue + 360.0 : hue;
  float L = dot(diffuseColor.rgb, CHAR_LUMA);
  // 钢盔：atlas 上一块俯视投影的圆盘（圆盘外缘 = 帽檐），帽徽五角星（饱和的黄）留原色。
  vec2 hd = (vMapUv - uIjaHelmet.xy) / max(uIjaHelmet.z, 1e-4);
  float hr = length(hd);
  float star = smoothstep(0.5, 0.65, sat) * smoothstep(0.45, 0.6, mx);
  ijaHelmet = step(1e-4, uIjaHelmet.z) * (1.0 - smoothstep(0.985, 1.0, hr)) * (1.0 - star);
  #ifdef CHAR_BATCHED
    ijaHelmet = 0.0;
  #endif
  // 呢子：土黄那一段色相、有点饱和、不太暗。
  ijaWoolMask = smoothstep(22.0, 30.0, hue) * (1.0 - smoothstep(66.0, 80.0, hue))
    * smoothstep(0.10, 0.18, sat) * smoothstep(uIjaWoolMask, uIjaWoolMask + 0.08, mx) * (1.0 - ijaHelmet);
  // 皮革：偏红的深褐（子弹盒、皮带、军靴）。
  ijaLeather = step(3.0, hue) * (1.0 - smoothstep(28.0, 36.0, hue)) * smoothstep(0.30, 0.42, sat)
    * (1.0 - smoothstep(0.68, 0.78, mx)) * (1.0 - ijaHelmet) * (1.0 - ijaWoolMask);
  float mottle = 0.0;
  #ifndef CHAR_BATCHED
    ijaWeave = texture2D(uIjaWoolDetailMap, vMapUv * uIjaWoolTile.x);
    ijaGrime = texture2D(uIjaWoolDetailMap, vMapUv * uIjaWoolTile.y + uIjaWoolOffset).a - 0.5;
    mottle = texture2D(uIjaWoolDetailMap, mat2(0.8, -0.6, 0.6, 0.8) * vMapUv * uIjaWoolTile.w + uIjaWoolOffset.yx).a - 0.5;
  #endif
  ijaWeaveValue = ijaWeave.b - 0.5;
  // 换色：目标色 × atlas 的相对明度（褶皱、缝线的明暗留着）。
  vec3 cloth = uIjaWoolTarget * clamp(L / uIjaWoolBaseLuma, 0.3, 1.8);
  cloth *= (1.0 + ijaWeaveValue * 2.0 * uIjaWoolAlbedo.x) * (1.0 + mottle * 2.0 * uIjaWoolAlbedo.z);
  float dust = max(-ijaGrime, 0.0) * 2.0 * uIjaWoolAlbedo.y;
  float faded = max(ijaGrime, 0.0) * 2.0 * uIjaWoolAlbedo.y;
  vec3 dirtHue = uIjaWoolGrimeTint / max(dot(uIjaWoolGrimeTint, CHAR_LUMA), 1e-3);
  cloth *= mix(vec3(1.0), dirtHue * 0.55, dust);
  cloth = mix(cloth, vec3(dot(cloth, CHAR_LUMA)) * 1.3, faded * 0.6);
  vec3 leather = mix(diffuseColor.rgb, vec3(L), uIjaLeather.y) * uIjaLeather.x;
  // 钢盔漆：橄榄漆 × atlas 明暗；帽檐一圈与零星崩口露出钢色；雨水湿斑。
  float hn = CharNoise(vec3(vMapUv * 90.0, 3.1));
  float edgeWear = smoothstep(uIjaHelmetEdge.x, uIjaHelmetEdge.y, hr) * smoothstep(0.3, 0.6, hn + 0.25);
  float chips = CharDots(vec3(vMapUv * 260.0, 7.7), uIjaHelmetEdge.z * 0.25);
  ijaHelmetEdge = clamp(edgeWear + chips, 0.0, 1.0) * ijaHelmet;
  ijaHelmetWet = smoothstep(0.5, 0.8, CharNoise(vec3(vMapUv * 150.0, 1.7))) * ijaHelmet;
  vec3 paint = uIjaHelmetPaint * clamp(L / 0.07, 0.55, 1.4) * (0.9 + 0.2 * hn);
  vec3 helmetColor = mix(paint, uIjaHelmetSteel, ijaHelmetEdge / max(ijaHelmet, 1e-3));
  vec3 c = diffuseColor.rgb;
  c = mix(c, cloth, ijaWoolMask);
  c = mix(c, leather, ijaLeather);
  c = mix(c, helmetColor, ijaHelmet);
  // 装具：整体再往橄榄褐去饱和、压暗（背包帆布、卷毯、子弹盒一起旧）。
  #ifndef CHAR_BATCHED
    vec3 gearTint = uCharGearTint / max(dot(uCharGearTint, CHAR_LUMA), 1e-3);
    c = mix(c, mix(c, dot(c, CHAR_LUMA) * gearTint, uIjaGear.y) * uIjaGear.z, uIjaGear.x);
  #endif
  diffuseColor.rgb = c;
}
#endif`],
      ["#include <roughnessmap_fragment>", /* glsl */`
{
  float ijaWoolRough = uIjaWoolRough.x - ijaWeaveValue * 2.0 * uIjaWoolRough.y + max(-ijaGrime, 0.0) * 2.0 * uIjaWoolRough.z;
  roughnessFactor = mix(roughnessFactor, clamp(ijaWoolRough, 0.6, 1.0), ijaWoolMask);
  roughnessFactor = mix(roughnessFactor, uIjaLeather.z, ijaLeather);
  float ijaHelmetRough = mix(uIjaHelmetRough.x, uIjaHelmetRough.y, ijaHelmetWet / max(ijaHelmet, 1e-3));
  roughnessFactor = mix(roughnessFactor, mix(ijaHelmetRough, 0.5, ijaHelmetEdge), ijaHelmet);
  roughnessFactor = mix(roughnessFactor, max(roughnessFactor, 0.72), uIjaGear.x);
}`],
      ["#include <metalnessmap_fragment>", "metalnessFactor = mix(metalnessFactor, 0.85, ijaHelmetEdge);"],
      ["#include <normal_fragment_maps>", /* glsl */`
#ifdef USE_MAP
{
  #if defined( USE_NORMALMAP_TANGENTSPACE )
    mat3 ijaFrame = tbn;
  #else
    mat3 ijaFrame = CharTangentFrame(normal, vMapUv);
  #endif
  float ijaFade = 1.0 - smoothstep(uIjaWoolFade.x, uIjaWoolFade.y, length(vViewPosition));
  vec2 ijaN = (ijaWeave.xy * 2.0 - 1.0) * uIjaWoolTile.z * ijaFade * ijaWoolMask;
  normal = normalize(normal + CharSafeNormalize(ijaFrame[0]) * ijaN.x + CharSafeNormalize(ijaFrame[1]) * ijaN.y);
}
#endif`],
    ],
  });
}

// ---------------------------------------------------------------------------
// 变体
// ---------------------------------------------------------------------------

/**
 * 国军布军装（Script_UniformColors 的换色变体）接在自己的补丁后面的那两段。
 * @param {object|null} part 源材质的部件标签（第一人称汉阳造袖子带 elbowX）
 * @param {number[]} offset 每种配色的噪声错位（同一个班的人不脏在同一个地方）
 */
export function CharacterClothPatches(part, offset = [0, 0]) {
  const seed = Seed(`${part?.modelId || "nra"}|cloth`);
  return [COMMON_PATCH, GrimePatch("nraCloth", [seed[0] + offset[0] * 7, seed[1], seed[2] + offset[1] * 7], 0, part)];
}

const variantsBySource = new WeakMap();
const variants = new WeakSet();

/**
 * 按部件标签给一份材质出人物表面变体（没打标、或国军布军装 → 原样返回；已是变体 → 原样返回）。
 * @param {THREE.Material} material
 * @param {{rigid?: boolean}} options rigid：挂在骨头上的非蒙皮小件，position 是骨局部坐标 ——
 *        高度那一路（泥 / 膝 / 肘）整个抬走，只留部件本身的换色。
 */
export function CharacterSurfaceMaterial(material, { rigid = false } = {}) {
  const part = CharacterSurfaceOf(material);
  if (!part?.role || part.role === "nraCloth" || variants.has(material)) return material;
  if (!material.isMeshStandardMaterial) return material;
  let byKey = variantsBySource.get(material);
  if (!byKey) { byKey = new Map(); variantsBySource.set(material, byKey); }
  const key = rigid ? "rigid" : "skinned";
  if (byKey.has(key)) return byKey.get(key);
  const variant = CloneShadedMaterial(material);
  // three 只读 specularIntensityMap 的 alpha，人物的 spec 图全是 RGB WebP（alpha 恒 1）：摘掉逐像素无差，
  // 省一个采样器、省一张显存（John_Sp 一张 2048²）。
  if (variant.isMeshPhysicalMaterial) variant.specularIntensityMap = null;
  const seed = Seed(`${part.modelId}|${material.name}`);
  const heightOffset = rigid ? 10 : 0;
  const mine = [COMMON_PATCH];
  if (part.role === "skin") {
    const S = CHARACTER_SKIN;
    if (variant.isMeshPhysicalMaterial) variant.specularIntensity = S.specularIntensity;
    variant.roughness = S.roughness;
    if (part.noMap) variant.color.set(S.wristColor);
    if (part.normalScale && variant.normalScale) {
      // 保留 GLTFLoader 选的符号，只改强度（统一脸与手的法线强度，尸体层才能把它们拼成一张图集）。
      // fround：GLB 里的 0.3 是 float32（0.30000001…），着色签名按 JSON 比，差一位就拼不到一起。
      const k = Math.fround(part.normalScale);
      variant.normalScale.set(Math.sign(variant.normalScale.x || 1) * k, Math.sign(variant.normalScale.y || 1) * k);
    }
    mine.push(SkinPatch((part.uvMeters || 1) / S.tileMeters, part));
  } else if (part.role === "ijaWool") {
    variant.roughness = IJA_WOOL_DETAIL.roughness;
    if (variant.isMeshPhysicalMaterial && variant.sheen > 0) {
      // 绒光色按换过的呢子色取（同 Script_Materials 的公式），不是 GLB 白底色那一身白绒；
      // 呢子的绒光比棉布弱、更贴布色（IJA_WOOL_DETAIL.sheen / sheenLift）。
      const target = Linear(part.officer ? IJA_UNIFORM_COLORS.officerWool : IJA_UNIFORM_COLORS.wool);
      const luma = Luma(target);
      variant.sheen = IJA_WOOL_DETAIL.sheen;
      variant.sheenColor = target.clone()
        .lerp(new THREE.Color(luma, luma, luma), 1 - CLOTH_SHEEN.colorSaturation)
        .lerp(new THREE.Color(1, 1, 1), IJA_WOOL_DETAIL.sheenLift);
    }
    mine.push(WoolPatch(part));
  }
  mine.push(GrimePatch(part.gear ? "gear" : part.role, seed, heightOffset, part));
  ApplyPatches(variant, [...(PatchesOf(variant) || []), ...mine]);
  variant.userData.characterSurfaceRole = part.role;
  variant.needsUpdate = true;
  variants.add(variant);
  byKey.set(key, variant);
  return variant;
}
