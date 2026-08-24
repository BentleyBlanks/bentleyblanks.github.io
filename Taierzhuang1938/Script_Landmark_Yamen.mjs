// 县公署（旧县衙，城内唯一有实物参照的建筑）。工作包 A3 专属文件。
// 契约见 Script_LandmarkRegistry.mjs 头注。当前复刻旧 yamen 分支（AddYamen），
// A3 要升级到公署规格：照壁、仪门、大堂、六房；注意 2007 年后复建的仿古细部不能照抄。

import { AddYamen } from "./Script_World.mjs";

export function BuildYamen(host, f, ctx) {
  AddYamen(host.sink, {
    x: f.x, z: f.z, ry: ctx.ry, w: f.w, d: f.d, seed: "yamen", damage: 0.3,
  });
  void ctx;
}
