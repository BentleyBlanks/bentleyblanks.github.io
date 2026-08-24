// 北关：坝墙（圩子）+ 圩门 + 北关大街 + 北庙。工作包 C2 专属文件。
// 契约见 Script_LandmarkRegistry.mjs 头注。桩只出一条坝墙剪影带缺口，
// C2 要做成：AddZhaiWall 规格的夯土坝墙（高 2.2 顶宽 0.5）+ 圩门门洞、
// 北关大街土路（自望阙门 -328 至坝墙）、北庙小院。
// spec = Data_Tengxian.NORTH_SUBURB 整块。

import { MakeBox, PlaceGeometry, TILE_METERS } from "./Script_Geo.mjs";

export function BuildNorthSuburb(host, spec, ctx) {
  const s = spec.stockade;
  // 圩门处断开的分段剪影
  const cuts = [s.fromX, ...s.gates.flatMap((g) => [g.x - g.width / 2, g.x + g.width / 2]), s.toX];
  for (let i = 0; i < cuts.length; i += 2) {
    const a = cuts[i], b = cuts[i + 1];
    if (b - a < 2) continue;
    const cx = (a + b) / 2;
    const y = host.OuterHeight(cx, s.z);
    host.farSink.Add("ZhaiEarth", PlaceGeometry(
      MakeBox(b - a, s.height, s.baseWidth, TILE_METERS.ground, `northStockade${i}`),
      { x: cx, y: y + s.height / 2, z: s.z }));
  }
  const t = spec.temple;
  const ty = host.OuterHeight(t.x, t.z);
  host.farSink.Add("HouseBrick", PlaceGeometry(
    MakeBox(t.w, 4.6, t.d, TILE_METERS.brick, "northTemple"),
    { x: t.x, y: ty + 2.3, z: t.z }));
  void ctx;
}
