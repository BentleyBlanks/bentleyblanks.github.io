import { TOOL_INFO } from "../Data_DevTools.mjs";
import { FirstPersonEditor } from "./Script_EditorFirstPerson.mjs";

const GAME_BASE = new URL("../", import.meta.url);

export class FirstPersonInspectionEntry {
  static id = "firstPerson";
  static label = TOOL_INFO.firstPerson.label;
  static hint = TOOL_INFO.firstPerson.hint;
  static harness = FirstPersonEditor;
  static win = null;

  static Open() {
    if (!this.win || this.win.closed) {
      const { url, name, features } = TOOL_INFO.firstPerson.window;
      this.win = window.open(new URL(url, GAME_BASE), name, features);
    }
    if (!this.win) throw new Error("第一人称持枪检查窗口被拦截，请允许弹窗后重试");
    this.win.focus();
    return this.win;
  }
}
