import { TOOL_INFO } from "../Data_DevTools.mjs";

// TOOL_INFO.window.url 相对 Taierzhuang1938/ 根，这个模块已搬进 AdvancedTools/。
const GAME_BASE = new URL("../", import.meta.url);

export class LevelFlowEntry {
  static id = "levelFlow";
  static label = TOOL_INFO.levelFlow.label;
  static hint = TOOL_INFO.levelFlow.hint;
  static win = null;

  static Open() {
    if (!this.win || this.win.closed) {
      const info = TOOL_INFO.levelFlow.window;
      this.win = window.open(new URL(info.url, GAME_BASE), info.name, info.features);
    }
    if (!this.win) throw new Error("遭遇设计窗口被拦截，请允许弹窗后重试");
    this.win.focus();
    return this.win;
  }
}
