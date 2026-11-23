// 太阳阴影的公共采样接口（零游戏依赖，只引 Script_Csm 的着色器与 uniform 包）。
//
// 体积雾、接触阴影、血迹贴花、头发这类「自己的 pass 里要问这一点晒不晒得到太阳」的着色器用它。
// 以前它住在 Script_Light（灯光装置）里：贴花为了这两行 import 了整个灯光装置。灯光装置
// 照旧再导出这两个名字，老的调用点不用改；用法与契约见 Script_Light 文件头那一段。

import { SUN_SHADOW_SAMPLER_GLSL, MakeSunShadowUniforms } from "./Script_Csm.mjs";

/** GLSL：SunShadowVisibility / SunShadowVisibilityCheap / SunShadowPenumbraTexels。 */
export const SUN_SHADOW_GLSL = SUN_SHADOW_SAMPLER_GLSL;

/**
 * 在一份 uniforms 上建齐 `SUN_SHADOW_GLSL` 要的条目，并接上当前的级联阴影图。
 * `lightRig` 传 null 也合法（建条目、置 `uSunShadowEnabled = 0`），
 * 之后再调 `lightRig.SyncShadowUniforms()` 补上。
 * @returns {object} 同一份 uniforms（方便链式）
 */
export function BindSunShadowUniforms(uniforms, lightRig = null) {
  MakeSunShadowUniforms(uniforms);
  if (lightRig) {
    lightRig.RegisterShadowUniforms(uniforms);
    lightRig.SyncShadowUniforms();
  }
  return uniforms;
}
