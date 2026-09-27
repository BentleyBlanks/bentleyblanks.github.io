// 沙袋贴地融合：把地形混合（Script_TerrainBlend 的材质缓冲）接到沙袋材质上。
// 口径文档：docs/Data_SandbagStandard.md；数据在 Data_SandbagStandard.mjs。
//
// 做法与壕沟碎石同源（docs/Data_TrenchSurface.md「表面与接地」）：地形先单独画进两张
// RGBA16F 靶（线性 albedo/roughness、视空间 normal/线性视深），沙袋在光照前读同一像素，
// 用「视深差投影到地形法向后的距离」做一条核心带 —— 贴地那一截的颜色、法线、粗糙度
// 全换成下面那块地的；核心带以上再加一层只改颜色的浮土带。没有透明叠层，深度和速度
// 仍属于沙袋。材质标 userData.terrainBlendReceiver，预通道按同一核心 mask 改法线。
//
// 没有地形混合的场景（旧城区关卡、编辑器、无浮点靶）uTerrainBlendValid 恒为 0，补丁整段
// 跳过，画面与未接入时逐像素相同；贴地此时只靠 Data_SandbagStandard 的几何下沉。
import { ApplyPatches, MakePatch, PatchesOf } from "./Script_MaterialPatches.mjs";
import { TerrainBlendUniforms, TERRAIN_BLEND_GLSL } from "./Script_TerrainBlend.mjs";
import { CloneShadedMaterial } from "./Script_Materials.mjs";
import { TRENCH_SURFACE } from "./Data_TrenchSurface.mjs";
import { SANDBAG_CONTACT as C } from "./Data_SandbagStandard.mjs";

const CONTACT_KEY = "sandbagContact1";

export function MakeSandbagContactPatch() {
  return MakePatch({
    key: CONTACT_KEY,
    uniforms: (uniforms) => {
      for (const key of ["uTerrainBlendValid", "uTerrainBlendColor", "uTerrainBlendNormalDepth", "uTerrainBlendSize"]) {
        uniforms[key] = TerrainBlendUniforms[key];
      }
      uniforms.uTerrainBlendWidth = { value: TRENCH_SURFACE.contact.blendWidthM };
    },
    fragment: [
      ["#include <common>", `${TERRAIN_BLEND_GLSL}
uniform sampler2D uTerrainBlendColor;
float gSandbagContact = 0.0;
vec4 gSandbagSoil = vec4(0.0);
vec3 gSandbagSoilNormal = vec3(0.0, 1.0, 0.0);
float SandbagSoilDistance(vec4 soil, vec3 viewPosition) {
  float separation = soil.w - viewPosition.z;
  if (uTerrainBlendValid < .5 || soil.w <= 0.0 || separation < -.015) return 1e4;
  return max(separation, 0.0) * max(abs(dot(normalize(soil.xyz), normalize(viewPosition))), .15)
    / max(normalize(viewPosition).z, .1);
}
float SandbagNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
  float b = fract(sin(dot(i + vec2(1, 0), vec2(127.1, 311.7))) * 43758.5453);
  float c = fract(sin(dot(i + vec2(0, 1), vec2(127.1, 311.7))) * 43758.5453);
  float d = fract(sin(dot(i + vec2(1, 1), vec2(127.1, 311.7))) * 43758.5453);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}`],
      // 反照率：核心带整换成地面颜色，其上浮土带往地面颜色拉一部分。
      ["#include <color_fragment>", `
if (uTerrainBlendValid > .5) {
  vec2 sandbagUv = gl_FragCoord.xy / uTerrainBlendSize;
  vec4 sandbagNd = texture(uTerrainBlendNormalDepth, sandbagUv);
  float sandbagDistance = SandbagSoilDistance(sandbagNd, vViewPosition);
  if (sandbagDistance < ${(TRENCH_SURFACE.contact.blendWidthM + C.dustBandM + C.dustEdgeNoiseM).toFixed(3)}) {
    gSandbagSoil = texture(uTerrainBlendColor, sandbagUv);
    gSandbagSoilNormal = normalize(sandbagNd.xyz);
    gSandbagContact = TerrainBlendMask(sandbagNd, vViewPosition);
    vec3 sandbagWorld = transpose(mat3(viewMatrix)) * (-vViewPosition - viewMatrix[3].xyz);
    float sandbagEdge = ${C.dustEdgeNoiseM.toFixed(3)} * (SandbagNoise(sandbagWorld.xz * 3.1 + sandbagWorld.y * 1.7) - .5);
    float sandbagDust = (1.0 - smoothstep(uTerrainBlendWidth,
      uTerrainBlendWidth + ${C.dustBandM.toFixed(3)}, sandbagDistance + sandbagEdge)) * ${C.dustStrength.toFixed(3)};
    diffuseColor.rgb = mix(diffuseColor.rgb, gSandbagSoil.rgb, max(gSandbagContact, sandbagDust));
  }
}`],
      ["#include <roughnessmap_fragment>", `roughnessFactor = mix(roughnessFactor, gSandbagSoil.a, gSandbagContact);`],
      ["#include <metalnessmap_fragment>", `metalnessFactor *= 1.0 - gSandbagContact;`],
      // 法线在视空间，与材质缓冲里存的同一空间；预通道用同一 mask（Script_PostPrepass）。
      ["#include <normal_fragment_maps>", `normal = normalize(mix(normal, gSandbagSoilNormal, gSandbagContact));`],
    ],
  });
}

const CONTACT_MATERIALS = new WeakMap();
let sharedPatch = null;

/**
 * 同一份库材质只派生一份接收者（按源材质缓存）。派生体按源材质的补丁列表重装、
 * 再在末尾追加融合补丁 —— 同锚点按注册顺序拼接，融合排在 ORM / 着色之后，
 * 写粗糙度与法线的是它。共享的是 uniforms 包和补丁对象，档位切换照常生效。
 */
export function SandbagContactMaterial(source) {
  if (!source || Array.isArray(source) || source.userData?.terrainBlendReceiver) return source;
  let material = CONTACT_MATERIALS.get(source);
  if (material) return material;
  material = CloneShadedMaterial(source);
  material.name = `${source.name || "Sandbag"}_GroundContact`;
  ApplyPatches(material, [...(PatchesOf(source) || []), sharedPatch ||= MakeSandbagContactPatch()]);
  material.userData.terrainBlendReceiver = true;
  material.userData.sandbagContact = true;
  CONTACT_MATERIALS.set(source, material);
  return material;
}
