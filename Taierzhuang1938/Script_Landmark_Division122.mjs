// 第122师师部（西关，濠外、西关大街北侧）。工作包 B4 专属文件。
// 契约见 Script_LandmarkRegistry.mjs 头注。桩为院子 + 办公翼占位。
// B4 要做成：与城内师部同族的指挥部院（番号牌换第122师）+ 西关大街沿街铺面
// （路面数据 = WEST_SUBURB.westStreet，在本文件内自建土路与铺面，不改 outfield）。
// f = WEST_SUBURB.division122（w40 d32）。

import { AddCompound } from "./Script_World.mjs";

export function BuildDivision122(host, f, ctx) {
  AddCompound(host.sink, {
    x: f.x, z: f.z, ry: ctx.ry ?? 0, width: f.w, depth: f.d,
    seed: "west:division122", damage: ctx.damage ?? 0.16, burnt: ctx.burnt,
  });
  host.AddFeatureRoom({ x: f.x, z: f.z }, ctx.ry ?? 0, 0, 0, f.w * 0.42, f.d * 0.2, {
    eaveY: 3.2, ridgeY: 5.0, seed: "west:division122:office",
    damage: ctx.damage ?? 0.16, burnt: ctx.burnt, facing: -1, bays: 5,
  });
}
