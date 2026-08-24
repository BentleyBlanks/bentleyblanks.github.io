// 津浦路滕县站（1911 德建三等小站）。工作包 B1 专属文件。
// 契约见 Script_LandmarkRegistry.mjs 头注。当前复刻旧 BuildOutskirts 的三盒剪影，
// B1 要做成：可进入站房（单层局部两层、清水砖墙、石质窗套）+ 木构月台雨棚 + 站台边缘
// + 城西段津浦铁路（路基 / 枕木 / 双轨，参照 Script_TengxianOutfield.BuildRailway 的做法
// 在本文件内自建，不要去改 outfield）+ 臂板信号（tzm 饰件另走五步仪式）。
// f = WEST_SUBURB.station（w34 d12）；铁路数据 = WEST_SUBURB.railway（x=-480）。

import { MakeBox, PlaceGeometry, TILE_METERS, BRICK_UV_GRID } from "./Script_Geo.mjs";

export function BuildStation(host, f, ctx) {
  const y = host.OuterHeight(f.x, f.z);
  host.farSink.Add("HouseBrick", PlaceGeometry(
    MakeBox(f.w, 5.2, f.d, TILE_METERS.brick, "station", BRICK_UV_GRID),
    { x: f.x, y: y + 2.6, z: f.z }));
  host.farSink.Add("HouseBrick", PlaceGeometry(
    MakeBox(f.w * 0.3, 3.4, f.d, TILE_METERS.brick, "stationMid", BRICK_UV_GRID),
    { x: f.x, y: y + 6.9, z: f.z }));
  host.farSink.Add("RoofTile", PlaceGeometry(
    MakeBox(f.w + 1.6, 1.4, f.d + 1.8, TILE_METERS.roof, "stationRoof"),
    { x: f.x, y: y + 5.9, z: f.z }));
  void ctx;
}
