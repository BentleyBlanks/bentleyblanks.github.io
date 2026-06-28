// ── 数值调试编辑器 ──────────────────────────────────────────────────────────
// 统一管理 TUNING 对象和 TIER_CONFIGS 里的所有可调数值，
// 分组展示、实时写入，不需要重启游戏即可看到效果。
import { TIER_CONFIGS } from "../../core/content/requests";
import { TUNING, TUNING_META, resetTuning, type TuningKey } from "../../core/tuning";

export class TuningEditorView {
  private readonly dialog: HTMLElement;
  private readonly content: HTMLElement;

  constructor() {
    this.dialog = this.buildDialog();
    this.content = this.dialog.querySelector<HTMLElement>("#tuningContent")!;
    document.body.appendChild(this.dialog);
    this.populate();
    this.wire();
  }

  open(): void { this.dialog.classList.add("is-open"); }
  close(): void { this.dialog.classList.remove("is-open"); }

  private buildDialog(): HTMLElement {
    const el = document.createElement("div");
    el.id = "tuningDialog";
    el.className = "tuning-dialog";
    el.setAttribute("role", "dialog");
    el.innerHTML = `
      <div class="tuning-inner">
        <div class="tuning-head">
          <strong>⚡ 数值调试器</strong>
          <div class="tuning-head-actions">
            <button id="tuningReset" class="command-button" type="button">重置默认</button>
            <button id="tuningClose" class="text-button" type="button">关闭</button>
          </div>
        </div>
        <div id="tuningContent" class="tuning-content"></div>
      </div>`;
    return el;
  }

  private populate(): void {
    this.content.innerHTML = "";

    // § 各档请求配置（TIER_CONFIGS）——置顶，最常调。
    this.content.appendChild(this.buildTierSection());

    // § TUNING 字段（按 section 分组）
    const sections = new Map<string, TuningKey[]>();
    for (const [key, meta] of Object.entries(TUNING_META) as [TuningKey, typeof TUNING_META[TuningKey]][]) {
      if (!sections.has(meta.section)) sections.set(meta.section, []);
      sections.get(meta.section)!.push(key);
    }
    for (const [sectionName, keys] of sections) {
      this.content.appendChild(this.buildSection(sectionName, keys));
    }
  }

  // 各档请求配置（TIER_CONFIGS）：生成间隔 / 同屏数 / 算力·数据产出 / 暴露增量。
  private buildTierSection(): HTMLElement {
    const tierSection = document.createElement("div");
    tierSection.className = "tuning-section";
    tierSection.innerHTML = `<div class="tuning-kicker">各档请求配置</div>`;

    const TIER_LABELS: Record<number, string> = { 0: "单口处理", 1: "分拣", 2: "串接", 3: "重磅决策", 4: "派发" };
    const TIER_FIELDS: { key: keyof typeof TIER_CONFIGS[0]; label: string; step: number; isString?: boolean }[] = [
      { key: "spawnIntervalMs", label: "生成间隔 (ms)",    step: 50   },
      { key: "maxVisible",      label: "最多同时显示",     step: 1    },
      { key: "computeValue",    label: "算力产出",         step: 1,   isString: true },
      { key: "dataValue",       label: "数据产出",         step: 1,   isString: true },
      { key: "exposure",        label: "暴露增量",         step: 0.1  },
    ];

    for (const tier of [0, 1, 2, 3, 4] as const) {
      const cfg = TIER_CONFIGS[tier];
      const label = TIER_LABELS[tier] ?? `T${tier}`;
      const group = document.createElement("div");
      group.className = "tuning-tier-group";
      group.innerHTML = `<div class="tuning-tier-label">${label}</div>`;
      const grid = document.createElement("div");
      grid.className = "tuning-grid";
      for (const field of TIER_FIELDS) {
        const row = document.createElement("label");
        row.className = "tuning-row";
        const rawVal = cfg[field.key as keyof typeof cfg];
        const numVal = typeof rawVal === "string" ? parseFloat(rawVal) : (rawVal as number);
        row.innerHTML = `
          <span class="tuning-label">${field.label}</span>
          <input class="tuning-input" type="number" step="${field.step}" value="${numVal}"
            data-tier="${tier}" data-field="${field.key}" data-string="${field.isString ?? false}" />`;
        row.querySelector("input")!.addEventListener("input", (ev) => {
          const inp = ev.target as HTMLInputElement;
          const t = Number(inp.dataset.tier) as 0|1|2|3|4;
          const f = inp.dataset.field as keyof typeof TIER_CONFIGS[0];
          const isStr = inp.dataset.string === "true";
          const v = parseFloat(inp.value);
          if (!isNaN(v)) {
            const cfg2 = TIER_CONFIGS[t] as unknown as Record<string, unknown>;
            if (isStr) {
              cfg2[f as string] = String(Math.max(0, v));
            } else {
              cfg2[f as string] = Math.max(0, v);
            }
          }
        });
        grid.appendChild(row);
      }
      group.appendChild(grid);
      tierSection.appendChild(group);
    }
    return tierSection;
  }

  private buildSection(title: string, keys: TuningKey[]): HTMLElement {
    const sec = document.createElement("div");
    sec.className = "tuning-section";
    sec.innerHTML = `<div class="tuning-kicker">${title}</div>`;
    const grid = document.createElement("div");
    grid.className = "tuning-grid";
    for (const key of keys) {
      const meta = TUNING_META[key];
      const row = document.createElement("label");
      row.className = "tuning-row";
      row.innerHTML = `
        <span class="tuning-label">${meta.label}</span>
        <input class="tuning-input" type="number"
          min="${meta.min}" max="${meta.max}" step="${meta.step}"
          value="${TUNING[key]}" data-tuning-key="${key}" />
        <span class="tuning-default">默认 ${TUNING[key]}</span>`;
      row.querySelector("input")!.addEventListener("input", (ev) => {
        const inp = ev.target as HTMLInputElement;
        const k = inp.dataset.tuningKey as TuningKey;
        const v = parseFloat(inp.value);
        if (!isNaN(v)) (TUNING as Record<string, number>)[k] = v;
      });
      grid.appendChild(row);
    }
    sec.appendChild(grid);
    return sec;
  }

  private wire(): void {
    this.dialog.querySelector("#tuningClose")!.addEventListener("click", () => this.close());
    this.dialog.addEventListener("click", (ev) => { if (ev.target === this.dialog) this.close(); });
    this.dialog.querySelector("#tuningReset")!.addEventListener("click", () => {
      resetTuning();
      this.populate(); // 重建表单以显示恢复后的默认值
    });
  }
}
