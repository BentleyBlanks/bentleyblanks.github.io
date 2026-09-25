// ===========================================================================
// Script_OpeningBlastFx.mjs —— 01 近爆的定向喷土（Set 包，契约
// docs/Data_FirstLevelStoryboard0103Contract.md §4.5）。
//
// vfx.Explosion 的碎块与烟全是各向同性的；SB02 要的是「从洞口一侧朝洞里、朝镜头喷」：
// 一锥泥雾扑面、十几块土块、碎木片、然后扬尘把洞口填满。这里只往 Script_Vfx 现有的
// 两个池（烟团池 pools.smoke、碎块池 debris）里生粒子——不新建材质、不新建网格，
// 所以首次触发不会现编着色器（同一帧近爆本身也往这两个池里生，程序是同一份）。
//
//   const fx = new OpeningBlastFx({ vfx });
//   fx.DirectionalBlast(position, direction, { clods, splinters, dust, seconds, ... });
//   fx.Update(dt);     // 每帧：按时间把一次喷发摊开（前 headS 秒喷 headShare，后面拖尾）
//   fx.Clear();        // 收走尚未喷完的发射器（已生出的粒子交给 vfx 自己的寿命）
//
// 默认参数来自 Data_OpeningSet0103.BLAST（SB02 那一喷）；调试/抓帧可以直接调。
// ===========================================================================
import * as THREE from "three";
import { VFX_PALETTE, ResetVfxSpawn } from "./Script_Vfx.mjs";
import { BLAST } from "./Data_OpeningSet0103.mjs";

const AXIS = new THREE.Vector3();

export class OpeningBlastFx {
  /** @param {{vfx: import("./Script_Vfx.mjs").VfxSystem}} host */
  constructor({ vfx }) {
    this.vfx = vfx;
    this.emitters = [];
    this.spawned = { clods: 0, splinters: 0, spray: 0, dust: 0 };
    this.fired = 0;
  }

  /**
   * 定向喷发。position 是喷口（世界坐标，y 取喷口中心高），direction 是喷射主方向（会归一化）。
   * opts：clods / splinters / spray / dust（个数）、seconds（整段时长）、spreadRad（锥半角）、
   * speed:{clods,splinters,spray,dust:[min,max]}、burst:{headS, headShare}、heightM（喷口上下展开）、
   * groundY（碎块落到哪一层；默认 position.y - 1）、
   * sprayDir（泥雾单独的主方向，默认同 direction）、dustAt / dustDir（扬尘的出生点与方向：默认同喷口、同主方向；
   * SB02 让扬尘在门洞里起、往洞里推）、clodSize:[min,max]（土块边长，米）、upBoost:{clods,splinters}（额外上抛，米/秒）。
   * @returns {object|null} 发射器（Stats 用）；没有 vfx 时 null
   */
  DirectionalBlast(position, direction, opts = {}) {
    if (!this.vfx) return null;
    const o = {
      clods: BLAST.clods, splinters: BLAST.splinters, spray: BLAST.spray, dust: BLAST.dust,
      seconds: BLAST.seconds, spreadRad: BLAST.spreadRad, speed: BLAST.speed, burst: BLAST.burst,
      heightM: 0.5, groundY: position.y - 1, clodSize: BLAST.clodSize, upBoost: BLAST.upBoost, ...opts,
    };
    const axis = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();
    const V = (v) => (v ? new THREE.Vector3(v.x, v.y, v.z) : null);
    const sprayAxis = (V(o.sprayDir) || axis.clone()).normalize(), dustAxis = (V(o.dustDir) || axis.clone()).normalize();
    const dustAt = o.dustAt ? new THREE.Vector3(o.dustAt.x, o.dustAt.y ?? position.y, o.dustAt.z) : null;
    const emitter = { at: new THREE.Vector3(position.x, position.y, position.z), axis, sprayAxis, dustAxis, dustAt, o, age: 0,
      emitted: { clods: 0, splinters: 0, spray: 0, dust: 0 } };
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

  Stats() { return { active: this.emitters.length, fired: this.fired, spawned: { ...this.spawned } }; }

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
    for (const kind of ["clods", "splinters", "spray", "dust"]) {
      const want = Math.round(o[kind] * (kind === "dust" ? dustShare : share) * (this.vfx.spawnScale ?? 1));
      while (emitter.emitted[kind] < want) { this.SpawnOne(kind, emitter); emitter.emitted[kind] += 1; this.spawned[kind] += 1; }
    }
  }

  SpawnOne(kind, emitter) {
    const vfx = this.vfx, o = emitter.o, R = (a, b) => a + (b - a) * vfx.random(), S = (k) => (vfx.random() * 2 - 1) * k;
    const dustHere = kind === "dust" && emitter.dustAt;
    const at = dustHere ? emitter.dustAt : emitter.at, y = at.y + S(dustHere ? o.dustHeightM ?? o.heightM : o.heightM), x = at.x + S(0.15), z = at.z + S(0.15);
    const [lo, hi] = o.speed[kind];
    const up = o.upBoost || { clods: [0.4, 1.4], splinters: [0.8, 2.0] };
    if (kind === "clods" || kind === "splinters") {
      const v = vfx._ConeVelocity(emitter.axis, o.spreadRad, R(lo, hi));
      if (kind === "clods") {
        const [s0, s1] = o.clodSize || [0.04, 0.12], size = R(s0, s1);
        vfx._SpawnDebris(x, y, z, v.x, v.y + R(...up.clods), v.z, size, size * R(0.6, 1.0), size * R(0.8, 1.3),
          // 湿土块是深褐的（分镜 02）：裸土色 soil 在画面里读成一块块米黄方糖（实拍 tmp/s3/cap01/SB02dbg_t030.png）；
          // 审查 09-25 再压暗：多数用焦褐，逆着天空读成黑剪影。
          vfx.random() < 0.3 ? VFX_PALETTE.wood : VFX_PALETTE.woodBurnt, R(1.4, 2.2), o.groundY, 0.22, R(4, 9));
      } else {
        const size = R(0.018, 0.04);
        vfx._SpawnDebris(x, y, z, v.x, v.y + R(...up.splinters), v.z, size, size * R(0.5, 0.9), size * R(4, 9),
          vfx.random() < 0.6 ? VFX_PALETTE.wood : VFX_PALETTE.woodBurnt, R(1.6, 2.4), o.groundY, 0.3, R(8, 16));
      }
      return;
    }
    const s = ResetVfxSpawn();
    s.x = x; s.y = y; s.z = z;
    if (kind === "spray") {
      // 泥雾：一片小而密的湿土，贴着锥面扑过来，带重力往下掉。
      const v = vfx._ConeVelocity(emitter.sprayAxis, o.spreadRad * 1.2, R(lo, hi));
      s.vx = v.x; s.vy = v.y + R(0, 0.5); s.vz = v.z;
      s.ay = -6.5; s.drag = 1.4;
      // 尺寸按实拍放大：0.03–0.24 m 的泥点在 1–3 m 外只有几个像素，三帧里几乎看不见。
      s.life = R(0.5, 0.95);
      s.sizeStart = R(0.16, 0.3); s.sizeEnd = R(0.45, 0.85);
      s.opacity = 1; s.fadeIn = 0.01;
      s.colorA = VFX_PALETTE.woodBurnt; s.colorB = VFX_PALETTE.wood;
    } else {
      // 扬尘：慢、大、往洞里推，把洞口填满（0.9 s 以后还浑着）。
      const v = vfx._ConeVelocity(emitter.dustAxis, o.spreadRad * 1.8, R(lo, hi));
      s.vx = v.x; s.vy = v.y * 0.5 + R(0.1, 0.5); s.vz = v.z;
      s.ax = vfx.wind?.x * 0.2 || 0; s.ay = 0.12; s.az = vfx.wind?.z * 0.2 || 0;
      s.drag = 2.2;
      s.life = R(1.8, 3.2);
      s.sizeStart = R(0.5, 0.8); s.sizeEnd = R(1.8, 2.8);
      s.opacity = 0.62; s.fadeIn = 0.08;
      s.colorA = VFX_PALETTE.soilAir; s.colorB = VFX_PALETTE.dustDense;
    }
    s.angle = R(0, 6.283); s.spin = S(1.6);
    s.seed = vfx.random();
    vfx.pools.smoke.Spawn(s, vfx.time);
  }
}
