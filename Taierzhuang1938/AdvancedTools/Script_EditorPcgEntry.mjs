// 游戏中的 PCG 入口只负责打开独立验证窗口。
import { TOOL_INFO } from "../Data_DevTools.mjs";

const GAME_BASE = new URL("../", import.meta.url);
class PcgEntry {
  static Open() {
    const info = TOOL_INFO[this.id].window;
    if (!this.win || this.win.closed) {
      const url = new URL(info.url, GAME_BASE);
      const current = new URLSearchParams(globalThis.location?.search || "");
      for (const key of ["phase", "whitebox", "quality", "scale", "audio"]) {
        if (current.has(key)) url.searchParams.set(key, current.get(key));
      }
      this.win = window.open(url, info.name, info.features);
    }
    if (!this.win) throw new Error(`${TOOL_INFO[this.id].label}窗口被拦截，请允许弹窗后重试`);
    this.win.focus();
    return this.win;
  }
}
export class SplineEntry extends PcgEntry {
  static id = "splines";
  static label = TOOL_INFO.splines.label;
  static hint = TOOL_INFO.splines.hint;
}
export class PropPcgEntry extends PcgEntry {
  static id = "propPcg";
  static label = TOOL_INFO.propPcg.label;
  static hint = TOOL_INFO.propPcg.hint;
}
