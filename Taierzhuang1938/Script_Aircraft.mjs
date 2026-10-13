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
//
// ── 编队层（2026-09-26，第一关 01–06 中远处轮番轰炸）──────────────────────────
// `SetFormation(key, poses)` / `SetBombs(key, list, look)`：规则在 Script_FirstLevelAirRaid。
// 编队机是原机的**克隆**（共用几何与材质，不另占显存），不抢原机 —— 原机一个 id 只有一架，
// 03 开头的横飞与 13 的扫射在用（SetManualPose）。收起的克隆与炸弹一律从场景图摘下。

import * as THREE from "three";
import { ManagedGLTFLoader as GLTFLoader } from "./Script_ModelImports.mjs";
import { AIRCRAFT_ASSETS, NoseYaw } from "./Data_AircraftAssets.mjs";

const LOADER = new GLTFLoader();
const _box = new THREE.Box3();
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();
// 摆炸弹实例用的临时量（SetBombs 每帧几十颗，别在循环里 new）。
const BOMB_EULER = new THREE.Euler();
const BOMB_QUAT = new THREE.Quaternion();
const BOMB_POS = new THREE.Vector3();
const BOMB_SCALE = new THREE.Vector3();
const BOMB_MATRIX = new THREE.Matrix4();

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

  // Preserve the source GLB transforms; normalize heading and metre scale in
  // a separate adapter. Ki-30 was authored nose +Z and with a 4.933m wingspan.
  const aligned = new THREE.Group();
  aligned.name = `AircraftAsset_${spec.id}`;
  aligned.rotation.y = NoseYaw(spec.noseDir);
  aligned.add(model);
  _box.setFromObject(aligned);
  _box.getCenter(_center);
  _box.getSize(_size);
  const scale = spec.wingspanM && _size.x > 0 ? spec.wingspanM / _size.x : spec.scale;
  aligned.scale.setScalar(scale);
  aligned.position.copy(_center).multiplyScalar(-scale);
  root.add(aligned);
  root.userData.wingspan = _size.x * scale;
  return root;
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

/**
 * FitToCamera 的最小视角（翼展对眼睛张的角，弧度）与补大上限。0.014 rad 在 1080p、垂直 70° 视野上约 12 个像素：
 * Ki-30（翼展 14.6 m）一千米外、Ki-21（22.5 m）一千六百米外开始补，再远最多放大 FIT_MAX_BOOST 倍。
 * 实拍（04、1280×720、低画质）：一千五百米外迎头来的 Ki-30 不补只剩烟里一道两三个像素的灰线。
 */
const FIT_MIN_ANGULAR_RAD = 0.014;
const FIT_MAX_BOOST = 1.8;   // 再大楔形里相邻两架（横距 32–38 m）的翼尖就碰上了

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
    /** 脚本摆位：资产 id -> pose。可以同时摆几架（第一关 03 开头两架横飞，Set 包 Data_OpeningSet0103.FLYOVER）。 */
    this.manualPoses = new Map();
  }
  /** 旧接口：只摆一架时的那一架（没有就是 null）。 */
  get manualPose() {
    const first = this.manualPoses.entries().next().value;
    return first ? { id: first[0], pose: first[1] } : null;
  }

  async Load() {
    const settled = await Promise.allSettled(AIRCRAFT_ASSETS.map(async (spec) => {
      const gltf = await LOADER.loadAsync(spec.url);
      const root = PrepareAircraft(gltf, spec);
      this.forms.push({ spec, root });
      this._Show(root, !(this.phase?.whitebox?.p012 || this.phase?.ambientAircraft === false));
    }));
    return settled.filter((entry) => entry.status === "fulfilled").length;
  }

  /**
   * 显示/隐藏一架。隐藏时**从场景图摘下来**而不只是 visible=false：
   * three 的 updateMatrixWorld 与预通道/阴影/主场景三趟 projectObject 都会递归
   * 不可见子树，三架轰炸机合计 200 多个节点，在看不见它们的靶场里每帧白走四遍。
   */
  _Show(root, on) {
    root.visible = !!on;
    if (on) { if (root.parent !== this.group) this.group.add(root); }
    else if (root.parent) root.parent.remove(root);
  }

  SetPhase(phase) {
    this.phase = phase;
    this.manualPoses.clear(); this.manualAlias?.clear();
    for (const key of [...(this.formations?.keys() || [])]) this.SetFormation(key, null);
    for (const key of [...(this.bombSets?.keys() || [])]) this.SetBombs(key, null);
    if (phase.whitebox?.p012 || phase.ambientAircraft === false) for (const { root } of this.forms) this._Show(root, false);
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
      const manual = this.manualPoses.get(spec.id);
      if (manual) { ApplyStrafePose(root, manual); this._Show(root, true); continue; }
      if (form === taken) { ApplyStrafePose(root, strafe.aircraft); this._Show(root, true); continue; }
      // P012 has a deliberate first railway pass: background orbiters never pre-empt it.
      if (this.phase.whitebox?.p012 || this.phase.ambientAircraft === false) { this._Show(root, false); continue; }
      // 航线刚走完的那一架：先藏着，别让它从航线末端瞬移回圆周上。
      if (form === this.strafeForm) { this._Show(root, false); continue; }
      this._Show(root, true);
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

  /**
   * A scripted call-in owns one aircraft until it leaves. Idle orbiters remain disabled.
   * Several ids can be posed at once (each id owns its own airframe); `pose = null` releases that id only.
   * Release goes through the id the caller posed with (manualAlias): an id that was never posed releases nothing
   * (it must not fall back to forms[0] and knock another caller's pose off). MitsubishiKi30 is shared by the mission
   * strafe (MISSION_AIRCRAFT_ID) and the 03 flyover wingman (Data_OpeningSet0103.FLYOVER): never schedule both in one step.
   */
  SetManualPose(id, pose) {
    this.manualAlias ??= new Map();
    if (!pose) {
      const key = this.manualAlias.get(id) ?? (this.manualPoses.has(id) ? id : null);
      this.manualAlias.delete(id);
      if (key == null || !this.manualPoses.has(key)) return;
      const old = this.forms.find((f) => f.spec.id === key);
      if (old) this._Show(old.root, false);
      this.manualPoses.delete(key); return;
    }
    const form = this.FormFor(id);
    if (!form) return;
    this.manualAlias.set(id, form.spec.id);
    this.manualPoses.set(form.spec.id, pose);
    ApplyStrafePose(form.root, pose); this._Show(form.root, true);
  }

  /**
   * 编队层：key 这一组摆成 poses（每一项 { id, x, y, z, dirX, dirZ, climb, bank }，id 是机型）。
   * poses 为空 = 收起这一组。模型还没载进来的那一架这一帧不画，下一帧再试。
   */
  SetFormation(key, poses) {
    this.formations ??= new Map();
    const list = this.formations.get(key) || [];
    const want = poses?.length || 0;
    for (let i = 0; i < want; i += 1) {
      const pose = poses[i];
      let slot = list[i];
      if (!slot || slot.id !== pose.id) {
        if (slot) this.ReleaseClone(slot);
        const root = this.AcquireClone(pose.id);
        list[i] = slot = root ? { id: pose.id, root } : null;
        if (!slot) continue;
      }
      ApplyStrafePose(slot.root, pose);
      this._Show(slot.root, true);
    }
    for (let i = want; i < list.length; i += 1) if (list[i]) this.ReleaseClone(list[i]);
    list.length = want;
    if (want) this.formations.set(key, list); else this.formations.delete(key);
  }

  /** 取一架 id 机型的克隆：先用收起来的，没有再从原机克隆。原机没载进来返回 null。 */
  AcquireClone(id) {
    this.clonePool ??= new Map();
    const idle = this.clonePool.get(id);
    if (idle?.length) return idle.pop();
    const form = this.forms.find((f) => f.spec.id === id);
    if (!form) return null;
    const root = form.root.clone(true);
    root.name = `${form.root.name}_Formation`;
    return root;
  }

  ReleaseClone(slot) {
    this._Show(slot.root, false);
    this.clonePool ??= new Map();
    if (!this.clonePool.has(slot.id)) this.clonePool.set(slot.id, []);
    this.clonePool.get(slot.id).push(slot.root);
  }

  /**
   * 在空中的炸弹：list 每一项 { x, y, z, dirX, dirZ, pitch, lengthM, radiusM, scale }
   *（pitch 为机头朝下的角；lengthM / radiusM 是弹体真尺寸，scale 是远处补足像素的放大倍数，
   * 由规则层按离听者的距离给）。没给逐颗尺寸的旧调用方用 look = { lengthM, radiusM, visualScale }。
   * 一组一只 InstancedMesh（一轮几十颗也只一次绘制），不够就按两倍扩容。空 list = 收起。
   */
  SetBombs(key, list, look = null) {
    this.bombSets ??= new Map();
    let set = this.bombSets.get(key);
    const want = list?.length || 0;
    if (!want) { if (set) this._Show(set.mesh, false); return; }
    if (!set || set.capacity < want) {
      const capacity = Math.max(16, 2 ** Math.ceil(Math.log2(want)));
      if (set) { this._Show(set.mesh, false); set.mesh.dispose(); }
      const mesh = new THREE.InstancedMesh(this.BombGeometry(), this.BombMaterial(), capacity);
      mesh.name = `AircraftBombs_${key}`;
      mesh.castShadow = false; mesh.receiveShadow = false;
      // 实例散在几百米的天上，包围球不跟着实例重算；一组只一次绘制，关掉剔除。
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      set = { mesh, capacity };
      this.bombSets.set(key, set);
    }
    const fallback = look || { lengthM: 1.1, radiusM: 0.17, visualScale: 1 };
    for (let i = 0; i < want; i += 1) {
      const b = list[i];
      const length = b.lengthM ?? fallback.lengthM, radius = b.radiusM ?? fallback.radiusM;
      const s = b.scale ?? fallback.visualScale ?? 1;
      BOMB_EULER.set(-(b.pitch || 0), Math.atan2(-b.dirX, -b.dirZ), 0, "YXZ");
      BOMB_QUAT.setFromEuler(BOMB_EULER);
      BOMB_POS.set(b.x, b.y, b.z);
      BOMB_SCALE.set(radius * s, radius * s, length * s);
      set.mesh.setMatrixAt(i, BOMB_MATRIX.compose(BOMB_POS, BOMB_QUAT, BOMB_SCALE));
    }
    set.mesh.count = want;
    set.mesh.instanceMatrix.needsUpdate = true;
    this._Show(set.mesh, true);
  }

  /**
   * 单位弹体：最大半径 1、全长 1，机头朝局部 -Z（与飞机同一个约定），逐颗按真尺寸非等比缩放。
   * 尖拱形弹头、圆柱弹身、收口的尾锥 + 十字尾翼 —— 近处看得出是炸弹，远处一个像素也还是一个像素。
   * 手拼成一只非索引几何（不引 addon 的 BufferGeometryUtils）。
   */
  BombGeometry() {
    if (this.bombGeometry) return this.bombGeometry;
    const profile = [[0, -0.5], [0.3, -0.5], [0.55, -0.36], [0.86, -0.24], [1, -0.14], [1, 0.12], [0.97, 0.24],
      [0.86, 0.34], [0.62, 0.42], [0.34, 0.475], [0, 0.5]].map(([r, y]) => new THREE.Vector2(r, y));
    const parts = [new THREE.LatheGeometry(profile, 10)];
    for (const [w, d] of [[0.07, 2.5], [2.5, 0.07]]) {
      const fin = new THREE.BoxGeometry(w, 0.26, d);
      fin.translate(0, -0.37, 0);
      parts.push(fin);
    }
    const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
    const count = flat.reduce((n, g) => n + g.attributes.position.count, 0);
    const position = new Float32Array(count * 3), normal = new Float32Array(count * 3);
    let offset = 0;
    for (const g of flat) {
      position.set(g.attributes.position.array, offset * 3);
      normal.set(g.attributes.normal.array, offset * 3);
      offset += g.attributes.position.count;
    }
    for (const g of new Set([...parts, ...flat])) g.dispose();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
    geometry.rotateX(-Math.PI / 2);        // 车床沿 +Y 转出来，弹头 +Y → 局部 -Z
    geometry.computeBoundingSphere();
    this.bombGeometry = geometry;
    return geometry;
  }

  BombMaterial() {
    // 日军航弹的暗灰涂装，半光：天上那几个像素读成「一个暗点」而不是一粒反光。
    this.bombMaterial ??= new THREE.MeshStandardMaterial({ color: 0x2b2c28, roughness: 0.6, metalness: 0.35 });
    return this.bombMaterial;
  }

  /**
   * 开机预热用的代理（Script_Main.WarmLevel 挂进它的代理组、编译并画一帧、再整组摘掉）：
   * 每个已载入的机型一架临时克隆 + 一颗炸弹。P012 的原机不在场景图里，没有这一件的话
   * 第一轮编队 / 03 横飞进视野那一帧才现编它们的材质。模型还没载完的机型这一趟就漏掉。
   */
  WarmProxy() {
    const group = new THREE.Group();
    group.name = "AircraftWarmProxy";
    for (const form of this.forms) {
      const clone = form.root.clone(true);
      clone.visible = true;
      clone.scale.multiplyScalar(0.02);    // 缩到几十厘米：它只是来编材质的
      group.add(clone);
    }
    // 炸弹一组一只 InstancedMesh：预热的也得是实例化的那一份程序（含深度预通道的实例化变体）。
    const bombs = new THREE.InstancedMesh(this.BombGeometry(), this.BombMaterial(), 1);
    bombs.setMatrixAt(0, BOMB_MATRIX.makeScale(0.1, 0.1, 0.5));
    bombs.frustumCulled = false;
    group.add(bombs);
    return group;
  }

  /**
   * 远平面以外的飞机拉进来画（2026-10-14 用户：「飞机离远了就看不到了」）。
   * 第一关远平面 650 m（白盒 1100 m），而空袭编队在落区前 2 km 进场、过后 1.7 km 才离场 ——
   * 远平面一裁，编队在天上凭空出现、凭空消失。远平面不能为几架飞机整关推远（剔除与深度精度都靠它）。
   * 做法：超出 fitShare·far 的那一架沿视线挪到 fitShare·far 处、按距离同比缩小 —— 屏幕上的方向与大小
   * 不变（再远一点另按 FIT_MIN_ANGULAR_RAD 补大），只是深度近了：比它近的地物照样挡住它，远平面那一圈里的地物挡不住它（天上本来就没东西）。
   * 只在出画那一刻挪：Script_Main 在整帧唯一一次 updateMatrixWorld 前调本方法、之后调 RestoreFit，
   * 玩法读到的 position 始终是真位置。
   */
  FitToCamera(camera, fitShare = 0.9) {
    this.RestoreFit();
    const limit = camera.far * fitShare;
    const e = camera.matrixWorld.elements, cx = e[12], cy = e[13], cz = e[14];
    this._fitted ??= [];
    for (const root of this.group.children) {
      if (!root.visible || root.isInstancedMesh) continue;   // 炸弹那一组的位姿在实例矩阵里，网格本身钉在原点
      const p = root.position, dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
      const d = Math.hypot(dx, dy, dz);
      // 远到翼展不足 FIT_MIN_ANGULAR_RAD 时按距离补大（同炸弹的 minAngularRad）：两三公里外的编队还读得出是飞机。
      const span = root.userData.wingspan || 0;
      const boost = span > 0 ? Math.min(FIT_MAX_BOOST, Math.max(1, FIT_MIN_ANGULAR_RAD * d / span)) : 1;
      const k = d > limit ? limit / d : 1;
      if (k === 1 && boost === 1) continue;
      this._fitted.push({ root, x: p.x, y: p.y, z: p.z, s: root.scale.x });
      if (k < 1) p.set(cx + dx * k, cy + dy * k, cz + dz * k);
      root.scale.setScalar(root.scale.x * k * boost);
    }
  }

  /** 把 FitToCamera 挪过的放回真位置（世界矩阵留着出画用的那一份，下一帧 updateMatrixWorld 再算）。 */
  RestoreFit() {
    if (!this._fitted?.length) return;
    for (const f of this._fitted) { f.root.position.set(f.x, f.y, f.z); f.root.scale.setScalar(f.s); }
    this._fitted.length = 0;
  }

  Dispose() {
    this.RestoreFit();
    for (const key of [...(this.formations?.keys() || [])]) this.SetFormation(key, null);
    this.clonePool?.clear();
    for (const set of this.bombSets?.values() || []) { this._Show(set.mesh, false); set.mesh.dispose(); }
    this.bombSets?.clear();
    this.bombGeometry?.dispose(); this.bombMaterial?.dispose();
    this.bombGeometry = this.bombMaterial = null;
    for (const { root } of this.forms) DisposeObject(root);
    this.group.removeFromParent();
    this.forms.length = 0;
    this.strafeForm = null;
    this.rejoinT = 0;
    this.manualPoses.clear();
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
    // 会飞的引擎声：规则层每帧给机位与速度，音频层搬方位、算多普勒；离场淡出。
    MoveVoice: (voice, point, opts) => deps.audio?.MoveVoice?.(voice, point, opts) ?? false,
    StopVoice: (voice, fadeS) => deps.audio?.StopVoice?.(voice, fadeS) ?? false,
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
      // 弹着落在玩家几米内：震一下（Script_CameraShake.Strafe 自己按距离衰减、封顶）。
      const shaken = deps.player?.();
      if (shaken?.shake && shaken.Alive) {
        shaken.shake.Strafe(Math.hypot(point.x - shaken.position.x, point.z - shaken.position.z));
      }
      if (!deps.vfx) return;
      at.set(point.x, point.y, point.z);
      normal.set(n.x, n.y, n.z);
      deps.vfx.Impact(at, normal, surface, { weaponKind: "hmg" });
    },
    GroundHeight: (x, z) => deps.battlefield?.()?.GroundHeight(x, z) ?? 0,
    CanHitPlayer: origin => {
      const player=deps.player?.(),field=deps.battlefield?.();if(!player?.Alive||!field)return false;
      from.set(origin.x,origin.y,origin.z);to.copy(player.EyePosition);
      dir.copy(to).sub(from);const distance=dir.length();
      const hit=field.Raycast(from,dir.normalize(),distance);return !hit||hit.t>=distance-.2;
    },
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
        from: src ? new THREE.Vector3(src.x, src.y, src.z) : null, bullet: false, projectile: true, blast: false,
      });
    },
    PlayerPos: () => {
      const player = deps.player?.();
      return player ? { x: player.position.x, y: player.position.y, z: player.position.z } : null;
    },
    Soldiers: () => deps.Soldiers?.() ?? null,
  };
}
