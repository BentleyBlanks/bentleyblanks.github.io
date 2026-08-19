// 滕县战场适配层：把 Script_TengxianCity 的「城」包成规则层认得的「战场」。
//
// 为什么要多这一层，而不是直接改 TengxianCity：
// TengxianCity 是**建筑**模块 —— 它知道城墙多高、瓮城多大、哪家墙上有枪眼，
// 但它不知道什么叫「玩家」「视线」「淹没深度」。而 Script_Ai / Script_Player /
// Script_Navigation / Script_Combat 四个模块都是照 Script_Battlefield 的那套查询写的
//（GroundHeight / StandHeight / NearbyColliders / Raycast / WaterDepth / bounds /
// colliders / covers / objectives）。两边各自都是对的，缺的只是一个翻译。
//
// 把翻译放在这里而不是塞进 TengxianCity，好处是**建城的人和跑仗的人可以分开改**：
// 城里加一座马面不必关心 AI 怎么找路，AI 换一套查询也不必去动砌墙的代码。
//
// Script_Battlefield.mjs（台儿庄那座城）随台儿庄一起删掉了 —— 它 import 的
// Data_Battle.OBJECTIVES / TOWN.canal 都已不存在，留着就是一颗随时会炸的哑弹。
// 里面唯一与城无关的东西是 RayAabb，已搬进 Script_Geo.mjs。

import * as THREE from "three";
import { TengxianCity } from "./Script_TengxianCity.mjs";
import { TengxianOutfield, HasOutfield } from "./Script_TengxianOutfield.mjs";
import { RayAabb } from "./Script_Geo.mjs";
import { CITY, MOAT, OUTSKIRTS } from "./Data_Tengxian.mjs";
import { WORLD } from "./Data_Battle.mjs";
import { Clamp } from "./Script_Noise.mjs";

/** 荆河河面标高（Script_TengxianCity.BuildOutskirts 里那张水面网格的 y）。 */
const RIVER_SURFACE_Y = -3.0;

/**
 * 到荆河中心线的水平距离。
 * 河形在 Script_TengxianCity 里是一条折线（城东南北向，z>turnZ 之后转西南），
 * 这里只要一个够用的近似：转折点以北当作直线，以南按 45° 斜线量垂距。
 * 差几米不影响「下水就慢、就不许开枪」这条软墙 —— 它管的是"人有没有踩进河里"。
 */
function DistanceToRiverApprox(x, z) {
  const r = OUTSKIRTS.river;
  if (z <= r.turnZ) return Math.abs(x - r.x);
  // 转向西南：方向 (-1, 1)/√2，过点 (r.x, r.turnZ)
  const dx = x - r.x;
  const dz = z - r.turnZ;
  return Math.abs(dx + dz) / Math.SQRT2;
}

export class TengxianField {
  /**
   * @param {THREE.Scene} scene
   * @param {object} library MaterialLibrary
   * @param {object} options
   *   quality / seed        同 TengxianCity
   *   bounds                本关的可玩切片（Data_Battle.PHASES[i].bounds）
   *   foci                  LOD 焦点（一般给本关的目标链坐标）
   *   zones                 本关的目标链（Data_Battle.ZONES 里挑出来的那几条）
   *   detailRadius/midRadius 同 TengxianCity
   *   levelId               关卡 id（Data_Battle.PHASES[*].id）。**城外内容按它开关** ——
   *                         见 Script_TengxianOutfield.OUTFIELD_SCENES 的白名单
   */
  constructor(scene, library, {
    quality = "high", seed = 19380317, bounds = null, foci = [[0, 0]],
    zones = [], detailRadius = 100, midRadius = 210, levelId = null,
  } = {}) {
    this.scene = scene;
    // 一·北沙河整关都站在濠外 1.45 km 的远圈上，那张地表默认只有 5 圈
    //（径向 200 m 一格）。给它加密到 24 圈；城内六关不传这个参数，
    // 走默认 5 = **原行为，一个像素都不变**。
    //
    // 序·界河也曾经走这条路，但 24 圈仍然是 42 m 一格 —— 刻不出 38 m 的河槽。
    // 那一关现在是独立场景（Script_JieheField），不再经过这里。
    this.city = new TengxianCity(scene, library, {
      quality, seed, foci, detailRadius, midRadius, bounds,
      farGroundRings: HasOutfield(levelId) ? 24 : 5,
    });
    /**
     * 城外的鲁南平原。
     *
     * Script_TengxianCity 只管城 —— 濠外它铺了一张地皮、撒了四十来棵树与几块麦地，
     * 而且那几样是围着城心撒的（半径 360—1140 m）。序关在城北 1.5 km、
     * 一关在城西 1.45 km，**出了那个圈世界就只剩地皮**（实测 L0 场上 3 个碰撞盒）。
     * 这一份补的就是那片地：河道河堤、土坎、散兵胸墙、坟头、光秃乔木、
     * 麦田田埂、村落轮廓、津浦路路基。只对白名单里的关生效。
     */
    this.outfield = new TengxianOutfield(scene, library, {
      levelId, bounds, quality, seed: seed ^ 0x4A49,
      groundAt: (x, z) => this.city.GroundHeight(x, z),
    });
    // 规则层要的那几张表，建完城之后从 city 上接过来（BuildSteps 末尾）
    this.colliders = [];
    this.covers = [];
    this.meshes = [];
    this.grid = new Map();
    this.gridSize = this.city.gridSize;
    this.bounds = bounds
      ? { minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.minZ, maxZ: bounds.maxZ }
      : { minX: -700, maxX: 700, minZ: -700, maxZ: 700 };
    // 这张图铺到哪儿（撒兵兜底范围按它走 —— 每张图一份，见 Data_Battle.WORLD 的注释）
    this.worldLimits = WORLD;
    /**
     * 目标链。**线性关卡里它不是 ER2 的占领点**：没有占领条、不会被反夺，
     * owner 恒为 nra，只是给 HUD 标记、小地图与剧本的 zone: 触发用的一串路标。
     * 保留 owner/progress/contested 三个字段是为了不改 Script_Hud 的契约。
     */
    this.objectives = zones.map((z, i) => ({
      ...z, index: i, owner: "nra", progress: 1, contested: false, reached: false,
    }));
    this.wallTopY = this.city.wallTopY;
  }

  /** 分帧生成。用法与 Battlefield 一致。 */
  *BuildSteps() {
    // 城先建（城外要用 city.GroundHeight 定标高，而那是解析式的、建不建都能问，
    // 所以顺序上其实自由；先城后野只是为了进度条读起来是「由内向外」）
    for (const step of this.city.BuildSteps()) yield step;
    if (this.outfield.active) {
      for (const step of this.outfield.BuildSteps()) {
        // 城占 0—0.9，城外挤在末尾那一段
        yield { label: step.label, progress: 0.9 + 0.1 * step.progress };
      }
    }
    this.colliders = this.city.colliders.concat(this.outfield.colliders);
    this.covers = this.city.covers.concat(this.outfield.covers);
    this.meshes = this.city.meshes.concat(this.outfield.meshes);
    this.gridSize = this.city.gridSize;
    // **格子必须重建**：city.BuildCollisionGrid 只刷了城自己那张表，
    // 直接沿用 city.grid 的话，城外那几千个盒子对射线、对 AI、对玩家全是隐形的
    // —— 画面上有土坎，子弹照穿。
    this.grid = this.outfield.active ? this.BuildCollisionGrid() : this.city.grid;
  }

  /** 把 colliders 刷进空间散列（与 TengxianCity.BuildCollisionGrid 同一套判据）。 */
  BuildCollisionGrid() {
    const grid = new Map();
    const g = this.gridSize;
    for (const box of this.colliders) {
      const x0 = Math.floor(box.min[0] / g), x1 = Math.floor(box.max[0] / g);
      const z0 = Math.floor(box.min[2] / g), z1 = Math.floor(box.max[2] / g);
      for (let x = x0; x <= x1; x += 1) {
        for (let z = z0; z <= z1; z += 1) {
          const key = x * 100003 + z;
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key).push(box);
        }
      }
    }
    return grid;
  }

  // -------------------------------------------------------------------------
  // 规则层要的查询
  // -------------------------------------------------------------------------

  GroundHeight(x, z) { return this.city.GroundHeight(x, z); }

  /**
   * 脚下能踩住的最高一层（AI 侧不做物理，只能给一个"站立面"查询）。
   * 只认顶面不高过脚 + 0.6 m 的盒子 —— 上城道那一级一级的台阶正好被认出来，
   * 而人不会凭空站到屋顶上。照抄 Script_Battlefield 的判据，两边必须一致，
   * 否则 AI 与玩家会对"这儿能不能站"给出两个答案。
   */
  StandHeight(x, z, fromY) {
    let h = this.GroundHeight(x, z);
    const list = this.BoxesNear(x, z);
    if (!list.length) return h;
    const ceiling = fromY + 0.6;
    for (const b of list) {
      if (x < b.min[0] || x > b.max[0] || z < b.min[2] || z > b.max[2]) continue;
      const top = b.max[1];
      if (top > ceiling || top <= h) continue;
      h = top;
    }
    return h;
  }

  /**
   * 淹没深度（米）。0 = 干的。
   * 两处水：护城河（水面 −1.6）与城东的荆河（水面 −3.0）。
   * 桥面上恒为 0 —— 桥是过河的路，走桥不算下水（碰撞盒 tag 是 bridge）。
   */
  WaterDepth(x, z, y) {
    const m = Math.max(Math.abs(x), Math.abs(z));
    if (m > MOAT.innerEdge - 2 && m < MOAT.outerEdge + 2) {
      for (const b of this.BoxesNear(x, z)) {
        if (b.tag !== "bridge") continue;
        if (x >= b.min[0] && x <= b.max[0] && z >= b.min[2] && z <= b.max[2]) return 0;
      }
      return Math.max(0, MOAT.waterY - y);
    }
    if (DistanceToRiverApprox(x, z) < OUTSKIRTS.river.width / 2) {
      return Math.max(0, RIVER_SURFACE_Y - y);
    }
    return 0;
  }

  /** 本层格子里这一格的盒子（含城外那一份 —— city.BoxesNear 只认城自己的）。 */
  BoxesNear(x, z) {
    const g = this.gridSize;
    return this.grid.get(Math.floor(x / g) * 100003 + Math.floor(z / g)) || [];
  }

  NearbyColliders(x, z, radius = 3) {
    const g = this.gridSize;
    const out = [];
    const x0 = Math.floor((x - radius) / g), x1 = Math.floor((x + radius) / g);
    const z0 = Math.floor((z - radius) / g), z1 = Math.floor((z + radius) / g);
    for (let gx = x0; gx <= x1; gx += 1) {
      for (let gz = z0; gz <= z1; gz += 1) {
        const list = this.grid.get(gx * 100003 + gz);
        if (list) for (const b of list) if (!out.includes(b)) out.push(b);
      }
    }
    return out;
  }

  /** 射线 vs 静态几何（AABB slab）。沿射线走格子，只查经过的那几格。 */
  Raycast(origin, direction, maxDist = 200) {
    const g = this.gridSize;
    let best = null;
    const steps = Math.ceil(maxDist / g) + 1;
    const seen = new Set();
    for (let i = 0; i <= steps; i += 1) {
      const t = (i / steps) * maxDist;
      const px = origin.x + direction.x * t, pz = origin.z + direction.z * t;
      const gx = Math.floor(px / g), gz = Math.floor(pz / g);
      for (let ox = -1; ox <= 1; ox += 1) {
        for (let oz = -1; oz <= 1; oz += 1) {
          const key = (gx + ox) * 100003 + (gz + oz);
          if (seen.has(key)) continue;
          seen.add(key);
          const list = this.grid.get(key);
          if (!list) continue;
          for (const box of list) {
            const hit = RayAabb(origin, direction, box, maxDist);
            if (hit !== null && (best === null || hit.t < best.t)) best = hit;
          }
        }
      }
      if (best && best.t < t) break;
    }
    return best;
  }

  /** 城的自检结果透传（BootTest / PlayTest 要读）。 */
  CheckSightCorridor() { return this.city.CheckSightCorridor(); }
  CheckWallCorridor() { return this.city.CheckWallCorridor(); }

  /** 把某个点夹进本关切片里（撒兵、出生点都要用）。 */
  ClampToBounds(x, z, margin = 8) {
    return {
      x: Clamp(x, this.bounds.minX + margin, this.bounds.maxX - margin),
      z: Clamp(z, this.bounds.minZ + margin, this.bounds.maxZ - margin),
    };
  }

  /**
   * 拆城。换关要重建整片切片，不拆的话七关跑下来会攒七座城的几何 ——
   * 显存与 draw call 都会线性爬上去（第 3 关就撞红线）。
   * 材质归 MaterialLibrary 管（全局共用一份），这里只拆几何。
   */
  Dispose() {
    for (const m of this.meshes) {
      this.scene.remove(m);
      if (m.geometry) m.geometry.dispose();
    }
    this.meshes.length = 0;
    this.city.meshes.length = 0;
    this.outfield.meshes.length = 0;
    this.colliders = [];
    this.covers = [];
    this.grid.clear();
    this.objectives.length = 0;
  }
}

/** 整片切片的包围盒（相机远近平面与自检用）。 */
export function FieldBox(field) {
  const box = new THREE.Box3();
  for (const m of field.meshes) {
    m.updateMatrixWorld(true);
    box.expandByObject(m);
  }
  return box;
}

export default TengxianField;
