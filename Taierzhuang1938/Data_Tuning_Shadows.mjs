// 《台儿庄：血战滕县》阴影数值表（纯数据，零 three 依赖 —— 契约 2）。
//
// 这张表是级联阴影（CSM）、接触硬化软阴影（PCSS）与屏幕空间接触阴影三件事的
// **唯一数值来源**。`Script_Csm.mjs` / `Script_Light.mjs` / `Script_ContactShadows.mjs`
// 只读它，不写；画质面板给的是「基准值」，逐级缩放在代码里按纹素尺度算。
//
// ## 为什么级数与图尺寸这么排
// 今天（2026-09 之前）是**一张** 66 m 跟随框：high 档 4096²，132 m 铺满 → 3.2 cm/texel，
// 66 m 之外一点阴影都没有（靠雾盖）。显存 = 4096² 的深度附件 + 颜色附件 ≈ 134 MB。
//
// 换成 high 档 3 级 2048² 之后显存反而降到四分之三（3 × 2048² < 1 × 4096²），而：
//   · 最近一级 ~19 m 半径 → **~1.8 cm/texel**，比今天锐 1.8 倍（砖缝级）；
//   · 最远一级封在 90 m 半径，比今天那张 66 m 框远；
//   · 中段（20–60 m）纹素从 3.2 cm 变粗到 ~5.5 cm —— 这是有意的取舍：
//     40 m 处 1 屏幕像素 ≈ 3.1 cm，5.5 cm 纹素 ≈ 2 px，而那个距离上 PCSS 的
//     半影本来就比 2 px 宽，锐过半影没有意义。近处欠采样才是眼睛真的看得见的。
//
// 探针页实测（street，640×360，high）：半径 13.6 / 41.2 / 90.0 m，
// 纹素 1.33 / 4.02 / 8.79 cm。
//
// ## 视锥切片包围球为什么这么大
// 切片 [zn, zf] 的包围球半径是 `zf · k`，`k = tan(fovY/2)·√(1+aspect²)`。
// 本作 fovY 55°、超宽屏 aspect ≈ 2.5 → k ≈ 1.46，也就是**半径是切片远端距离的 1.5 倍**。
// 球是旋转不变的（转头不改半径 → 不沸腾），代价就是这个 1.5 倍。`maxRadius` 是
// 给它封顶的：封顶之后最远一级的四角落到覆盖外，那里返回「照到」，由雾接管。
//
// ## 出处
//   · 级数 / 图尺寸 / maxDistance / maxRadius —— 2026-09 本轮实装，按上面那笔
//     显存与纹素账定；四档都在 `Script_CsmTest.mjs` 里断言单调与覆盖比例。
//   · lambda / splitNear —— practical split（Zhang 2006）。λ=0.92 偏对数：
//     λ=0.7 在 far=120 上给出 12/27/56/120 这种「均匀分割」的形状，最近一级太大，
//     纹素回到 3 cm，等于白改；偏对数才把最近一级压到 ~10 m。
//     splitNear 不用 camera.near(0.06)：对数项会被 0.06 拉到 0.5 m 以内，等于白扔一级。
//   · sunAngularDiameterDeg —— 真太阳是 0.53°（半影 = 间距 × 0.0093，3 m 间距只有
//     2.8 cm，屏幕上看不出软硬变化）。游戏一律夸大；UE 的 Source Angle 缺省 0.5357°，
//     COD/Frostbite 的 PCSS 实践值在 1°–2°。这里取 1.6°：3 m 间距 → 8 cm 半影，
//     10 m 间距 → 28 cm，屋檐与旗杆的「近处硬、远处软」肉眼可辨。
//   · blockerTaps / filterTaps —— Vogel 盘抽样数。TAA 会把剩下的噪声抹平，
//     所以不追求单帧无噪；medium 及以下不跑 blocker search（固定盘 PCF）。
//   · contact —— 屏幕空间接触阴影：步数 × 步长 = 最大追踪距离。0.45 m 是
//     沙袋/木箱贴地漏光的尺度（normalBias 把着色点沿法线推出去，推出来的那点
//     在地面上，于是箱底那一圈永远晒得到太阳）。厚度判据 0.35 m 防止把
//     「远处的墙」当成「眼前的遮挡」。

// ## 一帧只烘一张（2026-09 实测逼出来的口径）
// 滕县城里**每一趟阴影烘焙都有约 1.45 M 三角形的地板**，而且它几乎不随级联半径变化：
// 半径 13.5 m 的最近一级要 1.455 M / 98 draw，半径 233 m 的最远一级也只要 2.91 M / 377 draw
// （phase=2 / quality=high / scale=small 实测）。原因是静态世界走 `BuildSink` 分区合批，
// 那些巨大的合批块与地形块的包围体覆盖整片区，逐级视锥剔除根本剔不掉它们。
//
// 而 `Data_AssetStandards.SCENE_RENDER_LIMITS.triangles` 的单帧红线是 8.10 M，
// 这一关不带阴影是 5.51 M —— **留给阴影的余量只有 2.59 M，也就是一帧一张**。
// 四张一起烘是 8.4 M，直接把红线顶穿（BootTest 会红）。
//
// 所以调度不是「每级隔几帧」而是 **`bakeOrder`：一条逐帧轮转表，每帧恰好烘一张**。
// 最近一级在表里占的格子最多（它扛着会动的人和车）。副作用是近级阴影按 ~30 Hz 刷新，
// 60 fps 下最多落后一帧 —— 看不出来；而远级按 ~9 Hz 刷新，那里一个人只有几个像素宽。
//
// 想要真正的四级铺满 200 m，前提是先解决那 1.45 M 的地板（静态几何的阴影缓存 ——
// 城不动，只有人在动，UE 的 cached whole-scene shadow 就是干这个的），或者提高三角红线。
// 两件事都超出本子系统的边界，留给集成方。

/** 一档阴影 = 级联布局 + 滤波预算 + 接触阴影预算。 */
export const SHADOW_PRESETS = {
  low: {
    cascades: 2,
    mapSize: 1024,
    maxDistance: 60,
    maxRadius: [20, 60],
    lambda: 0.92,
    // 逐帧轮转表：每帧烘表里那一张。近级占的格子多。
    bakeOrder: [0, 1],
    pcssLevels: 0,          // 0 = 全部固定盘 PCF
    blockerTaps: 0,
    filterTaps: 5,
    fade: 0.10,             // 过渡带宽度（占本级图边长的比例，两侧各一半）
    contact: false,
    contactScale: 0.5,
  },
  medium: {
    cascades: 3,
    mapSize: 1024,
    maxDistance: 90,
    maxRadius: [22, 55, 80],
    lambda: 0.92,
    bakeOrder: [0, 1, 0, 2],
    pcssLevels: 0,
    blockerTaps: 0,
    // 2026-09-08 分档定稿：10 → 8（固定盘 PCF，没有 blocker search，
    // 盘半径不变、只是盘内少两个点；1024 图上肉眼分辨不出，TAA 之后更看不出）。
    filterTaps: 8,
    fade: 0.10,
    contact: true,
    contactScale: 0.5,
  },
  high: {
    cascades: 3,
    mapSize: 2048,
    maxDistance: 120,
    // 最远一级封到 90 m：它是这一档里最贵的一张（实测 2.24 M 三角 / 236 draw），
    // 再放大就顶穿单帧红线。覆盖仍然比重构前那张 66 m 单框远。
    maxRadius: [26, 64, 90],
    lambda: 0.92,
    // 7 帧一轮：最近一级占 4 格（~34 Hz）、中间级 2 格（~17 Hz）、最远级 1 格（~9 Hz）。
    bakeOrder: [0, 1, 0, 2, 0, 1, 0],
    pcssLevels: 2,          // 最近两级做 blocker search → 接触硬化
    // 2026-09-08 分档定稿：8/12 → 6/9。high 的每像素阴影取样从 20 降到 15
    // （−25%），实测整帧 GPU 见 docs §13 的旋钮账。半影形状由 blocker search
    // 的**搜索半径**决定，取样数只决定盘内的噪声；6 抽样 blocker 在 2048 图上
    // 仍能分辨「贴着遮挡体」与「一米外」，9 抽样 Poisson 盘的噪声被 TAA 吃掉。
    blockerTaps: 6,
    filterTaps: 9,
    fade: 0.10,
    contact: true,
    contactScale: 1.0,
  },
  // ultra 也是 **3 级**，不是 4。这不是画质取舍，是平台硬限：
  // 每一级是一盏带阴影图的 DirectionalLight，而 `directionalShadowMap[]` 是一个
  // **采样器数组** —— 四级就是四个纹素单元。八个子系统合流之后人物与
  // 第一人称视模材质在 ANGLE-D3D11 的 `MAX_TEXTURE_IMAGE_UNITS = 16` 上实测 17，
  // 而超了程序**不链接**、那只材质整只不画（预算表见
  // docs/Data_TechRenderPipeline.md §1.8）。换来的补偿是每级图翻四倍（2048 → 4096）：
  // 同样的 170 m 总距离下，近级的每米纹素数反而比四级×2048 高（四级只是把
  // 同一些米分得更细），且一轮少烘一张。三角红线不受影响（分辨率不改三角数）。
  ultra: {
    cascades: 3,
    mapSize: 4096,
    maxDistance: 170,
    maxRadius: [30, 75, 130],
    lambda: 0.92,
    // 7 帧一轮：最近一级 4 格（~34 Hz）、中间级 2 格、最远级 1 格。峰值仍是一帧一张。
    bakeOrder: [0, 1, 0, 2, 0, 1, 0],
    pcssLevels: 2,
    blockerTaps: 12,
    filterTaps: 16,
    fade: 0.10,
    contact: true,
    contactScale: 1.0,
  },
};

/**
 * 与档位无关的口径。改这些数会同时动材质 chunk 与全屏 pass，
 * 必须在**任何材质编译之前**定死（见 Script_Csm.InstallCsmShaderChunks）。
 */
export const SHADOW_COMMON = {
  /** practical split 的近端。见抬头「出处」。 */
  splitNear: 3.0,
  /** 太阳视直径（度）。夸大过的，见抬头。 */
  sunAngularDiameterDeg: 1.6,
  /** 半影上限（本级纹素）。不封顶的话贴着高墙的地面会被糊成一片灰。 */
  maxPenumbraTexels: 22,
  /** blocker search 的最大搜索半径（米）。超过它就不是「接触」而是「远处的墙」。 */
  blockerSearchMaxMeters: 1.6,
  /**
   * 投影体外扩（米）：光源沿光方向从包围球心再退这么远，正交 far 也加同样多。
   * 不外扩的话，站在楼前时那栋楼在包围球**外**，它的影子整栋消失。
   */
  casterExtrusion: 90,
  /** 包围球半径向上取整的步长（米）。1/16 m 见任务书；它让半径不随小数抖动。 */
  radiusQuantum: 1 / 16,
  /**
   * 参考深度范围（米）。画质面板的 `shadowBias` 是「在这个深度范围上的归一化偏移」，
   * 逐级按各自的实际深度范围换算回同样的世界米数。260 是重构前
   * `sun.shadow.camera.far` 的值 —— 保持面板上那根滑杆的手感不变。
   */
  referenceDepthRange: 259.5,
  /**
   * 接触阴影：步数、总长（米）、厚度判据（米）、强度。
   * 只压直射太阳，与级联阴影取 min（见 Script_Csm 的材质 chunk）。
   */
  contact: {
    steps: 12,
    lengthMeters: 0.45,
    thicknessMeters: 0.35,
    /** 起点沿法线推出去多少（米），躲开自遮挡。 */
    normalOffset: 0.02,
    /**
     * 低于这个视深不跑（米）。第一人称的手与枪在预通道里写的是常数
     * `FOREGROUND_VIEW_DEPTH = 1 m` 前景标签（不是真视深），照它追踪会在枪身上
     * 画出一条按假深度算的黑带。1.25 把那一段整个排除掉。
     */
    minViewDepth: 1.25,
    /** 超过这个视深就不跑（远处一个像素跨好几米，接触阴影没有意义）。 */
    maxViewDepth: 60,
    /** 淡出起点（视深，米）。到 maxViewDepth 线性淡到 0，避免出现一条硬边。 */
    fadeStartViewDepth: 40,
    intensity: 1.0,
  },
};

/** 画质档名。`SHADOW_PRESETS` 缺档一律退回 high。 */
export function MakeShadowPreset(quality) {
  const name = SHADOW_PRESETS[quality] ? quality : "high";
  const preset = SHADOW_PRESETS[name];
  return {
    ...preset,
    maxRadius: preset.maxRadius.slice(),
    bakeOrder: preset.bakeOrder.slice(),
  };
}

/**
 * practical split（Zhang 2006）：对数分割与均匀分割按 λ 混合。
 * 返回 `count + 1` 个边界，`[near, d1, …, far]`，严格单调递增。
 * @param {number} near 近端（用 SHADOW_COMMON.splitNear，不是 camera.near）
 * @param {number} far  远端（min(camera.far, preset.maxDistance)）
 */
export function CascadeSplits(near, far, count, lambda) {
  const n = Math.max(0.01, near);
  const f = Math.max(n + 0.02, far);
  const k = Math.max(1, count | 0);
  const l = Math.min(1, Math.max(0, lambda));
  const splits = [n];
  for (let i = 1; i < k; i += 1) {
    const p = i / k;
    const logD = n * Math.pow(f / n, p);
    const uniD = n + (f - n) * p;
    splits.push(l * logD + (1 - l) * uniD);
  }
  splits.push(f);
  return splits;
}

/**
 * 视锥切片的包围球（解析解，旋转不变）。
 * 返回 `{ distance, radius }`：球心在视轴上离相机 `distance` 米处，半径 `radius` 米。
 *
 * 推导：切片的八个角在视轴距离 zn / zf 处，横向半宽 `z·tx`、纵向 `z·ty`。
 * 令 `k² = tx² + ty²`。若 `k² ≥ (zf−zn)/(zf+zn)`，最远那圈角就是最外点，
 * 球心落在 zf、半径 `zf·√(1+k²)`… 这里用与 three CSM addon / DirectX 示例
 * 同一份闭式：球心 `0.5(zn+zf)(1+k²)`，半径由两端角点距离算出；越界时退回
 * 「球心 = zf」。**半径只依赖 zn/zf/fov/aspect，不依赖相机位置与朝向** ——
 * 这就是「转头不沸腾」的根。
 */
export function SliceBoundingSphere(zn, zf, tanHalfFovY, aspect) {
  const ty = Math.max(1e-4, tanHalfFovY);
  const tx = ty * Math.max(1e-4, aspect);
  const k2 = tx * tx + ty * ty;
  if (k2 * (zf + zn) >= (zf - zn)) {
    // 远端角点就是最外点：球贴着切片远端那一圈
    return { distance: zf, radius: zf * Math.sqrt(k2) };
  }
  const distance = 0.5 * (zn + zf) * (1 + k2);
  const dz = zf - zn;
  const radius = 0.5 * Math.sqrt(
    dz * dz + 2 * (zf * zf + zn * zn) * k2 + (zn + zf) * (zn + zf) * k2 * k2,
  );
  return { distance, radius };
}
