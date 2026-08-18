// 《血战台儿庄》导航网格：一张"哪儿站得住"的位图 + 按目标算的下坡场。
//
// 为什么非有不可（这一条是实跑逼出来的，不是工程洁癖）：
// 这座城是一进一进的四合院，鲁南民居对外不开窗、四面围墙，4674 个 wall 碰撞盒。
// AI 原来的走法是"直奔目标 + 撞墙沿轴滑 + 卡住随机拐个弯"。取证：
//   · 停摆时刻 163 对 40 m 内的敌我通视 **0 对**，挡住的六十条射线里
//     32 条撞 rampart、28 条撞 wall；
//   · 日军兵力重心在 t=200…320 s 之间**一个像素都不动**，37 人里 12—15 人
//     常年 stuck、15—21 人常年"绕行中"；
//   · 把随机拐弯改成认死方向的沿墙走反而更糟：直奔方向与拐 99° 的方向同时被挡时
//     就是死锁，位置一帧都不动。
// 也就是说"打一分半就停摆"的物理原因是**没有寻路**，而不是通视或守点纪律。
// 一个院子的门洞只有 3.2 m 宽，靠局部避障是撞不进去的。
//
// 做法是最便宜的那一种，不上 A*：
//   1. 把静态碰撞盒栅格化成一张 1 m 一格的"走不走得过去"位图（一次性，建关时做）；
//   2. 泛洪出连通分量，把打不进去的院子从目标里剔掉（见 _BuildComponents）；
//   3. 对每个目标做一次八邻域 BFS，得到一张距离场；
//   4. 每个兵每帧只做一次"看八个邻格谁的距离小"的下坡，代价是常数级。
// 距离场按目标缓存（目标先量化到 8 m，好让一个班的横向偏移落进同一张场里）。
// 实测（500×460 m / 1 m 格 / 23 万格）：建图 47 ms、每张场 BFS 5.3 ms、
// 一张场 460 KB（Int16），缓存 12 张。格子取 1 m 不是保守：2 m 一格时
// 新关帝庙的门洞会被栅格化封死（连通率 0.1%），1 m 才通。
//
// 没有 Math.random、没有外部资源、没有 three 依赖 —— 这个文件是纯算术。

const NEIGHBOURS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

export class NavGrid {
  /**
   * @param {object} battlefield 需要 bounds / colliders / GroundHeight
   * @param {object} options cell 格边长（米）；margin 与 AI 的 Blocked() 保持一致；
   *   stepOver 能跨过去的高度（同 Blocked 的 0.56）
   */
  constructor(battlefield, { cell = 1.0, margin = 0.15, stepOver = 0.56,
    fieldCache = 32, quantiseM = 16, budgetPerFrame = 2 } = {}) {
    const b = battlefield.bounds;
    this.cell = cell;
    this.minX = b.minX;
    this.minZ = b.minZ;
    this.width = Math.max(1, Math.ceil((b.maxX - b.minX) / cell));
    this.height = Math.max(1, Math.ceil((b.maxZ - b.minZ) / cell));
    this.blocked = new Uint8Array(this.width * this.height);
    this.fieldCache = new Map();
    this.fieldLimit = fieldCache;
    this.fieldHits = 0;
    this.fieldMisses = 0;         // 缓存抖动会让每帧都重算 BFS，必须能量得到
    this.fieldStarved = 0;        // 这一帧的 BFS 预算用完、只好退回直奔目标的次数
    this.quantiseM = quantiseM;
    this.budgetPerFrame = budgetPerFrame;
    this.budget = budgetPerFrame;
    this.queue = new Int32Array(this.width * this.height);

    // 栅格化。不逐格去查碰撞盒（那要几万次空间散列），而是反过来把每个盒子刷进格子里。
    // 「挡不挡路」的判据照抄 AiDirector.Blocked：盒顶比地面高出 0.56 m 以上才算墙，
    // 矮的东西（沙袋边、门槛、瓦砾）能跨过去，不许把街面刷成死路。
    for (const box of battlefield.colliders) {
      const cx = (box.min[0] + box.max[0]) * 0.5;
      const cz = (box.min[2] + box.max[2]) * 0.5;
      const ground = battlefield.GroundHeight(cx, cz);
      if (box.max[1] - ground < stepOver) continue;          // 矮，跨得过去
      if (box.min[1] > ground + 1.6) continue;               // 悬在头顶（屋檐、二层）
      const x0 = this._Cx(box.min[0] - margin);
      const x1 = this._Cx(box.max[0] + margin);
      const z0 = this._Cz(box.min[2] - margin);
      const z1 = this._Cz(box.max[2] + margin);
      for (let gz = z0; gz <= z1; gz += 1) {
        if (gz < 0 || gz >= this.height) continue;
        const row = gz * this.width;
        for (let gx = x0; gx <= x1; gx += 1) {
          if (gx < 0 || gx >= this.width) continue;
          this.blocked[row + gx] = 1;
        }
      }
    }
    this.openCells = 0;
    for (let i = 0; i < this.blocked.length; i += 1) if (!this.blocked[i]) this.openCells += 1;
    this._BuildComponents();
  }

  /**
   * 连通分量。**这一步比想象中重要得多。**
   *
   * 实跑取证：八个占领点里有三个（清真寺、火车站、新关帝庙）的圆心落在**封闭建筑**
   * 里面 —— 从那儿泛洪出来只能淹到 30—70 个格子，占全城可走面积的 0.1%。
   * 清真寺还是全场最重要的那个点（一八六团指挥所，中日拉锯了七天七夜）。
   * 直接拿圆心做 BFS 起点的后果是：全城的距离场恒为 -1，每个兵都拿不到导航信息，
   * 于是退回"直奔目标"，也就是直奔一堵院墙 —— 停摆原样复现。
   *
   * 所以目标点必须**吸附到主连通分量上**：打不进去的院子就打到它门口为止。
   * 这在玩法上也是对的 —— 围着清真寺打，本来就是这场仗的样子。
   */
  _BuildComponents() {
    const n = this.blocked.length;
    this.component = new Int32Array(n).fill(-1);
    const queue = this.queue;
    let next = 0, bestId = -1, bestSize = 0;
    for (let start = 0; start < n; start += 1) {
      if (this.blocked[start] || this.component[start] >= 0) continue;
      const id = next++;
      let head = 0, tail = 0, size = 0;
      this.component[start] = id;
      queue[tail++] = start;
      while (head < tail) {
        const cur = queue[head++];
        size += 1;
        const cx = cur % this.width, cz = (cur - cx) / this.width;
        for (const [ox, oz] of NEIGHBOURS) {
          const nx = cx + ox, nz = cz + oz;
          if (nx < 0 || nz < 0 || nx >= this.width || nz >= this.height) continue;
          const ni = nz * this.width + nx;
          if (this.blocked[ni] || this.component[ni] >= 0) continue;
          if (ox && oz && (this.blocked[cz * this.width + nx] || this.blocked[nz * this.width + cx])) continue;
          this.component[ni] = id;
          queue[tail++] = ni;
        }
      }
      if (size > bestSize) { bestSize = size; bestId = id; }
    }
    this.mainComponent = bestId;
    this.mainSize = bestSize;
    this.componentCount = next;
  }

  /** 每帧开头调一次，重置这一帧的 BFS 预算。AiDirector.Update 负责调。 */
  BeginFrame() { this.budget = this.budgetPerFrame; }

  _Cx(x) { return Math.floor((x - this.minX) / this.cell); }
  _Cz(z) { return Math.floor((z - this.minZ) / this.cell); }
  _CellCenterX(gx) { return this.minX + (gx + 0.5) * this.cell; }
  _CellCenterZ(gz) { return this.minZ + (gz + 0.5) * this.cell; }

  /** 这个坐标站得住吗（在图内且不是墙）。 */
  Walkable(x, z) {
    const gx = this._Cx(x), gz = this._Cz(z);
    if (gx < 0 || gz < 0 || gx >= this.width || gz >= this.height) return false;
    return !this.blocked[gz * this.width + gx];
  }

  /**
   * 这个坐标在**主连通分量**里吗 —— 也就是"从城里其它地方走得到吗"。
   *
   * 撒兵必须过这一关。实跑取证：八个占领点里清真寺、火车站、新关帝庙三个的圆心
   * 落在封闭建筑里，而 FindOpenSpot 认为院子中央"站得下"（一米内确实没有碰撞盒），
   * 于是守这三个点的兵被撒进一个谁也走不进去的口袋：日军走到院墙外十九米处
   * 就再也近不了一步，双方隔着墙站到天亮。这一条不加，导航网格只解决了一半。
   */
  InMain(x, z) {
    const gx = this._Cx(x), gz = this._Cz(z);
    if (gx < 0 || gz < 0 || gx >= this.width || gz >= this.height) return false;
    return this.component[gz * this.width + gx] === this.mainComponent;
  }

  /** 把一个坐标吸到最近的、走得到的地方。 */
  SnapToMain(x, z, out) {
    const i = this._NearestMain(this._Cx(x), this._Cz(z));
    if (i < 0) { out.x = x; out.z = z; return false; }
    const gx = i % this.width, gz = (i - gx) / this.width;
    out.x = this._CellCenterX(gx);
    out.z = this._CellCenterZ(gz);
    return true;
  }

  /**
   * 离 (gx,gz) 最近的、**在主连通分量里**的格子。
   * 占领点圆心常常就落在房子上（甚至落在一座打不进去的院子里），
   * 那时候就把目标吸附到最近的能走到的地方 —— 打到它门口为止。
   */
  _NearestMain(gx, gz, maxRing = 90) {
    const here = (gx >= 0 && gz >= 0 && gx < this.width && gz < this.height)
      ? gz * this.width + gx : -1;
    if (here >= 0 && this.component[here] === this.mainComponent) return here;
    for (let r = 1; r <= maxRing; r += 1) {
      for (let dz = -r; dz <= r; dz += 1) {
        const az = Math.abs(dz) === r;
        for (let dx = -r; dx <= r; dx += 1) {
          if (!az && Math.abs(dx) !== r) continue;   // 只走这一圈的边
          const x = gx + dx, z = gz + dz;
          if (x < 0 || z < 0 || x >= this.width || z >= this.height) continue;
          const i = z * this.width + x;
          if (this.component[i] === this.mainComponent) return i;
        }
      }
    }
    return -1;
  }

  /**
   * 到某个目标的距离场（八邻域 BFS，格数即距离）。
   * 目标先量化到 8 m —— 一个班里每个人的 laneOffset 都不一样，不量化的话
   * 七十个人会要七十张场，缓存直接失效。
   */
  FieldFor(tx, tz) {
    const q = Math.max(1, Math.round(this.quantiseM / this.cell));
    const gx = Math.round(this._Cx(tx) / q) * q;
    const gz = Math.round(this._Cz(tz) / q) * q;
    const key = gz * 100003 + gx;
    const hit = this.fieldCache.get(key);
    if (hit) {
      this.fieldHits += 1;
      this.fieldCache.delete(key);                      // LRU：重新插到队尾
      this.fieldCache.set(key, hit);
      return hit;
    }
    this.fieldMisses += 1;
    // 每帧最多算这么多张新场。没有这道闸的后果是实测出来的：目标量化到 8 m 时
    // 七十个人会要出二十多个不同的键，缓存一抖就变成"每帧重算 BFS"——
    // 命中/未命中 54556/20487（27%），单帧 60.6 ms，通关冒烟慢到跑不完。
    // 预算用完的这一帧退回直奔目标，下一帧再补 —— 走位差一帧没人看得出来。
    if (this.budget <= 0) { this.fieldStarved += 1; return null; }
    this.budget -= 1;
    const start = this._NearestMain(gx, gz);
    if (start < 0) return null;
    // Int16 够用：最长的一条路也就七百来格，而 Int32 会让每张场的内存翻一倍
    const dist = new Int16Array(this.width * this.height).fill(-1);
    const queue = this.queue;
    let head = 0, tail = 0;
    dist[start] = 0;
    queue[tail++] = start;
    while (head < tail) {
      const cur = queue[head++];
      const cx = cur % this.width, cz = (cur - cx) / this.width;
      const nd = dist[cur] + 1;
      for (const [ox, oz] of NEIGHBOURS) {
        const nx = cx + ox, nz = cz + oz;
        if (nx < 0 || nz < 0 || nx >= this.width || nz >= this.height) continue;
        const ni = nz * this.width + nx;
        if (this.blocked[ni] || dist[ni] >= 0) continue;
        // 斜着走不许穿墙角
        if (ox && oz && (this.blocked[cz * this.width + nx] || this.blocked[nz * this.width + cx])) continue;
        dist[ni] = nd;
        queue[tail++] = ni;
      }
    }
    const field = { dist, key };
    this.fieldCache.set(key, field);
    if (this.fieldCache.size > this.fieldLimit) {
      this.fieldCache.delete(this.fieldCache.keys().next().value);
    }
    return field;
  }

  /**
   * 下坡一步。把 out 填成一个归一化的水平方向。
   * @returns {boolean} 有没有可用的导航信息；false 时调用方自己直奔目标。
   */
  Steer(x, z, tx, tz, out) {
    const field = this.FieldFor(tx, tz);
    if (!field) return false;
    const gx = this._Cx(x), gz = this._Cz(z);
    if (gx < 0 || gz < 0 || gx >= this.width || gz >= this.height) return false;
    const here = gz * this.width + gx;
    const dist = field.dist;
    // 自己站在墙里（刚被撒进来、或者贴着墙面）：先往任何一个有距离值的邻格挪
    let best = -1, bestValue = dist[here] >= 0 ? dist[here] : Infinity;
    for (const [ox, oz] of NEIGHBOURS) {
      const nx = gx + ox, nz = gz + oz;
      if (nx < 0 || nz < 0 || nx >= this.width || nz >= this.height) continue;
      const ni = nz * this.width + nx;
      if (this.blocked[ni]) continue;
      const value = dist[ni];
      if (value < 0) continue;
      if (value < bestValue) { bestValue = value; best = ni; }
    }
    if (best < 0) return false;
    const bx = best % this.width, bz = (best - bx) / this.width;
    let dx = this._CellCenterX(bx) - x;
    let dz = this._CellCenterZ(bz) - z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return false;
    out.x = dx / len;
    out.z = dz / len;
    return true;
  }

  Stats() {
    return {
      cell: this.cell, width: this.width, height: this.height,
      cells: this.blocked.length, open: this.openCells,
      fields: this.fieldCache.size,
      components: this.componentCount, mainSize: this.mainSize,
      hits: this.fieldHits, misses: this.fieldMisses, starved: this.fieldStarved,
    };
  }
}
