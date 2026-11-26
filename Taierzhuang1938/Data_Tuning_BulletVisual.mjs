// 战车机枪（Script_Main.FireVehicleBullet）的弹道光束与硬面火星。纯数据，零 three。
//
// 2026-09-22 用户：战车射击要让玩家「看到清晰的一条子弹的光束」，以及「子弹在墙上
// 飞溅的火花」。改之前实拍（1600×900，high）：
//   · 曳光是 3.5 cm 粗、14 m 长、跟着速度跑的拉伸粒子 —— 二十米外不到一个像素，
//     迎面打来还会沿视线塌成一个点，整段弹道在画面上什么都没有；
//   · 白盒墙（whiteboxWall）没进 SURFACE_BY_TAG，弹着落回 dirt，墙上只冒一团土灰。
// 这里只管**表现**：不改弹速、散布、伤害与命中判定（那些在 Data_Weapons /
// Data_Tuning_FirstLevel 的 tankMg*）。
export const VEHICLE_TRACER = Object.freeze({
  // 曳光弹头的表现飞行速度（米/秒）。真弹速七百多米每秒，三十米两帧就到；
  // 430 m/s 时三十米飞约 4.2 帧，既保留机枪弹流的凌厉高速感，又让肉眼跟得住一颗颗飞过的灼热弹头。
  speedMps: 430,
  // 弹头曳光药柱的运动模糊亮段长度（米）：约 4.8 m（略短于单帧 ~7.2 m 位移），
  // 配合梭形气动锥尖、针尖白热药芯与橙红渐变彗尾，读作真实高速燃烧的曳光弹头。
  headLengthM: 4.8,
  // 弹尾灼热余烬与细碎火星的冷却时间常数（秒）：0.018 s 迅速收细冷却，
  // 只紧贴弹头后方一小段闪烁炽红余烬，杜绝贯穿全场的橙色实心激光管。
  glowS: 0.018,
  // 灼热余烬尾迹相对弹头的峰值亮度。
  trailOpacity: 0.34,
  // 近处的物理半宽（米）：外沿留给柔和大气光学散射晕，真实白热弹芯收在中心极窄处。
  halfWidthM: 0.05,
  // 远处的像素保底半宽（含外层柔和大气散射晕；白热芯与炽橙鞘仅占中心 ~40%，因此保底给 3.6 px
  // 才能保证 35–50 m 外弹芯不落入亚像素间隙而闪烁断线）。
  minHalfWidthPx: 3.6,
  // 近处的像素上限半宽（含最外缘柔晕；贴脸掠过时中心亮芯仅 ~3–4 px 宽，绝不胀成光棒）。
  maxHalfWidthPx: 5.5,
  // 枪口引燃淡入长度（米）：真实曳光药离枪口约 1 m 左右才完全燃亮，与枪口焰自然衔接。
  muzzleFadeM: 1.35,
  // 真实镁/磷曳光弹的受光细烟丝（beamSmoke，NormalBlending 受日光/天光与前向散射照明）：
  // 弹头掠过后凝出轻薄淡烟，迅速舒展、卷曲、断成缕状轻雾消散，白昼自然交代弹道而不像灰色拉线。
  smokeLifeS: 0.46,
  smokeOpacity: 0.19,
  smokeWidthStartM: 0.032,
  smokeWidthEndM: 0.22,
  smokeMinHalfWidthPx: 1.4,
  smokeMaxHalfWidthPx: 14.0,
  smokeDriftMps: 0.42,
});

// 子弹打在硬面（砖、金属）上的火星。只挂在战车机枪这一条链上（FireVehicleBullet
// 传 hardSparks）；步枪打砖墙仍按 SURFACE_PROFILES 的 sparks: 0 —— 铅芯步枪弹打青砖
// 很少见火，满场步枪都冒火星就成了烟花。
export const HARD_SURFACE_SPARKS = Object.freeze({
  // 哪几种弹着表面出火星（Script_Main.ImpactSurface 的值域）。土、沙包、木头不出；
  // 第一关白盒里就是墙体（cover / structure 等）与铁件；换成沙袋模型的那几段标成 sandbag。
  surfaces: Object.freeze(["brick", "metal"]),
  count: 16,
  // 初速（米每秒）。一半顺着反弹方向溅出去，一半贴着墙面法线散开。
  speedMps: Object.freeze([4, 12]),
  // 溅射方向里「顺着子弹反弹方向」所占的比重；0 = 全沿墙面法线，1 = 全沿镜面反弹。
  reflectWeight: 0.55,
  // 锥角散布（与 Script_Vfx._ConeVelocity 的 spread 同一口径）。
  spread: 0.85,
  lifeS: Object.freeze([0.18, 0.5]),
  // 拉伸长度（米）与半宽（米）。步枪打铁板那一档是 0.15–0.4 / 0.012。
  lengthM: Object.freeze([0.3, 0.8]),
  halfWidthM: 0.016,
  // 火星也给像素保底：二十米外一颗 1.6 cm 的火星本来连一个像素都占不满。
  minHalfWidthPx: 1.3,
  // 弹着点那一下的亮闪（星芒，跟枪口焰同一个池）：尺寸（米）与寿命（秒）。
  flashSizeM: 0.3,
  flashLifeS: 0.05,
});
