import {
  config, campaignDates, regionTemplates, advisorTemplates, traits, actions, policies, turnEvents,
  CreateGame, GetRegion, GetAdvisor, GetAction, GetPolicy, GetEvent, ConnectedRegions,
  TrustLabel, RegionLevelLabel, CanPlanOrder, PlanOrder, CancelOrder, ChangePolicy,
  ChooseEvent, ResolveTurn, GetEnding, InvariantChecks, SerializeGame, DeserializeGame,
} from "./Rules.mjs";

const saveKey = "BorderRealm_Save_V1";
const settingsKey = "BorderRealm_Settings_V1";
const tutorialKey = "BorderRealm_TutorialSeen_V1";

const Element = id => document.getElementById(id);
const startScreen = Element("startScreen");
const gameScreen = Element("gameScreen");
const newGameButton = Element("newGameButton");
const continueButton = Element("continueButton");
const dateLabel = Element("dateLabel");
const turnLabel = Element("turnLabel");
const campaignProgress = Element("campaignProgress");
const resourceBar = Element("resourceBar");
const advisorList = Element("advisorList");
const councilMood = Element("councilMood");
const situationTitle = Element("situationTitle");
const regionNodes = Element("regionNodes");
const mapRoutes = Element("mapRoutes");
const threatBrief = Element("threatBrief");
const regionInspector = Element("regionInspector");
const actionList = Element("actionList");
const orderHint = Element("orderHint");
const orderCountBadge = Element("orderCountBadge");
const orderQueue = Element("orderQueue");
const endTurnButton = Element("endTurnButton");
const policyName = Element("policyName");
const policyDescription = Element("policyDescription");
const saveStatus = Element("saveStatus");
const modalWrap = Element("modalWrap");
const modal = Element("modal");
const toast = Element("toast");
const soundButton = Element("soundButton");

let state = null;
let selectedRegionId = "Qinghe";
let soundOn = true;
let audioContext = null;
let toastTimer = null;
let modalCloseCallback = null;
let modalReturnFocus = null;
let routeResizeFrame = null;

function EscapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function EnsureAudio() {
  if (!soundOn) return null;
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

function PlayTone(frequency = 320, duration = .055, volume = .025, type = "triangle") {
  const context = EnsureAudio();
  if (!context) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
}

function ShowToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2300);
}

function SaveGame() {
  if (!state) return;
  try {
    localStorage.setItem(saveKey, SerializeGame(state));
    continueButton.hidden = false;
    saveStatus.textContent = "刚刚自动存档";
    setTimeout(() => { if (saveStatus.textContent === "刚刚自动存档") saveStatus.textContent = "本地自动存档"; }, 1600);
  } catch {
    saveStatus.textContent = "当前浏览器无法保存";
  }
}

function LoadGame() {
  try { return DeserializeGame(localStorage.getItem(saveKey)); }
  catch { return null; }
}

function LoadSettings() {
  try {
    const settings = JSON.parse(localStorage.getItem(settingsKey) || "{}");
    soundOn = settings.sound !== false;
    document.body.classList.toggle("large-text", !!settings.largeText);
    document.body.classList.toggle("high-contrast", !!settings.highContrast);
    document.body.classList.toggle("reduced-motion", !!settings.reducedMotion);
  } catch { soundOn = true; }
  soundButton.setAttribute("aria-pressed", String(soundOn));
  soundButton.textContent = soundOn ? "声" : "静";
}

function CurrentSettings() {
  return {
    sound: soundOn,
    largeText: document.body.classList.contains("large-text"),
    highContrast: document.body.classList.contains("high-contrast"),
    reducedMotion: document.body.classList.contains("reduced-motion"),
  };
}

function SaveSettings() {
  try { localStorage.setItem(settingsKey, JSON.stringify(CurrentSettings())); }
  catch { /* Local settings are optional. */ }
}

function OpenModal(content, options = {}) {
  modalCloseCallback = options.onClose || null;
  modalReturnFocus = document.activeElement instanceof HTMLElement && !modalWrap.contains(document.activeElement) ? document.activeElement : null;
  modal.className = `modal${options.wide ? " wide" : ""}${options.narrow ? " narrow" : ""}`;
  modal.dataset.locked = options.locked ? "true" : "false";
  modal.innerHTML = content;
  startScreen.inert = true;
  gameScreen.inert = true;
  modalWrap.hidden = false;
  modal.querySelectorAll("[data-close-modal]").forEach(button => button.addEventListener("click", CloseModal));
  requestAnimationFrame(() => (modal.querySelector("button:not([disabled]), a") || modal).focus?.());
}

function CloseModal() {
  if (modal.dataset.locked === "true") return;
  const closeCallback = modalCloseCallback;
  const returnFocus = modalReturnFocus;
  modalCloseCallback = null;
  modalReturnFocus = null;
  modalWrap.hidden = true;
  modal.innerHTML = "";
  startScreen.inert = false;
  gameScreen.inert = false;
  if (closeCallback) closeCallback();
  else if (returnFocus?.isConnected) returnFocus.focus();
}

function ModalHeader(kicker, title, subtitle = "", closable = true) {
  return `<header class="modal-header"><div><span class="panel-kicker">${EscapeHtml(kicker)}</span><h2 id="modalTitle">${EscapeHtml(title)}</h2>${subtitle ? `<p>${EscapeHtml(subtitle)}</p>` : ""}</div>${closable ? '<button class="modal-close" data-close-modal aria-label="关闭">×</button>' : ""}</header>`;
}

function ResourceDefinition(key) {
  return {
    support: { name: "民心", max: 100, note: "公信与群众支持", color: "#8ca27b" },
    grain: { name: "粮秣", max: 16, note: "口粮、救济与转移", color: "#bd934f" },
    organization: { name: "组织力", max: 14, note: "干部、通讯与行政", color: "#708b77" },
    intelligence: { name: "情报", max: 8, note: "预警与秘密交通", color: "#718f91" },
    exposure: { name: "暴露", max: 10, note: "越低越安全", color: "#bd5d4d" },
  }[key];
}

function RenderResources() {
  const keys = ["support", "grain", "organization", "intelligence", "exposure"];
  resourceBar.innerHTML = keys.map(key => {
    const definition = ResourceDefinition(key);
    const value = state.resources[key];
    const percent = `${Math.round(value / definition.max * 100)}%`;
    return `<div class="resource-chip" style="--meter:${percent};--chip-color:${definition.color}" title="${EscapeHtml(definition.note)}"><span><em>${definition.name}</em><small>${EscapeHtml(definition.note)}</small></span><strong>${value}<small> / ${definition.max}</small></strong></div>`;
  }).join("");
}

function RenderHeader() {
  dateLabel.textContent = campaignDates[state.turn];
  turnLabel.textContent = `第 ${state.turn + 1} / ${config.totalTurns} 回合`;
  campaignProgress.style.width = `${(state.turn + (state.over ? 1 : 0)) / config.totalTurns * 100}%`;
  const titles = ["交通破袭前夜", "铁路线守备加紧", "封锁网正在推进", "合围与机关精简", "最艰苦的坚持"];
  situationTitle.textContent = titles[Math.min(4, Math.floor(state.turn / 4))];
  RenderResources();
}

function TrustColor(trust) {
  if (trust >= 65) return "#829b76";
  if (trust >= 48) return "#b28a4f";
  return "#b75548";
}

function RenderAdvisors() {
  const assigned = new Set(state.orders.map(order => order.advisorId));
  advisorList.innerHTML = state.advisors.map(advisor => {
    const fatigue = Array.from({ length: 3 }, (_, index) => `<i class="${index < advisor.fatigue ? "on" : ""}"></i>`).join("");
    const classNames = ["advisor-card"];
    if (assigned.has(advisor.id)) classNames.push("assigned");
    if (advisor.fatigue >= config.fatigueMax) classNames.push("unavailable");
    return `<button class="${classNames.join(" ")}" data-advisor="${advisor.id}" title="查看${EscapeHtml(advisor.name)}的特质与能力"><span class="advisor-avatar">${advisor.glyph}</span><strong>${EscapeHtml(advisor.name)}</strong><span class="advisor-role">${EscapeHtml(advisor.role)}</span><span class="trust-line">${TrustLabel(advisor.trust)}<i style="--trust:${advisor.trust}%;--trust-color:${TrustColor(advisor.trust)}"><b></b></i>${advisor.trust}</span><span class="fatigue-pips" title="疲劳 ${advisor.fatigue}/3">${fatigue}</span></button>`;
  }).join("");
  advisorList.querySelectorAll("[data-advisor]").forEach(button => button.addEventListener("click", () => ShowAdvisor(button.dataset.advisor)));

  const averageTrust = Math.round(state.advisors.reduce((sum, advisor) => sum + advisor.trust, 0) / state.advisors.length);
  const tired = state.advisors.filter(advisor => advisor.fatigue >= 2).length;
  councilMood.innerHTML = `<b>议事氛围：</b>${averageTrust >= 65 ? "多数成员愿意坦率争论，并共同执行决定。" : averageTrust >= 48 ? "合作仍在，但不同立场需要被认真回应。" : "失信正在妨碍命令执行。"}${tired ? ` <span>${tired}人疲劳较重。</span>` : ""}`;
}

function RenderRoutes() {
  const map = Element("strategicMap").getBoundingClientRect();
  const mapWidth = Math.max(1, map.width);
  const mapHeight = Math.max(1, map.height);
  const aspect = mapHeight / mapWidth;
  const seen = new Set();
  const routes = [];
  for (const region of state.regions) {
    for (const targetId of region.connections) {
      const key = [region.id, targetId].sort().join("_");
      if (seen.has(key)) continue;
      seen.add(key);
      const target = GetRegion(state, targetId);
      const dx = target.x - region.x;
      const dy = target.y - region.y;
      const length = Math.sqrt(dx * dx + (dy * aspect) ** 2);
      const angle = Math.atan2(dy * mapHeight, dx * mapWidth) * 180 / Math.PI;
      const broken = region.network === 0 || target.network === 0;
      routes.push(`<i class="map-route${broken ? " broken" : ""}" style="left:${region.x}%;top:${region.y}%;width:${length}%;transform:rotate(${angle}deg)"></i>`);
    }
  }
  mapRoutes.innerHTML = routes.join("");
}

function RenderRegions() {
  RenderRoutes();
  regionNodes.innerHTML = state.regions.map(region => {
    const classes = ["region-node"];
    if (region.id === selectedRegionId) classes.push("selected");
    if (state.activeThreat?.target === region.id || region.danger >= 3) classes.push("threatened");
    if (region.network === 0) classes.push("isolated");
    return `<button class="${classes.join(" ")}" data-region="${region.id}" style="left:${region.x}%;top:${region.y}%" aria-label="${EscapeHtml(region.name)}，民心${region.support}，联系${RegionLevelLabel(region.network, "network")}，敌情压力${RegionLevelLabel(region.danger, "danger")}"><span class="region-symbol">${region.symbol}</span><span class="region-title"><strong>${EscapeHtml(region.short)}</strong><small>${region.network ? "相联" : "失联"}</small></span><small>${EscapeHtml(region.type)}</small><span class="region-bars"><span title="当地民心 ${region.support}"><i style="--value:${region.support}%"></i></span><span title="敌情压力 ${region.danger}/3"><i style="--value:${region.danger / 3 * 100}%"></i></span></span></button>`;
  }).join("");
  regionNodes.querySelectorAll("[data-region]").forEach(button => button.addEventListener("click", () => {
    selectedRegionId = button.dataset.region;
    PlayTone(270);
    RenderRegions();
    RenderOrderPanel();
  }));
}

function RenderThreatBrief() {
  if (state.activeThreat) {
    const target = GetRegion(state, state.activeThreat.target);
    threatBrief.innerHTML = `<b>已知敌情：</b>${EscapeHtml(state.activeThreat.name)}可能指向${EscapeHtml(target?.name || "外围节点")}，压力 ${state.activeThreat.strength}。用情报、转移或民兵联防提高准备。`;
  } else if (state.resources.exposure >= 7) {
    threatBrief.innerHTML = `<b>暴露过高：</b>敌军更容易根据活动痕迹实施定点清查。当前没有明确目标。`;
  } else {
    threatBrief.innerHTML = `<b>控制并非整片：</b>日军依靠城市、铁路、公路与据点维持骨架；乡村、山区和夜间活动仍在反复争夺。`;
  }
}

function ResourceCostText(action) {
  const names = { grain: "粮", organization: "组织", intelligence: "情报" };
  return Object.entries(action.cost || {}).map(([key, value]) => `${names[key]}-${value}`).join(" · ") || "无直接消耗";
}

function RenderOrderPanel() {
  const region = GetRegion(state, selectedRegionId);
  const regionAssigned = !!region && state.orders.some(order => order.regionId === region.id);
  if (!region) {
    regionInspector.className = "region-inspector empty";
    regionInspector.innerHTML = "选择地图上的一个节点，查看当地状态。";
  } else {
    regionInspector.className = "region-inspector";
    regionInspector.innerHTML = `<h3>${EscapeHtml(region.name)}</h3><p>${EscapeHtml(region.description)}</p><div class="region-stat-row"><span>民生<b>${RegionLevelLabel(region.livelihood, "livelihood")}</b></span><span>联系<b>${RegionLevelLabel(region.network, "network")}</b></span><span>压力 / 准备<b>${RegionLevelLabel(region.danger, "danger")} · ${region.prepared}</b></span></div>`;
  }
  orderCountBadge.textContent = `${state.orders.length} / ${config.ordersPerTurn}`;
  orderHint.textContent = state.pendingEventId ? "先处理本回合事件，才能下达命令。" : regionAssigned ? `${region.short}本回合已有命令，请选择另一个节点。` : region ? `选择行动，再任命一位牵头人前往${region.short}。` : "先在地图上选择一个地区。";
  actionList.innerHTML = Object.values(actions).map(action => {
    const disabled = !region || regionAssigned || state.pendingEventId || state.orders.length >= config.ordersPerTurn;
    return `<button class="action-card" data-action="${action.id}" ${disabled ? "disabled" : ""}><span class="action-kind">${EscapeHtml(action.kind)}</span><strong>${EscapeHtml(action.name)}</strong><small>${EscapeHtml(action.description)}</small><span class="action-cost">${EscapeHtml(ResourceCostText(action))}</span></button>`;
  }).join("");
  actionList.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", () => ShowAdvisorPicker(selectedRegionId, button.dataset.action)));
}

function RenderPolicy() {
  const policy = GetPolicy(state.policy);
  policyName.textContent = policy.name;
  policyDescription.textContent = policy.description;
}

function RenderOrderQueue() {
  const slots = [];
  for (let index = 0; index < config.ordersPerTurn; index++) {
    const order = state.orders[index];
    if (!order) {
      slots.push(`<div class="empty-order">第 ${index + 1} 道命令尚未拟定</div>`);
      continue;
    }
    const action = GetAction(order.actionId);
    const region = GetRegion(state, order.regionId);
    const advisor = GetAdvisor(state, order.advisorId);
    slots.push(`<div class="queued-order"><strong>${EscapeHtml(action.name)} · ${EscapeHtml(region.short)}</strong><span>牵头人：${EscapeHtml(advisor.name)} / ${EscapeHtml(advisor.role)}</span><small>${EscapeHtml(action.preview)}</small><button data-cancel-order="${EscapeHtml(order.id)}" aria-label="撤回${EscapeHtml(action.name)}">×</button></div>`);
  }
  orderQueue.innerHTML = slots.join("");
  orderQueue.querySelectorAll("[data-cancel-order]").forEach(button => button.addEventListener("click", () => {
    const result = CancelOrder(state, button.dataset.cancelOrder);
    if (result.ok) {
      PlayTone(210);
      SaveGame();
      RenderAll();
      ShowToast("命令已撤回，可以重新安排。 ");
    }
  }));
  const remaining = config.ordersPerTurn - state.orders.length;
  endTurnButton.disabled = remaining > 0 || !!state.pendingEventId || state.over;
  endTurnButton.textContent = state.over ? "战役已结束" : remaining > 0 ? `还需 ${remaining} 道命令` : `结算 ${campaignDates[state.turn]}`;
}

function RenderAll() {
  if (!state) return;
  RenderHeader();
  RenderAdvisors();
  RenderRegions();
  RenderThreatBrief();
  RenderOrderPanel();
  RenderPolicy();
  RenderOrderQueue();
}

function SkillLabel(skill) { return { governance: "治理", network: "联络", martial: "军事" }[skill]; }

function ReliabilityLabel(advisor, action) {
  const value = advisor.stats[action.skill] * 7 + advisor.trust * .24 - advisor.fatigue * 8;
  if (value >= action.difficulty + 15) return "把握较高";
  if (value >= action.difficulty - 5) return "结果可期";
  return "存在风险";
}

function ShowAdvisorPicker(regionId, actionId) {
  const region = GetRegion(state, regionId);
  const action = GetAction(actionId);
  if (!region || !action) return;
  const cards = state.advisors.map(advisor => {
    const check = CanPlanOrder(state, regionId, actionId, advisor.id);
    const traitNames = advisor.traits.map(id => traits[id].name).join(" · ");
    return `<button class="picker-card" data-pick-advisor="${advisor.id}" ${check.ok ? "" : "disabled"}><strong>${EscapeHtml(advisor.name)} · ${SkillLabel(action.skill)} ${advisor.stats[action.skill]}</strong><span>${TrustLabel(advisor.trust)} ${advisor.trust} · 疲劳 ${advisor.fatigue}/3</span><small>${check.ok ? `${ReliabilityLabel(advisor, action)}｜${traitNames}` : check.reason}</small></button>`;
  }).join("");
  OpenModal(`${ModalHeader("任命牵头人", `${action.name} · ${region.short}`, `${action.description} 预期：${action.preview}`)}<div class="modal-body"><p class="boundary-note">能力、信任、疲劳、敌情压力和情报共同决定结果。人物代表协调专业人员，并非亲自包办整项工作；同一人每回合只能领一道命令。</p><div class="advisor-picker">${cards}</div></div>`, { wide: true });
  modal.querySelectorAll("[data-pick-advisor]").forEach(button => button.addEventListener("click", () => {
    const result = PlanOrder(state, regionId, actionId, button.dataset.pickAdvisor);
    if (!result.ok) { ShowToast(result.reason); return; }
    const advisor = GetAdvisor(state, button.dataset.pickAdvisor);
    PlayTone(420, .07);
    modal.dataset.locked = "false";
    CloseModal();
    SaveGame();
    RenderAll();
    ShowToast(`${advisor.name}已领命：${action.name} · ${region.short}`);
  }));
}

function ShowAdvisor(advisorId) {
  const advisor = GetAdvisor(state, advisorId);
  if (!advisor) return;
  const traitMarkup = advisor.traits.map(id => `<div class="guide-card"><b>${EscapeHtml(traits[id].name)}</b><p>${EscapeHtml(traits[id].description)}</p></div>`).join("");
  const concern = advisor.revealed ? EscapeHtml(advisor.concern) : `信任达到“信赖”后才会坦言顾虑。当前信任 ${advisor.trust}。`;
  OpenModal(`${ModalHeader("人物档案", `${advisor.name} · ${advisor.role}`, `${TrustLabel(advisor.trust)} ${advisor.trust} / 疲劳 ${advisor.fatigue} / 3`)}<div class="modal-body"><div class="guide-grid">${traitMarkup}</div><h3>能力</h3><p>治理 ${advisor.stats.governance}　联络 ${advisor.stats.network}　军事 ${advisor.stats.martial}</p><h3>未说出口的顾虑</h3><p class="boundary-note">${concern}</p><p>这些人物均为虚构复合角色，职责参考敌后基层政权、群众团体、医疗、交通与地方社会中的真实岗位；本作不把虚构言行安在真实历史人物身上。</p></div>`, { narrow: true });
}

function ShowRelations() {
  const cards = state.advisors.map(advisor => {
    const traitTags = advisor.traits.map(id => `<i>${EscapeHtml(traits[id].name)}</i>`).join("");
    return `<div class="relation-card"><strong>${EscapeHtml(advisor.name)} · ${TrustLabel(advisor.trust)}</strong><span>${EscapeHtml(advisor.role)}｜信任 ${advisor.trust}｜疲劳 ${advisor.fatigue}</span><div class="trait-tags">${traitTags}</div></div>`;
  }).join("");
  OpenModal(`${ModalHeader("关系简图", "联席议事处", "保留《十字军之王3》的特质、信任、任命与事件分歧，省略王朝、领地与复杂家族系统。")}<div class="modal-body"><p class="boundary-note">人物不是数值加成器。信任低会削弱执行，连续出勤会积累疲劳；事件选择会让不同立场的人产生长期记忆。</p><div class="relation-table">${cards}</div></div>`, { wide: true });
}

function ShowPolicy() {
  const cards = Object.values(policies).map(policy => `<button class="policy-card${state.policy === policy.id ? " active" : ""}" data-policy="${policy.id}"><b>${EscapeHtml(policy.name)}</b><p>${EscapeHtml(policy.description)}</p><small>${EscapeHtml(policy.detail)}${state.policy === policy.id ? "｜当前执行" : `｜支持者：${EscapeHtml(GetAdvisor(state, policy.advocate).name)}`}</small></button>`).join("");
  const cannotChange = state.pendingEventId ? "先处理本回合事件。" : state.orders.length ? "已有命令后不能改方略。" : state.policyChangedTurn === state.turn ? "本回合已经改过一次。" : "每回合至多调整一次；支持该方略的人会更信任你。";
  OpenModal(`${ModalHeader("阶段方略", "这一回合怎样使用有限力量", cannotChange)}<div class="modal-body"><div class="policy-grid">${cards}</div></div>`);
  modal.querySelectorAll("[data-policy]").forEach(button => button.addEventListener("click", () => {
    const result = ChangePolicy(state, button.dataset.policy);
    if (!result.ok) { ShowToast(result.reason); return; }
    PlayTone(370, .07);
    modal.dataset.locked = "false";
    CloseModal();
    SaveGame();
    RenderAll();
    ShowToast(`方略调整为“${result.policy.name}”。`);
  }));
}

function ShowEvent() {
  const event = GetEvent(state);
  if (!event) return;
  const choices = event.choices.map(choice => `<button class="event-choice" data-event-choice="${choice.id}"><strong>${EscapeHtml(choice.title)}</strong><span>${EscapeHtml(choice.description)}</span><small>${EscapeHtml(choice.outcome)}</small></button>`).join("");
  OpenModal(`${ModalHeader(event.type === "historical" ? "历史节点" : "地方议事", event.title, `${campaignDates[state.turn]} · 先议后行`, false)}<div class="modal-body"><div class="event-labels"><span class="${event.type === "historical" ? "historical" : ""}">${event.type === "historical" ? "宏观史实固定" : "地方人物虚构"}</span><span>${EscapeHtml(event.subtitle)}</span></div><p class="event-story">${EscapeHtml(event.story)}</p><div class="event-choices">${choices}</div></div>`, { locked: true });
  modal.querySelectorAll("[data-event-choice]").forEach(button => button.addEventListener("click", () => {
    const result = ChooseEvent(state, button.dataset.eventChoice);
    if (!result.ok) { ShowToast(result.reason); return; }
    PlayTone(470, .09, .03);
    SaveGame();
    RenderAll();
    ShowEventOutcome(result.event, result.choice);
  }));
}

function ShowEventOutcome(event, choice) {
  modal.dataset.locked = "true";
  modal.innerHTML = `${ModalHeader("议事结果", choice.title, `${campaignDates[state.turn]} · 决定已经记入抗战纪事`, false)}<div class="modal-body"><div class="event-labels"><span class="${event.type === "historical" ? "historical" : ""}">${event.type === "historical" ? "宏观史实未被改写" : "地方结果已生效"}</span></div><p class="event-story">${EscapeHtml(choice.outcome)}</p><p>${EscapeHtml(choice.effects.chronicle || "联席议事处已经执行这一决定。")}</p><button id="returnToMapButton" class="continue-turn-button">回到态势图</button></div>`;
  Element("returnToMapButton").addEventListener("click", () => {
    modal.dataset.locked = "false";
    CloseModal();
  });
  requestAnimationFrame(() => Element("returnToMapButton")?.focus());
}

function ShowReport(result) {
  const rows = result.report.map(item => `<div class="report-row ${item.tone || ""}"><strong>${EscapeHtml(item.title)}</strong><span>${EscapeHtml(item.text)}</span><small>${EscapeHtml(item.delta || "")}</small></div>`).join("");
  const nextText = result.over ? "查看本局结局" : `进入 ${campaignDates[state.turn]}`;
  OpenModal(`${ModalHeader("回合结算", result.resolvedDate, "两道命令、敌军行动与民生维持已一并结算。", false)}<div class="modal-body"><div class="report-list">${rows}</div><div class="report-summary">现有 ${ConnectedRegions(state).length} / 7 个节点保持联系；民心 ${state.resources.support}，组织力 ${state.resources.organization}，暴露 ${state.resources.exposure}。</div><button id="continueAfterReport" class="continue-turn-button">${nextText}</button></div>`, { locked: true, wide: true });
  Element("continueAfterReport").addEventListener("click", () => {
    state.reportPending = false;
    SaveGame();
    modal.dataset.locked = "false";
    CloseModal();
    if (state.over) ShowEnding();
    else if (state.pendingEventId) ShowEvent();
  });
}

function ShowEnding() {
  const ending = GetEnding(state);
  const criteria = ending.criteria || {};
  const cards = [
    ["人在根在", criteria.peopleRooted, "多数节点民生维持"],
    ["组织未断", criteria.networkIntact, "七处全部保持联系"],
    ["同舟共济", criteria.sharedPurpose, "至少五人达到信赖"],
    ["山河有信", criteria.mountainKeepsFaith, "保护人员并保存纪事"],
  ].map(([name, achieved, note]) => `<div><b>${achieved ? "✓ " : "○ "}${name}</b><span>${note}</span></div>`).join("");
  const typeText = ending.type === "collapse" ? "地方网络瓦解，但全国抗战并未因此结束。" : ending.type === "fragile" ? "地方网络尚存，但至少一项生存底线未能守住。" : "你让一县的基层火种穿过了最艰苦的阶段。";
  OpenModal(`${ModalHeader("战役结局", ending.title, `${campaignDates[Math.min(state.turn, config.totalTurns - 1)]} · 岳北县`, false)}<div class="modal-body"><p class="ending-quote">${EscapeHtml(ending.reason)}</p><p>${EscapeHtml(typeText)} 本作不按歼敌数给战争评级，也不把地方坚持写成你“提前赢得”了整场战争。</p><div class="ending-score">${cards}</div><p>本局保护行动累计人次（游戏估算，非史实统计）：${state.stats.peopleProtected}；保持联系节点：${ConnectedRegions(state).length} / 7；保存纪事：${state.stats.recordsPreserved ? "是" : "否"}；主要行动：${state.stats.orders} 道。</p><div class="ending-actions"><button data-ending-history>查看史实档案</button><button data-ending-chronicle>回看抗战纪事</button><button class="primary" data-restart>重新开局</button></div></div>`, { locked: true, wide: true });
  modal.querySelector("[data-ending-history]").addEventListener("click", () => ShowHistory(true));
  modal.querySelector("[data-ending-chronicle]").addEventListener("click", () => ShowChronicle(true));
  modal.querySelector("[data-restart]").addEventListener("click", () => {
    modal.dataset.locked = "false";
    CloseModal();
    BeginNewGame(true);
  });
}

function ShowHistory(returnToEnding = false) {
  OpenModal(`${ModalHeader("史实档案", "史实与创作边界", "所有外链均指向公开档案、学术研究或权威机构。")}
    <div class="modal-body">
      <p class="boundary-note"><b>真实不变：</b>侵华战争性质，晋察冀的组织形态，百团大战交通破袭，日军“治安强化”、封锁与“扫荡”，减租减息、三三制、精兵简政等宏观进程。<br><b>本局可变：</b>虚构岳北县的七个节点、八名复合角色及其关系和地方命运。插画式界面不冒充历史照片。<br><b>玩法合成：</b>“联席议事处”与跨职责任命不对应某一真实机构隶属关系；人物是行动牵头人，不是亲自执行所有专业工作。</p>
      <h3>为何地图不是红蓝领地</h3>
      <p>晋察冀处于城市和铁路公路据点、山区根据地、平原游击区及伪政权基层组织交错的状态。日军较强地控制城市、交通干线与据点，乡村和夜间活动则反复争夺。因此本作记录“民生、联系、敌情压力”，不把县域均匀染色。</p>
      <h3>本战役的四个历史锚点</h3>
      <ol>
        <li><b>1940年：</b>3月提出“三三制”人员构成原则；晋察冀7月至10月开展大规模民主选举。8月20日起百团大战展开，并延续至12月。</li>
        <li><b>1941—1942年：</b>日军及其扶植政权推进“治安强化”，通过碉堡、公路、封锁沟、市场封锁、搜捕与强制迁移切断基层联系。</li>
        <li><b>1942年初：</b>晋察冀开始落实精兵简政，在减轻群众负担的同时让机关更适合敌后生存。</li>
        <li><b>1942年：</b>冀中“五一大扫荡”、战争破坏、封锁与旱灾叠加，地方组织与群众生存遭遇严重危机。</li>
      </ol>
      <h3>政策边界</h3>
      <p>抗战期土地政策不是全面土地革命。本作的租佃事件坚持“减租交租、减息交息”，并保留调解与申诉。伤亡数字在不同史料中差异很大，所以不以单一歼敌数字计分。侵略军对平民实施暴行的责任属于侵略者，不会因玩家选择抵抗行动而被模糊。</p>
      <h3>资料来源</h3>
      <div class="source-list">
        <a href="https://www.mofa.go.jp/mofaj/files/100512970.pdf" target="_blank" rel="noopener">日本外务省：《日中共同历史研究报告》——华北“治安战”、封锁、强制迁移与战争暴行</a>
        <a href="https://www.law.osaka-u.ac.jp/c-forum/box2/dp2015-3tanaka.pdf" target="_blank" rel="noopener">大阪大学：中国共产党晋察冀抗日根据地的创建与地方社会——地理、档案与1940年选举</a>
        <a href="https://www.saac.gov.cn/zt/2014-09/05/content_65645.htm" target="_blank" rel="noopener">中央档案馆：晋察冀抗日根据地粉碎日军1938年秋季围攻</a>
        <a href="https://shzl.bnu.edu.cn/docs/2021-12/20211230184851107935.pdf" target="_blank" rel="noopener">北京师范大学：抗日根据地社会治理——三三制、减租减息、生产与精兵简政</a>
        <a href="https://www.neac.gov.cn/seac/ztzl/huiz/lsyg.shtml" target="_blank" rel="noopener">国家民委：回族抗战史料——冀中回民支队与回汉联合抗战</a>
        <a href="https://www.bjdsdfz.cn/xswz/104021_6.jhtml" target="_blank" rel="noopener">北京党史地方志：敌后秘密交通工作——联络、护送、住宿与物资转运</a>
        <a href="https://www.bjrd.gov.cn/rdzl/rdzc/rdzd/202409/t20240909_3798376.html" target="_blank" rel="noopener">北京市人大：抗日民主政权“三三制”的人员构成原则</a>
        <a href="https://www.81.cn/js_208592/10154869.html" target="_blank" rel="noopener">中国军网：晋察冀精兵简政的部署与实施</a>
        <a href="https://dangshi.people.com.cn/BIG5/n1/2020/0106/c85037-31535479.html" target="_blank" rel="noopener">人民网党史：1942年春荒中把村边树叶留给群众的训令</a>
      </div>
    </div>`, { wide: true, onClose: returnToEnding ? ShowEnding : null });
}

function ShowGuide() {
  OpenModal(`${ModalHeader("玩法说明", "两道命令，十八个双月回合", "建议单局75—105分钟；熟悉后可更快完成。")}
    <div class="modal-body">
      <div class="guide-grid">
        <div class="guide-card"><b>1 · 先议</b><p>每回合先处理一张历史或地方事件。宏观历史固定，选择只改变岳北县的地方应对。</p></div>
        <div class="guide-card"><b>2 · 选节点</b><p>地图不是领地涂色。选择一个地区，关注民生、联系、敌情压力与已做准备。</p></div>
        <div class="guide-card"><b>3 · 任命人物</b><p>从八名成员中选择牵头人。相关能力、信任、特质、疲劳和情报共同决定结果。</p></div>
        <div class="guide-card"><b>4 · 下两道令</b><p>每人、每个节点每回合最多一道令。命令可在结算前撤回，方略要在下令前调整。</p></div>
      </div>
      <h3>生存底线</h3>
      <p>第18回合后，至少4个节点保持联系、民心不低于45、组织力不低于3，即可让“火种未熄”。民心连续两回合低于20、组织力连续两回合归零，或七处全部失联，会提前结束本局地方战役。</p>
      <h3>五项资源</h3>
      <ul><li><b>民心：</b>群众公信与合作意愿。</li><li><b>粮秣：</b>机关、伤员、救济与转移的共同负担。</li><li><b>组织力：</b>干部、通讯和行政承载。</li><li><b>情报：</b>缩小行动不确定性并提高反“扫荡”准备。</li><li><b>暴露：</b>越高越容易遭遇定点清查；它不是侵略暴行的责任归属。</li></ul>
      <h3>快捷键</h3>
      <p><b>F</b> 方略　<b>H</b> 战法　<b>J</b> 纪事　<b>Enter</b> 结算回合　<b>Esc</b> 关闭非强制窗口</p>
    </div>`, { wide: true });
}

function ShowTutorial() {
  OpenModal(`${ModalHeader("四步入门", "先守住一条看不见的线", "这是关系与治理游戏，不是占地或歼敌竞赛。", false)}<div class="modal-body"><div class="guide-grid"><div class="guide-card"><b>节点</b><p>地图上的七处是组织与交通节点，不是完整控制的领土。</p></div><div class="guide-card"><b>人物</b><p>特质、信任和疲劳会改变同一道命令的结果。</p></div><div class="guide-card"><b>取舍</b><p>每回合只下两道命令，且要分配到不同节点。</p></div><div class="guide-card"><b>历史</b><p>百团大战、封锁与“扫荡”等宏观进程不会被玩家改写。</p></div></div><p class="boundary-note">开局后每回合先读事件，再在地图上选节点、选行动、任命牵头人。行动受挫不会让人物随机死亡。</p><button id="finishTutorial" class="continue-turn-button">进入第一次议事</button></div>`, { locked: true });
  Element("finishTutorial").addEventListener("click", () => {
    try { localStorage.setItem(tutorialKey, "1"); } catch { /* Optional. */ }
    modal.dataset.locked = "false";
    CloseModal();
    if (state.pendingEventId) ShowEvent();
  });
}

function ShowChronicle(returnToEnding = false) {
  const entries = state?.chronicle?.length ? state.chronicle.slice().reverse().map(entry => `<div class="chronicle-entry"><time>${EscapeHtml(entry.date)}</time><span>${EscapeHtml(entry.text)}</span></div>`).join("") : `<div class="chronicle-empty">本局还没有留下纪事。</div>`;
  OpenModal(`${ModalHeader("抗战纪事", "本局留下的地方记录", "这里只记录人员、关系与组织的得失，不用歼敌数字给战争评级。")}<div class="modal-body"><div class="chronicle-list">${entries}</div></div>`, { wide: true, onClose: returnToEnding ? ShowEnding : null });
}

function ShowTimeline() {
  const items = turnEvents.map((event, index) => {
    const className = index === state.turn ? "current" : index > state.turn ? "future" : "";
    const description = index <= state.turn ? event.story.slice(0, 70) + (event.story.length > 70 ? "……" : "") : "历史进程尚未抵达此处。";
    return `<div class="timeline-item ${className}"><time>${campaignDates[index]}</time><span class="timeline-dot"></span><div class="timeline-copy"><strong>${EscapeHtml(event.title)} · ${event.type === "historical" ? "史实节点" : "地方议事"}</strong><p>${EscapeHtml(description)}</p></div></div>`;
  }).join("");
  OpenModal(`${ModalHeader("历史时间线", "1940—1942：封锁中的十八个双月", "真实宏观事件按固定顺序出现，地方选择不能让战争提前结束。")}<div class="modal-body"><div class="timeline-list">${items}</div></div>`, { wide: true });
}

function ToggleSetting(className, button) {
  document.body.classList.toggle(className);
  button.setAttribute("aria-pressed", String(document.body.classList.contains(className)));
  button.textContent = document.body.classList.contains(className) ? "已开启" : "未开启";
  SaveSettings();
}

function ShowAccessibility() {
  const settings = CurrentSettings();
  OpenModal(`${ModalHeader("显示设置", "阅读与动态", "设置只保存在当前浏览器。")}
    <div class="modal-body">
      <div class="setting-row"><span>较大字号</span><button class="toggle-button" data-setting="large-text" aria-pressed="${settings.largeText}">${settings.largeText ? "已开启" : "未开启"}</button></div>
      <div class="setting-row"><span>高对比度</span><button class="toggle-button" data-setting="high-contrast" aria-pressed="${settings.highContrast}">${settings.highContrast ? "已开启" : "未开启"}</button></div>
      <div class="setting-row"><span>减少动态效果</span><button class="toggle-button" data-setting="reduced-motion" aria-pressed="${settings.reducedMotion}">${settings.reducedMotion ? "已开启" : "未开启"}</button></div>
      <p>游戏没有血腥动画。历史档案会提到侵略、封锁、强制迁移与战争暴行，但不展示图像化暴力。</p>
    </div>`, { narrow: true });
  modal.querySelectorAll("[data-setting]").forEach(button => button.addEventListener("click", () => ToggleSetting(button.dataset.setting, button)));
}

function BeginNewGame(skipConfirm = false) {
  if (!skipConfirm && LoadGame()) {
    OpenModal(`${ModalHeader("重新开局", "覆盖当前本地进度？", "现有战役将被替换。")}<div class="modal-body"><p>只有当前浏览器里的一份自动存档。开始新战役会覆盖它。</p><div class="ending-actions"><button data-close-modal>取消</button><button id="confirmNewGame" class="primary">开始新战役</button></div></div>`, { narrow: true });
    Element("confirmNewGame").addEventListener("click", () => { modal.dataset.locked = "false"; CloseModal(); BeginNewGame(true); });
    return;
  }
  state = CreateGame(Date.now());
  selectedRegionId = "Qinghe";
  StartCampaign(true);
}

function ContinueGame() {
  const loaded = LoadGame();
  if (!loaded) {
    ShowToast("没有找到可继续的本地进度。 ");
    continueButton.hidden = true;
    return;
  }
  state = loaded;
  StartCampaign(false);
}

function StartCampaign(isNew) {
  startScreen.hidden = true;
  gameScreen.hidden = false;
  SaveGame();
  RenderAll();
  PlayTone(260, .11, .025, "sine");
  if (state.reportPending) {
    ShowReport({ report: state.lastReport, resolvedDate: state.lastResolvedDate, over: state.over, result: state.result });
    return;
  }
  if (state.over) { ShowEnding(); return; }
  let tutorialSeen = false;
  try { tutorialSeen = localStorage.getItem(tutorialKey) === "1"; } catch { /* Optional. */ }
  if (isNew && !tutorialSeen) ShowTutorial();
  else if (state.pendingEventId) ShowEvent();
}

function EndTurn() {
  if (!state || endTurnButton.disabled) return;
  const result = ResolveTurn(state);
  if (!result.ok) { ShowToast(result.reason); return; }
  PlayTone(185, .12, .03, "sine");
  SaveGame();
  RenderAll();
  ShowReport(result);
}

newGameButton.addEventListener("click", () => BeginNewGame(false));
continueButton.addEventListener("click", ContinueGame);
endTurnButton.addEventListener("click", EndTurn);
Element("policyButton").addEventListener("click", ShowPolicy);
Element("policySummaryButton").addEventListener("click", ShowPolicy);
Element("relationViewButton").addEventListener("click", ShowRelations);
Element("timelineButton").addEventListener("click", ShowTimeline);

document.querySelectorAll("[data-open]").forEach(button => button.addEventListener("click", () => {
  const action = button.dataset.open;
  if (action === "history") ShowHistory();
  if (action === "guide") ShowGuide();
  if (action === "chronicle") ShowChronicle();
  if (action === "accessibility") ShowAccessibility();
}));

soundButton.addEventListener("click", () => {
  soundOn = !soundOn;
  soundButton.setAttribute("aria-pressed", String(soundOn));
  soundButton.textContent = soundOn ? "声" : "静";
  SaveSettings();
  if (soundOn) PlayTone(380);
});

modalWrap.addEventListener("click", event => {
  if (event.target === modalWrap && modal.dataset.locked !== "true") CloseModal();
});

document.addEventListener("keydown", event => {
  if (!modalWrap.hidden && event.key === "Tab") {
    const focusable = Array.from(modal.querySelectorAll('button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')).filter(element => !element.hidden);
    if (!focusable.length) { event.preventDefault(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    return;
  }
  if (event.key === "Escape" && !modalWrap.hidden && modal.dataset.locked !== "true") { CloseModal(); return; }
  if (!modalWrap.hidden || !state || gameScreen.hidden) return;
  if (event.key.toLowerCase() === "f") ShowPolicy();
  if (event.key.toLowerCase() === "h") ShowGuide();
  if (event.key.toLowerCase() === "j") ShowChronicle();
  if (event.key === "Enter" && !endTurnButton.disabled) EndTurn();
});

window.addEventListener("resize", () => {
  if (routeResizeFrame !== null) cancelAnimationFrame(routeResizeFrame);
  routeResizeFrame = requestAnimationFrame(() => {
    routeResizeFrame = null;
    if (state && !gameScreen.hidden) RenderRoutes();
  });
});

LoadSettings();
continueButton.hidden = !LoadGame();

const initialErrors = state ? InvariantChecks(state) : [];
if (initialErrors.length) console.warn("BorderRealm initial state warning:", initialErrors);

export { RenderAll, ShowHistory, ShowGuide };
