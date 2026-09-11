// Shared NRA cloth treatment for actors, cutscenes, first-person sleeves and body.
// The source atlas also contains brass, red insignia, leather and soles: only its
// blue cloth is recolored. Source GLBs/textures and their folds remain intact.
import * as THREE from "three";
import { NRA_UNIFORM_COLORS } from "./Data_Tuning_Materials.mjs";
import { CloneShadedMaterial } from "./Script_Materials.mjs";
import { ApplyPatches, MakePatch, PatchesOf } from "./Script_MaterialPatches.mjs";

const sourceMaterials = new WeakMap();
const variants = new WeakMap();

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
  const patch = MakePatch({
    key: `nraUniformCloth1:${palette}`,
    uniforms: (uniforms) => {
      uniforms.uNraClothTarget = { value: target };
      uniforms.uNraClothBaseLuma = { value: baseLuma };
    },
    fragment: [
      ["#include <common>", "uniform vec3 uNraClothTarget;\nuniform float uNraClothBaseLuma;"],
      ["#include <color_fragment>", `
        float nraBlueRatio = (diffuseColor.b - diffuseColor.r) / max(diffuseColor.b, 0.001);
        float nraClothMask = smoothstep(0.10, 0.32, nraBlueRatio);
        float nraClothDetail = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)) / uNraClothBaseLuma;
        diffuseColor.rgb = mix(diffuseColor.rgb, uNraClothTarget * nraClothDetail, nraClothMask);
      `],
    ],
  });
  ApplyPatches(tinted, [...(PatchesOf(tinted) || []), patch]);
  tinted.userData.nraUniformPalette = palette;
  sourceMaterials.set(tinted, source);
  choices.set(palette, tinted);
  return tinted;
}

export function ApplyNraUniform(root, palette = "grayBlue") {
  if (!root || !palette) return;
  root.traverse((mesh) => {
    if (!mesh.isMesh || !(mesh.userData.characterPbrSurface
      || mesh.userData.firstPersonPbrSurface || mesh.userData.firstPersonBody)) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((material) => UniformMaterial(material, palette))
      : UniformMaterial(mesh.material, palette);
  });
}
