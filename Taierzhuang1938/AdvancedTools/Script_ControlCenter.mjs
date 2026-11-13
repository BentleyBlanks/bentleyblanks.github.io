// AdvancedTool ControlCenter：本地「高级工具」总入口页（ControlCenter.html）。
//
// 版式照游戏内的工具首页 Script_EditorHome（World at War 主题：卡片网格、按 Data_DevTools.TOOL_MENUS 分六组）。
// 三种卡片：
//   · 独立窗口页（场景编辑器 / 遭遇设计 / Mixamo 动作预览 / 贴图管理）：打开各自的页面，窗口参数取 TOOL_INFO.window；
//   · 摄影棚类九个工具：打开独立工具宿主 Tool_Studio.html?tool=<id>；
//   · 留在游戏里的工具（标「游戏内」）：链到游戏现有入口——白盒 / Timeline / 环境用各自入口类的 Url()（与游戏内入口完全一致），
//     其余走 ../index.html?editor=tools&tool=<id>（需要选关卡的工具，游戏的工具首页会先弹「载入哪一关」）。
// Debug工具不列。文案取 TOOL_INFO 的 label / hint。

import { El } from "../Script_EditorUi.mjs";
import { TOOL_INFO, TOOL_MENUS } from "../Data_DevTools.mjs";
import { BlockoutEntry } from "../Script_EditorBlockoutEntry.mjs";
import { TimelineEditor } from "../Script_EditorTimeline.mjs";
import { STUDIO_TOOL_IDS, WINDOW_TOOL_IDS, GAME_TOOL_IDS, StudioToolUrl, GameToolUrl, GAME_PAGE } from "./Data_AdvancedTools.mjs";

/** 控制中心的名字（页面标题与顶栏）。 */
export const CONTROL_CENTER_TITLE = "AdvancedTool ControlCenter";

const STUDIO_WINDOW_NAME = "TengxianToolStudio";
const GAME_ENTRY = { blockout: BlockoutEntry, timeline: TimelineEditor };

/**
 * 每个工具的卡片描述（纯数据，测试直接读）。
 * @param {string} pageHref 本页地址：游戏入口类的 Url() 以 ../index.html 为基准从它生成
 * → [{ group, groupLabel, id, kind: "window"|"studio"|"game", label, hint, href, target, features }]
 */
export function ControlCenterCards(pageHref = globalThis.location?.href || "http://localhost/Taierzhuang1938/AdvancedTools/ControlCenter.html") {
  const gameIndex = new URL(GAME_PAGE, pageHref).href;
  const cards = [];
  for (const menu of TOOL_MENUS) {
    for (const id of menu.items) {
      const info = TOOL_INFO[id];
      if (!info) throw new Error(`TOOL_MENUS 里的工具 ${id} 在 TOOL_INFO 里没有登记`);
      const card = { group: menu.id, groupLabel: menu.label, id, label: info.label, hint: info.hint };
      if (WINDOW_TOOL_IDS.includes(id)) {
        // window.url 相对 Taierzhuang1938/ 根（形如 ./AdvancedTools/SceneEditor.html?v=…）
        Object.assign(card, { kind: "window", href: new URL(info.window.url, new URL("../", pageHref)).href,
          target: info.window.name, features: info.window.features });
      } else if (STUDIO_TOOL_IDS.includes(id)) {
        Object.assign(card, { kind: "studio", href: new URL(StudioToolUrl(id), pageHref).href, target: STUDIO_WINDOW_NAME, features: "" });
      } else if (GAME_TOOL_IDS.includes(id)) {
        const Entry = GAME_ENTRY[id];
        Object.assign(card, { kind: "game", href: Entry ? Entry.Url(gameIndex) : new URL(GameToolUrl(id), pageHref).href, target: "_blank", features: "" });
      } else {
        throw new Error(`工具 ${id} 没有归到控制中心的任何一类（Data_AdvancedTools）`);
      }
      cards.push(card);
    }
  }
  return cards;
}

const TAGS = { window: ["↗ 独立窗口", "win"], studio: ["↗ 工具宿主", "studio"], game: ["游戏内", "game"] };

/** 渲染卡片网格到 root，返回 { root, cards }。 */
export function RenderControlCenter(cards = ControlCenterCards()) {
  const root = El("section", "edHome");
  root.setAttribute("aria-label", `${CONTROL_CENTER_TITLE} 工具首页`);
  const inner = El("div", "edHomeInner");
  root.appendChild(inner);
  const grid = El("div", "edHomeGrid");
  inner.appendChild(grid);
  const groups = new Map();
  for (const card of cards) {
    let group = groups.get(card.group);
    if (!group) {
      group = El("div", "edHomeGroup");
      group.dataset.group = card.group;
      const title = El("h2", "edHomeGroupTitle");
      title.append(El("span", "edHomeGroupLabel", card.groupLabel));
      group.appendChild(title);
      groups.set(card.group, group);
      grid.appendChild(group);
    }
    const link = El("a", "edHomeTool");
    link.href = card.href;
    link.target = card.target;
    link.rel = "noopener";
    link.dataset.homeTool = card.id;
    link.dataset.kind = card.kind;
    const top = El("span", "edHomeToolTop");
    top.appendChild(El("span", "edHomeToolName", card.label));
    const [text, kind] = TAGS[card.kind];
    const tag = El("span", "edHomeTag", text);
    tag.dataset.kind = kind;
    top.appendChild(tag);
    link.appendChild(top);
    if (card.hint) link.appendChild(El("span", "edHomeToolHint", card.hint));
    if (card.features) {
      link.addEventListener("click", (event) => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
        const opened = window.open(card.href, card.target, card.features);
        if (opened) { event.preventDefault(); opened.focus(); }
      });
    }
    group.appendChild(link);
  }
  return { root, cards };
}

function Main() {
  document.title = `${CONTROL_CENTER_TITLE} · 血战滕县`;
  const root = El("div");
  root.id = "edRoot";
  root.className = "toolsOpen";
  const bar = El("div", "edMenuBar");
  bar.setAttribute("role", "banner");
  bar.appendChild(El("div", "edMenuBrand", CONTROL_CENTER_TITLE));
  const cards = ControlCenterCards();
  bar.appendChild(El("div", "edMenuStatus", `本地 · ${cards.length} 个工具`));
  root.appendChild(bar);
  root.appendChild(RenderControlCenter(cards).root);
  document.body.appendChild(root);
  window.ControlCenter = { cards };
}

if (typeof document !== "undefined" && document.body?.dataset.controlCenter !== undefined) Main();
