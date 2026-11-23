// 高级工具控制中心「角色」分类里的「AI 动作生成」独立窗口入口。
// 照 MixamoPreviewEditor 写法：仅声明静态 id / label / hint / Open()，不进入游戏互斥编辑器表；
// 实际工作台页 Tool_MotionWorkbench.html 在本地预览服挂载的 /__motion-workbench/ 上运行。

import { TOOL_INFO } from "../Data_DevTools.mjs";

const GAME_BASE = new URL("../", import.meta.url);

export class MotionWorkbenchEditor {
  static id = "motionWorkbench";
  static label = TOOL_INFO.motionWorkbench.label;
  static hint = TOOL_INFO.motionWorkbench.hint;
  static win = null;
  static Open() {
    if (!this.win || this.win.closed) {
      this.win = window.open(
        new URL(TOOL_INFO.motionWorkbench.window.url, GAME_BASE),
        TOOL_INFO.motionWorkbench.window.name,
        TOOL_INFO.motionWorkbench.window.features
      );
    }
    if (!this.win) throw new Error("AI 动作生成窗口被拦截，请允许弹窗后重试");
    this.win.focus();
    return this.win;
  }
}
