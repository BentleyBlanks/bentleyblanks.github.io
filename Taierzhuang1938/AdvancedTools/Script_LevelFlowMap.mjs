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

// Non-overlapping multi-angle March 14, 1938 Lunan strip-farmland mosaic south of z=206 for FirstLevelMerged:
// 11 disjoint agricultural tracts ("垧") following river, official road, railway and shrunken S2 village edge,
// each subdivided into narrow 6–16 m "裤带条田" strips with authentic early-spring crop mix (winter wheat,
// freshly spring-plowed soil, winter stubble, village-edge vegetable gardens, and sandy river fallow).
// Interlocking sawtooth village-to-field boundaries (zero straight ruler edges along x=51 or x=218!):
// Every field sector shares organic zig-zagging headland borders with the village cottages, pit-ponds, and gardens.
function MergedFieldZones(maxZ = 990) {
  return [
    { id: "MergedWestRailN", poly: [[-160, 206], [-83.2, 206], [-83.2, 530], [-122, 538], [-160, 532]] },
    { id: "MergedWestRailS", poly: [[-160, 532.6], [-122, 538.6], [-83.2, 530.6], [-83.2, 822], [-160, 834]] },
    { id: "MergedNorthWest", poly: [[-75.5, 206], [94.8, 206], [94.8, 474], [58, 480], [26, 471], [-20, 478], [-75.5, 474]] },
    { id: "MergedNorthEast", poly: [[105.5, 206], [320, 206], [320, 482], [268, 474], [228, 482], [192, 475], [156, 472], [105.5, 474]] },
    // 西田东界呈犬牙凹凸紧贴村西屋群、西苇塘与菜园（在 x=42..61 之间自然进退，彻底消除直线硬切！）
    {
      id: "MergedWestPlainN",
      poly: [
        [-75.5, 474.6], [-20, 478.6], [26, 471.6], [56, 480.6],
        [47, 502], [53, 526], [62, 548], [52, 566], [44, 594], [54, 624], [58, 638],
        [14, 642], [-30, 633], [-75.5, 639],
      ],
    },
    {
      id: "MergedWestPlainS",
      poly: [
        [-75.5, 639.6], [-30, 633.6], [14, 642.6], [58, 638.6],
        [61, 658], [52, 682], [38, 704], [48, 728], [56, 748],
        [20.5, 756], [18, 796], [-44, 798], [-75.5, 804],
      ],
    },
    { id: "MergedNorthBankStrip", poly: [[21.1, 756.6], [51.5, 756.6], [48.5, 788], [20.5, 798]] },
    // 东田西界呈犬牙凹凸紧贴土炮楼、东侧菜园与官道东排屋（在 x=206..228 之间自然进退）
    {
      id: "MergedEastPlainN",
      poly: [
        [228, 482.6], [268, 474.6], [320, 482.6], [320, 626], [272, 632],
        [214, 624], [224, 588], [220, 566], [209, 544], [216, 518], [228, 498],
      ],
    },
    {
      id: "MergedEastPlainS",
      poly: [
        [214, 624.6], [272, 632.6], [320, 626.6], [320, 766], [256, 750],
        [218, 732], [222, 692], [214, 668], [207, 648],
      ],
    },
    { id: "MergedSouthBankW", poly: [[-160, 876], [-83.2, 876], [-83.2, maxZ], [-160, maxZ]] },
    { id: "MergedSouthBankMid", poly: [[-75.5, 876], [96, 876], [88, 932], [95, maxZ], [-75.5, maxZ]] },
    { id: "MergedSouthBankFarE", poly: [[96.6, 876], [320, 876], [320, maxZ], [95.6, maxZ], [88.6, 932]] },
  ];
}

function MergedPaperFields(maxZ = 990) {
  let seed = 19380314;
  const Random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const zones = MergedFieldZones(maxZ);
  const zoneById = Object.fromEntries(zones.map((z) => [z.id, z]));
  const fields = [];
  // March 14 (惊蛰后 8 日) crop weights: ~48% winter wheat, ~23% freshly plowed, ~19% winter stubble, ~10% garden/sandy
  const MAIN_KINDS = [
    "wheatRich", "wheatRich", "wheatRich", "wheatSparse", "wheatSparse",
    "plowedFresh", "plowedFresh", "stubble", "stubble", "wheatRich",
  ];
  const RIVER_KINDS = [
    "wheatSparse", "plowedFresh", "stubble", "sandy", "sandy", "wheatRich", "stubble",
  ];
  const GARDEN_KINDS = [
    "garden", "garden", "wheatRich", "plowedFresh", "garden", "stubble",
  ];

  const AddTiltedSector = (zoneId, angleDeg, tractWRange, tractDRange, opts = {}) => {
    const zone = zoneById[zoneId];
    if (!zone) return;
    const xs = zone.poly.map((p) => p[0]), zs = zone.poly.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZVal = Math.max(...zs);
    const ox = (minX + maxX) / 2, oz = (minZ + maxZVal) / 2;
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    // Project polygon vertices into rotated (u, v) frame so the local grid covers the entire clipped polygon
    // with zero overlap between any two parcels in this sector.
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const [px, pz] of zone.poly) {
      const dx = px - ox, dz = pz - oz;
      const u = dx * cos - dz * sin;
      const v = dx * sin + dz * cos;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const vBreaks = [minV - 2];
    while (vBreaks.at(-1) < maxV + 2) {
      vBreaks.push(vBreaks.at(-1) + tractDRange[0] + Random() * (tractDRange[1] - tractDRange[0]));
    }
    for (let vi = 0; vi < vBreaks.length - 1; vi++) {
      const v0 = vBreaks[vi] + 0.45, v1 = vBreaks[vi + 1] - 0.45;
      if (v1 - v0 < 10) continue;
      const uBreaks = [minU - 2];
      while (uBreaks.at(-1) < maxU + 2) {
        uBreaks.push(uBreaks.at(-1) + tractWRange[0] + Random() * (tractWRange[1] - tractWRange[0]));
      }
      for (let ui = 0; ui < uBreaks.length - 1; ui++) {
        const u0 = uBreaks[ui] + 0.45, u1 = uBreaks[ui + 1] - 0.45;
        if (u1 - u0 < 8) continue;
        const w = u1 - u0, d = v1 - v0;
        const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
        // Inverse rotation back to world (x, z): x = ox + u*cos + v*sin, z = oz - u*sin + v*cos
        const wx = ox + uc * cos + vc * sin;
        const wz = oz - uc * sin + vc * cos;
        // Skip parcels wholly outside the zone polygon
        const samples = [
          [wx, wz],
          [ox + u0 * cos + v0 * sin, oz - u0 * sin + v0 * cos],
          [ox + u1 * cos + v0 * sin, oz - u1 * sin + v0 * cos],
          [ox + u1 * cos + v1 * sin, oz - u1 * sin + v1 * cos],
          [ox + u0 * cos + v1 * sin, oz - u0 * sin + v1 * cos],
          [ox + uc * cos + v0 * sin, oz - uc * sin + v0 * cos],
          [ox + uc * cos + v1 * sin, oz - uc * sin + v1 * cos],
        ];
        if (!samples.some((pt) => InsidePolygon(pt, zone.poly))) continue;

        const isNearVillage = opts.gardenTest ? opts.gardenTest(wx, wz) : false;
        const isNearRiver = opts.riverTest ? opts.riverTest(wx, wz) : false;
        const palette = isNearVillage ? GARDEN_KINDS : isNearRiver ? RIVER_KINDS : MAIN_KINDS;
        const strips = [];
        // Subdivide tract into narrow 6.5–15 m Lunan "裤带条田" strips
        const targetStripW = isNearVillage ? (5.5 + Random() * 3.5) : (7.0 + Random() * 6.5);
        const stripCount = Math.max(2, Math.min(7, Math.round(w / targetStripW)));
        let cursor = -w / 2;
        let prevKind = null;
        for (let s = 0; s < stripCount; s++) {
          const isLast = s === stripCount - 1;
          const step = isLast ? (w / 2 - cursor) : (w / stripCount) * (0.76 + Random() * 0.48);
          const to = isLast ? w / 2 : Math.min(w / 2 - 2.5, cursor + step);
          let kind = palette[Math.floor(Random() * palette.length)];
          if (kind === prevKind && Random() < 0.55) kind = palette[Math.floor(Random() * palette.length)];
          prevKind = kind;
          strips.push({ from: Number(cursor.toFixed(2)), to: Number(to.toFixed(2)), kind });
          cursor = to;
        }
        fields.push({
          zone: zoneId,
          x: Number(wx.toFixed(2)),
          z: Number(wz.toFixed(2)),
          w: Number(w.toFixed(2)),
          d: Number(d.toFixed(2)),
          angleDeg,
          strips,
        });
      }
    }
  };

  // Multi-angle Lunan agricultural sectors (顺垄 / 横垄交错，绝非 0° 方格表)
  AddTiltedSector("MergedWestRailN", -11, [28, 42], [54, 82]);
  AddTiltedSector("MergedWestRailS", 78, [30, 44], [52, 78], { riverTest: (_x, z) => z > 785 });
  AddTiltedSector("MergedNorthWest", 10, [30, 46], [56, 86], { gardenTest: (x, z) => x > 32 && z > 445 });
  AddTiltedSector("MergedNorthEast", -14, [32, 48], [56, 88], { gardenTest: (x, z) => x < 225 && z > 448 });
  AddTiltedSector("MergedWestPlainN", 76, [26, 40], [48, 72], { gardenTest: (x, z) => x > 22 && z > 495 && z < 632 });
  AddTiltedSector("MergedWestPlainS", -15, [28, 42], [46, 70], {
    gardenTest: (x, z) => x > 20 && z < 756,
    riverTest: (_x, z) => z > 770,
  });
  AddTiltedSector("MergedNorthBankStrip", 12, [16, 24], [24, 34], { gardenTest: () => true });
  AddTiltedSector("MergedEastPlainN", -13, [28, 42], [50, 74], { gardenTest: (x) => x < 242 });
  AddTiltedSector("MergedEastPlainS", 74, [26, 40], [48, 72], {
    gardenTest: (x, z) => x < 240 && z < 715,
    riverTest: (_x, z) => z > 728,
  });
  AddTiltedSector("MergedSouthBankW", 12, [28, 44], [52, 76], { riverTest: (_x, z) => z < 906 });
  AddTiltedSector("MergedSouthBankMid", -11, [30, 46], [50, 78], {
    riverTest: (_x, z) => z < 902,
    gardenTest: (x, z) => x > -52 && x < -4 && z > 904 && z < 968,
  });
  AddTiltedSector("MergedSouthBankFarE", 79, [32, 48], [54, 82], { riverTest: (_x, z) => z < 904 });
  return fields;
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
      [62, 355], [62, 435], [46, 466], [22, 496], [16, 610], [16, 706], [-60, 728], [-62, 764],
      [-86, 782], [-106, 794], [-106, 822], [-82.2, 825], [-82.2, 874], [-102, 876], [-102, 916],
      [-86, 956], [-78, 968], [-38, 968], [-40, 910], [-42, 876], [-77.8, 874], [-77.8, 828],
      [-54, 828], [-4, 818], [68, 800], [132, 774], [194, 748], [230, 704], [233, 635], [235, 560],
      [234, 492], [198, 468], [152, 435], [152, 355],
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
