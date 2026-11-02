// 环境组件的声明表（docs/Data_Environment.md §2）。
//
// 组件是环境能力的基本单元：主光、环境光、反射、天空、云层、物理大气、雾、角色光照、曝光与调色各是一种。
// 这张表只声明「是什么」——名字、分类、图标、参数（类型 / 范围 / 默认值 / 能不能随昼夜变 / 怎么插值 /
// 写进环境参数的哪一项）、关掉时取什么。执行逻辑在 Script_EnvComponents（同名 type 一个，多数走通用写法）；
// 框架（Script_EnvSystem）按这张表发现组件、求值、过渡、调度，编辑器（Script_EditorEnvironment*）按它生成
// 「添加组件」菜单、卡片与参数控件。新加一种环境能力 = 这里加一条 + Script_EnvComponents 登记一行。
//
// 参数字段：
//   key / label    参数名（存进预设）/ 编辑器里显示的名字
//   kind           number 数值 · angle 角度（插值走最短弧）· color 颜色（#rrggbb，按线性光插值）·
//                  rgb 三通道 HDR 倍率（[r, g, b]，可大于 1）· enum 枚举（就近取）· bool 开关
//   min / max / step  滑条范围（rgb 是每通道的范围）
//   default        预设里没写这一项时用它
//   out            写进环境参数（与 Script_Sky.SKY_PRESETS 同形）的路径，「.」分层，数字段是数组下标
//   lerp           number / rgb：log = 按对数插值（逐通道）。亮度类的量都按对数插：画面亮度 ≈ 光强 × 曝光，
//                  白天与夜里差两个数量级，线性插会让过渡中间比两头都亮（光强已经往夜里走了一半、曝光却按对数刚抬起来）
//   animatable     false = 只能是固定值（不给关键帧）
//   group          卡片里的小标题
//   hint           悬停说明
//   control        可选：特殊控件的名字（Script_EditorEnvironmentViews.RegisterParamControl 登记），不写就按 kind 用通用控件
// 组件字段：type（存进预设的名字，用上以后不改名）、label、category（只给编辑器分类浏览用，
// 运行时不看）、icon、summary、params、off（没有任何来源提供这个组件、或「完全覆盖」的区域里没有它时取的值，
// 在 default 之上覆盖）。
//
// 纯数据，零 import（契约 21）。默认值取第一关白盒现在用的 firstLevelBattleDay。

/** 分类：编辑器的分类图标与筛选。顺序就是筛选条上的顺序。 */
export const ENV_CATEGORIES = Object.freeze([
  Object.freeze({ id: "light", label: "光照", icon: "☀" }),
  Object.freeze({ id: "sky", label: "天空", icon: "☁" }),
  Object.freeze({ id: "fog", label: "雾", icon: "≋" }),
  Object.freeze({ id: "reflection", label: "反射", icon: "◇" }),
  Object.freeze({ id: "character", label: "人物", icon: "♟" }),
  Object.freeze({ id: "post", label: "后期", icon: "◑" }),
]);

/** 后期档案：自动曝光锚点、体积雾参数、胶片颗粒、照明弹的昼夜口径按这个名字查（都是 SKY_PRESETS 的名字）。 */
export const ENV_PROFILES = Object.freeze([
  Object.freeze({ value: "firstLevelBattleDay", label: "第一关白天" }),
  Object.freeze({ value: "dusk", label: "黄昏" }),
  Object.freeze({ value: "dawn", label: "拂晓" }),
  Object.freeze({ value: "firstLevelNight", label: "第一关夜" }),
  Object.freeze({ value: "night", label: "夜战" }),
  Object.freeze({ value: "smokyDay", label: "硝烟白天" }),
  Object.freeze({ value: "overcast", label: "阴天" }),
  Object.freeze({ value: "burningStreet", label: "烧着的街" }),
  Object.freeze({ value: "chuchuanDay", label: "出川白天" }),
  Object.freeze({ value: "whiteboxDay", label: "白盒白天" }),
  Object.freeze({ value: "editorClear", label: "长视距晴天" }),
  Object.freeze({ value: "testSceneDay", label: "测试场白天" }),
]);

const P = (fields) => Object.freeze(fields);
const RGB = (r, g, b) => Object.freeze([r, g, b]);

export const ENV_COMPONENTS = Object.freeze([
  Object.freeze({
    type: "Sun", label: "主光", category: "light", icon: "☀",
    summary: "太阳 / 月亮：平行光的方向、颜色、强度与天上那颗太阳盘。夜里它就是月光。",
    params: Object.freeze([
      P({ key: "elevation", label: "高度角", kind: "number", min: -10, max: 90, step: 0.1, default: 52, out: "sunElevation", group: "方向", hint: "度；地平线是 0" }),
      P({ key: "azimuth", label: "方位角", kind: "angle", min: 0, max: 360, step: 0.5, default: 35, out: "sunAzimuth", group: "方向", hint: "度；0 = 南（+Z），90 = 东（+X）" }),
      P({ key: "color", label: "光色", kind: "color", default: "#fff2df", out: "lightColor", group: "平行光" }),
      P({ key: "intensity", label: "强度", kind: "number", min: 0, max: 12, step: 0.01, default: 4.6, lerp: "log", out: "lightIntensity", group: "平行光", hint: "≤ 0.35 时不投阴影（夜里那一档）" }),
      P({ key: "discColor", label: "太阳盘色", kind: "rgb", min: 0, max: 2, step: 0.01, default: RGB(1.0, 0.97, 0.91), out: "sunColor", group: "太阳盘", hint: "也是雾朝阳那一侧的色" }),
      P({ key: "discIntensity", label: "太阳盘亮度", kind: "number", min: 0, max: 200, step: 0.1, default: 1.2, lerp: "log", out: "sunIntensity", group: "太阳盘" }),
      P({ key: "discSize", label: "太阳盘大小", kind: "number", min: 0, max: 0.0005, step: 0.000001, default: 0.000012, out: "sunSize", group: "太阳盘", animatable: false }),
    ]),
    off: Object.freeze({ intensity: 0, discIntensity: 0 }),
  }),
  Object.freeze({
    type: "Ambient", label: "环境光", category: "light", icon: "◐",
    summary: "天光底子：全局 SH 探针的强度，加一盏很弱的环境底色托住最暗处。",
    params: Object.freeze([
      P({ key: "probe", label: "天光探针", kind: "number", min: 0, max: 2, step: 0.01, default: 0.42, lerp: "log", out: "shProbeIntensity" }),
      P({ key: "color", label: "底色", kind: "color", default: "#e5e2dc", out: "ambientColor" }),
      P({ key: "intensity", label: "底色强度", kind: "number", min: 0, max: 2, step: 0.005, default: 0.18, lerp: "log", out: "ambientIntensity" }),
    ]),
    off: Object.freeze({ probe: 0, intensity: 0 }),
  }),
  Object.freeze({
    type: "Reflection", label: "反射", category: "reflection", icon: "◇",
    summary: "从天穹烘出的环境贴图（IBL）有多强；同一个数也乘在探针体 GI 上。",
    params: Object.freeze([
      P({ key: "intensity", label: "环境反射", kind: "number", min: 0, max: 3, step: 0.01, default: 0.34, lerp: "log", out: "envIntensity" }),
    ]),
    off: Object.freeze({ intensity: 0 }),
  }),
  Object.freeze({
    type: "Sky", label: "天空", category: "sky", icon: "◒",
    summary: "天穹的美术层：天顶 / 地平线 / 地面色、太阳辉光、战场烟尘带与星。物理散射在「物理大气」里。",
    params: Object.freeze([
      P({ key: "zenith", label: "天顶", kind: "rgb", min: 0, max: 3, step: 0.01, default: RGB(1.15, 1.20, 1.25), lerp: "log", out: "zenith", group: "天色" }),
      P({ key: "horizon", label: "地平线", kind: "rgb", min: 0, max: 5, step: 0.01, default: RGB(1.60, 1.60, 1.58), lerp: "log", out: "horizon", group: "天色" }),
      P({ key: "ground", label: "地面", kind: "rgb", min: 0, max: 2, step: 0.01, default: RGB(0.30, 0.28, 0.25), lerp: "log", out: "ground", group: "天色" }),
      P({ key: "glow", label: "辉光", kind: "number", min: 0, max: 5, step: 0.01, default: 0.12, lerp: "log", out: "glow", group: "太阳辉光" }),
      P({ key: "glowSpread", label: "辉光收拢", kind: "number", min: 1, max: 30, step: 0.1, default: 10, out: "glowSpread", group: "太阳辉光" }),
      P({ key: "smoke", label: "烟尘量", kind: "number", min: 0, max: 1.5, step: 0.01, default: 1.0, out: "smoke", group: "战场烟尘" }),
      P({ key: "smokeColor", label: "烟尘色", kind: "rgb", min: 0, max: 2, step: 0.01, default: RGB(1.05, 1.02, 0.96), lerp: "log", out: "smokeColor", group: "战场烟尘" }),
      P({ key: "smokeHeight", label: "烟尘高度", kind: "number", min: 0, max: 0.5, step: 0.005, default: 0.18, out: "smokeHeight", group: "战场烟尘" }),
      P({ key: "stars", label: "星", kind: "number", min: 0, max: 1, step: 0.01, default: 0, out: "stars", group: "夜空" }),
    ]),
    off: Object.freeze({}),
  }),
  Object.freeze({
    type: "Clouds", label: "云层", category: "sky", icon: "☁",
    summary: "天上的云：旧云项的形状，加结构化层积云（云底压暗、云缝提亮、太阳侧银边）。关掉 = 只剩旧云项。",
    params: Object.freeze([
      P({ key: "shapeScale", label: "旧云频率", kind: "number", min: 0.5, max: 10, step: 0.05, default: 3.2, out: "cloudShape.0", group: "旧云项" }),
      P({ key: "shapeLow", label: "旧云下阈", kind: "number", min: 0, max: 1, step: 0.005, default: 0.30, out: "cloudShape.1", group: "旧云项" }),
      P({ key: "shapeHigh", label: "旧云上阈", kind: "number", min: 0, max: 1, step: 0.005, default: 0.68, out: "cloudShape.2", group: "旧云项" }),
      P({ key: "shapeCover", label: "最少云量", kind: "number", min: 0, max: 1, step: 0.01, default: 0.35, out: "cloudShape.3", group: "旧云项" }),
      P({ key: "structure", label: "层积云", kind: "number", min: 0, max: 1, step: 0.01, default: 0.95, out: "cloudDeck.structure", group: "层积云", hint: "0 = 不画层积云" }),
      P({ key: "coverage", label: "覆盖率", kind: "number", min: 0, max: 1, step: 0.01, default: 0.62, out: "cloudDeck.coverage", group: "层积云" }),
      P({ key: "scale", label: "云盘频率", kind: "number", min: 0.2, max: 4, step: 0.01, default: 1.1, out: "cloudDeck.scale", group: "层积云" }),
      P({ key: "softness", label: "边缘软度", kind: "number", min: 0, max: 2, step: 0.01, default: 0.5, out: "cloudDeck.softness", group: "层积云" }),
      P({ key: "warp", label: "扭曲", kind: "number", min: 0, max: 3, step: 0.01, default: 0.35, out: "cloudDeck.warp", group: "层积云" }),
      P({ key: "underside", label: "云底压暗", kind: "number", min: 0, max: 1, step: 0.01, default: 0.5, out: "cloudDeck.underside", group: "层积云" }),
      P({ key: "gap", label: "云缝亮度", kind: "number", min: 0, max: 3, step: 0.01, default: 1.40, out: "cloudDeck.gap", group: "层积云" }),
      P({ key: "silver", label: "银边", kind: "number", min: 0, max: 1, step: 0.01, default: 0.35, out: "cloudDeck.silver", group: "层积云" }),
      P({ key: "shade", label: "云底色", kind: "rgb", min: 0, max: 1, step: 0.005, default: RGB(0.50, 0.50, 0.52), out: "cloudDeck.shade", group: "层积云" }),
    ]),
    off: Object.freeze({ structure: 0, shapeScale: 5.5, shapeLow: 0.445, shapeHigh: 0.615, shapeCover: 0 }),
  }),
  Object.freeze({
    type: "Atmosphere", label: "物理大气", category: "sky", icon: "◎",
    summary: "Hillaire 物理天空与大气透视：霾（Mie）、瑞利、臭氧、太阳辐照度和标定用的色调。",
    params: Object.freeze([
      P({ key: "mie", label: "霾（Mie）", kind: "number", min: 0, max: 12, step: 0.05, default: 8, out: "atmosphere.mie", group: "介质" }),
      P({ key: "mieG", label: "前向散射", kind: "number", min: 0.5, max: 0.95, step: 0.005, default: 0.8, out: "atmosphere.mieG", group: "介质" }),
      P({ key: "rayleigh", label: "瑞利", kind: "number", min: 0, max: 4, step: 0.01, default: 0.30, out: "atmosphere.rayleigh", group: "介质" }),
      P({ key: "ozone", label: "臭氧", kind: "number", min: 0, max: 3, step: 0.01, default: 1.0, out: "atmosphere.ozone", group: "介质" }),
      P({ key: "groundAlbedo", label: "地面反照", kind: "number", min: 0, max: 1, step: 0.01, default: 0.2, out: "atmosphere.groundAlbedo", group: "介质" }),
      P({ key: "sunIrradiance", label: "太阳辐照度", kind: "number", min: 0, max: 80, step: 0.01, default: 12, lerp: "log", out: "atmosphere.sunIrradiance", group: "亮度" }),
      P({ key: "skyTint", label: "天色调", kind: "rgb", min: 0, max: 2, step: 0.001, default: RGB(0.97, 0.97, 1.0), out: "atmosphere.skyTint", group: "亮度" }),
      P({ key: "skyFloor", label: "天光底", kind: "rgb", min: 0, max: 1, step: 0.001, default: RGB(0.95, 0.95, 0.92), lerp: "log", out: "atmosphere.skyFloor", group: "亮度", hint: "夜里是气辉 + 星光的积分" }),
      P({ key: "artGlow", label: "美术辉光", kind: "number", min: 0, max: 1, step: 0.01, default: 0.15, out: "atmosphere.artGlow", group: "亮度" }),
      P({ key: "sunDiskT", label: "太阳盘吃透过率", kind: "number", min: 0, max: 1, step: 0.01, default: 1, out: "atmosphere.sunDiskT", group: "亮度" }),
      P({ key: "belowVeil", label: "地平线下罩霾", kind: "number", min: 0, max: 1, step: 0.01, default: 0, out: "atmosphere.belowVeil", group: "亮度" }),
      P({ key: "aerialBlend", label: "透视混色", kind: "number", min: 0, max: 1, step: 0.01, default: 0.5, out: "atmosphere.aerialBlend", group: "大气透视" }),
      P({ key: "aerialGain", label: "透视增益", kind: "number", min: 0, max: 2, step: 0.001, default: 0.4, out: "atmosphere.aerialGain", group: "大气透视" }),
    ]),
    off: Object.freeze({}),
  }),
  Object.freeze({
    type: "Fog", label: "雾", category: "fog", icon: "≋",
    summary: "合成 pass 里的高度雾 + 距离雾 + 按深度去饱和；体积雾的口径按「后期档案」查。",
    params: Object.freeze([
      P({ key: "density", label: "浓度", kind: "number", min: 0, max: 0.05, step: 0.0001, default: 0.0032, out: "fog.density", group: "量" }),
      P({ key: "falloff", label: "高度衰减", kind: "number", min: 1, max: 600, step: 0.5, default: 45, out: "fog.falloff", group: "量", hint: "米：越大雾越往上走" }),
      P({ key: "max", label: "最浓", kind: "number", min: 0, max: 1, step: 0.01, default: 0.72, out: "fog.max", group: "量" }),
      P({ key: "skyColor", label: "雾色（天）", kind: "rgb", min: 0, max: 2, step: 0.005, default: RGB(0.60, 0.60, 0.59), lerp: "log", out: "fog.sky", group: "颜色" }),
      P({ key: "groundColor", label: "雾色（地）", kind: "rgb", min: 0, max: 2, step: 0.005, default: RGB(0.45, 0.43, 0.40), lerp: "log", out: "fog.ground", group: "颜色" }),
      P({ key: "sunGain", label: "朝阳增亮", kind: "number", min: 0, max: 1, step: 0.01, default: 0.08, out: "fog.sunGain", group: "颜色" }),
      P({ key: "desat", label: "远处去饱和", kind: "number", min: 0, max: 1, step: 0.01, default: 0.16, out: "fog.desat", group: "颜色" }),
      P({ key: "flatten", label: "远处压平", kind: "number", min: 0, max: 0.3, step: 0.005, default: 0.03, out: "fog.flatten", group: "颜色" }),
    ]),
    off: Object.freeze({ density: 0, max: 0 }),
  }),
  Object.freeze({
    type: "CharacterLight", label: "角色光照", category: "character", icon: "♟",
    summary: "只打在人物身上的正面补光与轮廓光：夜里、背光时把人从背景里分出来（材质补丁 Script_CharacterLight，不影响场景）。",
    params: Object.freeze([
      P({ key: "fill", label: "补光", kind: "number", min: 0, max: 2, step: 0.01, default: 0, lerp: "log", out: "characterLight.fill", group: "补光", hint: "正对镜头的面最亮；加在间接光上，GTAO 照常压" }),
      P({ key: "fillColor", label: "补光色", kind: "color", default: "#ffffff", out: "characterLight.fillColor", group: "补光" }),
      P({ key: "rim", label: "轮廓光", kind: "number", min: 0, max: 2, step: 0.01, default: 0, lerp: "log", out: "characterLight.rim", group: "轮廓光", hint: "只亮人物边缘一圈" }),
      P({ key: "rimColor", label: "轮廓光色", kind: "color", default: "#ffffff", out: "characterLight.rimColor", group: "轮廓光" }),
      P({ key: "rimPower", label: "轮廓收拢", kind: "number", min: 1, max: 8, step: 0.1, default: 3, out: "characterLight.rimPower", group: "轮廓光", hint: "越大轮廓越细" }),
    ]),
    off: Object.freeze({ fill: 0, rim: 0 }),
  }),
  Object.freeze({
    type: "Grade", label: "曝光与调色", category: "post", icon: "◑",
    summary: "曝光、饱和度、对比、泛光与分离调色；「后期档案」决定自动曝光锚点、体积雾与颗粒按哪一档走。",
    params: Object.freeze([
      P({ key: "exposure", label: "曝光", kind: "number", min: 0.1, max: 5, step: 0.01, default: 0.78, lerp: "log", out: "exposure", group: "曝光" }),
      P({ key: "profile", label: "后期档案", kind: "enum", options: ENV_PROFILES, default: "firstLevelBattleDay", out: "profile", group: "曝光", hint: "按就近的关键帧切换" }),
      P({ key: "saturation", label: "饱和度", kind: "number", min: 0, max: 1.5, step: 0.01, default: 0.92, out: "saturation", group: "色调" }),
      P({ key: "contrast", label: "对比", kind: "number", min: 0.5, max: 1.5, step: 0.01, default: 1.10, out: "contrast", group: "色调" }),
      P({ key: "contrastCurve", label: "对比曲线", kind: "enum", options: Object.freeze([Object.freeze({ value: "linear", label: "线性" }), Object.freeze({ value: "soft", label: "S 曲线" })]), default: "linear", out: "fog.grade.contrastCurve", group: "色调" }),
      P({ key: "lift", label: "暗部抬升", kind: "rgb", min: -0.05, max: 0.05, step: 0.001, default: RGB(0.006, 0.004, 0.012), out: "fog.grade.lift", group: "分离调色" }),
      P({ key: "gain", label: "增益", kind: "rgb", min: 0.5, max: 1.5, step: 0.005, default: RGB(1.02, 1.0, 0.965), out: "fog.grade.gain", group: "分离调色" }),
      P({ key: "shadowTint", label: "暗部色", kind: "rgb", min: 0, max: 2, step: 0.005, default: RGB(0.855, 0.975, 1.170), out: "fog.grade.shadowTint", group: "分离调色" }),
      P({ key: "highlightTint", label: "亮部色", kind: "rgb", min: 0, max: 2, step: 0.005, default: RGB(1.105, 1.015, 0.880), out: "fog.grade.highlightTint", group: "分离调色" }),
      P({ key: "splitShadow", label: "暗部力度", kind: "number", min: 0, max: 1.5, step: 0.01, default: 1.0, out: "fog.grade.shadow", group: "分离调色" }),
      P({ key: "splitHighlight", label: "亮部力度", kind: "number", min: 0, max: 1.5, step: 0.01, default: 1.0, out: "fog.grade.highlight", group: "分离调色" }),
      P({ key: "bloom", label: "泛光", kind: "number", min: 0, max: 1.5, step: 0.01, default: 0.04, out: "bloom", group: "光学" }),
      P({ key: "bloomThreshold", label: "泛光门槛", kind: "number", min: 0.5, max: 4, step: 0.01, default: 1.18, out: "bloomThreshold", group: "光学" }),
      P({ key: "godStrength", label: "光束拖影", kind: "number", min: 0, max: 1.5, step: 0.01, default: 0, out: "godStrength", group: "光学", hint: "只在没有体积雾的档位起作用" }),
      P({ key: "lensFlare", label: "镜头光晕", kind: "number", min: 0, max: 1.5, step: 0.01, default: 0, out: "lensFlare", group: "光学" }),
    ]),
    off: Object.freeze({}),
  }),
]);
