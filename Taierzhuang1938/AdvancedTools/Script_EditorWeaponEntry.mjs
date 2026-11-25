import { TOOL_INFO } from "../Data_DevTools.mjs";

const GAME_BASE = new URL("../", import.meta.url);

export class WeaponInspectionEntry {
  static id = "weapon";
  static label = TOOL_INFO.weapon.label;
  static hint = TOOL_INFO.weapon.hint;
  static win = null;

  static Open() {
    if (!this.win || this.win.closed) {
      const { url, name } = TOOL_INFO.weapon.window;
      this.win = window.open(new URL(url, GAME_BASE), name);
    }
    if (!this.win) throw new Error("枪械检查台标签页被拦截，请允许弹出页面后重试");
    this.win.focus();
    return this.win;
  }
}
