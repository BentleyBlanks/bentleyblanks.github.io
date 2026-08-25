// 西关整块街区生成器。
//
// 这是给 Data_Tengxian 的矩形用地块使用的低成本 compound kit：一个 block 始终
// 有围合、门洞和 2--6 栋低层建筑，而不是在空地中央放一个可辨识的点地标。
// 不 import 城市数据；调用者只需提供与 Script_Landmark_WestSuburb 相同的 host。

import { AddWall, AddHardMountainRoof, AddDoorReveal } from "./Script_World.mjs";
import { MakeBox, PlaceGeometry, TILE_METERS, BRICK_UV_GRID } from "./Script_Geo.mjs";
import { Mulberry32, HashString } from "./Script_Noise.mjs";

const PITCH = Math.tan(27.5 * Math.PI / 180);
const KIND = new Set(["residence", "shop", "warehouse", "railYard", "service"]);

function Clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

/** Script_World / PlaceGeometry 的同一套局部系。 */
function Frame(x, z, ry) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  return (lx, lz) => ({ x: x + cos * lx + sin * lz, z: z - sin * lx + cos * lz });
}

function GroundAt(host, ctx, x, z) {
  const sample = ctx.groundAt || host.GroundHeight || host.OuterHeight || host.groundAt;
  const y = typeof sample === "function" ? sample.call(host, x, z) : 0;
  return Number.isFinite(y) ? y : 0;
}

/**
 * Script_World 的老构件默认从 y=0 起。把它们写进这个轻量代理可保持原 API，
 * 同时完整 compound 会跟着西关外的解析地面升降；碰撞与掩体也一起上移。
 */
function ElevatedSink(sink, baseY) {
  return {
    Add(material, geometry) {
      if (!geometry) return;
      geometry.translate(0, baseY, 0);
      sink.Add(material, geometry);
    },
    Solid(x, y, z, hx, hy, hz, tag, ry) {
      if (typeof sink.Solid === "function") sink.Solid(x, y + baseY, z, hx, hy, hz, tag, ry);
    },
    Cover(x, z, height, faceX, faceZ) {
      if (typeof sink.Cover === "function") sink.Cover(x, z, height, faceX, faceZ);
    },
  };
}

function AddBox(host, material, { x, y, z, w, h, d, ry = 0, seed, tile = TILE_METERS.brick, grid = null,
  solid = null }) {
  host.sink.Add(material, PlaceGeometry(MakeBox(w, h, d, tile, seed, grid), { x, y: y + h / 2, z, ry }));
  if (solid && typeof host.sink.Solid === "function") {
    host.sink.Solid(x, y + h / 2, z, w / 2, h / 2, d / 2, solid, ry);
  }
}

function AddWallAt(host, material, spec, baseY) {
  AddWall(ElevatedSink(host.sink, baseY), material, spec);
}

function AddRoofAt(host, spec, baseY) {
  AddHardMountainRoof(ElevatedSink(host.sink, baseY), spec);
}

function AddRevealAt(host, spec, baseY) {
  AddDoorReveal(ElevatedSink(host.sink, baseY), spec);
}

function AddGate(host, point, ry, baseY, { openW, height, seed, damage, material }) {
  const wallMat = material || "BrickWall";
  const L = Frame(point.x, point.z, ry);
  for (const side of [-1, 1]) {
    const p = L(side * (openW / 2 + 0.28), 0);
    AddBox(host, wallMat, {
      x: p.x, y: baseY, z: p.z, w: 0.56, h: height, d: 0.72, ry, seed: `${seed}:pier${side}`,
      tile: TILE_METERS.brick, grid: BRICK_UV_GRID, solid: "wall",
    });
  }
  AddBox(host, "WoodBeam", {
    x: point.x, y: baseY + height - 0.44, z: point.z, w: openW + 1.15, h: 0.22, d: 0.74, ry,
    seed: `${seed}:lintel`, tile: TILE_METERS.wood,
  });
  if (damage < 0.6) {
    AddBox(host, "RoofTile", {
      x: point.x, y: baseY + height + 0.08, z: point.z, w: openW + 1.55, h: 0.12, d: 0.95, ry,
      seed: `${seed}:cap`, tile: TILE_METERS.roof,
    });
  }
  // 南侧大门朝局部 +z（街），门道的「里」则是 -z（院内）。
  AddRevealAt(host, { x: point.x, z: point.z, ry: ry + Math.PI, openW, openH: height - 0.55, depth: 1.55,
    seed: `${seed}:reveal`, jamb: true }, baseY);
}

function AddPerimeter(host, block, L, ry, baseY, seed, damage, kind) {
  const w = block.w, d = block.d;
  const wallH = kind === "railYard" ? 1.55 : 2.0;
  const wallMat = damage > 0.68 ? "BrickWallSooty" : (kind === "warehouse" ? "Adobe" : "BrickWall");
  const gateW = Clamp(kind === "railYard" || kind === "warehouse" ? 4.0 : 2.5, 2.1, Math.max(2.1, w - 3.2));
  const sides = [
    { lx: 0, lz: -d / 2, length: w, rot: 0, gate: false },
    { lx: 0, lz: d / 2, length: w, rot: 0, gate: true },
    { lx: -w / 2, lz: 0, length: d, rot: Math.PI / 2, gate: false },
    { lx: w / 2, lz: 0, length: d, rot: Math.PI / 2, gate: false },
  ];
  for (const [index, side] of sides.entries()) {
    const p = L(side.lx, side.lz);
    const wallRy = ry + side.rot;
    if (!side.gate) {
      AddWallAt(host, wallMat, { x: p.x, z: p.z, length: side.length, height: wallH, thickness: 0.36,
        ry: wallRy, ruin: damage * 0.65, seed: `${seed}:wall${index}`,
        tile: wallMat === "Adobe" ? TILE_METERS.adobe : TILE_METERS.brick, plinth: wallMat === "Adobe" ? null : "Stone",
        cope: damage < 0.45 }, baseY);
      continue;
    }
    const segment = (side.length - gateW) / 2;
    for (const direction of [-1, 1]) {
      const q = L(direction * (gateW / 2 + segment / 2), side.lz);
      AddWallAt(host, wallMat, { x: q.x, z: q.z, length: segment, height: wallH, thickness: 0.36,
        ry: wallRy, ruin: damage * 0.65, seed: `${seed}:wall${index}:${direction}`,
        tile: wallMat === "Adobe" ? TILE_METERS.adobe : TILE_METERS.brick, plinth: wallMat === "Adobe" ? null : "Stone",
        cope: damage < 0.45 }, baseY);
    }
    AddGate(host, p, ry, baseY, { openW: gateW, height: wallH + 0.9, seed: `${seed}:gate`, damage, material: wallMat });
  }
}

/** 一栋朝局部 +z 开门的低层砖房；建筑本身也登记为真实 OBB 碰撞。 */
function AddHouse(host, L, {
  lx, lz, width, depth, ry, baseY, seed, damage, material = "BrickWall", eave = 2.65,
  door = true, rafters = false, loading = false,
}) {
  const p = L(lx, lz);
  const roofY = eave + depth * 0.5 * PITCH;
  const t = 0.38;
  const doorW = door ? Clamp(width * (loading ? 0.34 : 0.22), 1.05, loading ? 2.5 : 1.55) : 0;
  const frontZ = lz + depth / 2;
  const back = L(lx, lz - depth / 2);
  const front = L(lx, frontZ);
  AddWallAt(host, material, { x: back.x, z: back.z, length: width, height: eave, thickness: t, ry,
    ruin: damage * 0.65, seed: `${seed}:back`, tile: material === "Adobe" ? TILE_METERS.adobe : TILE_METERS.brick,
    plinth: material === "Adobe" ? null : "Stone" }, baseY);
  for (const side of [-1, 1]) {
    const q = L(lx + side * width / 2, lz);
    AddWallAt(host, material, { x: q.x, z: q.z, length: depth, height: eave, thickness: t, ry: ry + Math.PI / 2,
      ruin: damage * 0.7, seed: `${seed}:side${side}`, tile: material === "Adobe" ? TILE_METERS.adobe : TILE_METERS.brick,
      plinth: material === "Adobe" ? null : "Stone" }, baseY);
  }
  if (door) {
    const segment = Math.max(0.3, (width - doorW) / 2);
    for (const side of [-1, 1]) {
      const q = L(lx + side * (doorW / 2 + segment / 2), frontZ);
      AddWallAt(host, material, { x: q.x, z: q.z, length: segment, height: eave, thickness: t, ry,
        ruin: damage * 0.65, seed: `${seed}:front${side}`, tile: material === "Adobe" ? TILE_METERS.adobe : TILE_METERS.brick,
        plinth: material === "Adobe" ? null : "Stone" }, baseY);
    }
    AddBox(host, material, { x: front.x, y: baseY + Clamp(eave * 0.77, 2.05, eave - 0.2), z: front.z,
      w: doorW, h: Math.max(0.16, eave - Clamp(eave * 0.77, 2.05, eave - 0.2)), d: t, ry,
      seed: `${seed}:doorHead`, tile: material === "Adobe" ? TILE_METERS.adobe : TILE_METERS.brick,
      grid: material === "Adobe" ? null : BRICK_UV_GRID });
    // 房屋门脸在局部 +z，门道朝内应反向指到 -z。
    AddRevealAt(host, { x: front.x, z: front.z, ry: ry + Math.PI, openW: doorW, openH: Clamp(eave * 0.77, 2.05, eave - 0.2),
      depth: 1.2, seed: `${seed}:door`, jamb: !loading }, baseY);
  } else {
    AddWallAt(host, material, { x: front.x, z: front.z, length: width, height: eave, thickness: t, ry,
      ruin: damage * 0.65, seed: `${seed}:front`, tile: material === "Adobe" ? TILE_METERS.adobe : TILE_METERS.brick,
      plinth: material === "Adobe" ? null : "Stone" }, baseY);
  }
  AddRoofAt(host, { x: p.x, z: p.z, width, depth, eaveY: eave, ridgeY: roofY, ry,
    seed: `${seed}:roof`, ruined: damage > 0.8, burnt: damage > 0.7, rafters }, baseY);
  // 门洞是可走的，故不放整栋房的实心碰撞；墙和山墙已逐段登记。
}

function AddLeanTo(host, L, { lx, lz, width, depth, ry, baseY, seed, damage }) {
  const p = L(lx, lz);
  const h = 2.05;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const q = L(lx + sx * (width / 2 - 0.12), lz + sz * (depth / 2 - 0.12));
      AddBox(host, "WoodBeam", { x: q.x, y: baseY, z: q.z, w: 0.16, h, d: 0.16, ry,
        seed: `${seed}:post${sx}${sz}`, tile: TILE_METERS.wood, solid: "prop" });
    }
  }
  AddBox(host, damage > 0.75 ? "BrickWallSooty" : "RoofTile", { x: p.x, y: baseY + h, z: p.z,
    w: width + 0.42, h: 0.12, d: depth + 0.42, ry, seed: `${seed}:roof`, tile: TILE_METERS.roof });
}

function AddCrates(host, L, { lx, lz, ry, baseY, seed, count = 3 }) {
  for (let i = 0; i < count; i += 1) {
    const p = L(lx + (i % 2) * 0.72, lz + Math.floor(i / 2) * 0.68);
    AddBox(host, "WoodBeam", { x: p.x, y: baseY, z: p.z, w: 0.58, h: 0.46 + (i % 2) * 0.18,
      d: 0.54, ry, seed: `${seed}:crate${i}`, tile: TILE_METERS.wood, solid: "prop" });
  }
}

function AddRailYard(host, L, block, common) {
  const { w, d } = block;
  const longW = Clamp(w * 0.68, 8.2, 18);
  const shedD = Clamp(d * 0.25, 4.2, 6.2);
  for (const z of [-d * 0.21, d * 0.13]) {
    AddHouse(host, L, { ...common, lx: -w * 0.06, lz: z, width: longW, depth: shedD,
      seed: `${common.seed}:shed${z}`, material: "Adobe", eave: 3.0, door: true, loading: true });
  }
  AddHouse(host, L, { ...common, lx: w * 0.31, lz: -d * 0.28, width: Clamp(w * 0.22, 3.6, 5.2),
    depth: Clamp(d * 0.22, 3.6, 4.8), seed: `${common.seed}:office`, eave: 2.55, door: true });
  // 两股短轨和稀疏枕木：够读成装卸院，但不创建一个真正的铁路系统。
  for (const x of [-1.18, 1.18]) {
    const p = L(x, d * 0.31);
    AddBox(host, "AntennaSteel", { x: p.x, y: common.baseY + 0.06, z: p.z, w: 0.10,
      h: 0.10, d: Clamp(d * 0.28, 3.4, 7), ry, seed: `${common.seed}:rail${x}`, tile: TILE_METERS.steel });
  }
  for (let i = 0; i < 6; i += 1) {
    const p = L(0, d * 0.19 + i * 0.72);
    AddBox(host, "WoodBeam", { x: p.x, y: common.baseY + 0.02, z: p.z, w: 3.1, h: 0.10, d: 0.16,
      ry, seed: `${common.seed}:tie${i}`, tile: TILE_METERS.wood });
  }
  AddCrates(host, L, { ...common, lx: w * 0.26, lz: d * 0.18, count: 4, seed: `${common.seed}:cargo` });
}

function AddLayout(host, block, L, common, rnd) {
  const { w, d, kind } = block;
  if (kind === "railYard") { AddRailYard(host, L, block, common); return; }
  if (kind === "warehouse") {
    const width = Clamp(w * 0.72, 7.5, 18);
    AddHouse(host, L, { ...common, lx: 0, lz: -d * 0.19, width, depth: Clamp(d * 0.34, 5.4, 8.5),
      seed: `${common.seed}:storeA`, material: "Adobe", eave: 3.25, loading: true, door: true });
    AddHouse(host, L, { ...common, lx: -w * 0.17, lz: d * 0.19, width: Clamp(w * 0.42, 4.6, 9.5),
      depth: Clamp(d * 0.22, 3.5, 5.4), seed: `${common.seed}:storeB`, material: "BrickWall", eave: 2.65 });
    AddLeanTo(host, L, { ...common, lx: w * 0.30, lz: d * 0.18, width: Clamp(w * 0.18, 2.5, 4.5),
      depth: Clamp(d * 0.20, 2.4, 4.2), seed: `${common.seed}:loading` });
    AddCrates(host, L, { ...common, lx: w * 0.2, lz: -d * 0.01, count: 4, seed: `${common.seed}:crates` });
    return;
  }
  if (kind === "shop") {
    const bays = Clamp(Math.round(block.rows || (w > 22 ? 4 : 3)), 2, 4);
    const bayW = Clamp((w - 3.2) / bays, 3.8, 6.2);
    for (let i = 0; i < bays; i += 1) {
      AddHouse(host, L, { ...common, lx: -((bays - 1) * bayW) / 2 + i * bayW, lz: d * 0.24,
        width: bayW - 0.22, depth: Clamp(d * 0.23, 3.6, 5.2), seed: `${common.seed}:shop${i}`,
        eave: 2.85 + (i % 2) * 0.16, door: true, rafters: false });
    }
    AddHouse(host, L, { ...common, lx: -w * 0.12, lz: -d * 0.18, width: Clamp(w * 0.52, 5.6, 12),
      depth: Clamp(d * 0.25, 4.0, 6.5), seed: `${common.seed}:backstore`, material: "Adobe", eave: 2.6,
      door: true, loading: true });
    AddLeanTo(host, L, { ...common, lx: w * 0.31, lz: -d * 0.10, width: 2.7, depth: 2.5,
      seed: `${common.seed}:stall` });
    return;
  }
  if (kind === "service") {
    AddHouse(host, L, { ...common, lx: -w * 0.17, lz: -d * 0.20, width: Clamp(w * 0.46, 5.5, 10.5),
      depth: Clamp(d * 0.29, 4.4, 6.8), seed: `${common.seed}:main`, eave: 2.9, rafters: true });
    AddHouse(host, L, { ...common, lx: w * 0.27, lz: -d * 0.03, width: Clamp(w * 0.23, 3.6, 5.8),
      depth: Clamp(d * 0.26, 3.6, 5.8), seed: `${common.seed}:annex`, material: "Adobe", eave: 2.45 });
    AddHouse(host, L, { ...common, lx: -w * 0.14, lz: d * 0.25, width: Clamp(w * 0.36, 4.5, 8.5),
      depth: Clamp(d * 0.18, 2.8, 4.4), seed: `${common.seed}:rear`, eave: 2.35, door: true });
    AddLeanTo(host, L, { ...common, lx: w * 0.28, lz: d * 0.25, width: 2.6, depth: 2.3,
      seed: `${common.seed}:shelter` });
    return;
  }
  // residence: 一进院，正房 + 一或两座厢房 + 倒座/牲口棚，院心始终留空。
  AddHouse(host, L, { ...common, lx: 0, lz: -d * 0.27, width: Clamp(w * 0.63, 6.5, 12),
    depth: Clamp(d * 0.25, 4.2, 6.3), seed: `${common.seed}:main`, material: rnd() < 0.35 ? "Adobe" : "BrickWall",
    eave: 2.65, rafters: true });
  const wingW = Clamp(w * 0.20, 3.2, 4.8);
  AddHouse(host, L, { ...common, lx: -w * 0.31, lz: -d * 0.01, width: Clamp(d * 0.35, 4.5, 7.6), depth: wingW,
    ry: common.ry + Math.PI / 2, seed: `${common.seed}:wingW`, eave: 2.35, door: true });
  if (w > 16 || rnd() > 0.38) {
    AddHouse(host, L, { ...common, lx: w * 0.31, lz: -d * 0.01, width: Clamp(d * 0.31, 4.1, 7.1), depth: wingW,
      ry: common.ry - Math.PI / 2, seed: `${common.seed}:wingE`, material: "Adobe", eave: 2.28, door: true });
  }
  AddLeanTo(host, L, { ...common, lx: w * 0.19, lz: d * 0.27, width: Clamp(w * 0.20, 2.5, 4.0),
    depth: Clamp(d * 0.16, 2.0, 3.2), seed: `${common.seed}:shed` });
}

/**
 * 为一组西关矩形地块生成围合街区。
 *
 * @param {object} host `sink` 必需；可选 `OnStreet`、`GroundHeight`/`OuterHeight`、
 *   `BeginBlock`/`EndBlock`。sink 遵循 Script_World.BuildSink。
 * @param {Array<object>} blocks `{ id,label,kind,x,z,w,d,ry?,rows?,damage? }`。
 * @param {object} ctx 可选 `{ ry, damage, groundAt }`；block 同名值优先。
 * @returns {{ built: number, skipped: number, buildingCount: number }}
 */
export function BuildWestSuburbBlocks(host, blocks, ctx = {}) {
  if (!host || !host.sink || typeof host.sink.Add !== "function") {
    throw new TypeError("BuildWestSuburbBlocks requires host.sink.Add(material, geometry)");
  }
  const list = Array.isArray(blocks) ? blocks : [];
  const result = { built: 0, skipped: 0, buildingCount: 0 };
  for (const raw of list) {
    const w = Number(raw?.w), d = Number(raw?.d), x = Number(raw?.x), z = Number(raw?.z);
    if (!Number.isFinite(w) || !Number.isFinite(d) || !Number.isFinite(x) || !Number.isFinite(z) || w < 8 || d < 8) {
      result.skipped += 1;
      continue;
    }
    const block = { ...raw, x, z, w, d, kind: KIND.has(raw.kind) ? raw.kind : "residence" };
    if (typeof host.BeginBlock === "function") host.BeginBlock(block);
    try {
      const ry = Number.isFinite(block.ry) ? block.ry : (Number.isFinite(ctx.ry) ? ctx.ry : 0);
      const seed = `westBlocks:${block.id || block.label || `${x}:${z}`}`;
      const rnd = Mulberry32(HashString(seed));
      const damage = Clamp(Number.isFinite(block.damage) ? block.damage : (ctx.damage ?? 0.18), 0, 1);
      const L = Frame(x, z, ry);
      const baseY = GroundAt(host, ctx, x, z);
      const common = { ry, baseY, seed, damage };
      AddPerimeter(host, block, L, ry, baseY, seed, damage, block.kind);
      AddLayout(host, block, L, common, rnd);
      result.built += 1;
      // 各 kind 的上限分别为 residence 4、shop 6、warehouse 3、railYard 3、service 4。
      result.buildingCount += block.kind === "shop" ? Clamp(Math.round(block.rows || (w > 22 ? 4 : 3)), 2, 4) + 2
        : (block.kind === "residence" ? (w > 16 || rnd() > 0.38 ? 4 : 3) : block.kind === "warehouse" ? 3 : block.kind === "railYard" ? 3 : 4);
    } finally {
      if (typeof host.EndBlock === "function") host.EndBlock(block);
    }
  }
  return result;
}
