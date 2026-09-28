// ===========================================================================
// Script_OpeningBlastFx.mjs —— 01 近爆的定向喷土（Set 包，契约
// docs/Data_FirstLevelStoryboard0103Contract.md §4.5）。
//
// vfx.Explosion 的碎块与烟全是各向同性的；SB02 要的是「从洞口一侧朝洞里、朝镜头喷」：
// 一片湿泥甩过来（带运动拖尾）、十几块不规则的土块、劈开的木片与碎渣、贴着泥浆的细尘团，
// 然后扬尘把洞口填满。
//
// 2026-09-28（3A 迭代 B5）：泥浆不再是烟团池里的不透明近黑圆盘（画面上一个个「黑圆片」），
// 改走 Script_Vfx 的泥浆池（pools.mud：沿瞬时速度拉伸、受光、软边的湿泥团）；土块 / 木片 / 碎渣
// 走不规则几何的碎块池（vfx.SpawnChunk：二十面体土块、削尖的木片），不再是方块。
// 这几只池都在 VfxSystem 里常驻、空着就藏；泥浆池是新着色器，Warm() 在布景装载时生一颗
// 看不见的粒子，让关卡预热真画它一次（首次触发不在近爆那一帧现编）。
// 宿主没有这些池（纯 node 测试的假 vfx、旧宿主）时退回烟团池与方块池。
//
//   const fx = new OpeningBlastFx({ vfx });
//   fx.Warm(position);  // 布景装载时：泥浆池的 program 在预热里画一次
//   fx.DirectionalBlast(position, direction, { clods, splinters, grit, spray, mist, dust, seconds, ... });
//   fx.Update(dt);      // 每帧：按时间把一次喷发摊开（前 headS 秒喷 headShare，后面拖尾）
//   fx.Clear();         // 收走尚未喷完的发射器（已生出的粒子交给 vfx 自己的寿命）
//
// 默认参数与颜色来自 Data_OpeningSet0103.BLAST（SB02 那一喷）；调试/抓帧可以直接调。
// ===========================================================================
import * as THREE from "three";
import { ResetVfxSpawn } from "./Script_Vfx.mjs";
import { BLAST } from "./Data_OpeningSet0103.mjs";

/** sRGB hex → 线性三元组（粒子着色器在线性空间乘光，与 VFX_PALETTE 同口径）。 */
const Linear = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const COLOR = Object.fromEntries(Object.entries(BLAST.colors).map(([key, hex]) => [key, Linear(hex)]));
/** 一次喷发里的六种东西，Emit 按这个顺序摊。 */
export const BLAST_KINDS = Object.freeze(["clods", "splinters", "grit", "spray", "mist", "dust"]);

export class OpeningBlastFx {
  /** @param {{vfx: import("./Script_Vfx.mjs").VfxSystem}} host */
  constructor({ vfx }) {
    this.vfx = vfx;
    this.emitters = [];
    this.spawned = Object.fromEntries(BLAST_KINDS.map((kind) => [kind, 0]));
    this.fired = 0;
    this.warmed = 0;
  }

  /**
   * 预热：往泥浆池、两只碎块池各生一颗看不见的粒子（不透明度 0.003、几毫米、埋在地面以下），活 warmS 秒。
   * 关卡预热（Script_Main.WarmLevel）的强制出画 + 真帧会把泥浆池的新 program 画一次，之后 ClearParticles 清掉。
   * @returns {boolean} 有没有泥浆池可以预热
   */
  Warm(position, { warmS = 20 } = {}) {
    const vfx = this.vfx;
    if (!vfx?.pools?.mud) return false;
    const s = ResetVfxSpawn();
    s.x = position.x; s.y = position.y; s.z = position.z;
    s.life = warmS; s.sizeStart = 0.004; s.sizeEnd = 0.004; s.stretch = 0.01;
    s.opacity = 0.003; s.fadeIn = 0; s.drag = 5;
    s.colorA = COLOR.mudWet; s.colorB = COLOR.mudLight; s.seed = 0.5;
    vfx.pools.mud.Spawn(s, vfx.time);
    for (const kind of ["clod", "splinter"]) {
      vfx.SpawnChunk?.(kind, position.x, position.y - 0.4, position.z, 0, 0, 0, 0.002, 0.002, 0.002,
        COLOR.clodDark, warmS, position.y - 0.4, 0, 0);
    }
    this.warmed += 1;
    return true;
  }

  /**
   * 定向喷发。position 是喷口（世界坐标，y 取喷口中心高），direction 是喷射主方向（会归一化）。
   * opts：clods / splinters / grit / spray / mist / dust（个数）、seconds（整段时长）、spreadRad（锥半角）、
   * speed:{clods,splinters,grit,spray,mist,dust:[min,max]}、burst:{headS, headShare}、heightM（喷口上下展开）、
   * groundY（碎块落到哪一层；默认 position.y - 1）、
   * sprayDir（泥浆、碎渣、细尘团的主方向，默认同 direction）、dustAt / dustDir（扬尘的出生点与方向：默认同喷口、同主方向；
   * SB02 让扬尘在门洞里起、往洞里推）、clodSize / gritSize / mudSize:[min,max]（米）、
   * upBoost:{clods,splinters}（额外上抛，米/秒）、shutterS（泥浆拖尾的快门秒数）。
   * @returns {object|null} 发射器（Stats 用）；没有 vfx 时 null
   */
  DirectionalBlast(position, direction, opts = {}) {
    if (!this.vfx) return null;
    const o = {
      clods: BLAST.clods, splinters: BLAST.splinters, grit: BLAST.grit, spray: BLAST.spray, mist: BLAST.mist, dust: BLAST.dust,
      seconds: BLAST.seconds, spreadRad: BLAST.spreadRad, speed: BLAST.speed, burst: BLAST.burst,
      heightM: 0.5, groundY: position.y - 1, clodSize: BLAST.clodSize, gritSize: BLAST.gritSize, mudSize: BLAST.mudSize,
      upBoost: BLAST.upBoost, shutterS: BLAST.shutterS, ...opts,
    };
    o.speed = { ...BLAST.speed, ...(opts.speed || {}) };
    const axis = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();
    const V = (v) => (v ? new THREE.Vector3(v.x, v.y, v.z) : null);
    const sprayAxis = (V(o.sprayDir) || axis.clone()).normalize(), dustAxis = (V(o.dustDir) || axis.clone()).normalize();
    const dustAt = o.dustAt ? new THREE.Vector3(o.dustAt.x, o.dustAt.y ?? position.y, o.dustAt.z) : null;
    const emitter = { at: new THREE.Vector3(position.x, position.y, position.z), axis, sprayAxis, dustAxis, dustAt, o, age: 0,
      emitted: Object.fromEntries(BLAST_KINDS.map((kind) => [kind, 0])) };
    this.emitters.push(emitter);
    this.fired += 1;
    this.Emit(emitter);            // 第 0 帧就出第一口：不等下一帧
    return emitter;
  }

  Update(dt) {
    if (!this.emitters.length) return;
    for (const emitter of this.emitters) { emitter.age += Math.max(0, dt); this.Emit(emitter); }
    this.emitters = this.emitters.filter((e) => e.age < e.o.seconds + 1e-3);
  }

  Clear() { this.emitters.length = 0; }

  Stats() { return { active: this.emitters.length, fired: this.fired, warmed: this.warmed, spawned: { ...this.spawned } }; }

  /** 发射进度：前 headS 秒走完 headShare，余下线性拖到 seconds。 */
  static Share(age, o) {
    const { headS, headShare } = o.burst;
    if (age <= 0) return 0.08;                                       // 第一帧就要有东西扑出来
    if (age < headS) return Math.max(0.08, headShare * age / headS);
    return Math.min(1, headShare + (1 - headShare) * (age - headS) / Math.max(1e-3, o.seconds - headS));
  }

  Emit(emitter) {
    const o = emitter.o, share = OpeningBlastFx.Share(emitter.age, o);
    // 扬尘均匀摊满整段（洞口越来越浑），其余按喷发曲线。
    const lead = o.dustLead ?? 0.15, dustShare = Math.min(1, lead + (1 - lead) * emitter.age / Math.max(1e-3, o.seconds));
    for (const kind of BLAST_KINDS) {
      const want = Math.round((o[kind] || 0) * (kind === "dust" ? dustShare : share) * (this.vfx.spawnScale ?? 1));
      while (emitter.emitted[kind] < want) { this.SpawnOne(kind, emitter); emitter.emitted[kind] += 1; this.spawned[kind] += 1; }
    }
  }

  /** 一块碎块：有不规则碎块池就走它，没有就退回方块池。 */
  Chunk(kind, ...args) {
    if (this.vfx.SpawnChunk) this.vfx.SpawnChunk(kind, ...args);
    else this.vfx._SpawnDebris(...args);
  }

  SpawnOne(kind, emitter) {
    const vfx = this.vfx, o = emitter.o, R = (a, b) => a + (b - a) * vfx.random(), S = (k) => (vfx.random() * 2 - 1) * k;
    const dustHere = kind === "dust" && emitter.dustAt;
    const at = dustHere ? emitter.dustAt : emitter.at, y = at.y + S(dustHere ? o.dustHeightM ?? o.heightM : o.heightM), x = at.x + S(0.15), z = at.z + S(0.15);
    const [lo, hi] = o.speed[kind] || o.speed.spray;
    const up = o.upBoost || { clods: [0.4, 1.4], splinters: [0.8, 2.0] };
    if (kind === "clods") {
      // 湿土块：深褐带一点干土色（分镜 02 是棕色土块），不规则二十面体，一面亮一面暗。
      const v = vfx._ConeVelocity(emitter.axis, o.spreadRad, R(lo, hi));
      const [s0, s1] = o.clodSize || [0.04, 0.12], size = R(s0, s1);
      this.Chunk("clod", x, y, z, v.x, v.y + R(...up.clods), v.z, size, size * R(0.65, 1.0), size * R(0.8, 1.25),
        vfx.random() < 0.35 ? COLOR.clodDry : COLOR.clodDark, R(1.4, 2.2), o.groundY, 0.22, R(4, 9));
      return;
    }
    if (kind === "splinters") {
      const v = vfx._ConeVelocity(emitter.axis, o.spreadRad, R(lo, hi)), size = R(0.02, 0.045);
      this.Chunk("splinter", x, y, z, v.x, v.y + R(...up.splinters), v.z, size, size * R(0.35, 0.6), size * R(4, 9),
        vfx.random() < 0.6 ? COLOR.wood : COLOR.woodDark, R(1.6, 2.4), o.groundY, 0.3, R(8, 16));
      return;
    }
    if (kind === "grit") {
      // 碎渣：一把细碎的土粒，跟着泥浆那一锥飞，比土块快、落得早。
      const v = vfx._ConeVelocity(emitter.sprayAxis, o.spreadRad * 1.3, R(lo, hi)), [g0, g1] = o.gritSize || [0.012, 0.03], size = R(g0, g1);
      this.Chunk("clod", x, y, z, v.x, v.y + R(0, 0.8), v.z, size, size * R(0.6, 1.0), size * R(0.7, 1.2),
        vfx.random() < 0.5 ? COLOR.clodDark : COLOR.mudLight, R(0.9, 1.5), o.groundY, 0.18, R(6, 14));
      return;
    }
    if (kind === "spray" && vfx.pools.mud) {
      // 湿泥：一团团往镜头甩，沿瞬时速度拉出拖尾（快门 shutterS），带重力往下掉，受光、软边、半透明的边。
      const s = ResetVfxSpawn();
      s.x = x; s.y = y; s.z = z;
      const v = vfx._ConeVelocity(emitter.sprayAxis, o.spreadRad * 1.2, R(lo, hi));
      s.vx = v.x; s.vy = v.y + R(0.2, 1.1); s.vz = v.z;
      s.ay = -9.8; s.drag = 0.7;
      s.life = R(0.45, 0.85);
      const [m0, m1] = o.mudSize || [0.025, 0.07], size = R(m0, m1) * (vfx.random() < 0.15 ? 1.7 : 1);
      s.sizeStart = size; s.sizeEnd = size * R(1.1, 1.45);
      s.stretch = o.shutterS ?? 0.03;
      s.opacity = R(0.82, 0.94); s.fadeIn = 0.02;
      s.colorA = COLOR.mudWet; s.colorB = COLOR.mudLight;
      s.angle = 0; s.spin = 0;
      s.seed = vfx.random();
      vfx.pools.mud.Spawn(s, vfx.time);
      return;
    }
    const s = ResetVfxSpawn();
    s.x = x; s.y = y; s.z = z;
    if (kind === "spray") {
      // 没有泥浆池的宿主：退回烟团池（棕灰、半透明，不再是不透明的近黑圆片）。
      const v = vfx._ConeVelocity(emitter.sprayAxis, o.spreadRad * 1.2, R(lo, hi));
      s.vx = v.x; s.vy = v.y + R(0, 0.5); s.vz = v.z;
      s.ay = -6.5; s.drag = 1.4;
      s.life = R(0.5, 0.95);
      s.sizeStart = R(0.1, 0.2); s.sizeEnd = R(0.3, 0.55);
      s.opacity = 0.6; s.fadeIn = 0.03;
      s.colorA = COLOR.mudLight; s.colorB = COLOR.dustDense;
    } else if (kind === "mist") {
      // 细尘团：泥浆后面拖着的一溜小土雾，快、小、淡，很快散开。
      const v = vfx._ConeVelocity(emitter.sprayAxis, o.spreadRad * 1.5, R(lo, hi));
      s.vx = v.x; s.vy = v.y + R(0, 0.4); s.vz = v.z;
      s.ay = -0.8; s.drag = 2.6;
      s.life = R(0.5, 1.1);
      s.sizeStart = R(0.1, 0.2); s.sizeEnd = R(0.45, 0.85);
      s.opacity = R(0.3, 0.45); s.fadeIn = 0.05;
      s.colorA = COLOR.mist; s.colorB = COLOR.dustDense;
    } else {
      // 扬尘：慢、大、往洞里推，把洞口填满（0.9 s 以后还浑着）。灰褐土色，不是发白的砖粉。
      const v = vfx._ConeVelocity(emitter.dustAxis, o.spreadRad * 1.8, R(lo, hi));
      s.vx = v.x; s.vy = v.y * 0.5 + R(0.1, 0.5); s.vz = v.z;
      s.ax = vfx.wind?.x * 0.2 || 0; s.ay = 0.12; s.az = vfx.wind?.z * 0.2 || 0;
      s.drag = 2.2;
      s.life = R(1.8, 3.2);
      s.sizeStart = R(0.5, 0.8); s.sizeEnd = R(1.8, 2.8);
      s.opacity = o.dustOpacity ?? 0.5; s.fadeIn = 0.08;
      s.colorA = COLOR.dust; s.colorB = COLOR.dustDense;
    }
    s.angle = R(0, 6.283); s.spin = S(1.6);
    s.seed = vfx.random();
    vfx.pools.smoke.Spawn(s, vfx.time);
  }
}
