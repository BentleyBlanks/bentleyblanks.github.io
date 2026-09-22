// ===========================================================================
// Script_MissionOrchestration.mjs —— 第一关编排模型（纯，零 three，Node 直接可跑）
//
// 把游戏**实际使用的**那些表（MISSION_STAGES / MISSION_ENCOUNTERS / MISSION_TACTICS /
// MISSION_TRANSFER_THREATS / MISSION_FACT_GATES / MISSION_LAYOUT …）汇成一份供关卡编排
// 工作台、俯视图与 CLI 共用的模型。这里**不新建任何展示用的流程**：每一条都能指回
// 它的来源表，改了源表这份模型跟着变。
//
// 设计时间轴与实际试玩要分清：
//   · condition 类的时间轴项**没有秒数** —— 它们由玩家行为触发；
//   · timed / delay 才带秒数；转运威胁由先后事实驱动，没有伪造时间窗；
//   · 实际发生的时间只从运行时的 flow.log 来（ApplyRuntimeState 的 actualTimeline）。
//
// 跑法：node Taierzhuang1938/Script_MissionOrchestrationCli.mjs summary
// ===========================================================================
import {
  MISSION_STAGES,
  MISSION_ENCOUNTERS,
  MISSION_TACTICS,
  MISSION_GUIDANCE,
  MISSION_TRANSFER_THREATS,
  MISSION_PURSUIT_ROUTE,
  MISSION_VERSION,
  MISSION_TUNING as R,
} from "./Data_FirstLevelMission.mjs";
import {
  FIRST_LEVEL_STAGES,
  FIRST_LEVEL_ENCOUNTER_STARTS,
  FIRST_LEVEL_DEFERRED_ENCOUNTERS,
  FIRST_LEVEL_STAGE_ENCOUNTERS,
  FIRST_LEVEL_STAGE_CLEARED_ENEMIES,
  FirstLevelStageForStep,
} from "./Data_FirstLevelMissionStages.mjs";
import {
  MISSION_LAYOUT,
  MISSION_ANCHORS,
  MISSION_ROUTES,
  MISSION_PLACEMENT,
  MISSION_RAILWAY,
} from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_TERRAIN } from "./Data_FirstLevelMissionTerrain.mjs";
import { MISSION_TRENCH_NETWORK } from "./Data_FirstLevelMissionTrenches.mjs";
import { MISSION_DEFENSE_POSTS } from "./Data_FirstLevelMissionFortifications.mjs";
import { FRONT_DEFENDERS, FRONT_GUARD_POSTS, FrontAssaultLane, FrontReserveLane } from "./Data_FirstLevelMissionFront.mjs";
import { MISSION_SOUTH_BRIDGE, MISSION_STAGE_ROUTES } from "./Data_FirstLevelMissionTopology.mjs";
import { OPENING } from "./Data_FirstLevelOpening.mjs";
import { FRONT_SORTIE as Sortie } from "./Data_FirstLevelFrontRoute.mjs";
import {
  MISSION_STEP_SPAWNS,
  MISSION_ENCOUNTER_ACTIVATION,
  MISSION_FACT_GATES,
  MissionGateFamily,
} from "./Data_FirstLevelMissionGates.mjs";

const Flat = (point) => (point ? { x: point.x, z: point.z } : null);
const FlatRoute = (points) => (points || []).map(Flat);
const BOXES = { ...MISSION_PLACEMENT };

// 每一步归哪个公开阶段。
function PhaseNumberForStep(step) {
  return FirstLevelStageForStep(step)?.number ?? null;
}

// 事实门的点：锚点 / 直接坐标 / 家族的第 i 个点。
function GatePoint(gate) {
  if (gate.point) return Flat(gate.point);
  if (gate.anchor) return Flat(MISSION_ANCHORS[gate.anchor]);
  return null;
}

function GateBox(gate) {
  const box = gate.box ? BOXES[gate.box] : null;
  return box ? { minX: box.minX, maxX: box.maxX, minZ: box.minZ, maxZ: box.maxZ } : null;
}

/**
 * 人话：一个事实是怎么判出来的。
 * 第一个参数既可以是整份模型，也可以直接是 MISSION_FACT_GATES。
 */
export function DescribeFact(source, factId) {
  const gates = source?.facts ? source.facts : source || MISSION_FACT_GATES;
  const entry = gates[factId];
  const family = entry ? null : MissionGateFamily(factId);
  const gate = entry || family?.gate;
  if (!gate) return `未登记的事实：${factId}`;
  const where = gate.anchor ? `锚点 ${gate.anchor}` : gate.point ? `(${gate.point.x}, ${gate.point.z})` : "指定位置";
  const extra = [];
  if (gate.requires?.length) extra.push(`先要 ${gate.requires.join(" / ")}`);
  if (gate.note) extra.push(gate.note);
  const tail = extra.length ? `（${extra.join("；")}）` : "";
  switch (gate.kind) {
    case "proximity":
      return `玩家走到${where} 的 ${gate.radiusM} m 内${tail}`;
    case "proximityFamily": {
      if (family) return `玩家走到 ${gate.pointsFrom} 第 ${family.key} 个点 ${gate.radiusM} m 内${tail}`;
      return `${gate.text || `玩家依次走到 ${gate.pointsFrom} 的每个点 ${gate.radiusM} m 内`}${tail}`;
    }
    case "interior":
      return `玩家进入 ${gate.box} 范围内${tail}`;
    case "voice":
      return `对白 ${gate.cue} 播完${tail}`;
    case "interaction":
      return `交互 ${gate.interaction}${gate.anchor ? `（${gate.anchor} 锚点）` : ""}${tail}`;
    case "timer":
      return `${gate.text || `计时满 ${gate.seconds} 秒`}${tail}`;
    default:
      return `${gate.text || `${gate.kind}：${factId}`}${tail}`;
  }
}

function BuildFacts() {
  const facts = {};
  for (const [id, gate] of Object.entries(MISSION_FACT_GATES)) {
    const entry = {
      id,
      kind: gate.kind,
      step: gate.step ?? null,
      phaseNumber: PhaseNumberForStep(gate.step),
      anchor: gate.anchor ?? null,
      point: GatePoint(gate),
      radiusM: gate.radiusM ?? null,
      box: GateBox(gate),
      cue: gate.cue ?? null,
      interaction: gate.interaction ?? null,
      encounter: gate.encounter ?? null,
      member: gate.member ?? null,
      requires: gate.requires ? [...gate.requires] : null,
      source: gate.source ?? null,
      seconds: gate.seconds ?? null,
      family: gate.kind === "proximityFamily" ? gate.family : null,
      points: gate.kind === "proximityFamily" ? FlatRoute(gate.points) : null,
      pointsFrom: gate.pointsFrom ?? null,
      text: "",
    };
    entry.text = DescribeFact(MISSION_FACT_GATES, id);
    facts[id] = entry;
  }
  return facts;
}

function MemberTactic(memberId) {
  const plan = MISSION_TACTICS[memberId];
  if (!plan) return null;
  return {
    delay: plan.delay ?? 0,
    near: plan.near ? Flat(plan.near) : null,
    nearM: plan.nearM ?? null,
    points: FlatRoute(plan.points),
  };
}

function MemberAssaultLane(encounterId, spec) {
  if (!["front", "machineGun"].includes(encounterId) || spec.hold) return null;
  const lane = spec.reserve ? FrontReserveLane(spec.x, spec.z) : FrontAssaultLane(spec.x, spec.z);
  return lane?.length ? FlatRoute(lane) : null;
}

// FIRST_LEVEL_STAGE_CLEARED_ENEMIES：跳到这一阶段时哪些人已经算被清掉了。
const CLEARED_AT = (() => {
  const map = new Map();
  for (const [phase, ids] of Object.entries(FIRST_LEVEL_STAGE_CLEARED_ENEMIES))
    for (const id of ids) if (!map.has(id) || map.get(id) > Number(phase)) map.set(id, Number(phase));
  return map;
})();

function BuildEncounters() {
  return Object.entries(MISSION_ENCOUNTERS).map(([id, roster]) => {
    const activation = MISSION_ENCOUNTER_ACTIVATION[id] || {};
    const phaseNumber = FIRST_LEVEL_ENCOUNTER_STARTS[id] ?? null;
    const deferred = Object.entries(FIRST_LEVEL_DEFERRED_ENCOUNTERS)
      .some(([phase, ids]) => Number(phase) === phaseNumber && ids.includes(id));
    return {
      id,
      phaseNumber,
      deferred,
      spawn: activation.spawn ? { ...activation.spawn } : null,
      standbyUntil: activation.standbyUntil ?? null,
      dormant: !!activation.dormant,
      wake: activation.wake ? { ...activation.wake } : null,
      release: activation.release ? { ...activation.release } : null,
      note: activation.note ?? null,
      members: roster.map((spec) => ({
        id: spec.id,
        x: spec.x,
        z: spec.z,
        weapon: spec.weapon || "Type38",
        hold: !!spec.hold,
        bayonet: !!spec.bayonet,
        team: spec.team ?? null,
        reserve: !!spec.reserve,
        releaseDelayS: spec.releaseDelayS ?? 0,
        tactic: MemberTactic(spec.id),
        assaultLane: MemberAssaultLane(id, spec),
        clearedAtPhase: CLEARED_AT.get(spec.id) ?? null,
      })),
    };
  });
}

function BuildRoutes() {
  const routes = {};
  for (const [name, points] of Object.entries(MISSION_ROUTES)) routes[name] = FlatRoute(points);
  routes.pursuit = FlatRoute(MISSION_PURSUIT_ROUTE);
  routes.sortie = FlatRoute(Sortie.route);
  routes.sortieReturn = FlatRoute(MISSION_ROUTES.bundleReturn);
  // `approach` / `supportTrench` 与 MISSION_ROUTES 的 `opening` / `support` 是同一个
  // 数组，工作台上画两遍 —— `Script_MissionGatesTest` 点名要这两个键，所以留着。
  routes.approach = FlatRoute(OPENING.approachRoute);
  routes.supportTrench = FlatRoute(OPENING.supportRoute);
  routes.trenchContact = FlatRoute(OPENING.trenchContactRoute);
  routes.wounded = FlatRoute(OPENING.woundedRoute);
  routes.runner = FlatRoute(OPENING.runnerRoute);
  // 2026.09.19 契约路线：几何还没建好，所以它们还没并进 MISSION_ROUTES，
  // 但编排工作台现在就要画得出来（步骤的 guidance.route 已经指着它们了）。
  for (const [name, points] of Object.entries(MISSION_STAGE_ROUTES)) routes[name] ??= FlatRoute(points);
  return routes;
}

function BuildZones(facts) {
  const zones = [];
  for (const fact of Object.values(facts)) {
    if (fact.kind === "proximity" && fact.point)
      zones.push({ id: fact.id, kind: "gate", fact: fact.id, step: fact.step, x: fact.point.x, z: fact.point.z, radiusM: fact.radiusM });
    else if (fact.kind === "proximityFamily" && fact.points)
      for (const [i, point] of fact.points.entries()) {
        const gate = MISSION_FACT_GATES[fact.id];
        const key = gate.keys ? gate.keys[i] : String(i);
        zones.push({ id: `${fact.id}${key}`, kind: "gate", fact: `${fact.id}${key}`, step: fact.step, x: point.x, z: point.z, radiusM: fact.radiusM });
      }
    else if (fact.kind === "interior" && fact.box)
      zones.push({ id: fact.id, kind: "interior", fact: fact.id, step: fact.step, ...fact.box });
  }
  for (const crawl of Sortie.crawl)
    zones.push({
      id: `crawl${crawl.id}`, kind: "crawl", step: "Tank", fact: `bundleCrawl${crawl.id}`,
      minX: crawl.x - crawl.w / 2, maxX: crawl.x + crawl.w / 2,
      minZ: crawl.z - crawl.d / 2, maxZ: crawl.z + crawl.d / 2,
    });
  for (const threat of MISSION_TRANSFER_THREATS) {
    const roster = MISSION_ENCOUNTERS[threat.id] || [];
    if (!roster.length) continue;
    zones.push({
      id: `threat_${threat.id}`, kind: "threatArea", step: "Transfer", fact: threat.resolved,
      minX: Math.min(...roster.map((spec) => spec.x)), maxX: Math.max(...roster.map((spec) => spec.x)),
      minZ: Math.min(...roster.map((spec) => spec.z)), maxZ: Math.max(...roster.map((spec) => spec.z)),
    });
  }
  return zones;
}

function BuildFriendlies() {
  const friendlies = [];
  for (const [i, post] of MISSION_PLACEMENT.squadFrontPositions.entries())
    friendlies.push({ id: `SquadFrontPost${i}`, kind: "squadPost", x: post.x, z: post.z, step: "MachineGun", phaseNumber: PhaseNumberForStep("MachineGun") });
  for (const [i, post] of FRONT_GUARD_POSTS.entries())
    friendlies.push({ id: `FrontGuardPost${i}`, kind: "guardPost", x: post.x, z: post.z, step: "Support", phaseNumber: PhaseNumberForStep("Support") });
  for (const spec of FRONT_DEFENDERS)
    friendlies.push({ id: spec.id, kind: "defender", x: spec.x, z: spec.z, step: "Support", phaseNumber: PhaseNumberForStep("Support"), weapon: spec.weapon });
  friendlies.push({ id: "ForwardNest", kind: "forwardNest", x: MISSION_ANCHORS.forwardNest.x, z: MISSION_ANCHORS.forwardNest.z, step: "Support", phaseNumber: PhaseNumberForStep("Support") });
  for (const post of MISSION_DEFENSE_POSTS)
    friendlies.push({ id: post.id, kind: "defensePost", x: post.x, z: post.z, step: null, phaseNumber: null });
  for (const [i, bay] of MISSION_PLACEMENT.cartBays.entries())
    friendlies.push({ id: `CartBay${i}`, kind: "cartBay", x: bay.x, z: bay.z, step: "Transfer", phaseNumber: PhaseNumberForStep("Transfer") });
  friendlies.push({ id: "TankStart", kind: "tankStart", x: MISSION_PLACEMENT.tankStart.x, z: MISSION_PLACEMENT.tankStart.z, step: "Support", phaseNumber: PhaseNumberForStep("Support") });
  for (const phase of FIRST_LEVEL_STAGES)
    friendlies.push({ id: `Spawn${phase.number}`, kind: "phaseSpawn", x: phase.spawn.x, z: phase.spawn.z, step: phase.entry, phaseNumber: phase.number });
  return friendlies;
}

function BuildTimeline(steps, facts, encounters) {
  const timeline = [];
  for (const step of steps) {
    timeline.push({
      phaseNumber: step.phaseNumber, step: step.id, kind: "entry",
      label: step.objective, factId: null, encounterId: null, memberId: null,
      atS: null, earliestS: null, latestS: null, requires: null,
    });
    if (step.minimumSeconds)
      timeline.push({
        phaseNumber: step.phaseNumber, step: step.id, kind: "timed",
        label: `本步至少 ${step.minimumSeconds} 秒`, factId: null, encounterId: null, memberId: null,
        atS: null, minimumSeconds: step.minimumSeconds, earliestS: null, latestS: null, requires: null,
      });
    for (const encounterId of step.spawns)
      timeline.push({
        phaseNumber: step.phaseNumber, step: step.id, kind: "entry",
        label: `生成 ${encounterId}`, factId: null, encounterId, memberId: null,
        atS: null, earliestS: null, latestS: null, requires: null,
      });
    for (const factId of step.requirements)
      timeline.push({
        phaseNumber: step.phaseNumber, step: step.id, kind: "condition",
        label: facts[factId]?.text || factId, factId, encounterId: null, memberId: null,
        atS: null, earliestS: null, latestS: null, requires: facts[factId]?.requires || null,
      });
  }
  // 12 只有两处威胁（MISSION_TRANSFER_THREATS）：第一处进步就在，第二处等第一处解除。
  // 面上一律叫「第 n 处威胁」：「拍」是旧四拍的内部叫法，已随 2026.09.19 重构下线。
  MISSION_TRANSFER_THREATS.forEach((threat, index) => {
    timeline.push({
      phaseNumber: PhaseNumberForStep("Transfer"), step: "Transfer", kind: "threat",
      label: threat.after
        ? `转运区第 ${index + 1} 处威胁（${threat.after} 之后隔 ${R.transferThreatGapS} 秒）`
        : `转运区第 ${index + 1} 处威胁（进 Transfer 步即在）`,
      factId: threat.resolved, encounterId: threat.id, memberId: null,
      atS: null, earliestS: null, latestS: null,
      after: threat.after || null, gapS: threat.after ? R.transferThreatGapS : 0, requires: null,
    });
  });
  // 空袭两趟的提前量。
  timeline.push({
    phaseNumber: PhaseNumberForStep("AirFirst"), step: "AirFirst", kind: "timed",
    label: `日机第一趟提前 ${R.firstAirLeadS} 秒起飞`, factId: null, encounterId: "air", memberId: null,
    atS: R.firstAirLeadS, earliestS: null, latestS: null, requires: null,
  });
  timeline.push({
    phaseNumber: PhaseNumberForStep("Dive"), step: "Dive", kind: "timed",
    label: `日机第二趟提前 ${R.secondAirLeadS} 秒起飞`, factId: null, encounterId: null, memberId: null,
    atS: R.secondAirLeadS, earliestS: null, latestS: null, requires: null,
  });
  // 01 受困段的拍子：黑屏对白被近爆打断，随后门外行刑、日兵转向门内。
  timeline.push({
    phaseNumber: PhaseNumberForStep("Trapped"), step: "Trapped", kind: "timed",
    label: `黑屏对白 ${R.bunkerBanterFallbackS} 秒后被近爆打断（没有音频时的兜底期限）`,
    factId: "bunkerCollapsed", encounterId: null, memberId: null,
    atS: R.bunkerBanterFallbackS, earliestS: null, latestS: null, requires: null,
  });
  timeline.push({
    phaseNumber: PhaseNumberForStep("Trapped"), step: "Trapped", kind: "timed",
    label: `近爆后 ${R.bunkerSearchAtS} 秒日兵转向门内`,
    factId: "doorSearchStarted", encounterId: "bunkerAssault", memberId: null,
    atS: R.bunkerSearchAtS, earliestS: null, latestS: null, requires: null,
  });
  // 各成员的战术延迟与预备队放行。
  for (const encounter of encounters)
    for (const member of encounter.members) {
      if (member.tactic)
        timeline.push({
          phaseNumber: encounter.phaseNumber,
          step: encounter.spawn?.step || null, kind: "delay",
          label: member.tactic.near
            ? `${member.id} 等玩家进 ${member.tactic.nearM} m 放行，再延迟 ${member.tactic.delay} 秒`
            : `${member.id} 延迟 ${member.tactic.delay} 秒出动`,
          factId: null, encounterId: encounter.id, memberId: member.id,
          atS: member.tactic.delay, earliestS: null, latestS: null,
          requires: member.tactic.near ? ["playerNear"] : null,
        });
      if (member.releaseDelayS)
        timeline.push({
          phaseNumber: encounter.phaseNumber, step: encounter.spawn?.step || null, kind: "delay",
          label: `${member.id}（预备队）放行延迟 ${member.releaseDelayS} 秒`,
          factId: null, encounterId: encounter.id, memberId: member.id,
          atS: member.releaseDelayS, earliestS: null, latestS: null, requires: null,
        });
    }
  // 装睡的组怎么醒。
  for (const encounter of encounters)
    if (encounter.wake)
      timeline.push({
        phaseNumber: PhaseNumberForStep(encounter.wake.step) ?? encounter.phaseNumber,
        step: encounter.wake.step || (encounter.wake.fact ? MISSION_FACT_GATES[encounter.wake.fact]?.step : null) || null,
        kind: "wake",
        label: encounter.wake.text || (encounter.wake.kind === "playerWithinM"
          ? `${encounter.id} 在玩家进 ${encounter.wake.radiusM} m 时苏醒`
          : `${encounter.id} 在 ${encounter.wake.fact} 时苏醒`),
        factId: encounter.wake.fact || null, encounterId: encounter.id, memberId: null,
        atS: null, earliestS: null, latestS: null, requires: null,
      });
  return timeline;
}

function BuildLayout() {
  return {
    blocks: MISSION_LAYOUT.blocks.map((block) => ({
      id: block.id, x: block.x, z: block.z, w: block.w, d: block.d, h: block.h, semantic: block.semantic,
    })),
    gates: MISSION_LAYOUT.gates.map((gate) => ({
      id: gate.id, x: gate.x, z: gate.z, w: gate.w, d: gate.d, h: gate.h, semantic: gate.semantic, signal: gate.signal ?? null,
    })),
    roads: MISSION_TERRAIN.roads.map((road) => ({ points: FlatRoute(road.points), width: road.width })),
    railway: { points: MISSION_RAILWAY.points.map(([x, z]) => [x, z]) },
    trenches: MISSION_TRENCH_NETWORK.segments.map((segment) => ({
      id: segment.id, preset: segment.preset ?? null, role: segment.role ?? null, points: FlatRoute(segment.points),
    })),
    bridge: {
      id: MISSION_SOUTH_BRIDGE.wreck.id,
      x: MISSION_SOUTH_BRIDGE.deck.x, z: MISSION_SOUTH_BRIDGE.deck.z,
      w: MISSION_SOUTH_BRIDGE.deck.w, d: MISSION_SOUTH_BRIDGE.deck.d,
    },
    semanticColors: { ...MISSION_LAYOUT.semanticColors },
    SampleGroundColor: MISSION_LAYOUT.SampleGroundColor,
  };
}

/** 整份编排模型。纯函数，调用一次即可缓存。 */
export function BuildOrchestrationModel() {
  const facts = BuildFacts();
  const steps = MISSION_STAGES.map((stage, index) => {
    const guidance = MISSION_GUIDANCE[stage.id] || null;
    return {
      id: stage.id,
      index,
      phaseNumber: PhaseNumberForStep(stage.id),
      objective: stage.objective,
      target: Flat(stage.target),
      cue: stage.cue ?? null,
      minimumSeconds: stage.minimumSeconds ?? null,
      requirements: [...stage.requirements],
      guidance: guidance ? { label: guidance.label, route: guidance.route ?? null } : null,
      spawns: [...(MISSION_STEP_SPAWNS[stage.id] || [])],
    };
  });
  const encounters = BuildEncounters();
  return {
    version: MISSION_VERSION,
    levelId: "FirstLevel",
    bounds: { ...MISSION_LAYOUT.bounds },
    phases: FIRST_LEVEL_STAGES.map((phase) => ({
      number: phase.number, id: phase.id, title: phase.title,
      steps: [...phase.steps], spawn: Flat(phase.spawn),
    })),
    steps,
    facts,
    encounters,
    transferThreats: MISSION_TRANSFER_THREATS.map((threat, index) => ({
      ...threat, order: index + 1, step: "Transfer",
    })),
    routes: BuildRoutes(),
    anchors: Object.fromEntries(Object.entries(MISSION_ANCHORS).map(([id, point]) => [id, Flat(point)])),
    zones: BuildZones(facts),
    friendlies: BuildFriendlies(),
    timeline: BuildTimeline(steps, facts, encounters),
    layout: BuildLayout(),
  };
}

// ---------------------------------------------------------------------------
// 某一阶段的布局（设计态，不需要运行时）
// ---------------------------------------------------------------------------
function EncounterStateAt(model, encounter, phaseNumber) {
  const present = new Set(FIRST_LEVEL_STAGE_ENCOUNTERS[phaseNumber - 1] || []);
  const starts = encounter.phaseNumber;
  if (!present.has(encounter.id)) {
    if (starts == null || starts > phaseNumber) return "pending";
    if (starts === phaseNumber && encounter.deferred) return "pending";
    return starts < phaseNumber ? "cleared" : "pending";
  }
  if (encounter.dormant && encounter.wake) {
    const wakePhase = encounter.wake.step
      ? PhaseNumberForStep(encounter.wake.step)
      : PhaseNumberForStep(model.facts[encounter.wake.fact]?.step);
    if (wakePhase != null && phaseNumber < wakePhase) return "dormant";
  }
  if (encounter.standbyUntil) {
    const gatePhase = model.facts[encounter.standbyUntil]?.phaseNumber;
    if (gatePhase != null && (phaseNumber < gatePhase || (phaseNumber === gatePhase && encounter.deferred)))
      return "standby";
  }
  return "active";
}

/** 这一阶段开始时的敌我布局：敌人状态、区域、路线、友军、步骤。 */
export function PhaseLayout(model, phaseNumber) {
  const phase = model.phases.find((entry) => entry.number === phaseNumber);
  if (!phase) throw new Error(`Unknown phase: ${phaseNumber}`);
  const stepIds = new Set(phase.steps);
  const encounters = model.encounters.map((encounter) => ({
    ...encounter,
    state: EncounterStateAt(model, encounter, phaseNumber),
  }));
  const routeNames = new Set();
  for (const step of model.steps) if (stepIds.has(step.id) && step.guidance?.route) routeNames.add(step.guidance.route);
  if (phase.steps.some((step) => step.startsWith("Retreat"))) routeNames.add("pursuit");
  if (stepIds.has("Tank")) { routeNames.add("sortie"); routeNames.add("sortieReturn"); }
  return {
    encounters,
    zones: model.zones.filter((zone) => !zone.step || stepIds.has(zone.step)),
    routes: [...routeNames],
    friendlies: model.friendlies.filter((friendly) =>
      (friendly.step && stepIds.has(friendly.step)) || friendly.step === null
      || (friendly.kind === "phaseSpawn" && friendly.phaseNumber === phaseNumber)),
    steps: [...phase.steps],
  };
}

// ---------------------------------------------------------------------------
// 实际试玩状态
// ---------------------------------------------------------------------------
/** 把运行时 State() 折成工作台要的形状。runtimeState 为 null 时返回 null。 */
export function ApplyRuntimeState(model, runtimeState) {
  if (!runtimeState) return null;
  const stepId = runtimeState.stageId || runtimeState.stage || null;
  const log = (runtimeState.log || []).map((entry) => ({ kind: entry.kind, id: entry.id, time: entry.time }));
  const actualTimeline = [];
  let currentStep = null, stepStartedAt = 0;
  for (const entry of log) {
    if (entry.kind === "stage") { currentStep = entry.id; stepStartedAt = entry.time; }
    actualTimeline.push({
      phaseNumber: PhaseNumberForStep(currentStep),
      step: currentStep,
      kind: entry.kind === "stage" ? "stageEntry" : "fact",
      id: entry.id,
      atS: entry.time,
      stageAtS: Math.max(0, entry.time - stepStartedAt),
    });
  }
  return {
    stepId,
    phaseNumber: runtimeState.phaseNumber ?? PhaseNumberForStep(stepId),
    stageTime: runtimeState.stageTime ?? null,
    time: runtimeState.time ?? null,
    facts: new Set(runtimeState.facts || []),
    remaining: [...(runtimeState.remaining || [])],
    log,
    enemies: (runtimeState.enemies || []).map((enemy) => ({
      id: enemy.id, alive: !!enemy.alive, encounter: enemy.encounter ?? null,
      x: enemy.x, z: enemy.z, dormant: !!enemy.dormant, noncombatant: !!enemy.noncombatant,
    })),
    spawned: runtimeState.spawned ? [...runtimeState.spawned] : null,
    transferBeats: runtimeState.transferBeats ?? null,
    player: runtimeState.player ? { x: runtimeState.player.x, z: runtimeState.player.z, yaw: runtimeState.player.yaw ?? null } : null,
    guideRoute: runtimeState.guideRoute ? FlatRoute(runtimeState.guideRoute) : null,
    actualTimeline,
  };
}

// ---------------------------------------------------------------------------
// 反查
// ---------------------------------------------------------------------------
/**
 * 一个 id 属于谁：哪一组、哪一步生成、什么时候激活、哪些事实引用它。
 * target 可以是字符串 id，也可以是 { kind, id }。
 */
export function FindOwner(model, target) {
  const id = typeof target === "string" ? target : target?.id;
  if (!id) return null;
  const result = {
    encounter: null, member: null, phaseNumber: null, step: null,
    spawn: null, activation: null, facts: [],
  };
  const encounter = model.encounters.find((entry) => entry.id === id);
  if (encounter) {
    Object.assign(result, {
      encounter, phaseNumber: encounter.phaseNumber, step: encounter.spawn?.step ?? null,
      spawn: encounter.spawn, activation: MISSION_ENCOUNTER_ACTIVATION[id] || null,
    });
  } else {
    for (const entry of model.encounters) {
      const member = entry.members.find((candidate) => candidate.id === id);
      if (!member) continue;
      Object.assign(result, {
        encounter: entry, member, phaseNumber: entry.phaseNumber, step: entry.spawn?.step ?? null,
        spawn: entry.spawn, activation: MISSION_ENCOUNTER_ACTIVATION[entry.id] || null,
      });
      break;
    }
  }
  if (!result.encounter) {
    const fact = model.facts[id];
    if (fact) Object.assign(result, { phaseNumber: fact.phaseNumber, step: fact.step });
    const step = model.steps.find((entry) => entry.id === id);
    if (step) Object.assign(result, { phaseNumber: step.phaseNumber, step: step.id });
  }
  result.facts = Object.values(model.facts)
    .filter((fact) => fact.encounter === id || fact.member === id
      || (result.member && fact.member === result.member.id)
      || (result.encounter && fact.encounter === result.encounter.id))
    .map((fact) => fact.id);
  // 阶段推进要靠哪些事实（步骤反查）。
  const step = model.steps.find((entry) => entry.id === (result.step || id));
  if (step) result.facts = [...new Set([...result.facts, ...step.requirements])];
  return result;
}

/** CLI 用的多行摘要。 */
export function ModelSummary(model) {
  const lines = [];
  const factKinds = {};
  for (const fact of Object.values(model.facts)) factKinds[fact.kind] = (factKinds[fact.kind] || 0) + 1;
  const members = model.encounters.reduce((sum, encounter) => sum + encounter.members.length, 0);
  lines.push(`第一关《往南的路》编排模型  version=${model.version}`);
  lines.push(`边界 X ${model.bounds.minX}..${model.bounds.maxX}  Z ${model.bounds.minZ}..${model.bounds.maxZ}`);
  lines.push(`公开阶段 ${model.phases.length} 个 / 内部步骤 ${model.steps.length} 个 / 事实门 ${Object.keys(model.facts).length} 条`);
  lines.push(`  事实门按判法：${Object.entries(factKinds).sort().map(([kind, n]) => `${kind} ${n}`).join("  ")}`);
  lines.push(`遭遇组 ${model.encounters.length} 组 / 成员 ${members} 人 / 转运区 ${model.transferThreats.length} 处威胁`);
  lines.push(`路线 ${Object.keys(model.routes).length} 条 / 锚点 ${Object.keys(model.anchors).length} 个 / 区域 ${model.zones.length} 个 / 友军点 ${model.friendlies.length} 个`);
  lines.push(`时间轴 ${model.timeline.length} 项（condition ${model.timeline.filter((e) => e.kind === "condition").length} 项无秒数）`);
  lines.push(`地图：体块 ${model.layout.blocks.length} / 门 ${model.layout.gates.length} / 道路 ${model.layout.roads.length} / 壕沟 ${model.layout.trenches.length} 段`);
  lines.push("");
  for (const phase of model.phases) {
    const layout = PhaseLayout(model, phase.number);
    const counted = {};
    for (const encounter of layout.encounters) counted[encounter.state] = (counted[encounter.state] || 0) + 1;
    const steps = phase.steps.map((stepId) => {
      const step = model.steps.find((entry) => entry.id === stepId);
      return `${stepId}(${step ? step.requirements.length : 0})`;
    }).join(" ");
    lines.push(`阶段 ${String(phase.number).padStart(2)} ${phase.id.padEnd(17)} ${phase.title}`);
    lines.push(`         步骤 ${steps}`);
    lines.push(`         敌军 ${Object.entries(counted).sort().map(([state, n]) => `${state} ${n}`).join("  ")}`);
  }
  return lines.join("\n");
}
