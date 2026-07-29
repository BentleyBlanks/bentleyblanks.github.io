/**
 * Script_World.mjs — 地形 / 村庄 / 碰撞 / 导航 / 掩体 / 视线 / 交互物 / 脚印
 * Owner: AgentWorld
 *
 * ⚠ 本文件目前是 **AgentBoot 铺设的可运行灰盒实现**：公开 API 与 AGENTS.md 5.7 一致，
 *   AgentWorld 接管后可整体重写内部，EnemyAi / Player 无需改动。
 *
 * 依赖 DAG：three, Config, Math, Art（只取材质）。禁止 import Character / Player / EnemyAi。
 * 全部几何程序化生成，静态件一律 InstancedMesh，共享材质，draw call 受控。
 */

import * as THREE from 'three';
import { Config, Palette } from './Script_Config.mjs';
import * as MathUtil from './Script_Math.mjs';

const WorldConfig = Config.World;

/* ================================================================== *
 * 一、碰撞体与射线（全部轴对齐盒，灰盒阶段够用且精确）
 * ================================================================== */

function MakeBox(cx, cy, cz, sx, sy, sz, surface, kind) {
  return {
    minX: cx - sx * 0.5, maxX: cx + sx * 0.5,
    minY: cy - sy * 0.5, maxY: cy + sy * 0.5,
    minZ: cz - sz * 0.5, maxZ: cz + sz * 0.5,
    cx: cx, cy: cy, cz: cz, sx: sx, sy: sy, sz: sz,
    surface: surface || 'Stone', kind: kind || 'Wall',
  };
}

/** 线段 vs AABB（slab 法）。返回命中距离或 -1。 */
function RayBox(box, ox, oy, oz, dx, dy, dz, maxDistance) {
  let near = 0;
  let far = maxDistance;
  const origin = [ox, oy, oz];
  const direction = [dx, dy, dz];
  const lower = [box.minX, box.minY, box.minZ];
  const upper = [box.maxX, box.maxY, box.maxZ];
  for (let axis = 0; axis < 3; axis += 1) {
    const d = direction[axis];
    const o = origin[axis];
    if (Math.abs(d) < 1e-8) {
      if (o < lower[axis] || o > upper[axis]) return -1;
      continue;
    }
    const inverse = 1 / d;
    let t0 = (lower[axis] - o) * inverse;
    let t1 = (upper[axis] - o) * inverse;
    if (t0 > t1) { const swap = t0; t0 = t1; t1 = swap; }
    if (t0 > near) near = t0;
    if (t1 < far) far = t1;
    if (near > far) return -1;
  }
  return near;
}

function BoxNormalAt(box, x, y, z, out) {
  const dx0 = Math.abs(x - box.minX);
  const dx1 = Math.abs(x - box.maxX);
  const dy0 = Math.abs(y - box.minY);
  const dy1 = Math.abs(y - box.maxY);
  const dz0 = Math.abs(z - box.minZ);
  const dz1 = Math.abs(z - box.maxZ);
  let best = dx0; let nx = -1; let ny = 0; let nz = 0;
  if (dx1 < best) { best = dx1; nx = 1; ny = 0; nz = 0; }
  if (dy0 < best) { best = dy0; nx = 0; ny = -1; nz = 0; }
  if (dy1 < best) { best = dy1; nx = 0; ny = 1; nz = 0; }
  if (dz0 < best) { best = dz0; nx = 0; ny = 0; nz = -1; }
  if (dz1 < best) { nx = 0; ny = 0; nz = 1; }
  return out.set(nx, ny, nz);
}

/* ================================================================== *
 * 二、World
 * ================================================================== */

export function CreateWorld(ctx, options) {
  const settings = options || {};
  const chapterId = settings.chapterId || 'ChapterSnowCellar';
  const preset = settings.preset || 'Village';
  const seed = settings.seed === undefined ? 19431217 : settings.seed;
  const presetData = WorldConfig.Presets[preset] || WorldConfig.Presets.Village;
  const random = MathUtil.CreateRandom(seed);
  const art = ctx.art;
  const THREEns = ctx.THREE || THREE;

  const spanX = presetData.spanX;
  const spanZ = presetData.spanZ;
  const bounds = { minX: -spanX / 2, maxX: spanX / 2, minZ: -spanZ / 2, maxZ: spanZ / 2 };

  const group = new THREEns.Group();
  group.name = 'GroupWorld_' + preset;

  const seedOffsetX = (random.Next() - 0.5) * 400;
  const seedOffsetZ = (random.Next() - 0.5) * 400;
  const roadOffsetX = preset === 'Valley' ? 6 : -4;

  /* ---------------------------------------------------------------- *
   * 2.1 地形高度场（解析函数：网格与查询共用同一份，永远不会「视觉与碰撞不一致」）
   * ---------------------------------------------------------------- */

  const noiseScale = WorldConfig.terrainNoiseScale;
  const heightScale = WorldConfig.terrainHeightScale;

  function RoadMask(x, z) {
    const lateral = Math.abs(x - roadOffsetX + Math.sin(z * 0.035) * 3.5);
    return 1 - MathUtil.SmoothStep(2.6, 6.2, lateral);
  }

  function TerrainHeight(x, z) {
    const nx = (x + seedOffsetX) * noiseScale;
    const nz = (z + seedOffsetZ) * noiseScale;
    const base = MathUtil.Fbm2(nx, nz, 5, 2.05, 0.5);
    const ridge = MathUtil.Ridge2(nx * 0.55, nz * 0.55, 3);
    const distance = Math.sqrt(x * x + z * z);
    const rim = MathUtil.SmoothStep(spanX * 0.16, spanX * 0.52, distance);
    let height = base * heightScale * (0.16 + rim * 1.1);
    height += ridge * rim * heightScale * 0.9;
    height += rim * rim * heightScale * 0.85;
    const road = RoadMask(x, z);
    if (road > 0) height = MathUtil.Lerp(height, height * 0.55 - 0.22, road * 0.9);
    return height;
  }

  function TerrainNormal(x, z, out) {
    const step = 0.6;
    const hL = TerrainHeight(x - step, z);
    const hR = TerrainHeight(x + step, z);
    const hD = TerrainHeight(x, z - step);
    const hU = TerrainHeight(x, z + step);
    const target = out || new THREEns.Vector3();
    return target.set(hL - hR, step * 2, hD - hU).normalize();
  }

  /* 地形网格 —— 顶点色区分积雪 / 踩实的路 / 露出的岩石 */
  const terrainSegments = preset === 'Pass' ? 120 : 128;
  const terrainGeometry = new THREEns.PlaneGeometry(spanX, spanZ, terrainSegments, terrainSegments);
  terrainGeometry.rotateX(-Math.PI / 2);
  const terrainPositions = terrainGeometry.attributes.position;
  const terrainColors = new Float32Array(terrainPositions.count * 3);
  const colorSnow = new THREEns.Color(Palette.SnowLit);
  const colorShadow = new THREEns.Color(Palette.SnowShadow);
  const colorPacked = new THREEns.Color(Palette.SnowTrampled);
  const colorRock = new THREEns.Color(Palette.Rock);
  const mixColor = new THREEns.Color();
  for (let i = 0; i < terrainPositions.count; i += 1) {
    const x = terrainPositions.getX(i);
    const z = terrainPositions.getZ(i);
    const height = TerrainHeight(x, z);
    terrainPositions.setY(i, height);
    const slope = Math.abs(TerrainHeight(x + 1, z) - height) + Math.abs(TerrainHeight(x, z + 1) - height);
    mixColor.copy(colorSnow).lerp(colorShadow, MathUtil.Clamp01(0.12 + MathUtil.Noise2(x * 0.12, z * 0.12) * 0.28));
    mixColor.lerp(colorRock, MathUtil.Clamp01((slope - 0.75) * 0.85));
    mixColor.lerp(colorPacked, RoadMask(x, z) * 0.85);
    terrainColors[i * 3] = mixColor.r;
    terrainColors[i * 3 + 1] = mixColor.g;
    terrainColors[i * 3 + 2] = mixColor.b;
  }
  terrainGeometry.setAttribute('color', new THREEns.BufferAttribute(terrainColors, 3));
  terrainGeometry.computeVertexNormals();
  /* 顶点色已经承担了雪/路/岩的全部明暗，基色必须放白，否则会被材质底色再乘暗一次 */
  const terrainMaterial = art.MakeVariant('SnowGround', 'Terrain' + preset, {
    vertexColors: true, color: 0xffffff, roughness: 0.95,
  });
  const terrain = new THREEns.Mesh(terrainGeometry, terrainMaterial);
  terrain.name = 'MeshTerrain';
  terrain.receiveShadow = true;
  group.add(terrain);

  /* ---------------------------------------------------------------- *
   * 2.2 村庄：土坯房 / 断墙 / 焦木 / 石头 / 枯树
   * ---------------------------------------------------------------- */

  const colliders = [];
  const covers = [];
  const buildingBoxes = [];      /* MudWall */
  const burntBoxes = [];         /* BrickBurnt */
  const charredBoxes = [];       /* CharredWood */
  const roofBoxes = [];          /* Thatch，不参与碰撞 */
  const rockBoxes = [];          /* Rock */
  const buildings = [];

  function AddCollider(box) { colliders.push(box); return box; }

  function AddCover(box, kind) {
    const height = box.maxY - box.minY;
    covers.push({
      id: 'Cover' + covers.length,
      position: new THREEns.Vector3(box.cx, box.minY, box.cz),
      forward: new THREEns.Vector3(0, 0, 1),
      height: height,
      kind: kind || (height > WorldConfig.coverHighHeight ? 'Wall' : 'LowWall'),
      width: Math.max(box.sx, box.sz),
      occupiedBy: null,
      canVault: height <= Config.Player.vaultMaxHeight,
      canPeekLeft: true,
      canPeekRight: true,
    });
  }

  /** 房子脚下的地不是平的：取四角最低点做基准，墙往下多埋一截，绝不让房子浮在半空。 */
  function FootprintGround(cx, cz, width, depth) {
    let low = Infinity;
    let high = -Infinity;
    const halfWidth = width * 0.5;
    const halfDepth = depth * 0.5;
    const samples = [
      [cx - halfWidth, cz - halfDepth], [cx + halfWidth, cz - halfDepth],
      [cx - halfWidth, cz + halfDepth], [cx + halfWidth, cz + halfDepth],
      [cx, cz],
    ];
    for (let i = 0; i < samples.length; i += 1) {
      const value = TerrainHeight(samples[i][0], samples[i][1]);
      if (value < low) low = value;
      if (value > high) high = value;
    }
    return { low: low, high: high, drop: high - low };
  }

  /** 一间土坯房：四面墙 + 屋顶。烧过的房子少一面墙、屋顶塌一半。 */
  function BuildHouse(cx, cz, width, depth, height, burnt) {
    const footprint = FootprintGround(cx, cz, width, depth);
    const groundY = footprint.low - 0.35;
    const buried = footprint.drop + 0.35;
    const thickness = 0.42;
    const list = burnt ? burntBoxes : buildingBoxes;
    const surface = 'Stone';
    const sides = [
      { x: cx, z: cz - depth / 2, sx: width, sz: thickness },
      { x: cx, z: cz + depth / 2, sx: width, sz: thickness },
      { x: cx - width / 2, z: cz, sx: thickness, sz: depth },
      { x: cx + width / 2, z: cz, sx: thickness, sz: depth },
    ];
    const missing = burnt ? random.Int(0, 4) : -1;
    for (let i = 0; i < sides.length; i += 1) {
      const side = sides[i];
      const visibleHeight = i === missing ? height * 0.38 : height * (burnt ? 0.72 + random.Next() * 0.28 : 1);
      const wallHeight = visibleHeight + buried;
      const box = MakeBox(side.x, groundY + wallHeight / 2, side.z, side.sx, wallHeight, side.sz, surface, 'Wall');
      list.push(box);
      AddCollider(box);
      if (i === missing || visibleHeight < Config.Player.vaultMaxHeight + 0.2) AddCover(box, 'Ruin');
      else if (i % 2 === 0) AddCover(box, 'Wall');
    }
    const wallTop = groundY + buried + height;
    /* 屋顶必须坐在墙头上。烧过的房子没有完整屋顶——只留半边塌下来的椽子。 */
    if (!burnt) {
      roofBoxes.push({
        cx: cx, cy: wallTop + 0.12, cz: cz,
        sx: width + 0.8, sy: 0.26, sz: depth + 0.8,
        yaw: (random.Next() - 0.5) * 0.05, tilt: (random.Next() - 0.5) * 0.06,
      });
    } else if (random.Chance(0.5)) {
      /* 塌下来的半边椽子：一头搭在墙头，一头插进雪里 */
      roofBoxes.push({
        cx: cx + (random.Next() - 0.5) * width * 0.3,
        cy: footprint.low + height * 0.40,
        cz: cz + (random.Next() - 0.5) * depth * 0.3,
        sx: width * 0.55, sy: 0.18, sz: depth * 0.55,
        yaw: (random.Next() - 0.5) * 0.4, tilt: 0.28 + random.Next() * 0.22,
      });
    }
    /* 烧塌的房梁：斜插在雪里的焦木 */
    const beamCount = burnt ? random.Int(2, 5) : 1;
    for (let i = 0; i < beamCount; i += 1) {
      const angle = random.Next() * MathUtil.Tau;
      const radius = Math.max(width, depth) * 0.35 * random.Next();
      const bx = cx + Math.cos(angle) * radius;
      const bz = cz + Math.sin(angle) * radius;
      charredBoxes.push({
        cx: bx, cy: TerrainHeight(bx, bz) + 0.5, cz: bz,
        sx: 0.22, sy: 2.6 + random.Next() * 1.4, sz: 0.22,
        yaw: random.Next() * MathUtil.Tau, tilt: 0.5 + random.Next() * 0.7,
      });
    }
    buildings.push({ x: cx, z: cz, width: width, depth: depth, height: height, burnt: burnt, groundY: footprint.low });
  }

  const buildingCount = presetData.buildingCount;
  const placed = [];
  for (let i = 0; i < buildingCount * 6 && placed.length < buildingCount; i += 1) {
    const angle = random.Next() * MathUtil.Tau;
    const radius = 7 + Math.sqrt(random.Next()) * spanX * 0.30;
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius;
    if (RoadMask(cx, cz) > 0.25) continue;
    let clash = false;
    for (let j = 0; j < placed.length; j += 1) {
      if (MathUtil.Distance2(cx, cz, placed[j].x, placed[j].z) < 11) { clash = true; break; }
    }
    if (clash) continue;
    const houseWidth = 5.4 + random.Next() * 3.6;
    const houseDepth = 4.6 + random.Next() * 3.2;
    /* 陡坡上不盖房：地基落差太大会盖出一半悬空的怪物 */
    if (FootprintGround(cx, cz, houseWidth, houseDepth).drop > 2.2) continue;
    placed.push({ x: cx, z: cz });
    BuildHouse(cx, cz, houseWidth, houseDepth, 2.6 + random.Next() * 1.1, random.Chance(0.62));
  }

  /* 石头与断垣：给潜行提供矮掩体 */
  for (let i = 0; i < presetData.coverCount; i += 1) {
    const angle = random.Next() * MathUtil.Tau;
    const radius = 5 + Math.sqrt(random.Next()) * spanX * 0.44;
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius;
    const size = 0.9 + random.Next() * 1.9;
    const height = 0.7 + random.Next() * 1.2;
    const box = MakeBox(cx, TerrainHeight(cx, cz) + height / 2, cz, size, height, size * (0.7 + random.Next() * 0.6), 'Stone', 'Rock');
    rockBoxes.push(box);
    AddCollider(box);
    if (i % 2 === 0) AddCover(box, 'Rock');
  }

  /* ---------------------------------------------------------------- *
   * 2.3 InstancedMesh 装配（同材质一次 draw call）
   * ---------------------------------------------------------------- */

  const instanced = [];
  const matrix = new THREEns.Matrix4();
  const quaternion = new THREEns.Quaternion();
  const positionVector = new THREEns.Vector3();
  const scaleVector = new THREEns.Vector3();
  const unitBox = new THREEns.BoxGeometry(1, 1, 1);

  function BuildInstances(name, list, materialKey, castShadow) {
    if (list.length === 0) return null;
    const material = art.GetMaterial(materialKey);
    const mesh = new THREEns.InstancedMesh(unitBox, material, list.length);
    mesh.name = name;
    mesh.castShadow = !!castShadow;
    mesh.receiveShadow = true;
    for (let i = 0; i < list.length; i += 1) {
      const box = list[i];
      positionVector.set(box.cx, box.cy, box.cz);
      scaleVector.set(box.sx, box.sy, box.sz);
      quaternion.setFromEuler(new THREEns.Euler(box.tilt || 0, box.yaw || 0, 0));
      matrix.compose(positionVector, quaternion, scaleVector);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    instanced.push(mesh);
    return mesh;
  }

  BuildInstances('InstancedMudWall', buildingBoxes, 'MudWall', true);
  BuildInstances('InstancedBurntWall', burntBoxes, 'BrickBurnt', true);
  BuildInstances('InstancedCharredBeam', charredBoxes, 'CharredWood', true);
  BuildInstances('InstancedRoof', roofBoxes, 'Thatch', true);
  BuildInstances('InstancedRock', rockBoxes, 'Rock', true);

  /* 枯树：树干圆柱 + 稀疏枝冠，给天际线做层次 */
  const treeCount = presetData.treeCount;
  const trunkGeometry = new THREEns.CylinderGeometry(0.11, 0.19, 1, 5, 1);
  const trunkMesh = new THREEns.InstancedMesh(trunkGeometry, art.GetMaterial('WoodOld'), treeCount);
  trunkMesh.name = 'InstancedTreeTrunk';
  trunkMesh.castShadow = true;
  const crownGeometry = new THREEns.ConeGeometry(1, 1, 6, 1, true);
  const crownMesh = new THREEns.InstancedMesh(crownGeometry, art.GetMaterial('FoliageDead'), treeCount);
  crownMesh.name = 'InstancedTreeCrown';
  crownMesh.castShadow = true;
  let treeIndex = 0;
  for (let i = 0; i < treeCount * 5 && treeIndex < treeCount; i += 1) {
    const x = MathUtil.Lerp(bounds.minX, bounds.maxX, random.Next());
    const z = MathUtil.Lerp(bounds.minZ, bounds.maxZ, random.Next());
    const distance = Math.sqrt(x * x + z * z);
    if (distance < spanX * 0.17) continue;
    if (RoadMask(x, z) > 0.3) continue;
    const y = TerrainHeight(x, z);
    const height = 3.4 + random.Next() * 4.2;
    positionVector.set(x, y + height * 0.5, z);
    scaleVector.set(1, height, 1);
    quaternion.setFromEuler(new THREEns.Euler((random.Next() - 0.5) * 0.16, random.Next() * MathUtil.Tau, (random.Next() - 0.5) * 0.16));
    matrix.compose(positionVector, quaternion, scaleVector);
    trunkMesh.setMatrixAt(treeIndex, matrix);
    const crownRadius = 1.25 + random.Next() * 0.85;
    positionVector.set(x, y + height * 0.72, z);
    scaleVector.set(crownRadius, height * 0.78, crownRadius);
    matrix.compose(positionVector, quaternion, scaleVector);
    crownMesh.setMatrixAt(treeIndex, matrix);
    const trunkBox = MakeBox(x, y + height * 0.5, z, 0.42, height, 0.42, 'Wood', 'Tree');
    AddCollider(trunkBox);
    treeIndex += 1;
  }
  trunkMesh.count = treeIndex;
  crownMesh.count = treeIndex;
  trunkMesh.instanceMatrix.needsUpdate = true;
  crownMesh.instanceMatrix.needsUpdate = true;
  group.add(trunkMesh);
  group.add(crownMesh);
  instanced.push(trunkMesh, crownMesh);

  /* ---------------------------------------------------------------- *
   * 2.4 导航网格
   * ---------------------------------------------------------------- */

  const navStep = WorldConfig.navGridStep;
  const navCols = Math.max(4, Math.floor(spanX / navStep));
  const navRows = Math.max(4, Math.floor(spanZ / navStep));
  const navBlocked = new Uint8Array(navCols * navRows);

  function NavIndex(col, row) { return row * navCols + col; }
  function NavToWorldX(col) { return bounds.minX + (col + 0.5) * navStep; }
  function NavToWorldZ(row) { return bounds.minZ + (row + 0.5) * navStep; }
  function WorldToNavCol(x) { return MathUtil.Clamp(Math.floor((x - bounds.minX) / navStep), 0, navCols - 1); }
  function WorldToNavRow(z) { return MathUtil.Clamp(Math.floor((z - bounds.minZ) / navStep), 0, navRows - 1); }

  for (let row = 0; row < navRows; row += 1) {
    for (let col = 0; col < navCols; col += 1) {
      const x = NavToWorldX(col);
      const z = NavToWorldZ(row);
      const height = TerrainHeight(x, z);
      const slope = Math.abs(TerrainHeight(x + navStep, z) - height) + Math.abs(TerrainHeight(x, z + navStep) - height);
      navBlocked[NavIndex(col, row)] = slope > 1.6 ? 1 : 0;
    }
  }
  for (let i = 0; i < colliders.length; i += 1) {
    const box = colliders[i];
    if (box.maxY - box.minY < 0.35) continue;
    const colMin = WorldToNavCol(box.minX - 0.4);
    const colMax = WorldToNavCol(box.maxX + 0.4);
    const rowMin = WorldToNavRow(box.minZ - 0.4);
    const rowMax = WorldToNavRow(box.maxZ + 0.4);
    for (let row = rowMin; row <= rowMax; row += 1) {
      for (let col = colMin; col <= colMax; col += 1) navBlocked[NavIndex(col, row)] = 1;
    }
  }

  /* ---------------------------------------------------------------- *
   * 2.5 出生点 / 锚点 / 交互物
   * ---------------------------------------------------------------- */

  function GroundVector(x, z, yaw) {
    return { position: new THREEns.Vector3(x, TerrainHeight(x, z), z), yaw: yaw || 0 };
  }

  const storyAnchors = {};
  function AddAnchor(id, x, z, radius) {
    storyAnchors[id] = { position: new THREEns.Vector3(x, TerrainHeight(x, z), z), yaw: 0, radius: radius || 3 };
  }
  AddAnchor('AnchorVillageCenter', 0, 0, 4);
  AddAnchor('AnchorVillageExit', roadOffsetX, bounds.minZ + 8, 4);
  AddAnchor('AnchorRoadEdge', roadOffsetX + 3, 6, 3);
  AddAnchor('AnchorCheckpointPast', roadOffsetX, -18, 3);
  AddAnchor('AnchorValleyExit', roadOffsetX - 2, bounds.minZ + 10, 3.5);
  AddAnchor('AnchorPassTop', 0, bounds.minZ + 14, 4);
  AddAnchor('AnchorSlopeBottom', 4, bounds.maxZ - 12, 4);
  AddAnchor('AnchorCellar', placed.length > 0 ? placed[0].x : 6, placed.length > 0 ? placed[0].z + 3.4 : 6, 2.2);

  const patrolRoutes = {};
  const enemyPosts = [];
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * MathUtil.Tau + 0.4;
    const radius = spanX * 0.24;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const route = [];
    for (let k = 0; k < 4; k += 1) {
      const a = angle + k * 0.5;
      const rx = Math.cos(a) * (radius + (k % 2) * 6);
      const rz = Math.sin(a) * (radius + (k % 2) * 6);
      route.push(new THREEns.Vector3(rx, TerrainHeight(rx, rz), rz));
    }
    patrolRoutes['RoutePatrol' + i] = route;
    enemyPosts.push({
      id: 'EnemyPost' + i,
      position: new THREEns.Vector3(x, TerrainHeight(x, z), z),
      yaw: angle + Math.PI,
      lookArcDeg: 90,
      squadId: 'Squad' + (i < 2 ? 'A' : 'B'),
      archetype: i === 0 ? 'PuppetOfficer' : 'PuppetSoldier',
      route: patrolRoutes['RoutePatrol' + i],
    });
  }

  const lootSpots = [];
  for (let i = 0; i < Math.min(8, buildings.length); i += 1) {
    const building = buildings[i];
    lootSpots.push({
      id: 'LootSpot' + i,
      position: new THREEns.Vector3(building.x + 1.2, building.groundY, building.z + 1.2),
      container: i % 2 === 0 ? 'Jar' : 'Stove',
      tableId: 'TableVillage',
    });
  }

  const coverPoints = covers.map((cover) => cover.position.clone());
  const fireSpots = [
    new THREEns.Vector3(2.6, TerrainHeight(2.6, -3.2), -3.2),
    new THREEns.Vector3(-9.4, TerrainHeight(-9.4, 7.1), 7.1),
  ];

  /** 出生点必须是空地：螺旋外扩找一个离所有碰撞体都够远、且能走的点。 */
  function FindClearSpot(preferX, preferZ, clearance) {
    for (let ring = 0; ring < 26; ring += 1) {
      const samples = ring === 0 ? 1 : ring * 6;
      for (let i = 0; i < samples; i += 1) {
        const angle = (i / samples) * MathUtil.Tau;
        const x = preferX + Math.cos(angle) * ring * 1.4;
        const z = preferZ + Math.sin(angle) * ring * 1.4;
        if (x < bounds.minX + 6 || x > bounds.maxX - 6) continue;
        if (z < bounds.minZ + 6 || z > bounds.maxZ - 6) continue;
        let clear = true;
        for (let k = 0; k < colliders.length; k += 1) {
          const box = colliders[k];
          const closestX = MathUtil.Clamp(x, box.minX, box.maxX);
          const closestZ = MathUtil.Clamp(z, box.minZ, box.maxZ);
          const dx = x - closestX;
          const dz = z - closestZ;
          if (dx * dx + dz * dz < clearance * clearance) { clear = false; break; }
        }
        if (clear) return { x: x, z: z };
      }
    }
    return { x: preferX, z: preferZ };
  }

  const startSpot = FindClearSpot(3.0, 9.0, 3.2);
  /* 开场朝向村子中心：第一帧就要有构图，不是「面壁」 */
  const startYaw = Math.atan2(-(0 - startSpot.x), -(0 - startSpot.z));
  const companionSpot = FindClearSpot(startSpot.x - 2.0, startSpot.z + 1.4, 1.2);
  const spawns = {
    playerStart: GroundVector(startSpot.x, startSpot.z, startYaw),
    companionStart: GroundVector(companionSpot.x, companionSpot.z, startYaw),
    enemyPosts: enemyPosts,
    lootSpots: lootSpots,
    storyAnchors: storyAnchors,
    patrolRoutes: patrolRoutes,
    coverPoints: coverPoints,
    fireSpots: fireSpots,
  };

  const interactables = [];
  function RegisterInteractable(def) {
    const item = {
      id: def.id || ('Interactable' + interactables.length),
      position: def.position ? def.position.clone() : new THREEns.Vector3(),
      kind: def.kind || 'Container',
      label: def.label || '翻找',
      seconds: def.seconds === undefined ? Config.Survival.interactSeconds : def.seconds,
      noiseRadius: def.noiseRadius === undefined ? Config.Stealth.Noise.container : def.noiseRadius,
      state: def.state || 'Idle',
      requiresItem: def.requiresItem === undefined ? null : def.requiresItem,
      companionOnly: !!def.companionOnly,
      tableId: def.tableId === undefined ? null : def.tableId,
    };
    interactables.push(item);
    return item;
  }
  for (let i = 0; i < lootSpots.length; i += 1) {
    RegisterInteractable({
      id: 'InteractableContainer' + i,
      position: lootSpots[i].position,
      kind: 'Container',
      label: lootSpots[i].container === 'Jar' ? '翻缸底' : '掏灶膛',
      tableId: lootSpots[i].tableId,
    });
  }
  RegisterInteractable({
    id: 'InteractableCellarDoor',
    position: storyAnchors.AnchorCellar.position,
    kind: 'Door',
    label: '撬开地窖门',
    seconds: 2.6,
    noiseRadius: Config.Stealth.Noise.doorForce,
    requiresItem: 'Crowbar',
  });

  /* ---------------------------------------------------------------- *
   * 2.6 查询实现
   * ---------------------------------------------------------------- */

  const lastContact = { hit: false, normal: new THREEns.Vector3(0, 1, 0), surface: 'Snow', blocked: false };
  const footprints = [];
  const scratchA = new THREEns.Vector3();
  const scratchB = new THREEns.Vector3();

  function SampleGroundKind(x, z) {
    if (RoadMask(x, z) > 0.55) return 'Dirt';
    const slope = Math.abs(TerrainHeight(x + 1, z) - TerrainHeight(x, z));
    if (slope > 0.9) return 'Stone';
    return 'Snow';
  }

  function ResolveMove(from, to, radius, out) {
    const target = out || new THREEns.Vector3();
    let x = to.x;
    let z = to.z;
    let blocked = false;
    lastContact.hit = false;
    lastContact.blocked = false;
    const feetY = TerrainHeight(x, z);
    for (let pass = 0; pass < 2; pass += 1) {
      for (let i = 0; i < colliders.length; i += 1) {
        const box = colliders[i];
        if (box.maxY < feetY + 0.25 || box.minY > feetY + 1.9) continue;
        const closestX = MathUtil.Clamp(x, box.minX, box.maxX);
        const closestZ = MathUtil.Clamp(z, box.minZ, box.maxZ);
        const dx = x - closestX;
        const dz = z - closestZ;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq >= radius * radius) continue;
        blocked = true;
        lastContact.hit = true;
        lastContact.surface = box.surface;
        if (distanceSq > 1e-6) {
          const distance = Math.sqrt(distanceSq);
          const push = radius - distance;
          x += (dx / distance) * push;
          z += (dz / distance) * push;
          lastContact.normal.set(dx / distance, 0, dz / distance);
        } else {
          /* 圆心正好陷在盒子里：沿最短轴顶出去 */
          const toMinX = x - box.minX; const toMaxX = box.maxX - x;
          const toMinZ = z - box.minZ; const toMaxZ = box.maxZ - z;
          const smallest = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);
          if (smallest === toMinX) { x = box.minX - radius; lastContact.normal.set(-1, 0, 0); }
          else if (smallest === toMaxX) { x = box.maxX + radius; lastContact.normal.set(1, 0, 0); }
          else if (smallest === toMinZ) { z = box.minZ - radius; lastContact.normal.set(0, 0, -1); }
          else { z = box.maxZ + radius; lastContact.normal.set(0, 0, 1); }
        }
      }
    }
    x = MathUtil.Clamp(x, bounds.minX + radius, bounds.maxX - radius);
    z = MathUtil.Clamp(z, bounds.minZ + radius, bounds.maxZ - radius);
    lastContact.blocked = blocked;
    return target.set(x, TerrainHeight(x, z), z);
  }

  function Raycast(origin, direction, maxDistance) {
    let bestDistance = maxDistance;
    let bestBox = null;
    for (let i = 0; i < colliders.length; i += 1) {
      const distance = RayBox(colliders[i], origin.x, origin.y, origin.z, direction.x, direction.y, direction.z, bestDistance);
      if (distance >= 0 && distance < bestDistance) { bestDistance = distance; bestBox = colliders[i]; }
    }
    /* 地面：沿射线粗步进 + 二分收敛 */
    let groundDistance = -1;
    const stepCount = 48;
    let previous = origin.y - TerrainHeight(origin.x, origin.z);
    for (let i = 1; i <= stepCount; i += 1) {
      const t = (i / stepCount) * maxDistance;
      const px = origin.x + direction.x * t;
      const py = origin.y + direction.y * t;
      const pz = origin.z + direction.z * t;
      const delta = py - TerrainHeight(px, pz);
      if (previous > 0 && delta <= 0) {
        let low = ((i - 1) / stepCount) * maxDistance;
        let high = t;
        for (let k = 0; k < 8; k += 1) {
          const mid = (low + high) * 0.5;
          const mx = origin.x + direction.x * mid;
          const my = origin.y + direction.y * mid;
          const mz = origin.z + direction.z * mid;
          if (my - TerrainHeight(mx, mz) > 0) low = mid; else high = mid;
        }
        groundDistance = (low + high) * 0.5;
        break;
      }
      previous = delta;
    }
    if (groundDistance >= 0 && (bestBox === null || groundDistance < bestDistance)) {
      const point = new THREEns.Vector3(
        origin.x + direction.x * groundDistance,
        origin.y + direction.y * groundDistance,
        origin.z + direction.z * groundDistance,
      );
      return {
        point: point,
        normal: TerrainNormal(point.x, point.z, new THREEns.Vector3()),
        distance: groundDistance,
        surface: SampleGroundKind(point.x, point.z),
        objectKind: 'Terrain',
      };
    }
    if (!bestBox) return null;
    const point = new THREEns.Vector3(
      origin.x + direction.x * bestDistance,
      origin.y + direction.y * bestDistance,
      origin.z + direction.z * bestDistance,
    );
    return {
      point: point,
      normal: BoxNormalAt(bestBox, point.x, point.y, point.z, new THREEns.Vector3()),
      distance: bestDistance,
      surface: bestBox.surface,
      objectKind: bestBox.kind,
    };
  }

  function HasLineOfSight(fromVec3, toVec3) {
    scratchA.subVectors(toVec3, fromVec3);
    const distance = scratchA.length();
    if (distance < 1e-4) return true;
    scratchA.multiplyScalar(1 / distance);
    for (let i = 0; i < colliders.length; i += 1) {
      const hit = RayBox(colliders[i], fromVec3.x, fromVec3.y, fromVec3.z, scratchA.x, scratchA.y, scratchA.z, distance);
      if (hit >= 0 && hit < distance) return false;
    }
    /* 地形遮挡：沿线取样 */
    const samples = Math.min(24, Math.max(4, Math.round(distance / 1.5)));
    for (let i = 1; i < samples; i += 1) {
      const t = i / samples;
      const px = fromVec3.x + (toVec3.x - fromVec3.x) * t;
      const py = fromVec3.y + (toVec3.y - fromVec3.y) * t;
      const pz = fromVec3.z + (toVec3.z - fromVec3.z) * t;
      if (py < TerrainHeight(px, pz) - 0.1) return false;
    }
    return true;
  }

  /* A*：4/8 邻接网格，够灰盒用；AgentWorld 可换成 NavMesh */
  const pathOpen = [];
  const pathCost = new Float32Array(navCols * navRows);
  const pathFrom = new Int32Array(navCols * navRows);
  const pathSeen = new Uint8Array(navCols * navRows);
  let pathStamp = 0;
  const pathStampTable = new Int32Array(navCols * navRows);

  function FindPath(fromVec3, toVec3, out) {
    const result = out || [];
    result.length = 0;
    const startCol = WorldToNavCol(fromVec3.x);
    const startRow = WorldToNavRow(fromVec3.z);
    const goalCol = WorldToNavCol(toVec3.x);
    const goalRow = WorldToNavRow(toVec3.z);
    const startIndex = NavIndex(startCol, startRow);
    const goalIndex = NavIndex(goalCol, goalRow);
    if (startIndex === goalIndex) { result.push({ x: toVec3.x, z: toVec3.z }); return result; }
    pathStamp += 1;
    pathOpen.length = 0;
    pathOpen.push(startIndex);
    pathCost[startIndex] = 0;
    pathFrom[startIndex] = -1;
    pathStampTable[startIndex] = pathStamp;
    pathSeen[startIndex] = 0;
    let guard = 0;
    let found = false;
    while (pathOpen.length > 0 && guard < 9000) {
      guard += 1;
      let bestSlot = 0;
      let bestScore = Infinity;
      for (let i = 0; i < pathOpen.length; i += 1) {
        const index = pathOpen[i];
        const col = index % navCols;
        const row = (index - col) / navCols;
        const heuristic = Math.abs(col - goalCol) + Math.abs(row - goalRow);
        const score = pathCost[index] + heuristic;
        if (score < bestScore) { bestScore = score; bestSlot = i; }
      }
      const current = pathOpen.splice(bestSlot, 1)[0];
      if (current === goalIndex) { found = true; break; }
      pathSeen[current] = 1;
      const col = current % navCols;
      const row = (current - col) / navCols;
      for (let dRow = -1; dRow <= 1; dRow += 1) {
        for (let dCol = -1; dCol <= 1; dCol += 1) {
          if (dCol === 0 && dRow === 0) continue;
          const nextCol = col + dCol;
          const nextRow = row + dRow;
          if (nextCol < 0 || nextRow < 0 || nextCol >= navCols || nextRow >= navRows) continue;
          const nextIndex = NavIndex(nextCol, nextRow);
          if (navBlocked[nextIndex]) continue;
          const step = (dCol !== 0 && dRow !== 0) ? 1.414 : 1;
          const tentative = pathCost[current] + step;
          if (pathStampTable[nextIndex] !== pathStamp) {
            pathStampTable[nextIndex] = pathStamp;
            pathCost[nextIndex] = tentative;
            pathFrom[nextIndex] = current;
            pathSeen[nextIndex] = 0;
            pathOpen.push(nextIndex);
          } else if (tentative < pathCost[nextIndex]) {
            pathCost[nextIndex] = tentative;
            pathFrom[nextIndex] = current;
            if (pathSeen[nextIndex]) { pathSeen[nextIndex] = 0; pathOpen.push(nextIndex); }
          }
        }
      }
    }
    if (!found) { result.push({ x: toVec3.x, z: toVec3.z }); return result; }
    const reversed = [];
    let cursor = goalIndex;
    let safety = 0;
    while (cursor >= 0 && safety < 4000) {
      const col = cursor % navCols;
      const row = (cursor - col) / navCols;
      reversed.push({ x: NavToWorldX(col), z: NavToWorldZ(row) });
      cursor = pathFrom[cursor];
      safety += 1;
    }
    for (let i = reversed.length - 1; i >= 0; i -= 1) result.push(reversed[i]);
    return result;
  }

  const world = {
    group: group,
    chapterId: chapterId,
    preset: preset,
    bounds: bounds,
    covers: covers,
    interactables: interactables,
    spawns: spawns,

    /* —— 地形采样 —— */
    SampleHeight(x, z) { return TerrainHeight(x, z); },
    SampleSlope(x, z) {
      const normal = TerrainNormal(x, z, scratchB);
      return Math.acos(MathUtil.Clamp(normal.y, -1, 1));
    },
    SampleNormal(x, z, out) { return TerrainNormal(x, z, out || new THREEns.Vector3()); },
    SampleGroundKind: SampleGroundKind,
    IsInsideBounds(x, z) {
      return x > bounds.minX && x < bounds.maxX && z > bounds.minZ && z < bounds.maxZ;
    },

    /* —— 移动与碰撞 —— */
    ResolveMove: ResolveMove,
    GetLastMoveContact() { return lastContact; },
    IsPositionFree(position, radius, height) {
      for (let i = 0; i < colliders.length; i += 1) {
        const box = colliders[i];
        if (box.maxY < position.y || box.minY > position.y + (height || 1.8)) continue;
        const closestX = MathUtil.Clamp(position.x, box.minX, box.maxX);
        const closestZ = MathUtil.Clamp(position.z, box.minZ, box.maxZ);
        const dx = position.x - closestX;
        const dz = position.z - closestZ;
        if (dx * dx + dz * dz < radius * radius) return false;
      }
      return true;
    },
    SnapToGround(position, out) {
      const target = out || new THREEns.Vector3();
      return target.set(position.x, TerrainHeight(position.x, position.z), position.z);
    },
    Raycast: Raycast,

    /* —— 感知支持 —— */
    HasLineOfSight: HasLineOfSight,
    SampleVisibility(fromVec3, toVec3, targetRadius) {
      const radius = targetRadius === undefined ? 0.35 : targetRadius;
      let visible = 0;
      const offsets = [0, radius, -radius];
      for (let i = 0; i < offsets.length; i += 1) {
        scratchB.copy(toVec3);
        scratchB.y += offsets[i];
        if (HasLineOfSight(fromVec3, scratchB)) visible += 1;
      }
      return 1 - visible / offsets.length;
    },
    SampleOcclusion(fromVec3, toVec3) {
      return HasLineOfSight(fromVec3, toVec3) ? 0 : WorldConfig.occlusionWall;
    },
    SampleConcealment(position, crouched, prone) {
      let concealment = 0;
      for (let i = 0; i < covers.length; i += 1) {
        const distance = covers[i].position.distanceTo(position);
        if (distance < 2.2) { concealment = Math.max(concealment, Config.Stealth.concealmentCoverBonus * (1 - distance / 2.2)); }
      }
      if (crouched) concealment += Config.Stealth.concealmentCrouchBonus;
      if (prone) concealment += Config.Stealth.concealmentProneBonus;
      return MathUtil.Clamp01(concealment);
    },
    GetLightLevel(position) { return art.GetAmbientLightLevel(position); },
    IsIndoors(position) {
      for (let i = 0; i < buildings.length; i += 1) {
        const building = buildings[i];
        if (Math.abs(position.x - building.x) < building.width * 0.5
          && Math.abs(position.z - building.z) < building.depth * 0.5
          && !building.burnt) return true;
      }
      return false;
    },

    /* —— 导航 —— */
    FindPath: FindPath,
    FindNearestNavPoint(position, out) {
      const target = out || {};
      const col = WorldToNavCol(position.x);
      const row = WorldToNavRow(position.z);
      for (let ring = 0; ring < 12; ring += 1) {
        for (let dRow = -ring; dRow <= ring; dRow += 1) {
          for (let dCol = -ring; dCol <= ring; dCol += 1) {
            if (Math.max(Math.abs(dRow), Math.abs(dCol)) !== ring) continue;
            const nextCol = col + dCol;
            const nextRow = row + dRow;
            if (nextCol < 0 || nextRow < 0 || nextCol >= navCols || nextRow >= navRows) continue;
            if (navBlocked[NavIndex(nextCol, nextRow)]) continue;
            target.x = NavToWorldX(nextCol);
            target.z = NavToWorldZ(nextRow);
            return target;
          }
        }
      }
      target.x = position.x;
      target.z = position.z;
      return target;
    },
    IsNavigable(x, z) {
      if (!world.IsInsideBounds(x, z)) return false;
      return navBlocked[NavIndex(WorldToNavCol(x), WorldToNavRow(z))] === 0;
    },
    FindRetreatPoint(origin, threat, minDistance) {
      scratchA.subVectors(origin, threat);
      scratchA.y = 0;
      if (scratchA.lengthSq() < 1e-4) scratchA.set(1, 0, 0);
      scratchA.normalize();
      for (let i = 0; i < 8; i += 1) {
        const angle = (i % 2 === 0 ? 1 : -1) * Math.floor(i / 2) * 0.5;
        const dirX = scratchA.x * Math.cos(angle) - scratchA.z * Math.sin(angle);
        const dirZ = scratchA.x * Math.sin(angle) + scratchA.z * Math.cos(angle);
        const x = origin.x + dirX * minDistance;
        const z = origin.z + dirZ * minDistance;
        if (world.IsNavigable(x, z)) return new THREEns.Vector3(x, TerrainHeight(x, z), z);
      }
      return null;
    },
    FindFlankPoint(origin, target, side, maxDistance) {
      scratchA.subVectors(target, origin);
      scratchA.y = 0;
      const distance = Math.min(maxDistance, scratchA.length());
      scratchA.normalize();
      const x = origin.x + (-scratchA.z * side) * distance * 0.7 + scratchA.x * distance * 0.5;
      const z = origin.z + (scratchA.x * side) * distance * 0.7 + scratchA.z * distance * 0.5;
      if (!world.IsNavigable(x, z)) return null;
      return new THREEns.Vector3(x, TerrainHeight(x, z), z);
    },
    SampleSearchPoints(center, radius, count) {
      const points = [];
      for (let i = 0; i < count * 6 && points.length < count; i += 1) {
        const angle = (i / count) * MathUtil.Tau + MathUtil.Hash1(i * 3.7) * 1.2;
        const distance = radius * (0.35 + MathUtil.Hash1(i * 5.1) * 0.65);
        const x = center.x + Math.cos(angle) * distance;
        const z = center.z + Math.sin(angle) * distance;
        if (!world.IsNavigable(x, z)) continue;
        points.push(new THREEns.Vector3(x, TerrainHeight(x, z), z));
      }
      return points;
    },

    /* —— 掩体 —— */
    GetCoversNear(position, radius) {
      const list = [];
      for (let i = 0; i < covers.length; i += 1) {
        if (covers[i].position.distanceTo(position) <= radius) list.push(covers[i]);
      }
      return list;
    },
    FindCover(fromVec3, threatVec3, maxDistance) {
      let best = null;
      let bestScore = -Infinity;
      for (let i = 0; i < covers.length; i += 1) {
        const cover = covers[i];
        if (cover.occupiedBy) continue;
        const distance = cover.position.distanceTo(fromVec3);
        if (distance > maxDistance) continue;
        const shielding = cover.position.distanceTo(threatVec3);
        const score = shielding * 0.6 - distance;
        if (score > bestScore) { bestScore = score; best = cover; }
      }
      return best;
    },
    ClaimCover(coverId, ownerId) {
      for (let i = 0; i < covers.length; i += 1) {
        if (covers[i].id !== coverId) continue;
        if (covers[i].occupiedBy && covers[i].occupiedBy !== ownerId) return false;
        covers[i].occupiedBy = ownerId;
        return true;
      }
      return false;
    },
    ReleaseCover(coverId, ownerId) {
      for (let i = 0; i < covers.length; i += 1) {
        if (covers[i].id === coverId && covers[i].occupiedBy === ownerId) covers[i].occupiedBy = null;
      }
    },

    /* —— 交互物 —— */
    RegisterInteractable: RegisterInteractable,
    QueryInteractable(position, forward, maxDistance) {
      let best = null;
      let bestScore = -Infinity;
      for (let i = 0; i < interactables.length; i += 1) {
        const item = interactables[i];
        if (item.state === 'Used') continue;
        scratchA.subVectors(item.position, position);
        const distance = scratchA.length();
        if (distance > maxDistance) continue;
        scratchA.normalize();
        const facing = forward ? scratchA.dot(forward) : 1;
        if (facing < 0.15) continue;
        const score = facing * 2 - distance * 0.35;
        if (score > bestScore) { bestScore = score; best = item; }
      }
      return best;
    },
    SetInteractableState(id, state) {
      for (let i = 0; i < interactables.length; i += 1) {
        if (interactables[i].id === id) { interactables[i].state = state; return true; }
      }
      return false;
    },
    SetDoorOpen(doorId, open) {
      return world.SetInteractableState(doorId, open ? 'Open' : 'Idle');
    },

    /* —— 触发体 —— */
    QueryTriggers(position, radius) {
      const list = [];
      const keys = Object.keys(storyAnchors);
      for (let i = 0; i < keys.length; i += 1) {
        const anchor = storyAnchors[keys[i]];
        if (anchor.position.distanceTo(position) <= (anchor.radius + radius)) {
          list.push({ id: keys[i], kind: 'Anchor', payload: { radius: anchor.radius } });
        }
      }
      return list;
    },

    /* —— 雪地脚印 —— */
    StampFootprint(position, forward, ownerId, surface) {
      footprints.push({
        position: position.clone(),
        forward: forward ? forward.clone() : new THREEns.Vector3(0, 0, 1),
        ownerId: ownerId,
        age: 0,
        surface: surface || 'Snow',
      });
      if (footprints.length > 320) footprints.shift();
      if (art && art.SpawnFootprint) {
        art.SpawnFootprint(position, forward, surface || 'Snow', footprints.length % 2 === 0 ? 'L' : 'R');
      }
    },
    QueryFootprints(position, radius, ownerId) {
      const list = [];
      for (let i = 0; i < footprints.length; i += 1) {
        const print = footprints[i];
        if (ownerId && print.ownerId !== ownerId) continue;
        if (print.position.distanceTo(position) <= radius) list.push(print);
      }
      return list;
    },

    Update(dt) {
      const life = Config.Stealth.footprintLifeSeconds;
      for (let i = footprints.length - 1; i >= 0; i -= 1) {
        footprints[i].age += dt;
        if (footprints[i].age > life) footprints.splice(i, 1);
      }
    },

    Dispose() {
      group.traverse((child) => {
        if (child.isMesh || child.isInstancedMesh) {
          if (child.geometry) child.geometry.dispose();
        }
      });
      terrainGeometry.dispose();
      unitBox.dispose();
      trunkGeometry.dispose();
      crownGeometry.dispose();
      if (group.parent) group.parent.remove(group);
      colliders.length = 0;
      covers.length = 0;
      interactables.length = 0;
      footprints.length = 0;
    },
  };

  /* 调试可视化留给 AgentWorld；这里只暴露只读的碰撞体清单 */
  world.debugColliders = colliders;

  return world;
}

export default CreateWorld;
