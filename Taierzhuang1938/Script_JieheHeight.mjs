// 「序 · 界河」最终地面采样器 —— 纯算术，不 import three。
//
// 高度合成顺序：台儿庄真实 SRTM DEM → 战术土岗/排水沟 → 界河下切河槽。
// 浏览器地形、物理射线、布设生成器与 Script_HeightmapCli 全部调用这一份；
// 禁止在渲染模块里再抄一套高度公式。

import { CITY } from "./Data_Tengxian.mjs";
import { Clamp, SmoothStep } from "./Script_Noise.mjs";
import {
  TAIZHUANG_HEIGHTMAP, SampleTaierzhuangDem,
} from "./Heightmap/Data_TaierzhuangHeightmap.mjs";

export const JIEHE_GROUND = Object.freeze({
  plainY: CITY.outerY,
  minX: TAIZHUANG_HEIGHTMAP.worldBounds.minX,
  maxX: TAIZHUANG_HEIGHTMAP.worldBounds.maxX,
  minZ: TAIZHUANG_HEIGHTMAP.worldBounds.minZ,
  maxZ: TAIZHUANG_HEIGHTMAP.worldBounds.maxZ,
  demReferenceMeters: TAIZHUANG_HEIGHTMAP.reference.elevationMeters,
  demScale: 1.0,                         // SRTM 米制高差 1:1，不纵向夸张
  cellRiver: 3.2,
  cellCore: 4.5,
  cellOuter: 7.0,
  riverBand: [-1585, -1475],
  coreBand: [-1700, -880],
  coreX: 780,
  core: [-1780, -620],
  growth: 1.4,
  maxCell: 110,
  chunk: 44,
  tile: 3.4,
});

/** 界河几何与地表共用的唯一河道表。 */
export const JIEHE_RIVER = Object.freeze({
  centerZ: -1528,
  bedHalf: 19,
  waterHalf: 6.0,
  meander: 9,
  fromX: -960,
  toX: 960,
  channel: Object.freeze({ cut: 1.9, run: 7 }),
  north: Object.freeze({
    offset: -33,
    height: 1.6,
    baseHalf: 2.9,
    topHalf: 1.05,
    gaps: Object.freeze([[-720, -676], [-430, -392], [-178, -126], [150, 188], [452, 496], [734, 778]]),
  }),
  south: Object.freeze({
    offset: 31,
    height: 2.2,
    baseHalf: 3.6,
    topHalf: 1.35,
    gaps: Object.freeze([[-560, -524], [-178, -126], [96, 134], [520, 562]]),
  }),
});

export const JIEHE_TACTICAL_TERRAIN = Object.freeze({
  ridges: Object.freeze([
    { id: "CentralApproachRise", from: [-168, -1398], to: [112, -1358], width: 42, height: 2.60 },
    { id: "WestForwardRise", from: [-430, -1430], to: [-105, -1378], width: 34, height: 2.15 },
    { id: "EastForwardRise", from: [92, -1368], to: [430, -1318], width: 38, height: 2.35 },
    { id: "WestRearRise", from: [-465, -1218], to: [-118, -1160], width: 42, height: 1.85 },
    { id: "EastRearRise", from: [105, -1128], to: [455, -1078], width: 46, height: 1.65 },
  ]),
  lanes: Object.freeze([
    { id: "FrontIrrigationCut", from: [-310, -1444], to: [305, -1423], inner: 4.5, outer: 13.0, depth: 1.35 },
    { id: "WestDrain", from: [-255, -1438], to: [-82, -1284], inner: 4.8, outer: 13.5, depth: 1.45 },
    { id: "EastDrain", from: [238, -1362], to: [66, -1198], inner: 5.2, outer: 14.5, depth: 1.30 },
    { id: "SouthCartHollow", from: [-330, -1094], to: [-42, -1018], inner: 6.0, outer: 17.0, depth: 1.20 },
  ]),
});

function DistanceToSegment(x, z, from, to) {
  const dx = to[0] - from[0], dz = to[1] - from[1];
  const len2 = dx * dx + dz * dz || 1;
  const t = Clamp(((x - from[0]) * dx + (z - from[1]) * dz) / len2, 0, 1);
  return Math.hypot(x - (from[0] + dx * t), z - (from[1] + dz * t));
}

export function JieheRiverCenterZ(x, river = JIEHE_RIVER) {
  if (!river) return 0;
  return river.centerZ
    + Math.sin(x * 0.0042 + 1.7) * river.meander
    + Math.sin(x * 0.0131 + 0.4) * river.meander * 0.35;
}

/** 只含真实 DEM 的场景相对高度；给 CLI 的 --mode=base 和诊断工具用。 */
export function SampleJieheBaseHeight(x, z) {
  const demMeters = SampleTaierzhuangDem(x, z);
  return JIEHE_GROUND.plainY
    + (demMeters - JIEHE_GROUND.demReferenceMeters) * JIEHE_GROUND.demScale;
}

/** 最终可站地面：所有视觉布设、碰撞体、角色与弹道必须走这里。 */
export function SampleJieheHeight(x, z) {
  let y = SampleJieheBaseHeight(x, z);
  for (const ridge of JIEHE_TACTICAL_TERRAIN.ridges) {
    const d = DistanceToSegment(x, z, ridge.from, ridge.to);
    y += ridge.height * SmoothStep(ridge.width, 0, d);
  }
  for (const lane of JIEHE_TACTICAL_TERRAIN.lanes) {
    const d = DistanceToSegment(x, z, lane.from, lane.to);
    y -= lane.depth * SmoothStep(lane.outer, lane.inner, d);
  }
  const river = JIEHE_RIVER;
  const channel = river.channel;
  const distance = Math.abs(z - JieheRiverCenterZ(x, river));
  const edge = river.bedHalf + channel.run;
  if (distance < edge) y -= channel.cut * SmoothStep(edge, river.bedHalf, distance);
  return y;
}

export function JieheHeightInfo(x, z) {
  return {
    x,
    z,
    demElevationMeters: SampleTaierzhuangDem(x, z),
    baseY: SampleJieheBaseHeight(x, z),
    finalY: SampleJieheHeight(x, z),
  };
}
