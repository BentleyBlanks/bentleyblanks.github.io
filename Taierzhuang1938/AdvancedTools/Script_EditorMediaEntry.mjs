// 游戏里「高级工具 → 特效与声音 → 特效预览」的入口：只负责打开独立窗口，不在游戏里建任何工具。
//
// 特效预览另带 harness：游戏内的照明弹 / 粒子回归测试（?editor=vfx、Debug.OpenEditor）要在
// 正片的灯光与后处理下量画面，那条路径照旧把同一个 VfxEditor 装进游戏宿主；菜单与控制中心
// 打开的永远是独立窗口。

import { TOOL_INFO } from "../Data_DevTools.mjs";
import { VfxEditor } from "./Script_EditorVfx.mjs";

const GAME_BASE = new URL("../", import.meta.url);

function OpenToolWindow(Entry, missingLabel) {
  if (!Entry.win || Entry.win.closed) {
    const { url, name } = TOOL_INFO[Entry.id].window;
    Entry.win = window.open(new URL(url, GAME_BASE), name);
  }
  if (!Entry.win) throw new Error(`${missingLabel}标签页被拦截，请允许弹出页面后重试`);
  Entry.win.focus();
  return Entry.win;
}

export class VfxPreviewEntry {
  static id = "vfx";
  static label = TOOL_INFO.vfx.label;
  static hint = TOOL_INFO.vfx.hint;
  static harness = VfxEditor;
  static win = null;
  static Open() { return OpenToolWindow(this, TOOL_INFO.vfx.label); }
}
