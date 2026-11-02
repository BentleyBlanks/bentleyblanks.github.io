// 环境系统的运行与编辑数值（docs/Data_Environment.md）。纯数据，零 import。

export const ENV_RUNTIME = Object.freeze({
  // 环境反射贴图（PMREM，从天穹烘）的最短重烘间隔。烘一次 10–20 ms（Script_Sky.BakeEnvironment），
  // 昼夜在走或过渡进行中时天每帧都在变，限到每 0.5 s 一次：天与灯每帧照常更新，只有反射晚半拍。
  // 变化停下来之后最后一次照样会烘（不留旧天）。
  pmremIntervalS: 0.5,
  // 播放时每秒走多少游戏小时；0.1 = 一天 4 分钟。编辑器速度下拉的几档。
  defaultSpeedHps: 0.1,
  speedsHps: Object.freeze([0.02, 0.05, 0.1, 0.25, 0.5, 1, 2]),
  // 新建区域 / 临时覆盖的缺省值
  defaultBlendS: 2,
  defaultLocalPriority: 10,
  defaultOverridePriority: 100,
  // 旧天空预设（Debug.ApplySky、过场换天、特效编辑器换天）在有场景环境时变成这个优先级的临时覆盖
  skyOverridePriority: 1000,
  // 顺着往下一拍走（关键帧带过渡）、这一拍的时间又没写 blendS 时，钟点往前拨过去用几秒
  beatBlendS: 2,
  // 时间指针离关键帧这么近（小时）算「在这一帧上」：编辑参数改这一帧，而不是另插一帧
  keySnapH: 0.05,
  // 新建盒子区域的缺省尺寸（米）
  newBoxSize: Object.freeze([24, 12, 24]),
});

export const ENV_EDITOR = Object.freeze({
  // 外面（人 / agent）改了预设或区域文件，多久查一次
  pollS: 2,
  // 撤销步数
  historyLimit: 200,
  // 场景里区域框的颜色：选中 / 观察点在里面 / 其余。白盒地面是浅米色，金色淡填充在上面几乎看不出来（2026-11-02 实拍），
  // 选中的用饱和的琥珀色
  gizmoColors: Object.freeze({ selected: 0xff9a1a, inside: 0x3fb6e0, idle: 0xd8d8d0 }),
  // 区域框的填充：选中的 / 其余（线在 TAA 之前画、一像素宽会被冲淡，体积靠填充看出来）
  selectedFillOpacity: 0.28,
  idleFillOpacity: 0.07,
  // 拖动手柄的大小（米，按到相机的距离再放大一点，远了也点得到）
  handleRadiusM: 0.6,
  handleScreenScale: 0.018,
});
