// 警备队 + 警察所（城防示意图北城）。工作包 A2 专属文件。
// 契约见 Script_LandmarkRegistry.mjs 头注。
// BuildPolice 目前复刻旧 roomBlock 分支（临街正房 + 较矮后翼），视觉与旧版一致；
// A2 要做成：制式机关院（门岗、旗杆、告示墙、operations 房），警备队与警察所同族不同规格。

import { AddCompound, AddRoomBlock } from "./Script_World.mjs";

export function BuildGarrison(host, f, ctx) {
  AddCompound(host.sink, {
    x: f.x, z: f.z, ry: ctx.ry, width: f.w, depth: f.d,
    seed: `map:${f.id}`, damage: ctx.damage, burnt: ctx.burnt,
  });
}

export function BuildPolice(host, f, ctx) {
  AddRoomBlock(host.sink, {
    x: f.x, z: f.z, ry: ctx.ry, width: f.w, depth: f.d,
    eaveY: 3.0, ridgeY: 4.8, seed: `map:${f.id}`,
    damage: ctx.damage, burnt: ctx.burnt, facing: 1, bays: Math.max(2, Math.round(f.w / 10)),
  });
  // 警署有一条较矮的后翼，正面保留连续街墙（沿旧版）。
  host.AddFeatureRoom(f, ctx.ry, 0, -f.d * 0.27, f.w * 0.48, f.d * 0.18, {
    eaveY: 2.6, ridgeY: 3.9, seed: `map:${f.id}:rearWing`,
    damage: ctx.damage, burnt: ctx.burnt, facing: -1, bays: 3,
  });
}
