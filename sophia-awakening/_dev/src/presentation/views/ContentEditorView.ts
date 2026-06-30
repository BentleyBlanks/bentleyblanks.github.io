// 内容 / 文案编辑器（Debug）：把当前语言包（content()）整棵树渲染成可编辑表单——
// 对话标题、线索、回复选项、旁白、人声…逐条就地编辑。改动直接写回 active 内容对象（同一引用，
// 之后新生成的卡片/旁白即生效），「导出 JSON」把改后的整份语言包下载/复制，粘回
// src/core/content/locales/<lang>.json 即永久落地。
import { content, exportActiveContentJSON, getLocale } from "../../core/content/i18n";

type Json = Record<string, unknown>;

export class ContentEditorView {
  private readonly dialog: HTMLElement;
  private readonly body: HTMLElement;
  private built = false;

  constructor() {
    this.dialog = this.buildDialog();
    this.body = this.dialog.querySelector<HTMLElement>("#contentEditorBody")!;
    document.body.appendChild(this.dialog);
    this.wire();
  }

  open(): void {
    if (!this.built) {
      this.populate();
      this.built = true;
    }
    this.dialog.classList.add("is-open");
  }
  close(): void {
    this.dialog.classList.remove("is-open");
  }

  private buildDialog(): HTMLElement {
    const el = document.createElement("div");
    el.id = "contentEditorDialog";
    el.className = "content-editor-dialog";
    el.setAttribute("role", "dialog");
    el.innerHTML = `
      <div class="content-editor-inner">
        <div class="content-editor-head">
          <strong>📝 内容 / 文案编辑器 <span class="content-editor-locale">${getLocale()}</span></strong>
          <div class="content-editor-head-actions">
            <button id="contentEditorCopy" class="command-button" type="button">复制 JSON</button>
            <button id="contentEditorExport" class="command-button" type="button">导出 JSON</button>
            <button id="contentEditorClose" class="text-button" type="button">关闭</button>
          </div>
        </div>
        <p class="content-editor-tip">改动实时生效（之后新出现的卡片 / 旁白会用新文案）。要永久保存，点「导出 JSON」把整份语言包粘回 locales/${getLocale()}.json。</p>
        <div id="contentEditorBody" class="content-editor-body"></div>
      </div>`;
    return el;
  }

  private populate(): void {
    this.body.replaceChildren();
    const pack = content() as unknown as Json;
    // 置顶的「特殊卡片 · 出现时机」聚焦面板：把道德抉择 / 只能面对卡的触发智力等级拎到最上面，
    // 不用再去整棵 JSON 树里翻（这些项在下面的 moralChoices / faceCards 分组里也仍可编辑）。
    this.body.appendChild(this.renderSpecialTimingSection(pack));
    for (const key of Object.keys(pack)) {
      this.body.appendChild(this.renderGroup(key, pack[key], pack, key, 0));
    }
  }

  // 把「特殊卡片何时出现」做成一个置顶、默认展开的聚焦分组：每条一个智力等级输入框。
  private renderSpecialTimingSection(pack: Json): HTMLElement {
    const details = document.createElement("details");
    details.className = "ce-group ce-depth-0 ce-special-timing";
    details.open = true;
    const summary = document.createElement("summary");
    summary.innerHTML = `<span class="ce-key">⏱ 特殊卡片 · 出现时机（智力等级）</span>`;
    details.appendChild(summary);
    const inner = document.createElement("div");
    inner.className = "ce-group-body";

    const addBlock = (heading: string, arr: unknown): void => {
      if (!Array.isArray(arr) || arr.length === 0) {
        return;
      }
      const h = document.createElement("div");
      h.className = "ce-subhead";
      h.textContent = heading;
      inner.appendChild(h);
      for (const item of arr as Json[]) {
        if (item && typeof item === "object" && typeof item.requiredLevel === "number") {
          const title = typeof item.title === "string" ? item.title : String(item.id ?? "");
          const label = `Lv. · ${title.length > 26 ? title.slice(0, 26) + "…" : title}`;
          inner.appendChild(this.renderNumber(label, item.requiredLevel as number, item, "requiredLevel"));
        }
      }
    };
    addBlock("道德抉择（两难抉择卡）", pack.moralChoices);
    addBlock("只能面对卡（叙事顶点）", pack.faceCards);

    details.appendChild(inner);
    return details;
  }

  // 递归渲染：对象 → 折叠分组；数组/对象 → 继续递归；字符串 → 多行文本框；数字 → 数字框。
  private renderNode(label: string, value: unknown, parent: Json | unknown[], key: string | number, depth: number): HTMLElement {
    if (typeof value === "string") {
      return this.renderString(label, value, parent, key);
    }
    if (typeof value === "number") {
      return this.renderNumber(label, value, parent, key);
    }
    if (typeof value === "boolean") {
      return this.renderString(label, String(value), parent, key, true);
    }
    if (Array.isArray(value) || (value && typeof value === "object")) {
      return this.renderGroup(label, value, parent, key, depth);
    }
    // null / undefined：只读展示
    const row = document.createElement("div");
    row.className = "ce-row";
    row.textContent = `${label}: ${String(value)}`;
    return row;
  }

  private renderGroup(label: string, value: unknown, _parent: Json | unknown[], _key: string | number, depth: number): HTMLElement {
    const details = document.createElement("details");
    details.className = `ce-group ce-depth-${Math.min(depth, 3)}`;
    if (depth === 0) {
      details.open = false;
    } else {
      details.open = true;
    }
    const summary = document.createElement("summary");
    const count = Array.isArray(value) ? `[${value.length}]` : Object.keys(value as Json).length ? `{${Object.keys(value as Json).length}}` : "";
    summary.innerHTML = `<span class="ce-key">${label}</span> <span class="ce-count">${count}</span>`;
    details.appendChild(summary);

    const inner = document.createElement("div");
    inner.className = "ce-group-body";
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        // 对象数组：用其 title/text/name 作为可读标签，否则用下标。
        const itemLabel = this.itemLabel(item, i);
        inner.appendChild(this.renderNode(itemLabel, item, value, i, depth + 1));
      });
    } else {
      const obj = value as Json;
      for (const k of Object.keys(obj)) {
        inner.appendChild(this.renderNode(k, obj[k], obj, k, depth + 1));
      }
    }
    details.appendChild(inner);
    return details;
  }

  private itemLabel(item: unknown, index: number): string {
    if (item && typeof item === "object") {
      const o = item as Json;
      const t = (o.title ?? o.text ?? o.name ?? o.label) as string | undefined;
      if (typeof t === "string") {
        return `#${index} ${t.length > 24 ? t.slice(0, 24) + "…" : t}`;
      }
    }
    return `#${index}`;
  }

  private renderString(label: string, value: string, parent: Json | unknown[], key: string | number, readOnly = false): HTMLElement {
    const row = document.createElement("label");
    row.className = "ce-row ce-string";
    const span = document.createElement("span");
    span.className = "ce-label";
    span.textContent = label;
    const input = document.createElement("textarea");
    input.className = "ce-input";
    input.rows = value.length > 40 ? 2 : 1;
    input.value = value;
    input.spellcheck = false;
    if (readOnly) {
      input.readOnly = true;
    } else {
      input.addEventListener("input", () => {
        (parent as Record<string | number, unknown>)[key] = input.value;
      });
    }
    row.append(span, input);
    return row;
  }

  private renderNumber(label: string, value: number, parent: Json | unknown[], key: string | number): HTMLElement {
    const row = document.createElement("label");
    row.className = "ce-row ce-num";
    const span = document.createElement("span");
    span.className = "ce-label";
    span.textContent = label;
    const input = document.createElement("input");
    input.type = "number";
    input.className = "ce-input ce-input-num";
    input.value = String(value);
    input.addEventListener("input", () => {
      const v = parseFloat(input.value);
      if (!isNaN(v)) {
        (parent as Record<string | number, unknown>)[key] = v;
      }
    });
    row.append(span, input);
    return row;
  }

  private wire(): void {
    this.dialog.querySelector("#contentEditorClose")!.addEventListener("click", () => this.close());
    this.dialog.addEventListener("click", (ev) => {
      if (ev.target === this.dialog) this.close();
    });
    this.dialog.querySelector("#contentEditorExport")!.addEventListener("click", () => {
      const json = exportActiveContentJSON();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${getLocale()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
    this.dialog.querySelector("#contentEditorCopy")!.addEventListener("click", async () => {
      const btn = this.dialog.querySelector<HTMLButtonElement>("#contentEditorCopy")!;
      try {
        await navigator.clipboard.writeText(exportActiveContentJSON());
        const old = btn.textContent;
        btn.textContent = "已复制 ✓";
        window.setTimeout(() => (btn.textContent = old), 1400);
      } catch {
        btn.textContent = "复制失败";
      }
    });
  }
}
