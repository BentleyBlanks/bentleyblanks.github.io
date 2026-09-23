// ===========================================================================
// Script_FirstLevelBackdropSquads.mjs —— 01 背景兵的薄运行时（docs/Data_EnemyAi.md §20）
//
// 数据与格式：Data_FirstLevelBackdropSquads.mjs 头注。运行时里只有构造 / Update / Dispose / State 四个钩子。
// 这些人是剧本兵：本模块只管「跑到哪、在哪停」，开枪是大脑的环境射击（`ambientFirePoints`），
// 这里一发子弹都不自己打。离开 steps（含调试跳关、回跳）整组撤场 —— 01 的背景不许漏到 03 的统计里。
// ===========================================================================
import { BACKDROP_SQUADS, BACKDROP_FIRE_POINTS } from "./Data_FirstLevelBackdropSquads.mjs";
import { MISSION_TUNING as R } from "./Data_Tuning_FirstLevel.mjs";
import { InstallMissionSentry } from "./Script_FirstLevelMissionPeople.mjs";

const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const ARRIVE_M = 0.8;

/** 一个停点的授权点表（带 id，冻结；同一停点多次调用返回同一份，好让大脑按引用判断「换没换」）。 */
const firePointCache = new Map();
export function BackdropFirePoints(stop, points = BACKDROP_FIRE_POINTS) {
  if (firePointCache.has(stop)) return firePointCache.get(stop);
  if (!stop.fire.length) { firePointCache.set(stop, null); return null; }
  const list = Object.freeze(stop.fire.map((id) => {
    const p = points[id];
    if (!p) throw new Error(`BackdropSquads: unknown fire point ${id}`);
    return Object.freeze({ id, x: p.x, z: p.z, h: p.h, r: p.r });
  }));
  firePointCache.set(stop, list);
  return list;
}

/**
 * 纯规则：一个背景兵这一刻该干什么（Node 测试直接调）。
 * @returns {{ kind:"wait"|"run"|"hold", stop:object|null, index:number }}
 */
export function BackdropStep(spec, state, now) {
  if (now < state.startAt + (spec.delayS || 0)) return { kind: "wait", stop: null, index: state.index };
  const route = spec.route;
  let index = state.index;
  while (index < route.length - 1 && state.arrived && now >= state.holdUntil) {
    index += 1; state.arrived = false;
  }
  state.index = index;
  const stop = route[index];
  return { kind: state.arrived ? "hold" : "run", stop, index };
}

export class FirstLevelBackdropSquads {
  constructor(runtime, table = BACKDROP_SQUADS) {
    this.r = runtime;
    this.table = table;
    this.members = [];          // { spec, actor, state }
    this.started = false;
    this.handedOff = false;
    this.queued = 0;
  }

  get Active() { return this.table.steps.includes(this.r.flow.stage.id); }

  Update() {
    const r = this.r;
    if (!this.Active) { if (this.members.length || this.started) this.Clear(); return; }
    if (!this.started) {
      if (this.table.spawnFact && !r.Has(this.table.spawnFact)) return;
      this.started = true;
      this.startAt = r.time;
      for (const spec of this.table.members) this.Queue(spec);
    }
    const handoff = this.table.handoff;
    if (!this.handedOff && handoff?.fact && r.Has(handoff.fact)) this.HandOff(handoff);
    for (const m of this.members) {
      if (!m.actor.alive || m.released) continue;
      this.Drive(m);
    }
  }

  Queue(spec) {
    const r = this.r;
    this.queued += 1;
    const Spawn = () => {
      if (!this.Active || !this.started) { this.queued -= 1; return; }
      const actor = r.ai.Spawn(spec.side, spec.x, spec.z, { weapon: spec.weapon, squadId: `Mission_${this.table.encounter}_${spec.side}` });
      if (!actor) { r.spawnQueue.push(Spawn); return; }
      this.queued -= 1;
      InstallMissionSentry(actor);
      actor.missionId = spec.id;
      actor.missionEncounter = this.table.encounter;
      actor.scriptedNoncombatant = true;
      actor.reactionGroup = this.table.encounter;
      actor.manualGoalUntil = Infinity;
      // 川军还击者：日军不把他当目标（背景就是背景，别让前沿那批人隔着一百米把他们打光）。
      // 日军背景兵**交接之前不进任务敌人表**（r.enemies）：交接前他们是剧本兵，一枪不对人打，
      // 不需要开火窗口；进了表反而会被整关驾驶器 01–02 的名册快照当成「前沿预置兵」，
      // 离开 01–02 撤场时算成「03 开场换了实体」（2026-09-23 实测 01→06 冷启动红在这条）。
      if (spec.side === "nra") actor.missionUntargetable = true;
      const m = { spec, actor, state: { index: 0, arrived: false, holdUntil: 0, startAt: this.startAt } };
      this.members.push(m);
      this.Drive(m);
    };
    r.spawnQueue.push(Spawn);
  }

  /** 跑 → 到点蹲下 → 打 holdS 秒 → 下一段；最后一个停点一直打。开枪全交给大脑的环境射击。 */
  Drive(m) {
    const r = this.r, a = m.actor, s = m.state, now = r.time;
    const step = BackdropStep(m.spec, s, now);
    if (step.kind === "wait") { a.ambientFirePoints = null; this.HoldAt(a, a.position); return; }
    const stop = step.stop;
    if (step.kind === "run") {
      if (Distance(a.position, stop) < ARRIVE_M || !(m.spec.speedMps > 0)) {
        s.arrived = true;
        s.holdUntil = now + (stop.holdS || 0);
        this.HoldAt(a, stop);
        a.ambientFirePoints = BackdropFirePoints(stop);
        return;
      }
      a.ambientFirePoints = null;
      a.ambientFirePoint = null;
      r.ai.SetStance(a, 0, 0.4, true);
      r.MoveActor(a, stop, m.spec.speedMps);
      return;
    }
    // hold：停点上蹲着打（WatchScripted 给戒备姿态，PickAmbientFire 挑点）。fire 为空的停点只是过路点。
    if (a.ambientFirePoints !== BackdropFirePoints(stop)) { a.ambientFirePoints = BackdropFirePoints(stop); a.ambientFirePoint = null; }
  }

  /** 停在这儿：守区 + order hold + 没有剧本速度（WatchScripted 认这三条才给戒备姿态）。 */
  HoldAt(a, point) {
    if (a.order === "hold" && a.holdZone && Distance(a.holdZone, point) < 0.05) return;
    a.p012Guided = false;
    delete a.scriptMoveSpeedMps;
    a.order = "hold";
    a.holdZone = { id: `Backdrop_${a.missionId}`, x: point.x, z: point.z, radius: 0.6 };
    a.goal.set(point.x, 0, point.z);
    this.r.ai.SetStance(a, 1, 1.2, true);
  }

  /**
   * 交接给连续进攻（契约 §5.8 的 bunkerPursuit 由 Opening 包接）：
   *   combat  日军放成普通守区 AI（局部战区 tacticalRadiusM、找掩体、走开火窗口），授权点保留 ——
   *           被禁火的时候照样朝外打；川军还击者原地继续；
   *   hold    原地继续当背景。
   */
  HandOff(handoff) {
    this.handedOff = true;
    if (handoff.mode !== "combat") return;
    const r = this.r;
    for (const m of this.members) {
      const a = m.actor;
      if (!a.alive || m.spec.side !== "ija") continue;
      m.released = true;
      r.enemies.set(m.spec.id, a);   // 从这一刻起是任务里的普通敌人：走开火窗口、进阶段统计
      a.scriptedNoncombatant = false;
      a.tacticalRadiusM = handoff.tacticalRadiusM;
      a.scriptAccuracyScale = a.missionAccuracyScale = R.frontAccuracyScale;
      a.scriptFireIntervalScale = a.missionFireIntervalScale = R.frontFireIntervalScale;
      a.grenades = 0;
      r.Defend(a, a.position, R.defendHoldRadiusM, R.defendCoverSlackM);
    }
  }

  /** 离开 01–02：整组撤场（活人移除、名单清空），调试跳关与回跳也走这里。 */
  Clear() {
    const r = this.r;
    for (const m of this.members) {
      r.enemies.delete(m.spec.id);
      if (m.actor.alive || m.actor.actor) r.ai.Remove(m.actor);
    }
    this.members = [];
    this.started = false;
    this.handedOff = false;
  }

  State() {
    return {
      started: this.started, handedOff: this.handedOff, queued: this.queued,
      members: this.members.map((m) => ({ id: m.spec.id, side: m.spec.side, alive: m.actor.alive,
        x: +m.actor.position.x.toFixed(2), z: +m.actor.position.z.toFixed(2), stop: m.state.index,
        arrived: m.state.arrived, shots: m.actor.ambientShots || 0, released: !!m.released })),
    };
  }

  Dispose() { this.members = []; }
}
