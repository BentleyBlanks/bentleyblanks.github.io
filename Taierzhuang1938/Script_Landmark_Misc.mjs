// 杂项占位升级包：区公所 / 王家祠堂 / 人民书店 / 空心炮台 / 龙泉塔战损态 / 弘道院剪影。
// 工作包 D6 专属文件。契约见 Script_LandmarkRegistry.mjs 头注。
// 当前全部是白盒桩（逐一复刻旧 BuildOneLandmark switch 案与 BuildOutskirts 炮台段），
// D6 要做成：
//   districtOffice 第二区公所 —— 机关院化（可借鉴 Commerce.BuildOffice 的语言，只读 import）
//   shrine 王家祠堂 —— 祠堂形制：享堂 + 龛位 + 祭案，不是普通四合院
//   shop 人民书店 —— 书铺门脸 + 暗间（1931 年中共滕县特支驻地，叙事点）
//   hollowFort 空心炮台 —— 1908 制式圆形/多边空心炮台（环形砖体+射孔+顶台），替换 11×11 盒子
//   pagoda 龙泉塔 —— 1938 战损态（docs 有载：塔刹已倾毁、顶层塔室部分倾塌、挑檐斗拱脱落；
//                     现在的 AddPagoda 是完整塔 —— 在本文件重写战损版，不改 Script_World）
//   silhouetteCluster 弘道院 —— 西式校舍剪影群的层次改良（仍只做远景，不做可进入）

import {
  AddCompound, AddRoomBlock, AddSquareFort, AddPagoda, AddLoopholes,
} from "./Script_World.mjs";
import { MakeBox, PlaceGeometry, TILE_METERS, BRICK_UV_GRID } from "./Script_Geo.mjs";
import { Mulberry32, HashString } from "./Script_Noise.mjs";

export function BuildDistrictOffice(host, f, ctx) {
  AddCompound(host.sink, {
    x: f.x, z: f.z, ry: ctx.ry, width: f.w, depth: f.d,
    seed: `map:${f.id}`, damage: ctx.damage, burnt: ctx.burnt,
  });
  // 办公翼（沿旧 /DistrictOffice/ 正则分支）
  host.AddFeatureRoom(f, ctx.ry, 0, 0, f.w * 0.42, f.d * 0.18, {
    eaveY: 3.2, ridgeY: 5.0, seed: `map:${f.id}:office`,
    damage: ctx.damage, burnt: ctx.burnt, facing: -1, bays: 5,
  });
}

export function BuildShrine(host, l, ctx) {
  // 旧 shrine 案原样：一进带门楼的四合院（damage 0.28 为旧值）
  AddCompound(host.sink, {
    x: l.x, z: l.z, ry: ctx.ry, width: l.w, depth: l.d, seed: l.id, damage: 0.28,
  });
}

export function BuildShop(host, l, ctx) {
  AddRoomBlock(host.sink, {
    x: l.x, z: l.z, ry: ctx.ry, width: l.w, depth: l.d,
    eaveY: 3.2, ridgeY: 5.0, seed: l.id, damage: 0.3, facing: 1, bays: 3,
  });
}

export function BuildPagodaLandmark(host, l, ctx) {
  AddPagoda(host.sink, { x: l.x, z: l.z, tiers: l.tiers, seed: l.id, baseY: 0 });
  void ctx;
}

export function BuildSquareFortLandmark(host, l, ctx) {
  AddSquareFort(host.sink, {
    x: l.x, z: l.z, ry: ctx.ry, w: l.w, d: l.d, seed: l.id, damage: 0.3,
  });
}

/** 弘道院/华北神学院一带的西式校舍剪影群（旧 AddCluster 原样搬入）。 */
export function BuildSilhouetteCluster(host, l, ctx) {
  const rnd = Mulberry32(HashString(l.id));
  for (let i = 0; i < 7; i += 1) {
    const x = l.x + (rnd() - 0.5) * l.w;
    const z = l.z + (rnd() - 0.5) * l.d;
    const w = 14 + rnd() * 12, d = 9 + rnd() * 6, h = 6.5 + rnd() * 2.4;
    host.farSink.Add("HouseBrick", PlaceGeometry(
      MakeBox(w, h, d, TILE_METERS.brick, `${l.id}:${i}`, BRICK_UV_GRID),
      { x, y: host.OuterHeight(x, z) + h / 2, z }));
    host.farSink.Add("RoofTile", PlaceGeometry(
      MakeBox(w + 0.8, 0.9, d + 0.8, TILE_METERS.roof, `${l.id}:r${i}`),
      { x, y: host.OuterHeight(x, z) + h + 0.45, z }));
  }
  void ctx;
}

/** 1908 年空心炮台（旧 BuildOutskirts 硬编码段原样）。 */
export function BuildHollowFort(host, f, ctx) {
  const y = host.OuterHeight(f.x, f.z);
  host.sink.Add("HouseBrick", PlaceGeometry(
    MakeBox(11, 4.2, 11, TILE_METERS.brick, `fort${f.x}`, BRICK_UV_GRID),
    { x: f.x, y: y + 2.1, z: f.z }));
  host.sink.Solid(f.x, y + 2.1, f.z, 5.5, 2.1, 5.5, "wall");
  AddLoopholes(host.sink, {
    x: f.x, z: f.z - 5.5, ry: Math.PI, ys: [1.6, 2.8], count: 3, spread: 6,
    seed: `fortLp${f.x}`, wallFace: 0.2, size: 0.34,
  });
  void ctx;
}
