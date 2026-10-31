// 白盒材质（2026-10-31）：「白盒」是材质的样子，不是画质档。
//
// 灰表面 + 世界坐标米格线（Script_WhiteboxGrid.MakeWhiteboxGridPatch）；水面是蓝灰水色 + 掠射角天空色反光。
// 数在 Data_Tuning_WhiteboxMaterial。GLSL 一律走 Script_MaterialPatches（契约 11）。
// 白盒编辑器（Script_EditorBlockout.DressWorld）把场景里各语义的材质改成这个样子；场景编辑器用同一段米格线。

import * as THREE from "three";
import { ApplyPatches, MakePatch, PatchesOf } from "./Script_MaterialPatches.mjs";
import { MakeWhiteboxGridPatch } from "./Script_WhiteboxGrid.mjs";
import { WHITEBOX_MATERIAL, WHITEBOX_WATER } from "./Data_Tuning_WhiteboxMaterial.mjs";

/** 白盒水面补丁：蓝灰水色 + 掠射角天空色反光。没有环境贴图也成立（反光色是常量，靠菲涅耳权重）。 */
export function MakeWhiteboxWaterPatch() {
  return MakePatch({
    key: "whiteboxWater1",
    uniforms: (uniforms) => Object.assign(uniforms, { uWhiteboxWaterSheen: { value: new THREE.Color(WHITEBOX_WATER.sheen) } }),
    fragment: [
      ["#include <common>", "uniform vec3 uWhiteboxWaterSheen;"],
      ["#include <dithering_fragment>", `
        {
          float waterFresnel = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), ${WHITEBOX_WATER.sheenPower.toFixed(1)});
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uWhiteboxWaterSheen,
            clamp(waterFresnel * ${WHITEBOX_WATER.sheenStrength.toFixed(2)}, 0.0, ${WHITEBOX_WATER.sheenMax.toFixed(2)}));
        }
      `],
    ],
  });
}

/** 把补丁并进材质已有的补丁里（同一个 key 只装一次）。 */
function AddPatch(material, patch) {
  const patches = PatchesOf(material) || [];
  if (patches.some((existing) => existing.key === patch.key)) return false;
  ApplyPatches(material, [...patches, patch]);
  material.needsUpdate = true;
  return true;
}

/** 白盒水面材质：蓝灰水色、低粗糙度、不画网格。 */
export function MakeWhiteboxWaterMaterial({ name = "WhiteboxWater", side = THREE.DoubleSide } = {}) {
  const material = new THREE.MeshStandardMaterial({
    name, color: WHITEBOX_WATER.color, roughness: WHITEBOX_WATER.roughness, metalness: WHITEBOX_WATER.metalness, side,
  });
  AddPatch(material, MakeWhiteboxWaterPatch());
  material.userData.whiteboxMaterial = "water";
  return material;
}

/**
 * 白盒表面材质：灰色（给了 color 就用它，语义色块保留语义色）+ 米格线。
 * @param {{ name?: string, color?: string|number|THREE.Color }} [options]
 */
export function MakeWhiteboxMaterial({ name = "Whitebox", color = null } = {}) {
  const material = new THREE.MeshStandardMaterial({
    name, color: color ?? WHITEBOX_MATERIAL.surfaceColor,
    roughness: WHITEBOX_MATERIAL.roughness, metalness: WHITEBOX_MATERIAL.metalness,
  });
  AddPatch(material, MakeWhiteboxGridPatch(WHITEBOX_MATERIAL));
  material.userData.whiteboxMaterial = color === null ? "surface" : "semantic";
  return material;
}

/**
 * 把一份已有的 MeshStandardMaterial 改成白盒的样子（原地改，共用它的网格一起变）：
 * keepColor 为 false → 颜色换成灰表面色；为 true → 保留原语义色。两种都再加米格线。
 * 水（kind: "water"）换成蓝灰水色与反光，不画网格。
 * @returns {THREE.Material} 同一份材质
 */
export function DressAsWhitebox(material, { keepColor = false, kind = "surface" } = {}) {
  if (!material?.color) return material;
  if (kind === "water") {
    material.color.set(WHITEBOX_WATER.color);
    material.roughness = WHITEBOX_WATER.roughness;
    material.metalness = WHITEBOX_WATER.metalness;
    AddPatch(material, MakeWhiteboxWaterPatch());
    material.userData.whiteboxMaterial = "water";
    return material;
  }
  if (!keepColor) material.color.set(WHITEBOX_MATERIAL.surfaceColor);
  material.roughness = WHITEBOX_MATERIAL.roughness;
  material.metalness = WHITEBOX_MATERIAL.metalness;
  AddPatch(material, MakeWhiteboxGridPatch(WHITEBOX_MATERIAL));
  material.userData.whiteboxMaterial = keepColor ? "semantic" : "surface";
  return material;
}
