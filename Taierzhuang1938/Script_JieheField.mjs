// 序 · 界河 —— **一张独立的场景**，不是滕县城的一块切片。
//
// ---------------------------------------------------------------------------
// 为什么要单独一个世界类
//
// 设计书（docs/Data_TengxianDesign.md §2.8）那张切片表原本就把界河标成
// 「另一张外围地图，非滕县城 · 独立场景」，其余六关才是同一座城的切片。
// 理由是地理：界河在滕县以北约二十公里，跟 600 m 见方的滕县城不在一个尺度上，
// 真在界河看得见滕县城墙是史实错误。
//
// 实装时走了另一条路 —— 「同一个世界、把切片北移 1.5 km」，于是掉进了一个
// 纯工程的坑：Script_TengxianCity.BuildOuterGround 在 700—1700 m 这一段
// 只有 5 圈径向采样（radialNear=52 / radialFar=5），**一格 200 米**。
// 那张网格上刻不出 38 m 宽的河槽、1.5 m 高的土坎、1.9 m 高的路基 ——
// 而 L0 的切片（z −1620…−900）正好整个落在最粗的那一圈里。
// 实拍的结果就是用户看到的那张图：一望无际的平地，只有几个兵。
//
// 拆成独立场景之后，这一关自己铺地面（河槽一带 3.2 m 一格），
// 也不再背着一座六百米方城的几何预算。
//
// ---------------------------------------------------------------------------
// 它与 Script_TengxianField 的关系：**同一套查询接口，两个实现**
//
// Script_Ai / Script_Player / Script_Navigation / Script_Combat 四个模块
// 只认这一套（谁都不知道底下是城还是野地）：
//   GroundHeight(x,z) / StandHeight(x,z,fromY) / NearbyColliders(x,z,r) /
//   Raycast(from,dir,maxDist) / WaterDepth(x,z,y) / bounds / colliders /
//   covers / objectives / BuildSteps() / Dispose()
// 这条缝本来就是为换世界留的（见 Script_TengxianField 的文件头），
// 所以这里**不 import、不实例化 TengxianCity** —— 界河跟那座城没有任何关系。
//
// 内容层照旧复用 Script_TengxianOutfield（河道河堤、土坎、散兵胸墙、坟头、
// 麦田田埂、光秃乔木、弹坑、大车路、津浦路路基、村落轮廓）：它本来就只依赖
// 一个 groundAt(x,z) 钩子，不关心宿主是谁。这里把钩子接到本场景自己的地表上，
// 并关掉那一份里的**城内地物屏蔽**（cityMask）—— 护城河、关厢、荆河、电灯厂
// 那些坐标在这张图上根本不存在。
//
// ---------------------------------------------------------------------------
// 三月的地表（Data_Tengxian.MARCH_GROUND，硬约束）
//   所有乔木完全落叶、冬小麦贴地不连续露土率高、大片裸露褐土。
//   本文件只铺**裸土**：地表材质就是城外那张 Ground（鲁南褐土），
//   绿的、开花的、带叶的东西一概不产。绝不做成绿意盎然的春天。
//   大尺度高程来自台儿庄古城中心附近 SRTM 高度图，详见
//   Heightmap/Data_TaierzhuangHeightmap.mjs 与 docs/Data_TaierzhuangHeightmap.md。
//
// 工程约束：不许 Math.random（截图比对要可复现）、不许 examples/jsm、
// 不许 SkinnedMesh、材质走 MaterialLibrary、碰撞盒 tag 要有意义。
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { Clamp } from "./Script_Noise.mjs";
import { RayAabb } from "./Script_Geo.mjs";
import {
  TengxianOutfield, OutfieldSpec,
} from "./Script_TengxianOutfield.mjs";
import {
  JIEHE_GROUND, JIEHE_TACTICAL_TERRAIN, JieheRiverCenterZ, SampleJieheHeight,
} from "./Script_JieheHeight.mjs";

export { JIEHE_GROUND, JIEHE_TACTICAL_TERRAIN } from "./Script_JieheHeight.mjs";

/** 本关的关卡 id（Data_Battle.PHASES[*].id）。 */
export const JIEHE_LEVEL_ID = "L0_Jiehe";

/**
 * 相机远平面（米）。城里那六关是 620。
 * 这一关收到 460：雾（fog.max 0.93 / density 0.0125）在两百多米外就把东西吃干净了，
 * 而这张图上最远的一处内容（北岸村落 z≈−1660）离出生点 190 m。
 * 远平面只影响视锥剔除，不影响画面 —— 收进去是白赚的 draw call。
 */
export const JIEHE_CAMERA_FAR = 460;

/** 这张图的地皮边界（相当于城那张图的 Data_Battle.WORLD.groundLimit = 1700）。 */
export const JIEHE_WORLD = {
  minX: JIEHE_GROUND.minX, maxX: JIEHE_GROUND.maxX,
  minZ: JIEHE_GROUND.minZ, maxZ: JIEHE_GROUND.maxZ,
  groundLimit: 1250,
};

// ---------------------------------------------------------------------------

/**
 * 一条非均匀采样轴。
 *
 * 中间按 cellAt 给的密度走（河槽段密、打仗那段中、其余疏），两端按 growth
 * 倍数放大到 maxCell。**必须是一条张量积网格**（x 轴 × z 轴），
 * 不是两张疏密不同的网格拼起来 —— 拼接处的顶点对不上就是一条会漏天光的裂缝。
 */
function BuildAxis({ min, max, coreMin, coreMax, cellAt, growth, maxCell }) {
  const core = [coreMin];
  let p = coreMin;
  let guard = 0;
  while (p < coreMax - 1e-6 && guard < 20000) {
    p = Math.min(coreMax, p + Math.max(1.5, cellAt(p)));
    core.push(p);
    guard += 1;
  }
  const head = [];
  let q = coreMin;
  let c = Math.max(1.5, cellAt(coreMin));
  while (q > min + 1e-6 && head.length < 200) {
    c = Math.min(c * growth, maxCell);
    q = Math.max(min, q - c);
    head.push(q);
  }
  head.reverse();
  const tail = [];
  q = coreMax;
  c = Math.max(1.5, cellAt(coreMax - 1e-6));
  while (q < max - 1e-6 && tail.length < 200) {
    c = Math.min(c * growth, maxCell);
    q = Math.min(max, q + c);
    tail.push(q);
  }
  return head.concat(core, tail);
}

// ---------------------------------------------------------------------------

export class JieheField {
  /**
   * @param {THREE.Scene} scene
   * @param {object} library MaterialLibrary
   * @param {object} options
   *   quality  low / medium / high / ultra（只影响城外内容的密度）
   *   seed     随机种子（Mulberry32，不许 Math.random）
   *   bounds   本关可玩切片（Data_Battle.TUNING.L0_Jiehe.bounds，世界坐标）
   *   zones    目标链（Data_Battle.ZONES 里挑出来的那几条）
   *   levelId  关卡 id；不传就按 L0_Jiehe
   *   foci / detailRadius / midRadius —— **接口对齐用，本场景不分 LOD 档**
   *     （城里分档是因为四合院有三档剪影，野地上没有可分的东西）
   */
  constructor(scene, library, {
    quality = "high", seed = 19380314, bounds = null, zones = [],
    levelId = JIEHE_LEVEL_ID, foci = null, detailRadius = 0, midRadius = 0,
  } = {}) {
    this.scene = scene;
    this.library = library;
    this.quality = quality;
    this.seed = seed;
    this.levelId = levelId;
    this.spec = OutfieldSpec(levelId);
    if (!this.spec) throw new Error(`Script_JieheField: ${levelId} 没有城外布景表`);
    this.river = this.spec.river || null;
    // 河槽的下切参数（spec.river.channel）。**这是独立场景才做得到的事** ——
    // 在城那张 200 m/格 的网格上，任何窄于 200 m 的地形特征都会被混叠掉，
    // 所以那边的河只能靠两岸筑堤表达。这里河槽是真下切的。
    this.channel = (this.river && this.river.channel) || null;

    this.meshes = [];
    /** 物理世界。由装配层在建完切片之后挂上来（见 Script_Main.BuildPhysics）。 */
    this.physics = null;
    this.colliders = [];
    this.covers = [];
    this.grid = new Map();
    this.gridSize = 12;                 // 与 TengxianCity 一致（射线步进按它走）
    this.bounds = bounds
      ? { minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.minZ, maxZ: bounds.maxZ }
      : { minX: -620, maxX: 620, minZ: -1620, maxZ: -900 };
    this.worldLimits = JIEHE_WORLD;
    this.cameraFar = JIEHE_CAMERA_FAR;
    /**
     * 目标链。与 TengxianField 同一套契约：线性关卡里它不是占领点，
     * owner 恒为 nra，只给 HUD 标记、小地图与剧本的 zone: 触发用。
     */
    this.objectives = zones.map((z, i) => ({
      ...z, index: i, owner: "nra", progress: 1, contested: false, reached: false,
    }));
    // 城里那套「墙顶标高」在这张图上没有对应物。留 null 而不是留 0：
    // 0 是一个**合法高度**，将来谁拿它当墙顶算会算出一个看似正常的错数。
    this.wallTopY = null;
    this.stats = { groundChunks: 0, groundTris: 0, gridX: 0, gridZ: 0 };

    /**
     * 城外内容层。**唯一的宿主耦合就是 groundAt 这一个钩子**，
     * 所以整份内容（1200 行）一行都不用改就能挂到另一张地表上。
     * cityMask=false：那一份里的「城、护城河、关厢、荆河、电灯厂、车站不许放东西」
     * 是给城那张图写的，这张图上那些坐标什么都没有。
     */
    this.outfield = new TengxianOutfield(scene, library, {
      levelId, bounds, quality, seed: seed ^ 0x4A49,
      cityMask: false,
      groundAt: (x, z) => this.GroundHeight(x, z),
    });
  }

  // -------------------------------------------------------------------------
  // 地表
  // -------------------------------------------------------------------------

  /** 河心线（与内容层同一条公式 —— 两边差一米，河床就会跑到堤外面去）。 */
  RiverCenterZ(x) { return JieheRiverCenterZ(x, this.river); }

  /**
   * 脚下的地面标高。**高度图采样 + 解析式战术微地形** —— 玩家、AI、子弹、撒兵全按它走，
   * 而下面那张网格是照同一条式子采样出来的，所以「看到的地」与「踩到的地」
   * 是同一个东西（这正是城那张 200 m/格 网格做不到的：网格是线性插值，
   * 解析式是曲面，一格 200 m 时两者能差半米以上）。
   */
  GroundHeight(x, z) {
    return SampleJieheHeight(x, z);
  }

  /**
   * 一格多大（x 轴）。等距 —— 河是东西向的，断面变化全在 z 上，
   * x 上还有斜切主战区的宽缓土岗与排水沟，7 m 一格能把 26—34 m 宽的断面
   * 留出至少四个采样点；更细只会增加远处雾里的三角形。
   * （核心区以外的放大由 BuildAxis 负责，不走这里。）
   */
  CellX() { return JIEHE_GROUND.cellOuter; }

  /** 一格多大（z 轴）：河槽最密，打仗那一段次之。 */
  CellZ(z) {
    const g = JIEHE_GROUND;
    if (z >= g.riverBand[0] && z <= g.riverBand[1]) return g.cellRiver;
    if (z >= g.coreBand[0] && z <= g.coreBand[1]) return g.cellCore;
    return g.cellOuter;
  }

  /**
   * 铺地。分块挂进场景（不是一张巨网格）——
   * 一张横跨两公里的地皮意味着视锥剔除对它完全失效，站在哪儿都要整片进管线；
   * 分成几十块之后，绝大多数块在视锥外直接被扔掉。
   */
  BuildGround() {
    const g = JIEHE_GROUND;
    const XS = BuildAxis({
      min: g.minX, max: g.maxX, coreMin: -g.coreX, coreMax: g.coreX,
      cellAt: (x) => this.CellX(x), growth: g.growth, maxCell: g.maxCell,
    });
    const ZS = BuildAxis({
      min: g.minZ, max: g.maxZ, coreMin: g.core[0], coreMax: g.core[1],
      cellAt: (z) => this.CellZ(z), growth: g.growth, maxCell: g.maxCell,
    });
    this.stats.gridX = XS.length;
    this.stats.gridZ = ZS.length;
    const nzAll = ZS.length;
    // 高程只算一遍（每个顶点一次统一高度采样；相邻块共用边上的顶点值必须一致，
    // 各块各算的话浮点误差会在块缝上露出一条亮线）
    const H = new Float32Array(XS.length * nzAll);
    for (let i = 0; i < XS.length; i += 1) {
      for (let j = 0; j < nzAll; j += 1) H[i * nzAll + j] = this.GroundHeight(XS[i], ZS[j]);
    }
    const material = this.library.Get("Ground");
    const step = g.chunk;
    for (let i0 = 0; i0 < XS.length - 1; i0 += step) {
      for (let j0 = 0; j0 < nzAll - 1; j0 += step) {
        const i1 = Math.min(i0 + step, XS.length - 1);
        const j1 = Math.min(j0 + step, nzAll - 1);
        const nx = i1 - i0 + 1, nz = j1 - j0 + 1;
        const pos = new Float32Array(nx * nz * 3);
        const uv = new Float32Array(nx * nz * 2);
        for (let i = 0; i < nx; i += 1) {
          for (let j = 0; j < nz; j += 1) {
            const k = i * nz + j;
            const x = XS[i0 + i], z = ZS[j0 + j];
            pos[k * 3] = x;
            pos[k * 3 + 1] = H[(i0 + i) * nzAll + (j0 + j)];
            pos[k * 3 + 2] = z;
            uv[k * 2] = x / g.tile;
            uv[k * 2 + 1] = z / g.tile;
          }
        }
        const index = new Uint16Array((nx - 1) * (nz - 1) * 6);
        let t = 0;
        for (let i = 0; i < nx - 1; i += 1) {
          for (let j = 0; j < nz - 1; j += 1) {
            const a = i * nz + j, b = a + 1, c = (i + 1) * nz + j, d = c + 1;
            // 绕序：(a,b,c) 的两条边是 +z 与 +x，叉乘朝 +Y —— face 朝上。
            // 反过来写整片地会背朝天，正面剔除之后从上面看是全透的
            index[t] = a; index[t + 1] = b; index[t + 2] = c;
            index[t + 3] = b; index[t + 4] = d; index[t + 5] = c;
            t += 6;
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
        geo.setIndex(new THREE.BufferAttribute(index, 1));
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, material);
        mesh.receiveShadow = true;
        mesh.castShadow = false;
        mesh.name = `JieheGround_${i0}_${j0}`;
        this.scene.add(mesh);
        this.meshes.push(mesh);
        this.stats.groundChunks += 1;
        this.stats.groundTris += (nx - 1) * (nz - 1) * 2;
      }
    }
  }

  // -------------------------------------------------------------------------

  /** 分帧生成。用法与 TengxianField.BuildSteps 一致。 */
  *BuildSteps() {
    yield { label: "界河：鲁南平原地表", progress: 0.16 };
    this.BuildGround();
    for (const s of this.outfield.BuildSteps()) {
      yield { label: s.label, progress: 0.16 + 0.78 * s.progress };
    }
    yield { label: "界河：碰撞格", progress: 0.96 };
    this.colliders = this.outfield.colliders.slice();
    this.covers = this.outfield.covers.slice();
    for (const m of this.outfield.meshes) this.meshes.push(m);
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
  // 规则层要的查询（与 Script_TengxianField 逐个对齐）
  // -------------------------------------------------------------------------

  /** 本格里的碰撞盒。 */
  BoxesNear(x, z) {
    const g = this.gridSize;
    return this.grid.get(Math.floor(x / g) * 100003 + Math.floor(z / g)) || [];
  }

  /**
   * 脚下能踩住的最高一层。判据照抄 TengxianField（两边必须一致，
   * 否则 AI 与玩家会对「这儿能不能站」给出两个答案）：
   * 只认顶面不高过脚 + 0.6 m 的盒子 —— 土坎的四级台阶正好被认出来，
   * 而人不会凭空站到铁路桥的钢梁上。
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
   * 这张图上只有界河一条水，而且是**三月枯水**：河槽下切 1.9 m，
   * 槽底只剩一条 12 m 宽、二十几厘米深的浅流。
   * 下到河槽里不算下水（那是干河床）—— 但人在槽里比岸上低两米，
   * 这是本关北岸唯一的一条掩蔽通道，不是水障。
   */
  WaterDepth(x, z, y) {
    const rv = this.river;
    if (!rv) return 0;
    if (x < rv.fromX - 20 || x > rv.toX + 20) return 0;
    const cz = this.RiverCenterZ(x);
    if (Math.abs(z - cz) > rv.waterHalf) return 0;
    // 水面 = 槽底 + 0.24（内容层那片水面板的顶面标高，见 BuildRiver）
    const surface = this.GroundHeight(x, cz) + 0.24;
    return Math.max(0, surface - y);
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

  /**
   * 射线 vs 静态几何。
   *
   * 有物理世界（正常情形）就走 Rapier：**盒子是带朝向的真实长方体**，
   * 而下面那条 AABB 版只认轴对齐 —— 斜置的瓮城弧段、村墙、路基在它眼里
   * 一律是套出来的大方块，子弹会打在空气上。
   *
   * options.terrain 为真时还与解析地表求交（子弹与抛掷物给 true）。
   * **AI 视线判据一律不给** —— 那会一次性改掉整套交战节奏，是另一件事。
   *
   * 没有物理世界的场合只剩一个：编辑器在切片重建的空档里点了一下。
   * 那时退回 AABB 版，结果糙一点但不会抛。
   */
  Raycast(origin, direction, maxDist = 200, options = null) {
    if (this.physics) return this.physics.Raycast(origin, direction, maxDist, options);
    return this.RaycastAabb(origin, direction, maxDist);
  }

  /** 老的 AABB 版（空间散列 + slab）。留着做没有物理世界时的兜底。 */
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

  /**
   * 城的两条自检在这张图上没有对应物（这里没有城墙、没有上城道、
   * 没有西门→十字街的通视走廊）。返回一个**明说「不适用」**的结果，
   * 而不是假装通过 —— 真跑到这条上来的测试应该自己判 n/a。
   */
  CheckSightCorridor() { return { ok: true, blockers: [], scene: "jiehe", applies: false }; }

  CheckWallCorridor() {
    return {
      rampCount: 0, topReachableSpan: 0, topSegments: 0, leakSpan: 0, leaks: [],
      ok: true, scene: "jiehe", applies: false,
    };
  }

  /** 把某个点夹进本关切片里（撒兵、出生点都要用）。 */
  ClampToBounds(x, z, margin = 8) {
    return {
      x: Clamp(x, this.bounds.minX + margin, this.bounds.maxX - margin),
      z: Clamp(z, this.bounds.minZ + margin, this.bounds.maxZ - margin),
    };
  }

  /**
   * 拆场景。换关必须拆 —— 不拆的话七关跑下来会攒七张地皮，
   * 显存与 draw call 都会线性爬上去。材质归 MaterialLibrary 管（全局共用一份），
   * 这里只拆几何。
   */
  Dispose() {
    for (const m of this.meshes) {
      this.scene.remove(m);
      if (m.geometry) m.geometry.dispose();
    }
    this.meshes.length = 0;
    this.outfield.meshes.length = 0;
    this.colliders = [];
    this.covers = [];
    this.grid.clear();
    this.objectives.length = 0;
  }
}

export default JieheField;
