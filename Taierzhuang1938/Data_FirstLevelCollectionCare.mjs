// 06 背坡伤员集结处的救护动作与配对（docs/Data_CollectionCare20260927.md）。纯数据，无 three。
//
// 动作是 Blender 烘的作者动作（_import/Script_CollectionCareClips.py，经 Script_CollectionCareBake.py 走开场那套
// 逐帧解算），落在 Animation/CollectionCare/。配对数字（医护跪在伤员哪一侧、离多远）烘焙时就写进了医护的手的
// 目标点，所以这里的 COLLECTION_CARE_PAIRS 必须与动作库清单的 stages 一致 —— Script_FirstLevelCollectionCareTest 对账。

export const COLLECTION_CARE_ANIMATION = Object.freeze({
  base: "./Animation/CollectionCare/",
  manifest: "Data_CollectionCareAnimation.json",
  version: "20260927CollectionCareV1",
});

/** 伤员躺在草上：挣扎（没人管）/ 接受包扎（身边跪一个医护）。 */
export const COLLECTION_CARE_CLIPS = Object.freeze({
  writhe: "CareLieWrithe",
  treated: "CareLieTreated",
  zhouRecline: "CareZhouRecline",
  zhouWince: "CareZhouWince",
});

/**
 * 医护相对伤员的站位（伤员自己的演员坐标系：+x 他的右手、−z 朝他的脚，米）与朝向（伤员 yaw + yawDeg）。
 *   bandage：跪在他左侧、与左大腿齐平，给大腿缠绷带；
 *   press  ：跪在他右侧、与右胸齐平，双手按住敷料。
 */
export const COLLECTION_CARE_PAIRS = Object.freeze({
  bandage: Object.freeze({ clip: "CareMedicBandage", patientClip: "CareLieTreated", x: -0.40, z: -0.24, yawDeg: -90 }),
  press: Object.freeze({ clip: "CareMedicPress", patientClip: "CareLieTreated", x: 0.42, z: 0.36, yawDeg: 90 }),
});

/** 老周靠墙半躺：根节点离身后墙面的距离（米），与动作库 stages.recline.wallBehindM 同一个数。 */
export const COLLECTION_CARE_RECLINE_WALL_M = 0.43;

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
