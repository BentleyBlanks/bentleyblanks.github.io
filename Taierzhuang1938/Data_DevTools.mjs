// 开发工具边界（零依赖的那一半）：菜单要知道「有没有开发工具、Debug工具有哪几项」，
// 但标题菜单不许为此把整套编辑器拉进包里，所以这张表只放 id，不 import 任何编辑器。
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
