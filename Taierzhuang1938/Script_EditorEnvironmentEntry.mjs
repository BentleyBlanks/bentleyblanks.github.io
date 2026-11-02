// 高级工具菜单栏「场景」菜单里的「环境」一项（docs/Data_Environment.md §8）。照 BlockoutEntry / TimelineEditor 的写法：
// 只有静态 id / label / hint / Open()，不进互斥编辑器表 —— 环境面板长在白盒编辑器里（场景的区域与预设在那儿建场、预览）。
// 已经在白盒编辑器里：直接开面板，不重载；否则整页跳到 ?editor=blockout&level=<默认段>&env=1。

import { BLOCKOUT_DEFAULT_LEVEL } from "./Script_EditorBlockoutLevels.mjs";

const KEEP_PARAMS = ["scale", "audio", "quality"];

export class EnvironmentEntry {
  static id = "environment";
  static label = "环境";
  static hint = "组件式环境：区域（兜底 / 局部）、预设（主光 / 环境光 / 天空 / 雾……）、昼夜时间轴（打开后整页切到白盒编辑器）";

  static Url(href = globalThis.location?.href || "") {
    const current = new URL(href);
    const url = new URL(current.pathname, current.origin);
    url.searchParams.set("editor", "blockout");
    url.searchParams.set("level", BLOCKOUT_DEFAULT_LEVEL);
    url.searchParams.set("env", "1");
    for (const key of KEEP_PARAMS) {
      const value = current.searchParams.get(key);
      if (value !== null) url.searchParams.set(key, value);
    }
    return url.toString();
  }

  static Open() {
    const inPage = new URLSearchParams(globalThis.location?.search || "").get("editor") === "blockout";
    const api = globalThis.Tengxian?.Debug?.Blockout?.Environment;
    if (inPage && api) { api.Open(); return null; }
    const url = this.Url();
    globalThis.location.assign(url);
    return url;
  }
}
