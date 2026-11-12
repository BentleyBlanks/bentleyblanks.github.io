// 高级工具菜单栏「角色」菜单里的「Mixamo 动作预览」一项（2026-11-01）。
// 照 TextureEditor 的写法：只有静态 id / label / hint / Open()，不进互斥编辑器表 ——
// 预览页 Tool_MixamoAnimationPreview.html 自带场景和相机，开在独立窗口里，不碰游戏画面。
//
// 动作库在 Animation/Mixamo（GLB + Data_MixamoLibrary.json），源 FBX 与自制动作的 .blend 在 _import/Mixamo。
// 整理与下载流程见 _import/Script_MixamoLibraryFetch.mjs、_import/Data_MixamoLibraryCurate.mjs。

import { TOOL_INFO } from "../Data_DevTools.mjs";

// TOOL_INFO.window.url 相对 Taierzhuang1938/ 根，这个模块已搬进 AdvancedTools/。
const GAME_BASE = new URL("../", import.meta.url);

export class MixamoPreviewEditor {
  static id = "mixamoPreview";
  static label = TOOL_INFO.mixamoPreview.label;
  static hint = TOOL_INFO.mixamoPreview.hint;
  static win = null;
  static Open() {
    if (!this.win || this.win.closed) {
      this.win = window.open(new URL(TOOL_INFO.mixamoPreview.window.url, GAME_BASE), TOOL_INFO.mixamoPreview.window.name, TOOL_INFO.mixamoPreview.window.features);
    }
    if (!this.win) throw new Error("动作预览窗口被拦截，请允许弹窗后重试");
    this.win.focus();
    return this.win;
  }
}
