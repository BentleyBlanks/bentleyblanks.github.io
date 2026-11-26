// 通用车辆车辙真几何系统规则与数据门禁（纯 Node、零 three、零浏览器，毫秒级）。
// 覆盖：Data_VehicleTracks 纯 JSON 契约、车型别名解析、五类截面数学、稀疏 3 m 瓦片高度场、
// 交叉碾压泥棱不填平旧槽、未激活边界锁零（0 mm 接缝）、静态样条编译与场景校验。

import assert from "node:assert/strict";
import {
  VEHICLE_TRACK_GEOMETRY as GEO,
  VEHICLE_TRACK_SURFACE as SURF,
  VEHICLE_TRACK_PROFILES as PROFILES,
  VEHICLE_TRACK_ALIASES as ALIASES,
} from "./Data_VehicleTracks.mjs";
import {
  VehicleTrackGeometryTierOf,
  ResolveVehicleTrackProfile,
  SceneVehicleTrackIssues,
  NormalizeTrackPoints,
  EvaluateRutCrossSection,
  CombineRutHeightOffset,
  VehicleTrackField,
  CompileStaticVehicleTrack,
} from "./Script_VehicleTrackField.mjs";
import { TERRAIN_TRAIL_VEHICLES } from "./Data_Tuning_TerrainTrails.mjs";

let checks = 0;
const Check = (ok, msg) => { assert.ok(ok, msg); checks++; };

// 1. 纯 JSON 数据与别名解析
Check(JSON.parse(JSON.stringify(GEO)).tileSizeM === 3, "VEHICLE_TRACK_GEOMETRY 可无损 JSON 化且瓦片为 3.0 m");
Check(JSON.parse(JSON.stringify(SURF)).rutDepthM > 0.1, "VEHICLE_TRACK_SURFACE 可无损 JSON 化");
for (const id of ["type89Tank", "type94Tankette", "donkeyCart", "oxCart", "type94Truck"]) {
  const p = ResolveVehicleTrackProfile(id);
  Check(p && p.id === id && Array.isArray(p.contactors) && p.contactors.length >= 2, `车型 ${id} 完整有效`);
}
for (const [alias, target] of Object.entries(ALIASES)) {
  Check(ResolveVehicleTrackProfile(alias)?.id === target, `别名 ${alias} -> ${target}`);
}
const legacy = ResolveVehicleTrackProfile(TERRAIN_TRAIL_VEHICLES.type89);
Check(legacy && legacy.contactors.length === 2 && legacy.contactors[0].widthM === TERRAIN_TRAIL_VEHICLES.type89.trackWidthM,
  "兼容旧版 TERRAIN_TRAIL_VEHICLES.type89");
for (const q of ["low", "medium", "high", "ultra"]) {
  const tier = VehicleTrackGeometryTierOf(q);
  Check(tier && tier.cells >= 24 && Math.abs((GEO.tileSizeM / tier.cells) * tier.cells - GEO.tileSizeM) < 1e-9, `画质档 ${q} 格距精确整除瓦片`);
}

// 2. 截面数学：槽心下凹、外沿挤泥棱、越界归零
{
  const tankTrack = PROFILES.type89Tank.contactors[0];
  const [dCenter, rCenter] = EvaluateRutCrossSection(0, 0.0, 1.0, 2.0, tankTrack);
  const [dRim, rRim] = EvaluateRutCrossSection(tankTrack.widthM * 0.5 + tankTrack.rimWidthM * 0.35, 0.0, 1.0, 2.0, tankTrack);
  const [dOut, rOut] = EvaluateRutCrossSection(tankTrack.widthM * 0.5 + tankTrack.rimWidthM + 0.01, 0.0, 1.0, 2.0, tankTrack);
  Check(dCenter > 0.7 && rCenter === 0, `坦克槽中心深凹无泥棱（d=${dCenter.toFixed(3)}, r=${rCenter.toFixed(3)}）`);
  Check(dRim === 0 && rRim > 0.35, `坦克槽外侧出现显著挤泥棱（r=${rRim.toFixed(3)}）`);
  Check(dOut === 0 && rOut === 0, "超出槽宽+泥棱宽外精确归零");

  // 驴车铁轮：超窄 6.8 cm 却能切出深锐槽
  const wheel = PROFILES.donkeyCart.contactors[0];
  const [wd0] = EvaluateRutCrossSection(0, 0, 0, 0, wheel);
  const [wdEdge] = EvaluateRutCrossSection(wheel.widthM * 0.5 + 0.005, 0, 0, 0, wheel);
  Check(wd0 > 0.85 && wdEdge === 0, `驴车铁轮窄槽锐利（中心 ${wd0.toFixed(3)}, 槽外 ${wdEdge}）`);

  // 合成偏移：泥棱在深槽处被彻底抑制，确保交叉碾压不填旧槽
  const pureRim = CombineRutHeightOffset(0, 0.04);
  const deepWithRim = CombineRutHeightOffset(0.09, 0.04);
  Check(pureRim > 0.035 && Math.abs(deepWithRim + 0.09) < 1e-6, `深槽处泥棱被压制（纯棱 ${pureRim.toFixed(3)}, 交叉处 ${deepWithRim.toFixed(3)}）`);
}

// 3. 稀疏高度场：真实下凹 + 泥棱隆起 + 重复碾压加深封顶 + 交叉不填旧槽 + 接缝锁零
{
  const field = new VehicleTrackField({
    BaseHeight: (x, z) => 0.1 * Math.sin(x * 0.1),
    bounds: { minX: -30, maxX: 30, minZ: -30, maxZ: 30 },
    quality: "high",
  });
  const tankL = PROFILES.type89Tank.contactors[0];
  // 沿 Z 轴压出一条长 8 m 履带槽（x = 0）
  const changed1 = field.ImprintSegment({ x: 0, z: -4 }, { x: 0, z: 4 }, tankL, { softness: 1, depthScale: 1 });
  Check(changed1 > 100, `单段 8 m 坦克履带压变顶点数 ${changed1}`);
  const d1 = field.DepthAt(0, 0);
  const dShoulder = field.DepthAt(0.0625, 0);
  const offCenter1 = field.OffsetAt(0, 0);
  const offShoulder = field.OffsetAt(0.0625, 0);
  const offRim = field.OffsetAt(tankL.widthM * 0.5 + tankL.rimWidthM * 0.35, 0);
  Check(d1 > 0.085 && offCenter1 < -0.085 && dShoulder > 0.095 && offShoulder < -0.095,
    `坦克单次碾压真实下凹（中心 ${(-offCenter1 * 100).toFixed(1)} cm / 履带肩部 ${(-offShoulder * 100).toFixed(1)} cm）`);
  Check(offRim > 0.015, `坦克槽旁挤出真实隆起泥棱 +${(offRim * 100).toFixed(1)} cm`);

  // 同一轨迹二次碾压加深，但绝不突破 maxDepthM
  field.ImprintSegment({ x: 0, z: -4 }, { x: 0, z: 4 }, tankL, { softness: 1, depthScale: 1 });
  const d2 = field.DepthAt(0, 0);
  Check(d2 > d1 + 0.004 && d2 <= GEO.maxDepthM + 1e-6, `二次碾压柔和加深且封顶（${(d1 * 100).toFixed(1)} -> ${(d2 * 100).toFixed(1)} cm）`);

  // 驴车正交斜穿（沿 X 轴 z = 0）：交点仍保持深凹，驴车泥棱不会填平坦克槽
  const wheel = PROFILES.donkeyCart.contactors[0];
  field.ImprintSegment({ x: -4, z: 0 }, { x: 4, z: 0 }, wheel, { softness: 1, depthScale: 1 });
  const offCross = field.OffsetAt(0, 0);
  const offWheelOnly = field.OffsetAt(2.5, 0);
  Check(offCross <= offCenter1, `交叉交点保持深凹不被泥棱填平（${(offCross * 100).toFixed(1)} cm）`);
  Check(offWheelOnly < -0.055, `驴车 6.8 cm 铁轮独立下凹 ${(offWheelOnly * 100).toFixed(1)} cm`);

  // DirtyBox 局部脏矩形与接缝锁零
  const dirty = field.TakeDirty();
  Check(dirty.length >= 4, `激活了 ${dirty.length} 块稀疏 3 m 瓦片`);
  Check(field.TakeDirty().length === 0, "TakeDirty 后脏列表清空");
  // 未激活边缘顶点高度偏移必须严格为 0
  const anyEdgeTile = dirty.find((t) => !field.HasTile(t.tx + 1, t.tz));
  assert.ok(anyEdgeTile, "存在紧邻未激活粗地形的边缘瓦片");
  const hw = field.cells + 3;
  const hBuf = new Float32Array(hw * hw);
  const oBuf = new Float32Array(hw * hw);
  field.FillTile(anyEdgeTile.tx, anyEdgeTile.tz, 1, hBuf, oBuf);
  let maxBorderLeak = 0;
  for (let vz = 0; vz <= field.cells; vz++) {
    const off = oBuf[(vz + 1) * hw + (field.cells + 1)];
    maxBorderLeak = Math.max(maxBorderLeak, Math.abs(off));
  }
  Check(maxBorderLeak === 0, `边缘紧邻未激活瓦片的一侧偏移严格锁零（max=${maxBorderLeak}）`);
}

// 4. 静态样条编译与场景校验
{
  const okErrors = [];
  const specs = [
    { id: "T1", profile: "type89Tank", passes: 2, points: [[0, 0], [5, 5], [10, 6]] },
    { id: "D1", profile: "donkeyCart", hooves: true, points: [[0, 2], [6, 2], [10, 4]] },
  ];
  SceneVehicleTrackIssues(specs, okErrors);
  Check(okErrors.length === 0, `合法 vehicleTracks 无校验错误：${okErrors.join("；")}`);

  const badErrors = [];
  SceneVehicleTrackIssues([
    { id: "Bad1", profile: "unknownCar", points: [[0, 0]] },
    { id: "Bad1", profile: "donkeyCart", passes: 99, points: [[0, 0], [1, 1]] },
  ], badErrors);
  Check(badErrors.length >= 4, `非法 vehicleTracks 检出全部错误（${badErrors.length} 条）`);

  const compiledTank = CompileStaticVehicleTrack(specs[0]);
  const compiledDonkey = CompileStaticVehicleTrack(specs[1]);
  Check(compiledTank.segments.length > 40 && compiledTank.hooves.length === 0 && compiledTank.stamps.length > 40,
    `八九式静态样条编译：${compiledTank.segments.length} 段 / ${compiledTank.stamps.length} 持久印章`);
  Check(compiledDonkey.segments.length > 40 && compiledDonkey.hooves.length >= 30 && compiledDonkey.stamps.every((s) => s.persistent),
    `驴车静态样条编译：${compiledDonkey.segments.length} 轮段 / ${compiledDonkey.hooves.length} 蹄印 / 全部持久`);
  Check(NormalizeTrackPoints([[0, 0], [0, 0], { x: 2, z: 3 }]).length === 2, "NormalizeTrackPoints 去重零长点并兼容对象坐标");
}

console.log(`[vehicleTracks] 通用车辙规则与真几何高度场门禁：${checks} 条全部通过`);
