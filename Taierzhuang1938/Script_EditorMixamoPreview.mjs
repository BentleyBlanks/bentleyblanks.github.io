// 高级工具菜单栏「角色」菜单里的「Mixamo 动作预览」一项（2026-11-01）。
// 照 TextureEditor 的写法：只有静态 id / label / hint / Open()，不进互斥编辑器表 ——
// 预览页 Tool_MixamoAnimationPreview.html 自带场景和相机，开在独立窗口里，不碰游戏画面。
//
// 动作文件只在本机 tmp/Mixamo（Mixamo 不许再分发原始动作，不进仓库）：线上打开只会看到「读不到动作库」。
// 整理与下载流程见 _import/Script_MixamoLibraryFetch.mjs、_import/Data_MixamoLibraryCurate.mjs。

export class MixamoPreviewEditor {
  static id = "mixamoPreview";
  static label = "Mixamo 动作预览";
  static hint = "打开独立窗口：Mixamo 通用动作按分类与端枪 / 空手预览，挂项目的步枪、手榴弹、大刀（动作文件只在本机）";
  static win = null;
  static Open() {
    if (!this.win || this.win.closed) {
      this.win = window.open(new URL("./Tool_MixamoAnimationPreview.html", import.meta.url), "TengxianMixamoPreview", "popup,width=1600,height=1000");
    }
    if (!this.win) throw new Error("动作预览窗口被拦截，请允许弹窗后重试");
    this.win.focus();
    return this.win;
  }
}
