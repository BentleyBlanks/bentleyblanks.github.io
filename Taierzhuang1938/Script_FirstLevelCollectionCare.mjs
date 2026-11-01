// Data_FirstLevelCollectionCare.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { COLLECTION_CARE_CLIPS, COLLECTION_CARE_PAIRS } from "./Data_FirstLevelCollectionCare.mjs";

/**
 * 这一位伤员的医护该跪在哪、朝哪（世界坐标）。纯几何：NPC 的 yaw 为 0 时脸朝 −Z，
 * 局部 (x, z) 转 yaw 后是 (x cos + z sin, −x sin + z cos)。
 */
export function CareMedicSpot(patient, pairId) {
  const pair = COLLECTION_CARE_PAIRS[pairId];
  if (!pair) return null;
  const yaw = patient.yaw ?? 0, c = Math.cos(yaw), s = Math.sin(yaw);
  return {
    x: patient.x + pair.x * c + pair.z * s,
    z: patient.z - pair.x * s + pair.z * c,
    yaw: yaw + pair.yawDeg * Math.PI / 180,
    clip: pair.clip,
  };
}

/** 伤员这一位播哪条：有医护配对的是「接受包扎」，没有的挣扎。 */
export function CarePatientClip(spot) {
  return spot.care && COLLECTION_CARE_PAIRS[spot.care] ? COLLECTION_CARE_PAIRS[spot.care].patientClip : COLLECTION_CARE_CLIPS.writhe;
}
