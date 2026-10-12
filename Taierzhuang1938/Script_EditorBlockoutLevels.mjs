// 白盒关卡编辑器的关卡注册表与场景（docs/Data_EditorBlockout.md §2）。
//
// 纯模块：零 three、零 DOM，node 与浏览器共用。Script_Main 只从这里拿 BLOCKOUT_PHASES 与
// BlockoutLevelIndex；关卡的 3D 世界照旧由 FirstLevelWhiteboxField 按 phase.whitebox.layout 建。
//
// 每个关卡一个 phase（照 MOVEMENT_RANGE_PHASE 的形状从零写，**不展开 FIRST_LEVEL_MISSION_PHASE**：
// 那份带着 contentId，会把第一关的故事拍与同伴一起带进来）。
//
// 地形的样子（§6.3）：高度色带 —— 低处偏冷偏暗、高处偏暖偏亮，幅度克制。
// 色带的上下限写在 layout.heightTint；SampleGroundColor 给建关时的底色，
// 总控（Script_EditorBlockout）建完后按顶点的真实高度再刷一遍（沟底、河槽都要准）。

import { MISSION_LAYOUT, MISSION_ANCHORS } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_TERRAIN, SampleMissionNaturalHeight, TrenchPlanFor } from "./Data_FirstLevelMissionTerrain.mjs";
import { BLOCKOUT_LEVEL_KEYS, ValidateBlockoutScene } from "./Script_EditorBlockoutConfig.mjs";

export const BLOCKOUT_LEVELS = Object.freeze([
  Object.freeze({ key: "FirstLevel", label: "第一关 · 往南的路", configUrl: "./Blockout/FirstLevel.json",
    scene: Object.freeze({ kind: "firstLevelMission" }) }),
  Object.freeze({ key: "SecondLevel", label: "第二关 · 手榴弹雨（空间草稿）", configUrl: "./Blockout/SecondLevel.json",
    scene: Object.freeze({ kind: "file", url: "./Blockout/SecondLevel.scene.json" }) }),
]);

for (const level of BLOCKOUT_LEVELS) {
  if (!BLOCKOUT_LEVEL_KEYS.includes(level.key)) throw new Error(`Blockout level ${level.key} is not in BLOCKOUT_LEVEL_KEYS`);
}

/** 高度色带的三个色标（sRGB 0–1）：冷暗 → 中性 → 暖亮。 */
export const BLOCKOUT_TINT_STOPS = Object.freeze({
  low: Object.freeze([0.40, 0.47, 0.52]),
  mid: Object.freeze([0.60, 0.60, 0.56]),
  high: Object.freeze([0.78, 0.71, 0.56]),
});
/**
 * 第一关高度范围（米）：格网实测 −6.2…7.5。色带夹在 −3…4：地面大多在 0…1 m，
 * 2 m 深的交通沟沟底落在冷端，河槽更冷，两侧高坡偏暖。
 */
export const FIRST_LEVEL_TINT = Object.freeze({ lo: -3, hi: 4 });

/** 高度 → sRGB 三元组（写进 out）。 */
export function BlockoutTintColor(y, tint, out = [0, 0, 0]) {
  const span = Math.max(0.5, tint.hi - tint.lo);
  const t = Math.max(0, Math.min(1, (y - tint.lo) / span));
  const a = t < 0.5 ? BLOCKOUT_TINT_STOPS.low : BLOCKOUT_TINT_STOPS.mid;
  const b = t < 0.5 ? BLOCKOUT_TINT_STOPS.mid : BLOCKOUT_TINT_STOPS.high;
  const k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  // smoothstep 让中段过渡柔一点，两端不出硬边
  const s = k * k * (3 - 2 * k);
  out[0] = a[0] + (b[0] - a[0]) * s;
  out[1] = a[1] + (b[1] - a[1]) * s;
  out[2] = a[2] + (b[2] - a[2]) * s;
  return out;
}

// ---------------------------------------------------------------------------
// 高度网格（场景文件 terrain.data：int16 小端、厘米）

function DecodeBase64(text) {
  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return new Uint8Array(globalThis.Buffer.from(text, "base64"));
}

/** 解出 (cols+1)×(rows+1) 个格点高度（米），heights[iz*(cols+1)+ix]。 */
export function DecodeHeightGrid(terrain) {
  const count = (terrain.cols + 1) * (terrain.rows + 1);
  const bytes = DecodeBase64(terrain.data);
  if (bytes.length < count * 2) throw new Error(`terrain.data has ${bytes.length} bytes, needs ${count * 2}`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const heights = new Float32Array(count);
  for (let i = 0; i < count; i++) heights[i] = view.getInt16(i * 2, true) / 100;
  return heights;
}

/**
 * int16 厘米网格 → (x,z)=>y。三角剖分与 Data_FirstLevelP012Terrain.SampleHeight 相同
 *（每格沿反对角线切两片），所以拿它当 layout.terrainSampler 建出来的格网与它逐点一致。
 * 返回的函数带 cellM（建格用）、grid 与 minY / maxY。
 */
export function HeightGridSampler(terrain) {
  const heights = terrain.heights instanceof Float32Array ? terrain.heights : DecodeHeightGrid(terrain);
  const { minX, minZ, cellM, cols, rows } = terrain;
  const width = cols + 1, w = cols * cellM, d = rows * cellM;
  const H = (ix, iz) => heights[Math.max(0, Math.min(rows, iz)) * width + Math.max(0, Math.min(cols, ix))];
  const Sample = (px, pz) => {
    const gx = Math.max(0, Math.min(1, (px - minX) / w)) * cols;
    const gz = Math.max(0, Math.min(1, (pz - minZ) / d)) * rows;
    const ix = Math.min(cols - 1, Math.floor(gx)), iz = Math.min(rows - 1, Math.floor(gz));
    const u = gx - ix, v = gz - iz;
    const a = H(ix, iz), b = H(ix + 1, iz), c = H(ix, iz + 1), e = H(ix + 1, iz + 1);
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v : e + (c - e) * (1 - u) + (b - e) * (1 - v);
  };
  let minY = Infinity, maxY = -Infinity;
  for (const h of heights) { if (h < minY) minY = h; if (h > maxY) maxY = h; }
  Sample.cellM = cellM;
  Sample.grid = { minX, minZ, cellM, cols, rows, heights };
  Sample.minY = minY;
  Sample.maxY = maxY;
  return Sample;
}

// ---------------------------------------------------------------------------
// 第一关白盒布局（§2.1）：派生自 MISSION_LAYOUT，不改原表

const TREE_TRUNK = Object.freeze({ w: 0.5, d: 0.5, heightM: 6 });

/** 树换成普通树干块（保留碰撞与地标作用）；水块不画（总控另铺一条水面）。 */
function BlockoutBlock(block) {
  if (block.treeModel) {
    const { treeModel, ...rest } = block;
    const h = Number.isFinite(block.h) && block.h > 0 ? block.h : TREE_TRUNK.heightM;
    const foot = block.y - block.h / 2;
    return { ...rest, w: TREE_TRUNK.w, d: TREE_TRUNK.d, h, y: foot + h / 2, solid: true, semantic: "foliage",
      tag: block.tag || "whiteboxWall", blockoutTree: true };
  }
  if (block.semantic === "water") return { ...block, visual: false, blockoutWater: true };
  return block;
}

let firstLevelLayout = null;

/** §2.1 第一关白盒布局（结果缓存）。地形仍用 MISSION_TERRAIN（0.75 m + 细分，与游戏一致）。 */
export function DeriveFirstLevelBlockoutLayout() {
  if (firstLevelLayout) return firstLevelLayout;
  const tint = FIRST_LEVEL_TINT;
  const layout = {
    ...MISSION_LAYOUT,
    id: "BlockoutFirstLevel",
    legend: false,
    fortifications: false,
    materialLooks: false,
    railway: null,
    SampleGroundSurface: null,
    ground: { ...MISSION_LAYOUT.ground, pbr: undefined, terrainLayers: undefined },
    // 建关时的底色：自然地面（每点约 0.1 µs）。沟与河槽的冷色由总控按顶点真实高度补上，
    // 不在这里逐点调 SampleMissionTerrain（四十万个顶点要多花三四秒）。
    SampleGroundColor: (x, z) => BlockoutTintColor(SampleMissionNaturalHeight(x, z), tint),
    blocks: MISSION_LAYOUT.blocks.map(BlockoutBlock),
    heightTint: tint,
  };
  firstLevelLayout = layout;
  return layout;
}

let firstLevelWays = null;
/** 俯视图用的路与沟（第一关）：{ roads: [[{x,z}]], trenches: [[{x,z}]] }。 */
export function FirstLevelBlockoutWays() {
  if (firstLevelWays) return firstLevelWays;
  const roads = (MISSION_TERRAIN.roads || []).map(road => road.points.map(p => ({ x: p.x, z: p.z })));
  let trenches = [];
  try { trenches = TrenchPlanFor(MISSION_TERRAIN).trenches.map(t => t.points.map(p => ({ x: p.x, z: p.z }))); }
  catch (error) { trenches = []; }
  firstLevelWays = { roads, trenches };
  return firstLevelWays;
}

// ---------------------------------------------------------------------------
// 文件场景（§2.2）

/** 块脚落在中心与四角中最低的地面上（同 Layout 的 GroundedBlock）。 */
function GroundedBlock(block, groundAt) {
  const ry = Number.isFinite(block.ry) ? block.ry : 0;
  const c = Math.cos(ry), s = Math.sin(ry), hx = block.w / 2, hz = block.d / 2;
  let lowest = groundAt(block.x, block.z);
  for (const [lx, lz] of [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]]) {
    // 与 three 的 rotation.y 同号：局部 (lx,lz) → 世界 (x + lx·cos + lz·sin, z − lx·sin + lz·cos)
    lowest = Math.min(lowest, groundAt(block.x + lx * c + lz * s, block.z - lx * s + lz * c));
  }
  return {
    id: block.id, x: block.x, z: block.z, w: block.w, d: block.d, h: block.h, ry,
    y: lowest + block.h / 2,
    semantic: block.semantic, tag: block.tag || "whiteboxWall",
    solid: block.solid !== false,
    ...(block.cover ? { cover: { ...block.cover } } : {}),
    ...(block.visual === false ? { visual: false } : {}),
  };
}

/** 场景文件 → FirstLevelWhiteboxField 吃的布局。校验不过直接抛（Prepare 把错误交给总控显示）。 */
export function LayoutFromSceneDoc(doc) {
  const check = ValidateBlockoutScene(doc);
  if (!check.ok) throw new Error(`场景文件有 ${check.errors.length} 处错误：${check.errors.slice(0, 3).join("；")}`);
  const t = doc.terrain;
  const sampler = HeightGridSampler(t);
  const w = t.cols * t.cellM, d = t.rows * t.cellM;
  const ground = { x: t.minX + w / 2, z: t.minZ + d / 2, w, d, h: 1, y: -0.5, semantic: "ground" };
  const tint = { lo: sampler.minY, hi: Math.max(sampler.minY + 0.5, sampler.maxY) };
  const blocks = doc.blocks.map(block => GroundedBlock(block, sampler));
  return {
    id: `Blockout${doc.level}`,
    level: doc.level,
    legend: false,
    fortifications: false,
    materialLooks: false,
    railway: null,
    terrain: "P012Heightfield",
    terrainSpec: null,
    terrainSampler: sampler,
    SampleGroundColor: (x, z) => BlockoutTintColor(sampler(x, z), tint),
    SampleGroundSurface: null,
    heightTint: tint,
    bounds: { ...doc.bounds },
    ground,
    semanticColors: { ...MISSION_LAYOUT.semanticColors },
    semanticSurfaces: { ...(MISSION_LAYOUT.semanticSurfaces || {}) },
    blocks,
    gates: [],
    walkableSurfaces: [],
    scenario: null,
    trenchPlacements: [],
    zones: [],
    spawn: { x: doc.spawn.x, z: doc.spawn.z, yawDeg: Number.isFinite(doc.spawn.yawDeg) ? doc.spawn.yawDeg : 0 },
    ways: {
      roads: (doc.ways?.roads || []).map(line => line.map(p => ({ x: p.x, z: p.z }))),
      trenches: (doc.ways?.trenches || []).map(line => line.map(p => ({ x: p.x, z: p.z }))),
    },
  };
}

// ---------------------------------------------------------------------------
// phase

const BLOCKOUT_SKY = "firstLevelBattleDay";
const LOADOUT = Object.freeze({ primary: "HanYang", secondary: null, melee: "Dadao", throwables: Object.freeze({ Grenade: 3 }), spareClips: 12 });
// 第二关在场景文件读进来之前的占位范围与出生点（§9）；Prepare 读完场景后改成文件里的。
const SECOND_LEVEL_PLACEHOLDER = Object.freeze({ bounds: { minX: 400, maxX: 640, minZ: -250, maxZ: 60 }, spawn: { x: 470, z: -65, yawDeg: -90 } });

function SpawnFrom(point) {
  return { x: point.x, z: point.z, ry: (Number.isFinite(point.yawDeg) ? point.yawDeg : 0) * Math.PI / 180 };
}

/** 目标圈半径 0：玩家永远「走不到」，目标链不前进（关卡本来也是钉住的）。 */
function ZonesFor(label, spawn) {
  return [{ id: "Blockout", name: label, x: spawn.x, z: spawn.z, radius: 0, index: 0 }];
}

/** 把场景布局装进 phase（文件场景在 Prepare 里调）。 */
function ApplyLayout(phase, layout) {
  phase.whitebox.layout = layout;
  phase.bounds = { ...layout.bounds };
  if (layout.spawn) phase.spawn = SpawnFrom(layout.spawn);
  phase.zones = ZonesFor(phase.label, phase.spawn);
}

export function MakeBlockoutPhase(level) {
  const firstLevel = level.scene.kind === "firstLevelMission";
  const bounds = firstLevel ? { ...MISSION_LAYOUT.bounds } : { ...SECOND_LEVEL_PLACEHOLDER.bounds };
  const spawn = firstLevel ? { x: MISSION_ANCHORS.bunker.x, z: MISSION_ANCHORS.bunker.z, ry: 0 } : SpawnFrom(SECOND_LEVEL_PLACEHOLDER.spawn);
  const phase = {
    id: `Blockout_${level.key}`,
    label: level.label,
    date: "",
    blockout: null,
    sandbox: true,
    ambientAircraft: false,
    sky: BLOCKOUT_SKY,
    ambience: null,
    music: null,
    minutes: 600,
    cutsceneIn: null,
    cutsceneOut: null,
    brief: [],
    bounds,
    spawn,
    zones: ZonesFor(level.label, spawn),
    objectives: [level.label],
    nraPool: 9999,
    ijaPool: 0,
    ijaPressure: 0,
    ijaSpawn: [],
    ijaSupport: [],
    hud: { objectiveMarkers: false },
    loadoutOverride: { ...LOADOUT, throwables: { ...LOADOUT.throwables } },
    cameraFar: 650,
    whitebox: { layout: null, blockout: true, actorCapacity: 160 },
  };
  phase.blockout = {
    key: level.key,
    configUrl: level.configUrl,
    scene: level.scene,
    sceneError: null,
    /** BuildField 在 new World(...) 之前 await 它。第一关立即返回；文件场景在这里读场景文件。 */
    async Prepare() {
      if (firstLevel) {
        if (!phase.whitebox.layout) ApplyLayout(phase, DeriveFirstLevelBlockoutLayout());
        return phase.whitebox.layout;
      }
      // 每次进关都重读：场景文件可能被生成器 / 人改过。读不到时退回上一次的布局（若有）。
      try {
        const response = await globalThis.fetch(`${level.scene.url}?t=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`场景文件读不到（HTTP ${response.status}）`);
        let doc;
        try { doc = await response.json(); } catch (error) { throw new Error("场景文件不是 JSON"); }
        ApplyLayout(phase, LayoutFromSceneDoc(doc));
        phase.blockout.sceneError = null;
      } catch (error) {
        phase.blockout.sceneError = String(error?.message || error);
        if (!phase.whitebox.layout) ApplyLayout(phase, EmptySceneLayout(phase));
      }
      return phase.whitebox.layout;
    },
  };
  return phase;
}

/** 场景文件坏了也要有一片能站人的平地（配置错了仍能走场景）。 */
function EmptySceneLayout(phase) {
  const b = phase.bounds, cellM = 2;
  const cols = Math.max(1, Math.ceil((b.maxX - b.minX) / cellM)), rows = Math.max(1, Math.ceil((b.maxZ - b.minZ) / cellM));
  const heights = new Float32Array((cols + 1) * (rows + 1));
  const sampler = HeightGridSampler({ minX: b.minX, minZ: b.minZ, cellM, cols, rows, heights });
  const w = cols * cellM, d = rows * cellM;
  return {
    id: `Blockout${phase.blockout.key}Empty`, legend: false, fortifications: false, materialLooks: false, railway: null,
    terrain: "P012Heightfield", terrainSpec: null, terrainSampler: sampler,
    SampleGroundColor: () => [...BLOCKOUT_TINT_STOPS.mid], SampleGroundSurface: null, heightTint: { lo: -1, hi: 1 },
    bounds: { ...b }, ground: { x: b.minX + w / 2, z: b.minZ + d / 2, w, d, h: 1, y: -0.5, semantic: "ground" },
    semanticColors: { ...MISSION_LAYOUT.semanticColors }, semanticSurfaces: {}, blocks: [], gates: [], walkableSurfaces: [],
    scenario: null, trenchPlacements: [], zones: [], spawn: null, ways: { roads: [], trenches: [] },
  };
}

/** 模块求值时建好；phase 对象本身可改（文件场景在 Prepare 里填布局）。 */
export const BLOCKOUT_PHASES = Object.freeze(BLOCKOUT_LEVELS.map(MakeBlockoutPhase));

export function BlockoutLevelIndex(key) {
  const index = BLOCKOUT_LEVELS.findIndex(level => level.key === key);
  return index >= 0 ? index : 0;
}

/** 关卡的水块（第一关北沙河等）；总控用它铺水面。 */
export function BlockoutWaterBlocks(layout) {
  return (layout?.blocks || []).filter(block => block.blockoutWater || block.semantic === "water");
}

/** 俯视图要的场景描述（§4.1 BlockoutMap.SetScene 的入参，不含 levelKey）。 */
export function BlockoutMapScene(layout, groundAt) {
  const firstLevel = layout?.id === "BlockoutFirstLevel";
  return {
    bounds: { ...(layout?.bounds || { minX: 0, maxX: 1, minZ: 0, maxZ: 1 }) },
    blocks: (layout?.blocks || []).map(b => ({ x: b.x, z: b.z, w: b.w, d: b.d, h: b.h, ry: b.ry || 0,
      semantic: b.blockoutWater ? "water" : b.semantic, solid: b.solid !== false, tag: b.tag })),
    sampleHeight: groundAt || layout?.terrainSampler || (() => 0),
    naturalHeight: firstLevel ? SampleMissionNaturalHeight : null,
    ways: firstLevel ? FirstLevelBlockoutWays() : (layout?.ways || { roads: [], trenches: [] }),
  };
}
