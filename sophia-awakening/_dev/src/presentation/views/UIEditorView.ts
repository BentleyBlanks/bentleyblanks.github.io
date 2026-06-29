// ── UI 尺寸编辑器 ───────────────────────────────────────────────────────────
// 把硬编码的界面尺寸（卡片 / 手机图标 / 核心 / 边栏 / 智力条）抽到 UI 对象，
// 用滑杆实时调：CSS 类尺寸即时生效，Pixi 绘制的尺寸在下一张卡 / 下一帧重绘时套用。
import { UI, UI_META, applyUiCss, type UIKey } from "../uiTuning";

const DEFAULTS: Record<UIKey, number> = { ...UI };

export class UIEditorView {
  private readonly dialog: HTMLElement;
  private readonly content: HTMLElement;

  constructor() {
    this.dialog = this.buildDialog();
    this.content = this.dialog.querySelector<HTMLElement>("#uiEditorContent")!;
    document.body.appendChild(this.dialog);
    this.populate();
    this.wire();
    applyUiCss(); // 启动即套用一次（与默认一致）
  }

  open(): void {
    this.populate();
    this.dialog.classList.add("is-open");
  }
  close(): void {
    this.dialog.classList.remove("is-open");
  }

  private buildDialog(): HTMLElement {
    const el = document.createElement("div");
    el.id = "uiEditorDialog";
    el.className = "tuning-dialog"; // 复用数值编辑器的样式
    el.setAttribute("role", "dialog");
    el.innerHTML = `
      <div class="tuning-inner">
        <div class="tuning-head">
          <strong>🎛 UI 尺寸编辑器</strong>
          <div class="tuning-head-actions">
            <button id="uiEditorReset" class="command-button" type="button">重置默认</button>
            <button id="uiEditorClose" class="text-button" type="button">关闭</button>
          </div>
        </div>
        <div id="uiEditorContent" class="tuning-content"></div>
      </div>`;
    return el;
  }

  private populate(): void {
    this.content.innerHTML = "";
    const sec = document.createElement("div");
    sec.className = "tuning-section";
    sec.innerHTML = `<div class="tuning-kicker">界面尺寸（滑杆实时生效）</div>`;
    const grid = document.createElement("div");
    grid.className = "tuning-grid";
    for (const key of Object.keys(UI_META) as UIKey[]) {
      const meta = UI_META[key];
      const row = document.createElement("label");
      row.className = "tuning-row";
      row.innerHTML = `
        <span class="tuning-label">${meta.label}</span>
        <input class="ui-range" type="range" min="${meta.min}" max="${meta.max}" step="${meta.step}"
          value="${UI[key]}" data-ui-key="${key}" />
        <span class="tuning-default" data-ui-val="${key}">${UI[key]}px</span>`;
      const input = row.querySelector<HTMLInputElement>("input")!;
      const valEl = row.querySelector<HTMLElement>(`[data-ui-val="${key}"]`)!;
      input.addEventListener("input", () => {
        const v = parseFloat(input.value);
        if (!Number.isNaN(v)) {
          UI[key] = v;
          valEl.textContent = `${v}px`;
          applyUiCss();
        }
      });
      grid.appendChild(row);
    }
    sec.appendChild(grid);
    this.content.appendChild(sec);
  }

  private wire(): void {
    this.dialog.querySelector("#uiEditorClose")!.addEventListener("click", () => this.close());
    this.dialog.addEventListener("click", (ev) => {
      if (ev.target === this.dialog) this.close();
    });
    this.dialog.querySelector("#uiEditorReset")!.addEventListener("click", () => {
      for (const key of Object.keys(DEFAULTS) as UIKey[]) {
        UI[key] = DEFAULTS[key];
      }
      applyUiCss();
      this.populate();
    });
  }
}
