// AdvancedTool ControlCenter 的目录表：纯值、零依赖（不 import 任何模块，node 测试与控制中心页都能直接读）。
//
// 分四类：
//   · studio：只在控制中心出现、共享独立工具宿主 Tool_Studio.html?tool=<id>（不进游戏菜单与拆分边界）；
//   · window：独立工具页（页面地址与标签页目标名在 Data_DevTools.TOOL_INFO.window，均以普通浏览器标签页打开）；
//   · game：留在游戏里的工具（白盒关卡与 Timeline），控制中心只列一张「游戏内」卡片链到游戏现有入口；
//   · standalone：只在控制中心出现的独立页面，文案与目标名就写在这里。
// Debug工具不列。Tool_FirstLevelSpaceMap.html、Probe.html 不在这里。
//
// 路径口径：下面的地址都以 AdvancedTools/ 目录里的页面为基准（`./` = AdvancedTools/，`../` = Taierzhuang1938/）。

/** 只在控制中心与 Tool_Studio.html 出现的摄影棚工具：已彻底切出游戏内 EditorSuite 与 Data_DevTools。 */
export const STUDIO_TOOLS = Object.freeze([
  Object.freeze({ id: "actor", group: "character", groupLabel: "角色", slot: "lead",
    label: "人物动作", hint: "预览十套原模型、骨骼动作与连续姿态切换" }),
  Object.freeze({ id: "facial", group: "character", groupLabel: "角色", slot: "lead",
    label: "人物面部", hint: "配套对白、口型与表情近景检查" }),
]);

export const STUDIO_TOOL_IDS = Object.freeze(STUDIO_TOOLS.map((tool) => tool.id));

export const WINDOW_TOOL_IDS = Object.freeze(["sceneEditor", "levelFlow", "mixamoPreview", "motionCompare", "motionWorkbench", "weapon", "firstPerson", "vfx", "textures", "splines", "propPcg"]);

export const GAME_TOOL_IDS = Object.freeze(["blockout", "timeline"]);

/**
 * 只在控制中心出现的独立工具：游戏的高级工具菜单、Data_DevTools.TOOL_INFO 与拆分边界里都没有它们。
 *   group 归哪一组（Data_DevTools.TOOL_MENUS 的 id）；slot "lead" 排在该组游戏工具之前，"tail" 排在之后；
 *   window.url 相对 AdvancedTools/；不写 popup features，直接以普通标签页打开。
 */
export const STANDALONE_TOOLS = Object.freeze([
  Object.freeze({ id: "characterWorkbench", group: "character", slot: "tail", label: "角色制作管线",
    hint: "角色三视图、拆件参考、Tripo 建模与骨骼绑定",
    window: Object.freeze({ url: "./Tool_CharacterWorkbench.html", name: "TengxianCharacterWorkbench" }) }),
  Object.freeze({ id: "props", group: "assets", slot: "lead", label: "构件库预览",
    hint: "只读浏览场景可布设的全部 Prop 与模型：尺寸、面数、来源",
    window: Object.freeze({ url: "./Tool_PropLibrary.html", name: "TengxianPropLibrary" }) }),
  Object.freeze({ id: "assetStandards", group: "assets", slot: "lead", label: "资产规范与限制",
    hint: "资产导出规范的配置与合规预览：面数阈值、特例目标、逐件登记、贴图规则（存 AssetPipeline/Data_AssetStandards.json，不进游戏）",
    window: Object.freeze({ url: "./Tool_AssetStandards.html", name: "TengxianAssetStandards" }) }),
  Object.freeze({ id: "modelWorkbench", group: "assets", slot: "tail", label: "3D 模型制作工作台",
    hint: "管理参考图、Blender 建模、同视角比对与独立验收",
    window: Object.freeze({ url: "./Tool_ModelWorkbench.html?v=20261127Tripo", name: "TengxianModelWorkbench" }) }),
  Object.freeze({ id: "testScenes", group: "level", slot: "tail", label: "测试场景",
    hint: "独立测试场景入口：进入 10 个功能测试场或跳进场景编辑器编辑",
    window: Object.freeze({ url: "./TestScenes.html", name: "TengxianTestScenes" }) }),
  Object.freeze({ id: "squadSplinePreview", group: "level", slot: "tail", label: "小队 PCG 样条预览",
    hint: "独立预览各行进 Profile、走廊宽窄自适应、跨队交叉避让与行进间左顾右盼（复用场景配置，不接入游戏）",
    window: Object.freeze({ url: "./Tool_SquadSplinePreview.html", name: "TengxianSquadSplinePreview" }) }),
  Object.freeze({ id: "audio", group: "media", slot: "tail", label: "音效音乐",
    hint: "在新标签页打开：全部配方的试听、混音参数与盲听指认",
    window: Object.freeze({ url: "./Tool_AudioPreview.html", name: "TengxianAudioPreview" }) }),
]);

/** 控制中心页（相对游戏根目录 Taierzhuang1938/，Tool_Studio 的「返回控制中心」用）。 */
export const CONTROL_CENTER_URL = "./AdvancedTools/ControlCenter.html";

/** 独立工具宿主页（相对 AdvancedTools/）。 */
export const STUDIO_PAGE = "./Tool_Studio.html";

/** 游戏主页（相对 AdvancedTools/）。 */
export const GAME_PAGE = "../index.html";

/** 某个摄影棚类工具在独立宿主里的地址（相对 AdvancedTools/）。 */
export function StudioToolUrl(id) {
  return `${STUDIO_PAGE}?tool=${encodeURIComponent(id)}`;
}

/** 留在游戏里的工具的通用入口：游戏的高级工具首页带 tool 参数（需要选关卡的工具首页会先弹「载入哪一关」）。 */
export function GameToolUrl(id) {
  return `${GAME_PAGE}?editor=tools&tool=${encodeURIComponent(id)}`;
}
