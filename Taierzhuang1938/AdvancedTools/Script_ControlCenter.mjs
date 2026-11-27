// AdvancedTool ControlCenter：本地「高级工具」总入口页（ControlCenter.html）。
//
// 版式照游戏内的工具首页 Script_EditorHome（World at War 主题：卡片网格、按 Data_DevTools.TOOL_MENUS 分六组）。
// 卡片（全部以普通浏览器标签页打开，不使用 popup 弹窗）：
//   · 独立工具页：通过命名 target 在新标签页打开各自页面（复用同名标签页）；只在控制中心出现的独立工具
//     取 Data_AdvancedTools.STANDALONE_TOOLS，按 slot 排在所属组游戏工具的前或后；
//   · 摄影棚类工具：在新标签页打开独立工具宿主 Tool_Studio.html?tool=<id>；
//   · 留在游戏里的工具（标「游戏内」）：在新标签页链到游戏现有入口——白盒 / Timeline 用各自入口类的 Url()（与游戏内入口完全一致），
//     其余走 ../index.html?editor=tools&tool=<id>（需要选关卡的工具，游戏的工具首页会先弹「载入哪一关」）。
// Debug工具不列。文案取 TOOL_INFO 的 label / hint。

import { El } from "../Script_EditorUi.mjs";
import { TOOL_INFO, TOOL_MENUS } from "../Data_DevTools.mjs";
import { BlockoutEntry } from "../Script_EditorBlockoutEntry.mjs";
import { TimelineEditor } from "../Script_EditorTimeline.mjs";
import {
  STUDIO_TOOL_IDS, WINDOW_TOOL_IDS, GAME_TOOL_IDS, STANDALONE_TOOLS, StudioToolUrl, GameToolUrl, GAME_PAGE,
} from "./Data_AdvancedTools.mjs?v=20261128AudioStandalone";

/** 控制中心的名字（页面标题与顶栏）。 */
export const CONTROL_CENTER_TITLE = "AdvancedTool ControlCenter";

const STUDIO_WINDOW_NAME = "TengxianToolStudio";
const GAME_ENTRY = { blockout: BlockoutEntry, timeline: TimelineEditor };

/**
 * 每个工具的卡片描述（纯数据，测试直接读）。
 * @param {string} pageHref 本页地址：游戏入口类的 Url() 以 ../index.html 为基准从它生成
 * → [{ group, groupLabel, id, kind: "window"|"studio"|"game", label, hint, href, target }]
 */
export function ControlCenterCards(pageHref = globalThis.location?.href || "http://localhost/Taierzhuang1938/AdvancedTools/ControlCenter.html") {
  const gameIndex = new URL(GAME_PAGE, pageHref).href;
  const cards = [];
  const Standalone = (menu, slot) => STANDALONE_TOOLS.filter((tool) => tool.group === menu.id && tool.slot === slot)
    .map((tool) => ({ group: menu.id, groupLabel: menu.label, id: tool.id, kind: "window", label: tool.label, hint: tool.hint,
      href: new URL(tool.window.url, pageHref).href, target: tool.window.name }));
  for (const menu of TOOL_MENUS) {
    cards.push(...Standalone(menu, "lead"));
    for (const id of menu.items) {
      const info = TOOL_INFO[id];
      if (!info) throw new Error(`TOOL_MENUS 里的工具 ${id} 在 TOOL_INFO 里没有登记`);
      const card = { group: menu.id, groupLabel: menu.label, id, label: info.label, hint: info.hint };
      if (WINDOW_TOOL_IDS.includes(id)) {
        // window.url 相对 Taierzhuang1938/ 根（形如 ./AdvancedTools/SceneEditor.html?v=…）
        Object.assign(card, { kind: "window", href: new URL(info.window.url, new URL("../", pageHref)).href,
          target: info.window.name });
      } else if (STUDIO_TOOL_IDS.includes(id)) {
        Object.assign(card, { kind: "studio", href: new URL(StudioToolUrl(id), pageHref).href, target: STUDIO_WINDOW_NAME });
      } else if (GAME_TOOL_IDS.includes(id)) {
        const Entry = GAME_ENTRY[id];
        Object.assign(card, { kind: "game", href: Entry ? Entry.Url(gameIndex) : new URL(GameToolUrl(id), pageHref).href, target: "_blank" });
      } else {
        throw new Error(`工具 ${id} 没有归到控制中心的任何一类（Data_AdvancedTools）`);
      }
      cards.push(card);
    }
    cards.push(...Standalone(menu, "tail"));
  }
  return cards;
}

const TAGS = { window: ["↗ 新标签页", "win"], studio: ["↗ 工具宿主", "studio"], game: ["游戏内", "game"] };

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
    // _blank 保持 noopener；同源命名标签页不加 noopener，以便复用同名标签页并让「← 控制中心」可切回本标签页。
    if (card.target === "_blank") link.rel = "noopener";
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
  const baseStatus = `本地 · ${cards.length} 个工具`;
  const statusEl = El("div", "edMenuStatus", baseStatus);
  bar.appendChild(statusEl);
  root.appendChild(bar);
  root.appendChild(RenderControlCenter(cards).root);
  document.body.appendChild(root);
  const CheckPreviewFreshness = async () => {
    try {
      const response = await fetch("/__preview/ping", { cache: "no-store" });
      if (!response.ok) return;
      const info = await response.json();
      if (info?.stale) {
        statusEl.textContent = `本地 :${info.port} · 后端已更新（重开桌面快捷方式即可原地升级）`;
        statusEl.style.color = "var(--ed-gold-text, #d8c48a)";
      } else {
        statusEl.textContent = baseStatus;
        statusEl.style.color = "";
      }
    } catch { /* 非预览服打开时忽略 */ }
  };
  CheckPreviewFreshness();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) CheckPreviewFreshness(); });
  window.ControlCenter = { cards, CheckPreviewFreshness };
}

if (typeof document !== "undefined" && document.body?.dataset.controlCenter !== undefined) Main();
