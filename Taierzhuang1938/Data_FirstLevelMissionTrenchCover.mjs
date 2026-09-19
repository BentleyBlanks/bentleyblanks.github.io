// User 2026-09-13: staggered trench shelters; keep a continuous central walking lane.
const Station=(id,x,z,side)=>({id,x,z,side});
export const MISSION_TRENCH_COVER = Object.freeze({
  rally:[Station('RallyRight',-45,35,1),Station('RallyLeft',-45,31,-1)],
  approach:[Station('BreachLeft',-37,11,-1),Station('ReturnRight',-45,-3,1),Station('ShelterLeft',-45,-12,-1)],
  // 2026-09-20：03 的入口从车站方向换成后交通壕尽头（集结处 → 前沿），
  // 旧的 SupportRight/SupportLeft/FrontRight 三个站位落在再也没人走的那一段上，
  // 连同它们的掩体一起下线。剩下两个摆在新走法真正经过的两段上，仍然左右交替。
  // 2026-09-20：03 的入口从车站方向换成后交通壕尽头（集结处 → 前沿）。
  // SupportRight/SupportLeft/FrontRight 三个站位落在再也没人走的那一段上，
  // 连同它们的掩体一起下线。FrontLeft 是唯一还在新走法射界上的一个，留着。
  // 想在「集结处 → 前沿」那 46 m 上再加一处交替掩体，得空间包先挖出位置：
  // 直接把站位挪到沟线上会让掩体占掉 rearTrench 的 0.35 m 净空（实测翻红）。
  support:[Station('FrontLeft',-8,-106,-1)],
  wallOffsetM:1.65,wallWidthM:.9,wallDepthM:.6,wallHeightM:1.25,
  wingOffsetM:2.05,wingLengthM:4.1,wingDepthM:.3,
  watchYawRad:0,postOffsetM:1.45,postRearM:[1.15,2.85],
});
