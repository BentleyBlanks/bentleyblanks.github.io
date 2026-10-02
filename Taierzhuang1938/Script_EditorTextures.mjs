export class TextureEditor {
  static id = "textures";
  static label = "贴图管理";
  static hint = "普通贴图导入设置、发布压缩与程序化配方预览";
  static keepOnClose = true;
  constructor(host) { this.host = host; this.win = null; }
  Enter() {
    this.win = window.open(new URL("./TextureManager.html", import.meta.url), "TengxianTextureManager", "popup,width=1440,height=940");
    if (!this.win) throw new Error("贴图管理窗口被拦截，请允许弹窗后重试");
  }
  Update() { if (this.win?.closed) this.host.CloseTextures(); }
  Exit() { this.win?.close(); this.win = null; }
}
