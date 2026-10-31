// 白盒编辑器预演里飞行中的手榴弹（docs/Data_EditorBlockout.md §14.2）。
//
// 预演里的爆炸 / 烟 / 枪口火是 VfxSystem 的真特效（Script_EditorBlockoutPreviz.FireEvent），任何画质都一样。
// 2026-10-31 起不再有「白盒画质」档，原来只在「白盒且特效关」时画的简易爆炸 / 烟 / 枪口火已删。
// 这里只留飞行中的手榴弹：VfxSystem 不管预演里的投弹（演员键 throw，PrevizPlan.PrevizThrows），
// 所以画一捆深色弹体沿抛物线飞，后面拖一条淡线，按预演时间 t 求值（Seek 到同一秒画面一样），
// 画在 post.AddDebugOverlay 的调试叠加层里（同 3D 标记：不进预通道）。
// 颜色按曝光预补（同 Script_EditorBlockoutMarkers：叠加层画在色调映射之前）。

import * as THREE from "three";
import { PrevizThrows, SampleThrowFlight } from "./Script_EditorBlockoutPrevizPlan.mjs";

/** 手榴弹拖尾的参数。 */
export const PREVIZ_FX = Object.freeze({
  trailPoints: 24,
  maxGrenades: 2,
});

const OVERLAY_PEAK = 0.9;
const COLORS = Object.freeze({
  grenade: new THREE.Color(0.16, 0.17, 0.13), trail: new THREE.Color(0.95, 0.9, 0.75),
});

export class BlockoutPrevizFx {
  /** @param {{ post?: object, scene?: THREE.Scene }} host */
  constructor({ post, scene }) {
    this.root = new THREE.Group();
    this.root.name = "BlockoutPrevizFx";
    this.geometries = [];
    // 飞行中的手榴弹：一捆（五根短圆柱拢在一起）+ 拖尾
    const stick = new THREE.CylinderGeometry(0.035, 0.035, 0.24, 8);
    this.geometries.push(stick);
    this.grenades = [];
    for (let i = 0; i < PREVIZ_FX.maxGrenades; i++) {
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
    this.gain = 1;
    this.root.userData.PrepareDebugOverlay = ({ exposure }) => { this.gain = OVERLAY_PEAK / THREE.MathUtils.clamp(exposure || 1, 0.05, 20); this.Tint(); };
    if (post?.AddDebugOverlay) { post.AddDebugOverlay(this.root); this.host = "post"; this.post = post; }
    else { scene?.add(this.root); this.host = "scene"; }
    this.flights = null;
    this.flightKey = null;
    this.stats = { grenades: 0 };
  }

  Tint() {
    const g = this.gain;
    for (const gr of this.grenades) { gr.material.color.copy(COLORS.grenade).multiplyScalar(g); gr.trail.material.color.copy(COLORS.trail).multiplyScalar(g); }
  }

  /**
   * 按预演时间 t 摆一遍。seq = 归一化后的序列；standAt(x,z) → 地面；baseOf(id) → 关键帧单位；
   * actorOpts = PrevizThrows 要的 { resolve, clipDuration }。
   */
  Update(seq, t, { standAt, baseOf, actorOpts = {} } = {}) {
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
    this.stats = { grenades: g };
    this.root.visible = g > 0;
    this.Tint();
  }

  /** 预演结束：全藏。 */
  Clear() {
    for (const gr of this.grenades) { gr.group.visible = false; gr.trail.visible = false; }
    this.root.visible = false;
    this.flights = null; this.flightKey = null;
    this.stats = { grenades: 0 };
  }

  Dispose() {
    this.Clear();
    if (this.host === "post") this.post?.RemoveDebugOverlay?.(this.root);
    this.root.removeFromParent();
    this.root.traverse(o => { if (o.material) o.material.dispose(); });
    for (const g of this.geometries) g.dispose();
  }
}
