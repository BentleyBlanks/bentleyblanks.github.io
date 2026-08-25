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
// 改这四个数之前先想清楚：加载半径只影响画面，不影响碰撞与 AI。
//
// 【预算】每帧最多 spawn/despawn 各 budget 件（默认 8）：一口气进城不掉帧，
// 排队几帧内清空。spawn 按「离焦点最近优先」，先看见眼前的。

const HYSTERESIS = 24;

export function LoadRadiusFor(maxDim) {
  if (maxDim < 0.9) return 85;
  if (maxDim < 2.5) return 130;
  if (maxDim < 6) return 200;
  return 330;
}

export class PropStreamer {
  constructor(root) {
    this.root = root;         // 克隆挂在这个组下（ExternalProps 的 liveRoot）
    this.entries = [];
    this.live = 0;
    this.spawned = 0;         // 累计，测试用
  }

  /** make: () => Object3D（已摆好位置/朝向/缩放的克隆）。 */
  Register({ x, z, maxDim, make, label = "" }) {
    const rIn = LoadRadiusFor(maxDim);
    const rOut = rIn + HYSTERESIS;
    this.entries.push({
      x, z, make, label,
      r2in: rIn * rIn, r2out: rOut * rOut,
      object: null,
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
      if (entry.object) {
        if (d2 > entry.r2out && despawned < budget) {
          // 克隆的几何/材质都与常驻的资产外壳共享，摘下来就完事，不 dispose。
          this.root.remove(entry.object);
          entry.object = null;
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
        entry.object = entry.make();
        if (entry.object) {
          this.root.add(entry.object);
          this.live += 1;
          this.spawned += 1;
        } else {
          // make 失败（资产缺节点等）：登记成永不再试的空位
          entry.r2in = -1;
        }
      }
    }
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

  Stats() {
    return { registered: this.entries.length, live: this.live, spawned: this.spawned };
  }

  Dispose() {
    for (const entry of this.entries) {
      if (entry.object) this.root.remove(entry.object);
      entry.object = null;
    }
    this.entries.length = 0;
    this.live = 0;
  }
}
