// 第一关天空 / 调色 / 室内明暗 / 远景烟柱（2026-09-28 B4）的纯 Node 门禁。
// 口径：docs/Data_TechRenderPipeline.md §2.10（天与调色）、§5.11（室内天光遮蔽）。
//   node Taierzhuang1938/Script_FirstLevelSkyGradeTest.mjs
// 守五件事：①「先别动雾」—— 第一关两档的雾块与 70 m 透过率逐位不变；② 其余预设的分级仍吃出厂值；
// ③ 第一关的曝光钳位与锚点登记了；④ 室内遮蔽体：每间屋子找得到采光口，屋里深处暗、门口亮、
// 外墙面与屋面一点不暗；⑤ 远景烟柱只改形不改数：数量、位置不变，漂移仍共用主导风向。
import assert from "node:assert/strict";
import { SKY_PRESETS } from "./Script_Sky.mjs";
import { SkyExposureFor, GRADE_DEFAULTS } from "./Data_Tuning_Camera.mjs";
import { GradeMathJs, SrgbToLinearJs, LinearToSrgbJs } from "./Script_PostGrade.mjs";
import {
  MakeVolumetricParams, AnalyticTransmittance, FroxelTransmittance, VISIBILITY_REFERENCE,
} from "./Data_Tuning_Volumetrics.mjs";
import { INTERIOR_SKY } from "./Data_Tuning_Lights.mjs";
import {
  BuildInteriorVolumes, InteriorSkyVisibility, INTERIOR_LIMITS, FIRST_LEVEL_INTERIORS,
} from "./Data_FirstLevelInteriors.mjs";
import { MISSION_LAYOUT } from "./Data_FirstLevelMissionLayout.mjs";
import { SampleMissionTerrain, SampleMissionNaturalHeight } from "./Data_FirstLevelMissionTerrain.mjs";
import { FIRST_LEVEL_DISTANT_SMOKE, DISTANT_SMOKE_REGIONS } from "./Data_FirstLevelDistantSmoke.mjs";
import { FIRST_LEVEL_MISSION_PHASE } from "./Data_FirstLevelMission.mjs";

// ① 雾：第一关白天沿用 2026-09-26 那一块（density / falloff / max 一个字不许动），
//    夜档与 night 同一块；70 m 处的透过率（地面 / 站姿眼高 / 2.6 m）逐位等于改前。
const day = SKY_PRESETS.firstLevelBattleDay;
assert.deepEqual([day.fog.density, day.fog.falloff, day.fog.max], [0.0032, 45, 0.72], "first-level day fog is untouched");
const night = SKY_PRESETS.firstLevelNight;
for (const key of ["density", "falloff", "max", "base"]) {
  assert.equal(night.fog[key], SKY_PRESETS.night.fog[key], `firstLevelNight fog.${key} equals night`);
}
assert.notEqual(night.fog, SKY_PRESETS.night.fog, "firstLevelNight owns its fog object (volumetrics look presets up by it)");
const expected70 = { 0: 0.7993, 1.7: 0.8068, 2.6: 0.8106 };
for (const height of VISIBILITY_REFERENCE.heights) {
  const params = MakeVolumetricParams("firstLevelBattleDay", day.fog);
  const analytic = AnalyticTransmittance(params, 70, height);
  assert.ok(Math.abs(analytic - expected70[height]) < 5e-5, `70 m transmittance at ${height} m stays ${expected70[height]} (${analytic.toFixed(4)})`);
  assert.ok(FroxelTransmittance(params, 70, height) >= analytic - 1e-9, `froxel never thicker than the analytic fog at ${height} m`);
  const nightParams = MakeVolumetricParams("firstLevelNight", night.fog);
  assert.ok(FroxelTransmittance(nightParams, 70, height) >= AnalyticTransmittance(nightParams, 70, height) - 1e-9,
    `night froxel never thicker at ${height} m`);
}
console.log("ok fog: first-level day/night fog blocks unchanged, 70 m transmittance",
  VISIBILITY_REFERENCE.heights.map((h) => expected70[h]).join(" / "));

// ② 分级：出厂值 = 2026-09 之前 uniform 的出厂值；没写 grade 的预设一个都没有 fog.grade。
assert.deepEqual([...GRADE_DEFAULTS.lift], [0.006, 0.004, 0.012]);
assert.deepEqual([...GRADE_DEFAULTS.gain], [1.02, 1.0, 0.965]);
assert.deepEqual([...GRADE_DEFAULTS.shadowTint], [0.855, 0.975, 1.170]);
assert.deepEqual([...GRADE_DEFAULTS.highlightTint], [1.105, 1.015, 0.880]);
const graded = Object.entries(SKY_PRESETS).filter(([, p]) => p.fog?.grade).map(([name]) => name);
assert.deepEqual(graded, ["firstLevelBattleDay"], "only the first-level day preset carries its own grade");
assert.ok(day.cloudDeck?.structure > 0 && night.cloudDeck?.structure > 0, "both first-level skies use the structured cloud deck");
const decks = Object.entries(SKY_PRESETS).filter(([, p]) => p.cloudDeck).map(([name]) => name).sort();
assert.deepEqual(decks, ["firstLevelBattleDay", "firstLevelNight"], "no other preset changes its clouds");
assert.equal(night.stars, 0, "overcast night hides the stars");
// 对比 S 曲线：中灰不动、暗部只压不裁（线性拉伸 1.10 把 sRGB 0.03 裁成 0）、高光不溢出
const neutral = { lift: [0, 0, 0], gain: [1, 1, 1], shadowTint: [1, 1, 1], highlightTint: [1, 1, 1],
  splitShadow: 0, splitHighlight: 0, contrast: day.contrast };
const Grade = (srgb, curve) => LinearToSrgbJs(GradeMathJs([SrgbToLinearJs(srgb), SrgbToLinearJs(srgb), SrgbToLinearJs(srgb)],
  { ...neutral, contrastCurve: curve })[0]);
assert.equal(day.fog.grade.contrastCurve, "soft");
// 第二轮（2026-09-28）：出厂 lift 是蓝紫底（G 最低、B 最高），屋里一压暗就成了主色 —— 第一关必须归零；
// 室内补回来的是暖反弹（R ≥ G ≥ B），不是天色。
assert.deepEqual(day.fog.grade.lift, [0, 0, 0], "first-level grade has no lift (the default blue-magenta lift tinted every dark interior)");
assert.ok(GRADE_DEFAULTS.lift[2] > GRADE_DEFAULTS.lift[0] && GRADE_DEFAULTS.lift[1] < GRADE_DEFAULTS.lift[0],
  "sanity: the factory lift really is the magenta-blue one this rule guards against");
const bounce = INTERIOR_SKY.bounce;
assert.ok(bounce.strength > 0 && bounce.color[0] >= bounce.color[1] && bounce.color[1] >= bounce.color[2],
  "interior fill is a warm ground/wall bounce");
assert.equal(Grade(0.03, 0), 0, "linear stretch crushes sRGB 0.03 at the first-level contrast (why the soft curve exists)");
assert.ok(Grade(0.03, 1) > 0.01 && Grade(0.03, 1) < 0.03, "soft curve deepens the shadow without clipping it");
assert.ok(Math.abs(Grade(0.5, 1) - 0.5) < 1e-6 && Grade(0.98, 1) < 1, "soft curve keeps mid grey and rolls off the top");
console.log("ok grade: defaults unchanged, grade + cloud deck limited to the first level, soft contrast curve",
  `0.03→${Grade(0.03, 1).toFixed(4)}`);

// ③ 曝光：第一关 id 的锚点登记、室内提亮最多半档、看天最多压 0.35 EV。
assert.equal(FIRST_LEVEL_MISSION_PHASE.id, "FirstLevelP012Whitebox");
assert.equal(FIRST_LEVEL_MISSION_PHASE.sky, "firstLevelBattleDay");
const exposure = SkyExposureFor("firstLevelBattleDay", FIRST_LEVEL_MISSION_PHASE.id);
assert.ok(Number.isFinite(exposure.logLum), "first level has a measured exposure anchor");
assert.ok(exposure.evUp <= 0.6 && exposure.evDown <= 0.35, "auto exposure only half-adapts indoors and barely reacts to the sky");
assert.equal(SkyExposureFor("firstLevelNight").evUp, SkyExposureFor("night").evUp, "night clamp copied from night");
console.log("ok exposure: anchor", exposure.logLum, "evUp", exposure.evUp, "evDown", exposure.evDown);

// ④ 室内遮蔽体
const ground = (x, z) => SampleMissionTerrain(x, z);
const volumes = BuildInteriorVolumes(MISSION_LAYOUT, ground);
assert.equal(volumes.length, FIRST_LEVEL_INTERIORS.rooms.length, "every listed room builds");
assert.ok(volumes.length <= INTERIOR_LIMITS.rooms, "rooms fit the uniform array");
assert.ok(volumes.reduce((n, v) => n + v.portals.length, 0) <= INTERIOR_LIMITS.portals, "portals fit the uniform array");
for (const room of volumes) {
  if (room.id === "KitchenLink") continue;   // 有顶的过道：两头都是屋子，本来就没有采光口
  assert.ok(room.portals.length >= 1, `${room.id} finds at least one opening to the sky`);
  for (const p of room.portals) assert.ok(p.area > 0.25 && p.area < 30, `${room.id} ${p.face} opening is door/window sized (${p.area})`);
}
assert.deepEqual(BuildInteriorVolumes({ id: "SomethingElse", blocks: [] }, ground), [], "other layouts get no interiors");
const V = (x, z, h) => InteriorSkyVisibility(volumes, [x, ground(x, z) + h, z], INTERIOR_SKY);
const bunkerFloor = SampleMissionNaturalHeight(-0.8, -125.8) - 2.0;
const readings = {
  kitchenDeep: V(58, -5, 0.05), kitchenNearDoor: V(58, -15.5, 1.0), outsideKitchen: V(58, -18, 0.05),
  kitchenWestWallOutside: V(51.69, -9, 1.5), kitchenRoofTop: V(58, -9, 3.3), wardDeep: V(-26, 229, 0.05),
  bunkerBack: InteriorSkyVisibility(volumes, [-2.8, bunkerFloor + 0.1, -126], INTERIOR_SKY),
  bunkerMouth: InteriorSkyVisibility(volumes, [0.5, bunkerFloor + 0.8, -125.9], INTERIOR_SKY),
  streetOutside: V(77, 5, 1.0),
};
assert.ok(readings.kitchenDeep < 0.2, "deep inside the kitchen the sky is mostly blocked");
assert.ok(readings.wardDeep < 0.25, "the ward's north bay is dim");
assert.ok(readings.bunkerBack < 0.55, "the back of the dugout is dim");
assert.ok(readings.kitchenNearDoor > 0.5 && readings.bunkerMouth > 0.7, "next to the openings the sky light is back");
for (const key of ["outsideKitchen", "kitchenWestWallOutside", "kitchenRoofTop", "streetOutside"]) {
  assert.equal(readings[key], 1, `${key} is not darkened`);
}
console.log("ok interiors:", volumes.map((v) => `${v.id}(${v.portals.length})`).join(" "),
  Object.entries(readings).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(" "));

// ⑤ 远景烟柱：数量、位置、区域不变；带 plume 的只有远景；漂移仍是同一个主导风向。
const far = FIRST_LEVEL_DISTANT_SMOKE.filter((s) => s.tier === "far");
assert.equal(far.length, DISTANT_SMOKE_REGIONS.length * 4, "four distant plumes per reference region");
assert.ok(FIRST_LEVEL_DISTANT_SMOKE.every((s) => !s.options.backdrop.plume || s.tier === "far"), "only far columns carry a plume");
for (const s of far) {
  const region = DISTANT_SMOKE_REGIONS.find((r) => r.id === s.region);
  assert.ok(Math.abs(s.x - region.x) <= 1.15 * region.spread + 3 && Math.abs(s.z - region.z) <= 5, `${s.id} stays in its region`);
  const p = s.options.backdrop;
  assert.ok(p.driftX < 0 && Math.abs(p.driftZ) < 12, `${s.id} drifts downwind`);
  if (p.plume) assert.ok(p.plume[0] >= 1.3 && p.plume[1] >= 0 && p.plume[2] >= 0 && p.plume[2] < 1, `${s.id} plume in range`);
}
const tallest = Math.max(...far.map((s) => s.options.backdrop.height));
assert.ok(tallest > 60 && tallest < 90, `soot columns rise high but stay plausible (${tallest.toFixed(1)} m)`);
console.log("ok distant smoke:", far.length, "far plumes, tallest", tallest.toFixed(1), "m");
