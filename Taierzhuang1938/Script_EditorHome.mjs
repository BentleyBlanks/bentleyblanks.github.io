// 高级工具首页：从主菜单进高级工具时（?editor=tools 不带关卡，Data_ToolsHome）
// 不建任何关卡，这一整页代替空 Inspector，等人自己挑工具。
//
// 摄影棚类工具（人物、枪械、特效、构件库……）自带布景，点了就在这一页上开；
// 场景类工具编辑的是一关的真实场景，点了先问「载入哪一关」，再整页换到
// ?phase=N&editor=tools&tool=<id>（Script_Main 开机看到 tool 就直接打开它）。

import { El } from "./Script_EditorUi.mjs";
import { PHASES } from "./Data_Battle.mjs";
import { SandboxUrl } from "./Data_StartupRouting.mjs";

/** 编辑一关真实场景的工具：首页上点它们要先选关卡。 */
const CHAPTER_TOOLS = new Set(["splines", "propPcg"]);

/** 某个工具要先载入什么。返回 null = 不用载入，直接开。 */
export function HomeLevelChoices(toolId, href) {
  if (!CHAPTER_TOOLS.has(toolId)) return null;
  return PHASES.map((phase, index) => {
    const url = new URL(SandboxUrl(href, null));
    url.searchParams.set("phase", String(index));
    url.searchParams.set("editor", "tools");
    url.searchParams.set("tool", toolId);
    return { label: phase.label, sub: phase.date || "", tag: phase.deprecated ? "旧稿" : "", url: url.href };
  });
}

const ToolLabel = (Editor) => Editor.label || Editor.id;

export class ToolsHome {
  /**
   * @param {object} options
   *   menus        菜单栏那张表（[{ id, label, items: [Editor] }]），首页按同一顺序摆
   *   windowTools  打开独立窗口 / 整页切换的工具 id
   *   onOpen       (id) => void —— 不用载入的工具直接开
   *   navigate     (url) => void —— 换页（测试可替换）
   */
  constructor({ menus, windowTools, onOpen, navigate = (url) => window.location.assign(url) }) {
    this.onOpen = onOpen;
    this.navigate = navigate;
    const root = El("section", "edHome");
    root.setAttribute("aria-label", "高级工具首页");
    this.root = root;

    const inner = El("div", "edHomeInner");
    root.appendChild(inner);

    const grid = El("div", "edHomeGrid");
    inner.appendChild(grid);
    this.cards = new Map();
    this.choices = new Map();
    for (const menu of menus) {
      const group = El("div", "edHomeGroup");
      group.dataset.group = menu.id;
      const title = El("h2", "edHomeGroupTitle");
      title.append(El("span", "edHomeGroupLabel", menu.label));
      group.appendChild(title);
      for (const Editor of menu.items) {
        const choices = HomeLevelChoices(Editor.id, window.location.href);
        this.choices.set(Editor.id, { Editor, choices });
        const card = El("button", "edHomeTool");
        card.type = "button";
        card.dataset.homeTool = Editor.id;
        const top = El("span", "edHomeToolTop");
        top.appendChild(El("span", "edHomeToolName", ToolLabel(Editor)));
        if (choices) top.appendChild(Tag("载入关卡", "level"));
        else if (windowTools.has(Editor.id)) top.appendChild(Tag("↗", "win"));
        card.appendChild(top);
        if (Editor.hint) card.appendChild(El("span", "edHomeToolHint", Editor.hint));
        card.addEventListener("click", () => this.Pick(Editor, choices));
        group.appendChild(card);
        this.cards.set(Editor.id, card);
      }
      grid.appendChild(group);
    }

    // 选关卡：盖在首页上的一张单子
    this.sheet = El("div", "edHomeSheet");
    this.sheet.hidden = true;
    this.sheet.setAttribute("role", "dialog");
    this.sheet.setAttribute("aria-modal", "true");
    this.sheet.addEventListener("click", (event) => { if (event.target === this.sheet) this.CloseSheet(); });
    this.sheet.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.stopPropagation(); event.preventDefault(); this.CloseSheet(); }
    });
    root.appendChild(this.sheet);
  }

  get SheetOpen() { return !this.sheet.hidden; }

  /** 这个工具在首页上要不要先选关卡（菜单栏里点它也走同一张单子）。 */
  NeedsLevel(id) { return !!this.choices.get(id)?.choices; }

  PickById(id) {
    const entry = this.choices.get(id);
    if (entry) this.Pick(entry.Editor, entry.choices);
  }

  Pick(Editor, choices) {
    if (!choices) { this.onOpen(Editor.id); return; }
    this.sheet.replaceChildren();
    const box = El("div", "edHomeSheetBox");
    box.appendChild(El("h2", "edHomeSheetTitle", `${ToolLabel(Editor)} · 选关卡`));
    const list = El("div", "edHomeSheetList");
    for (const choice of choices) {
      const row = El("button", "edHomeChoice");
      row.type = "button";
      const text = El("span", "edHomeChoiceText");
      text.append(El("span", "edHomeChoiceName", choice.label));
      if (choice.sub) text.append(El("span", "edHomeChoiceSub", choice.sub));
      row.appendChild(text);
      if (choice.tag) row.appendChild(Tag(choice.tag, "old"));
      row.addEventListener("click", () => this.navigate(choice.url));
      list.appendChild(row);
    }
    box.appendChild(list);
    const cancel = El("button", "edHomeCancel", "取消");
    cancel.type = "button";
    cancel.addEventListener("click", () => this.CloseSheet());
    box.appendChild(cancel);
    this.sheet.appendChild(box);
    this.sheet.hidden = false;
    this.returnFocus = this.cards.get(Editor.id) || null;
    list.querySelector("button")?.focus();
  }

  CloseSheet() {
    if (this.sheet.hidden) return;
    this.sheet.hidden = true;
    this.returnFocus?.focus();
  }

  Show(on) {
    this.root.hidden = !on;
    if (!on) this.sheet.hidden = true;
  }
}

function Tag(text, kind) {
  const tag = El("span", "edHomeTag", text);
  tag.dataset.kind = kind;
  return tag;
}
