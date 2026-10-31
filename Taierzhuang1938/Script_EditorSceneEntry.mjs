// 高级工具「场景」菜单的「场景编辑器」：只是打开独立窗口 SceneEditor.html（docs/Data_Scene.md §6），同贴图管理。
export class SceneEditorEntry {
  static id = "sceneEditor";
  static label = "场景编辑器";
  static hint = "打开独立场景编辑器窗口：摆物件、改尺寸材质与开关、存回 Scenes 场景文件";
  static win = null;
  static Open() {
    if (!this.win || this.win.closed) {
      this.win = window.open(new URL("./SceneEditor.html", import.meta.url), "TengxianSceneEditor", "popup,width=1600,height=1000");
    }
    if (!this.win) throw new Error("场景编辑器窗口被拦截，请允许弹窗后重试");
    this.win.focus();
    return this.win;
  }
}
