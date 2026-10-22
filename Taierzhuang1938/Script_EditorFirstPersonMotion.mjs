// 第一人称持枪移动检查（叠加工具，2026-10-23）：玩法照跑，画面换到玩家身旁的外部机位，
// 看第一人称画面里看不到的东西 —— 腿脚怎么迈、胯和上身朝哪、枪和双手实际在哪儿。
//
// 只读观察，不改任何玩法与手感数据：
//   · 玩家照常 WASD / 鼠标 / 开枪 / 开镜；鼠标转的是玩家视线，不是观察机位。
//   · 枪和双手（Viewmodel）本来挂在主相机下。主相机要搬去外部机位，所以开着工具时把 Viewmodel
//     挂到一台「替身眼睛」（PerspectiveCamera，每帧抄玩家相机的位姿与 FOV）上 —— 它在世界里的位置
//     就是玩家眼睛，Viewmodel 读 parent.fov 的那套 FOV 补偿照旧算。退出时挂回主相机。
//   · 「枪和手」默认按真实尺寸画（fovRig 的窄 FOV 深度压缩只在观察这一帧压回 1，下一帧开头还原，
//     玩家画面与弹道不受影响）；也可以切到「画面里的压缩版」看玩家眼里那一份的几何。
//   · 辅助线（视锥、碰撞胶囊、朝向箭头、脚印）走 post.AddDebugOverlay，不进场景图、不进预通道。
//
// 接线（Script_Main 只经编辑器套件碰它，见 Script_Editor.SyncOverlayEye / ApplyOverlayCamera / ScaleDt）：
//   1) 玩家相机与 FOV 写完、Viewmodel.Update 之前：SyncEye(camera) —— 抄玩家眼睛；
//   2) 剧本 / 白盒预演 / 测试场相机都没接管时：ApplyCamera(camera) —— 主相机挪到观察机位；
//   3) dt 乘慢放倍率。
// 口径与验收见 docs/Data_EditorSuite.md「第一人称持枪移动检查」。

import * as THREE from "three";
import { Panel, Section, Chips, Toggle, Slider, Facts, Note, ButtonRow } from "./Script_EditorUi.mjs";
import { InjectDepthPull } from "./Script_Post.mjs";
import { STANCE } from "./Data_Tuning_Player.mjs";

const DEG = Math.PI / 180;

/**
 * 观察机位。yawDeg：0 = 在玩家正后方，+90 = 右侧，180 = 正前，-90 = 左侧；pitchDeg 正 = 从上往下看；
 * dist 米；aimH = 看玩家身上哪个高度（米，离脚底）。
 */
export const MOTION_VIEWS = Object.freeze([
  { id: "right", label: "右侧", yawDeg: 90, pitchDeg: 8, dist: 3.0, aimH: 0.95 },
  { id: "front", label: "正前", yawDeg: 180, pitchDeg: 10, dist: 3.0, aimH: 1.0 },
  { id: "left", label: "左侧", yawDeg: -90, pitchDeg: 8, dist: 3.0, aimH: 0.95 },
  { id: "rearRight", label: "右后上", yawDeg: 35, pitchDeg: 22, dist: 2.6, aimH: 1.2 },
  { id: "frontLow", label: "左前低", yawDeg: -140, pitchDeg: 2, dist: 2.2, aimH: 0.45 },
  { id: "feet", label: "脚下", yawDeg: 70, pitchDeg: 4, dist: 1.6, aimH: 0.15 },
  { id: "top", label: "俯视", yawDeg: 0, pitchDeg: 84, dist: 3.6, aimH: 0.6 },
]);

export const MOTION_KEYS = Object.freeze({ cycleView: "KeyJ", slowMo: "KeyK", firstPerson: "KeyL", zoomIn: "BracketLeft", zoomOut: "BracketRight" });
export const MOTION_SLOW_STEPS = Object.freeze([1, 0.5, 0.25, 0.1]);

const COLORS = Object.freeze({
  frustum: new THREE.Color(0xffe066), ray: new THREE.Color(0xffd23f), capsule: new THREE.Color(0x5fd4e8),
  aim: new THREE.Color(0xffd23f), hips: new THREE.Color(0xff9a3c), velocity: new THREE.Color(0x7fe07a),
  footL: new THREE.Color(0x6fb3ff), footR: new THREE.Color(0xff7a6a), swing: new THREE.Color(0xffffff),
});
const FOOTPRINT = Object.freeze({ lengthM: 0.26, widthM: 0.1, keep: 16, fadeS: 6 });
const OBSERVER_FOV = 50;

/** 一根动态 LineSegments：每帧 Begin → Line… → End。 */
class LineLayer {
  constructor(capacity = 4096) {
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.material = InjectDepthPull(new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.95, depthTest: true, depthWrite: false, toneMapped: false, fog: false,
    }), 0.003);
    this.material.name = "FirstPersonMotionLines";
    this.lines = new THREE.LineSegments(this.geometry, this.material);
    this.lines.frustumCulled = false;
    this.lines.matrixAutoUpdate = false;
    this.root = new THREE.Group();
    this.root.name = "FirstPersonMotionOverlay";
    this.root.add(this.lines);
    this.root.userData.PrepareDebugOverlay = ({ exposure }) => {
      this.material.color.setScalar(1 / THREE.MathUtils.clamp(exposure || 1, 0.05, 20));
    };
    this.count = 0;
  }

  Begin() { this.count = 0; }

  Line(ax, ay, az, bx, by, bz, color, k = 1) {
    if (this.count + 2 > this.capacity) return;
    const p = this.positions, c = this.colors, i = this.count * 3;
    p[i] = ax; p[i + 1] = ay; p[i + 2] = az; p[i + 3] = bx; p[i + 4] = by; p[i + 5] = bz;
    c[i] = c[i + 3] = color.r * k; c[i + 1] = c[i + 4] = color.g * k; c[i + 2] = c[i + 5] = color.b * k;
    this.count += 2;
  }

  End() {
    const position = this.geometry.getAttribute("position"), color = this.geometry.getAttribute("color");
    position.needsUpdate = true; color.needsUpdate = true;
    this.geometry.setDrawRange(0, this.count);
  }

  Dispose() { this.geometry.dispose(); this.material.dispose(); }
}

export class FirstPersonMotionEditor {
  static id = "fpMotion";
  static label = "第一人称持枪移动检查";
  static hint = "玩法照跑，画面换到玩家身旁的外部机位，看第一人称看不到的腿脚、身体朝向、枪和双手的实际位置；J 换机位、K 慢放、L 切回第一人称";
  /** 关掉高级工具（回去走动开枪）时不收：这个工具就是边玩边看的。停它：再点一次菜单项或面板的 ×。 */
  static keepOnClose = true;

  constructor(host) {
    this.host = host;
    this.viewId = "right";
    this.follow = true;          // 机位跟着玩家视线朝向转；关掉 = 固定世界方向（看原地转身用）
    this.fixedYaw = 0;
    this.zoom = 1;
    this.slow = 1;
    this.firstPerson = false;    // L：临时切回玩家画面（替身眼睛仍在，辅助线藏起）
    this.avoidWalls = true;      // 机位被墙 / 洞顶挡住时往里收
    this.blocked = false;
    this.gunMode = "true";       // "true" 真实尺寸 / "screen" 画面里的压缩版 / "hidden"
    this.layers = { frustum: true, capsule: true, arrows: true, footprints: true };
    this.eye = new THREE.PerspectiveCamera(70, 1, 0.03, 50);
    this.eye.name = "FirstPersonMotionEye";
    this.eye.rotation.order = "YXZ";
    this.eyeFresh = false;
    this.scaleOverridden = false;
    this.lines = new LineLayer();
    this.prints = [];
    this.lastPlanted = [true, true];
    this.landings = [];          // { side, t, x, z }
    this.slip = { samples: [], last: [null, null] };
    this.time = 0;
    this.factsTimer = 0;
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this._onKey = (event) => this.OnKey(event);
  }

  // ---------------------------------------------------------------------------
  // 生命周期

  Enter(root) {
    this.panel = Panel({ title: "第一人称持枪移动检查", sub: "J 机位 · K 慢放 · L 第一人称", variant: "work fpMotion",
      onClose: () => this.host.CloseFirstPersonMotion?.() });
    root.appendChild(this.panel.root);
    this.BuildUi(this.panel.body);
    this.fixedYaw = this.host.game?.player?.yaw ?? 0;
    this.host.post?.AddDebugOverlay?.(this.lines.root);
    document.addEventListener("keydown", this._onKey);
    return this;
  }

  Exit() {
    document.removeEventListener("keydown", this._onKey);
    this.SetObserving(false);
    this.host.post?.RemoveDebugOverlay?.(this.lines.root);
    this.RestoreViewmodel();
    this.lines.Dispose();
    this.eye.removeFromParent();
    this.slow = 1;
    this.panel?.root.remove();
    this.panel = null;
  }

  /** 把 Viewmodel 挂回主相机、深度压缩还原、可见性还原。 */
  RestoreViewmodel() {
    const vm = this.host.viewmodel, camera = this.host.camera;
    this.RestoreCompensation();
    if (vm?.root && camera && vm.root.parent === this.eye) camera.add(vm.root);
  }

  /**
   * 观察这一帧临时改过的两样（深度压缩压回 1、「藏起」时 Viewmodel 不可见）在下一帧开头还原：
   * Viewmodel.Update 要拿原样的它们算 —— 第一人称身体的可见性就跟着 viewmodel.root.visible 走。
   */
  /** 外部机位出画时藏掉 HUD 的屏幕中心准星（Style_Editor.css 的 body.edFpMotionObserver）。 */
  SetObserving(on) {
    if (this.observing === on) return;
    this.observing = on;
    document.body.classList.toggle("edFpMotionObserver", on);
  }

  RestoreCompensation() {
    const vm = this.host.viewmodel;
    if (this.scaleOverridden && vm?.fovRig && vm.compensation) vm.fovRig.scale.copy(vm.compensation);
    this.scaleOverridden = false;
    if (this.hidGun && vm?.root) vm.root.visible = this.gunWasVisible;
    this.hidGun = false;
  }

  // ---------------------------------------------------------------------------
  // 界面

  BuildUi(body) {
    const views = Section(body, "观察机位（J 依次切换）");
    this.viewChips = Chips(views, MOTION_VIEWS.map((v) => ({ value: v.id, label: v.label })), this.viewId, (id) => this.SetView(id));
    const opts = Section(body, "机位");
    const row = document.createElement("div");
    row.className = "edBtns";
    this.followToggle = Toggle(row, "跟着视线转", this.follow, (on) => this.SetFollow(on));
    this.followToggle.root.title = "关掉 = 机位固定在世界方向上，玩家原地转视角时能看到腿和胯是不是跟着转";
    this.fpToggle = Toggle(row, "第一人称画面（L）", this.firstPerson, (on) => { this.firstPerson = on; });
    const avoid = Toggle(row, "避开遮挡", this.avoidWalls, (on) => { this.avoidWalls = on; });
    avoid.root.title = "机位和玩家之间隔着墙 / 洞顶 / 地面时，机位收到挡住的地方前面（关掉 = 照设定距离放，可能埋进墙里）";
    opts.appendChild(row);
    this.zoomSlider = Slider(opts, { label: "距离倍率（[ ]）", min: 0.4, max: 3, step: 0.05, value: this.zoom,
      format: (v) => `${v.toFixed(2)}×`, onInput: (v) => { this.zoom = v; } });

    const time = Section(body, "慢放（K 依次切换）");
    this.slowChips = Chips(time, MOTION_SLOW_STEPS.map((s) => ({ value: s, label: s === 1 ? "原速" : `${s}×` })), this.slow,
      (s) => { this.slow = s; });

    const gun = Section(body, "枪和双手");
    this.gunChips = Chips(gun, [
      { value: "true", label: "真实尺寸", title: "去掉窄 FOV 的深度压缩：枪和手在世界里实际该有的大小和位置" },
      { value: "screen", label: "画面压缩版", title: "玩家画面里用的那份几何（整体缩到眼前 + 深度压缩），从外面看会变形" },
      { value: "hidden", label: "藏起", title: "只看身体和腿脚" },
    ], this.gunMode, (mode) => { this.gunMode = mode; });

    const show = Section(body, "辅助线");
    const showRow = document.createElement("div");
    showRow.className = "edBtns";
    for (const [key, label, title] of [
      ["frustum", "视锥", "玩家眼睛的位置和视野（黄）、视线（亮黄）"],
      ["capsule", "碰撞胶囊", "玩家碰撞体的半径与高度（青）"],
      ["arrows", "朝向箭头", "地上三根：视线朝向（黄）、胯朝向（橙）、移动速度（绿）"],
      ["footprints", "脚印", "最近 16 个落脚点（左蓝右红，越旧越暗）；空中的脚画一根到地面的竖线"],
    ]) {
      const t = Toggle(showRow, label, this.layers[key], (on) => { this.layers[key] = on; });
      t.root.title = title;
    }
    show.appendChild(showRow);

    const read = Section(body, "读数");
    this.facts = Facts(read);
    ButtonRow(read, [{ label: "清空脚印与统计", onClick: () => this.ClearStats() }]);
    Note(body, "玩法照跑：鼠标转的是玩家视线，WASD / 开枪 / 开镜照常。Esc 放开鼠标后才能点这块面板。"
      + "滑动读的是真实脚骨骼：着地期间两帧之间水平挪了多少。");
  }

  SetView(id) {
    if (!MOTION_VIEWS.some((v) => v.id === id)) return;
    this.viewId = id;
    this.viewChips?.Set(id);
  }

  CycleView() {
    const i = MOTION_VIEWS.findIndex((v) => v.id === this.viewId);
    this.SetView(MOTION_VIEWS[(i + 1) % MOTION_VIEWS.length].id);
  }

  SetFollow(on) {
    this.follow = !!on;
    if (!this.follow) this.fixedYaw = this.host.game?.player?.yaw ?? this.fixedYaw;
    this.followToggle?.Set(this.follow);
  }

  CycleSlow() {
    const i = MOTION_SLOW_STEPS.indexOf(this.slow);
    this.slow = MOTION_SLOW_STEPS[(i + 1) % MOTION_SLOW_STEPS.length];
    this.slowChips?.Set(this.slow);
  }

  ClearStats() {
    this.prints.length = 0;
    this.landings.length = 0;
    this.slip.samples.length = 0;
  }

  OnKey(event) {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const tag = event.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    switch (event.code) {
      case MOTION_KEYS.cycleView: this.CycleView(); break;
      case MOTION_KEYS.slowMo: this.CycleSlow(); break;
      case MOTION_KEYS.firstPerson: this.firstPerson = !this.firstPerson; this.fpToggle?.Set(this.firstPerson); break;
      case MOTION_KEYS.zoomIn: this.zoom = Math.max(0.4, this.zoom / 1.15); this.zoomSlider?.Set(this.zoom); break;
      case MOTION_KEYS.zoomOut: this.zoom = Math.min(3, this.zoom * 1.15); this.zoomSlider?.Set(this.zoom); break;
      default: return;
    }
  }

  // ---------------------------------------------------------------------------
  // 每帧

  /** 套件的叠加层每帧（帧开头，Viewmodel.Update 之前）：上一帧压回 1 的深度压缩还原。 */
  Update(dt) {
    this.RestoreCompensation();
    this.time += dt;
    this.factsTimer -= dt;
    if (this.factsTimer <= 0) { this.factsTimer = 0.12; this.RefreshFacts(); }
  }

  /** 慢放倍率（套件 ScaleDt 乘上去）。 */
  get TimeScale() { return this.slow; }

  /** 玩家相机与 FOV 写完、Viewmodel.Update 之前：替身眼睛抄玩家眼睛，Viewmodel 挂上去。 */
  SyncEye(camera) {
    const eye = this.eye, vm = this.host.viewmodel;
    if (!camera) return;
    if (eye.parent !== camera.parent && camera.parent) camera.parent.add(eye);
    eye.position.copy(camera.position);
    eye.rotation.copy(camera.rotation);
    eye.quaternion.copy(camera.quaternion);
    if (eye.fov !== camera.fov || eye.aspect !== camera.aspect || eye.near !== camera.near || eye.far !== camera.far) {
      eye.fov = camera.fov; eye.aspect = camera.aspect; eye.near = camera.near; eye.far = camera.far;
      eye.updateProjectionMatrix();
    }
    eye.updateMatrixWorld(true);
    if (vm?.root && vm.root.parent !== eye) eye.add(vm.root);
    this.eyeFresh = true;
  }

  /**
   * 主相机挪到观察机位。fresh = 这一帧玩家相机是新写的（玩法照跑）；高级工具开着、玩法停着时为 false，
   * 那时主相机里是上一帧的观察机位，不能再抄进替身眼睛。→ true = 这一帧接管了主相机。
   */
  ApplyCamera(camera, fresh = true) {
    if (!camera || !this.eyeFresh) return false;
    const vm = this.host.viewmodel, player = this.host.game?.player;
    if (fresh) this.Sample();
    // 枪和手：真实尺寸 = 这一帧把窄 FOV 的深度压缩压回 1（Update 下一帧开头还原）
    if (vm?.root) {
      if (this.gunMode === "hidden" && !this.firstPerson && !this.hidGun) {
        this.gunWasVisible = vm.root.visible;
        vm.root.visible = false;
        this.hidGun = true;
      }
      if (this.gunMode === "true" && !this.firstPerson && vm.fovRig && !this.scaleOverridden) {
        vm.fovRig.scale.set(1, 1, 1);
        vm.fovRig.updateMatrixWorld(true);
        this.scaleOverridden = true;
      }
    }
    if (this.firstPerson || !player) {
      this.lines.root.visible = false;
      this.SetObserving(false);
      return false;
    }
    this.SetObserving(true);
    const view = MOTION_VIEWS.find((v) => v.id === this.viewId) || MOTION_VIEWS[0];
    const baseYaw = this.follow ? player.yaw : this.fixedYaw;
    const crouchK = player.stanceBlend ? 1 - 0.35 * (player.stanceBlend.crouch || 0) - 0.6 * (player.stanceBlend.prone || 0) : 1;
    const target = this._target.set(player.position.x, player.position.y + view.aimH * crouchK, player.position.z);
    const a = baseYaw + view.yawDeg * DEG, p = view.pitchDeg * DEG, dist = view.dist * this.zoom;
    // 相机在目标的 -forward(baseYaw + a) 方向：a = 0 在身后，+90° 在右侧
    const dir = this._v.set(Math.sin(a) * Math.cos(p), Math.sin(p), Math.cos(a) * Math.cos(p));
    // 避开遮挡（第三人称相机的老做法）：从看的那一点朝机位打一条射线，撞到墙 / 洞顶 / 地面就把机位收到撞点前面
    let reach = dist;
    const battlefield = this.host.game?.battlefield;
    if (this.avoidWalls && battlefield?.Raycast) {
      const hit = battlefield.Raycast(target, dir, dist, { terrain: true });
      if (hit && Number.isFinite(hit.t) && hit.t < dist) reach = Math.max(0.35, hit.t - 0.18);
    }
    this.blocked = reach < dist - 1e-3;
    camera.position.set(target.x + dir.x * reach, target.y + dir.y * reach, target.z + dir.z * reach);
    const ground = battlefield?.GroundHeight?.(camera.position.x, camera.position.z);
    if (Number.isFinite(ground)) camera.position.y = Math.max(camera.position.y, ground + 0.12);
    camera.up.set(0, 1, 0);
    if (view.pitchDeg > 80) {
      // 正上方往下看：lookAt 在极点附近会乱转，直接按跟随朝向摆
      camera.rotation.order = "YXZ";
      camera.rotation.set(-Math.PI / 2 + 0.001, baseYaw, 0);
    } else {
      camera.lookAt(target);
    }
    if (Math.abs(camera.fov - OBSERVER_FOV) > 1e-3) { camera.fov = OBSERVER_FOV; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld(true);
    this.lines.root.visible = true;
    this.DrawHelpers(player);
    return true;
  }

  // ---------------------------------------------------------------------------
  // 采样与统计（只在玩法帧上采）

  Sample() {
    const body = this.host.viewmodel?.body;
    const probe = body?.Probe?.();
    if (!probe) return;
    const t = this.time;
    for (let i = 0; i < 2; i++) {
      const f = probe.feet[i];
      if (f.planted && !this.lastPlanted[i]) {
        this.prints.push({ side: i, x: f.x, y: f.y, z: f.z, yaw: f.yaw, t });
        if (this.prints.length > FOOTPRINT.keep) this.prints.shift();
        this.landings.push({ side: i, t, x: f.x, z: f.z });
      }
      this.lastPlanted[i] = f.planted;
      // 实测滑动：真实脚骨骼，同一次着地内相邻两帧的水平位移
      const bone = body.legs?.bones?.legs?.[i]?.foot;
      if (!bone) continue;
      const w = bone.getWorldPosition(this._w);
      const last = this.slip.last[i];
      if (f.planted && last && last.plantT === this.LastLanding(i)) {
        this.slip.samples.push({ t, d: Math.hypot(w.x - last.x, w.z - last.z) });
      }
      this.slip.last[i] = f.planted ? { x: w.x, z: w.z, plantT: this.LastLanding(i) } : null;
    }
    const keepFrom = t - 3;
    while (this.landings.length && this.landings[0].t < keepFrom) this.landings.shift();
    while (this.slip.samples.length && this.slip.samples[0].t < t - 2) this.slip.samples.shift();
  }

  LastLanding(side) {
    for (let i = this.landings.length - 1; i >= 0; i--) if (this.landings[i].side === side) return this.landings[i].t;
    return -1;
  }

  /** 近 3 秒的步频（步/秒）与步长（米，同一只脚相邻两次落点距离的一半）。 */
  GaitStats() {
    const L = this.landings;
    if (L.length < 3) return null;
    const span = L[L.length - 1].t - L[0].t;
    if (span <= 0.05) return null;
    let sum = 0, n = 0;
    for (let i = 2; i < L.length; i++) {
      for (let j = i - 1; j >= 0; j--) {
        if (L[j].side !== L[i].side) continue;
        sum += Math.hypot(L[i].x - L[j].x, L[i].z - L[j].z) / 2; n++;
        break;
      }
    }
    return { cadence: (L.length - 1) / span, step: n ? sum / n : 0 };
  }

  RefreshFacts() {
    const facts = this.facts, player = this.host.game?.player;
    if (!facts || !player) return;
    const view = MOTION_VIEWS.find((v) => v.id === this.viewId);
    facts.Set("机位", this.firstPerson ? "第一人称画面" : `${view?.label ?? ""} · ${this.follow ? "跟着视线" : "固定方向"} · ${this.zoom.toFixed(2)}×${this.blocked ? " · 被挡，已收近" : ""}`);
    facts.Set("慢放", this.slow === 1 ? "原速" : `${this.slow}×`, this.slow === 1 ? "" : "warn");
    const speed = Math.hypot(player.velocity?.x || 0, player.velocity?.z || 0);
    const stance = player.stance === "prone" ? "卧" : player.stance === "crouch" ? "蹲" : "站";
    const tags = [stance, (player.sprint || 0) > 0.5 ? "冲刺" : "", (player.ads || 0) > 0.5 ? "开镜" : "", player.grounded === false ? "空中" : ""].filter(Boolean);
    facts.Set("移动", `${speed.toFixed(2)} m/s · ${tags.join(" ")}`);
    facts.Set("武器", `${this.host.playerWeaponId ?? "—"} · ${this.gunMode === "true" ? "真实尺寸" : this.gunMode === "screen" ? "画面压缩版" : "藏起"}`);
    facts.Set("视线", `偏航 ${((player.yaw / DEG) % 360).toFixed(0)}° · 俯仰 ${(player.pitch / DEG).toFixed(0)}°`);
    const probe = this.host.viewmodel?.body?.Probe?.();
    if (probe) {
      const twist = probe.twist / DEG;
      facts.Set("上身拧角", `${twist.toFixed(0)}°${probe.turning ? " · 原地转身中" : ""}`, Math.abs(twist) > 70 ? "warn" : "");
      facts.Set("胯 / 脚", `骨盆下沉 ${(probe.pelvisDrop * 100).toFixed(1)} cm · 左${probe.feet[0].planted ? "着地" : "抬起"} 右${probe.feet[1].planted ? "着地" : "抬起"}`);
    } else {
      facts.Set("上身拧角", "没有第一人称身体");
    }
    const gait = this.GaitStats();
    facts.Set("步频 / 步长", gait ? `${gait.cadence.toFixed(2)} 步/秒 · ${gait.step.toFixed(2)} m` : "（走几步才有）");
    const worst = this.slip.samples.reduce((m, s) => Math.max(m, s.d), 0);
    facts.Set("着地脚滑动（近 2 秒）", `${(worst * 1000).toFixed(1)} mm/帧`, worst > 0.01 ? "bad" : worst > 0.003 ? "warn" : "good");
  }

  // ---------------------------------------------------------------------------
  // 辅助线

  DrawHelpers(player) {
    const L = this.lines;
    L.Begin();
    const gy = player.position.y + 0.02;
    if (this.layers.frustum) this.DrawFrustum();
    if (this.layers.capsule) this.DrawCapsule(player);
    if (this.layers.arrows) {
      const probe = this.host.viewmodel?.body?.Probe?.();
      const px = player.position.x, pz = player.position.z;
      this.Arrow(px, gy, pz, player.yaw, 0.9, COLORS.aim);
      if (probe) this.Arrow(px, gy + 0.01, pz, probe.lowerYaw, 0.7, COLORS.hips);
      const vx = player.velocity?.x || 0, vz = player.velocity?.z || 0, speed = Math.hypot(vx, vz);
      if (speed > 0.05) this.Arrow(px, gy + 0.02, pz, Math.atan2(-vx, -vz), Math.min(2, speed * 0.35), COLORS.velocity);
    }
    if (this.layers.footprints) this.DrawFootprints();
    L.End();
  }

  DrawFrustum() {
    const eye = this.eye, L = this.lines, e = eye.getWorldPosition(this._v);
    const depth = 0.6, hh = Math.tan(eye.fov * DEG / 2) * depth, hw = hh * eye.aspect;
    const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => new THREE.Vector3(x, y, -depth).applyMatrix4(eye.matrixWorld));
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      L.Line(e.x, e.y, e.z, a.x, a.y, a.z, COLORS.frustum, 0.8);
      L.Line(a.x, a.y, a.z, b.x, b.y, b.z, COLORS.frustum, 0.8);
    }
    const far = new THREE.Vector3(0, 0, -4).applyMatrix4(eye.matrixWorld);
    L.Line(e.x, e.y, e.z, far.x, far.y, far.z, COLORS.ray);
  }

  DrawCapsule(player) {
    const L = this.lines, r = STANCE[player.stance]?.radius ?? 0.34;
    const y0 = player.position.y + 0.02, y1 = player.position.y + (player.eyeHeight ?? 1.62) + 0.12;
    const cx = player.position.x, cz = player.position.z, n = 24;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      for (const y of [y0, y1]) L.Line(cx + Math.cos(a0) * r, y, cz + Math.sin(a0) * r, cx + Math.cos(a1) * r, y, cz + Math.sin(a1) * r, COLORS.capsule, 0.75);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + player.yaw;
      L.Line(cx + Math.cos(a) * r, y0, cz + Math.sin(a) * r, cx + Math.cos(a) * r, y1, cz + Math.sin(a) * r, COLORS.capsule, 0.5);
    }
  }

  Arrow(x, y, z, yaw, length, color) {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), tx = x + fx * length, tz = z + fz * length, head = Math.min(0.15, length * 0.3);
    this.lines.Line(x, y, z, tx, y, tz, color);
    for (const s of [1, -1]) {
      const a = yaw + Math.PI + s * 0.45;
      this.lines.Line(tx, y, tz, tx - Math.sin(a) * head, y, tz - Math.cos(a) * head, color);
    }
  }

  DrawFootprints() {
    const L = this.lines, now = this.time;
    for (const print of this.prints) {
      const age = now - print.t;
      const k = THREE.MathUtils.clamp(1 - age / FOOTPRINT.fadeS, 0.25, 1);
      this.FootRect(print.x, print.y + 0.015, print.z, print.yaw, print.side === 0 ? COLORS.footL : COLORS.footR, k);
    }
    const probe = this.host.viewmodel?.body?.Probe?.();
    if (!probe) return;
    for (let i = 0; i < 2; i++) {
      const f = probe.feet[i];
      if (f.planted) continue;
      // 空中的脚：从地面拉一根竖线到当前抬起的高度，看抬脚弧线
      L.Line(f.x, f.y + 0.01, f.z, f.x, f.y + 0.01 + f.lift + 0.09, f.z, COLORS.swing, 0.9);
    }
  }

  FootRect(x, y, z, yaw, color, k) {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    // 脚踝在脚掌后 1/3：矩形往前多伸一点
    const front = FOOTPRINT.lengthM * 0.68, back = FOOTPRINT.lengthM * 0.32, half = FOOTPRINT.widthM / 2;
    const P = (f, r) => [x + fx * f + rx * r, z + fz * f + rz * r];
    const pts = [P(front, -half), P(front, half), P(-back, half), P(-back, -half)];
    for (let i = 0; i < 4; i++) {
      const a = pts[i], b = pts[(i + 1) % 4];
      this.lines.Line(a[0], y, a[1], b[0], y, b[1], color, k);
    }
    const tip = P(front + 0.04, 0);
    this.lines.Line(x, y, z, tip[0], y, tip[1], color, k);
  }
}
