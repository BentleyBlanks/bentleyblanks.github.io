// 构件目录：构件库预览（Tool_PropLibrary.html）里 tzm 模型与场景特效的那一部分，以及把 tzm 条目建成可见节点的函数。
//
// ## 这里有什么
//   · PLACEABLE            tzm 模型（武器、战车）与场景特效；外部 GLB 不在这里，由 Script_ExternalProps 的目录提供；
//   · MODEL_PLACEABLE      进目录的 tzm 模型 id（人物不进表，武器与车辆进）；
//   · PLACEABLE_CATEGORIES 构件库的类别顺序（外部 GLB 的品类也按它排，表外的排在后面）；
//   · BuildPlaceableVisual 用正片同一个 InstantiateModel 建一个 tzm 条目的可见节点。
//
// ## 清理记录
// 2026-11-01 删掉了只在这里用、正片与旧章都不建的寨墙段、沙包路障、天主堂（旧通用版）、清真寺与建筑战损态。
// 2026-11-25 用户：老第一关场景与启动界面都不再用，清理构件库——
//   · 26 个程序化构件（树、电线杆、水井、石磨、水缸、沙包封门、防空洞口、四合院、单体房屋、院门楼、牌坊、警报楼、
//     方形炮楼院、11 个地标注册表构件、车站、电灯厂）从目录摘掉；生成器本身（Script_World / Script_Landmark_*）
//     仍由旧滕县城使用，未删；
//   · 9 件建筑 / 饰件 tzm（斗拱、屋脊兽、窗棂、门墩石、臂板信号机、站台灯、天主堂窗花、牢门五金、道口标）不再进目录；
//     窗棂、门墩石没有任何使用者，连模型一起删了，其余 7 件仍由旧城的 Script_TrimProps 使用。
// git 历史里都还在。

import { ResolveTengxianMaterial } from "../Script_TengxianCity.mjs";
import { MESHES } from "../Data_Meshes.mjs";
import { MeshIds } from "../Script_Meshes.mjs";
import { InstantiateModel } from "../Script_MeshLoad.mjs";
import { SCENE_EFFECTS } from "../Script_Vfx.mjs";

/** 进目录的 tzm：武器与车辆（人物不进表 —— 摆一个不动的兵是穿帮）。 */
export const MODEL_PLACEABLE = MeshIds().filter((id) => {
  const entry = MESHES[id];
  return entry && (entry.category === "weapon" || entry.category === "vehicle");
});

export const PLACEABLE = [
  ...MODEL_PLACEABLE.map((id) => ({
    id: `Model_${id}`, name: id, cat: "模型", model: id, uses: ["ry", "scale", "h"], defaults: { scale: 1, h: 0 },
  })),
  ...Object.entries(SCENE_EFFECTS).map(([id, effect]) => ({
    id: `Effect_${id}`, name: effect.name, cat: "特效", effect: id,
    uses: ["scale", "h"], defaults: { scale: 1, h: 0 }, note: effect.note,
  })),
];

export const PLACEABLE_CATEGORIES = ["景观", "院落小件", "工事", "建筑", "模型", "特效"];

const VEHICLE_MATERIAL_RECIPES = {
  type89Armor: "Type89Armor",
  type89Barrel: "Type89Armor",
  type89Track: "Type89Track",
};

/**
 * 用正片同一个 InstantiateModel 建一个 tzm 条目的可见节点。modelDocs 里要先有该模型的文档。
 * 返回 { loaded, colliders, meshes }（tzm 道具不登记碰撞盒）。
 */
export function BuildPlaceableVisual(target, entry, item, { library, modelDocs = new Map() } = {}) {
  const doc = entry?.model ? modelDocs.get(entry.model) : null;
  if (!doc) return { loaded: false, colliders: [], meshes: 0 };
  const spec = MESHES[entry.model];
  const materials = {};
  for (const name of spec.materials) materials[name] = ResolveTengxianMaterial(VEHICLE_MATERIAL_RECIPES[name] ?? name, library);
  const built = InstantiateModel(doc, { materials });
  built.root.position.set(item.x, item.h || 0, item.z);
  built.root.rotation.y = item.ry || 0;
  built.root.scale.setScalar(item.scale || 1);
  target.add(built.root);
  let meshes = 0;
  built.root.traverse((node) => { if (node.isMesh) meshes += 1; });
  return { loaded: true, colliders: [], meshes };
}
