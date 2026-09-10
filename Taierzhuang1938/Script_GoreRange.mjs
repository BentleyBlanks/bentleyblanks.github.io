// 断肢测试场的运行时（?gore=1）。只摆木桩兵、按按钮、读数；
// **断肢本身一行都不在这里** —— 判定在 Script_Dismemberment、视觉/物理在
// Script_CharacterGore，本模块只通过 `Debug.Gore`（docs/Data_Dismemberment.md §8.3）
// 这一个契约调用它，核心没就绪时整片场地照样能进、面板照样显示「未就绪」。
//
// 纪律同其它测试场：不许 Math.random（要抽签就用下面这台可复现的线性同余），
// 玩家可见文案一律进 Data_Text_Range 的 `range.gore.*`。
import * as THREE from "three";
import { WEAPONS } from "./Data_Weapons.mjs";
import { GoreLab } from "./Script_GoreLab.mjs";
import {
  GORE_RANGE_POSTS, GORE_CRATER, GORE_LIMB_BUTTONS, GORE_SLOW_MOTION,
} from "./Data_GoreRange.mjs";

/** 引爆按钮用的就是手榴弹本身的数（Data_Weapons.Grenade），不另写一套数值。 */
const GRENADE = WEAPONS.Grenade;

const TMP_A = new THREE.Vector3();
const TMP_B = new THREE.Vector3();
const TMP_DIR = new THREE.Vector3();

export class GoreRange {
  /**
   * host：装配层交进来的既有对象。
   *   ai / player / camera / scene / combat / battlefield / renderer
   *   Gore()    —— 取核心断肢系统的调试口（可能还没建好，返回 null）
   *   CanUse()  —— 现在能不能动手（菜单/过场/编辑器捕获时为 false）
   *   Focus()   —— 面板按钮点完把指针锁还给游戏
   */
  constructor(host) {
    this.host = host;
    this.posts = [];
    this.clock = 0;
    this.nextPaint = 0;
    this.frameMs = 0;
    this.lastStamp = 0;
    this.timeScale = 1;
    this.slowMotion = false;
    this.force = null;
    this.detonations = 0;
    this.severCommands = 0;
    /** 可复现的抽签（零 Math.random）：同一趟按同样次数按钮，抽到的肢体一样。 */
    this.rngState = 19380317;
    this.lastLive = 0;
    this.Seed();
    this.lab = new GoreLab(this);
    this.api = {
      State: () => this.State(),
      Reset: () => this.Reset(),
      Detonate: () => this.Detonate(),
      Target: () => this.TargetSummary(),
      SeverLimb: (limbId, postId = null) => this.SeverLimb(limbId, postId),
      SeverRandom: () => this.SeverRandom(),
      SetForce: (kind) => this.SetForce(kind),
      SetSlowMotion: (on) => this.SetSlowMotion(on),
      LimbPoint: (postId, limbId) => this.LimbPointOf(postId, limbId),
      Posts: () => this.posts.map((entry) => ({ ...entry.spec })),
    };
  }

  // -------------------------------------------------------------------------
  // 木桩兵
  // -------------------------------------------------------------------------

  Rng() {
    // 32 位线性同余（Numerical Recipes 那组常数），只用来抽肢体，不进任何玩法判定。
    this.rngState = (this.rngState * 1664525 + 1013904223) >>> 0;
    return this.rngState / 4294967296;
  }

  SpawnPost(spec) {
    const soldier = this.host.ai.Spawn("ija", spec.x, spec.z, {
      weapon: spec.weapon || "Type38", squadId: `Gore_${spec.id}`,
    });
    if (!soldier) return null;
    // dummy 让 Script_Ai 跳过 Think：木桩兵只站着挨打，不找掩体也不还击。
    soldier.dummy = true;
    soldier.order = "hold";
    soldier.holdZone = { id: `Gore_${spec.id}`, x: spec.x, z: spec.z, radius: 1.5 };
    const y = spec.standY || 0;
    soldier.position.set(spec.x, y, spec.z);
    soldier.body?.Teleport(spec.x, y, spec.z);
    soldier.goal.set(spec.x, 0, spec.z);
    soldier.yaw = spec.yaw;
    soldier.lookYaw = spec.yaw;
    return soldier;
  }

  Seed() {
    this.posts.length = 0;
    for (const spec of GORE_RANGE_POSTS) this.posts.push({ spec, soldier: this.SpawnPost(spec) });
  }

  /** 整场复位：断肢全部释放，木桩兵全部重立，玩家满血满弹。 */
  Reset() {
    const gore = this.host.Gore?.();
    // ai.Remove 内部会调 gore 的释放；这里先 Reset 一次把飞出去的肢块与血源收干净。
    gore?.Reset?.();
    for (const entry of this.posts) if (entry.soldier) this.host.ai.Remove(entry.soldier);
    this.Seed();
    this.force = null;
    gore?.SetForce?.(null);
    const player = this.host.player;
    if (player) { player.health = 100; player.bleeding = false; }
    this.PaintPanel();
    return this.State();
  }

  Post(id) { return this.posts.find((entry) => entry.spec.id === id) || null; }

  // -------------------------------------------------------------------------
  // 按钮
  // -------------------------------------------------------------------------

  /** 引爆炸坑：直接走正片的 Combat.Blast，数值照抄手榴弹。 */
  Detonate() {
    const crater = GORE_CRATER;
    const y = (this.host.battlefield?.GroundHeight(crater.x, crater.z) ?? 0) + 0.15;
    TMP_A.set(crater.x, y, crater.z);
    this.detonations += 1;
    this.host.combat.Blast(TMP_A, GRENADE.radiusM, GRENADE.damage, "grenade", "ija", false, null, "Grenade", null);
    this.PaintPanel();
    return this.State();
  }

  SetForce(kind) {
    this.force = kind || null;
    this.host.Gore?.()?.SetForce?.(this.force);
    this.PaintPanel();
    return this.force;
  }

  SetSlowMotion(on) {
    this.slowMotion = on ?? !this.slowMotion;
    this.timeScale = this.slowMotion ? GORE_SLOW_MOTION : 1;
    this.PaintPanel();
    return this.slowMotion;
  }

  /** 对准星指着的木桩卸一段。postId 给了就直接指名，测试脚本用得上。 */
  SeverLimb(limbId, postId = null) {
    const gore = this.host.Gore?.();
    const entry = postId ? this.Post(postId) : this.Target();
    if (!gore?.Sever || !entry?.soldier) return null;
    this.severCommands += 1;
    gore.Sever(entry.soldier.id, limbId);
    this.PaintPanel();
    return { post: entry.spec.id, limb: limbId };
  }

  SeverRandom() {
    const limb = GORE_LIMB_BUTTONS[Math.floor(this.Rng() * GORE_LIMB_BUTTONS.length)];
    return this.SeverLimb(limb);
  }

  // -------------------------------------------------------------------------
  // 准星目标
  // -------------------------------------------------------------------------

  /** 准星指着的那个木桩：视线夹角最小且在 12° 以内、60 m 以内的活人。 */
  Target() {
    const camera = this.host.camera;
    if (!camera) return null;
    camera.getWorldPosition(TMP_A);
    camera.getWorldDirection(TMP_DIR);
    let best = null, bestDot = Math.cos(12 * Math.PI / 180);
    for (const entry of this.posts) {
      const soldier = entry.soldier;
      if (!soldier?.alive) continue;
      TMP_B.set(soldier.position.x, soldier.position.y + 1.2, soldier.position.z).sub(TMP_A);
      const distance = TMP_B.length();
      if (distance > 60 || distance < 0.05) continue;
      const dot = TMP_B.divideScalar(distance).dot(TMP_DIR);
      if (dot > bestDot) { bestDot = dot; best = entry; }
    }
    return best;
  }

  TargetSummary() {
    const entry = this.Target();
    if (!entry?.soldier) return null;
    const soldier = entry.soldier;
    return {
      id: entry.spec.id, station: entry.spec.station, runtimeId: soldier.id,
      alive: soldier.alive, health: soldier.health,
      distance: Math.hypot(soldier.position.x - this.host.player.position.x,
        soldier.position.z - this.host.player.position.z),
    };
  }

  /** 某个木桩某一段肢体的世界中点。测试用它定 yaw/pitch，面板不用。 */
  LimbPointOf(postId, limbId) {
    const soldier = this.Post(postId)?.soldier;
    const shapes = soldier?.actor?.GetBoneHitboxes?.() || [];
    const shape = shapes.find((candidate) => candidate.id === limbId);
    if (!shape) return null;
    if (shape.start && shape.end) {
      return [(shape.start.x + shape.end.x) / 2, (shape.start.y + shape.end.y) / 2,
        (shape.start.z + shape.end.z) / 2];
    }
    return shape.center ? [shape.center.x, shape.center.y, shape.center.z] : null;
  }

  // -------------------------------------------------------------------------
  // 读数
  // -------------------------------------------------------------------------

  State() {
    const gore = this.host.Gore?.() || null;
    const goreState = gore?.State?.() || null;
    const severedBySoldier = new Map();
    for (const record of goreState?.severed || []) severedBySoldier.set(record.soldierId, record.limbs);
    const posts = this.posts.map(({ spec, soldier }) => ({
      id: spec.id, station: spec.station, x: spec.x, z: spec.z,
      ringM: spec.ringM ?? null, rangeM: spec.rangeM ?? null,
      runtimeId: soldier?.id ?? null, alive: !!soldier?.alive, health: soldier?.health ?? 0,
      severed: (soldier && severedBySoldier.get(soldier.id)) || [],
    }));
    const live = goreState?.budget?.live ?? goreState?.parts?.length ?? 0;
    const caps = posts.reduce((sum, post) => sum + post.severed.length, 0) + live;
    return {
      ready: !!goreState,
      enabled: goreState?.enabled ?? null,
      quality: goreState?.quality ?? null,
      posts,
      live,
      max: goreState?.budget?.max ?? 0,
      // 断面盖没有单独的计数口：身上每卸一段一个、飞出去的每块一个，合起来就是这个数。
      caps,
      spurts: goreState?.spurts ?? 0,
      parts: goreState?.parts || [],
      // 断肢多花的绘制批次 = 每块肢块 1 次 + 每个断面盖 1 次（Data_Dismemberment §7 那本账）。
      // **不读 renderer.info.render.calls**：three 每调一次 render 就 reset 一遍，
      // 帧末读到的只是最后那趟全屏后处理的 1 次，减出来的"增量"恒等于 0。
      drawCalls: live + caps, frameMs: this.frameMs,
      force: this.force, slowMotion: this.slowMotion, timeScale: this.timeScale,
      detonations: this.detonations, severCommands: this.severCommands,
      target: this.TargetSummary(),
      limbs: [...GORE_LIMB_BUTTONS],
    };
  }

  Update(dt) {
    this.clock += dt;
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
    if (this.lastStamp) this.frameMs = now - this.lastStamp;
    this.lastStamp = now;
    const live = this.host.Gore?.()?.State?.()?.budget?.live || 0;
    // 场上多出或少掉一块肢块就立刻重画一次：断肢可以从这个运行时之外发生
    // （Debug.Gore.Sever、真枪、爆炸），10 Hz 的定时重画会让出图那一帧的读数
    // 停在「肢块 0 / 断面 0」，看着像根本没断。
    if (live !== this.lastLive) { this.lastLive = live; this.PaintPanel(); this.nextPaint = this.clock + 0.1; }
    else if (this.clock >= this.nextPaint) { this.nextPaint = this.clock + 0.1; this.PaintPanel(); }
  }

  PaintPanel() { this.lab?.Update(this.State()); }

  Dispose() {
    this.lab?.Dispose();
    this.lab = null;
    this.posts.length = 0;
  }
}

export default GoreRange;
