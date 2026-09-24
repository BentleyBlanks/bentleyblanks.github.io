// ===========================================================================
// Script_MissionGatesTest.mjs —— 第一关编排表的闸门（纯 Node，毫秒级）
//
// 守四件事：
//   1. MISSION_STAGES 每个 requirements 事实在 MISSION_FACT_GATES 里有条目，且
//      条目的 step 就是那一步；proximity 的锚点、半径、voice 的 cue、interaction
//      的交互 id 都能在源表/运行时源码里找到。
//   2. MISSION_STEP_SPAWNS / MISSION_ENCOUNTER_ACTIVATION 与 MISSION_ENCOUNTERS、
//      FIRST_LEVEL_ENCOUNTER_STARTS、FIRST_LEVEL_DEFERRED_ENCOUNTERS 对得上。
//   3. **静态对账两个源码文件**（运行时 + 开场脚本 Script_FirstLevelOpening）：
//      SpawnEncounter 不再有字面量调用；`.Near(` 的出现次数 = GateNear
//      内一处 + 下面两张逐条写明理由的白名单；GateNear 引的事实必须是表里的距离门。
//      多一处就红 —— 新写的编排门必须走表，不许再在代码里写坐标和米数。
//   4. BuildOrchestrationModel() 能跑、JSON.stringify 不抛、各计数与源表一致。
//
// 跑法：node Taierzhuang1938/Script_MissionGatesTest.mjs
// ===========================================================================
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MISSION_STAGES, MISSION_ENCOUNTERS, MISSION_TACTICS, MISSION_TRANSFER_THREATS } from "./Data_FirstLevelMission.mjs";
import {
  FIRST_LEVEL_STAGES,
  FIRST_LEVEL_ENCOUNTER_STARTS,
  FIRST_LEVEL_DEFERRED_ENCOUNTERS,
  FirstLevelStageForStep,
} from "./Data_FirstLevelMissionStages.mjs";
import { MISSION_ANCHORS, MISSION_PLACEMENT } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_TRENCH_NETWORK } from "./Data_FirstLevelMissionTrenches.mjs";
import { MISSION_DIALOGUE } from "./Data_FirstLevelMissionDialogue.mjs";
import {
  MISSION_STEP_SPAWNS,
  MISSION_ENCOUNTER_ACTIVATION,
  MISSION_VOICE_FACTS,
  MISSION_FACT_GATES,
  MissionGateFamily,
  MissionFactGate,
} from "./Data_FirstLevelMissionGates.mjs";
import {
  BuildOrchestrationModel,
  PhaseLayout,
  ApplyRuntimeState,
  DescribeFact,
  FindOwner,
  ModelSummary,
} from "./Script_MissionOrchestration.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeSource = fs.readFileSync(path.join(here, "Script_FirstLevelMissionRuntime.mjs"), "utf8");
const openingSource = fs.readFileSync(path.join(here, "Script_FirstLevelOpening.mjs"), "utf8");
let checks = 0;
const Check = (condition, message) => { assert.ok(condition, message); checks += 1; };

// ---------------------------------------------------------------------------
// 1. 事实门覆盖 MISSION_STAGES 的全部 requirements
// ---------------------------------------------------------------------------
const cueIds = new Set(MISSION_DIALOGUE.map((cue) => cue.id));
// 契约 §5 冻结的 cue id。台词表归并行的 Voice 包，合并之前这些 cue 还不在
// MISSION_DIALOGUE 里 —— 所以 voice 门先对契约表，已经到位的再对台词表。
const CONTRACT_CUES = new Set([
  "BunkerBanter","BunkerSearch",
  "SupportOrder",
  "FrontBlockade",
  "TakeOverGun","TankTerror","BundleOrder",
  "BundleGo","BundleProne","BundleSupply","BundleReturnCall","TankStopped",
  "Volunteer","BorrowLight","ZhouLift",
  "SouthWhisper","VillagePointer",
  "StreetBlocked","KitchenDetour",
  "MeleeRight","MeleeCurse","WindowOrder",
  "CourtyardOpen","TwoLitters","LastLitter",
  "TransferSorting","VillageRoadThreat",
  "TransferDefense","TransferRight","TransferBatch","EscortZhou",
  "CartTalk",
  "AircraftFirst","WestDitchOrder",
  "CarryZhou","AircraftReturn","RescueZhou",
  "PicketHold","ZhouCheck","Headcount","CartAbandon",
  "CarrySwap","RoadBump","HandsShake",
  "GateChallenge","ReceptionAccept","WardGuide",
  "Threshold","PlaceLitter","MedicAsk","SquadAssign",
  "ZhouDeath","NextLitter",
  "BridgeOrders","BridgeCover","BridgeWithdraw","MarchToTengxian",
  "NorthGate",
]);
const KnownCue = (id) => CONTRACT_CUES.has(id) || cueIds.has(id);
const interactionIds = new Set(
  [...runtimeSource.matchAll(/Register\(\s*\n?\s*["']([A-Za-z0-9]+)["']/g)].map((m) => m[1]),
);
// 机枪位走 CreateEmplacement 而不是 Register，id 仍是同一个字符串。
for (const m of runtimeSource.matchAll(/id:\s*["'](Mission[A-Za-z0-9]+)["']/g)) interactionIds.add(m[1]);
Check(interactionIds.has("MissionBundle"), "从运行时源码里认出了交互点 id");

const requirementFacts = [...new Set(MISSION_STAGES.flatMap((stage) => stage.requirements))];
for (const stage of MISSION_STAGES)
  for (const factId of stage.requirements) {
    const gate = MISSION_FACT_GATES[factId];
    assert.ok(gate, `MISSION_FACT_GATES 缺事实：${factId}（${stage.id} 的过关条件）`);
    assert.equal(gate.step, stage.id, `${factId} 的 step 应当是 ${stage.id}，实际 ${gate.step}`);
  }
checks += 1;
// 98 = 96 + leftGunHandover、zhouLeftGun（契约 §2.6：03 改为「何有田接枪 + 老周离枪 ≥10 m」，zhouGunWounded 挪到 05）。
Check(requirementFacts.length === 98, `requirements 事实共 98 条，实际 ${requirementFacts.length}`);

const KINDS = new Set(["proximity", "proximityFamily", "interior", "voice", "interaction",
  "combat", "column", "cutscene", "scripted", "timer"]);
const stepIds = new Set(MISSION_STAGES.map((stage) => stage.id));
for (const [factId, gate] of Object.entries(MISSION_FACT_GATES)) {
  assert.ok(KINDS.has(gate.kind), `${factId} 的 kind 不合法：${gate.kind}`);
  assert.ok(stepIds.has(gate.step), `${factId} 的 step 不是内部步骤：${gate.step}`);
  assert.ok(FirstLevelStageForStep(gate.step), `${factId} 的 step ${gate.step} 归不到公开阶段`);
  const describable = gate.text || ["proximity", "proximityFamily", "interior", "voice", "interaction"].includes(gate.kind);
  assert.ok(describable, `${factId} 既没有 text 也不是能自动讲人话的 kind`);
  if (gate.kind === "proximity") {
    assert.ok(gate.anchor || gate.point, `${factId} 的 proximity 门既没有 anchor 也没有 point`);
    if (gate.anchor) assert.ok(MISSION_ANCHORS[gate.anchor], `${factId} 的锚点不在 MISSION_ANCHORS：${gate.anchor}`);
    assert.ok(Number.isFinite(gate.radiusM) && gate.radiusM > 0, `${factId} 的半径不是有限正数：${gate.radiusM}`);
  }
  if (gate.kind === "proximityFamily") {
    assert.ok(Array.isArray(gate.points) && gate.points.length, `${factId} 家族门没有点`);
    assert.ok(Number.isFinite(gate.radiusM) && gate.radiusM > 0, `${factId} 家族门半径不合法`);
    assert.equal(gate.family, factId, `${factId} 家族门的 family 必须等于它自己的键`);
    if (gate.keys) assert.equal(gate.keys.length, gate.points.length, `${factId} 家族门 keys 与 points 数不一致`);
  }
  if (gate.kind === "interior")
    assert.ok(MISSION_PLACEMENT[gate.box], `${factId} 的 box 不在 MISSION_PLACEMENT：${gate.box}`);
  if (gate.kind === "voice") assert.ok(KnownCue(gate.cue), `${factId} 的 cue 既不在契约 §5 也不在 MISSION_DIALOGUE：${gate.cue}`);
  if (gate.kind === "interaction")
    assert.ok(interactionIds.has(gate.interaction), `${factId} 的交互 id 在运行时源码里找不到：${gate.interaction}`);
  if (gate.encounter) assert.ok(MISSION_ENCOUNTERS[gate.encounter], `${factId} 引了不存在的遭遇组：${gate.encounter}`);
  if (gate.member)
    assert.ok(Object.values(MISSION_ENCOUNTERS).flat().some((spec) => spec.id === gate.member),
      `${factId} 引了不存在的成员：${gate.member}`);
  for (const required of gate.requires || [])
    assert.ok(MISSION_FACT_GATES[required], `${factId} 的前置事实没有条目：${required}`);
}
checks += 1;

// 契约点名要有的那几条编排触发。
for (const factId of ["frontBattleStarted", "kitchenEntered", "bundleRoutePoint", "approachShell",
  "gunOccupied", "gunUsed", "meleeEngaged"])
  Check(MISSION_FACT_GATES[factId], `编排触发 ${factId} 必须在表里`);

// 家族门能按后缀解析回那一个点。
Check(MissionGateFamily("approachShell2")?.point, "approachShell2 能解析出点");
Check(MissionGateFamily("bundleRoutePoint0")?.point, "bundleRoutePoint0 能解析出点");
Check(MissionGateFamily("bundleCrawlFirst") === null, "新支沟没有无效矮顶或强制匍匐门");
Check(MissionGateFamily("bundleRoutePoint999") === null, "越界的家族事实解析不出来");
Check(MissionGateFamily("frontReached") === null, "非家族事实不会被家族前缀吃掉");
Check(MissionFactGate("frontReached")?.gate.kind === "proximity", "MissionFactGate 精确命中");

// VoiceDone 的对白事实表。
for (const [cue, factId] of Object.entries(MISSION_VOICE_FACTS)) {
  assert.ok(KnownCue(cue), `MISSION_VOICE_FACTS 的 cue 不存在：${cue}`);
  assert.equal(MISSION_FACT_GATES[factId]?.kind, "voice", `${factId} 应当是 voice 门`);
  assert.equal(MISSION_FACT_GATES[factId].cue, cue, `${factId} 的 cue 与表不一致`);
}
checks += 1;
// 09.19 契约 §5 的 23 条减去 09.23 契约 §5.2 下线的 RescueCall（rescueCallHeard 改由导演记）。
Check(Object.keys(MISSION_VOICE_FACTS).length === 22, "对白事实共 22 条（契约 §5，RescueCall 已下线）");
Check(MISSION_FACT_GATES.rescueCallHeard?.kind === "scripted" && !("RescueCall" in MISSION_VOICE_FACTS), "rescueCallHeard 由开场导演记");

// ---------------------------------------------------------------------------
// 2. 生成表与激活表
// ---------------------------------------------------------------------------
const spawnPhaseOf = new Map();
for (const [step, ids] of Object.entries(MISSION_STEP_SPAWNS)) {
  assert.ok(stepIds.has(step), `MISSION_STEP_SPAWNS 的键不是内部步骤：${step}`);
  const phase = FirstLevelStageForStep(step);
  assert.ok(phase, `${step} 归不到公开阶段`);
  for (const id of ids) {
    assert.ok(MISSION_ENCOUNTERS[id], `MISSION_STEP_SPAWNS.${step} 引了不存在的组：${id}`);
    if (!spawnPhaseOf.has(id)) spawnPhaseOf.set(id, phase.number);
    else spawnPhaseOf.set(id, Math.min(spawnPhaseOf.get(id), phase.number));
  }
}
checks += 1;
for (const [id, phaseNumber] of spawnPhaseOf)
  assert.equal(FIRST_LEVEL_ENCOUNTER_STARTS[id], phaseNumber,
    `${id} 的起始阶段应当是第一次生成它那一步的阶段 ${phaseNumber}，FIRST_LEVEL_ENCOUNTER_STARTS 写的是 ${FIRST_LEVEL_ENCOUNTER_STARTS[id]}`);
checks += 1;

assert.deepEqual(
  Object.keys(MISSION_ENCOUNTER_ACTIVATION).sort(),
  Object.keys(MISSION_ENCOUNTERS).sort(),
  "MISSION_ENCOUNTER_ACTIVATION 必须恰好覆盖 MISSION_ENCOUNTERS 的全部键",
);
checks += 1;
const SPAWN_KINDS = new Set(["step", "fact", "threat"]);
const threatIds = new Set(MISSION_TRANSFER_THREATS.map((threat) => threat.id));
for (const [id, activation] of Object.entries(MISSION_ENCOUNTER_ACTIVATION)) {
  assert.ok(SPAWN_KINDS.has(activation.spawn?.kind), `${id} 的 spawn.kind 不合法`);
  if (activation.spawn.step) assert.ok(stepIds.has(activation.spawn.step), `${id} 的 spawn.step 不是内部步骤`);
  if (activation.spawn.kind === "step")
    assert.ok(MISSION_STEP_SPAWNS[activation.spawn.step]?.includes(id),
      `${id} 说自己由步骤 ${activation.spawn.step} 生成，但不在 MISSION_STEP_SPAWNS 里`);
  if (activation.spawn.kind === "threat") assert.ok(threatIds.has(activation.spawn.threat), `${id} 的威胁不在 MISSION_TRANSFER_THREATS`);
  if (activation.spawn.kind === "fact") assert.ok(MISSION_FACT_GATES[activation.spawn.fact], `${id} 的生成事实没有门`);
  if (activation.standbyUntil) assert.ok(MISSION_FACT_GATES[activation.standbyUntil], `${id} 的 standbyUntil 事实没有门`);
  // retire：活下来的人怎么退场（01–02 组，2026-09-23 空间重排）。要么按事实退，要么走完 route 就收。
  if (activation.retire) {
    assert.ok(activation.retire.fact ? MISSION_FACT_GATES[activation.retire.fact] : activation.retire.atRouteEnd === true,
      `${id} 的 retire 要么给有门的事实，要么 atRouteEnd`);
    assert.equal(activation.retire.then, "despawn", `${id} 的 retire 只支持退场收走`);
  }
  if (activation.dormant) {
    assert.ok(activation.wake, `${id} 装睡却没写怎么醒`);
    if (activation.wake.fact) assert.ok(MISSION_FACT_GATES[activation.wake.fact], `${id} 的苏醒事实没有门`);
    if (activation.wake.kind === "playerWithinM")
      assert.ok(Number.isFinite(activation.wake.radiusM) && activation.wake.radiusM > 0, `${id} 的苏醒半径不合法`);
  }
  // 第二处威胁由 UpdateTransferThreats 放出，不进 MISSION_STEP_SPAWNS。
  if (activation.spawn.kind === "threat")
    assert.ok(!Object.values(MISSION_STEP_SPAWNS).flat().includes(id), id + " 是威胁表放出的，不该进 MISSION_STEP_SPAWNS");
}
checks += 1;
for (const [phase, ids] of Object.entries(FIRST_LEVEL_DEFERRED_ENCOUNTERS))
  for (const id of ids)
    assert.equal(FIRST_LEVEL_ENCOUNTER_STARTS[id], Number(phase),
      `${id} 登记为阶段 ${phase} 的延后组，起始阶段却是 ${FIRST_LEVEL_ENCOUNTER_STARTS[id]}`);
checks += 1;

// ---------------------------------------------------------------------------
// 3. 静态对账运行时源码
// ---------------------------------------------------------------------------
// 所有初始部署走 MISSION_STEP_SPAWNS；接近目标或进入下一步不得临时补建前沿敌军。
const literalSpawns = [...runtimeSource.matchAll(/this\.SpawnEncounter\(\s*["']([A-Za-z0-9]+)["']\s*\)/g)].map((m) => m[1]);
assert.deepEqual(literalSpawns, [],
  `前沿部队在 02 按表预置，接近时不得补建，实际是 ${JSON.stringify(literalSpawns)}`);
checks += 1;
Check(/this\.SpawnEncounter\(plan\.id\)/.test(runtimeSource), "转运区第二处威胁仍由 UpdateTransferThreats 按 plan.id 生成");
Check(/for \(const id of MISSION_STEP_SPAWNS\[stage\.id\] \|\| \[\]\) this\.SpawnEncounter\(id\);/.test(runtimeSource),
  "Enter 在 switch 之前按 MISSION_STEP_SPAWNS 统一生成");
// Enter 的 switch 里一处 SpawnEncounter 都不许剩。
const enterBody = runtimeSource.slice(runtimeSource.indexOf("  Enter(stage) {"), runtimeSource.indexOf("  SpawnGuards() {"));
Check(enterBody.length > 2000, "切出了 Enter(stage) 的整段");
Check((enterBody.match(/this\.SpawnEncounter\(/g) || []).length === 1,
  "Enter 里只剩按表生成那一句 SpawnEncounter");

// this.Near( 的白名单。每一条都注明为什么它不是编排门 —— 新增一处就必须在这里
// 解释清楚，否则这条断言红。编排门一律走 GateNear，点与半径从 MISSION_FACT_GATES 取。
const NEAR_WHITELIST = [
  // GateNear 自己那一处：所有事实门最终都落到它身上。
  { pattern: /return this\.Near\(family \? family\.point : gate\.point \|\| A\[gate\.anchor\], gate\.radiusM\);/,
    why: "GateNear 内部唯一一处 —— 点与半径都是从 MISSION_FACT_GATES 查出来的" },
  // 以下都不记事实：
  { pattern: /Sortie\.crawl\.some\(c=>this\.Near\(c,c\.d\/2\+2\)\)/,
    why: "OpeningPrompt 的「按 Z 趴下」键帽提示，靠近爬行段就显示，不记任何事实" },
  { pattern: /if\(!this\.Near\(plan\.near,plan\.nearM\)\)continue;/,
    why: "UpdateTactics 的战术放行点，点与半径来自 MISSION_TACTICS 的 near/nearM，放的是走位不是事实" },
  { pattern: /if\(this\.Near\(Sortie\.house,Sortie\.supplierRangeM\)\)this\.Say\('BundleSupply'\);/,
    why: "补给兵台词的触发圈；事实 bundleDirectionsHeard 由 VoiceDone 记，走的是 voice 门" },
];
const nearCalls = [...runtimeSource.matchAll(/this\.Near\(/g)].length;
assert.equal(nearCalls, NEAR_WHITELIST.length,
  "运行时里 this.Near( 应当只剩 " + NEAR_WHITELIST.length + " 处（GateNear 内 1 处 + 白名单 "
  + (NEAR_WHITELIST.length - 1) + " 处），实际 " + nearCalls + " 处。"
  + "新的编排门请走 GateNear；确实不是编排门的，请在 Script_MissionGatesTest 的 NEAR_WHITELIST 里补一条并写清理由。");
checks += 1;
for (const entry of NEAR_WHITELIST)
  assert.ok(entry.pattern.test(runtimeSource), "白名单条目在源码里找不到了（" + entry.why + "）：" + entry.pattern);
checks += 1;

// 开场脚本（Script_FirstLevelOpening.mjs）用同一把尺。2026.09.19 起它一处 .Near( 都不剩：
// 受困段是 scripted，后交通壕那三道距离门在运行时里走 GateNear。
const OPENING_NEAR_WHITELIST = [];
const openingNearCalls = [...openingSource.matchAll(/\.Near\(/g)].length;
assert.equal(openingNearCalls, OPENING_NEAR_WHITELIST.length,
  "Script_FirstLevelOpening 里 .Near( 应当只剩 " + OPENING_NEAR_WHITELIST.length + " 处（都不记事实），实际 "
  + openingNearCalls + " 处。记事实的距离判定请走 r.GateNear；确实不是编排门的，请在 OPENING_NEAR_WHITELIST 里补一条并写清理由。");
checks += 1;
for (const entry of OPENING_NEAR_WHITELIST)
  assert.ok(entry.pattern.test(openingSource), "开场白名单条目在源码里找不到了（" + entry.why + "）：" + entry.pattern);
checks += 1;

// 两份源码里 GateNear("<字面量>") 引的事实必须在表里，而且是距离门（家族门按前缀解析）。
const gateNearFacts = [];
for (const [label, source] of [["运行时", runtimeSource], ["开场脚本", openingSource]])
  for (const m of source.matchAll(/GateNear\(\s*["']([A-Za-z0-9]+)["']\s*\)/g)) gateNearFacts.push([label, m[1]]);
for (const [label, factId] of gateNearFacts) {
  const entry = MissionFactGate(factId);
  assert.ok(entry, label + "里 GateNear(" + factId + ") 引了 MISSION_FACT_GATES 里没有的事实");
  assert.ok(["proximity", "proximityFamily"].includes(entry.gate.kind),
    label + "里 GateNear(" + factId + ") 引的不是距离门（kind=" + entry.gate.kind + "）");
}
checks += 1;
const runtimeGateFacts = gateNearFacts.filter(([label]) => label === "运行时").map(([, factId]) => factId);
for (const factId of ["rearTrenchEntered", "cornerReached", "collectionPointSeen", "villageMouthReached",
  "streetBlockSeen", "southBankReached", "blastZoneCleared", "northGateReached", "gateEntered"])
  Check(runtimeGateFacts.includes(factId), "新步骤的距离门 " + factId + " 走了 GateNear");
const openingGateFacts = gateNearFacts.filter(([label]) => label === "开场脚本").map(([, factId]) => factId);
Check(openingGateFacts.length === 0, "开场脚本不再自己判距离门");

// VoiceDone 的那一串简单 if 已经换成查表。
Check(/const fact = MISSION_VOICE_FACTS\[id\];/.test(runtimeSource), "VoiceDone 改成查 MISSION_VOICE_FACTS");
Check(!/if \(id === "SupportOrder"\) this\.Record/.test(runtimeSource), "VoiceDone 里不再逐条写 if");
Check(/MISSION_ENCOUNTER_ACTIVATION\.village\.wake/.test(runtimeSource), "村口那一组的苏醒半径从 activation 表取");
Check(!/Distance\(actor\.position,this\.player\.position\)<55/.test(runtimeSource), "55 m 不再写死在运行时里");

// ---------------------------------------------------------------------------
// 4. 编排模型
// ---------------------------------------------------------------------------
const model = BuildOrchestrationModel();
Check(JSON.stringify(model).length > 10000, "模型能 JSON.stringify 且不是空壳");
Check(model.steps.length === MISSION_STAGES.length, "步骤数与 MISSION_STAGES 一致");
Check(model.phases.length === FIRST_LEVEL_STAGES.length, "阶段数与 FIRST_LEVEL_STAGES 一致");
Check(Object.keys(model.facts).length === Object.keys(MISSION_FACT_GATES).length, "事实数与 MISSION_FACT_GATES 一致");
Check(model.encounters.length === Object.keys(MISSION_ENCOUNTERS).length, "遭遇组数与 MISSION_ENCOUNTERS 一致");
Check(model.encounters.reduce((sum, e) => sum + e.members.length, 0)
  === Object.values(MISSION_ENCOUNTERS).flat().length, "成员数与 MISSION_ENCOUNTERS 一致");
Check(model.transferThreats.length === MISSION_TRANSFER_THREATS.length, "威胁数与 MISSION_TRANSFER_THREATS 一致");
Check(model.transferThreats.every((threat, index) => threat.order === index + 1
  && threat.step === "Transfer" && typeof threat.resolved === "string"),
"工作台威胁模型带顺序、出现事实与解除事实");
for (const name of ["pursuit", "sortie", "sortieReturn", "approach", "supportTrench", "flank", "village", "evacuation", "exit"])
  Check(model.routes[name]?.length, `routes 里要有 ${name}`);
Check(model.layout.blocks.length > 500 && model.layout.gates.length > 0, "layout 带上了体块与门");
// 2026-09-23 空间重排后壕沟段数随网络走（不再钉死 13）；01–06 前沿的每一段都要进工作台。
Check(model.layout.roads.length > 0 && model.layout.trenches.length === MISSION_TRENCH_NETWORK.segments.length
  && ["BunkerTrench", "BunkerFrontSap", "SupportSap", "RightApproach", "GuardBackslope", "GuardWithdrawal", "LeftGunAccess",
    "BundleApproach", "RoadAttack", "NorthJumpOff"].every((id) => model.layout.trenches.some((t) => t.id === id)),
"layout 带上了道路与全部壕沟段，包括 01–06 前沿各段");
Check(model.layout.railway.points.length > 0 && !!model.layout.bridge, "layout 带上了铁路与桥");
Check(typeof model.layout.SampleGroundColor === "function", "layout 带上了地表取色函数");
Check(Object.keys(model.layout.semanticColors).length > 5, "layout 带上了语义色");
Check(model.friendlies.some((f) => f.kind === "cartBay") && model.friendlies.some((f) => f.kind === "phaseSpawn")
  && model.friendlies.some((f) => f.kind === "defender") && model.friendlies.some((f) => f.kind === "guardPost")
  && model.friendlies.some((f) => f.kind === "forwardNest") && model.friendlies.some((f) => f.kind === "defensePost")
  && model.friendlies.some((f) => f.kind === "tankStart") && model.friendlies.some((f) => f.kind === "squadPost"),
  "friendlies 覆盖八类点位");

// 设计时间轴：condition 类一律不带秒数。
for (const entry of model.timeline.filter((item) => item.kind === "condition"))
  assert.ok(entry.atS === null && entry.earliestS === null && entry.latestS === null && entry.minimumSeconds == null,
    `条件类时间轴项不许带秒数：${entry.step}/${entry.factId}`);
checks += 1;
Check(model.timeline.some((entry) => entry.kind === "threat" && entry.encounterId === "transferAlley" && entry.after === "loadingThreatResolved"),
  "时间轴带上了第二处威胁的放行条件");
Check(model.timeline.some((entry) => entry.kind === "delay" && entry.memberId), "时间轴带上了成员的战术延迟");
Check(model.timeline.some((entry) => entry.kind === "wake" && entry.encounterId === "village"), "时间轴带上了装睡组的苏醒");
Check(model.timeline.filter((entry) => entry.kind === "timed" && entry.step === "Trapped").length === 2,
  "时间轴带上了受困段的两个兜底期限");

// 阶段布局：契约里点名的那几条。
const twelve = PhaseLayout(model, 12);
Check(twelve.encounters.find((e) => e.id === "transfer").state === "active", "阶段 12 的 transfer 组是 active");
Check(twelve.encounters.find((e) => e.id === "transferAlley").state === "pending", "阶段 12 的 transferAlley 还是 pending");
const four = PhaseLayout(model, 4);
Check(four.encounters.find((e) => e.id === "village").state === "dormant", "阶段 4 的 village 组装睡");
Check(four.encounters.find((e) => e.id === "machineGun").state === "active", "阶段 4 的 machineGun 组已放出");
Check(PhaseLayout(model, 1).encounters.filter((e) => e.id !== "bunkerAssault").every((e) => e.state === "pending"),
  "阶段 1 除了掩蔽部门外那一组之外一个敌人都还没出现");
// 先头兵在 02 反扑时交还真实战斗，四人必须在拖救之前死亡。
const bunkerAssault = PhaseLayout(model, 1).encounters.find((e) => e.id === "bunkerAssault");
Check(bunkerAssault.dormant && bunkerAssault.wake.step === "BunkerRescue" && bunkerAssault.wake.source === "FirstLevelBunkerShow.ReleaseCombat",
  "02 反扑时日兵交还战斗 AI，由小队清场后才拖救还权");
for(const id of ["approach","front","machineGun","tank","bundleApproach"])
  Check(MISSION_STEP_SPAWNS.BunkerRescue.includes(id)&&FIRST_LEVEL_ENCOUNTER_STARTS[id]===2,
    `${id} 在 02 预置，出门和接近阵位不再生成`);
const STATES = new Set(["pending", "spawned", "dormant", "standby", "active", "cleared"]);
for (const phase of model.phases)
  for (const encounter of PhaseLayout(model, phase.number).encounters)
    assert.ok(STATES.has(encounter.state), "阶段 " + phase.number + " 的 " + encounter.id + " 状态不合法：" + encounter.state);
checks += 1;

// 反查。
const owner = FindOwner(model, "TransferGunner");
Check(owner.encounter.id === "transfer" && owner.member.id === "TransferGunner", "反查出 TransferGunner 属于 transfer 组");
Check(owner.step === "Transfer" && owner.phaseNumber === 12, "反查出它由 Transfer 步（阶段 12）放出");
Check(owner.spawn.kind === "step" && owner.spawn.step === "Transfer", "反查出它进 Transfer 步就出现");
Check(FindOwner(model, "village").member === null && FindOwner(model, "village").encounter.id === "village",
  "按组名反查到组本身");
Check(FindOwner(model, "VillageGunner").facts.includes("villageGunSilent"), "反查出引用该成员的事实");

// 人话。
Check(DescribeFact(model, "frontReached").includes("front") && DescribeFact(model, "frontReached").includes("4"),
  "DescribeFact 讲得出 frontReached 的锚点与半径");
Check(DescribeFact(model, "supportOrdersHeard").includes("SupportOrder"), "DescribeFact 讲得出对白门");
Check(DescribeFact(model, "bundleTaken").includes("MissionBundle"), "DescribeFact 讲得出交互门");
Check(DescribeFact(model, "bundleRoutePoint3").includes("3"), "DescribeFact 讲得出家族门的第几个点");
for (const factId of Object.keys(model.facts)) Check(DescribeFact(model, factId).length > 0, `${factId} 讲得出人话`);

// 实际状态：没有运行时也要能用；有运行时时时间轴分得清「到了哪一步」。
Check(ApplyRuntimeState(model, null) === null, "没有运行时返回 null");
const live = ApplyRuntimeState(model, {
  stageId: "Transfer", phaseNumber: 12, time: 412, stageTime: 40,
  facts: ["transferArrived"], remaining: ["loadingThreatResolved"],
  log: [{ kind: "stage", id: "Trapped", time: 0 }, { kind: "fact", id: "bunkerCollapsed", time: 31 },
    { kind: "stage", id: "Transfer", time: 372 }, { kind: "fact", id: "transferArrived", time: 380 }],
  enemies: [{ id: "TransferGunner", alive: true, encounter: "transfer", x: 113, z: 80 }],
  player: { x: 94, z: 101, yaw: 0.2 }, guideRoute: [{ x: 94, z: 101 }],
});
Check(live.stepId === "Transfer" && live.phaseNumber === 12, "live 认得当前步骤与阶段");
Check(live.facts.has("transferArrived") && live.remaining[0] === "loadingThreatResolved", "live 带上了事实与还差什么");
Check(live.actualTimeline.at(-1).stageAtS === 8 && live.actualTimeline.at(-1).kind === "fact",
  "实际时间轴按关卡时钟与步内时钟两套记");
Check(live.actualTimeline[1].step === "Trapped" && live.actualTimeline[1].phaseNumber === 1,
  "实际时间轴里的事实归到它发生时那一步");
Check(live.player.x === 94 && live.guideRoute.length === 1, "live 带上了玩家与指引路线");

Check(ModelSummary(model).split("\n").length > 20, "ModelSummary 出得来多行摘要");

// 战术表里的人都真的在某个组里（改表漏删的看守）。
const memberIds = new Set(Object.values(MISSION_ENCOUNTERS).flat().map((spec) => spec.id));
const orphanTactics = Object.keys(MISSION_TACTICS).filter((id) => !memberIds.has(id));
assert.deepEqual(orphanTactics, [], `MISSION_TACTICS 里有不属于任何组的人：${orphanTactics.join(", ")}`);
checks += 1;

console.log(`ok  第一关编排表闸门通过：${checks} 项`);
console.log(`    事实门 ${Object.keys(MISSION_FACT_GATES).length} 条（requirements ${requirementFacts.length} 条全覆盖）`);
console.log(`    按步骤生成 ${Object.values(MISSION_STEP_SPAWNS).flat().length} 次 / 遭遇组 ${model.encounters.length} 组全部登记激活规则`);
console.log(`    运行时 SpawnEncounter 字面量 ${literalSpawns.length} 处、this.Near( ${nearCalls} 处（GateNear 1 + 白名单 ${NEAR_WHITELIST.length - 1}）`);
console.log(`    开场脚本 .Near( ${openingNearCalls} 处（全在白名单里，都不记事实）、GateNear 字面量 ${openingGateFacts.length} 处`);
