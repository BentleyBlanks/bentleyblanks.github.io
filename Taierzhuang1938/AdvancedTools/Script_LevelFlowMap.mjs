import { FLOW_GROUND } from "./Data_LevelFlow.mjs";
import * as front from "../Data_EditorBlockoutFirstLevel0105Space.mjs";
import * as village from "../Data_EditorBlockoutFirstLevel0610Space.mjs";
import { SegmentDistance, InsidePolygon } from "./Script_LevelFlowGeometry.mjs";
import { LoadEncounterTerrain } from "./Script_LevelFlowTerrain.mjs";
import { FetchResolvedScene } from "../Script_SceneInherit.mjs";
import { CompileSceneAirWalls, IsAirWallObject } from "../Script_SceneAirWalls.mjs";
import { FrontPaperFields, MergedFieldZones, MergedPaperFields } from "../Script_EncounterFarmland.mjs";

const Point = (point) => (Array.isArray(point) ? point.slice(0, 2) : [point.x, point.z]);
// The 2D map runs from the front line to the scene's south edge: Gengjiazhuang, the long official road, Beishahe village, the river and the rail bridge.
export const ENCOUNTER_MAP_MAX_Z = 1440;
// South of Gengjiazhuang the module data ends; roads and the anti-tank ditch there come from the scene ways.
const GENGJIAZHUANG_SOUTH_Z = 558;
const FRONT_SHARED_SPLIT_Z = 355;

function ExactArrayBuffer(u8) {
  if (!u8) return null;
  return u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength
    ? u8.buffer
    : u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

export function EncounterFloorConnections(point, map, ignore = null) {
  const connections = [];
  for (const floor of map.floors) if (floor.name !== ignore && InsidePolygon(point, floor.points)) connections.push(floor.name);
  for (const corridor of [...map.roads, ...map.trenches]) {
    const id = corridor.id || corridor.name;
    if (ignore && id === ignore) continue;
    if (corridor.points.slice(1).some((end, index) => SegmentDistance(point, corridor.points[index], end) <= corridor.width / 2 + 0.05)) connections.push(id || "road");
  }
  return connections;
}

export function EncounterHeightAt(point, map) {
  if (map.terrain) return map.terrain.heightAt(...point);
  const [minX, maxX, minZ, maxZ] = FLOW_GROUND.bounds;
  if (point[0] < minX || point[0] > maxX || point[1] < minZ || point[1] > maxZ) return 0;
  for (const ramp of map.ramps) {
    let traveled = 0;
    const total = ramp.points.slice(1).reduce((sum, end, index) => sum + Math.hypot(end[0] - ramp.points[index][0], end[1] - ramp.points[index][1]), 0);
    for (let index = 1; index < ramp.points.length; index++) {
      const a = ramp.points[index - 1], b = ramp.points[index], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (SegmentDistance(point, a, b) <= ramp.width / 2) {
        const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * (b[0] - a[0]) + (point[1] - a[1]) * (b[1] - a[1])) / (length * length)));
        return FLOW_GROUND.height * (traveled + t * length) / total;
      }
      traveled += length;
    }
  }
  if (map.floors.some((floor) => InsidePolygon(point, floor.points))) return 0;
  for (const trench of map.trenches) {
    if (trench.points.slice(1).some((end, index) => SegmentDistance(point, trench.points[index], end) <= trench.width / 2)) return 0;
  }
  return FLOW_GROUND.height;
}

export function BuildEncounterMap(scene, options = {}) {
  const sceneId = options.sceneId || scene.id || "FirstLevelEncounter";
  const hasGengjiazhuang = options.hasGengjiazhuang ?? (sceneId !== "FirstLevelMerged");
  const mapMaxZ = options.mapMaxZ ?? options.variantSpec?.mapMaxZ ?? (hasGengjiazhuang ? ENCOUNTER_MAP_MAX_Z : (scene.bounds?.maxZ ?? ENCOUNTER_MAP_MAX_Z));
  const southWaysZ = hasGengjiazhuang ? GENGJIAZHUANG_SOUTH_Z : FRONT_SHARED_SPLIT_Z - 5;

  const objects = scene.objects.filter((object) => object.pos && object.pos[2] < mapMaxZ
    && object.layer !== "backdrop" && !IsAirWallObject(object) && !/^远景/.test(object.group || ""));
  const legacyAirWalls = scene.objects.filter((object) => object.pos && object.pos[2] < mapMaxZ
    && object.layer !== "backdrop" && IsAirWallObject(object));
  const airWallSplines = (scene.airWalls || []).filter((wall) =>
    Array.isArray(wall.points) && wall.points.some((pt) => Point(pt)[1] < mapMaxZ));
  const compiledAirWalls = CompileSceneAirWalls(airWallSplines).filter((object) => object.pos && object.pos[2] < mapMaxZ);
  const airWalls = [...legacyAirWalls, ...compiledAirWalls];
  const farObjects = scene.objects.filter((object) => object.pos && !objects.includes(object)
    && !IsAirWallObject(object)).map((object) => {
    if (object.size) return object;
    const params = object.params || {}, height = params.h || 1;
    const tree = object.asset === "Backdrop/Tree";
    return {
      ...object, size: [params.w || params.rx * 2 || height * 0.18, height, params.d || params.rz * 2 || height * 0.18],
      ...(tree ? { material: "Whitebox/Foliage" } : {}),
    };
  });
  const ramps = structuredClone(scene.surface?.ramps || FLOW_GROUND.ramps);
  const roads = [
    { id: "TankGroundRoad", points: FLOW_GROUND.road, width: 5 },
    ...ramps,
    ...(scene.surface
      ? [{ id: "ReverseSlopeSupplyTrack", points: [[58.2, 156.8], [76, 154.5], [94, 149], [108, 143]], width: 2.8, kind: "villageAlley" }]
      : [{ points: front.L0105_ROAD.map(Point), width: front.L0105_ROAD_WIDTH_M }]),
    { points: [...front.L0105_NORTH_ROAD].reverse().map(Point), width: 5 },
    { points: front.L0105_POST_ROAD_SOUTH.map(Point), width: 5 },
    ...(hasGengjiazhuang ? [
      ...village.L0610_ROADS.map((road) => ({ points: road.line.map(Point), width: 4 })),
      { points: village.L0610_EAST_ROAD.line.map(Point), width: 5 },
      ...village.L0610_LANES.map((lane) => ({ id: lane.id, points: lane.line.map(Point), width: lane.halfW * 2, caps: village.L0610_STREETS[lane.id]?.caps || [] })),
      ...Object.values(village.L0610_LANE_PATHS).map((lane) => ({ id: lane.id, points: lane.line.map(Point), width: Math.min(...lane.halfW) * 2, widths: lane.halfW.map((half) => half * 2), caps: lane.caps || [] })),
      { id: "VillageEntryRamp", points: [[100, 380], [100, 385]], width: village.L0610_DITCH.rampHalfW * 2 },
      { id: "VillageAlleyRamp", points: [[80, 380], [80, 384]], width: 2 },
    ] : []),
  ];
  const InMap = (line) => line.some((point) => Point(point)[1] < mapMaxZ);
  const Beyond = (line) => line.every((point) => Point(point)[1] >= southWaysZ);
  const sceneRibbons = (scene.ways?.roadRibbons || []).filter((r) => Array.isArray(r.points) && r.points.length >= 2 && InMap(r.points));
  if (sceneRibbons.length) {
    roads.push(...sceneRibbons
      .filter((r) => r.kind !== "footpath")
      .map((r) => ({ id: r.id, kind: r.kind || "villageStreet", points: r.points.map(Point), width: r.width || 3.2, widthJitter: r.widthJitter })));
  } else {
    roads.push(...(scene.ways?.roads || []).filter((line) => Beyond(line.slice(1)) && InMap(line))
      .map((line, index) => ({ id: `BeishaheRoad${index}`, points: line.map(Point), width: 5 })));
  }
  const trenches = scene.trenches.segments.filter((segment) => InMap(segment.points))
    .map((segment) => ({ id: segment.id, points: segment.points.map(Point), width: segment.floorW || 3.8 }));
  for (const line of (scene.ways?.trenches || []).filter((line) => Beyond(line) && InMap(line)))
    trenches.push({ id: "BeishaheAtDitch", points: line.map(Point), width: 4 });
  trenches.push({ id: "Gully", points: front.L0105_GULLY.line.map(Point), width: 8 });
  trenches.push({ id: "GullyBranch", points: front.L0105_GULLY.branch.map(Point), width: 6 });
  const sunkenLanePoints = village.L0610_LANE.line.map(Point);
  trenches.push({
    id: "SunkenLane",
    points: hasGengjiazhuang ? sunkenLanePoints : sunkenLanePoints.filter(([, z]) => z <= FRONT_SHARED_SPLIT_Z + 1),
    width: 5.5,
  });
  if (hasGengjiazhuang) trenches.push({ id: "VillageDitch", points: [[36, 380], [125, 380]], width: 3 });
  trenches.push({ id: "PitEntry", points: [[0, -7], [0, 0]], width: 2.6 });
  trenches.push({ id: "PlatoonEntry", points: [[12.695652, 28], [17, 28]], width: 1.2 });
  const Rectangle = (name, box, trench = false) => ({ name, trench, points: [[box.minX, box.minZ], [box.maxX, box.minZ], [box.maxX, box.maxZ], [box.minX, box.maxZ]] });
  const floors = [
    ...(scene.surface?.pockets || FLOW_GROUND.pockets).map(({ name, box: [minX, maxX, minZ, maxZ] }) => Rectangle(name, { minX, maxX, minZ, maxZ })),
    ...(hasGengjiazhuang ? [
      Rectangle("丁字路口", village.L0610_STREETS.square.box),
      Rectangle("路口东北角", village.L0610_STREETS.pocket.box),
      Rectangle("老耿家院子", village.L0610_GENG.compound),
      Rectangle("本家院", village.L0610_BENJIA.box),
      Rectangle("街坊家", village.L0610_JIEFANG.box),
    ] : []),
  ];
  for (const place of [front.L0105_PLACES.pit, front.L0105_PLACES.dugout, front.L0105_PLACES.platoonShelter]) {
    floors.push(Rectangle(place.name, { minX: place.x - place.w / 2, maxX: place.x + place.w / 2, minZ: place.z - place.d / 2, maxZ: place.z + place.d / 2 }, true));
  }
  for (const [id, x, z, w, h, d, material, yawDeg] of scene.surface ? [] : FLOW_GROUND.cover) objects.push({
    id: `Encounter_${id}`, pos: [x, 0, z], size: [w, h, d], ...(yawDeg ? { yawDeg } : {}), material: `Whitebox/${material}`, group: "遭遇设计/地面工事", planning: true,
  });
  const labels = (scene.markers || []).filter((marker) => marker.z < mapMaxZ)
    .map((marker) => ({ ...marker, p: [marker.x, marker.z] }));
  const baseSupplemental = [
    ["门外下沟坡道", 63, 55.5], ["1 北侧坡道", 18, 35], ["2 西侧坡道", 15, 78], ["2 拐弯触发点", 30, 86],
    ["东侧地面车道", 109, 174], ["地面车道收窄口", 101, 280], ["集结处机枪阵地", 72, 139],
    ["旧阵地（已弃）", 0, -203], ["旧警戒阵地", -22, -440], ["西邻班后撤沟", -48, 90],
    ["防炮洞", 68, 64.5], ["西边机枪坑", 0, -7], ["支沟口", 21.9, 67.1], ["拐角", 30, 86],
    ["坡顶", 35, 131], ["干沟集结处", 56, 152], ["凹路", 88, 238], ["收窄的弯", 91, 280],
    ...(hasGengjiazhuang ? [
      ["耿家庄", 154, 373], ["村口路沟", 69, 380], ["主街", 100, 429], ["老耿家", 101, 480],
      ["街坊家", 74, 456], ["本家院", 84, 482], ["石碾", 113.2, 465.7], ["关帝庙", 84.5, 425],
      ["土地庙", 181, 481], ["土炮楼", 229.5, 390.5], ["村南口", 117, 545], ["河汊子", 38, 407],
    ] : []),
  ].map(([name, x, z]) => ({ name, p: [x, z] }));
  labels.push(...baseSupplemental.filter((label) => !labels.some((marker) => marker.name === label.name)));
  // Apertures come from the same cut walls that Play collides with. Close views
  // show their names; overview labels stay reserved for places and shelter mouths.
  const openings = objects.flatMap((object) => object.meta?.openings || []).filter((opening) => Array.isArray(opening.p));
  labels.push(...openings.filter((opening) => !labels.some((label) => label.kind === opening.kind && Math.hypot(label.p[0] - opening.p[0], label.p[1] - opening.p[1]) < 1))
    .map((opening) => ({ ...opening, y: opening.y + opening.h / 2, name: opening.kind === "door" ? "屋门" : "窗洞", detail: true })));
  const railways = (scene.ways?.railways || [])
    .filter((r) => Array.isArray(r.points) && r.points.length >= 2)
    .map((r) => structuredClone(r));
  return {
    bounds: [-160, 320, -480, mapMaxZ], objects, airWalls, airWallSplines, farObjects, roads, railways, trenches, labels, floors, ramps,
    planningPockets: scene.surface?.pockets || FLOW_GROUND.pockets,
    paint: scene.paint.filter((paint) => (paint.poly || paint.line)?.some((point) => (point.z ?? point[1]) < mapMaxZ)),
    fields: hasGengjiazhuang ? [...FrontPaperFields(), ...village.L0610_FIELDS] : [...FrontPaperFields(), ...MergedPaperFields(mapMaxZ)],
    fieldZones: [
      { id: "FrontPaper", poly: [[-160, -12], [330, -12], [330, 206], [-160, 206]] },
      ...(hasGengjiazhuang
        ? village.L0610_FIELD_ZONES
        : MergedFieldZones(mapMaxZ)),
    ],
    footpaths: [
      ...front.L0105_FIELD_LANES,
      ...(hasGengjiazhuang
        ? village.L0610_FOOTPATHS.map((path) => path.line)
        : sceneRibbons.some((r) => r.kind === "footpath")
          ? sceneRibbons.filter((r) => r.kind === "footpath").map((r) => r.points.map(Point))
          : [
            // 村西曲折穿田毛细小径（顺村缘水坑/菜园自然拐弯，不贴直线边界走）
            [[10, 355], [2, 412], [-8, 462], [20, 492], [44, 508], [58, 518]],
            [[-74, 540], [-38, 549], [-8, 543], [22, 552], [48, 544], [62, 556]],
            [[56, 634], [38, 650], [12, 654], [-14, 669], [-40, 687], [-74, 696]],
            [[-12, 546], [-18, 610], [-22, 676], [-34, 732], [-46, 772]],
            [[50, 766], [26, 768], [6, 784], [-20, 798], [-48, 801], [-74, 790]],
            // 村北与村东自然弯折田间小径（绕王家东林、东砖窑与东缘凹凸菜园）
            [[148, 355], [158, 414], [176, 466]],
            [[212, 355], [226, 424], [224, 480], [234, 522], [246, 566], [286, 572], [316, 574]],
            [[246, 566], [254, 628], [240, 684], [220, 706], [204, 718]],
            [[212, 538], [234, 526], [272, 522], [314, 526]],
            // 桥南农田与桥南小庄地头路
            [[-58, 922], [-42, 924], [-14, 932], [28, 938], [88, 928]],
            [[-118, 888], [-116, 932], [-96, 972]],
          ]),
    ].map((line) => line.map(Point)),
    smokeColumns: (scene.smokeColumns || []).filter((column) => column.z < mapMaxZ),
    playCorridor: hasGengjiazhuang ? null : [
      [42, 355], [42, 470.5], [80, 464.5], [80, 488], [99.5, 496], [99.5, 512], [71.5, 512],
      [71.5, 531.5], [77.5, 531.5], [77.5, 563.5], [99.5, 563.5], [99.5, 579.5], [76, 579.5],
      [76, 697.5], [82.5, 697.5], [82.5, 750.5], [82.5, 759], [51, 759], [51, 785], [12, 795],
      [-44, 800], [-64, 808], [-75.5, 815.5], [-82.2, 818.5], [-82.2, 874], [-99, 875.5],
      [-99, 895], [-76, 906], [-64, 955], [-48, 955], [-58, 895], [-63, 876.5], [-77.8, 874],
      [-77.8, 828], [-55, 825.5], [-20, 816.5], [20, 806.5], [62, 796], [105, 787], [123, 776],
      [125.5, 756], [125.5, 697], [177.5, 684.5], [178.5, 638], [177.5, 600], [171, 586],
      [152, 567], [152, 555.5], [96, 555.5], [96, 545.5], [90.5, 545.5], [90.5, 534.5],
      [93, 534.5], [93, 521.5], [115.5, 521.5], [115.5, 496], [132, 488], [132, 471],
      [132, 459.6], [142.5, 459.25], [178, 463], [178, 355],
    ],
    river: hasGengjiazhuang ? village.L0610_RIVER.line.map(Point) : [],
    groves: hasGengjiazhuang ? village.L0610_GROVES : [],
    wells: hasGengjiazhuang ? village.L0610_WELLS : [],
    markers: [
      ...openings.map((opening) => ({ ...opening, name: opening.kind === "door" ? "屋门" : "窗洞" })),
      ...(hasGengjiazhuang ? [
        { name: "狗洞", p: [92, 473], kind: "opening" }, { name: "便门", p: [92, 484.6], kind: "opening" },
        { name: "院门", p: [108, 483.5], kind: "opening" }, { name: "枪眼", p: [100, 470], kind: "window" },
        ...Object.values(village.L0610_ALLEY_WINDOWS).map((window) => ({ name: window.id, p: [window.x, window.z], kind: "window" })),
      ] : [
        { name: "夹壁便门", p: [125.1, 564.8], kind: "opening" },
      ]),
    ],
  };
}

export const MAINLINE_LANDMARK_IDS = Object.freeze(new Set([
  // 01–05 前沿与拖冬瓜主线
  "LmDugout", "LmDugoutMouth", "LmInterrogation", "LmBranch", "LmBranchGun",
  "LmSteps", "LmCorner2", "LmBridge", "LmCrest", "LmGully", "LmCompanyPost",
  "LmCartStop", "LmLaneHead", "LmPit", "LmCorner1", "LmBend", "LmTankSeen",
  // 06–10 凹路与耿家庄主线
  "LmLaneEnd", "LmDitch", "LmMouthShooters", "LmVillageMouth", "LmMainStreet",
  "LmTemple", "LmAlleyMouth", "LmJiefangBreach", "LmJiefangGatehouse", "LmDogHole",
  "LmSideGate", "LmKitchenDoor", "LmLoophole_mg", "LmSquare", "LmRoller",
  "LmEastStreet", "LmSouthLane", "LmLaneCollapse", "LmVillageSouth", "LmBigLocust",
  // 11–18 官道、北沙河村与铁路桥主线
  "LmLongRoad", "LmFlare", "LmAtDitch", "LmPlank", "LmTrenchSquad",
  "LmVillage", "LmMainStreet_1218", "LmBombedYard", "LmAid", "LmGateYard",
  "LmTianYard", "LmMatHome", "LmGuandaoBridge", "LmLizihang", "LmBank",
  "LmRiver_1218", "LmRailBridge", "LmLevee", "LmSouthRoad",
]));

const MAINLINE_SUPPLEMENTAL_NAMES = Object.freeze(new Set([
  "防炮洞", "西边机枪坑", "支沟口", "拐角", "坡顶", "干沟集结处", "凹路", "收窄的弯",
  "耿家庄", "村口路沟", "主街", "老耿家", "街坊家", "本家院", "石碾", "关帝庙", "村南口",
]));

export function IsMainlineLandmark(landmark) {
  if (!landmark || landmark.detail) return false;
  if (landmark.id) return MAINLINE_LANDMARK_IDS.has(landmark.id);
  return MAINLINE_SUPPLEMENTAL_NAMES.has(landmark.name);
}

export function LandmarkMode(layers = {}) {
  if (layers.landmarks === true) return "all";
  if (layers.importantLandmarks === true) return "important";
  if (layers.landmarks === false || layers.importantLandmarks === false) return "none";
  return "important";
}

export async function LoadEncounterMap(options = {}) {
  const sceneId = options.sceneId || options.variantSpec?.scene || "FirstLevelEncounter";
  const sceneRel = `Scenes/${sceneId}/Scene_${sceneId}.json`;
  const sceneUrl = new URL(`../${sceneRel}`, import.meta.url);
  let resolved;
  try {
    resolved = await FetchResolvedScene(sceneUrl.href);
  } catch (error) {
    throw new Error(`空间底图读取失败 · ${error.message}`);
  }
  const scene = resolved.doc;
  const map = BuildEncounterMap(scene, { sceneId, variantSpec: options.variantSpec, mapMaxZ: options.mapMaxZ });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(map)));
  map.source = {
    scene: sceneRel,
    ...(resolved.inheritedFrom ? { inheritedFrom: resolved.inheritedFrom } : {}),
    sha256: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
  };
  const resolvedBytes = [
    ExactArrayBuffer(resolved.heightBytes),
    ...(resolved.datumBytes ? [ExactArrayBuffer(resolved.datumBytes)] : []),
  ];
  map.terrain = await LoadEncounterTerrain(scene, sceneUrl, map, { ...options, resolvedBytes });
  map.terrain.surfaceMaps();
  return map;
}
