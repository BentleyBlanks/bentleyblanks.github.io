import { TOOL_INFO } from "../Data_DevTools.mjs";

const GAME_BASE = new URL("../", import.meta.url);

export class WeaponInspectionEntry {
  static id = "weapon";
  static label = TOOL_INFO.weapon.label;
  static hint = TOOL_INFO.weapon.hint;
  static win = null;

  static Open() {
    if (!this.win || this.win.closed) {
      const { url, name, features } = TOOL_INFO.weapon.window;
      this.win = window.open(new URL(url, GAME_BASE), name, features);
    }
    if (!this.win) throw new Error("枪械检查台窗口被拦截，请允许弹窗后重试");
    this.win.focus();
    return this.win;
  }
}
