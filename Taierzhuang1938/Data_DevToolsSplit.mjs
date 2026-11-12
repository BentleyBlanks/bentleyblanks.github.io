// 开发工具拆分边界（零依赖的那一半）：菜单要知道「拆出去的高级工具在这个版本里还在不在」，
// 但标题菜单不许为此把 AdvancedTools/ 里的编辑器拉进包里，所以这里只放一个纯值。
//
// ## 线上剔除
// 运行时代码只经两个模块碰 AdvancedTools/：本表与 Script_DevToolsSplit.mjs。
// Pages 发布时把这两个模块换成同名 *Stub（Script_BuildBrowserBundle --deploy / --strip-dev-tools），
// 发布副本也不含 AdvancedTools/ 目录；Data_DevTools.TOOL_MENUS 按 split + 本值过滤，已拆出的工具随之从菜单消失。
// 守门：Script_DevToolsIsolationTest.mjs。

export const SPLIT_TOOLS_AVAILABLE = true;
