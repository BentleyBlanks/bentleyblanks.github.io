// 白盒编辑器预演里的简易爆炸与飞行中的手榴弹（docs/Data_EditorBlockout.md §14.2，2026-10-18 第三轮）。
//
// 为什么另画一份：默认白盒画质（quality=whitebox，`WhiteboxSceneRenderer` 的 `effects:false`）出画前把
// VfxSystem 的根节点整棵藏掉（Script_Vfx 的 scene.onBeforeRender 钩子读 `scene.userData.whiteboxEffects`），
// 场景里的 Points / Sprite / 半透明特效网格也一并藏掉 —— 预演里 03 掷弹筒落点、05-3 炸车尾这些爆炸在白盒下一点都看不见。
// 游戏本身各画质下的爆炸表现不动：这里只给编辑器的预演用，画在 post.AddDebugOverlay 的调试叠加层里
// （同 3D 标记：不被白盒涂灰、不进预通道），而且只在「白盒且特效关」时画爆炸（其它画质 VfxSystem 自己画得出来，不叠两份）。
//
// 画什么（全按预演时间 t 求值，确定性：Seek 到同一秒画面一样，截图验收用）：
//   · 爆炸（events[].type === "explosion"）：一团火光（亮橙、0.25–0.4 s 胀大后退掉）+ 土柱 / 烟尘（几团褐灰球往上冒、
//     胀大、变淡，2–3 s）+ 贴地一圈尘环。大小按 radius：子弹打土（radius ≤ 1）只有一小团土。
//   · 飞行中的手榴弹（演员键 throw，PrevizPlan.PrevizThrows）：一捆深色弹体沿抛物线飞，后面拖一条淡线；任何画质都画
//     （VfxSystem 不管预演里的投弹）。
//   · 烟（events[].type === "smoke"，2026-10-18 第三轮补）：持续窗口 [t, t + dur) 里一团团往上冒的简易烟球，窗口结束后
//     已冒出来的那几团照常散完。SmokeDust = 褐黄土雾（贴地、铺得开、冒得矮，05-2 板缝漏土）、SmokeWhite = 灰白烟
//     （掷弹筒出膛、烟幕）、SmokeBlack = 黑烟柱（05-3 战车起火）。每团的出生时刻按槽位等间隔排好，同一 t 同一画面。
//   · 枪口火（events[].type === "muzzle"）：每一发一下亮黄火光（0.07 s）+ 一小团灰烟（0.6 s），位置由预演给（演员枪口 / 事件点）。
//   烟和枪口火同爆炸，只在白盒且特效关时画（其它画质 VfxSystem 的烟源、枪口火自己画得出来）。
// 颜色按曝光预补（同 Script_EditorBlockoutMarkers：叠加层画在色调映射之前）。

import * as THREE from "three";
import { PrevizThrows, SampleThrowFlight } from "./Script_EditorBlockoutPrevizPlan.mjs";

/** 简易爆炸的参数（米 / 秒）。 */
export const PREVIZ_FX = Object.freeze({
  maxBlasts: 8,
  puffsPerBlast: 7,
  fireS: 0.38,          // 火光寿命
  fireRadius: 0.22,     // 火光最大半径 = radius × 这个（夹在 0.25–2.0 m）
  dustS: 2.6,           // 土柱 / 烟尘寿命（radius ≤ 1 的土点按 0.6 s）
  dustRise: 0.75,       // 土柱顶 = radius × 这个（≥ 0.6 m）
  ringS: 1.1,
  smallRadius: 1.0,     // 这以下算「子弹打在土里」
  trailPoints: 24,
  maxSmokes: 12,
  puffsPerSmoke: 9,
  smokeDefaultS: 6,     // 同 Script_EditorBlockoutPreviz 的 SMOKE_DEFAULT_S
  maxMuzzles: 10,
  muzzleFlashS: 0.07,
  muzzlePuffS: 0.6,
  muzzleInterval: 0.12, // 同 Script_EditorBlockoutPreviz.FireEvent 的缺省间隔
});

/** 三种烟的样子：颜色、每团寿命（秒）、冒多高、往外散多宽、球的起止半径（米）。 */
export const PREVIZ_SMOKE_LOOK = Object.freeze({
  SmokeDust: Object.freeze({ color: [0.45, 0.38, 0.29], lifeS: 2.4, rise: 1.4, spread: 1.4, r0: 0.35, r1: 1.1, opacity: 0.75 }),
  SmokeWhite: Object.freeze({ color: [0.82, 0.82, 0.8], lifeS: 3.0, rise: 4.5, spread: 1.2, r0: 0.5, r1: 2.4, opacity: 0.85 }),
  SmokeBlack: Object.freeze({ color: [0.11, 0.11, 0.11], lifeS: 3.6, rise: 5.5, spread: 0.9, r0: 0.5, r1: 2.2, opacity: 0.85 }),
});

const OVERLAY_PEAK = 0.9;
const FIRE_HDR = 1.25;      // 火光比叠加层的一般颜色亮这么多倍（过泛光、在白盒的灰里跳出来）
const COLORS = Object.freeze({
  fireCore: new THREE.Color(1.0, 0.86, 0.55), fire: new THREE.Color(1.0, 0.45, 0.12),
  dust: new THREE.Color(0.42, 0.36, 0.29), dustDark: new THREE.Color(0.23, 0.2, 0.17),
  grenade: new THREE.Color(0.16, 0.17, 0.13), trail: new THREE.Color(0.95, 0.9, 0.75), smokeGrey: new THREE.Color(0.62, 0.62, 0.6),
});

function Hash(i, k) {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
}
const Smooth = (u) => { const x = Math.min(1, Math.max(0, u)); return x * x * (3 - 2 * x); };

function SphereMesh(geometry, color, opacity = 1) {
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false, toneMapped: true });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.visible = false;
  mesh.frustumCulled = false;
  return mesh;
}

export class BlockoutPrevizFx {
  /** @param {{ post?: object, scene?: THREE.Scene }} host */
  constructor({ post, scene }) {
    this.root = new THREE.Group();
    this.root.name = "BlockoutPrevizFx";
    const sphere = new THREE.IcosahedronGeometry(1, 2);
    const ring = new THREE.RingGeometry(0.7, 1, 32).rotateX(-Math.PI / 2);
    this.geometries = [sphere, ring];
    this.blasts = [];
    for (let i = 0; i < PREVIZ_FX.maxBlasts; i++) {
      const fire = SphereMesh(sphere, COLORS.fire.clone());
      const core = SphereMesh(sphere, COLORS.fireCore.clone());
      const ringMesh = SphereMesh(ring, COLORS.dust.clone(), 0.5);
      ringMesh.material.side = THREE.DoubleSide;
      const puffs = [];
      for (let k = 0; k < PREVIZ_FX.puffsPerBlast; k++) puffs.push(SphereMesh(sphere, COLORS.dust.clone(), 0.8));
      this.root.add(fire, core, ringMesh, ...puffs);
      this.blasts.push({ fire, core, ring: ringMesh, puffs });
    }
    // 飞行中的手榴弹：一捆（五根短圆柱拢在一起）+ 拖尾
    const stick = new THREE.CylinderGeometry(0.035, 0.035, 0.24, 8);
    this.geometries.push(stick);
    this.grenades = [];
    for (let i = 0; i < 2; i++) {
      const group = new THREE.Group();
      const material = new THREE.MeshBasicMaterial({ color: COLORS.grenade.clone(), fog: false });
      for (const [dx, dz] of [[0, 0], [0.07, 0], [-0.07, 0], [0, 0.07], [0, -0.07]]) {
        const m = new THREE.Mesh(stick, material); m.position.set(dx, 0, dz); m.frustumCulled = false; group.add(m);
      }
      group.visible = false;
      const trailGeometry = new THREE.BufferGeometry();
      trailGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(PREVIZ_FX.trailPoints * 3), 3));
      const trail = new THREE.Line(trailGeometry, new THREE.LineBasicMaterial({ color: COLORS.trail.clone(), transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
      trail.visible = false; trail.frustumCulled = false;
      this.geometries.push(trailGeometry);
      this.root.add(group, trail);
      this.grenades.push({ group, trail, material });
    }
    // 烟：每个烟源一组烟球
    this.smokes = [];
    for (let i = 0; i < PREVIZ_FX.maxSmokes; i++) {
      const puffs = [];
      for (let k = 0; k < PREVIZ_FX.puffsPerSmoke; k++) puffs.push(SphereMesh(sphere, new THREE.Color(), 0.7));
      this.root.add(...puffs);
      this.smokes.push({ puffs, color: new THREE.Color() });
    }
    // 枪口火：一下火光 + 一小团烟
    this.muzzles = [];
    for (let i = 0; i < PREVIZ_FX.maxMuzzles; i++) {
      const flash = SphereMesh(sphere, COLORS.fireCore.clone());
      const puff = SphereMesh(sphere, COLORS.dust.clone(), 0.6);
      this.root.add(flash, puff);
      this.muzzles.push({ flash, puff });
    }
    this.gain = 1;
    this.root.userData.PrepareDebugOverlay = ({ exposure }) => { this.gain = OVERLAY_PEAK / THREE.MathUtils.clamp(exposure || 1, 0.05, 20); this.Tint(); };
    if (post?.AddDebugOverlay) { post.AddDebugOverlay(this.root); this.host = "post"; this.post = post; }
    else { scene?.add(this.root); this.host = "scene"; }
    this.flights = null;
    this.flightKey = null;
    this.stats = { blasts: 0, grenades: 0, smokes: 0, muzzles: 0 };
  }

  /** 白盒且特效关：VfxSystem 的爆炸这时画不出来，由这里画。 */
  static BlastsHidden(post) {
    const wb = post?.whiteboxScene;
    return !!(wb && wb.config && !wb.config.effects);
  }

  Tint() {
    const g = this.gain;
    for (const b of this.blasts) {
      if (b.fire.visible) b.fire.material.color.copy(COLORS.fire).multiplyScalar(g * FIRE_HDR);
      if (b.core.visible) b.core.material.color.copy(COLORS.fireCore).multiplyScalar(g * FIRE_HDR * 1.6);
      if (b.ring.visible) b.ring.material.color.copy(COLORS.dust).multiplyScalar(g);
      b.puffs.forEach((p, k) => { if (p.visible) p.material.color.copy(k % 2 ? COLORS.dustDark : COLORS.dust).multiplyScalar(g * 1.1); });
    }
    for (const gr of this.grenades) { gr.material.color.copy(COLORS.grenade).multiplyScalar(g); gr.trail.material.color.copy(COLORS.trail).multiplyScalar(g); }
    for (const sm of this.smokes) for (const p of sm.puffs) if (p.visible) p.material.color.copy(sm.color).multiplyScalar(g);
    for (const m of this.muzzles) {
      if (m.flash.visible) m.flash.material.color.copy(COLORS.fireCore).multiplyScalar(g * FIRE_HDR * 1.4);
      if (m.puff.visible) m.puff.material.color.copy(COLORS.smokeGrey).multiplyScalar(g);
    }
  }

  /**
   * 按预演时间 t 摆一遍。seq = 归一化后的序列；standAt(x,z) → 地面；baseOf(id) → 关键帧单位；
   * drawBlasts = 要不要画爆炸、烟与枪口火（白盒特效关时才画）；muzzleAt(event) → 枪口世界坐标 {x,y,z}（找不到 null）。
   */
  Update(seq, t, { standAt, baseOf, drawBlasts = true, actorOpts = {}, muzzleAt = null } = {}) {
    let used = 0;
    if (seq && drawBlasts) {
      for (const e of seq.events || []) {
        if (e.type !== "explosion" || used >= this.blasts.length) continue;
        const local = t - e.t;
        const radius = Number.isFinite(e.radius) ? e.radius : 6;
        const small = radius <= PREVIZ_FX.smallRadius;
        const dustS = small ? 0.6 : PREVIZ_FX.dustS;
        if (local < 0 || local > dustS) continue;
        const lift = Number.isFinite(e.h) ? e.h : 0;
        this.PoseBlast(this.blasts[used], used, e, local, radius, small, standAt(e.x, e.z) + lift, lift > 0.5);
        used++;
      }
    }
    for (let i = used; i < this.blasts.length; i++) this.HideBlast(this.blasts[i]);
    // 烟
    let smokes = 0;
    if (seq && drawBlasts) {
      seq.events.forEach((e, index) => {
        if (e.type !== "smoke" || smokes >= this.smokes.length) return;
        const look = PREVIZ_SMOKE_LOOK[e.kind] || PREVIZ_SMOKE_LOOK.SmokeDust;
        const dur = Number.isFinite(e.dur) ? e.dur : PREVIZ_FX.smokeDefaultS;
        const local = t - e.t;
        if (local < 0 || local > dur + look.lifeS) return;
        if (this.PoseSmoke(this.smokes[smokes], index, e, look, local, dur, standAt(e.x, e.z))) smokes++;
      });
    }
    for (let i = smokes; i < this.smokes.length; i++) for (const p of this.smokes[i].puffs) p.visible = false;
    // 枪口火
    let muzzles = 0;
    if (seq && drawBlasts && muzzleAt) {
      for (const e of seq.events) {
        if (e.type !== "muzzle") continue;
        const count = Number.isInteger(e.count) ? e.count : 1;
        const interval = Number.isFinite(e.interval) ? e.interval : PREVIZ_FX.muzzleInterval;
        for (let k = 0; k < count && muzzles < this.muzzles.length; k++) {
          const local = t - (e.t + k * interval);
          if (local < 0 || local > PREVIZ_FX.muzzlePuffS) continue;
          const at = muzzleAt(e);
          if (!at) continue;
          this.PoseMuzzle(this.muzzles[muzzles++], at, local);
        }
      }
    }
    for (let i = muzzles; i < this.muzzles.length; i++) { this.muzzles[i].flash.visible = false; this.muzzles[i].puff.visible = false; }
    // 飞行中的手榴弹
    if (seq && (seq !== this.flightKey)) { this.flights = PrevizThrows(seq, baseOf, standAt, actorOpts); this.flightKey = seq; }
    let g = 0;
    if (seq) for (const f of this.flights || []) {
      const p = SampleThrowFlight(f, t);
      if (!p || g >= this.grenades.length) continue;
      const gr = this.grenades[g++];
      gr.group.visible = true;
      gr.group.position.set(p.x, p.y, p.z);
      gr.group.rotation.set(p.u * 9.0, 0, p.u * 5.0);
      const n = PREVIZ_FX.trailPoints, arr = gr.trail.geometry.attributes.position.array;
      for (let i = 0; i < n; i++) {
        const q = SampleThrowFlight(f, f.t0 + (t - f.t0) * i / (n - 1)) || p;
        arr[i * 3] = q.x; arr[i * 3 + 1] = q.y; arr[i * 3 + 2] = q.z;
      }
      gr.trail.geometry.attributes.position.needsUpdate = true;
      gr.trail.visible = true;
    }
    for (let i = g; i < this.grenades.length; i++) { this.grenades[i].group.visible = false; this.grenades[i].trail.visible = false; }
    this.stats = { blasts: used, grenades: g, smokes, muzzles };
    this.root.visible = used > 0 || g > 0 || smokes > 0 || muzzles > 0;
    this.Tint();
  }

  /** groundY = 爆点脚下（写了 h 就是 地面 + h）；raised = 炸在半空 / 车上：不画贴地尘环。 */
  PoseBlast(b, index, e, local, radius, small, groundY, raised = false) {
    const seed = Math.round(e.t * 100) + index * 7;
    // 火光：0.04 s 胀到最大，再按寿命退掉（土点没有火光）
    const fireS = PREVIZ_FX.fireS * Math.min(1.4, Math.max(0.7, radius / 5));
    if (!small && local < fireS) {
      const u = local / fireS;
      const r = THREE.MathUtils.clamp(radius * PREVIZ_FX.fireRadius, 0.25, 2.0) * (0.55 + 0.45 * Smooth(local / 0.06));
      b.fire.visible = true; b.fire.position.set(e.x, groundY + r * 0.7, e.z); b.fire.scale.setScalar(r);
      b.fire.material.opacity = 0.9 * (1 - u * u);
      b.core.visible = true; b.core.position.copy(b.fire.position); b.core.scale.setScalar(r * 0.55);
      b.core.material.opacity = 1 - u;
    } else { b.fire.visible = false; b.core.visible = false; }
    // 尘环
    if (!small && !raised && local < PREVIZ_FX.ringS) {
      const u = local / PREVIZ_FX.ringS;
      b.ring.visible = true; b.ring.position.set(e.x, groundY + 0.06, e.z);
      b.ring.scale.setScalar(Math.max(0.6, radius * (0.25 + 0.9 * Smooth(u * 1.4))));
      b.ring.material.opacity = 0.55 * (1 - u);
    } else b.ring.visible = false;
    // 土柱 / 烟尘：几团往上冒、胀大、变淡
    const dustS = small ? 0.6 : PREVIZ_FX.dustS;
    const top = small ? Math.max(0.35, radius * 0.6) : Math.max(0.6, radius * PREVIZ_FX.dustRise);
    const size = small ? Math.max(0.12, radius * 0.22) : Math.max(0.35, radius * 0.2);
    b.puffs.forEach((p, k) => {
      const delay = k * (small ? 0.02 : 0.05);
      const lu = (local - delay) / (dustS - delay);
      if (lu <= 0 || lu >= 1 || (small && k > 3)) { p.visible = false; return; }
      const a = Hash(seed, k) * Math.PI * 2, spread = (small ? 0.25 : 0.35) * radius * (0.3 + Hash(seed, k + 11));
      const climb = Smooth(Math.min(1, lu * 2.2)) * top * (0.55 + 0.6 * Hash(seed, k + 23));
      p.visible = true;
      p.position.set(e.x + Math.cos(a) * spread * Smooth(lu * 2), groundY + 0.2 + climb, e.z + Math.sin(a) * spread * Smooth(lu * 2));
      p.scale.setScalar(size * (0.6 + 1.3 * Smooth(lu * 1.5)) * (0.8 + 0.4 * Hash(seed, k + 37)));
      p.material.opacity = 0.85 * Math.min(1, lu * 12) * (1 - Smooth(lu));
    });
  }

  /**
   * 一个烟源：puffsPerSmoke 个槽位，第 k 槽在 e.t + k·(life/N) + m·life 冒一团（m = 0,1,…，只冒在窗口 dur 里），
   * 每团活 lifeS 秒：往上冒（先快后慢）、往外飘、胀大、先浓后淡。→ 画了没有。
   */
  PoseSmoke(sm, index, e, look, local, dur, groundY) {
    const n = sm.puffs.length, life = look.lifeS, per = life / n;
    sm.color.setRGB(look.color[0], look.color[1], look.color[2]);
    let any = false;
    sm.puffs.forEach((p, k) => {
      const first = k * per;
      if (local < first) { p.visible = false; return; }
      const m = Math.floor((local - first) / life);
      const born = first + m * life;
      if (born >= dur) { p.visible = false; return; }
      const age = (local - born) / life;
      const seed = index * 31 + k * 7 + m * 3;
      const a = Hash(seed, 1) * Math.PI * 2, drift = look.spread * (0.35 + 0.65 * Hash(seed, 2));
      const out = Smooth(Math.min(1, age * 1.6));
      p.visible = true;
      p.position.set(e.x + Math.cos(a) * drift * out, groundY + 0.25 + look.rise * (1 - (1 - age) * (1 - age)) * (0.7 + 0.5 * Hash(seed, 3)), e.z + Math.sin(a) * drift * out);
      p.scale.setScalar(look.r0 + (look.r1 - look.r0) * Smooth(age) * (0.8 + 0.4 * Hash(seed, 4)));
      p.material.opacity = look.opacity * Math.min(1, age * 6) * (1 - Smooth(age));
      any = true;
    });
    return any;
  }

  PoseMuzzle(m, at, local) {
    if (local < PREVIZ_FX.muzzleFlashS) {
      m.flash.visible = true; m.flash.position.set(at.x, at.y, at.z);
      m.flash.scale.setScalar(0.18 * (1 - local / PREVIZ_FX.muzzleFlashS * 0.5));
      m.flash.material.opacity = 1;
    } else m.flash.visible = false;
    const u = local / PREVIZ_FX.muzzlePuffS;
    m.puff.visible = true;
    m.puff.position.set(at.x, at.y + 0.3 * u, at.z);
    m.puff.scale.setScalar(0.12 + 0.35 * Smooth(u));
    m.puff.material.opacity = 0.6 * (1 - u);
  }

  HideBlast(b) {
    b.fire.visible = false; b.core.visible = false; b.ring.visible = false;
    for (const p of b.puffs) p.visible = false;
  }

  /** 预演结束：全藏。 */
  Clear() {
    for (const b of this.blasts) this.HideBlast(b);
    for (const gr of this.grenades) { gr.group.visible = false; gr.trail.visible = false; }
    for (const sm of this.smokes) for (const p of sm.puffs) p.visible = false;
    for (const m of this.muzzles) { m.flash.visible = false; m.puff.visible = false; }
    this.root.visible = false;
    this.flights = null; this.flightKey = null;
    this.stats = { blasts: 0, grenades: 0, smokes: 0, muzzles: 0 };
  }

  Dispose() {
    this.Clear();
    if (this.host === "post") this.post?.RemoveDebugOverlay?.(this.root);
    this.root.removeFromParent();
    this.root.traverse(o => { if (o.material) o.material.dispose(); });
    for (const g of this.geometries) g.dispose();
  }
}
