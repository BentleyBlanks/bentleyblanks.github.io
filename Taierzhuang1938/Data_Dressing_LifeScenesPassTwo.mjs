// 全场景生活细节第二轮：给首轮每一组叙事锚补上能读出用途的第三件家什。
//
// 首轮已经把井台、柴垛、磨盘、长凳等锚点登记为稳定世界坐标；本层不另撒随机点，
// 而是在每组锚点构成的小范围内补工具、容器、家具或晾晒件。坐标只由同组锚点和固定
// 偏移推导，结果确定、跨章节不搬家。本文件是纯数据装配，不许 import three。

import { LIFE_SCENE_DRESSING } from "./Data_Dressing_LifeScenes.mjs";
import { PLACEMENTS as NE } from "./Data_Dressing_NortheastQuarter.mjs";
import { PLACEMENTS as SE } from "./Data_Dressing_SoutheastQuarter.mjs";
import { PLACEMENTS as NW } from "./Data_Dressing_NorthwestQuarter.mjs";
import { PLACEMENTS as SW } from "./Data_Dressing_SouthwestQuarter.mjs";
import { PLACEMENTS as MS } from "./Data_Dressing_MainStreets.mjs";
import { PLACEMENTS as DF } from "./Data_Dressing_Defenses.mjs";
import { PLACEMENTS as ES } from "./Data_Dressing_EastSuburb.mjs";
import { PLACEMENTS as WS } from "./Data_Dressing_WestSuburb.mjs";
import { PLACEMENTS as JV } from "./Data_Dressing_JieheVillages.mjs";

const EMPTY = Object.freeze([]);
const RURAL_REGIONS = new Set(["EastSuburb", "WestSuburb", "JieheVillages"]);
const BASE_PLACEMENTS = Object.freeze({
  NortheastQuarter: NE,
  SoutheastQuarter: SE,
  NorthwestQuarter: NW,
  SouthwestQuarter: SW,
  MainStreets: MS,
  Defenses: DF,
  EastSuburb: ES,
  WestSuburb: WS,
  JieheVillages: JV,
});

// 少数首轮锚贴着院墙或街肩。通用三角补位会把第三件的包围盒推出可用带，
// 这些点逐个收回院内/街肩；仍是确定的世界坐标，不是运行时修正。
const SITE_OVERRIDES = Object.freeze({
  "NortheastQuarter|城东北片生活场景 01 · 劈柴与修补":
    { x: 177.0, z: -140.65 },
  "NortheastQuarter|城东北片生活场景 04 · 收拾到一半":
    { x: 262.85, z: -10.55 },
  "NortheastQuarter|城东北片生活场景 06 · 晒粮与收纳":
    { x: 122.65, z: -37.55 },
  "NortheastQuarter|城东北片生活场景 12 · 收拾到一半":
    { x: 182.05, z: -5.65 },
  "NortheastQuarter|城东北片生活场景 13 · 晒粮与收纳":
    { x: 64.0, z: -9.95 },
  "NorthwestQuarter|城西北片生活场景 01 · 晒粮与收纳":
    { x: -128.2, z: -156.35 },
  "NorthwestQuarter|城西北片生活场景 02 · 晒粮与收纳":
    { x: -275.85, z: -10.85 },
  "NorthwestQuarter|城西北片生活场景 04 · 晒粮与收纳":
    { x: -259.65, z: -153.05 },
  "NorthwestQuarter|城西北片生活场景 05 · 井台与洗濯":
    { x: -145.2, z: -16.1 },
  "NorthwestQuarter|城西北片生活场景 07 · 晒粮与收纳":
    { x: -204.7, z: -87.55 },
  "NorthwestQuarter|城西北片生活场景 10 · 井台与洗濯":
    { x: -279.65, z: -89.8 },
  "NorthwestQuarter|城西北片生活场景 13 · 劈柴与修补":
    { x: -72.25, z: -17.45 },
  "NorthwestQuarter|城西北片生活场景 15 · 晒粮与收纳":
    { x: -159.7, z: -128.55 },
  "SouthwestQuarter|城西南片生活场景 04 · 收拾到一半":
    { x: -132.65, z: 18.55 },
  "SoutheastQuarter|城东南片生活场景 06 · 晒粮与收纳":
    { x: 161.15, z: 46.05 },
  "SoutheastQuarter|城东南片生活场景 11 · 晒粮与收纳":
    { x: 183.35, z: 95.8 },
  "MainStreets|主次街商业带生活场景 01 · 收拾到一半":
    { asset: "phClayJarLidded", x: 25.8, z: -6.55, scale: 0.72 },
  "MainStreets|主次街商业带生活场景 03 · 收拾到一半":
    { asset: "phClayJarLidded", x: -106.25, z: 208.05, scale: 0.72 },
  "MainStreets|主次街商业带生活场景 09 · 收拾到一半":
    { asset: "phClayJarLidded", x: 136.85, z: -68.7, scale: 0.72 },
  "EastSuburb|东关生活场景 04 · 收拾到一半":
    { x: 357.35, z: -182.55 },
  "EastSuburb|东关生活场景 08 · 劈柴与修补":
    { x: 577.0, z: -208.75 },
  "WestSuburb|西关带生活场景 02 · 收拾到一半":
    { x: -432.9, z: 149.45 },
});

const ASSETS_BY_KIND = Object.freeze({
  repairUrban: Object.freeze([
    "ryFarmHoe", "phFirewoodBranches", "ryChoppingBlock", "phIronSpade",
    "ryTimberStack", "phWoodAxe", "phSmithHammer",
  ]),
  repairRural: Object.freeze([
    "ryFarmHoe", "ryChoppingBlock", "phFirewoodBranches", "ryTimberStack",
    "ryIronSpade", "phWoodAxe", "phSmithHammer",
  ]),
  harvestUrban: Object.freeze([
    "phClayJarLidded", "phWickerTray", "phWickerBasketLidded", "ryCeramicVat",
    "wovenBasket", "marketRiceSack01",
  ]),
  harvestRural: Object.freeze([
    "ryDryingRack", "ryHayStack", "ryFeedTrough", "phClayJarLidded",
    "phWickerTray", "phWickerBasketLidded",
  ]),
  storageUrban: Object.freeze([
    "phClayJarLidded", "marketCrate04", "ryCeramicVat", "marketRiceSack01",
    "phRoughWoodTable", "marketBox03",
  ]),
  storageRural: Object.freeze([
    "phClayJarLidded", "ryCartWheel", "ryCeramicVat", "ryFeedTrough",
    "marketCrate04", "phRoughWoodTable",
  ]),
  washing: Object.freeze([
    "phWoodenBucket", "ryWaterBucket", "phClayJarLidded", "clayWaterVat",
    "phWoodenWashTub", "ryCeramicVat",
  ]),
  rest: Object.freeze([
    "phWoodLantern", "phChineseWoodStool", "phRoughWoodTable", "clothLantern",
    "ryYardBench", "woodPlatformBench",
  ]),
  tavern: Object.freeze([
    "phClayJarLidded", "clayWideJar", "wineJarCluster", "phRoughWoodTable",
  ]),
  defense: Object.freeze([
    "phWoodenBucket", "phLowWoodStool", "phWoodLantern",
    "battlefieldCanvasCover02", "battlefieldOpenBin", "battlefieldSupplyBox",
  ]),
});

function SceneKey(note) {
  return String(note || "").replace(/：.*$/, "");
}

function SceneKind(note, rural) {
  if (note.includes("守城歇兵")) return "defense";
  if (note.includes("酒栈门口")) return "tavern";
  if (note.includes("井台与洗濯")) return "washing";
  if (note.includes("歇脚与夜用")) return "rest";
  if (note.includes("劈柴与修补")) return rural ? "repairRural" : "repairUrban";
  if (note.includes("晒粮与收纳")) return rural ? "harvestRural" : "harvestUrban";
  return rural ? "storageRural" : "storageUrban";
}

function Round(value) {
  return Math.round(value * 100) / 100;
}

function WrappedAngle(value) {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return Round(angle);
}

function CandidateSites(items) {
  const center = items.reduce((sum, item) => ({ x: sum.x + item.x, z: sum.z + item.z }),
    { x: 0, z: 0 });
  center.x /= items.length;
  center.z /= items.length;
  let heading = Number(items[0]?.ry || 0);
  if (items.length > 1) {
    const dx = items[1].x - items[0].x;
    const dz = items[1].z - items[0].z;
    if (Math.hypot(dx, dz) > 0.2) heading = Math.atan2(dz, dx);
  }
  const along = { x: Math.cos(heading), z: Math.sin(heading) };
  const across = { x: -along.z, z: along.x };
  return [
    { x: center.x + across.x * 0.96, z: center.z + across.z * 0.96 },
    { x: center.x - across.x * 0.96, z: center.z - across.z * 0.96 },
    { x: center.x + along.x * 1.08, z: center.z + along.z * 1.08 },
    { x: center.x - along.x * 1.08, z: center.z - along.z * 1.08 },
    { x: center.x + across.x * 1.32, z: center.z + across.z * 1.32 },
    { x: center.x - across.x * 1.32, z: center.z - across.z * 1.32 },
  ];
}

function BuildRegion(regionId, placements) {
  const groups = new Map();
  for (const placement of placements) {
    const key = SceneKey(placement.note);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(placement);
  }

  const occupied = [...(BASE_PLACEMENTS[regionId] || EMPTY), ...placements]
    .map((placement) => ({ x: placement.x, z: placement.z }));
  const rural = RURAL_REGIONS.has(regionId);
  const additions = [];
  let sceneIndex = 0;
  for (const [scene, items] of groups) {
    const kind = SceneKind(items[0]?.note || "", rural);
    const assets = ASSETS_BY_KIND[kind];
    const sites = CandidateSites(items);
    const site = sites.find((candidate) => occupied.every((other) =>
      Math.hypot(candidate.x - other.x, candidate.z - other.z) >= 0.68)) || sites.at(-1);
    const override = SITE_OVERRIDES[`${regionId}|${scene}`] || {};
    const item = Object.freeze({
      asset: override.asset || assets[sceneIndex % assets.length],
      x: Round(override.x ?? site.x), z: Round(override.z ?? site.z),
      ry: WrappedAngle(Number(items[0]?.ry || 0) + ((sceneIndex % 3) - 1) * 0.31),
      scale: override.scale || 1,
      note: `${scene}：第二轮补齐关键工具与家什`,
    });
    additions.push(item);
    occupied.push(item);
    sceneIndex += 1;
  }
  return Object.freeze(additions);
}

export const LIFE_SCENE_DRESSING_PASS_TWO = Object.freeze(Object.fromEntries(
  Object.entries(LIFE_SCENE_DRESSING).map(([regionId, placements]) =>
    [regionId, BuildRegion(regionId, placements)]),
));

export function LifeScenesPassTwoFor(regionId) {
  return LIFE_SCENE_DRESSING_PASS_TWO[regionId] || EMPTY;
}
