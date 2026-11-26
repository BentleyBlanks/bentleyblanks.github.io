// 车辆车辙测试场场地（继承 FirstLevelWhiteboxField，复用正式分层地表、GPU 痕迹靶与真 3D 车辙高度场）。
import { FirstLevelWhiteboxField } from "./Script_FirstLevelWhiteboxField.mjs";
import { T } from "./Script_Text.mjs";
import { ValueNoise2 } from "./Script_Noise.mjs";
import {
  VEHICLE_TRACK_RANGE_ID,
  VEHICLE_TRACK_RANGE_WORLD,
  VEHICLE_TRACK_RANGE_CAMERA_FAR,
  VEHICLE_TRACK_RANGE_STATIONS,
  VEHICLE_TRACK_RANGE_ZONES as ZONES,
} from "./Data_VehicleTrackRange.mjs";
import { VEHICLE_TRACK_GEOMETRY as GEO } from "./Data_VehicleTracks.mjs";

const Clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const Smooth = (a, b, v) => {
  const t = Clamp01((v - a) / Math.max(1e-6, b - a));
  return t * t * (3 - 2 * t);
};

function BoxMask(x, z, box, organicM = 0) {
  let wx = x, wz = z;
  if (organicM > 0) {
    wx += (ValueNoise2(x * 0.14 + 3.1, z * 0.14 - 1.7, 2041) - 0.5) * 2 * organicM;
    wz += (ValueNoise2(x * 0.14 - 5.3, z * 0.14 + 4.9, 6133) - 0.5) * 2 * organicM;
  }
  const dx = Math.max(box.minX - wx, wx - box.maxX, 0);
  const dz = Math.max(box.minZ - wz, wz - box.maxZ, 0);
  return 1 - Smooth(0, (box.featherM || 1.5) + organicM * 0.5, Math.hypot(dx, dz));
}

/**
 * 为车辙测试场提供明确的三分区地表权重与土壤软硬度：
 *   · 中段湿泥带（SpoilEarth 翻土湿泥）：软度 1.28×，深车辙优先汪水；
 *   · 东侧压实车道（CartTrack）：软度 0.68×，压实硬土反照率对比；
 *   · 其余松软田土（FieldSoil）：软度 1.0×，清晰呈现梯形槽壁与挤泥棱。
 */
export function DecorateVehicleTrackRangeLayout(layout) {
  const baseSurface = layout.SampleGroundSurface;
  const SampleGroundSurface = (x, z, outRgb, outLayers) => {
    const mud = BoxMask(x, z, ZONES.mudStrip, 2.8);
    const road = BoxMask(x, z, ZONES.hardRoad, 1.8);
    if (baseSurface) baseSurface(x, z, outRgb, outLayers);
    else { outRgb[0] = 1; outRgb[1] = 1; outRgb[2] = 1; }
    // 叠加分区色偏：湿泥带略深略润，压实车道略暖浅
    const mudTint = 1 - 0.16 * mud;
    const roadTint = 1 + 0.06 * road;
    outRgb[0] = Math.min(1, outRgb[0] * mudTint * roadTint);
    outRgb[1] = Math.min(1, outRgb[1] * (1 - 0.18 * mud) * (1 + 0.04 * road));
    outRgb[2] = Math.min(1, outRgb[2] * (1 - 0.2 * mud));
    // layers: [0] CartTrack, [1] SpoilEarth(湿泥), [2] DryStubble, [3] rutCoord(1=关闭旧解析车辙)
    outLayers[0] = Clamp01(road * 0.88);
    outLayers[1] = Clamp01(mud * 0.92 * (1 - road * 0.5));
    outLayers[2] = Clamp01((1 - mud) * (1 - road) * 0.25);
    outLayers[3] = 1;
    return outRgb;
  };
  const SampleTrackSoftness = (x, z) => {
    const mud = BoxMask(x, z, ZONES.mudStrip, 2.8);
    const road = BoxMask(x, z, ZONES.hardRoad, 1.8);
    const soft = GEO.soilSoftness[0] * (1 - mud) * (1 - road)
      + GEO.soilSoftness[3] * GEO.mudZoneMultiplier * mud * (1 - road * 0.4)
      + GEO.soilSoftness[1] * road;
    return Math.max(0.55, soft);
  };
  return {
    ...layout,
    vehicleTracksEnabled: true,
    SampleGroundSurface,
    SampleTrackSoftness,
  };
}

export class VehicleTrackRangeField extends FirstLevelWhiteboxField {
  constructor(scene, library, options = {}) {
    super(scene, library, {
      bounds: VEHICLE_TRACK_RANGE_WORLD,
      zones: VEHICLE_TRACK_RANGE_STATIONS,
      levelId: VEHICLE_TRACK_RANGE_ID,
      ...options,
    });
    this.cameraFar = VEHICLE_TRACK_RANGE_CAMERA_FAR;
    this.worldLimits = VEHICLE_TRACK_RANGE_WORLD;
  }

  /** 动态调整车辙测试场地形的湿润积水系数（0.2 干土 .. 2.5 雨后积水）。 */
  SetTerrainWetness(value) {
    const mat = this.materials.get(this.layout.ground?.semantic || "ground");
    const u = mat?.userData?.terrainUniforms?.uTerrainWetness
      || mat?.userData?.shader?.uniforms?.uTerrainWetness;
    if (u) { u.value = value; return true; }
    return false;
  }

  *BuildSteps() {
    for (const step of super.BuildSteps()) yield step;
    yield { label: T("tracks.build.ready"), progress: 1 };
  }
}

export default VehicleTrackRangeField;
