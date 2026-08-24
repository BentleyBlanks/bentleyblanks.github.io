// 西关电灯厂 —— 烟囱是西关天际线的关键剪影，在西城门楼直瞄射程内。工作包 B2 专属文件。
// 契约见 Script_LandmarkRegistry.mjs 头注。当前复刻旧 BuildOutskirts 的剪影 + 烟囱，
// B2 要做成：锅炉房 / 机器房两跨厂房（清水砖、高侧窗）、变电小院、煤堆、
// 烟囱基座与检修爬梯；夜景灯光锚点位置报给主会话。
// f = WEST_SUBURB.powerPlant（w30 d18 chimneyH22）。

import * as THREE from "three";
import { MakeBox, PlaceGeometry, TILE_METERS, BRICK_UV_GRID } from "./Script_Geo.mjs";

export function BuildPowerPlant(host, f, ctx) {
  const y = host.OuterHeight(f.x, f.z);
  host.farSink.Add("HouseBrick", PlaceGeometry(
    MakeBox(f.w, 7.5, f.d, TILE_METERS.brick, "powerPlant", BRICK_UV_GRID),
    { x: f.x, y: y + 3.75, z: f.z }));
  host.farSink.Add("RoofTile", PlaceGeometry(
    MakeBox(f.w + 1, 0.7, f.d + 1, TILE_METERS.roof, "powerPlantRoof"),
    { x: f.x, y: y + 7.8, z: f.z }));
  const chimney = new THREE.CylinderGeometry(0.9, 1.7, f.chimneyH, 10);
  const uv = chimney.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * f.chimneyH / 1.2);
  host.sink.Add("HouseBrick", PlaceGeometry(chimney,
    { x: f.x + f.w * 0.36, y: y + f.chimneyH / 2, z: f.z - f.d * 0.3 }));
  void ctx;
}
