export class TextureEditor {
  static id = "textures";
  static label = "贴图管理";
  static hint = "打开独立贴图管理窗口：导入设置、发布压缩与程序化预览";
  static win = null;
  static Open() {
    if (!this.win || this.win.closed) {
      this.win = window.open(new URL("./TextureManager.html", import.meta.url), "TengxianTextureManager", "popup,width=1600,height=1000");
    }
    if (!this.win) throw new Error("贴图管理窗口被拦截，请允许弹窗后重试");
    this.win.focus();
    return this.win;
  }
}
