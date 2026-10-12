// ===========================================================================
// Script_FirstLevelSouthMouth.mjs —— 第一关 07 南行沟口遭遇（2026-10-12 03–11 重构 B 包）
//
// 口径：docs/Data_FirstLevel0311Refactor20261012Contract.md §3.5 / §5.1 / §5.3；改稿「07 沟口空地」。
//
//   队伍沿沟南行到沟口（A.southMouthHold）停住 → 东头突破进来的一个班 6 人（southMouth 组）从东北
//   60 m 外赶来：歪把子架在东侧田埂（A.mouthEmbankment）打沟口外的空地，三个步枪各占一道田埂 / 坟包，
//   两个往南绕到村北口想抢先进村。玩家和何有田在沟口土坎上压住机枪；担架只在机枪被压住期间冲，
//   机枪抬头就停在田埂 / 电线杆后；玩家要转身打绕村的两个。妮儿在机枪一响时撒腿先跑进村。
//
// 事实（契约 §5.1，都由本模块记）：
//   southMouthReached  领头担架到停点 / 玩家先到了停点 playerReachM 内（southMouth 组这时放出）
//   mouthContact       机枪真的开火（兜底：射手到位 contactFallbackS 没开火、组里先有人死了）
//   mouthMgSuppressed  射手 suppressed 状态连续 ≥ mgSuppressS（或已死）；第一次成立记事实；之后他会再抬头
//   mouthFlankResolved 绕村的两个都死了，或都被连续压住 ≥ flankPinS（契约 §1.3：不被打退）
//   mouthCrossed       活着的担架全部到 southWalk 末点前 crossedSlackM 以内
//
// 结构：SouthMouthRules 是**纯规则**（零 three、零场景，Script_FirstLevelSouthMouthTest 逐帧喂现场）；
// FirstLevelSouthMouth 是运行时薄适配（取现场、记事实、喊 cue、放组、切任务字、管担架限位）。
// 玩家可见中文一律走台词表 / 文本表 / Data_FirstLevelMission 的 SOUTH_MOUTH_OBJECTIVES（Script_TextTest 闸门模块）。
// ===========================================================================
import { MISSION_TUNING as R } from "./Data_Tuning_FirstLevel.mjs";
import { MISSION_ANCHORS as A, MISSION_ROUTES } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_ENCOUNTERS, SOUTH_MOUTH_OBJECTIVES } from "./Data_FirstLevelMission.mjs";
import { MissionRouteProjection, MissionRouteLength } from "./Script_FirstLevelMissionColumn.mjs";
import { Localize } from "./Script_Text.mjs";
import { FirstLevelStageTextId } from "./Script_TextIds.mjs";

const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
/** 沟口那一段任务字的译文键（与 Stage 目标同一前缀，Script_TextGather 导出）。 */
const ObjectiveTextId = (key) => FirstLevelStageTextId(`South.southMouth.${key}`);
export const SOUTH_MOUTH_ENCOUNTER = "southMouth";
export const SOUTH_MOUTH_GUNNER = "MouthGunner";
export const SOUTH_MOUTH_FLANKERS = Object.freeze(["MouthFlankA", "MouthFlankB"]);
/** 绕村的人离这一点这么近就算「露头往村里绕」（刘文财喊 MouthFlank）。 */
export const SOUTH_MOUTH_FLANK_WATCH = Object.freeze({ x: 44, z: -30, nearM: 22 });

/** 沟口两个里程：停点与「过了开阔地」的点，都投影到 southWalk 上（担架队的路线以 southWalk 起头）。 */
export function SouthMouthProgress(route = MISSION_ROUTES.southWalk, tuning = R.southMouth) {
  return Object.freeze({
    hold: MissionRouteProjection(route, A.southMouthHold).progress,
    mouth: MissionRouteProjection(route, A.southMouth).progress,
    crossed: MissionRouteLength(route) - tuning.crossedSlackM,
  });
}

/**
 * 纯规则。每帧 Update(dt, s) 喂现场：
 *   s.leadProgress      领头（最靠前的活担架）在路线上的里程
 *   s.playerToHoldM     玩家到停点的距离
 *   s.gunner            { alive, suppressed, fired, atPost }
 *   s.members           [{ alive, fired }]（全组）
 *   s.flankers          [{ alive, suppressed, nearVillage }]
 *   s.litters           [{ alive, progress }]
 * 返回这一帧新发生的事件名数组（reached / contact / suppressed / raised / flankSeen / flankResolved / crossed）。
 */
export class SouthMouthRules {
  constructor(tuning = R.southMouth, progress = SouthMouthProgress()) {
    this.T = tuning;
    this.progress = progress;
    this.time = 0;
    this.reached = false; this.reachedAt = null;
    this.contact = false; this.contactAt = null;
    this.gunnerPostAt = null;
    this.mgSuppressed = false;          // 此刻担架能不能跑（含抬头后的收尾余量）
    this.mgSuppressedEver = false;      // 事实 mouthMgSuppressed（第一次压住）
    this.suppressedSince = null;        // 射手连续 suppressed 的起点
    this.regraceUntil = null;           // 抬头后担架还能动到这一刻
    this.flankSeen = false;
    this.flankResolved = false;
    this.flankPinSince = null;
    this.crossed = false;
    this.events = [];
  }
  /** 担架这一帧能不能往前走（停点以内随便走；开阔地那一段只在压住期间走；过了就不管）。 */
  MayMove(progress) {
    if (!this.reached) return progress < this.progress.hold - 0.05;
    if (!this.contact) return progress < this.progress.hold - 0.05;
    if (progress >= this.progress.crossed) return true;
    return this.mgSuppressed;
  }
  /** 担架队的里程上限：接火以前停在停点；接火之后不设上限（MayMove 管开阔地）。 */
  MaxProgress(current = Infinity) {
    return this.contact ? current : Math.min(current, this.progress.hold);
  }
  Update(dt, s) {
    this.time += Math.max(0, dt);
    const T = this.T, out = [];
    const Fire = (name) => { out.push(name); this.events.push({ name, t: +this.time.toFixed(2) }); if (this.events.length > 48) this.events.shift(); };
    if (!this.reached) {
      if (s.leadProgress >= this.progress.hold - T.holdReachM || s.playerToHoldM <= T.playerReachM) {
        this.reached = true; this.reachedAt = this.time; Fire("reached");
      }
      return out;
    }
    const gunner = s.gunner || { alive: false, suppressed: false, fired: false, atPost: false };
    if (gunner.atPost && this.gunnerPostAt == null) this.gunnerPostAt = this.time;
    if (!this.contact) {
      const anyFired = gunner.fired || (s.members || []).some((m) => m.fired);
      const anyDead = (s.members || []).some((m) => m.alive === false);
      const waited = this.gunnerPostAt != null && this.time - this.gunnerPostAt >= T.contactFallbackS;
      if (anyFired || anyDead || waited || !gunner.alive) { this.contact = true; this.contactAt = this.time; Fire("contact"); }
      else return out;
    }
    // 机枪压住 / 再抬头。
    if (!gunner.alive) {
      if (!this.mgSuppressed) Fire("suppressed");
      this.mgSuppressed = true;
      if (!this.mgSuppressedEver) { this.mgSuppressedEver = true; }
    } else if (gunner.suppressed) {
      this.suppressedSince ??= this.time;
      if (this.time - this.suppressedSince >= T.mgSuppressS) {
        if (!this.mgSuppressed) Fire("suppressed");
        this.mgSuppressed = true; this.mgSuppressedEver = true; this.regraceUntil = null;
      }
    } else {
      this.suppressedSince = null;
      if (this.mgSuppressed && this.regraceUntil == null) this.regraceUntil = this.time + T.mgRegraceS;
      if (this.mgSuppressed && this.time >= this.regraceUntil) { this.mgSuppressed = false; this.regraceUntil = null; Fire("raised"); }
    }
    // 绕村的两个。
    const flankers = s.flankers || [];
    if (!this.flankSeen && flankers.some((f) => f.alive && f.nearVillage)) { this.flankSeen = true; Fire("flankSeen"); }
    if (!this.flankResolved && flankers.length) {
      const live = flankers.filter((f) => f.alive);
      if (!live.length) { this.flankResolved = true; Fire("flankResolved"); }
      else if (live.every((f) => f.suppressed)) {
        this.flankPinSince ??= this.time;
        if (this.time - this.flankPinSince >= T.flankPinS) { this.flankResolved = true; Fire("flankResolved"); }
      } else this.flankPinSince = null;
    }
    // 担架过完开阔地。
    if (!this.crossed) {
      const live = (s.litters || []).filter((l) => l.alive);
      if (live.length && live.every((l) => l.progress >= this.progress.crossed)) { this.crossed = true; Fire("crossed"); }
    }
    return out;
  }
  State() {
    return {
      reached: this.reached, contact: this.contact, contactAt: this.contactAt,
      mgSuppressed: this.mgSuppressed, mgSuppressedEver: this.mgSuppressedEver,
      suppressedFor: this.suppressedSince == null ? 0 : +(this.time - this.suppressedSince).toFixed(2),
      flankSeen: this.flankSeen, flankResolved: this.flankResolved, crossed: this.crossed,
      progress: { ...this.progress }, events: this.events.slice(-16),
    };
  }
}

/** 运行时薄适配：取现场、记事实、喊 cue、放组、切任务字、管担架限位。 */
export class FirstLevelSouthMouth {
  constructor(runtime) {
    this.r = runtime;
    this.rules = new SouthMouthRules();
    this.spawnedAt = null;
    this.objective = null;
    // 给运行时的担架限位（column.Update 的 SafeAt 读里程）。
    this.SafeAt = (entry) => this.rules.MayMove(entry?.progress ?? 0);
  }
  Enter(stageId) {
    if (stageId !== "South") return;
    // 检查点重来 / 回跳：事实表还在就接着算（本步重开时 flow 已把 South 的事实清掉）。
    this.rules = new SouthMouthRules();
    this.spawnedAt = null; this.objective = null;
  }
  Actor(id) { return this.r.enemies?.get?.(id) || null; }
  Members() { return (MISSION_ENCOUNTERS[SOUTH_MOUTH_ENCOUNTER] || []).map((spec) => ({ spec, actor: this.Actor(spec.id) })); }
  /** 这一帧的现场（纯数据，测试也能照着喂）。 */
  Scene() {
    const r = this.r, since = this.spawnedAt ?? Infinity;
    const Fired = (actor) => !!actor && Number.isFinite(actor.lastFire) && actor.lastFire >= since;
    // 还没放出来 / 还在生成队列里（DrainSpawns 每帧只放几个）的人不算死：缺演员 = 活着、没开火。
    const Alive = (actor) => (actor ? !!actor.alive : true);
    const gunnerActor = this.Actor(SOUTH_MOUTH_GUNNER);
    const gunner = {
      alive: Alive(gunnerActor),
      suppressed: !!gunnerActor?.alive && gunnerActor.state === "suppressed",
      fired: Fired(gunnerActor),
      atPost: !!gunnerActor?.alive && Distance(gunnerActor.position, A.mouthEmbankment) <= R.tacticalArrivalM + 0.5,
    };
    const members = this.Members().map(({ actor }) => ({ alive: Alive(actor), fired: Fired(actor) }));
    const flankers = SOUTH_MOUTH_FLANKERS.map((id) => this.Actor(id)).map((actor) => ({
      alive: Alive(actor),
      suppressed: !!actor?.alive && actor.state === "suppressed",
      nearVillage: !!actor?.alive && Distance(actor.position, SOUTH_MOUTH_FLANK_WATCH) <= SOUTH_MOUTH_FLANK_WATCH.nearM,
    }));
    const litters = (r.column?.litters || []).filter((l) => l.visible && !l.evacuated)
      .map((l) => ({ alive: l.health > 0, progress: l.progress }));
    const leadProgress = Math.max(0, ...litters.filter((l) => l.alive).map((l) => l.progress));
    return { leadProgress, playerToHoldM: Distance(r.player.position, A.southMouthHold), gunner, members, flankers, litters };
  }
  Update(dt) {
    const r = this.r;
    if (r.flow.stage.id !== "South") return;
    const events = this.rules.Update(dt, this.Scene());
    for (const event of events) {
      if (event === "reached") {
        r.Record("southMouthReached");
        r.SpawnEncounter(SOUTH_MOUTH_ENCOUNTER);
        this.spawnedAt = r.ai?.time ?? r.time;
      } else if (event === "contact") {
        r.Record("mouthContact");
        r.Say("MouthContact");
        this.SetObjective(SOUTH_MOUTH_OBJECTIVES.mouth, "mouth");
        r.gengFamily?.OnMouthContact?.();
      } else if (event === "suppressed") {
        if (r.Record("mouthMgSuppressed")) r.Say("MouthGo");
      } else if (event === "flankSeen") {
        r.Say("MouthFlank");
      } else if (event === "flankResolved") {
        r.Record("mouthFlankResolved");
      } else if (event === "crossed") {
        r.Record("mouthCrossed", { litters: this.Scene().litters.length });
        this.SetObjective(SOUTH_MOUTH_OBJECTIVES.crossed, "crossed");
      }
    }
  }
  /** 担架队的里程上限（运行时每帧问）。 */
  MaxProgress(current = Infinity) { return this.rules.MaxProgress(current); }
  SetObjective(text, key) {
    if (this.objective === key) return;
    this.objective = key;
    this.r.Objective?.(Localize(ObjectiveTextId(key), text));
  }
  State() {
    return {
      ...this.rules.State(), spawnedAt: this.spawnedAt, objective: this.objective,
      members: this.Members().map(({ spec, actor }) => ({ id: spec.id, alive: !!actor?.alive, state: actor?.state ?? null,
        x: actor ? +actor.position.x.toFixed(1) : null, z: actor ? +actor.position.z.toFixed(1) : null })),
    };
  }
}
