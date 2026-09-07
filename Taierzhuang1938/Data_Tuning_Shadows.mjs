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
// 换成 4 级 2048² 之后显存完全一样（4 × 2048² = 1 × 4096²），但：
//   · 最近一级 ~20 m 半径 → **2.0 cm/texel**，比今天锐 1.6 倍（砖缝级）；
//   · 最远一级铺到 220 m，今天那里是**没有阴影**；
//   · 中段（25–70 m）纹素从 3.2 cm 变粗到 ~10 cm —— 这是有意的取舍：
//     40 m 处 1 屏幕像素 ≈ 3.1 cm，10 cm 纹素 ≈ 3 px，而那个距离上 PCSS 的
//     半影本来就比 3 px 宽，锐过半影没有意义。近处欠采样才是眼睛真的看得见的。
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
//     λ=0.7 在 far=220 上给出 21/47/97/220，最近一级 21 m → 3.2 cm/texel，
//     等于白改；偏对数才把最近一级压到 ~13 m。splitNear 不用 camera.near(0.06)：
//     对数项会被 0.06 拉到 0.5 m 以内，等于白扔一级。
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

/** 一档阴影 = 级联布局 + 滤波预算 + 接触阴影预算。 */
export const SHADOW_PRESETS = {
  low: {
    cascades: 2,
    mapSize: 1024,
    maxDistance: 70,
    maxRadius: [20, 60],
    lambda: 0.92,
    // 每级隔几帧重烘一次（1 = 每帧）。低档把第二级摊到 3 帧。
    updateEvery: [1, 3],
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
    maxDistance: 130,
    maxRadius: [22, 58, 140],
    lambda: 0.92,
    updateEvery: [1, 1, 3],
    pcssLevels: 0,
    blockerTaps: 0,
    filterTaps: 10,
    fade: 0.10,
    contact: true,
    contactScale: 0.5,
  },
  high: {
    cascades: 4,
    mapSize: 2048,
    maxDistance: 220,
    maxRadius: [26, 64, 150, 260],
    lambda: 0.92,
    // 近两级每帧、第三级隔帧、第四级三帧一次。相机大幅移动 / 换关 / 太阳转向
    // 时由 CsmRig.ForceUpdate() 强制全更。
    updateEvery: [1, 1, 2, 3],
    pcssLevels: 2,          // 最近两级做 blocker search → 接触硬化
    blockerTaps: 8,
    filterTaps: 12,
    fade: 0.10,
    contact: true,
    contactScale: 1.0,
  },
  ultra: {
    cascades: 4,
    mapSize: 2048,
    maxDistance: 300,
    maxRadius: [26, 64, 150, 300],
    lambda: 0.92,
    updateEvery: [1, 1, 2, 2],
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
  /** 相机一帧内移动超过它就强制全级重烘（米）。硬切/传送/换关。 */
  teleportMeters: 12,
  /** 太阳方向变化超过它（点积差）就强制全级重烘。 */
  sunDirEpsilon: 1e-4,
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
    updateEvery: preset.updateEvery.slice(),
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
