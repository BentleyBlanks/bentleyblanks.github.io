// Script_SceneFormalTest.mjs —— 第一关正式场景（Scenes/FirstLevel，docs/Data_Scene.md §8）的 node 门禁。
//
// 跑法：node Taierzhuang1938/Script_SceneFormalTest.mjs
//   1. 场景清单：两个场景，白盒 + 正式；正式场景过校验、高度图格点数对；
//   2. 正式场景只用正式的资产与材质（Block/Box + Look/*、Prop/*、Tree/*、远景），道具的模型都在外部道具目录里；
//   3. 白盒编辑器三段：试玩跑正式场景（scene.playUrl），编辑跑白盒；正式那一块转出来是 formal 样子、
//      带 PBR 外观、道具清单、分层地表（四层权重都在 0..1、加起来不超过 1），树照旧种模型；
//   4. 正式场景的撒点环境（植被、碎砖瓦）按场景的路与沟算得出来；
//   5. 转换脚本：白盒的一个物件换成正式的样子，布局字段一个不动。

import assert from "node:assert/strict";
import fs from "node:fs";
import { SCENE_LIST, SCENE_ASSETS, SCENE_MATERIALS, SceneAssetsFor, SceneMaterialsFor } from "./Data_SceneAssets.mjs";
import { SCENE_IDS, SceneStyle, ValidateScene, DecodeSceneHeights } from "./Script_SceneDoc.mjs";
import { BLOCKOUT_LEVELS, BlockoutSliceDoc, LayoutFromSceneDoc } from "./Script_EditorBlockoutLevels.mjs";
import { SceneDressingContext, PlanFirstLevelVegetation, SCENE_VEGETATION } from "./Data_FirstLevelVegetation.mjs";
import { PlanRubbleScatter } from "./Data_FirstLevelPropDressing.mjs";
import { ExternalPropCatalog } from "./Script_ExternalProps.mjs";
import { FormalObject } from "./Script_SceneForkFormal.mjs";
import { SceneFilePath } from "./Script_SceneNode.mjs";

let count = 0;
function Check(ok, label) { assert.ok(ok, label); count++; }

// 1) 清单
Check(SCENE_LIST.length === 2 && SCENE_IDS.includes("FirstLevelWhitebox") && SCENE_IDS.includes("FirstLevel"), "场景清单：第一关白盒 + 第一关正式");
Check(SceneStyle("FirstLevelWhitebox") === "whitebox" && SceneStyle("FirstLevel") === "formal", "两个场景的样子：whitebox / formal");
const path = SceneFilePath("FirstLevel");
const text = fs.readFileSync(path, "utf8");
const scene = JSON.parse(text);
const heights = DecodeSceneHeights(fs.readFileSync(path.replace(/\.json$/, ".height.bin")), scene.terrain);
const v = ValidateScene(scene);
Check(v.ok, `正式场景过校验：${v.errors.slice(0, 5).join("；")}`);
Check(text.indexOf("\r") < 0, "正式场景 JSON 是 LF");
Check(heights.length === (scene.terrain.cols + 1) * (scene.terrain.rows + 1), "正式场景高度图格点数 = (cols+1)×(rows+1)");

// 2) 只用正式的资产与材质
const formalAssets = new Set(SceneAssetsFor("formal").map(([id]) => id));
const formalMaterials = new Set(SceneMaterialsFor("formal").map(([id]) => id));
Check(scene.objects.every(o => formalAssets.has(o.asset)), "正式场景只用正式资产（Block/Box、Prop/*、Tree/*、远景）");
Check(scene.objects.every(o => o.material === undefined || formalMaterials.has(o.material)), "正式场景的材质都是 Look/*");
Check(scene.objects.filter(o => o.asset === "Block/Box").every(o => SCENE_MATERIALS[o.material]), "体块都写了材质");
const catalog = new Set(ExternalPropCatalog().map(spec => spec.id));
const models = Object.values(SCENE_ASSETS).filter(a => a.kind === "prop").map(a => a.model);
Check(models.every(m => catalog.has(m)), `道具资产的模型都在外部道具目录里：${models.filter(m => !catalog.has(m)).join("、")}`);
Check(Object.values(SCENE_ASSETS).filter(a => a.kind === "prop" || a.kind === "tree").every(a => Array.isArray(a.size) && a.size.length === 3),
  "道具与树都有缺省尺寸（场景编辑器新加一件用）");
Check(scene.objects.some(o => o.asset.startsWith("Prop/")) && scene.objects.some(o => o.asset.startsWith("Tree/")), "正式场景里有道具与树");

// 3) 白盒编辑器三段
const sliced = BLOCKOUT_LEVELS.filter(l => l.scene?.kind === "scene");
Check(sliced.length === 3 && sliced.every(l => /FirstLevelWhitebox/.test(l.scene.url) && /Scenes\/FirstLevel\/Scene_FirstLevel\.json$/.test(l.scene.playUrl)),
  "三段：编辑跑白盒场景、试玩跑正式场景（scene.playUrl）");
for (const level of sliced) {
  const layout = LayoutFromSceneDoc(BlockoutSliceDoc(level, scene, heights));
  Check(layout.style === "formal" && layout.materialLooks && layout.ground.terrainLayers === "MissionPlain" && typeof layout.SampleGroundSurface === "function",
    `${level.key}：正式样子、PBR 外观、分层地表`);
  Check(layout.sceneProps.length > 0 && layout.sceneProps.every(e => catalog.has(e.asset) && layout.blocks.some(b => b.id === e.block)),
    `${level.key}：道具清单对得上块与外部道具（${layout.sceneProps.length} 件）`);
  Check(layout.blocks.filter(b => b.look).length > 0 && layout.blocks.every(b => !b.look || SceneMaterialsFor("formal").some(([, m]) => m.look === b.look)),
    `${level.key}：块带的外观都是登记过的 Look`);
  Check(layout.blocks.some(b => b.blockoutTree) && layout.colorSemantics.length === 0, `${level.key}：树照旧种模型、没有「保留语义色」`);
  const c = [0, 0, 0], layers = [0, 0, 0, 1];
  let bad = 0, n = 0, track = 0, spoil = 0;
  const b = layout.bounds;
  for (let x = b.minX + 2; x < b.maxX; x += 7) for (let z = b.minZ + 2; z < b.maxZ; z += 7) {
    layout.SampleGroundSurface(x, z, c, layers);
    const sum = layers[0] + layers[1] + layers[2];
    if (layers.some(w => !(w >= 0 && w <= 1)) || sum > 1.0001 || c.some(v => v !== 1)) bad++;
    track += layers[0]; spoil += layers[1]; n++;
  }
  Check(bad === 0 && track > 0 && spoil > 0, `${level.key}：分层地表四层权重都在 0..1、车道 + 翻土 + 草茬不超过 1（${n} 个点，车道均值 ${(track / n).toFixed(2)}、翻土 ${(spoil / n).toFixed(2)}）`);
  // 4) 撒点环境
  const ctx = SceneDressingContext(layout, (x, z) => layout.terrainSampler(x, z));
  const veg = PlanFirstLevelVegetation(ctx, "low", SCENE_VEGETATION);
  const rubble = PlanRubbleScatter(ctx);
  Check(ctx.routes.length > 0 && veg.instances.length > 0 && rubble.pieces.length >= 0, `${level.key}：植被按场景的路与沟撒得出来（${veg.instances.length} 丛、碎砖瓦 ${rubble.pieces.length} 块）`);
}

// 5) 转换脚本
const wall = { id: "House_X1_2", asset: "Whitebox/Box", material: "Whitebox/Plaster", pos: [1, null, 2], yawDeg: 30, size: [4, 3, 0.4], hideOn: "Boom", group: "06–10", meta: { house: true } };
const formalWall = FormalObject(wall);
Check(formalWall.asset === "Block/Box" && /^Look\//.test(formalWall.material) && formalWall.pos === wall.pos && formalWall.yawDeg === 30 && formalWall.size === wall.size
  && formalWall.hideOn === "Boom" && formalWall.group === "06–10" && formalWall.meta === wall.meta, "转换：墙换外观，位置 / 朝向 / 尺寸 / 信号 / 分组 / meta 不动");
const crate = FormalObject({ id: "AmmoCrate_1", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [0, null, 0], size: [0.55, 0.32, 0.38], meta: { prop: "AmmoCrate" } });
Check(crate.asset === "Prop/militaryCrateClosed" && crate.material === undefined, "转换：弹药箱盒子 → Prop/militaryCrateClosed（不写材质）");
const tree = FormalObject({ id: "DeadTree_01", asset: "Whitebox/Box", material: "Whitebox/Foliage", pos: [0, null, 0], size: [0.6, 11, 0.6] });
Check(tree.asset === "Tree/Dead", "转换：细高的植物块 → Tree/Dead");
const air = FormalObject({ id: "KeepIn_0001", asset: "Whitebox/Box", material: "Whitebox/AirWall", pos: [0, null, 0], size: [1, 3, 1], visual: false, tag: "airWall" });
Check(air.material === "Look/airWall" && air.visual === false && air.tag === "airWall", "转换：隐形墙 → Look/airWall，visual / tag 不动");

console.log(`正式场景测试全过（${count} 项）`);
