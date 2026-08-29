// 场景关卡编辑器 + 场景/地形共享内核。
//
// ## 它编辑的是什么
// 滕县的城不是摆出来的资产，是 Script_TengxianCity 按 Data_Tengxian 的图纸
// **现生成**的（城墙、街、院落、地形全是程序化）。所以这个编辑器不去改那座城 ——
// 改它要改图纸与生成规则，那是源码层的事。
//
// 它做的是**叠加层**，但入口已经拆开：
//   · 放置层：把 Script_World 里那批已经封装好的构件（院落、门楼、牌坊、警报楼、
//     沙包、防空洞、寨墙段…）与 Model/*.tzm 里那几个模型摆到地上，由 SceneEditor 暴露；
//   · 地形层：抬高 / 压低 / 挖坑 / 抹平，由 Script_EditorTerrain 的 TerrainEditor 暴露。
// 两层都能存成 JSON 带走 —— 这是把「在现场调出来的位置」搬回图纸的通道。
//
// ## 地形笔刷改的是两样东西，必须同时改
//   1. 网格顶点（看得见的地）；
//   2. **解析高程 GroundHeight**（脚踩的地）。
// 只改前者的下场是「看着是个坑，人在坑口上平地走过去」——
// 城内地坪那 190 个弹坑现在就是这个状态（Script_TengxianCity 里写了这条账）。
// 所以这里把 field.GroundHeight 包一层，叠上笔刷的高程场。
//
// ## 一条纪律
// 放置层的碰撞盒是**真的**推进 city.colliders 的（否则摆出来的墙人能穿过去）。
// 退出编辑器时按 id 摘干净 —— 摘不干净的表现是「玩着玩着撞到空气」。

import * as THREE from "three";
import {
  Panel, Section, Row, Slider, Chips, Toggle, ButtonRow, Facts, Note, ListBox, TextArea, El,
  CameraProjectionControls,
} from "./Script_EditorUi.mjs";
import { PickWorld, ScreenRay } from "./Script_EditorStage.mjs";
import { MarkNoPrepass } from "./Script_Post.mjs";
import {
  BuildSink, AddTree, AddPole, AddWell, AddMillstone, AddWaterVat, AddBarricade,
  AddCompound, AddRoomBlock, AddGatehouse, AddRampart, AddDugout, AddPaifang,
  AddAlarmTower, AddSquareFort, AddChurch, AddMosque, AddSandbagPlug,
} from "./Script_World.mjs";
import { ResolveTengxianMaterial } from "./Script_TengxianCity.mjs";
import { FlushWallInstances } from "./Script_WallSpline.mjs";
import { LANDMARK_BUILDERS, MakeFeatureHost } from "./Script_LandmarkRegistry.mjs";
import { MakeBox, MakeSandbag, MakeInstanced, TILE_METERS } from "./Script_Geo.mjs";
import { Mulberry32, HashString } from "./Script_Noise.mjs";
import { MESHES, MeshUrl, MeshIds } from "./Data_Meshes.mjs";
import { LoadDocument, InstantiateModel } from "./Script_MeshLoad.mjs";
import { PHASES } from "./Data_Battle.mjs";
import {
  CITY_FEATURES, LANDMARKS, STREETS, GATES,
  EAST_SUBURB, WEST_SUBURB, NORTH_SUBURB, OUTER_LANDMARKS,
} from "./Data_Tengxian.mjs";
import { SCENE_EFFECTS } from "./Script_Vfx.mjs";

const SAVE_KEY = "tengxian1938_sceneedit_v1";
// 进编辑器的出厂投影：战斗相机的远面只有 400/620 m，在自由飞行里一飞高就把
// 半座城剔掉，看着像「东西没生成」。编辑器不吃这个性能预算，进来就先给足
// 2000 m；FOV 回到 55°（与画质缺省一致），免得沿用战斗里改过的那份。
// FlyCam.Close 退出时会把两项原样还回去。
const EDITOR_DEFAULT_FAR = 2000;
const EDITOR_DEFAULT_FOV = 55;
const MAX_MAP_MARKERS = 96;
// 车厢序章不是一张可玩的战斗切片，不能把它伪装成 L0_界河。
// 保持这个 id 与 Data_CutsceneChuchuan 的导出一致；真正打开时由主程序跳到
// 独立预览页，那里才有完整的车厢时间轴与音频装配。
const PROLOGUE_SCENE_ID = "CS_Chuchuan";
const PROLOGUE_SCENE = {
  id: PROLOGUE_SCENE_ID,
  name: "序章 · 出川（车厢）",
  tail: "新版序章 · 约 2 分钟",
  title: "独立车厢序章；不会错误加载为界河战斗场景",
};

/**
 * 建筑/地标预建模的离散战损态。原始态保留该构件自己的历史缺省 damage；后两档
 * 同时换几何损伤参数与专属 imagegen PBR，预览与场景布设共走 BuildPlaceableVisual。
 */
export const BUILDING_DAMAGE_STATES = Object.freeze({
  original: Object.freeze({ id: "original", label: "原始状态", damage: null, burnt: false, material: null }),
  shellDamaged: Object.freeze({ id: "shellDamaged", label: "炮击初损", damage: 0.46, burnt: false, material: "BuildingDamageEarly" }),
  severeDamage: Object.freeze({ id: "severeDamage", label: "严重破坏", damage: 0.88, burnt: true, material: "BuildingDamageSevere" }),
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

const LANDMARK_LABELS = Object.freeze({
  Yamen: "县公署",
  WangShrine: "王家祠",
  AlarmTower: "警报楼",
  SquareFort: "方形炮楼院",
  PeoplesBookshop: "人民书店旧址",
  CatholicChurchInner: "天主堂",
});

// 名牌 HUD 每帧要投影上百个点，临时量放模块级免得逐帧新建。
const _hudView = new THREE.Matrix4();
const _hudPoint = new THREE.Vector3();

function Finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function Limit(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * 旧存档也要能安全读回：标记不是 DOM，名字只进入 CanvasTexture；坐标与尺寸则限在
 * 编辑器能实际看见/操作的范围，避免一份坏 JSON 造出几万米宽的透明面。
 */
export function NormalizeMapMarker(raw, fallbackId = 1) {
  const kind = raw && raw.kind === "road" ? "road" : "region";
  const rawRy = Finite(raw && raw.ry);
  const text = String(raw && raw.text != null ? raw.text : "未命名")
    .replace(/[\r\n\t]+/g, " ").trim().slice(0, 40) || "未命名";
  return {
    id: Math.max(1, Math.round(Finite(raw && raw.id, fallbackId))),
    kind,
    text,
    x: Limit(Finite(raw && raw.x), -2500, 2500),
    z: Limit(Finite(raw && raw.z), -2500, 2500),
    ry: ((rawRy % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2),
    w: Limit(Math.abs(Finite(raw && raw.w, kind === "road" ? 60 : 40)), 2, 800),
    d: Limit(Math.abs(Finite(raw && raw.d, kind === "road" ? 6 : 30)), 1, 500),
    source: raw && raw.source === "map" ? "map" : "custom",
    sourceId: raw && raw.sourceId ? String(raw.sourceId) : null,
  };
}

/**
 * 把 Data_Tengxian 的同一份图纸变成编辑器参考标记。这里不抄坐标：公共院落、城门、
 * 城外关厢和道路每次都从数据现算，图纸移动后标记不会留在旧位置。
 */
export function MapReferenceMarkers() {
  const markers = [];
  const addRegion = (text, sourceId, area, ry = 0) => {
    if (!area || !text) return;
    markers.push({
      kind: "region", text, x: area.x, z: area.z, ry,
      w: area.w || area.span || 18, d: area.d || area.span || 18,
      source: "map", sourceId,
    });
  };
  const addRoad = (text, sourceId, road) => {
    if (!road || !text) return;
    const vertical = road.axis === "z" || (road.axis == null && road.d > road.w);
    const from = road.from == null ? null : road.from;
    const to = road.to == null ? null : road.to;
    const length = from == null || to == null
      ? (vertical ? road.d : road.w)
      : Math.abs(to - from);
    const along = from == null || to == null ? null : (from + to) / 2;
    markers.push({
      kind: "road", text, source: "map", sourceId,
      x: from == null ? road.x : (vertical ? road.at : along),
      z: from == null ? road.z : (vertical ? along : road.at),
      ry: vertical ? Math.PI / 2 : 0,
      w: length, d: road.width || (vertical ? road.w : road.d),
    });
  };
  for (const feature of CITY_FEATURES) {
    if (!feature.label) continue;
    addRegion(feature.label, `feature:${feature.id}`, feature, feature.ry || 0);
  }
  for (const landmark of LANDMARKS) {
    const text = landmark.label || LANDMARK_LABELS[landmark.id];
    if (!text || landmark.kind === "paifang") continue;
    addRegion(text, `landmark:${landmark.id}`, landmark, landmark.ry || 0);
  }
  for (const street of STREETS) {
    addRoad(street.label, `street:${street.id}`, street);
  }

  // 四门和关外不是"环境背景"：Notion 城防图将它们与城内院落、街道并列标出。
  // 之前预设只取前三套城内表，因而编辑器会显得城外没有任何语义信息。
  for (const gate of GATES) {
    addRegion(`${({ East: "东门", West: "西门", South: "南门", North: "北门" })[gate.id]} · ${gate.name}`,
      `gate:${gate.id}`, { x: gate.x, z: gate.z, w: 44, d: 66 }, gate.ry || 0);
  }

  addRegion("西关", "outskirts:WestSuburb", { x: -414, z: 24, w: 132, d: 278 });
  addRegion("通信队", "outskirts:Communications", WEST_SUBURB.communications);
  addRegion("电灯厂", "outskirts:PowerPlant", WEST_SUBURB.powerPlant);
  addRegion("交易所", "outskirts:Exchange", WEST_SUBURB.exchange);
  addRegion("滕县站", "outskirts:Station", WEST_SUBURB.station);
  addRegion("第122师师部", "outskirts:Division122", WEST_SUBURB.division122, WEST_SUBURB.division122.ry || 0);
  addRoad(WEST_SUBURB.westStreet.label, "outskirts:WestStreet", {
    axis: "x", at: WEST_SUBURB.westStreet.z,
    from: WEST_SUBURB.westStreet.fromX, to: WEST_SUBURB.westStreet.toX,
    width: WEST_SUBURB.westStreet.width,
  });
  addRoad("津浦铁路", "outskirts:JinpuRailway", {
    axis: "z", at: WEST_SUBURB.railway.x, from: -400, to: 400, width: 8,
  });

  const eastBounds = EAST_SUBURB.bounds;
  // 标记层的深度上限是 500 m；东关纵深比这个大，故中段总览与各单项节点并存。
  addRegion("东关", "outskirts:EastSuburb", {
    x: (eastBounds.minX + eastBounds.maxX) / 2, z: (eastBounds.minZ + eastBounds.maxZ) / 2,
    w: eastBounds.maxX - eastBounds.minX, d: 500,
  });
  addRegion("东关寺院地", "outskirts:EastTemple", EAST_SUBURB.temple);
  for (const feature of EAST_SUBURB.features || []) {
    addRegion(feature.label, `outskirts:EastFeature:${feature.id}`, feature);
  }
  for (const lane of EAST_SUBURB.mapLanes || []) {
    if (lane.label) addRoad(lane.label, `outskirts:EastLane:${lane.id}`, lane);
  }

  const north = NORTH_SUBURB;
  addRegion("北关", "outskirts:NorthSuburb", {
    x: (north.stockade.fromX + north.stockade.toX) / 2,
    z: (north.street.fromZ + north.stockade.z) / 2,
    w: north.stockade.toX - north.stockade.fromX,
    d: Math.abs(north.stockade.z - north.street.fromZ),
  });
  addRoad(north.street.label, "outskirts:NorthStreet", {
    axis: "z", at: north.street.x, from: north.street.fromZ, to: north.street.toZ,
    width: north.street.width,
  });
  addRegion("北关庙", "outskirts:NorthTemple", north.temple);

  const outerLabels = {
    CatholicChurchSouth: "南关天主堂",
    HongdaoAcademy: "弘道院／神学院",
    LongquanPagoda: "龙泉塔",
  };
  for (const landmark of OUTER_LANDMARKS) {
    const text = outerLabels[landmark.id];
    if (text) addRegion(text, `outskirts:Landmark:${landmark.id}`, landmark, landmark.ry || 0);
  }
  return markers;
}

function RoundedRect(ctx, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 编辑器专用世界文字：范围线在地面，中文牌始终朝相机；不进碰撞和玩法场景。 */
export function BuildMapMarkerVisual(marker, {
  ownedGeometries = [], ownedMaterials = [], ownedTextures = [],
} = {}) {
  const group = new THREE.Group();
  group.name = `MapMarker_${marker.kind}_${marker.id}`;
  group.rotation.y = marker.ry || 0;
  const color = marker.kind === "road" ? 0x75a9c6 : 0xe0b062;
  const fill = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: marker.kind === "road" ? 0.16 : 0.06,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const line = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false,
  });
  MarkNoPrepass(fill);
  MarkNoPrepass(line);
  ownedMaterials.push(fill, line);

  const MakeBar = (w, d, x, z) => {
    const geometry = new THREE.BoxGeometry(w, 0.06, d);
    const mesh = new THREE.Mesh(geometry, line);
    mesh.position.set(x, 0.09, z);
    mesh.renderOrder = 890;
    group.add(mesh);
    ownedGeometries.push(geometry);
  };
  const planeGeometry = new THREE.PlaneGeometry(marker.w, marker.d);
  const plane = new THREE.Mesh(planeGeometry, fill);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = 0.06;
  plane.renderOrder = 888;
  group.add(plane);
  ownedGeometries.push(planeGeometry);
  if (marker.kind === "road") {
    MakeBar(marker.w, Math.min(0.42, marker.d * 0.16), 0, 0);
    MakeBar(0.34, marker.d + 0.8, -marker.w / 2, 0);
    MakeBar(0.34, marker.d + 0.8, marker.w / 2, 0);
  } else {
    const edge = Limit(Math.min(marker.w, marker.d) * 0.025, 0.28, 0.72);
    MakeBar(marker.w + edge, edge, 0, -marker.d / 2);
    MakeBar(marker.w + edge, edge, 0, marker.d / 2);
    MakeBar(edge, marker.d + edge, -marker.w / 2, 0);
    MakeBar(edge, marker.d + edge, marker.w / 2, 0);
  }

  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  RoundedRect(ctx, 18, 18, 988, 220, 24);
  ctx.fillStyle = "rgba(12, 13, 13, 0.88)";
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = marker.kind === "road" ? "#75a9c6" : "#e0b062";
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = marker.kind === "road" ? "#a7cee1" : "#f0cc8b";
  ctx.font = "600 38px 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif";
  ctx.fillText(marker.kind === "road" ? "道路" : "区域", 512, 67);
  let fontSize = 92;
  do {
    ctx.font = `700 ${fontSize}px 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif`;
    if (ctx.measureText(marker.text).width <= 900) break;
    fontSize -= 6;
  } while (fontSize > 42);
  ctx.fillStyle = "#f5f0e5";
  ctx.fillText(marker.text, 512, 158);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const material = new THREE.SpriteMaterial({
    map: texture, transparent: true, depthTest: false, depthWrite: false, fog: false,
  });
  MarkNoPrepass(material);
  const sprite = new THREE.Sprite(material);
  sprite.name = `MapMarkerText_${marker.id}`;
  sprite.center.set(0.5, 0);
  const textWidth = Limit(marker.text.length * 3.8 + 13, 18, marker.kind === "road" ? 52 : 44);
  sprite.scale.set(textWidth, textWidth * 0.25, 1);
  sprite.position.y = marker.kind === "road" ? 5.0 : 7.5;
  sprite.renderOrder = 900;
  group.add(sprite);
  ownedMaterials.push(material);
  ownedTextures.push(texture);
  return group;
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
      burnt: it.burnt, seed: it.seed,
    }),
  },
  {
    id: "RoomBlock", name: "房屋（单体）", cat: "建筑", damageStates: true,
    uses: ["ry", "w", "d", "h", "damage"],
    defaults: { w: 9, d: 6, h: 3.0, damage: 0.15 },
    build: (sink, it) => AddRoomBlock(sink, {
      x: it.x, z: it.z, ry: it.ry, width: it.w, depth: it.d,
      eaveY: it.h, ridgeY: it.h * 1.7, seed: it.seed, damage: it.damage,
      burnt: it.burnt, facing: 1, bays: 3,
    }),
  },
  {
    id: "Gatehouse", name: "院门楼", cat: "建筑", damageStates: true,
    uses: ["ry", "w", "damage"],
    defaults: { w: 1.5, damage: 0.1 },
    build: (sink, it) => AddGatehouse(sink, {
      x: it.x, z: it.z, ry: it.ry, seed: it.seed, damage: it.damage,
      burnt: it.burnt, openW: it.w,
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
      seed: it.seed, damage: it.damage,
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

/** 笔刷的落差场：中间满、边缘平滑到 0（余弦），不是硬圆盘。 */
function BrushFalloff(distance, radius) {
  if (distance >= radius) return 0;
  return 0.5 + 0.5 * Math.cos((distance / radius) * Math.PI);
}

/**
 * 用正片同一套生成器构建一个可放置构件的可见节点。
 * 场景关卡编辑器与构件库预览器共用，避免预览器另抄一份“看起来差不多”的模型。
 */
export function BuildPlaceableVisual(target, entry, item, {
  library, modelDocs = new Map(), ownedGeometries = [],
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
    ? { ...item, damage: damageState.damage, burnt: damageState.burnt }
    : item;
  const resolve = DamageMaterialResolver(damageState, library);
  const sink = new BuildSink();
  try {
    entry.build(sink, buildItem);
  } catch (error) {
    console.warn(`[SceneEditor] ${entry.id} 建不出来：${String(error).slice(0, 160)}`);
  }
  FlushSinkProps(sink, target, library, ownedGeometries, resolve);
  const flushed = sink.Flush(target, library, { resolve });
  for (const mesh of flushed) ownedGeometries.push(mesh.geometry);
  let meshes = 0;
  target.traverse((node) => { if (node.isMesh) meshes += 1; });
  return { loaded: true, colliders: sink.colliders, meshes, damageState: damageState?.id || null };
}

export class SceneEditor {
  static id = "scene";
  static label = "场景关卡";
  static hint = "切换关卡切片、自由飞行并布设 Prop；不编辑地形";
  static panelTitle = "场景关卡编辑器";
  static panelSub = "WASD+QE 飞 · 左键拖转头";

  constructor(host) {
    this.host = host;
    this.panel = null;
    this.cameraMode = "fly";
    this.supportsTerrain = false;

    this.items = [];
    this.nextId = 1;
    this.selected = null;
    this.markers = [];
    this.nextMarkerId = 1;
    this.selectedMarker = null;
    this.markerDraft = { kind: "region", text: "未命名区域", ry: 0, w: 40, d: 30 };
    this.markersVisible = true;
    // 布防图名牌走屏幕空间 HUD（DOM），不走世界牌：世界牌在俯瞰机位下只有几个
    // 像素高，「看整张布防图」这个最常用的姿势里等于什么都没显示。
    this.hudNamesVisible = true;
    this.hudLayer = null;
    this.hudReference = null;   // MapReferenceMarkers() 的缓存 —— 图纸是静态数据，算一次就够
    this.paletteId = PLACEABLE[0].id;
    this.cat = "景观";
    this.mode = "look";         // look | place | mark | move | terrain
    // 半径的下限是被网格分辨率定死的：城内台地 636 m 铺 116×116，约 5.5 m 一格。
    // 半径 8 只圈得到三四个顶点，刷出来是几个尖，不是坑。14 起步才有形。
    this.brush = { radius: 14, strength: 0.6, kind: "raise" };
    this.terrainOps = [];
    this.root = new THREE.Group();
    this.root.name = "EditorScenePlacements";
    this.ownedGeometries = [];
    this.ownedMaterials = [];
    this.ownedTextures = [];
    this.colliderTag = "editorPlacement";
    /** 摆件在物理世界里的碰撞体句柄（RebuildAll 加、DropColliders 撤）。 */
    this.physicsHandles = [];
    /** 场景 JSON 布设出来的持续特效句柄；ClearBuilt 必须与几何一起撤。 */
    this.effectHandles = [];
    /**
     * 上面那些句柄属于**哪一个**物理世界。
     * 句柄是索引，换关之后世界整个换了一份，拿旧索引去新世界里删
     * 等于随手删掉一堵真墙。所以撤销之前要先认一下东家。
     */
    this.physicsWorld = null;
    this.modelDocs = new Map();
    this.normalsDirty = new Set();
    this.normalsTimer = 0;
    this.groundPatched = null;
    this.measure = { calls: 0, triangles: 0 };
    this.paramSliders = {};

    // --- 笔刷的「一笔」 -----------------------------------------------------
    // 一次按下到抬起合成**一个** terrainOp，不是每来一个 mousemove 就推一个。
    // 每个事件推一个的代价是双份的：GroundHeight 每次查询要遍历整张 op 表
    //（AI 与玩家每帧查几百次），而每个 op 又要把两张地面网格的十几万个顶点
    // 全走一遍 —— 实测拖一下 12 个事件花了 554 ms，手感就是「刷不动」。
    this.stroke = null;          // { op, kind }
    this.paintAt = null;         // 本帧要落笔的屏幕坐标，Update 里统一处理
    this.groundMeshes = [];      // 缓存的两张地面网格
    this.gizmo = null;           // 落点指示（环 + 竖针）
    this.hover = null;           // 最近一次拾取结果
    this.lastTouched = null;     // 上一笔真的动到了多少个地面顶点
    this.groundedObjectsDirty = false;
  }

  get field() { return this.host.game.battlefield; }

  // -------------------------------------------------------------------------
  // 生命周期
  // -------------------------------------------------------------------------

  Enter(root) {
    // 菜单交接由 EditorSuite.Open 统一完成；不能只让场景工具单独收菜单，
    // 否则摄影棚、构件库等编辑器仍会把暂停菜单留在背景里。
    this.host.scene.add(this.root);
    this.host.flycam.Open();
    this.ApplyDefaultProjection();
    this.host.SetViewmodelVisible(false);
    // 名牌层放在最前面：面板、提示条都是后来的兄弟节点，天然压在名牌上面。
    this.hudLayer = El("div", "edMapHud");
    root.insertBefore(this.hudLayer, root.firstChild);
    this.panel = Panel({
      title: this.constructor.panelTitle || this.constructor.label,
      sub: this.constructor.panelSub || "WASD+QE 飞",
      variant: "work wide", onClose: () => this.host.Close(),
    });
    root.appendChild(this.panel.root);
    this.BuildUi(this.panel.body);
    this.BuildGizmo();
    this.PatchGround();
    this.LoadModels();
    // draw call 要按整帧量（一帧十几个 pass），关掉自动清零、每帧自己读自己清
    this.host.renderer.info.autoReset = false;
    this.RestoreSession();
    return this;
  }

  Exit() {
    this.RememberDocument();
    this.ClearBuilt();
    this.DisposeGizmo();
    this.host.scene.remove(this.root);
    this.UnpatchGround();
    this.host.renderer.info.autoReset = true;
    this.host.flycam.Close();
    this.host.SetViewmodelVisible(true);
    if (this.hudLayer) this.hudLayer.remove();
    this.hudLayer = null;
    if (this.panel) this.panel.root.remove();
    this.panel = null;
  }

  /**
   * 出厂投影。必须在 BuildUi 之前调用 —— 投影控件是拿相机当前值初始化滑杆的，
   * 顺序反了滑杆会停在战斗值上，与实际画面对不上。
   */
  ApplyDefaultProjection() {
    const camera = this.host.camera;
    camera.far = EDITOR_DEFAULT_FAR;
    camera.fov = EDITOR_DEFAULT_FOV;
    camera.updateProjectionMatrix();
  }

  async LoadModels() {
    for (const id of MODEL_PLACEABLE) {
      if (this.modelDocs.has(id)) continue;
      const doc = await LoadDocument(MeshUrl(id));
      if (doc) this.modelDocs.set(id, doc);
    }
    // 载入前就摆下的模型这时候才补建出来
    if (this.items.some((it) => this.Entry(it.type) && this.Entry(it.type).model)) this.RebuildAll();
  }

  // -------------------------------------------------------------------------
  // 界面
  // -------------------------------------------------------------------------

  BuildUi(body) {
    this.BuildLevelUi(body);
    this.BuildCameraUi(body, ["look", "place", "mark", "move"]);
    this.BuildPlacementUi(body);
    this.BuildMarkerUi(body);
    this.BuildStorageUi(body);
    this.BuildStatsUi(body);
  }

  BuildLevelUi(body) {
    const level = Section(body, "关卡切片");
    this.levelList = ListBox(level, {
      height: 132,
      onPick: (id) => {
        // 新序章是过场场景，不是 PHASES[0]。以前编辑器只在 PHASES 里查找，
        // 于是用户点「序章」实际加载的是旧的 L0_界河战斗切片。
        if (id === PROLOGUE_SCENE_ID) {
          this.host.game.OpenProloguePreview?.();
          return;
        }
        const index = PHASES.findIndex((p) => p.id === id);
        if (index >= 0) this.host.game.JumpToLevel(index);
      },
    });
    this.levelList.Fill([PROLOGUE_SCENE, ...PHASES.map((p) => ({
      id: p.id, name: p.label, tail: p.date || "", title: p.brief || "",
    }))]);
    this.levelFacts = Facts(level);
  }

  BuildCameraUi(body, modes = ["look"]) {
    const cam = Section(body, "相机");
    const labels = {
      look: "看", place: "放置", mark: "文本标记", move: "挪动所选", terrain: "地形笔刷",
    };
    this.modeChips = Chips(cam, modes.map((value) => ({ value, label: labels[value] || value })),
      this.mode, (v) => this.SetMode(v));
    Slider(cam, {
      label: "飞行速度", min: 1, max: 80, step: 1, value: 14,
      format: (v) => `${v.toFixed(0)} m/s`,
      onInput: (v) => { this.host.flycam.speed = v; },
    });
    this.projectionControls = CameraProjectionControls(cam, this.host.camera);
    ButtonRow(cam, [
      { label: "回到玩家", onClick: () => this.GoToPlayer() },
      { label: "把玩家挪来", onClick: () => this.BringPlayer() },
      { label: "俯瞰当前切片", onClick: () => this.TopDown() },
    ]);
  }

  BuildPlacementUi(body) {
    const put = Section(body, "构件库");
    Chips(put, PLACEABLE_CATEGORIES, this.cat, (v) => { this.cat = v; this.FillPalette(); });
    this.palette = ListBox(put, { height: 150, onPick: (id) => this.SetPalette(id) });
    this.FillPalette();
    this.paramBox = El("div", "b");
    put.appendChild(this.paramBox);
    this.BuildParams();

    const list = Section(body, "已放置");
    this.placedList = ListBox(list, {
      height: 120,
      onPick: (id) => {
        this.selected = this.items.find((it) => String(it.id) === String(id)) || null;
        this.selectedMarker = null;
        this.RefreshMarkerUi();
      },
    });
    ButtonRow(list, [
      { label: "撤销最后一个", onClick: () => this.Undo() },
      { label: "删除所选", onClick: () => this.DeleteSelected(), cls: "danger" },
      { label: "清空", onClick: () => this.ClearAll(), cls: "danger" },
    ]);
    const solid = El("div", "edBtns");
    list.appendChild(solid);
    this.solidToggle = Toggle(solid, "碰撞盒生效", true, () => this.RebuildAll());
  }

  BuildMarkerUi(body) {
    const mark = Section(body, "文本标记");
    this.markerKindChips = Chips(mark, [
      { value: "region", label: "区域" },
      { value: "road", label: "道路" },
    ], this.markerDraft.kind, (kind) => {
      this.markerDraft.kind = kind;
      if (this.selectedMarker) {
        this.selectedMarker.kind = kind;
        this.RebuildAll();
      }
    });
    this.markerText = El("input");
    this.markerText.type = "text";
    this.markerText.maxLength = 40;
    this.markerText.placeholder = "如：滕文中学旧址 / 火神庙东街";
    this.markerText.value = this.markerDraft.text;
    for (const type of ["keydown", "keyup", "keypress"]) {
      this.markerText.addEventListener(type, (event) => event.stopPropagation());
    }
    this.markerText.addEventListener("input", () => {
      this.markerDraft.text = this.markerText.value;
      if (this.selectedMarker) {
        this.selectedMarker.text = this.markerText.value.trim().slice(0, 40) || "未命名";
        this.RebuildAll();
      }
    });
    Row(mark, "名称", this.markerText);
    const UpdateNumber = (key, value) => {
      this.markerDraft[key] = value;
      if (this.selectedMarker) {
        this.selectedMarker[key] = value;
        this.RebuildAll();
      }
    };
    this.markerWidth = Slider(mark, {
      label: "长度 / 宽", min: 2, max: 320, step: 1, value: this.markerDraft.w,
      format: (value) => `${value.toFixed(0)} m`, onInput: (value) => UpdateNumber("w", value),
    });
    this.markerDepth = Slider(mark, {
      label: "深度 / 路宽", min: 1, max: 160, step: 1, value: this.markerDraft.d,
      format: (value) => `${value.toFixed(0)} m`, onInput: (value) => UpdateNumber("d", value),
    });
    this.markerRotation = Slider(mark, {
      label: "朝向", min: 0, max: Math.PI * 2, step: 0.02, value: this.markerDraft.ry,
      format: (value) => `${(value * 180 / Math.PI).toFixed(0)}°`,
      onInput: (value) => UpdateNumber("ry", value),
    });
    ButtonRow(mark, [
      { label: "下一次点击放标记", onClick: () => this.ArmMarker() },
      { label: "载入滕县图纸标记", onClick: () => this.LoadMapReferences() },
    ]);
    const list = El("div", "b");
    mark.appendChild(list);
    this.markerList = ListBox(list, {
      height: 132,
      onPick: (id) => {
        this.selectedMarker = this.markers.find((marker) => String(marker.id) === String(id)) || null;
        this.selected = null;
        this.RefreshMarkerUi();
      },
    });
    ButtonRow(mark, [
      { label: "删除所选标记", onClick: () => this.DeleteSelectedMarker(), cls: "danger" },
      { label: "清空标记", onClick: () => this.ClearMarkers(), cls: "danger" },
    ]);
    const toggles = El("div", "edBtns");
    mark.appendChild(toggles);
    this.markerToggle = Toggle(toggles, "视口显示", this.markersVisible, (value) => {
      this.markersVisible = value;
      this.RebuildAll();
    });
    this.hudToggle = Toggle(toggles, "名牌 HUD", this.hudNamesVisible, (value) => {
      this.hudNamesVisible = value;
      this.UpdateHudLabels();
    });
    Note(mark, "区域标记画占地框，道路标记画带宽走向，随场景 JSON 存取。“载入滕县图纸标记”直接读 Data_Tengxian。", true);
    Note(mark, "「名牌 HUD」把布防图（Data_Tengxian）与已放标记的名字直接投在屏幕上，"
      + "任何机位高度都读得清；「视口显示」管的是近处才看得见的世界牌与占地框。");
    this.RefreshMarkerUi();
  }

  BuildTerrainUi(body) {
    const terrain = Section(body, "地形笔刷");
    Chips(terrain, [
      { value: "raise", label: "抬高" },
      { value: "lower", label: "压低" },
      { value: "crater", label: "弹坑" },
      { value: "flatten", label: "抹平" },
    ], this.brush.kind, (v) => { this.brush.kind = v; });
    Slider(terrain, {
      label: "半径", min: 3, max: 60, step: 0.5, value: this.brush.radius,
      format: (v) => `${v.toFixed(1)} m`,
      onInput: (v) => { this.brush.radius = v; },
    });
    Slider(terrain, {
      label: "力度", min: 0.05, max: 3, step: 0.05, value: this.brush.strength,
      format: (v) => `${v.toFixed(2)} m/s`,
      onInput: (v) => { this.brush.strength = v; },
    });
    ButtonRow(terrain, [
      { label: "撤销一笔", onClick: () => this.UndoTerrain() },
      { label: "全部还原", onClick: () => this.ResetTerrain(), cls: "danger" },
    ]);
    Note(terrain, "笔刷同时改**网格顶点**与**解析高程**：看得见的地和踩得到的地一起变。", true);
    Note(terrain, "刷得动的只有**城内台地**（|x|、|z| < 318 m，约 5.5 m 一个顶点）。"
      + "城外那张地面是绕城的方环，七百米以外每两百米才一个顶点 —— "
      + "在那儿落笔会被拒绝并提示，不会偷偷只改解析高程。");
    Note(terrain, "已放置的构件会跟着重采样地高，抬升/下挖都不会悬空或埋进地里。", true);
  }

  BuildStorageUi(body) {
    const io = Section(body, "存取");
    ButtonRow(io, [
      { label: "存到本地", onClick: () => this.Save() },
      { label: "读回", onClick: () => this.Restore(true) },
      { label: "导出到框里", onClick: () => { this.io.value = JSON.stringify(this.Serialize()); } },
      { label: "从框里导入", onClick: () => this.Import(this.io.value) },
    ]);
    this.io = TextArea(io, {
      rows: 3, placeholder: "{ \"v\":2, \"items\":[…], \"markers\":[…], \"terrain\":[…] }",
    });
    this.ioNote = Note(io, `本地存档键：${SAVE_KEY}`);
  }

  BuildStatsUi(body) {
    const stats = Section(body, "取证");
    this.facts = Facts(stats);
  }

  Entry(id) { return PLACEABLE.find((p) => p.id === id) || null; }

  FillPalette() {
    const items = PLACEABLE.filter((p) => p.cat === this.cat);
    this.palette.Fill(items.map((p) => ({
      id: p.id, name: p.name, tail: p.effect ? "vfx" : p.model ? "tzm" : "程序化",
      title: p.effect ? p.note : p.model && MESHES[p.model] ? MESHES[p.model].note : "",
    })));
    if (items.length && !items.some((p) => p.id === this.paletteId)) this.SetPalette(items[0].id);
    this.palette.Select(this.paletteId);
  }

  SetPalette(id) {
    this.paletteId = id;
    this.BuildParams();
  }

  /** 参数滑杆按当前构件重画 —— 只画它用得上的那几根。 */
  BuildParams() {
    if (!this.paramBox) return;
    this.paramBox.innerHTML = "";
    this.paramSliders = {};
    const entry = this.Entry(this.paletteId);
    if (!entry) return;
    const uses = entry.model ? ["ry", "scale", "h"] : entry.uses;
    const spec = {
      ry: { label: "朝向", min: 0, max: 6.283, step: 0.02, def: 0, fmt: (v) => `${(v * 57.3).toFixed(0)}°` },
      w: { label: "宽 / 长", min: 0.5, max: 60, step: 0.1, def: 8 },
      d: { label: "深 / 厚", min: 0.5, max: 60, step: 0.1, def: 6 },
      h: { label: "高", min: 0, max: 24, step: 0.1, def: 3 },
      scale: { label: "缩放", min: 0.2, max: 4, step: 0.05, def: 1 },
      damage: { label: "破损", min: 0, max: 1, step: 0.02, def: 0.2 },
    };
    this.paramValues = { ry: 0, seed: `e${this.nextId}` };
    for (const key of uses) {
      const s = spec[key];
      if (!s) continue;
      const value = entry.defaults[key] != null ? entry.defaults[key] : s.def;
      this.paramValues[key] = value;
      this.paramSliders[key] = Slider(this.paramBox, {
        label: s.label, min: s.min, max: s.max, step: s.step, value,
        format: s.fmt || null,
        onInput: (v) => {
          this.paramValues[key] = v;
          // 选中了某一个就实时改它 —— 「摆好了再调一版」是最常用的动作
          if (this.selected && this.selected.type === this.paletteId) {
            this.selected[key] = v;
            this.RebuildAll();
          }
        },
      });
    }
    Slider(this.paramBox, {
      label: "种子", min: 0, max: 60, step: 1, value: 0,
      format: (v) => v.toFixed(0),
      onInput: (v) => { this.paramValues.seed = `e${v}`; },
    });
  }

  SetMode(mode) {
    if (mode === "terrain" && !this.supportsTerrain) {
      this.mode = "look";
      this.host.SetHint("场景关卡编辑器不改地形；请切换到“地形编辑器”");
      return;
    }
    this.mode = mode;
    if (this.modeChips) this.modeChips.Set(mode);
    // 屏幕正中那个十字**不能用** —— 拾取走的是鼠标位置，两者压根不是一个点，
    // 画着它反而让人对着十字点。落点改用世界里那个环（RefreshGizmo）。
    this.host.SetCrosshair(false);
    const text = {
      look: "左键拖转视角 · WASD+QE 飞 · 滚轮调速",
      place: "左键点地面放一个（黄环就是落点）；右键拖转视角",
      mark: "左键点地面放下区域/道路文字标记；右键拖转视角",
      move: "先选一个构件或文字标记，再左键点目标位置",
      terrain: "左键按住涂（这时候左键不转视角）；Shift 反向；右键拖转视角",
    }[mode];
    this.modeHint = text;
    this.host.SetHint(text);
  }

  // -------------------------------------------------------------------------
  // 相机
  // -------------------------------------------------------------------------

  /**
   * 回到玩家站的地方。
   *
   * **俯仰不许归零。** 归零 = 正对地平线，而拾取是「沿射线找地面」：
   * 水平射线永远碰不到平地，于是屏幕上半边点哪儿都放不下东西，还没有任何报错。
   * 眼高才 1.6 m，压 25° 下去地面才落在准心附近够得着的距离上。
   * 顺带抬 2 m：站在人眼高度上摆院子，看到的全是自己脚底下那一块。
   */
  GoToPlayer() {
    const player = this.host.game.player;
    if (!player) return;
    const camera = this.host.camera;
    const eye = player.EyePosition ? player.EyePosition : player.position;
    camera.position.set(eye.x, eye.y + 2.0, eye.z);
    this.host.flycam.yaw = player.yaw || 0;
    this.host.flycam.pitch = -0.44;
    this.host.SetHint("回到玩家 · 镜头已压低，地面在准心下方");
  }

  BringPlayer() {
    const player = this.host.game.player;
    const camera = this.host.camera;
    if (!player || !player.Spawn) return;
    player.Spawn(camera.position.x, camera.position.z, this.host.flycam.yaw);
    this.host.SetHint("玩家已挪到当前机位");
  }

  TopDown() {
    const camera = this.host.camera;
    const bounds = this.field ? this.field.bounds : { minX: -300, maxX: 300, minZ: -300, maxZ: 300 };
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    const halfWidth = (bounds.maxX - bounds.minX) / 2;
    const halfDepth = (bounds.maxZ - bounds.minZ) / 2;
    // 不是拿最大边长拍脑袋抬高：横向能装多少还取决于画布宽高比与当前 FOV。
    // 留 12% 边缘余量，面板盖住一侧画布时城界也不会被按钮压掉。
    const halfFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
    const tanHalfFov = Math.max(0.08, Math.tan(halfFov));
    const aspect = Math.max(0.5, camera.aspect || 16 / 9);
    const height = Math.max(80,
      halfDepth * 1.12 / tanHalfFov,
      halfWidth * 1.12 / (tanHalfFov * aspect));
    // FlyCam 下一帧会按 pitch 重写 quaternion，所以这里把相机放到与 -1.5 rad
    // 俯角完全对应的位置：看向的仍是切片中心，不再像旧版那样把中心推到画面下沿。
    const pitch = -1.5;
    const zOffset = height / Math.tan(-pitch);
    camera.position.set(cx, height, cz + zOffset);
    this.host.flycam.yaw = 0;
    this.host.flycam.pitch = pitch;
    camera.rotation.set(pitch, 0, 0, "YXZ");
    // 战斗远平面只有 400/620 m；俯瞰相机常在一公里上下，不临时放远就会把
    // 已生成的西关整片视锥剔除。FlyCam.Close 会原样恢复进入编辑器前的 far。
    const cornerDistance = Math.hypot(height, halfWidth, halfDepth);
    camera.far = Math.max(camera.far, cornerDistance * 1.18);
    camera.updateProjectionMatrix();
    if (this.projectionControls) this.projectionControls.far.Set(camera.far);
    this.host.SetHint("已俯瞰当前关卡切片 · 退出编辑器后恢复战斗相机");
  }

  // -------------------------------------------------------------------------
  // 视口交互（由 EditorSuite 转发）
  // -------------------------------------------------------------------------

  Pick(event) {
    const camera = this.host.camera;
    const direction = ScreenRay(camera, this.host.canvas, event.clientX, event.clientY);
    // 射程必须盖住俯瞰机位。TopDown 常在五六百米高，600 m 定值只够到画面正中一小片：
    // 边缘一点就报「没有地面」，其实是射线量程先用完了 —— 表现为「标记怎么点都放不下」。
    return PickWorld(this.field, camera.position, direction, {
      maxDist: Math.max(600, camera.far),
    });
  }

  /**
   * 拖动。**地形模式下左键是「涂」不是「转头」。**
   *
   * 原来两件事绑在同一个键上：按住左键拖，OnDrag 转相机、OnPaint 同时落笔，
   * 于是刷子跟着视角一起跑 —— 手感是「刷不动」「刷到别处去了」。
   * 右键在任何模式下都是转头，所以地形模式下也不会失去镜头控制。
   */
  OnDrag(dx, dy, button) {
    if (this.mode === "terrain" && button === 0) return;
    this.host.flycam.Look(dx, dy);
  }

  /** 按下那一刻就起笔：按下去不动（不产生 mousemove）也该出一个坑。 */
  OnPress(event, button) {
    if (this.mode !== "terrain" || button !== 0) return;
    this.stroke = null;
    this.paintAt = { x: event.clientX, y: event.clientY, shift: event.shiftKey };
  }

  OnPaint(event, button) {
    if (this.mode !== "terrain" || button !== 0) return;
    // 只记下位置，真正落笔交给 Update —— 一帧里落一次。
    // 每个 mousemove 落一次的话，一次拖动会推十几个 op，
    // 每个 op 都要把两张地面网格的十几万顶点走一遍。
    this.paintAt = { x: event.clientX, y: event.clientY, shift: event.shiftKey };
  }

  OnClick(event, button) {
    if (button !== 0) return;
    if (this.mode === "terrain") {
      // 单击（没拖动）也该落一笔。OnPress 已经记过位置了，这里不重复。
      return;
    }
    const hit = this.Pick(event);
    if (!hit) { this.host.SetHint("准心在地平线以上：那个方向上没有地面"); return; }
    if (this.mode === "place") this.Place(hit.x, hit.z);
    else if (this.mode === "mark") this.PlaceMarker(hit.x, hit.z);
    else if (this.mode === "move" && (this.selected || this.selectedMarker)) {
      const target = this.selectedMarker || this.selected;
      target.x = hit.x; target.z = hit.z;
      this.RebuildAll();
    }
  }

  // -------------------------------------------------------------------------
  // 落点指示
  //
  // 没有它的时候，「点下去会落在哪」只能靠猜：屏幕中间那个十字与鼠标位置压根
  // 不是一回事，而正对地平线时射线根本打不到地 —— 点了没反应，也不知道为什么。
  // 环画在真实落点上，半径就是笔刷半径；打不到地的时候整个藏起来。
  // -------------------------------------------------------------------------

  BuildGizmo() {
    const group = new THREE.Group();
    group.name = "EditorSceneGizmo";
    const Mat = (hex) => {
      const material = new THREE.MeshBasicMaterial({
        color: hex, transparent: true, opacity: 0.85, depthTest: false,
      });
      MarkNoPrepass(material);
      return material;
    };
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.02, 6, 48), Mat(0xe0b062));
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 900;
    const pin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.2, 0.04), Mat(0xe0b062));
    pin.position.y = 0.6;
    pin.renderOrder = 900;
    group.add(ring);
    group.add(pin);
    group.visible = false;
    this.host.scene.add(group);
    this.gizmo = { group, ring, pin };
  }

  DisposeGizmo() {
    if (!this.gizmo) return;
    this.host.scene.remove(this.gizmo.group);
    for (const mesh of [this.gizmo.ring, this.gizmo.pin]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.gizmo = null;
  }

  RefreshGizmo() {
    if (!this.gizmo) return;
    const viewport = this.host.viewport;
    if (this.mode === "look" || !viewport || !viewport.over) {
      this.gizmo.group.visible = false;
      this.hover = null;
      return;
    }
    const hit = this.Pick({ clientX: viewport.x, clientY: viewport.y });
    this.hover = hit;
    this.gizmo.group.visible = !!hit;
    // 打不到地的时候必须当场说出来。这是「点了没反应」那一类事故里最气人的一种：
    // 眼高才 1.6 m，准心一抬到地平线以上射线就再也碰不到地面，
    // 而屏幕上没有任何东西告诉你这件事。
    this.host.SetHint(hit ? this.modeHint : "准心在地平线以上：往下压一点");
    if (!hit) return;
    const radius = this.mode === "terrain" ? this.brush.radius
      : this.mode === "mark" ? Math.max(1.5, Math.min(this.markerDraft.w, this.markerDraft.d) * 0.12)
        : 0.9;
    this.gizmo.group.position.set(hit.x, hit.y + 0.02, hit.z);
    this.gizmo.ring.scale.setScalar(radius);
    this.gizmo.pin.visible = this.mode !== "terrain";
  }

  // -------------------------------------------------------------------------
  // 放置
  // -------------------------------------------------------------------------

  ArmMarker() {
    const text = String(this.markerText ? this.markerText.value : this.markerDraft.text).trim();
    if (!text) {
      this.host.SetHint("先填写区域名或道路名");
      return;
    }
    this.markerDraft.text = text.slice(0, 40);
    this.SetMode("mark");
  }

  PlaceMarker(x, z) {
    if (this.markers.length >= MAX_MAP_MARKERS) {
      this.host.SetHint(`标记已到上限（${MAX_MAP_MARKERS} 个），请先删除或导出整理`);
      return;
    }
    const marker = NormalizeMapMarker({
      ...this.markerDraft, id: this.nextMarkerId, x, z, source: "custom",
    }, this.nextMarkerId);
    this.nextMarkerId += 1;
    this.markers.push(marker);
    this.selectedMarker = marker;
    this.selected = null;
    this.RebuildAll();
    this.RefreshMarkerUi();
  }

  LoadMapReferences() {
    const custom = this.markers.filter((marker) => marker.source !== "map").slice(0, MAX_MAP_MARKERS);
    let id = custom.reduce((max, marker) => Math.max(max, marker.id || 0), 0) + 1;
    const room = Math.max(0, MAX_MAP_MARKERS - custom.length);
    const reference = MapReferenceMarkers().slice(0, room)
      .map((marker) => NormalizeMapMarker({ ...marker, id: id++ }, id));
    this.markers = [...custom, ...reference];
    this.nextMarkerId = id;
    this.selectedMarker = null;
    this.RebuildAll();
    this.RefreshMarkerUi();
    this.host.SetHint(`已从图纸载入 ${reference.length} 个公共院落 / 道路标记`);
  }

  DeleteSelectedMarker() {
    if (!this.selectedMarker) return;
    this.markers = this.markers.filter((marker) => marker !== this.selectedMarker);
    this.selectedMarker = null;
    this.RebuildAll();
    this.RefreshMarkerUi();
  }

  ClearMarkers() {
    this.markers = [];
    this.selectedMarker = null;
    this.nextMarkerId = 1;
    this.RebuildAll();
    this.RefreshMarkerUi();
  }

  RefreshMarkerUi() {
    if (this.markerList) {
      this.markerList.Fill(this.markers.map((marker) => ({
        id: String(marker.id), name: marker.text,
        tail: `${marker.kind === "road" ? "道路" : "区域"} · ${marker.x.toFixed(0)}, ${marker.z.toFixed(0)}`,
        title: marker.source === "map" ? `图纸：${marker.sourceId}` : "自定义标记",
      })));
      if (this.selectedMarker) this.markerList.Select(String(this.selectedMarker.id));
    }
    const marker = this.selectedMarker;
    if (!marker) return;
    this.markerDraft = {
      kind: marker.kind, text: marker.text, ry: marker.ry, w: marker.w, d: marker.d,
    };
    if (this.markerText) this.markerText.value = marker.text;
    if (this.markerKindChips) this.markerKindChips.Set(marker.kind);
    if (this.markerWidth) this.markerWidth.Set(marker.w);
    if (this.markerDepth) this.markerDepth.Set(marker.d);
    if (this.markerRotation) this.markerRotation.Set(marker.ry);
  }

  /**
   * 布防图名牌：屏幕空间 HUD。
   *
   * 为什么不用世界牌解决：CanvasTexture Sprite 是定死的世界尺寸（十几到五十米宽），
   * 在 500 m 俯瞰机位下只剩几个像素 ——「看整张布防图」时等于什么都没显示，
   * 用户的原话是「文本标记怎么都没有生效」。名字要随时读得清就得走 DOM：
   * 每帧把**文档里的标记 + Data_Tengxian 布防图参考名**投到屏幕坐标上。
   * 参考名按 sourceId 与文档去重，「载入滕县图纸标记」之后不会出双份；
   * 近的先占屏幕，挤在一起的只留最近那张（选中的标记永远保留）。
   */
  UpdateHudLabels() {
    const layer = this.hudLayer;
    if (!layer) return;
    if (!this.hudNamesVisible) {
      if (layer.childElementCount) layer.replaceChildren();
      return;
    }
    const camera = this.host.camera;
    const canvas = this.host.canvas;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const field = this.field;

    const entries = [];
    const seen = new Set();
    for (const marker of this.markers) {
      entries.push({ text: marker.text, kind: marker.kind, x: marker.x, z: marker.z, marker });
      if (marker.sourceId) seen.add(marker.sourceId);
    }
    if (!this.hudReference) this.hudReference = MapReferenceMarkers();
    for (const ref of this.hudReference) {
      if (seen.has(ref.sourceId)) continue;
      entries.push({ text: ref.text, kind: ref.kind, x: ref.x, z: ref.z, ref: true });
    }

    // Update() 跑在渲染之前，camera.matrixWorldInverse 还是上一帧的 ——
    // 拿它投影，飞得快时名牌整层拖影。自己求逆才是本帧机位。
    camera.updateMatrixWorld();
    _hudView.copy(camera.matrixWorld).invert();
    const projected = [];
    for (const entry of entries) {
      const groundY = field ? field.GroundHeight(entry.x, entry.z) : 0;
      _hudPoint.set(entry.x, groundY + 2.2, entry.z).applyMatrix4(_hudView);
      if (_hudPoint.z > -1) continue;              // 相机身后 / 贴脸的不投
      const depth = -_hudPoint.z;
      _hudPoint.applyMatrix4(camera.projectionMatrix);
      if (Math.abs(_hudPoint.x) > 1.04 || Math.abs(_hudPoint.y) > 1.04) continue;
      projected.push({
        entry, depth,
        sx: (_hudPoint.x * 0.5 + 0.5) * width,
        sy: (0.5 - _hudPoint.y * 0.5) * height,
      });
    }
    projected.sort((a, b) => a.depth - b.depth);
    const placed = [];
    let used = 0;
    for (const item of projected) {
      const w = Math.min(300, item.entry.text.length * 13 + 16);
      const x0 = item.sx - w / 2, x1 = item.sx + w / 2;
      const y0 = item.sy - 20, y1 = item.sy;
      let clash = false;
      for (const rect of placed) {
        if (x0 < rect[2] && x1 > rect[0] && y0 < rect[3] && y1 > rect[1]) { clash = true; break; }
      }
      const isSelected = item.entry.marker && item.entry.marker === this.selectedMarker;
      if (clash && !isSelected) continue;
      placed.push([x0, y0, x1, y1]);
      let el = layer.children[used];
      if (!el) { el = El("div", "edMapLabel"); layer.appendChild(el); }
      used += 1;
      const cls = "edMapLabel"
        + (item.entry.kind === "road" ? " road" : "")
        + (item.entry.ref ? " ref" : "")
        + (isSelected ? " sel" : "");
      if (el.className !== cls) el.className = cls;
      if (el.textContent !== item.entry.text) el.textContent = item.entry.text;
      el.style.left = `${item.sx.toFixed(1)}px`;
      el.style.top = `${item.sy.toFixed(1)}px`;
    }
    while (layer.childElementCount > used) layer.lastChild.remove();
  }

  Place(x, z) {
    const entry = this.Entry(this.paletteId);
    if (!entry) return;
    const item = {
      id: this.nextId, type: entry.id, x, z,
      ry: this.paramValues.ry || 0,
      seed: this.paramValues.seed || `e${this.nextId}`,
    };
    this.nextId += 1;
    for (const key of ["w", "d", "h", "scale", "damage"]) {
      if (this.paramValues[key] != null) item[key] = this.paramValues[key];
    }
    this.items.push(item);
    this.selected = item;
    this.selectedMarker = null;
    this.RebuildAll();
  }

  Undo() {
    this.items.pop();
    this.selected = null;
    this.RebuildAll();
  }

  DeleteSelected() {
    if (!this.selected) return;
    this.items = this.items.filter((it) => it !== this.selected);
    this.selected = null;
    this.RebuildAll();
  }

  ClearAll() {
    this.items = [];
    this.selected = null;
    this.RebuildAll();
  }

  /** 把本层建过的东西全拆掉（几何是我们自己合批出来的，必须 dispose）。 */
  ClearBuilt() {
    for (const handle of this.effectHandles) this.host.vfx?.RemoveSceneEffect(handle);
    this.effectHandles.length = 0;
    for (let i = this.root.children.length - 1; i >= 0; i -= 1) this.root.remove(this.root.children[i]);
    for (const geometry of this.ownedGeometries) geometry.dispose();
    for (const material of this.ownedMaterials) material.dispose();
    for (const texture of this.ownedTextures) texture.dispose();
    this.ownedGeometries.length = 0;
    this.ownedMaterials.length = 0;
    this.ownedTextures.length = 0;
    this.DropColliders();
  }

  /**
   * 碰撞盒挂在谁身上。
   *
   * 城里那六关是 TengxianField，它的碰撞表在 `field.city` 上（城 + 城外两份合并）；
   * 序·界河是独立场景 JieheField，碰撞表就在它自己身上、没有 `.city`。
   * 原来这一层只认 `field.city`，于是**在界河那一关摆的东西全都没有碰撞** ——
   * 画面上有掩体，人直接穿过去。两个类的这三样接口本来就是一样的，取一下就行。
   */
  ColliderHost() {
    const field = this.field;
    if (!field) return null;
    return field.city || (field.colliders && field.BuildCollisionGrid ? field : null);
  }

  DropColliders() {
    const field = this.field;
    // 摆件的碰撞体也要从**物理世界**里撤掉。只清 field.city.colliders 的话，
    // 画面上东西没了、人还是会撞到一堵看不见的墙（Rapier 那边的碰撞体还在）。
    if (this.physicsHandles.length) {
      if (this.physicsWorld && field && field.physics === this.physicsWorld) {
        for (const h of this.physicsHandles) this.physicsWorld.RemoveSolid(h);
      }
      this.physicsHandles.length = 0;
      this.physicsWorld = null;
    }
    const host = this.ColliderHost();
    if (!host) return;
    const before = host.colliders.length;
    const kept = host.colliders.filter((box) => box.tag !== this.colliderTag);
    if (kept.length !== before) {
      host.colliders.length = 0;
      host.colliders.push(...kept);
      host.BuildCollisionGrid();
      if (field && field.RefreshColliders) field.RefreshColliders();
    }
  }

  RebuildAll() {
    this.ClearBuilt();
    const library = this.host.library;
    const field = this.field;
    const addColliders = !this.solidToggle || this.solidToggle.value;
    const colliders = [];
    for (const item of this.items) {
      const entry = this.Entry(item.type);
      if (!entry) continue;
      const groundY = field ? field.GroundHeight(item.x, item.z) : 0;
      if (entry.effect) {
        const handle = this.host.vfx?.SceneEffect(
          { x: item.x, y: groundY + (item.h || 0), z: item.z },
          entry.effect, { scale: item.scale || 1 });
        if (handle) this.effectHandles.push(handle);
        item.node = null;
        continue;
      }
      const node = new THREE.Group();
      node.name = `Placed_${item.type}_${item.id}`;
      node.position.y = groundY;
      const built = BuildPlaceableVisual(node, entry, item, {
        library, modelDocs: this.modelDocs, ownedGeometries: this.ownedGeometries,
      });
      if (addColliders) {
        for (const box of built.colliders) {
          colliders.push({
            min: [box.min[0], box.min[1] + groundY, box.min[2]],
            max: [box.max[0], box.max[1] + groundY, box.max[2]],
            tag: this.colliderTag,
          });
        }
      }
      this.root.add(node);
      item.node = node;
    }
    if (this.markersVisible) {
      for (const marker of this.markers) {
        const groundY = field ? field.GroundHeight(marker.x, marker.z) : 0;
        const node = BuildMapMarkerVisual(marker, {
          ownedGeometries: this.ownedGeometries,
          ownedMaterials: this.ownedMaterials,
          ownedTextures: this.ownedTextures,
        });
        node.position.set(marker.x, groundY, marker.z);
        this.root.add(node);
        marker.node = node;
      }
    } else {
      for (const marker of this.markers) marker.node = null;
    }
    const host = this.ColliderHost();
    if (colliders.length && host) {
      host.colliders.push(...colliders);
      host.BuildCollisionGrid();
      // 本层的合并表与散列也要跟着刷（见 TengxianField.RefreshColliders 的账）
      if (field && field.RefreshColliders) field.RefreshColliders();
    }
    if (colliders.length && field && field.physics) {
      this.physicsWorld = field.physics;
      for (const box of colliders) {
        const h = field.physics.AddSolid(box);
        if (h !== null) this.physicsHandles.push(h);
      }
    }
    this.RefreshPlacedList();
    this.RefreshMarkerUi();
    this.groundedObjectsDirty = false;
  }

  /**
   * 让放置层跟着新的解析地高走。
   *
   * 涂抹过程中先只挪可见节点，保证每帧都贴地；松手后再 RebuildAll 一次，
   * 把 AABB 与 Rapier 碰撞体按新高度重建。玩法此时暂停，不需要每个笔刷采样都
   * 重建物理世界，但退出这一笔时视觉与碰撞必须落在同一个高度。
   */
  SyncGroundedObjects(rebuildColliders = false) {
    const field = this.field;
    if (!field) return;
    for (const item of this.items) {
      if (item.node) item.node.position.y = field.GroundHeight(item.x, item.z);
    }
    for (const marker of this.markers) {
      if (marker.node) marker.node.position.y = field.GroundHeight(marker.x, marker.z);
    }
    if (!this.items.length && !this.markers.length) { this.groundedObjectsDirty = false; return; }
    if (rebuildColliders) this.RebuildAll();
    else this.groundedObjectsDirty = true;
  }

  RefreshPlacedList() {
    if (!this.placedList) return;
    this.placedList.Fill(this.items.map((it) => ({
      id: String(it.id),
      name: `${(this.Entry(it.type) || {}).name || it.type}`,
      tail: `${it.x.toFixed(0)}, ${it.z.toFixed(0)}`,
    })));
    if (this.selected) this.placedList.Select(String(this.selected.id));
  }

  // -------------------------------------------------------------------------
  // 地形
  // -------------------------------------------------------------------------

  /** 把 field.GroundHeight 包一层，叠上笔刷的高程场。 */
  PatchGround() {
    const field = this.field;
    if (!field || this.groundPatched === field) return;
    const base = field.GroundHeight.bind(field);
    field.GroundHeight = (x, z) => base(x, z) + this.TerrainDelta(x, z);
    field.__editorBaseGroundHeight = base;
    this.groundPatched = field;
  }

  UnpatchGround() {
    const field = this.groundPatched;
    if (!field) return;
    if (field.__editorBaseGroundHeight) {
      field.GroundHeight = field.__editorBaseGroundHeight;
      delete field.__editorBaseGroundHeight;
    }
    this.groundPatched = null;
  }

  TerrainDelta(x, z) {
    let delta = 0;
    for (const op of this.terrainOps) {
      const distance = Math.hypot(x - op.x, z - op.z);
      if (distance >= op.r) continue;
      delta += op.amount * BrushFalloff(distance, op.r);
    }
    return delta;
  }

  /**
   * 落一笔。**一次按下到抬起只合成一个 terrainOp。**
   *
   * 原来是每来一个 mousemove 就 push 一个 op，代价是双份的：
   * GroundHeight 每次查询要遍历整张 op 表（玩家与 AI 每帧查几百次），
   * 而每个 op 又要把两张地面网格的十几万顶点全走一遍 ——
   * 实测拖一下 12 个事件花了 554 ms，手感就是「刷不动」。
   *
   * 现在：笔尖离开上一个 op 中心超过半径的 40% 才起新的一个，否则把量加进旧的那个，
   * 网格只按**增量**更新。抬起手（Update 里看 viewport.dragging）这一笔就封口。
   */
  PaintTerrain(x, z, invert, dt) {
    if (!this.supportsTerrain) {
      this.host.SetHint("场景关卡编辑器不改地形；请切换到“地形编辑器”");
      return;
    }
    const kind = this.brush.kind;
    const radius = this.brush.radius;
    const step = Math.max(0.001, Math.min(0.05, dt || 1 / 60));
    let amount = 0;
    if (kind === "crater") {
      // 弹坑一次成型：一笔一个坑，按住不放不会越挖越深
      if (this.stroke && this.stroke.kind === "crater") return;
      amount = -this.brush.strength * (invert ? -1 : 1);
    } else if (kind === "flatten") {
      // 抹平：把这一片的**编辑量**按比例收回去，回到原始地形
      const delta = this.TerrainDelta(x, z);
      if (Math.abs(delta) < 1e-4) return;
      amount = -delta * Math.min(1, 2.5 * step);
    } else {
      amount = this.brush.strength * step * ((kind === "lower") !== !!invert ? -1 : 1);
    }
    if (!amount) return;

    const stroke = this.stroke;
    const near = stroke && Math.hypot(x - stroke.op.x, z - stroke.op.z) < radius * 0.4
      && stroke.op.r === radius && kind !== "flatten";
    if (near) {
      stroke.op.amount += amount;
      this.ApplyTerrainToMesh(stroke.op.x, stroke.op.z, radius, amount);
      this.SyncGroundedObjects();
      return;
    }

    // **动不到任何一个顶点就什么都不记。**
    //
    // 城外那张地面是绕城的方环：靠濠一圈约 7 m 一个顶点，700 m 以外只剩 5 圈，
    // 也就是**每两百米才一个顶点**。在那儿刷，网格一动不动，而解析高程照样凹下去 ——
    // 结果正好是这个文件开头声明不许出现的那一种：看着是平地，人却掉进坑里。
    // 与其悄悄留下这种分歧，不如当场拒绝并说清楚在哪儿刷得动。
    const touched = this.ApplyTerrainToMesh(x, z, radius, amount);
    if (!touched) {
      this.host.SetHint("这片网格太疏，刷不动：到城内台地（|x|、|z| < 318 m）刷，或把半径调大");
      return;
    }
    this.terrainOps.push({ x, z, r: radius, amount });
    this.stroke = { op: this.terrainOps[this.terrainOps.length - 1], kind };
    this.SyncGroundedObjects();
  }

  /**
   * 把这一笔的位移写进地面网格。
   *
   * 只动名字叫 CityPlatform / OuterGround 的两张网格 —— 它们是**世界坐标直存**的
   * （没有父变换），position 属性里的 x/z 就是世界 x/z，可以直接比距离。
   * 法线重算很贵（城外那张有十几万顶点），所以攒着，停笔 0.2 秒之后再算一次。
   */
  /** 两张地面网格。每笔都去 city.meshes 里筛一遍太浪费，换关时清缓存。 */
  GroundMeshes() {
    const field = this.field;
    if (!field || !field.city) return [];
    if (this.groundMeshes.length && this.groundMeshes[0].parent) return this.groundMeshes;
    this.groundMeshes = field.city.meshes.filter(
      (m) => m.name === "CityPlatform" || m.name === "OuterGround");
    return this.groundMeshes;
  }

  /** @returns {number} 这一笔真的动到了多少个顶点（0 = 这片网格太疏，改不动） */
  ApplyTerrainToMesh(x, z, radius, amount) {
    const r2 = radius * radius;
    let total = 0;
    for (const mesh of this.GroundMeshes()) {
      const position = mesh.geometry.attributes.position;
      const array = position.array;
      let touched = false;
      // 直接走底层数组、比平方距离：城外那张有十几万顶点，
      // getX/getZ 的函数调用与 Math.hypot 的开方在这个量级上是能量到的开销。
      for (let i = 0; i < array.length; i += 3) {
        const dx = array[i] - x;
        const dz = array[i + 2] - z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r2) continue;
        array[i + 1] += amount * BrushFalloff(Math.sqrt(d2), radius);
        touched = true;
        total += 1;
      }
      if (touched) {
        position.needsUpdate = true;
        // 包围球与法线都要再走一趟十几万顶点，**都攒到停笔之后再算**。
        // 每笔各算一次的话，一帧里光这两趟就是三倍的笔刷本身。
        this.normalsDirty.add(mesh);
        this.normalsTimer = 0.2;
      }
    }
    this.lastTouched = total;
    return total;
  }

  UndoTerrain() {
    // 正在画的那一笔也可能就是要撤的这一个：不断开的话它还留着指针，
    // 下一次移动会继续往一个已经不在表里的 op 上加量，网格与解析高程当场对不上
    this.stroke = null;
    const op = this.terrainOps.pop();
    if (!op) return;
    this.ApplyTerrainToMesh(op.x, op.z, op.r, -op.amount);
    this.SyncGroundedObjects(true);
  }

  ResetTerrain() {
    this.stroke = null;
    for (const op of this.terrainOps) this.ApplyTerrainToMesh(op.x, op.z, op.r, -op.amount);
    this.terrainOps.length = 0;
    this.SyncGroundedObjects(true);
  }

  // -------------------------------------------------------------------------
  // 存取
  // -------------------------------------------------------------------------

  Serialize() {
    return {
      v: 2,
      level: PHASES[this.host.game.state.phaseIndex] ? PHASES[this.host.game.state.phaseIndex].id : null,
      items: this.items.map((it) => {
        const copy = { ...it };
        delete copy.node;
        return copy;
      }),
      markers: this.markers.map((marker) => {
        const copy = { ...marker };
        delete copy.node;
        return copy;
      }),
      terrain: this.terrainOps.map((op) => ({ ...op })),
    };
  }

  Save() {
    try {
      const data = this.Serialize();
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      this.host.SetWorldEditDocument?.(data);
      this.ioNote.textContent = `已存：${this.items.length} 个构件 / ${this.markers.length} 个标记 / `
        + `${this.terrainOps.length} 笔地形`;
    } catch (error) {
      this.ioNote.textContent = `存不进去：${String(error).slice(0, 80)}`;
    }
  }

  Restore(loud = false) {
    let raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (error) { raw = null; }
    if (!raw) { if (loud) this.ioNote.textContent = "本地没有存档"; return; }
    // 读回存档属于装载完整共享文档；即使当前是“场景关卡”入口，也要把已经存在的
    // 地形画出来，只是这个入口本身不提供任何地形修改动作。
    this.Import(raw, loud, { terrain: true });
  }

  RestoreSession() {
    const data = this.host.GetWorldEditDocument?.();
    if (data) this.Import(JSON.stringify(data), false, { terrain: true });
    else this.Restore(false);
  }

  RememberDocument() {
    this.host.SetWorldEditDocument?.(this.Serialize());
  }

  Import(text, loud = true, { terrain = this.supportsTerrain } = {}) {
    let data = null;
    try { data = JSON.parse(text); } catch (error) { data = null; }
    if (!data || !Array.isArray(data.items)) {
      if (loud) this.ioNote.textContent = "读不出来：JSON 不对";
      return;
    }
    if (terrain) this.ResetTerrain();
    this.items = data.items.map((it) => ({ ...it }));
    this.nextId = this.items.reduce((a, it) => Math.max(a, (it.id || 0) + 1), 1);
    this.selected = null;
    const rawMarkers = Array.isArray(data.markers) ? data.markers.slice(0, MAX_MAP_MARKERS) : [];
    // 外部 JSON 可以有重复 id；列表以 id 为键，导入时统一重编号才能保证“点中的
    // 那一行”就是后续改名/移动的那个对象。
    this.markers = rawMarkers.map((marker, index) => NormalizeMapMarker({ ...marker, id: index + 1 }, index + 1));
    this.nextMarkerId = this.markers.length + 1;
    this.selectedMarker = null;
    this.RebuildAll();
    if (terrain) {
      for (const op of data.terrain || []) {
        this.terrainOps.push({ ...op });
        this.ApplyTerrainToMesh(op.x, op.z, op.r, op.amount);
      }
      this.SyncGroundedObjects(true);
    }
    if (this.ioNote) {
      this.ioNote.textContent = `读回：${this.items.length} 个构件 / ${this.markers.length} 个标记 / `
        + `${this.terrainOps.length} 笔地形`
        + (data.level ? `（存的是 ${data.level}）` : "")
        + (Array.isArray(data.markers) && data.markers.length > MAX_MAP_MARKERS
          ? `；标记超过上限，只读入前 ${MAX_MAP_MARKERS} 个` : "");
    }
  }

  // -------------------------------------------------------------------------
  // 每帧
  // -------------------------------------------------------------------------

  Update(dt) {
    this.host.flycam.Update(dt);
    // Main 在编辑器接管期间会暂停 VfxSystem；有已布设特效时由本工具推进它，
    // 否则“放下去了”但烟火永远停在第一帧。
    if (this.effectHandles.length && this.host.vfx) {
      const step = Math.max(0, Math.min(0.1, dt || 0));
      this.host.vfx.Update(step, this.host.camera, this.host.vfx.time + step);
    }

    // RespawnPlayer() 是换关装配的一环，它会 Equip() 后明确把视图模型设为
    // visible。场景编辑器本身已经接管镜头，不能因此在任意非 L0 关卡露出枪械。
    // 只在它被重新点亮时归零，避免把这个修复变成每帧无意义的属性写入。
    if (this.host.viewmodel?.root?.visible) this.host.SetViewmodelVisible(false);

    // 关卡切片换过之后：包过的 GroundHeight、放置层的碰撞盒、地形的顶点位移
    // 三样都还挂在**上一份** city 上，得整套搬到新的那一份上去。
    //
    // **时机只能是 state.ready 重新变回 true 的那一刻**，不能是「battlefield 变了」
    // 那一刻。BuildField 一进门就把新的 TengxianField 赋上了，而它的 BuildSteps
    // 走到最后会 `this.colliders = sink.colliders.concat(farSink.colliders)` ——
    // **整根换掉那个数组**。在那之前推进去的碰撞盒会被连锅端走；
    // 地形位移更早，那时候地面网格连建都还没建。
    // 症状是「换完关，摆的院子还在但人从墙中间走过去，坑只剩解析高程没有形」。
    if (this.field && this.host.game.state.ready && this.groundPatched !== this.field) {
      this.UnpatchGround();
      this.PatchGround();
      this.groundMeshes.length = 0;
      this.RebuildAll();
      for (const op of this.terrainOps) this.ApplyTerrainToMesh(op.x, op.z, op.r, op.amount);
    }

    // --- 笔刷：一帧落一次 ---------------------------------------------------
    // 事件层只记位置（OnPress / OnPaint），真正动顶点在这里。
    // 按事件落笔的话，一次拖动能来十几次，而每一次都是一趟十几万顶点的遍历。
    const viewport = this.host.viewport;
    if (this.paintAt && this.mode === "terrain") {
      const hit = this.Pick({ clientX: this.paintAt.x, clientY: this.paintAt.y });
      if (hit) this.PaintTerrain(hit.x, hit.z, this.paintAt.shift, dt);
      else this.host.SetHint("准心在地平线以上：那个方向上没有地面");
      // 按住不动要接着涂（抬高/压低是连续量），所以只在松手时清掉
      if (!viewport || !viewport.dragging) this.paintAt = null;
    }
    // 松手 = 这一笔封口。下一次按下重新起一个 op。
    if ((!viewport || !viewport.dragging) && this.stroke) {
      this.stroke = null;
      this.paintAt = null;
      if (this.groundedObjectsDirty) this.SyncGroundedObjects(true);
    }

    this.RefreshGizmo();
    this.UpdateHudLabels();

    if (this.normalsTimer > 0) {
      this.normalsTimer -= dt;
      if (this.normalsTimer <= 0) {
        for (const mesh of this.normalsDirty) {
          mesh.geometry.computeVertexNormals();
          mesh.geometry.computeBoundingSphere();
        }
        this.normalsDirty.clear();
      }
    }

    if (this.host.lights) {
      const camera = this.host.camera;
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      this.host.lights.UpdateShadowFrustum(camera.position, forward);
    }

    // 上一帧整帧的绘制量（autoReset 已关，这里读完自己清）
    const info = this.host.renderer.info;
    this.measure.calls = info.render.calls;
    this.measure.triangles = info.render.triangles;
    info.reset();

    this.RefreshFacts();
  }

  RefreshFacts() {
    const f = this.facts;
    const field = this.field;
    if (!f) return;
    const phase = PHASES[this.host.game.state.phaseIndex];
    const camera = this.host.camera;
    if (phase && this.levelList) this.levelList.Select(phase.id);
    if (this.levelFacts && phase) {
      this.levelFacts.Set("当前关", `${phase.id} · ${phase.label}`);
      this.levelFacts.Set("切片", `X ${phase.bounds.minX}…${phase.bounds.maxX}  `
        + `Z ${phase.bounds.minZ}…${phase.bounds.maxZ}`);
      this.levelFacts.Set("天光", phase.sky);
    }
    f.Set("机位", `${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}, `
      + `${camera.position.z.toFixed(1)}`);
    f.Set("脚下地高", field ? `${field.GroundHeight(camera.position.x, camera.position.z).toFixed(2)} m` : "—");
    f.Set("draw call", this.measure.calls, this.measure.calls > 5000 ? "bad" : "good");
    f.Set("三角", `${(this.measure.triangles / 1000).toFixed(0)}k`,
      this.measure.triangles > 6000000 ? "bad" : "good");
    f.Set("城的网格", field ? field.meshes.length : 0);
    f.Set("碰撞盒", field ? (field.city ? field.city.colliders : field.colliders || []).length : 0);
    f.Set("构件 / 标记 / 地形", `${this.items.length} 个 / ${this.markers.length} 个 / `
      + `${this.terrainOps.length} 笔`);
    if (this.mode === "terrain") {
      f.Set("笔刷动到顶点", this.lastTouched == null ? "—" : this.lastTouched,
        this.lastTouched === 0 ? "bad" : "good");
    }
    f.Set("选中", this.selectedMarker
      ? `${this.selectedMarker.kind === "road" ? "道路" : "区域"}「${this.selectedMarker.text}」 @ `
        + `${this.selectedMarker.x.toFixed(1)}, ${this.selectedMarker.z.toFixed(1)}`
      : this.selected
        ? `${(this.Entry(this.selected.type) || {}).name} @ ${this.selected.x.toFixed(1)}, ${this.selected.z.toFixed(1)}`
        : "（无）");
  }
}

/**
 * 把 sink.props 里那几种「不能合批的东西」就地展开成几何。
 *
 * TengxianCity 有自己的 FlushProps（沙包走 InstancedMesh、瓦砾堆走另一个），
 * 那一份和城的生命周期绑在一起，这里不能借。**不展开的后果不是难看，是消失** ——
 * AddBarricade 整条沙包墙都在 props 里，不展开的话点了「沙包路障」什么也不出现。
 */
export function FlushSinkProps(sink, target, library, owned, resolve = ResolveTengxianMaterial) {
  const matrices = [];
  // 样条围墙 / 篱笆的实例桶（kind:"wallInstances"）：与建城时同一条收尾通道。
  // 不接这一路的话，编辑器里凡是走 Script_WallSpline 的构件会**静默消失** ——
  // 几何建了、矩阵算了、没人把它变成网格。
  FlushWallInstances(sink, {
    scene: target, meshes: [], library, resolve,
  });
  for (const prop of sink.props) {
    if (prop.kind === "sandbags") { matrices.push(...prop.matrices); continue; }
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
  if (matrices.length) {
    const geometry = MakeSandbag(0.62, 0.24, 0.34, TILE_METERS.sandbag, "bag");
    const mesh = MakeInstanced(geometry, ResolveTengxianMaterial("Sandbag", library), matrices);
    mesh.name = "PlacedSandbags";
    target.add(mesh);
    owned.push(geometry);
  }
}

export default SceneEditor;
