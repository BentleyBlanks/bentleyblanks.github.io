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
//      每相位最多一次的成组冲锋、守军过口窗口里「看得见口子的人往回拉」。
// 冲刺那一段腿（MoveActor）仍只在 `UpdateAssault` 里 —— 一个人的腿只有一个主人（§19）。
// ===========================================================================
import {
  FRONT_PRESSURE_PHASES, FRONT_PRESSURE_GROUPS, FRONT_FIRE_POINTS, FRONT_PRESSURE_STAGES,
  FRONT_PRESSURE_FIRE_ENCOUNTERS, FRONT_PRESSURE_TICK,
} from "./Data_FirstLevelFrontPressure.mjs";
import { MISSION_TUNING as R } from "./Data_Tuning_FirstLevel.mjs";
import { FRONT_BATTLE_TUNING as B } from "./Data_Tuning_FirstLevelFront.mjs";
import { FRONT_SORTIE as S } from "./Data_FirstLevelFrontRoute.mjs";

const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

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
 * 组心离玩家 ≤ playerWithinM、守在最远线上的人占比 ≥ lastLineShare。
 */
export function FrontChargeDue(members, rule, phaseAgeS, player) {
  if (!rule || phaseAgeS < rule.afterS || !player) return false;
  const ready = members.filter((a) => a.alive && !a.missionFrontStandby && a.missionAssault);
  if (ready.length < rule.minAlive) return false;
  let cx = 0, cz = 0;
  for (const a of ready) { cx += a.position.x; cz += a.position.z; }
  cx /= ready.length; cz /= ready.length;
  if (Math.hypot(cx - player.x, cz - player.z) > rule.playerWithinM) return false;
  const onLast = ready.filter((a) => a.missionAssault.mode === "hold" && a.missionAssault.index >= AssaultTop(a.missionAssault)).length;
  return onLast >= rule.lastLineShare * ready.length;
}

// ------------------------------------------------------------------ 运行时
export class FirstLevelFrontPressure {
  constructor(runtime) {
    this.r = runtime;
    this.phase = null;
    this.phaseAt = 0;
    this.groupState = new Map();
    this.fire = { full: null, noGap: null };
    this.groupTickAt = 0;
    this.yieldTickAt = 0;
    this.evacuating = false;
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
    this.phase = phase;
    this.phaseAt = r.time;
    this.groupState.clear();
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
      const officerId = FRONT_PRESSURE_GROUPS[groupId]?.officer || null;
      for (const actor of members) {
        actor.reactionGroup = groupId;
        // 开火窗口按组分瞄准名额（Script_FirstLevelOpening.FireWindows 早就认 missionFireGroup，
        // 只是从没有人写过它）：两组都看得见玩家时，各拿一个窗口，大组不会把小组饿死。
        actor.missionFireGroup = groupId;
        actor.aiOfficer = !!officerId && actor.missionId === officerId;
        if (cfg.role === "assault") this.ApplyAssault(actor, cfg);
        else if (cfg.role === "nestGuard") this.InitNestGuard(actor);
      }
      this.groupState.set(groupId, { total: members.length, fallbackDone: false, charged: false });
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

  /** 相位给跃进组的配置：推进上限、退回线、是否无限循环、侧翼的显式路线。 */
  ApplyAssault(actor, cfg) {
    const s = actor.missionAssault;
    if (!s) return;
    if (cfg.points) {
      if (s.route !== cfg.points) {
        s.basePoints ||= s.points;
        s.points = cfg.points.map((p) => ({ x: p.x, z: p.z }));
        s.route = cfg.points;
        s.index = 0; s.mode = "rush"; s.hold = 0; s.shifts = 0;
      }
    } else if (s.basePoints) {
      s.points = s.basePoints; s.basePoints = null; s.route = null;
      s.index = Math.min(s.index, s.points.length - 1); s.mode = "rush"; s.hold = 0;
    }
    const last = s.points.length - 1;
    s.maxIndex = !Number.isFinite(cfg.maxLine) || cfg.maxLine < 0 ? last : Math.min(last, cfg.maxLine);
    s.regroupLine = Math.max(0, Math.min(s.maxIndex, Number.isFinite(cfg.regroupLine) ? cfg.regroupLine : R.assaultRegroupLine));
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
      const st = this.groupState.get(groupId) || { total: members.length, fallbackDone: false, charged: false };
      st.total = Math.max(st.total, members.length);
      this.groupState.set(groupId, st);
      if (cfg.role === "nestGuard") { this.NestFallback(groupId, cfg, members, st); continue; }
      if (cfg.role !== "assault") continue;
      const rule = cfg.fallback;
      if (rule && !st.fallbackDone && GroupFallbackDue(members, st.total, rule)) {
        st.fallbackDone = true;
        st.fallbackUntil = now + (rule.holdS || 0);
        for (const a of members) {
          const s = a.missionAssault;
          if (!a.alive || !s || a.missionFrontStandby) continue;
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
      if (cfg.charge && !st.charged && FrontChargeDue(members, cfg.charge, now - this.phaseAt, r.player?.position)) {
        st.charged = true;
        this.GroupCharge(groupId, members);
      }
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
      r.Defend(a, rule.to, R.defendHoldRadiusM, R.defendCoverSlackM);
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
    const chargers = members.filter((a) => a.alive && !a.missionFrontStandby && a.missionAssault
      && a.target?.isPlayer && a.weapon?.bayonet && !a.meleeCombat);
    if (chargers.length < 2) { this.Note("chargeSkipped", { group: groupId, ready: chargers.length }); return 0; }
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
   * 直到断了视线或退回第一条线。这样 InfantryBlockade 一定解得开，而不是靠玩家把人打光。
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
        if (s.index <= 0 && s.mode === "hold") continue;
        s.index = Math.max(0, Math.min(s.index, AssaultTop(s)) - (s.mode === "hold" ? 1 : 0));
        s.maxIndex = s.index;
        s.mode = "rush"; s.hold = 0; s.shifts = 0;
        this.Note("yield", { id: a.missionId, line: s.index });
      }
    }
  }

  State() {
    return {
      phase: this.phase?.id ?? null,
      phaseAt: this.phaseAt,
      evacuating: this.evacuating,
      groups: Object.fromEntries([...this.groupState].map(([id, st]) => [id, { ...st }])),
      events: this.events.slice(-24),
    };
  }

  Dispose() {
    const ai = this.r.ai;
    if (ai) { ai.missionCoverRules = false; ai.missionReactions = false; }
    for (const a of this.r.enemies?.values?.() || []) { a.ambientFirePoints = null; a.ambientFirePoint = null; }
  }
}
