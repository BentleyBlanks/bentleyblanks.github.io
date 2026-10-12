// 高级工具菜单栏「关卡」菜单里的「白盒关卡编辑器」一项
//（docs/Data_EditorBlockout.md §1）。照 TextureEditor 的写法：只有静态 id / label / hint / Open()，
// 不进互斥编辑器表 —— 白盒编辑器是一整套独立入口（?editor=blockout），打开就是换页面。
//
// 跳转时保留当前的画质 / 规模 / 音频参数，去掉关卡类参数（whitebox / missionStage / phase …），
// 默认进第一关。已经在白盒编辑器里时这个按钮显示为当前项，点了不重载。

const KEEP_PARAMS = ["quality", "scale", "audio"];

export class BlockoutEntry {
  static id = "blockout";
  static label = "白盒关卡编辑器";
  static hint = "关卡白盒预览：分关卡的纯高度图场景、关键帧敌我布设与去向、俯视图与导航栏（打开后整页切换）";

  /** 当前页面就是白盒编辑器。 */
  static Active(search = globalThis.location?.search || "") {
    return new URLSearchParams(search).get("editor") === "blockout";
  }

  /** 目标地址：?editor=blockout&level=FirstLevel，只带上画质 / 规模 / 音频。 */
  static Url(href = globalThis.location?.href || "") {
    const current = new URL(href);
    const url = new URL(current.pathname, current.origin);
    url.searchParams.set("editor", "blockout");
    url.searchParams.set("level", "FirstLevel");
    for (const key of KEEP_PARAMS) {
      const value = current.searchParams.get(key);
      if (value !== null) url.searchParams.set(key, value);
    }
    return url.toString();
  }

  static Open() {
    if (this.Active()) return null;
    const url = this.Url();
    globalThis.location.assign(url);
    return url;
  }
}
