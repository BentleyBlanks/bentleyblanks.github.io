// 环境区域在场景里的样子与拖动手柄（docs/Data_Environment.md §8.3）。环境面板开着时才画。
//
// 盒子画 12 条边 + 很淡的填充，球画三个大圆；选中的金色、观察点在里面的青色、其余灰色。
// 选中的区域有手柄（不做深度测试，被墙挡着也点得到）：
//   盒子  六个面各一个（沿那个面的法线拖 = 只挪那一个面，对面不动）+ 中心一个（在水平面上拖；按住 Shift 上下拖）
//   球    中心一个 + 半径一个
// 只在鼠标没被锁住时可拖（按 Esc 放开鼠标）；点中手柄的那一下不往下传（不抢指针锁、不开枪）。
// 画在 post.AddDebugOverlay 里（同白盒标记：不进预通道、不投影、颜色按曝光预补）。

import * as THREE from "three";
import { ENV_EDITOR } from "./Data_Tuning_Environment.mjs";

const DEG = Math.PI / 180;
const OVERLAY_PEAK = 0.75;
const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];

function SphereLines() {
  const pts = [];
  const N = 64;
  for (let ring = 0; ring < 3; ring += 1) {
    for (let i = 0; i < N; i += 1) {
      const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2;
      const P = (a) => (ring === 0 ? [Math.cos(a), 0, Math.sin(a)] : ring === 1 ? [Math.cos(a), Math.sin(a), 0] : [0, Math.cos(a), Math.sin(a)]);
      pts.push(...P(a0), ...P(a1));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

/** 两条直线的最近点：轴线 p + s·d 上的 s（d、u 单位向量；射线 o + t·u）。平行时给 null。 */
export function ClosestOnAxis(p, d, o, u) {
  const b = d.dot(u);
  const denom = 1 - b * b;
  if (denom < 1e-6) return null;
  const w0 = new THREE.Vector3().subVectors(p, o);
  const dd = d.dot(w0), e = u.dot(w0);
  return (b * e - dd) / denom;
}

export class EnvVolumeGizmo {
  constructor({ post, camera, canvas, groundAt, onEdit, onPick, isLocked = () => !!document.pointerLockElement }) {
    this.post = post;
    this.camera = camera;
    this.canvas = canvas;
    this.groundAt = groundAt;
    this.onEdit = onEdit;
    this.onPick = onPick;
    this.isLocked = isLocked;
    this.root = new THREE.Group();
    this.root.name = "EnvVolumeGizmo";
    this.root.visible = false;
    this.objects = new Map();
    this.handles = [];
    this.volumes = [];
    this.selected = null;
    this.inside = new Set();
    this.dragging = false;
    this.drag = null;
    this.materials = new Set();
    this.boxEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.boxFill = new THREE.BoxGeometry(1, 1, 1);
    this.sphereLines = SphereLines();
    this.handleGeo = new THREE.SphereGeometry(1, 16, 10);
    this.root.userData.PrepareDebugOverlay = ({ exposure }) => {
      const gain = OVERLAY_PEAK / THREE.MathUtils.clamp(exposure || 1, 0.05, 20);
      for (const m of this.materials) m.color.setHex(m.userData.base).multiplyScalar(gain);
    };
    if (post?.AddDebugOverlay) post.AddDebugOverlay(this.root);
    this.raycaster = new THREE.Raycaster();
    this.onDown = (e) => this.OnPointerDown(e);
    this.onMove = (e) => this.OnPointerMove(e);
    this.onUp = (e) => this.OnPointerUp(e);
    // 捕获阶段挂在 window 上：先于游戏的鼠标路由（document 冒泡）拿到这一下
    window.addEventListener("pointerdown", this.onDown, true);
    window.addEventListener("pointermove", this.onMove, true);
    window.addEventListener("pointerup", this.onUp, true);
    this.api = {
      State: () => this.State(),
      /** 测试用：某个手柄此刻在屏幕上的位置（客户区像素）。 */
      HandleScreen: (name) => this.HandleScreen(name),
      /** 取证用：每个区域框的显隐、位置、尺寸与材质（颜色已按曝光预补）。 */
      Objects: () => [...this.objects.entries()].map(([id, o]) => ({
        id, visible: o.group.visible, pos: o.group.position.toArray(), scale: o.group.scale.toArray(),
        line: { color: o.line.material.color.getHexString(), opacity: o.line.material.opacity },
        fill: o.fill ? { color: o.fill.material.color.getHexString(), opacity: o.fill.material.opacity, visible: o.fill.visible } : null,
      })),
    };
  }

  Material(kind, base, opacity) {
    const options = { transparent: true, opacity, depthTest: kind !== "handle", depthWrite: false, toneMapped: false, fog: false };
    const m = kind === "line" ? new THREE.LineBasicMaterial(options) : new THREE.MeshBasicMaterial({ ...options, side: THREE.DoubleSide });
    m.userData.base = base;
    m.color.setHex(base);
    this.materials.add(m);
    return m;
  }

  /** 每帧：同步区域列表（只画非全场的）。selectedId 选中的那个带手柄。 */
  SetVolumes(volumes, selectedId, inside = new Set()) {
    this.root.visible = volumes.length > 0;
    this.volumes = volumes;
    this.inside = inside;
    const keep = new Set();
    for (const v of volumes) {
      if (v.shape === "global" || !v.center) continue;
      keep.add(v.id);
      let obj = this.objects.get(v.id);
      if (!obj || obj.shape !== v.shape) {
        if (obj) this.RemoveObject(v.id);
        obj = this.MakeObject(v);
        this.objects.set(v.id, obj);
      }
      this.PlaceObject(obj, v);
      const color = v.id === selectedId ? ENV_EDITOR.gizmoColors.selected : inside.has(`volume:${v.id}`) ? ENV_EDITOR.gizmoColors.inside : ENV_EDITOR.gizmoColors.idle;
      obj.line.material.userData.base = color;
      // 线在 TAA 之前画，一像素宽会被时域累积冲淡：选中的那个靠一层淡填充看出体积
      if (obj.fill) {
        obj.fill.material.userData.base = color;
        obj.fill.material.opacity = v.id === selectedId ? ENV_EDITOR.selectedFillOpacity : ENV_EDITOR.idleFillOpacity;
      }
      obj.group.visible = v.enabled !== false || v.id === selectedId;
    }
    for (const id of [...this.objects.keys()]) if (!keep.has(id)) this.RemoveObject(id);
    if (selectedId !== this.selected || this.handlesFor !== this.HandleSignature(volumes.find((v) => v.id === selectedId))) {
      this.selected = selectedId;
      this.BuildHandles(volumes.find((v) => v.id === selectedId));
    }
    this.PlaceHandles(volumes.find((v) => v.id === selectedId));
  }

  HandleSignature(v) { return v ? `${v.id}|${v.shape}` : ""; }

  MakeObject(v) {
    const group = new THREE.Group();
    group.name = `EnvVolume_${v.id}`;
    let line, fill = null;
    if (v.shape === "box") {
      line = new THREE.LineSegments(this.boxEdges, this.Material("line", ENV_EDITOR.gizmoColors.idle, 0.9));
      fill = new THREE.Mesh(this.boxFill, this.Material("fill", ENV_EDITOR.gizmoColors.idle, 0.05));
      group.add(fill);
    } else {
      line = new THREE.LineSegments(this.sphereLines, this.Material("line", ENV_EDITOR.gizmoColors.idle, 0.9));
    }
    line.renderOrder = 990;
    group.add(line);
    this.root.add(group);
    return { group, line, fill, shape: v.shape };
  }

  PlaceObject(obj, v) {
    obj.group.position.set(v.center[0], v.center[1], v.center[2]);
    if (v.shape === "box") {
      obj.group.rotation.set(0, (v.yawDeg || 0) * DEG, 0);
      obj.group.scale.set(v.size[0], v.size[1], v.size[2]);
    } else {
      obj.group.rotation.set(0, 0, 0);
      obj.group.scale.setScalar(v.radius);
    }
  }

  RemoveObject(id) {
    const obj = this.objects.get(id);
    if (!obj) return;
    this.root.remove(obj.group);
    this.materials.delete(obj.line.material); obj.line.material.dispose();
    if (obj.fill) { this.materials.delete(obj.fill.material); obj.fill.material.dispose(); }
    this.objects.delete(id);
  }

  BuildHandles(v) {
    for (const h of this.handles) { this.root.remove(h.mesh); this.materials.delete(h.mesh.material); h.mesh.material.dispose(); }
    this.handles = [];
    this.handlesFor = this.HandleSignature(v);
    if (!v || v.shape === "global" || !v.center) return;
    const add = (name, axis, sign, color) => {
      const mesh = new THREE.Mesh(this.handleGeo, this.Material("handle", color, 0.95));
      mesh.renderOrder = 999;
      mesh.name = `EnvHandle_${name}`;
      this.root.add(mesh);
      this.handles.push({ name, axis, sign, mesh });
    };
    add("center", -1, 0, 0xffffff);
    if (v.shape === "box") {
      const colors = [0xd6604a, 0x8fca7a, 0x86c9dc];
      for (let a = 0; a < 3; a += 1) { add(`${"xyz"[a]}+`, a, 1, colors[a]); add(`${"xyz"[a]}-`, a, -1, colors[a]); }
    } else add("radius", 0, 1, 0xd6604a);
  }

  AxisWorld(v, a) {
    const d = AXES[a].clone();
    if (v.shape === "box" && a !== 1) d.applyAxisAngle(AXES[1], (v.yawDeg || 0) * DEG);
    return d;
  }

  HandlePosition(v, h) {
    const c = new THREE.Vector3(...v.center);
    if (h.axis < 0) return c;
    const half = v.shape === "box" ? v.size[h.axis] / 2 : v.radius;
    return c.addScaledVector(this.AxisWorld(v, h.axis), half * h.sign);
  }

  PlaceHandles(v) {
    if (!v || !this.handles.length) return;
    for (const h of this.handles) h.mesh.position.copy(this.HandlePosition(v, h));
  }

  /** 手柄按到相机的距离放大一点：远处也点得到。 */
  Update() {
    if (!this.camera) return;
    for (const h of this.handles) {
      const dist = h.mesh.position.distanceTo(this.camera.position);
      h.mesh.scale.setScalar(Math.max(ENV_EDITOR.handleRadiusM * 0.5, dist * ENV_EDITOR.handleScreenScale));
      h.mesh.visible = this.root.visible;
    }
  }

  // --- 鼠标 -------------------------------------------------------------------

  Ray(e) {
    const rect = this.canvas?.getBoundingClientRect?.() || { left: 0, top: 0, width: innerWidth, height: innerHeight };
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.ray;
  }

  OnPointerDown(e) {
    if (e.button !== 0 || !this.root.visible || !this.handles.length || this.isLocked()) return;
    if (this.canvas && e.target !== this.canvas) return;
    const v = this.volumes.find((x) => x.id === this.selected);
    if (!v) return;
    const ray = this.Ray(e);
    let best = null, bestD = Infinity;
    for (const h of this.handles) {
      const p = h.mesh.position;
      const d = ray.distanceToPoint(p);
      const along = new THREE.Vector3().subVectors(p, ray.origin).dot(ray.direction);
      if (along > 0 && d <= h.mesh.scale.x * 1.4 && along < bestD) { best = h; bestD = along; }
    }
    if (!best) return;
    e.stopPropagation();
    e.preventDefault();
    this.dragging = true;
    const center = new THREE.Vector3(...v.center);
    const drag = { handle: best, start: JSON.parse(JSON.stringify(v)), center };
    if (best.axis >= 0) {
      drag.dir = this.AxisWorld(v, best.axis);
      drag.s0 = ClosestOnAxis(center, drag.dir, ray.origin, ray.direction) ?? 0;
    } else {
      drag.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -center.y);
      drag.hit0 = ray.intersectPlane(drag.plane, new THREE.Vector3()) || center.clone();
      drag.s0 = ClosestOnAxis(center, AXES[1], ray.origin, ray.direction) ?? 0;
    }
    this.drag = drag;
  }

  OnPointerMove(e) {
    if (!this.drag) return;
    e.stopPropagation();
    const d = this.drag, v0 = d.start, h = d.handle;
    const ray = this.Ray(e);
    const round = (x) => Math.round(x * 10) / 10;
    let patch = null;
    if (h.axis < 0) {
      if (e.shiftKey) {
        const s = ClosestOnAxis(d.center, AXES[1], ray.origin, ray.direction);
        if (s !== null) patch = { center: [v0.center[0], round(v0.center[1] + s - d.s0), v0.center[2]] };
      } else {
        const hit = ray.intersectPlane(d.plane, new THREE.Vector3());
        if (hit) patch = { center: [round(v0.center[0] + hit.x - d.hit0.x), v0.center[1], round(v0.center[2] + hit.z - d.hit0.z)] };
      }
    } else if (v0.shape === "sphere") {
      const s = ClosestOnAxis(d.center, d.dir, ray.origin, ray.direction);
      if (s !== null) patch = { radius: Math.max(0.2, round(s)) };
    } else {
      const s = ClosestOnAxis(d.center, d.dir, ray.origin, ray.direction);
      if (s !== null) {
        const half0 = v0.size[h.axis] / 2;
        const moving = half0 * h.sign + (s - d.s0);
        const fixed = -half0 * h.sign;
        const size = [...v0.size];
        size[h.axis] = Math.max(0.2, round(Math.abs(moving - fixed)));
        const mid = (moving + fixed) / 2;
        const c = d.center.clone().addScaledVector(d.dir, mid);
        patch = { size, center: [round(c.x), round(c.y), round(c.z)] };
      }
    }
    if (patch) this.onEdit?.(v0.id, patch, { commit: false });
  }

  OnPointerUp(e) {
    if (!this.drag) return;
    e.stopPropagation();
    this.drag = null;
    this.dragging = false;
  }

  HandleScreen(name) {
    const h = this.handles.find((x) => x.name === name);
    if (!h || !this.camera) return null;
    const p = h.mesh.position.clone().project(this.camera);
    const rect = this.canvas?.getBoundingClientRect?.() || { left: 0, top: 0, width: innerWidth, height: innerHeight };
    return { x: rect.left + (p.x + 1) / 2 * rect.width, y: rect.top + (1 - p.y) / 2 * rect.height, visible: p.z < 1 };
  }

  State() {
    return {
      visible: this.root.visible, volumes: [...this.objects.keys()], selected: this.selected,
      handles: this.handles.map((h) => h.name), dragging: this.dragging,
    };
  }

  Dispose() {
    window.removeEventListener("pointerdown", this.onDown, true);
    window.removeEventListener("pointermove", this.onMove, true);
    window.removeEventListener("pointerup", this.onUp, true);
    for (const id of [...this.objects.keys()]) this.RemoveObject(id);
    this.BuildHandles(null);
    this.post?.RemoveDebugOverlay?.(this.root);
  }
}
