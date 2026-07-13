import {
  gameConfig,
  regionDefinitions,
  actionDefinitions,
  formationDefinitions,
  stanceDefinitions,
  routeDefinitions as strategyRouteDefinitions,
  policyDefinitions,
  historicalTurns,
  CreateGame,
  QueueOrder,
  RemoveOrder,
  ClearOrders,
  ChangePolicy,
  ChooseEventOption,
  CommitTurn,
  GetActionPreview,
  GetEnemyForecast,
  GetOperationalBrief,
  GetProbePreview,
  ProbeRegion,
  GetPlanAssessment,
  GetConnectedRegionIds,
  GetCampaignScore,
  SerializeGame,
  DeserializeGame,
  CheckInvariants,
} from "./Script_StrategyRules.mjs";

const saveKey = "Beiyue1941_Save_2";
const backupKey = "Beiyue1941_Backup_2";
const backupGuardKey = "Beiyue1941_BackupGuard_2";
const soundKey = "Beiyue1941_Sound_1";
const mapModeKey = "Beiyue1941_MapMode_1";

const regionLayouts = Object.freeze({
  lingqiu: { left: 4, top: 7, width: 25, height: 25, shape: "polygon(8% 16%, 55% 0, 100% 20%, 91% 78%, 48% 100%, 0 68%)" },
  laiyuan: { left: 27, top: 4, width: 27, height: 27, shape: "polygon(8% 12%, 58% 0, 100% 25%, 90% 82%, 45% 100%, 0 68%)" },
  yixian: { left: 53, top: 8, width: 27, height: 27, shape: "polygon(8% 14%, 58% 0, 100% 26%, 92% 78%, 46% 100%, 0 68%)" },
  wutai: { left: 1, top: 31, width: 27, height: 27, shape: "polygon(7% 18%, 54% 0, 100% 22%, 91% 78%, 46% 100%, 0 67%)" },
  fuping: { left: 25, top: 29, width: 29, height: 29, shape: "polygon(7% 14%, 55% 0, 100% 22%, 92% 82%, 47% 100%, 0 69%)" },
  tangxian: { left: 52, top: 31, width: 27, height: 27, shape: "polygon(8% 15%, 57% 0, 100% 25%, 90% 80%, 45% 100%, 0 67%)" },
  pingshan: { left: 9, top: 56, width: 28, height: 28, shape: "polygon(7% 16%, 54% 0, 100% 23%, 91% 81%, 48% 100%, 0 69%)" },
  lingshou: { left: 34, top: 54, width: 27, height: 28, shape: "polygon(8% 14%, 58% 0, 100% 24%, 90% 79%, 46% 100%, 0 69%)" },
  quyang: { left: 58, top: 52, width: 27, height: 27, shape: "polygon(7% 15%, 57% 0, 100% 25%, 91% 79%, 46% 100%, 0 67%)" },
  jingxing: { left: 4, top: 77, width: 27, height: 22, shape: "polygon(8% 19%, 55% 0, 100% 22%, 91% 77%, 47% 100%, 0 68%)" },
  xingtang: { left: 45, top: 75, width: 27, height: 24, shape: "polygon(8% 17%, 57% 0, 100% 24%, 91% 78%, 47% 100%, 0 68%)" },
  xinle: { left: 70, top: 73, width: 27, height: 25, shape: "polygon(8% 16%, 56% 0, 100% 23%, 91% 79%, 47% 100%, 0 67%)" },
});

const archiveSources = Object.freeze([
  {
    title: "1941年晋察冀边区秋季反“扫荡”",
    organization: "湖南省人民政府转载党史资料",
    url: "https://yjt.hunan.gov.cn/yjt/tszt/aqscdtjb/202108/t20210816_22459142.html",
    note: "用于核对秋季大“扫荡”的阶段、范围与持续时间。",
  },
  {
    title: "华北方面军司令官表",
    organization: "日本亚洲历史资料中心",
    url: "https://www.jacar.go.jp/exhibition/nichibei/reference/armygroups.html",
    note: "日方档案索引，用于交叉核对冈村宁次在1941年7月接任的时间；不沿用侵略军叙事措辞。",
  },
  {
    title: "抗大二分校在敌后办学",
    organization: "中华人民共和国国防部",
    url: "https://www.mod.gov.cn/gfbw/gfjy_index/16396545.html",
    note: "用于学校分散转移与坚持教学的史实背景。",
  },
  {
    title: "狼牙山五壮士史实资料",
    organization: "中共邯郸市委党史研究室转载",
    url: "https://www.handandangshi.gov.cn/fandui/370.html",
    note: "纪念节点按固定史实呈现，不将牺牲设计成奖励或可改写事件。",
  },
  {
    title: "晋察冀边区春旱、粮荒与《树叶训令》",
    organization: "天津市纪委监委转载资料",
    url: "https://www.tjjw.gov.cn/lswh/2025/07/30/detail_2025073086398.html",
    note: "用于1942年春困难与部队不得同群众争食的纪律背景。",
  },
  {
    title: "晋察冀抗日根据地的疾疫应对",
    organization: "地方纪检监察史料转载",
    url: "https://www.lhlzw.gov.cn/sitesources/nysjwjw/page_pc/xcjd/s/articledcb156c92c474228a88bfe2becf54d0e.html",
    note: "用于卫生员、饮水卫生、疫情报告等机制。",
  },
  {
    title: "晋察冀军区精兵简政",
    organization: "中国军网",
    url: "https://www.81.cn/js_208592/10154869.html",
    note: "用于1942年初机关精简与地方武装加强的事件。",
  },
  {
    title: "华北敌后秘密交通线",
    organization: "河北省政协文史资料",
    url: "https://www.hebzx.gov.cn/system/2024/06/19/030294101.shtml",
    note: "用于冀中干部、卫生人员经安国、定南、曲阳、唐县等地转移的结局事件。",
  },
]);

const mapModeDefinitions = Object.freeze({
  situation: { name: "综合形势", help: "同时显示抗日网络、日伪据点压力和暴露风险。" },
  safety: { name: "群众安全", help: "颜色表示群众转移、粮食、医疗与日常安全状况。" },
  network: { name: "组织网络", help: "颜色表示秘密交通、村级组织和地方联络的稳固程度。" },
  enemy: { name: "敌情压力", help: "颜色表示日伪据点、封锁与已掌握的活动线索。" },
});

let gameState = null;
let selectedRegionId = "fuping";
let selectedFormationId = "mobileGuard";
let selectedStanceId = "balanced";
let selectedFallbackId = "";
let currentMapMode = localStorage.getItem(mapModeKey) || "situation";
let soundEnabled = localStorage.getItem(soundKey) === "true";
let audioContext = null;
let pendingReport = null;
let modalCloseAction = null;
let modalReturnTarget = null;
let sessionStartedAt = Date.now();

function GetElement(id) {
  return document.getElementById(id);
}

function RestoreFocus(selector) {
  window.requestAnimationFrame(() => document.querySelector(selector)?.focus());
}

function EscapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function Clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function FormatSigned(value) {
  const number = Math.round(Number(value) || 0);
  return number > 0 ? `+${number}` : String(number);
}

function GetRegionState(regionId) {
  if (!gameState?.regions) return null;
  if (Array.isArray(gameState.regions)) return gameState.regions.find((region) => region.id === regionId) || null;
  return gameState.regions[regionId] || null;
}

function GetTurnIndex() {
  return Clamp(gameState?.turnIndex ?? gameState?.turn ?? 0, 0, historicalTurns.length);
}

function GetCurrentTurnDefinition() {
  return historicalTurns[Math.min(GetTurnIndex(), historicalTurns.length - 1)] || historicalTurns[0];
}

function GetTurnDisplayDate(turn) {
  return turn?.displayDate || turn?.dateLabel || turn?.date || "";
}

function GetTurnFactText(turn) {
  return turn?.fact?.text || turn?.historicalNote || (typeof turn?.fact === "string" ? turn.fact : "该节点背景按史实固定发生。局部数值与地区影响为策略抽象。");
}

function GetTurnPromptText(turn) {
  return turn?.prompt || "在不改变史实节点的前提下，决定本区怎样配置有限资源、保护群众与保存组织。";
}

function GetTurnAbstractionText(turn) {
  return turn?.abstraction?.text || "地区边界、资源数值与行动尺度均为策略抽象，不对应单一真实机构的完整决策。";
}

function GetResources() {
  return gameState?.resources || gameState || {};
}

function GetOrders() {
  return Array.isArray(gameState?.queuedOrders) ? gameState.queuedOrders : [];
}

function GetInstitutionList() {
  const institutions = gameState?.institutions || [];
  return Array.isArray(institutions) ? institutions : Object.values(institutions);
}

function IsCampaignEnded() {
  return gameState?.phase === "ended" || Boolean(gameState?.outcome);
}

function GetDefinitionById(collection, itemId) {
  if (Array.isArray(collection)) return collection.find((item) => item.id === itemId) || null;
  return collection?.[itemId] || null;
}

function GetCollectionItems(collection) {
  return Array.isArray(collection) ? collection : Object.values(collection || {});
}

function PlayTone(kind = "tap") {
  if (!soundEnabled) return;
  try {
    audioContext ||= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    const tone = kind === "confirm" ? [392, 523, 0.12] : kind === "warn" ? [196, 150, 0.16] : [330, 300, 0.045];
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(tone[0], now);
    oscillator.frequency.exponentialRampToValueAtTime(tone[1], now + tone[2]);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + tone[2]);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + tone[2] + 0.01);
  } catch {
    soundEnabled = false;
  }
}

function ShowToast(message, tone = "tap") {
  const toast = GetElement("toast");
  const liveRegion = GetElement("liveRegion");
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  toast.classList.add("visible");
  if (liveRegion) liveRegion.textContent = message;
  PlayTone(tone);
  window.clearTimeout(ShowToast.timerId);
  ShowToast.timerId = window.setTimeout(() => {
    toast.classList.remove("visible");
    toast.hidden = true;
  }, 2300);
}

function OpenModal(content, options = {}) {
  const backdrop = GetElement("modalBackdrop");
  const panel = GetElement("modalPanel");
  if (!backdrop || !panel) return;
  if (backdrop.hidden) modalReturnTarget = document.activeElement;
  panel.innerHTML = content;
  backdrop.hidden = false;
  document.body.classList.add("modalOpen");
  modalCloseAction = options.onClose || null;
  panel.dataset.dismissible = options.dismissible === false ? "false" : "true";
  const focusTarget = panel.querySelector("[autofocus], button, a, [tabindex='0']");
  window.requestAnimationFrame(() => focusTarget?.focus());
}

function CloseModal(force = false) {
  const backdrop = GetElement("modalBackdrop");
  const panel = GetElement("modalPanel");
  if (!backdrop || !panel) return;
  if (!force && panel.dataset.dismissible === "false") return;
  backdrop.hidden = true;
  document.body.classList.remove("modalOpen");
  const action = modalCloseAction;
  modalCloseAction = null;
  action?.();
  const returnTarget = modalReturnTarget;
  modalReturnTarget = null;
  window.requestAnimationFrame(() => {
    if (!backdrop.hidden) return;
    if (returnTarget?.isConnected && typeof returnTarget.focus === "function") returnTarget.focus();
    else GetElement("brandButton")?.focus();
  });
}

function SaveGame() {
  if (!gameState) return;
  try {
    const serialized = SerializeGame(gameState);
    const previous = localStorage.getItem(saveKey);
    const preserveBackup = localStorage.getItem(backupGuardKey) === "true";
    if (!preserveBackup && previous && previous !== serialized) localStorage.setItem(backupKey, previous);
    localStorage.setItem(saveKey, serialized);
  } catch (error) {
    console.warn("Unable to save campaign", error);
  }
}

function LoadSavedGame() {
  const candidates = [localStorage.getItem(saveKey), localStorage.getItem(backupKey)].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const loaded = DeserializeGame(candidate);
      if (CheckInvariants(loaded).valid) return loaded;
    } catch {
      continue;
    }
  }
  return null;
}

function NewCampaign(seed = 19410707) {
  const previousSave = localStorage.getItem(saveKey) || localStorage.getItem(backupKey);
  if (previousSave) {
    localStorage.setItem(backupKey, previousSave);
    localStorage.setItem(backupGuardKey, "true");
  } else {
    localStorage.removeItem(backupKey);
    localStorage.removeItem(backupGuardKey);
  }
  gameState = CreateGame(seed);
  selectedRegionId = "fuping";
  selectedFormationId = "mobileGuard";
  selectedStanceId = "balanced";
  selectedFallbackId = "";
  sessionStartedAt = Date.now();
  localStorage.removeItem(saveKey);
  SaveGame();
  RenderAll();
  CloseModal(true);
  ShowTurnEvent(true);
}

function ContinueCampaign() {
  const loaded = LoadSavedGame();
  if (!loaded) {
    ShowToast("没有找到可继续的战役", "warn");
    return;
  }
  gameState = loaded;
  selectedRegionId = gameState.selectedRegionId || "fuping";
  selectedFormationId = gameState.selectedFormationId && gameState.formations?.[gameState.selectedFormationId]
    ? gameState.selectedFormationId
    : "mobileGuard";
  sessionStartedAt = Date.now();
  RenderAll();
  CloseModal(true);
  if (IsCampaignEnded()) ShowEnding();
  else if (HasPendingEvent()) ShowTurnEvent();
}

function HasPendingEvent() {
  if (!gameState || IsCampaignEnded()) return false;
  return gameState.selectedEventOptionId == null;
}

function ShowMainMenu() {
  const hasSave = Boolean(LoadSavedGame());
  OpenModal(`
    <section class="titleScene">
      <p class="modalKicker">敌后根据地 · 区域经营战略</p>
      <h1>北岳烽火 <small>1941—1942</small></h1>
      <p class="titleLead">铁路、公路与据点切开山河。你必须判断不完整敌情，把五支有位置、有疲劳的编组放到正确的交通线上，并提前写好退路。<b>不是点数值，而是决定谁去、从哪走、放弃哪里。</b></p>
      <div class="titleFacts">
        <article><span>12</span><b>作战回合</b><small>涵盖18个固定史实节点</small></article>
        <article><span>5</span><b>持久编组</b><small>位置、疲劳与任务能力各不相同</small></article>
        <article><span>4</span><b>指挥点</b><small>不能让全部编组每期都出动</small></article>
      </div>
      <div class="ethicsNote"><b>叙事边界</b><span>玩家操作的是虚构的综合协调界面，不扮演真实历史人物；全国战争走向与重大牺牲不会被改写。地图边界、行动尺度与部分地方情境为明确标注的策略抽象。</span></div>
      <div class="modalActions">
        <button class="primaryButton" data-menu-action="new" autofocus>开始战役</button>
        ${hasSave ? '<button data-menu-action="continue">继续存档</button>' : ""}
        <button data-menu-action="help">先看玩法</button>
        <button data-menu-action="archive">史实说明与资料</button>
      </div>
    </section>
  `, { dismissible: Boolean(gameState) });
  GetElement("modalPanel")?.querySelectorAll("[data-menu-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.menuAction;
      if (action === "new") ShowNewCampaignConfirm();
      if (action === "continue") ContinueCampaign();
      if (action === "help") ShowHelp();
      if (action === "archive") ShowArchive();
    });
  });
}

function ShowNewCampaignConfirm() {
  const hasSave = Boolean(LoadSavedGame());
  if (!hasSave) {
    NewCampaign();
    return;
  }
  OpenModal(`
    <section class="compactModal">
      <p class="modalKicker">重新开始</p>
      <h2>覆盖当前战役存档？</h2>
      <p>旧存档会保留一份自动备份，直到下一次回合结算。</p>
      <div class="modalActions"><button class="dangerButton" id="confirmNewButton" autofocus>覆盖并开始</button><button id="cancelNewButton">取消</button></div>
    </section>
  `);
  GetElement("confirmNewButton")?.addEventListener("click", () => NewCampaign());
  GetElement("cancelNewButton")?.addEventListener("click", ShowMainMenu);
}

function ShowHelp() {
  const actionCards = Object.entries(actionDefinitions).map(([actionId, action]) => `
    <article class="helpAction"><span>${EscapeHtml(action.icon || "令")}</span><div><b>${EscapeHtml(action.name || actionId)}</b><p>${EscapeHtml(action.description || action.desc || "")}</p></div></article>
  `).join("");
  OpenModal(`
    <section class="wideModal">
      <div class="modalHeader"><div><p class="modalKicker">核心玩法</p><h2>先读敌情，再编组路线</h2></div><button class="closeButton" data-close-modal aria-label="关闭玩法说明">×</button></div>
      <div class="helpColumns">
        <div>
          <ol class="flowList">
            <li><b>读征候</b><span>敌方本期计划在你下令前已经锁定。斜纹只表示可观察征候；可花情报核实最多三处。</span></li>
            <li><b>选编组</b><span>五支编组位置、疲劳和能力不同。每支至多一项任务，移动受相邻交通边约束。</span></li>
            <li><b>做组合</b><span>侦察＋迟滞、掩护＋疏散、联络＋运输会形成联动；孤立点一项任务收益有限。</span></li>
            <li><b>按阶段结算</b><span>侦察先核实，随后掩护与联络展开，再处理运输、救济和转移；同阶段按既定编组序列同步归并，不受点击先后影响。</span></li>
            <li><b>留预案</b><span>为疏散与机构转移指定退路。未出动编组会休整并成为预备，但也意味着少完成一项主动任务。</span></li>
            <li><b>看后果</b><span>交通边会受损，机构转移会停摆一回合，疲劳与暴露会延续；没有全图自动回血。</span></li>
          </ol>
          <div class="ruleNote"><b>军事行动服务于保护与时间</b><p>没有歼敌榜。迟滞的价值是争取转移窗口；结局看全区安全及最薄弱四分之一地区、结局时的阜平连通网络、机构运转、编组保存与固定接应责任。</p></div>
        </div>
        <div class="helpActionGrid">${actionCards}</div>
      </div>
      <div class="modalActions"><button class="primaryButton" data-close-modal autofocus>明白了</button><button id="helpArchiveButton">查看史实边界</button></div>
    </section>
  `, { onClose: () => gameState ? null : ShowMainMenu() });
  GetElement("helpArchiveButton")?.addEventListener("click", ShowArchive);
  BindModalCloseButtons();
}

function ShowArchive(onCloseAction = null) {
  const sourceCards = archiveSources.map((source, index) => `
    <li><span>${String(index + 1).padStart(2, "0")}</span><div><a href="${EscapeHtml(source.url)}" target="_blank" rel="noreferrer">${EscapeHtml(source.title)}</a><small>${EscapeHtml(source.organization)}</small><p>${EscapeHtml(source.note)}</p></div></li>
  `).join("");
  OpenModal(`
    <section class="wideModal archiveModal">
      <div class="modalHeader"><div><p class="modalKicker">史实说明</p><h2>事实、视角与策略抽象</h2></div><button class="closeButton" data-close-modal aria-label="关闭史实说明">×</button></div>
      <div class="archiveGrid">
        <article><span class="factTag">史实</span><h3>固定不改写</h3><p>冈村宁次接任、1941年秋季大“扫荡”、狼牙山五壮士、1942年春困难及冀中“五一”大“扫荡”等节点按史实发生。真实人物不使用虚构台词。</p></article>
        <article><span class="abstractTag">抽象</span><h3>明确被压缩</h3><p>十二地区的边界与邻接、有限指挥点下同步任务的时间尺度、资源数值、综合协调机构及局部结果均为游戏抽象，不是当时行政区划或精确战场复原。</p></article>
        <article><span class="contextTag">全局</span><h3>敌后不是全部</h3><p>本作聚焦中国共产党领导的晋察冀敌后根据地，同时承认国民党军正面战场、其他抗日力量与国际反法西斯战争的贡献。第二次国共合作中的协同与摩擦均不被简化成第二个敌人。</p></article>
        <article><span class="careTag">表达</span><h3>克制呈现创伤</h3><p>侵略暴力只通过疏散、救济、机构损失与群众安全后果表达；没有可操作的暴行场面、伤亡奇观、民族侮辱语或以平民代价换分的机制。活动痕迹只抽象局部搜索方向，绝不转移侵略者责任。</p></article>
      </div>
      <h3 class="sourceTitle">主要核史资料</h3>
      <ol class="sourceList">${sourceCards}</ol>
      <p class="sourceCaveat">不同资料对个别行动起日、规模与损失数字存在口径差异。本作避免把有争议的精确数字写成唯一结论，并在日方档案出现时明确其侵略方来源。</p>
      <div class="modalActions"><button class="primaryButton" data-close-modal autofocus>返回战局</button></div>
    </section>
  `, { onClose: typeof onCloseAction === "function" ? onCloseAction : () => gameState ? null : ShowMainMenu() });
  BindModalCloseButtons();
}

function BindModalCloseButtons() {
  GetElement("modalPanel")?.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", () => CloseModal(true)));
}

function RenderRoutes() {
  const layer = GetElement("routeLayer");
  if (!layer || !gameState) return;
  layer.innerHTML = "";
  const layerWidth = layer.clientWidth || GetElement("strategyMap")?.clientWidth || 1;
  const layerHeight = layer.clientHeight || GetElement("strategyMap")?.clientHeight || 1;
  for (const route of Object.values(strategyRouteDefinitions)) {
    const fromLayout = regionLayouts[route.fromId];
    const toLayout = regionLayouts[route.toId];
    const routeState = gameState.routes?.[route.id];
    if (!fromLayout || !toLayout || !routeState) continue;
    const from = [fromLayout.left + fromLayout.width / 2, fromLayout.top + fromLayout.height / 2];
    const to = [toLayout.left + toLayout.width / 2, toLayout.top + toLayout.height / 2];
    const line = document.createElement("div");
    const deltaX = (to[0] - from[0]) / 100 * layerWidth;
    const deltaY = (to[1] - from[1]) / 100 * layerHeight;
    const distance = Math.hypot(deltaX, deltaY);
    const angle = Math.atan2(deltaY, deltaX) * 180 / Math.PI;
    line.className = `routeLine ${route.kind}`;
    line.dataset.routeId = route.id;
    line.dataset.state = routeState.integrity >= 58 ? "open" : routeState.integrity >= 30 ? "watched" : routeState.integrity > 0 ? "strained" : "cut";
    line.style.left = `${from[0]}%`;
    line.style.top = `${from[1]}%`;
    line.style.width = `${distance}px`;
    line.style.transform = `rotate(${angle}deg)`;
    const stateName = routeState.integrity >= 58 ? "畅通" : routeState.integrity >= 30 ? "受监视" : routeState.integrity > 0 ? "吃紧" : "中断";
    line.title = `${route.name}：${stateName}，完整度${Math.round(routeState.integrity)}`;
    line.setAttribute("role", "img");
    line.setAttribute("aria-label", line.title);
    layer.appendChild(line);
    if (route.kind === "rail") {
      const label = document.createElement("span");
      label.className = `routeLabel ${route.kind}`;
      label.style.left = `${(from[0] + to[0]) / 2}%`;
      label.style.top = `${(from[1] + to[1]) / 2}%`;
      label.textContent = `封锁 ${Math.round(routeState.integrity)}`;
      label.setAttribute("aria-hidden", "true");
      layer.appendChild(label);
    }
  }
}

function ScheduleRouteRender() {
  window.clearTimeout(ScheduleRouteRender.timerId);
  ScheduleRouteRender.timerId = window.setTimeout(RenderRoutes, 80);
}

function RenderRegions() {
  const layer = GetElement("regionLayer");
  if (!layer || !gameState) return;
  const forecast = GetEnemyForecast(gameState) || {};
  const forecastIds = new Set((forecast.targets || []).filter((target) => !target.confirmed || target.isTarget).map((target) => target.regionId));
  const connectedIds = new Set(GetConnectedRegionIds(gameState));
  layer.innerHTML = "";
  for (const definition of GetCollectionItems(regionDefinitions)) {
    const region = GetRegionState(definition.id);
    const layout = regionLayouts[definition.id];
    if (!region || !layout) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "regionButton";
    button.dataset.regionId = definition.id;
    button.dataset.mapMode = currentMapMode;
    button.dataset.selected = String(definition.id === selectedRegionId);
    button.dataset.forecast = String(forecastIds.has(definition.id));
    button.dataset.connected = String(connectedIds.has(definition.id));
    button.dataset.safetyBand = GetBand(region.safety);
    button.dataset.networkBand = GetBand(region.network);
    button.dataset.enemyBand = GetBand(100 - region.enemyControl);
    button.dataset.exposureBand = GetBand(100 - region.exposure);
    button.setAttribute("aria-pressed", String(definition.id === selectedRegionId));
    button.style.left = `${layout.left}%`;
    button.style.top = `${layout.top}%`;
    button.style.width = `${layout.width}%`;
    button.style.height = `${layout.height}%`;
    button.style.clipPath = layout.shape;
    button.style.setProperty("--safety", `${Clamp(region.safety, 0, 100)}%`);
    button.style.setProperty("--network", `${Clamp(region.network, 0, 100)}%`);
    button.style.setProperty("--enemy", `${Clamp(region.enemyControl, 0, 100)}%`);
    button.style.setProperty("--exposure", `${Clamp(region.exposure, 0, 100)}%`);
    const institutionCount = GetInstitutionList().filter((institution) => institution.regionId === definition.id && institution.active !== false).length;
    const formations = Object.values(gameState.formations || {}).filter((formation) => formation.regionId === definition.id);
    const protection = Number(region.protection || 0);
    button.innerHTML = `
      <span class="regionName">${EscapeHtml(definition.name)}</span>
      <span class="regionTerrain">${EscapeHtml(definition.terrainName || definition.terrain || "")}</span>
      <span class="regionReadout"><b>网 ${Math.round(region.network)}</b><b>安 ${Math.round(region.safety)}</b></span>
      <span class="regionMarks">${region.enemyControl >= 55 ? '<i title="敌伪据点压力高">据</i>' : ""}${protection >= 55 ? '<i title="长期掩护能力较强">护</i>' : ""}${institutionCount ? `<i title="有${institutionCount}处机构">机${institutionCount}</i>` : ""}</span>
      <span class="formationMarks">${formations.map((formation) => `<i title="${EscapeHtml(formation.name)}">${EscapeHtml(formationDefinitions[formation.id]?.shortName || "组")}</i>`).join("")}</span>
    `;
    button.setAttribute("aria-label", `${definition.name}，组织网络${Math.round(region.network)}，群众安全${Math.round(region.safety)}，据点与封锁压力${Math.round(region.enemyControl)}，地方缓存${Math.round(region.localCache)}，驻有${formations.length}支编组`);
    button.addEventListener("click", () => SelectRegion(definition.id));
    layer.appendChild(button);
  }
}

function GetBand(value) {
  const number = Number(value) || 0;
  if (number >= 70) return "strong";
  if (number >= 45) return "steady";
  if (number >= 25) return "strained";
  return "critical";
}

function SelectRegion(regionId) {
  const restoreFocus = document.activeElement?.classList?.contains("regionButton");
  selectedRegionId = regionId;
  selectedFallbackId = "";
  if (gameState) gameState.selectedRegionId = regionId;
  RenderRegions();
  RenderCommandPanel();
  if (restoreFocus) RestoreFocus(`[data-region-id="${regionId}"]`);
  SaveGame();
  PlayTone("tap");
}

function RenderHeader() {
  if (!gameState) return;
  const turn = GetCurrentTurnDefinition();
  const resources = GetResources();
  if (GetElement("dateDisplay")) GetElement("dateDisplay").innerHTML = `<strong>${EscapeHtml(GetTurnDisplayDate(turn))}</strong><span>第 ${Math.min(GetTurnIndex() + 1, historicalTurns.length)} / ${historicalTurns.length} 回合</span>`;
  const values = {
    supplyValue: resources.supply,
    organizationValue: resources.organization,
    intelligenceValue: resources.intelligence,
    trustValue: resources.trust,
  };
  for (const [elementId, value] of Object.entries(values)) {
    const element = GetElement(elementId);
    if (element) element.textContent = Math.round(Number(value) || 0);
  }
  const soundButton = GetElement("soundButton");
  if (soundButton) {
    soundButton.setAttribute("aria-pressed", String(soundEnabled));
    soundButton.textContent = soundEnabled ? "音效 开" : "音效 关";
  }
  const policyButton = GetElement("policyButton");
  const policyId = gameState.policyId || gameState.policy || "protect";
  const policy = GetDefinitionById(policyDefinitions, policyId);
  if (policyButton) policyButton.innerHTML = `<span>当前方针</span><b>${EscapeHtml(policy?.name || "保存群众")}</b>`;
}

function RenderMapModes() {
  document.querySelectorAll(".mapModeButton[data-map-mode]").forEach((button) => {
    const active = button.dataset.mapMode === currentMapMode;
    button.setAttribute("aria-pressed", String(active));
    button.classList.toggle("active", active);
  });
  const legend = GetElement("mapLegend");
  if (legend) {
    const mode = mapModeDefinitions[currentMapMode] || mapModeDefinitions.situation;
    const routeCounts = { open: 0, watched: 0, strained: 0, cut: 0 };
    for (const route of Object.values(gameState?.routes || {})) {
      const state = route.integrity >= 58 ? "open" : route.integrity >= 30 ? "watched" : route.integrity > 0 ? "strained" : "cut";
      routeCounts[state] += 1;
    }
    legend.innerHTML = `<b>${EscapeHtml(mode.name)}</b><span title="${EscapeHtml(mode.help)}">${EscapeHtml(mode.help)}</span><div class="routeStateLegend" aria-label="交通线状态：畅通${routeCounts.open}条，受监视${routeCounts.watched}条，吃紧${routeCounts.strained}条，中断${routeCounts.cut}条"><i data-state="open"></i>畅通 ${routeCounts.open}<i data-state="watched"></i>受监视 ${routeCounts.watched}<i data-state="strained"></i>吃紧 ${routeCounts.strained}<i data-state="cut"></i>中断 ${routeCounts.cut}</div>`;
  }
}

function RenderForecast() {
  const banner = GetElement("forecastBanner");
  if (!banner || !gameState) return;
  const forecast = GetEnemyForecast(gameState) || {};
  const confidence = forecast.certainty || forecast.confidence || forecast.level || "模糊";
  const summary = forecast.summary || forecast.text || "交通线上出现调动征候，但目标尚不明确。";
  const reports = (forecast.targets || []).slice(0, 4).map((target) => `<li data-confirmed="${Boolean(target.confirmed)}"><b>${EscapeHtml(target.regionName)}</b><span>${EscapeHtml(target.likelihood)}</span></li>`).join("");
  banner.innerHTML = `<span>敌情预判 · ${EscapeHtml(confidence)}</span><b id="forecastTitle" title="${EscapeHtml(summary)}">${EscapeHtml(summary)}</b>${reports ? `<ul>${reports}</ul>` : ""}`;
  banner.dataset.confidence = String(confidence);
}

function BuildStatRow(label, value, kind, hint) {
  const safeValue = Clamp(value, 0, 100);
  return `<div class="statRow ${kind}"><div><span>${EscapeHtml(label)}</span><b>${Math.round(safeValue)}</b></div><div class="statTrack"><i style="width:${safeValue}%"></i></div><small>${EscapeHtml(hint)}</small></div>`;
}

function RenderCommandPanel() {
  if (!gameState) return;
  const definition = GetDefinitionById(regionDefinitions, selectedRegionId);
  const region = GetRegionState(selectedRegionId);
  if (!definition || !region) return;
  const title = GetElement("regionTitle");
  const subtitle = GetElement("regionSubtitle");
  const status = GetElement("regionStatus");
  const stats = GetElement("regionStats");
  if (title) title.textContent = definition.name;
  if (subtitle) subtitle.textContent = `${definition.terrainName || definition.terrain || "地区"} · ${definition.role || definition.note || "北岳区战略地区"} · 地方缓存 ${Math.round(region.localCache || 0)}`;
  const institutions = GetInstitutionList().filter((institution) => institution.regionId === selectedRegionId && institution.active !== false);
  if (status) {
    const connected = GetConnectedRegionIds(gameState).includes(selectedRegionId);
    const institutionNames = institutions.map((institution) => `${institution.name}${institution.disruptedTurns ? "·停摆" : ""}`).join("、");
    const institutionStatus = institutions.length
      ? `<span class="institutionChip" title="${EscapeHtml(institutionNames)}" aria-label="本地机构：${EscapeHtml(institutionNames)}">机构 ${institutions.length}</span>`
      : "";
    status.innerHTML = `<span data-band="${GetBand(region.network)}">网络 ${GetBandName(region.network)}</span><span data-band="${GetBand(region.safety)}">安全 ${GetBandName(region.safety)}</span><span data-band="${connected ? "strong" : "critical"}">${connected ? "连通阜平" : "交通隔离"}</span><span class="cacheChip">缓存 ${Math.round(region.localCache || 0)}</span>${institutionStatus}`;
  }
  if (stats) {
    stats.innerHTML = [
      BuildStatRow("组织网络", region.network, "network", "秘密交通、村级组织与地方联络"),
      BuildStatRow("群众安全", region.safety, "safety", "转移、粮食、医疗与日常生计"),
      BuildStatRow("据点压力", region.enemyControl, "enemy", "长期据点、封锁与道路控制；不等于本期隐藏目标"),
      BuildStatRow("暴露程度", region.exposure, "exposure", "侵略军对本地网络掌握的线索"),
      BuildStatRow("交通准备", Math.min(100, region.network * 0.6 + region.protection * 0.4), "protection", "联络、掩护和相邻交通边的综合准备"),
    ].join("");
  }
  RenderActionList();
}

function GetBandName(value) {
  const band = GetBand(value);
  return { strong: "稳固", steady: "尚可", strained: "吃紧", critical: "危急" }[band];
}

function SelectFormation(formationId) {
  if (!gameState?.formations?.[formationId]) return;
  selectedFormationId = formationId;
  selectedFallbackId = "";
  gameState.selectedFormationId = formationId;
  SaveGame();
  RenderRegions();
  RenderActionList();
  RestoreFocus(`[data-formation-id="${formationId}"]`);
  PlayTone("tap");
}

function GetFallbackOptions(regionId) {
  const region = GetRegionState(regionId);
  return (region?.adjacentIds || []).filter((adjacentId) => {
    const routeId = `route_${[regionId, adjacentId].sort().join("_")}`;
    return Number(gameState.routes?.[routeId]?.integrity || 0) >= 20;
  });
}

function HandleProbe() {
  if (!gameState) return;
  try {
    gameState = ProbeRegion(gameState, selectedRegionId);
  } catch (error) {
    ShowToast(error?.message || "这一区域暂时无法继续核实", "warn");
    return;
  }
  SaveGame();
  RenderAll();
  RestoreFocus("#probeRegionButton");
  const report = GetEnemyForecast(gameState).targets.find((target) => target.regionId === selectedRegionId && target.confirmed);
  ShowToast(report?.likelihood ? `${GetRegionState(selectedRegionId).name}：${report.likelihood}` : "征候已经核实", "confirm");
}

function RenderActionList() {
  const list = GetElement("actionList");
  if (!list || !gameState) return;
  const formation = gameState.formations[selectedFormationId] || Object.values(gameState.formations)[0];
  selectedFormationId = formation.id;
  const formationDefinition = formationDefinitions[formation.id];
  const currentOrder = GetOrders().find((order) => order.formationId === formation.id);
  const fallbackOptions = GetFallbackOptions(selectedRegionId);
  if (!fallbackOptions.includes(selectedFallbackId)) selectedFallbackId = fallbackOptions[0] || "";
  const probePreview = GetProbePreview(gameState, selectedRegionId);
  const formationButtons = Object.values(formationDefinitions).map((definition) => {
    const state = gameState.formations[definition.id];
    const assigned = GetOrders().find((order) => order.formationId === definition.id);
    return `<button type="button" class="formationButton" data-formation-id="${EscapeHtml(definition.id)}" data-selected="${definition.id === formation.id}" data-assigned="${Boolean(assigned)}" aria-pressed="${definition.id === formation.id}"><span>${EscapeHtml(definition.shortName)}</span><b>${EscapeHtml(definition.name)}</b><small>${EscapeHtml(GetRegionState(state.regionId)?.name || state.regionId)} · 凝聚${Math.round(state.cohesion)} · 疲劳${Math.round(state.fatigue)}</small></button>`;
  }).join("");
  const stanceButtons = Object.values(stanceDefinitions).map((stance) => `<button type="button" class="stanceButton" data-stance-id="${EscapeHtml(stance.id)}" aria-pressed="${stance.id === selectedStanceId}"><b>${EscapeHtml(stance.name)}</b><small>${EscapeHtml(stance.description)}</small></button>`).join("");
  const fallbackMarkup = fallbackOptions.map((regionId) => `<option value="${EscapeHtml(regionId)}" ${regionId === selectedFallbackId ? "selected" : ""}>${EscapeHtml(GetRegionState(regionId)?.name || regionId)}</option>`).join("");
  list.innerHTML = `
    <div class="formationRoster" role="group" aria-label="可用编组">${formationButtons}</div>
    <section class="selectedFormationCard"><div><span>${EscapeHtml(formationDefinition.shortName)}</span><h4>${EscapeHtml(formation.name)}</h4><p>当前在${EscapeHtml(GetRegionState(formation.regionId)?.name || formation.regionId)}；本期只能执行一项任务，重新下令会替换原计划。</p></div>${currentOrder ? `<em>已计划：${EscapeHtml(actionDefinitions[currentOrder.missionId].name)}</em>` : '<em class="reserveTag">未出动＝隐蔽预备</em>'}</section>
    <button type="button" class="probeButton" id="probeRegionButton" ${probePreview.valid ? "" : "disabled"}><span>核实敌情</span><b>${EscapeHtml(probePreview.summary)}</b></button>
    <div class="planControls"><fieldset><legend>行动姿态</legend><div class="stanceGrid">${stanceButtons}</div></fieldset><label>疏散／机构转移退路<select id="fallbackSelect" ${fallbackOptions.length ? "" : "disabled"}>${fallbackMarkup || '<option value="">无可用相邻退路</option>'}</select></label></div>
    <div class="missionGrid" role="group" aria-label="当前编组可执行任务"></div>
  `;
  const missionGrid = list.querySelector(".missionGrid");
  for (const actionId of formationDefinition.missionIds) {
    const action = actionDefinitions[actionId];
    const preview = GetActionPreview(gameState, {
      missionId: actionId,
      formationId: formation.id,
      targetRegionId: selectedRegionId,
      stanceId: selectedStanceId,
      fallbackRegionId: action.requiresFallback ? selectedFallbackId : null,
    });
    const allowed = preview.valid && !IsCampaignEnded();
    const button = document.createElement("button");
    button.type = "button";
    button.className = "actionButton";
    button.dataset.actionId = actionId;
    button.disabled = !allowed;
    const costs = preview.costs || {};
    const costText = Object.entries(costs).filter(([, value]) => Number(value) > 0).map(([key, value]) => `${GetResourceName(key)} ${value}`).join(" · ");
    const reason = preview.warnings?.[0] || "";
    const synergyMarkup = preview.synergies?.length ? `<span class="synergyTag">联动 ${EscapeHtml(preview.synergies.join("；"))}</span>` : "";
    button.innerHTML = `<span class="actionIcon">${EscapeHtml(action.icon || "令")}</span><span class="actionCopy"><b>${EscapeHtml(action.name || actionId)}</b><small>${EscapeHtml(action.description)}</small><strong>${EscapeHtml(preview.summary)}</strong>${synergyMarkup}${reason ? `<em>${EscapeHtml(reason)}</em>` : ""}</span><span class="actionCost"><b>${preview.commandCost} 指挥</b><small>${EscapeHtml(costText || "无资源消耗")}</small></span>`;
    button.addEventListener("click", () => AddOrder(actionId));
    missionGrid.appendChild(button);
  }
  list.querySelectorAll("[data-formation-id]").forEach((button) => button.addEventListener("click", () => SelectFormation(button.dataset.formationId)));
  list.querySelectorAll("[data-stance-id]").forEach((button) => button.addEventListener("click", () => {
    selectedStanceId = button.dataset.stanceId;
    RenderActionList();
    RestoreFocus(`[data-stance-id="${selectedStanceId}"]`);
  }));
  GetElement("probeRegionButton")?.addEventListener("click", HandleProbe);
  GetElement("fallbackSelect")?.addEventListener("change", (event) => {
    selectedFallbackId = event.target.value;
    RenderActionList();
    RestoreFocus("#fallbackSelect");
  });
}

function GetResourceName(key) {
  return { supply: "物资", organization: "组织", intelligence: "情报", trust: "信任" }[key] || key;
}

function AddOrder(actionId) {
  if (!gameState) return;
  const action = actionDefinitions[actionId];
  const input = {
    missionId: actionId,
    formationId: selectedFormationId,
    targetRegionId: selectedRegionId,
    stanceId: selectedStanceId,
    fallbackRegionId: action?.requiresFallback ? selectedFallbackId : null,
  };
  const preview = GetActionPreview(gameState, input);
  if (!preview?.valid) {
    ShowToast(preview?.warnings?.[0] || preview?.reason || "这道命令目前无法执行", "warn");
    return;
  }
  try {
    gameState = QueueOrder(gameState, input);
  } catch (error) {
    ShowToast(error?.message || "这道命令目前无法执行", "warn");
    return;
  }
  const region = GetDefinitionById(regionDefinitions, selectedRegionId);
  const formation = formationDefinitions[selectedFormationId];
  ShowToast(`已计划：${formation?.name || "编组"} → ${region?.name || "该地区"} · ${action?.name || actionId}`);
  SaveGame();
  RenderAll();
  RestoreFocus(`[data-action-id="${actionId}"]`);
}

function RenderOrders() {
  const list = GetElement("orderList");
  const clearButton = GetElement("clearOrdersButton");
  const commitButton = GetElement("commitTurnButton");
  if (!list || !gameState) return;
  const orders = GetOrders();
  const assessment = GetPlanAssessment(gameState);
  if (!orders.length) {
    list.innerHTML = '<li class="emptyOrder"><span>预</span><div><b>尚未配置编组</b><small>先选编组，再点地图目标和任务；未出动编组会隐蔽休整。</small></div></li>';
  } else {
    list.innerHTML = orders.map((order, index) => {
      const action = actionDefinitions[order.missionId];
      const region = GetRegionState(order.targetRegionId);
      const formation = formationDefinitions[order.formationId];
      const stance = stanceDefinitions[order.stanceId];
      const synergies = GetActionPreview(gameState, order).synergies || [];
      return `<li><span>${action.commandCost}</span><div><b>${EscapeHtml(formation.name)} → ${EscapeHtml(region.name)} · ${EscapeHtml(action.name)}</b><small>${EscapeHtml(stance.name)}${order.fallbackRegionId ? ` · 退往${EscapeHtml(GetRegionState(order.fallbackRegionId)?.name || order.fallbackRegionId)}` : ""}${synergies.length ? ` · 联动：${EscapeHtml(synergies.join("；"))}` : ""}</small></div><button data-remove-order="${EscapeHtml(order.formationId)}" aria-label="撤回${EscapeHtml(formation.name)}的命令">撤回</button></li>`;
    }).join("");
  }
  list.querySelectorAll("[data-remove-order]").forEach((button) => button.addEventListener("click", () => {
    const formationId = button.dataset.removeOrder;
    gameState = RemoveOrder(gameState, formationId);
    SaveGame();
    RenderAll();
    RestoreFocus(`[data-formation-id="${formationId}"]`);
    ShowToast("命令已撤回");
  }));
  if (clearButton) clearButton.disabled = !orders.length;
  if (commitButton) {
    commitButton.disabled = HasPendingEvent() || IsCampaignEnded();
    commitButton.innerHTML = `<span>锁定同步计划</span><b>${assessment.commandUsed} / ${assessment.commandAvailable} 指挥${assessment.synergies.length ? ` · ${assessment.synergies.length}项联动` : ""}</b>`;
  }
}

function RenderTurnPanel() {
  if (!gameState) return;
  const turn = GetCurrentTurnDefinition();
  const brief = GetOperationalBrief(gameState);
  const assessment = GetPlanAssessment(gameState);
  const title = GetElement("turnTitle");
  const context = GetElement("turnContext");
  if (title) title.textContent = turn.title || turn.name || "本回合局势";
  if (context) context.innerHTML = `<strong>${EscapeHtml(brief?.objective || "")}</strong><span>${EscapeHtml(brief?.future || "")}</span>${assessment.synergies.length ? `<em>已形成：${EscapeHtml(assessment.synergies.join("；"))}</em>` : ""}${assessment.gaps.length ? `<small>计划缺口：${EscapeHtml(assessment.gaps.join("；"))}</small>` : '<small class="planReady">当前计划覆盖了简报要求；仍需承担敌情判断错误的风险。</small>'}`;
}

function RenderTimeline() {
  const track = GetElement("timelineTrack");
  if (!track || !gameState) return;
  const current = GetTurnIndex();
  track.innerHTML = historicalTurns.map((turn, index) => `<button type="button" data-timeline-index="${index}" data-state="${index < current ? "past" : index === current ? "current" : "future"}" ${index === current ? 'aria-current="step"' : ""} aria-label="${EscapeHtml(GetTurnDisplayDate(turn))} ${EscapeHtml(turn.title || turn.name || "")}" title="${EscapeHtml(turn.title || turn.name || "")}"><i></i><span>${index + 1}</span></button>`).join("");
  track.querySelectorAll("[data-timeline-index]").forEach((button) => button.addEventListener("click", () => ShowTimelineEntry(Number(button.dataset.timelineIndex))));
}

function ShowTimelineEntry(index) {
  const turn = historicalTurns[index];
  if (!turn) return;
  const nodeMarkup = (turn.archiveNodes || []).map((node) => `<li><time>${EscapeHtml(node.date)}</time><div><b>${EscapeHtml(node.title)}</b><p>${EscapeHtml(node.fact)}</p></div></li>`).join("");
  OpenModal(`
    <section class="compactModal">
      <p class="modalKicker">${EscapeHtml(GetTurnDisplayDate(turn))}</p>
      <h2>${EscapeHtml(turn.title || turn.name || "史实节点")}</h2>
      <p class="modalLead">${EscapeHtml(turn.context || turn.summary || turn.description || "")}</p>
      <div class="historyBoundary"><span class="factTag">史实锚点</span><p>${EscapeHtml(GetTurnFactText(turn))}</p></div>
      <div class="historyBoundary abstract"><span class="abstractTag">${EscapeHtml(turn.abstraction?.label || "游戏抽象")}</span><p>${EscapeHtml(GetTurnAbstractionText(turn))}</p></div>
      ${nodeMarkup ? `<ol class="historyNodeList">${nodeMarkup}</ol>` : ""}
      <div class="modalActions"><button class="primaryButton" data-close-modal autofocus>关闭</button></div>
    </section>
  `);
  BindModalCloseButtons();
}

function RenderReports() {
  const entries = GetElement("logEntries");
  if (!entries || !gameState) return;
  const logs = gameState.logs || gameState.reportLog || [];
  const visible = logs.slice(-8).reverse();
  entries.innerHTML = visible.length ? visible.map((entry) => {
    const text = typeof entry === "string" ? entry : entry.text || entry.message || "";
    const tone = typeof entry === "string" ? "neutral" : entry.tone || entry.kind || "neutral";
    return `<li data-tone="${EscapeHtml(tone)}"><span></span><p>${EscapeHtml(text)}</p></li>`;
  }).join("") : '<li data-tone="neutral"><span></span><p>战局刚刚展开。先阅读敌情，再配置本期同步计划。</p></li>';
}

function RenderAll() {
  if (!gameState) return;
  RenderHeader();
  RenderMapModes();
  RenderRoutes();
  RenderRegions();
  RenderForecast();
  RenderCommandPanel();
  RenderTurnPanel();
  RenderOrders();
  RenderTimeline();
  RenderReports();
  document.body.dataset.ready = "true";
}

function ShowTurnEvent(isFirst = false) {
  if (!gameState || IsCampaignEnded() || !HasPendingEvent()) return;
  const turn = GetCurrentTurnDefinition();
  const brief = GetOperationalBrief(gameState);
  const nodeMarkup = (turn.archiveNodes || []).map((node) => `<li><time>${EscapeHtml(node.date)}</time><span>${EscapeHtml(node.title)}</span></li>`).join("");
  OpenModal(`
    <section class="eventModal">
      <div class="eventDate"><span>${EscapeHtml(GetTurnDisplayDate(turn))}</span><small>${isFirst ? "战役开端" : `第 ${GetTurnIndex() + 1} 回合`}</small></div>
      <p class="modalKicker">${EscapeHtml(turn.chapter || "北岳区战局")}</p>
      <h2>${EscapeHtml(turn.title || turn.name || "史实节点")}</h2>
      <p class="eventContext">${EscapeHtml(turn.context || turn.summary || turn.description || "")}</p>
      <div class="historyBoundary"><span class="factTag">史实</span><p>${EscapeHtml(GetTurnFactText(turn))}</p></div>
      <div class="historyBoundary abstract"><span class="abstractTag">${EscapeHtml(turn.abstraction?.label || "游戏抽象")}</span><p>${EscapeHtml(GetTurnAbstractionText(turn))}</p></div>
      ${nodeMarkup ? `<ol class="briefNodeList">${nodeMarkup}</ol>` : ""}
      <div class="historyBoundary duty"><span class="contextTag">本期责任</span><p>${EscapeHtml(GetTurnPromptText(turn))}</p></div>
      <div class="historyBoundary future"><span class="careTag">提前判断</span><p>${EscapeHtml(brief?.future || "")}</p></div>
      <div class="eventChoices"><button class="eventChoice fixed" data-event-choice="briefed"><span>图</span><div><b>打开地图并开始编组</b><p>这里没有即时加分选项；真正的决策发生在编组位置、交通路线、行动联动和退路预案中。</p><small>敌方本期计划已经锁定，不会读取你即将下达的命令后临时换目标。</small></div></button></div>
    </section>
  `, { dismissible: false });
  GetElement("modalPanel")?.querySelectorAll("[data-event-choice]").forEach((button) => button.addEventListener("click", () => HandleEventChoice(button.dataset.eventChoice)));
}

function HandleEventChoice(choiceId) {
  if (!gameState) return;
  try {
    gameState = ChooseEventOption(gameState, choiceId);
  } catch (error) {
    ShowToast(error?.message || "该方案当前无法执行", "warn");
    return;
  }
  SaveGame();
  CloseModal(true);
  RenderAll();
  ShowToast("简报已接收：请先读征候，再配置编组", "confirm");
}

function CommitCurrentTurn() {
  if (!gameState || IsCampaignEnded()) return;
  const orders = GetOrders();
  const assessment = GetPlanAssessment(gameState);
  if (HasPendingEvent()) {
    ShowTurnEvent();
    return;
  }
  if (assessment.commandUsed < assessment.commandAvailable) {
    const orderDescription = orders.length ? `保留 ${assessment.commandAvailable - assessment.commandUsed} 点指挥能力` : "让全部编组隐蔽休整";
    OpenModal(`
      <section class="compactModal">
        <p class="modalKicker">仍有预备余量</p>
        <h2>${orderDescription}？</h2>
        <p>未出动编组会降低疲劳并恢复凝聚，但本期阶段责任与交通缺口不会自动完成。敌方既定行动仍会发生。</p>
        ${assessment.gaps.length ? `<div class="commitWarnings"><b>当前缺口</b><p>${EscapeHtml(assessment.gaps.join("；"))}</p></div>` : ""}
        <div class="modalActions"><button class="primaryButton" id="confirmCommitButton" autofocus>确认提交</button><button data-close-modal>再想想</button></div>
      </section>
    `);
    GetElement("confirmCommitButton")?.addEventListener("click", ResolveTurn);
    BindModalCloseButtons();
    return;
  }
  ResolveTurn();
}

function ResolveTurn() {
  if (!gameState) return;
  const rollbackState = SerializeGame(gameState);
  const previousTurn = GetTurnIndex();
  try {
    gameState = CommitTurn(gameState);
    pendingReport = gameState.lastResolution || {};
  } catch (error) {
    console.error(error);
    ShowToast("本回合未能结算，已保留提交前存档", "warn");
    gameState = DeserializeGame(rollbackState);
    RenderAll();
    return;
  }
  localStorage.removeItem(backupGuardKey);
  SaveGame();
  CloseModal(true);
  RenderAll();
  ShowTurnReport(previousTurn, pendingReport);
  PlayTone("confirm");
}

function ShowTurnReport(previousTurn, report) {
  const turn = historicalTurns[previousTurn] || historicalTurns[0];
  const playerResults = report.playerResults || report.orders || report.orderResults || [];
  const enemyResults = report.enemyResults || report.enemyActions || report.enemy || [];
  const resourceDelta = report.resourceChanges || report.resourceDelta || report.resources || {};
  const resultMarkup = playerResults.length ? playerResults.map((result) => `<li data-tone="${EscapeHtml(result.tone || (result.success === false ? "warn" : "good"))}"><b>${EscapeHtml(result.title || result.name || "我方行动")}</b><p>${EscapeHtml(result.text || result.summary || result.reason || "命令已经执行。")}</p></li>`).join("") : '<li><b>整顿待命</b><p>本回合没有下达地区命令，协调力量用于恢复、隐蔽与等待情报。</p></li>';
  const enemyMarkup = enemyResults.length ? enemyResults.map((result) => `<li><b>${EscapeHtml(result.title || result.name || "敌军行动")}</b><p>${EscapeHtml(result.text || result.summary || "敌军沿交通线调整部署。")}</p>${result.previouslyKnowable ? `<small>${EscapeHtml(result.previouslyKnowable)}</small>` : ""}</li>`).join("") : `<li><b>${EscapeHtml(report.enemyTitle || "敌方回应")}</b><p>${EscapeHtml(report.enemySummary || "敌军沿既有据点与交通线继续施压。")}</p></li>`;
  const deltaMarkup = ["supply", "organization", "intelligence", "trust"].map((key) => `<span data-delta="${Number(resourceDelta[key] || 0) < 0 ? "down" : "up"}"><small>${GetResourceName(key)}</small><b>${FormatSigned(resourceDelta[key])}</b></span>`).join("");
  OpenModal(`
    <section class="reportModal">
      <div class="modalHeader"><div><p class="modalKicker">回合战报 · ${EscapeHtml(GetTurnDisplayDate(turn))}</p><h2>${EscapeHtml(report.title || turn.title || turn.name || "局势结算")}</h2></div></div>
      <div class="reportSummary">${EscapeHtml(report.summary || "每一道命令都改变了下一回合的风险与恢复能力。")}</div>
      ${report.objective ? `<div class="objectiveResult" data-success="${Boolean(report.objective.success)}"><span>${report.objective.success ? "阶段责任基本完成" : "阶段责任未完全完成"}</span><b>${EscapeHtml(report.objective.title)}</b><p>${EscapeHtml((report.objective.success ? report.objective.met : report.objective.missed).join("；") || report.objective.summary)}</p></div>` : ""}
      <div class="reportColumns"><div><h3>我方部署</h3><ul>${resultMarkup}</ul></div><div><h3>敌方行动</h3><ul class="enemyReport">${enemyMarkup}</ul></div></div>
      <div class="resourceDelta">${deltaMarkup}</div>
      <div class="modalActions"><button class="primaryButton" id="continueReportButton" autofocus>${IsCampaignEnded() ? "查看战役总结" : "进入下一节点"}</button></div>
    </section>
  `, { dismissible: false });
  GetElement("continueReportButton")?.addEventListener("click", () => {
    CloseModal(true);
    if (IsCampaignEnded()) ShowEnding();
    else ShowTurnEvent();
  });
}

function ShowPolicyMenu() {
  if (!gameState) return;
  const currentPolicyId = gameState.policyId || gameState.policy || "protect";
  const cards = Object.entries(policyDefinitions).map(([policyId, policy]) => {
    const active = policyId === currentPolicyId;
    return `<article class="policyCard" data-active="${active}"><div><span>${EscapeHtml(policy.icon || "策")}</span><h3>${EscapeHtml(policy.name || policyId)}</h3></div><p>${EscapeHtml(policy.description || policy.desc || "")}</p><small>${EscapeHtml(policy.effectText || policy.effect || "")}</small><button data-policy-id="${EscapeHtml(policyId)}" ${active ? "disabled" : ""}>${active ? "当前方针" : "调整为此方针"}</button></article>`;
  }).join("");
  OpenModal(`
    <section class="wideModal">
      <div class="modalHeader"><div><p class="modalKicker">全局方针</p><h2>建设、出击与保存</h2></div><button class="closeButton" data-close-modal aria-label="关闭方针界面">×</button></div>
      <p class="modalLead">方针不是科技树，而是当下有限干部与物资的倾向。调整会消耗组织力，并需经过一段时间才能再次更换。</p>
      <div class="policyGrid">${cards}</div>
      <div class="modalActions"><button data-close-modal autofocus>暂不调整</button></div>
    </section>
  `);
  GetElement("modalPanel")?.querySelectorAll("[data-policy-id]").forEach((button) => button.addEventListener("click", () => {
    try {
      gameState = ChangePolicy(gameState, button.dataset.policyId);
    } catch (error) {
      ShowToast(error?.message || "当前还不能调整方针", "warn");
      return;
    }
    SaveGame();
    CloseModal(true);
    RenderAll();
    ShowToast("全局方针已调整", "confirm");
  }));
  BindModalCloseButtons();
}

function ShowEnding() {
  if (!gameState) return;
  const score = GetCampaignScore(gameState) || {};
  const total = Math.round(score.total ?? score.score ?? 0);
  const title = score.label || score.title || score.endingTitle || (total >= 62 ? "保存元气，接续烽火" : total >= 52 ? "在困境中坚持下来" : "网络受创，火种未灭");
  const dimensions = score.components || score.dimensions || score.breakdown || {};
  function ReadDimension(key) {
    return Number(dimensions[key]?.value ?? dimensions[key] ?? score[key] ?? 0);
  }
  const dimensionCards = [
    ["群众安全", ReadDimension("safety"), 30],
    ["组织网络", ReadDimension("network"), 20],
    ["机构存续", ReadDimension("institutions"), 20],
    ["编组保存", ReadDimension("readiness"), 5],
    ["阶段责任", ReadDimension("duties"), 25],
  ].map(([name, value, weight]) => `<article><span>${EscapeHtml(name)}</span><b>${Math.round(Number(value) || 0)}</b><small>权重 ${weight}%</small></article>`).join("");
  OpenModal(`
    <section class="endingModal">
      <p class="modalKicker">1942年6月20日 · 北岳区阶段总结</p>
      <h1>${EscapeHtml(title)}</h1>
      <div class="finalScore"><span>综合评估</span><b>${total}</b><small>/ 100</small></div>
      <p class="endingText">${EscapeHtml(score.summary || score.description || "这一年留下的不是一条整齐国界，而是被保护下来的群众、仍能联络的村庄、继续运转的机构与没有中断的抗战组织。")}</p>
      <div class="endingDimensions">${dimensionCards}</div>
      <div class="historyEpilogue"><b>全国抗战仍在继续</b><p>本战役的阶段结果不会改写真实历史。冀中“五一”大“扫荡”在1942年6月结束后，华北敌后军民继续经历极其艰苦的反“扫荡”、反“蚕食”斗争；中国抗日战争最终在全民族长期抗战与世界反法西斯战争共同作用下，于1945年取得胜利。</p></div>
      <div class="modalActions"><button class="primaryButton" id="endingArchiveButton">查看史实资料</button><button id="endingNewButton">再开一局</button><button id="endingMenuButton">返回主菜单</button></div>
    </section>
  `, { dismissible: false });
  GetElement("endingArchiveButton")?.addEventListener("click", () => ShowArchive(ShowEnding));
  GetElement("endingNewButton")?.addEventListener("click", () => NewCampaign(Date.now() >>> 0));
  GetElement("endingMenuButton")?.addEventListener("click", ShowMainMenu);
}

function ToggleReportPanel() {
  const panel = GetElement("reportPanel");
  const button = GetElement("reportToggle");
  if (!panel || !button) return;
  const collapsed = panel.dataset.collapsed === "true";
  panel.dataset.collapsed = String(!collapsed);
  button.setAttribute("aria-expanded", String(collapsed));
}

function ToggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem(soundKey, String(soundEnabled));
  RenderHeader();
  if (soundEnabled) PlayTone("confirm");
}

function ChangeMapMode(mapMode) {
  if (!mapModeDefinitions[mapMode]) return;
  currentMapMode = mapMode;
  localStorage.setItem(mapModeKey, mapMode);
  RenderMapModes();
  RenderRegions();
  PlayTone("tap");
}

function BindInterface() {
  GetElement("brandButton")?.addEventListener("click", ShowMainMenu);
  GetElement("policyButton")?.addEventListener("click", ShowPolicyMenu);
  GetElement("archiveButton")?.addEventListener("click", ShowArchive);
  GetElement("helpButton")?.addEventListener("click", ShowHelp);
  GetElement("soundButton")?.addEventListener("click", ToggleSound);
  GetElement("clearOrdersButton")?.addEventListener("click", () => {
    if (!gameState) return;
    gameState = ClearOrders(gameState);
    SaveGame();
    RenderAll();
    RestoreFocus(`[data-formation-id="${selectedFormationId}"]`);
    ShowToast("本回合计划已清空");
  });
  GetElement("commitTurnButton")?.addEventListener("click", CommitCurrentTurn);
  GetElement("reportToggle")?.addEventListener("click", ToggleReportPanel);
  document.querySelectorAll(".mapModeButton[data-map-mode]").forEach((button) => button.addEventListener("click", () => ChangeMapMode(button.dataset.mapMode)));
  GetElement("modalBackdrop")?.addEventListener("click", (event) => {
    if (event.target === GetElement("modalBackdrop")) CloseModal();
  });
  document.addEventListener("keydown", HandleKeyboard);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && gameState) SaveGame();
  });
  window.addEventListener("beforeunload", SaveGame);
}

function HandleKeyboard(event) {
  if (event.key === "Escape") {
    CloseModal();
    return;
  }
  if (GetElement("modalBackdrop")?.hidden === false) {
    if (event.key === "Tab") {
      const panel = GetElement("modalPanel");
      const focusable = Array.from(panel?.querySelectorAll("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])") || [])
        .filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        panel?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const outsidePanel = !panel?.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || outsidePanel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || outsidePanel)) {
        event.preventDefault();
        first.focus();
      }
    }
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (!gameState) return;
  const activeElement = document.activeElement;
  const interactiveTags = new Set(["BUTTON", "SELECT", "A", "INPUT", "TEXTAREA"]);
  if (interactiveTags.has(activeElement?.tagName) || activeElement?.isContentEditable) return;
  if (event.key.toLowerCase() === "p") ShowPolicyMenu();
  if (event.key.toLowerCase() === "h") ShowHelp();
  if (event.key.toLowerCase() === "a") ShowArchive();
  if (event.key.toLowerCase() === "m") {
    const modes = Object.keys(mapModeDefinitions);
    ChangeMapMode(modes[(modes.indexOf(currentMapMode) + 1) % modes.length]);
  }
  if (event.key === "Enter" && activeElement === document.body) CommitCurrentTurn();
  const actionIndex = Number(event.key) - 1;
  const actionIds = formationDefinitions[selectedFormationId]?.missionIds || [];
  if (actionIndex >= 0 && actionIndex < actionIds.length) AddOrder(actionIds[actionIndex]);
}

function InitializeGame() {
  BindInterface();
  RenderRoutes();
  gameState = LoadSavedGame();
  if (gameState) {
    selectedRegionId = gameState.selectedRegionId || "fuping";
    RenderAll();
  }
  ShowMainMenu();
  window.addEventListener("resize", ScheduleRouteRender);
  window.beiyueGame = {
    GetPublicState: () => gameState ? {
      turnIndex: gameState.turnIndex,
      phase: gameState.phase,
      resources: { ...gameState.resources },
      regions: JSON.parse(JSON.stringify(gameState.regions)),
      formations: JSON.parse(JSON.stringify(gameState.formations)),
      forecast: GetEnemyForecast(gameState),
    } : null,
    NewCampaign,
    SelectRegion,
    SelectFormation,
    AddOrder,
    ProbeRegion: HandleProbe,
    CommitCurrentTurn,
    ShowArchive,
    RenderAll,
  };
}

InitializeGame();
