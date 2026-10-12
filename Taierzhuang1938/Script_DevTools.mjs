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

// 白盒关卡编辑器（?editor=blockout，docs/Data_EditorBlockout.md）也是开发工具：关卡表与总控都从这里给宿主。
import { BLOCKOUT_PHASES, BlockoutLevelIndex } from "./Script_EditorBlockoutLevels.mjs";

/** 编辑器模式的关卡表（每关一片 phase）。剔除版返回空表。 */
export function BlockoutPhases() {
  return BLOCKOUT_PHASES;
}

/** ?level= 对应的起始关卡下标。 */
export function BlockoutStartIndex(levelKey) {
  return BlockoutLevelIndex(levelKey);
}

/** 建白盒关卡编辑器总控（按需载入，平常开游戏不下载）。剔除版返回 null。 */
export async function CreateBlockoutEditor(host) {
  const { EditorBlockout } = await import("./Script_EditorBlockout.mjs");
  return new EditorBlockout(host);
}
