// 白盒编辑器预演里的飞机（docs/Data_EditorBlockout.md §14.1 aircraft、§14.2，2026-10-19）。
//
// 预演 JSON 的段里写 `aircraft[]`（机型 + 按时间的三维航点 + 可选扫射段 + 声音），规则与取样在
// Script_EditorBlockoutPrevizPlan（SamplePrevizAircraft 纯函数：Seek 到哪一秒飞机就在哪儿）。这里只管画面与声音：
//   · 模型借游戏自己的机队（Script_Aircraft.AircraftFlight）：AcquireClone(机型) 取一架克隆（共用几何与材质，白盒关卡里
//     原机本来就藏着），挂在本模块自己的组里按 PrevizPlan 的姿态摆（机头局部 −Z，同 ApplyStrafePose 的换算：
//     rotation.set(climb, atan2(−dirX, −dirZ), bank, "YXZ")）；播完 / 中断 ReleaseClone 还回池子。模型还没载进来那一帧跳过，下一帧再试。
//     组上标 whiteboxCharacter，白盒画质里也保留原贴图（不涂成灰网格，天上那一点要读得出是飞机）。
//   · 引擎声：planeDrone（合成的持续引擎，audio.Play 起一条 voice，每帧 MoveVoice 搬到机身 + 速度做多普勒）从飞机出现起
//     一直响到消失 / 预演结束（StopVoice 淡出）；sound.diveT 那一刻一次 planeDive（录好多普勒的通场，挂在机身上）。
//   · 扫射：每段 strafe 开始时按机身离听者的远近放 strafeNear / strafeFar；弹着点由 PrevizPlan.PrevizStrafeImpacts 给，
//     每 strafeDirtEvery 发一声 strafeDirt 落在弹着点上；地上的土点由 Script_EditorBlockoutPrevizFx 当「子弹打在土里」画（Seek 也看得见）。
//   音效走 Script_EditorBlockoutPreviz 的 PREVIZ_SFX 别名表（planeDrone / planeDive / strafeNear / strafeFar / strafeDirt 已在表里），
//   这里通过 host.PlaySfx(name, at) / host.StartDrone / host.MoveDrone / host.StopDrone 调它，不另存一份键名。
//   没有音频上下文（audio=0）时只画不响。

import * as THREE from "three";
import { SamplePrevizAircraft, PrevizStrafeImpacts, PREVIZ_AIRCRAFT } from "./Script_EditorBlockoutPrevizPlan.mjs";

export class BlockoutPrevizAircraft {
  /**
   * @param {{ scene: THREE.Scene, aircraft: () => object|null, sfx: object }} deps
   *   aircraft()  游戏的 AircraftFlight（Script_Main 的 editorHost.aircraft；取值器，切关后对象会换）
   *   sfx         { Play(name, at|null, opts?), StartLoop(name, at) → voice|null, MoveLoop(voice, at, velocity), StopLoop(voice) }
   */
  constructor({ scene, aircraft, sfx }) {
    this.scene = scene;
    this.aircraft = typeof aircraft === "function" ? aircraft : () => aircraft || null;
    this.sfx = sfx || {};
    this.root = new THREE.Group();
    this.root.name = "BlockoutPrevizAircraft";
    this.root.userData.whiteboxCharacter = true;   // 白盒画质里保留贴图（Script_WhiteboxRendering.IsWhiteboxCharacter）
    scene?.add(this.root);
    this.planes = new Map();   // id → { entry, slot: {id: 机型, root} | null, drone, dived, strafeStarted: Set, dirtFired: Set, visible }
    this.seq = null;
    this.missingModels = new Set();
  }

  /** 开播：按这一段的 aircraft[] 准备槽位（模型克隆在第一帧 Update 里取，取不到下一帧再试）。 */
  Begin(seq) {
    this.Clear();
    this.seq = seq || null;
    for (const entry of seq?.aircraft || []) {
      this.planes.set(entry.id, { entry, slot: null, drone: null, dived: false, strafeStarted: new Set(), dirtFired: new Set(), visible: false, impacts: PrevizStrafeImpacts(entry) });
    }
  }

  _Acquire(plane) {
    if (plane.slot) return plane.slot;
    const flight = this.aircraft();
    const root = flight?.AcquireClone?.(plane.entry.model) || null;
    if (!root) { this.missingModels.add(plane.entry.model); return null; }
    root.visible = true;
    this.root.add(root);
    plane.slot = { id: plane.entry.model, root };
    return plane.slot;
  }

  _Release(plane) {
    if (!plane.slot) return;
    const flight = this.aircraft();
    if (flight?.ReleaseClone) { try { flight.ReleaseClone(plane.slot); } catch (error) { plane.slot.root.removeFromParent(); } }
    else plane.slot.root.removeFromParent();
    plane.slot = null;
  }

  /**
   * 按预演时间 t 摆一遍。fire：跨过的一次性声音要放（from = 上一帧的 t）；seek 时不放。
   * groundAt(x,z) 给航点的 h 换世界高；listener {x,y,z} 用来挑近 / 远两条扫射声。
   */
  Update(t, { fire = false, from = -1e-6, groundAt = null, listener = null } = {}) {
    for (const plane of this.planes.values()) {
      const pose = SamplePrevizAircraft(plane.entry, t, { groundAt });
      plane.pose = pose;
      if (pose.visible) {
        const slot = this._Acquire(plane);
        if (slot) {
          slot.root.visible = true;
          slot.root.position.set(pose.x, pose.y, pose.z);
          slot.root.rotation.set(pose.climb || 0, Math.atan2(-pose.dirX, -pose.dirZ), pose.bank || 0, "YXZ");
        }
      } else if (plane.slot) plane.slot.root.visible = false;
      // 引擎声跟着机身走
      if (pose.visible && plane.entry.sound?.drone !== false) {
        if (!plane.drone && fire) plane.drone = this.sfx.StartLoop?.("planeDrone", pose) || null;
        if (plane.drone) this.sfx.MoveLoop?.(plane.drone, pose, { x: pose.vx || 0, y: pose.vy || 0, z: pose.vz || 0 });
      } else if (plane.drone) { this.sfx.StopLoop?.(plane.drone); plane.drone = null; }
      plane.visible = pose.visible;
      if (!fire) continue;
      // 一次性：俯冲通场声、扫射起手声、打土声（跨过 (from, t] 的）
      const diveT = plane.entry.sound?.diveT;
      if (Number.isFinite(diveT) && diveT > from && diveT <= t && !plane.dived) { plane.dived = true; this.sfx.Play?.("planeDive", pose); }
      (plane.entry.strafe || []).forEach((s, i) => {
        if (s.t0 > from && s.t0 <= t && !plane.strafeStarted.has(i)) {
          plane.strafeStarted.add(i);
          const d = listener ? Math.hypot(pose.x - listener.x, pose.y - (listener.y ?? 0), pose.z - listener.z) : Infinity;
          this.sfx.Play?.(d < PREVIZ_AIRCRAFT.strafeNearM ? "strafeNear" : "strafeFar", pose);
        }
      });
      for (const hit of plane.impacts) {
        if (!hit.dirt || hit.t <= from || hit.t > t) continue;
        const key = `${hit.segment}:${hit.index}`;
        if (plane.dirtFired.has(key)) continue;
        plane.dirtFired.add(key);
        this.sfx.Play?.("strafeDirt", { x: hit.x, z: hit.z, ground: true });
      }
    }
  }

  /** 这一段所有扫射的弹着点 → 给简易特效当「子弹打在土里」画：[{ t, x, z, radius }]。 */
  Blasts() {
    const out = [];
    for (const plane of this.planes.values()) for (const hit of plane.impacts) out.push({ t: hit.t, x: hit.x, z: hit.z, radius: PREVIZ_AIRCRAFT.strafeImpactRadius });
    return out;
  }

  /** 某架飞机此刻的位置（镜头锚 { aircraft } 用）；不在这一段里 → null。 */
  PoseOf(id) {
    const plane = this.planes.get(id);
    return plane?.pose || null;
  }

  /** 取证：每架的机型、可见、位置、模型有没有载进来。 */
  State() {
    return [...this.planes.values()].map(p => ({
      id: p.entry.id, model: p.entry.model, visible: !!p.visible, loaded: !!p.slot, drone: !!p.drone,
      x: p.pose ? +p.pose.x.toFixed(2) : null, y: p.pose ? +p.pose.y.toFixed(2) : null, z: p.pose ? +p.pose.z.toFixed(2) : null,
      yawDeg: p.pose ? +p.pose.yawDeg.toFixed(1) : null, bank: p.pose ? +p.pose.bank.toFixed(3) : null,
    }));
  }

  /** 播完 / 中断：克隆还回池子、引擎声淡出。 */
  Clear() {
    for (const plane of this.planes.values()) {
      if (plane.drone) { this.sfx.StopLoop?.(plane.drone); plane.drone = null; }
      this._Release(plane);
    }
    this.planes.clear();
    this.seq = null;
  }

  Dispose() {
    this.Clear();
    this.root.removeFromParent();
  }
}
