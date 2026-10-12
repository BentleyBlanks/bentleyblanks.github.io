// 开发工具边界（游戏宿主那一半）：整套编辑器（高级工具 + Debug工具叠加层）的唯一入口。
//
// Script_Main 只认这里的 CreateDevTools，不直接 import 任何 Script_Editor* 模块；
// 剔除版 Script_DevToolsStub.mjs 返回 null，宿主按「没有开发工具」照常跑
// （设置页走 Script_SettingsHost，不经编辑器）。为什么分两个边界模块见 Data_DevTools.mjs。

import { EditorSuite } from "./Script_Editor.mjs";

/** 建编辑器套件。host 的字段见 EditorSuite 构造函数注释。 */
export function CreateDevTools(host) {
  return new EditorSuite(host);
}
