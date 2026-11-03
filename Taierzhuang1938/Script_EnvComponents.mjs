// 环境组件的执行逻辑（docs/Data_Environment.md §2）。声明在 Data_EnvComponents，这里一个 type 一份逻辑：
//
//   Compose(decl, values, out)        把求值 + 过渡之后的参数写进这一帧的环境参数 out（与 Script_Sky.SKY_PRESETS 同形，
//                                     天空、灯、反射、雾、后期都认这个形状 —— 渲染侧一行没改，见 Script_EnvApply）
//   FromLegacy(decl, legacy, values)  从一份旧天空预设读回这个组件的参数（预设种子、旧预设当临时覆盖）
//   Apply(decl, values, host)         可选：值变了就直接改灯 / 材质 / 渲染接口（不走环境参数的能力用，现在是角色光照）
//
// 多数组件只要声明里的 out 路径就够了（通用写法 ComposeByPath / ReadByPath）；只有换算或旧预设的缺省值依赖别的字段时才写自己的。
// 零 three 依赖（纯 Node 能测）。

import { ENV_COMPONENTS } from "./Data_EnvComponents.mjs";
import { CloneValue, HexToInt, IntToHex, ValueFits } from "./Script_EnvTrack.mjs";

/** 按「a.b.0」写路径（缺的对象 / 数组一路补上）。 */
export function SetPath(target, path, value) {
  const parts = String(path).split(".");
  let node = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    const nextIsIndex = /^\d+$/.test(parts[i + 1]);
    if (node[key] == null || typeof node[key] !== "object") node[key] = nextIsIndex ? [] : {};
    node = node[key];
  }
  node[parts[parts.length - 1]] = value;
}

export function GetPath(source, path) {
  let node = source;
  for (const key of String(path).split(".")) {
    if (node == null || typeof node !== "object") return undefined;
    node = node[key];
  }
  return node;
}

/** 通用写法：每个参数按 out 写进去（color 换成 three 吃的 0xrrggbb）。 */
export function ComposeByPath(decl, values, out) {
  for (const param of decl.params) {
    if (!param.out) continue;
    const value = values[param.key];
    SetPath(out, param.out, param.kind === "color" ? HexToInt(value) : CloneValue(value));
  }
}

/**
 * 旧预设里没写某一项时渲染侧实际用的值（各消费方自己的 `?? 缺省`），读回来要对得上「画面上是什么」：
 * 云层（Script_Sky.Apply）、物理大气（Script_Atmosphere.ATMOSPHERE_PRESET_DEFAULTS）、
 * 调色（Data_Tuning_Camera.GRADE_DEFAULTS，合成 pass 每帧现取）、泛光门槛与镜头光晕（Script_PostBloom / Script_Main）。
 */
const LEGACY_ABSENT = Object.freeze({
  "cloudShape.0": 5.5, "cloudShape.1": 0.445, "cloudShape.2": 0.615, "cloudShape.3": 0,
  "cloudDeck.structure": 0, "cloudDeck.underside": 0, "cloudDeck.gap": 1, "cloudDeck.silver": 0,
  "cloudDeck.scale": 1.6, "cloudDeck.coverage": 0.7, "cloudDeck.softness": 0.8, "cloudDeck.warp": 1.2,
  "cloudDeck.shade": [0.5, 0.5, 0.5],
  "atmosphere.mie": 1, "atmosphere.mieG": 0.8, "atmosphere.rayleigh": 1, "atmosphere.ozone": 1,
  "atmosphere.groundAlbedo": 0.3, "atmosphere.sunIrradiance": 20, "atmosphere.skyTint": [1, 1, 1],
  "atmosphere.skyFloor": [0, 0, 0], "atmosphere.artGlow": 0.35, "atmosphere.sunDiskT": 1, "atmosphere.belowVeil": 0,
  "atmosphere.aerialBlend": 1, "atmosphere.aerialGain": 1,
  "fog.grade.contrastCurve": "linear", "fog.grade.lift": [0.006, 0.004, 0.012], "fog.grade.gain": [1.02, 1.0, 0.965],
  "fog.grade.shadowTint": [0.855, 0.975, 1.170], "fog.grade.highlightTint": [1.105, 1.015, 0.880],
  "fog.grade.shadow": 1, "fog.grade.highlight": 1,
  bloomThreshold: 1.18, lensFlare: 1, godStrength: 0, bloom: 0,
});

/** 通用读法：按 out 从旧预设取；没写的取渲染侧缺省（LEGACY_ABSENT），再没有就保留声明默认值。 */
export function ReadByPath(decl, legacy, values) {
  for (const param of decl.params) {
    if (!param.out) continue;
    let value = GetPath(legacy, param.out);
    if (value === undefined && param.out in LEGACY_ABSENT) value = LEGACY_ABSENT[param.out];
    if (value === undefined) continue;
    if (param.kind === "color" && typeof value === "number") value = IntToHex(value);
    if (ValueFits(param, value)) values[param.key] = CloneValue(value);
  }
}

const Generic = Object.freeze({ Compose: ComposeByPath, FromLegacy: ReadByPath });

export const ENV_COMPONENT_LOGIC = Object.freeze({
  Sun: Generic,
  Ambient: Object.freeze({
    Compose: ComposeByPath,
    // LightRig.ApplyPreset 的缺省：没写 shProbe / 底色时按平行光强弱给白天或夜里那一档
    FromLegacy(decl, legacy, values) {
      ReadByPath(decl, legacy, values);
      const night = (legacy.lightIntensity ?? 1) <= 0.5;
      if (legacy.shProbeIntensity === undefined) values.probe = night ? 0.11 : 0.34;
      if (legacy.ambientColor === undefined) values.color = IntToHex(0x607085);
      if (legacy.ambientIntensity === undefined) values.intensity = night ? 0.045 : 0.16;
    },
  }),
  Reflection: Object.freeze({
    Compose: ComposeByPath,
    // Script_Sky.BakeEnvironment / Script_Gi.ApplyPreset：没写当 1
    FromLegacy(decl, legacy, values) { ReadByPath(decl, legacy, values); if (legacy.envIntensity === undefined) values.intensity = 1; },
  }),
  Sky: Generic,
  Clouds: Generic,
  Atmosphere: Generic,
  Fog: Generic,
  // 角色光照：环境参数里照样写一份（Debug.Lighting.Output 看得到），真正起作用的是 Apply ——
  // 直接改人物材质补丁的全局 uniform（Script_CharacterLight），不经天穹 / 灯。旧天空预设里没有它 = 关（强度 0）。
  CharacterLight: Object.freeze({
    Compose: ComposeByPath,
    FromLegacy: ReadByPath,
    Apply(decl, values, host) { host.characterLight?.Set(values); },
  }),
  // 武器补光：同角色光照，Apply 直接改第一人称视模材质补丁的 uniform（Script_FirstPersonSelfShadow.SetWeaponLight）。
  WeaponLight: Object.freeze({
    Compose: ComposeByPath,
    FromLegacy: ReadByPath,
    Apply(decl, values, host) { host.weaponLight?.Set(values); },
  }),
  Grade: Object.freeze({
    Compose: ComposeByPath,
    FromLegacy(decl, legacy, values, name) {
      ReadByPath(decl, legacy, values);
      const known = decl.params.find((p) => p.key === "profile").options.some((o) => o.value === name);
      if (known) values.profile = name;
    },
  }),
});

/** 声明表里每一种都有逻辑、逻辑表里没有多出来的（测试与框架开机都查）。→ 问题列表。 */
export function CheckComponentRegistry(decls = ENV_COMPONENTS, logic = ENV_COMPONENT_LOGIC) {
  const problems = [];
  const types = new Set();
  for (const decl of decls) {
    if (types.has(decl.type)) problems.push(`组件 ${decl.type} 声明了两次`);
    types.add(decl.type);
    if (!logic[decl.type]) problems.push(`组件 ${decl.type} 没有执行逻辑（Script_EnvComponents.ENV_COMPONENT_LOGIC）`);
    else if (typeof logic[decl.type].Compose !== "function" && typeof logic[decl.type].Apply !== "function") problems.push(`组件 ${decl.type} 的逻辑既不写环境参数也不直接作用`);
    const keys = new Set();
    for (const param of decl.params) {
      if (keys.has(param.key)) problems.push(`组件 ${decl.type} 的参数 ${param.key} 重名`);
      keys.add(param.key);
      if (!ValueFits(param, param.default)) problems.push(`组件 ${decl.type}.${param.key} 的默认值不合这个参数的类型`);
    }
    for (const key of Object.keys(decl.off || {})) if (!keys.has(key)) problems.push(`组件 ${decl.type} 的 off 写了不存在的参数 ${key}`);
  }
  for (const type of Object.keys(logic)) if (!types.has(type)) problems.push(`逻辑表里的 ${type} 没有声明`);
  return problems;
}

/**
 * 把各组件这一帧的参数拼成一份环境参数（与 SKY_PRESETS 同形）。
 * @param {Array<{decl, values, enabled}>} states 按声明顺序
 */
export function ComposeEnvironment(states, logic = ENV_COMPONENT_LOGIC) {
  const out = {};
  for (const { decl, values } of states) logic[decl.type]?.Compose?.(decl, values, out);
  return out;
}
