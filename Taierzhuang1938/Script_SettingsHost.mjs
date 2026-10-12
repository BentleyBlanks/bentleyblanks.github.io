// 玩家设置页（画面 / 声音 / 操作）的宿主：菜单「设置」点进去的那三页。
//
// 以前这三页借编辑器套件的壳打开（EditorSuite.Open("graphics")），存下来的画质与音量
// 也要等编辑器构造时才装回去 —— 把开发工具剔掉，玩家设置就跟着没了。现在它们只认这里：
// 标题菜单（Script_MenuStartup）与游戏宿主（Script_Main）共用同一份，与 Script_DevTools 无关。
//
// 页面本身仍是 Script_EditorSettings 的三个类（Enter / Update / Exit 接口，名字是历史遗留）；
// 它们画进 #settingsRoot（与开发工具的 #edRoot 分开），样式在 Style_Menu.css。
//
// 打开时的副作用（藏菜单、停背景声、回到哪一层）各宿主不同，走 OnOpen / OnClose 交回去。

import { GraphicsSettings, AudioSettings, ControlsSettings } from "./Script_EditorSettings.mjs";

export const SETTINGS_PAGES = Object.freeze([GraphicsSettings, AudioSettings, ControlsSettings]);
export const SETTINGS_PAGE_IDS = Object.freeze(SETTINGS_PAGES.map((page) => page.id));

export class SettingsHost {
  /**
   * @param {object} options
   *   host     设置页要用的系统：renderer / canvas / camera / post / lights / audio / game
   *            （game 至少有 graphics / ApplyGraphics / GraphicsProfile）
   *   OnOpen   (id) => void   页面打开后
   *   OnClose  (id) => void   页面关掉后（Esc、× 与页内「返回」都走这里）
   */
  constructor({ host, OnOpen = null, OnClose = null } = {}) {
    this.host = host;
    this.OnOpen = OnOpen;
    this.OnClose = OnClose;
    this.active = null;
    this.activeId = null;
    const root = document.createElement("div");
    root.id = "settingsRoot";
    root.className = "off";
    document.body.appendChild(root);
    this.root = root;
    // 设置页里的按键不往下传：不然方向键会去挪菜单选择、R 会落到玩法键位表上。
    root.addEventListener("keydown", (event) => event.stopPropagation());
    // Esc 关页：捕获阶段先拿，免得菜单把同一下当成「返回上一层」再退一级。
    this._onKeyDown = (event) => {
      if (!this.active || event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) this.Close();
    };
    document.addEventListener("keydown", this._onKeyDown, true);
  }

  get IsOpen() { return !!this.active; }
  get ActiveId() { return this.activeId; }

  /** 设置页共用的宿主接口；Close 指回这里。 */
  get pageHost() {
    return { ...this.host, Close: () => this.Close() };
  }

  Open(id) {
    const Page = SETTINGS_PAGES.find((page) => page.id === id);
    if (!Page) return null;
    if (this.active) this.ExitActive();
    this.active = new Page(this.pageHost);
    this.activeId = id;
    this.root.classList.remove("off");
    try {
      this.active.Enter(this.root);
    } catch (error) {
      console.error(`[Settings] ${id} 打不开：`, error);
      this.active = null;
      this.activeId = null;
      this.root.classList.add("off");
      return null;
    }
    this.OnOpen?.(id);
    return this.active;
  }

  Close() {
    if (!this.active) return;
    const id = this.activeId;
    this.ExitActive();
    this.root.classList.add("off");
    this.OnClose?.(id);
  }

  /** 不回调地收起（宿主自己要切到别的层时用，比如暂停里直接「继续」）。 */
  Dismiss() {
    if (!this.active) return;
    this.ExitActive();
    this.root.classList.add("off");
  }

  ExitActive() {
    try { this.active?.Exit(); } catch (error) { console.error("[Settings] 关闭出错：", error); }
    this.active = null;
    this.activeId = null;
  }

  Update(dt) {
    if (!this.active?.Update) return;
    try { this.active.Update(dt); } catch (error) {
      console.error(`[Settings] ${this.activeId} 每帧出错，已关掉：`, error);
      this.Close();
    }
  }

  Dispose() {
    if (this.active) this.ExitActive();
    document.removeEventListener("keydown", this._onKeyDown, true);
    this.root.remove();
  }
}

export default SettingsHost;
