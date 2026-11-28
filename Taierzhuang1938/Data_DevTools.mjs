// 开发工具边界（零依赖的那一半）：菜单要知道「有没有开发工具、Debug工具有哪几项」，
// 但标题菜单不许为此把整套编辑器拉进包里，所以这张表只放 id 与纯值，不 import 任何编辑器。
//
// ## 打包剔除
// 运行时代码只经两个模块碰开发工具：本表与 Script_DevTools.mjs（游戏宿主才装的编辑器套件）。
// 剔除 = 构建时把这两个模块换成同名 *Stub（Script_BuildBrowserBundle --strip-dev-tools），
// 其余代码不改；菜单的「Debug工具」「高级工具」两项随 DEV_TOOLS_ENABLED 一起消失。
// 守门：Script_DevToolsIsolationTest.mjs。

import { SPLIT_TOOLS_AVAILABLE } from "./Data_DevToolsSplit.mjs";

export const DEV_TOOLS_ENABLED = true;

// 设置 → Debug工具 那一页的条目与顺序。前七项是 Script_Editor 的叠加层 id
// （不接管相机、玩法照跑，关掉菜单回去边打边看）；fps 是 HUD 左上角帧率。
export const DEBUG_TOOL_IDS = Object.freeze([
  "debugRendering", "profiler", "frameDebugger", "worldInfo", "playerState", "ai", "environment", "fps",
]);

// split: true = 工具源码已拆到 AdvancedTools/（独立控制中心 / 工具宿主），游戏里的入口靠 Data_DevToolsSplit 决定留不留；
// window.url 相对 Taierzhuang1938/ 根（入口类在 AdvancedTools/ 里，用 ../ 为基准解析）。
// 高级工具清单（id -> 文案 / 独立页面标签页目标 / 是否先选关卡）。标题菜单列工具要用，编辑器的 static label / hint 与
// 新标签页打开参数也读这里，所以只放纯值、不 import 任何东西；不写 popup/尺寸 features，默认作为普通浏览器标签页打开。
export const TOOL_INFO = Object.freeze({
  sceneEditor: { label: "场景编辑器", hint: "在新标签页打开场景编辑器：摆物件、改尺寸材质与开关、存回 Scenes 场景文件", split: true,
    window: { url: "./AdvancedTools/SceneEditor.html", name: "TengxianSceneEditor" } },
  splines: { split: true, window: { url: "./AdvancedTools/Tool_Pcg.html?tool=splines", name: "TengxianSplineTool" }, label: "场景样条PCG", hint: "铁路/道路/大街/围墙的样条中心线：预览、拖点、调参、导出（数据仍在各源文件）" },
  propPcg: { split: true, window: { url: "./AdvancedTools/Tool_Pcg.html?tool=propPcg", name: "TengxianPropPcgTool" }, label: "PCG 撒点", hint: "按院落/矩形/样条规则自动布设生活用具与工事，并取证 GPU 实例桶" },
  blockout: { label: "白盒关卡编辑器", hint: "关卡白盒预览：分关卡的纯高度图场景、关键帧敌我布设与去向、俯视图与导航栏（打开后整页切换）" },
  timeline: { label: "Timeline 过场", hint: "过场时间轴：第一关开场 01-1…02-3（白盒预演、试玩播的就是这一份），走白盒编辑器的预演播放器（打开后整页切换）" },
  levelFlow: { label: "Encounter Designer", hint: "多视口同步预演剧情，截图标注并通过本机会话提交修改需求", split: true,
    window: { url: "./AdvancedTools/Tool_LevelFlow.html", name: "TengxianLevelFlow" } },
  mixamoPreview: { label: "Mixamo 动作预览", hint: "在新标签页打开：Mixamo 通用动作按分类与端枪 / 空手预览，角色默认带已配置的头发胡子及项目道具", split: true,
    window: { url: "./AdvancedTools/Tool_MixamoAnimationPreview.html?v=20261113earclearance", name: "TengxianMixamoPreview" } },
  motionCompare: { label: "动作衔接对比", hint: "在新标签页打开：左右同步分屏对比 3C 动作系统优化前后（2D 混合 / 朝向扭曲 / 原地转身 / Blender 9 帧 Aim Offset / 开火叠加 / 第一人称横移）", split: true,
    window: { url: "./AdvancedTools/Tool_MotionCompare.html", name: "TengxianMotionCompare" } },
  motionWorkbench: { label: "AI 动作生成", hint: "在新标签页打开：分镜出图（4 源切换）→ Seedance / MiniMax-H3 视频生成 → GEM-X 77 骨动捕提取与 Mixamo 3D 重定向", split: true,
    window: { url: "./AdvancedTools/Tool_MotionWorkbench.html", name: "TengxianMotionWorkbench" } },
  weapon: { label: "枪械检查台", hint: "查看模型外观、挂点和尺寸", split: true,
    window: { url: "./AdvancedTools/Tool_WeaponInspection.html", name: "TengxianWeaponInspection" } },
  firstPerson: { label: "第一人称持枪检查", hint: "在新标签页打开靶场：第一人称持枪试射、真实装填与慢放逐帧、连射拉栓与移动惯性前后对比", split: true,
    window: { url: "./AdvancedTools/Tool_FirstPersonInspection.html", name: "TengxianFirstPersonInspection" } },
  vfx: { label: "特效预览", hint: "在新标签页打开：查看火焰、烟雾、爆炸、命中、枪口焰与曳光；昼夜取环境预设", split: true,
    window: { url: "./AdvancedTools/Tool_VfxPreview.html", name: "TengxianVfxPreview" } },
  textures: { label: "贴图管理", hint: "在新标签页打开贴图管理：导入设置、发布压缩与程序化预览", split: true,
    window: { url: "./AdvancedTools/TextureManager.html", name: "TengxianTextureManager" } },
});

// 菜单栏与工具首页的分组与顺序（Script_Editor 按它生成，缺编辑器类直接 throw）。
const TOOL_MENU_DEFS = [
  { id: "scene", label: "场景", items: ["sceneEditor", "splines", "propPcg"] },
  { id: "level", label: "关卡", items: ["blockout", "timeline", "levelFlow"] },
  { id: "character", label: "角色", items: ["mixamoPreview", "motionCompare", "motionWorkbench"] },
  { id: "weapon", label: "武器", items: ["weapon", "firstPerson"] },
  { id: "media", label: "特效与声音", items: ["vfx"] },
  { id: "assets", label: "资产", items: ["textures"] },
];
// 已拆出去的工具在剔除拆分边界的版本（线上发布）里不列；一整组都拆走了就连这一组也不列。
export const TOOL_MENUS = Object.freeze(TOOL_MENU_DEFS
  .map((menu) => ({ ...menu, items: menu.items.filter((id) => !TOOL_INFO[id].split || SPLIT_TOOLS_AVAILABLE) }))
  .filter((menu) => menu.items.length));
