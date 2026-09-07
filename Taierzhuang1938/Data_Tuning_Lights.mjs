// 《台儿庄：血战滕县》局部光源（簇状前向光照）的数值与**纯几何规则层**。
//
// 契约 2：这个文件零 three 依赖。它同时是纯 Node 单测唯一能直接 import 的一层
// —— 仓库里的 three 是 `vendor/three/build/three.module.js`（`.js` 扩展名，
// 在没有 `"type": "module"` 的 package.json 下 Node 只会当 CJS 解析并当场报
// `Cannot use import statement outside a module`），所以任何 import 了 three 的
// 模块都进不了纯 Node 测试。**簇分配这套几何必须待在这一层**，否则
// 「与暴力法一致」那条断言只能上浏览器，慢一百倍还看不清是哪一步错。
//
// 分两块：
//   1. 档位与光源常量（纯数据）；
//   2. `ClusterGrid` —— 视锥切簇 + 球→簇分配（纯算术，零分配、可在 Node 里跑）。
//
// 参考实现：Olsson/Billeter/Assarsson《Clustered Deferred and Forward Shading》
// (HPG 2012) 的指数深度切片 + Emil Persson《Practical Clustered Shading》
// (SIGGRAPH 2013) 的「先按屏幕矩形收窄候选，再逐簇做精确球-AABB 判定」。
// UE 的 Forward+ 用的是同一套（`FLightGridInjection`，32×32 像素 tile ×
// 指数 Z 切片，逐簇 AABB 相交）。

// ---------------------------------------------------------------------------
// 1. 档位
// ---------------------------------------------------------------------------

/**
 * 光源类型编号。写进光源数据表的 t1.a，GLSL 侧按同一套数解释。
 * 不要重排：着色器里是 `> 0.5 / > 1.5` 的阈值比较。
 */
export const LIGHT_TYPE = { POINT: 0, SPOT: 1, TUBE: 2 };

/**
 * 逆平方衰减指数。全项目**只有这一个值**：`physicallyCorrectLights` 语义下
 * 点光的辐照度就是 1/d²，three 的 `getDistanceAttenuation(d, cutoff, decay)`
 * 里 decay 恒为 2。既然是常数就不占光源数据表的一个通道（那个位置留给类型）。
 */
export const LIGHT_DECAY = 2;

/**
 * 三方前向 PBR 里保留的物理点光槽位数（旧路径 / GI 注入 / 英雄光的上界）。
 *
 * 2026-09 之前这就是**全部**的动态光预算：逻辑火源可以有几十处，每帧按镜头
 * 贡献排序只有前 N 盏进 GPU。簇状光照落地后它退成两件事：
 *   · low 档仍走这条老路（簇表的每帧 CPU 开销对集显不划算）；
 *   · 其它档位它只剩「喂给探针体 GI 的那几盏」（`Script_Gi.MAX_FIRES` 与它对齐）
 *     和「英雄光那一盏」，不再决定画面上能亮几盏灯。
 */
export const EFFECT_LIGHT_COUNT = { low: 2, medium: 4, high: 6, ultra: 6 };

/**
 * 一档簇状光照 = 一张网格 + 一份光源预算。
 *
 * 字段：
 *   enabled     这一档走不走簇（false = 保持 2026-09 之前的固定灯池）
 *   maxLights   一帧最多送进 GPU 的局部光数（光源数据表的高度）
 *   tilesX/Y    屏幕切几格。16×9 是 16:9 屏上正方形 tile 的自然解
 *               （1440p 下一格 120×80 px，与 UE Forward+ 的 32 px tile 相比更粗，
 *               但我们的光比 UE 的场景少一个量级，粗 tile 换来的是每帧
 *               CPU 分配只有几千个簇要遍历）
 *   slices      指数深度切片数
 *   far         簇网格覆盖到多远（米）。再远的局部光对画面已经没有贡献
 *               （半径最大的火也就 30 m，逆平方到 150 m 只剩 0.4%）
 *   maxIndices  光索引表的容量（所有簇的引用数总和上限）
 *   spots       这一档给不给聚光（探照灯 / 车灯 / 门里透出的光）
 *   heroShadow  这一档**允许**留一盏投影的英雄光（是否真开由画质面板决定）
 *
 * 网格与预算的关系：簇数 = tilesX×tilesY×slices。high 是 3456 簇，
 * ultra 是 12288 簇。每帧 CPU 要做的事按「簇数 + 光覆盖的簇数」走，
 * 不按屏幕像素走 —— 这是簇状相对于 tile-based（forward+）延迟切片的核心好处。
 */
export const CLUSTER_TIERS = {
  // low 留在老路上：两盏三方点光。集显上每帧几千次球-AABB 判定 + 两张纹理上传
  // 换来的画面收益，抵不过它在 CPU 上的占用（low 档本来就卡在 CPU 提交）。
  low: {
    enabled: false, maxLights: 6, tilesX: 12, tilesY: 8, slices: 16,
    far: 90, maxIndices: 8192, spots: false, heroShadow: false,
  },
  medium: {
    enabled: true, maxLights: 32, tilesX: 16, tilesY: 9, slices: 24,
    far: 140, maxIndices: 32768, spots: true, heroShadow: false,
  },
  high: {
    enabled: true, maxLights: 64, tilesX: 16, tilesY: 9, slices: 24,
    far: 150, maxIndices: 65536, spots: true, heroShadow: true,
  },
  ultra: {
    enabled: true, maxLights: 128, tilesX: 24, tilesY: 16, slices: 32,
    far: 170, maxIndices: 196608, spots: true, heroShadow: true,
  },
};

/**
 * 簇网格的近平面（米）。**不用相机的 near（0.08 m）**：指数切片的
 * `log(d/near)` 在 near 太小时把一半的切片都花在「贴着鼻子的 10 cm」上，
 * 街道那一段反而只剩几片。0.5 m 之内没有任何几何会被局部光照亮到有意义。
 */
export const CLUSTER_NEAR = 0.5;

/** 一个簇最多记多少盏灯。簇表把 offset 与 count 打进一个 uint32（count 占低 8 位）。 */
export const CLUSTER_MAX_PER_CLUSTER = 255;

/**
 * 光索引表纹理的宽度。索引是一维的，但纹理是二维的，所以按 1024 折行
 * （`ivec2(i & 1023, i >> 10)`，GLSL 侧同一条式子）。
 * 1024 是 2 的幂，位运算取模；也远小于任何 WebGL2 实现的最大纹理宽度。
 */
export const CLUSTER_INDEX_TEX_WIDTH = 1024;

/** 拿一档簇配置的副本（调用方会往上写运行时状态）。 */
export function MakeClusterTier(quality) {
  const name = CLUSTER_TIERS[quality] ? quality : "high";
  return { ...CLUSTER_TIERS[name] };
}

// ---------------------------------------------------------------------------
// 2. 簇网格（纯几何）
// ---------------------------------------------------------------------------

/**
 * 视锥簇网格：屏幕 tilesX×tilesY 格 × 指数深度 slices 片。
 *
 * ## 坐标系
 * 全部在**视空间**里算，但深度用正数 `d = -viewZ`（three 的相机看向 −Z）。
 * 光源位置也在视空间 —— 这一条与 three 的 `pointLights[i].position` 一致
 * （`WebGLLights.setupView` 把灯的世界坐标乘了 `viewMatrix`），所以着色端
 * `lVector = lightPos - geometryPosition` 与三方逐字节同构。
 *
 * ## 为什么从投影矩阵取参数而不是从 fov/aspect
 * TAA 的子像素抖动走 `camera.setViewOffset`，它改的是投影矩阵的 m02/m12
 * （离轴），fov 与 aspect 一个字没变。拿 fov 算出来的网格与着色端
 * `gl_FragCoord → tile` 的映射就差半个像素；直接从矩阵取则**逐帧精确对齐**。
 *
 *   clip.x = p0·vx + p8·vz,  clip.w = -vz = d
 *   ndcX   = p0·vx/d - p8   =>   vx = (ndcX + p8)·d / p0
 * 于是 tile 边界 i 处的「视空间 x 与深度的比值」是常数
 *   kx[i] = (ndcX_i + p8) / p0
 * 深度 d 处这条边的视空间 x 就是 kx[i]·d。ky 同理（p5 / p9）。
 *
 * ## 指数深度切片
 * Olsson 2012 的原式：slice(d) = floor(log(d)·scale + bias)，
 * scale = slices / log(far/near)，bias = -slices·log(near) / log(far/near)。
 * 好处是每片在**屏幕空间**里近似立方（近处密、远处疏），簇的长宽高比不会
 * 在远处退化成一根针 —— 针形簇的 AABB 会把大量不相干的灯算进来。
 */
export class ClusterGrid {
  constructor({
    tilesX = 16, tilesY = 9, slices = 24,
    near = CLUSTER_NEAR, far = 150, maxIndices = 32768,
  } = {}) {
    this.tilesX = Math.max(1, tilesX | 0);
    this.tilesY = Math.max(1, tilesY | 0);
    this.slices = Math.max(1, slices | 0);
    this.near = Math.max(1e-3, near);
    this.far = Math.max(this.near * 2, far);
    this.clusterCount = this.tilesX * this.tilesY * this.slices;
    this.maxIndices = Math.max(this.clusterCount, maxIndices | 0);

    const logRatio = Math.log(this.far / this.near);
    this.sliceScale = this.slices / logRatio;
    this.sliceBias = -this.slices * Math.log(this.near) / logRatio;

    // tile 边界的 x/d、y/d 比值。SetProjection 每帧重算（TAA 抖动会动 p8/p9）。
    this.kx = new Float64Array(this.tilesX + 1);
    this.ky = new Float64Array(this.tilesY + 1);
    // 深度切片边界（slices + 1 个），一次算好不再变。
    this.sliceDepth = new Float64Array(this.slices + 1);
    for (let i = 0; i <= this.slices; i += 1) {
      this.sliceDepth[i] = this.near * Math.pow(this.far / this.near, i / this.slices);
    }
    this.SetProjection(1, 1, 0, 0);

    // 分配一次，之后每帧零 GC。链表法：一趟几何 + 一趟压实，
    // 不必为了「先数个数再填」把球-AABB 判定跑两遍。
    this.head = new Int32Array(this.clusterCount);
    this.nodeLight = new Uint16Array(this.maxIndices);
    this.nodeNext = new Int32Array(this.maxIndices);
    this.table = new Uint32Array(this.clusterCount);
    this.indices = new Uint16Array(this.maxIndices);
    this.stats = {
      lightCount: 0, indexCount: 0, occupied: 0, maxPerCluster: 0,
      meanPerOccupied: 0, meanPerCluster: 0, overflow: 0, buildMs: 0,
    };
    this._aabb = new Float64Array(6);
    // 分配游标：`_AssignSphere` 每帧从 0 数起，写满 maxIndices 就停。
    this._cursor = 0;
  }

  /**
   * 从投影矩阵取网格参数。传 `camera.projectionMatrix.elements` 的 [0]/[5]/[8]/[9]。
   * 每帧调（TAA 抖动、改 fov、改画面比例都会动它们）。
   */
  SetProjection(p0, p5, p8, p9) {
    const invP0 = 1 / (Math.abs(p0) > 1e-8 ? p0 : 1e-8);
    const invP5 = 1 / (Math.abs(p5) > 1e-8 ? p5 : 1e-8);
    for (let i = 0; i <= this.tilesX; i += 1) {
      this.kx[i] = ((i * 2) / this.tilesX - 1 + p8) * invP0;
    }
    for (let j = 0; j <= this.tilesY; j += 1) {
      this.ky[j] = ((j * 2) / this.tilesY - 1 + p9) * invP5;
    }
    this.p0 = p0; this.p5 = p5; this.p8 = p8; this.p9 = p9;
    return this;
  }

  /** 深度（米，正数）落在哪一片。与 GLSL 端同一条式子。 */
  SliceOfDepth(depth) {
    const d = depth > this.near ? depth : this.near;
    const slice = Math.floor(Math.log(d) * this.sliceScale + this.sliceBias);
    return slice < 0 ? 0 : (slice >= this.slices ? this.slices - 1 : slice);
  }

  ClusterIndex(tx, ty, slice) {
    return (slice * this.tilesY + ty) * this.tilesX + tx;
  }

  /**
   * 一个簇在视空间的轴对齐包围盒 `[xLo, xHi, yLo, yHi, dLo, dHi]`。
   * 这是**保守**的：真正的簇是一截四棱台，AABB 比它大。所有 3A 实现都用 AABB
   * （精确的棱台-球判定要六个平面，贵十倍，而多算进来的那几盏灯在着色端
   * 会被逆平方衰减自然压成 0）。
   */
  ClusterAabb(tx, ty, slice, out = this._aabb) {
    const d0 = this.sliceDepth[slice];
    const d1 = this.sliceDepth[slice + 1];
    const kxL = this.kx[tx], kxR = this.kx[tx + 1];
    const kyL = this.ky[ty], kyR = this.ky[ty + 1];
    out[0] = kxL < 0 ? kxL * d1 : kxL * d0;
    out[1] = kxR > 0 ? kxR * d1 : kxR * d0;
    out[2] = kyL < 0 ? kyL * d1 : kyL * d0;
    out[3] = kyR > 0 ? kyR * d1 : kyR * d0;
    out[4] = d0;
    out[5] = d1;
    return out;
  }

  /** 球（视空间中心 + 半径）与某一簇的 AABB 相不相交。暴力法与快路共用这条判定。 */
  SphereHitsCluster(tx, ty, slice, sx, sy, sd, radius) {
    const box = this.ClusterAabb(tx, ty, slice, this._aabb);
    let sum = 0;
    let v = sx < box[0] ? box[0] - sx : (sx > box[1] ? sx - box[1] : 0);
    sum += v * v;
    v = sy < box[2] ? box[2] - sy : (sy > box[3] ? sy - box[3] : 0);
    sum += v * v;
    v = sd < box[4] ? box[4] - sd : (sd > box[5] ? sd - box[5] : 0);
    sum += v * v;
    return sum <= radius * radius;
  }

  /**
   * 暴力法：扫全部簇。**只给测试用**（3456 簇 × N 灯，正片里不许调）。
   * @returns {number[]} 命中的簇下标，升序
   */
  ClustersOfSphereBrute(sx, sy, sd, radius) {
    const hits = [];
    for (let slice = 0; slice < this.slices; slice += 1) {
      for (let ty = 0; ty < this.tilesY; ty += 1) {
        for (let tx = 0; tx < this.tilesX; tx += 1) {
          if (this.SphereHitsCluster(tx, ty, slice, sx, sy, sd, radius)) {
            hits.push(this.ClusterIndex(tx, ty, slice));
          }
        }
      }
    }
    return hits;
  }

  /**
   * 一盏球形光的快路分配：逐深度片把球截成一个薄片，按薄片的屏幕矩形收窄
   * 候选 tile，再逐候选做精确的球-AABB 判定，命中就挂进那一簇的链表。
   *
   * **收窄是严格保守的**（证明：设 kx[tx] > tanXmax，则 kx[tx]·d0 > sx+rr 且
   * kx[tx]·d1 > sx+rr，而簇 AABB 的 xLo 是这两者中较小的一个，故 xLo > sx+rr，
   * 精确判定必然也不过）。所以它与暴力法结果**逐簇相等**，这是单测里那条断言
   * 的依据，不是「差不多」。
   *
   * 三层循环里能提的都提了：深度那一维的平方距离在整片里是常数、y 那一维在
   * 整行里是常数，内层只剩两次乘法与一次比较。**不走回调** —— 一帧几万次
   * 命中，闭包调用本身就是 0.1 ms 量级（实测 64 盏灯 0.51 → 0.28 ms）。
   *
   * @param {number} light 光在数据表里的下标
   * @param {number} sx 视空间 x
   * @param {number} sy 视空间 y
   * @param {number} sd 视空间深度（正数 = -viewZ）
   * @param {number} radius 影响半径（米）
   * @returns {boolean} 是否跑完（false = 索引表满了）
   */
  _AssignSphere(light, sx, sy, sd, radius) {
    if (!(radius > 0)) return true;
    const dLo = sd - radius > this.near ? sd - radius : this.near;
    const dHi = sd + radius < this.far ? sd + radius : this.far;
    if (dHi <= dLo) return true;
    const slices = this.slices, tilesX = this.tilesX, tilesY = this.tilesY;
    const kx = this.kx, ky = this.ky, sliceDepth = this.sliceDepth;
    const scale = this.sliceScale, bias = this.sliceBias;
    const p0 = this.p0, p5 = this.p5, p8 = this.p8, p9 = this.p9;
    const head = this.head, nodeLight = this.nodeLight, nodeNext = this.nodeNext;
    const limit = this.maxIndices;
    let cursor = this._cursor;
    const r2 = radius * radius;
    let sliceLo = Math.floor(Math.log(dLo) * scale + bias);
    let sliceHi = Math.floor(Math.log(dHi) * scale + bias);
    if (sliceLo < 0) sliceLo = 0;
    if (sliceHi >= slices) sliceHi = slices - 1;
    for (let slice = sliceLo; slice <= sliceHi; slice += 1) {
      const d0 = sliceDepth[slice];
      const d1 = sliceDepth[slice + 1];
      // 球心到这一片深度带的距离 -> 截面半径。**深度那一维的平方距离在整片里是
      // 常数**，先扣掉，内层只剩 x/y 两维要算。
      const dz = sd < d0 ? d0 - sd : (sd > d1 ? sd - d1 : 0);
      if (dz >= radius) continue;
      const budget = r2 - dz * dz;              // 留给 x/y 的平方距离预算
      const rr = Math.sqrt(budget);
      const xLo = sx - rr, xHi = sx + rr;
      const yLo = sy - rr, yHi = sy + rr;
      // tan 区间取两个深度端点的并集（分母大 -> 绝对值小，符号决定谁是端点）
      const txMinTan = xLo < 0 ? xLo / d0 : xLo / d1;
      const txMaxTan = xHi < 0 ? xHi / d1 : xHi / d0;
      const tyMinTan = yLo < 0 ? yLo / d0 : yLo / d1;
      const tyMaxTan = yHi < 0 ? yHi / d1 : yHi / d0;
      let txLo = Math.floor((txMinTan * p0 - p8 + 1) * 0.5 * tilesX);
      let txHi = Math.floor((txMaxTan * p0 - p8 + 1) * 0.5 * tilesX);
      let tyLo = Math.floor((tyMinTan * p5 - p9 + 1) * 0.5 * tilesY);
      let tyHi = Math.floor((tyMaxTan * p5 - p9 + 1) * 0.5 * tilesY);
      if (txLo < 0) txLo = 0;
      if (tyLo < 0) tyLo = 0;
      if (txHi >= tilesX) txHi = tilesX - 1;
      if (tyHi >= tilesY) tyHi = tilesY - 1;
      if (txHi < txLo || tyHi < tyLo) continue;
      const rowBase = slice * tilesY;
      for (let ty = tyLo; ty <= tyHi; ty += 1) {
        // y 那一维的平方距离在整行里是常数，提到这一层算。
        const kyL = ky[ty], kyR = ky[ty + 1];
        const boxYLo = kyL < 0 ? kyL * d1 : kyL * d0;
        const boxYHi = kyR > 0 ? kyR * d1 : kyR * d0;
        const dy = sy < boxYLo ? boxYLo - sy : (sy > boxYHi ? sy - boxYHi : 0);
        const rest = budget - dy * dy;
        if (rest < 0) continue;
        const base = (rowBase + ty) * tilesX;
        for (let tx = txLo; tx <= txHi; tx += 1) {
          const kxL = kx[tx], kxR = kx[tx + 1];
          const boxXLo = kxL < 0 ? kxL * d1 : kxL * d0;
          const boxXHi = kxR > 0 ? kxR * d1 : kxR * d0;
          const dx = sx < boxXLo ? boxXLo - sx : (sx > boxXHi ? sx - boxXHi : 0);
          if (dx * dx > rest) continue;
          if (cursor >= limit) { this._cursor = cursor; return false; }
          const cluster = base + tx;
          nodeLight[cursor] = light;
          nodeNext[cursor] = head[cluster];
          head[cluster] = cursor;
          cursor += 1;
        }
      }
    }
    this._cursor = cursor;
    return true;
  }

  /**
   * 建一帧的簇表。
   *
   * @param {Float32Array|Float64Array} spheres 步长 4：视空间 x, y, 深度 d(>0), 半径
   * @param {number} count 光源数
   * @returns {object} `this.stats`（同一个对象，不新建）
   */
  Build(spheres, count) {
    const t0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    const head = this.head;
    head.fill(-1);
    const nodeLight = this.nodeLight, nodeNext = this.nodeNext;
    this._cursor = 0;
    let overflow = 0;
    const lights = Math.min(count | 0, 65535);
    for (let i = 0; i < lights; i += 1) {
      const o = i * 4;
      if (!this._AssignSphere(i, spheres[o], spheres[o + 1], spheres[o + 2], spheres[o + 3])) {
        overflow = lights - i;
        break;
      }
    }

    // 压实：链表 -> 连续索引段。簇表打包成 (offset << 8 | count)。
    const table = this.table, indices = this.indices;
    let cursor = 0, occupied = 0, maxPerCluster = 0;
    for (let cluster = 0; cluster < this.clusterCount; cluster += 1) {
      let node = head[cluster];
      if (node < 0) { table[cluster] = 0; continue; }
      const offset = cursor;
      let n = 0;
      while (node >= 0 && n < CLUSTER_MAX_PER_CLUSTER) {
        indices[cursor] = nodeLight[node];
        cursor += 1; n += 1;
        node = nodeNext[node];
      }
      table[cluster] = (offset << 8) | n;
      occupied += 1;
      if (n > maxPerCluster) maxPerCluster = n;
    }

    const stats = this.stats;
    stats.lightCount = lights;
    stats.indexCount = cursor;
    stats.occupied = occupied;
    stats.maxPerCluster = maxPerCluster;
    stats.meanPerOccupied = occupied ? cursor / occupied : 0;
    stats.meanPerCluster = this.clusterCount ? cursor / this.clusterCount : 0;
    stats.overflow = overflow;
    const t1 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    stats.buildMs = t1 - t0;
    return stats;
  }

  /** 某个簇当前记了哪几盏灯（取证 / 单测用）。 */
  ClusterLights(clusterIndex) {
    const packed = this.table[clusterIndex];
    const offset = packed >>> 8;
    const count = packed & 255;
    const out = [];
    for (let i = 0; i < count; i += 1) out.push(this.indices[offset + i]);
    return out;
  }
}

/**
 * 球扇形（聚光真正的形状：顶点 + 半角 θ + **径向**距离 R）的最小包围球。
 *
 * 推导（球心在轴上 z=c）：过顶点与锥口圆时 c² = R²sin²θ + (Rcosθ − c)²
 * → c = R / (2cosθ)，半径也是 R / (2cosθ)。半角超过 45° 时这个球比锥口圆的
 * 外接球还大，改用锥口圆那一个：球心 R·cosθ、半径 R·sinθ（顶点到球心
 * R·cosθ ≤ R·sinθ，装得下）。
 *
 * 聚光按这个球进簇分配 —— 保守但便宜。锥外的簇里那些片元在着色端会被
 * `smoothstep(coneCos, penumbraCos, angleCos)` 判成 0，不会画错，只是多循环一次。
 *
 * @param {number} range 径向影响距离（米，= 衰减截断距离）
 * @param {number} cosHalfAngle cos(半锥角)
 * @returns {{along:number, radius:number}} 球心沿光轴的距离 + 球半径
 */
export function ConeBoundingSphere(range, cosHalfAngle) {
  const c = Math.max(1e-4, Math.min(1, cosHalfAngle));
  const sin = Math.sqrt(Math.max(0, 1 - c * c));
  if (c * c > 0.5) {
    const r = range / (2 * c);
    return { along: r, radius: r };
  }
  return { along: range * c, radius: range * sin };
}
