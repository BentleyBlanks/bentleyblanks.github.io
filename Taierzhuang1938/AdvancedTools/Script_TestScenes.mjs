// 测试场景（TestScenes.html）：沿用主菜单「选择关卡」同一套冷灰 / 旧金 / 羽化大图封面界面，
// 替代主菜单内的旧测试关卡入口，统一由此进入或用场景编辑器打开全部 10 个独立功能测试场景。
//
// 纯本地开发工具，放在 AdvancedTools/ 下，不进入 GitHub Pages 发布包。
// 卡片清单自动由 Data_SandboxRanges + Data_MenuSandboxes + Data_SceneAssets 拼出，零手写重复地址。

import { El } from "../Script_EditorUi.mjs";
import { SANDBOX_RANGES } from "../Data_SandboxRanges.mjs";
import { MENU_SANDBOX_ENTRIES } from "../Data_MenuSandboxes.mjs";
import { SceneInfo } from "../Data_SceneAssets.mjs";
import { GAME_PAGE } from "./Data_AdvancedTools.mjs";

export const TEST_SCENES_TITLE = "测试场景";

const SCENE_EDITOR_WINDOW = { name: "TengxianSceneEditor" };

const CARD_META = Object.freeze({
  movement: { glyph: "跃", cover: "./Covers/Texture_TestSceneCover_Movement.webp" },
  weapons: { glyph: "枪", cover: "./Covers/Texture_TestSceneCover_Weapons.webp" },
  range: { glyph: "靶", cover: "./Covers/Texture_TestSceneCover_Range.webp" },
  explosions: { glyph: "爆", cover: "./Covers/Texture_TestSceneCover_Explosions.webp" },
  melee: { glyph: "刃", cover: "./Covers/Texture_TestSceneCover_Melee.webp" },
  gore: { glyph: "肢", cover: "./Covers/Texture_TestSceneCover_Gore.webp" },
  impacts: { glyph: "尘", cover: "./Covers/Texture_TestSceneCover_Impacts.webp" },
  reactions: { glyph: "震", cover: "./Covers/Texture_TestSceneCover_Reactions.webp" },
  cloth: { glyph: "布", cover: "./Covers/Texture_TestSceneCover_Cloth.webp" },
  hair: { glyph: "发", cover: "./Covers/Texture_TestSceneCover_Hair.webp" },
  tracks: { glyph: "痕", cover: "./Covers/Texture_TestSceneCover_Tracks.webp" },
});

function MenuMetaFor(sandboxId) {
  return MENU_SANDBOX_ENTRIES.find((entry) => (entry.sandboxKey || (entry.id === "Range" ? "range" : null)) === sandboxId) || null;
}

/**
 * 列出全部 10 个独立功能测试场景条目（纯数据，Node 测试与浏览器页面共用）。
 * @param {string} pageHref 本页 URL（缺省用当前 location）
 * → [{ group, glyph, cover, id, label, badge, hint, brief, mechanic, sceneId, runHref, runLabel, editHref, editWindow }]
 */
export function TestSceneCards(pageHref = globalThis.location?.href || "http://localhost/Taierzhuang1938/AdvancedTools/TestScenes.html") {
  const gameUrl = (query) => {
    const url = new URL(GAME_PAGE, pageHref);
    url.search = query;
    return url.href;
  };
  const editorUrl = (sceneId) => {
    const url = new URL("./SceneEditor.html", pageHref);
    url.searchParams.set("scene", sceneId);
    return url.href;
  };
  const cards = [];

  for (const entry of SANDBOX_RANGES.filter((item) => item.kind === "functional")) {
    const meta = MenuMetaFor(entry.id);
    const scene = entry.sceneId ? SceneInfo(entry.sceneId) : null;
    const extra = CARD_META[entry.id] || { glyph: "测", cover: "../Texture/Menu/Texture_MissionCh1NanLu.webp?v=20260928" };
    cards.push({
      group: "functional",
      glyph: meta?.sandboxGlyph || extra.glyph,
      cover: extra.cover,
      id: entry.id,
      label: meta?.label || scene?.title || entry.id,
      badge: meta?.date || "测试场",
      hint: meta?.place || scene?.note || "",
      brief: Array.isArray(meta?.brief) ? meta.brief : [],
      mechanic: meta?.mechanic || "",
      sceneId: entry.sceneId || null,
      runHref: gameUrl(`?${encodeURIComponent(entry.id)}=1`),
      runLabel: "进入测试场",
      editHref: entry.sceneId ? editorUrl(entry.sceneId) : null,
      editWindow: SCENE_EDITOR_WINDOW,
    });
  }

  return cards;
}

function OpenEditorWindow(card) {
  if (!card?.editHref) return;
  if (card.editWindow?.features) {
    const opened = window.open(card.editHref, card.editWindow.name, card.editWindow.features);
    if (opened) { opened.focus(); return; }
  }
  window.open(card.editHref, "_blank", "noopener");
}

function Main() {
  document.title = `${TEST_SCENES_TITLE} · 血战滕县`;
  const allCards = TestSceneCards();
  const sceneCount = new Set(allCards.map((c) => c.sceneId).filter(Boolean)).size;
  const baseStatus = `${allCards.length} 个测试场 · ${sceneCount} 份独立场景`;

  const root = El("div", "panelOn levelsOn tsLauncher");
  root.id = "menu";

  const panel = El("section", "mnPanel on");
  panel.setAttribute("aria-label", TEST_SCENES_TITLE);

  // --- 顶部通栏（沿用选关页 .mnPanelHead + 思源宋体 .mnPanelTitle） ---
  const head = El("header", "mnPanelHead");
  head.appendChild(El("div", "mnPanelTitle", TEST_SCENES_TITLE));

  const headTools = El("div", "tsHeadTools");
  const statusEl = El("span", "tsHeadMeta", baseStatus);
  headTools.appendChild(statusEl);

  const search = El("input", "tsSearch");
  search.type = "search";
  search.placeholder = "筛选测试场（名称 / 场景文件）…";
  search.setAttribute("aria-label", "筛选测试场");
  headTools.appendChild(search);
  head.appendChild(headTools);

  // --- 主内容区（沿用选关页左右双栏：左列表 .mnLevelList + 右羽化大图简报 .mnBrief） ---
  const body = El("div", "mnPanelBody");
  const levels = El("div", "mnLevels");
  const main = El("div", "mnCampaignMain");

  const listEl = El("div", "mnLevelList");
  listEl.setAttribute("role", "listbox");
  listEl.setAttribute("aria-label", "测试场景列表");

  const briefEl = El("div", "mnBrief");
  main.append(listEl, briefEl);

  // --- 底部通栏（沿用选关页 .mnCampaignFoot） ---
  const foot = El("footer", "mnCampaignFoot");
  const footLinks = El("div", "tsFootLinks");

  const ccLink = El("a", "mnCampaignBack", "← ControlCenter");
  ccLink.href = "./ControlCenter.html";
  footLinks.appendChild(ccLink);

  const seLink = El("a", "mnCampaignBack", "打开场景编辑器");
  seLink.href = "./SceneEditor.html?scene=TestRange";
  seLink.target = SCENE_EDITOR_WINDOW.name;
  footLinks.appendChild(seLink);

  const keys = El("div", "mnCampaignKeys", "↑↓ 切换测试场 · Enter 进入 · E 场景编辑器 · / 筛选");
  foot.append(footLinks, keys);

  levels.append(main, foot);
  body.appendChild(levels);
  panel.append(head, body);
  root.appendChild(panel);
  document.body.appendChild(root);

  let visibleCards = allCards;
  let selectedId = allCards[0]?.id || null;

  const SelectedCard = () => visibleCards.find((c) => c.id === selectedId) || visibleCards[0] || null;

  function RenderBrief(card) {
    briefEl.textContent = "";
    if (!card) return;

    // 实机游戏截图羽化封面（原生 .mnMissionArt，由 Script_CaptureTestSceneCovers.mjs 自动采集）
    const art = El("figure", "mnMissionArt");
    const img = document.createElement("img");
    img.src = card.cover;
    img.alt = card.label;
    img.decoding = "async";
    img.draggable = false;
    art.appendChild(img);
    briefEl.appendChild(art);

    // 右下简报与操作栏（原生 .mnMissionCopy）
    const copy = El("div", "mnMissionCopy");
    copy.appendChild(El("div", "mnBriefTitle", card.label));

    const whenText = [card.badge, card.hint].filter(Boolean).join("　·　");
    if (whenText) copy.appendChild(El("div", "mnMissionWhen", whenText));

    if (card.sceneId) {
      copy.appendChild(El("div", "tsSceneFile", `场景文件：Scenes/${card.sceneId}/Scene_${card.sceneId}.json`));
    }

    const objectiveText = card.brief[0] || card.mechanic || card.hint;
    if (objectiveText) {
      copy.appendChild(El("div", "tsBriefDesc", objectiveText));
    }

    const actions = El("div", "mnMissionActions");

    const run = El("a", "tsActionPrimary", card.runLabel || "进入测试场");
    run.href = card.runHref;
    run.target = "_blank";
    run.rel = "noopener";
    run.dataset.action = "run";
    actions.appendChild(run);

    if (card.editHref) {
      const edit = El("a", "tsActionSecondary", "场景编辑器");
      edit.href = card.editHref;
      edit.target = card.editWindow?.name || "_blank";
      edit.rel = "noopener";
      edit.dataset.action = "edit";
      edit.addEventListener("click", (event) => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        OpenEditorWindow(card);
      });
      actions.appendChild(edit);
    }

    copy.appendChild(actions);
    briefEl.appendChild(copy);
  }

  function Select(id, { scroll = false } = {}) {
    selectedId = id;
    for (const btn of listEl.querySelectorAll(".mnLevel")) {
      const active = btn.dataset.testScene === selectedId;
      btn.classList.toggle("on", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
      if (active) btn.setAttribute("aria-current", "true");
      else btn.removeAttribute("aria-current");
      if (active && scroll) btn.scrollIntoView({ block: "nearest" });
    }
    RenderBrief(SelectedCard());
  }

  function RenderList(query = "") {
    listEl.textContent = "";
    const q = query.trim().toLowerCase();
    visibleCards = q
      ? allCards.filter((c) => [c.label, c.id, c.sceneId || "", c.badge, c.hint].join(" ").toLowerCase().includes(q))
      : allCards;

    if (!visibleCards.length) {
      listEl.appendChild(El("div", "tsEmptyList", `没有匹配「${query.trim()}」的测试场景`));
      briefEl.textContent = "";
      return;
    }

    if (!visibleCards.some((c) => c.id === selectedId)) selectedId = visibleCards[0].id;

    const track = El("div", "mnSandboxTrack");
    for (const card of visibleCards) {
      const item = El("button", "mnLevel mnSandboxLevel");
      item.type = "button";
      item.setAttribute("role", "option");
      item.dataset.testScene = card.id;
      if (card.sceneId) item.dataset.sceneId = card.sceneId;
      const active = card.id === selectedId;
      item.classList.toggle("on", active);
      item.setAttribute("aria-selected", active ? "true" : "false");
      if (active) item.setAttribute("aria-current", "true");

      item.append(
        El("span", "mnLvNo", card.glyph),
        El("span", "mnLvName", card.label),
        El("span", "mnLvMark", "沙盒"),
      );
      item.addEventListener("pointerenter", (event) => {
        if (event.pointerType === "mouse" && selectedId !== card.id) Select(card.id);
      });
      item.addEventListener("click", () => {
        if (selectedId === card.id) window.open(card.runHref, "_blank", "noopener");
        else Select(card.id);
      });
      track.appendChild(item);
    }
    listEl.appendChild(track);
    RenderBrief(SelectedCard());
  }

  RenderList("");
  search.addEventListener("input", () => RenderList(search.value));

  document.addEventListener("keydown", (event) => {
    const typing = document.activeElement === search;
    if (event.key === "/" && !typing) {
      event.preventDefault();
      search.focus();
      search.select();
      return;
    }
    if (event.key === "Escape" && typing) {
      search.value = "";
      RenderList("");
      search.blur();
      return;
    }
    if (typing || !visibleCards.length) return;
    const idx = Math.max(0, visibleCards.findIndex((c) => c.id === selectedId));
    if (event.key === "ArrowDown" || event.key === "s" || event.key === "S") {
      event.preventDefault();
      Select(visibleCards[(idx + 1) % visibleCards.length].id, { scroll: true });
    } else if (event.key === "ArrowUp" || event.key === "w" || event.key === "W") {
      event.preventDefault();
      Select(visibleCards[(idx - 1 + visibleCards.length) % visibleCards.length].id, { scroll: true });
    } else if (event.key === "Enter") {
      const card = SelectedCard();
      if (card) { event.preventDefault(); window.open(card.runHref, "_blank", "noopener"); }
    } else if (event.key === "e" || event.key === "E") {
      const card = SelectedCard();
      if (card?.editHref) { event.preventDefault(); OpenEditorWindow(card); }
    }
  });

  const CheckPreviewFreshness = async () => {
    try {
      const response = await fetch("/__preview/ping", { cache: "no-store" });
      if (!response.ok) return;
      const info = await response.json();
      if (info?.stale) {
        statusEl.textContent = `本地 :${info.port} · 后端已更新（重开桌面快捷方式即可原地升级）`;
        statusEl.style.color = "var(--ui-gold)";
      } else {
        statusEl.textContent = baseStatus;
        statusEl.style.color = "";
      }
    } catch { /* 非预览服打开时忽略 */ }
  };
  CheckPreviewFreshness();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) CheckPreviewFreshness(); });
  window.TestScenesLauncher = { cards: allCards, Select, CheckPreviewFreshness };
}

if (typeof document !== "undefined" && document.body?.dataset.testScenes !== undefined) Main();
