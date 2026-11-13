// Debug 工具中的环境配置窗口。窗口复用 EnvironmentEditor，与宿主共用环境运行时。
export class EnvironmentWindowEditor {
  static id = "environment";
  static label = "环境";
  static hint = "独立窗口：加载目标场景的环境配置，查看和编辑组件参数";
  static keepOnClose = true;

  constructor(host) {
    this.host = host;
    this.win = null;
  }

  Enter() {
    const system = this.host.environment?.system;
    const url = new URL("./EnvironmentEditor.html", import.meta.url);
    if (system?.sceneId) {
      url.searchParams.set("target", system.sceneId);
      url.searchParams.set("kind", system.targetKind || "scene");
    }
    this.win = window.open(url, "_blank", "popup,width=1100,height=850");
    if (!this.win) throw new Error("环境窗口被浏览器拦截，请允许弹窗后重试");
    this.win.focus();
    this.onPageHide = () => this.Exit();
    window.addEventListener("pagehide", this.onPageHide, { once: true });
    return this;
  }

  Update() { if (this.win?.closed) this.host.CloseEnvironment(); }

  Exit() {
    window.removeEventListener("pagehide", this.onPageHide);
    const win = this.win;
    this.win = null;
    if (win && !win.closed) win.close();
  }
}
