// AdvancedTool ControlCenter 的目录表：纯值、零依赖（不 import 任何模块，node 测试与控制中心页都能直接读）。
//
// 分三类：
//   · studio：九个摄影棚类工具，跑在独立工具宿主 Tool_Studio.html?tool=<id> 里；
//   · window：四个本来就是独立网页的工具，各开自己的页面（页面地址与窗口参数在 Data_DevTools.TOOL_INFO.window）；
//   · game：留在游戏里的工具（场景 / 关卡类与第一人称持枪移动检查），控制中心只列一张「游戏内」卡片链到游戏现有入口。
// Debug工具不列。Tool_FirstLevelSpaceMap.html、Probe.html 不在这里。
//
// 路径口径：下面的地址都以 AdvancedTools/ 目录里的页面为基准（`./` = AdvancedTools/，`../` = Taierzhuang1938/）。

export const STUDIO_TOOL_IDS = Object.freeze([
  "assetStandards", "audio", "props", "actor", "facial", "squadMarch", "weapon", "firstPerson", "vfx",
]);

export const WINDOW_TOOL_IDS = Object.freeze(["sceneEditor", "levelFlow", "mixamoPreview", "textures"]);

export const GAME_TOOL_IDS = Object.freeze(["environment", "splines", "propPcg", "blockout", "timeline", "fpMotion"]);

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
