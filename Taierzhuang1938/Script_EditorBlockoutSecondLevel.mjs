// ===========================================================================
// Script_EditorBlockoutSecondLevel.mjs —— 第二关（东关·手榴弹雨）草稿场景生成器（node 专用）
//
// 契约 docs/Data_EditorBlockout.md §2.2（场景文件格式）、§9（第二关草稿）。产物：
//   Blockout/SecondLevel.scene.json  高度网格 + 院落级体块 + 道路
//   Blockout/SecondLevel.json        4 个占位关键帧（不放单位，只放 POI）
// 跑法：node Taierzhuang1938/Script_EditorBlockoutCli.mjs scene SecondLevel --force
//
// 数据来源（只读，不改城区代码）：
//   高度   Script_TengxianCity 的 GroundHeight / OuterHeight（东关地坪 y=0、地隙、东郊缓岭与排水沟），
//          借 prototype 调用（它们只依赖模块级数据，不碰 this 的别的东西），按 1 m 采样烘成 int16 厘米网格。
//   体块   Data_Tengxian.EAST_SUBURB：mapBlocks 的图框 / 行 / 网格按院落级切成体块（不做单间房），让开东西主路
//          （z=−65，|z+65|<4.2）、东关大街（x 444–454）、北横巷（z −116…−104）；寨墙 x=540 在寨门（宽 3+1.6）与
//          两处缺口（(540,−24) 宽 16、(540,52) 宽 12）处断开，寨门两个门垛；
//          Data_PropPcg.PROP_PCG_DOCUMENT 东寨门两翼投弹位（x 528）与缺口桩网（x 504）做矮掩体，院落给它们让出巷道。
//   EAST_DEFENSE 的缺口投弹位 / 交叉机枪位是城墙东缺口（x≈305）那一套，不在这片范围里，没用。
// 坐标一律以 Data_Tengxian 现状为准（旧设计文档里寨墙 x=520 的说法不用）。
// ===========================================================================

import { BLOCKOUT_SCHEMA, BLOCKOUT_SCENE_SCHEMA, YawDegFromTo } from "./Script_EditorBlockoutConfig.mjs";
import { EAST_SUBURB } from "./Data_Tengxian.mjs";
import { PROP_PCG_DOCUMENT } from "./Data_PropPcg.mjs";

export const SECOND_LEVEL_BOUNDS = Object.freeze({ minX: 400, maxX: 640, minZ: -250, maxZ: 60 });
export const SECOND_LEVEL_CELL_M = 1;
export const SECOND_LEVEL_GENERATOR = "Script_EditorBlockoutCli.mjs scene SecondLevel";

const R2 = (v) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------------------
// 地面

let GROUND = null;
/** 城区地面函数（node 里借 TengxianCity.prototype 调；Script_TengxianCity 会连带 import three，只在 node 里用）。 */
export async function SecondLevelGround() {
  if (GROUND) return GROUND;
  const { TengxianCity } = await import("./Script_TengxianCity.mjs");
  const proto = TengxianCity.prototype;
  const self = { OuterHeight: proto.OuterHeight };
  GROUND = (x, z) => proto.GroundHeight.call(self, x, z);
  return GROUND;
}

/** 按 §2.2 烘高度：(cols+1)×(rows+1) 个 int16 小端厘米，heights[iz*(cols+1)+ix]。 */
export function BakeHeightGrid(ground, bounds = SECOND_LEVEL_BOUNDS, cellM = SECOND_LEVEL_CELL_M) {
  const cols = Math.round((bounds.maxX - bounds.minX) / cellM);
  const rows = Math.round((bounds.maxZ - bounds.minZ) / cellM);
  const buffer = Buffer.alloc((cols + 1) * (rows + 1) * 2);
  let min = Infinity, max = -Infinity;
  for (let iz = 0; iz <= rows; iz++) {
    for (let ix = 0; ix <= cols; ix++) {
      const y = ground(bounds.minX + ix * cellM, bounds.minZ + iz * cellM);
      const cm = Math.max(-32768, Math.min(32767, Math.round(y * 100)));
      min = Math.min(min, cm); max = Math.max(max, cm);
      buffer.writeInt16LE(cm, (iz * (cols + 1) + ix) * 2);
    }
  }
  return {
    terrain: { kind: "heightmap", minX: bounds.minX, minZ: bounds.minZ, cellM, cols, rows, encoding: "int16-cm-base64", data: buffer.toString("base64") },
    minM: min / 100, maxM: max / 100,
  };
}

/** 解码（测试与抽样核对用）：网格节点 (ix,iz) 的高度（米）。 */
export function DecodeHeightAt(terrain, ix, iz) {
  const bytes = Buffer.from(terrain.data, "base64");
  return bytes.readInt16LE((iz * (terrain.cols + 1) + ix) * 2) / 100;
}

// ---------------------------------------------------------------------------
// 体块：院落级

const KIND_HEIGHT = Object.freeze({
  courtyard: 3.0, residential: 3.6, residentialRow: 3.4, shop: 4.2, storage: 4.4, battalion: 4.8, districtOffice: 5.2,
});
const COURTYARD_MAX_M = 16;   // 院落级体块的最大边长：大框切成这么大的院子
const LANE_M = 2;             // 切开的院子之间留的巷宽
const CELL_INSET_M = 0.6;     // 网格单元每边内缩（图框里 1 m 的缝 + 两边各 0.6 = 2.2 m 巷）
const MIN_SIDE_M = 3;         // 比这窄的碎条不要

const Rect = (minX, maxX, minZ, maxZ, extra = {}) => ({ minX, maxX, minZ, maxZ, ...extra });
const RectOf = (c) => Rect(c.x - c.w / 2, c.x + c.w / 2, c.z - c.d / 2, c.z + c.d / 2);
const Overlaps = (a, b) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;

/** 直角多边形（只有横竖边）按扫描线拆成矩形。 */
function RectilinearRects(polygon) {
  const zs = [...new Set(polygon.map((p) => p.z))].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < zs.length; i++) {
    const zm = (zs[i] + zs[i + 1]) / 2;
    const xs = [];
    for (let j = 0; j < polygon.length; j++) {
      const a = polygon[j], b = polygon[(j + 1) % polygon.length];
      if (a.x !== b.x) continue;
      const lo = Math.min(a.z, b.z), hi = Math.max(a.z, b.z);
      if (zm > lo && zm < hi) xs.push(a.x);
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) out.push(Rect(xs[k], xs[k + 1], zs[i], zs[i + 1]));
  }
  // 竖向相邻、x 区间相同的带并起来。
  const merged = [];
  for (const r of out) {
    const prev = merged.find((m) => m.minX === r.minX && m.maxX === r.maxX && Math.abs(m.maxZ - r.minZ) < 1e-9);
    if (prev) prev.maxZ = r.maxZ; else merged.push({ ...r });
  }
  return merged;
}

/** 图框 → 院落源矩形（带 kind）。 */
function FrameRects(frame) {
  const out = [];
  if (frame.rows?.length) {
    for (const row of frame.rows) {
      if (Number.isFinite(row.w)) { out.push({ ...RectOf(row), kind: row.kind || frame.kind, source: row.id }); continue; }
      const cellW = (row.span - (row.count - 1) * row.gap) / row.count;
      const x0 = frame.x - row.span / 2, z = frame.z + row.offset;
      for (let i = 0; i < row.count; i++) {
        const minX = x0 + i * (cellW + row.gap);
        out.push({ ...Rect(minX, minX + cellW, z - row.depth / 2, z + row.depth / 2), kind: row.kind || frame.kind, source: `${row.id}${i}` });
      }
    }
    return out;
  }
  if (frame.grid) {
    const g = frame.grid, r = RectOf(frame);
    const cellW = (frame.w - (g.cols - 1) * g.gapX) / g.cols, cellD = (frame.d - (g.rows - 1) * g.gapZ) / g.rows;
    for (let iz = 0; iz < g.rows; iz++) for (let ix = 0; ix < g.cols; ix++) {
      const minX = r.minX + ix * (cellW + g.gapX), minZ = r.minZ + iz * (cellD + g.gapZ);
      const kind = g.kindCycle ? g.kindCycle[(ix + iz * g.cols) % g.kindCycle.length] : frame.kind;
      out.push({ ...Rect(minX + CELL_INSET_M, minX + cellW - CELL_INSET_M, minZ + CELL_INSET_M, minZ + cellD - CELL_INSET_M), kind, source: `${frame.id}_${ix}_${iz}` });
    }
    return out;
  }
  if (frame.polygon?.length) {
    for (const [i, r] of RectilinearRects(frame.polygon).entries()) out.push({ ...r, kind: frame.kind, source: `${frame.id}_${i}` });
    return out;
  }
  out.push({ ...RectOf(frame), kind: frame.kind, source: frame.id });
  return out;
}

/** 从 a 里挖掉 hole，返回剩下的（最多 4 块）。 */
function Subtract(a, hole) {
  if (!Overlaps(a, hole)) return [a];
  const out = [];
  const keep = { ...a };
  if (hole.minZ > keep.minZ) out.push({ ...keep, maxZ: hole.minZ });
  if (hole.maxZ < keep.maxZ) out.push({ ...keep, minZ: hole.maxZ });
  const midMinZ = Math.max(keep.minZ, hole.minZ), midMaxZ = Math.min(keep.maxZ, hole.maxZ);
  if (hole.minX > keep.minX) out.push({ ...keep, minZ: midMinZ, maxZ: midMaxZ, maxX: hole.minX });
  if (hole.maxX < keep.maxX) out.push({ ...keep, minZ: midMinZ, maxZ: midMaxZ, minX: hole.maxX });
  return out;
}

/** 大矩形切成院落（≤ COURTYARD_MAX_M，中间留 LANE_M 巷）。 */
function SplitCourtyards(r) {
  const w = r.maxX - r.minX, d = r.maxZ - r.minZ;
  const nx = Math.max(1, Math.ceil((w + LANE_M) / (COURTYARD_MAX_M + LANE_M)));
  const nz = Math.max(1, Math.ceil((d + LANE_M) / (COURTYARD_MAX_M + LANE_M)));
  const cw = (w - (nx - 1) * LANE_M) / nx, cd = (d - (nz - 1) * LANE_M) / nz;
  const out = [];
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const minX = r.minX + ix * (cw + LANE_M), minZ = r.minZ + iz * (cd + LANE_M);
    out.push({ ...r, minX, maxX: minX + cw, minZ, maxZ: minZ + cd, part: nx * nz > 1 ? `${ix}${iz}` : "" });
  }
  return out;
}

/** 要留空的带：东西主路、东关大街、北横巷、寨墙一线、投弹位与桩网两侧的巷。 */
function KeepClear() {
  const road = EAST_SUBURB.roadZ, clear = [];
  clear.push(Rect(-1e4, 1e4, road - 4.2, road + 4.2));                         // 主路 |z+65| < 4.2（Data_Dressing_EastSuburb 规则）
  for (const lane of EAST_SUBURB.mapLanes) clear.push(RectOf(lane));           // 东关大街 / 南北两条横巷
  const zw = EAST_SUBURB.zhaiWall;
  clear.push(Rect(zw.x - 1.2, 1e4, -1e4, 1e4));                                // 寨墙内侧留 1.2 m 墙根
  for (const line of DefenseLines()) {
    const xs = line.points.map((p) => p[0]), zs = line.points.map((p) => p[1]);
    clear.push(Rect(Math.min(...xs) - 2.2, Math.max(...xs) + 2.2, Math.min(...zs) - 2, Math.max(...zs) + 2));
  }
  return clear;
}

function DefenseLines() {
  const ids = new Set(["FiringZhaiNorth", "FiringZhaiSouth", "WireEastBreachNorth", "WireEastBreachSouth"]);
  return PROP_PCG_DOCUMENT.volumes.filter((v) => ids.has(v.id));
}

/** 院落级体块。 */
export function SecondLevelCourtyardBlocks(bounds = SECOND_LEVEL_BOUNDS) {
  const area = Rect(bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ);
  const clear = KeepClear();
  const blocks = [];
  for (const frame of EAST_SUBURB.mapBlocks) {
    const frameRect = RectOf(frame);
    if (!Overlaps(frameRect, area)) continue;
    for (const source of FrameRects(frame)) {
      let parts = [source];
      for (const hole of clear) parts = parts.flatMap((p) => Subtract(p, hole));
      parts = parts.map((p) => ({ ...p, minX: Math.max(p.minX, area.minX), maxX: Math.min(p.maxX, area.maxX),
        minZ: Math.max(p.minZ, area.minZ), maxZ: Math.min(p.maxZ, area.maxZ) }))
        .filter((p) => p.maxX - p.minX >= MIN_SIDE_M && p.maxZ - p.minZ >= MIN_SIDE_M);
      for (const [pi, part] of parts.entries()) {
        for (const yard of SplitCourtyards(part)) {
          if (yard.maxX - yard.minX < MIN_SIDE_M || yard.maxZ - yard.minZ < MIN_SIDE_M) continue;
          const id = `${source.source}${parts.length > 1 ? `_p${pi}` : ""}${yard.part ? `_${yard.part}` : ""}`;
          blocks.push({
            id, x: R2((yard.minX + yard.maxX) / 2), z: R2((yard.minZ + yard.maxZ) / 2),
            w: R2(yard.maxX - yard.minX), d: R2(yard.maxZ - yard.minZ), h: KIND_HEIGHT[source.kind] ?? 3.6, ry: 0,
            semantic: "structure", solid: true,
          });
        }
      }
    }
  }
  return blocks;
}

/** 寨墙（门洞与两处缺口断开）+ 寨门门垛。 */
export function SecondLevelZhaiWallBlocks(bounds = SECOND_LEVEL_BOUNDS) {
  const zw = EAST_SUBURB.zhaiWall, gate = EAST_SUBURB.zhaiGate;
  // Script_TengxianCity：墙样条从 −half 到 +half（half = (toZ − fromZ)/2），门洞宽 gate.width + 1.6，缺口 (540,−24) 宽 16、(540,52) 宽 12。
  const half = (zw.toZ - zw.fromZ) / 2;
  const gaps = [
    { z: gate.z, w: gate.width + 1.6 },
    { z: -24, w: 16 },
    { z: 52, w: 12 },
  ].sort((a, b) => a.z - b.z);
  const spans = [];
  let from = -half;
  for (const g of gaps) { spans.push([from, g.z - g.w / 2]); from = g.z + g.w / 2; }
  spans.push([from, half]);
  const blocks = [];
  let n = 0;
  for (const [z0raw, z1raw] of spans) {
    const z0 = Math.max(z0raw, bounds.minZ), z1 = Math.min(z1raw, bounds.maxZ);
    if (z1 - z0 < 0.5) continue;
    n += 1;
    blocks.push({ id: `ZhaiWall_${String(n).padStart(2, "0")}`, x: zw.x, z: R2((z0 + z1) / 2), w: zw.baseWidth, d: R2(z1 - z0), h: zw.height, ry: 0,
      semantic: "structure", solid: true, cover: { faceX: 1, faceZ: 0 } });
  }
  for (const s of [-1, 1]) {
    blocks.push({ id: s < 0 ? "ZhaiGatePierNorth" : "ZhaiGatePierSouth", x: gate.x, z: R2(gate.z + s * (gate.width / 2 + 0.7)),
      w: 1.4, d: 1.0, h: gate.height, ry: 0, semantic: "structure", solid: true });
  }
  return blocks;
}

/** 东寨门两翼投弹位（沙袋矮墙，朝东）与缺口两翼桩网。 */
export function SecondLevelCoverBlocks() {
  return DefenseLines().map((line) => {
    const [[x0, z0], [x1, z1]] = line.points;
    const wire = line.profile === "defenseWireLine";
    const len = Math.hypot(x1 - x0, z1 - z0);
    return {
      id: line.id, x: R2((x0 + x1) / 2), z: R2((z0 + z1) / 2), w: wire ? 0.6 : 0.8, d: R2(len), h: wire ? 0.9 : 1.1,
      ry: R2(Math.atan2(x1 - x0, z1 - z0)), semantic: "cover", solid: true, cover: { faceX: 1, faceZ: 0 },
    };
  });
}

// ---------------------------------------------------------------------------
// 场景与配置

const POIS = Object.freeze([
  { id: "zhaiGate", name: "东寨门", kind: "landmark", x: 540, z: -65, radiusM: 2.5 },
  { id: "breachNorth", name: "寨墙北缺口", kind: "poi", x: 540, z: -24, radiusM: 8 },
  { id: "breachSouth", name: "寨墙南缺口", kind: "poi", x: 540, z: 52, radiusM: 6 },
  { id: "gully", name: "地隙", kind: "danger", x: EAST_SUBURB.gully.x, z: -40, radiusM: 4 },
  { id: "eastGuangStreet", name: "东关大街", kind: "landmark", x: 449, z: -65, radiusM: 5 },
]);

const SPACES = Object.freeze([
  { id: "01-1", stage: 1, stageTitle: "后街第二街垒", name: "主路街垒后", player: { x: 468, z: -65, yawDeg: -90, pitchDeg: 0, stance: "stand" } },
  { id: "02-1", stage: 2, stageTitle: "主巷与北侧院子", name: "主巷看北侧院子", player: { x: 500, z: -66.5, yawDeg: Math.round(YawDegFromTo({ x: 500, z: -66.5 }, { x: 519, z: -82 }) * 10) / 10, pitchDeg: 0, stance: "stand" } },
  { id: "03-1", stage: 3, stageTitle: "寨墙投掷线", name: "南翼投弹位", player: { x: 526.8, z: -45, yawDeg: -90, pitchDeg: 0, stance: "crouch" } },
  { id: "04-1", stage: 4, stageTitle: "外壕与地隙", name: "寨墙外看地隙", player: { x: 545.5, z: -24, yawDeg: -90, pitchDeg: -8, stance: "stand" } },
]);

/** 第二关占位配置（§9：4 个关键帧，不放单位，只放 POI；next 留空）。 */
export function BuildSecondLevelConfig({ commit = "", generatedAt = "" } = {}) {
  return {
    schema: BLOCKOUT_SCHEMA,
    level: "SecondLevel",
    title: "第二关 · 手榴弹雨（空间草稿）",
    source: { generator: SECOND_LEVEL_GENERATOR, gameVersion: "draft-2026-10-12-topology", commit, generatedAt },
    zones: [{ id: "A", name: "东关寨墙一线", stages: [1, 4], box: { ...SECOND_LEVEL_BOUNDS } }],
    keyframes: SPACES.map((space, i) => ({
      id: space.id,
      stage: space.stage,
      stageTitle: space.stageTitle,
      name: space.name,
      player: { ...space.player },
      what: "第二关流程未定稿，这里只是空间占位",
      next: null,
      how: [],
      notes: i === 0 ? "四片空间取自 10-12 拓扑草稿（未定稿）；坐标以 Data_Tengxian 现状为准：寨墙 x=540、东寨门 (540,−65)、地隙 x≈548–562。" : "",
      signals: [],
      units: [],
      pois: POIS.map((p) => ({ ...p })),
    })),
  };
}

/** 生成 { scene, config }。 */
export async function BuildSecondLevelBlockout({ commit = "", generatedAt = "" } = {}) {
  const ground = await SecondLevelGround();
  const { terrain, minM, maxM } = BakeHeightGrid(ground);
  const blocks = [...SecondLevelZhaiWallBlocks(), ...SecondLevelCoverBlocks(), ...SecondLevelCourtyardBlocks()];
  const first = SPACES[0].player;
  const scene = {
    schema: BLOCKOUT_SCENE_SCHEMA,
    level: "SecondLevel",
    source: {
      generator: SECOND_LEVEL_GENERATOR,
      generatedAt,
      commit,
      notes: `东关寨墙一线草稿：高度取 TengxianCity.GroundHeight 按 ${SECOND_LEVEL_CELL_M} m 采样（${minM}…${maxM} m）；`
        + "体块 = EAST_SUBURB 院落级体块 + 寨墙（门洞、两处缺口断开）+ 东寨门两翼投弹位与缺口桩网矮掩体。",
    },
    bounds: { ...SECOND_LEVEL_BOUNDS },
    spawn: { x: first.x, z: first.z, yawDeg: first.yawDeg },
    terrain,
    blocks,
    ways: {
      roads: [
        [{ x: SECOND_LEVEL_BOUNDS.minX, z: EAST_SUBURB.roadZ }, { x: SECOND_LEVEL_BOUNDS.maxX, z: EAST_SUBURB.roadZ }],
        [{ x: 449, z: SECOND_LEVEL_BOUNDS.minZ }, { x: 449, z: SECOND_LEVEL_BOUNDS.maxZ }],
        [{ x: SECOND_LEVEL_BOUNDS.minX, z: -110 }, { x: EAST_SUBURB.zhaiWall.x, z: -110 }],
      ],
      trenches: [[{ x: EAST_SUBURB.gully.x, z: EAST_SUBURB.gully.fromZ }, { x: EAST_SUBURB.gully.x, z: SECOND_LEVEL_BOUNDS.maxZ }]],
    },
  };
  return { scene, config: BuildSecondLevelConfig({ commit, generatedAt }) };
}

/** 地面抽样，对照 r2 调查记下的值（z=0：x540 −0.21 · 548 −1.55 · 552 −3.40 · 555 −4.05 · 560 −2.67 · 564 −1.36；z=−65：≤530 为 0、540 −0.20、550 −2.49、560 −2.60、570 −1.28）。 */
export async function SampleSecondLevelGroundChecks() {
  const ground = await SecondLevelGround();
  const rows = [];
  for (const [z, xs] of [[0, [540, 548, 552, 555, 560, 564]], [-65, [520, 530, 540, 550, 560, 570]]]) {
    rows.push(`z=${z}: ${xs.map((x) => `x${x} ${ground(x, z).toFixed(2)}`).join(" · ")}`);
  }
  return rows;
}
