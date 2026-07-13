import {
  gameConfig,
  regionDefinitions,
  actionDefinitions,
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
  GetCampaignScore,
  SerializeGame,
  DeserializeGame,
  CheckInvariants,
} from "./Script_Rules.mjs";

const saveKey = "Beiyue1941_Save_1";
const backupKey = "Beiyue1941_Backup_1";
const backupGuardKey = "Beiyue1941_BackupGuard_1";
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

const routeDefinitions = Object.freeze([
  { from: [85, 1], to: [91, 99], kind: "rail", label: "平汉铁路走廊", labelAt: [87, 43] },
  { from: [18, 94], to: [100, 94], kind: "rail", label: "正太铁路走廊", labelAt: [73, 90] },
  { from: [17, 22], to: [40, 42], kind: "path", label: "五台—阜平山路", labelAt: [22, 31] },
  { from: [40, 42], to: [68, 46], kind: "path", label: "冀西秘密交通线", labelAt: [48, 47] },
]);

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
let currentMapMode = localStorage.getItem(mapModeKey) || "situation";
let soundEnabled = localStorage.getItem(soundKey) === "true";
let audioContext = null;
let pendingReport = null;
let modalCloseAction = null;
let sessionStartedAt = Date.now();

function GetElement(id) {
  return document.getElementById(id);
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
      <p class="titleLead">铁路、公路与据点切开山河；抗日组织仍在村庄、山路与群众掩护中延续。你要做的不是涂满地图，而是在合围中处理好四件事：<b>打、走、藏、养</b>。</p>
      <div class="titleFacts">
        <article><span>18</span><b>史实节点</b><small>1941年7月至1942年6月</small></article>
        <article><span>3</span><b>每回合命令</b><small>约70—100分钟完整战役</small></article>
        <article><span>4</span><b>核心资源</b><small>物资 · 组织 · 情报 · 信任</small></article>
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
      <div class="modalHeader"><div><p class="modalKicker">核心玩法</p><h2>一回合，三道命令</h2></div><button class="closeButton" data-close-modal aria-label="关闭玩法说明">×</button></div>
      <div class="helpColumns">
        <div>
          <ol class="flowList">
            <li><b>读敌情</b><span>地图只显示我方确实掌握的征候；情报越多，预警越具体。</span></li>
            <li><b>选地区</b><span>一个地区同回合只能承担一道命令，避免把风险全部压给同一批群众。</span></li>
            <li><b>排三令</b><span>命令先进入计划栏，提交前都可撤回；资源在结算时扣除。</span></li>
            <li><b>看战报</b><span>我方行动与敌方行动同步结算，结果会解释准备、地形、情报与风险。</span></li>
          </ol>
          <div class="ruleNote"><b>胜利不是歼敌榜</b><p>总评以群众安全、组织网络、机构存续、组织力与群众信任为准。敌后战场也不是清晰国界：城市据点被占与乡村网络存在可以同时发生。</p></div>
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
        <article><span class="abstractTag">抽象</span><h3>明确被压缩</h3><p>十二地区的边界与邻接、三道命令的时间尺度、资源数值、综合协调机构及局部结果均为游戏抽象，不是当时行政区划或精确战场复原。</p></article>
        <article><span class="contextTag">全局</span><h3>敌后不是全部</h3><p>本作聚焦中国共产党领导的晋察冀敌后根据地，同时承认国民党军正面战场、其他抗日力量与国际反法西斯战争的贡献。第二次国共合作中的协同与摩擦均不被简化成第二个敌人。</p></article>
        <article><span class="careTag">表达</span><h3>克制呈现创伤</h3><p>侵略暴力只通过疏散、救济、机构损失与群众安全后果表达；没有可操作的暴行场面、伤亡奇观、民族侮辱语或以平民代价换分的机制。</p></article>
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
  if (!layer || layer.childElementCount) return;
  for (const route of routeDefinitions) {
    const line = document.createElement("div");
    const deltaX = route.to[0] - route.from[0];
    const deltaY = route.to[1] - route.from[1];
    const distance = Math.hypot(deltaX, deltaY);
    const angle = Math.atan2(deltaY, deltaX) * 180 / Math.PI;
    line.className = `routeLine ${route.kind}`;
    line.style.left = `${route.from[0]}%`;
    line.style.top = `${route.from[1]}%`;
    line.style.width = `${distance}%`;
    line.style.transform = `rotate(${angle}deg)`;
    line.setAttribute("aria-hidden", "true");
    layer.appendChild(line);
    const label = document.createElement("span");
    label.className = `routeLabel ${route.kind}`;
    label.style.left = `${route.labelAt[0]}%`;
    label.style.top = `${route.labelAt[1]}%`;
    label.textContent = route.label;
    layer.appendChild(label);
  }
}

function RenderRegions() {
  const layer = GetElement("regionLayer");
  if (!layer || !gameState) return;
  const forecast = GetEnemyForecast(gameState) || {};
  const forecastIds = new Set(forecast.targetIds || forecast.targets?.map((target) => target.id || target.regionId) || []);
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
    button.dataset.safetyBand = GetBand(region.safety);
    button.dataset.networkBand = GetBand(region.network);
    button.dataset.enemyBand = GetBand(100 - region.enemyControl);
    button.dataset.exposureBand = GetBand(100 - region.exposure);
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
    const protection = Number(region.protection || 0);
    button.innerHTML = `
      <span class="regionName">${EscapeHtml(definition.name)}</span>
      <span class="regionTerrain">${EscapeHtml(definition.terrainName || definition.terrain || "")}</span>
      <span class="regionReadout"><b>网 ${Math.round(region.network)}</b><b>安 ${Math.round(region.safety)}</b></span>
      <span class="regionMarks">${region.enemyControl >= 55 ? '<i title="敌伪据点压力高">据</i>' : ""}${protection >= 55 ? '<i title="长期掩护能力较强">护</i>' : ""}${institutionCount ? `<i title="有${institutionCount}处机构">机${institutionCount}</i>` : ""}</span>
    `;
    button.setAttribute("aria-label", `${definition.name}，组织网络${Math.round(region.network)}，群众安全${Math.round(region.safety)}，敌情压力${Math.round(region.enemyControl)}，暴露${Math.round(region.exposure)}`);
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
  selectedRegionId = regionId;
  if (gameState) gameState.selectedRegionId = regionId;
  RenderRegions();
  RenderCommandPanel();
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
  document.querySelectorAll("[data-map-mode]").forEach((button) => {
    const active = button.dataset.mapMode === currentMapMode;
    button.setAttribute("aria-pressed", String(active));
    button.classList.toggle("active", active);
  });
  const legend = GetElement("mapLegend");
  if (legend) {
    const mode = mapModeDefinitions[currentMapMode] || mapModeDefinitions.situation;
    legend.innerHTML = `<b>${EscapeHtml(mode.name)}</b><span>${EscapeHtml(mode.help)}</span><small><i class="legendForecast"></i>斜纹与“预”字表示已侦知的敌军重点方向</small>`;
  }
}

function RenderForecast() {
  const banner = GetElement("forecastBanner");
  if (!banner || !gameState) return;
  const forecast = GetEnemyForecast(gameState) || {};
  const confidence = forecast.certainty || forecast.confidence || forecast.level || "模糊";
  const summary = forecast.summary || forecast.text || "交通线上出现调动征候，但目标尚不明确。";
  banner.innerHTML = `<span>敌情预判 · ${EscapeHtml(confidence)}</span><b>${EscapeHtml(summary)}</b>`;
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
  if (subtitle) subtitle.textContent = `${definition.terrainName || definition.terrain || "地区"} · ${definition.role || definition.note || "北岳区战略地区"}`;
  const institutions = GetInstitutionList().filter((institution) => institution.regionId === selectedRegionId && institution.active !== false);
  if (status) {
    status.innerHTML = `<span data-band="${GetBand(region.network)}">网络 ${GetBandName(region.network)}</span><span data-band="${GetBand(region.safety)}">安全 ${GetBandName(region.safety)}</span><span data-band="${GetBand(region.protection)}">掩护 ${GetBandName(region.protection)}</span>${institutions.map((institution) => `<span class="institutionChip">${EscapeHtml(institution.shortName || institution.name)}</span>`).join("")}`;
  }
  if (stats) {
    stats.innerHTML = [
      BuildStatRow("组织网络", region.network, "network", "秘密交通、村级组织与地方联络"),
      BuildStatRow("群众安全", region.safety, "safety", "转移、粮食、医疗与日常生计"),
      BuildStatRow("敌情压力", region.enemyControl, "enemy", "据点、封锁线与可出动能力"),
      BuildStatRow("暴露程度", region.exposure, "exposure", "侵略军对本地网络掌握的线索"),
      BuildStatRow("战争破坏", region.devastation, "devastation", "生产、住房和交通受损程度"),
    ].join("");
  }
  RenderActionList();
}

function GetBandName(value) {
  const band = GetBand(value);
  return { strong: "稳固", steady: "尚可", strained: "吃紧", critical: "危急" }[band];
}

function RenderActionList() {
  const list = GetElement("actionList");
  if (!list || !gameState) return;
  const existingOrder = GetOrders().find((order) => (order.regionId || order.targetId) === selectedRegionId);
  list.innerHTML = "";
  for (const [actionId, action] of Object.entries(actionDefinitions)) {
    const preview = GetActionPreview(gameState, actionId, selectedRegionId) || {};
    const allowed = preview.valid ?? preview.ok ?? preview.allowed ?? !preview.error;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "actionButton";
    button.dataset.actionId = actionId;
    button.disabled = !allowed || Boolean(existingOrder) || IsCampaignEnded();
    const costs = preview.costs || preview.cost || action.cost || {};
    const costText = Object.entries(costs).filter(([, value]) => Number(value) > 0).map(([key, value]) => `${GetResourceName(key)} ${value}`).join(" · ");
    const summary = preview.summary || preview.effect || action.description || action.desc || "";
    const reason = preview.reason || preview.error || preview.warnings?.[0] || (existingOrder ? "本地区本回合已有命令" : "");
    button.innerHTML = `<span class="actionIcon">${EscapeHtml(action.icon || "令")}</span><span class="actionCopy"><b>${EscapeHtml(action.name || actionId)}</b><small>${EscapeHtml(summary)}</small>${reason ? `<em>${EscapeHtml(reason)}</em>` : ""}</span><span class="actionCost">${EscapeHtml(costText || "不耗物资")}</span>`;
    button.addEventListener("click", () => AddOrder(actionId));
    list.appendChild(button);
  }
}

function GetResourceName(key) {
  return { supply: "物资", organization: "组织", intelligence: "情报", trust: "信任" }[key] || key;
}

function AddOrder(actionId) {
  if (!gameState) return;
  const preview = GetActionPreview(gameState, actionId, selectedRegionId);
  if (!preview?.valid) {
    ShowToast(preview?.warnings?.[0] || preview?.reason || "这道命令目前无法执行", "warn");
    return;
  }
  try {
    gameState = QueueOrder(gameState, actionId, selectedRegionId);
  } catch (error) {
    ShowToast(error?.message || "这道命令目前无法执行", "warn");
    return;
  }
  const action = GetDefinitionById(actionDefinitions, actionId);
  const region = GetDefinitionById(regionDefinitions, selectedRegionId);
  ShowToast(`已计划：${region?.name || "该地区"} · ${action?.name || actionId}`);
  SaveGame();
  RenderAll();
}

function RenderOrders() {
  const list = GetElement("orderList");
  const clearButton = GetElement("clearOrdersButton");
  const commitButton = GetElement("commitTurnButton");
  if (!list || !gameState) return;
  const orders = GetOrders();
  if (!orders.length) {
    list.innerHTML = '<li class="emptyOrder"><span>01</span><b>先从地图选择地区</b><small>每回合最多三道命令；提交前可全部撤回。</small></li>';
  } else {
    list.innerHTML = orders.map((order, index) => {
      const actionId = order.actionId || order.action;
      const regionId = order.regionId || order.targetId;
      const action = GetDefinitionById(actionDefinitions, actionId);
      const region = GetDefinitionById(regionDefinitions, regionId);
      return `<li><span>${String(index + 1).padStart(2, "0")}</span><div><b>${EscapeHtml(region?.name || regionId)} · ${EscapeHtml(action?.name || actionId)}</b><small>${EscapeHtml(action?.shortDescription || action?.description || action?.desc || "")}</small></div><button data-remove-order="${index}" aria-label="撤回第${index + 1}道命令">撤回</button></li>`;
    }).join("");
  }
  list.querySelectorAll("[data-remove-order]").forEach((button) => button.addEventListener("click", () => {
    const order = GetOrders()[Number(button.dataset.removeOrder)];
    if (!order) return;
    gameState = RemoveOrder(gameState, order.id || order.regionId);
    SaveGame();
    RenderAll();
    ShowToast("命令已撤回");
  }));
  if (clearButton) clearButton.disabled = !orders.length;
  if (commitButton) {
    commitButton.disabled = HasPendingEvent() || IsCampaignEnded();
    commitButton.innerHTML = `<span>提交本回合</span><b>${orders.length} / ${gameConfig.ordersPerTurn || 3} 道命令</b>`;
  }
}

function RenderTurnPanel() {
  if (!gameState) return;
  const turn = GetCurrentTurnDefinition();
  const title = GetElement("turnTitle");
  const context = GetElement("turnContext");
  if (title) title.textContent = turn.title || turn.name || "本回合局势";
  if (context) context.textContent = turn.shortContext || turn.context || turn.summary || "";
}

function RenderTimeline() {
  const track = GetElement("timelineTrack");
  if (!track || !gameState) return;
  const current = GetTurnIndex();
  track.innerHTML = historicalTurns.map((turn, index) => `<button type="button" data-timeline-index="${index}" data-state="${index < current ? "past" : index === current ? "current" : "future"}" aria-label="${EscapeHtml(GetTurnDisplayDate(turn))} ${EscapeHtml(turn.title || turn.name || "")}" title="${EscapeHtml(turn.title || turn.name || "")}"><i></i><span>${index + 1}</span></button>`).join("");
  track.querySelectorAll("[data-timeline-index]").forEach((button) => button.addEventListener("click", () => ShowTimelineEntry(Number(button.dataset.timelineIndex))));
}

function ShowTimelineEntry(index) {
  const turn = historicalTurns[index];
  if (!turn) return;
  OpenModal(`
    <section class="compactModal">
      <p class="modalKicker">${EscapeHtml(GetTurnDisplayDate(turn))}</p>
      <h2>${EscapeHtml(turn.title || turn.name || "史实节点")}</h2>
      <p class="modalLead">${EscapeHtml(turn.context || turn.summary || turn.description || "")}</p>
      <div class="historyBoundary"><span class="factTag">史实锚点</span><p>${EscapeHtml(GetTurnFactText(turn))}</p></div>
      <div class="historyBoundary abstract"><span class="abstractTag">${EscapeHtml(turn.abstraction?.label || "游戏抽象")}</span><p>${EscapeHtml(GetTurnAbstractionText(turn))}</p></div>
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
  }).join("") : '<li data-tone="neutral"><span></span><p>战局刚刚展开。先阅读敌情，再下达三道命令。</p></li>';
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
  const choices = turn.choices || turn.options || [];
  const choiceMarkup = choices.length ? choices.map((choice, index) => `
    <button class="eventChoice" data-event-choice="${EscapeHtml(choice.id ?? String(index))}">
      <span>${String.fromCharCode(65 + index)}</span><div><b>${EscapeHtml(choice.name || choice.title || choice.label || `方案${index + 1}`)}</b><p>${EscapeHtml(choice.description || choice.text || "")}</p><small>${EscapeHtml(choice.preview || choice.effectText || "")}</small></div>
    </button>
  `).join("") : '<button class="eventChoice fixed" data-event-choice="continue"><span>记</span><div><b>谨记史实，继续部署</b><p>这一节点不提供改写真实人物命运的选项。</p></div></button>';
  OpenModal(`
    <section class="eventModal">
      <div class="eventDate"><span>${EscapeHtml(GetTurnDisplayDate(turn))}</span><small>${isFirst ? "战役开端" : `第 ${GetTurnIndex() + 1} 回合`}</small></div>
      <p class="modalKicker">${EscapeHtml(turn.chapter || "北岳区战局")}</p>
      <h2>${EscapeHtml(turn.title || turn.name || "史实节点")}</h2>
      <p class="eventContext">${EscapeHtml(turn.context || turn.summary || turn.description || "")}</p>
      <div class="historyBoundary"><span class="factTag">史实</span><p>${EscapeHtml(GetTurnFactText(turn))}</p></div>
      <div class="historyBoundary abstract"><span class="abstractTag">${EscapeHtml(turn.abstraction?.label || "游戏抽象")}</span><p>${EscapeHtml(GetTurnAbstractionText(turn))}</p></div>
      <div class="historyBoundary duty"><span class="contextTag">你的职责</span><p>${EscapeHtml(GetTurnPromptText(turn))}</p></div>
      <div class="eventChoices">${choiceMarkup}</div>
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
  ShowToast("方略已记录", "confirm");
}

function CommitCurrentTurn() {
  if (!gameState || IsCampaignEnded()) return;
  const orders = GetOrders();
  if (HasPendingEvent()) {
    ShowTurnEvent();
    return;
  }
  if (orders.length < (gameConfig.ordersPerTurn || 3)) {
    const orderDescription = orders.length ? `只提交 ${orders.length} 道命令` : "本回合不下达地区命令";
    OpenModal(`
      <section class="compactModal">
        <p class="modalKicker">仍有空余指令</p>
        <h2>${orderDescription}？</h2>
        <p>困难时期也可以主动保留组织力，但本回合未用的指令不会累积。</p>
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
  const enemyMarkup = enemyResults.length ? enemyResults.map((result) => `<li><b>${EscapeHtml(result.title || result.name || "敌军行动")}</b><p>${EscapeHtml(result.text || result.summary || "敌军沿交通线调整部署。")}</p></li>`).join("") : `<li><b>${EscapeHtml(report.enemyTitle || "敌方回应")}</b><p>${EscapeHtml(report.enemySummary || "敌军沿既有据点与交通线继续施压。")}</p></li>`;
  const deltaMarkup = ["supply", "organization", "intelligence", "trust"].map((key) => `<span data-delta="${Number(resourceDelta[key] || 0) < 0 ? "down" : "up"}"><small>${GetResourceName(key)}</small><b>${FormatSigned(resourceDelta[key])}</b></span>`).join("");
  OpenModal(`
    <section class="reportModal">
      <div class="modalHeader"><div><p class="modalKicker">回合战报 · ${EscapeHtml(GetTurnDisplayDate(turn))}</p><h2>${EscapeHtml(report.title || turn.title || turn.name || "局势结算")}</h2></div></div>
      <div class="reportSummary">${EscapeHtml(report.summary || "每一道命令都改变了下一回合的风险与恢复能力。")}</div>
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
  const title = score.label || score.title || score.endingTitle || (total >= 75 ? "保存元气，接续烽火" : total >= 55 ? "在困境中坚持下来" : "网络受创，火种未灭");
  const dimensions = score.components || score.dimensions || score.breakdown || {};
  function ReadDimension(key) {
    return Number(dimensions[key]?.value ?? dimensions[key] ?? score[key] ?? 0);
  }
  const dimensionCards = [
    ["群众安全", ReadDimension("safety"), 40],
    ["组织网络", ReadDimension("network"), 25],
    ["机构存续", ReadDimension("institutions"), 20],
    ["战场牵制", ReadDimension("resistance"), 10],
    ["群众信任", ReadDimension("trust"), 5],
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
    ShowToast("本回合计划已清空");
  });
  GetElement("commitTurnButton")?.addEventListener("click", CommitCurrentTurn);
  GetElement("reportToggle")?.addEventListener("click", ToggleReportPanel);
  document.querySelectorAll("[data-map-mode]").forEach((button) => button.addEventListener("click", () => ChangeMapMode(button.dataset.mapMode)));
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
  if (!gameState) return;
  if (event.key.toLowerCase() === "p") ShowPolicyMenu();
  if (event.key.toLowerCase() === "h") ShowHelp();
  if (event.key.toLowerCase() === "a") ShowArchive();
  if (event.key.toLowerCase() === "m") {
    const modes = Object.keys(mapModeDefinitions);
    ChangeMapMode(modes[(modes.indexOf(currentMapMode) + 1) % modes.length]);
  }
  if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && document.activeElement?.tagName !== "BUTTON") CommitCurrentTurn();
  const actionIndex = Number(event.key) - 1;
  const actionIds = Object.keys(actionDefinitions);
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
  window.beiyueGame = {
    GetState: () => gameState,
    NewCampaign,
    SelectRegion,
    AddOrder,
    CommitCurrentTurn,
    ShowArchive,
    RenderAll,
  };
}

InitializeGame();
