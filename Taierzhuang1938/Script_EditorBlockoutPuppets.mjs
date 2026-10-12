// 白盒关卡编辑器的独立演员（docs/Data_EditorBlockout.md §5.6）。
//
// 只看布设：演员**不进 ai.soldiers**（不吃子弹、不挡人、不进 AI），位置、朝向、姿态
// 全由关键帧数据决定。人用 actorFactory 造的正式人物（动作库、步态照旧），战车 / 担架 /
// 车 / 牲口是简单体块。关键帧之间的移动按 PlanTransition 的计划走（SampleTransition 取样），
// 整段太长时按 playbackRate 快进，人物动画用同一个倍率。
//
// 距离分级：60 m 外每 3 帧才推一次动画（累计 dt），影子只在 25 m 内开；一关同时最多
// 120 个人物，超出时远处的只留地环与标签（标记层照画），并报一次警告。

import * as THREE from "three";
import { SampleTransition } from "./Script_EditorBlockoutConfig.mjs";
import { InstallAllyGait } from "./Script_AllyGait.mjs";
import { SetRelaxedGait, EnsureRelaxedGait } from "./Script_RelaxedGait.mjs";

export const BLOCKOUT_PUPPETS = Object.freeze({
  maxActors: 120,
  farAnimM: 60,
  farAnimEvery: 3,
  shadowM: 25,
  childScale: 0.62,
  tank: { w: 2.18, d: 5.75, h: 1.2, turretW: 1.5, turretD: 1.7, turretH: 0.75, barrel: 1.6 },
  litter: { w: 0.7, d: 2.1, y: 0.78, groundY: 0.12, bearerGapM: 0.55 },
  cart: { w: 1.5, d: 2.4, h: 0.55, y: 0.75, wheel: 0.62 },
  animal: { w: 0.6, d: 1.7, h: 0.75, y: 0.95, head: 0.55 },
});

const DEG = Math.PI / 180;

function ActorKind(unit) {
  if (unit.kind === "officer") return unit.side === "ija" ? "ijaOfficer" : "nraOfficer";
  if (unit.kind === "civilian" || unit.kind === "child" || unit.side === "civ") return "civilian";
  return unit.side === "ija" ? "ija" : "nra";
}

/** 担架上有几个人抬、各站哪头（§3 bearers，缺省 2；只剩一人时留前头）。 */
export function LitterSlots(unit) {
  const n = Number.isInteger(unit?.bearers) ? Math.max(0, Math.min(2, unit.bearers)) : 2;
  return n >= 2 ? ["front", "rear"] : n === 1 ? ["front"] : [];
}

/**
 * 担架怎么摆：抬着 → 杆在手的高度、放平；只剩前头一人 → 前头在手上、后头着地（斜着）；
 * 没人抬或抬的人倒了（state:"down"）→ 平放在地上。→ { y, tilt }（y 是担架面中心离地高度，tilt 绕 X 的弧度，前高为正）
 */
export function LitterPose(unit, down = unit?.state === "down") {
  const l = BLOCKOUT_PUPPETS.litter;
  const slots = LitterSlots(unit);
  if (down || slots.length === 0) return { y: l.groundY, tilt: 0 };
  if (slots.length === 1) {
    const half = (l.d + 0.9) / 2;
    const tilt = Math.asin(Math.min(0.9, (l.y - l.groundY) / (2 * half)));
    return { y: (l.y + l.groundY) / 2, tilt };
  }
  return { y: l.y, tilt: 0 };
}

function HashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 100000;
}

/** 体块用的一份材质（白盒画质下照例被换成灰网格；其它画质下是这几种颜色）。 */
function BlockMaterial(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 });
}

function Box(group, material, w, h, d, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

export class BlockoutPuppets {
  constructor({ scene, actorFactory, groundAt }) {
    this.scene = scene;
    this.actorFactory = actorFactory;
    this.groundAt = groundAt;
    this.root = new THREE.Group();
    this.root.name = "BlockoutPuppets";
    scene.add(this.root);
    this.materials = {
      ija: BlockMaterial(0x6b4a3e), nra: BlockMaterial(0x4a5a66), civ: BlockMaterial(0x6d6a52),
      wood: BlockMaterial(0x7a6448), cloth: BlockMaterial(0xb7ad94), dark: BlockMaterial(0x333638),
    };
    this.puppets = new Map();
    this.plan = null;
    this.planTime = 0;
    this.frame = 0;
    this.elapsed = 0;
    this.warning = null;
    this.actorCount = 0;
  }

  get transitioning() { return !!this.plan; }

  // -------------------------------------------------------------------------
  // 造 / 拆

  _MakeHuman(unit, slot, kind = ActorKind(unit), weapon = unit.weapon ?? null) {
    let actor = null;
    try {
      actor = this.actorFactory.Create(kind, { seed: HashSeed(`${unit.id}:${slot}`), weapon });
    } catch (error) {
      console.warn("[BlockoutPuppets] actor create failed", unit.id, error);
      return null;
    }
    if (unit.kind === "child") actor.root.scale.setScalar(BLOCKOUT_PUPPETS.childScale);
    this.root.add(actor.root);
    // 步态安装器吃一个「假士兵」：只要 id / actor / position / yaw 与几个开关。
    const soldier = { id: `blockout:${unit.id}:${slot}`, actor, position: actor.root.position, yaw: 0, alive: true,
      side: unit.side, missionCombatAlert: !!unit.aim };
    try {
      // 步态库是异步下载的：下不来就用缺省动作，不能留一条未处理的 rejection。
      if (kind === "nra" || kind === "nraOfficer") InstallAllyGait(soldier)?.catch?.(() => {});
      else if (kind === "ija") SetRelaxedGait(soldier, unit.aim ? null : "alert");
    } catch (error) { /* 同上 */ }
    return { actor, soldier, kind, slot, animDt: 0 };
  }

  _MakeBody(unit) {
    const m = this.materials, P = BLOCKOUT_PUPPETS;
    const group = new THREE.Group();
    group.name = `BlockoutPuppet_${unit.id}`;
    const side = unit.side === "ija" ? m.ija : unit.side === "civ" ? m.civ : m.nra;
    if (unit.kind === "tank") {
      const t = P.tank;
      Box(group, side, t.w, t.h, t.d, 0, 0.35 + t.h / 2, 0);
      Box(group, m.dark, t.w + 0.16, 0.7, t.d * 0.96, 0, 0.35, 0);
      Box(group, side, t.turretW, t.turretH, t.turretD, 0, 0.35 + t.h + t.turretH / 2, 0.35);
      Box(group, m.dark, 0.14, 0.14, t.barrel, 0, 0.35 + t.h + t.turretH / 2, 0.35 - t.turretD / 2 - t.barrel / 2);
    } else if (unit.kind === "litter") {
      // 担架单独一个组：抬着 / 一头着地 / 放在地上 由 _Pose 摆高度与倾角（LitterPose）
      const l = P.litter;
      const bed = new THREE.Group();
      bed.name = "BlockoutStretcher";
      Box(bed, m.cloth, l.w, 0.1, l.d, 0, 0, 0);
      Box(bed, m.wood, 0.05, 0.05, l.d + 0.9, -l.w / 2, 0.03, 0);
      Box(bed, m.wood, 0.05, 0.05, l.d + 0.9, l.w / 2, 0.03, 0);
      group.add(bed);
      group.userData.stretcher = bed;
    } else if (unit.kind === "cart" || unit.kind === "animal") {
      if (unit.kind === "cart") {
        const c = P.cart;
        Box(group, m.wood, c.w, c.h, c.d, 0, c.y, 0);
        for (const sx of [-1, 1]) {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(c.wheel / 2, c.wheel / 2, 0.08, 14), m.dark);
          wheel.rotation.z = Math.PI / 2; wheel.position.set(sx * (c.w / 2 + 0.06), c.wheel / 2, 0.2);
          wheel.castShadow = true; group.add(wheel);
        }
        Box(group, m.wood, 0.06, 0.06, 1.6, -0.35, c.y - 0.1, -c.d / 2 - 0.8);
        Box(group, m.wood, 0.06, 0.06, 1.6, 0.35, c.y - 0.1, -c.d / 2 - 0.8);
      }
      if (unit.kind === "animal" || unit.animal !== false) {
        const a = P.animal, z = unit.kind === "cart" ? -P.cart.d / 2 - 1.35 : 0;
        Box(group, m.civ, a.w, a.h, a.d, 0, a.y, z);
        Box(group, m.civ, 0.3, 0.45, a.head, 0, a.y + 0.35, z - a.d / 2 - 0.15);
        for (const [lx, lz] of [[-0.2, -0.6], [0.2, -0.6], [-0.2, 0.6], [0.2, 0.6]]) Box(group, m.civ, 0.12, a.y - a.h / 2, 0.12, lx, (a.y - a.h / 2) / 2, z + lz);
      }
    }
    this.root.add(group);
    return group;
  }

  _Create(unit, allowActors) {
    const puppet = { id: unit.id, unit, body: null, humans: [], x: unit.x, z: unit.z, yawDeg: unit.yawDeg, stance: unit.stance,
      moving: false, speedMps: 0, visible: true, down: unit.state === "down", noActor: false, stagger: HashSeed(unit.id) };
    const bodyKinds = ["tank", "litter", "cart", "animal"];
    if (bodyKinds.includes(unit.kind)) puppet.body = this._MakeBody(unit);
    if (unit.kind === "litter") {
      // §3 bearers：2 = 前后两人抬；1 = 只剩前头一人（后端着地）；0 = 担架放在地上，没人抬
      const slots = LitterSlots(unit);
      if (slots.length && allowActors >= slots.length) {
        for (const slot of slots) {
          const human = this._MakeHuman({ ...unit, kind: "soldier", side: unit.side === "civ" ? "civ" : "nra", aim: false }, slot, unit.side === "civ" ? "civilian" : "nra", null);
          if (human) puppet.humans.push(human);
        }
      } else if (slots.length) puppet.noActor = true;
    } else if (!bodyKinds.includes(unit.kind)) {
      if (allowActors >= 1) {
        const human = this._MakeHuman(unit, "main");
        if (human) puppet.humans.push(human);
      } else puppet.noActor = true;
    }
    this.actorCount += puppet.humans.length;
    return puppet;
  }

  _Destroy(puppet) {
    for (const human of puppet.humans) {
      try { human.actor.Dispose(); } catch (error) { /* already gone */ }
    }
    this.actorCount -= puppet.humans.length;
    puppet.humans.length = 0;
    if (puppet.body) {
      puppet.body.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
      puppet.body.removeFromParent();
      puppet.body = null;
    }
  }

  /** 演员名额：按到相机的距离分，近的先给（超出上限的只留地环与标签）。 */
  _Budget(units, cameraPosition) {
    const need = u => (u.kind === "litter" ? LitterSlots(u).length : ["tank", "cart", "animal"].includes(u.kind) ? 0 : 1);
    const total = units.reduce((n, u) => n + need(u), 0);
    const allow = new Map();
    if (total <= BLOCKOUT_PUPPETS.maxActors) { for (const u of units) allow.set(u.id, need(u)); this.warning = null; return allow; }
    const cx = cameraPosition?.x ?? 0, cz = cameraPosition?.z ?? 0;
    let left = BLOCKOUT_PUPPETS.maxActors;
    for (const u of [...units].sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))) {
      const n = need(u);
      allow.set(u.id, n <= left ? n : 0);
      if (n <= left) left -= n;
    }
    this.warning = `这一帧有 ${total} 个人物，超过上限 ${BLOCKOUT_PUPPETS.maxActors}，远处的只画地环与标签`;
    console.warn(`[BlockoutPuppets] ${total} actors > ${BLOCKOUT_PUPPETS.maxActors}; far units keep markers only`);
    return allow;
  }

  /** 让场上的演员与 units 一一对应：同 id 复用；种类 / 阵营变了或从倒地站起来就重造。 */
  _Sync(units, cameraPosition) {
    const allow = this._Budget(units, cameraPosition);
    const keep = new Set();
    for (const unit of units) {
      keep.add(unit.id);
      let puppet = this.puppets.get(unit.id);
      const wantActors = allow.get(unit.id) ?? 0;
      const stale = puppet && (puppet.unit.kind !== unit.kind || puppet.unit.side !== unit.side
        || (puppet.unit.weapon ?? null) !== (unit.weapon ?? null)
        || (unit.kind === "litter" && LitterSlots(puppet.unit).length !== LitterSlots(unit).length)
        || (puppet.down && unit.state !== "down")
        || (puppet.noActor && wantActors > 0) || (!puppet.noActor && wantActors === 0 && puppet.humans.length > 0));
      if (stale) { this._Destroy(puppet); this.puppets.delete(unit.id); puppet = null; }
      if (!puppet) { puppet = this._Create(unit, wantActors); this.puppets.set(unit.id, puppet); }
      puppet.unit = unit;
      for (const human of puppet.humans) {
        human.soldier.missionCombatAlert = !!unit.aim;
        if (human.kind === "ija") SetRelaxedGait(human.soldier, unit.aim ? null : "alert");
      }
    }
    for (const [id, puppet] of this.puppets) if (!keep.has(id)) { this._Destroy(puppet); this.puppets.delete(id); }
  }

  // -------------------------------------------------------------------------
  // 关键帧

  /** 直接到位（后退、跨多个、切关、首次载入）。 */
  Apply(units, cameraPosition = null) {
    this.plan = null;
    this.planTime = 0;
    this._Sync(units, cameraPosition);
    for (const unit of units) {
      const puppet = this.puppets.get(unit.id);
      Object.assign(puppet, { x: unit.x, z: unit.z, yawDeg: unit.yawDeg, stance: unit.stance, moving: false, speedMps: 0, visible: true,
        down: unit.state === "down" });
      this._Pose(puppet, 0, true);
    }
  }

  /**
   * 从 fromUnits 过渡到 toUnits（plan 来自 PlanTransition(fromKf, toKf)）。
   * 先把两边出现过的单位都摆出来：只在新关键帧有的先藏着（appear 起步时才出现），
   * 只在旧关键帧有的照旧站在原处（vanish 结束时藏掉，过渡收尾再回收）。
   */
  Transition(plan, fromUnits, toUnits, cameraPosition = null) {
    const byId = new Map();
    for (const unit of fromUnits || []) byId.set(unit.id, unit);
    for (const unit of toUnits || []) byId.set(unit.id, unit);   // 新关键帧的数据优先（种类、名字、武器）
    this.toUnits = toUnits || [];
    this._Sync([...byId.values()], cameraPosition);
    this.plan = plan;
    this.planTime = 0;
    this._SamplePlan(true);
  }

  _SamplePlan(snap = false) {
    const states = SampleTransition(this.plan, this.planTime);
    for (const s of states) {
      const puppet = this.puppets.get(s.id);
      if (!puppet) continue;
      puppet.x = s.x; puppet.z = s.z; puppet.yawDeg = s.yawDeg; puppet.stance = s.stance;
      puppet.moving = s.moving; puppet.speedMps = s.speedMps; puppet.visible = s.visible;
      if (snap) this._Pose(puppet, 0, true);
    }
  }

  _Finish() {
    const units = this.toUnits || [];
    this.plan = null;
    this.planTime = 0;
    this.toUnits = null;
    const keep = new Set(units.map(u => u.id));
    for (const [id, puppet] of this.puppets) if (!keep.has(id)) { this._Destroy(puppet); this.puppets.delete(id); }
    for (const unit of units) {
      const puppet = this.puppets.get(unit.id);
      if (!puppet) continue;
      puppet.unit = unit;
      Object.assign(puppet, { x: unit.x, z: unit.z, yawDeg: unit.yawDeg, stance: unit.stance, moving: false, speedMps: 0, visible: true,
        down: unit.state === "down" });
    }
  }

  // -------------------------------------------------------------------------
  // 每帧

  /** 把 puppet 的位姿写进体块与人物，并推动画（dt 已含 playbackRate）。 */
  _Pose(puppet, dt, force = false, cameraPosition = null) {
    const y = this.groundAt(puppet.x, puppet.z);
    const ry = puppet.yawDeg * DEG;
    if (puppet.body) {
      puppet.body.visible = puppet.visible;
      puppet.body.position.set(puppet.x, y, puppet.z);
      puppet.body.rotation.y = ry;
      const bed = puppet.body.userData.stretcher;
      if (bed) {
        const pose = LitterPose(puppet.unit, !!puppet.down);
        bed.position.y = pose.y;
        bed.rotation.x = pose.tilt;
      }
    }
    const unit = puppet.unit;
    const fx = -Math.sin(ry), fz = -Math.cos(ry);
    const distance = cameraPosition ? Math.hypot(puppet.x - cameraPosition.x, puppet.z - cameraPosition.z) : 0;
    for (const human of puppet.humans) {
      const actor = human.actor;
      let x = puppet.x, z = puppet.z;
      if (unit.kind === "litter") {
        const offset = BLOCKOUT_PUPPETS.litter.d / 2 + BLOCKOUT_PUPPETS.litter.bearerGapM;
        const sign = human.slot === "front" ? 1 : -1;
        x += fx * offset * sign; z += fz * offset * sign;
      }
      actor.root.visible = puppet.visible;
      actor.root.position.set(x, this.groundAt(x, z), z);
      actor.root.rotation.y = ry;
      human.soldier.yaw = ry;
      if (human.kind === "ija") EnsureRelaxedGait(human.soldier);
      human.animDt += dt;
      const far = distance > BLOCKOUT_PUPPETS.farAnimM;
      if (!force && far && (this.frame + puppet.stagger) % BLOCKOUT_PUPPETS.farAnimEvery !== 0) continue;
      const step = force ? Math.max(human.animDt, 1 / 60) : human.animDt;
      human.animDt = 0;
      if (!puppet.visible) continue;
      const mps = puppet.moving ? puppet.speedMps : 0;
      const litter = unit.kind === "litter";
      actor.Update(step, {
        moveSpeed: mps / 3.6, moveSpeedMps: mps, locomotionTracked: true, elapsed: this.elapsed,
        aim: unit.aim && !litter ? 1 : 0,
        crouch: !litter && puppet.stance === "crouch" ? 1 : 0,
        prone: !litter && puppet.stance === "prone" ? 1 : 0,
        grounded: true, lookYaw: 0, lookPitch: 0, firing: false,
        dead: !!puppet.down && !puppet.moving,
        ...(litter ? { carryRole: human.slot } : {}),
      });
      if (cameraPosition) actor.SetShadowEnabled(distance < BLOCKOUT_PUPPETS.shadowM);
    }
  }

  Update(dt, cameraPosition) {
    this.frame += 1;
    let rate = 1;
    if (this.plan) {
      rate = this.plan.playbackRate || 1;
      this.planTime += dt * rate;
      this._SamplePlan(false);
      if (this.planTime >= this.plan.durationS) this._Finish();
    }
    this.elapsed += dt * rate;
    for (const puppet of this.puppets.values()) this._Pose(puppet, dt * rate, false, cameraPosition);
  }

  /** 演员现场位置（标记层与俯视图读）。 */
  Live() {
    const out = [];
    for (const puppet of this.puppets.values()) {
      out.push({ id: puppet.id, x: puppet.x, z: puppet.z, yawDeg: puppet.yawDeg, moving: puppet.moving, visible: puppet.visible,
        stance: puppet.stance, actors: puppet.humans.length, noActor: puppet.noActor });
    }
    return out;
  }

  Dispose() {
    for (const puppet of this.puppets.values()) this._Destroy(puppet);
    this.puppets.clear();
    this.plan = null;
    this.root.removeFromParent();
    for (const material of Object.values(this.materials)) material.dispose();
  }
}
