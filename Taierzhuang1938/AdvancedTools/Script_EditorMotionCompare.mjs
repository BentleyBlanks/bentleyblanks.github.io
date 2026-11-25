// 高级工具菜单栏「角色」菜单里的「动作衔接对比」一项（2026-11-21）。
// 照 MixamoPreviewEditor 的写法：独立窗口运行 Tool_MotionCompare.html，左右分屏实机对比 3C 动作系统优化前后。

import { TOOL_INFO } from "../Data_DevTools.mjs";

const GAME_BASE = new URL("../", import.meta.url);

export class MotionCompareEditor {
  static id = "motionCompare";
  static label = TOOL_INFO.motionCompare.label;
  static hint = TOOL_INFO.motionCompare.hint;
  static win = null;
  static Open() {
    if (!this.win || this.win.closed) {
      this.win = window.open(
        new URL(TOOL_INFO.motionCompare.window.url, GAME_BASE),
        TOOL_INFO.motionCompare.window.name,
      );
    }
    if (!this.win) throw new Error("动作衔接对比标签页被拦截，请允许弹出页面后重试");
    this.win.focus();
    return this.win;
  }
}
