// 天主堂（church）+ 学校（school：书院小学 / 滕文中学旧址）。工作包 A7 专属文件。
// 契约见 Script_LandmarkRegistry.mjs 头注。
// 两个函数都复刻旧分支（AddChurch / 长教室 + 两翼操场院），视觉与旧版一致。
// A7 要做成：天主堂钟楼细化 + 尖券窗（窗花 tzm 件思路）；学校校门、操场、旗杆。
// church 的 f 来自 LANDMARKS（nave/towerH），school 的 f 来自 CITY_FEATURES（w/d）。

import { AddChurch, AddCompound } from "./Script_World.mjs";

export function BuildChurch(host, f, ctx) {
  AddChurch(host.sink, {
    x: f.x, z: f.z, ry: ctx.ry, nave: f.nave, towerH: f.towerH,
    seed: f.id, damage: 0.12,
  });
  void ctx;
}

export function BuildSchool(host, f, ctx) {
  AddCompound(host.sink, {
    x: f.x, z: f.z, ry: ctx.ry, width: f.w, depth: f.d,
    seed: `map:${f.id}:yard`, damage: ctx.damage, burnt: ctx.burnt,
  });
  // 学校是长教室 + 两翼围出的操场，不套用普通院落的一正两厢（沿旧版）。
  host.AddFeatureRoom(f, ctx.ry, 0, -f.d * 0.16, f.w * 0.72, f.d * 0.24, {
    eaveY: 3.2, ridgeY: 5.0, seed: `map:${f.id}:classroom`,
    damage: ctx.damage, burnt: ctx.burnt, facing: 1, bays: 5,
  });
  for (const side of [-1, 1]) {
    host.AddFeatureRoom(f, ctx.ry, side * f.w * 0.30, f.d * 0.12, f.d * 0.34, f.w * 0.12, {
      eaveY: 2.6, ridgeY: 3.9, seed: `map:${f.id}:wing${side}`,
      damage: ctx.damage, burnt: ctx.burnt, facing: side, bays: 3,
    });
  }
}
