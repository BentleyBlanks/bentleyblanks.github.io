// 一次性转换（docs/Data_Scene.md §8，2026-11-01）：白盒场景 FirstLevelWhitebox → 正式场景 FirstLevel。
//
// 用户 2026-11-01：场景编辑器里两个场景——白盒版第一关（编辑、预演）与正式场景（试玩，之后不断打磨细节）；
// 正式场景「用现在第一关（已经上线在章节里可选的）的场景设计标准，把已经有的资产、布设给做进去」。
// 做法：布局（位置、尺寸、碰撞、信号、地标、地形、涂色）原样复制——试玩编排与关键帧的坐标都在这套布局上；
// 样子换成现行第一关的口径：
//   · 体块 Whitebox/Box + Whitebox/<语义> → Block/Box + Look/<外观>，外观按现行第一关的规则挑
//     （Data_FirstLevelWhiteboxMaterials.ResolveWhiteboxLook：先按 id 形状的特例，再按语义的缺省比例）；
//   · 道具盒（meta.prop）有现成外部模型的 → Prop/<模型>（PROP_TO_ASSET），盒子尺寸照旧当碰撞、模型按盒子缩放；
//   · 树（细高的植物块、meta.prop Tree / Cypress）→ Tree/Dead、Tree/Cypress；
//   · 水 → Look/water（水面同现行第一关），隐形墙 → Look/airWall；其余没有外观的按 SPECIAL_LOOKS。
// 地表（分层 PBR 土）不写进物件：涂色与沟的折线照抄，建场时按 Data_SceneGroundLayers 归层。
//
// 转完以后正式场景就是它自己的唯一真相（单独打磨，不再跟白盒同步）；这个脚本留着从 git 历史重放或对照用。
// 用法（从 worktree 根）：node Taierzhuang1938/Script_SceneForkFormal.mjs [--check]   --check 只报统计不写文件
// 这是转换脚本不是门禁，不进 TestRunner；正式场景的门禁是 Script_SceneFormalTest。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCENE_ASSETS, SCENE_MATERIALS } from "./Data_SceneAssets.mjs";
import { ResolveWhiteboxLook } from "./Data_FirstLevelWhiteboxMaterials.mjs";
import { FormatSceneJson, ValidateScene, SceneDir, SceneFileName } from "./Script_SceneDoc.mjs";
import { BLOCKOUT_TREE_MAX_FOOT_M } from "./Script_EditorBlockoutLevels.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const FROM = "FirstLevelWhitebox";
const TO = "FirstLevel";

/** 道具种类（meta.prop）→ 资产。没列的道具留体块、按语义挑外观。 */
export const PROP_TO_ASSET = Object.freeze({
  AmmoCrate: "Prop/militaryCrateClosed",
  AmmoBox: "Prop/militaryCrateClosed",
  GrenadeBox: "Prop/battlefieldGrenadeStack",
  CrateStack: "Prop/marketCrate01",
  Chest: "Prop/marketBox02",
  WaterVat: "Prop/clayWaterVat",
  Millstone: "Prop/stoneMillWheel",
  Haystack: "Prop/ryHayStack",
  StrawStack: "Prop/ryHayStack",
  Straw: "Prop/strawSleepingMatFlat",
  Mat: "Prop/strawSleepingMatFlat",
  WoodPile: "Prop/ryFirewoodStack",
  SleeperPile: "Prop/ryTimberStack",
  Branches: "Prop/phFirewoodBranches",
  SandbagStack: "Prop/battlefieldSandbag01",
  Sandbag: "Prop/battlefieldSandbag02",
  Collapse: "Prop/cityWallBreachBrickCluster01",
  Desk: "Prop/phRoughWoodTable",
  Stool: "Prop/phChineseWoodStool",
  Lantern: "Prop/clothLantern",
  CartWheel: "Prop/ryCartWheel",
  Bundle: "Prop/marketRiceSack01",
  Bandage: "Prop/wardBandageRoll",
});

/** 一只长盒子里排几件（同现行第一关替换表的 tile）。 */
export const PROP_TILE = Object.freeze({
  CrateStack: Object.freeze([2, 1, 1]),
});

/** 体块里规则挑不到外观的（植物、危险标记……）→ 外观。键是 meta.prop 或语义。 */
export const SPECIAL_LOOKS = Object.freeze({
  DoorBoard: "doorLeaf",
  BloodStain: "bloodStain",
  Torch: "timber",
  Charge: "canvas",
  Canteen: "steel",
  danger: "wire",
  foliage: "thatch",
  water: null,
  airWall: null,
});

const IsTree = (obj, semantic) => semantic === "foliage" && (obj.meta?.prop === "Tree" || obj.meta?.prop === "Cypress" || !!obj.meta?.tree
  || (Math.max(obj.size[0], obj.size[2]) <= BLOCKOUT_TREE_MAX_FOOT_M && obj.size[1] >= 2));

/** 白盒的一个物件 → 正式场景的物件（布局字段一个不动，只换 asset / material / params）。 */
export function FormalObject(obj) {
  if (obj.layer === "backdrop" || obj.asset !== "Whitebox/Box") return { ...obj };
  const semantic = SCENE_MATERIALS[obj.material]?.semantic;
  const prop = obj.meta?.prop;
  const { material, ...rest } = obj;
  if (IsTree(obj, semantic)) return { ...rest, asset: prop === "Cypress" ? "Tree/Cypress" : "Tree/Dead" };
  // 井：只有井台（结构语义的那块）换井台模型，井架的柱子与横梁还是木料体块
  const propAsset = prop === "Well" ? (semantic === "structure" ? "Prop/stoneWellCurb" : null)
    : prop === "Rubble" ? (semantic === "plaster" ? (HashBit(obj.id) ? "Prop/cityWallBreachBrickCluster01" : "Prop/cityWallBreachBrickCluster02") : null)
    : PROP_TO_ASSET[prop] || null;
  if (propAsset) {
    const tile = PROP_TILE[prop];
    return { ...rest, asset: propAsset, ...(tile ? { params: { ...(obj.params || {}), tile: [...tile] } } : {}) };
  }
  if (semantic === "water") return { ...rest, asset: "Block/Box", material: "Look/water" };
  if (semantic === "airWall") return { ...rest, asset: "Block/Box", material: "Look/airWall" };
  // 苇丛长成植被（Look/reed 是植物语义）；鹿砦是砍倒的树枝堆，画成木料
  if (obj.meta?.reed) return { ...rest, asset: "Block/Box", material: "Look/reed" };
  if (obj.meta?.abatis) return { ...rest, asset: "Block/Box", material: "Look/timber" };
  const look = (prop && SPECIAL_LOOKS[prop]) || ResolveWhiteboxLook({ id: obj.id, semantic }) || SPECIAL_LOOKS[semantic];
  if (!look || !SCENE_MATERIALS[`Look/${look}`]) throw new Error(`${obj.id}（${obj.material}${prop ? ` / ${prop}` : ""}）挑不到登记过的外观：${look}`);
  return { ...rest, asset: "Block/Box", material: `Look/${look}` };
}

function HashBit(text) {
  let h = 2166136261;
  for (const c of String(text)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return (h >>> 7) & 1;
}

/** 整个场景：布局照抄，物件逐个换样子。 */
export function ForkFormalScene(whitebox, { now = new Date().toISOString() } = {}) {
  const look = { ...(whitebox.look || {}) };
  delete look.colorSemantics; // 正式场景没有「保留语义色」这回事：每块都有外观
  return {
    schema: whitebox.schema,
    id: TO,
    title: "第一关 · 正式（01–18 新剧本）",
    source: {
      forkedFrom: whitebox.id,
      forker: "Script_SceneForkFormal.mjs",
      forkedAt: now,
      notes: "2026-11-01 照白盒布局复制：体块换现行第一关的 PBR 外观（Look/*）、道具换外部模型（Prop/*）、树换 Tree/*；之后单独打磨，不再跟白盒同步",
    },
    bounds: { ...whitebox.bounds },
    spawn: { ...whitebox.spawn },
    terrain: { ...whitebox.terrain, file: `Scene_${TO}.height.bin` },
    look,
    ...(whitebox.backdrop ? { backdrop: whitebox.backdrop } : {}),
    ...(whitebox.paint ? { paint: whitebox.paint } : {}),
    ...(whitebox.ways ? { ways: whitebox.ways } : {}),
    ...(whitebox.markers ? { markers: whitebox.markers } : {}),
    objects: whitebox.objects.map(FormalObject),
  };
}

function Main() {
  const check = process.argv.includes("--check");
  const fromDir = path.join(ROOT, SceneDir(FROM)), toDir = path.join(ROOT, SceneDir(TO));
  const whitebox = JSON.parse(fs.readFileSync(path.join(fromDir, SceneFileName(FROM)), "utf8"));
  const formal = ForkFormalScene(whitebox);
  const result = ValidateScene(formal);
  if (!result.ok) throw new Error(`正式场景校验不过：${result.errors.slice(0, 5).join("；")}`);
  const count = {};
  for (const obj of formal.objects) {
    const key = obj.asset === "Block/Box" ? obj.material : obj.asset;
    count[key] = (count[key] || 0) + 1;
  }
  console.log(Object.entries(count).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join("\n"));
  for (const id of Object.keys(count)) if (!SCENE_ASSETS[id] && !SCENE_MATERIALS[id]) throw new Error(`没登记：${id}`);
  if (check) return;
  fs.mkdirSync(toDir, { recursive: true });
  fs.writeFileSync(path.join(toDir, SceneFileName(TO)), FormatSceneJson(formal));
  fs.copyFileSync(path.join(fromDir, whitebox.terrain.file), path.join(toDir, formal.terrain.file));
  console.log(`写了 ${SceneDir(TO)}/${SceneFileName(TO)}（${formal.objects.length} 个物件）与 ${formal.terrain.file}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) Main();
