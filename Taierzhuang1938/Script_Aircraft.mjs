// 远距日军机群：纯渲染层，不登记碰撞体、不参与索敌或伤害。
// 资源在后台载入；任何一个模型失败都只略过该机，不得卡住关卡启动。
//
// ── 扫射是叠加能力，不是替换 ─────────────────────────────────────────────────
// 绕圈那一套（二关到终章的天上动静）一个字都没动。第一关的扫射航线由
// `Script_AircraftStrafe.mjs`（纯规则）算，本层每帧拿它的 `View()`：
// 航线点名的那一架**脱离圆周**由脚本摆位，其余两架照转；航线走完那一架
// 藏两秒半再归队 —— 从三百米外的航线末端瞬移回圆周上是看得见的，
// 而那两秒半里玩家的眼睛正贴在地面上（担架、伤员、路沟）。
//
// 本层不认识玩法：伤害、白名单、玩家窗口、story 信号全在规则层，
// 这里只负责「那架飞机这一帧在哪儿、机头朝哪儿」。

import * as THREE from "three";
import { GLTFLoader } from "./vendor/three/examples/jsm/loaders/GLTFLoader.js";
import { AIRCRAFT_ASSETS } from "./Data_AircraftAssets.mjs";

const LOADER = new GLTFLoader();
const _box = new THREE.Box3();
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();

function PrepareAircraft(gltf, spec) {
  const root = new THREE.Group();
  root.name = `Aircraft_${spec.id}`;
  const model = gltf.scene;
  model.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = false;
    node.receiveShadow = false;
    node.frustumCulled = true;
  });

  // 源模型的原点各不相同；把模型重心收回编队根节点，航迹的高度才稳定。
  _box.setFromObject(model);
  _box.getCenter(_center);
  model.position.copy(_center).multiplyScalar(-spec.scale);
  model.scale.setScalar(spec.scale);
  // 源模型机首朝向各不相同（AGENTS 硬规矩 4：外部 GLB 先查源朝向再经桥接层对齐）。
  // 按 Data_AircraftAssets 量出的 noseDir 把机首转到局部 -Z；根节点上的 yaw/climb/bank
  // 换算从此只认这一个约定。三件源模型没有一件天生朝 -Z。
  const align = new THREE.Group();
  align.name = "NoseAlign";
  align.rotation.y = NoseYaw(spec.noseDir);
  align.add(model);
  root.add(align);
  root.updateMatrixWorld(true);
  _box.setFromObject(align);
  _box.getSize(_size);
  root.userData.wingspan = _size.x;
  return root;
}

/**
 * 把源模型的机首方向 (x, z) 转到局部 -Z 所需的绕 Y 角。
 * three 的 rotation.y = φ 把 XZ 面上的航向角 atan2(x, z) 加 φ；目标航向 atan2(0, -1) = π。
 */
export function NoseYaw(noseDir) {
  if (!noseDir) return 0;
  return Math.PI - Math.atan2(noseDir.x, noseDir.z);
}

function DisposeObject(root) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.geometry?.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      for (const value of Object.values(material ?? {})) {
        if (value?.isTexture) value.dispose();
      }
      material?.dispose();
    }
  });
}

/** 航线走完之后那一架藏多久再归队（见文件头）。 */
const REJOIN_HIDE_S = 2.5;

/**
 * 天空中的机队。路径围绕当前关卡中心，故换关后不可能遗留在上关两公里外。
 */
export class AircraftFlight {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = "AircraftFlight";
    scene.add(this.group);
    this.forms = [];
    this.phase = null;
    this.anchor = new THREE.Vector2();
    /** 上一帧被扫射航线接管的那一架（用来认「航线刚走完」这个边沿）。 */
    this.strafeForm = null;
    /** 归队前的静默计时；> 0 时那一架不画。 */
    this.rejoinT = 0;
    this.lastElapsed = 0;
    this.manualPose = null;
  }

  async Load() {
    const settled = await Promise.allSettled(AIRCRAFT_ASSETS.map(async (spec) => {
      const gltf = await LOADER.loadAsync(spec.url);
      const root = PrepareAircraft(gltf, spec);
      if (this.phase?.whitebox?.p012 || this.phase?.ambientAircraft === false) root.visible = false;
      this.group.add(root);
      this.forms.push({ spec, root });
    }));
    return settled.filter((entry) => entry.status === "fulfilled").length;
  }

  SetPhase(phase) {
    this.phase = phase;
    this.manualPose = null;
    if (phase.whitebox?.p012 || phase.ambientAircraft === false) for (const { root } of this.forms) root.visible = false;
    this.anchor.set(
      (phase.bounds.minX + phase.bounds.maxX) * 0.5,
      (phase.bounds.minZ + phase.bounds.maxZ) * 0.5,
    );
  }

  /**
   * @param {number} elapsed 关内秒表（绕圈用；扫射航线自己带时间）
   * @param {object|null} strafe `AircraftStrafeDirector.View()`，没有航线就传 null
   */
  Update(elapsed, strafe = null) {
    // 秒表**先记**再看有没有关卡：换关那几秒 phase 是 null，不记的话下一帧
    // 会拿到一个几秒长的 dt，归队计时一帧就烧完。
    const dt = Math.max(0, Math.min(0.5, elapsed - this.lastElapsed));
    this.lastElapsed = elapsed;
    if (!this.phase) return;

    const taken = strafe && strafe.active ? this.FormFor(strafe.aircraft?.id) : null;
    if (taken) { this.strafeForm = taken; this.rejoinT = REJOIN_HIDE_S; }
    else if (this.rejoinT > 0) this.rejoinT = Math.max(0, this.rejoinT - dt);
    if (this.rejoinT <= 0) this.strafeForm = null;

    for (const form of this.forms) {
      const { spec, root } = form;
      if (this.manualPose?.id === spec.id) { ApplyStrafePose(root, this.manualPose.pose); root.visible = true; continue; }
      if (form === taken) { ApplyStrafePose(root, strafe.aircraft); root.visible = true; continue; }
      // P012 has a deliberate first railway pass: background orbiters never pre-empt it.
      if (this.phase.whitebox?.p012 || this.phase.ambientAircraft === false) { root.visible = false; continue; }
      // 航线刚走完的那一架：先藏着，别让它从航线末端瞬移回圆周上。
      if (form === this.strafeForm) { root.visible = false; continue; }
      root.visible = true;
      const angle = elapsed * spec.speed + spec.phaseOffset;
      const radiusX = spec.orbitRadius;
      const radiusZ = spec.orbitRadius * 0.62;
      const x = this.anchor.x + Math.cos(angle) * radiusX;
      const z = this.anchor.y + Math.sin(angle) * radiusZ;
      const dx = -Math.sin(angle) * radiusX;
      const dz = Math.cos(angle) * radiusZ;
      root.position.set(x, spec.altitude + Math.sin(angle * 2.0) * 7, z);
      // 机首已由 PrepareAircraft 对齐到局部 -Z；依路径切线转向，再给一点克制的滚转。
      root.rotation.set(0, Math.atan2(-dx, -dz), Math.cos(angle) * spec.bank, "YXZ");
    }
  }

  /** 按资产 id 认一架；认不出就用第一架（模型没载进来时航线不该整个作废）。 */
  FormFor(id) {
    if (!this.forms.length) return null;
    return this.forms.find((f) => f.spec.id === id) || this.forms[0];
  }

  /** A scripted call-in owns one aircraft until it leaves. Idle orbiters remain disabled. */
  SetManualPose(id, pose) {
    if (!pose) {
      const old = this.forms.find((form) => form.spec.id === this.manualPose?.id);
      if (old) old.root.visible = false;
      this.manualPose = null; return;
    }
    const form = this.FormFor(id);
    if (!form) return;
    this.manualPose = { id: form.spec.id, pose };
    ApplyStrafePose(form.root, pose); form.root.visible = true;
  }

  Dispose() {
    for (const { root } of this.forms) DisposeObject(root);
    this.group.removeFromParent();
    this.forms.length = 0;
    this.strafeForm = null;
    this.rejoinT = 0;
    this.manualPose = null;
  }
}

/**
 * 把规则层给的那一帧姿态摆到模型上。
 * 机首朝局部 -Z（PrepareAircraft 已按 noseDir 对齐），所以 yaw 与绕圈那条用同一个换算；
 * 爬升为正 = 抬头 = rotation.x 为正（对 (0,0,-1) 绕 X 转 +φ，y 分量变正）。
 */
function ApplyStrafePose(root, air) {
  if (!air) return;
  root.position.set(air.x, air.y, air.z);
  root.rotation.set(air.climb || 0, Math.atan2(-air.dirX, -air.dirZ), air.bank || 0, "YXZ");
}

/**
 * 给 `AircraftStrafeDirector` 的宿主适配器：把规则层的裸对象翻译成 three 调用。
 *
 * 放在本文件而不是装配层，是为了让 Script_Main 那边只剩一行接线 ——
 * 「哪个特效、哪条音效、哪个坐标系」是飞机这一侧的知识，不是启动顺序的知识。
 *
 * @param {object} deps { vfx, audio, hud, player, battlefield, Story, Soldiers }
 */
export function MakeAircraftStrafeHost(deps = {}) {
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const at = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const pos = new THREE.Vector3();
  return {
    Time: () => deps.Time?.() ?? 0,
    Play: (name, opts = {}) => {
      if (!deps.audio) return null;
      if (!opts.position) return deps.audio.Play(name, opts);
      pos.set(opts.position.x, opts.position.y, opts.position.z);
      return deps.audio.Play(name, { ...opts, position: pos.clone() });
    },
    Hint: (text, seconds) => deps.hud?.Hint(text, seconds),
    Say: (who, text, seconds) => deps.hud?.Say(who, text, seconds),
    Signal: (name) => deps.Story?.()?.Signal(name),
    Tracer: (a, b, opts) => {
      if (!deps.vfx) return;
      from.set(a.x, a.y, a.z);
      to.set(b.x, b.y, b.z);
      deps.vfx.Tracer(from, to, opts);
    },
    Impact: (point, n, surface) => {
      if (!deps.vfx) return;
      at.set(point.x, point.y, point.z);
      normal.set(n.x, n.y, n.z);
      deps.vfx.Impact(at, normal, surface);
    },
    GroundHeight: (x, z) => deps.battlefield?.()?.GroundHeight(x, z) ?? 0,
    HitPlayer: (damage, d, info) => {
      const player = deps.player?.();
      if (!player || !player.Alive) return;
      dir.set(d.x, d.y, d.z);
      // 「不躲则被击倒」：给的是必然放倒的一发，不是擦伤。**不能标 bullet** ——
      // Player.TakeHit 对 bullet 有单发上限（COMBAT.player.maxBulletDamage），
      // 标了就变成「挨了一梭子航空机枪还站着」。检查点（从数秒前重来）是装配层的事，
      // 见 Data_MissionCh1 ENGINE_REQUEST 6。
      const deadly = info?.lethal !== false;
      const amount = deadly ? Math.max(damage, (player.health ?? 100) + 40) : damage;
      const src = info?.from;
      player.TakeHit(amount, info?.part || "torso", dir, {
        from: src ? new THREE.Vector3(src.x, src.y, src.z) : null, bullet: false, blast: false,
      });
    },
    PlayerPos: () => {
      const player = deps.player?.();
      return player ? { x: player.position.x, y: player.position.y, z: player.position.z } : null;
    },
    Soldiers: () => deps.Soldiers?.() ?? null,
  };
}
