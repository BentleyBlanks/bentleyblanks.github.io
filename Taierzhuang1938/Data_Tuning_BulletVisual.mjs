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
  // 光束弹头的表现速度。真弹速七百多米每秒，四十米三帧就到 —— 照抄的话弹头只闪一下；
  // 与 Script_Vfx.Tracer 的 480 同一个思路，放慢一点让眼睛跟得上「从哪儿飞过来」。
  speedMps: 520,
  // 弹头亮段长度。一帧（1/60 s）弹头要走 8.7 m，亮段短于一帧位移时中间的空当由余辉补上，
  // 所以不必拉满一帧，6 m 读起来是「一颗飞着的弹」而不是一整根棍。
  headLengthM: 6,
  // 余辉时间常数（秒）：弹头掠过之后，那一段按 e^(−t/τ) 暗下去。
  // 0.07 s ≈ 三帧剩三成，整条线在画面上停留约「飞行时间 + 0.15 s」。
  glowS: 0.07,
  // 余辉相对弹头的亮度。低了只看得见弹头一个亮点，高了一梭子会把天空刷成一片网。
  trailOpacity: 0.85,
  // 近处的物理半宽（米）。离得近时它比像素保底宽，按真粗细画。
  halfWidthM: 0.03,
  // 远处的像素保底半宽。**这一条是「看得清」的关键**：宽度按每个顶点离相机的距离
  // 换算成像素下限，四十米外仍有三四个像素宽的一条线，不再细成一根头发。
  minHalfWidthPx: 2.0,
  // 近处的像素上限半宽：子弹贴着脸飞过去时，3 cm 的物理宽度能占三四十个像素，
  // 读起来是一根光棍而不是一发弹。压到五个像素，近失弹仍是屏幕上最粗最亮的那一条。
  maxHalfWidthPx: 5,
  // 枪口那一端淡入的长度（米）：光束不从枪管里硬生生地切出来，枪口焰盖住这一小段。
  muzzleFadeM: 1.2,
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
