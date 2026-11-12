import { TOOL_INFO } from "../Data_DevTools.mjs";

// TOOL_INFO.window.url 相对 Taierzhuang1938/ 根，这个模块已搬进 AdvancedTools/。
const GAME_BASE = new URL("../", import.meta.url);

export class TextureEditor {
  static id = "textures";
  static label = TOOL_INFO.textures.label;
  static hint = TOOL_INFO.textures.hint;
  static win = null;
  static Open() {
    if (!this.win || this.win.closed) {
      this.win = window.open(new URL(TOOL_INFO.textures.window.url, GAME_BASE), TOOL_INFO.textures.window.name, TOOL_INFO.textures.window.features);
    }
    if (!this.win) throw new Error("贴图管理窗口被拦截，请允许弹窗后重试");
    this.win.focus();
    return this.win;
  }
}
