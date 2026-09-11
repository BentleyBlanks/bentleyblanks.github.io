// ===========================================================================
// Script_AiCover.mjs —— 战术位置系统：掩体注册表 / 占用 / 射线验证 / 侧翼判定 / 探头姿势
//
// 职责（docs/Data_EnemyAi.md §4.2）：回答一个兵四个问题 ——
//   ① 我身边有哪些掩体？（空间散列邻域，不再全表随机抽 24 个）
//   ② 哪个挡得住**这个**威胁？（射线验证，不是按夹角猜）
//   ③ 谁已经占了？（互斥登记，六个人不再选同一个点）
//   ④ 到了之后怎么藏、怎么探头？（隐蔽位 / 射击位 / 两种姿态 / 侧步方向）
//
// 契约：
//   · **不 import three、不 import Script_Ai**。只吃普通对象 `{x,y,z}` 与注入的 host
//     （Time/Rnd/Raycast/BlocksSight/GroundHeight/Walkable/Steer/SightRange/StanceEye）。
//     纯 Node 毫秒级可测：`node Taierzhuang1938/Script_AiCoverTest.mjs`。
//   · host.Raycast 收到的是**普通对象**（`{x,y,z}`），不是 THREE.Vector3。
//     `Script_Ai` 那边的适配器要把它拷进自己的临时向量再交给 `battlefield.Raycast`。
//   · 数全在 `Data_Tuning_AiCover.mjs`，本文件不写裸数（除了纯几何的 1e-6 之类）。
//   · 朝向契约：yaw=0 正面朝 -Z；X 向东、Z 向南、Y 向上，单位米。
//     姿态 0 站 / 1 蹲 / 2 卧，眼高由 host.StanceEye 给（1.5 / 1.0 / 0.5）。
//   · **确定性**：本模块一次 host.Rnd() 都不调。需要"随便挑一边"的地方按掩体 id 的奇偶定，
//     这样同一个人反复查询不会左右摇摆（用随机数会让人在墙角来回横跳）。
//
// ---------------------------------------------------------------------------
// 掩体数据的约定 —— 这是本模块最需要说清楚的一件事
// ---------------------------------------------------------------------------
//
// **(x, z) 是掩体自己的落地点（墙体/沙袋/矮墙的中心），不是站人的点。** 取证：
//   · `Script_World.Cover(x, z, height, faceX, faceZ)` 的调用方几乎都传墙体自己的中心：
//     `Script_World.mjs:204` 是那面墙的 (x,z)，`:1827` 是沙袋垛的 (x,z)；
//   · `Script_WallPlan.mjs:281` 推的是路径点 `pc`（墙中线上的点）；
//   · 唯一的例外是 `Script_TengxianOutfield.mjs:862`（河堤）：它把点**往外挪了** topHalf+0.9，
//     推的已经是"站人处"。这类点算出来的隐蔽位会离堤脚远一点，靠 Walkable 与射线验证兜底。
// 所以隐蔽位 `hidePos = (x,z) + 背离威胁的法线 × standoffM`，不是直接站在 (x,z) 上。
//
// **(nx, nz) 当作一条无符号的"墙面轴"，不是"指向某一侧"的有向法线。** 取证：
//   · `Script_WallPlan` 有一个 `coverSign` 参数专门用来翻转正负（`:86` / `:281`），
//     翻不翻由每条墙的预设决定；
//   · `Script_Landmark_Division122.mjs:209` 与 `Script_Landmark_NorthSuburb.mjs:388`
//     故意传 `(-sin, -cos)`，与 `Script_World.mjs:204` 的 `(sin, cos)` 正好相反；
//   · 生产方之间没有"法线指向站人侧还是威胁侧"的统一约定，谁也没验过。
// 于是本模块：
//   · 打分只用 `|dot(n, 掩体→威胁)|` —— 「这堵墙的面**垂不垂直于**威胁方向」，正负无关；
//   · 保护侧每次按威胁现算：`nEff = n × sign`，`sign` 取使 nEff **背离威胁**的那个；
//   · 没有法线的点（`hasNormal === false`，`nx = nz = 0`）按无朝向处理：不吃对齐分，
//     保护侧退化成"正背着威胁"。
// 这个选择让模块对生产方的正负错误免疫；代价是**不能**表达"这堵墙只有一面能藏人"
// （单面女儿墙、只有一侧有平台的城垛）。真需要时另加字段，别去猜现有法线的正负。
//
// **height 是离地掩体高，不是绝对高程**（`Script_WallPlan.mjs:280` 的注释是唯一写明的地方）。
// 所以掩体顶 = `host.GroundHeight(x,z) + height`。
//
// **字段名三套并存**：`{h, fx, fz}`（WallPlan 的中间产物）、`{height, faceX, faceZ}`
// （`Script_World.Cover` 推进 `battlefield.covers` 的正式形状）、`{height, nx, nz}`
// （测试假件，如 `Script_WestStationTest.mjs:16`）。`NormalizeCover` 三套全吃。
//
// ---------------------------------------------------------------------------
// 返回值复用（热路径零分配）
// ---------------------------------------------------------------------------
// `Query` 与 `Validate` 返回的是**内部复用的**数组与对象：下一次调用会原地覆盖上一次的
// 结果（`Query` 返回的候选元素本身也是复用的槽）。调用方要跨帧留着，自己拷字段出来。
// `Nearby` / `PeekPose` / `NormalizeCover` 例外 —— 它们每次新建对象，
// 因为只有大脑选点与调试覆盖层偶尔调，不在热路径上。
//
// 热路径（`Query`）不新建任何对象与数组：候选槽、邻域缓冲、临时点、射线端点全部池化，
// 排序是定长引用数组的插入排序。实测（3000 个掩体点、22 m 半径、16 候选、3 个验证）
// 每次 Query ≈ 6 μs、约 0.7 KB —— 剩下的这点是 V8 给未内联函数的 double 返回值装的
// HeapNumber，不是本模块建的对象；而 Query 本身受大脑侧 `COVER_CYCLE.reselectMinS` 限流，
// 不是每帧每人都跑。
// ===========================================================================

import { COVER } from "./Data_Tuning_AiCover.mjs";

const W = COVER.weights;

/** host 没给 StanceEye 时的兜底，与 `AiDirector.StanceEye` 同一组数（0 站 / 1 蹲 / 2 卧）。 */
export const FALLBACK_EYE = Object.freeze([1.5, 1.0, 0.5]);

/** 候选池的绝对上限：挡住 opts 里传进来的荒唐值，别让一次查询把内存吃了。 */
const CANDIDATE_CEILING = 64;

function Finite(v, fallback = 0) { return Number.isFinite(v) ? v : fallback; }

/**
 * 长度。**故意不用 `Math.hypot`**：它的签名是 `hypot(...values)`，V8 每次调用都要
 * 给剩余参数建一个数组 —— 实测 500 万次 hypot 触发 210 次 GC，同样次数的
 * `sqrt(a*a+b*b)` 只有 5 次。掩体打分一次 Query 就是上百次距离计算，同屏一百多人时
 * 这一项本身就够攒出一轮 minor GC（§7 的 `allocKbPerFrame` 不许升）。
 * 代价是极大/极小值会溢出 —— 战场尺度（几千米）用不到那个量程。
 */
function Len2(dx, dz) { return Math.sqrt(dx * dx + dz * dz); }
function Len3(dx, dy, dz) { return Math.sqrt(dx * dx + dy * dy + dz * dz); }

/** 取一个"点"的坐标：既认 `{x,y,z}`，也认 Script_Ai 的兵 `{position:{x,y,z}}`。 */
function PosX(o) { return Finite(o && (o.position ? o.position.x : o.x), 0); }
function PosY(o) { return Finite(o && (o.position ? o.position.y : o.y), 0); }
function PosZ(o) { return Finite(o && (o.position ? o.position.z : o.z), 0); }

/** threats 允许传数组（一般 1 个）或单个对象；取第一个有效的当主威胁。 */
function PrimaryThreat(threats) {
  if (!threats) return null;
  if (!Array.isArray(threats)) return threats;
  for (let i = 0; i < threats.length; i += 1) if (threats[i]) return threats[i];
  return null;
}

/**
 * 坐标哈希 id。量化到 `COVER.hashQuantM` 再混，于是：
 *   · 同一个掩体在破坏重建后 id 不变（占用表按 id 保留）；
 *   · BuildAll 重跑的浮点噪音（最后一两位）不会换 id。
 * 用 Math.imul 而不是 `*`：后者超过 2^53 会丢精度，不同平台/引擎结果可能不一致。
 */
export function CoverId(x, z) {
  const q = COVER.hashQuantM;
  const qx = Math.round(x / q);
  const qz = Math.round(z / q);
  return (Math.imul(qx, 73856093) ^ Math.imul(qz, 19349663)) >>> 0;
}

/**
 * 把生产方的原始掩体点归一成本模块的形状。三套字段名全吃，法线归一化。
 *
 * @param  {object} raw `{x, z, h|height, fx|faceX|nx, fz|faceZ|nz}`
 * @return {{id:number, x:number, z:number, height:number,
 *           nx:number, nz:number, hasNormal:boolean, tall:boolean}|null}
 *         法线缺失/退化时 `nx = nz = 0` 且 `hasNormal = false`（打分按无朝向处理）。
 *         坐标不是有限数就返回 null（调用方跳过）。
 */
export function NormalizeCover(raw) {
  if (!raw) return null;
  const x = raw.x, z = raw.z;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const rawH = raw.height !== undefined && raw.height !== null ? raw.height : raw.h;
  const height = Math.max(0, Finite(rawH, 0));
  let nx = Finite(raw.nx !== undefined && raw.nx !== null ? raw.nx
    : (raw.faceX !== undefined && raw.faceX !== null ? raw.faceX : raw.fx), 0);
  let nz = Finite(raw.nz !== undefined && raw.nz !== null ? raw.nz
    : (raw.faceZ !== undefined && raw.faceZ !== null ? raw.faceZ : raw.fz), 0);
  const len = Len2(nx, nz);
  let hasNormal = false;
  if (len > 1e-6) { nx /= len; nz /= len; hasNormal = true; } else { nx = 0; nz = 0; }
  return { id: CoverId(x, z), x, z, height, nx, nz, hasNormal, tall: height >= COVER.tallM };
}

/** 每个掩体槽的可变状态：验证缓存 + 保护侧记忆。与 `registry.covers` 同下标。 */
function MakeSlot() {
  return {
    validTime: -1, validThreatX: 0, validThreatZ: 0,
    blockedStanding: false, blockedCrouched: false,
    /** 上一次算出来的保护侧符号（+1/-1/0）。`IsFlanked` 不给 ref 时靠它记住"当初躲的是哪一面"。 */
    faceSign: 1,
  };
}

function ResetSlot(slot) {
  slot.validTime = -1; slot.validThreatX = 0; slot.validThreatZ = 0;
  slot.blockedStanding = false; slot.blockedCrouched = false;
  slot.faceSign = 1;
}

/** 候选槽（池化，`Query` 的返回元素就是它）。 */
function MakeCandidate() {
  return {
    cover: null,
    /** 完整分（含验证增减）。`Query` 按它降序。 */
    score: 0,
    /** 验证之前的分。测试与调试覆盖层读它。 */
    base: 0,
    distance: 0,
    validated: false, blockedStanding: false, blockedCrouched: false,
    side: "over",
    hidePos: { x: 0, z: 0 },
    firePos: { x: 0, z: 0 },
    fireStance: 1, hideStance: 1,
    faceSign: 1,
  };
}

/** 定长引用数组的插入排序（k ≤ maxCandidates，零分配）。 */
function SortByScore(arr, k) {
  for (let i = 1; i < k; i += 1) {
    const item = arr[i];
    const key = item.score;
    let j = i - 1;
    while (j >= 0 && arr[j].score < key) { arr[j + 1] = arr[j]; j -= 1; }
    arr[j + 1] = item;
  }
}

// ===========================================================================

export class CoverRegistry {
  /**
   * @param {Array} rawCovers `battlefield.covers`（或任何同形状的数组）
   * @param {object} host     docs/Data_EnemyAi.md §3 的宿主回调；缺哪个用哪个的兜底
   */
  constructor(rawCovers, host = null) {
    this.host = host || {};

    this.covers = [];            // 归一后的掩体
    this.slots = [];             // 与 covers 同下标的可变状态（池化，重建时复用）
    this.index = new Map();      // id → 下标
    this.grid = new Map();       // 散列格键 → 下标数组
    this.buckets = [];           // 格数组的池子（重建时复用，不重新分配）

    this.claims = new Map();     // coverId → soldierId
    this.bySoldier = new Map();  // soldierId → Set<coverId>

    this.nearBuf = [];           // Nearby 的复用缓冲
    this.results = [];           // Query 的复用缓冲
    this.cand = [];              // 候选槽池
    this.poseScratch = MakeCandidate();
    this.validOut = { blockedStanding: false, blockedCrouched: false, cached: false };
    this.validOpts = { hidePos: null, suppression: 0 };
    this.rayFrom = { x: 0, y: 0, z: 0 };
    this.rayDir = { x: 0, y: 0, z: 0 };
    this.steerOut = { x: 0, z: 0 };

    /** 累计射线数（性能取证 / 测试断言 maxValidate 生效）。 */
    this.rays = 0;
    /** 重建次数（覆盖层显示"掩体表换过几轮"）。 */
    this.revision = 0;

    this.Rebuild(rawCovers);
  }

  // ------------------------------------------------------------- 表的生命周期

  /**
   * 重建整张表。破坏系统炸墙之后 `Script_Destruction` 会 filter `battlefield.covers`
   * （Script_Destruction.mjs:936），把新数组交回这里。
   *
   * 占用表按 **id** 保留：掩体还在，占它的人就还占着；掩体没了才释放。
   * 保护侧记忆（faceSign）也按 id 保留 —— 墙塌了一段，人躲的还是原来那一面。
   * 验证缓存**全部作废**：世界几何变了，上一轮"挡得住"不作数。
   */
  Rebuild(rawCovers) {
    const keepFace = this.covers.length ? new Map() : null;
    if (keepFace) {
      for (let i = 0; i < this.covers.length; i += 1) keepFace.set(this.covers[i].id, this.slots[i].faceSign);
    }

    this.covers.length = 0;
    this.index.clear();
    for (const bucket of this.grid.values()) { bucket.length = 0; this.buckets.push(bucket); }
    this.grid.clear();

    const list = rawCovers || [];
    for (let i = 0; i < list.length; i += 1) {
      const c = NormalizeCover(list[i]);
      if (!c) continue;
      if (c.height < COVER.minUsefulM) continue;
      // id 撞车（不同坐标哈希到同一个数，约 40 亿分之一）时线性探测。
      // 同一份列表重跑结果一致；被 filter 掉一部分之后，撞车的那一对里
      // 活下来的那个可能拿到原本属于对方的 id —— 罕见到不值得为它加一层映射。
      while (this.index.has(c.id)) c.id = (c.id + 1) >>> 0;
      this.index.set(c.id, this.covers.length);
      this.covers.push(c);
    }

    while (this.slots.length < this.covers.length) this.slots.push(MakeSlot());
    for (let i = 0; i < this.covers.length; i += 1) {
      const slot = this.slots[i];
      ResetSlot(slot);
      if (keepFace) {
        const face = keepFace.get(this.covers[i].id);
        if (face !== undefined) slot.faceSign = face;
      }
      const key = this._Key(this._Cell(this.covers[i].x), this._Cell(this.covers[i].z));
      let bucket = this.grid.get(key);
      if (!bucket) { bucket = this.buckets.pop() || []; this.grid.set(key, bucket); }
      bucket.push(i);
    }

    // 掩体没了的占用要放掉，否则那个 id 永远"有人"
    for (const coverId of Array.from(this.claims.keys())) {
      if (this.index.has(coverId)) continue;
      const soldierId = this.claims.get(coverId);
      this.claims.delete(coverId);
      const set = this.bySoldier.get(soldierId);
      if (set) { set.delete(coverId); if (!set.size) this.bySoldier.delete(soldierId); }
    }

    this.revision += 1;
    return this.covers.length;
  }

  Count() { return this.covers.length; }

  /** 取证口：覆盖层与性能探针读它。 */
  Stats() {
    return {
      covers: this.covers.length, cells: this.grid.size,
      claims: this.claims.size, rays: this.rays, revision: this.revision,
    };
  }

  // ------------------------------------------------------------- 空间散列

  _Cell(v) { return Math.floor(v / COVER.cellM); }

  /** 两维格坐标压成一个整数键。城的尺度下 |gz| < 1e5，200003 这个乘子保证单射。 */
  _Key(gx, gz) { return gx * 200003 + gz; }

  /**
   * 热路径用的邻域扫描：把结果按下标写进 `this.nearBuf`，返回个数。**零分配**。
   *
   * 为什么不是 `buf.length = 0` + `push`：那一对会让 V8 先右裁剪再逐级扩容，
   * 二十万次调用能攒出五十次 minor GC。下标写入 + 只增不减的容量一次都不分配
   * （尾部留着的是上次的引用，掩体对象本来就活着，不构成泄漏）。
   */
  _NearbyInto(x, z, radiusM) {
    const buf = this.nearBuf;
    let n = 0;
    const r = Math.max(0, Finite(radiusM, COVER.defaultRadiusM));
    const r2 = r * r;
    const gx0 = this._Cell(x - r), gx1 = this._Cell(x + r);
    const gz0 = this._Cell(z - r), gz1 = this._Cell(z + r);
    for (let gx = gx0; gx <= gx1; gx += 1) {
      for (let gz = gz0; gz <= gz1; gz += 1) {
        const bucket = this.grid.get(this._Key(gx, gz));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i += 1) {
          const c = this.covers[bucket[i]];
          const dx = c.x - x, dz = c.z - z;
          if (dx * dx + dz * dz <= r2) { buf[n] = c; n += 1; }
        }
      }
    }
    return n;
  }

  /**
   * 半径内的掩体，O(邻域)，不全表扫。**返回新数组**（调试覆盖层与大脑偶尔问一次，
   * 不在热路径上；热路径走 `_NearbyInto`）。
   */
  Nearby(x, z, radiusM = COVER.defaultRadiusM) {
    return this.nearBuf.slice(0, this._NearbyInto(x, z, radiusM));
  }

  // ------------------------------------------------------------- 占用

  /**
   * 占一个点。已被**别人**占则 false；自己再占一次是 true（幂等）。
   *
   * 注意：Claim 不会自动放掉这个人手上别的点 —— `Release(soldierId)` 才放
   * （一个兵理论上可以预约"当前掩体 + 下一跳掩体"）。大脑换掩体时的规矩是
   * **先 Release 再 Claim**，否则占用会泄漏。
   */
  Claim(coverId, soldierId) {
    if (coverId === undefined || coverId === null) return false;
    if (soldierId === undefined || soldierId === null) return false;
    if (!this.index.has(coverId)) return false;      // 陈旧 id 不许占住一个不存在的点
    const owner = this.claims.get(coverId);
    if (owner !== undefined && owner !== soldierId) return false;
    this.claims.set(coverId, soldierId);
    let set = this.bySoldier.get(soldierId);
    if (!set) { set = new Set(); this.bySoldier.set(soldierId, set); }
    set.add(coverId);
    return true;
  }

  /** 放掉这个人持有的**所有**点（阵亡、换掩体、换关都调它）。返回放掉几个。 */
  Release(soldierId) {
    const set = this.bySoldier.get(soldierId);
    if (!set) return 0;
    let n = 0;
    for (const coverId of set) {
      if (this.claims.get(coverId) === soldierId) { this.claims.delete(coverId); n += 1; }
    }
    set.clear();
    this.bySoldier.delete(soldierId);
    return n;
  }

  OccupantOf(coverId) {
    const owner = this.claims.get(coverId);
    return owner === undefined ? null : owner;
  }

  // ------------------------------------------------------------- host 兜底

  _Now() { const f = this.host.Time; return typeof f === "function" ? Finite(f(), 0) : 0; }

  _Eye(stance) {
    const f = this.host.StanceEye;
    const v = typeof f === "function" ? f(stance) : NaN;
    if (Number.isFinite(v)) return v;
    return FALLBACK_EYE[stance] !== undefined ? FALLBACK_EYE[stance] : FALLBACK_EYE[0];
  }

  _Ground(x, z) {
    const f = this.host.GroundHeight;
    const v = typeof f === "function" ? f(x, z) : NaN;
    return Number.isFinite(v) ? v : 0;
  }

  /** 没有导航时恒 true（`Walkable` 的契约就是这样）。 */
  _Walkable(x, z) {
    const f = this.host.Walkable;
    return typeof f === "function" ? f(x, z) !== false : true;
  }

  // ------------------------------------------------------------- 姿势

  /**
   * 算隐蔽位 / 射击位 / 两种姿态，写进 out（候选槽或 poseScratch）。
   * 顺带把保护侧符号记进注册表槽，`IsFlanked` 不给 ref 时要用。
   */
  _Pose(cover, threat, suppression, out) {
    // 掩体 → 威胁的水平方向
    let dx = 0, dz = 0;
    if (threat) { dx = PosX(threat) - cover.x; dz = PosZ(threat) - cover.z; }
    let len = Len2(dx, dz);
    if (len < 1e-6) { dx = 0; dz = -1; len = 1; }   // 没威胁 / 威胁踩在掩体上：给一条能用的朝向
    dx /= len; dz /= len;

    // 保护侧：法线是无符号轴（见头注），每次按威胁现算，取背离威胁的那一面
    let ex, ez, sign;
    if (cover.hasNormal) {
      sign = (cover.nx * dx + cover.nz * dz) > 0 ? -1 : 1;
      ex = cover.nx * sign; ez = cover.nz * sign;
    } else {
      sign = 0;
      ex = -dx; ez = -dz;                            // 无朝向：正背着威胁
    }
    out.faceSign = sign;
    const slotIndex = this.index.get(cover.id);
    if (slotIndex !== undefined && sign !== 0) this.slots[slotIndex].faceSign = sign;

    const hx = cover.x + ex * COVER.standoffM;
    const hz = cover.z + ez * COVER.standoffM;
    out.hidePos.x = hx; out.hidePos.z = hz;

    // 站在隐蔽位面朝威胁时的右手方向。yaw=0 面朝 -Z 的朝向契约下，
    // forward=(-sinθ,-cosθ) 对应 right=(cosθ,-sinθ)，代进去就是 right = (-fz, fx)。
    const rx = -dz, rz = dx;

    if (cover.tall) {
      // 高掩体：贴墙站着藏，探头 = 沿墙面切线横移到"威胁看得见"的那一侧。
      const tx = -ez, tz = ex;                       // 切线（保护侧法线转 90°）
      const lat = threat ? (PosX(threat) - cover.x) * tx + (PosZ(threat) - cover.z) * tz : 0;
      // 威胁正对掩体（横向偏移≈0）时按 id 奇偶定侧：确定性，且反复查询不会左右横跳。
      const s = lat > 1e-3 ? 1 : (lat < -1e-3 ? -1 : ((cover.id & 1) ? 1 : -1));
      const sx = tx * s, sz = tz * s;
      out.firePos.x = hx + sx * COVER.sideStepM;
      out.firePos.z = hz + sz * COVER.sideStepM;
      out.side = (sx * rx + sz * rz) > 0 ? "right" : "left";
      out.fireStance = 0;                            // 侧步出去是站着打
      out.hideStance = suppression >= COVER.suppressionProneAt ? 1 : 0;
    } else {
      // 矮掩体：蹲藏、原地起身跪射（"over" = 从掩体上方探头）。
      out.firePos.x = hx; out.firePos.z = hz;
      out.side = "over";
      out.fireStance = 1;
      out.hideStance = suppression >= COVER.suppressionProneAt ? 2 : 1;
    }
    return out;
  }

  /**
   * 探头姿势。**每次新建对象**（一次选点只调一次，不在热路径上）。
   *
   * @param {object} cover  归一后的掩体（也吃原始形状，内部归一）
   * @param {object} threat `{x,y,z,stance,id}`
   * @param {object} [opts] `{ suppression:0..1 }` —— 压制大时隐蔽姿态再降一档
   * @return {{side:"left"|"right"|"over", hidePos:{x,z}, firePos:{x,z},
   *           fireStance:0|1|2, hideStance:0|1|2}}
   */
  PeekPose(cover, threat, opts = null) {
    const c = cover && cover.id !== undefined ? cover : NormalizeCover(cover);
    if (!c) return null;
    const p = this._Pose(c, threat, Finite(opts && opts.suppression, 0), this.poseScratch);
    return {
      side: p.side,
      hidePos: { x: p.hidePos.x, z: p.hidePos.z },
      firePos: { x: p.firePos.x, z: p.firePos.z },
      fireStance: p.fireStance,
      hideStance: p.hideStance,
    };
  }

  // ------------------------------------------------------------- 射线验证

  /** 一条射线。挡住 = 命中点比终点近 hitSlackM 以上。host 没给 Raycast 就当没挡。 */
  _Blocked(ax, ay, az, bx, by, bz) {
    const cast = this.host.Raycast;
    if (typeof cast !== "function") return false;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const dist = Len3(dx, dy, dz);
    if (dist < 1e-4) return false;
    const from = this.rayFrom, dir = this.rayDir;
    from.x = ax; from.y = ay; from.z = az;
    dir.x = dx / dist; dir.y = dy / dist; dir.z = dz / dist;
    this.rays += 1;
    const hit = cast(from, dir, dist);
    return !!hit && Number.isFinite(hit.t) && hit.t < dist - COVER.hitSlackM;
  }

  /**
   * 「这个点挡得住那个威胁吗」。威胁眼位 → 隐蔽位的**站眼高 / 蹲眼高**各一条射线，
   * 结果按 `validCacheS` + `validCacheMoveM` 缓存在掩体槽上。
   *
   * **返回内部复用对象**（多带一个 `cached` 说明这次有没有真打射线）。
   *
   * @param {object} [opts] `{ suppression, hidePos:{x,z} }`；给了 hidePos 就不重算姿势。
   */
  Validate(cover, threat, opts = null) {
    const out = this.validOut;
    out.blockedStanding = false; out.blockedCrouched = false; out.cached = false;
    if (!cover || !threat) return out;
    const c = cover.id !== undefined ? cover : NormalizeCover(cover);
    if (!c) return out;

    const slotIndex = this.index.get(c.id);
    const slot = slotIndex === undefined ? null : this.slots[slotIndex];
    const now = this._Now();
    const tx = PosX(threat), tz = PosZ(threat);
    if (slot && slot.validTime >= 0
      && now - slot.validTime < COVER.validCacheS
      && Len2(tx - slot.validThreatX, tz - slot.validThreatZ) < COVER.validCacheMoveM) {
      out.blockedStanding = slot.blockedStanding;
      out.blockedCrouched = slot.blockedCrouched;
      out.cached = true;
      return out;
    }

    let hx, hz;
    if (opts && opts.hidePos) { hx = opts.hidePos.x; hz = opts.hidePos.z; } else {
      const p = this._Pose(c, threat, Finite(opts && opts.suppression, 0), this.poseScratch);
      hx = p.hidePos.x; hz = p.hidePos.z;
    }
    const ground = this._Ground(hx, hz);
    const eyeThreat = PosY(threat) + this._Eye(Finite(threat.stance, 0) | 0);
    out.blockedStanding = this._Blocked(tx, eyeThreat, tz, hx, ground + this._Eye(0), hz);
    out.blockedCrouched = this._Blocked(tx, eyeThreat, tz, hx, ground + this._Eye(1), hz);

    if (slot) {
      slot.validTime = now;
      slot.validThreatX = tx; slot.validThreatZ = tz;
      slot.blockedStanding = out.blockedStanding;
      slot.blockedCrouched = out.blockedCrouched;
    }
    return out;
  }

  // ------------------------------------------------------------- 侧翼

  /**
   * 被抄侧翼了吗：威胁方向偏离「掩体正对的方向」超过 `flankAngleRad`
   * （含"绕到背面"那一半 —— 背面的夹角必然 > 90° > 75°）。
   *
   * 保护侧按这个顺序定：
   *   ① 调用方给的 `ref`（一般是这个兵**当前站位**）—— 最可信；
   *   ② 上一次 `Query`/`PeekPose` 在这个掩体上记下的 faceSign（"当初躲的是哪一面"）；
   *   ③ 生产方法线的原符号。
   * 三条都用不上（无朝向掩体且没给 ref）时返回 false —— 判不了就不谎报被抄。
   *
   * @param {object} [ref] `{x,z}` 或 `{position:{x,y,z}}`，兵当前所在
   */
  IsFlanked(cover, threat, ref = null) {
    if (!cover || !threat) return false;
    let dx = PosX(threat) - cover.x, dz = PosZ(threat) - cover.z;
    const len = Len2(dx, dz);
    if (len < 1e-6) return true;                     // 威胁踩在掩体上，谈不上还挡着
    dx /= len; dz /= len;

    let ex = 0, ez = 0;
    if (ref) {
      const rx = PosX(ref) - cover.x, rz = PosZ(ref) - cover.z;
      const rl = Len2(rx, rz);
      if (rl > 1e-6) {
        if (cover.hasNormal) {
          // 有法线：用法线定"面"，只借 ref 定正负 —— 沿墙走两步不该改变墙的朝向
          const sign = (cover.nx * (rx / rl) + cover.nz * (rz / rl)) >= 0 ? 1 : -1;
          ex = cover.nx * sign; ez = cover.nz * sign;
        } else {
          ex = rx / rl; ez = rz / rl;
        }
      }
    }
    if (ex === 0 && ez === 0 && cover.hasNormal) {
      const slotIndex = this.index.get(cover.id);
      const sign = slotIndex === undefined ? 1 : (this.slots[slotIndex].faceSign || 1);
      ex = cover.nx * sign; ez = cover.nz * sign;
    }
    if (ex === 0 && ez === 0) return false;

    // 期望的威胁方向是"保护侧的反面"。夹角 = acos(dot(-e, d))。
    return -(ex * dx + ez * dz) < Math.cos(COVER.flankAngleRad);
  }

  // ------------------------------------------------------------- 打分

  /** 「掩体在我与威胁之间」硬条件：掩体离威胁更近，或至少落在朝威胁的前半球。 */
  _Between(cover, sx, sz, tx, tz) {
    const dCT = Len2(tx - cover.x, tz - cover.z);
    const dST = Len2(tx - sx, tz - sz);
    if (dCT < dST - COVER.betweenSlackM) return true;
    const ax = cover.x - sx, az = cover.z - sz;
    const bx = tx - sx, bz = tz - sz;
    const la = Len2(ax, az), lb = Len2(bx, bz);
    if (la < 1e-6 || lb < 1e-6) return true;         // 就站在掩体上 / 威胁贴脸：别把唯一的点筛掉
    return (ax * bx + az * bz) / (la * lb) > 0;
  }

  /** 便宜分：只用距离、高度、朝向对齐。用来在密集城区里先砍到 maxCandidates 个。 */
  _Cheap(cover, sx, sz, tx, tz, hasThreat) {
    let score = W.distanceM * Len2(cover.x - sx, cover.z - sz);
    score += W.heightM * Math.min(cover.height, COVER.heightCapM);
    if (cover.tall) score += W.tallBonus;
    if (!hasThreat) return score;
    if (!cover.hasNormal) return score + W.noNormal;
    const dx = tx - cover.x, dz = tz - cover.z;
    const l = Len2(dx, dz);
    if (l > 1e-6) score += W.alignment * Math.abs((cover.nx * dx + cover.nz * dz) / l);
    return score;
  }

  /**
   * 贵的那一半：隐蔽位可走性、直线估路、友军间距、占用、威胁仰角、推进方向。
   * 需要 slot.hidePos 已经由 `_Pose` 填好。
   */
  _Extras(slot, cover, soldierId, threat, opts, sx, sz) {
    let score = 0;
    const hx = slot.hidePos.x, hz = slot.hidePos.z;

    if (!this._Walkable(hx, hz)) score += W.notWalkable;

    // 直线估路。**默认不调 host.Steer**：Steer 会为每个目标建一张 dijkstra 场，
    // 十六个候选就是十六张场，导航的场缓存当场被冲垮。要用得显式 opts.useSteer，
    // 而且只在验证阶段（前 maxValidate 个）调。
    const samples = COVER.pathSamples;
    for (let i = 1; i <= samples; i += 1) {
      const t = i / (samples + 1);
      if (!this._Walkable(sx + (hx - sx) * t, sz + (hz - sz) * t)) score += W.pathBlockedSample;
    }

    const owner = this.claims.get(cover.id);
    if (owner !== undefined && owner !== soldierId) score += W.occupiedOther;

    const allies = opts && opts.allies;
    if (allies && allies.length) {
      const minSp = Math.max(1e-3, Finite(opts.minAllySpacingM, COVER.minAllySpacingM));
      for (let i = 0; i < allies.length; i += 1) {
        const a = allies[i];
        if (!a) continue;
        const aid = a.id !== undefined ? a.id : null;
        if (aid !== null && aid === soldierId) continue;
        const d = Len2(PosX(a) - hx, PosZ(a) - hz);
        if (d < minSp) score += W.allySpacing * (1 - d / minSp);
      }
    }

    if (threat) {
      // 威胁站得比掩体顶还高 —— 俯射，矮墙在他眼里等于不存在
      const top = this._Ground(cover.x, cover.z) + cover.height;
      const eye = PosY(threat) + this._Eye(Finite(threat.stance, 0) | 0);
      const over = eye - top - COVER.elevationSlackM;
      if (over > 0) score += W.elevationM * Math.min(over, 4);
    }

    if (opts && Number.isFinite(opts.towardX) && Number.isFinite(opts.towardZ)) {
      const dMe = Len2(opts.towardX - sx, opts.towardZ - sz);
      const dCv = Len2(opts.towardX - hx, opts.towardZ - hz);
      const gain = Math.max(-COVER.towardCapM, Math.min(COVER.towardCapM, dMe - dCv));
      score += W.toward * gain;
    }

    return score;
  }

  /** 验证结果换算成分数增减。 */
  _ValidationDelta(blockedStanding, blockedCrouched) {
    if (!blockedStanding && !blockedCrouched) return W.validatedFail;
    let d = 0;
    if (blockedCrouched) d += W.validatedCrouched;
    if (blockedStanding) d += W.validatedStanding;
    return d;
  }

  /**
   * 单点打分（**验证之前**的完整分）。`Query` 内部用的是同一套算式，
   * 单独导出是为了让打分单调性可测、让调试覆盖层能问"这个点为什么没被选"。
   */
  Score(soldier, cover, threat, opts = null) {
    const c = cover && cover.id !== undefined ? cover : NormalizeCover(cover);
    if (!c) return -Infinity;
    const sx = PosX(soldier), sz = PosZ(soldier);
    const t = PrimaryThreat(threat);
    const hasThreat = !!t;
    const tx = hasThreat ? PosX(t) : 0, tz = hasThreat ? PosZ(t) : 0;
    const soldierId = opts && opts.soldierId !== undefined ? opts.soldierId
      : (soldier && soldier.id !== undefined ? soldier.id : null);
    const slot = this.poseScratch;
    this._Pose(c, t, Finite(opts && opts.suppression, Finite(soldier && soldier.suppression, 0)), slot);
    return this._Cheap(c, sx, sz, tx, tz, hasThreat)
      + this._Extras(slot, c, soldierId, t, opts, sx, sz);
  }

  // ------------------------------------------------------------- 查询

  /**
   * 给一个兵找掩体。**返回内部复用数组**，元素也是复用的候选槽 —— 下次 Query 覆盖。
   *
   * @param {object} soldier `{x,z}` 或 `{position:{x,y,z}, id, suppression}`
   * @param {Array}  threats `[{x,y,z,stance,id}]`（一般 1 个：当前目标或 LKP）
   *                 多于一个时**只按第一个**算姿势与验证，其余暂不参与打分（已知取舍）。
   * @param {object} [opts] `{ radiusM, maxCandidates, maxValidate, towardX, towardZ,
   *                           minAllySpacingM, allies:[{x,z}], soldierId, suppression, useSteer, allowRetreat }`
   * @return {Array<{cover, score, base, distance, validated, blockedStanding, blockedCrouched,
   *                 side, hidePos:{x,z}, firePos:{x,z}, fireStance, hideStance}>} 按 score 降序
   */
  Query(soldier, threats, opts = null) {
    const out = this.results;
    if (!this.covers.length) { out.length = 0; return out; }

    const sx = PosX(soldier), sz = PosZ(soldier);
    const threat = PrimaryThreat(threats);
    const hasThreat = !!threat;
    const tx = hasThreat ? PosX(threat) : 0, tz = hasThreat ? PosZ(threat) : 0;
    const suppression = Finite(opts && opts.suppression, Finite(soldier && soldier.suppression, 0));
    const soldierId = opts && opts.soldierId !== undefined ? opts.soldierId
      : (soldier && soldier.id !== undefined ? soldier.id : null);

    const radius = Math.max(0, Finite(opts && opts.radiusM, COVER.defaultRadiusM));
    const maxCand = Math.max(1, Math.min(CANDIDATE_CEILING,
      Math.floor(Finite(opts && opts.maxCandidates, COVER.maxCandidates))));
    while (this.cand.length < maxCand) this.cand.push(MakeCandidate());

    // ① 便宜分筛前 maxCand 个（定长表 + 插入，零分配）
    const nearCount = this._NearbyInto(sx, sz, radius);
    const list = this.nearBuf;
    let k = 0;
    for (let i = 0; i < nearCount; i += 1) {
      const c = list[i];
      if (hasThreat && !opts?.allowRetreat && !this._Between(c, sx, sz, tx, tz)) continue;
      const base = this._Cheap(c, sx, sz, tx, tz, hasThreat);
      let pos;
      if (k < maxCand) { pos = k; k += 1; }
      else if (base > this.cand[maxCand - 1].base) { pos = maxCand - 1; }
      else continue;
      const slot = this.cand[pos];
      let j = pos;
      while (j > 0 && this.cand[j - 1].base < base) { this.cand[j] = this.cand[j - 1]; j -= 1; }
      this.cand[j] = slot;
      slot.cover = c;
      slot.base = base;
      slot.score = base;
      slot.distance = Len2(c.x - sx, c.z - sz);
      slot.validated = false;
      slot.blockedStanding = false; slot.blockedCrouched = false;
    }
    if (!k) { out.length = 0; return out; }

    // ② 留下来的做完整打分 + 姿势
    for (let i = 0; i < k; i += 1) {
      const slot = this.cand[i];
      this._Pose(slot.cover, threat, suppression, slot);
      slot.score = slot.base + this._Extras(slot, slot.cover, soldierId, threat, opts, sx, sz);
      slot.base = slot.score;                        // base 之后表示"验证之前的完整分"
    }
    SortByScore(this.cand, k);

    // ③ 只对前 maxValidate 个打射线（每个 ≤ 2 条，带缓存）
    const maxValidate = Math.max(0, Math.min(k,
      Math.floor(Finite(opts && opts.maxValidate, COVER.maxValidate))));
    // host 没给 Raycast（纯规则装配、编辑器预览）时整段跳过：两条线都"没挡住"是假消息，
    // 会把所有候选一起扣分，还让 validated 说了谎。
    if (hasThreat && typeof this.host.Raycast === "function") {
      const steer = opts && opts.useSteer ? this.host.Steer : null;
      const vopts = this.validOpts;
      vopts.suppression = suppression;
      for (let i = 0; i < maxValidate; i += 1) {
        const slot = this.cand[i];
        vopts.hidePos = slot.hidePos;                // 姿势已经算过，别再算一遍
        const v = this.Validate(slot.cover, threat, vopts);
        slot.validated = true;
        slot.blockedStanding = v.blockedStanding;
        slot.blockedCrouched = v.blockedCrouched;
        slot.score = slot.base + this._ValidationDelta(v.blockedStanding, v.blockedCrouched);
        if (typeof steer === "function"
          && !steer(sx, sz, slot.hidePos.x, slot.hidePos.z, this.steerOut)) {
          slot.score += W.notWalkable;               // 导航说走不到：跟"隐蔽位是墙"同罪
        }
      }
      SortByScore(this.cand, k);
    }

    // 下标写入 + 末尾定长，不走 length=0 + push（那一对每次都要重新扩容，见 _NearbyInto 的注释）
    for (let i = 0; i < k; i += 1) out[i] = this.cand[i];
    out.length = k;
    return out;
  }
}

export default CoverRegistry;
