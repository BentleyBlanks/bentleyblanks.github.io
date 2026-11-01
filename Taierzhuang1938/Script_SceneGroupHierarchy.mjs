// 一次性整理（docs/Data_Scene.md §2 group，2026-11-01）：给第一关两个场景的物件分层级。
//
// 用户 2026-11-01：场景编辑器左侧「物件列表怎么一点层级、分类都没有」。原来每个物件的 group 只有段落（01–05 / 06–10 /
// 11–18 / 远景），一组一千多个平铺。group 改成用「/」分隔的路径（Unity 的父子层级），这里按物件本身的信息归一次类：
//   段落 / 类别 / 院子或种类      例：06–10/建筑/WN1、01–05/道具/弹药箱、11–18/空气墙
// 类别：建筑（按院子归：House_WN1_1、Wall_WN1_N、Gate_WN1_Leaf 都进 WN1）、街巷墙、道具（按种类）、树木草丛、水、
// 铁路、工事、空气墙、其他；远景按村子 / 种类分。以后的物件在场景编辑器里改「分组」就行，不用再跑这个脚本。
//
// 用法（从 worktree 根）：node Taierzhuang1938/Script_SceneGroupHierarchy.mjs [--check]   --check 只报统计不写文件
// 这是整理脚本不是门禁，不进 TestRunner。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCENE_ASSETS, SCENE_MATERIALS } from "./Data_SceneAssets.mjs";
import { FormatSceneJson, ValidateScene, SceneDir, SceneFileName } from "./Script_SceneDoc.mjs";
import { BLOCKOUT_TREE_MAX_FOOT_M } from "./Script_EditorBlockoutLevels.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SCENES = ["FirstLevelWhitebox", "FirstLevel"];
const SEGMENTS = new Set(["01–05", "06–10", "11–18", "远景"]);

/** 院子里的部件：id 第一段是部件种类、第二段是院子（House_WN1_1 → WN1）。 */
const PART_PREFIX = new Set(["House", "Wall", "Gate", "Toilet", "Fence", "Well", "Window", "Door", "Roof", "Yard"]);
const BUILDING_SEMANTICS = new Set(["plaster", "structure", "roof", "void", "coping", "step"]);
const BUILDING_META = ["house", "gate", "window", "toilet", "fence", "breach", "loophole", "holeRoof", "bricked", "tower", "threshold", "slogan"];

/** 道具种类（meta.prop）→ 中文。没列的用资产的名字或原名。 */
const PROP_NAMES = Object.freeze({
  Pit: "坑", Rubble: "碎砖堆", AmmoCrate: "弹药箱", AmmoBox: "弹药箱", Tree: "树", WaterVat: "水缸", Cypress: "柏树", Well: "井",
  Straw: "铺草", Stump: "树桩", DoorBoard: "门板", SandbagStack: "沙袋", Sandbag: "沙袋", Collapse: "塌土", DungHeap: "粪堆",
  CrateStack: "木箱", Haystack: "草垛", StrawStack: "草垛", Lantern: "马灯", GrenadeBox: "手榴弹箱", Desk: "桌凳", Stool: "桌凳",
  WoodPile: "柴堆", BrokenRifle: "断枪", Shrine: "神龛", ChickenCoop: "鸡窝", GraveMarker: "坟头", BloodStain: "血迹",
  SleeperPile: "枕木堆", Roller: "碌碡", Bandage: "绷带", OverturnedCart: "翻倒的车", CartWheel: "车轮", Millstone: "磨盘",
  Torch: "火把", Branches: "树枝", Bundle: "包袱", HandCart: "手推车", Mat: "铺草", Charge: "炸药", FieldPhone: "电话机",
  Chest: "箱柜", Canteen: "水壶",
});

const Semantic = (obj) => SCENE_MATERIALS[obj.material]?.semantic || SCENE_ASSETS[obj.asset]?.semantic || null;

/** 远景：村子按 id（VillageA_… → 村 A），其余按种类。 */
function BackdropPath(obj) {
  const village = /^Village([A-Z])_/.exec(obj.id);
  if (village) return `远景/村 ${village[1]}`;
  const kind = SCENE_ASSETS[obj.asset]?.kind;
  return `远景/${kind === "backdropHill" ? "山" : kind === "backdropTree" || kind === "backdropBlob" ? "树" : "房子"}`;
}

/** 这个物件在段落下面归哪一类、哪个子组（不含段落）。 */
export function CategoryPath(obj) {
  if (obj.layer === "backdrop") return null;
  const id = obj.id, meta = obj.meta || {}, semantic = Semantic(obj), tokens = id.split("_");
  if (obj.tag === "airWall" || semantic === "airWall") return "空气墙";
  if (semantic === "water") return "水";
  if (/^(Rail|FallenSleeper|Sleeper)/.test(id) || meta.sleeper || meta.sleeperBed) return "铁路";
  const asset = SCENE_ASSETS[obj.asset];
  // 细高的植物块白盒编辑器也种成树（同 Script_SceneForkFormal 的 IsTree）
  const thinTall = semantic === "foliage" && obj.size && Math.max(obj.size[0], obj.size[2]) <= BLOCKOUT_TREE_MAX_FOOT_M && obj.size[1] >= 2;
  if (asset?.kind === "tree" || meta.tree || meta.prop === "Tree" || meta.prop === "Cypress" || thinTall) return "树木草丛/树";
  if (meta.reed) return "树木草丛/苇子";
  if (meta.abatis || meta.wire || semantic === "cover" || meta.prop === "SandbagStack" || meta.prop === "Sandbag") return "工事";
  if (meta.prop || asset?.kind === "prop") {
    const name = PROP_NAMES[meta.prop] || (asset?.kind === "prop" ? asset.label : meta.prop) || "其他";
    return `道具/${name}`;
  }
  if (semantic === "foliage") return "树木草丛/草木";
  if (/^PathWall|^PathCap/.test(id)) return "街巷墙";
  const building = BUILDING_META.some((k) => meta[k]) || BUILDING_SEMANTICS.has(semantic) || PART_PREFIX.has(tokens[0]);
  if (building) {
    const key = PART_PREFIX.has(tokens[0]) && tokens.length > 2 ? tokens[1] : tokens[0];
    // 按坐标起名的零散墙段（Wall_x398p75_1、Wall_z110_2）
    return /^[xz]\d/.test(key) ? "建筑/零散墙" : `建筑/${key}`;
  }
  return `其他/${tokens[0]}`;
}

/** 首个词（GengSouthWindowLintel1 → Geng、Yard1DoorLintel → Yard1）；不是驼峰多词的返回 null。 */
const FirstWord = (key) => /^[A-Z][a-z]+\d*(?=[A-Z])/.exec(key)?.[0] || null;

/**
 * 同一户的零件散成一堆单件的组（GengZaowu、GengSouthWindowLintel1、GengNorthWall……）：首个词被 ≥ 2 个不同名字共用的，
 * 合成一组（建筑/Geng）；「其他」同样按首个词合（Dugout、Cellar）。
 */
function MergeByFirstWord(paths) {
  const users = new Map();
  for (const p of paths) {
    const [category, key] = p.split("/");
    const word = key && FirstWord(key);
    if (!word) continue;
    const k = `${category}/${word}`;
    if (!users.has(k)) users.set(k, new Set());
    users.get(k).add(key);
  }
  const merged = paths.map((p) => {
    const [category, key] = p.split("/");
    const word = key && FirstWord(key);
    return word && users.get(`${category}/${word}`).size >= 2 ? `${category}/${word}` : p;
  });
  // 只差大小写的是同一户（茅厕 Toilet_GENG_N 与 GengZaowu、Em1BreachStubW 与 Gate_EM1_Lintel）：用物件多的那种写法
  const tally = new Map();
  for (const p of merged) tally.set(p, (tally.get(p) || 0) + 1);
  const canon = new Map();
  for (const [p, n] of tally) {
    const key = p.toLowerCase(), best = canon.get(key);
    if (!best || n > tally.get(best)) canon.set(key, p);
  }
  return merged.map((p) => canon.get(p.toLowerCase()));
}

/** 整个场景：每个物件的路径（段落 / 类别 / 子组）。段落取原来的 group（已经是路径的取第一段）。 */
export function HierarchyPaths(objects) {
  const categories = MergeByFirstWord(objects.map((obj) => obj.layer === "backdrop" ? "" : CategoryPath(obj)));
  return objects.map((obj, i) => {
    if (obj.layer === "backdrop") return BackdropPath(obj);
    const segment = String(obj.group || "").split("/")[0];
    return SEGMENTS.has(segment) ? `${segment}/${categories[i]}` : categories[i];
  });
}

function Main() {
  const check = process.argv.includes("--check");
  for (const id of SCENES) {
    const file = path.join(ROOT, SceneDir(id), SceneFileName(id));
    const scene = JSON.parse(fs.readFileSync(file, "utf8"));
    const count = new Map();
    const paths = HierarchyPaths(scene.objects);
    for (const [i, obj] of scene.objects.entries()) {
      obj.group = paths[i];
      const top = obj.group.split("/").slice(0, 2).join("/");
      count.set(top, (count.get(top) || 0) + 1);
    }
    const folders = new Set(scene.objects.map((o) => o.group)).size;
    console.log(`${id}：${scene.objects.length} 个物件、${folders} 个最底层的组`);
    console.log([...count].sort().map(([k, n]) => `  ${k} ${n}`).join("\n"));
    const result = ValidateScene(scene);
    if (!result.ok) throw new Error(`${id} 校验不过：${result.errors.slice(0, 5).join("；")}`);
    if (!check) fs.writeFileSync(file, FormatSceneJson(scene));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) Main();
