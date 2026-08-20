// 编辑器的 3D 底座：把整座城收起来的「摄影棚」、轨道相机、自由飞行相机、
// 以及一条对着世界的拾取射线。人物 / 枪械 / 过场 / 场景 / 破坏五个编辑器共用这一层。
//
// 三条设计决定，都是被这个项目的结构逼出来的：
//
// 1. **只有一个 renderer、一个 scene、一台相机。** 预览不另起画布 ——
//    另起就等于把 MaterialLibrary、SkyDome、PostPipeline 再烘一份（开机要十几秒），
//    而且两份贴图的曝光/色调不一致，看预览调出来的观感搬回正片是错的。
//    摄影棚的做法是**把世界藏起来**：遍历 scene.children 把网格 visible 置 false，
//    灯与天空罩留着（灯 visible=false 等于关灯，预览就成了纯黑）。
//
// 2. **相机状态一律先存后改、关掉时原样还回去。** 编辑器关掉之后玩家要接着玩，
//    机位、俯仰、FOV 有任何一项没还，表现是「退出编辑器之后视角歪了」。
//
// 3. **拾取不用 THREE.Raycaster。** 城是几十个巨型合批网格（一个网格几万个三角），
//    Raycaster 要逐三角求交，点一下卡半秒。这里走两条便宜的路：
//    地面用解析高程 + 二分，实体用 Script_TengxianField 已有的 AABB 网格射线。

import * as THREE from "three";
import { MarkNoPrepass } from "./Script_Post.mjs";

/**
 * 把世界藏起来 / 放回来。
 *
 * 判据写死在这里，别散到各个编辑器里：**灯、相机、天空罩、以及 keep 里点名的
 * 那几棵树留下，其余 scene 直属子节点全部藏起来。** 只碰 scene 的直属子节点，
 * 不往下遍历 —— 城是按分区合批的几十个网格，全在第一层。
 */
export class WorldMask {
  constructor(scene) {
    this.scene = scene;
    this.saved = null;
  }

  get Active() { return !!this.saved; }

  /** @param {THREE.Object3D[]} keep 这几棵树不藏（摄影棚自己的舞台） */
  Hide(keep = []) {
    if (this.saved) this.Show();
    const kept = new Set(keep);
    this.saved = [];
    for (const child of this.scene.children) {
      if (child.isLight || child.isCamera || kept.has(child)) continue;
      if (child.name === "SkyDome") continue;
      // sun.target 是个空 Object3D，藏了不影响画面但会让阴影矩阵算在旧位置上
      if (child.type === "Object3D" && child.children.length === 0) continue;
      this.saved.push([child, child.visible]);
      child.visible = false;
    }
    return this;
  }

  Show() {
    if (!this.saved) return this;
    for (const [child, visible] of this.saved) child.visible = visible;
    this.saved = null;
    return this;
  }

  /**
   * 再藏一棵不在 scene 直属子节点里的树（视图模型挂在相机上，而相机是豁免的，
   * 不点名的话摄影棚里会一直有一支枪浮在画面右下角）。
   */
  HideAlso(object) {
    if (!this.saved || !object) return this;
    this.saved.push([object, object.visible]);
    object.visible = false;
    return this;
  }
}

/**
 * 摄影棚：一块地台 + 一圈网格线 + 轨道相机。
 *
 * 舞台放在 stageY = 0（城内地坪），不挪到天上 —— 天光与雾都是按高度算的，
 * 把人抬到 y=1000 去看，等于在预览一个雾里的白影。
 */
export class Studio {
  constructor({ scene, camera, library }) {
    this.scene = scene;
    this.camera = camera;
    this.library = library;
    this.mask = new WorldMask(scene);
    this.root = new THREE.Group();
    this.root.name = "EditorStudio";
    this.root.visible = false;
    scene.add(this.root);
    this.owned = [];

    // 地台：一块 24 m 的圆盘，用城里的地面材质，看到的明暗就是正片里的明暗
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(12, 64).rotateX(-Math.PI / 2),
      library.Get("Ground", { repeat: 1 }));
    pad.receiveShadow = true;
    pad.position.y = 0.002;
    pad.name = "StudioPad";
    this.root.add(pad);
    this.owned.push(pad.geometry);
    this.pad = pad;

    // 米格：一米一格，判断比例用（人 1.66 m、中正式 1.11 m 全靠它读）
    const grid = new THREE.GridHelper(24, 24, 0x7a7364, 0x3c382f);
    grid.position.y = 0.004;
    MarkNoPrepass(grid.material);
    grid.material.transparent = true;
    grid.material.opacity = 0.45;
    grid.material.depthWrite = false;
    this.root.add(grid);
    this.owned.push(grid.geometry);
    this.grid = grid;

    // 舞台上真正的展品挂这里，换展品只清这一层
    this.stand = new THREE.Group();
    this.root.add(this.stand);

    // 起手机位在 **-Z 一侧**：人物的正面是局部 -Z（全场约定，见 Script_Ai 的 yaw），
    // yaw=0.6 那种默认值会让每一个展品一开场都背对着你 —— 要转半圈才看得见脸、
    // 帽徽、领章、持枪姿态，而这几样正是要看的东西。π+0.55 是四分之三侧前方。
    this.orbit = {
      yaw: Math.PI + 0.55, pitch: 0.20, dist: 3.4, target: new THREE.Vector3(0, 0.95, 0),
    };
    this.saved = null;
  }

  get Active() { return !!this.saved; }

  /** @param {THREE.Object3D[]} alsoHide 相机的子树（视图模型）这类漏网之鱼 */
  Open(alsoHide = []) {
    if (this.saved) return this;
    this.saved = {
      position: this.camera.position.clone(),
      quaternion: this.camera.quaternion.clone(),
      fov: this.camera.fov,
      near: this.camera.near,
      far: this.camera.far,
    };
    this.root.visible = true;
    this.mask.Hide([this.root]);
    for (const object of alsoHide) this.mask.HideAlso(object);
    this.camera.fov = 42;                 // 85 mm 等效：看模型不畸变
    this.camera.near = 0.05;
    this.camera.updateProjectionMatrix();
    this.ApplyCamera();
    return this;
  }

  Close() {
    if (!this.saved) return this;
    this.ClearStand();
    this.mask.Show();
    this.root.visible = false;
    this.camera.position.copy(this.saved.position);
    this.camera.quaternion.copy(this.saved.quaternion);
    this.camera.fov = this.saved.fov;
    this.camera.near = this.saved.near;
    this.camera.far = this.saved.far;
    this.camera.updateProjectionMatrix();
    this.saved = null;
    return this;
  }

  /** 清空展台。几何归各自的工厂所有（有缓存），这里只断父子关系。 */
  ClearStand() {
    for (let i = this.stand.children.length - 1; i >= 0; i -= 1) {
      this.stand.remove(this.stand.children[i]);
    }
  }

  SetGridVisible(on) { this.grid.visible = !!on; this.pad.visible = !!on; }

  /** 轨道相机：yaw/pitch/dist → 相机位姿。每帧调一次（拖动时角度在变）。 */
  ApplyCamera() {
    const o = this.orbit;
    o.pitch = Math.max(-1.35, Math.min(1.35, o.pitch));
    o.dist = Math.max(0.35, Math.min(40, o.dist));
    const cp = Math.cos(o.pitch);
    this.camera.position.set(
      o.target.x + Math.sin(o.yaw) * cp * o.dist,
      o.target.y + Math.sin(o.pitch) * o.dist,
      o.target.z + Math.cos(o.yaw) * cp * o.dist);
    this.camera.lookAt(o.target);
  }

  /** 鼠标拖动：左键转、右键/中键平移。 */
  Drag(dx, dy, button = 0) {
    const o = this.orbit;
    if (button === 0) {
      o.yaw -= dx * 0.006;
      o.pitch += dy * 0.006;
    } else {
      const scale = o.dist * 0.0016;
      const right = new THREE.Vector3(Math.cos(o.yaw), 0, -Math.sin(o.yaw));
      o.target.addScaledVector(right, -dx * scale);
      o.target.y += dy * scale;
    }
    this.ApplyCamera();
  }

  Zoom(delta) {
    this.orbit.dist *= delta > 0 ? 1.12 : 1 / 1.12;
    this.ApplyCamera();
  }

  /** 把镜头对准一个高 h 的东西（换展品时调一次）。 */
  Frame(height = 1.7, dist = null) {
    this.orbit.target.set(0, height * 0.55, 0);
    this.orbit.dist = dist != null ? dist : Math.max(1.2, height * 2.1);
    this.ApplyCamera();
  }

  Dispose() {
    this.Close();
    this.scene.remove(this.root);
    for (const geometry of this.owned) geometry.dispose();
    this.owned.length = 0;
  }
}

/**
 * 自由飞行相机（场景编辑器用）。WASD + QE 升降，按住左键转头。
 * **不夺指针锁** —— 编辑器要用鼠标点面板，锁了就点不着。
 */
export class FlyCam {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = -0.15;
    this.speed = 14;
    this.saved = null;
    this.keys = new Set();
  }

  get Active() { return !!this.saved; }

  Open() {
    if (this.saved) return this;
    this.saved = {
      position: this.camera.position.clone(),
      quaternion: this.camera.quaternion.clone(),
      fov: this.camera.fov,
    };
    // 从玩家当前视角接着飞，别把人瞬移到原点 —— 「我刚才在哪」是最要紧的上下文
    const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, "YXZ");
    this.yaw = e.y;
    this.pitch = e.x;
    return this;
  }

  Close() {
    if (!this.saved) return this;
    this.camera.position.copy(this.saved.position);
    this.camera.quaternion.copy(this.saved.quaternion);
    this.camera.fov = this.saved.fov;
    this.camera.updateProjectionMatrix();
    this.saved = null;
    this.keys.clear();
    return this;
  }

  Look(dx, dy) {
    this.yaw -= dx * 0.0022;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - dy * 0.0022));
  }

  Update(dt) {
    const k = this.keys;
    const forward = (k.has("KeyW") ? 1 : 0) - (k.has("KeyS") ? 1 : 0);
    const strafe = (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0);
    const lift = (k.has("KeyE") ? 1 : 0) - (k.has("KeyQ") ? 1 : 0);
    const boost = k.has("ShiftLeft") || k.has("ShiftRight") ? 4 : 1;
    const slow = k.has("ControlLeft") || k.has("ControlRight") ? 0.22 : 1;
    const step = this.speed * boost * slow * dt;
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    // three 的相机看自身 -Z
    this.camera.position.x += (-sy * cp * forward + cy * strafe) * step;
    this.camera.position.y += (sp * forward + lift) * step;
    this.camera.position.z += (-cy * cp * forward - sy * strafe) * step;
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }
}

/**
 * 视口鼠标：只认画布上的操作，面板上的点击一律放行给 DOM。
 *
 * 这个类不做任何相机运算 —— 它只把「在画布上按下并拖了多少」翻译成回调，
 * 谁来用（轨道相机 / 飞行相机 / 地形笔刷）由调用方决定。
 */
export class ViewportInput {
  constructor(canvas) {
    this.canvas = canvas;
    this.dragging = false;
    this.button = 0;
    this.moved = 0;
    this.enabled = false;
    // 光标此刻在画布上的位置（客户端像素）。**不只在拖动时记** ——
    // 编辑器要在没按键的时候就把「点下去会落在哪」画出来，那份预览取的就是这两个数。
    this.x = 0;
    this.y = 0;
    this.over = false;       // 光标在不在画布上（在面板上时为 false）
    this.OnDrag = null;      // (dx, dy, button)
    this.OnWheel = null;     // (delta)
    this.OnClick = null;     // (event, button)  —— 没怎么拖动才算点击
    this.OnPaint = null;     // (event, button)  —— 按住拖动时每次移动给一次（笔刷）
    this.OnPress = null;     // (event, button)  —— 按下那一刻（一笔的起点）

    this._down = (e) => {
      if (!this.enabled || e.target !== canvas) return;
      this.dragging = true;
      this.button = e.button;
      this.moved = 0;
      this.x = e.clientX; this.y = e.clientY; this.over = true;
      e.preventDefault();
      if (this.OnPress) this.OnPress(e, this.button);
    };
    this._move = (e) => {
      if (!this.enabled) return;
      const onCanvas = e.target === canvas;
      if (onCanvas || this.dragging) { this.x = e.clientX; this.y = e.clientY; }
      this.over = onCanvas || this.dragging;
      if (!this.dragging) return;
      const dx = e.movementX || 0;
      const dy = e.movementY || 0;
      this.moved += Math.abs(dx) + Math.abs(dy);
      if (this.OnDrag) this.OnDrag(dx, dy, this.button);
      if (this.OnPaint) this.OnPaint(e, this.button);
    };
    this._up = (e) => {
      if (!this.enabled || !this.dragging) return;
      this.dragging = false;
      // 5 px 以内算点按不算拖动：手抖不该被判成「我在转镜头」
      if (this.moved <= 5 && this.OnClick) this.OnClick(e, this.button);
    };
    this._wheel = (e) => {
      if (!this.enabled || e.target !== canvas) return;
      if (this.OnWheel) this.OnWheel(e.deltaY);
    };
    canvas.addEventListener("mousedown", this._down);
    window.addEventListener("mousemove", this._move);
    window.addEventListener("mouseup", this._up);
    canvas.addEventListener("wheel", this._wheel, { passive: true });
  }

  Dispose() {
    this.canvas.removeEventListener("mousedown", this._down);
    window.removeEventListener("mousemove", this._move);
    window.removeEventListener("mouseup", this._up);
    this.canvas.removeEventListener("wheel", this._wheel);
  }
}

const _ray = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _point = new THREE.Vector3();

/** 屏幕坐标（客户端像素）→ 世界射线方向。 */
export function ScreenRay(camera, canvas, clientX, clientY, out = new THREE.Vector3()) {
  const rect = canvas.getBoundingClientRect();
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
  out.set(ndcX, ndcY, 0.5).unproject(camera).sub(camera.position).normalize();
  return out;
}

/**
 * 对着世界拾取。返回 { x, y, z, kind, distance } 或 null。
 *
 * 地面用「沿射线走、看脚下的解析高程」找符号变化再二分 —— 一次拾取 ~80 次
 * 高程查询 + 24 步二分，比对几十万个三角求交便宜三个数量级。
 */
export function PickWorld(field, origin, direction, { maxDist = 400, solids = true } = {}) {
  let best = null;
  if (solids && field && field.Raycast) {
    const hit = field.Raycast(_origin.copy(origin), _ray.copy(direction), maxDist);
    if (hit) {
      best = {
        kind: "solid", distance: hit.t,
        x: origin.x + direction.x * hit.t,
        y: origin.y + direction.y * hit.t,
        z: origin.z + direction.z * hit.t,
      };
    }
  }
  if (field && field.GroundHeight) {
    const limit = best ? Math.min(maxDist, best.distance) : maxDist;
    const steps = 90;
    const Gap = (t) => {
      _point.copy(origin).addScaledVector(direction, t);
      return _point.y - field.GroundHeight(_point.x, _point.z);
    };
    let prevT = 0;
    let prevGap = Gap(0);
    for (let i = 1; i <= steps; i += 1) {
      const t = (i / steps) * limit;
      const gap = Gap(t);
      // **任何一次变号都算穿过地面**，不是只认「从上往下扎」。
      // 原来写的是 prevGap > 0 && gap <= 0，于是相机正好贴在地面上
      // （gap 恰好等于 0，「回到玩家」之后就是这个高度）时永远进不了这个分支 ——
      // 症状是「点哪儿都放不下东西」，而且完全没有报错。
      if ((prevGap > 0 && gap <= 0) || (prevGap <= 0 && gap > 0)) {
        const rising = prevGap <= 0;
        let lo = prevT, hi = t;
        for (let k = 0; k < 24; k += 1) {
          const mid = (lo + hi) / 2;
          const midGap = Gap(mid);
          if (rising ? midGap <= 0 : midGap > 0) lo = mid; else hi = mid;
        }
        _point.copy(origin).addScaledVector(direction, hi);
        const ground = {
          kind: "ground", distance: hi,
          x: _point.x, y: field.GroundHeight(_point.x, _point.z), z: _point.z,
        };
        if (!best || ground.distance < best.distance) best = ground;
        break;
      }
      prevT = t; prevGap = gap;
    }
  }
  return best;
}
