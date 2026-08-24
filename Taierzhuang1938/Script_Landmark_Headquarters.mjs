// 师部 / 团部（hq）与 营连驻地（billet）指挥部套件。工作包 A5 专属文件。
// 契约见 Script_LandmarkRegistry.mjs 头注。
// 当前复刻旧 compound+办公翼 / compound+库房翼 两个分支，视觉与旧版一致。
// A5 要做成：作战室翼、电话线入户、沙袋哨位、旗杆、番号木牌（挂 f.label），
// hq 与 billet 同族换牌不换骨。

import { AddCompound } from "./Script_World.mjs";

export function BuildHq(host, f, ctx) {
  AddCompound(host.sink, {
    x: f.x, z: f.z, ry: ctx.ry, width: f.w, depth: f.d,
    seed: `map:${f.id}`, damage: ctx.damage, burnt: ctx.burnt,
  });
  // 师部/团部读作“院墙里的办公、库房、厢房层级”，而不是放大版民居（沿旧版）。
  host.AddFeatureRoom(f, ctx.ry, 0, 0, f.w * 0.42, f.d * 0.18, {
    eaveY: 3.2, ridgeY: 5.0, seed: `map:${f.id}:office`,
    damage: ctx.damage, burnt: ctx.burnt, facing: -1, bays: 5,
  });
}

export function BuildBillet(host, f, ctx) {
  AddCompound(host.sink, {
    x: f.x, z: f.z, ry: ctx.ry, width: f.w, depth: f.d,
    seed: `map:${f.id}`, damage: ctx.damage, burnt: ctx.burnt,
  });
  host.AddFeatureRoom(f, ctx.ry, 0, 0, f.w * 0.42, f.d * 0.18, {
    eaveY: 3.2, ridgeY: 5.0, seed: `map:${f.id}:office`,
    damage: ctx.damage, burnt: ctx.burnt, facing: -1, bays: 5,
  });
  // 两侧库房翼（沿旧版 /Compound727|SpecialCompound/ 分支）。
  for (const side of [-1, 1]) {
    host.AddFeatureRoom(f, ctx.ry, side * f.w * 0.27, 0, f.d * 0.34, f.w * 0.14, {
      eaveY: 2.7, ridgeY: 4.1, seed: `map:${f.id}:store${side}`,
      damage: ctx.damage, burnt: ctx.burnt, facing: side, bays: 3,
    });
  }
}
