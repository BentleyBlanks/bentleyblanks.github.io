// 《血战台儿庄》场景搭建：鲁南民居、寨墙、清真寺、街垒。
//
// 尺寸全部照 docs/Data_HistoryMaterial.md 的考据来（那份文件里带出处）：
//   寨墙高 4 m（不是明清府城的 10 m），门楼 7 m；
//   单开间面阔 3.0—3.6 m，三开间正房 9—11 m，进深 4.5—6 m；
//   檐口高 2.4—2.8 m，脊高 4.0—4.8 m，硬山坡度 26°—29°；
//   院墙 2.0—2.5 m（成年人踮脚能扒），门楼 3.5—4.5 m；
//   主街 4—6 m，次巷 2—3 m，夹道 1.2—1.8 m。
//
// **最重要的一条形制规矩：鲁南民居对外不开窗，窗全朝院里开。**
// 所以街两侧是连续实墙、视野封闭；破门破墙进了院子，窗廊屋顶的射界才一下子打开。
// 这不是省事，这是台儿庄巷战之所以那样打的物理原因。
//
// 性能：所有静态几何按材质合并成少数几个大网格（合并前先 applyMatrix4），
// 一关的 draw call 控制在 30 以内。碰撞另出一张 AABB 表，不用几何体做物理。

import * as THREE from "three";
import { Mulberry32, HashString, Clamp } from "./Script_Noise.mjs";
import {
  MakeBox, MakePlane, MergeGeometries, PlaceGeometry, CarveCraters,
  MakeRubbleField, MakeInstanced, TILE_METERS, BRICK_UV_GRID,
} from "./Script_Geo.mjs";

/** 建造过程中的收集器：按材质名分桶攒几何体，最后一次性合并。 */
export class BuildSink {
  constructor() {
    this.buckets = new Map();     // materialName -> geometry[]
    this.colliders = [];          // { min:[x,y,z], max:[x,y,z], tag }
    this.breakables = [];         // 可凿的墙面 { x,y,z, nx,nz, w,h, wallId }
    this.covers = [];             // AI 掩体点 { x, z, height, faceX, faceZ }
    this.props = [];              // 需要单独成 mesh 的东西（半透明、动的）
  }

  Add(materialName, geometry) {
    if (!geometry) return;
    if (!this.buckets.has(materialName)) this.buckets.set(materialName, []);
    this.buckets.get(materialName).push(geometry);
  }

  /** 记一个轴对齐碰撞盒（中心 + 半长）。 */
  Solid(cx, cy, cz, hx, hy, hz, tag = "wall") {
    this.colliders.push({
      min: [cx - hx, cy - hy, cz - hz],
      max: [cx + hx, cy + hy, cz + hz],
      tag,
    });
  }

  Cover(x, z, height, faceX = 0, faceZ = 1) {
    this.covers.push({ x, z, height, faceX, faceZ });
  }

  /** 把攒的东西合成网格挂进场景。 */
  Flush(scene, library, { castShadow = true, receiveShadow = true } = {}) {
    const meshes = [];
    for (const [name, list] of this.buckets) {
      const geometry = MergeGeometries(list);
      if (!geometry.attributes.position || geometry.attributes.position.count === 0) continue;
      const mesh = new THREE.Mesh(geometry, library.Get(name));
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      mesh.name = `Static_${name}`;
      scene.add(mesh);
      meshes.push(mesh);
    }
    this.buckets.clear();
    return meshes;
  }
}

// ---------------------------------------------------------------------------
// 基础构件
// ---------------------------------------------------------------------------

/** 一段墙。ruin>0 时墙头被打成参差的。 */
export function AddWall(sink, material, {
  x, z, length, height, thickness, ry = 0, ruin = 0, seed = "w",
  tile = TILE_METERS.brick, plinth = null, cope = false, solid = true,
}) {
  const rnd = Mulberry32(HashString(seed));
  const slices = Math.max(2, Math.round(length / 0.85));
  const sliceW = length / slices;
  // 砖墙这一段一段地错开图案（整砖对齐 + 约一半镜像），相邻墙段就不会是同一套明暗排列。
  // 走 UV 而不是给每段克隆材质：静态几何是按材质名合并成一个大网格的，
  // 每段一份材质 = 每段一个 draw call，几百段墙直接把 1400 的红线撞穿。
  const grid = String(material).startsWith("BrickWall") ? BRICK_UV_GRID : null;
  for (let i = 0; i < slices; i += 1) {
    const t = i / (slices - 1 || 1);
    const edge = Math.min(t, 1 - t) * 2;
    const bite = ruin * (0.3 + 0.7 * rnd()) * (1 - edge * 0.4);
    const h = Math.max(0.18, height * (1 - bite));
    const lx = -length / 2 + sliceW * (i + 0.5);
    sink.Add(material, PlaceGeometry(
      MakeBox(sliceW * 1.03, h, thickness, tile, `${seed}:${i}`, grid),
      { x: x + Math.cos(ry) * lx, y: h / 2, z: z - Math.sin(ry) * lx, ry }));
  }
  // 碱脚：旧砖墙下面那两三皮总是深色的条石/糙砖，缺了这一笔墙就"浮"着
  if (plinth) {
    sink.Add(plinth, PlaceGeometry(
      MakeBox(length + 0.06, 0.42, thickness + 0.07, TILE_METERS.stone, `${seed}:pl`),
      { x, y: 0.21, z, ry }));
  }
  // 墙帽：院墙顶上压一列小瓦，没有的话墙头像被刀切过
  if (cope && ruin < 0.35) {
    sink.Add("RoofTile", PlaceGeometry(
      MakeBox(length, 0.09, thickness + 0.16, TILE_METERS.roof, `${seed}:cp`),
      { x, y: height + 0.045, z, ry }));
  }
  if (solid) {
    const hx = Math.abs(Math.cos(ry)) * length / 2 + Math.abs(Math.sin(ry)) * thickness / 2;
    const hz = Math.abs(Math.sin(ry)) * length / 2 + Math.abs(Math.cos(ry)) * thickness / 2;
    sink.Solid(x, height / 2, z, hx, height / 2, hz, "wall");
    sink.Cover(x, z, height * (1 - ruin * 0.5), Math.sin(ry), Math.cos(ry));
  }
}

/**
 * 硬山屋顶：两坡瓦面 + 正脊 + 出檐 + 两端高出屋面的山墙。
 * 坡度 26°—29°，出檐 0.45 m —— 檐口那一圈阴影是"中式房子"最强的识别特征。
 */
export function AddHardMountainRoof(sink, {
  x, z, width, depth, eaveY, ridgeY, ry = 0, seed = "r", ruined = false, burnt = false,
}) {
  const rise = ridgeY - eaveY;
  const halfDepth = depth / 2;
  const slopeLen = Math.hypot(halfDepth, rise);
  const angle = Math.atan2(rise, halfDepth);
  const overhang = 0.45;
  const tileMat = burnt ? "BrickWallSooty" : "RoofTile";

  if (!ruined) {
    for (const s of [-1, 1]) {
      const g = MakeBox(width + overhang * 2, 0.12, slopeLen + overhang, TILE_METERS.roof, `${seed}:s${s}`);
      const cy = eaveY + rise / 2;
      const cz = s * (halfDepth / 2);
      sink.Add(tileMat, PlaceGeometry(g, {
        x: x + Math.cos(ry) * 0 - Math.sin(ry) * cz,
        y: cy,
        z: z - Math.sin(ry) * 0 - Math.cos(ry) * cz,
        ry, rx: -s * angle,
      }));
      // 檐口下的椽子：一排小方料，逆光时是一条整齐的锯齿阴影
      const rafters = Math.max(4, Math.round(width / 0.42));
      for (let i = 0; i < rafters; i += 1) {
        const lx = -width / 2 + (i + 0.5) * (width / rafters);
        const ez = s * (halfDepth + overhang * 0.5);
        sink.Add("WoodBeam", PlaceGeometry(
          MakeBox(0.07, 0.09, overhang * 1.5, TILE_METERS.wood, `${seed}:rf${s}${i}`),
          {
            x: x + Math.cos(ry) * lx - Math.sin(ry) * ez,
            y: eaveY - 0.06,
            z: z - Math.sin(ry) * lx - Math.cos(ry) * ez,
            ry, rx: -s * angle * 0.85,
          }));
      }
    }
    // 正脊：小青瓦逐层叠砌，做成一条略高的带 + 两端微微起翘
    sink.Add(tileMat, PlaceGeometry(
      MakeBox(width + overhang * 2, 0.2, 0.36, TILE_METERS.roof, `${seed}:ridge`),
      { x, y: ridgeY + 0.06, z, ry }));
  } else {
    // 塌掉的屋面：只剩几根焦黑的梁架横在山墙之间
    const rnd = Mulberry32(HashString(`${seed}:col`));
    for (let i = 0; i < 5; i += 1) {
      const lx = -width / 2 + (i + 0.5) * (width / 5);
      const drop = 0.3 + rnd() * 0.8;
      sink.Add("WoodBeam", PlaceGeometry(
        MakeBox(0.16, 0.14, depth * (0.5 + rnd() * 0.5), TILE_METERS.wood, `${seed}:bm${i}`),
        {
          x: x + Math.cos(ry) * lx, y: ridgeY - drop, z: z - Math.sin(ry) * lx,
          ry, rx: (rnd() - 0.5) * 0.5, rz: (rnd() - 0.5) * 0.35,
        }));
    }
  }

  // 山墙：硬山的两端墙体高出屋面，这是"硬山"二字的由来
  for (const s of [-1, 1]) {
    const gable = [];
    const steps = 6;
    for (let i = 0; i < steps; i += 1) {
      const t0 = i / steps, t1 = (i + 1) / steps;
      const zc = (t0 + t1) * 0.5;
      const hh = eaveY + rise * (1 - Math.abs(zc * 2 - 1)) * 0 + rise * (1 - Math.abs((t0 + t1) - 1));
      const segD = depth / steps;
      gable.push(PlaceGeometry(
        MakeBox(0.30, hh, segD, TILE_METERS.brick, `${seed}:g${s}${i}`),
        { x: 0, y: hh / 2, z: -depth / 2 + segD * (i + 0.5) }));
    }
    const merged = MergeGeometries(gable);
    const gx = s * (width / 2 + 0.15);
    sink.Add(burnt ? "BrickWallSooty" : "BrickWall", PlaceGeometry(merged, {
      x: x + Math.cos(ry) * gx, y: 0, z: z - Math.sin(ry) * gx, ry,
    }));
  }
}

/**
 * 四合院。街上看过去只有一圈实墙和一座门楼；进了门才是院子。
 * @param {object} spec x, z, ry, width, depth, seed, damage 0..1, burnt
 */
export function AddCompound(sink, spec) {
  const {
    x, z, ry = 0, width = 16, depth = 14, seed = "c", damage = 0, burnt = false,
    gateSide = "south",
  } = spec;
  const rnd = Mulberry32(HashString(seed));
  const wallMat = burnt ? "BrickWallSooty" : (rnd() < 0.42 ? "Adobe" : "BrickWall");
  const courtWallH = 2.0 + rnd() * 0.5;              // 院墙 2.0—2.5 m
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const L = (lx, lz) => [x + cos * lx - sin * lz, z - sin * lx - cos * lz];

  // --- 院墙四面 ---
  const sides = [
    { lx: 0, lz: -depth / 2, len: width, rot: 0 },        // 北
    { lx: 0, lz: depth / 2, len: width, rot: 0 },         // 南（开门那面）
    { lx: -width / 2, lz: 0, len: depth, rot: Math.PI / 2 },
    { lx: width / 2, lz: 0, len: depth, rot: Math.PI / 2 },
  ];
  sides.forEach((s, i) => {
    const [wx, wz] = L(s.lx, s.lz);
    const isGate = (gateSide === "south" && i === 1);
    if (isGate) {
      // 门楼两侧各留一段墙，中间是门洞
      const openW = 1.5;
      const segLen = (s.len - openW) / 2;
      for (const side of [-1, 1]) {
        const off = side * (openW / 2 + segLen / 2);
        const [sx, sz] = L(s.lx + off, s.lz);
        AddWall(sink, wallMat, {
          x: sx, z: sz, length: segLen, height: courtWallH, thickness: 0.35,
          ry: ry + s.rot, ruin: damage * 0.7, seed: `${seed}:w${i}${side}`,
          tile: wallMat === "Adobe" ? TILE_METERS.adobe : TILE_METERS.brick,
          plinth: wallMat === "Adobe" ? null : "Stone", cope: true,
        });
      }
      AddGatehouse(sink, { x: wx, z: wz, ry, seed: `${seed}:gh`, damage, burnt, openW });
    } else {
      AddWall(sink, wallMat, {
        x: wx, z: wz, length: s.len, height: courtWallH, thickness: 0.35,
        ry: ry + s.rot, ruin: damage * 0.8, seed: `${seed}:w${i}`,
        tile: wallMat === "Adobe" ? TILE_METERS.adobe : TILE_METERS.brick,
        plinth: wallMat === "Adobe" ? null : "Stone", cope: true,
      });
    }
  });

  // --- 正房（北，三开间）---
  const mainW = Math.min(width - 2.4, 9 + rnd() * 2);   // 三开间面阔 9—11 m
  const mainD = 4.6 + rnd() * 1.2;                       // 进深 4.5—6 m
  const eave = 2.45 + rnd() * 0.3;                       // 檐口 2.4—2.8 m
  const ridge = eave + mainD * 0.5 * Math.tan(THREE.MathUtils.degToRad(27.5));
  const [mx, mz] = L(0, -depth / 2 + mainD / 2 + 0.4);
  AddRoomBlock(sink, {
    x: mx, z: mz, ry, width: mainW, depth: mainD, eaveY: eave, ridgeY: ridge,
    seed: `${seed}:main`, damage, burnt, facing: 1, bays: 3,
  });

  // --- 厢房（东西各一，矮一档）---
  for (const side of [-1, 1]) {
    if (rnd() < 0.25) continue;                          // 有的院子只有一侧厢房
    const wingW = 3.4 + rnd() * 0.8;
    const wingD = Math.min(depth - mainD - 3.0, 5.5 + rnd());
    if (wingD < 3) continue;
    const wingEave = 2.2 + rnd() * 0.2;
    const wingRidge = wingEave + wingW * 0.5 * Math.tan(THREE.MathUtils.degToRad(27));
    const [wx2, wz2] = L(side * (width / 2 - wingW / 2 - 0.5), -depth / 2 + mainD + 1.0 + wingD / 2);
    AddRoomBlock(sink, {
      x: wx2, z: wz2, ry: ry + Math.PI / 2 * side, width: wingD, depth: wingW,
      eaveY: wingEave, ridgeY: wingRidge, seed: `${seed}:wing${side}`,
      damage: Clamp(damage + rnd() * 0.2, 0, 1), burnt, facing: side, bays: 2,
    });
  }

  // --- 院里的家什 ---
  const yardZ = depth / 2 - 2.6;
  if (rnd() < 0.55) AddWell(sink, ...L((rnd() - 0.5) * width * 0.4, yardZ - rnd() * 2));
  if (rnd() < 0.45) AddMillstone(sink, ...L((rnd() - 0.5) * width * 0.5, yardZ - 1 - rnd() * 2), `${seed}:ms`);
  if (rnd() < 0.4) AddWaterVat(sink, ...L(width / 2 - 1.2, yardZ - 0.6), `${seed}:vat`);
  // 影壁：门内一堵挡视线的短墙，进院第一眼看到的就是它
  if (gateSide === "south" && rnd() < 0.5) {
    const [px, pz] = L(0, depth / 2 - 2.0);
    AddWall(sink, "BrickWall", {
      x: px, z: pz, length: 2.4, height: 1.9, thickness: 0.28, ry,
      ruin: damage * 0.6, seed: `${seed}:screen`, plinth: "Stone", cope: true,
    });
  }
}

/** 一栋房：四面墙 + 门 + 朝院子的格子窗 + 硬山瓦顶。 */
export function AddRoomBlock(sink, spec) {
  const {
    x, z, ry, width, depth, eaveY, ridgeY, seed, damage = 0, burnt = false,
    facing = 1, bays = 3,
  } = spec;
  const rnd = Mulberry32(HashString(`${seed}:rb`));
  const wallMat = burnt ? "BrickWallSooty" : "BrickWall";
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const L = (lx, lz) => [x + cos * lx - sin * lz, z - sin * lx - cos * lz];
  const collapsed = damage > 0.62;

  // 四面墙：面朝院子那一面（+z * facing）开门窗，其余三面实墙
  const faces = [
    { lx: 0, lz: -depth / 2, len: width, rot: 0, open: facing < 0 },
    { lx: 0, lz: depth / 2, len: width, rot: 0, open: facing > 0 },
    { lx: -width / 2, lz: 0, len: depth, rot: Math.PI / 2, open: false },
    { lx: width / 2, lz: 0, len: depth, rot: Math.PI / 2, open: false },
  ];
  for (let i = 0; i < faces.length; i += 1) {
    const f = faces[i];
    const [fx, fz] = L(f.lx, f.lz);
    if (!f.open) {
      AddWall(sink, wallMat, {
        x: fx, z: fz, length: f.len, height: eaveY, thickness: 0.36,
        ry: ry + f.rot, ruin: damage * 0.85, seed: `${seed}:f${i}`,
        plinth: "Stone",
      });
      // 山墙顶上的小「口眼」（通风口）——两山墙才有
      if (i >= 2 && !collapsed && rnd() < 0.7) {
        const [ox, oz] = L(f.lx * 1.02, 0);
        sink.Add("WoodBeam", PlaceGeometry(
          MakeBox(0.06, 0.34, 0.34, TILE_METERS.wood, `${seed}:eye${i}`),
          { x: ox, y: eaveY + 0.35, z: oz, ry: ry + f.rot }));
      }
      continue;
    }
    // 朝院一面：门 + 两侧格子窗（明间开门，次间开窗）
    const bayW = f.len / bays;
    for (let b = 0; b < bays; b += 1) {
      const lx = f.lx + (-f.len / 2 + bayW * (b + 0.5)) * Math.cos(f.rot);
      const lz2 = f.lz + (-f.len / 2 + bayW * (b + 0.5)) * -Math.sin(f.rot);
      const [bx, bz] = L(lx, lz2);
      const isDoor = b === Math.floor(bays / 2);
      // 门/窗两侧的墙垛
      const pierW = (bayW - (isDoor ? 1.25 : 1.05)) / 2;
      for (const s2 of [-1, 1]) {
        const off = s2 * (bayW / 2 - pierW / 2);
        const [px, pz] = L(lx + off * Math.cos(f.rot), lz2 + off * -Math.sin(f.rot));
        AddWall(sink, wallMat, {
          x: px, z: pz, length: pierW, height: eaveY, thickness: 0.36,
          ry: ry + f.rot, ruin: damage * 0.8, seed: `${seed}:p${i}${b}${s2}`, plinth: "Stone",
        });
      }
      if (isDoor) {
        const doorH = 2.0;
        // 门上过梁 + 门板
        sink.Add("WoodBeam", PlaceGeometry(MakeBox(1.45, 0.18, 0.4, TILE_METERS.wood, `${seed}:lt${b}`),
          { x: bx, y: doorH + 0.09, z: bz, ry: ry + f.rot }));
        AddWall(sink, wallMat, {
          x: bx, z: bz, length: 1.25, height: eaveY - doorH - 0.18, thickness: 0.36,
          ry: ry + f.rot, ruin: damage * 0.7, seed: `${seed}:ab${b}`, solid: false,
        });
        // 上半段墙要垫高
        if (damage < 0.5) {
          sink.Add(wallMat, PlaceGeometry(
            MakeBox(1.25, eaveY - doorH - 0.18, 0.36, TILE_METERS.brick, `${seed}:up${b}`),
            { x: bx, y: doorH + 0.18 + (eaveY - doorH - 0.18) / 2, z: bz, ry: ry + f.rot }));
        }
        if (rnd() < 0.55) {
          for (const s3 of [-1, 1]) {
            sink.Add("WoodDoor", PlaceGeometry(
              MakeBox(0.60, doorH, 0.05, TILE_METERS.wood, `${seed}:dr${b}${s3}`),
              {
                x: bx + s3 * 0.31 * Math.cos(f.rot + ry), y: doorH / 2,
                z: bz - s3 * 0.31 * Math.sin(f.rot + ry), ry: ry + f.rot,
              }));
          }
        }
      } else {
        // 格子窗：窗台 0.9 m，窗高 1.1 m，木棂做成井字
        const sillY = 0.92, winH = 1.06;
        sink.Add(wallMat, PlaceGeometry(MakeBox(1.05, sillY, 0.36, TILE_METERS.brick, `${seed}:sl${b}`),
          { x: bx, y: sillY / 2, z: bz, ry: ry + f.rot }));
        sink.Add(wallMat, PlaceGeometry(
          MakeBox(1.05, Math.max(0.1, eaveY - sillY - winH), 0.36, TILE_METERS.brick, `${seed}:hd${b}`),
          { x: bx, y: sillY + winH + Math.max(0.1, eaveY - sillY - winH) / 2, z: bz, ry: ry + f.rot }));
        if (damage < 0.55) {
          const frame = [];
          frame.push(PlaceGeometry(MakeBox(1.05, 0.08, 0.1, TILE_METERS.wood, `${seed}:wf1${b}`), { y: 0 }));
          frame.push(PlaceGeometry(MakeBox(1.05, 0.08, 0.1, TILE_METERS.wood, `${seed}:wf2${b}`), { y: winH }));
          for (let m = 0; m <= 3; m += 1) {
            frame.push(PlaceGeometry(MakeBox(0.05, winH, 0.08, TILE_METERS.wood, `${seed}:wm${b}${m}`),
              { x: -0.5 + m * 0.333, y: winH / 2 }));
          }
          for (let m = 1; m <= 2; m += 1) {
            frame.push(PlaceGeometry(MakeBox(1.05, 0.05, 0.08, TILE_METERS.wood, `${seed}:wh${b}${m}`),
              { y: winH * (m / 3) }));
          }
          sink.Add("WoodDoor", PlaceGeometry(MergeGeometries(frame),
            { x: bx, y: sillY, z: bz, ry: ry + f.rot }));
        }
        sink.Solid(bx, eaveY / 2, bz, 0.6, eaveY / 2, 0.25, "wall");
      }
    }
  }

  AddHardMountainRoof(sink, {
    x, z, width, depth, eaveY, ridgeY, ry, seed: `${seed}:roof`,
    ruined: collapsed, burnt,
  });

  // 塌了的房子脚下有一堆瓦砾，没有的话看起来像被橡皮擦掉的
  if (collapsed) {
    sink.props.push({ kind: "rubblePile", x, z, radius: Math.max(width, depth) * 0.45, seed: `${seed}:rp` });
  }
}

/** 门楼：3.5—4.5 m，双扇木门 + 门墩石 + 小瓦顶。街上唯一的开口。 */
export function AddGatehouse(sink, { x, z, ry, seed, damage = 0, burnt = false, openW = 1.5 }) {
  const h = 3.6;
  const mat = burnt ? "BrickWallSooty" : "BrickWall";
  const cos = Math.cos(ry), sin = Math.sin(ry);
  // 两根门垛
  for (const s of [-1, 1]) {
    const lx = s * (openW / 2 + 0.28);
    sink.Add(mat, PlaceGeometry(MakeBox(0.56, h, 0.72, TILE_METERS.brick, `${seed}:pier${s}`),
      { x: x + cos * lx, y: h / 2, z: z - sin * lx, ry }));
    sink.Solid(x + cos * lx, h / 2, z - sin * lx, 0.4, h / 2, 0.4, "wall");
    // 门墩石
    sink.Add("Stone", PlaceGeometry(MakeBox(0.42, 0.52, 0.42, TILE_METERS.stone, `${seed}:dun${s}`),
      { x: x + cos * (lx + s * 0.16), y: 0.26, z: z - sin * (lx + s * 0.16), ry }));
  }
  // 门额与小瓦顶
  sink.Add("WoodBeam", PlaceGeometry(MakeBox(openW + 1.2, 0.26, 0.8, TILE_METERS.wood, `${seed}:lin`),
    { x, y: 2.32, z, ry }));
  sink.Add(mat, PlaceGeometry(MakeBox(openW + 1.2, h - 2.58, 0.62, TILE_METERS.brick, `${seed}:up`),
    { x, y: 2.58 + (h - 2.58) / 2, z, ry }));
  if (damage < 0.6) {
    for (const s of [-1, 1]) {
      sink.Add(burnt ? "BrickWallSooty" : "RoofTile", PlaceGeometry(
        MakeBox(openW + 2.0, 0.11, 0.62, TILE_METERS.roof, `${seed}:rf${s}`),
        { x, y: h + 0.28, z: z - cos * s * 0.28, ry, rx: -s * 0.46 }));
    }
    sink.Add("RoofTile", PlaceGeometry(MakeBox(openW + 2.1, 0.16, 0.24, TILE_METERS.roof, `${seed}:rdg`),
      { x, y: h + 0.5, z, ry }));
  }
  // 门板（一扇歪着，一扇掉了——打了半个月的镇子不会有齐整的门）
  if (damage < 0.75) {
    sink.Add("WoodDoor", PlaceGeometry(MakeBox(openW / 2 - 0.04, 2.15, 0.07, TILE_METERS.wood, `${seed}:d0`),
      { x: x + cos * (-openW / 4), y: 1.08, z: z - sin * (-openW / 4), ry }));
    if (damage < 0.35) {
      sink.Add("WoodDoor", PlaceGeometry(MakeBox(openW / 2 - 0.04, 2.15, 0.07, TILE_METERS.wood, `${seed}:d1`),
        { x: x + cos * (openW / 4), y: 1.08, z: z - sin * (openW / 4), ry: ry + 0.55 }));
    }
  }
}

/** 水井：石砌井口，井栏外径 0.8—1.0 m、高 0.4—0.6 m。 */
export function AddWell(sink, x, z) {
  const g = new THREE.CylinderGeometry(0.48, 0.52, 0.52, 20, 1, true);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * 2.2, uv.getY(i) * 0.4);
  sink.Add("Stone", PlaceGeometry(g, { x, y: 0.26, z }));
  const lip = new THREE.TorusGeometry(0.5, 0.055, 6, 18);
  lip.rotateX(Math.PI / 2);
  sink.Add("Stone", PlaceGeometry(lip, { x, y: 0.52, z }));
  sink.Solid(x, 0.26, z, 0.55, 0.26, 0.55, "prop");
  sink.Cover(x, z, 0.52, 0, 1);
}

export function AddMillstone(sink, x, z, seed = "ms") {
  const base = new THREE.CylinderGeometry(0.52, 0.55, 0.18, 18);
  sink.Add("Stone", PlaceGeometry(base, { x, y: 0.09, z }));
  const top = new THREE.CylinderGeometry(0.44, 0.44, 0.16, 18);
  sink.Add("Stone", PlaceGeometry(top, { x, y: 0.26, z, ry: HashString(seed) % 100 / 100 }));
  sink.Solid(x, 0.17, z, 0.55, 0.17, 0.55, "prop");
}

export function AddWaterVat(sink, x, z, seed = "vat") {
  const g = new THREE.CylinderGeometry(0.42, 0.34, 0.78, 16, 1, true);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * 2.0, uv.getY(i) * 0.7);
  sink.Add("Stone", PlaceGeometry(g, { x, y: 0.39, z }));
  sink.Solid(x, 0.39, z, 0.44, 0.39, 0.44, "prop");
  sink.Cover(x, z, 0.78, 0, 1);
}

/**
 * 寨墙。高 4 m、砖包夯土、上砌垛口；内侧有马道上墙。
 * 这是台儿庄的"城"——不是明清府城，玩家站在墙上能看清街内。
 */
export function AddRampart(sink, {
  x, z, length, ry = 0, seed = "rp", height = 4.0, thickness = 2.2,
  breach = null, merlons = true,
}) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const segs = Math.max(4, Math.round(length / 2.2));
  const segLen = length / segs;
  for (let i = 0; i < segs; i += 1) {
    const lx = -length / 2 + segLen * (i + 0.5);
    let h = height;
    if (breach) {
      const d = Math.abs(lx - breach.at);
      if (d < breach.width / 2) {
        // 缺口：中间几乎塌平，边缘参差
        const t = d / (breach.width / 2);
        h = height * (0.18 + 0.82 * Math.pow(t, 1.7));
      }
    }
    sink.Add("BrickWall", PlaceGeometry(
      MakeBox(segLen * 1.02, h, thickness, TILE_METERS.brick, `${seed}:s${i}`),
      { x: x + cos * lx, y: h / 2, z: z - sin * lx, ry }));
    if (h > height * 0.9) {
      sink.Solid(x + cos * lx, h / 2, z - sin * lx,
        Math.abs(cos) * segLen / 2 + Math.abs(sin) * thickness / 2, h / 2,
        Math.abs(sin) * segLen / 2 + Math.abs(cos) * thickness / 2, "rampart");
    }
    // 垛口：一段实、一段空，实的高 1.1 m
    if (merlons && h > height * 0.9) {
      const per = Math.max(1, Math.round(segLen / 1.4));
      for (let m = 0; m < per; m += 1) {
        if ((i + m) % 2 === 1) continue;
        const mlx = lx - segLen / 2 + (m + 0.5) * (segLen / per);
        const mz = thickness / 2 - 0.28;
        sink.Add("BrickWall", PlaceGeometry(
          MakeBox(segLen / per * 0.62, 1.05, 0.5, TILE_METERS.brick, `${seed}:m${i}${m}`),
          { x: x + cos * mlx - sin * mz, y: height + 0.52, z: z - sin * mlx - cos * mz, ry }));
        sink.Cover(x + cos * mlx - sin * mz, z - sin * mlx - cos * mz, height + 1.05, sin, cos);
      }
    }
  }
  // 马道由调用方单独建（AddRampWay）：它要知道坡脚的地面高程，而这里查不到地形。
}

/**
 * 马道（上墙的坡道）。**必须一级一级地建，不能建成一块斜着的板。**
 *
 * 原来那版是一块旋转过的长方体 + 一个 3.6×2.8×7.6 的实心碰撞盒：画面上是坡，
 * 碰撞上是一堵 3.4 m 高的墙。玩家撞上去就停住，AI 的 Blocked() 也直接判死。
 * 于是「城墙是台儿庄的主战场」这句话在运行时是假的 —— 谁也上不去。
 *
 * 现在拆成 RAMP_STEPS 级台阶，每级抬 (墙顶 − 坡脚地面) / RAMP_STEPS，
 * 压在玩家 MoveWithCollision 与 AI Blocked() 那条 0.56 m 的自动抬腿线以下，
 * 于是两边都是「走上去」而不是「被挡住」。
 *
 * **baseY 必须是坡脚那儿的真实地面高程，不能当成 0。** 第一版就是这么错的：
 * 台阶按绝对高度砌（0.5 / 1.0 / …），而北墙内侧的地面在 −0.7 m，
 * 于是第一级相对脚下就有 1.2 m —— 越过抬腿线，人在坡底原地顶着，
 * 实跑量到玩家爬到 2.86 m 就再也上不去。地形是起伏的，这个数每条马道都不一样。
 *
 * 台阶盒一律从地面以下砌满（不是悬空的一片），这样从侧面撞过来是一堵矮墙，
 * 从下往上走才是台阶 —— 悬空片会让人从坡底钻进坡肚子里。
 */
export const RAMP_STEPS = 10;
export const RAMP_RUN_M = 1.2;
export const RAMP_WIDTH_M = 2.4;

export function AddRampWay(sink, {
  x, z, at = 0, ry = 0, height = 4.0, thickness = 2.2, baseY = 0, seed = "ramp",
}) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  // 局部坐标：lx 沿墙，lz 往城里为负（与 AddRampart 其余部分同一套约定）
  const L = (lx, lz) => [x + cos * lx - sin * lz, z - sin * lx - cos * lz];
  const bottom = baseY - 1.4;                     // 砌到地面以下，免得坡底露出缝
  const rise = (height - baseY) / RAMP_STEPS;
  const hx = Math.abs(cos) * RAMP_WIDTH_M / 2 + Math.abs(sin) * RAMP_RUN_M / 2;
  const hz = Math.abs(sin) * RAMP_WIDTH_M / 2 + Math.abs(cos) * RAMP_RUN_M / 2;
  for (let i = 0; i < RAMP_STEPS; i += 1) {
    // i = 0 是最高的一级（顶面正好齐墙顶），越往城里越矮
    const top = height - rise * i;
    const lz = -(thickness / 2 + RAMP_RUN_M * (i + 0.5));
    const [sx, sz] = L(at, lz);
    const h = top - bottom;
    sink.Add("Ground", PlaceGeometry(
      MakeBox(RAMP_WIDTH_M, h, RAMP_RUN_M * 1.02, TILE_METERS.ground, `${seed}:s${i}`),
      { x: sx, y: bottom + h / 2, z: sz, ry }));
    sink.Solid(sx, bottom + h / 2, sz, hx, h / 2, hz, "ramp");
  }
}

/**
 * 清真寺（1938 年的样子）：门楼 + 卷棚顶礼拜堂 + 讲堂 + 配房，中式硬山低矮院落群。
 * **不要做阿拉伯式穹顶尖塔**；那座 28 m 的望月楼是 1942 年重修才加的。
 * 大战中这里是第 31 师 186 团的指挥所，双方拉锯七天七夜。
 */
export function AddMosque(sink, { x, z, ry = 0, seed = "mq", damage = 0.4 }) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const L = (lx, lz) => [x + cos * lx - sin * lz, z - sin * lx - cos * lz];
  const W = 30, D = 26;

  // 院墙（弹孔墙：这面墙每平方米上百个弹孔，靠 BrickWallSooty 的剥落 + 后面撒弹孔贴花表达）
  const walls = [
    { lx: 0, lz: -D / 2, len: W, rot: 0 },
    { lx: -W / 2, lz: 0, len: D, rot: Math.PI / 2 },
    { lx: W / 2, lz: 0, len: D, rot: Math.PI / 2 },
  ];
  for (let i = 0; i < walls.length; i += 1) {
    const w = walls[i];
    const [wx, wz] = L(w.lx, w.lz);
    AddWall(sink, "BrickWallSooty", {
      x: wx, z: wz, length: w.len, height: 2.7, thickness: 0.45,
      ry: ry + w.rot, ruin: damage * 0.55, seed: `${seed}:w${i}`, plinth: "Stone", cope: true,
    });
  }
  // 南面：门楼居中，两侧短墙
  const gateW = 3.2;
  for (const s of [-1, 1]) {
    const segLen = (W - gateW) / 2;
    const [sx, sz] = L(s * (gateW / 2 + segLen / 2), D / 2);
    AddWall(sink, "BrickWallSooty", {
      x: sx, z: sz, length: segLen, height: 2.7, thickness: 0.45,
      ry, ruin: damage * 0.5, seed: `${seed}:ws${s}`, plinth: "Stone", cope: true,
    });
  }
  const [gx, gz] = L(0, D / 2);
  AddGatehouse(sink, { x: gx, z: gz, ry, seed: `${seed}:gate`, damage: damage * 0.6, openW: gateW });

  // 礼拜堂（北，最大的一进；卷棚顶做成两坡但脊部略平）
  const [hx, hz] = L(0, -D / 2 + 7.5);
  AddRoomBlock(sink, {
    x: hx, z: hz, ry, width: 18, depth: 11, eaveY: 3.4, ridgeY: 6.1,
    seed: `${seed}:hall`, damage: damage * 0.7, facing: 1, bays: 5,
  });
  // 讲堂（西）与配房（东）
  const [jx, jz] = L(-W / 2 + 4.2, 2.0);
  AddRoomBlock(sink, {
    x: jx, z: jz, ry: ry + Math.PI / 2, width: 10, depth: 5.6,
    eaveY: 2.7, ridgeY: 4.4, seed: `${seed}:jiang`, damage: damage * 0.9, facing: 1, bays: 3,
  });
  const [ex, ez] = L(W / 2 - 4.2, 2.0);
  AddRoomBlock(sink, {
    x: ex, z: ez, ry: ry - Math.PI / 2, width: 10, depth: 5.0,
    eaveY: 2.6, ridgeY: 4.2, seed: `${seed}:pei`, damage: damage * 0.8, facing: 1, bays: 3,
  });

  // 院里的老树与石阶
  const [tx, tz] = L(-5.5, 4.0);
  sink.props.push({ kind: "tree", x: tx, z: tz, seed: `${seed}:tree`, scale: 1.3 });
  const [stx, stz] = L(0, -D / 2 + 13.4);
  sink.Add("Stone", PlaceGeometry(MakeBox(19, 0.28, 1.6, TILE_METERS.stone, `${seed}:step`),
    { x: stx, y: 0.14, z: stz, ry }));
}

/** 街垒：门板、水缸、粮包、独轮车、沙包 —— 就便器材，不是工事教科书。 */
export function AddBarricade(sink, { x, z, ry = 0, length = 5, seed = "bar", height = 1.15 }) {
  const rnd = Mulberry32(HashString(seed));
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const bags = [];
  const dummy = new THREE.Object3D();
  const rows = Math.max(2, Math.round(height / 0.24));
  for (let row = 0; row < rows; row += 1) {
    const rowLen = length * (1 - row * 0.06);
    const n = Math.max(2, Math.round(rowLen / 0.6));
    for (let i = 0; i < n; i += 1) {
      const lx = -rowLen / 2 + (i + 0.5) * (rowLen / n);
      const lz = (rnd() - 0.5) * 0.12;
      dummy.position.set(x + cos * lx - sin * lz, 0.12 + row * 0.225, z - sin * lx - cos * lz);
      dummy.rotation.set((rnd() - 0.5) * 0.1, ry + (rnd() - 0.5) * 0.28, (rnd() - 0.5) * 0.1);
      dummy.scale.set(1, 0.95 + rnd() * 0.14, 1);
      dummy.updateMatrix();
      bags.push(dummy.matrix.clone());
    }
  }
  sink.props.push({ kind: "sandbags", matrices: bags });
  sink.Solid(x, height / 2, z,
    Math.abs(cos) * length / 2 + 0.3, height / 2, Math.abs(sin) * length / 2 + 0.3, "barricade");
  sink.Cover(x, z, height, sin, cos);

  // 掺进去的就便器材：门板斜靠、水缸、独轮车
  if (rnd() < 0.7) {
    const lx = (rnd() - 0.5) * length * 0.6;
    sink.Add("WoodDoor", PlaceGeometry(MakeBox(1.0, 1.9, 0.06, TILE_METERS.wood, `${seed}:pl`),
      { x: x + cos * lx, y: 0.85, z: z - sin * lx - cos * 0.35, ry, rx: 0.42 }));
  }
  if (rnd() < 0.5) AddWaterVat(sink, x + cos * (length / 2 + 0.5), z - sin * (length / 2 + 0.5), `${seed}:v`);
}

/** 杨树/柳树：三四月枝条透光、新叶初展，**不做浓密树冠**。 */
export function AddTree(sink, { x, z, seed = "t", scale = 1 }) {
  const rnd = Mulberry32(HashString(seed));
  const h = (5.5 + rnd() * 3.0) * scale;
  const trunk = new THREE.CylinderGeometry(0.13 * scale, 0.22 * scale, h, 8, 3);
  const pos = trunk.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const t = (pos.getY(i) + h / 2) / h;
    pos.setX(i, pos.getX(i) + Math.sin(t * 3.1 + rnd()) * 0.12 * scale * t);
    pos.setZ(i, pos.getZ(i) + Math.cos(t * 2.3 + rnd()) * 0.10 * scale * t);
  }
  trunk.computeVertexNormals();
  const uv = trunk.attributes.uv;
  // h/1.2 会把一棵 7 m 的树只切成六格，树皮被竖着拉成一根水泥杆上的条纹。
  // h/0.45 才是"一格 45 cm"的树皮尺度
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * 1.6, uv.getY(i) * h / 0.45);
  sink.Add("WoodBeam", PlaceGeometry(trunk, { x, y: h / 2, z }));
  // 枝条：几根细长的分叉，不加叶片团
  //
  // 事故（第 1 轮视觉审查抓到的）：枝条中心放在 cos(a)*len*0.42*sin(tilt)，
  // 而旋转写的是 rz = cos(a)*tilt, rx = sin(a)*tilt —— 位置的方位角基与欧拉角的
  // 方位角基根本不是同一套，结果是三四根枝条**跟树干脱开、悬在半空**。
  // 改法：先把枝条的原点从"杆中点"挪到"根端"（PlaceGeometry y: len/2），
  // 之后整根按 ry = a 转方位、rz = tilt 扳倒，再摆到树干上的挂点。
  // 这样根端永远压在 (0, h*t, 0) 上，怎么转都接得住。
  const branches = [];
  // 挂点从 0.45—0.95 收到 0.62—0.96：杨柳的枝在上三分之一，下面是净杆
  const count = 11 + Math.floor(rnd() * 6);
  for (let i = 0; i < count; i += 1) {
    const t = 0.62 + rnd() * 0.34;
    const len = (1.2 + rnd() * 2.2) * scale;
    const a = rnd() * Math.PI * 2;
    const tilt = 0.5 + rnd() * 0.7;
    const g = PlaceGeometry(
      new THREE.CylinderGeometry(0.02 * scale, 0.06 * scale, len, 5), { y: len / 2 });
    const anchor = { x: 0, y: h * t, z: 0, ry: a, rz: tilt };
    branches.push(PlaceGeometry(g, anchor));
    // 二级枝：轮廓端点数从 9 个升到 40 个上下，才读得出"三月枝条透光、新叶未展"
    for (let j = 0; j < 3; j += 1) {
      const sub = (0.34 + rnd() * 0.10) * len;
      const along = 0.45 + j * 0.22 + rnd() * 0.12;
      const g2 = PlaceGeometry(
        new THREE.CylinderGeometry(0.010 * scale, 0.022 * scale, sub, 4), { y: sub / 2 });
      // 先在主枝的局部系里挂好（沿主枝长度 along、再偏 0.5—0.9 rad），
      // 然后整体套上主枝那一套 anchor —— 父子变换手动展开一层
      const local = PlaceGeometry(g2, {
        y: len * along,
        ry: rnd() * Math.PI * 2,
        rz: 0.5 + rnd() * 0.4,          // 相对主枝再偏 0.5—0.9 rad
      });
      branches.push(PlaceGeometry(local, anchor));
    }
  }
  sink.Add("WoodBeam", PlaceGeometry(MergeGeometries(branches), { x, y: 0, z }));
  sink.Solid(x, h / 2, z, 0.3 * scale, h / 2, 0.3 * scale, "prop");
}

/** 电线杆 + 断掉的电话线：镇子有电报电话，线被打断垂下来是很强的战场符号。 */
export function AddPole(sink, { x, z, seed = "pole", height = 6.5 }) {
  sink.Add("WoodBeam", PlaceGeometry(
    new THREE.CylinderGeometry(0.09, 0.13, height, 8), { x, y: height / 2, z }));
  sink.Add("WoodBeam", PlaceGeometry(
    MakeBox(1.5, 0.09, 0.09, TILE_METERS.wood, `${seed}:arm`), { x, y: height - 0.5, z }));
  sink.Solid(x, height / 2, z, 0.16, height / 2, 0.16, "prop");
}
