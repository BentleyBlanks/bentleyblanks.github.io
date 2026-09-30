// ===========================================================================
// Script_FirstLevelFarBankCrowd.mjs —— 18 对岸的纯视觉人群（规则与状态，零 three，node 里可直接 import）
//
// 名册与摆位 Data_FirstLevelFarBankCrowd.mjs，数值 END_TUNING.farBank.crowd，口径 docs/Data_FirstLevelBridgeFarBank.md §10。
// 这批人不是 AI 兵：不进 ai.soldiers / r.enemies、不占 actorPool（ija:48）、打不中、不开真枪。
// 画：每帧由 AI 的远景层供人口（AiDirector.AddCrowdProvider）在 ActorCrowd.Begin / End 之间调 Draw，
// 一个人按他此刻的姿态挑姿势桶（站 / 跪 / 卧 / 跑步翻页），与 AI 兵共用同一批 BatchedMesh，不多一个 draw call。
// 枪口焰与曳光是事件（TakeShots），由宿主用 vfx 画：只挑上一帧在视锥里的人开火，按分档限频。
// 旗与刀是挂在特定人身上的小道具（Bearers），由表现层（Script_FirstLevelFarBankCrowdView）画。
//
// 时间线（由 FirstLevelFarBank 传事实进来）：
//   Start（BridgeCover 起）→ 第一拨从北面路堤跑下来；fire（bridgeFireBroken 或 fireFallbackS 秒）、withdraw（BridgeWithdraw 起）、
//   blast（起爆后 blastTrickleDelayS 秒，桥断了对岸仍源源不断涌来）各一拨；起爆时 duckM 以内站着的人趴一会儿再爬起来接着打。
//   instant（阶段跳转直接落在 BridgeWithdraw / NightMarch）：所有人直接在位。Retire（黑屏）全部撤掉。
// ===========================================================================
import { END_TUNING } from "./Data_Tuning_FirstLevelEnd.mjs";
import {
  BuildFarBankCrowdRoster, AssignCrowdWaves, CrowdGroundY, FAR_BANK_CROWD_SPAWN_Z, FAR_BANK_CROWD_AXIS_X,
} from "./Data_FirstLevelFarBankCrowd.mjs";

const C = END_TUNING.farBank.crowd;
const BLAST_CENTRE = Object.freeze({ x: -77, z: 148 });
const Clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const MUZZLE_H = Object.freeze({ stand: 1.45, kneel: 1.05, prone: 0.32 });

function Rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const STANCE = Object.freeze({ stand: 0, kneel: 1, prone: 2 });

export class FarBankCrowd {
  /**
   * @param {{ ground:(x:number,z:number)=>number, targets:{west:object[], east:object[]}, seed?:number }} deps
   *   ground = 地形高度（桥面由本类按 CrowdGroundY 换成桥面高度）；targets = 枪口焰 / 曳光朝哪打（南岸授权点，x/z/h/r）。
   */
  constructor(deps) {
    this.deps = deps;
    this.terrain = deps.ground || (() => 0);
    this.targets = deps.targets || { west: [], east: [] };
    this.seed = deps.seed ?? 0x18B2B;
    this.Reset();
  }
  Ground(x, z) { return CrowdGroundY(x, z, this.terrain); }

  Reset() {
    const rnd = this.rnd = Rng(this.seed ^ 0xA5);
    this.roster = AssignCrowdWaves(BuildFarBankCrowdRoster(this.seed), C.waves);
    this.units = this.roster.map((spec) => {
      const path = [spec.spawn ?? { x: FAR_BANK_CROWD_AXIS_X + spec.lane, z: FAR_BANK_CROWD_SPAWN_Z }, ...spec.route];
      const cum = [0];
      for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
      return { spec, id: spec.id, kind: spec.kind, pose: spec.pose, wave: spec.wave, flag: spec.flag, sword: spec.sword, pace: spec.pace, scale: spec.scale,
        mode: "wait", startT: Infinity, path, cum, len: cum[cum.length - 1], seg: 0, travel: 0, s: 0,
        speed: C.runMps + (rnd() - 0.5) * 2 * C.runJitterMps, phaseOff: rnd(), x: path[0].x, y: 0, z: path[0].z, yaw: Math.PI,
        home: { x: spec.post.x, z: spec.post.z }, goal: null, nextPaceT: 0, duckUntil: 0, seen: false, fireAt: 0 };
    });
    this.byId = new Map(this.units.map((u) => [u.id, u]));
    this.t = 0; this.active = false; this.retired = false; this.instant = false;
    this.waveAt = {}; this.blastAt = null; this.shots = []; this.flashAcc = 0; this.tier = "contact";
    this.counts = { flashes: 0, arrived: 0, ducked: 0 };
  }
  Retire() { this.active = false; this.retired = true; for (const u of this.units) u.mode = "wait"; this.shots.length = 0; }

  // -------------------------------------------------------------------------
  // 宿主口
  // -------------------------------------------------------------------------
  /** BridgeCover / BridgeWithdraw 起：instant = 阶段跳转直接落在后面的步骤，所有人直接在位。 */
  Start(instant = false) {
    if (this.active || this.retired) return;
    this.active = true; this.instant = instant;
    if (instant) { for (const u of this.units) this.PlaceAtPost(u); return; }
    this.TriggerWave("cover");
  }
  TriggerWave(id) {
    if (this.waveAt[id] != null) return;
    this.waveAt[id] = this.t;
    const gap = C.waves.find((w) => w.id === id)?.gapS ?? 0.6;
    for (const u of this.units) if (u.wave === id && u.mode === "wait") u.startT = this.t + u.spec.order * gap * (0.8 + this.rnd() * 0.4);
  }
  OnBridgeBlast() {
    if (this.blastAt != null || !this.active) return;
    this.blastAt = this.t;
    for (const u of this.units) {
      if (u.mode !== "hold" && u.mode !== "pace") continue;
      if (Math.hypot(u.x - BLAST_CENTRE.x, u.z - BLAST_CENTRE.z) > C.duckM) continue;
      u.mode = "duck"; u.duckUntil = this.t + 0.25 + C.duckS + this.rnd() * C.duckJitterS; this.counts.ducked += 1;
    }
  }

  // -------------------------------------------------------------------------
  // 每帧
  // -------------------------------------------------------------------------
  /** ctx: { tier, fireBroken, withdraw }（宿主按事实给）。 */
  Update(dt, ctx = {}) {
    if (!this.active) return;
    this.t += dt;
    this.tier = ctx.tier || this.tier;
    if ((ctx.fireBroken || this.t >= C.fireFallbackS) && !this.instant) this.TriggerWave("fire");
    if (ctx.withdraw && !this.instant) this.TriggerWave("withdraw");
    if (this.blastAt != null && this.t >= this.blastAt + C.blastTrickleDelayS && !this.instant) this.TriggerWave("blast");
    for (const u of this.units) this.UpdateUnit(u, dt);
    this.UpdateFire(dt);
  }
  PlaceAtPost(u) {
    u.mode = "hold"; u.x = u.spec.post.x; u.z = u.spec.post.z; u.y = this.Ground(u.x, u.z); u.yaw = u.spec.post.yaw; u.home = { x: u.x, z: u.z };
    u.nextPaceT = this.t + C.pacePeriodS[0] + this.rnd() * (C.pacePeriodS[1] - C.pacePeriodS[0]);
  }
  UpdateUnit(u, dt) {
    if (u.mode === "wait") {
      if (this.t < u.startT) return;
      u.mode = "run"; u.s = 0; u.seg = 0;
    }
    if (u.mode === "run") return this.StepRun(u, dt);
    if (u.mode === "duck") { if (this.t >= u.duckUntil) u.mode = "hold"; return; }
    if (u.mode === "pace") return this.StepPace(u, dt);
    if (u.mode === "hold" && u.pace && this.t >= u.nextPaceT) {
      const a = this.rnd() * Math.PI * 2, r = C.paceRadiusM * (0.5 + this.rnd() * 0.5);
      u.goal = { x: u.spec.post.x + Math.cos(a) * r, z: u.spec.post.z + Math.sin(a) * r };
      u.mode = "pace";
    }
  }
  StepRun(u, dt) {
    const step = u.speed * dt;
    u.s += step; u.travel += step;
    if (u.s >= u.len) { this.counts.arrived += 1; this.PlaceAtPost(u); return; }
    while (u.seg < u.path.length - 2 && u.s >= u.cum[u.seg + 1]) u.seg += 1;
    const a = u.path[u.seg], b = u.path[u.seg + 1], L = u.cum[u.seg + 1] - u.cum[u.seg] || 1, k = Clamp((u.s - u.cum[u.seg]) / L, 0, 1);
    u.x = a.x + (b.x - a.x) * k; u.z = a.z + (b.z - a.z) * k;
    u.y = this.Ground(u.x, u.z);
    u.yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
  }
  StepPace(u, dt) {
    const dx = u.goal.x - u.x, dz = u.goal.z - u.z, d = Math.hypot(dx, dz), step = C.paceMps * dt;
    if (d <= step) {
      u.x = u.goal.x; u.z = u.goal.z; u.y = this.Ground(u.x, u.z); u.mode = "hold"; u.yaw = u.spec.post.yaw;
      u.nextPaceT = this.t + C.pacePeriodS[0] + this.rnd() * (C.pacePeriodS[1] - C.pacePeriodS[0]);
      return;
    }
    u.x += dx / d * step; u.z += dz / d * step; u.travel += step; u.y = this.Ground(u.x, u.z);
    u.yaw = Math.atan2(-dx, -dz);
  }

  // -------------------------------------------------------------------------
  // 开火（事件）：只挑上一帧在视锥里、站定的人
  // -------------------------------------------------------------------------
  UpdateFire(dt) {
    const hz = C.flashHz[this.tier] ?? 0;
    if (!(hz > 0)) { this.flashAcc = 0; return; }
    this.flashAcc = Math.min(3, this.flashAcc + hz * dt);
    if (this.flashAcc < 1) return;
    const pool = this.units.filter((u) => u.mode === "hold" && u.seen);
    while (this.flashAcc >= 1) {
      this.flashAcc -= 1;
      if (!pool.length) return;
      const u = pool[Math.floor(this.rnd() * pool.length)];
      const list = u.x < FAR_BANK_CROWD_AXIS_X ? this.targets.west : this.targets.east;
      if (!list.length) continue;
      const p = list[Math.floor(this.rnd() * list.length)];
      const to = { x: p.x + (this.rnd() - 0.5) * 2 * (p.r ?? 1.5), y: this.terrain(p.x, p.z) + (p.h ?? 0.4), z: p.z + (this.rnd() - 0.5) * 2 * (p.r ?? 1.5) };
      const h = MUZZLE_H[u.pose] ?? 1.4, fx = -Math.sin(u.yaw), fz = -Math.cos(u.yaw);
      const from = { x: u.x + fx * 0.75, y: u.y + h, z: u.z + fz * 0.75 };
      const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, L = Math.hypot(dx, dy, dz) || 1;
      this.shots.push({ id: u.id, from, dir: { x: dx / L, y: dy / L, z: dz / L }, to, impact: this.rnd() < C.impactChance, scale: C.flashScale });
      this.counts.flashes += 1;
    }
  }
  /** 宿主每帧取走这一拍攒下的枪口焰 / 曳光事件。 */
  TakeShots() { if (!this.shots.length) return this.shots; const out = this.shots; this.shots = []; return out; }

  // -------------------------------------------------------------------------
  // 画
  // -------------------------------------------------------------------------
  PoseOf(u) {
    if (u.mode === "run" || u.mode === "pace") {
      const speed = u.mode === "run" ? u.speed : C.paceMps;
      return { stance: 0, moveSpeed: 1, moveSpeedMps: speed, phase: (u.travel / C.strideM + u.phaseOff) % 1 };
    }
    if (u.mode === "duck") return { stance: 2 };
    return { stance: STANCE[u.pose] ?? 0 };
  }
  /** AiDirector 的远景层供人口：crowd.Push 一个人一次。view.visible(x, y, z, r) 是这一帧的视锥判定。 */
  Draw(crowd, view) {
    if (!this.active) return;
    const P = this._p || (this._p = { x: 0, y: 0, z: 0 });
    for (const u of this.units) {
      if (u.mode === "wait") { u.seen = false; continue; }
      u.seen = view.visible(u.x, u.y + 0.9, u.z, 1.7);
      if (!u.seen) continue;
      P.x = u.x; P.y = u.y; P.z = u.z;
      crowd.Push("ija", P, u.yaw, u.scale, 0, false, this.PoseOf(u));
    }
  }
  /** 举旗 / 举刀的人（表现层每帧读位置）。 */
  Bearers() { return this.units.filter((u) => (u.flag || u.sword) && u.mode !== "wait"); }

  State() {
    const by = (f) => this.units.filter(f).length;
    return {
      active: this.active, t: Number(this.t.toFixed(1)), total: this.units.length,
      onField: by((u) => u.mode !== "wait"), running: by((u) => u.mode === "run"), holding: by((u) => u.mode === "hold" || u.mode === "pace" || u.mode === "duck"),
      shore: by((u) => u.kind === "shore" && u.mode !== "wait"), slope: by((u) => u.kind === "slope" && u.mode !== "wait"), bridge: by((u) => u.kind === "bridge" && u.mode !== "wait"), reserve: by((u) => u.kind === "reserve" && u.mode !== "wait"),
      flags: by((u) => u.flag && u.mode !== "wait"), swords: by((u) => u.sword && u.mode !== "wait"),
      waves: { ...this.waveAt }, flashes: this.counts.flashes, arrived: this.counts.arrived, ducked: this.counts.ducked,
    };
  }
  Dispose() { this.Retire(); }
}
