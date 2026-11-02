// 组件式环境系统的纯 Node 门禁（docs/Data_Environment.md §9，秒级）。
//
// 查：组件声明与执行逻辑对得上；参数求值（固定值 / 关键帧跨午夜 / 对数 / 最短弧 / 线性光颜色 / 枚举就近）；
// 关键帧编辑（联动 tag、插帧、挪帧、删帧）；预设与区域文件的校验与写法（读回逐字相同）；旧天空预设 → 组件 → 拼回去
// 与原预设在渲染侧读的每一项上一致；按组件选来源（局部只盖自己有的组件、完全覆盖截断、走出区域退回下层）；
// 来源切换从当时的实际表现过渡、过渡中时钟照走；临时覆盖的句柄释放；仓库里两个场景的兜底区域与三套表现。

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ENV_COMPONENTS, ENV_CATEGORIES } from "./Data_EnvComponents.mjs";
import {
  EvalParamValue, LerpParamValue, SetKeyAt, SetKeyValue, MoveKey, RemoveKey, ToTrack, ToConstant, WrapHour, HexToInt, IntToHex,
} from "./Script_EnvTrack.mjs";
import { CheckComponentRegistry, ComposeEnvironment, GetPath } from "./Script_EnvComponents.mjs";
import {
  ValidateEnvPreset, ValidateSceneEnv, FormatEnvJson, EnvPresetFromSkyPreset, EnvPresetFromLooks, NewEnvPreset, NewVolume,
  VolumeContains, SCENE_ENV_FILE_RE, ENV_PRESET_FILE_RE, EnvPresetRepoPath, SceneEnvRepoPath,
} from "./Script_EnvPreset.mjs";
import { EnvironmentSystem, OffValues, EvaluatePreset } from "./Script_EnvSystem.mjs";
import { SKY_PRESETS } from "./Script_Sky.mjs";
import { SCENE_LIST } from "./Data_SceneAssets.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
let checks = 0;
const Check = (ok, message) => { checks += 1; assert.ok(ok, message); };
const Near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// --- 1. 组件注册 ------------------------------------------------------------------------------------------
Check(CheckComponentRegistry().length === 0, `组件声明与逻辑对不上：${CheckComponentRegistry().join("；")}`);
const categories = new Set(ENV_CATEGORIES.map((c) => c.id));
for (const decl of ENV_COMPONENTS) Check(categories.has(decl.category), `${decl.type} 的分类 ${decl.category} 没登记`);
Check(ENV_COMPONENTS.length >= 8, "至少八种代表组件");

// --- 2. 参数求值 ------------------------------------------------------------------------------------------
const num = { kind: "number", default: 0 };
const track = { keys: [{ h: 22, v: 10 }, { h: 4, v: 10 }, { h: 12, v: 50 }], interp: "linear" };
Check(EvalParamValue(num, track, 23) === 10 && EvalParamValue(num, track, 2) === 10, "22→4 点跨午夜保持（两帧同值）");
Check(Near(EvalParamValue(num, track, 8), 30), "4→12 线性插值的中点");
Check(EvalParamValue(num, track, 12) === 50, "落在关键帧上取这一帧");
Check(Near(EvalParamValue(num, { keys: [{ h: 6, v: 0 }, { h: 18, v: 12 }], interp: "linear" }, 0), 6), "18→6 跨午夜插值");
Check(EvalParamValue(num, { keys: [{ h: 6, v: 1 }, { h: 18, v: 2 }], interp: "step" }, 17) === 1, "step 保持前一帧");
const smooth = EvalParamValue(num, { keys: [{ h: 0, v: 0 }, { h: 12, v: 1 }] }, 3);
Check(smooth > 0 && smooth < 0.25, "smooth 是缓入");
Check(EvalParamValue(num, 7, 3) === 7 && EvalParamValue(num, undefined, 3) === 0, "固定值原样、没写给默认值");
Check(Near(LerpParamValue({ kind: "number", lerp: "log" }, 1, 100, 0.5), 10), "对数插值");
Check(Near(LerpParamValue({ kind: "rgb", lerp: "log" }, [1, 4, 0], [100, 1, 2], 0.5)[1], 2) && LerpParamValue({ kind: "rgb", lerp: "log" }, [1, 4, 0], [100, 1, 2], 0.5)[2] === 1, "rgb 逐通道对数（有 0 的通道退回线性）");
Check(Near(LerpParamValue({ kind: "angle" }, 350, 10, 0.5), 0) || Near(LerpParamValue({ kind: "angle" }, 350, 10, 0.5), 360), "角度走最短弧");
const mid = LerpParamValue({ kind: "color" }, "#000000", "#ffffff", 0.5);
Check(mid === "#bcbcbc", `颜色按线性光插值（中点 ${mid}）`);
Check(LerpParamValue({ kind: "enum" }, "a", "b", 0.49) === "a" && LerpParamValue({ kind: "enum" }, "a", "b", 0.5) === "b", "枚举就近取");
Check(HexToInt("#fff2df") === 0xfff2df && IntToHex(0x607085) === "#607085", "颜色编码来回");

// --- 3. 关键帧编辑 ----------------------------------------------------------------------------------------
const tagged = { keys: [{ h: 4, v: 1, tag: "night" }, { h: 12, v: 5, tag: "day" }, { h: 22, v: 1, tag: "night" }] };
const linked = SetKeyValue(tagged, 2, 2);
Check(linked.keys[0].v === 2 && linked.keys[2].v === 2 && linked.keys[1].v === 5, "同 tag 的帧联动改");
const onKey = SetKeyAt(tagged, 12.02, 9);
Check(onKey.track.keys.length === 3 && onKey.track.keys[1].v === 9, "指针在帧上 → 改这一帧");
const inserted = SetKeyAt(tagged, 15, 7);
Check(inserted.track.keys.length === 4 && inserted.track.keys[3].h === 15, "不在帧上 → 插一帧");
Check(MoveKey(tagged, 1, 13).keys[1].h === 13 && MoveKey(tagged, 1, 22).keys[1].h === 12, "挪帧；撞上别的帧不挪");
Check(RemoveKey(tagged, 0).keys.length === 2 && RemoveKey({ keys: [{ h: 1, v: 1 }] }, 0).keys.length === 1, "删帧；最后一帧不删");
Check(ToTrack(3, [12, 18]).keys.length === 2 && ToConstant(num, tagged, 12) === 5, "固定值 ↔ 关键帧");
Check(tagged.keys[2].v === 1, "编辑函数不改原对象");

// --- 4. 旧预设 → 组件 → 拼回去，渲染侧读到的每一项一致 ----------------------------------------------------------
const RENDER_FIELDS = [
  "sunElevation", "sunAzimuth", "lightColor", "lightIntensity", "sunColor", "sunIntensity", "sunSize",
  "zenith", "horizon", "ground", "glow", "glowSpread", "smoke", "smokeColor", "smokeHeight", "stars", "envIntensity",
  "fog.density", "fog.falloff", "fog.max", "fog.sky", "fog.ground", "fog.sunGain", "fog.desat", "fog.flatten",
  "exposure", "saturation", "contrast", "bloom", "godStrength",
  "atmosphere.mie", "atmosphere.rayleigh", "atmosphere.groundAlbedo", "atmosphere.sunIrradiance", "atmosphere.skyTint", "atmosphere.skyFloor",
  "atmosphere.aerialGain", "atmosphere.artGlow",
];
function SameDeep(a, b) {
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((v, i) => SameDeep(v, b[i]));
  if (typeof a === "number") return typeof b === "number" && Near(a, b, 1e-9);
  return a === b;
}
function ComposePreset(preset, hour) {
  const values = EvaluatePreset(preset, hour);
  return ComposeEnvironment(ENV_COMPONENTS.map((decl) => ({ decl, values: values[decl.type] || OffValues(decl), enabled: !!values[decl.type] })));
}
for (const name of ["firstLevelBattleDay", "dusk", "firstLevelNight", "whiteboxDay", "night", "dawn"]) {
  const legacy = SKY_PRESETS[name];
  const composed = ComposePreset(EnvPresetFromSkyPreset(legacy, name), 12);
  for (const field of RENDER_FIELDS) {
    const want = GetPath(legacy, field);
    if (want === undefined) continue;
    Check(SameDeep(GetPath(composed, field), want), `${name}.${field}：拼回去 ${JSON.stringify(GetPath(composed, field))} ≠ 原 ${JSON.stringify(want)}`);
  }
  if (legacy.cloudDeck) for (const k of Object.keys(legacy.cloudDeck)) Check(SameDeep(composed.cloudDeck[k], legacy.cloudDeck[k]), `${name}.cloudDeck.${k}`);
  if (legacy.fog.grade) for (const k of Object.keys(legacy.fog.grade)) Check(SameDeep(composed.fog.grade[k], legacy.fog.grade[k]), `${name}.fog.grade.${k}`);
  Check(composed.profile === name, `${name} 的后期档案`);
}
// 没写的项按渲染侧缺省读回（白天的 shProbe、夜里的环境底色、没写 lensFlare = 1）
const night = ComposePreset(EnvPresetFromSkyPreset(SKY_PRESETS.night, "night"), 0);
Check(night.shProbeIntensity === 0.11 && night.ambientIntensity === 0.045 && night.ambientColor === 0x607085 && night.lensFlare === 1, "夜战缺省的天光与镜头光晕");

// --- 5. 校验与写法 ----------------------------------------------------------------------------------------
const looks = EnvPresetFromLooks("Test", "测试", [
  { id: "day", label: "白天", hours: [12], legacy: SKY_PRESETS.firstLevelBattleDay, name: "firstLevelBattleDay" },
  { id: "night", label: "晚上", hours: [22, 4], legacy: SKY_PRESETS.firstLevelNight, name: "firstLevelNight" },
]);
Check(ValidateEnvPreset(looks).ok, `拼出来的预设合规：${ValidateEnvPreset(looks).errors.join("；")}`);
Check(typeof looks.components.Sun.params.discSize === "number", "只能固定的参数不出关键帧");
Check(typeof looks.components.Fog.params.falloff === "object", "各套不一样的出关键帧");
Check(JSON.stringify(JSON.parse(FormatEnvJson(looks))) === JSON.stringify(looks), "写法读回逐字相同");
const bad = NewEnvPreset("Bad", "坏", { Nope: {}, Sun: { params: { elevation: "高", discSize: { keys: [{ h: 1, v: 1 }] }, azimuth: { keys: [{ h: 1, v: 1 }, { h: 1, v: 2 }] } } } });
const badCheck = ValidateEnvPreset(bad);
Check(!badCheck.ok && badCheck.errors.length >= 4, `坏预设报全（${badCheck.errors.length}）：${badCheck.errors.join("；")}`);
const sceneDoc = { schema: "tengxian-env-scene/1", scene: "T", time: { hour: 12, speed: 0.1, paused: true }, volumes: [NewVolume("global", { id: "Fallback", preset: "Base", priority: 0, blendS: 0, mode: "full" })] };
Check(ValidateSceneEnv(sceneDoc, { presetIds: new Set(["Base"]) }).ok, "区域文件合规");
Check(!ValidateSceneEnv(sceneDoc, { presetIds: new Set(["Other"]) }).ok, "引用读不到的预设 = 错");
Check(ValidateSceneEnv({ ...sceneDoc, volumes: [] }).warnings.length === 1, "没有兜底区域要提醒");
Check(SCENE_ENV_FILE_RE.test(SceneEnvRepoPath("FirstLevel")) && !SCENE_ENV_FILE_RE.test("Taierzhuang1938/Scenes/A/Environment_B.json"), "区域文件路径闸");
Check(ENV_PRESET_FILE_RE.test(EnvPresetRepoPath("FirstLevel")) && !ENV_PRESET_FILE_RE.test("Taierzhuang1938/Environment/../x.json"), "预设文件路径闸");
const box = NewVolume("box", { center: [10, 0, 10], size: [4, 4, 8], yawDeg: 90 });
Check(VolumeContains(box, { x: 13, y: 0, z: 10 }) && !VolumeContains(box, { x: 10, y: 0, z: 13 }), "盒子转 90° 之后长边在 X 上");
Check(VolumeContains(NewVolume("sphere", { center: [0, 0, 0], radius: 5 }), { x: 3, y: 0, z: 3 }), "球形区域");

// --- 6. 按组件选来源 + 过渡 ------------------------------------------------------------------------------------
function MakePreset(id, components) { return NewEnvPreset(id, id, components); }
const base = MakePreset("Base", {
  Sun: { enabled: true, params: { intensity: { keys: [{ h: 0, v: 0 }, { h: 12, v: 12 }], interp: "linear" } } },
  Fog: { enabled: true, params: { density: 0.01 } },
  Grade: { enabled: true, params: { exposure: 1 } },
});
const local = MakePreset("Local", { Fog: { enabled: true, params: { density: 0.03 } } });
const full = MakePreset("Full", { Grade: { enabled: true, params: { exposure: 2 } } });
const env = new EnvironmentSystem();
env.SetScene("T", {
  schema: "tengxian-env-scene/1", scene: "T", time: { hour: 6, speed: 1, paused: true },
  volumes: [
    NewVolume("global", { id: "Fallback", preset: "Base", priority: 0, blendS: 0, mode: "full" }),
    NewVolume("box", { id: "Hut", preset: "Local", priority: 10, blendS: 2, mode: "partial", center: [0, 0, 0], size: [10, 10, 10] }),
    NewVolume("box", { id: "Cave", preset: "Full", priority: 20, blendS: 1, mode: "full", center: [100, 0, 0], size: [10, 10, 10] }),
  ],
}, new Map([["Base", base], ["Local", local], ["Full", full]]));
const outside = { x: 50, y: 0, z: 50 }, inHut = { x: 1, y: 0, z: 1 }, inCave = { x: 100, y: 0, z: 0 };
let out = env.Update(0, outside);
Check(Near(out.components.Sun.values.intensity, 6) && out.components.Fog.values.density === 0.01, "兜底区域在 6 点求值");
Check(out.components.Sky.enabled === false && out.components.Sky.source.id === "Fallback", "完全覆盖的兜底没有的组件取关闭值，来源仍记兜底");
Check(Near(out.preset.lightIntensity, 6) && out.preset.fog.density === 0.01 && out.preset.exposure === 1, "拼出来的环境参数");
out = env.Update(0, inHut);
Check(out.components.Fog.source.id === "Hut" && out.components.Sun.source.id === "Fallback", "局部只盖自己有的组件（雾），其余继承兜底");
Check(Near(out.components.Fog.values.density, 0.01), "刚进区域：从当时的实际表现起步");
env.SetPaused(false);
out = env.Update(1, inHut);
Check(out.components.Fog.values.density > 0.01 && out.components.Fog.values.density < 0.03, "过渡进行到一半");
Check(Near(out.components.Sun.values.intensity, 7), "过渡中时钟照走（6 → 7 点）");
out = env.Update(1.01, inHut);
Check(Near(out.components.Fog.values.density, 0.03), "过渡走完");
env.SetPaused(true);
out = env.Update(0, inCave);
out = env.Update(5, inCave);
Check(out.components.Grade.values.exposure === 2 && out.components.Fog.enabled === false && out.components.Sun.enabled === false, "完全覆盖：没有的组件取关闭值，不继承下层");
Check(out.components.Fog.values.density === 0 && out.components.Sun.values.intensity === 0, "关闭值");
out = env.Update(0, outside);
const leavingFrom = out.components.Grade.values.exposure;
out = env.Update(0.5, outside);
Check(leavingFrom === 2 && out.components.Grade.values.exposure < 2 && out.components.Grade.values.exposure > 1, "走出区域按离开那一层的 blendS 过渡回去");
out = env.Update(1, outside);
Check(out.components.Grade.values.exposure === 1, "回到兜底");
// 临时覆盖
const handle = env.PushOverride({ id: "Flash", preset: MakePreset("Flash", { Grade: { enabled: true, params: { exposure: 4 } } }), priority: 100, blendS: 0 });
out = env.Update(0, outside);
Check(out.components.Grade.values.exposure === 4 && out.components.Grade.source.kind === "override", "临时覆盖立刻生效（blendS 0）");
Check(env.Sources()[0].id === "Flash" && env.Sources()[0].providing.includes("Grade"), "总览按优先级排、标出提供了哪些组件");
Check(handle.Release(1) && !handle.active, "句柄释放");
out = env.Update(0.5, outside);
Check(out.components.Grade.values.exposure < 4 && out.components.Grade.values.exposure > 1, "释放后按给的时长过渡回去");
out = env.Update(1, outside);
Check(out.components.Grade.values.exposure === 1 && !env.Sources().some((s) => s.id === "Flash"), "覆盖撤干净");
// 组件关掉 = 不参与（下层接手）
local.components.Fog.enabled = false;
env.Touch();
out = env.Update(10, inHut);
Check(out.components.Fog.source.id === "Fallback", "关掉的组件不当来源，下层接手");
const sameOut = env.Update(0, inHut);
Check(sameOut === out, "没变化时不重算（同一个输出对象）");
Check(env.SetLook("nope") === null, "没有的 look");

// --- 7. 仓库里的两个场景：兜底区域 + 配套预设（白天 / 黄昏 / 晚上） ---------------------------------------------------
const sceneIds = SCENE_LIST.map((s) => s.id);
for (const sceneId of ["FirstLevelWhitebox", "FirstLevel"]) {
  Check(sceneIds.includes(sceneId), `${sceneId} 在场景清单里`);
  const sceneFile = path.join(repo, SceneEnvRepoPath(sceneId));
  Check(fs.existsSync(sceneFile), `${sceneId} 有区域文件`);
  const text = fs.readFileSync(sceneFile, "utf8");
  const doc = JSON.parse(text);
  Check(text === FormatEnvJson(doc), `${sceneId} 区域文件按统一写法（读回重写逐字相同）`);
  const presetIds = new Set(doc.volumes.map((v) => v.preset));
  const presets = new Map();
  for (const id of presetIds) {
    const presetText = fs.readFileSync(path.join(repo, EnvPresetRepoPath(id)), "utf8");
    const preset = JSON.parse(presetText);
    const check = ValidateEnvPreset(preset);
    Check(check.ok, `${id} 预设合规：${check.errors.join("；")}`);
    Check(presetText === FormatEnvJson(preset), `${id} 预设按统一写法`);
    presets.set(id, preset);
  }
  const check = ValidateSceneEnv(doc, { presetIds: new Set(presets.keys()) });
  Check(check.ok && !check.warnings.length, `${sceneId} 区域文件合规：${check.errors.concat(check.warnings).join("；")}`);
  const fallback = doc.volumes.find((v) => v.shape === "global");
  Check(fallback && fallback.mode === "full" && fallback.priority === 0, `${sceneId} 有完全覆盖的兜底区域`);
  const preset = presets.get(fallback.preset);
  Check(preset.id === sceneId, `${sceneId} 的兜底引用配套预设 ${sceneId}`);
  const lookIds = preset.looks.map((l) => l.id);
  Check(["day", "dusk", "night"].every((id) => lookIds.includes(id)), `${sceneId} 预设有白天 / 黄昏 / 晚上`);
  const sys = new EnvironmentSystem();
  sys.SetScene(sceneId, doc, presets);
  Check(sys.Looks().length === 3, "Looks 取兜底预设的");
  const at = (hour) => { sys.SetHour(hour); return sys.Update(0, { x: 0, y: 0, z: 0 }).preset; };
  const day = at(sys.SetLook("day") ?? 12);
  for (const field of RENDER_FIELDS) {
    const want = GetPath(SKY_PRESETS.firstLevelBattleDay, field);
    if (want !== undefined) Check(SameDeep(GetPath(day, field), want), `${sceneId} 白天 = firstLevelBattleDay（${field}）`);
  }
  Check(day.profile === "firstLevelBattleDay", "白天的后期档案");
  const dusk = at(18), nightOut = at(22), late = at(2), dawn = at(8);
  Check(dusk.profile === "dusk" && dusk.lightColor === SKY_PRESETS.dusk.lightColor && dusk.sunAzimuth === SKY_PRESETS.dusk.sunAzimuth, `${sceneId} 黄昏`);
  Check(nightOut.profile === "firstLevelNight" && nightOut.exposure === SKY_PRESETS.firstLevelNight.exposure, `${sceneId} 晚上`);
  Check(late.exposure === nightOut.exposure && late.lightIntensity === nightOut.lightIntensity, `${sceneId} 夜里 22→4 点保持同一套`);
  Check(dawn.lightIntensity > nightOut.lightIntensity && dawn.lightIntensity < day.lightIntensity, `${sceneId} 早上 8 点在夜与白天之间`);
  // 画面亮度 ≈ 平行光 × 曝光：过渡中间不许比两头都亮（20 点、8 点、15 点）
  const lit = (p) => p.lightIntensity * p.exposure;
  for (const [hour, a, b] of [[20, dusk, nightOut], [8, nightOut, day], [15, day, dusk]]) {
    const m = at(hour);
    Check(lit(m) <= Math.max(lit(a), lit(b)) + 1e-9 && lit(m) >= Math.min(lit(a), lit(b)) - 1e-9, `${sceneId} ${hour} 点的亮度在两头之间（${lit(m).toFixed(2)}）`);
  }
  const afternoon = at(15);
  Check(afternoon.sunElevation < day.sunElevation && afternoon.sunElevation > dusk.sunElevation, `${sceneId} 下午 3 点太阳在正午与黄昏之间`);
  Check(WrapHour(25) === 1, "时钟回绕");
}

console.log(`EnvSystemTest：${checks} 项通过`);
