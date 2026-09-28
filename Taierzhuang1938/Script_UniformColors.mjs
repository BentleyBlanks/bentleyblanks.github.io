// Shared NRA cloth treatment for actors, cutscenes, first-person sleeves and body.
// The source atlas also contains brass, red insignia, leather and soles: only its
// blue cloth is recolored. Source GLBs/textures and their folds remain intact.
// The same mask carries the cloth detail layer (NRA_CLOTH_DETAIL): a twill weave
// normal/value and a grime pass sampled at a high repeat on the atlas UV, so the
// recolored cloth no longer reads as flat stretched blocks up close.
// 2026-09-28: ApplyNraUniform is also the entry of the character surface layer
// (Script_CharacterSurface): the NRA cloth variant appends its mud / wear / dust
// section, and every other tagged part (IJA wool, skin, gear, garb) gets its own
// variant here, palette or not (IJA passes a null palette).
import * as THREE from "three";
import { NRA_UNIFORM_COLORS, NRA_CLOTH_DETAIL, CLOTH_SHEEN } from "./Data_Tuning_Materials.mjs";
import { CloneShadedMaterial } from "./Script_Materials.mjs";
import { ApplyPatches, MakePatch, PatchesOf } from "./Script_MaterialPatches.mjs";
import { CharacterClothPatches, CharacterSurfaceMaterial, CharacterSurfaceOf } from "./Script_CharacterSurface.mjs";

const sourceMaterials = new WeakMap();
const variants = new WeakMap();

// One detail pack for every NRA uniform variant. Until the image arrives the
// sampler holds a neutral texel (flat normal, 0.5 value, 0.5 grime), which the
// shader treats as "no detail", so swapping the texture needs no recompile.
const clothDetail = { map: null, uniforms: null };

function ClothDetailUniforms() {
  if (clothDetail.uniforms) return clothDetail.uniforms;
  const neutral = new THREE.DataTexture(new Uint8Array([128, 128, 128, 128]), 1, 1, THREE.RGBAFormat);
  neutral.colorSpace = THREE.NoColorSpace;
  neutral.needsUpdate = true;
  const d = NRA_CLOTH_DETAIL;
  clothDetail.uniforms = {
    uNraClothDetailMap: { value: neutral },
    // x weave repeat, y grime repeat, z normal weight, w mottle repeat
    uNraClothDetailTile: { value: new THREE.Vector4(d.weaveTile, d.grimeTile, d.normalStrength, d.mottleTile) },
    uNraClothDetailFade: { value: new THREE.Vector2(d.normalFade[0], d.normalFade[1]) },
    // x weave albedo, y grime albedo, z mottle albedo
    uNraClothDetailAlbedo: { value: new THREE.Vector3(d.weaveAlbedo, d.grimeAlbedo, d.mottleAlbedo) },
    uNraClothGrimeTint: { value: new THREE.Color(d.grimeTint) },
    // x base, y atlas share, z weave, w grime
    uNraClothRoughness: { value: new THREE.Vector4(d.roughness, d.atlasRoughness, d.weaveRoughness, d.grimeRoughness) },
  };
  if (typeof document !== "undefined") {
    new THREE.TextureLoader().load(new URL(d.texture, import.meta.url).href, (texture) => {
      // Data, not color; glTF UV orientation like the atlas it rides on.
      texture.colorSpace = THREE.NoColorSpace;
      texture.flipY = false;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 4;
      texture.needsUpdate = true;
      clothDetail.map = texture;
      clothDetail.uniforms.uNraClothDetailMap.value = texture;
      neutral.dispose();
    });
  }
  return clothDetail.uniforms;
}

export function NraUniformPalette(kind = "nra", variantIndex = 0, castId = null) {
  if (!String(kind).startsWith("nra")) return null;
  if (castId === "luo" || kind === "nraOfficer") return "leader";
  return NRA_UNIFORM_COLORS.variants[variantIndex] || "grayBlue";
}

function UniformMaterial(material, palette) {
  if (!material?.isMeshStandardMaterial || material.name !== NRA_UNIFORM_COLORS.materialName) return material;
  const source = sourceMaterials.get(material) || material;
  let choices = variants.get(source);
  if (!choices) { choices = new Map(); variants.set(source, choices); }
  if (choices.has(palette)) return choices.get(palette);
  const tinted = CloneShadedMaterial(source);
  const target = new THREE.Color(NRA_UNIFORM_COLORS[palette]);
  const base = new THREE.Color(NRA_UNIFORM_COLORS.sourceBlue);
  const baseLuma = base.r * .2126 + base.g * .7152 + base.b * .0722;
  const detail = ClothDetailUniforms();
  const grimeOffset = new THREE.Vector2(...(NRA_CLOTH_DETAIL.grimeOffset[palette] || [0, 0]));
  const patch = MakePatch({
    // 配色只进 uniform，GLSL 与配色无关：key 不带配色，三种配色共用程序（以前一种配色一份，
    // 蒙皮 / 远景合批 / 伤口变体各乘一遍，2026-09-28 人物表面第二轮收回来）。
    key: "nraUniformCloth3",
    uniforms: (uniforms) => {
      uniforms.uNraClothTarget = { value: target };
      uniforms.uNraClothBaseLuma = { value: baseLuma };
      uniforms.uNraClothGrimeOffset = { value: grimeOffset };
      Object.assign(uniforms, detail);
    },
    // 远景人群 / 尸体层的 BatchedMesh 比蒙皮多一个采样器（batchingTexture + batchingIdTexture），
    // 军装再挂细节包就是 17 —— 超预算（2026-09-28 合批上线时的 SamplerBudgetTest 红）。远看布纹与污渍
    // 早被 mip 平均掉，合批变体不采这张图（不声明 = 不占纹理单元），换色照旧。three 的 USE_BATCHING
    // 只进顶点着色器，所以片元这边按编译参数自己写一个 NRA_CLOTH_BATCHED（函数形式，编译那一刻现读）。
    fragment: (shader) => [
      ["#include <common>", `${shader?.batching ? "#define NRA_CLOTH_BATCHED" : ""}
uniform vec3 uNraClothTarget;
uniform float uNraClothBaseLuma;
#ifndef NRA_CLOTH_BATCHED
uniform sampler2D uNraClothDetailMap;
#endif
uniform vec4 uNraClothDetailTile;
uniform vec2 uNraClothDetailFade;
uniform vec3 uNraClothDetailAlbedo;
uniform vec2 uNraClothGrimeOffset;
uniform vec3 uNraClothGrimeTint;
uniform vec4 uNraClothRoughness;`],
      ["#include <color_fragment>", `
        #ifdef USE_MAP
          float nraBlueRatio = (diffuseColor.b - diffuseColor.r) / max(diffuseColor.b, 0.001);
          float nraClothMask = smoothstep(0.10, 0.32, nraBlueRatio);
          float nraClothDetail = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)) / uNraClothBaseLuma;
          vec2 nraUv = vMapUv;
        #else
          // Atlas-less sleeves (HanYang first-person hands): a flat factor color, all of it cloth.
          float nraClothMask = 1.0;
          float nraClothDetail = 1.0;
          #ifdef USE_NORMALMAP
            vec2 nraUv = vNormalMapUv;
          #else
            vec2 nraUv = vec2(0.0);
          #endif
        #endif
        diffuseColor.rgb = mix(diffuseColor.rgb, uNraClothTarget * nraClothDetail, nraClothMask);
        #ifdef NRA_CLOTH_BATCHED
          vec4 nraWeave = vec4(0.5);
          float nraGrime = 0.0;
          float nraMottle = 0.0;
        #else
        vec4 nraWeave = texture2D(uNraClothDetailMap, nraUv * uNraClothDetailTile.x);
        float nraGrime = texture2D(uNraClothDetailMap, nraUv * uNraClothDetailTile.y + uNraClothGrimeOffset).a - 0.5;
        // Rotated so the two grime octaves never line up into a visible lattice.
        float nraMottle = texture2D(uNraClothDetailMap, mat2(0.8, -0.6, 0.6, 0.8) * nraUv * uNraClothDetailTile.w + uNraClothGrimeOffset.yx).a - 0.5;
        #endif
        float nraWeaveValue = nraWeave.b - 0.5;
        // Thread crowns/gaps, then dust (darker, pulled toward loess) and sun-faded patches (lighter).
        vec3 nraCloth = diffuseColor.rgb * (1.0 + nraWeaveValue * 2.0 * uNraClothDetailAlbedo.x)
          * (1.0 + nraMottle * 2.0 * uNraClothDetailAlbedo.z);
        float nraDust = max(-nraGrime, 0.0) * 2.0 * uNraClothDetailAlbedo.y;
        float nraFaded = max(nraGrime, 0.0) * 2.0 * uNraClothDetailAlbedo.y;
        // Dirt keeps the cloth's brightness scale but takes the loess hue (tint / its own luma).
        vec3 nraDirtHue = uNraClothGrimeTint / max(dot(uNraClothGrimeTint, vec3(0.2126, 0.7152, 0.0722)), 0.001);
        nraCloth *= mix(vec3(1.0), nraDirtHue * 0.55, nraDust);
        nraCloth = mix(nraCloth, vec3(dot(nraCloth, vec3(0.2126, 0.7152, 0.0722))) * 1.3, nraFaded * 0.6);
        diffuseColor.rgb = mix(diffuseColor.rgb, nraCloth, nraClothMask);
      `],
      ["#include <roughnessmap_fragment>", `
        // Cotton drill: matte, rougher in the thread gaps and under dust. The atlas map
        // (mean 0.55) keeps a share of its fold/wear variation around the new base.
        float nraClothRough = uNraClothRoughness.x
          + (roughnessFactor - 0.55) * uNraClothRoughness.y
          - nraWeaveValue * 2.0 * uNraClothRoughness.z
          + max(-nraGrime, 0.0) * 2.0 * uNraClothRoughness.w;
        roughnessFactor = mix(roughnessFactor, clamp(nraClothRough, 0.6, 1.0), nraClothMask);
      `],
      ["#include <normal_fragment_maps>", `
        #ifdef USE_NORMALMAP_TANGENTSPACE
        {
          float nraFade = 1.0 - smoothstep(uNraClothDetailFade.x, uNraClothDetailFade.y, length(vViewPosition));
          float nraWeight = uNraClothDetailTile.z * nraFade * nraClothMask;
          if (nraWeight > 0.002) {
            vec2 nraN = nraWeave.xy * 2.0 - 1.0;
            normal = normalize(normal + (normalize(tbn[0]) * nraN.x + normalize(tbn[1]) * nraN.y) * nraWeight);
          }
        }
        #endif
      `],
    ],
  });
  if (tinted.isMeshPhysicalMaterial && tinted.sheen > 0) {
    // The material library derived the sheen from the GLB's white base factor (near-white
    // fuzz on every uniform). Same formula as Script_Materials, fed with the dyed cloth color.
    const luma = target.r * .2126 + target.g * .7152 + target.b * .0722;
    tinted.sheenColor = target.clone()
      .lerp(new THREE.Color(luma, luma, luma), 1 - CLOTH_SHEEN.colorSaturation)
      .lerp(new THREE.Color(1, 1, 1), CLOTH_SHEEN.colorLift);
  }
  if (tinted.normalMap && tinted.normalScale) {
    // Keep the sign GLTFLoader chose (it flips y for some tangent frames), change only the strength.
    const k = NRA_CLOTH_DETAIL.atlasNormalScale;
    tinted.normalScale.set(Math.sign(tinted.normalScale.x || 1) * k, Math.sign(tinted.normalScale.y || 1) * k);
  }
  ApplyPatches(tinted, [...(PatchesOf(tinted) || []), patch,
    ...CharacterClothPatches(CharacterSurfaceOf(source), NRA_CLOTH_DETAIL.grimeOffset[palette] || [0, 0])]);
  tinted.userData.nraUniformPalette = palette;
  sourceMaterials.set(tinted, source);
  choices.set(palette, tinted);
  return tinted;
}

export function ApplyNraUniform(root, palette = "grayBlue") {
  if (!root) return;
  root.traverse((mesh) => {
    if (!mesh.isMesh || !(mesh.userData.characterPbrSurface
      || mesh.userData.firstPersonPbrSurface || mesh.userData.firstPersonBody)) return;
    const rigid = !mesh.isSkinnedMesh;
    const Pick = (material) => (material?.name === NRA_UNIFORM_COLORS.materialName
      ? (palette ? UniformMaterial(material, palette) : material)
      : CharacterSurfaceMaterial(material, { rigid }));
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(Pick) : Pick(mesh.material);
  });
}
