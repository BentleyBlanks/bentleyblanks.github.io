// 庙宇套件：龙王庙 / 火神庙（temple）+ 文庙（confucianTemple）。工作包 A6 专属文件。
// 契约见 Script_LandmarkRegistry.mjs 头注。
// BuildTemple 复刻旧 temple 分支（前庭 + 抬高主殿），视觉与旧版一致。
// A6 要做成：庙墙 / 山门 / 大殿的庙宇 kit（斗拱、脊兽 tzm 件复用），
// 文庙比街庙高一档规格（棂星门 + 大成殿量级），撑起龙王庙街 / 火神庙东街 / 文庙的地名。

import { AddCompound } from "./Script_World.mjs";

export function BuildTemple(host, f, ctx) {
  AddCompound(host.sink, {
    x: f.x, z: f.z, ry: ctx.ry, width: f.w, depth: f.d,
    seed: `map:${f.id}:yard`, damage: ctx.damage, burnt: ctx.burnt,
  });
  // 庙宇主殿抬高一档；前庭留空，和学校/营部一眼可分（沿旧版）。
  host.AddFeatureRoom(f, ctx.ry, 0, -f.d * 0.18, f.w * 0.58, f.d * 0.42, {
    eaveY: 3.6, ridgeY: 5.8, seed: `map:${f.id}:hall`,
    damage: ctx.damage, burnt: ctx.burnt, facing: 1, bays: 3,
  });
}

export function BuildConfucianTemple(host, f, ctx) {
  AddCompound(host.sink, {
    x: f.x, z: f.z, ry: ctx.ry, width: f.w, depth: f.d,
    seed: `map:${f.id}:yard`, damage: ctx.damage, burnt: ctx.burnt,
  });
  // 白盒桩：大成殿先按主殿再高半档摆出体量，A6 重做。
  host.AddFeatureRoom(f, ctx.ry, 0, -f.d * 0.16, f.w * 0.6, f.d * 0.44, {
    eaveY: 4.0, ridgeY: 6.4, seed: `map:${f.id}:hall`,
    damage: ctx.damage, burnt: ctx.burnt, facing: 1, bays: 3,
  });
}
