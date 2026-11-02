// 角色光照（环境系统的 CharacterLight 组件，docs/Data_Environment.md §2）：只打在人物身上的正面补光 + 轮廓光。
//
// three 的灯不能按物体挑，所以做成材质补丁：人物表面变体（Script_CharacterSurface，日军呢子 / 皮肤 / 装具…）、
// 国军布军装（CharacterClothPatches）、白盒编辑器的 X Bot 替身都挂这一段（补丁走 Script_MaterialPatches 注册表，契约 11）。
// 强弱与颜色是全局共用的一份 uniform：环境系统的组件逻辑每次换值调 SetCharacterLight，所有人一起变。
//   补光   随朝向：正对镜头的面最亮（摄影棚里机位旁那盏柔光），加在间接漫反射上 —— GTAO 照常压它
//   轮廓光 1 − 朝向的幂：只在人物边缘亮一圈，夜里、黄昏背光时把人从背景里勾出来，加在直接漫反射上
// 零采样器（不碰采样器预算），程序 key 只随 GLSL 变；两路强度都是 0 时整段跳过 —— 出厂就是 0，
// 没有区域文件的关卡、预设里没放这个组件的场景，画面逐像素不变。
import * as THREE from "three";
import { MakePatch } from "./Script_MaterialPatches.mjs";

export const CHARACTER_LIGHT_PATCH_KEY = "charLight1";

const uniforms = {
  uCharLight: { value: new THREE.Vector4(0, 0, 3, 0) },   // x 补光强度, y 轮廓光强度, z 轮廓收拢（幂）
  uCharFillColor: { value: new THREE.Color(1, 1, 1) },
  uCharRimColor: { value: new THREE.Color(1, 1, 1) },
};

export const CHARACTER_LIGHT_PATCH = MakePatch({
  key: CHARACTER_LIGHT_PATCH_KEY,
  uniforms: (target) => { Object.assign(target, uniforms); },
  fragment: [
    ["#include <common>", "uniform vec4 uCharLight;\nuniform vec3 uCharFillColor;\nuniform vec3 uCharRimColor;"],
    // lights_fragment_end：直射与间接都累加完、AO 还没乘（补光进间接项，跟着被 GTAO 压）
    ["#include <lights_fragment_end>", `
if ( uCharLight.x + uCharLight.y > 0.0 ) {
  float charFacing = clamp( dot( normal, geometryViewDir ), 0.0, 1.0 );
  reflectedLight.indirectDiffuse += uCharFillColor * ( uCharLight.x * charFacing ) * material.diffuseColor;
  reflectedLight.directDiffuse += uCharRimColor * ( uCharLight.y * pow( 1.0 - charFacing, uCharLight.z ) ) * material.diffuseColor;
}`],
  ],
});

/** 补丁列表里补上角色光照（已经有就原样返回）。 */
export function WithCharacterLight(patches) {
  const list = (patches || []).filter(Boolean);
  return list.some((p) => p.key === CHARACTER_LIGHT_PATCH_KEY) ? list : [...list, CHARACTER_LIGHT_PATCH];
}

/**
 * 换值（环境系统的 CharacterLight 组件参数：fill / fillColor / rim / rimColor / rimPower；颜色是 #rrggbb）。
 * null = 关掉（两路强度归零）。
 */
export function SetCharacterLight(values) {
  const v = values || {};
  uniforms.uCharLight.value.set(Math.max(0, Number(v.fill) || 0), Math.max(0, Number(v.rim) || 0), Math.max(0.5, Number(v.rimPower) || 3), 0);
  if (typeof v.fillColor === "string") uniforms.uCharFillColor.value.set(v.fillColor);
  if (typeof v.rimColor === "string") uniforms.uCharRimColor.value.set(v.rimColor);
}

export function CharacterLightState() {
  const l = uniforms.uCharLight.value;
  return {
    fill: l.x, rim: l.y, rimPower: l.z,
    fillColor: `#${uniforms.uCharFillColor.value.getHexString()}`, rimColor: `#${uniforms.uCharRimColor.value.getHexString()}`,
  };
}

/** 给 Script_EnvApply 当宿主用的那一面（组件逻辑只认 Set）。 */
export const CHARACTER_LIGHT_HOST = Object.freeze({ Set: SetCharacterLight, State: CharacterLightState });
