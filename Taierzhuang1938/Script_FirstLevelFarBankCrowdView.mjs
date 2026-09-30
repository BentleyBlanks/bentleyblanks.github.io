// ===========================================================================
// Script_FirstLevelFarBankCrowdView.mjs —— 18 对岸纯视觉人群的表现层（带 three）
//
// 人本身由 AI 的远景批渲染层画（FarBankCrowd.Draw，见 Script_FirstLevelFarBankCrowd）。这里只管三样：
//   · 旗：执旗的人手里的日章旗（白底红圆，杆 3.3 m、旗面 1.5×1.0 m，旗面朝南、随风摆）——远处成片的人里，旗是一眼能读出「军队」的剪影；
//   · 刀：军官举起的指挥刀（细长的钢色片，边走边挥）；
//   · 枪口焰 / 曳光 / 弹着：FarBankCrowd.TakeShots 的事件，用共用的 vfx 画（MuzzleFlash / Tracer / Impact）。
// 旗与刀是**逐个普通 Mesh**（每个一个 draw，共 ≤ 16 个），不是 InstancedMesh：会动的实例没有前帧历史，
// 违背 docs/Data_MotionVectorContract.md；普通 Mesh 的世界矩阵历史自动记录。
// 材质是顶点色的 Lambert（无贴图，不占采样器）；挂在 whiteboxCharacter 根下，白盒画质里也保持本色。
// ===========================================================================
import * as THREE from "three";

const CLOTH = [0.93, 0.91, 0.86], DISC = [0.74, 0.05, 0.06], POLE = [0.27, 0.19, 0.11], STEEL = [0.82, 0.85, 0.9];
const UP = { x: 0, y: 1, z: 0 };

function Part(positions, colors, indices, box, color) {
  const [x0, y0, z0, x1, y1, z1] = box, base = positions.length / 3;
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  for (const p of v) { positions.push(...p); colors.push(...color); }
  for (const f of [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [3, 7, 6], [3, 6, 2], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5]]) indices.push(...f.map((i) => base + i));
}
function Quad(positions, colors, indices, corners, color) {
  const base = positions.length / 3;
  for (const p of corners) { positions.push(...p); colors.push(...color); }
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
/** 日章旗：杆 + 旗面（白）+ 旗面正中的红圆（两面各一片，避免 z 冲突）。杆脚在原点，旗面朝 ±z，从杆顶向 +x 展开。 */
export function BuildFlagGeometry() {
  const p = [], c = [], i = [];
  Part(p, c, i, [-0.05, 0, -0.05, 0.05, 3.3, 0.05], POLE);
  const w = 1.5, h = 1.0, y1 = 3.25, y0 = y1 - h;
  Quad(p, c, i, [[0.03, y0, 0], [0.03 + w, y0, 0], [0.03 + w, y1, 0], [0.03, y1, 0]], CLOTH);
  const cx = 0.03 + w / 2, cy = (y0 + y1) / 2, r = 0.3, n = 14;
  for (const zOff of [0.012, -0.012]) {
    const centre = p.length / 3; p.push(cx, cy, zOff); c.push(...DISC);
    for (let k = 0; k <= n; k++) { const a = (k / n) * Math.PI * 2; p.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r, zOff); c.push(...DISC); }
    for (let k = 0; k < n; k++) i.push(centre, centre + 1 + k, centre + 2 + k);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
  g.setIndex(i); g.computeVertexNormals();
  return g;
}
/** 指挥刀：握柄在原点，刀身沿 +y 1.0 m（0.05 m 宽的钢片，略有厚度），护手一小片。 */
export function BuildSwordGeometry() {
  const p = [], c = [], i = [];
  Part(p, c, i, [-0.02, 0.0, -0.02, 0.02, 0.22, 0.02], POLE);
  Part(p, c, i, [-0.07, 0.22, -0.02, 0.07, 0.26, 0.02], [0.35, 0.3, 0.2]);
  Part(p, c, i, [-0.025, 0.26, -0.008, 0.025, 1.25, 0.008], STEEL);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
  g.setIndex(i); g.computeVertexNormals();
  return g;
}

export class FarBankCrowdView {
  constructor({ root, vfx }) {
    this.vfx = vfx;
    this.group = new THREE.Group();
    this.group.name = "FarBankCrowdProps";
    this.group.userData.whiteboxCharacter = true;
    root.add(this.group);
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.flagGeometry = BuildFlagGeometry();
    this.swordGeometry = BuildSwordGeometry();
    this.props = new Map();     // 单位 id -> { flag?: Mesh, sword?: Mesh, phase }
  }
  Prop(u) {
    let entry = this.props.get(u.id);
    if (entry) return entry;
    entry = { phase: (u.spec.lane + 3) * 1.7 };
    if (u.flag) { entry.flag = new THREE.Mesh(this.flagGeometry, this.material); entry.flag.name = `FarBankFlag_${u.id}`; entry.flag.castShadow = false; entry.flag.frustumCulled = false; this.group.add(entry.flag); }
    if (u.sword) { entry.sword = new THREE.Mesh(this.swordGeometry, this.material); entry.sword.name = `FarBankSword_${u.id}`; entry.sword.castShadow = false; entry.sword.frustumCulled = false; this.group.add(entry.sword); }
    this.props.set(u.id, entry);
    return entry;
  }
  /** 每帧：crowd = FarBankCrowd。没激活 / 没上场 / 上一帧不在视锥里的人，他的旗与刀就藏起来。 */
  Sync(crowd, time) {
    const live = crowd?.active;
    for (const u of crowd?.units || []) {
      if (!u.flag && !u.sword) continue;
      const entry = this.Prop(u);
      const show = !!live && u.mode !== "wait" && u.seen;
      if (entry.flag) entry.flag.visible = show;
      if (entry.sword) entry.sword.visible = show;
      if (!show) continue;
      const rx = Math.cos(u.yaw), rz = -Math.sin(u.yaw), fx = -Math.sin(u.yaw), fz = -Math.cos(u.yaw), t = time + entry.phase;
      const bob = (u.mode === "run" || u.mode === "pace") ? Math.abs(Math.sin((u.travel / 2.995 + u.phaseOff) * Math.PI * 2)) * 0.08 : 0;
      if (entry.flag) {
        entry.flag.position.set(u.x + rx * 0.34 + fx * 0.1, u.y + 0.15 + bob, u.z + rz * 0.34 + fz * 0.1);
        entry.flag.rotation.set(0, Math.sin(t * 2.1) * 0.3 + Math.sin(t * 5.3) * 0.08, Math.sin(t * 1.3) * 0.03);
      }
      if (entry.sword) {
        entry.sword.position.set(u.x + rx * 0.4 + fx * 0.2, u.y + 1.5 + bob, u.z + rz * 0.4 + fz * 0.2);
        entry.sword.rotation.set(-0.25, u.yaw, -0.65 + Math.sin(t * 3.1) * 0.35, "YXZ");
      }
    }
  }
  /** 一个枪口焰 / 曳光事件（FarBankCrowd.TakeShots）：vec(x,y,z) 由宿主给（要 three 的 Vector3）。 */
  Shot(e, vec) {
    const from = vec(e.from.x, e.from.y, e.from.z), dir = vec(e.dir.x, e.dir.y, e.dir.z), to = vec(e.to.x, e.to.y, e.to.z);
    this.vfx?.MuzzleFlash?.(from, dir, { scale: e.scale, kind: "rifle" });
    this.vfx?.Tracer?.(from, to, { kind: "ija" });
    if (e.impact) this.vfx?.Impact?.(to, vec(UP.x, UP.y, UP.z), "dirt", { weaponKind: "rifle" });
  }
  Dispose() {
    this.flagGeometry.dispose(); this.swordGeometry.dispose(); this.material.dispose();
    this.group.removeFromParent();
    this.props.clear();
  }
}
