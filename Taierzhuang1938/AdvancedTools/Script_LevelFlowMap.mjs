import { FLOW_GROUND } from "./Data_LevelFlow.mjs";
import * as front from "../Data_EditorBlockoutFirstLevel0105Space.mjs";
import * as village from "../Data_EditorBlockoutFirstLevel0610Space.mjs";
import { SegmentDistance, InsidePolygon } from "./Script_LevelFlowGeometry.mjs";
import { LoadEncounterTerrain } from "./Script_LevelFlowTerrain.mjs";
import { FetchResolvedScene } from "../Script_SceneInherit.mjs";

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

// The same seed and strip construction used by Devin's L1Map0107/Base.mjs.
function FrontPaperFields() {
  let seed = 1938031;
  const Random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const fields = [], kinds = ["wheat", "wheat", "wheat", "plowed", "fallow"];
  for (let z = -42; z < 216; z += 60 + Random() * 45) {
    for (let x = -190; x < 340; x += 45 + Random() * 40) {
      const width = 50 + Random() * 60, depth = 70 + Random() * 70, angle = 4 + (Random() - 0.5) * 28 + (Random() < 0.25 ? 90 : 0);
      const whole = Random() < 0.2, strips = [];
      for (let offset = -width / 2; offset < width / 2;) {
        const stripWidth = whole ? width : 10 + Random() * 22;
        strips.push({ from: offset, to: Math.min(width / 2, offset + stripWidth), kind: kinds[Math.floor(Random() * kinds.length)] }); offset += stripWidth;
      }
      fields.push({ zone: "FrontPaper", x: x + width / 2, z: z + depth / 2, w: width, d: depth, angleDeg: angle, strips });
    }
  }
  return fields;
}

// Non-overlapping Lunan agricultural parcel mosaic south of z=206 for FirstLevelMerged:
// clean contiguous plots separated by narrow earthen field ridges (田埂), zero stacked overlapping blocks.
function MergedPaperFields(maxZ = 910) {
  let seed = 1938035;
  const Random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const kinds = ["wheat", "wheat", "plowed", "wheat", "fallow", "plowed"];
  const fields = [];
  const AddParcelGrid = (zone, xBreaks, zBreaks, angleDeg = 0) => {
    for (let zi = 0; zi < zBreaks.length - 1; zi++) {
      const z0 = zBreaks[zi] + 0.55, z1 = zBreaks[zi + 1] - 0.55;
      if (z1 - z0 < 6) continue;
      for (let xi = 0; xi < xBreaks.length - 1; xi++) {
        const x0 = xBreaks[xi] + 0.55, x1 = xBreaks[xi + 1] - 0.55;
        if (x1 - x0 < 6) continue;
        const w = x1 - x0, d = z1 - z0;
        const strips = [];
        // Subdivide each parcel cleanly into 2–4 furrow strips without overlapping neighbors
        const stripCount = w > 52 ? 4 : w > 30 ? 3 : 2;
        const baseKind = kinds[Math.floor(Random() * kinds.length)];
        let cursor = -w / 2;
        for (let s = 0; s < stripCount; s++) {
          const isLast = s === stripCount - 1;
          const sw = isLast ? (w / 2 - cursor) : (w / stripCount) * (0.78 + Random() * 0.44);
          const to = isLast ? w / 2 : Math.min(w / 2 - 2, cursor + sw);
          const kind = Random() < 0.65 ? baseKind : kinds[Math.floor(Random() * kinds.length)];
          strips.push({ from: cursor, to, kind });
          cursor = to;
        }
        fields.push({ zone, x: (x0 + x1) / 2, z: (z0 + z1) / 2, w, d, angleDeg, strips });
      }
    }
  };
  // Four clean agricultural tracts separated by the railway (x=-80), official road (x=100), village & river
  AddParcelGrid("MergedWestRail", [-160, -124, -84], [206, 265, 330, 405, 480, 560, 645, 742], 0);
  AddParcelGrid("MergedWestPlain", [-74, -34, 8, 52], [206, 262, 326, 392, 462, 534, 608, 682], 0);
  AddParcelGrid("MergedNorthApproach", [52, 95, 146, 206, 264, 320], [206, 268, 338, 408, 466], 0);
  AddParcelGrid("MergedEastPlain", [224, 272, 320], [466, 536, 612, 690], 0);
  AddParcelGrid("MergedSouthBank", [-160, -110, -56, 8, 76, 152, 232, 320], [798, 855, Math.max(890, maxZ)], 0);
  return fields;
}

function MergedFieldZones(maxZ = 910) {
  return [
    { id: "MergedWestRail", poly: [[-160, 206], [-83, 206], [-83, 744], [-160, 756]] },
    { id: "MergedWestPlain", poly: [[-75, 206], [54, 206], [54, 678], [-44, 678], [-44, 718], [-75, 725]] },
    { id: "MergedNorthApproach", poly: [[52, 206], [320, 206], [320, 468], [220, 468], [150, 466], [52, 468]] },
    { id: "MergedEastPlain", poly: [[222, 468], [320, 468], [320, 690], [250, 680], [222, 622]] },
    { id: "MergedSouthBank", poly: [[-160, 796], [320, 796], [320, maxZ], [-160, maxZ]] },
  ];
}

export function BuildEncounterMap(scene, options = {}) {
  const sceneId = options.sceneId || scene.id || "FirstLevelEncounter";
  const hasGengjiazhuang = options.hasGengjiazhuang ?? (sceneId !== "FirstLevelMerged");
  const mapMaxZ = options.mapMaxZ ?? options.variantSpec?.mapMaxZ ?? (hasGengjiazhuang ? ENCOUNTER_MAP_MAX_Z : (scene.bounds?.maxZ ?? ENCOUNTER_MAP_MAX_Z));
  const southWaysZ = hasGengjiazhuang ? GENGJIAZHUANG_SOUTH_Z : FRONT_SHARED_SPLIT_Z - 5;

  const objects = scene.objects.filter((object) => object.pos && object.pos[2] < mapMaxZ
    && object.layer !== "backdrop" && !/空气墙|^远景/.test(object.group || ""));
  const farObjects = scene.objects.filter((object) => object.pos && !objects.includes(object)
    && !String(object.group || "").includes("空气墙")).map((object) => {
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
    { points: front.L0105_ROAD.map(Point), width: front.L0105_ROAD_WIDTH_M },
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
  roads.push(...(scene.ways?.roads || []).filter((line) => Beyond(line.slice(1)) && InMap(line))
    .map((line, index) => ({ id: `BeishaheRoad${index}`, points: line.map(Point), width: 5 })));
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
  for (const [id, x, z, w, h, d, material] of scene.surface ? [] : FLOW_GROUND.cover) objects.push({
    id: `Encounter_${id}`, pos: [x, 0, z], size: [w, h, d], material: `Whitebox/${material}`, group: "遭遇设计/地面工事", planning: true,
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
  return {
    bounds: [-160, 320, -480, mapMaxZ], objects, farObjects, roads, trenches, labels, floors, ramps,
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
        : [
            [[-74, 462], [-20, 462], [38, 468], [56, 516]],
            [[-74, 534], [-10, 534], [54, 534]],
            [[-74, 608], [8, 608], [62, 610]],
            [[8, 326], [8, 462], [8, 608], [8, 678]],
            [[146, 338], [146, 466]],
            [[206, 338], [222, 468], [224, 572], [272, 572], [318, 572]],
            [[224, 536], [272, 536], [318, 536]],
            [[272, 466], [272, 682]],
          ]),
    ].map((line) => line.map(Point)),
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
