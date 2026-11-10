// 开发工具边界（零依赖的那一半）：菜单要知道「有没有开发工具、Debug工具有哪几项」，
// 但标题菜单不许为此把整套编辑器拉进包里，所以这张表只放 id 与纯值，不 import 任何编辑器。
//
// ## 打包剔除
// 运行时代码只经两个模块碰开发工具：本表与 Script_DevTools.mjs（游戏宿主才装的编辑器套件）。
// 剔除 = 构建时把这两个模块换成同名 *Stub（Script_BuildBrowserBundle --strip-dev-tools），
// 其余代码不改；菜单的「Debug工具」「高级工具」两项随 DEV_TOOLS_ENABLED 一起消失。
// 守门：Script_DevToolsIsolationTest.mjs。

export const DEV_TOOLS_ENABLED = true;

// 设置 → Debug工具 那一页的条目与顺序。前六项是 Script_Editor 的叠加层 id
// （不接管相机、玩法照跑，关掉菜单回去边打边看）；fps 是 HUD 左上角帧率。
export const DEBUG_TOOL_IDS = Object.freeze([
  "debugRendering", "profiler", "frameDebugger", "worldInfo", "playerState", "ai", "fps",
]);

// 高级工具清单（id -> 文案 / 独立窗口 / 是否先选关卡）。标题菜单列工具要用，编辑器的 static label / hint 与
// window.open 参数也读这里，所以只放纯值、不 import 任何东西。
export const TOOL_INFO = Object.freeze({
  sceneEditor: { label: "场景编辑器", hint: "打开独立场景编辑器窗口：摆物件、改尺寸材质与开关、存回 Scenes 场景文件",
    window: { url: "./SceneEditor.html", name: "TengxianSceneEditor", features: "popup,width=1600,height=1000" } },
  environment: { label: "环境", hint: "组件式环境：区域（兜底 / 局部）、预设（主光 / 环境光 / 天空 / 雾……）、昼夜时间轴（打开后整页切到白盒编辑器）" },
  splines: { label: "场景样条PCG", hint: "铁路/道路/大街/围墙的样条中心线：预览、拖点、调参、导出（数据仍在各源文件）", level: true },
  propPcg: { label: "PCG 撒点", hint: "按院落/矩形/样条规则自动布设生活用具与工事，并取证 GPU 实例桶", level: true },
  blockout: { label: "白盒关卡编辑器", hint: "关卡白盒预览：分关卡的纯高度图场景、关键帧敌我布设与去向、俯视图与导航栏（打开后整页切换）" },
  timeline: { label: "Timeline 过场", hint: "过场时间轴：第一关开场 01-1…02-3（白盒预演、试玩播的就是这一份），走白盒编辑器的预演播放器（打开后整页切换）" },
  squadMarch: { label: "小队行进", hint: "配置人数、路线与随机样式，预览真实人物的错峰跑停" },
  actor: { label: "人物动作", hint: "预览十套原模型、骨骼动作与连续姿态切换" },
  facial: { label: "人物面部", hint: "配套对白、口型与表情近景检查" },
  mixamoPreview: { label: "Mixamo 动作预览", hint: "打开独立窗口：Mixamo 通用动作按分类与端枪 / 空手预览，角色默认带已配置的头发胡子及项目道具",
    window: { url: "./Tool_MixamoAnimationPreview.html?v=20261110bonebinding", name: "TengxianMixamoPreview", features: "popup,width=1600,height=1000" } },
  weapon: { label: "枪械", hint: "台架 + 数据卡" },
  firstPerson: { label: "第一人称持枪检查", hint: "枪/手榴弹切换、玩家/外部视角、真实挂点与骨骼残差、准心校准" },
  fpMotion: { label: "第一人称持枪移动检查", hint: "玩法照跑，画面换到玩家身旁的外部机位，看第一人称看不到的腿脚、身体朝向、枪和双手的实际位置；J 换机位、K 慢放、L 切回第一人称" },
  vfx: { label: "特效预览", hint: "查看火焰、烟雾、爆炸、命中、枪口焰与曳光" },
  audio: { label: "音效音乐", hint: "全部配方的试听、混音参数与盲听指认" },
  props: { label: "构件库预览", hint: "逐项预览场景可布设的全部 Prop、构件与模型" },
  assetStandards: { label: "资产规范", hint: "原始/实际面数、减面阈值、目标、贴图策略与合规状态总表" },
  textures: { label: "贴图管理", hint: "打开独立贴图管理窗口：导入设置、发布压缩与程序化预览",
    window: { url: "./TextureManager.html", name: "TengxianTextureManager", features: "popup,width=1600,height=1000" } },
});

// 菜单栏与工具首页的分组与顺序（Script_Editor 按它生成，缺编辑器类直接 throw）。
export const TOOL_MENUS = Object.freeze([
  { id: "scene", label: "场景", items: ["sceneEditor", "environment", "splines", "propPcg"] },
  { id: "level", label: "关卡", items: ["blockout", "timeline", "squadMarch"] },
  { id: "character", label: "角色", items: ["actor", "facial", "mixamoPreview"] },
  { id: "weapon", label: "武器", items: ["weapon", "firstPerson", "fpMotion"] },
  { id: "media", label: "特效与声音", items: ["vfx", "audio"] },
  { id: "assets", label: "资产", items: ["props", "assetStandards", "textures"] },
]);
