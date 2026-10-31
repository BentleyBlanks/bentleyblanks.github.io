// 构件目录：场景里「能摆的东西」的一张总表，以及把表项建成可见节点的那一个函数。
//
// ## 这里有什么
//   · PLACEABLE            可放置条目：Script_World 里已封装的程序化构件（院落、门楼、牌坊、警报楼、
//                          沙包、防空洞、寨墙段…）、Script_Landmark_* 注册表地标、Model/*.tzm 模型、
//                          场景特效；每条写明用得上哪几个参数（uses）与出厂参数（defaults）；
//   · MODEL_PLACEABLE      tzm 里能当道具摆的那几个模型 id（人物不进表，车辆进）；
//   · PLACEABLE_CATEGORIES 分类顺序；
//   · BuildPlaceableVisual 用正片同一套生成器（BuildSink / InstantiateModel）建一个条目的可见节点；
//   · BUILDING_DAMAGE_*    建筑与地标的三档离散战损态（原始 / 炮击初损 / 严重破坏）。
//
// ## 来历与用途
// 原先住在场景关卡编辑器（Script_EditorScene）里；2026-10-31 用户要求删掉旧的场景关卡 / 地形 /
// 完整场景预览 / 采样点四个工具，这一份目录单独留下：构件库预览（Script_EditorPropLibrary）
// 靠它逐项看构件，以后新的场景编辑器也复用它当资产目录。行为与旧版逐字一致。
//
// ## 一条纪律
// 构件一律以 y=0 起砌、用世界坐标建，只有 y 由调用方补；碰撞盒随 BuildPlaceableVisual 的返回值
// 交出去，由调用方决定要不要推进 city.colliders（预览器不推）。

import { ResolveTengxianMaterial } from "./Script_TengxianCity.mjs";
import {
  BuildSink, AddTree, AddPole, AddWell, AddMillstone, AddWaterVat, AddBarricade,
  AddCompound, AddRoomBlock, AddGatehouse, AddRampart, AddDugout, AddPaifang,
  AddAlarmTower, AddSquareFort, AddChurch, AddMosque, AddSandbagPlug,
  AddBuildingDamageDetails,
} from "./Script_World.mjs";
import { FlushWallInstances } from "./Script_WallSpline.mjs";
import { LANDMARK_BUILDERS, MakeFeatureHost } from "./Script_LandmarkRegistry.mjs";
import { MakeBox } from "./Script_Geo.mjs";
import { Mulberry32, HashString } from "./Script_Noise.mjs";
import { MESHES, MeshIds } from "./Data_Meshes.mjs";
import { InstantiateModel } from "./Script_MeshLoad.mjs";
import { SCENE_EFFECTS } from "./Script_Vfx.mjs";


/**
 * 建筑/地标预建模的离散战损态。原始态保留该构件自己的历史缺省 damage；后两档
 * 同时换几何损伤参数与专属 imagegen PBR，预览与场景布设共走 BuildPlaceableVisual。
 */
export const BUILDING_DAMAGE_STATES = Object.freeze({
  original: Object.freeze({ id: "original", label: "原始状态", damage: null, burnt: false, material: null, detail: null }),
  // 三档必须读成同一栋建筑的时间序列：不换砖型、不换全局焦色，也不在初损时改掉屋脊。
  shellDamaged: Object.freeze({ id: "shellDamaged", label: "炮击初损", damage: 0.38, burnt: false,
    material: "BuildingDamageEarly", detail: "early", profile: "early" }),
  severeDamage: Object.freeze({ id: "severeDamage", label: "严重破坏", damage: 0.72, burnt: false,
    material: "BuildingDamageSevere", detail: "severe", profile: "severe" }),
});
export const BUILDING_DAMAGE_STATE_OPTIONS = Object.freeze(
  Object.values(BUILDING_DAMAGE_STATES).map(({ id: value, label }) => Object.freeze({ value, label })),
);

const BUILDING_DAMAGE_SURFACES = new Set([
  "BrickWall", "BrickWallSooty", "HouseBrick", "Adobe", "CityBrickWorn",
  "GateBrick", "GateBrickWorn", "PrisonWall", "StationBrick", "TemplePlaster",
  "ChurchPlaster", "SchoolBrick", "ChimneyBrick",
]);

export function SupportsBuildingDamageStates(entry) {
  return Boolean(entry && entry.damageStates);
}

export function ResolveBuildingDamageState(entry, item = {}) {
  if (!SupportsBuildingDamageStates(entry)) return null;
  return BUILDING_DAMAGE_STATES[item.damageState] || BUILDING_DAMAGE_STATES.original;
}

function DamageMaterialResolver(state, library) {
  if (!state || !state.material) return ResolveTengxianMaterial;
  return (name, targetLibrary = library) => ResolveTengxianMaterial(
    BUILDING_DAMAGE_SURFACES.has(name) ? state.material : name,
    targetLibrary,
  );
}

function DamageDetailDimensions(sink, entry, item) {
  let colliderHeight = 0;
  let colliderWidth = 0;
  let colliderDepth = 0;
  for (const collider of sink.colliders) {
    colliderHeight = Math.max(colliderHeight, collider.max?.[1] || 0);
    colliderWidth = Math.max(colliderWidth, (collider.max?.[0] || 0) - (collider.min?.[0] || 0));
    colliderDepth = Math.max(colliderDepth, (collider.max?.[2] || 0) - (collider.min?.[2] || 0));
  }
  const gateWidth = entry.id === "Gatehouse" ? Number(item.w || 1.5) + 1.2 : 0;
  return {
    width: Math.max(2.4, gateWidth, Number(item.w) || 0, colliderWidth || 0),
    depth: Math.max(1.0, Number(item.d) || 0, Math.min(colliderDepth || 0, 28), gateWidth ? 1.1 : 0),
    height: Math.max(2.4, Number(item.h) || 0, colliderHeight || 0),
  };
}

/**
 * 可放置的东西。
 *   uses     这一条用得上哪几个参数（界面只画这几根滑杆）
 *   defaults 这一条的出厂参数
 *   build    (sink, item) → void。**用世界坐标建**，只有 y 由外面补
 *            （构件全部以 y=0 起砌，濠外原野在 -1.2，所以整组再往下挪一点）
 */
export const PLACEABLE = [
  {
    id: "Tree", name: "树", cat: "景观", uses: ["scale"], defaults: { scale: 1.1 },
    build: (sink, it) => AddTree(sink, { x: it.x, z: it.z, seed: it.seed, scale: it.scale }),
  },
  {
    id: "Pole", name: "电线杆", cat: "景观", uses: ["h"], defaults: { h: 6.5 },
    build: (sink, it) => AddPole(sink, { x: it.x, z: it.z, seed: it.seed, height: it.h }),
  },
  {
    id: "Well", name: "水井", cat: "院落小件", uses: [], defaults: {},
    build: (sink, it) => AddWell(sink, it.x, it.z),
  },
  {
    id: "Millstone", name: "石磨", cat: "院落小件", uses: [], defaults: {},
    build: (sink, it) => AddMillstone(sink, it.x, it.z, it.seed),
  },
  {
    id: "WaterVat", name: "水缸", cat: "院落小件", uses: [], defaults: {},
    build: (sink, it) => AddWaterVat(sink, it.x, it.z, it.seed),
  },
  {
    id: "Barricade", name: "沙包路障", cat: "工事", uses: ["ry", "w", "h"],
    defaults: { w: 5, h: 1.15 },
    build: (sink, it) => AddBarricade(sink, {
      x: it.x, z: it.z, ry: it.ry, length: it.w, height: it.h, seed: it.seed,
    }),
  },
  {
    id: "SandbagPlug", name: "沙包封门", cat: "工事", uses: ["ry", "w", "h"],
    defaults: { w: 3.8, h: 2.6 },
    build: (sink, it) => AddSandbagPlug(sink, {
      x: it.x, z: it.z, ry: it.ry, openW: it.w, openH: it.h, depth: 2.4,
      seed: it.seed, mode: "partial",
    }),
  },
  {
    id: "Dugout", name: "防空洞口", cat: "工事", uses: ["ry", "w", "h", "d"],
    defaults: { w: 1.2, h: 1.6, d: 3.0 },
    build: (sink, it) => AddDugout(sink, {
      x: it.x, z: it.z, ry: it.ry, width: it.w, height: it.h, depth: it.d, seed: it.seed,
    }),
  },
  {
    id: "Rampart", name: "寨墙段", cat: "工事", uses: ["ry", "w", "h", "d"],
    defaults: { w: 24, h: 4.0, d: 2.2 },
    build: (sink, it) => AddRampart(sink, {
      x: it.x, z: it.z, ry: it.ry, length: it.w, height: it.h, thickness: it.d, seed: it.seed,
    }),
  },
  {
    id: "Compound", name: "四合院", cat: "建筑", damageStates: true,
    uses: ["ry", "w", "d", "damage"],
    defaults: { w: 16, d: 14, damage: 0.2 },
    build: (sink, it) => AddCompound(sink, {
      x: it.x, z: it.z, ry: it.ry, width: it.w, depth: it.d, damage: it.damage,
      burnt: it.burnt, damageProfile: it.damageProfile, seed: it.seed,
    }),
  },
  {
    id: "RoomBlock", name: "房屋（单体）", cat: "建筑", damageStates: true,
    uses: ["ry", "w", "d", "h", "damage"],
    defaults: { w: 9, d: 6, h: 3.0, damage: 0.15 },
    build: (sink, it) => AddRoomBlock(sink, {
      x: it.x, z: it.z, ry: it.ry, width: it.w, depth: it.d,
      eaveY: it.h, ridgeY: it.h * 1.7, seed: it.seed, damage: it.damage,
      burnt: it.burnt, damageProfile: it.damageProfile, facing: 1, bays: 3,
    }),
  },
  {
    id: "Gatehouse", name: "院门楼", cat: "建筑", damageStates: true,
    uses: ["ry", "w", "damage"],
    defaults: { w: 1.5, damage: 0.1 },
    build: (sink, it) => AddGatehouse(sink, {
      x: it.x, z: it.z, ry: it.ry, seed: it.seed, damage: it.damage,
      burnt: it.burnt, damageProfile: it.damageProfile, openW: it.w,
    }),
  },
  {
    id: "Paifang", name: "牌坊", cat: "地标", uses: ["ry", "w", "h"],
    defaults: { w: 9, h: 7.2 },
    build: (sink, it) => AddPaifang(sink, {
      x: it.x, z: it.z, ry: it.ry, span: it.w, height: it.h, seed: it.seed,
    }),
  },
  {
    id: "AlarmTower", name: "警报楼", cat: "地标", uses: ["ry", "w", "h"],
    defaults: { w: 4.0, h: 9 },
    build: (sink, it) => AddAlarmTower(sink, {
      x: it.x, z: it.z, ry: it.ry, height: it.h, side: it.w, seed: it.seed,
    }),
  },
  {
    id: "SquareFort", name: "方形炮楼院", cat: "地标", damageStates: true,
    uses: ["ry", "w", "d", "damage"],
    defaults: { w: 32, d: 32, damage: 0.3 },
    build: (sink, it) => AddSquareFort(sink, {
      x: it.x, z: it.z, ry: it.ry, w: it.w, d: it.d, damage: it.damage, seed: it.seed,
    }),
  },
  {
    id: "Church", name: "天主堂", cat: "地标", damageStates: true,
    uses: ["ry", "w", "d", "h", "damage"],
    defaults: { w: 11, d: 24, h: 16, damage: 0.15 },
    build: (sink, it) => AddChurch(sink, {
      x: it.x, z: it.z, ry: it.ry, nave: [it.w, it.d], towerH: it.h,
      seed: it.seed, damage: it.damage, damageProfile: it.damageProfile,
    }),
  },
  {
    id: "Mosque", name: "清真寺", cat: "地标", damageStates: true,
    uses: ["ry", "damage"], defaults: { damage: 0.4 },
    build: (sink, it) => AddMosque(sink, {
      x: it.x, z: it.z, ry: it.ry, seed: it.seed, damage: it.damage,
    }),
  },
];

// 「照城防示意图补全地标」的注册表构件（Script_Landmark_*.mjs）。
// 编辑器里没有城，用 MakeFeatureHost 的平地替身；参数映射：w/d=占地，damage=破损。
const REGISTRY_PLACEABLE = [
  ["Prison", "监狱", "prison", { w: 44, d: 36, damage: 0.2 }],
  ["Detention", "看守所", "detention", { w: 30, d: 26, damage: 0.2 }],
  ["Garrison", "警备队", "garrison", { w: 46, d: 30, damage: 0.2 }],
  ["Police", "警察所", "police", { w: 34, d: 28, damage: 0.18 }],
  ["Guild", "商会", "guild", { w: 40, d: 26, damage: 0.18 }],
  ["Pawnshop", "当铺", "pawnshop", { w: 34, d: 30, damage: 0.2 }],
  ["Hq", "指挥部院", "hq", { w: 62, d: 44, damage: 0.16 }],
  ["Billet", "营连驻地", "billet", { w: 60, d: 40, damage: 0.24 }],
  ["TempleYard", "庙宇", "temple", { w: 42, d: 30, damage: 0.22 }],
  ["ConfucianTemple", "文庙", "confucianTemple", { w: 40, d: 34, damage: 0.2 }],
  ["School", "学校", "school", { w: 48, d: 30, damage: 0.24 }],
];
for (const [pid, name, kind, defaults] of REGISTRY_PLACEABLE) {
  PLACEABLE.push({
    id: pid, name, cat: "地标", damageStates: true,
    uses: ["ry", "w", "d", "damage"], defaults,
    build: (sink, it) => LANDMARK_BUILDERS[kind](
      MakeFeatureHost(sink),
      { id: `edit${it.seed}`, x: it.x, z: it.z, w: it.w, d: it.d },
      { damage: it.damage, burnt: Boolean(it.burnt), ry: it.ry }),
  });
}
// 西关两件带专属参数的：车站（h 无用）与电灯厂（h=烟囱高）。
PLACEABLE.push({
  id: "Station", name: "车站", cat: "地标", damageStates: true,
  uses: ["ry", "w", "d"], defaults: { w: 34, d: 12, damage: 0.2 },
  build: (sink, it) => LANDMARK_BUILDERS.station(
    MakeFeatureHost(sink), { id: `edit${it.seed}`, x: it.x, z: it.z, w: it.w, d: it.d },
    { damage: it.damage ?? 0.2, burnt: Boolean(it.burnt), ry: it.ry }),
});
PLACEABLE.push({
  id: "PowerPlant", name: "电灯厂", cat: "地标", damageStates: true,
  uses: ["ry", "w", "d", "h"], defaults: { w: 30, d: 18, h: 22, damage: 0.2 },
  build: (sink, it) => LANDMARK_BUILDERS.powerPlant(
    MakeFeatureHost(sink),
    { id: `edit${it.seed}`, x: it.x, z: it.z, w: it.w, d: it.d, chimneyH: it.h },
    { damage: it.damage ?? 0.2, burnt: Boolean(it.burnt), ry: it.ry }),
});

/**
 * Model/*.tzm.json 里那几个可以当道具摆的。
 *
 * 人物模型不进这张表 —— 摆一个不动的兵是穿帮。
 * **车辆进**：一辆停在街心的八九式是地标，不需要它会动就已经在讲故事了
 *（Data_Levels 里 L4 与 L6 的 vehicles 字段本来就写了它们的位置）。
 */
export const MODEL_PLACEABLE = MeshIds().filter((id) => {
  const entry = MESHES[id];
  return entry && (entry.category === "prop" || entry.category === "weapon"
    || entry.category === "vehicle");
});

for (const id of MODEL_PLACEABLE) {
  PLACEABLE.push({
    id: `Model_${id}`, name: MESHES[id].note ? `${id}` : id, cat: "模型",
    model: id, uses: ["ry", "scale", "h"], defaults: { scale: 1, h: 0 },
  });
}

for (const [id, effect] of Object.entries(SCENE_EFFECTS)) {
  PLACEABLE.push({
    id: `Effect_${id}`, name: effect.name, cat: "特效", effect: id,
    uses: ["scale", "h"], defaults: { scale: 1, h: 0 }, note: effect.note,
  });
}

export const PLACEABLE_CATEGORIES = ["景观", "院落小件", "工事", "建筑", "地标", "模型", "特效"];


/**
 * 用正片同一套生成器构建一个可放置构件的可见节点。
 * 场景编辑器与构件库预览器共用，避免预览器另抄一份“看起来差不多”的模型。
 */
export function BuildPlaceableVisual(target, entry, item, {
  library, modelDocs = new Map(), externalModels = new Map(), ownedGeometries = [],
} = {}) {
  if (!entry) return { loaded: false, colliders: [], meshes: 0 };
  if (entry.model) {
    const doc = modelDocs.get(entry.model);
    if (!doc) return { loaded: false, colliders: [], meshes: 0 };
    const spec = MESHES[entry.model];
    const materials = {};
    for (const name of spec.materials) materials[name] = ResolveTengxianMaterial(name, library);
    const built = InstantiateModel(doc, { materials });
    built.root.position.set(item.x, item.h || 0, item.z);
    built.root.rotation.y = item.ry || 0;
    built.root.scale.setScalar(item.scale || 1);
    target.add(built.root);
    let meshes = 0;
    built.root.traverse((node) => { if (node.isMesh) meshes += 1; });
    return { loaded: true, colliders: [], meshes };
  }

  const damageState = ResolveBuildingDamageState(entry, item);
  const buildItem = damageState && damageState.damage != null
    ? { ...item, damage: damageState.damage, burnt: damageState.burnt,
      damageProfile: damageState.profile }
    : item;
  const resolve = DamageMaterialResolver(damageState, library);
  const sink = new BuildSink();
  let damageDetail = null;
  try {
    entry.build(sink, buildItem);
    if (damageState?.detail) {
      damageDetail = AddBuildingDamageDetails(sink, {
        x: buildItem.x, z: buildItem.z, ry: buildItem.ry,
        ...DamageDetailDimensions(sink, entry, buildItem),
        seed: `${buildItem.seed}:${entry.id}`, stage: damageState.detail,
      });
    }
  } catch (error) {
    console.warn(`[PlaceableCatalog] ${entry.id} 建不出来：${String(error).slice(0, 160)}`);
  }
  FlushSinkProps(sink, target, library, ownedGeometries, resolve, externalModels);
  const flushed = sink.Flush(target, library, { resolve });
  for (const mesh of flushed) ownedGeometries.push(mesh.geometry);
  let meshes = 0;
  target.traverse((node) => { if (node.isMesh) meshes += 1; });
  return {
    loaded: true, colliders: sink.colliders, meshes,
    damageState: damageState?.id || null, damageDetail,
  };
}

/**
 * 把 sink.props 里那几种「不能合批的东西」就地展开成几何。
 *
 * TengxianCity 有自己的 FlushProps（沙包走 InstancedMesh、瓦砾堆走另一个），
 * 那一份和城的生命周期绑在一起，这里不能借。**不展开的后果不是难看，是消失** ——
 * AddBarricade 整条沙包墙都在 props 里，不展开的话点了「沙包路障」什么也不出现。
 */
export function FlushSinkProps(sink, target, library, owned,
  resolve = ResolveTengxianMaterial, externalModels = new Map()) {
  // 样条围墙 / 篱笆的实例桶（kind:"wallInstances"）：与建城时同一条收尾通道。
  // 不接这一路的话，编辑器里凡是走 Script_WallSpline 的构件会**静默消失** ——
  // 几何建了、矩阵算了、没人把它变成网格。
  FlushWallInstances(sink, {
    scene: target, meshes: [], library, resolve,
  });
  for (const prop of sink.props) {
    if (prop.kind === "externalSandbags") {
      for (const placement of prop.placements) {
        const template = externalModels.get(placement.asset);
        if (!template) continue;
        const model = template.clone(true);
        model.name = `Placed_${placement.asset}`;
        model.position.set(placement.x, placement.y || 0, placement.z);
        model.rotation.y = placement.ry || 0;
        model.scale.setScalar(placement.scale || 1);
        target.add(model);
      }
      continue;
    }
    if (prop.kind === "tree") { AddTree(sink, prop); continue; }
    if (prop.kind === "rubblePile" || prop.kind === "breachSpill") {
      const rnd = Mulberry32(HashString(prop.seed || "pile"));
      const n = prop.kind === "breachSpill" ? 26 : 34;
      for (let i = 0; i < n; i += 1) {
        const a = rnd() * Math.PI * 2;
        const r = rnd() * (prop.radius || 3);
        const s = 0.16 + rnd() * 0.5;
        // 瓦砾用普通盒子并进砖桶：编辑器里几十块碎砖不值得再起一个 InstancedMesh
        sink.Add("CityBrickWorn",
          MakeBox(s * 1.4, s * 0.6, s * 1.2, 0.32, `r${i}`)
            .translate(prop.x + Math.cos(a) * r, s * 0.3, prop.z + Math.sin(a) * r));
      }
      continue;
    }
  }
  sink.props.length = 0;
  for (const placement of sink.externalProps) {
    const template = externalModels.get(placement.asset);
    if (!template) continue;
    const model = template.clone(true);
    model.name = `Placed_${placement.asset}`;
    model.position.set(placement.x, Number.isFinite(placement.y) ? placement.y : 0, placement.z);
    model.rotation.y = placement.ry || 0;
    model.scale.setScalar(placement.scale || 1);
    target.add(model);
  }
  sink.externalProps.length = 0;
}
