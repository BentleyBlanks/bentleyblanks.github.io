// 滕县城防示意图布局验收：只读 Data_Tengxian，不启动 three / 浏览器。
//
// 用法：node Taierzhuang1938/Script_TengxianLayoutTest.mjs
//
// 这不是史料考据的替代品。它把已确认的相对关系锁成回归约束：四门进城、
// 西门至十字街通视、功能院落不压街、东关沿东门大街展开。图上的部队番号
// 只用来定位当时的功能区，绝不由本测试推导为永久驻防或兵力配置。

import {
  CITY, MOAT, GATES, CROSSROAD, STREETS, SIGHT_CORRIDOR,
  CITY_FEATURES, EAST_SUBURB, EAST_FIELD, EAST_DEFENSE, LEVEL_BOUNDS, BASTIONS, RAMPS, PRESUMED,
} from "./Data_Tengxian.mjs";
import { PHASES } from "./Data_Battle.mjs";

const EPSILON = 0.01;
const failures = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function nearlyEqual(a, b, epsilon = EPSILON) {
  return Math.abs(a - b) <= epsilon;
}

function rangeOverlaps(a0, a1, b0, b1) {
  return Math.min(a1, b1) >= Math.max(a0, b0) - EPSILON;
}

function pointOnStreet(street, x, z, margin = 0) {
  const half = street.width / 2 + margin;
  if (street.axis === "x") {
    return Math.abs(z - street.at) <= half + EPSILON
      && x >= street.from - EPSILON && x <= street.to + EPSILON;
  }
  return Math.abs(x - street.at) <= half + EPSILON
    && z >= street.from - EPSILON && z <= street.to + EPSILON;
}

function gateConnectsToStreet(gate, street) {
  const wallHalfWidth = CITY.wallBaseWidth / 2;
  if (street.axis === "x") {
    return Math.abs(gate.z - street.at) <= street.width / 2 + EPSILON
      && gate.x >= street.from - wallHalfWidth - EPSILON
      && gate.x <= street.to + wallHalfWidth + EPSILON;
  }
  return Math.abs(gate.x - street.at) <= street.width / 2 + EPSILON
    && gate.z >= street.from - wallHalfWidth - EPSILON
    && gate.z <= street.to + wallHalfWidth + EPSILON;
}

function streetTouchesRect(street, rect) {
  const half = street.width / 2;
  if (street.axis === "x") {
    return street.at + half > rect.minZ + EPSILON
      && street.at - half < rect.maxZ - EPSILON
      && rangeOverlaps(street.from, street.to, rect.minX, rect.maxX);
  }
  return street.at + half > rect.minX + EPSILON
    && street.at - half < rect.maxX - EPSILON
    && rangeOverlaps(street.from, street.to, rect.minZ, rect.maxZ);
}

function streetsTouch(a, b) {
  if (a.axis === b.axis) {
    if (a.axis === "x") return Math.abs(a.at - b.at) <= (a.width + b.width) / 2 + EPSILON
      && rangeOverlaps(a.from, a.to, b.from, b.to);
    return Math.abs(a.at - b.at) <= (a.width + b.width) / 2 + EPSILON
      && rangeOverlaps(a.from, a.to, b.from, b.to);
  }
  const x = a.axis === "x" ? b.at : a.at;
  const z = a.axis === "x" ? a.at : b.at;
  return pointOnStreet(a, x, z, b.width / 2) && pointOnStreet(b, x, z, a.width / 2);
}

function connectedStreetIds(start) {
  const visited = new Set([start.id]);
  const pending = [start];
  while (pending.length) {
    const street = pending.shift();
    for (const candidate of STREETS) {
      if (visited.has(candidate.id) || !streetsTouch(street, candidate)) continue;
      visited.add(candidate.id);
      pending.push(candidate);
    }
  }
  return visited;
}

function featureRect(feature) {
  return {
    minX: feature.x - feature.w / 2,
    maxX: feature.x + feature.w / 2,
    minZ: feature.z - feature.d / 2,
    maxZ: feature.z + feature.d / 2,
  };
}

function overlapArea(a, b) {
  const width = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
  const depth = Math.max(0, Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ));
  return width * depth;
}

function streetForGate(gate) {
  const gateStreet = STREETS.find((street) => street.id === `${gate.id}GateStreet`);
  check(!!gateStreet, `${gate.id} gate needs a named ${gate.id}GateStreet.`);
  if (!gateStreet) return null;

  check(gateConnectsToStreet(gate, gateStreet),
    `${gate.id}GateStreet must connect to the ${gate.id} gate (${gate.x}, ${gate.z}), allowing only the wall thickness between its endpoint and gate center.`);
  return gateStreet;
}

// 四门与对应门里大街：不接受门外接路、门内断头的“看起来像城门”。
const gateStreets = new Map(GATES.map((gate) => [gate.id, streetForGate(gate)]));

// 十字街口必须真是各主街汇合的公共节点，不是被道路擦过的一块空地。
const crossroadRect = {
  minX: CROSSROAD.x - CROSSROAD.size / 2,
  maxX: CROSSROAD.x + CROSSROAD.size / 2,
  minZ: CROSSROAD.z - CROSSROAD.size / 2,
  maxZ: CROSSROAD.z + CROSSROAD.size / 2,
};
const mainStreets = STREETS.filter((street) => street.width >= 7);
const mainStreetIdsAtCrossroad = mainStreets
  .filter((street) => streetTouchesRect(street, crossroadRect))
  .map((street) => street.id);
check(mainStreetIdsAtCrossroad.length >= 2,
  `CROSSROAD (${CROSSROAD.x}, ${CROSSROAD.z}) must join at least two primary streets; got ${mainStreetIdsAtCrossroad.join(", ") || "none"}.`);
check(mainStreetIdsAtCrossroad.some((id) => STREETS.find((street) => street.id === id)?.axis === "x")
  && mainStreetIdsAtCrossroad.some((id) => STREETS.find((street) => street.id === id)?.axis === "z"),
"CROSSROAD must be a real east-west / north-south primary-street intersection.");
for (const gate of GATES) {
  const gateStreet = gateStreets.get(gate.id);
  if (!gateStreet) continue;
  const connected = connectedStreetIds(gateStreet);
  check(STREETS.some((street) => connected.has(street.id) && streetTouchesRect(street, crossroadRect)),
    `${gate.id}GateStreet must reach CROSSROAD through an explicit continuous street chain.`);
}

// 西门通视走廊：数据上的西门大街与走廊必须同线；功能院落也不能吃掉净空。
const westStreet = gateStreets.get("West");
const westGate = GATES.find((gate) => gate.id === "West");
if (westStreet && westGate) {
  check(westStreet.axis === "x", "WestGateStreet must be east-west.");
  check(nearlyEqual(westStreet.at, SIGHT_CORRIDOR.atZ)
    && nearlyEqual(westGate.z, SIGHT_CORRIDOR.atZ),
  "West gate, WestGateStreet, and SIGHT_CORRIDOR must share one Z line.");
  check(westStreet.from <= SIGHT_CORRIDOR.fromX + EPSILON
    && westStreet.to >= SIGHT_CORRIDOR.toX - EPSILON,
  "WestGateStreet must cover the complete documented sight corridor.");
}

for (const feature of CITY_FEATURES) {
  const rect = featureRect(feature);
  const corridorOverlap = rangeOverlaps(rect.minX, rect.maxX, SIGHT_CORRIDOR.fromX, SIGHT_CORRIDOR.toX)
    && rect.minZ < SIGHT_CORRIDOR.atZ + SIGHT_CORRIDOR.clearHalfWidth - EPSILON
    && rect.maxZ > SIGHT_CORRIDOR.atZ - SIGHT_CORRIDOR.clearHalfWidth + EPSILON;
  check(!corridorOverlap, `${feature.id} intrudes on the west-gate sight corridor.`);
}

// 道路层级：门里主街 > 城内次街 > 东关巷，防止示意图退化为同宽棋盘格。
const secondaryStreets = STREETS.filter((street) => !mainStreets.includes(street));
const narrowestMain = Math.min(...mainStreets.map((street) => street.width));
const widestSecondary = Math.max(...secondaryStreets.map((street) => street.width));
check(secondaryStreets.length > 0, "Layout needs named secondary streets in addition to gate streets.");
check(narrowestMain > widestSecondary,
  `Primary streets (${narrowestMain} m minimum) must be wider than secondary streets (${widestSecondary} m maximum).`);
check(widestSecondary > EAST_SUBURB.lane.max,
  `Secondary streets (${widestSecondary} m) must be wider than east-suburb lanes (${EAST_SUBURB.lane.max} m).`);

// 图中公共院落必须留在内城、互不大面积压盖，并不许覆盖道路。
const innerLimit = CITY.wallCenter - CITY.wallBaseWidth / 2 - CITY.innerRingWidth;
for (const feature of CITY_FEATURES) {
  const rect = featureRect(feature);
  check(rect.minX >= -innerLimit && rect.maxX <= innerLimit
    && rect.minZ >= -innerLimit && rect.maxZ <= innerLimit,
  `${feature.id} must remain within the inner city, clear of the wall-ring street.`);
  // 示意图里的次街同样是真实可走空间；公共院落不能只避开四条主街。
  for (const street of STREETS) {
    check(!streetTouchesRect(street, rect), `${feature.id} overlaps ${street.id}.`);
  }
}
for (let i = 0; i < CITY_FEATURES.length; i += 1) {
  for (let j = i + 1; j < CITY_FEATURES.length; j += 1) {
    const a = CITY_FEATURES[i], b = CITY_FEATURES[j];
    const shared = overlapArea(featureRect(a), featureRect(b));
    const smaller = Math.min(a.w * a.d, b.w * b.d);
    check(shared <= smaller * 0.12,
      `${a.id} and ${b.id} overlap by ${(shared / smaller * 100).toFixed(1)}%; keep public compounds distinct.`);
  }
}

// 功能分组用建筑类型和尺度读取，避免把所有院落盖成同一种、同一尺寸的方盒。
const kinds = new Set(CITY_FEATURES.map((feature) => feature.kind));
const footprints = new Set(CITY_FEATURES.map((feature) => `${feature.w}x${feature.d}`));
// 「compound 家族要有尺度层次」这条断言写于师部/官署/营部还都挤在 kind="compound"
// 里的时代；v2 之后指挥部/机关/羁押各有专属 kind，通用 compound 只剩零散街坊块。
// 断言随之改口径：院落式 kind 家族（compound/hq/billet/office/districtOffice）合并统计。
const courtyardKinds = new Set(["compound", "hq", "billet", "office", "districtOffice"]);
const compoundFootprints = new Set(CITY_FEATURES
  .filter((feature) => courtyardKinds.has(feature.kind))
  .map((feature) => `${feature.w}x${feature.d}`));
check(kinds.size >= 4, `Public buildings need at least four kinds; got ${[...kinds].join(", ")}.`);
check(footprints.size >= 8, "Public buildings need materially varied footprints, not one repeated block.");
check(compoundFootprints.size >= 4, "Courtyard-family kinds need varied scales for headquarters, offices, and battalion yards.");

// 东关：东门大街从门洞连续进入濠外住宅带；住宅带在濠外，且有足够网格余量形成密集街区。
const eastGate = GATES.find((gate) => gate.id === "East");
const eastStreet = gateStreets.get("East");
check(!!eastGate && !!eastStreet, "East gate and EastGateStreet are required.");
if (eastGate && eastStreet) {
  check(nearlyEqual(EAST_SUBURB.roadZ, eastGate.z) && nearlyEqual(eastStreet.at, eastGate.z),
    "East-suburb road and EastGateStreet must be collinear with the east gate.");
}
const eastGateWallAt = eastGate ? -eastGate.z : 0;
const eastBreachHalf = EAST_DEFENSE.breachWidth / 2;
check(Math.abs(EAST_DEFENSE.breachWallAt - eastGateWallAt) > eastBreachHalf + 11,
  "East-wall breach must not overlap the 22 m east-gate opening.");
const eastBastions = BASTIONS.filter((bastion) => bastion.side === "East");
check(eastBastions.every((bastion) => Math.abs(bastion.at - EAST_DEFENSE.breachWallAt)
  > eastBreachHalf + 4), "East-wall breach must not be covered by a full-height bastion.");
const eastRamps = RAMPS.filter((ramp) => ramp.side === "East");
check(eastRamps.every((ramp) => Math.abs(ramp.at - EAST_DEFENSE.breachWallAt)
  > eastBreachHalf + 12), "East-wall breach must stay clear of the only east-wall ramp.");
check(EAST_DEFENSE.grenadePositions.every((position) =>
  Math.abs(position.wallAt - EAST_DEFENSE.breachWallAt) <= 16),
"East-wall grenade positions must flank the actual breach rather than the obsolete gate overlap.");
check(EAST_SUBURB.bounds.minX > MOAT.outerEdge,
  "East-suburb residences must start outside the moat, never on the moat or inside the city.");
const usableEastWidth = EAST_SUBURB.bounds.maxX - EAST_SUBURB.bounds.minX;
const usableEastDepth = EAST_SUBURB.bounds.maxZ - EAST_SUBURB.bounds.minZ;
const minimumHomes = Math.floor(usableEastWidth / 20) * Math.floor(usableEastDepth / 18);
check(minimumHomes >= 80,
  `East-suburb bounds only allow about ${minimumHomes} 20×18 m homes; keep a dense residential belt (>=80).`);
check(EAST_SUBURB.zhaiWall.enabled === true,
  "The documented east stockade and East_ZhaiGate must be built, not left as disabled placeholder data.");

// L4 同时是场景编辑器的全城俯瞰验收切片。它必须收进完整东郊，而不是只收进
// 关厢前半截；否则远端农院、田埂与荆河前缘会在图上成为一条没有解释的空白。
const l4 = PHASES.find((phase) => phase.id === "L4_Chengqiang");
const eastCoverageEdge = EAST_FIELD.bounds.maxX + 24;
check(!!l4, "L4_Chengqiang is required for the full-city editor aerial.");
if (l4) {
  check(l4.bounds.maxX >= eastCoverageEdge,
    `L4 east edge ${l4.bounds.maxX} must cover the complete east field through ${eastCoverageEdge}.`);
}
check(LEVEL_BOUNDS.L4Wall.maxX >= eastCoverageEdge,
  "Data_Tengxian LEVEL_BOUNDS.L4Wall must stay in sync with the full east-district coverage.");
for (const feature of EAST_SUBURB.features) {
  check(feature.x - feature.w / 2 >= EAST_SUBURB.bounds.minX
    && feature.x + feature.w / 2 <= EAST_SUBURB.bounds.maxX
    && feature.z - feature.d / 2 >= EAST_SUBURB.bounds.minZ
    && feature.z + feature.d / 2 <= EAST_SUBURB.bounds.maxZ,
  `${feature.id} must remain wholly inside the east-suburb residential belt.`);
}

// 一切从示意图落到数值的关系都必须显式登记为推定，免得后续文案误报为测绘事实。
const presumedIds = new Set(PRESUMED.map((item) => item.id));
for (const id of ["streetWidths", "crossroadPosition", "streetTopology", "gateOffsets", "cityFeatureLayout", "eastSuburbLayout"]) {
  check(presumedIds.has(id), `PRESUMED must record the layout assumption: ${id}.`);
}

if (failures.length) {
  console.error(`滕县城布局验收失败：${failures.length}/${checks}`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`滕县城布局验收通过：${checks} 项。`);
