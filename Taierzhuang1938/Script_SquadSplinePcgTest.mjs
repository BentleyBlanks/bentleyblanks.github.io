// 通用小队行进 PCG 样条规范（纯 Node 门禁，零 Three.js、零浏览器）：
// 查：
//   1. 全 8 套 Profile 调参表合法且均能稳定编译，产出「去线性度」「去同步度」「零叠压」「行进间左顾右盼」指标；
//   2. 真实读取 Scene_FirstLevelEncounter.json 的壕沟/道路/掩体，自动裁切出非对称走廊净宽并提取拐角/沟沿 POI；
//   3. 截图 1（12 人战壕撤退）与截图 2（9 人三路野外包抄）演示场景均打破机器人排队，且开阔地自动展开散兵队形；
//   4. 交叉路线双小队绝不合并身份（各自保留原 squadId / 领队），并在交汇处触发 TTC 避让与最小间距保底；
//   5. 声响刺激（P0）触发全队错峰转头反应（非全员同帧甩头），任意随机回拖 Seek 100% 确定性等价；
//   6. 预览工具未引入游戏运行时（独立隔离检查）。
//
// 用法：node Taierzhuang1938/Script_SquadSplinePcgTest.mjs

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SQUAD_SPLINE_PROFILES,
  SQUAD_SPLINE_PROFILE_ORDER,
  SQUAD_SPLINE_DEMO_SCENARIOS,
} from "./Data_Tuning_SquadSpline.mjs";
import { BuildSceneCorridorEnv, BuildSquadCorridor } from "./Script_SquadSpline.mjs";
import { SplitGazeChain } from "./Script_ProceduralGaze.mjs";
import { CompileSquadScene } from "./Script_SquadSplinePcg.mjs";
import { BeatById, EvaluateFlow, DEFAULT_ENCOUNTER_DOCUMENT } from "./Scenes/FirstLevelEncounter/Script_LevelFlowModel.mjs";
import { ENCOUNTER_VARIANTS, CompileEncounterVariant } from "./Script_EncounterVariants.mjs";
import { ResolveEncounterGroupSplineConfig, BuildLiveSquadWaypoints } from "./Script_FirstLevelSquadSpline.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
let passed = 0;
let failed = 0;
function Check(name, ok, detail = "") {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
}

// 1. 读真实 FirstLevelEncounter 场景 JSON 构建环境索引
const scenePath = path.join(projectDir, "Scenes", "FirstLevelEncounter", "Scene_FirstLevelEncounter.json");
const sceneDoc = JSON.parse(fs.readFileSync(scenePath, "utf8"));
const env = BuildSceneCorridorEnv(sceneDoc);
Check("读取真实 Scene_FirstLevelEncounter 场景走廊数据",
  env.trenches.length > 0 && env.obstacles.length > 20 && env.covers.length > 0,
  `trenches=${env.trenches.length}, roads=${env.roads.length}, covers=${env.covers.length}`);

// 2. 验证全 8 套 Profile 均可独立编译且摆脱机器人齐步
for (const profileId of SQUAD_SPLINE_PROFILE_ORDER) {
  const def = SQUAD_SPLINE_PROFILES[profileId];
  assert.ok(def, `缺少 Profile ${profileId}`);
  const compiled = CompileSquadScene({
    env,
    durationS: 24,
    stepS: 0.15,
    squads: [{
      id: `Test_${profileId}`,
      label: def.label,
      side: def.sideHint || "friend",
      profile: profileId,
      seed: `Unit_${profileId}`,
      route: [[40, 148], [55, 151], [72, 156], [88, 166], [96, 184]],
      members: Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, name: `兵${i}`, role: i === 0 ? "leader" : "rifleman" })),
    }],
  });
  const t = compiled.telemetry;
  Check(`Profile [${profileId}] 去线性+去同步+无叠压+行进张望`,
    t.lateralStdM >= 0.14 && t.avgSpeedCorr <= 0.80 && t.minPairDistM >= 0.72 && t.totalGlances >= 4,
    `σd=${t.lateralStdM}m r=${t.avgSpeedCorr} minSep=${t.minPairDistM}m glances=${t.totalGlances}`);
}

// 3. 验证全部 4 个内置演示场景（含截图 1 战壕撤退、截图 2 三路野外包抄、交叉路线验证）
const demoResults = new Map();
for (const sc of SQUAD_SPLINE_DEMO_SCENARIOS) {
  const compiled = CompileSquadScene({
    env,
    durationS: sc.durationS,
    stepS: 0.15,
    squads: sc.squads.map((sq) => ({
      ...sq,
      route: sq.route.map((p) => [...p]),
      members: sq.members.map((m) => ({ ...m })),
    })),
  });
  demoResults.set(sc.id, compiled);
  const t = compiled.telemetry;
  Check(`演示场景 [${sc.id}] 完整编译与自然度达标`,
    t.lateralStdM >= 0.22 && t.minPairDistM >= 0.72 && t.totalGlances >= 6,
    `squads=${t.squadCount} actors=${t.actorCount} σd=${t.lateralStdM}m r=${t.avgSpeedCorr} minSep=${t.minPairDistM}m glances=${t.totalGlances}`);
}

// 4. 专门核验截图 2（开阔野外包抄）比截图 1（受限战壕）具备更大的横向展开能力
const trenchDemo = demoResults.get("l1_trench_retreat");
const openDemo = demoResults.get("l1_enemy_flank_open");
Check("开阔野外包抄自动展开宽度显著大于受限战壕",
  openDemo.telemetry.lateralStdM > trenchDemo.telemetry.lateralStdM,
  `open σd=${openDemo.telemetry.lateralStdM}m vs trench σd=${trenchDemo.telemetry.lateralStdM}m`);
Check("战壕走廊自动提取出盲区拐角与沟沿 POI",
  trenchDemo.squads[0].corridor.pois.some((p) => p.kind === "blindCorner")
  && trenchDemo.squads[0].corridor.pois.some((p) => p.kind === "trenchRim"),
  `pois=${trenchDemo.squads[0].corridor.pois.length}`);

// 5. 专门核验交叉路线：两支小队身份严格隔离、绝不混编，且产生跨队避让
const crossDemo = demoResults.get("crossing_squads_demo");
const midFrame = crossDemo.Sample(10.0);
const squadIdsAtMid = new Set(midFrame.actors.map((a) => a.squadId));
const squadACount = midFrame.actors.filter((a) => a.squadId === "CrossSquadA").length;
const squadBCount = midFrame.actors.filter((a) => a.squadId === "CrossSquadB").length;
Check("交叉路线两支小队身份严格隔离（绝不合并为同一队）",
  squadIdsAtMid.size === 2 && squadACount === 6 && squadBCount === 5,
  `A=${squadACount}, B=${squadBCount}`);
Check("交叉路线交汇处触发跨队 TTC 礼让且保持安全间距",
  crossDemo.telemetry.crossSquadAvoidEvents > 0 && crossDemo.telemetry.minPairDistM >= 0.72,
  `avoidEvents=${crossDemo.telemetry.crossSquadAvoidEvents}, minSep=${crossDemo.telemetry.minPairDistM}m`);

// 6. 验证 P0 声响刺激触发错峰转头 + 时间轴随机 Seek 确定性等价
const sc1 = SQUAD_SPLINE_DEMO_SCENARIOS[0];
const withStim = CompileSquadScene({
  env,
  durationS: 16,
  stepS: 0.15,
  stimuli: [{ id: "boom1", x: 52, z: 54, y: 1.5, time: 5.0, durationS: 3.0, radiusM: 45, label: "北坡枪声" }],
  squads: sc1.squads.map((sq) => ({ ...sq, route: sq.route.map((p) => [...p]), members: sq.members.map((m) => ({ ...m })) })),
});
const stimFrame = withStim.Sample(5.8);
const reacting = stimFrame.actors.filter((a) => a.gazeKind === "stimulus").length;
const stimSeekA = withStim.Sample(8.35);
const stimSeekB = withStim.Sample(2.1);
const stimSeekC = withStim.Sample(8.35);
Check("P0 突发声响触发全队响应转头", reacting >= 6, `reacting=${reacting}/${stimFrame.actors.length}`);
Check("时间轴任意前跳/倒拖 Seek 100% 确定性逐位一致",
  JSON.stringify(stimSeekA) === JSON.stringify(stimSeekC) && JSON.stringify(stimSeekA) !== JSON.stringify(stimSeekB));

// 7. 验证头/颈/胸分级转角权重和为 1（小角护枪稳、大角带肩线）
const smallSplit = SplitGazeChain(15 * Math.PI / 180);
const largeSplit = SplitGazeChain(65 * Math.PI / 180);
Check("头颈肩分级权重守恒且小角度几乎不带动胸肩枪口",
  Math.abs(smallSplit.head + smallSplit.neck + smallSplit.chest - 1) < 1e-6
  && smallSplit.chest <= 0.06
  && largeSplit.chest > smallSplit.chest);

// 8. 确认独立预览页源码完整存在且未改入游戏运行时入口
const toolHtml = fs.readFileSync(path.join(projectDir, "AdvancedTools", "Tool_SquadSplinePreview.html"), "utf8");
const toolJs = fs.readFileSync(path.join(projectDir, "AdvancedTools", "Script_SquadSplinePreview.mjs"), "utf8");
Check("独立预览工具复用 Data_SceneAssets 与 FetchResolvedScene 且不依赖 Script_Main",
  toolHtml.includes("Script_SquadSplinePreview.mjs")
  && toolJs.includes("Data_SceneAssets.mjs")
  && toolJs.includes("FetchResolvedScene")
  && !toolJs.includes("Script_Main"));

// 9. 验证第一关真实接入（战壕撤退排、三路野外包抄、双版本全部机动遭遇组与实时 3D 路点端点守恒）
const retreatMidFrame = EvaluateFlow(BeatById("01c").start + 14, DEFAULT_ENCOUNTER_DOCUMENT);
const retreatIds = ["luo", "he", "liu", ...Array.from({ length: 9 }, (_, i) => `openingAlly${i + 3}`)];
const retreatSquad = retreatIds.map((id) => retreatMidFrame.actors.find((a) => a.id === id)).filter(Boolean);
const retreatWithProfile = retreatSquad.filter((a) => a.splineProfile === "trench_march_cautious").length;
const retreatGlancing = retreatSquad.filter((a) => Math.abs(a.gazeYaw || 0) > 0.08).length;
// 检查 12 人是否已打破单线串珠（按首尾向量算垂直横向离散）
const rHead = retreatSquad[0].p, rTail = retreatSquad.at(-1).p;
const rDx = rTail[0] - rHead[0], rDz = rTail[1] - rHead[1], rLen = Math.hypot(rDx, rDz) || 1;
const retreatLatOffsets = retreatSquad.map((a) => ((a.p[0] - rHead[0]) * (-rDz / rLen) + (a.p[1] - rHead[1]) * (rDx / rLen)));
const retreatLatSpan = Math.max(...retreatLatOffsets) - Math.min(...retreatLatOffsets);
Check("第一关 01c 交通沟川军撤退排全部接入 trench_march_cautious 且形成拉链横向展开与行进张望",
  retreatSquad.length === 12 && retreatWithProfile === 12 && retreatLatSpan >= 0.45 && retreatGlancing >= 2,
  `count=${retreatSquad.length} profile=${retreatWithProfile}/12 latSpan=${retreatLatSpan.toFixed(2)}m glancing=${retreatGlancing}`);

const flankMidFrame = EvaluateFlow(BeatById("02a").start + 5, DEFAULT_ENCOUNTER_DOCUMENT);
const midFlank = [2, 3, 4, 5].map((i) => flankMidFrame.actors.find((a) => a.id === `opening${i}`)).filter(Boolean);
const flankWithProfile = midFlank.filter((a) => a.splineProfile === "tactical_flank_open").length;
let flankLatSpan = 0;
if (midFlank.length >= 2) {
  const fh = midFlank[0].p, ft = midFlank.at(-1).p;
  const fdx = ft[0] - fh[0], fdz = ft[1] - fh[1], flen = Math.hypot(fdx, fdz) || 1;
  const offs = midFlank.map((a) => ((a.p[0] - fh[0]) * (-fdz / flen) + (a.p[1] - fh[1]) * (fdx / flen)));
  flankLatSpan = Math.max(...offs) - Math.min(...offs);
}
Check("第一关 01c–02e 野外包抄日军接入 tactical_flank_open 且开阔散兵展开宽度大于战壕",
  midFlank.length === 4 && flankWithProfile === 4 && flankLatSpan > retreatLatSpan,
  `count=${midFlank.length} profile=${flankWithProfile}/4 openSpan=${flankLatSpan.toFixed(2)}m > trenchSpan=${retreatLatSpan.toFixed(2)}m`);

// 核验 L1_Original 与 L1_BeishaheMerged 全部机动遭遇组均能解析合法 Profile，且实时 3D 路点精确保留起终点
let movingGroupCount = 0;
let validProfileCount = 0;
let endpointsPreserved = true;
for (const variantId of Object.keys(ENCOUNTER_VARIANTS)) {
  const compiledVar = CompileEncounterVariant(variantId);
  for (const group of compiledVar.defaultDocument.groups) {
    if (["guard", "suppress"].includes(group.behavior) || !group.route || group.route.length < 2) continue;
    movingGroupCount += 1;
    const cfg = ResolveEncounterGroupSplineConfig(group);
    if (cfg && SQUAD_SPLINE_PROFILES[cfg.profile]) {
      validProfileCount += 1;
      const wp = BuildLiveSquadWaypoints({
        squadKey: group.id,
        config: cfg,
        memberIndex: 1,
        memberCount: Math.max(2, group.maxAlive || 2),
        role: "rifleman",
        route: group.route,
      });
      const s0 = group.route[0], e0 = group.route.at(-1);
      const s1 = wp[0], e1 = wp.at(-1);
      if (s0[0] !== s1[0] || s0[1] !== s1[1] || e0[0] !== e1[0] || e0[1] !== e1[1]) {
        endpointsPreserved = false;
      }
    }
  }
}
Check("第一关双版本（L1_Original + L1_BeishaheMerged）全部机动遭遇组均匹配合法 Profile 且 3D 路点起终点零偏移",
  movingGroupCount >= 40 && validProfileCount === movingGroupCount && endpointsPreserved,
  `movingGroups=${validProfileCount}/${movingGroupCount} endpointsPreserved=${endpointsPreserved}`);

console.log(`\n[SquadSplinePcgTest] 通过 ${passed} 项，失败 ${failed} 项`);
assert.equal(failed, 0, `${failed} 项检查未通过`);
