// ===========================================================================
// Script_FirstLevelFrontPressure.mjs —— 第一关 02–05 前沿压力表的薄运行时
//
// 数据与读法：Data_FirstLevelFrontPressure.mjs 头注；机制总账：docs/Data_EnemyAi.md §20。
// 运行时（Script_FirstLevelMissionRuntime）只留三个钩子：构造、Update 里一行、Dispose 里一行。
//
// 这一层做四件事，全是「写 AI 的输入」，一件都不替大脑做决定：
//   1. 任务侧开关：01–06 的步骤里打开 AiDirector.missionCoverRules / missionReactions，
//      之外关掉（07 以后行为逐位不变）；
//   2. 环境射击：给前沿日军写 `ambientFirePoints`（相位的授权点；守军过口时去掉撤退口两侧）；
//   3. 相位切换：给每组写跃进范围（maxIndex / regroupLine / loop）或侧翼路线、阵位守卫改非 hold、
//      军官与反应组标记、切相位时喊一声；
//   4. 组规则（0.25 s 一评）：伤亡过半全组退线（可记 frontAttackRepelled）、阵位守卫伤亡够数退后墙、
//      每相位最多一次的成组冲锋、守军过口窗口里「看得见口子的人往回拉」、近距交火僵持太久往回拉；
//   5. 增援（Front 包 09-24）：带 reserve 的相位按名册 slotStages 从视线外入口放出 frontReserve；
//      侧翼组 / 军官 / 增援这些生成时没有跃进线的人，按相位配置的 lane 给一条。
// 冲刺那一段腿（MoveActor）仍只在 `UpdateAssault` 里 —— 一个人的腿只有一个主人（§19）。
// ===========================================================================
import {
  FRONT_PRESSURE_PHASES, FRONT_PRESSURE_GROUPS, FRONT_FIRE_POINTS, FRONT_PRESSURE_STAGES,
  FRONT_PRESSURE_FIRE_ENCOUNTERS, FRONT_PRESSURE_TICK, FRONT_RESERVE_RELEASE,
} from "./Data_FirstLevelFrontPressure.mjs";
import { MISSION_TUNING as R } from "./Data_Tuning_FirstLevel.mjs";
import { FRONT_BATTLE_TUNING as B } from "./Data_Tuning_FirstLevelFront.mjs";
import { FRONT_SORTIE as S } from "./Data_FirstLevelFrontRoute.mjs";
import { MISSION_ENCOUNTERS } from "./Data_FirstLevelMission.mjs";
import { FrontAssaultLane } from "./Data_FirstLevelMissionFront.mjs";

const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
/** 名册里每个人的出生点（让口子退到第一条线之外时回这里）。 */
const SPAWNS = new Map(Object.values(MISSION_ENCOUNTERS).flat().map((spec) => [spec.id, spec]));

/**
 * 一个人的跃进状态（`missionAssault`）。运行时 `MakeAssault`（按出生点现算的跃进线）和这里的 lane
 *（侧翼组 / 军官 / 增援）共用同一个构造，字段只在这一处写。
 * jitter：每人的停留时长系数 0.6–1.4（按出生点定），前沿不会齐步走。
 */
export function AssaultState(x, z, points) {
  if (!points?.length) return null;
  const jitter = .6 + ((Math.abs(Math.round(x * 3 + z * 7)) % 17) / 16) * .8;
  return { points: points.map((p) => ({ x: p.x, z: p.z })), index: 0, hold: 0, walk: 0, pinned: 0, cycles: 0, shifts: 0, volley: 0,
    mode: "rush", jitter };
}
/** 相位配置的 lane 解析成点列（见 Data_FirstLevelFrontPressure 头注 lane）。 */
export function LanePoints(spec, lane) {
  if (!spec || !lane) return null;
  if (lane === "own") return spec.lane || null;
  if (lane === "field") return FrontAssaultLane(spec.x, spec.z);
  return Array.isArray(lane) ? lane : null;
}
/**
 * 往回跑的这段路上不认近距交火多久：到目标线的距离按冲刺速度跑完再加 1 s，且不少于 minS。
 * （固定 4 s 跑不完二十多米，半路又和何有田对上，拉线等于白拉 —— Tank 包 campaign_10。）
 */
export function RunBackSeconds(position, target, minS) {
  return Math.max(minS, (target ? Distance(position, target) : 0) / R.assaultRushMps + 1);
}
/**
 * 近距交火僵持判定（纯函数）：这个人在 contact 里呆了多久、对手打不打得死。
 * @returns {boolean} 该往回拉了
 */
export function StalemateDue(contactS, essential, rule) {
  if (!rule) return false;
  return contactS >= (essential ? rule.essentialS : rule.contactS);
}
/** 增援名册里这一步该放出来的人（stage 在当前步骤及以前）。 */
export function ReserveDue(specs, stage, order = FRONT_RESERVE_RELEASE.stageOrder) {
  const rank = order.indexOf(stage);
  if (rank < 0) return [];
  return specs.filter((spec) => { const r = order.indexOf(spec.stage); return r >= 0 && r <= rank; });
}

/** 01–06 的内部步骤：日军完整掩体周期、派生掩体与反应层只在这些步骤里开（契约 §2 第 8 条）。 */
export const FIRST_LEVEL_AI_RULE_STEPS = Object.freeze(["Trapped", "BunkerRescue", "RearTrench", "Support", "MachineGun", "Tank", "Orders"]);

// ------------------------------------------------------------------ 纯规则（Node 测试直接调）
/** 当前相位：按表的顺序，取「步骤在 stages 里、when 事实已记下（或为 null）」的最后一个。 */
export function FrontPressurePhase(stage, Has, phases = FRONT_PRESSURE_PHASES) {
  if (!FRONT_PRESSURE_STAGES.includes(stage)) return null;
  let pick = null;
  for (const phase of phases) {
    if (phase.stages && !phase.stages.includes(stage)) continue;
    if (phase.when && !Has(phase.when)) continue;
    pick = phase;
  }
  return pick;
}

/** 相位的授权点表（带 id 的新数组）。`evacuating` = 守军正在过口：去掉 gapPath 的点。 */
export function FrontFirePoints(phase, evacuating = false, points = FRONT_FIRE_POINTS) {
  if (!phase) return null;
  const out = [];
  for (const id of phase.fire || []) {
    const p = points[id];
    if (!p) throw new Error(`FrontPressure: phase ${phase.id} names unknown fire point ${id}`);
    if (evacuating && p.gapPath) continue;
    out.push(Object.freeze({ id, x: p.x, z: p.z, h: p.h, r: p.r }));
  }
  return Object.freeze(out);
}

/** 组成员（按 missionId 名单或整个遭遇组），只取已经生成的人；顺序按名单。 */
export function FrontGroupMembers(groupId, enemies, groups = FRONT_PRESSURE_GROUPS) {
  const g = groups[groupId];
  if (!g) return [];
  if (g.ids) return g.ids.map((id) => enemies.get(id)).filter(Boolean);
  if (g.encounter) return [...enemies.values()].filter((a) => a.missionEncounter === g.encounter);
  return [];
}

/** 负数下标从末尾数（-1 = 最后一个），再夹进 [0, length-1]。 */
export function RouteIndex(index, length) {
  const i = index < 0 ? length + index : index;
  return Math.max(0, Math.min(length - 1, i));
}

/**
 * 相位给的显式路线：viaLine 给了就先取这个人**自己的**跃进线里 z ≤ viaLine 的那几点
 *（北边的线 z 更小），再接 points。跃进线是净空检查过的走廊，线与线之间横移离掩体排 1.6–2.5 m。
 */
export function PressureRoute(lanePoints, cfg) {
  const via = Number.isFinite(cfg.viaLine) ? lanePoints.filter((p) => p.z <= cfg.viaLine + 0.01) : [];
  return [...via, ...cfg.points].map((p) => ({ x: p.x, z: p.z }));
}

/** 这个人这一相位最远推进到第几条线（maxIndex 夹在路线长度内）。 */
export function AssaultTop(s) {
  const last = s.points.length - 1;
  return Number.isFinite(s.maxIndex) ? Math.max(0, Math.min(last, s.maxIndex)) : last;
}

/**
 * 一轮打完之后的下一步（`UpdateAssault` 调；压力表通过 s.maxIndex / s.regroupLine / s.loop /
 * s.holdUntil 决定它）：
 *   · 还没到这一相位的最远线：进一条线（"advance"）；
 *   · 在最远线上还没打满 assaultLateralShifts 轮：再打一轮，不挪人（"round"）；
 *   · 打满了：退回 regroupLine 再上（"regroup"）。s.loop 为真时不限次数 —— 相位不切就一直有下一步；
 *     没有压力表（loop 假）时照旧只循环 assaultRegroupCycles 次（与 §19 之前逐位相同）；
 *   · s.holdUntil 没到（全组刚退过线）：只算一轮、不进不退（"wait"）；
 *   · 循环次数用完（非 loop）："settled"。
 */
export function AssaultRoundEnd(actor, s, tuning, last, now = 0) {
  if (now < (s.holdUntil || 0)) { s.hold = 0; s.volley = actor.fireSequence; return "wait"; }
  if (!last) { s.index++; s.hold = 0; s.mode = "rush"; return "advance"; }
  if (s.shifts < tuning.assaultLateralShifts) { s.shifts++; s.hold = 0; s.volley = actor.fireSequence; return "round"; }
  if (s.cycles < tuning.assaultRegroupCycles || s.loop) {
    const top = AssaultTop(s);
    const regroup = Number.isFinite(s.regroupLine) ? s.regroupLine : tuning.assaultRegroupLine;
    s.index = Math.max(0, Math.min(top, regroup));
    s.cycles++; s.shifts = 0; s.hold = 0; s.mode = "rush";
    return "regroup";
  }
  return "settled";
}

/**
 * 冲刺段有没有卡死（`UpdateAssault` 在 rush 相位每帧调）：这一趟冲刺里离目标线最近的距离
 * `tuning.assaultRushStallS` 秒没再缩短 `tuning.assaultRushProgressM`，就是卡死了。
 * 换了目标线（s.index 变了）重新计。纯函数，Node 测试直接调。
 * 迟疑 / 换弹 / 投弹这些「自己停下」的时候调用方先把 s.rushBest 置 NaN（不累计，见 `RushPaused`）。
 */
export function RushStalled(s, position, target, dt, tuning) {
  const d = Distance(position, target);
  if (s.rushIndex !== s.index || !Number.isFinite(s.rushBest) || d < s.rushBest - tuning.assaultRushProgressM) {
    s.rushIndex = s.index; s.rushBest = d; s.rushStuck = 0;
    return false;
  }
  s.rushStuck += dt;
  return s.rushStuck >= tuning.assaultRushStallS;
}

/**
 * 这一帧是不是「自己停下来的」（不算冲刺卡死）：迟疑中（军官阵亡 3–5 s、看见战友倒下 0.6–1.5 s，
 * Act 把速度清零）、在换弹、在投弹。审查 2026-09-24：迟疑 4 s 以上的人曾被当成卡死。
 */
export function RushPaused(actor, aiTime) {
  return aiTime < (actor.hesitateUntil ?? -99) || actor.state === "reload" || actor.state === "grenade";
}

/** 离他最近、又不超过 top 的那条线（成组冲锋散了之后接回跃进用）。 */
export function NearestLineIndex(s, position, top = AssaultTop(s)) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i <= top; i++) {
    const d = Distance(s.points[i], position);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/** 组的伤亡是否到了 fallback 线（名单总数按相位开始时见过的最大人数算，死了的人不会让分母变小）。 */
export function GroupFallbackDue(members, total, rule) {
  if (!rule || !members.length) return false;
  const alive = members.filter((a) => a.alive).length;
  if (!alive) return false;
  if (Number.isFinite(rule.casualties)) return total - alive >= rule.casualties;
  return total - alive >= rule.casualtyFraction * total;
}

/**
 * 成组冲锋的时机（纯判定）：相位开始 afterS 秒后、活着的（不在待命、有跃进线）≥ minAlive、
 * 组心离玩家 ≤ playerWithinM、已经上到（或正冲向）这一相位最远线的人占比 ≥ lastLineShare。
 * @returns {string|null} 不到时机的原因（取证写进事件 chargeNotDue）；null = 该冲了
 */
export function FrontChargeCheck(members, rule, phaseAgeS, player) {
  if (!rule) return "noRule";
  if (!player) return "noPlayer";
  if (phaseAgeS < rule.afterS) return "tooEarly";
  const ready = members.filter((a) => a.alive && !a.missionFrontStandby && a.missionAssault);
  if (ready.length < rule.minAlive) return "tooFew";
  let cx = 0, cz = 0;
  for (const a of ready) { cx += a.position.x; cz += a.position.z; }
  cx /= ready.length; cz /= ready.length;
  if (Math.hypot(cx - player.x, cz - player.z) > rule.playerWithinM) return "playerFar";
  // 2026-09-24 审查：旧判据要「在最远线上、而且已经站定（hold）」，loop 跃进的人在最远线上待不满
  // 一轮就退回 regroupLine，实机 01→06 一次都没凑够；冲向最远线的那一段也算「压上来了」。
  const onLast = ready.filter((a) => a.missionAssault.index >= AssaultTop(a.missionAssault)).length;
  return onLast >= rule.lastLineShare * ready.length ? null : "notForward";
}

/** `FrontChargeCheck` 的布尔版（该冲了 = true）。 */
export function FrontChargeDue(members, rule, phaseAgeS, player) {
  return FrontChargeCheck(members, rule, phaseAgeS, player) === null;
}

// ------------------------------------------------------------------ 运行时
export class FirstLevelFrontPressure {
  constructor(runtime) {
    this.r = runtime;
    this.phase = null;
    this.phaseAt = 0;
    /**
     * 组的**整关**账（按组 id，跨相位保留，只在 Dispose 清）：total 见过的最多人数、fallbackDone
     * 伤亡退线做过没有。2026-09-24 审查：以前每次切相位都清，一个伤亡过半的组之后每进一个
     * 相位都会立刻再退一次线、再喊一次「一旦下がれ」。
     */
    this.groupState = new Map();
    /** 这一相位的成组冲锋账（按组 id，切相位清）：charged 冲过没有、why 最近一次没冲的原因。 */
    this.phaseCharge = new Map();
    this.fire = { full: null, noGap: null };
    this.groupTickAt = 0;
    this.yieldTickAt = 0;
    this.evacuating = false;
    /** 已排进生成队列的增援（missionId）：同一个人只排一次。 */
    this.reserveQueued = new Set();
    /** 取证：相位切换、退线、冲锋、让口子（驾驶器与探针读 State()）。 */
    this.events = [];
  }

  Update() {
    const r = this.r, ai = r.ai, stage = r.flow.stage.id;
    // 1. 任务侧开关：每帧写（便宜），换关 / 回跳 / 07 以后自然关掉。
    const rules = FIRST_LEVEL_AI_RULE_STEPS.includes(stage);
    ai.missionCoverRules = rules;
    ai.missionReactions = rules;
    const phase = FrontPressurePhase(stage, (id) => r.Has(id));
    if (phase !== this.phase) this.EnterPhase(phase);
    if (!phase) return;
    if (phase.reserve) this.ReleaseReserves(stage);
    this.AssignFire();
    if (r.time >= this.groupTickAt) {
      this.groupTickAt = r.time + FRONT_PRESSURE_TICK.groupEveryS;
      this.UpdateGroups();
    }
    if (phase.yield && r.time >= this.yieldTickAt) {
      this.yieldTickAt = r.time + FRONT_PRESSURE_TICK.yieldEveryS;
      this.YieldGap();
    }
  }

  Note(kind, detail = {}) {
    this.events.push({ at: +this.r.time.toFixed(2), kind, phase: this.phase?.id ?? null, ...detail });
    if (this.events.length > 64) this.events.shift();
  }

  EnterPhase(phase) {
    const r = this.r, previous = this.phase;
    // 上一相位配了成组冲锋却没冲：把最后一次没冲的原因、以及各原因占了多少次评估记下来（探针读 events）。
    if (previous) for (const [groupId, cfg] of Object.entries(previous.groups || {})) {
      const pc = this.phaseCharge.get(groupId);
      if (cfg.charge && !pc?.charged) this.Note("chargeNotDue", { group: groupId, why: pc?.why || "neverChecked", whys: { ...(pc?.whys || {}) } });
    }
    this.phase = phase;
    this.phaseAt = r.time;
    this.phaseCharge.clear();
    this.Note("phase", { from: previous?.id ?? null, to: phase?.id ?? null });
    if (!phase) {
      // 出了 02–05：授权点一律收回（不收的话 06 以后前沿的人还在朝空土坎打）。
      for (const a of r.enemies.values()) { a.ambientFirePoints = null; a.ambientFirePoint = null; }
      this.fire.full = this.fire.noGap = null;
      return;
    }
    this.fire.full = FrontFirePoints(phase, false);
    this.fire.noGap = FrontFirePoints(phase, true);
    for (const [groupId, cfg] of Object.entries(phase.groups || {})) {
      const members = FrontGroupMembers(groupId, r.enemies);
      for (const actor of members) this.ApplyMember(actor, groupId, cfg);
      this.GroupState(groupId, members);
      if (previous && phase.bark) {
        const speaker = this.Speaker(groupId, members);
        if (speaker) r.ai.Bark(speaker, phase.bark);
      }
    }
  }

  /** 这一组谁来喊：军官活着就是他，否则离玩家最近的活人（待命的不喊）。 */
  Speaker(groupId, members) {
    const officerId = FRONT_PRESSURE_GROUPS[groupId]?.officer;
    const alive = members.filter((a) => a.alive && !a.missionFrontStandby && !a.scriptedNoncombatant);
    const officer = alive.find((a) => a.missionId === officerId);
    if (officer) return officer;
    const p = this.r.player?.position;
    if (!p) return alive[0] || null;
    return alive.sort((a, b) => Distance(a.position, p) - Distance(b.position, p))[0] || null;
  }

  /**
   * 组的整关账（没有就建）；total 取见过的最多人数（死人不让分母变小，晚生成的人让它变大）。
   * **建账那一刻已经死了的人不算这个组的伤亡**（deadAtStart）：机枪攻击组在 03 待命时就会被打掉几个，
   * 04 一露面按全名单算就已经「伤亡过半」，露面 0.1 s 就退线（2026-09-24 探针 fix1）。
   */
  GroupState(groupId, members) {
    let st = this.groupState.get(groupId);
    if (!st) {
      const dead = members.filter((a) => !a.alive).length;
      st = { deadAtStart: dead, total: members.length - dead, fallbackDone: false, fallbackUntil: 0 };
      this.groupState.set(groupId, st);
    }
    st.total = Math.max(st.total, members.length - st.deadAtStart);
    return st;
  }

  /**
   * 把这一相位的组配置写到一个人身上，**每人每相位一次**（`actor.pressurePhaseId` 记着）。
   * EnterPhase 给当时已生成的人写；UpdateGroups 每 0.25 s 补给晚生成的人（分帧生成、冷启动、
   * 增援）—— 2026-09-24 审查：以前只在切相位那一帧写，02 里阵位守卫大多没拿到非 hold 配置。
   */
  ApplyMember(actor, groupId, cfg) {
    if (!actor.alive || actor.pressurePhaseId === this.phase.id) return;
    actor.pressurePhaseId = this.phase.id;
    const officerId = FRONT_PRESSURE_GROUPS[groupId]?.officer || null;
    actor.reactionGroup = groupId;
    // 开火窗口按组分瞄准名额（Script_FirstLevelOpening.FireWindows 早就认 missionFireGroup，
    // 只是从没有人写过它）：两组都看得见玩家时，各拿一个窗口，大组不会把小组饿死。
    actor.missionFireGroup = groupId;
    actor.aiOfficer = !!officerId && actor.missionId === officerId;
    if (cfg.role === "assault") this.ApplyAssault(actor, cfg);
    else if (cfg.role === "nestGuard") this.InitNestGuard(actor);
    else if (cfg.role === "hold") this.HoldAssault(actor);
  }

  /**
   * hold 角色落在**上一相位还是跃进组**的人身上（例如 disengage 的西侧两人）：停在他此刻的线上，
   * 不再进、不再无限循环（旧口径的有限节奏打完就 settled）。从没被压力表配过跃进的人（没有
   * maxIndex，比如东侧守点）什么都不改 —— hold 的原意是「不改走位」。
   */
  HoldAssault(actor) {
    const s = actor.missionAssault;
    if (!s || !Number.isFinite(s.maxIndex)) return;
    const line = Math.max(0, Math.min(AssaultTop(s), s.index));
    s.maxIndex = line; s.regroupLine = line; s.loop = false; s.cycles = 0; s.holdUntil = 0;
    s.index = line;
  }

  /** 相位给跃进组的配置：推进上限、退回线、是否无限循环、侧翼的显式路线。 */
  ApplyAssault(actor, cfg) {
    // 生成时没有跃进线的人（侧翼组、军官、增援）：按相位配置的 lane 给一条，从出生点起跳。
    if (!actor.missionAssault && cfg.lane) {
      const spec = SPAWNS.get(actor.missionId);
      actor.missionAssault = AssaultState(spec?.x ?? actor.position.x, spec?.z ?? actor.position.z, LanePoints(spec, cfg.lane));
    }
    const s = actor.missionAssault;
    if (!s) return;
    // 冲刺卡死时本轮借用的站位（`UpdateAssault`）不跨相位：换相位一律回到原线点。
    s.stallTarget = null;
    if (cfg.points) {
      if (s.route !== cfg.points) {
        s.basePoints ||= s.points;
        s.points = PressureRoute(s.basePoints, cfg);
        s.route = cfg.points;
        s.index = 0; s.mode = "rush"; s.hold = 0; s.shifts = 0;
      }
    } else if (s.basePoints) {
      s.points = s.basePoints; s.basePoints = null; s.route = null;
      s.index = Math.min(s.index, s.points.length - 1); s.mode = "rush"; s.hold = 0;
    }
    const length = s.points.length;
    s.maxIndex = Number.isFinite(cfg.maxLine) ? RouteIndex(cfg.maxLine, length) : length - 1;
    s.regroupLine = Math.min(s.maxIndex, RouteIndex(Number.isFinite(cfg.regroupLine) ? cfg.regroupLine : R.assaultRegroupLine, length));
    s.loop = cfg.loop === true;
    s.cycles = 0;
    s.holdUntil = 0;
    if (s.index > s.maxIndex) { s.index = s.maxIndex; s.mode = "rush"; s.hold = 0; s.shifts = 0; }
  }

  /**
   * 阵位守卫改非 hold（固定机枪手除外）：局部战区 nestGuardTacticalRadiusM、1 枚手榴弹、
   * 走普通守区的掩体余量。只做一次（名册里的 hold 旗归 Space 包，这里是任务侧覆盖）。
   */
  InitNestGuard(actor) {
    if (actor.missionNestGuardInit || !actor.alive) return;
    actor.missionNestGuardInit = true;
    if (actor.weapon?.rpm) return;   // 固定机枪手留 hold：他离了枪，那挺枪就没人打了
    actor.scriptDefensive = false;
    actor.scriptSuppressible = true;
    actor.tacticalRadiusM = R.nestGuardTacticalRadiusM;
    if (actor.holdZone) actor.holdZone.radius = R.defendHoldRadiusM;
    actor.scriptCoverSlackM = R.defendCoverSlackM;
    actor.grenades = R.nestGuardGrenades;
  }

  /** 前沿日军的环境射击点：相位的授权点；守军过口的窗口里去掉撤退口两侧。 */
  AssignFire() {
    const r = this.r;
    const evacuating = r.guards?.some((g) => g.actor?.alive && g.crossing && !g.safe) || false;
    if (evacuating !== this.evacuating) { this.evacuating = evacuating; this.Note(evacuating ? "evacuationOpen" : "evacuationClosed"); }
    const list = evacuating ? this.fire.noGap : this.fire.full;
    for (const a of r.enemies.values()) {
      if (!a.alive || !FRONT_PRESSURE_FIRE_ENCOUNTERS.includes(a.missionEncounter)) continue;
      if (a.ambientFirePoints !== list) { a.ambientFirePoints = list; a.ambientFirePoint = null; }
    }
  }

  UpdateGroups() {
    const r = this.r, now = r.time;
    for (const [groupId, cfg] of Object.entries(this.phase.groups || {})) {
      const members = FrontGroupMembers(groupId, r.enemies);
      if (!members.length) continue;
      for (const actor of members) this.ApplyMember(actor, groupId, cfg);
      const st = this.GroupState(groupId, members);
      if (cfg.role === "nestGuard") { this.NestFallback(groupId, cfg, members, st); continue; }
      if (cfg.role !== "assault") continue;
      // 成组冲锋先于伤亡退线判（2026-09-24 审查：实机里 mgAttack 露面 34 s 就伤亡过半退了线，
      // 冲锋的 30 s 窗口一次都没凑上）。退过线的组这一相位不再冲。
      if (cfg.charge) {
        const pc = this.phaseCharge.get(groupId) || { charged: false, why: null, whys: {} };
        this.phaseCharge.set(groupId, pc);
        if (!pc.charged) {
          pc.why = st.fallbackDone ? "fellBack" : FrontChargeCheck(members, cfg.charge, now - this.phaseAt, r.player?.position);
          if (pc.why) pc.whys[pc.why] = (pc.whys[pc.why] || 0) + 1;
          // 凑不出两个「眼里有玩家、上得了刺刀」的人：2 s 后再试（事件里记 chargeSkipped）。
          if (pc.why === null && now >= (pc.retryAt || 0)) {
            if (this.GroupCharge(groupId, members)) pc.charged = true;
            else { pc.why = "noChargers"; pc.retryAt = now + 2; }
          }
        }
      }
      const rule = cfg.fallback;
      if (rule && !st.fallbackDone && GroupFallbackDue(members, st.total, rule)) {
        st.fallbackDone = true;
        st.fallbackUntil = now + (rule.holdS || 0);
        for (const a of members) {
          const s = a.missionAssault;
          // 正在成组冲锋的人不拽（冲完 UpdateAssault 接回最近的线）。
          if (!a.alive || !s || a.missionFrontStandby || s.mode === "charge") continue;
          s.index = Math.max(0, Math.min(AssaultTop(s), s.index) - (rule.backLines || 1));
          s.mode = "rush"; s.hold = 0; s.shifts = 0; s.cycles = 0;
          s.holdUntil = st.fallbackUntil;
        }
        const speaker = this.Speaker(groupId, members);
        if (speaker) r.ai.Bark(speaker, "fallback");
        this.Note("fallback", { group: groupId, alive: members.filter((a) => a.alive).length, total: st.total });
      }
      // 旧 frontAttackRepelled 门（UpdateFrontAttack 那段死代码的口径）：全组死光，或退线之后活着的都到了新线上。
      if (rule?.repelledFact && !r.Has(rule.repelledFact)) {
        const alive = members.filter((a) => a.alive);
        const settled = alive.every((a) => !a.missionAssault || a.missionAssault.mode === "hold"
          || a.missionAssault.mode === "contact");
        if (!alive.length || (st.fallbackDone && settled)) {
          r.Record(rule.repelledFact, { killed: st.total - alive.length, repelled: alive.length });
        }
      }
      if (cfg.stalemate) this.Stalemate(groupId, cfg.stalemate, members, FRONT_PRESSURE_TICK.groupEveryS);
    }
  }

  /**
   * 近距交火僵持退线（Data_FirstLevelFrontPressure 头注 stalemate）：在 contact 里呆够时长就往回拉 backLines 条线，
   * 往回跑的路上不认近距交火（s.yieldUntil，UpdateAssault 读）。冲锋、白刃中的人不拽。
   */
  Stalemate(groupId, rule, members, dt) {
    const r = this.r, now = r.time;
    for (const a of members) {
      const s = a.missionAssault;
      if (!a.alive || !s || a.missionFrontStandby || a.meleeCombat || s.mode === "charge") continue;
      if (s.mode !== "contact") { s.contactS = 0; continue; }
      s.contactS = (s.contactS || 0) + dt;
      const foe = a.target?.ref;
      const essential = !!(foe && !a.target.isPlayer && (foe.scriptEssential || foe.missionUntargetable));
      if (!StalemateDue(s.contactS, essential, rule)) continue;
      const line = Math.max(0, NearestLineIndex(s, a.position) - (rule.backLines ?? 1));
      s.index = line; s.mode = "rush"; s.hold = 0; s.shifts = 0; s.contactS = 0;
      s.yieldUntil = now + RunBackSeconds(a.position, s.points[line], rule.clearS ?? FRONT_PRESSURE_TICK.yieldMoveS);
      this.Note("stalemate", { group: groupId, id: a.missionId, line, essential });
    }
  }

  /**
   * 增援（FRONT_RESERVE_RELEASE）：名册里 stage 在当前步骤及以前的 frontReserve 排进生成队列（分帧生成，
   * 与通用生成器同一个 SpawnEncounterActor）。已经在场或排过的人不再排。
   */
  ReleaseReserves(stage) {
    const r = this.r;
    const specs = MISSION_ENCOUNTERS[FRONT_RESERVE_RELEASE.encounter] || [];
    for (const spec of ReserveDue(specs, stage)) {
      if (this.reserveQueued.has(spec.id) || r.enemies.has(spec.id)) continue;
      if (typeof r.SpawnEncounterActor !== "function") continue;
      this.reserveQueued.add(spec.id);
      const Spawn = () => r.SpawnEncounterActor(FRONT_RESERVE_RELEASE.encounter, spec);
      if (Array.isArray(r.spawnQueue)) r.spawnQueue.push(Spawn); else Spawn();
      this.Note("reserve", { id: spec.id, entry: spec.entry, stage: spec.stage });
    }
  }

  /** 阵位守卫伤亡够数：活着的步枪手退到后墙锚点（仍是局部战区，照样找掩体、照样冲贴脸的人）。 */
  NestFallback(groupId, cfg, members, st) {
    const rule = cfg.fallback;
    if (!rule || st.fallbackDone || !GroupFallbackDue(members, st.total, rule)) return;
    st.fallbackDone = true;
    const r = this.r;
    for (const a of members) {
      if (!a.alive || a.weapon?.rpm) continue;
      r.Defend(a, rule.to, R.defendHoldRadiusM, R.nestFallbackCoverSlackM);
    }
    const speaker = this.Speaker(groupId, members.filter((a) => !a.weapon?.rpm));
    if (speaker) r.ai.Bark(speaker, "fallback");
    this.Note("nestFallback", { alive: members.filter((a) => a.alive).length });
  }

  /**
   * 这一相位唯一一次脚本化成组冲锋：只带「眼睛里有玩家、上得了刺刀」的人，先从剧本走位放出来
   * （Defend 带局部战区，`UpdateAssault` 见 groupChargeUntil 就不再拽他），再交给大脑的 CHARGE。
   */
  GroupCharge(groupId, members) {
    const r = this.r;
    const officerId = FRONT_PRESSURE_GROUPS[groupId]?.officer;
    // 冲锋的人：上得了刺刀、不在白刃里，并且眼里是玩家、或者从他站的地方看得见玩家（后者冲之前把目标
    // 换成玩家 —— 禁火的人平时「先打能打的」，眼里多半是壕里的国军）。
    const eye = r.player?.EyePosition;
    const SeesPlayer = (a) => !!eye && typeof r.BlocksSight === "function" && typeof r.Point === "function"
      && !r.BlocksSight(eye, r.Point(a.position, 1.3));
    const chargers = members.filter((a) => a.alive && !a.missionFrontStandby && a.missionAssault
      && a.weapon?.bayonet && !a.meleeCombat && (a.target?.isPlayer || SeesPlayer(a)));
    if (chargers.length < 2) { this.Note("chargeSkipped", { group: groupId, ready: chargers.length }); return 0; }
    for (const a of chargers) if (!a.target?.isPlayer && typeof r.ai.TargetPlayerForCharge === "function") r.ai.TargetPlayerForCharge(a);
    for (const a of chargers) {
      if (!(a.tacticalRadiusM > 0)) a.tacticalRadiusM = R.infantryTacticalRadiusM;
      r.Defend(a, a.position, R.defendHoldRadiusM, R.assaultCoverSearchM);
      a.missionAssault.mode = "charge";
    }
    const leader = chargers.find((a) => a.missionId === officerId) || null;
    const started = r.ai.GroupCharge(chargers, { leader });
    this.Note("groupCharge", { group: groupId, started });
    return started;
  }

  /**
   * 守军过口的窗口：跃进组里对撤退口有通视的人（与 FrontBattle.InfantryBlockade 同一判据 ——
   * 85 m 内、没被压住、看得见口子那三个点）往回拉一条线，并把这一相位的推进上限压到那条线，
   * 直到断了视线或退回第一条线（再看得见就退回出生点）。
   *
   * **只管跃进组**：hold 组（火力基地、东侧守点）、阵位守卫、战车护兵、05 侧沟两人不在这里拉 ——
   * 他们看得见口子时 InfantryBlockade 仍要等他们被压住或打掉。所以这一步**不保证**封锁一定解开，
   * 只保证「跃进组不会因为跃进把口子封死」；Space / Front 包摆 hold 组的位置时要让他们对撤退口断视线
   *（2026-09-24 审查更正了旧注释「一定解得开」）。
   */
  YieldGap() {
    const r = this.r, now = r.time;
    const points = [S.gap, { x: S.gap.x, z: S.gap.z - 2 }, { x: S.gap.x, z: S.gap.z + 2 }];
    for (const [groupId, cfg] of Object.entries(this.phase.groups || {})) {
      if (cfg.role !== "assault") continue;
      for (const a of FrontGroupMembers(groupId, r.enemies)) {
        const s = a.missionAssault;
        if (!a.alive || !s || a.missionFrontStandby || (a.yieldCheckAt || 0) > now) continue;
        if (Distance(a.position, S.gap) > B.blockadeRangeM) continue;
        if (!points.some((p) => r.Threatens(p, [a.missionId], B.guardHeightM, B.blockadeRangeM))) continue;
        a.yieldCheckAt = now + FRONT_PRESSURE_TICK.yieldRecheckS;
        // 站在线上的人（hold）与在线上近距交火的人（contact）一样往回拉；拉的这几秒 UpdateAssault 不认近距交火。
        const onLine = s.mode === "hold" || s.mode === "contact";
        if (s.index <= 0 && onLine) {
          // 已经在第一条线上还看得见口子：退回他出发的地方（名册里的出生点，跃进线的起点），
          // 这一相位就停在那儿。下一相位 ApplyAssault 会把原来的跃进线还给他。
          const spec = SPAWNS.get(a.missionId);
          if (!spec || s.route === "yield") continue;
          s.basePoints ||= s.points;
          s.points = [{ x: spec.x, z: spec.z }, ...s.points];
          s.route = "yield";
          s.index = 0; s.maxIndex = 0; s.mode = "rush"; s.hold = 0; s.shifts = 0;
          s.yieldUntil = now + RunBackSeconds(a.position, s.points[0], FRONT_PRESSURE_TICK.yieldMoveS);
          this.Note("yield", { id: a.missionId, line: -1 });
          continue;
        }
        s.index = Math.max(0, Math.min(s.index, AssaultTop(s)) - (onLine ? 1 : 0));
        s.maxIndex = s.index;
        s.mode = "rush"; s.hold = 0; s.shifts = 0;
        // 拉的这一路不认近距交火：按到那条线的距离算，至少 yieldMoveS（Front 包 09-24）。
        s.yieldUntil = now + RunBackSeconds(a.position, s.points[s.index], FRONT_PRESSURE_TICK.yieldMoveS);
        this.Note("yield", { id: a.missionId, line: s.index });
      }
    }
  }

  State() {
    return {
      phase: this.phase?.id ?? null,
      phaseAt: this.phaseAt,
      evacuating: this.evacuating,
      reserves: [...this.reserveQueued],
      groups: Object.fromEntries([...this.groupState].map(([id, st]) => [id, { ...st, ...(this.phaseCharge.get(id) || {}) }])),
      events: this.events.slice(-24),
    };
  }

  Dispose() {
    const ai = this.r.ai;
    if (ai) { ai.missionCoverRules = false; ai.missionReactions = false; }
    this.groupState.clear();
    this.phaseCharge.clear();
    this.reserveQueued.clear();
    for (const a of this.r.enemies?.values?.() || []) { a.ambientFirePoints = null; a.ambientFirePoint = null; }
  }
}
