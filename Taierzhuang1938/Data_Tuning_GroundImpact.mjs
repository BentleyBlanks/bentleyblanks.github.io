// 炮弹 / 炸弹 / 手榴弹落地扬尘的数值表（2026-10-20，纯数据、零 three —— 契约 2）。
//
// 用户要的是「起始形态贴着壕沟走、之后升起飘散」的尘土，所以尘土不是一团固定形状的体积，
// 而是地面上的一层浅流（Script_DustFlow）：
//   · 冲出来的气浪把土尘沿地面往外推，墙挡住的方向推不过去 —— 沟里炸，就只能顺着沟跑；
//   · 尘层按「自身表面高低」往低处流（重尘贴地，像水一样灌进沟、被抛土垄挡住）；
//   · 一边流一边被卷起来，变成上面的悬浮尘云，随风飘、慢慢变淡变浅。
// 渲染（Script_DustFieldRenderer）沿视线积分这两层，再叠三维噪声做出菜花状的卷边。
//
// 尺度：一律按装药 W（kg TNT 当量）的立方根缩放（Hopkinson–Cranz），与 Data_AerialBombs
// 同一条律。75 mm 野炮榴弹（0.81 kg，∛W≈0.93）是对着参考图调的基准档。
// 光学量单位：σ 是消光系数（1/m），「光学量」= ∫σ dV（m²）。σ≈2/m、厚 3 m 的尘就基本挡死身后的东西。

export const GROUND_IMPACT_DUST = Object.freeze({
  /** 网格：每次落点一张局部网格。边长 = 2·(extentK·surgeR + extentPad)，格距尽量 ≤ targetCellM。 */
  grid: Object.freeze({ targetCellM: 0.42, minN: 48, maxN: 96, extentK: 2.3, extentPad: 3 }),

  /**
   * 尺度律（×∛W）：
   *   craterK   视在弹坑半径（同 BOMB_PHYSICS.blast.craterK）
   *   columnK   中心土柱能冲到的高度（75 mm ≈ 9 m，250 kg ≈ 44 m —— 新闻片与战场照片的量级）
   *   surgeK    贴地尘浪靠气浪推出去的半径（之后靠重力还会慢慢再铺开一点）
   *   blastV    气浪起始风速（m/s，×W^(1/6)）；blastTauS 衰减时间（s，×∛W）
   */
  scale: Object.freeze({
    craterK: 0.85, columnK: 8.5, surgeK: 7.2,
    blastV: 46, blastTauS: 0.42, blastFalloff: 0.7,
    columnTauS: 0.42,
  }),

  /**
   * 光学量（×W，即 ×∛W³）。按 75 mm 的目测体量反推：
   * 土柱 ≈ 半径 3 m × 高 9 m、σ≈2.5；尘浪 ≈ 半径 7 m × 厚 2 m、σ≈2.5（第一版只有一半，四秒后就看不见了）。
   * columnRadiusK 是土柱半径占土柱高的比例（矮胖，不是一根柱子）；columnDome：边上那圈比中心矮多少。
   */
  mass: Object.freeze({ columnQ: 650, surgeQ: 800, surgeSigma: 1.7, columnRadiusK: 0.3, columnDome: 0.3 }),

  /**
   * 贴地尘浪：
   *   gReduced      含尘空气的约化重力（m/s²）：决定沟里那层尘往两头流得多快（√(g'h)）
   *   drag          线性阻尼（1/s）：湍流卷吸让尘浪很快慢下来
   *   relaxS        气浪推着走时，尘的速度向气浪风速靠拢的时间常数
   *   injectS       源头持续往外冒尘的时长；capH = capK·∛W + capPad 是源头格最厚能堆多厚
   *   entrain       一边走一边卷进空气变厚（m 每 m 行程）；maxHK·∛W + 1 是最厚
   *   lift          被卷起成悬浮尘云的比例（1/s），从 lift[0] 随时间涨到 lift[1]
   *   liftRise      刚卷起来的尘往上走的速度（m/s）
   *   settleHeavyS / settleFineS  重土 / 细尘落回地面的时间常数
   *   life          尘浪这一层算到多少秒就停（剩下的都归悬浮尘云）
   */
  surge: Object.freeze({
    gReduced: 2.2, drag: 0.85, relaxS: 0.06,
    injectS: 0.32, capK: 1.9, capPad: 0.8,
    entrain: 0.035, maxHK: 2.6,
    lift: Object.freeze([0.18, 0.55]), liftRampS: Object.freeze([0.4, 3.5]), liftRise: 1.1, confinedLift: 0.4,
    // 沟里卷起来的尘：初速与顶高按「被夹住的比例」加，翻出沟沿形成一道沿沟的尘墙（不然被沟壁和土垄挡着，从机位上看不见）
    confinedRise: 2.4, confinedTopM: 2.2, confinedCap: 0.35,
    settleHeavyS: 2.6, settleFineS: 30,
    life: 12,
    // 数值扩散（m²/s，×∛W）：抹掉粗网格上的振荡波纹
    smoothK: 1.5,
  }),

  /**
   * 气浪的方向性（沟里炸 = 被墙夹住）：从炸点按 rays 个方向、离地 jetLiftM + jetLiftK·弹坑半径 高平着往外量，
   * 地面高出起点 jetClimbM 就算撞墙，记下每个方向的「通畅长度」。
   *   风速只吹到撞墙处为止；被夹住的那部分能量挤到通畅的方向（boost ≤ maxBoost），
   *   也挤到竖直方向（土柱更高，columnBoost）—— 沟里炸的土柱比平地上的高而窄。
   */
  confinement: Object.freeze({ rays: 48, jetLiftM: 0.55, jetLiftK: 0.5, jetClimbM: 0.3, maxBoost: 2.6, boostExp: 0.65, columnBoost: 0.55, minOpen: 0.12,
    // 气浪按「沿沟路程」走：比直线多绕出来的路按 detourLoss 倍记入衰减（护墙挡掉大半，余下的拐过去）
    detourLoss: 0.8, windPassM: 0.35,
    // 被夹住时：爆风在沟里衰减得慢（管道里压力按路程衰减远比开阔地慢），土柱匀一部分尘量给沟里的尘浪
    channelFalloff: 0.75, channelShift: 0.3, channelDurationK: 0.8 }),

  /**
   * 中心土柱回落：fallback 的土柱光学量在 fallbackS 区间里落回地面变成尘浪（重的黑土先下来），
   * 这一下才是「土柱塌下来、往四周 / 顺沟滚」的那团。
   */
  column: Object.freeze({ fallback: 0.42, fallbackS: Object.freeze([0.32, 1.5]), baseLift: 0.06 }),

  /**
   * 悬浮尘云（随风飘的那层，网格跟着风平移、到后期整体缓慢胀大）：
   *   riseInf     后期缓慢上浮（m/s）；riseTauS 初速衰减时间
   *   spreadZ     上下边每秒各自扩多少（m/s）
   *   baseLift    云底随时间离地的比例（0→1 的渐变时长 baseLiftS）
   *   diffuse     水平扩散（m²/s）
   *   windFactor  随风漂移的比例；windRampS 起漂渐变（刚炸开时尘被气浪带着，不随风）
   *   expandStartS / expand  多少秒后整体胀大、每秒胀多少（相对）
   *   fallHeavyS / fallFineS 重土 / 细尘从空中落掉的时间常数
   *   life        最长存活（s），最后 fadeS 秒整体淡出
   */
  loft: Object.freeze({
    riseInf: 0.32, riseTauS: 0.9, spreadZ: 0.16,
    baseLift: 0.62, baseLiftS: 9,
    diffuse: 1.6, windFactor: 0.85, windRampS: 2.2,
    expandStartS: 2.5, expand: 0.03,
    fallHeavyS: 3.2, fallFineS: 60,
    life: 55, fadeS: 9,
  }),

  /**
   * 震起的地面尘（2026-10-21 用户补充：「除了炮弹本身的烟雾，还有这个炮弹半径范围以内的尘土因为震动而扬起的尘烟，
   * 一开始形状和地面本身一致，后面慢慢消散开来」，附图黄圈 + 沟沿 / 土垄上的红点）：
   *   radiusK       范围（米，×∛W）：75 mm ≈ 14 m
   *   frontV        冲击波扫过地面的速度（m/s）：一圈从炸点扫出去，扫到哪儿哪儿起尘
   *   center / edge 炸点附近 / 范围边上的光学深度（竖直方向；斜着看会叠得更厚）
   *   falloff       中间往外衰减的指数
   *   slopeK        坡陡处（沟壁）多起的倍率（×坡度，坡度封顶 1.5）
   *   convexK       凸起处（沟沿、土垄顶、坑沿）多起的倍率（×凸度）—— 图里红点的那些边
   *   h0 / grow / growLate  尘层初始厚度（米）、头一秒多涨多少、之后每秒再涨多少（米）
   *   lift / liftDelayS     离地上浮（m/s）与开始上浮的时刻
   *   decayS        变淡的时间常数（s）；diffuse 水平晕开（m²/s）；windFactor / windDelayS 随风
   *   patch         斑驳程度（0 = 一整张均匀的尘，1 = 很碎）。斑驳用固定米制尺度（几十厘米到一米多的细缕），见 Script_DustFieldRenderer.Skin
   *   （2026-10-21 用户再补：要的是「很细的尘土」—— 薄、透、颗粒细，透过它还看得见地面；所以光学深度比炮弹本身的尘小一个量级）
   */
  shock: Object.freeze({
    radiusK: 15, frontV: 160, center: 1.2, edge: 0.16, falloff: 1.1,
    // 外沿按方向起伏（花瓣形），不是一个规整的圆：lobes 个大瓣、幅度 lobeAmp（占半径）
    lobes: 7, lobeAmp: 0.28,
    slopeK: 1.1, convexK: 2.4,
    h0: 0.3, grow: 0.9, growLate: 0.12, lift: 0.14, liftDelayS: 0.6,
    decayS: 10, diffuse: 0.9, windFactor: 0.9, windDelayS: 0.8,
    patch: 0.9,
  }),

  /** 新土的「黑」退成扬尘的「灰黄」的时间常数（s）。新鲜度只影响颜色，不影响多少。 */
  freshTauS: 5.5,
  /** 斜着砸进去的弹：下游方向的气浪与尘多给多少（×水平分量）。 */
  downrangeBias: 0.7,
  /** 画面：低于这个光学量的格不算「还有尘」，整张网格都低于它就回收。 */
  emptyQ: 0.02,
});

/**
 * 表面：颜色是线性 RGB 反照率。fresh = 刚掀起来的湿土 + 炸药烟（参考图里最黑的那团核心），
 * dust = 散开、晒干之后的扬尘（偏浅的灰黄）。先只有干黄土一种；湿泥 / 雪 / 砖石之后按同一格式加。
 */
export const GROUND_IMPACT_SURFACES = Object.freeze({
  // skin：震起来的地表浮土，和地面同一种土色（偏浅、偏灰一点），不是炸出来的黑土
  loess: Object.freeze({ fresh: Object.freeze([0.15, 0.125, 0.10]), dust: Object.freeze([0.33, 0.29, 0.24]), skin: Object.freeze([0.27, 0.235, 0.185]), massScale: 1 }),
});

/**
 * 画面：
 *   steps / shadowSteps   每像素积分步数与朝太阳的遮光步数（按画质）
 *   noiseSize             三维噪声贴图边长（体素，可平铺）
 *   billowM               最大一层卷团的尺寸（米，×∛W 的平方根缩放，大炸弹的团更大）
 *   erosion               卷边吃掉低密度边缘的强度（0 = 平滑的雾团，1 = 很碎）
 *   phaseG                前向散射（尘比水雾更偏前向）
 *   multipleScattering    二阶散射近似 [强度, 消光比]，让尘团内部不至于黑成一块
 *   maxFields             同时最多画几团（超出的最老一团提前淡出）
 */
export const GROUND_IMPACT_RENDER = Object.freeze({
  // 积分步长（米，×√∛W）与每像素步数上限。按射线在盒子里的长度定步数：固定 36 步时 40 m 长的盒子一步一米多，土柱里一道道横纹。
  stepM: Object.freeze({ low: 0.8, medium: 0.6, high: 0.42, ultra: 0.32 }),
  maxSteps: Object.freeze({ low: 40, medium: 64, high: 120, ultra: 160 }),
  shadowSteps: Object.freeze({ low: 2, medium: 3, high: 3, ultra: 4 }),
  noiseSize: 48,
  billowM: 3.2, detailM: 0.9,
  /**
   * 团块边界（水平集）：覆盖度 c = 1 − exp(−σ·coverageK)，加上卷团 / 细节噪声（幅度 erosion）后过 edge ± edgeSoft 的阈值，
   * 阈值以内按 σ + solid·c 算 —— 边界清楚、里面实心的一坨一坨（参考图那种），而不是从里到外慢慢变淡的雾。
   */
  erosion: 0.9, coverageK: 6, edge: 0.5, edgeSoft: 0.07, solid: 0.8,
  /** 团块以外保留的柔和残尘比例：散开后的尘慢慢变成一层灰蒙蒙，而不是一团团突然消失。 */
  haze: 0.45,
  /** 采样坐标的三维扭曲幅度（米，×√∛W）：光滑的场被扭成一坨一坨的轮廓。softDepthM：贴地 / 贴墙处的软过渡。 */
  warpM: 2.6, softDepthM: 0.45,
  phaseG: 0.38,
  /** 震起的地面尘前向散射弱一些：一层薄尘逆光时按 0.38 算会亮成一片白泡沫。 */
  skinPhaseG: 0.12,
  multipleScattering: Object.freeze([0.55, 0.12]),
  ambientFloor: 0.42,
  /**
   * 天光放大（Vfx 的 uSkyColor 是给小粒子定的弱环境项，一团几十米的尘背阴面只吃它会黑成剪影）
   * 与地面反光（×太阳色）：参考图里尘团背光面是深灰，不是黑。
   */
  ambientScale: 1.6, groundBounce: 0.16,
  maxFields: 10,
});
