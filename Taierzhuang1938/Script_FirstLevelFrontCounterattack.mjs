// ===========================================================================
// Script_FirstLevelFrontCounterattack.mjs —— 第一关 03–05「日军不会被打退」的那几拍（2026-10-12 03–11 重构，A 包）
//
// 口径：docs/Data_FirstLevel0311Refactor20261012Contract.md §3.1–3.3；数值 Data_Tuning_FirstLevelFront.FRONT_BATTLE_TUNING
// 的 counter 段与 Data_FirstLevelMissionFront 的几张表。纯规则部分（Gap* / Pick* / EscortsClear / NestFrontPicks）不认
// three，node 直接测（Script_FirstLevelFrontCounterattackTest）；运行时类只在 Script_FirstLevelMissionRuntime 留三行钩子。
//
//   03  去程支沟里掷弹筒落弹（SapShells）；夺点后的撤退窗口双条件（GapWindow：gapRushRepelled && gapFireSuppressed，
//       窗口会关）；第一批过口时 guard 2 中弹被拖（FirstBatchWound）；夺点 40 s 后掷弹筒找准阵位（NestShells）。
//   04  车到 Pressure 看得见缺口：guard 7 脱离保护冲缺口，被车体机枪打死在口子正中（GapGuard，尸体留着）；玩家退到
//       后墙后 3–4 名日军翻进阵位前半边隔院对打（NestFront）。
//   05  玩家上攻击支路：渗透组放行（SapInfiltration，MISSION_TACTICS 按事实走）；炸哑后车组弃车跑向 Bend（TankCrew）；
//       跟车步兵退离缺口才解封（EscortsWithdrawn）；最后两人过缺口经过尸体时拽一把（FrontBattle 读 BodyTug）。
// 谁动谁的腿：守军的腿仍归 FirstLevelFrontBattle.UpdateGuards（这里只给它写 g.sacrifice / g.woundedAt / g.tugUntil 三个
// 旗子）；日军的腿归 AI / 压力表（这里只下 Defend、改一次 missionAssault）；车归 TankRuntime。
// ===========================================================================
import { FRONT_SORTIE as S, FRONT_SPACE as Space, FRONT_TANK_PATH, FrontTankIndex } from "./Data_FirstLevelFrontRoute.mjs";
import { FRONT_BATTLE_TUNING as B } from "./Data_Tuning_FirstLevelFront.mjs";
import { MISSION_TUNING as R } from "./Data_Tuning_FirstLevel.mjs";
import { FRONT_SAP_SHELL_POINTS, FRONT_NEST_SHELL_AREA, FRONT_NEST_FRONT_POSTS, FRONT_NEST_FRONT_PULLBACK, FRONT_TANK_CREW, FRONT_ESCORT_WITHDRAWN, FRONT_FLANK_GROUP, FRONT_OFFICER } from "./Data_FirstLevelMissionFront.mjs";
import { MISSION_ENCOUNTERS } from "./Data_FirstLevelMission.mjs";
import { MISSION_ROUTES as Routes } from "./Data_FirstLevelMissionLayout.mjs";
import { MissionRouteProjection } from "./Script_FirstLevelMissionColumn.mjs";
import { SUPPORT } from "./Data_Battle.mjs";

const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const C = () => B.counter;

// ------------------------------------------------------------------ 纯规则
/**
 * 撤退窗口（契约 §3.1）。attackers = [{alive, position, mode}]（跃进组 + 侧翼组，mode 是 missionAssault.mode 或 null）；
 * gunners = [{alive, suppression}]（对缺口开火的两挺轻机枪）；state 记每挺枪压住了多久（{suppressedSince: Map}）。
 *   rushRepelled   缺口 gapRadiusM 内没有活着的进攻兵，且活着的进攻兵都不在冲刺（rush / charge）—— 缩在自己的掩体行上
 *   fireSuppressed 至少一挺枪死了或压制值 ≥ suppressLevel 连续 ≥ suppressS（机枪再抬头就假：窗口会关）
 */
export function GapWindow({ attackers = [], gunners = [], gap = S.gap, now = 0, state }, T = C()) {
  state.suppressedSince ??= new Map();
  const live = attackers.filter((a) => a.alive);
  // Nobody alive inside the gap radius, and nobody rushing/charging inside gapRushCloseM (a bound between covers 20 m out
  // is not an attack on the gap; the first drive had the window flutter every 1.5 s on those).
  const rushRepelled = live.every((a) => { const d = Distance(a.position, gap); return d > T.gapRadiusM && !(d <= (T.gapRushCloseM ?? 2 * T.gapRadiusM) && ["rush", "charge"].includes(a.mode)); });
  let fireSuppressed = false;
  gunners.forEach((g, i) => {
    const held = !g.alive || (g.suppression || 0) >= T.suppressLevel;
    if (!held) { state.suppressedSince.delete(i); return; }
    if (!state.suppressedSince.has(i)) state.suppressedSince.set(i, now);
    if (now - state.suppressedSince.get(i) >= T.suppressS) fireSuppressed = true;
  });
  // No gunner at all (a fixture, or both removed by a checkpoint): nothing fires on the gap.
  if (!gunners.length) fireSuppressed = true;
  return { rushRepelled, fireSuppressed, open: rushRepelled && fireSuppressed };
}
/** The first sap-shell point that is >= clearM from the player and every squad member (null: none this round). */
export function PickSapShellPoint(points, player, squad, clearM, rng = Math.random) {
  const ok = points.filter((p) => Distance(p, player) >= clearM && squad.every((s) => Distance(p, s) >= clearM));
  return ok.length ? ok[Math.floor(rng() * ok.length) % ok.length] : null;
}
/** A point inside the nest's yard box >= clearM from the player and >= squadClearM from the squad (tries draws). */
export function PickNestShellPoint(area, player, squad, clearM, squadClearM, rng = Math.random, tries = 12) {
  for (let i = 0; i < tries; i++) {
    const p = { x: area.minX + rng() * (area.maxX - area.minX), z: area.minZ + rng() * (area.maxZ - area.minZ) };
    if (Distance(p, player) < clearM || squad.some((s) => Distance(p, s) < squadClearM)) continue;
    return p;
  }
  return null;
}
/** escorts = [{alive, position}]: all dead or >= rule.gapClearM from the gap, or the retreat has run rule.maxS since `sinceS`. */
export function EscortsClear(escorts, gap, sinceS, now, rule = FRONT_ESCORT_WITHDRAWN) {
  const live = escorts.filter((e) => e.alive);
  if (live.every((e) => Distance(e.position, gap) >= rule.gapClearM)) return { clear: true, why: live.length ? "withdrawn" : "dead" };
  if (now - sinceS >= rule.maxS) return { clear: true, why: "timeout" };
  return { clear: false, why: "near" };
}
/** Up to n live candidates for the nest's front half: flank survivors first, then the rest, nearest the nest first. */
export function NestFrontPicks(candidates, n, nest = S.nest) {
  const live = candidates.filter((c) => c.alive);
  const score = (c) => (c.flank ? 0 : 1000) + Distance(c.position, nest);
  return live.sort((a, b) => score(a) - score(b)).slice(0, n);
}
/**
 * A discharger round's light hurt on the player (2026-10-12 second round): hp by distance from the burst, shellHurtMaxHp at
 * <= shellHurtFullM, falling to shellHurtMinHp at shellHurtM, nothing beyond. No wound (Player.TakeHit opens one on any
 * damage, nine rounds bled the first drives out) and never the killing blow (floor shellHurtFloorHp).
 */
export function LightShellHurt(distance, T = C()) {
  if (!(distance <= T.shellHurtM)) return 0;
  if (distance <= T.shellHurtFullM) return T.shellHurtMaxHp;
  const t = (distance - T.shellHurtFullM) / Math.max(1e-6, T.shellHurtM - T.shellHurtFullM);
  return T.shellHurtMaxHp + (T.shellHurtMinHp - T.shellHurtMaxHp) * t;
}
/**
 * Why the men in the nest's front half pull back now, or null: the tank at Block - only once the fight has stood
 * minFightS since the first man climbed in - half of them down, or the hold (holdS) run out.
 */
export function NestFrontPullBackWhy({ tankAtBlock, dead, total, sinceArrivalS }, T = C()) {
  if (dead * 2 >= total) return "halfDown";
  if (sinceArrivalS >= T.nestFrontHoldS) return "held";
  if (tankAtBlock && sinceArrivalS >= T.nestFrontMinFightS) return "tankAtBlock";
  return null;
}
/**
 * nestFrontCleared (04 gate): every man who climbed in is dead, or back north of clearZ (the berm), or - once the
 * pull-back was ordered - at the pull-back point (within pullbackM) or out of the compound and awayM from the nest.
 */
export function NestFrontCleared(men, clearZ, { pulledBack = false, pullback = FRONT_NEST_FRONT_PULLBACK, pullbackM = 4, awayM = 10, nest = S.nest } = {}) {
  return men.every((a) => {
    if (!a.alive || a.position.z <= clearZ) return true;
    if (!pulledBack) return false;
    if (Distance(a.position, pullback) <= pullbackM) return true;
    const inYard = a.position.x > 24.4 && a.position.x < 33 && a.position.z < -145.6 && a.position.z > -157.2;
    return !inYard && Distance(a.position, nest) >= awayM;
  });
}
/** Player progress along the attack branch past attackRoute[index] (sapInfiltrationStarted when >= 1 m past [1]). */
export function OnAttackBranch(player, index = 1, route = S.attackRoute) {
  const { progress, distance } = MissionRouteProjection(route, player);
  const at = MissionRouteProjection(route, route[index]).progress;
  return distance <= C().branchCorridorM && progress >= at + 1;
}

// ------------------------------------------------------------------ 运行时
export class FirstLevelFrontCounterattack {
  constructor(runtime) {
    this.r = runtime;
    this.window = { rushRepelled: false, fireSuppressed: false, open: false, openedAt: null, closedAt: null, state: {} };
    this.sapShell = { nextAt: null, fired: 0 };
    this.nestShell = { nextAt: null, fired: 0 };
    this.gapGuard = null;
    this.nestFront = null;
    this.crewSpawned = false;
    this.escortReleaseAt = null;
    this.log = [];
  }
  get Active() { return ["Support", "MachineGun", "Tank"].includes(this.r.flow.stage.id); }
  Note(kind, detail = {}) { this.log.push({ at: +this.r.time.toFixed(1), kind, ...detail }); if (this.log.length > 48) this.log.shift(); }
  Enter(stageId) {
    if (stageId === "Support") { this.sapShell.nextAt = this.r.time + C().sapShellFirstS; }
  }
  Squad() { return (this.r.squad || []).filter((a) => a?.alive).map((a) => a.position); }
  /** The men whose rush the gap window watches: the six bounders and the flank group (alive, with their assault mode). */
  Attackers() {
    const r = this.r, ids = [...B.assaultIds, ...FRONT_FLANK_GROUP.map((s) => s.id), FRONT_OFFICER.id];
    return ids.map((id) => r.enemies.get(id)).filter(Boolean).map((a) => ({ alive: !!a.alive, position: a.position, mode: a.missionAssault?.mode ?? (a.state === "charge" ? "charge" : null) }));
  }
  Gunners() {
    return C().gapGunners.map((id) => this.r.enemies.get(id)).filter(Boolean).map((a) => ({ alive: !!a.alive, suppression: a.suppression || 0 }));
  }
  Update(dt) {
    if (!this.Active) return;
    const r = this.r, stage = r.flow.stage.id;
    if (stage === "Support" && !r.Has("rightNestCaptured")) this.SapShells();
    if (r.Has("rightNestCaptured")) this.UpdateWindow();
    // The discharger works the nest from the capture until the tank and its infantry are on (tankAtBendExit): 04 has its own pressure.
    // The discharger works the nest through 03 only (the second-round 03->07 drive: 9 rounds over 100 s, four hits for
    // 57 hp on a man sitting on the gun, then 04's tank fire finished him); 04 has its own pressure.
    if (stage === "Support" && r.Has("rightNestCaptured")) this.NestShells();
    if (stage === "MachineGun" || stage === "Tank") this.GapGuard();
    if (stage === "MachineGun" && r.Has("rightRearReached")) this.NestFront();
    if (stage === "Tank") { this.SapInfiltration(); this.TankCrew(); this.EscortsWithdrawn(); }
  }
  /** 03 going up: a knee-mortar round on the sap floor every sapShellEveryS while the player is in the support sap. */
  SapShells() {
    const r = this.r, T = C();
    if (this.sapShell.fired >= T.sapShellMax || r.time < this.sapShell.nextAt) return;
    const onSap = MissionRouteProjection(Routes.support, r.player.position);
    // Only while he is really in the sap (past the support junction, short of the right low trench).
    if (onSap.distance > 4 || r.player.position.z > -112 || r.player.position.x > 0) return;
    const at = PickSapShellPoint(FRONT_SAP_SHELL_POINTS, r.player.position, this.Squad(), T.sapShellPlayerClearM);
    this.sapShell.nextAt = r.time + T.sapShellEveryS[0] + Math.random() * (T.sapShellEveryS[1] - T.sapShellEveryS[0]);
    if (!at) return;
    this.FireLauncher(at, T.sapShellHurtScale);
    this.sapShell.fired++; this.Note("sapShell", { x: at.x, z: at.z });
  }
  /** After the capture: the discharger finds the nest (contract §3.1), never within nestShellPlayerClearM of the player. */
  NestShells() {
    const r = this.r, T = C();
    this.nestShell.nextAt ??= r.time + T.nestShellFirstS;
    if (this.nestShell.fired >= T.nestShellMax || r.time < this.nestShell.nextAt) return;
    this.nestShell.nextAt = r.time + T.nestShellEveryS[0] + Math.random() * (T.nestShellEveryS[1] - T.nestShellEveryS[0]);
    const at = PickNestShellPoint(FRONT_NEST_SHELL_AREA, r.player.position, this.Squad(), T.nestShellPlayerClearM, T.nestShellSquadClearM);
    if (!at) return;
    this.FireLauncher(at, T.nestShellHurtScale);
    this.nestShell.fired++; this.Note("nestShell", { x: at.x, z: at.z });
  }
  /** A Type 89 discharger round: comes down steeply from the north-east, whistles for launcherFlightS, bursts on the ground. */
  FireLauncher(at, damage) {
    const r = this.r, spec = SUPPORT.ija.find((s) => s.id === "launcher"), T = C();
    if (!r.combat?.FireShell || !r.Point) return;
    const from = r.Point({ x: at.x + 18, z: at.z - 26 }, 34), target = r.Point(at, 0.02);
    // feedbackOnly: burst, whistle and concussion without Blast (which would wound and could kill); the hurt is our own,
    // light and bloodless (LightShellHurt / HurtPlayer) - the round still makes him move.
    r.combat.FireShell(from, target, { flight: T.launcherFlightS, kind: "Shell75", radius: spec?.radius ?? 5, damage: 0, incoming: true, report: false, feedbackOnly: true,
      OnImpact: (impact) => this.HurtPlayer(impact, damage) });
  }
  /** The light hurt of a round that burst at `impact`: scale 1 = the full table, 0 = none (the sap rounds are ambient). */
  HurtPlayer(impact, scale) {
    const r = this.r, p = r.player, T = C();
    if (!(scale > 0) || !p?.alive || !impact) return;
    const d = Math.hypot(impact.x - p.position.x, (impact.y ?? p.position.y) - p.position.y, impact.z - p.position.z);
    const hp = LightShellHurt(d, T) * scale;
    if (!(hp > 0)) return;
    const before = p.health;
    p.health = Math.max(T.shellHurtFloorHp, p.health - hp);
    p.bandageRegenTo = 0;
    p.Suppress?.(T.shellHurtSuppression, "blast");
    p.hitFlash = Math.min(1, Math.max(p.hitFlash || 0, .25 + hp / 60));
    p.RecordIncomingFire?.(impact, "hit");
    p.PushHitEvent?.({ kind: "hurt", part: "torso", damage: before - p.health, severity: Math.min(1, hp / 40), blast: true });
    this.Note("shellHurt", { hp: +(before - p.health).toFixed(1), d: +d.toFixed(1) });
  }
  /** 03 gap window (contract §3.1): live every frame; the latched facts are recorded the first time each is true. */
  UpdateWindow() {
    const r = this.r;
    const w = GapWindow({ attackers: this.Attackers(), gunners: this.Gunners(), now: r.time, state: this.window.state });
    const was = this.window.open;
    Object.assign(this.window, w);
    if (w.rushRepelled) r.Record("gapRushRepelled");
    if (w.fireSuppressed) r.Record("gapFireSuppressed");
    if (w.open && !was) { this.window.openedAt = r.time; this.Note("windowOpen"); }
    if (!w.open && was) { this.window.closedAt = r.time; this.Note("windowClose", { rush: w.rushRepelled, fire: w.fireSuppressed }); }
  }
  /**
   * Is the gap open for the next first-batch man to leave cover? The live window, or - so a window that never reopens
   * cannot hold the batch for good - the window has been shut for windowStaleS since it first opened (frontRifleDefense).
   */
  WindowOpenFor(batchStartedAt) {
    if (this.window.open) return true;
    // The batch was released without the window ever opening (FrontBattle's assaultWindowFallbackS: the attack broke off
    // on its own): there is no live window to wait for - go. The second drive had the men wait 45 s more here.
    if (this.window.openedAt == null) return true;
    const since = this.window.closedAt ?? batchStartedAt ?? this.r.time;
    return this.r.time - since >= C().windowStaleS;
  }
  /**
   * 04 (contract §3.2): the tank reaches Pressure (it can see the gap): guard `gapSacrificeGuard` of the second batch leaves
   * his protection, runs for the gap, and the hull MG kills him in it. The body stays; the batch goes on with two.
   */
  GapGuard() {
    const r = this.r, T = C(), g = r.guards?.[T.gapSacrificeGuard];
    if (!g?.actor) return;
    if (!this.gapGuard) {
      const brain = r.tankRuntime?.brain, pressure = FrontTankIndex("Pressure");
      const tankSees = (brain && brain.reached >= pressure) || r.Has("tankPositionPressured");
      if (!tankSees || !g.actor.alive || g.safe) return;
      g.sacrifice = true; g.actor.missionUntargetable = false; g.actor.scriptedNoncombatant = false; g.actor.scriptEssential = false;
      this.gapGuard = { startedAt: r.time, shots: 0, nextShot: 0 };
      this.Note("gapGuardRun", { id: g.actor.missionId || g.actor.id });
      return;
    }
    const a = g.actor, st = this.gapGuard;
    if (!a.alive) {
      if (!st.dead) { st.dead = true; this.gapBody = { x: a.position.x, z: a.position.z }; r.Record("gapGuardKilled", { x: +a.position.x.toFixed(1), z: +a.position.z.toFixed(1) }); r.Say("GapGuardDown"); }
      return;
    }
    const inGap = Distance(a.position, S.gap) <= T.gapKillM;
    if (!inGap && r.time - st.startedAt < T.gapRunMaxS) { r.ai.SetStance(a, 0, .5, true); r.MoveActor(a, S.gap, R.assaultRushMps); return; }
    // In the gap (or out of time): the hull MG walks a burst onto him, the last rounds kill him.
    if (r.time < st.nextShot) return;
    st.nextShot = r.time + .14; st.shots++;
    const t = r.tank, from = r.view?.TankMuzzle?.(t, "mgMuzzle") || r.Point({ x: t.x, z: t.z }, 1.6), head = r.Point(a.position, .95);
    const dir = { x: head.x - from.x, y: head.y - from.y, z: head.z - from.z };
    if (st.shots < T.gapKillShots) { r.FireVehicleBullet?.(from, head.clone().sub(from).normalize(), { weaponId: "Type11", damageScale: 0, sourceCollider: r.view?.tankCollider, gunCue: "tankMg", gunOpts: { burst: 1, weaponClass: "mg" } }); return; }
    const d = Math.hypot(dir.x, dir.y, dir.z) || 1;
    a.TakeHit(400, "torso", from.clone().sub(head).normalize().negate(), { kind: "hmg", from, point: head, weaponId: "Type11" });
  }
  /** 04 (contract §3.2): after the player has fallen back to the rear wall, 3–4 Japanese climb into the nest's front half. */
  NestFront() {
    const r = this.r, T = C();
    if (!this.nestFront) {
      const flank = [...FRONT_FLANK_GROUP.map((s) => s.id), FRONT_OFFICER.id].map((id) => r.enemies.get(id)).filter(Boolean)
        .map((a) => ({ a, alive: !!a.alive, position: a.position, flank: true }));
      const reserve = (MISSION_ENCOUNTERS.frontReserve || []).filter((s) => s.entry === "NorthWestPlateau").map((s) => r.enemies.get(s.id)).filter(Boolean)
        .map((a) => ({ a, alive: !!a.alive, position: a.position, flank: false }));
      const picks = NestFrontPicks([...flank, ...reserve], FRONT_NEST_FRONT_POSTS.length).map((p) => p.a);
      this.nestFront = { startedAt: r.time, men: picks, arrived: false };
      picks.forEach((a, i) => {
        const post = FRONT_NEST_FRONT_POSTS[i];
        a.missionAssault = null; a.missionFrontStandby = false; a.scriptedNoncombatant = false; a.missionDormant = false;
        a.tacticalRadiusM = T.nestFrontRadiusM; a.contactRadiusBaseM = T.nestFrontRadiusM;
        r.Defend(a, post, T.nestFrontRadiusM, R.defendCoverSlackM); r.ai.SetStance(a, 1, .5, true);
      });
      this.Note("nestFront", { men: picks.map((a) => a.missionId) });
      return;
    }
    const st = this.nestFront;
    if (!st.arrived) {
      // Nobody left to climb in (every candidate dead before the retreat): the beat is void, 04 must not wait for it.
      if (!st.men.length || st.men.every((a) => !a.alive)) { st.arrived = true; st.clearedAt = r.time; r.Record("nestFrontContested", { void: true }); r.Record("nestFrontCleared", { void: true }); return; }
      if (st.men.some((a) => a.alive && a.position.x > 24.4 && a.position.x < 33 && a.position.z < -151 && a.position.z > -157.2)) {
        st.arrived = true; st.arrivedAt = r.time; r.Record("nestFrontContested", { men: st.men.filter((a) => a.alive).map((a) => a.missionId) });
      }
      return;
    }
    // The pull-back (third round, things that really happen): the tank reaches Block (tankBlocksExit / tank.atBlock -
    // the yard is now the tank's to seal, the infantry pulls out), or half of them are down, or nestFrontHoldS has run
    // since the first man climbed in. The integration drive (INT1) had two men sit in the yard for 265 s: a Defend
    // order alone never moved them out of a fight, so the way out is walked with MoveActor every frame (the guards'
    // mover), vault and detour allowed (tacticalRadiusM > 0), until they are out and clear.
    if (!st.pulledBack && st.clearedAt == null) {
      const alive = st.men.filter((a) => a.alive).length, dead = st.men.length - alive;
      const why = NestFrontPullBackWhy({ tankAtBlock: !!(r.Has("tankBlocksExit") || r.tank?.atBlock), dead, total: st.men.length, sinceArrivalS: r.time - (st.arrivedAt ?? st.startedAt) }, T);
      if (why) {
        st.pulledBack = true; st.pulledBackAt = r.time;
        for (const a of st.men) if (a.alive) { a.missionAssault = null; a.holdZone = null; a.tacticalRadiusM = 3; a.contactRadiusBaseM = 3; a.scriptDefensive = false; }
        this.Note("nestFrontPullBack", { why, alive });
      }
    }
    if (st.pulledBack) for (const a of st.men) {
      if (!a.alive || a.nestFrontBack) continue;
      if (Distance(a.position, FRONT_NEST_FRONT_PULLBACK) <= 2) { a.nestFrontBack = true; r.Defend(a, FRONT_NEST_FRONT_PULLBACK, 2, R.defendCoverSlackM); continue; }
      r.ai.SetStance(a, 0, .5, true); r.MoveActor(a, FRONT_NEST_FRONT_PULLBACK, R.assaultRushMps);
    }
    // 04 gate (second round): the fight for the front half is over when every man who climbed in is dead, back north of
    // the berm (nestFrontClearZ) or, pulled back, out of the yard and away; BundleOrder waits for it plus a beat.
    if (st.clearedAt == null && NestFrontCleared(st.men, T.nestFrontClearZ, { pulledBack: !!st.pulledBack, pullbackM: T.nestFrontPullbackClearM, awayM: T.nestFrontAwayM })) {
      st.clearedAt = r.time;
      r.Record("nestFrontCleared", { dead: st.men.filter((a) => !a.alive).length, back: st.men.filter((a) => a.alive).length, pulledBack: !!st.pulledBack });
    }
  }
  /** When the nest's front half was cleared (nestFrontCleared), or null. */
  get NestFrontClearedAt() { return this.nestFront?.clearedAt ?? null; }
  /** 05: the player is up the attack branch -> the sap infiltrators go (MISSION_TACTICS fact). */
  SapInfiltration() {
    const r = this.r;
    if (r.Has("sapInfiltrationStarted")) return;
    if (OnAttackBranch(r.player.position)) r.Record("sapInfiltrationStarted", { x: +r.player.position.x.toFixed(1), z: +r.player.position.z.toFixed(1) });
  }
  /** 05: the tank is Disabled -> two crewmen bail out at its sides and run for Bend (their MISSION_TACTICS fact). */
  TankCrew() {
    const r = this.r;
    if (this.crewSpawned || !r.Has("tankFireDisabled") || typeof r.SpawnEncounterActor !== "function") return;
    this.crewSpawned = true;
    const t = r.tank, yaw = t.hullYaw ?? Math.PI, rx = Math.cos(yaw), rz = -Math.sin(yaw);
    for (const spec of FRONT_TANK_CREW) {
      const side = spec.hatchSide || 1, x = t.x + rx * side * 2.3, z = t.z + rz * side * 2.3;
      const actor = r.SpawnEncounterActor("tankCrew", { ...spec, x, z, weapon: "Type38", bayonet: false });
      if (actor) { actor.grenades = 0; r.ai.SetStance(actor, 0, .5, true); }
    }
    r.spawned?.add?.("tankCrew");
    r.Record("tankCrewBailed", { x: +t.x.toFixed(1), z: +t.z.toFixed(1) });
    this.Note("tankCrew");
  }
  /** 05: the gap is open only once the escorts have left it (contract §3.3). */
  EscortsWithdrawn() {
    const r = this.r;
    if (r.Has("escortsWithdrawn") || !r.Has("tankFireDisabled")) return;
    this.escortReleaseAt ??= r.time;
    const escorts = MISSION_ENCOUNTERS.tank.map((s) => r.enemies.get(s.id)).filter(Boolean).map((a) => ({ alive: !!a.alive, position: a.position }));
    const { clear, why } = EscortsClear(escorts, S.gap, this.escortReleaseAt, r.time);
    if (clear) r.Record("escortsWithdrawn", { why, alive: escorts.filter((e) => e.alive).length });
  }
  /** Where the sacrificed guard fell (the body the last two step past), or null. */
  get GapBody() { return this.gapBody || null; }
  State() {
    return { window: { open: this.window.open, rushRepelled: this.window.rushRepelled, fireSuppressed: this.window.fireSuppressed, openedAt: this.window.openedAt, closedAt: this.window.closedAt },
      sapShells: this.sapShell.fired, nestShells: this.nestShell.fired, gapGuard: this.gapGuard ? { shots: this.gapGuard.shots, dead: !!this.gapGuard.dead } : null,
      nestFront: this.nestFront ? { men: this.nestFront.men.map((a) => ({ id: a.missionId, alive: !!a.alive, x: +a.position.x.toFixed(1), z: +a.position.z.toFixed(1), back: !!a.nestFrontBack })), arrived: this.nestFront.arrived, arrivedAt: this.nestFront.arrivedAt ?? null, pulledBack: !!this.nestFront.pulledBack, pulledBackAt: this.nestFront.pulledBackAt ?? null, clearedAt: this.nestFront.clearedAt ?? null } : null,
      crewSpawned: this.crewSpawned, gapBody: this.gapBody || null, log: this.log.slice(-16) };
  }
  Dispose() {}
}
void Space; void FRONT_TANK_PATH;
