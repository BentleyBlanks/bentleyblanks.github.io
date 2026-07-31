// 《地下长城 · 冀中1942》 —— HUD / 面板 / 播报 / 护栏 / 引导 / 结算（表现层，AGENTS.md §六）。
//
// 布局（文明VI 式，PC 优先）：
//   顶栏：回合/阶段/波次与行动力池/胜负目标 —— 目标常显（引导 6）
//   左上：toast 播报堆栈       右上：弹药/存粮 + 代价账本（中性灰白，禁绿/金/加号）
//   左下：选中详情 + 悬停信息固定面板（300ms 去抖，数字一律在此，不上格）
//   右侧：事件日志抽屉（200 条，格号点击跳转）    右下：结束回合三态按钮 + 两段护栏待办清单
//   底部中央：触发式一次性引导（localStorage: tunnelfront1942_v1_hints）
//   全屏：Esc 菜单（键位表）与结算画面（勋记逐条点亮 + 账本，无任何奖励表述）
//
// 纪律：颜色只经 Data_Theme（CssVars 打到 :root，样式在 Style_Game.css）；
// 本模块不算规则、不读引擎——一切数据由 Script_Main 归一化后喂入；
// visible=false 的事件不会到达本模块（Main 过滤），此处再设一道防线。
// 模块顶层零 DOM 副作用。

import { CssVars } from "./Data_Theme.mjs";
import { keymap, KeymapGroups } from "./Data_Keymap.mjs";

const hintsStorageKey = "tunnelfront1942_v1_hints";
const maxLogEntries = 200;

/** 六条触发式一次性引导（§六.7）。 */
const hintTexts = Object.freeze({
  layers: "战场分上下两层：Q 切换，Space 按住窥视。",
  expose: "暴露豆只增不减：攒满阈值，入口即被搜出。",
  move: "左键选中单位，右键下令移动。",
  intent: "敌纵队的意图箭头可以预读，用它设伏。",
  tunnelCost: "地道有代价：挖掘留痕迹，使用入口会攒暴露豆。",
  objective: "胜负目标常显在顶栏，随时核对。",
});

export function CreateUi({ uiRoot, callbacks = {} }) {
  // 主题变量打到 :root（Style_Game.css 以 var(--tf-*) 引用）
  const rootStyle = document.documentElement.style;
  for (const [name, value] of Object.entries(CssVars())) rootStyle.setProperty(name, value);

  const El = (tag, className, parent, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    if (parent) parent.appendChild(node);
    return node;
  };

  // ---------------- 骨架填充 ----------------
  const topBar = document.getElementById("topBar") ?? El("header", "tf-topbar", uiRoot);
  topBar.replaceChildren();
  const topLeft = El("div", "tf-top-left", topBar);
  const topTurn = El("span", "tf-top-turn", topLeft, "回合 —");
  const topPhase = El("span", "tf-top-phase", topLeft, "");
  const topObjective = El("div", "tf-top-objective", topBar, "目标：——");
  const topRight = El("div", "tf-top-right", topBar);
  const topWave = El("span", "tf-top-wave", topRight, "");
  const topPool = El("span", "tf-top-pool", topRight, "");
  const topNet = El("span", "tf-top-net", topRight, "");    // 地道网：格/段/通气孔门槛/门开关（R5）

  const fixtureBadge = document.getElementById("fixtureBadge") ?? El("div", "tf-fixture-badge", uiRoot);
  fixtureBadge.textContent = "夹具模式 · 仅渲染不可玩";
  fixtureBadge.hidden = true;

  const toastStack = document.getElementById("toastStack") ?? El("div", "tf-toasts", uiRoot);
  const bannerBox = document.getElementById("bannerBox") ?? El("div", "tf-banner", uiRoot);
  bannerBox.hidden = true;

  const ledgerPanel = document.getElementById("ledgerPanel") ?? El("aside", "tf-ledger", uiRoot);
  ledgerPanel.replaceChildren();
  const resLine = El("div", "tf-res-line", ledgerPanel);
  const grainBox = El("div", "tf-grain", ledgerPanel);       // 明存粮/洞存粮分账（R2）
  const landmarkBox = El("div", "tf-landmark", ledgerPanel); // 区队部等关键地点坐标（R2）
  const ledgerTitle = El("div", "tf-ledger-title", ledgerPanel, "代价账本");
  const ledgerList = El("dl", "tf-ledger-list", ledgerPanel);

  const infoPanel = document.getElementById("infoPanel") ?? El("aside", "tf-info", uiRoot);
  infoPanel.replaceChildren();
  const movePreviewBox = El("div", "tf-move-preview", infoPanel);   // 移动预览条（悬停即时，不去抖）
  movePreviewBox.hidden = true;
  const selBox = El("div", "tf-info-sel", infoPanel);
  const hoverBox = El("div", "tf-info-hover", infoPanel);
  selBox.innerHTML = "";
  RenderInfo(selBox, null, "未选中单位或地格");
  RenderInfo(hoverBox, null, "悬停地格查看详情");

  const logDrawer = document.getElementById("logDrawer") ?? El("aside", "tf-log", uiRoot);
  logDrawer.replaceChildren();
  logDrawer.hidden = true;
  El("div", "tf-log-title", logDrawer, `事件日志（${keymap.logDrawer.label} 开关）`);
  const logList = El("ul", "tf-log-list", logDrawer);
  const logToggle = document.getElementById("logToggle") ?? El("button", "tf-log-toggle", uiRoot);
  logToggle.textContent = "日志";
  logToggle.type = "button";
  logToggle.addEventListener("click", () => ToggleLog());

  const endTurnBox = document.getElementById("endTurnBox") ?? El("div", "tf-endturn", uiRoot);
  endTurnBox.replaceChildren();
  const todoPanel = El("div", "tf-todos", endTurnBox);
  todoPanel.hidden = true;
  const endTurnBtn = El("button", "tf-endturn-btn", endTurnBox, "结束回合");
  endTurnBtn.type = "button";
  const endTurnNote = El("div", "tf-endturn-note", endTurnBox, "");
  endTurnBtn.addEventListener("click", () => callbacks.OnEndTurnRequest?.());

  const hintCard = document.getElementById("hintCard") ?? El("div", "tf-hint", uiRoot);
  hintCard.hidden = true;

  const menuPanel = document.getElementById("menuPanel") ?? El("div", "tf-menu", uiRoot);
  menuPanel.hidden = true;

  const modalRoot = document.getElementById("modalRoot") ?? El("div", "tf-modal-root", uiRoot);
  modalRoot.hidden = true;

  // ---------------- 顶栏 ----------------
  const waveText = { quiet: "平静期", sweep: "扫荡期", withdrawing: "敌撤退中", done: "扫荡结束" };
  const phaseText = { player: "我方阶段", enemy: "敌军阶段", resolve: "结算", over: "终局" };

  function SetTopBar(info) {
    topTurn.textContent = `回合 ${info.turn ?? "—"}${info.hardEndTurn ? ` / ${info.hardEndTurn}` : ""}`;
    topPhase.textContent = phaseText[info.phase] ?? "";
    topObjective.textContent = `目标：${info.objective ?? "见简报"}`;
    const wave = waveText[info.waveStatus] ?? "";
    topWave.textContent = info.waveStatus === "sweep" ? `${wave} T${info.sweepTurn ?? ""}` : wave;
    if (info.pool !== undefined && info.waveStatus !== "quiet" && info.waveStatus !== "done") {
      topPool.textContent = `敌行动力 ${info.pool}`
        + (info.smokeCharges ? ` · 烟具 ${info.smokeCharges}` : "")
        + (info.floodCharges ? ` · 水车 ${info.floodCharges}` : "");
    } else {
      topPool.textContent = "";
    }
    // 地道网摘要：段数与「通气孔够不够」以前网页上一处都没有，只能靠玩家自己数格子。
    const net = info.network;
    if (!net) { topNet.textContent = ""; return; }
    const parts = [`地道 ${net.cells} 格 / ${net.segments} 段`];
    if (net.vents !== null && net.vents !== undefined && net.ventNeed !== null && net.ventNeed !== undefined) {
      parts.push(`通气孔 ${net.vents}/需 ${net.ventNeed}`);
    }
    if (net.doorsOpen || net.doorsClosed) parts.push(`隔断门 开${net.doorsOpen}/关${net.doorsClosed}`);
    topNet.textContent = parts.join(" ｜ ");
    topNet.classList.toggle("tf-top-net-short",
      net.vents !== null && net.ventNeed !== null && net.vents < net.ventNeed);
  }

  // ---------------- 资源 + 账本（中性灰白） ----------------
  const ledgerLabels = Object.freeze({
    civCaptured: "群众被抓", civDead: "群众伤亡", housesBurned: "房屋被焚", grainSeized: "粮食被夺",
  });

  /**
   * 资源条 + 存粮分账。胜利条件按「存粮」算，所以明存（敌进村就能征走）与
   * 洞存（敌须攻入得手才夺得走）必须分开显示，且逐村给出村名与格号。
   */
  function SetResources(res) {
    const open = res.grainOpen ?? 0;
    const hidden = res.grainHidden ?? 0;
    resLine.textContent = `弹药 ${res.ammo ?? 0}/${res.ammoMax ?? 12} ｜ 存粮 ${open + hidden}`;
    grainBox.replaceChildren();
    const head = El("div", "tf-grain-head", grainBox);
    El("span", "tf-grain-label", head, "明存粮（敌可征走）");
    El("span", "tf-grain-value", head, String(open));
    const rowCap = 5;
    const villageRows = res.grainRows ?? [];
    for (const row of villageRows.slice(0, rowCap)) {
      const line = El("div", "tf-grain-row", grainBox);
      El("span", "tf-grain-name", line, `${row.name}（${row.hexKeys?.join(" ") ?? ""}）`);
      El("span", "tf-grain-value", line, String(row.grain ?? 0));
    }
    if (villageRows.length > rowCap) El("div", "tf-grain-row tf-grain-empty", grainBox, `…另有 ${villageRows.length - rowCap} 处`);
    if (!villageRows.length) El("div", "tf-grain-row tf-grain-empty", grainBox, "各村已无明存粮");
    const head2 = El("div", "tf-grain-head", grainBox);
    El("span", "tf-grain-label", head2, "洞存粮（须敌攻入才丢）");
    El("span", "tf-grain-value", head2, String(hidden));
    const cellRows = res.cellRows ?? [];
    for (const row of cellRows.slice(0, rowCap)) {
      const line = El("div", "tf-grain-row", grainBox);
      El("span", "tf-grain-name", line, `储粮洞 ${row.key}`);
      El("span", "tf-grain-value", line, `${row.grain}/${row.cap ?? 8}`);
    }
    if (cellRows.length > rowCap) El("div", "tf-grain-row tf-grain-empty", grainBox, `…另有 ${cellRows.length - rowCap} 处`);
    if (!cellRows.length) El("div", "tf-grain-row tf-grain-empty", grainBox, "尚无粮入洞");
  }

  /** 关键地点：区队部坐标常显（L2「区队部被驻占 2 回合即败」需要玩家知道它在哪）。 */
  function SetLandmarks(rows) {
    landmarkBox.replaceChildren();
    if (!rows?.length) return;
    for (const row of rows) {
      const line = El("div", "tf-landmark-row", landmarkBox);
      El("span", "tf-landmark-name", line, row.label);
      El("span", "tf-landmark-hex", line, row.hexKeys?.join(" ") ?? "");
    }
  }

  function SetLedger(ledger) {
    ledgerList.replaceChildren();
    for (const [key, label] of Object.entries(ledgerLabels)) {
      const row = El("div", "tf-ledger-row", ledgerList);
      El("dt", null, row, label);
      El("dd", null, row, String(ledger?.[key] ?? 0));
    }
  }

  // ---------------- 左下信息面板 ----------------
  function RenderInfo(box, info, emptyText) {
    box.replaceChildren();
    if (!info) {
      El("div", "tf-info-empty", box, emptyText);
      return;
    }
    const head = El("div", "tf-info-head", box);
    if (info.tag) El("span", `tf-info-tag tf-info-tag-${info.tagKind ?? "plain"}`, head, info.tag);
    El("span", "tf-info-title", head, info.title ?? "");
    if (info.subtitle) El("div", "tf-info-sub", box, info.subtitle);
    if (info.lines?.length) {
      const grid = El("div", "tf-info-grid", box);
      for (const line of info.lines) {
        El("span", "tf-info-label", grid, line.label);
        El("span", "tf-info-value", grid, String(line.value));
      }
    }
    if (info.notes?.length) {
      for (const note of info.notes) El("div", "tf-info-note", box, note);
    }
  }

  let hoverTimer = null;
  function SetHover(info) {
    if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
    if (!info) { RenderInfo(hoverBox, null, "悬停地格查看详情"); return; }
    hoverTimer = setTimeout(() => RenderInfo(hoverBox, info), 300);   // §六.3：300ms 后输出，不跟鼠标
  }

  function SetSelected(info) {
    RenderInfo(selBox, info, "未选中单位或地格");
  }

  /** 移动预览条（悬停可达格时即时出现，不走 300ms 去抖——这是操作反馈不是资料）。
   *  数字来自 Script_Main 从引擎动作里读到的步数与该单位的 MP，本模块不算任何规则。 */
  function SetMovePreview(preview) {
    if (!preview) { movePreviewBox.hidden = true; movePreviewBox.replaceChildren(); return; }
    movePreviewBox.replaceChildren();
    movePreviewBox.hidden = false;
    movePreviewBox.classList.toggle("tf-move-risk", Boolean(preview.risky));
    const head = El("div", "tf-move-head", movePreviewBox);
    El("span", "tf-move-tag", head, `右键移动 → ${preview.dest}`);
    const grid = El("div", "tf-move-grid", movePreviewBox);
    El("span", "tf-move-label", grid, "路程");
    El("span", "tf-move-value", grid, `${preview.steps} 步`);
    El("span", "tf-move-label", grid, "行动力");
    El("span", "tf-move-value", grid, preview.fixture ? "——" : `${preview.mp} → 余 ${preview.left}`);
    if (preview.risky) El("div", "tf-move-note", movePreviewBox, "这条路会降低入口隐蔽：需二次右键确认");
    else if (preview.left === 0) El("div", "tf-move-note tf-move-note-dim", movePreviewBox, "走满行动力，本回合到此为止");
  }

  // ---------------- toast / 横幅 ----------------
  function Toast(text, { kind = "info", ms = 3600 } = {}) {
    const node = El("div", `tf-toast tf-toast-${kind}`, toastStack, text);
    requestAnimationFrame(() => node.classList.add("tf-toast-in"));
    setTimeout(() => {
      node.classList.remove("tf-toast-in");
      setTimeout(() => node.remove(), 300);
    }, ms);
    while (toastStack.children.length > 4) toastStack.firstChild.remove();
    return node;
  }

  let bannerTimer = null;
  function Banner(text, ms = 2600) {
    bannerBox.textContent = text;
    bannerBox.hidden = false;
    bannerBox.classList.add("tf-banner-in");
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => {
      bannerBox.classList.remove("tf-banner-in");
      bannerBox.hidden = true;
    }, ms);
  }

  // ---------------- 日志抽屉（格号点击跳转） ----------------
  const logEntries = [];
  function AppendLog(entry) {
    if (!entry || entry.visible === false) return;      // 零泄漏防线
    logEntries.push(entry);
    while (logEntries.length > maxLogEntries) logEntries.shift();
    const item = El("li", `tf-log-item${entry.kind === "loss" ? " tf-log-loss" : ""}`, logList);
    El("span", "tf-log-turn", item, `T${entry.turn ?? "—"}`);
    El("span", "tf-log-text", item, entry.text ?? "");
    if (entry.hex) {
      const jump = El("button", "tf-log-hex", item, `[${entry.hex}]`);
      jump.type = "button";
      jump.addEventListener("click", () => callbacks.OnJumpHex?.(entry.hex, entry.layer ?? "surface"));
    }
    logList.scrollTop = logList.scrollHeight;
    while (logList.children.length > maxLogEntries) logList.firstChild.remove();
  }

  function ToggleLog(force) {
    logDrawer.hidden = force === undefined ? !logDrawer.hidden : !force;
  }

  // ---------------- 结束回合三态 + 两段护栏 ----------------
  function SetEndTurn(state, { todoCount = 0 } = {}) {
    endTurnBtn.classList.remove("tf-end-ready", "tf-end-hold", "tf-end-busy");
    endTurnBtn.disabled = false;
    if (state === "busy") {
      endTurnBtn.classList.add("tf-end-busy");
      endTurnBtn.textContent = "敌军行动中…";
      endTurnBtn.disabled = true;
      endTurnNote.textContent = `${keymap.peek.label.replace("（按住）", "")} 快进 · Esc 跳过`;
    } else if (state === "fixture") {
      endTurnBtn.classList.add("tf-end-busy");
      endTurnBtn.textContent = "夹具模式";
      endTurnBtn.disabled = true;
      endTurnNote.textContent = "接入引擎后可推进回合";
    } else if (state === "hold") {
      endTurnBtn.classList.add("tf-end-hold");
      endTurnBtn.textContent = `结束回合（待办 ${todoCount}）`;
      endTurnNote.textContent = `${keymap.endTurn.label} 查看待办 · ${keymap.endTurnForce.label} 直通`;
    } else {
      endTurnBtn.classList.add("tf-end-ready");
      endTurnBtn.textContent = "结束回合";
      endTurnNote.textContent = `${keymap.endTurn.label} 结束回合`;
    }
  }

  function ShowTodos(todos) {
    todoPanel.replaceChildren();
    El("div", "tf-todos-title", todoPanel, "结束前待办（再按 Enter 确认结束）");
    const list = El("ul", "tf-todos-list", todoPanel);
    for (const todo of todos) {
      const item = El("li", "tf-todo-item", list);
      const button = El("button", "tf-todo-jump", item, todo.text);
      button.type = "button";
      button.addEventListener("click", () => callbacks.OnTodoJump?.(todo));
    }
    const foot = El("div", "tf-todos-foot", todoPanel);
    const confirmBtn = El("button", "tf-todo-confirm", foot, "确认结束");
    confirmBtn.type = "button";
    confirmBtn.addEventListener("click", () => callbacks.OnEndTurnConfirm?.());
    const backBtn = El("button", "tf-todo-back", foot, "返回部署");
    backBtn.type = "button";
    backBtn.addEventListener("click", () => HideTodos());
    todoPanel.hidden = false;
  }

  function HideTodos() {
    todoPanel.hidden = true;
  }

  const TodosVisible = () => !todoPanel.hidden;

  // ---------------- 引导（触发式一次性，localStorage） ----------------
  let hintsSeen = {};
  try { hintsSeen = JSON.parse(localStorage.getItem(hintsStorageKey) ?? "{}") ?? {}; } catch { hintsSeen = {}; }
  let hintTimer = null;

  function MaybeHint(id) {
    if (!hintTexts[id] || hintsSeen[id]) return false;
    hintsSeen[id] = true;
    try { localStorage.setItem(hintsStorageKey, JSON.stringify(hintsSeen)); } catch { /* 存储不可用则仅本次显示 */ }
    hintCard.replaceChildren();
    El("span", "tf-hint-mark", hintCard, "引导");
    El("span", "tf-hint-text", hintCard, hintTexts[id]);
    const close = El("button", "tf-hint-close", hintCard, "知道了");
    close.type = "button";
    close.addEventListener("click", () => { hintCard.hidden = true; });
    hintCard.hidden = false;
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { hintCard.hidden = true; }, 9000);
    return true;
  }

  function ClearHints() {
    hintsSeen = {};
    try { localStorage.removeItem(hintsStorageKey); } catch { /* 忽略 */ }
  }

  // ---------------- Esc 菜单（键位表） ----------------
  function ShowMenu() {
    menuPanel.replaceChildren();
    const card = El("div", "tf-menu-card", menuPanel);
    El("div", "tf-menu-title", card, "地下长城 · 冀中1942");
    El("div", "tf-menu-sub", card, "键位一览");
    const table = El("div", "tf-menu-keys", card);
    for (const group of KeymapGroups()) {
      El("div", "tf-menu-group", table, group.group);
      for (const item of group.items) {
        const row = El("div", "tf-menu-row", table);
        El("span", "tf-menu-key", row, item.label);
        El("span", "tf-menu-desc", row, item.desc);
      }
    }
    const foot = El("div", "tf-menu-foot", card);
    const MakeButton = (text, handler, className = "tf-menu-btn") => {
      const button = El("button", className, foot, text);
      button.type = "button";
      button.addEventListener("click", handler);
      return button;
    };
    MakeButton("继续", () => HideMenu());
    MakeButton("重新开始", () => callbacks.OnRestart?.());
    MakeButton("重看引导", () => { ClearHints(); Toast("引导已重置", { kind: "info" }); });
    MakeButton("清除存档", () => callbacks.OnClearSave?.());
    menuPanel.hidden = false;
  }

  function HideMenu() { menuPanel.hidden = true; }
  const MenuVisible = () => !menuPanel.hidden;

  // ---------------- 结算画面（勋记逐条点亮 + 账本；无奖励表述） ----------------
  function ShowResult(result, ledger) {
    modalRoot.replaceChildren();
    const card = El("div", "tf-result-card", modalRoot);
    El("div", "tf-result-kicker", card, "战 报 归 档");
    El("div", "tf-result-grade", card, `评定：${result.grade ?? "—"}`);
    if (result.reasons?.length) El("div", "tf-result-reason", card, result.reasons.join("；"));
    El("div", "tf-result-medals-title", card, `勋记 ${(result.medalItems ?? []).filter((m) => m.earned).length} / 3 —— 逐枚说明`);
    const medalList = El("ul", "tf-result-medals", card);
    (result.medalItems ?? []).forEach((medal, index) => {
      const item = El("li", `tf-medal${medal.earned ? " tf-medal-lit" : ""}`, medalList);
      item.style.animationDelay = `${0.4 + index * 0.55}s`;
      El("span", "tf-medal-mark", item, medal.earned ? "●" : "○");
      const body = El("div", "tf-medal-body", item);
      const head = El("div", "tf-medal-head", body);
      El("span", "tf-medal-name", head, medal.name);
      El("span", "tf-medal-cond", head, medal.text ?? "");
      El("div", "tf-medal-note", body, medal.note ?? "");
    });
    El("div", "tf-result-medals-foot", card, "三枚全中评甲、两枚乙、一枚及以下丙；失利一律丁。歼敌不计分。");
    El("div", "tf-result-ledger-title", card, "代价账本");
    const table = El("dl", "tf-result-ledger", card);
    for (const [key, label] of Object.entries(ledgerLabels)) {
      const row = El("div", "tf-ledger-row", table);
      El("dt", null, row, label);
      El("dd", null, row, String(ledger?.[key] ?? 0));
    }
    const foot = El("div", "tf-result-foot", card);
    const again = El("button", "tf-menu-btn", foot, "重新开始");
    again.type = "button";
    again.addEventListener("click", () => callbacks.OnRestart?.());
    const close = El("button", "tf-menu-btn", foot, "关闭");
    close.type = "button";
    close.addEventListener("click", () => { modalRoot.hidden = true; });
    modalRoot.hidden = false;
  }

  const ResultVisible = () => !modalRoot.hidden;
  function HideResult() { modalRoot.hidden = true; }

  function SetFixtureBadge(on) { fixtureBadge.hidden = !on; }

  return {
    SetTopBar, SetResources, SetLandmarks, SetLedger, SetSelected, SetHover, SetMovePreview,
    Toast, Banner, AppendLog, ToggleLog,
    SetEndTurn, ShowTodos, HideTodos, TodosVisible,
    MaybeHint, ClearHints,
    ShowMenu, HideMenu, MenuVisible,
    ShowResult, HideResult, ResultVisible,
    SetFixtureBadge,
  };
}
