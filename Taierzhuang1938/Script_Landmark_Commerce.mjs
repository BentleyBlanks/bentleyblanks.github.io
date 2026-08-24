// 商会 + 当典（当铺）+ 办事处 —— 商用公建三件。工作包 A4 专属文件。
// 契约见 Script_LandmarkRegistry.mjs 头注。
// BuildGuild 复刻旧 roomBlock 分支、BuildOffice 复刻旧 compound+办公翼分支，视觉与旧版一致。
// A4 要做成：商会门脸楼（两层临街）、当铺高墙 +「当」字幌、办事处院。

import { AddCompound, AddRoomBlock } from "./Script_World.mjs";

export function BuildGuild(host, f, ctx) {
  AddRoomBlock(host.sink, {
    x: f.x, z: f.z, ry: ctx.ry, width: f.w, depth: f.d,
    eaveY: 3.0, ridgeY: 4.8, seed: `map:${f.id}`,
    damage: ctx.damage, burnt: ctx.burnt, facing: 1, bays: Math.max(2, Math.round(f.w / 10)),
  });
  host.AddFeatureRoom(f, ctx.ry, 0, -f.d * 0.27, f.w * 0.48, f.d * 0.18, {
    eaveY: 2.6, ridgeY: 3.9, seed: `map:${f.id}:rearWing`,
    damage: ctx.damage, burnt: ctx.burnt, facing: -1, bays: 3,
  });
}

export function BuildPawnshop(host, f, ctx) {
  AddCompound(host.sink, {
    x: f.x, z: f.z, ry: ctx.ry, width: f.w, depth: f.d,
    seed: `map:${f.id}`, damage: ctx.damage, burnt: ctx.burnt,
  });
}

export function BuildOffice(host, f, ctx) {
  AddCompound(host.sink, {
    x: f.x, z: f.z, ry: ctx.ry, width: f.w, depth: f.d,
    seed: `map:${f.id}`, damage: ctx.damage, burnt: ctx.burnt,
  });
  // 办公翼（沿旧版 /Office/ 分支）。
  host.AddFeatureRoom(f, ctx.ry, 0, 0, f.w * 0.42, f.d * 0.18, {
    eaveY: 3.2, ridgeY: 5.0, seed: `map:${f.id}:office`,
    damage: ctx.damage, burnt: ctx.burnt, facing: -1, bays: 5,
  });
}
