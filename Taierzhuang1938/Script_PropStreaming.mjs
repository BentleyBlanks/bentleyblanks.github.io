// 外部道具的视觉流送（streaming）。
//
// 【为什么有这一层，2026-08-25】城内外的「每家每户」布设从两百件涨到上千件，
// 不能再在建关时一次全克隆 —— draw call 与克隆开销都会线性堆上去。
// 但**只有画面走流送，碰撞不走**：全部碰撞盒仍在建关时一次登记
// （AddExternalProps 照旧把整张 colliders 表交给调用方并进 field.colliders）。
// 理由是确定性：AI 找掩体、破坏系统、子弹命中都读碰撞表，如果碰撞随玩家位置
// 加卸载，同一场仗会因为玩家站在哪儿而打出两样 —— 那是最难认的一类不一致。
// 视觉上「远处小件看不见」本来就成立：85 m 外的一只木桶是亚像素，
// 雾在两三百米外把一切吃干净（fog.max 0.94）。
//
// 【加载半径的规矩】按**件的最大边长 × 摆位缩放**分四档（米）：
//     < 0.9 m   → 85    （桶/罐/篮/凳：亚像素之前就够）
//     < 2.5 m   → 130   （手推车/条案/米袋垛）
//     < 6 m     → 200   （枯树/砖堆/排屋碎件）
//     ≥ 6 m     → 330   （建筑级：房/院，基本等于「常驻」——雾外才卸）
// 卸载半径 = 加载半径 + 24 m 的迟滞带，人在半径线上来回走不会闪烁。
// 个别由调用方量过画质/性能的资产可显式给 loadRadius；当前只有细枝高模树使用，
// 它在 140 m 外已被战争雾吃成亚像素，不能按 7 m 包围盒误算成建筑常驻件。
// 改这四个数之前先想清楚：加载半径只影响画面，不影响碰撞与 AI。
//
// 【预算】每帧最多 spawn/despawn 各 budget 件（默认 8）：一口气进城不掉帧，
// 排队几帧内清空。spawn 按「离焦点最近优先」，先看见眼前的。
//
// 【实例化，2026-08-26】距离扫描/迟滞/预算这套骨架不变，变的是 spawn/despawn
// 的执行体：有实例化形态（entry.parts）的件不再克隆 Object3D，而是把
// {bucket, matrix} 加进/移出 PropBatcher 的桶并标脏，每帧末 Flush 一次性
// 重写脏桶的实例表（见 Script_PropBatch 文件头）。没有实例化形态的件
// （如仍用 GLB 自带多套 UV 材质的排屋）照旧走 make() 克隆。
// SetInstancing(false) 是测试钩子：把 live 的实例化件当场换回克隆，
// 同一帧内做逐像素开关对比（跨进程重跑对不齐，同 Script_ActorBatchTest）。

const HYSTERESIS = 24;

export function LoadRadiusFor(maxDim) {
  if (maxDim < 0.9) return 85;
  if (maxDim < 2.5) return 130;
  if (maxDim < 6) return 200;
  return 330;
}

export class PropStreamer {
  /**
   * @param root    克隆/批次网格挂在这个组下（ExternalProps 的 liveRoot）
   * @param batcher 可选的 PropBatcher；不给就全部走 make() 克隆（老路）
   */
  constructor(root, batcher = null) {
    this.root = root;
    this.batcher = batcher;
    this.entries = [];
    this.live = 0;
    this.spawned = 0;         // 累计，测试用
    this.instancing = true;   // 测试钩子 SetInstancing 用；正片永远 true
  }

  /**
   * make:  () => Object3D（已摆好位置/朝向/缩放的克隆；实例化件的回退与
   *        开关对比也用它）。
   * parts: [{ bucket, matrix }]，实例化形态；给了它 spawn 就不走 make。
   * probe: 测试探针（Script_PhysicsTest 用）：{ name, x, y, z, minY }，
   *        minY 是按合并几何包围盒 × 摆位矩阵算的世界底面。
   * loadRadius: 可选的资产级实测半径；不给则仍按 maxDim 四档计算。
   */
  Register({ x, z, maxDim, make, label = "", parts = null, probe = null,
    loadRadius = null }) {
    const rIn = Number.isFinite(loadRadius) && loadRadius > 0
      ? loadRadius : LoadRadiusFor(maxDim);
    const rOut = rIn + HYSTERESIS;
    this.entries.push({
      x, z, make, label, parts, probe,
      r2in: rIn * rIn, r2out: rOut * rOut,
      object: null,      // 克隆路径的 live 标志兼句柄
      batched: false,    // 实例化路径的 live 标志
    });
  }

  /**
   * 以 (x,z) 为焦点推进一帧。全量扫距离（几千件的平方距离是微秒级），
   * 但真正的 spawn/despawn 各不超过 budget 件。
   */
  Update(x, z, budget = 8) {
    let despawned = 0;
    const wanted = [];
    for (const entry of this.entries) {
      const dx = entry.x - x, dz = entry.z - z;
      const d2 = dx * dx + dz * dz;
      if (entry.object || entry.batched) {
        if (d2 > entry.r2out && despawned < budget) {
          this._Despawn(entry);
          this.live -= 1;
          despawned += 1;
        }
      } else if (d2 < entry.r2in) {
        wanted.push([d2, entry]);
      }
    }
    if (wanted.length) {
      wanted.sort((a, b) => a[0] - b[0]);
      const n = Math.min(budget, wanted.length);
      for (let i = 0; i < n; i += 1) {
        const entry = wanted[i][1];
        if (this._Spawn(entry)) {
          this.live += 1;
          this.spawned += 1;
        } else {
          // make 失败（资产缺节点等）：登记成永不再试的空位
          entry.r2in = -1;
        }
      }
    }
    // 每帧末把脏桶的实例表一次重写（没有脏桶时只是扫一遍标志位）。
    if (this.batcher) this.batcher.Flush();
    return { live: this.live, pending: Math.max(0, wanted.length - budget) };
  }

  /** 测试/出图用：在焦点处一口气收敛到稳态（把队列清空）。 */
  ForceSync(x, z) {
    let guard = 0;
    while (guard < 4096) {
      const { pending } = this.Update(x, z, 256);
      if (!pending) break;
      guard += 1;
    }
    return this.live;
  }

  /**
   * 测试钩子：同一帧内把 live 的实例化件换成克隆（off）或换回实例（on），
   * 供逐像素开关对比与 draw call 对比。克隆路径的件不受影响。
   */
  SetInstancing(on) {
    const next = !!on;
    if (this.instancing === next) return this;
    this.instancing = next;
    for (const entry of this.entries) {
      if (!entry.parts) continue;
      if (!(entry.object || entry.batched)) continue;
      this._Despawn(entry);
      if (!this._Spawn(entry)) {
        this.live -= 1;
        entry.r2in = -1;
      }
    }
    if (this.batcher) this.batcher.Flush();
    return this;
  }

  /**
   * 当前 live 件的取证口（Script_PhysicsTest 的落地/碰撞认领断言用）。
   * 克隆件直接交出 Object3D（按老口径量包围盒）；实例化件交出登记时算好的
   * probe（名字、摆位、按合并几何包围盒 × 矩阵得出的世界底面 minY）。
   */
  LiveProps() {
    const out = [];
    for (const entry of this.entries) {
      if (entry.object) out.push({ object: entry.object });
      else if (entry.batched && entry.probe) out.push({ ...entry.probe });
    }
    return out;
  }

  Stats() {
    let clones = 0, batched = 0, parts = 0;
    for (const entry of this.entries) {
      if (entry.object) clones += 1;
      else if (entry.batched) { batched += 1; parts += entry.parts.length; }
    }
    return {
      registered: this.entries.length, live: this.live, spawned: this.spawned,
      clones, batched, parts,
      batch: this.batcher ? this.batcher.Stats() : null,
    };
  }

  Dispose() {
    for (const entry of this.entries) this._Despawn(entry);
    this.entries.length = 0;
    this.live = 0;
    if (this.batcher) this.batcher.Dispose();
  }

  // -------------------------------------------------------------------------

  _Spawn(entry) {
    if (entry.parts && this.batcher && this.instancing) {
      for (const part of entry.parts) this.batcher.Spawn(part);
      entry.batched = true;
      return true;
    }
    entry.object = entry.make ? entry.make() : null;
    if (!entry.object) return false;
    this.root.add(entry.object);
    return true;
  }

  _Despawn(entry) {
    if (entry.object) {
      // 克隆的几何/材质都与常驻的资产外壳共享，摘下来就完事，不 dispose。
      this.root.remove(entry.object);
      entry.object = null;
    }
    if (entry.batched) {
      for (const part of entry.parts) this.batcher.Despawn(part);
      entry.batched = false;
    }
  }
}
