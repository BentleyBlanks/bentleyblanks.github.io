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

// ===========================================================================
// 农田与村缘构件（滕县东关外农田带用，也可复用到任何村落场景）
//
// 与上面那层家什的区别：体量更大、更「生产」，全部按可复用的独立函数导出，
// 由调用方（城模块 / 城外模块）决定往哪儿摆。碰撞只登记真正挡子弹/挡人的：
// 篱笆、碌碡、秸秆垛、坟头 —— 菜畦、粪堆、打谷场这类贴地件不切碎导航图。
// ===========================================================================

/**
 * 枣刺篱笆（wattle fence）：立柱 + 两道横杆 + 斜绑的枝条。
 * 挡视线不到腰以上、挡腿绰绰有余 —— 战场上它就是「能打穿的矮掩体」，
 * 每段登记一个 1.1 m 的低碰撞与掩蔽点，缺口由调用方用 gaps 给出。
 */
export function AddWattleFence(sink, {
  x, z, ry = 0, length = 6, y = 0, seed = "fence", gaps = [],
} = {}) {
  const rnd = Mulberry32(HashString(seed));
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const postEvery = 1.9;
  const nPosts = Math.max(2, Math.round(length / postEvery) + 1);
  let pieces = 0;
  // gaps 按沿线距离给：[起点, 终点]
  const inGap = (s) => gaps.some(([a, b]) => s > a - 0.3 && s < b + 0.3);
  for (let i = 0; i < nPosts; i += 1) {
    const s = (length / (nPosts - 1)) * i;
    if (inGap(s)) continue;
    const p = LocalPoint(x, z, ry, s - length / 2, 0);
    sink.Add("WattleFence", PlaceGeometry(
      MakeBox(0.09, 1.12 + rnd() * 0.10, 0.09, TILE_METERS.wood, `${seed}:p${i}`),
      { x: p.x, y: y + 0.58, z: p.z, ry, rz: (rnd() - 0.5) * 0.08 }));
    pieces += 1;
  }
  // 横杆与枝条按缺口切段
  const cuts = [...gaps.map(([a, b]) => [a, b]), [length + 5, length + 6]]
    .sort((a, b) => a[0] - b[0]);
  let cursor = 0;
  const spans = [];
  for (const [a, b] of cuts) {
    if (a > cursor && Math.min(b, length) - cursor > 0.4) {
      spans.push([cursor, Math.min(b, length)]);
    }
    cursor = Math.max(cursor, b);
  }
  for (const [s0, s1] of spans) {
    const mid = (s0 + s1) / 2;
    const segLen = s1 - s0;
    const p = LocalPoint(x, z, ry, mid - length / 2, 0);
    for (const railY of [0.42, 0.86]) {
      sink.Add("WattleFence", PlaceGeometry(
        MakeBox(segLen, 0.06, 0.05, TILE_METERS.wood, `${seed}:r${railY}`),
        { x: p.x, y: y + railY, z: p.z, ry }));
      pieces += 1;
    }
    // 斜绑的枝条层：读成「编出来的墙面」而不是两根悬空杆
    const brush = Math.max(2, Math.round(segLen / 0.75));
    for (let i = 0; i < brush; i += 1) {
      const bs = s0 + (segLen / brush) * (i + 0.5);
      const bp = LocalPoint(x, z, ry, bs - length / 2, 0);
      sink.Add("WattleFence", PlaceGeometry(
        MakeBox(0.05, 0.95 + rnd() * 0.25, 0.03, TILE_METERS.wood, `${seed}:b${i}`),
        { x: bp.x, y: y + 0.55, z: bp.z, ry, rx: (rnd() - 0.5) * 0.16,
          rz: Math.PI / 2 * 0.94 + rnd() * 0.06 }));
      pieces += 1;
    }
    sink.Solid(p.x, y + 0.55, p.z, segLen / 2, 0.55, 0.09, "fence", ry);
    sink.Cover(p.x, p.z, 1.05, sin, cos);
  }
  return pieces;
}

/** 碌碡（石滚）：打谷场上碾麦子的石辊，卸在架子边或干脆滚倒在地里。 */
export function AddStoneRoller(sink, {
  x, z, ry = 0, y = 0, seed = "roller", scale = 1, framed = true,
} = {}) {
  const rnd = Mulberry32(HashString(seed));
  const rollLen = 0.92 * scale, rollR = 0.17 * scale;
  sink.Add("Stone", PlaceGeometry(
    new THREE.CylinderGeometry(rollR, rollR, rollLen, 14),
    { x, y: y + rollR, z, ry, rz: Math.PI / 2 }));
  let pieces = 1;
  if (framed) {
    for (const side of [-1, 1]) {
      const p = LocalPoint(x, z, ry, side * (rollLen / 2 + 0.04), 0);
      sink.Add("WoodBeam", PlaceGeometry(
        MakeBox(0.07, 0.52 * scale, 0.10, TILE_METERS.wood, `${seed}:pl${side}`),
        { x: p.x, y: y + 0.30 * scale, z: p.z, ry }));
      pieces += 1;
    }
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.08, 0.07, (0.9 + rnd() * 0.5) * scale, TILE_METERS.wood, `${seed}:shaft`),
      { x, y: y + 0.50 * scale, z, ry, rx: 0.18 }));
    pieces += 1;
  } else {
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(rollLen * 0.7, 0.07, 0.07, TILE_METERS.wood, `${seed}:stub`),
      { x: x + Math.sin(ry) * 0.3, y: y + rollR * 0.8, z: z + Math.cos(ry) * 0.3, ry }));
    pieces += 1;
  }
  sink.Solid(x, y + 0.24 * scale, z, 0.42 * scale, 0.24 * scale, 0.28 * scale, "prop", ry);
  return pieces;
}

/** 粪堆：开春要往地里送的第一批肥。矮圆土堆，不挡人也不挡弹。 */
export function AddManureHeap(sink, {
  x, z, y = 0, seed = "heap", scale = 1, material = "PloughSoilDark",
} = {}) {
  const rnd = Mulberry32(HashString(seed));
  const r = (0.9 + rnd() * 0.5) * scale;
  const heap = new THREE.SphereGeometry(r, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  heap.scale(1, 0.42, 0.86);
  sink.Add(material, PlaceGeometry(heap, { x, y: y - 0.02, z, ry: rnd() * Math.PI }));
  // 表面撒几块碎屑把轮廓打破
  for (let i = 0; i < 4; i += 1) {
    const a = rnd() * Math.PI * 2, d = rnd() * r * 0.8;
    sink.Add(material, PlaceGeometry(
      MakeBox(0.14 + rnd() * 0.16, 0.08, 0.12 + rnd() * 0.14, TILE_METERS.ground,
        `${seed}:bit${i}`),
      { x: x + Math.cos(a) * d, y: y + 0.06 + (1 - d / r) * r * 0.34,
        z: z + Math.sin(a) * d, ry: rnd() * Math.PI }));
  }
  return 5;
}

/**
 * 秸秆垛：去年秋收剩下的一垛高粱秸/玉米秸，靠 A 字架斜立。
 * 三月青黄不接，柴火垛是农家院墙外最常见的大件 —— 也是很好的半身遮蔽。
 */
export function AddStalkStack(sink, {
  x, z, ry = 0, y = 0, seed = "stalks", scale = 1, material = "VillageStraw",
} = {}) {
  const rnd = Mulberry32(HashString(seed));
  const w = 1.7 * scale, h = 1.9 * scale;
  // A 字架：一根脊檩两条腿
  sink.Add("WoodBeam", PlaceGeometry(
    MakeBox(w * 1.15, 0.07, 0.07, TILE_METERS.wood, `${seed}:ridge`),
    { x, y: y + h, z, ry, rz: 0 }));
  for (const side of [-1, 1]) {
    const leg = LocalPoint(x, z, ry, 0, side * w * 0.62);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.08, h * 1.25, 0.08, TILE_METERS.wood, `${seed}:leg${side}`),
      { x: leg.x, y: y + h * 0.5, z: leg.z, ry, rx: side * 0.66 }));
  }
  // 斜靠的捆：沿两侧一排细杆，角度略乱
  let pieces = 3;
  const perSide = 7;
  for (const side of [-1, 1]) {
    for (let i = 0; i < perSide; i += 1) {
      const lx = (i / (perSide - 1) - 0.5) * w * 0.96;
      const p = LocalPoint(x, z, ry, lx, side * w * 0.36);
      sink.Add(material, PlaceGeometry(
        new THREE.CylinderGeometry(0.035 * scale, 0.05 * scale,
          h * (1.02 + rnd() * 0.14), 5),
        { x: p.x, y: y + h * 0.52, z: p.z, ry: ry + (rnd() - 0.5) * 0.2,
          rx: side * (0.60 + rnd() * 0.10) }));
      pieces += 1;
    }
  }
  sink.Solid(x, y + h * 0.45, z, w / 2, h * 0.45, 0.42 * scale, "villageStraw", ry);
  sink.Cover(x, z, h * 0.85, Math.sin(ry), Math.cos(ry));
  return pieces;
}

/** 菜畦：开春刚整出来的一畦一畦，有的已经蒙了越冬菠菜的暗绿。贴地件，无碰撞。 */
export function AddVegetableBeds(sink, {
  x, z, ry = 0, y = 0, seed = "beds", rows = 4, rowLength = 4.5, material = "PloughSoilDark",
} = {}) {
  const rnd = Mulberry32(HashString(seed));
  let pieces = 0;
  for (let i = 0; i < rows; i += 1) {
    const lz = (i - (rows - 1) / 2) * 1.05;
    const p = LocalPoint(x, z, ry, 0, lz);
    sink.Add(material, PlaceGeometry(
      MakeBox(rowLength * (0.86 + rnd() * 0.2), 0.17, 0.72, TILE_METERS.ground,
        `${seed}:bed${i}`),
      { x: p.x, y: y + 0.085, z: p.z, ry: ry + (rnd() - 0.5) * 0.03 }));
    pieces += 1;
    if (rnd() < 0.45) {
      // 返青的越冬菜：几条发绿的窄带压在畦面上
      sink.Add("Wheat", PlaceGeometry(
        MakeBox(rowLength * 0.6, 0.05, 0.5, TILE_METERS.ground, `${seed}:green${i}`),
        { x: p.x, y: y + 0.185, z: p.z, ry: ry + (rnd() - 0.5) * 0.04 }));
      pieces += 1;
    }
  }
  return pieces;
}

/** 打谷场：碾压得发白的硬土圆场，秋收的心脏，春天闲着 —— 孩子们在这儿跑。 */
export function AddThreshingFloor(sink, {
  x, z, y = 0, radius = 4.2, material = "YardEarth",
} = {}) {
  const floor = new THREE.CircleGeometry(radius, 26);
  floor.rotateX(-Math.PI / 2);
  const uv = floor.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, uv.getX(i) * radius * 2 / 2.6, uv.getY(i) * radius * 2 / 2.6);
  }
  sink.Add(material, PlaceGeometry(floor, { x, y: y + 0.025, z }));
  return 1;
}

/**
 * 坟头：鲁南平原的坟是地上的小土丘，有的立一块矮石碑。
 * 一片坟地就是一排天然散兵坑 —— 土丘登记低碰撞与掩蔽点。
 */
export function AddGraveMound(sink, {
  x, z, y = 0, seed = "grave", scale = 1, stone = false, material = "VillageStraw",
} = {}) {
  const rnd = Mulberry32(HashString(seed));
  const r = (0.78 + rnd() * 0.35) * scale;
  const mound = new THREE.SphereGeometry(r, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  mound.scale(1, 0.44, 0.88);
  sink.Add(material, PlaceGeometry(mound, { x, y: y - 0.03, z, ry: rnd() * Math.PI }));
  let pieces = 1;
  if (stone || rnd() < 0.35) {
    sink.Add("Stone", PlaceGeometry(
      MakeBox(0.34 * scale, 0.62 * scale, 0.12, TILE_METERS.stone, `${seed}:stone`),
      { x: x - Math.sin(rnd() * Math.PI) * r * 0.4, y: y + 0.30 * scale,
        z: z + r * 0.72, ry: rnd() * 0.3 }));
    pieces += 1;
  }
  sink.Solid(x, y + 0.30 * scale, z, r * 0.82, 0.30 * scale, r * 0.74, "dirt");
  sink.Cover(x, z, 0.72 * scale, 0, 1);
  return pieces;
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
