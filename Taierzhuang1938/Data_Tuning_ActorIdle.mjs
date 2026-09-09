// Data_Tuning_ActorIdle.mjs — 站立待机叠加层的表现旋钮。
// 纯数据：不 import three、不 import 规则代码、不含函数。口径见 docs/Data_TextAndTuning.md §4。
//
// 这些数不是随手给的，是照「一个背着枪站着等命令的人」写的：
//   · 呼吸约 12 次/分（站着等的人比静息再慢一点），起伏取胸腔而不是整个人上下弹；
//   · 重心倒换十几秒一个来回 —— 真人站久了才换脚，两三秒一换是坐立不安；
//   · 两个不同频率的正弦叠在一起，避免整排人像节拍器一样同步摆动
//     （单频 + 每人相位错开，站成一排时仍然看得出是同一条曲线）。
// 位移都是厘米级：脚由 IK 钉在 clip 摆好的位置上，骨盆挪得多了膝盖会明显打弯。

export const STAND_IDLE = Object.freeze({
  // 呼吸
  breathRateHz: 0.21,        // 约 4.8 s 一个呼吸周期
  breathRiseM: 0.008,        // 吸气时骨盆抬高（米）
  breathChestRad: 0.020,     // 胸腔前后起伏
  // 重心倒换
  shiftRateHz: 0.085,        // 约 12 s 一个来回
  shiftJitterHz: 0.037,      // 叠上去的第二个频率
  shiftM: 0.021,             // 骨盆左右位移（米）
  shiftLeanRad: 0.028,       // 承重那一侧的躯干侧倾
  // 扫视
  scanRateHz: 0.11,
  scanJitterHz: 0.043,
  headYawRad: 0.24,          // 左右张望
  headPitchRad: 0.045,
  headPitchRateHz: 0.09,
  chestYawRad: 0.05,         // 肩线跟着头轻微带一点
  // 站住时把 AdvanceFire 定在哪一帧（占 clip 时长的比例）。
  // 这条 clip 前 1.2 s 是「上前」的两步，后半段是站定据枪；定格只能取后半段，
  // 取在前半段的人会单脚悬空。实测 t≥1.4 s 之后双脚踝高与站距都不再变。
  advanceFireHold: 0.78,

  // 膝盖 IK 的极向量（角色空间，-Z 为正面）
  kneePole: Object.freeze({ x: 0.24, y: 0.5, z: -1 }),
});
