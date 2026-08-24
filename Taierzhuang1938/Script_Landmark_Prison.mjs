// 监狱 + 看守所（城防示意图东北隅）。工作包 A1 专属文件。
// 契约见 Script_LandmarkRegistry.mjs 头注。当前为白盒桩：通用四合院占位，
// A1 要做成：围墙高院（高于民居院墙一档）、岗楼、铁窗（复用 WindowLattice tzm 件思路）、
// 放风院、重门。尺寸只许用 f.w/f.d 推导，绝对高度等新推定数报给主会话进 PRESUMED。

import { AddCompound } from "./Script_World.mjs";

export function BuildPrison(host, f, ctx) {
  AddCompound(host.sink, {
    x: f.x, z: f.z, ry: ctx.ry, width: f.w, depth: f.d,
    seed: `map:${f.id}`, damage: ctx.damage, burnt: ctx.burnt,
  });
}

export function BuildDetention(host, f, ctx) {
  AddCompound(host.sink, {
    x: f.x, z: f.z, ry: ctx.ry, width: f.w, depth: f.d,
    seed: `map:${f.id}`, damage: ctx.damage, burnt: ctx.burnt,
  });
}
