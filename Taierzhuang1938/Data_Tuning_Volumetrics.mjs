// 《台儿庄：血战滕县》froxel 体积雾 / 体积光的数值表（纯数据，零 three 依赖 —— 契约 2）。
//
// 这张表只管「这一时段的空气长什么样」；「这台机器画多重」在
// `Data_Tuning_Graphics.QUALITY_PRESETS[...].volumetrics`（网格分档）。
// 两件事分开的理由与 SKY_PRESETS / QUALITY_PRESETS 的分工同源：混在一起的话
// 玩家把画质调低，夜战关的空气就跟着变。
//
// ## 与 SKY_PRESETS[...].fog 的关系：**继承，不复制**
// 密度、高度衰减、雾色、朝阳增益、上限全部**从 `fog` 块现读**（`MakeVolumetricParams`），
// 这里只写解析雾没有的那几项（相函数、单次散射反照率、烟尘噪声、覆盖距离、
// 局部点光比例）。复制一份 density 到这里的下场是改了天光预设、雾没跟着变。
//
// ## 校准锚点：体积雾在「反照率 1 + 各向同性 + 无遮挡 + 无噪声」时**逐比特等于今天的解析雾**
// 今天：`out = mix(color, fogCol, fog)`，`fog = clamp((1-exp(-d·ρ))·hFall, 0, max)`。
// 体积：`out = color·T + ∫σ_s·L·T(t)dt`。均匀介质、L = fogCol、albedo = 1 时
// 积分恰好等于 `fogCol·(1-T)`，而 `T = 1-fog` —— 两条式子同一个答案。
// 所以「体积雾」在本作里不是换了一套雾，而是**把同一套雾的散射项拆开按位置着色**：
// 有太阳照到的 froxel 多一份 HG 前向散射（光柱），被墙挡住的没有（光柱被切断）。
//
// ## 用户硬约束（历史定论「先别动雾」）：能见度只能变好，不能变差
// 七十米外能不能看见敌人由雾决定。为此有三道闸，缺一不可：
//   1. **噪声只做减法**（`density *= 1 - noiseAmount·fbm`，fbm∈[0,1]）——
//      最浓的 froxel 恰好等于基础密度，绝不会比今天更浓；
//   2. **densityScale ≤ 1**，逐预设算出来的（见下表每一行的注释）：
//      解析雾是 `(1-exp(-ρd))·hFall`（高度因子按**着色点**乘在整段上），
//      物理积分是 `exp(-∫ρ·hFall(y)ds)`，两者只在 y = fog.base 处相等，
//      眼高处物理式略浓。densityScale 就是把那点差补回来的系数；
//   3. **legacyTransmittance**（出厂 true）：apply 那一趟把**透过率**换成今天
//      那条解析式，只把**散射项**换成体积的。局部雾体（烟幕、炮击烟、热烟）
//      的额外光学厚度仍照常乘上去 —— 它们本来就该挡住视线。
//      于是「同一像素的雾不透明度 ≤ 今天」是**逐像素恒等式**，不是靠调参保证的。
// 关掉第 3 道闸（legacyTransmittance: false）走纯物理时，第 1、2 道仍保证
// 眼高 ~2.6 m 以内、70 m 处的透过率不低于今天。验收：`Script_VolumetricsTest.mjs`。

/**
 * froxel 网格分档。键与 `Data_Tuning_Graphics.QUALITY_PRESETS` 同名。
 *   x/y/z   froxel 数（x/y 在屏幕平面，z 沿视线按指数分布）
 *   tiles   2D 图集的切片平铺（tiles[0]*tiles[1] 必须 ≥ z；图集尺寸 = x*tiles[0] × y*tiles[1]）
 *
 * 为什么是 2D 图集而不是 Data3DTexture：WebGL2 的 FBO 一次只能挂 3D 纹理的**一层**，
 * 逐层 setRenderTarget 就是 z 次 draw call（high 档 64 次），而本作的瓶颈正是 CPU 提交。
 * 平铺成一张 2D 靶之后注入与积分各只要一次全屏 blit。
 *
 * low 档没有 froxel：合成 pass 的解析式高度雾继续用（fallback 路径永久保留）。
 */
export const VOLUMETRIC_GRIDS = {
  low: null,
  medium: { x: 120, y: 68, z: 48, tiles: [8, 6] },    // 图集 960 × 408，RGBA16F ≈ 3.1 MB
  high: { x: 160, y: 90, z: 64, tiles: [8, 8] },      // 图集 1280 × 720，RGBA16F ≈ 7.4 MB
  ultra: { x: 240, y: 135, z: 96, tiles: [12, 8] },   // 图集 2880 × 1080，RGBA16F ≈ 24.9 MB
};

/**
 * 时段无关的出厂值。每一项的语义：
 *
 *   near / far        froxel 覆盖的视深区间（米）。z 切片按指数分布：
 *                     depth(t) = near·(far/near)^t，t∈[0,1] —— 近处密、远处疏，
 *                     UE Volumetric Fog 与 Frostbite 都是这一条。
 *                     far 之外由 apply 那一趟按同一条高度雾解析式续上（无缝），
 *                     再远交给物理大气代理的 aerial perspective。
 *   densityScale      基础消光 σ0 = fog.density × 它（见抬头第 2 道闸）
 *   albedo            单次散射反照率。1.0 = 与今天的解析雾等能量；烟尘实测 0.85–0.95
 *   anisotropy        Henyey-Greenstein 的 g。0 = 各向同性，>0 前向散射（光柱来源）。
 *                     低太阳（dusk/dawn/burningStreet）用大 g：逆光时空气会「亮起来」。
 *                     阴天用小 g：没有方向性主光，大 g 只会在天空方向刷一片假光斑。
 *   ambientScale      各向同性项（天光/环境）相对解析雾雾色的比例。1.0 = 与今天等量
 *   sunScale          太阳项相对 fog.sunGain 的比例。1.0 = **正对太阳时峰值与今天相同**
 *                     （HG 已按 g 归一化到峰值 1，见 Script_PostVolumetrics 的 uSunGain）
 *   pointScale        局部点光（火、爆炸、照明弹、枪口）进雾的比例。
 *                     不是 1.0：点光的 intensity 是按 PBR 表面标定的（几十坎），
 *                     原样喂给雾会让一处火把整条街的空气烧成白色
 *   noiseAmount       烟尘团噪声幅度，**只减不加**（见抬头第 1 道闸）
 *   noiseScale        主八度频率（1/m）。0.018 ≈ 55 m 一个大团
 *   noiseDetail       第二八度频率（1/m）
 *   noiseWind         噪声场的漂移速度（m/s，世界坐标）。烟尘要在动，不然像贴纸
 *   noiseFar          噪声在这个距离淡出（米）。远景严格按基础密度走，
 *                     「七十米外看不看得见」那条线不受噪声影响
 *   skyScale          天空像素吃多少最远切片的雾。1.0 = 完整（地平线白化，
 *                     屋脊线与天之间不再有硬边）；0 = 退回今天的「天空不吃雾」
 *   reprojection      时域重投影的历史权重（0.9 = UE/Frostbite 缺省）
 *   fireSmoke         LightRig 火源自动挂的「热烟」密度（× 基础密度）。0 = 不挂
 *   fireSmokeRadius   热烟半径 = 火光 radius × 它
 *   legacyTransmittance  见抬头第 3 道闸
 */
export const VOLUMETRIC_DEFAULT = {
  near: 0.5,
  far: 260,
  densityScale: 1.0,
  albedo: 0.92,
  anisotropy: 0.45,
  ambientScale: 1.0,
  sunScale: 1.0,
  pointScale: 0.055,
  noiseAmount: 0.22,
  noiseScale: 0.018,
  noiseDetail: 0.075,
  noiseWind: [0.55, 0.05, 0.22],
  noiseFar: 95,
  skyScale: 1.0,
  reprojection: 0.9,
  fireSmoke: 0,
  fireSmokeRadius: 1.15,
  legacyTransmittance: true,
};

/**
 * 逐时段覆盖。键就是 `SKY_PRESETS` 的键名（Script_Sky.mjs），少一个不报错 ——
 * 没登记的预设吃 VOLUMETRIC_DEFAULT，而 default 全部由 `fog` 块推导，所以
 * 新增天光预设不接这张表也能跑（只是没有为它调过的相函数与烟尘量）。
 *
 * densityScale 那一栏的算法（`Script_VolumetricsTest` 会重算一遍对账）：
 *   s = -ln(T_analytic(70 m, y)) / (ρ·hFall(y)·(70 − near))，y = fog.base + 2.6 m
 * 即「物理积分在 70 m 处的透过率不低于今天」所允许的最大密度系数，向下取到 0.01。
 * 2.6 m 是站姿眼高 1.7 m 再留 0.9 m 余量（上了土坡、蹲在墙头的情况）。
 */
export const VOLUMETRIC_PRESETS = {
  // 白盒/测试档：fog.density = 0，体积雾等于不存在。留一行是为了让白盒也走同一条
  // 代码路径（不走 fallback），出问题能在最干净的场景里复现。
  testSceneDay: { densityScale: 1.0, noiseAmount: 0.0, sunScale: 0.0, skyScale: 0.0, far: 200 },
  weaponRangeDay: { densityScale: 1.0, noiseAmount: 0.0, sunScale: 0.0, skyScale: 0.0, far: 200 },
  p012WhiteboxDay: { densityScale: 1.0, noiseAmount: 0.0, sunScale: 0.0, skyScale: 0.0, far: 200 },
  // 关卡策划白盒：环境体块全白，空气里再加光柱会盖掉形体。只留很淡的一层。
  whiteboxDay: {
    densityScale: 0.99, albedo: 0.9, anisotropy: 0.25, sunScale: 0.4,
    noiseAmount: 0.08, skyScale: 0.35, far: 220,
  },
  // 完整场景编辑器的长视距白昼：1.6 km 总览，雾只做空气透视，噪声几乎关掉
  // （55 m 的团在这个尺度上会变成一片斑）。
  editorClear: {
    densityScale: 1.0, anisotropy: 0.35, noiseAmount: 0.08, noiseScale: 0.006,
    noiseFar: 260, skyScale: 0.5, far: 300, pointScale: 0.04,
  },
  // 黄昏 12°：逆光时整条街的空气都会亮起来，g 要大。街底全在阴影里 ——
  // 光柱只从屋脊与山墙的缺口打进来，这正是 SunShadowVisibility 要切出来的东西。
  dusk: {
    densityScale: 0.93, albedo: 0.94, anisotropy: 0.58, sunScale: 1.0,
    noiseAmount: 0.26, noiseWind: [0.75, 0.06, 0.30], far: 240, pointScale: 0.07,
  },
  // 硝烟遮日的午后 52°：太阳越过峡谷线，街上有一条晒地。光柱短、方向陡，
  // 主要看的是**檐口与门洞切出来的斜光带**，g 不用太大。
  smokyDay: {
    densityScale: 0.90, albedo: 0.92, anisotropy: 0.40, sunScale: 1.0,
    noiseAmount: 0.26, noiseScale: 0.020, noiseWind: [0.65, 0.05, 0.25], far: 280,
  },
  // 出川序章：车厢里往外看，60–2900 m 的田野与村舍要读得出。
  // fog.density 只有 0.0011，froxel 覆盖 300 m，之外由 apply 的解析尾段续上。
  // 噪声压到很小：这一场的空气本来就干净，加烟团等于给窗外糊上斑。
  chuchuanDay: {
    densityScale: 1.0, albedo: 0.94, anisotropy: 0.42, sunScale: 0.9,
    noiseAmount: 0.10, noiseScale: 0.008, noiseFar: 200, far: 300, skyScale: 0.45,
  },
  // 阴天：没有方向性主光，g 必须小。形体全靠 AO 与环境光，雾也只做各向同性的一层。
  overcast: {
    densityScale: 0.91, albedo: 0.95, anisotropy: 0.10, sunScale: 0.30,
    ambientScale: 1.05, noiseAmount: 0.30, noiseScale: 0.014, far: 240,
  },
  // 巷战：一半的天被火烧着。这一档是局部光进雾的主战场 ——
  // 着火的房子要在自己周围烧出一团亮的热烟，pointScale 与 fireSmoke 都要给足。
  burningStreet: {
    densityScale: 0.88, albedo: 0.90, anisotropy: 0.55, sunScale: 1.0,
    noiseAmount: 0.32, noiseScale: 0.024, noiseWind: [0.85, 0.12, 0.35],
    pointScale: 0.10, fireSmoke: 2.4, fireSmokeRadius: 1.25, far: 240,
  },
  // 夜：太阳（月）几乎不出力，空气的形状全靠照明弹与火。
  // 照明弹走 LightRig 的火源池（flicker:false），所以它在这里就是一盏 priority 高的点光 ——
  // 体积雾一接上，照明弹第一次真的在空中拖出一支光锥。
  night: {
    densityScale: 0.84, albedo: 0.88, anisotropy: 0.30, sunScale: 0.35,
    ambientScale: 1.0, pointScale: 0.18, noiseAmount: 0.28, noiseScale: 0.016,
    fireSmoke: 1.4, far: 220, skyScale: 0.55,
  },
  // 拂晓总反攻 11°：全场画面权重最高的一档。低太阳 + 街底冷影，
  // g 给到 0.58，斜射光柱穿过巷口是这一关的招牌画面。
  dawn: {
    densityScale: 0.92, albedo: 0.94, anisotropy: 0.58, sunScale: 1.0,
    noiseAmount: 0.24, noiseWind: [0.70, 0.06, 0.28], far: 260, pointScale: 0.08,
  },
};

/** 局部雾体（AddFogVolume）一次最多送进 GPU 几只。超出的按到相机的距离裁掉。 */
export const MAX_FOG_VOLUMES = 8;

/** 局部点光一次最多送进 GPU 几盏。簇光代理扩容灯池之后只要改这一个数。 */
export const MAX_VOLUMETRIC_LIGHTS = 8;

/**
 * 把 `SKY_PRESETS[name].fog` + 本表的覆盖合成一份运行时参数。
 * fog 缺项时全部退到解析雾 pass 的同一批默认值（Script_PostComposite 的 uniform 出厂值）。
 *
 * @param {string|null} presetName SKY_PRESETS 的键名
 * @param {object|null} fog `SKY_PRESETS[...].fog`
 * @returns {object} 见 VOLUMETRIC_DEFAULT 的字段表，外加从 fog 继承的
 *   density / falloff / base / maxOpacity / sunGain / skyColor / groundColor / desat / flatten
 */
export function MakeVolumetricParams(presetName, fog) {
  const override = (presetName && VOLUMETRIC_PRESETS[presetName]) || null;
  const params = { ...VOLUMETRIC_DEFAULT, ...(override || {}) };
  const f = fog || {};
  params.name = presetName || "";
  params.density = f.density ?? 0.013;
  params.falloff = Math.max(f.falloff ?? 18, 0.5);
  params.base = f.base ?? 0;
  params.maxOpacity = f.max ?? 0.94;
  params.sunGain = f.sunGain ?? 0.28;
  params.skyColor = f.sky || [0.62, 0.64, 0.68];
  params.groundColor = f.ground || [0.42, 0.38, 0.33];
  // far 不能比 near 还近，也不该超过体积雾的意义范围；调用方还会再与 camera.far 取小。
  params.far = Math.max(params.near * 4, params.far);
  return params;
}

/**
 * 归一化的 Henyey-Greenstein 相函数（除以各向同性值 1/4π，所以各向同性时恒为 1）。
 * 峰值（cosTheta = 1）= (1+g)/(1-g)²，`Script_PostVolumetrics` 拿它把 sunGain
 * 换算成「正对太阳时与今天的解析雾峰值相同」。
 */
export function HenyeyGreenstein(cosTheta, g) {
  const gg = Math.max(-0.95, Math.min(0.95, g));
  const g2 = gg * gg;
  const denominator = Math.max(1e-4, 1 + g2 - 2 * gg * cosTheta);
  return (1 - g2) / (denominator * Math.sqrt(denominator));
}

/**
 * 今天那条解析雾在距离 d、着色点高度 y 处的透过率。
 * 与 `Script_PostComposite.ApplyFog` 的 else 分支**逐项同式**（改一边要改另一边）。
 */
export function AnalyticTransmittance(params, distance, height) {
  const hFall = Math.exp(-Math.max(height - params.base, 0) / params.falloff);
  const fd = 1 - Math.exp(-Math.max(distance, 0) * params.density);
  return 1 - Math.min(fd * hFall, params.maxOpacity);
}

/**
 * froxel 介质在「水平视线、高度 y、距离 d」下的**最坏情况**透过率
 * （噪声取 0 = 最浓的那一根射线；不含局部雾体）。
 * 这是纯物理模式（legacyTransmittance = false）下的能见度下界。
 */
export function FroxelTransmittance(params, distance, height) {
  const hFall = Math.exp(-Math.max(height - params.base, 0) / params.falloff);
  const sigma = params.density * params.densityScale * hFall;
  const segment = Math.max(0, Math.min(distance, params.far) - params.near)
    + Math.max(0, distance - params.far);
  return Math.max(Math.exp(-sigma * segment), 1 - params.maxOpacity);
}

/** 验收基准距离：七十米（「七十米外能不能看见敌人由雾决定」那条定论）。 */
export const VISIBILITY_REFERENCE = { distance: 70, heights: [0.0, 1.7, 2.6] };
