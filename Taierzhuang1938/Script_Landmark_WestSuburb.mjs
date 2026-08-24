// 西关：通讯队（communications）+ 交易所（exchange）。工作包 B3 专属文件。
// 契约见 Script_LandmarkRegistry.mjs 头注。两处在旧版里「有数据、无消费者」，
// 桩先落通用院子占位（脚下的地已由 OUTER_PADS 找平到 y=0）。
// B3 要做成：通讯队院（天线杆阵 / 架空线入院，参照 Script_World.AddPole 的做法）、
// 交易所（临街门脸 + 拍卖堂）。f 分别 = WEST_SUBURB.communications / .exchange。

import { AddCompound } from "./Script_World.mjs";

export function BuildCommunications(host, f, ctx) {
  AddCompound(host.sink, {
    x: f.x, z: f.z, ry: ctx.ry ?? 0, width: f.w, depth: f.d,
    seed: "west:communications", damage: ctx.damage ?? 0.2, burnt: ctx.burnt,
  });
}

export function BuildExchange(host, f, ctx) {
  AddCompound(host.sink, {
    x: f.x, z: f.z, ry: ctx.ry ?? 0, width: f.w, depth: f.d,
    seed: "west:exchange", damage: ctx.damage ?? 0.24, burnt: ctx.burnt,
  });
}
