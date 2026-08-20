// 滕县与鲁南村落的生产生活道具。
//
// 这层只负责可复用的小型几何与确定性组合，不知道城池、道路或关卡边界。
// 调用方决定“哪里能摆”，这里决定“摆什么、怎么组合”。全部走 BuildSink 合批，
// 不为每只篮子/板凳增加 draw call；大车与货摊登记粗碰撞，小件不切碎导航图。

import * as THREE from "three";
import { Mulberry32, HashString } from "./Script_Noise.mjs";
import { MakeBox, PlaceGeometry, TILE_METERS } from "./Script_Geo.mjs";

function LocalPoint(x, z, ry, localX, localZ) {
  return {
    x: x + Math.cos(ry) * localX + Math.sin(ry) * localZ,
    z: z - Math.sin(ry) * localX + Math.cos(ry) * localZ,
  };
}

function AddJar(sink, { x, z, y = 0, ry = 0, seed = "jar", scale = 1 }) {
  const body = new THREE.CylinderGeometry(0.27 * scale, 0.34 * scale, 0.58 * scale, 12, 2);
  sink.Add("HouseholdCeramic", PlaceGeometry(body,
    { x, y: y + 0.29 * scale, z, ry }));
  const shoulder = new THREE.CylinderGeometry(0.18 * scale, 0.27 * scale, 0.18 * scale, 12);
  sink.Add("HouseholdCeramic", PlaceGeometry(shoulder,
    { x, y: y + 0.67 * scale, z, ry }));
  const rim = new THREE.TorusGeometry(0.18 * scale, 0.035 * scale, 5, 12);
  rim.rotateX(Math.PI / 2);
  sink.Add("HouseholdCeramic", PlaceGeometry(rim,
    { x, y: y + 0.77 * scale, z, ry: ry + (HashString(seed) % 17) * 0.03 }));
  return 1;
}

function AddBasket(sink, { x, z, y = 0, ry = 0, seed = "basket", scale = 1 }) {
  const body = new THREE.CylinderGeometry(0.32 * scale, 0.24 * scale, 0.42 * scale, 10, 1, true);
  sink.Add("Wicker", PlaceGeometry(body, { x, y: y + 0.21 * scale, z, ry }));
  const rim = new THREE.TorusGeometry(0.32 * scale, 0.032 * scale, 4, 10);
  rim.rotateX(Math.PI / 2);
  sink.Add("Wicker", PlaceGeometry(rim, { x, y: y + 0.42 * scale, z, ry }));
  if (HashString(seed) % 3 === 0) {
    sink.Add("Wicker", PlaceGeometry(
      MakeBox(0.04 * scale, 0.46 * scale, 0.04 * scale, TILE_METERS.wood, `${seed}:handle`),
      { x, y: y + 0.55 * scale, z, ry, rz: 0.72 }));
  }
  return 1;
}

function AddBench(sink, { x, z, y = 0, ry = 0, seed = "bench", scale = 1 }) {
  sink.Add("WoodDoor", PlaceGeometry(
    MakeBox(1.35 * scale, 0.12 * scale, 0.34 * scale, TILE_METERS.wood, `${seed}:seat`),
    { x, y: y + 0.48 * scale, z, ry }));
  for (const side of [-1, 1]) {
    const leg = LocalPoint(x, z, ry, side * 0.48 * scale, 0);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.10 * scale, 0.46 * scale, 0.24 * scale, TILE_METERS.wood, `${seed}:leg${side}`),
      { x: leg.x, y: y + 0.23 * scale, z: leg.z, ry }));
  }
  return 1;
}

function AddLowTable(sink, { x, z, y = 0, ry = 0, seed = "table", scale = 1 }) {
  sink.Add("WoodDoor", PlaceGeometry(
    MakeBox(1.05 * scale, 0.11 * scale, 0.72 * scale, TILE_METERS.wood, `${seed}:top`),
    { x, y: y + 0.67 * scale, z, ry }));
  for (const sideX of [-1, 1]) for (const sideZ of [-1, 1]) {
    const leg = LocalPoint(x, z, ry, sideX * 0.39 * scale, sideZ * 0.23 * scale);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.09 * scale, 0.64 * scale, 0.09 * scale, TILE_METERS.wood,
        `${seed}:leg${sideX}${sideZ}`),
      { x: leg.x, y: y + 0.32 * scale, z: leg.z, ry }));
  }
  const stool = LocalPoint(x, z, ry, 0.82 * scale, 0.18 * scale);
  AddBench(sink, { x: stool.x, z: stool.z, y, ry: ry + Math.PI / 2,
    seed: `${seed}:stool`, scale: 0.52 * scale });
  return 2;
}

function AddWoodpile(sink, { x, z, y = 0, ry = 0, seed = "woodpile", scale = 1 }) {
  const rnd = Mulberry32(HashString(seed));
  const rows = 3;
  let count = 0;
  for (let row = 0; row < rows; row += 1) {
    const pieces = 5 - row;
    for (let i = 0; i < pieces; i += 1) {
      const localX = (-pieces / 2 + i + 0.5) * 0.25 * scale;
      const localZ = (rnd() - 0.5) * 0.13 * scale;
      const p = LocalPoint(x, z, ry, localX, localZ);
      const log = new THREE.CylinderGeometry(0.085 * scale, 0.10 * scale,
        (0.68 + rnd() * 0.34) * scale, 6);
      sink.Add("WoodBeam", PlaceGeometry(log, {
        x: p.x, y: y + (0.12 + row * 0.18) * scale, z: p.z,
        ry: ry + (rnd() - 0.5) * 0.10, rz: Math.PI / 2,
      }));
      count += 1;
    }
  }
  sink.Solid(x, y + 0.28 * scale, z, 0.72 * scale, 0.28 * scale, 0.38 * scale,
    "householdWoodpile", ry);
  return count;
}

function AddDryingRack(sink, { x, z, y = 0, ry = 0, seed = "rack", scale = 1 }) {
  for (const side of [-1, 1]) {
    const p = LocalPoint(x, z, ry, side * 0.92 * scale, 0);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.10 * scale, 1.85 * scale, 0.10 * scale, TILE_METERS.wood, `${seed}:post${side}`),
      { x: p.x, y: y + 0.925 * scale, z: p.z, ry }));
  }
  sink.Add("WoodBeam", PlaceGeometry(
    MakeBox(2.05 * scale, 0.09 * scale, 0.09 * scale, TILE_METERS.wood, `${seed}:bar`),
    { x, y: y + 1.72 * scale, z, ry }));
  for (let i = 0; i < 3; i += 1) {
    const p = LocalPoint(x, z, ry, (-0.58 + i * 0.58) * scale, 0.03 * (i % 2));
    const clothW = (0.38 + (HashString(`${seed}:${i}`) % 9) * 0.02) * scale;
    sink.Add("HouseholdCloth", PlaceGeometry(
      MakeBox(clothW, (0.52 + i * 0.08) * scale, 0.025 * scale,
        TILE_METERS.cloth, `${seed}:cloth${i}`),
      { x: p.x, y: y + 1.38 * scale, z: p.z, ry, rz: (i - 1) * 0.04 }));
  }
  return 4;
}

function AddLadder(sink, { x, z, y = 0, ry = 0, seed = "ladder", scale = 1 }) {
  for (const side of [-1, 1]) {
    const p = LocalPoint(x, z, ry, side * 0.30 * scale, 0);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.07 * scale, 2.10 * scale, 0.07 * scale, TILE_METERS.wood, `${seed}:rail${side}`),
      { x: p.x, y: y + 1.03 * scale, z: p.z, ry, rx: -0.16 }));
  }
  for (let i = 0; i < 6; i += 1) {
    const p = LocalPoint(x, z, ry, 0, -0.16 + i * 0.055);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.68 * scale, 0.06 * scale, 0.06 * scale, TILE_METERS.wood, `${seed}:rung${i}`),
      { x: p.x, y: y + (0.30 + i * 0.31) * scale, z: p.z, ry, rx: -0.16 }));
  }
  return 1;
}

function AddCrates(sink, { x, z, y = 0, ry = 0, seed = "crates", count = 3, scale = 1 }) {
  const rnd = Mulberry32(HashString(seed));
  for (let i = 0; i < count; i += 1) {
    const size = (0.42 + rnd() * 0.18) * scale;
    const p = LocalPoint(x, z, ry, (i - (count - 1) / 2) * 0.44 * scale,
      (rnd() - 0.5) * 0.34 * scale);
    sink.Add("WoodDoor", PlaceGeometry(
      MakeBox(size, size * 0.72, size, TILE_METERS.wood, `${seed}:${i}`),
      { x: p.x, y: y + size * 0.36, z: p.z, ry: ry + (rnd() - 0.5) * 0.24 }));
  }
  return count;
}

function AddHandcart(sink, { x, z, y = 0, ry = 0, seed = "cart", scale = 1 }) {
  for (const side of [-1, 1]) {
    const wheel = LocalPoint(x, z, ry, side * 0.72 * scale, 0);
    const geometry = new THREE.CylinderGeometry(0.48 * scale, 0.48 * scale, 0.09 * scale, 12);
    sink.Add("WoodBeam", PlaceGeometry(geometry,
      { x: wheel.x, y: y + 0.48 * scale, z: wheel.z, ry, rz: Math.PI / 2 }));
    const shaft = LocalPoint(x, z, ry, side * 0.38 * scale, 1.58 * scale);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.09 * scale, 0.09 * scale, 2.10 * scale, TILE_METERS.wood,
        `${seed}:shaft${side}`),
      { x: shaft.x, y: y + 0.68 * scale, z: shaft.z, ry }));
  }
  sink.Add("WoodDoor", PlaceGeometry(
    MakeBox(1.30 * scale, 0.18 * scale, 1.55 * scale, TILE_METERS.wood, `${seed}:bed`),
    { x, y: y + 0.65 * scale, z, ry }));
  sink.Solid(x, y + 0.50 * scale, z, 0.78 * scale, 0.50 * scale, 0.88 * scale,
    "householdCart", ry);
  return 1;
}

function AddMarketStall(sink, { x, z, y = 0, ry = 0, seed = "stall", scale = 1 }) {
  AddLowTable(sink, { x, z, y, ry, seed: `${seed}:table`, scale: 1.25 * scale });
  for (const side of [-1, 1]) {
    const p = LocalPoint(x, z, ry, side * 0.82 * scale, 0);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.08 * scale, 2.05 * scale, 0.08 * scale, TILE_METERS.wood, `${seed}:post${side}`),
      { x: p.x, y: y + 1.03 * scale, z: p.z, ry }));
  }
  sink.Add("HouseholdCloth", PlaceGeometry(
    MakeBox(1.95 * scale, 0.055 * scale, 1.25 * scale, TILE_METERS.cloth, `${seed}:awning`),
    { x, y: y + 1.98 * scale, z, ry, rx: 0.06 }));
  AddBasket(sink, { ...LocalPoint(x, z, ry, -0.48 * scale, 0.05), y: y + 0.72 * scale,
    ry, seed: `${seed}:basket0`, scale: 0.8 * scale });
  AddBasket(sink, { ...LocalPoint(x, z, ry, 0.42 * scale, 0.02), y: y + 0.72 * scale,
    ry, seed: `${seed}:basket1`, scale: 0.72 * scale });
  sink.Solid(x, y + 1.0 * scale, z, 1.0 * scale, 1.0 * scale, 0.68 * scale,
    "streetStall", ry);
  return 5;
}

function AddHaystack(sink, { x, z, y = 0, ry = 0, seed = "hay", scale = 1,
  material = "VillageStraw" }) {
  const stack = new THREE.CylinderGeometry(0.72 * scale, 1.02 * scale, 1.34 * scale, 10);
  sink.Add(material, PlaceGeometry(stack, { x, y: y + 0.67 * scale, z, ry }));
  const cap = new THREE.ConeGeometry(0.78 * scale, 0.72 * scale, 10);
  sink.Add(material, PlaceGeometry(cap, { x, y: y + 1.70 * scale, z, ry }));
  sink.Solid(x, y + 0.98 * scale, z, 0.92 * scale, 0.98 * scale, 0.92 * scale,
    "villageStraw", ry);
  return 1;
}

function AddGroundEllipse(sink, material, { x, z, y, ry = 0, rx, rz, seed = "wear" }) {
  const geometry = new THREE.CircleGeometry(1, 18);
  geometry.scale(rx, rz, 1);
  geometry.rotateX(-Math.PI / 2);
  sink.Add(material, PlaceGeometry(geometry, { x, y, z, ry }));
  void seed;
}

/** 门前/院心被反复踩实、扫过的地面，不是整院一张同色塑料板。 */
export function AddYardWear(sink, {
  x, z, ry = 0, baseY = 0, seed = "yardWear", radius = 2.4, material = "RoadWear",
} = {}) {
  const rnd = Mulberry32(HashString(seed));
  for (let i = 0; i < 3; i += 1) {
    const p = LocalPoint(x, z, ry, (rnd() - 0.5) * radius * 0.7, (rnd() - 0.5) * radius * 0.55);
    AddGroundEllipse(sink, material, {
      x: p.x, z: p.z, y: baseY + 0.012 + i * 0.002, ry: ry + rnd() * 0.5,
      rx: radius * (0.55 + rnd() * 0.35), rz: radius * (0.26 + rnd() * 0.22),
      seed: `${seed}:${i}`,
    });
  }
  return 3;
}

/** 院内组合：靠墙储物 + 一件较大的日常活动构件，中央仍留人走动。 */
export function AddCourtyardLife(sink, {
  x, z, ry = 0, baseY = 0, seed = "courtyard", width = 10, depth = 7, damage = 0,
} = {}) {
  const rnd = Mulberry32(HashString(seed));
  let items = AddYardWear(sink, { x, z, ry, baseY, seed: `${seed}:wear`,
    radius: Math.min(width, depth) * 0.28 });
  const wallX = Math.max(1.6, width * 0.34);
  const backZ = -Math.max(1.2, depth * 0.26);
  const jar = LocalPoint(x, z, ry, wallX, backZ);
  items += AddJar(sink, { x: jar.x, z: jar.z, y: baseY, ry, seed: `${seed}:jar`,
    scale: 0.9 + rnd() * 0.22 });
  const basket = LocalPoint(x, z, ry, wallX - 0.75, backZ + 0.18);
  items += AddBasket(sink, { x: basket.x, z: basket.z, y: baseY, ry,
    seed: `${seed}:basket`, scale: 0.9 });

  const variant = HashString(`${seed}:variant`) % 5;
  const activity = LocalPoint(x, z, ry, -Math.min(wallX, 2.8), 0.15);
  if (variant === 0) items += AddWoodpile(sink,
    { x: activity.x, z: activity.z, y: baseY, ry, seed: `${seed}:wood` });
  else if (variant === 1) items += AddDryingRack(sink,
    { x: activity.x, z: activity.z, y: baseY, ry, seed: `${seed}:dry` });
  else if (variant === 2) items += AddLowTable(sink,
    { x: activity.x, z: activity.z, y: baseY, ry: ry + 0.18, seed: `${seed}:table` });
  else if (variant === 3) {
    items += AddBench(sink,
      { x: activity.x, z: activity.z, y: baseY, ry, seed: `${seed}:bench` });
    const ladder = LocalPoint(x, z, ry, -wallX, backZ);
    items += AddLadder(sink,
      { x: ladder.x, z: ladder.z, y: baseY, ry, seed: `${seed}:ladder` });
  } else {
    items += AddCrates(sink,
      { x: activity.x, z: activity.z, y: baseY, ry, seed: `${seed}:crates`, count: 3 });
  }
  if (damage > 0.52) {
    const fallen = LocalPoint(x, z, ry, (rnd() - 0.5) * 2.4, (rnd() - 0.5) * 1.6);
    sink.Add("WoodDoor", PlaceGeometry(
      MakeBox(1.15, 0.08, 0.34, TILE_METERS.wood, `${seed}:fallen`),
      { x: fallen.x, y: baseY + 0.06, z: fallen.z, ry: ry + rnd() * 2.4, rz: 0.08 }));
    items += 1;
  }
  return items;
}

/** 沿街肩摆放的组合；调用方已经把中心放在路边，这里不再向路心扩张。 */
export function AddStreetLife(sink, {
  x, z, ry = 0, baseY = 0, seed = "street", commerce = false,
} = {}) {
  const rnd = Mulberry32(HashString(seed));
  const variant = HashString(`${seed}:variant`) % (commerce ? 6 : 5);
  let items = 0;
  if (commerce && variant === 0) {
    items += AddMarketStall(sink, { x, z, y: baseY, ry, seed: `${seed}:stall`, scale: 0.92 });
  } else if (variant === 1) {
    items += AddHandcart(sink, { x, z, y: baseY, ry: ry + (rnd() - 0.5) * 0.16,
      seed: `${seed}:cart`, scale: 0.88 });
    const p = LocalPoint(x, z, ry, 1.18, 0.15);
    items += AddBasket(sink, { x: p.x, z: p.z, y: baseY, ry, seed: `${seed}:basket` });
  } else if (variant === 2) {
    items += AddBench(sink, { x, z, y: baseY, ry, seed: `${seed}:bench` });
    for (const side of [-1, 1]) {
      const p = LocalPoint(x, z, ry, side * 0.82, 0.16);
      items += AddJar(sink, { x: p.x, z: p.z, y: baseY, ry,
        seed: `${seed}:jar${side}`, scale: 0.72 + rnd() * 0.16 });
    }
  } else if (variant === 3) {
    items += AddCrates(sink, { x, z, y: baseY, ry, seed: `${seed}:crates`, count: commerce ? 5 : 3 });
    const p = LocalPoint(x, z, ry, 0.85, 0.22);
    items += AddBasket(sink, { x: p.x, z: p.z, y: baseY, ry, seed: `${seed}:basket` });
  } else if (variant === 4) {
    items += AddWoodpile(sink, { x, z, y: baseY, ry, seed: `${seed}:wood`, scale: 0.86 });
    const p = LocalPoint(x, z, ry, 0.95, 0.08);
    items += AddLadder(sink, { x: p.x, z: p.z, y: baseY, ry,
      seed: `${seed}:ladder`, scale: 0.82 });
  } else {
    items += AddLowTable(sink, { x, z, y: baseY, ry, seed: `${seed}:table`, scale: 0.82 });
    items += AddBasket(sink, { ...LocalPoint(x, z, ry, -0.84, 0.12), y: baseY, ry,
      seed: `${seed}:basket`, scale: 0.9 });
  }

  // 每组旁边留几块低矮碎物/扫拢的土，不登记碰撞，轮廓不会仍然孤零零。
  for (let i = 0; i < 4; i += 1) {
    const p = LocalPoint(x, z, ry, (rnd() - 0.5) * 2.8, 0.45 + rnd() * 0.45);
    sink.Add("RoadLitter", PlaceGeometry(
      MakeBox(0.12 + rnd() * 0.30, 0.04 + rnd() * 0.10, 0.10 + rnd() * 0.24,
        TILE_METERS.ground, `${seed}:litter${i}`),
      { x: p.x, y: baseY + 0.04, z: p.z, ry: ry + rnd() * Math.PI }));
    items += 1;
  }
  return items;
}

/** 村院组合：生活与农业生产混合，体量比城内家什大一档。 */
export function AddVillageLife(sink, {
  x, z, ry = 0, baseY = 0, seed = "village", strawMaterial = "VillageStraw",
} = {}) {
  const variant = HashString(`${seed}:variant`) % 5;
  let items = AddYardWear(sink, { x, z, ry, baseY, seed: `${seed}:wear`, radius: 3.0 });
  if (variant === 0) {
    items += AddHaystack(sink, { ...LocalPoint(x, z, ry, 2.4, 0.7), y: baseY, ry,
      seed: `${seed}:hay`, material: strawMaterial });
    items += AddWoodpile(sink, { ...LocalPoint(x, z, ry, -1.7, 0.9), y: baseY, ry,
      seed: `${seed}:wood` });
  } else if (variant === 1) {
    items += AddHandcart(sink, { x, z, y: baseY, ry, seed: `${seed}:cart` });
    items += AddCrates(sink, { ...LocalPoint(x, z, ry, 1.8, 0.7), y: baseY, ry,
      seed: `${seed}:crates`, count: 3 });
  } else if (variant === 2) {
    items += AddDryingRack(sink, { x, z, y: baseY, ry, seed: `${seed}:dry` });
    items += AddLowTable(sink, { ...LocalPoint(x, z, ry, -1.8, 0.6), y: baseY, ry,
      seed: `${seed}:table`, scale: 0.86 });
  } else if (variant === 3) {
    items += AddHaystack(sink, { ...LocalPoint(x, z, ry, 2.2, 0.8), y: baseY, ry,
      seed: `${seed}:hay`, material: strawMaterial, scale: 0.88 });
    items += AddLadder(sink, { ...LocalPoint(x, z, ry, -2.0, 0.2), y: baseY, ry,
      seed: `${seed}:ladder` });
    items += AddBasket(sink, { ...LocalPoint(x, z, ry, -1.15, 0.65), y: baseY, ry,
      seed: `${seed}:basket` });
  } else {
    items += AddBench(sink, { x, z, y: baseY, ry, seed: `${seed}:bench` });
    for (const side of [-1, 1]) items += AddJar(sink, {
      ...LocalPoint(x, z, ry, side * 1.05, 0.45), y: baseY, ry,
      seed: `${seed}:jar${side}`, scale: 0.88,
    });
    items += AddBasket(sink, { ...LocalPoint(x, z, ry, 0, 0.85), y: baseY, ry,
      seed: `${seed}:basket`, scale: 0.92 });
  }
  return items;
}

/** 分段车辙、脚迹与修补斑；不会生成一条从城门贯穿到底的机械直线。 */
export function AddRoadWear(sink, {
  x, z, ry = 0, length = 20, width = 7, baseY = 0, seed = "roadWear",
  material = "RoadWear",
} = {}) {
  const rnd = Mulberry32(HashString(seed));
  const segmentLength = 10.5;
  const segments = Math.max(1, Math.ceil(length / segmentLength));
  let marks = 0;
  for (let i = 0; i < segments; i += 1) {
    if (rnd() < 0.30) continue;
    const len = Math.min(segmentLength * (0.36 + rnd() * 0.30), length - i * segmentLength);
    const centerX = -length / 2 + i * segmentLength + len / 2 + (rnd() - 0.5) * 0.8;
    for (const side of [-1, 1]) {
      const p = LocalPoint(x, z, ry, centerX, side * Math.min(1.05, width * 0.18) + (rnd() - 0.5) * 0.12);
      sink.Add(material, PlaceGeometry(
        MakeBox(Math.max(0.3, len), 0.018, 0.09 + rnd() * 0.055,
          TILE_METERS.ground, `${seed}:rut${i}${side}`),
        { x: p.x, y: baseY + 0.011, z: p.z, ry: ry + (rnd() - 0.5) * 0.012 }));
      marks += 1;
    }
  }
  const footprints = Math.min(36, Math.max(8, Math.round(length / 5)));
  for (let i = 0; i < footprints; i += 1) {
    const localX = -length / 2 + rnd() * length;
    const localZ = (i % 2 === 0 ? -1 : 1) * (0.18 + rnd() * Math.min(0.9, width * 0.16));
    const p = LocalPoint(x, z, ry, localX, localZ);
    sink.Add(material, PlaceGeometry(
      MakeBox(0.20, 0.018, 0.085, TILE_METERS.ground, `${seed}:foot${i}`),
      { x: p.x, y: baseY + 0.014, z: p.z, ry: ry + (i % 2 ? 0.14 : -0.14) }));
    marks += 1;
  }
  return marks;
}
