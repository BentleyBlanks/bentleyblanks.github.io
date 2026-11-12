import { TOOL_INFO } from "./Data_DevTools.mjs";

export class LevelFlowEntry {
  static id = "levelFlow";
  static label = TOOL_INFO.levelFlow.label;
  static hint = TOOL_INFO.levelFlow.hint;
  static win = null;

  static Open() {
    if (!this.win || this.win.closed) {
      const info = TOOL_INFO.levelFlow.window;
      this.win = window.open(new URL(info.url, import.meta.url), info.name, info.features);
    }
    if (!this.win) throw new Error("遭遇设计窗口被拦截，请允许弹窗后重试");
    this.win.focus();
    return this.win;
  }
}
