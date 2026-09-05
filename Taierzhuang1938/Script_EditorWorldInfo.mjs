// WorldInfo：当前角色的只读 Transform 浮窗；独立于摄影棚/自由相机，玩法照跑。
// 位置取玩家脚底，地形取玩家当前 world 的共享采样器，不把相机摇晃当成角色移动。
const REFRESH_SECONDS = 0.1;
const STANCE_LABELS = { stand: "站立", crouch: "蹲伏", prone: "卧倒" };
const POPUP_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--ui-surface, #191b1d); color: var(--ui-text, #dedbd3);
    font: 13px/1.55 var(--ui-font, sans-serif); }
  header { padding: 18px 22px; background: var(--ui-black, #101112); }
  h1 { margin: 0; font-size: 23px; color: var(--ui-bright, #fff); }
  #status { margin: 4px 0 0; color: var(--ui-muted, #a9a8a3); }
  main { padding: 2px 22px 20px; }
  h2 { margin: 18px 0 7px; font-size: 12px; color: var(--ui-gold, #ceb17a); }
  dl { margin: 0; }
  .row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
    padding: 5px 0; border-bottom: 1px solid var(--ui-line, #393b3c); }
  dt { color: var(--ui-muted, #a9a8a3); }
  dd { margin: 0; text-align: right; font: 14px/1.6 Consolas, monospace; font-variant-numeric: tabular-nums; }
  .note { color: var(--ui-muted, #a9a8a3); font-size: 11px; margin: 15px 0 0; }
`;

function Format(value, unit = "") {
  return Number.isFinite(value) ? `${Math.abs(value) < 0.0005 ? "0.000" : value.toFixed(3)}${unit}` : "—";
}

export class WorldInfoEditor {
  static id = "worldInfo";
  static label = "WorldInfo";
  static hint = "独立浮窗：当前角色的位置、高度、旋转与运动状态，实时刷新";
  static keepOnClose = true;

  constructor(host) {
    this.host = host;
    this.win = null;
    this.ui = null;
    this.elapsed = 0;
    this.OnPageHide = () => this.host.CloseWorldInfo();
  }

  Enter() {
    this.win = window.open("", "_blank", "popup,width=460,height=780,menubar=no,toolbar=no,location=no");
    if (!this.win) throw new Error("WorldInfo 独立窗口被浏览器拦截，请允许弹窗后再打开");
    try {
      const doc = this.win.document;
      doc.open();
      doc.write("<!doctype html><html lang='zh-CN'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'><title>WorldInfo · 滕县 一九三八</title></head><body></body></html>");
      doc.close();
      const theme = document.querySelector("link[data-interface-theme]");
      if (theme) {
        const link = doc.createElement("link");
        link.rel = "stylesheet";
        link.href = theme.href;
        doc.head.appendChild(link);
      }
      const style = doc.createElement("style");
      style.textContent = POPUP_CSS;
      doc.head.appendChild(style);
      const El = (tag, parent, text = "") => {
        const node = doc.createElement(tag);
        node.textContent = text;
        parent.appendChild(node);
        return node;
      };
      const header = El("header", doc.body);
      El("h1", header, "WorldInfo");
      const status = El("p", header);
      status.id = "status";
      this.ui = { status };
      const main = El("main", doc.body);
      const Group = (title, fields) => {
        El("h2", main, title);
        const list = El("dl", main);
        for (const [id, label] of fields) {
          const row = El("div", list);
          row.className = "row";
          El("dt", row, label);
          this.ui[id] = El("dd", row, "—");
          this.ui[id].dataset.field = id;
        }
      };
      Group("Position · 世界坐标 / 脚底", [["x", "X · 东"], ["y", "Y · 高度"], ["z", "Z · 南"]]);
      Group("Rotation · 角色视线", [["yaw", "Yaw · 偏航"], ["pitch", "Pitch · 俯仰"]]);
      Group("Height · 高度", [["ground", "脚下地形 Y"], ["clearance", "脚底距地形"],
        ["eyeHeight", "眼高 · 相对脚底"], ["eyeY", "视点世界 Y"]]);
      Group("Movement · 运动", [["speed", "水平速度"], ["verticalSpeed", "垂直速度"], ["stance", "姿态"], ["grounded", "接地"]]);
      El("p", main, "位置与高度：米 · 旋转：度 · 速度：米/秒。距地形按共享地形采样，不代表距楼板或道具的距离。").className = "note";
      window.addEventListener("pagehide", this.OnPageHide);
      this.Refresh();
      return this;
    } catch (error) {
      this.Exit();
      throw error;
    }
  }

  Snapshot() {
    const game = this.host.game;
    const player = game?.player;
    if (game?.state?.ready === false || !player?.position) return null;
    const { x, y, z } = player.position;
    const ground = Number.isFinite(x) && Number.isFinite(z)
      ? player.world?.GroundHeight?.(x, z) : null;
    return {
      x, y, z, yaw: player.yaw * 180 / Math.PI, pitch: player.pitch * 180 / Math.PI,
      ground, clearance: Number.isFinite(ground) ? y - ground : null,
      eyeHeight: player.eyeHeight, eyeY: y + player.eyeHeight,
      speed: Math.hypot(player.velocity?.x, player.velocity?.z), verticalSpeed: player.velocity?.y,
      stance: STANCE_LABELS[player.stance] ?? "—",
      grounded: typeof player.grounded === "boolean" ? (player.grounded ? "是" : "否") : "—",
      alive: player.alive,
    };
  }

  Refresh() {
    const data = this.Snapshot();
    const values = { status: data ? `当前角色 · ${data.alive === false ? "已阵亡" : "实时"}` : "等待当前角色 / 场景加载" };
    for (const id of ["x", "y", "z", "ground", "clearance", "eyeHeight", "eyeY"]) values[id] = Format(data?.[id], " m");
    for (const id of ["yaw", "pitch"]) values[id] = Format(data?.[id], "°");
    for (const id of ["speed", "verticalSpeed"]) values[id] = Format(data?.[id], " m/s");
    for (const id of ["stance", "grounded"]) values[id] = data?.[id] ?? "—";
    for (const [id, value] of Object.entries(values)) {
      if (this.ui[id].textContent !== value) this.ui[id].textContent = value;
    }
  }

  Update(dt) {
    if (!this.win || this.win.closed) { this.host.CloseWorldInfo(); return; }
    this.elapsed += dt;
    if (this.elapsed < REFRESH_SECONDS) return;
    this.elapsed %= REFRESH_SECONDS;
    this.Refresh();
  }

  Exit() {
    window.removeEventListener("pagehide", this.OnPageHide);
    if (this.win && !this.win.closed) this.win.close();
    this.win = null;
    this.ui = null;
  }
}
