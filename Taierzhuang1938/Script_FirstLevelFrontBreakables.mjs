// ===========================================================================
// Script_FirstLevelFrontBreakables.mjs —— 第一关 03–05 前沿「炮打掩体、一截截打掉」的可破坏体块
//
// 口径：docs/Data_FirstLevel0105Refactor20260923Contract.md §2 第 7 条（战车包）。
// 全局 GAMEPLAY_DESTRUCTION_ENABLED 仍是 false：这里不走通用破坏（那套会改导航与承重），
// 只做**数据驱动的分段体块**：每个可破坏物预先建好每一段状态的网格，炮弹落在近旁就
// 切到下一段 —— 换可见性 + 物理 AddSolid/RemoveSolid，碎块走 VFX 池。
//
// 数据（Space 包的 Data_FirstLevelFrontBreakables.mjs 会取代 Data_Tuning_Tank.FRONT_BREAKABLES_TEMP）：
//   {
//     id,                 // 唯一名
//     block?,             // 接管 MISSION_LAYOUT.blocks 里的哪一块（布局里最好标 dynamic:true，
//                         //   整块就不进静态合批；没标时运行时把静态合批里那块的顶点塌掉、摘掉碰撞）
//     x, z, w, d, ry?,    // 没有 block 时直接给外廓（米，墙体局部 X 沿长边）
//     base?,              // 墙脚高度（缺省 = 接管块的底 / 地面采样最低点 − 0.1）
//     semantic?,          // 材质语义（缺省取接管块的）
//     stages: [           // 第 0 段 = 完好；每段是一串沿长边的截面 [from, to, top]（墙体局部，top 为离墙脚的高）
//       [[-1.7, 1.7, 1.5]],
//       [[-1.7, -0.7, 1.5], [-0.7, 0.7, 1.1], [0.7, 1.7, 1.5]],
//     ],
//     hitRadiusM,         // 炮弹落点离墙面这么近才算打到（米）
//     minDamage?,         // 炮弹伤害不到这个数不算（手榴弹默认不够）
//   }
// 永远不可破坏：阵位后墙、支沟、守军安全区（Data_Tuning_Tank.NEVER_BREAKABLE_RULES：按体块名 + 按区域；
// 数据里写了也拒绝）。
// ===========================================================================
import * as THREE from "three";
import { FRONT_BREAKABLES_TEMP, NEVER_BREAKABLE_RULES } from "./Data_Tuning_Tank.mjs";

export { FRONT_BREAKABLES_TEMP, NEVER_BREAKABLE_RULES };
/** 按体块名的那一半（兼容旧名字）。 */
export const NEVER_BREAKABLE = NEVER_BREAKABLE_RULES.ids;

const Clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** 把一截截面（墙体局部）变成世界外廓。 */
export function SegmentBox(spec, [from, to, top], base) {
  const ry = spec.ry || 0, mid = (from + to) / 2, c = Math.cos(ry), s = Math.sin(ry);
  return {
    x: spec.x + c * mid, z: spec.z - s * mid, y: base + top / 2,
    w: Math.max(0.05, to - from), h: Math.max(0.05, top), d: spec.d, ry,
  };
}
/** 世界点到墙体外廓（任一段状态的最大外廓）的水平距离。 */
export function DistanceToWall(spec, point) {
  const ry = spec.ry || 0, c = Math.cos(ry), s = Math.sin(ry);
  const dx = point.x - spec.x, dz = point.z - spec.z;
  const lx = c * dx - s * dz, lz = s * dx + c * dz;
  const ex = Math.max(0, Math.abs(lx) - spec.w / 2), ez = Math.max(0, Math.abs(lz) - spec.d / 2);
  return Math.hypot(ex, ez);
}
function Collider(box, id) {
  const hx = box.w / 2, hy = box.h / 2, hz = box.d / 2, ry = box.ry || 0;
  const ax = Math.abs(Math.cos(ry)) * hx + Math.abs(Math.sin(ry)) * hz, az = Math.abs(Math.sin(ry)) * hx + Math.abs(Math.cos(ry)) * hz;
  return { id, tag: "whiteboxWall", c: [box.x, box.y, box.z], h: [hx, hy, hz], ry,
    min: [box.x - ax, box.y - hy, box.z - az], max: [box.x + ax, box.y + hy, box.z + az] };
}

export class FirstLevelFrontBreakables {
  /**
   * @param {object} host { scene, battlefield, physics, vfx, audio?, layout? }
   * @param {Array} specs 见文件头
   */
  constructor({ scene, battlefield, physics, vfx = null, audio = null, layout = null }, specs = FRONT_BREAKABLES_TEMP,
    rules = NEVER_BREAKABLE_RULES) {
    Object.assign(this, { scene, battlefield, physics, vfx, audio, layout, rules });
    this.root = new THREE.Group();
    this.root.name = "FirstLevelFrontBreakables";
    scene.add(this.root);
    this.items = [];
    this.geometries = [];
    this.log = [];
    this.rejected = [];
    for (const raw of specs) {
      const item = this.Build(raw);
      if (item) this.items.push(item);
    }
  }
  /** 永不可破坏：按体块名，或外廓碰到受保护区域（layout.zones 的语义 id）。返回理由，可破就返回 null。 */
  Protected(raw, spec) {
    const ids = this.rules?.ids || [];
    if (ids.includes(raw.id) || (raw.block && ids.includes(raw.block))) return "id";
    for (const zoneId of this.rules?.zones || []) {
      const zone = this.layout?.zones?.find((z) => z.id === zoneId);
      if (zone && DistanceToWall(spec, zone) <= (zone.radius ?? 0)) return `zone:${zoneId}`;
    }
    return null;
  }
  Build(raw) {
    const block = raw.block ? this.layout?.blocks?.find((b) => b.id === raw.block) : null;
    if (raw.block && !block) { console.warn(`[FrontBreakables] 找不到体块 ${raw.block}`); return null; }
    const spec = { ...raw, x: raw.x ?? block.x, z: raw.z ?? block.z, w: raw.w ?? block.w, d: raw.d ?? block.d, ry: raw.ry ?? block?.ry ?? 0 };
    const why = this.Protected(raw, spec);
    if (why) {
      this.rejected.push({ id: raw.id, why });
      console.warn(`[FrontBreakables] ${raw.id} 永不可破坏（${why}），跳过`);
      return null;
    }
    const base = raw.base ?? (block ? block.y - block.h / 2 : this.battlefield.GroundHeight(spec.x, spec.z) - 0.1);
    // 墙脚到原块顶的高度：数据里的 top 按「离地」写，地面低于墙脚时补上这段。
    const ground = this.battlefield.GroundHeight(spec.x, spec.z);
    const lift = Math.max(0, ground - base);
    const semantic = raw.semantic ?? block?.semantic ?? "Whitebox";
    const material = this.battlefield.materials?.get?.(semantic) || this.battlefield.whiteMaterial
      || new THREE.MeshStandardMaterial({ color: 0x8a8272, roughness: 0.95 });
    const stages = raw.stages.map((profile, index) => {
      const group = new THREE.Group();
      group.name = `FrontBreakable_${raw.id}_${index}`;
      group.visible = false;
      const boxes = profile.map((segment) => SegmentBox(spec, [segment[0], segment[1], segment[2] + lift], base));
      for (const box of boxes) {
        const geometry = new THREE.BoxGeometry(box.w, box.h, box.d);
        this.geometries.push(geometry);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(box.x, box.y, box.z); mesh.rotation.y = box.ry;
        mesh.castShadow = true; mesh.receiveShadow = true;
        group.add(mesh);
      }
      this.root.add(group);
      return { group, boxes, colliders: [] };
    });
    const item = { id: raw.id, spec, base, lift, stages, stage: -1, hitRadiusM: raw.hitRadiusM ?? 2.2,
      minDamage: raw.minDamage ?? 60, takeover: null, lastBreakAt: -Infinity };
    if (block && !block.dynamic) item.takeover = this.TakeOverStatic(block);
    this.SetStage(item, 0);
    return item;
  }
  /**
   * 布局里没标 dynamic 的静态块：把静态合批里属于它的顶点塌到墙脚、摘掉它的碰撞盒。
   * 只动名为 FirstLevelWhitebox_StaticWhiteBoxes 的合批（地面块不碰），按外廓内的顶点认。
   */
  TakeOverStatic(block) {
    const eps = 1e-3, ry = block.ry || 0, c = Math.cos(ry), s = Math.sin(ry);
    const Inside = (x, y, z) => {
      const dx = x - block.x, dz = z - block.z, lx = c * dx - s * dz, lz = s * dx + c * dz;
      return Math.abs(lx) <= block.w / 2 + eps && Math.abs(lz) <= block.d / 2 + eps && Math.abs(y - block.y) <= block.h / 2 + eps;
    };
    let vertices = 0;
    const floor = block.y - block.h / 2;
    // 记下原样：Dispose（读档 / 重建任务运行时而战场不重建）时把顶点和碰撞盒还回去。
    const saved = { vertices: [], colliders: [] };
    for (const mesh of this.battlefield.meshes || []) {
      if (mesh.name !== "FirstLevelWhitebox_StaticWhiteBoxes" || !mesh.geometry?.attributes?.position) continue;
      const position = mesh.geometry.attributes.position;
      mesh.updateMatrixWorld?.(true);
      const identity = mesh.matrixWorld.equals(new THREE.Matrix4());
      const v = new THREE.Vector3();
      let touched = false;
      for (let i = 0; i < position.count; i++) {
        v.fromBufferAttribute(position, i);
        if (!identity) v.applyMatrix4(mesh.matrixWorld);
        if (!Inside(v.x, v.y, v.z)) continue;
        saved.vertices.push({ position, i, x: position.getX(i), y: position.getY(i), z: position.getZ(i), mesh });
        // 塌到墙脚（埋在土里）：三角形退化，不画。
        v.set(block.x, floor, block.z);
        if (!identity) v.applyMatrix4(mesh.matrixWorld.clone().invert());
        position.setXYZ(i, v.x, v.y, v.z); vertices++; touched = true;
      }
      if (touched) { position.needsUpdate = true; mesh.geometry.computeBoundingSphere(); }
    }
    let removed = 0;
    const list = this.battlefield.colliders || [];
    for (let i = list.length - 1; i >= 0; i--) {
      const box = list[i];
      if (!box?.c || !box?.h) continue;
      const same = Math.abs(box.c[0] - block.x) < eps && Math.abs(box.c[1] - block.y) < eps && Math.abs(box.c[2] - block.z) < eps
        && Math.abs(box.h[0] - block.w / 2) < eps && Math.abs(box.h[1] - block.h / 2) < eps && Math.abs(box.h[2] - block.d / 2) < eps;
      if (!same) continue;
      const hadHandle = box._physicsHandle != null;
      if (hadHandle) this.physics?.RemoveSolid(box._physicsHandle);
      list.splice(i, 1); removed++;
      saved.colliders.push({ box, index: i, hadHandle });
    }
    this.RefreshQueries();
    this.takeovers ||= [];
    this.takeovers.push(saved);
    return { vertices, colliders: removed };
  }
  /** 把 TakeOverStatic 塌掉的顶点、摘掉的碰撞盒还回去。 */
  RestoreStatic() {
    const list = this.battlefield.colliders || [];
    for (const saved of (this.takeovers || []).reverse()) {
      const touched = new Set();
      for (const v of saved.vertices) { v.position.setXYZ(v.i, v.x, v.y, v.z); touched.add(v.mesh); }
      for (const mesh of touched) { mesh.geometry.attributes.position.needsUpdate = true; mesh.geometry.computeBoundingSphere(); }
      for (const { box, index, hadHandle } of saved.colliders.reverse()) {
        // 只把当初真从物理世界里摘掉的那块加回去（没有 handle 的本来就不在物理世界里，别凭空多一块）。
        if (hadHandle) this.physics?.AddSolid(box);
        list.splice(Math.min(index, list.length), 0, box);
      }
    }
    this.takeovers = [];
  }
  RefreshQueries() {
    this.physics?.RefreshStaticQueries?.();
    this.battlefield.BuildCollisionGrid?.();
  }
  SetStage(item, stage) {
    stage = Clamp(stage, 0, item.stages.length - 1);
    if (stage === item.stage) return false;
    const list = this.battlefield.colliders || [];
    if (item.stage >= 0) {
      const old = item.stages[item.stage];
      old.group.visible = false;
      for (const box of old.colliders) {
        if (box._physicsHandle != null) this.physics?.RemoveSolid(box._physicsHandle);
        const i = list.indexOf(box); if (i >= 0) list.splice(i, 1);
      }
      old.colliders = [];
    }
    const next = item.stages[stage];
    next.group.visible = true;
    next.colliders = next.boxes.map((box, i) => Collider(box, `${item.id}_${stage}_${i}`));
    for (const box of next.colliders) { this.physics?.AddSolid(box); list.push(box); }
    item.stage = stage;
    this.RefreshQueries();
    return true;
  }
  /**
   * 一次爆炸（战车炮弹、炮击）：落点离哪块墙够近、伤害够大，就往下打一段。
   * 一次爆炸每块墙最多掉一段；返回打掉的清单。
   */
  OnBlast(position, { damage = 0, time = 0, kind = "shell" } = {}) {
    const broken = [];
    for (const item of this.items) {
      if (item.stage >= item.stages.length - 1 || damage < item.minDamage) continue;
      if (DistanceToWall(item.spec, position) > item.hitRadiusM) continue;
      if (time - item.lastBreakAt < 0.3) continue;
      const before = item.stage;
      if (!this.SetStage(item, item.stage + 1)) continue;
      item.lastBreakAt = time;
      broken.push({ id: item.id, from: before, to: item.stage });
      this.log.push({ t: time, id: item.id, from: before, to: item.stage, kind, at: { x: position.x, z: position.z } });
      this.Debris(item, before);
    }
    return broken;
  }
  /** 掉下来的那截：几簇砖土碎块 + 尘。 */
  Debris(item, before) {
    if (!this.vfx) return;
    const was = item.stages[before].boxes, now = item.stages[item.stage].boxes;
    const topNow = Math.max(...now.map((b) => b.y + b.h / 2));
    for (const box of was) {
      const top = box.y + box.h / 2;
      if (top <= topNow - 0.05 && now.length === was.length) continue;
      const normal = new THREE.Vector3(0, 1, 0);
      for (let k = 0; k < 3; k++) {
        const p = new THREE.Vector3(box.x + (Math.random() - 0.5) * box.w * 0.6, top - 0.1, box.z + (Math.random() - 0.5) * box.d * 0.6);
        this.vfx.Impact(p, normal, "brick", { weaponKind: "shell", hardSparks: false });
      }
    }
  }
  State() {
    return this.items.map((item) => ({ id: item.id, stage: item.stage, stages: item.stages.length, takeover: item.takeover,
      colliders: item.stages[item.stage]?.colliders.length ?? 0 }));
  }
  Dispose() {
    const list = this.battlefield.colliders || [];
    for (const item of this.items) {
      for (const box of item.stages[item.stage]?.colliders || []) {
        if (box._physicsHandle != null) this.physics?.RemoveSolid(box._physicsHandle);
        const i = list.indexOf(box); if (i >= 0) list.splice(i, 1);
      }
    }
    for (const geometry of this.geometries) geometry.dispose();
    this.scene.remove(this.root);
    this.items = [];
    this.RestoreStatic();
    this.RefreshQueries();
  }
}
