// 《滕县 一九三八》物理层：Rapier3D（Apache-2.0，vendor/rapier）的封装。
//
// 为什么要换掉自己写的那套碰撞：
//
//   1. **静态几何只有轴对齐盒**。这座城里 68 处房屋、寨墙、路基是**斜着摆**的，
//      而登记碰撞时走的是「把旋转后的盒子再套一个轴对齐包围盒」——
//      一段 20 m 长、0.4 m 厚的 45° 斜墙，登记出来是 14×14 m 的实心方块。
//      观感就是：贴着墙走会被空气挡住，站在空地上开枪打在看不见的墙上。
//      这一条是「整个碰撞完全不对」的**主因**，换引擎的第一动机就是它。
//   2. **分轴推出**。x、z、y 各推一次，推出方向按「离哪一面近」猜。
//      Script_Player 里那三段长注释（贴墙站着被吸上房顶、陷进房子里一秒横移
//      20 m、收紧一版之后碎石变隐形墙）全是这套解法的补丁，
//      每修一条就压出另一条。
//   3. **AI 根本没有碰撞**：直接改 position，再用 StandHeight 吸一下高度，
//      拿一个 Blocked() 启发式挡一下。人从墙里穿过去是常态。
//   4. 没有刚体，所以尸体是一段固定姿势插值，手雷是「射线撞到就反射」。
//
// 现在的分工：
//   · **静态实体**（墙、房、垛口、路基、桥、道具）→ Rapier 的**带旋转**长方体。
//     几何是什么朝向，碰撞就是什么朝向。
//   · **人**（玩家与 AI 士兵）→ Rapier 的运动学角色控制器（胶囊 + 自动上台阶 +
//     贴地吸附 + 坡度限制）。爬墙、卡墙、瞬移这三类问题由引擎负责，不再打补丁。
//   · **抛掷物 / 碎块 / 布娃娃** → 真刚体。
//   · **地形**仍然是解析式的 `GroundHeight(x,z)`（见下面 groundAt 那一段注释），
//     不做高度场。
//
// 地形为什么不进 Rapier：
//   地表在 Script_TengxianCity 里是**解析函数**，视觉网格也是照它采样出来的。
//   转成高度场就要选一个分辨率，而任何分辨率都会与视觉网格差一点 ——
//   差值的表现是人浮在地上或陷进地里。解析式查询本身只有几次乘加，
//   比查高度场还便宜，也永远与画面严丝合缝。所以地形走 groundAt 兜底：
//   角色解算完与地面取高者，射线另外解析求交（RaycastTerrain）。

import * as THREE from "three";
import RAPIER from "./vendor/rapier/build/rapier.module.mjs";
import { TRAVERSAL } from "./Data_Traversal.mjs";

/** Rapier 的 wasm 是异步装载的。整个进程只装一次。 */
let initPromise = null;
/** 装载完成后就是 Rapier 的命名空间；没装载完一律是 null（构造器会拦）。 */
export let R = null;

export function InitPhysics() {
  if (!initPromise) {
    initPromise = RAPIER.init().then(() => { R = RAPIER; return RAPIER; });
  }
  return initPromise;
}

export function PhysicsReady() { return R !== null; }

/**
 * 碰撞分组。Rapier 的规则是「双向都要认」：
 * a 与 b 相互作用 ⟺ (a.成员 & b.过滤) ≠ 0 且 (b.成员 & a.过滤) ≠ 0。
 *
 * QUERY 是给射线用的一个虚拟成员位 —— 子弹只该打到 WORLD，
 * 打人那一段在 Script_Main 里按线段-胶囊自己算（要区分头/躯干/四肢，
 * 引擎的射线给不出这个），所以角色的过滤位里**故意不含 QUERY**。
 */
export const GROUP = {
  WORLD: 0x0001,
  CHARACTER: 0x0002,
  DEBRIS: 0x0004,
  RAGDOLL: 0x0008,
  QUERY: 0x0010,
};
const ALL = 0xFFFF;

/** 打包成 Rapier 的 InteractionGroups（高 16 位是成员，低 16 位是过滤）。 */
export const InteractionGroups = (member, filter) => (((member & 0xFFFF) << 16) | (filter & 0xFFFF)) >>> 0;

const IG_WORLD = InteractionGroups(GROUP.WORLD, ALL);
const IG_CHARACTER = InteractionGroups(GROUP.CHARACTER, GROUP.WORLD | GROUP.DEBRIS);
const IG_DEBRIS = InteractionGroups(GROUP.DEBRIS, ALL);
const IG_RAGDOLL = InteractionGroups(GROUP.RAGDOLL, GROUP.WORLD | GROUP.DEBRIS | GROUP.QUERY);
/** 射线默认只认静态世界。 */
const IG_RAY_WORLD = InteractionGroups(GROUP.QUERY, GROUP.WORLD);

// 单帧步长的钳位。**每帧必须步进一次** —— 角色是运动学刚体，
// 它的碰撞体位置是在 world.step() 里从刚体同步过去的；跳过一帧不步进，
// 下一帧 computeColliderMovement 读到的就是上一帧的位置，人会一点点穿进墙里。
// 所以这里不做「攒够一个定步长再跑」的累加器，直接把 dt 钳进合理区间跑一次。
const DT_MIN = 1 / 240;
const DT_MAX = 1 / 30;

/**
 * 「探一步」的水平位移（米）。见 CharacterBody.Move 里那段账。
 *
 * Rapier 的自动上台阶**跟单帧位移有关**：同一级 0.46 m 的台阶，
 * 每帧走 0.083 m（5 m/s）上得去，每帧走 0.05 m（3 m/s，也就是正常走路）上不去，
 * 而且把 autostep 的高度上限从 0.55 抬到 0.75 一点用都没有 —— 卡的不是高度。
 * 实测阈值：3 m/s 时能上 0.41 m，上不了 0.42 m。
 *
 * 城墙马道每级 0.46 m，正好落在上不去那一侧；蹲着走（1.62 m/s）更糟。
 * 所以被挡住时按这个位移**再解一次**，只借它的竖直分量（抬腿），
 * 水平分量按本来该走的距离缩回去 —— 人不会因此走快。
 */
const AUTOSTEP_PROBE_M = 0.14;
// Rapier 的 snapToGround 只认识灌进物理世界的实体；解析地形不在 Rapier 里。
// 同样给解析地表 0.45 m 的吸附距离，才不会走下坡时逐帧「离地—落下」。
const ANALYTIC_GROUND_SNAP_M = 0.45;

const _q = { x: 0, y: 0, z: 0, w: 1 };
/** 绕 Y 轴 ry 的四元数（这座城里所有旋转都只有偏航）。 */
function YawQuat(ry) {
  const h = ry * 0.5;
  _q.x = 0; _q.y = Math.sin(h); _q.z = 0; _q.w = Math.cos(h);
  return _q;
}

const Clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));

/**
 * 一座关卡的物理世界。**每换一关重建一份**（切片换了，静态几何全变）。
 */
export class PhysicsWorld {
  /**
   * @param {object} options
   *   groundAt(x,z)  解析地表高度。角色落地、射线打地、脚部 IK 全靠它。
   *   bounds         本关切片 { minX,maxX,minZ,maxZ }，用来给世界加一圈拦边墙
   *   gravity        重力（负值）。默认 −19.6 —— 沿用原来玩家的手感，
   *                  真实重力在第一人称射击里会让跳落显得像在月球上。
   */
  constructor({ groundAt = null, bounds = null, gravity = -19.6 } = {}) {
    if (!R) throw new Error("[Physics] 先 await InitPhysics() 再建世界");
    this.groundAt = groundAt || (() => 0);
    this.bounds = bounds;
    this.world = new R.World({ x: 0, y: gravity, z: 0 });
    this.world.timestep = 1 / 60;
    this.gravityY = gravity;

    // 静态几何全部挂在同一个固定刚体下（每个碰撞体自带相对位姿）。
    // 一关几千个盒子各建一个刚体的话，broad phase 的更新是白花的。
    this.staticBody = this.world.createRigidBody(R.RigidBodyDesc.fixed());
    /** collider.handle -> 建关时那条碰撞盒记录（子弹要读 tag 判材质音效）。 */
    this.recordByHandle = new Map();

    this.controller = this.world.createCharacterController(0.02);
    // 自动上台阶：马道的八级台阶、门槛、瓦砾堆全靠它。
    // minWidth 给 0.15 —— 太大的话窄台阶（马道每级踏面 0.3 m）会被判成
    //「站不下」而爬不上去。
    /** 自动抬腿的高度上限。**数在 `Data_Traversal.TRAVERSAL.stepMax`** ——
     * 通行高度阶梯的第一档，再高就归翻越/攀爬那两个动词管（同一张表）。 */
    this.autostepMax = TRAVERSAL.stepMax;
    this.controller.enableAutostep(this.autostepMax, 0.15, true);
    // 贴地吸附：走下坡与下台阶时脚不离地，不然人会一路小跳。
    this.controller.enableSnapToGround(0.45);
    this.controller.setMaxSlopeClimbAngle(52 * Math.PI / 180);
    this.controller.setMinSlopeSlideAngle(38 * Math.PI / 180);
    this.controller.setApplyImpulsesToDynamicBodies(true);
    this.controller.setCharacterMass(78);

    this.characters = new Set();
    this.dynamics = new Set();
    this.disposed = false;
    /**
     * 步进序号。角色靠它认出「我上次走完之后，世界还没步进过」。
     *
     * 为什么要这个：`computeColliderMovement` 依赖 broad phase 里的包围盒，
     * 而那份索引是在 `world.step()` 里更新的。同一具角色**连着走两步而中间没有
     * 步进**时，第二步读到的是过时的索引 —— 症状很奇怪：撞墙照样撞得住
     *（粗筛还能扫到那堵墙），但**自动上台阶失灵**（判"脚下有没有踩住东西"
     * 的那次下探落空，autostep 的前提条件不成立），人贴着台阶原地推。
     * 通关冒烟里「上城道走不上去」就是这个：那条用例自己按 1/60 调 player.Update
     * 跑 420 次，一次整帧都没走。
     */
    this.stepSerial = 0;

    this._ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    this._tmpNormal = [0, 0, 0];
    this._tmpPoint = new THREE.Vector3();
  }

  // -------------------------------------------------------------------------
  // 静态几何
  // -------------------------------------------------------------------------

  /**
   * 把建关攒下来的碰撞盒表灌进物理世界。
   *
   * 记录有两种形态（见 Script_World.BuildSink.Solid）：
   *   · 老形态 { min:[x,y,z], max:[x,y,z], tag }        —— 轴对齐，照旧
   *   · 新形态 额外带 { c:[cx,cy,cz], h:[hx,hy,hz], ry } —— **真实朝向的长方体**
   * 有 c/h/ry 就按 OBB 建，没有就退回 min/max。斜墙、斜屋、斜路基走的是前者，
   * 这一条就是"贴着斜墙走会被空气挡住"的修法。
   */
  BuildStatic(colliders) {
    if (!colliders) return 0;
    let n = 0;
    for (const box of colliders) {
      const desc = this._DescribeSolid(box);
      if (!desc) continue;
      const collider = this.world.createCollider(desc, this.staticBody);
      this.recordByHandle.set(collider.handle, box);
      // 运行时破坏按记录摘掉这一只碰撞体。把 handle 反写回同一条记录，
      // 就不必再扫 recordByHandle 做 O(n) 反查。
      box._physicsHandle = collider.handle;
      n += 1;
    }
    // broad phase 要走一次 step 才认得新碰撞体，不然紧接着的射线一律打空。
    this.world.step();
    return n;
  }

  _DescribeSolid(box) {
    let hx, hy, hz, cx, cy, cz, ry = 0;
    if (box.h && box.c) {
      hx = box.h[0]; hy = box.h[1]; hz = box.h[2];
      cx = box.c[0]; cy = box.c[1]; cz = box.c[2];
      ry = box.ry || 0;
    } else {
      hx = (box.max[0] - box.min[0]) * 0.5;
      hy = (box.max[1] - box.min[1]) * 0.5;
      hz = (box.max[2] - box.min[2]) * 0.5;
      cx = (box.max[0] + box.min[0]) * 0.5;
      cy = (box.max[1] + box.min[1]) * 0.5;
      cz = (box.max[2] + box.min[2]) * 0.5;
    }
    // 退化的盒子（厚度 0）会让求交出 NaN，直接丢掉。
    if (!(hx > 1e-4) || !(hy > 1e-4) || !(hz > 1e-4)) return null;
    const desc = R.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(cx, cy, cz)
      .setCollisionGroups(IG_WORLD)
      .setFriction(0.85)
      .setRestitution(box.tag === "water" ? 0 : 0.08);
    if (ry) desc.setRotation(YawQuat(ry));
    return desc;
  }

  /** 运行时新加一块静态实体（编辑器摆件、被炸出来的路障）。返回 handle。 */
  AddSolid(box) {
    const desc = this._DescribeSolid(box);
    if (!desc) return null;
    const collider = this.world.createCollider(desc, this.staticBody);
    this.recordByHandle.set(collider.handle, box);
    box._physicsHandle = collider.handle;
    return collider.handle;
  }

  RemoveSolid(handle) {
    if (handle === null || handle === undefined) return;
    const collider = this.world.getCollider(handle);
    if (collider) this.world.removeCollider(collider, false);
    const record = this.recordByHandle.get(handle);
    if (record && record._physicsHandle === handle) record._physicsHandle = null;
    this.recordByHandle.delete(handle);
  }

  /**
   * 让暂停态里刚增删的静态碰撞立刻进入场景查询。
   *
   * 正常玩法下一帧的 Step 会做这件事；编辑器暂停玩法后没有下一帧物理步进，
   * 若不主动传播，复原的墙已有 handle、射线却仍会从旧 broad phase 穿过去。
   * 这里只同步刚体到碰撞体，不推进时间，也不会让角色或动态残骸偷跑一帧。
   */
  RefreshStaticQueries() {
    if (this.disposed) return false;
    this.world.propagateModifiedBodyPositionsToColliders();
    // Rapier 0.26 的 JS World 没有公开 updateSceneQueries；新增 collider 只有走一次
    // pipeline 才进入 broad phase。dt=0 只提交拓扑，不积分速度/重力。保留原 timestep，
    // 下一帧正式 Step 仍按正常钳位值推进。
    const timestep = this.world.timestep;
    try {
      this.world.timestep = 0;
      this.world.step();
    } finally {
      this.world.timestep = timestep;
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // 步进
  // -------------------------------------------------------------------------

  Step(dt) {
    if (this.disposed) return;
    this.world.timestep = Clamp(dt, DT_MIN, DT_MAX);
    this.world.step();
    this.stepSerial += 1;
  }

  // -------------------------------------------------------------------------
  // 查询
  // -------------------------------------------------------------------------

  /**
   * 射线 vs 世界。**返回形状与原来的 RayAabb 完全一致** ——
   * { t, normal:[x,y,z], box } —— 这样 Script_Combat / Script_Ai / Script_Main
   * 那一圈调用点一个字都不用改。
   *
   * @param {THREE.Vector3|object} origin
   * @param {THREE.Vector3|object} direction 必须已归一化
   * @param {number} maxDist
   * @param {object} options
   *   terrain  是否也与解析地表求交（子弹、抛掷物给 true；AI 视线给 false，
   *            见 Script_Ai —— 视线判据一变，整套交战节奏都会跟着变，
   *            那是另一件事，不混在换引擎这一趟里做）
   *   groups   自定义 InteractionGroups（默认只认静态世界）
   */
  Raycast(origin, direction, maxDist = 200, options = null) {
    if (this.disposed || !(maxDist > 0)) return null;
    const terrain = options ? !!options.terrain : false;
    const groups = (options && options.groups) || IG_RAY_WORLD;
    this._ray.origin.x = origin.x; this._ray.origin.y = origin.y; this._ray.origin.z = origin.z;
    this._ray.dir.x = direction.x; this._ray.dir.y = direction.y; this._ray.dir.z = direction.z;
    const hit = this.world.castRayAndGetNormal(this._ray, maxDist, true, undefined, groups);
    let best = null;
    if (hit) {
      const n = hit.normal;
      best = {
        t: hit.timeOfImpact,
        normal: [n.x, n.y, n.z],
        box: this.recordByHandle.get(hit.collider.handle) || null,
      };
    }
    if (terrain) {
      const g = this.RaycastTerrain(origin, direction, best ? Math.min(best.t, maxDist) : maxDist);
      if (g && (!best || g.t < best.t)) best = g;
    }
    return best;
  }

  /**
   * 射线 vs 解析地表。
   *
   * 地形没有网格可打，只能沿射线找「射线低于地面」的那一步再二分。
   * 步长 0.6 m：这张地表最陡的起伏是荆河河槽与津浦路路基，尺度都在 3 m 以上，
   * 0.6 m 不会跨过去。**起点已经在地下时一律返回 null** ——
   * 那多半是站在某块碰撞体顶上（地表在脚下更深处），
   * 判成"一出枪口就打在地上"会让这个人再也开不出枪。
   */
  RaycastTerrain(origin, direction, maxDist = 200) {
    if (!(maxDist > 0)) return null;
    const g0 = this.groundAt(origin.x, origin.z);
    if (origin.y <= g0) return null;
    const step = 0.6;
    const steps = Math.min(2048, Math.ceil(maxDist / step));
    let prevT = 0, prevGap = origin.y - g0;
    for (let i = 1; i <= steps; i += 1) {
      const t = Math.min(maxDist, (i / steps) * maxDist);
      const x = origin.x + direction.x * t;
      const y = origin.y + direction.y * t;
      const z = origin.z + direction.z * t;
      const gap = y - this.groundAt(x, z);
      if (gap <= 0) {
        // 二分到 1 cm 以内
        let lo = prevT, hi = t;
        for (let k = 0; k < 12 && hi - lo > 0.01; k += 1) {
          const mid = (lo + hi) * 0.5;
          const my = origin.y + direction.y * mid;
          const mg = my - this.groundAt(origin.x + direction.x * mid, origin.z + direction.z * mid);
          if (mg <= 0) hi = mid; else lo = mid;
        }
        const hitT = hi;
        const hx = origin.x + direction.x * hitT;
        const hz = origin.z + direction.z * hitT;
        return { t: hitT, normal: this.TerrainNormal(hx, hz), box: TERRAIN_RECORD };
      }
      prevT = t; prevGap = gap;
    }
    return null;
  }

  /** 解析地表在 (x,z) 的法线（中心差分，0.5 m 的臂长足够平滑）。 */
  TerrainNormal(x, z, out = null) {
    const e = 0.5;
    const hL = this.groundAt(x - e, z), hR = this.groundAt(x + e, z);
    const hD = this.groundAt(x, z - e), hU = this.groundAt(x, z + e);
    let nx = (hL - hR) / (2 * e), ny = 1, nz = (hD - hU) / (2 * e);
    const inv = 1 / Math.hypot(nx, ny, nz);
    nx *= inv; ny *= inv; nz *= inv;
    if (out) { out[0] = nx; out[1] = ny; out[2] = nz; return out; }
    return [nx, ny, nz];
  }

  /**
   * 脚下探地：从 (x, fromY + up) 往下打，取**最高的可站面**（静态实体或地表）。
   *
   * 这是脚部 IK 与 AI「站在哪一层」共用的一条查询 ——
   * 两边必须问同一个函数，否则人的脚会踩在与身体不同的高度上。
   *
   * @returns {{y:number, normal:number[], tag:string}}
   */
  GroundProbe(x, z, fromY, up = 0.6, down = 3.0) {
    const startY = fromY + up;
    let y = this.groundAt(x, z);
    let normal = this.TerrainNormal(x, z);
    let tag = "terrain";
    let buried = false;                       // 探针起点就埋在实体里 = 前面那东西比探针高
    if (!this.disposed) {
      this._ray.origin.x = x; this._ray.origin.y = startY; this._ray.origin.z = z;
      this._ray.dir.x = 0; this._ray.dir.y = -1; this._ray.dir.z = 0;
      const maxToi = up + down;
      const hit = this.world.castRayAndGetNormal(this._ray, maxToi, true, undefined, IG_RAY_WORLD);
      // toi≈0 = 起点就埋在某个实体里（人陷进墙了）。那一下报回来的"地面高度"
      // 就是起点自己，用它会得出「脚离地 0.6 m」这种假读数 —— 直接当没打中，
      // 退回解析地表，让上层的脱困逻辑去管。
      if (hit && hit.timeOfImpact > 1e-3) {
        const hy = startY - hit.timeOfImpact;
        if (hy > y) {
          y = hy;
          normal = [hit.normal.x, hit.normal.y, hit.normal.z];
          const rec = this.recordByHandle.get(hit.collider.handle);
          tag = (rec && rec.tag) || "solid";
        }
      } else if (hit) {
        // toi≈0：起点埋在实体里。高度读数按上面那条退回解析地表（用它会得出
        // 「脚离地 0.6 m」这种假读数），但**这件事本身要报出去** —— 对
        // `_StepAheadIsLowEnough` 来说，"探针高度处还是实心的"正是"这堵墙比
        // 探针还高"的证据，退回地表会让它把三米高的墙读成平地，然后一路蹭上去。
        buried = true;
      }
    }
    return { y, normal, tag, buried };
  }

  /**
   * 这个胶囊摆在这儿会不会与实体重叠。
   * @param {number} x,y,z 脚底坐标
   */
  Overlaps(x, y, z, radius = 0.34, height = 1.78) {
    if (this.disposed) return false;
    const halfHeight = Math.max(0.02, height * 0.5 - radius);
    if (!this._probeShape || this._probeR !== radius || this._probeH !== halfHeight) {
      this._probeShape = new R.Capsule(halfHeight, radius);
      this._probeR = radius; this._probeH = halfHeight;
    }
    const hit = this.world.intersectionWithShape(
      { x, y: y + radius + halfHeight, z }, IDENTITY_ROT, this._probeShape,
      undefined, IG_RAY_WORLD);
    return !!hit;
  }

  /**
   * 在 (x,z) 附近找一个**站得下人**的位置。
   *
   * 出生点、重生点、撒兵点全都来自关卡数据与随机数，它们并不知道那儿正好有
   * 一堵墙。以前的解法是靠玩家碰撞的「推到最近的外面」把人挤出来 ——
   * 挤得动是运气，挤不动就卡在墙里（那正是 Script_Player 里 PUSH_MAX 那段
   * 注释在说的事）。运动学角色控制器**没有脱困能力**：埋进去就出不来。
   * 所以改成在放人之前先问一句「这儿站得下吗」，站不下就往外绕着找。
   *
   * @returns {{x:number,y:number,z:number,moved:number}}
   */
  FindFreeSpot(x, z, radius = 0.34, height = 1.78, maxRadius = 12) {
    const at = (px, pz) => this.GroundProbe(px, pz, this.groundAt(px, pz) + 0.3, 1.2, 4).y;
    let y = at(x, z);
    if (!this.Overlaps(x, y, z, radius, height)) return { x, y, z, moved: 0 };
    // 一圈一圈往外找。步长 0.8 m 是院墙厚度量级 —— 再细只是多花时间，
    // 再粗会跳过院子里那块唯一站得下的地方。
    for (let ring = 0.8; ring <= maxRadius; ring += 0.8) {
      const n = Math.max(8, Math.round(ring * 6));
      for (let i = 0; i < n; i += 1) {
        const a = (i / n) * Math.PI * 2 + ring;      // 每圈错开一点，别总从正东开始
        const px = x + Math.cos(a) * ring, pz = z + Math.sin(a) * ring;
        const py = at(px, pz);
        if (!this.Overlaps(px, py, pz, radius, height)) {
          return { x: px, y: py, z: pz, moved: ring };
        }
      }
    }
    return { x, y, z, moved: -1 };                   // 实在找不着：原地放，至少别丢人
  }

  // -------------------------------------------------------------------------
  // 角色
  // -------------------------------------------------------------------------

  /**
   * 建一个胶囊角色。position 给的是**脚底**（全项目的人物坐标都是脚底）。
   */
  MakeCharacter({ radius = 0.34, height = 1.78, position = null, mass = 78 } = {}) {
    const body = new CharacterBody(this, { radius, height, mass });
    if (position) body.Teleport(position.x, position.y, position.z);
    this.characters.add(body);
    return body;
  }

  // -------------------------------------------------------------------------
  // 刚体（手雷、碎块、布娃娃的骨块）
  // -------------------------------------------------------------------------

  /**
   * 一个球形刚体。手雷用它 —— 木柄弹在地上是滚的，
   * 原来那套「射线撞到就反射 + 落地衰减」滚不起来，弹到墙角会原地抖。
   */
  MakeSphere({ position, velocity = null, radius = 0.05, mass = 0.6,
    restitution = 0.24, friction = 0.7, linearDamping = 0.08, group = IG_DEBRIS } = {}) {
    const desc = R.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinearDamping(linearDamping)
      .setAngularDamping(0.35)
      .setCcdEnabled(true);
    if (velocity) desc.setLinvel(velocity.x, velocity.y, velocity.z);
    const body = this.world.createRigidBody(desc);
    this.world.createCollider(
      R.ColliderDesc.ball(radius)
        .setMass(mass)
        .setRestitution(restitution)
        .setFriction(friction)
        .setCollisionGroups(group),
      body);
    this.dynamics.add(body);
    return body;
  }

  /**
   * 一具会倒会滑会掉下去的**尸体**。
   *
   * 不做逐关节的布娃娃：这具骨架有十七个关节，拆成十七个刚体再用球关节接起来，
   * 调不好就是一堆抽搐的面条，而倒地姿势本来已经有一套写好的（Actor.PoseRagdoll）。
   * 这里要的是那套姿势缺的那一半 —— **位置**：中弹的人应该从城墙上摔下去、
   * 顺着马道滚下来、卡在街垒后面，而不是钉在断气那一帧的坐标上。
   * 所以尸体是一具**锁住旋转**的动态胶囊：姿势归动画，位移归物理。
   *
   * 锁旋转不是偷懒 —— 不锁的话胶囊会自己躺平，而躺平的胶囊和站着的胶囊
   * 占的地方完全不同，尸体会突然陷进地里或弹起来。姿势那一层看不出胶囊是竖的。
   */
  MakeCorpse({ position, velocity = null, radius = 0.3, height = 1.7 } = {}) {
    const halfHeight = Math.max(0.02, height * 0.5 - radius);
    const desc = R.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y + radius + halfHeight, position.z)
      .lockRotations()
      .setLinearDamping(0.35)
      .setCcdEnabled(false);
    if (velocity) desc.setLinvel(velocity.x, velocity.y, velocity.z);
    const body = this.world.createRigidBody(desc);
    this.world.createCollider(
      R.ColliderDesc.capsule(halfHeight, radius)
        .setMass(72)
        .setFriction(1.1)                 // 尸体不滑冰
        .setRestitution(0)
        .setCollisionGroups(IG_RAGDOLL),
      body);
    this.dynamics.add(body);
    body.userFeetOffset = radius + halfHeight;
    return body;
  }

  RemoveBody(body) {
    if (!body || this.disposed) return;
    this.dynamics.delete(body);
    this.world.removeRigidBody(body);
  }

  /**
   * 把一个刚体钳在地表以上。
   *
   * 解析地形不在物理世界里，所以「落到土地上」这一下要手写。分两种情形：
   *   · **砸下来**（法向速度够大）→ 按地面法线反射，切向掉一截（撞地会崴一下）
   *   · **贴着地**（已经停下来了）→ 只去掉法向分量，切向按滚动阻力衰减
   * 两者不分开的话会出一个很难看的 bug：手雷落地后每帧都被当成"砸地"，
   * 水平速度每帧乘 0.62 —— 十几帧就原地不动了，木柄弹永远滚不出去。
   */
  ClampToGround(body, dt = 1 / 60, { lift = 0.03, restitution = 0.28, impactFriction = 0.72, rollDrag = 1.9, stopSpeed = 0.35 } = {}) {
    const p = body.translation();
    const g = this.groundAt(p.x, p.z) + lift;
    if (p.y >= g) return false;
    const n = this.TerrainNormal(p.x, p.z);
    const v = body.linvel();
    const vn = v.x * n[0] + v.y * n[1] + v.z * n[2];
    body.setTranslation({ x: p.x, y: g, z: p.z }, true);
    let vx = v.x - vn * n[0], vy = v.y - vn * n[1], vz = v.z - vn * n[2];   // 切向
    if (vn < -0.8) {
      const b = -vn * restitution;
      vx = vx * impactFriction + n[0] * b;
      vy = vy * impactFriction + n[1] * b;
      vz = vz * impactFriction + n[2] * b;
    } else {
      const k = Math.max(0, 1 - rollDrag * dt);
      vx *= k; vy *= k; vz *= k;
      if (Math.hypot(vx, vy, vz) < stopSpeed) { vx = 0; vy = 0; vz = 0; }
    }
    body.setLinvel({ x: vx, y: vy, z: vz }, true);
    return true;
  }

  Stats() {
    return {
      solids: this.recordByHandle.size,
      characters: this.characters.size,
      dynamics: this.dynamics.size,
      bodies: this.world.bodies.len(),
      colliders: this.world.colliders.len(),
    };
  }

  Dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const c of this.characters) c._Detach();
    this.characters.clear();
    this.dynamics.clear();
    this.recordByHandle.clear();
    this.world.free();
    this.world = null;
  }
}

/** 地表命中时交出去的那条"碰撞盒记录"（子弹按 tag 挑弹着音效与特效）。 */
const TERRAIN_RECORD = { tag: "dirt", min: [0, 0, 0], max: [0, 0, 0] };

/** 形状查询要一个朝向；人一律是直立的胶囊，用不着转。 */
const IDENTITY_ROT = { x: 0, y: 0, z: 0, w: 1 };

/**
 * 一个胶囊角色。玩家与每个 AI 士兵各一份。
 *
 * 坐标约定：`position` 是**脚底**。胶囊本身要往上抬 radius+halfHeight。
 */
export class CharacterBody {
  constructor(pw, { radius, height, mass }) {
    this.pw = pw;
    this.position = new THREE.Vector3();
    this.grounded = true;
    this.radius = radius;
    this.height = height;
    this.mass = mass;
    this.body = pw.world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0, 0));
    this.collider = null;
    this._MakeCollider(radius, height);
    /** 上一次解算里撞到了什么（撞墙音效、AI 绕行都读它）。 */
    this.hitCount = 0;
    /** 上一次 Move 时世界的步进序号（见 PhysicsWorld.stepSerial）。 */
    this.lastStepSerial = -1;
    this.detached = false;
  }

  _MakeCollider(radius, height) {
    // 胶囊总高 = 2*halfHeight + 2*radius。人比胶囊直径高得多，所以 halfHeight>0；
    // 卧姿那一档 height 只有 0.58 而 radius 0.42，会算出负值，钳到 2 cm。
    const halfHeight = Math.max(0.02, height * 0.5 - radius);
    if (this.collider) this.pw.world.removeCollider(this.collider, false);
    this.collider = this.pw.world.createCollider(
      R.ColliderDesc.capsule(halfHeight, radius)
        .setTranslation(0, radius + halfHeight, 0)     // 刚体原点在脚底
        .setCollisionGroups(IG_CHARACTER)
        .setFriction(0.0),                             // 摩擦交给控制器，别让人黏在墙上
      this.body);
    this.radius = radius;
    this.height = height;
    this.halfHeight = halfHeight;
  }

  /** 姿态切换（站/蹲/卧）会换胶囊尺寸。同尺寸就不动，免得每帧重建。 */
  SetSize(radius, height) {
    if (Math.abs(radius - this.radius) < 1e-4 && Math.abs(height - this.height) < 1e-4) return;
    this._MakeCollider(radius, height);
  }

  /** 瞬移（出生、换关、翻越落点）。 */
  Teleport(x, y, z) {
    this.position.set(x, y, z);
    if (this.detached) return;
    this.SyncCollider();
  }

  /**
   * 把刚体与**碰撞体**都搬到 this.position。
   *
   * 两句都要：`setNextKinematicTranslation` 是给 world.step() 的积分用的，
   * `setTranslation` + `propagateModifiedBodyPositionsToColliders` 则让碰撞体
   * **当场**就位。
   *
   * 为什么不能只留前者：碰撞体的位置是在 step 里从刚体同步过去的，
   * 于是「一帧里 Move 两次」或者「有人直接驱动 player.Update 而不走整帧」
   * 这两种用法下，第二次解算读到的还是上一次的位置 —— 人原地不动。
   * 通关冒烟里「上城道走不上去」就是后一种：那条用例是自己按 1/60 调
   * player.Update 跑 420 次，一次 world.step() 都没有。
   */
  SyncCollider() {
    this.body.setTranslation(this.position, true);
    this.body.setNextKinematicTranslation(this.position);
    this.pw.world.propagateModifiedBodyPositionsToColliders();
  }

  /**
   * 有人绕过 Move 直接改了 position（撒兵、过场摆位、测试摆人），就把胶囊搬过去。
   *
   * `position` 从这一轮起**不再是真相** —— 真相在物理世界里。但项目里到处都是
   * `s.position.set(...)` 这种写法（AI 的撒兵、冒烟脚本的摆人），一处一处改过去
   * 既啰嗦又必然漏。所以反过来：每帧解算之前对一下账，差得离谱就认外面那份。
   *
   * 阈值 0.5 m：正常一帧最多走 0.07 m（4.2 m/s ÷ 60），差到半米一定是瞬移。
   */
  ReconcileTo(x, y, z, threshold = 0.5) {
    if (this.detached) return false;
    if (Math.abs(this.position.x - x) < threshold
      && Math.abs(this.position.y - y) < threshold
      && Math.abs(this.position.z - z) < threshold) return false;
    this.Teleport(x, y, z);
    return true;
  }

  /**
   * 走一步。dx/dy/dz 是**本帧想走的位移**（速度 × dt），
   * 引擎负责贴墙滑、上台阶、卡坡。
   *
   * @returns {{x:number,y:number,z:number,grounded:boolean,blocked:boolean}}
   */
  Move(dx, dy, dz) {
    if (this.detached) return { x: this.position.x, y: this.position.y, z: this.position.z, grounded: this.grounded, blocked: false };
    const pw = this.pw;
    // 上一次走完之后世界没步进过 => 查询索引是旧的，自动上台阶会失灵。
    // 正常的整帧里这一条永远不成立（Script_Main.Frame 每帧步一次），
    // 只有"绕过整帧直接驱动角色"的用法会踩到；给它补一次最小步进。
    if (this.lastStepSerial === pw.stepSerial) pw.Step(DT_MIN);
    this.lastStepSerial = pw.stepSerial;
    const cc = pw.controller;
    const FLAGS = R.QueryFilterFlags.EXCLUDE_SENSORS;
    // 上一帧结束时站没站住。**不能用引擎这一次算出来的 grounded**：
    // 站在解析地表上时引擎脚下什么碰撞体都没有，它一律答"没站住"
    //（地面是 Script_Main 那条 groundAt 兜底提上来的，不在物理世界里）。
    const wasGrounded = this.grounded;
    cc.computeColliderMovement(this.collider, { x: dx, y: dy, z: dz }, FLAGS, IG_CHARACTER);
    let m = cc.computedMovement();
    let mx = m.x, my = m.y, mz = m.z;
    this.hitCount = cc.numComputedCollisions();
    this.grounded = cc.computedGrounded();
    const hasPhysicsGround = this.grounded;

    // 被挡住了？按 AUTOSTEP_PROBE_M 再解一次，看看是不是一级抬得上去的台阶。
    // 只在**站在地上、几乎没走动、而且没在往上走**时才试：
    //   · 站在地上 —— 抬腿是脚踩着地才有的动作；
    //   · dy <= 0  —— 起跳/上升途中贴着墙也会满足"被挡住"，借到的那一下抬腿
    //     会直接叠在跳跃高度上（贴墙跳比空地跳高一大截，就是这么来的）。
    // 所以正常行走一帧只解一次，跳跃全程一次都不解。
    const wantH = Math.hypot(dx, dz);
    const gotH = Math.hypot(mx, mz);
    if (wasGrounded && dy <= 0 && wantH > 1e-6 && wantH < AUTOSTEP_PROBE_M && gotH < wantH * 0.5
      && this._StepAheadIsLowEnough(dx / wantH, dz / wantH)) {
      const k = AUTOSTEP_PROBE_M / wantH;
      cc.computeColliderMovement(this.collider, { x: dx * k, y: dy, z: dz * k }, FLAGS, IG_CHARACTER);
      const m2 = cc.computedMovement();
      if (m2.y > my + 1e-4) {
        const got2 = Math.hypot(m2.x, m2.z);
        // 水平按本来该走的那一步缩回去：借的是"抬腿"，不是"走得更快"
        const scale = got2 > 1e-6 ? Math.min(1, wantH / got2) : 0;
        // 竖直也封顶：借的是**一级台阶**，不是沿着墙面一点点往上蹭。
        mx = m2.x * scale; my = Math.min(m2.y, dy + pw.autostepMax); mz = m2.z * scale;
        this.hitCount = cc.numComputedCollisions();
      }
    }
    const mv = { x: mx, y: my, z: mz };
    this.position.x += mv.x;
    this.position.y += mv.y;
    this.position.z += mv.z;

    // 地表兜底。解析地形不在物理世界里，所以 Rapier 自带的 snapToGround 对它
    // 完全无效。旧版只在穿到地面以下时往上提：下坡时脚底先高出坡面一小截，
    // 下一帧 grounded=false 开始落，再下一帧被提回去，人物就沿坡一路小跳。
    //
    // 只在 Rapier **没有**找到实体支撑、上一帧确实站着、且没有向上跳时吸附解析面；
    // 这样 0.3 m 高的实体台子不会被错误拉穿，玩家起跳也不会被吸回地上。
    const g = pw.groundAt(this.position.x, this.position.z);
    const analyticGap = this.position.y - g;
    const snapAnalytic = !hasPhysicsGround && wasGrounded && dy <= 0 && my <= 1e-4
      && analyticGap >= 0 && analyticGap <= ANALYTIC_GROUND_SNAP_M;
    if (this.position.y < g || snapAnalytic) {
      this.position.y = g;
      this.grounded = true;
    }

    this.SyncCollider();
    // 想走的与实际走的差得多 = 被挡住了。AI 的绕行判据读它，
    // 比原来那个「两帧位移小于阈值」的 stuck 计时准得多。
    const wantSq = dx * dx + dz * dz;
    const gotSq = mv.x * mv.x + mv.z * mv.z;
    const blocked = wantSq > 1e-6 && gotSq < wantSq * 0.25;
    return {
      x: this.position.x, y: this.position.y, z: this.position.z,
      grounded: this.grounded, blocked,
    };
  }

  /**
   * 挡在正前方的那个东西，顶面够不够矮（矮到能抬腿跨上去）。
   *
   * 「探一步」那一手用的位移比真实步长大，而 Rapier 在这种输入下会顺着台阶的
   * 棱角多蹭上去一截：实测一级 0.60 m 的坎也被它一点一点抬了上去，
   * 而 0.60 m 起是**翻越**那个动词的地盘（按住空格扒墙头）。
   * 单看一帧抬了多少拦不住它（0.60 m 是分两三帧蹭上去的），
   * 所以直接问一句「前面那层有多高」—— 这也正是老解算里 `topRel < 0.56` 那一条。
   */
  _StepAheadIsLowEnough(nx, nz) {
    const pw = this.pw;
    const reach = this.radius + 0.12;
    const x = this.position.x + nx * reach;
    const z = this.position.z + nz * reach;
    const limit = pw.autostepMax;
    const g = pw.GroundProbe(x, z, this.position.y, limit + 0.08, 1.2);
    // 探针起点（脚底 + limit + 0.08）还在实体里 = 前面那东西高过上限。
    // 这一条以前漏了：射线起点埋在墙里时 GroundProbe 退回解析地表，
    // 于是三米高的院墙被读成"前面是平地"，探一步照解 —— 这一段能不能真把人蹭上去
    // 取决于墙面附近有没有棱角可借，属于"看运气"的那一类。高过 limit 的东西
    // 归翻越/攀爬管，这里不该给它任何机会。
    if (g.buried) return false;
    return g.y - this.position.y <= limit;
  }

  _Detach() {
    if (this.detached) return;
    this.detached = true;
    this.collider = null;
    this.body = null;
  }

  Remove() {
    if (this.detached) return;
    this.pw.characters.delete(this);
    this.pw.world.removeRigidBody(this.body);
    this._Detach();
  }
}

export default PhysicsWorld;
