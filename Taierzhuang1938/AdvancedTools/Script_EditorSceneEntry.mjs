// 高级工具「场景」菜单的「场景编辑器」：只是打开独立窗口 SceneEditor.html（docs/Data_Scene.md §6），同贴图管理。
import { TOOL_INFO } from "../Data_DevTools.mjs";

// TOOL_INFO.window.url 相对 Taierzhuang1938/ 根，这个模块已搬进 AdvancedTools/。
const GAME_BASE = new URL("../", import.meta.url);

export class SceneEditorEntry {
  static id = "sceneEditor";
  static label = TOOL_INFO.sceneEditor.label;
  static hint = TOOL_INFO.sceneEditor.hint;
  static win = null;
  static Open() {
    if (!this.win || this.win.closed) {
      this.win = window.open(new URL(TOOL_INFO.sceneEditor.window.url, GAME_BASE), TOOL_INFO.sceneEditor.window.name, TOOL_INFO.sceneEditor.window.features);
    }
    if (!this.win) throw new Error("场景编辑器窗口被拦截，请允许弹窗后重试");
    this.win.focus();
    return this.win;
  }
}
