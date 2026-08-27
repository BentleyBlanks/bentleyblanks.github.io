// 玩法测试靶场 —— **一张独立的场景**，不是滕县城的切片，也不是界河。
//
// 它给 ?range=1 的人机共同测试沙盒（docs/Data_TestRange.md）当地皮：
// 一片平地 + 步枪道（四个距离靶与距离牌、砖砌挡弹墙）+ 投弹位（低沙袋墙）
// + 白刃位（工位台）。数字全在 Data_Range.mjs，这里只按数据摆。
//
// 与 Script_TengxianField / Script_JieheField 的关系：**同一套查询接口的第三个实现**
// （契约清单见 Script_JieheField 文件头）——
//   GroundHeight(x,z) / StandHeight(x,z,fromY) / NearbyColliders(x,z,r) /
//   Raycast(from,dir,maxDist) / WaterDepth(x,z,y) / bounds / colliders /
//   covers / objectives / BuildSteps() / Dispose()
// 规则层四个模块（Ai / Player / Navigation / Combat）谁都不知道底下是靶场。
//
// 地表是**解析平地 y=0**：GroundHeight 直接返回 0，网格照同一个数铺 ——
// 「看到的地」与「踩到的地」天然一致，这里不存在城那张 200 m/格 网格的混叠问题。
//
// 工程约束（与两位前辈同律）：不许 Math.random、不许 examples/jsm、
// 不许 SkinnedMesh、材质走 MaterialLibrary、静态几何走 BuildSink 合批、
// 碰撞盒 tag 要有意义。

import * as THREE from "three";
import { Clamp } from "./Script_Noise.mjs";
import { RayAabb, MakeBox, MakePlane, PlaceGeometry } from "./Script_Geo.mjs";
import { BuildSink } from "./Script_World.mjs";
import {
  RANGE_WORLD, RANGE_CAMERA_FAR, RANGE_STATIONS, RANGE_TARGETS,
} from "./Data_Range.mjs";
import { MELEE_QTE_LEVEL_ID } from "./Data_MeleeQte.mjs";

/** 靶道朝北（-Z）。挡弹墙立在最远靶身后这一线。 */
const BACKSTOP_Z = 1350;
/** 沙袋射击线（步枪位胸墙）：能站着依托射击的高度。 */
const FIRING_LINE = { z: 1461, x0: 1386, x1: 1414, h: 0.92, d: 0.7 };
/** 投弹位的低墙：越过它往北扔。 */
const THROW_WALL = { z: 1461, x0: 1364, x1: 1372, h: 0.78, d: 0.7 };

export class RangeField {
  /** 构造参数与 TengxianField / JieheField 同形（BuildField 统一喂）。 */
  constructor(scene, library, { bounds = null, zones = RANGE_STATIONS, levelId = null } = {}) {
    this.scene = scene;
    this.library = library;
    this.levelId = levelId;

    this.meshes = [];
    /** 物理世界。由装配层在建完切片之后挂上来（见 Script_Main.BuildPhysics）。 */
    this.physics = null;
    this.colliders = [];
    this.covers = [];
    this.grid = new Map();
    this.gridSize = 12;                 // 与 TengxianCity / JieheField 一致
    this.bounds = bounds
      ? { minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.minZ, maxZ: bounds.maxZ }
      : { minX: 1300, maxX: 1500, minZ: 1310, maxZ: 1500 };
    this.worldLimits = RANGE_WORLD;
    this.cameraFar = RANGE_CAMERA_FAR;
    /** 目标链契约同前辈：不是占领点，owner 恒为 nra，只给 HUD 路标用。 */
    this.objectives = zones.map((z, i) => ({
      ...z, index: i, owner: "nra", progress: 1, contested: false, reached: false,
    }));
    // 语义同 JieheField：这张图上没有「墙顶标高」这回事，留 null 不留 0。
    this.wallTopY = null;
    this.stats = { groundChunks: 0, groundTris: 0, structures: 0 };
  }

  // -------------------------------------------------------------------------
  // 地表：解析平地
  // -------------------------------------------------------------------------

  GroundHeight(_x, _z) { return 0; }

  /** 铺地。一整块就够 —— 场地 280 m 见方，谈不上视锥剔除的账。 */
  BuildGround() {
    const b = this.bounds;
    const margin = 40;
    const w = (b.maxX - b.minX) + margin * 2;
    const d = (b.maxZ - b.minZ) + margin * 2;
    const mesh = new THREE.Mesh(MakePlane(w, d), this.library.Get("Ground"));
    mesh.position.set((b.minX + b.maxX) * 0.5, 0, (b.minZ + b.maxZ) * 0.5);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.name = "RangeGround";
    this.scene.add(mesh);
    this.meshes.push(mesh);
    this.stats.groundChunks = 1;
    this.stats.groundTris = 2;
  }

  // -------------------------------------------------------------------------
  // 工事与标识（全走 BuildSink 合批）
  // -------------------------------------------------------------------------

  BuildStructures() {
    const sink = new BuildSink();
    sink.SetSector("Range");

    if (this.levelId === MELEE_QTE_LEVEL_ID) {
      // 六个 20 m 间隔的白刃工位：前三块用石色标格挡、后三块加砖色横杠标处决。
      // 所有目标前方都留足无碰撞空地，背后的横墙只负责收住画面与误射。
      for (const objective of this.objectives) {
        sink.Add("Stone", PlaceGeometry(MakeBox(8.4, 0.10, 8.0, 1.2, `qte_pad_${objective.id}`),
          { x: objective.x, y: 0.05, z: objective.z - 1.1 }));
        sink.Add("WoodBeam", PlaceGeometry(MakeBox(0.18, 2.4, 0.18, 1.2, `qte_sign_${objective.id}`),
          { x: objective.x - 3.5, y: 1.2, z: objective.z + 2.6 }));
        sink.Add(objective.kind === "execution" ? "BrickWall" : "WoodBeam",
          PlaceGeometry(MakeBox(2.6, 0.15, 0.22, 1.2, `qte_mark_${objective.id}`),
            { x: objective.x - 2.2, y: 1.82, z: objective.z + 2.6,
              rz: objective.kind === "execution" ? -0.22 : 0.22 }));
        this.stats.structures += 1;
      }
      const width = this.bounds.maxX - this.bounds.minX - 10;
      const centerX = (this.bounds.minX + this.bounds.maxX) * 0.5;
      sink.Add("BrickWall", PlaceGeometry(MakeBox(width, 3.2, 0.8, 1.2, "qte_backstop"),
        { x: centerX, y: 1.6, z: 1448 }));
      sink.Solid(centerX, 1.6, 1448, width * 0.5, 1.6, 0.4, "wall");
      this.stats.structures += 1;
      for (const mesh of sink.Flush(this.scene, this.library)) this.meshes.push(mesh);
      this.colliders = sink.colliders;
      this.covers = sink.covers.slice();
      return;
    }

    // 沙袋线两道：步枪位胸墙 + 投弹位低墙
    for (const line of [FIRING_LINE, THROW_WALL]) {
      const w = line.x1 - line.x0;
      const cx = (line.x0 + line.x1) * 0.5;
      sink.Add("Sandbag", PlaceGeometry(MakeBox(w, line.h, line.d, 0.62, `sand_${cx}`),
        { x: cx, y: line.h * 0.5, z: line.z }));
      sink.Solid(cx, line.h * 0.5, line.z, w * 0.5, line.h * 0.5, line.d * 0.5, "sandbag");
      this.stats.structures += 1;
    }

    // 挡弹墙：立在最远靶身后，罩住整条步枪道的横向散布
    const backstop = { x0: 1382, x1: 1424, h: 5.0, d: 1.2 };
    const bw = backstop.x1 - backstop.x0;
    const bx = (backstop.x0 + backstop.x1) * 0.5;
    sink.Add("BrickWall", PlaceGeometry(MakeBox(bw, backstop.h, backstop.d, 1.2, "backstop"),
      { x: bx, y: backstop.h * 0.5, z: BACKSTOP_Z }));
    sink.Solid(bx, backstop.h * 0.5, BACKSTOP_Z, bw * 0.5, backstop.h * 0.5, backstop.d * 0.5, "wall");
    this.stats.structures += 1;

    // 步枪道的距离牌：立在每个靶位西侧 3 m，柱 + 牌（只看不挡，不登记碰撞 ——
    // 挡了的话 FindFreeSpot 会把靶从牌边推开，名义距离就不准了）
    for (const t of RANGE_TARGETS) {
      if (t.station !== "RangeRifle") continue;
      const px = t.x - 3;
      sink.Add("WoodBeam", PlaceGeometry(MakeBox(0.14, 1.7, 0.14, 1.2, `post_${t.id}`),
        { x: px, y: 0.85, z: t.z }));
      sink.Add("WoodBeam", PlaceGeometry(MakeBox(1.1, 0.5, 0.07, 1.2, `board_${t.id}`),
        { x: px, y: 1.55, z: t.z }));
      this.stats.structures += 1;
    }

    // 工位台：一块薄石板 + 身后一根标桩，人与出图都好找
    for (const st of RANGE_STATIONS) {
      sink.Add("Stone", PlaceGeometry(MakeBox(4, 0.08, 4, 1.2, `pad_${st.id}`),
        { x: st.x, y: 0.04, z: st.z }));
      sink.Add("WoodBeam", PlaceGeometry(MakeBox(0.16, 2.0, 0.16, 1.2, `sign_${st.id}`),
        { x: st.x, y: 1.0, z: st.z + 3 }));
      this.stats.structures += 1;
    }

    for (const m of sink.Flush(this.scene, this.library)) this.meshes.push(m);
    this.colliders = sink.colliders;
    this.covers = sink.covers.slice();
  }

  // -------------------------------------------------------------------------

  /** 分帧生成。用法与 TengxianField / JieheField.BuildSteps 一致。 */
  *BuildSteps() {
    const label = this.levelId === MELEE_QTE_LEVEL_ID ? "白刃测试场" : "靶场";
    yield { label: `${label}：地皮`, progress: 0.3 };
    this.BuildGround();
    yield { label: `${label}：工事与标识`, progress: 0.7 };
    this.BuildStructures();
    yield { label: `${label}：碰撞格`, progress: 0.92 };
    this.BuildCollisionGrid();
    yield { label: "就绪", progress: 1.0 };
  }

  /** 把 colliders 刷进空间散列（判据与 TengxianCity.BuildCollisionGrid 一致）。 */
  BuildCollisionGrid() {
    this.grid.clear();
    const g = this.gridSize;
    for (const box of this.colliders) {
      const x0 = Math.floor(box.min[0] / g), x1 = Math.floor(box.max[0] / g);
      const z0 = Math.floor(box.min[2] / g), z1 = Math.floor(box.max[2] / g);
      for (let x = x0; x <= x1; x += 1) {
        for (let z = z0; z <= z1; z += 1) {
          const key = x * 100003 + z;
          if (!this.grid.has(key)) this.grid.set(key, []);
          this.grid.get(key).push(box);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 规则层要的查询（判据逐条照抄 JieheField —— 两边必须一致）
  // -------------------------------------------------------------------------

  BoxesNear(x, z) {
    const g = this.gridSize;
    return this.grid.get(Math.floor(x / g) * 100003 + Math.floor(z / g)) || [];
  }

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

  /** 这张图上没有水。 */
  WaterDepth(_x, _z, _y) { return 0; }

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

  /** 射线：有物理世界走 Rapier（正常情形），没有退 AABB 兜底（同 JieheField）。 */
  Raycast(origin, direction, maxDist = 200, options = null) {
    if (this.physics) return this.physics.Raycast(origin, direction, maxDist, options);
    return this.RaycastAabb(origin, direction, maxDist);
  }

  RaycastAabb(origin, direction, maxDist = 200) {
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

  /** 城的两条自检在这张图上没有对应物 —— 明说「不适用」，不假装通过。 */
  CheckSightCorridor() { return { ok: true, blockers: [], scene: "range", applies: false }; }

  CheckWallCorridor() {
    return {
      rampCount: 0, topReachableSpan: 0, topSegments: 0, leakSpan: 0, leaks: [],
      ok: true, scene: "range", applies: false,
    };
  }

  ClampToBounds(x, z, margin = 8) {
    return {
      x: Clamp(x, this.bounds.minX + margin, this.bounds.maxX - margin),
      z: Clamp(z, this.bounds.minZ + margin, this.bounds.maxZ - margin),
    };
  }

  Dispose() {
    for (const m of this.meshes) {
      this.scene.remove(m);
      if (m.geometry) m.geometry.dispose();
    }
    this.meshes.length = 0;
    this.colliders = [];
    this.covers = [];
    this.grid.clear();
    this.objectives.length = 0;
  }
}

export default RangeField;
