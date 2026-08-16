// 牛马指挥官 · 表现层。规则全在 Script_Rules.mjs，这里只负责画、响、收输入。
import {
  WORLD, BOSS_HOME, BOSS_ACTIVITIES, REVENUE_GOAL, FOOTBATH_COST,
  MILK_TEA_COST, TEAMBUILD_COST, AwardValue, FormatMoney,
  CreateState, StartGame, Tick, DrainEvents, AssignWorker, SlashScope, PaintPie,
  BossCode, Footbath, MilkTea, GiveAward, TeamBuild, BossGoOut, Release,
  AdvanceSetup, GetSetupCard, MarkSetupSelect,
  HireExtra, ToggleAi, BuyUpgrade, ExpandStudio, GetEmpireView,
  FindWorkerDef, ActiveWorkers, GetSpeedMultiplier, BossAway, WORKER_DEFS,
} from "./Script_Rules.mjs?v=5";

const dom = {};
[
  "stage", "gameCanvas", "hud", "hudMonth", "hudCash", "hudRoyalty", "hudGoalText", "hudGoalFill",
  "hudProjectName", "hudProjectFill", "hudStaff", "hudSpeed", "bossBanner", "selectionHint",
  "toastStack", "commandBar", "pieButton", "bossCodeButton", "footbathButton", "releaseButton",
  "spaButton", "clubButton", "stockButton", "milkTeaButton", "awardButton", "teambuildButton",
  "hireButton", "aiButton", "upgradeButton", "expandButton",
  "empireShop", "shopTitle", "shopHint", "shopList", "shopTabAi", "shopTabUp", "shopClose",
  "titleScreen", "startButton", "endScreen",
  "endTitle", "endReason", "endStats", "restartButton", "tutorialTip", "tutorialText",
  "tutorialSkip", "rotateHint", "setupCard", "setupTitle", "setupBody", "setupAction", "setupSkip",
].forEach((id) => { dom[id] = document.getElementById(id); });

const ctx = dom.gameCanvas.getContext("2d", { alpha: false, desynchronized: true });
let renderK = 1;
const bgCanvas = document.createElement("canvas");
const bgCtx = bgCanvas.getContext("2d", { alpha: false });
let bgReady = false;
let canvasRect = { left: 0, top: 0, width: WORLD.width, height: WORLD.height };

const state = CreateState((Date.now() % 100000) | 1);

const TUTORIAL_KEY = "crunchoverlord_tutorial_v1";
const TUTORIAL_STEPS = [
  { id: "select", text: "这四位是你的牛马。点一头试试——他们巴不得被老板注意。" },
  { id: "assign", text: "选中了就点红色缺陷单把他扔过去。点中间的游戏则是冲进度。" },
  { id: "slash", text: "黄色便签是策划偷加的需求。直接点掉，老板亲自撕。策划心碎，其他人偷着乐。" },
  { id: "release", text: "进度环满了就点【发售】。士气掉了请奶茶、发奖状或报销足浴；奖状发多了会穿帮。老板出门，牛马摸鱼。" },
];

const view = {
  mouseX: 640,
  mouseY: 360,
  mouseInside: false,
  selectedWorkerId: null,
  floaters: [],
  slashes: [],
  confetti: [],
  danmaku: [],
  shake: 0,
  releaseCard: null,
  bossPoint: null,
  lastFrame: performance.now(),
  tutorial: {
    active: (() => { try { return !localStorage.getItem(TUTORIAL_KEY); } catch { return true; } })(),
    done: { select: false, assign: false, slash: false, release: false },
  },
};

/* ============================ 音效（WebAudio 现场合成） ============================ */
let audioCtx = null;
function EnsureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { audioCtx = null; }
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}
function Beep(freq, duration, type = "square", volume = 0.06, when = 0) {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime + when;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}
function PlaySfx(id) {
  if (!audioCtx) return;
  switch (id) {
    case "order": Beep(660, 0.07); Beep(880, 0.09, "square", 0.05, 0.06); break;
    case "slash": Beep(220, 0.12, "sawtooth", 0.09); Beep(140, 0.16, "sawtooth", 0.07, 0.05); break;
    case "pie": [523, 659, 784, 1046].forEach((f, i) => Beep(f, 0.14, "triangle", 0.06, i * 0.09)); break;
    case "bossCode": Beep(180, 0.2, "sawtooth", 0.08); Beep(120, 0.25, "sawtooth", 0.06, 0.1); break;
    case "bug": Beep(196, 0.14, "sawtooth", 0.05); break;
    case "scope": Beep(311, 0.1, "triangle", 0.05); Beep(415, 0.12, "triangle", 0.05, 0.07); break;
    case "fixed": Beep(784, 0.08, "triangle", 0.05); Beep(988, 0.12, "triangle", 0.05, 0.06); break;
    case "quit": [440, 349, 262, 196].forEach((f, i) => Beep(f, 0.16, "triangle", 0.07, i * 0.12)); break;
    case "payday": Beep(392, 0.1, "square", 0.05); Beep(330, 0.14, "square", 0.05, 0.08); break;
    case "cashOut": Beep(494, 0.08, "square", 0.05); Beep(392, 0.1, "square", 0.05, 0.06); break;
    case "cashIn": [523, 659, 784].forEach((f, i) => Beep(f, 0.1, "square", 0.06, i * 0.06)); break;
    case "return": Beep(523, 0.09, "triangle", 0.05); Beep(659, 0.12, "triangle", 0.05, 0.07); break;
    case "win": [523, 659, 784, 1046, 1318].forEach((f, i) => Beep(f, 0.22, "triangle", 0.08, i * 0.12)); break;
    case "lose": [330, 262, 220, 165, 110].forEach((f, i) => Beep(f, 0.3, "sawtooth", 0.07, i * 0.16)); break;
    default: break;
  }
}

/* ============================ 小工具 ============================ */
function Dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }
let shopTab = "ai";
function TumorRadius(tumor) { return 20 + (tumor.hp / tumor.maxHp) * 14; }

function AddFloater(x, y, text, color = "#fff", life = 2.4, size = 15) {
  view.floaters.push({ x, y, text, color, life, maxLife: life, size });
  if (view.floaters.length > 26) view.floaters.shift();
}

function ShowToast(text, tone = "normal") {
  const node = document.createElement("div");
  node.className = `toast ${tone}`;
  node.textContent = text;
  dom.toastStack.appendChild(node);
  while (dom.toastStack.children.length > 5) dom.toastStack.firstChild.remove();
  setTimeout(() => {
    node.classList.add("leaving");
    setTimeout(() => node.remove(), 320);
  }, 4200);
}

let bannerTimer = null;
function ShowBanner(text) {
  dom.bossBanner.textContent = `老板：“${text}”`;
  dom.bossBanner.classList.remove("hidden");
  if (bannerTimer) clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => dom.bossBanner.classList.add("hidden"), 2600);
}

function SpawnConfetti(amount = 90) {
  for (let i = 0; i < amount; i++) {
    view.confetti.push({
      x: Math.random() * WORLD.width,
      y: -20 - Math.random() * 200,
      vx: (Math.random() - 0.5) * 60,
      vy: 120 + Math.random() * 160,
      size: 4 + Math.random() * 6,
      color: ["#ffd166", "#ff6eae", "#66b8ff", "#68e0a0", "#b66ccc"][i % 5],
      spin: Math.random() * Math.PI,
    });
  }
}

function SpawnDanmaku(lines) {
  lines.forEach((text, index) => {
    view.danmaku.push({
      text: `「${text}」`,
      x: WORLD.width + 60 + index * 340 + Math.random() * 120,
      y: 96 + (index % 3) * 34,
      speed: 130 + Math.random() * 60,
      color: ["#ff8a94", "#ffd166", "#9ecbff"][index % 3],
    });
  });
}

/* ============================ 引导 ============================ */
function MarkTutorial(stepId) {
  const tutorial = view.tutorial;
  if (!tutorial.active || tutorial.done[stepId]) return;
  tutorial.done[stepId] = true;
  if (Object.values(tutorial.done).every(Boolean)) {
    FinishTutorial("引导结束。开始你的暴政。");
  }
}
function FinishTutorial(message) {
  view.tutorial.active = false;
  try { localStorage.setItem(TUTORIAL_KEY, "done"); } catch { /* 无痕模式 */ }
  dom.tutorialTip.classList.add("hidden");
  dom.releaseButton.classList.remove("tut-glow");
  if (message) ShowToast(message, "good");
}
function CurrentTutorialStep() {
  if (!view.tutorial.active || state.status !== "playing") return null;
  return TUTORIAL_STEPS.find((step) => !view.tutorial.done[step.id]) || null;
}
function TutorialTarget(step) {
  if (!step) return null;
  if (step.id === "select") {
    const worker = ActiveWorkers(state)[0];
    return worker ? { x: worker.x, y: worker.y } : null;
  }
  if (step.id === "assign") {
    const bug = state.tumors.find((tumor) => tumor.kind === "bug");
    return bug ? { x: bug.x, y: bug.y } : null;
  }
  if (step.id === "slash") {
    const scope = state.tumors.find((tumor) => tumor.kind === "scope");
    return scope ? { x: scope.x, y: scope.y } : null;
  }
  return null; // release 一步高亮 DOM 按钮
}
function SyncTutorial() {
  const step = CurrentTutorialStep();
  dom.releaseButton.classList.toggle("tut-glow", Boolean(step && step.id === "release"));
  if (!step) { dom.tutorialTip.classList.add("hidden"); return; }
  dom.tutorialTip.classList.remove("hidden");
  dom.tutorialText.textContent = step.text;
}

/* ============================ 事件消费 ============================ */
function SyncSetupCard() {
  const card = GetSetupCard(state);
  if (!card) {
    dom.setupCard.classList.add("hidden");
    dom.commandBar.classList.toggle("hidden", state.status !== "playing");
    return;
  }
  CloseShop();
  dom.setupCard.classList.remove("hidden");
  dom.setupCard.classList.toggle("teach", !card.action);
  dom.commandBar.classList.add("hidden");
  dom.setupTitle.textContent = card.title;
  dom.setupBody.textContent = card.body;
  if (card.action) {
    dom.setupAction.classList.remove("hidden");
    dom.setupAction.textContent = card.actionLabel;
  } else {
    dom.setupAction.classList.add("hidden");
  }
  dom.setupSkip.classList.toggle("hidden", !card.skip);
}

function ConsumeEvents() {
  DrainEvents(state).forEach((event) => {
    switch (event.kind) {
      case "setup": SyncSetupCard(); break;
      case "boss": ShowBanner(event.text); break;
      case "quote": {
        const def = FindWorkerDef(event.workerId, state);
        AddFloater(event.x, event.y, `${def ? def.name : "?"}：${event.text}`, def ? def.color : "#fff", 3.4);
        break;
      }
      case "toast": ShowToast(event.text, event.tone); break;
      case "effect": AddFloater(event.x, event.y, event.text, event.color || "#ffd166", 2.2, 17); break;
      case "point": view.bossPoint = { x: event.x, y: event.y, t: 0.9 }; break;
      case "bossBack": view.shake = Math.max(view.shake, 0.5); break;
      case "slash": {
        view.slashes.push({ x: event.x, y: event.y, t: 0.35 });
        view.shake = Math.max(view.shake, 0.35);
        break;
      }
      case "pie": view.shake = Math.max(view.shake, 0.2); break;
      case "bossCode": view.shake = Math.max(view.shake, 0.3); break;
      case "spawn": break;
      case "fixed": AddFloater(event.x, event.y, event.tumorKind === "bug" ? "已修复！" : "谈崩了（好事）", "#8df0b0", 1.6); break;
      case "release": {
        view.releaseCard = { ...event, t: 5.2 };
        SpawnConfetti(event.stars >= 4 ? 130 : 60);
        SpawnDanmaku(event.danmaku || []);
        break;
      }
      case "sfx": PlaySfx(event.id); break;
      default: break;
    }
  });
}

/* ============================ 输入 ============================ */
function HitTest(x, y) {
  for (const worker of state.workers) {
    if (worker.state === "gone") continue;
    if (Dist(x, y, worker.x, worker.y) < 34) return { type: "worker", id: worker.id };
  }
  for (const tumor of state.tumors) {
    if (Dist(x, y, tumor.x, tumor.y) < TumorRadius(tumor) + 10) return { type: "tumor", id: tumor.id, kind: tumor.kind };
  }
  if (Dist(x, y, WORLD.coreX, WORLD.coreY) < 92) return { type: "core" };
  return null;
}

function HandleCommand(result, options = {}) {
  ConsumeEvents();
  if (!result.ok) {
    ShowToast(result.message, "warning");
    return false;
  }
  if (options.toast) ShowToast(result.message, options.tone || "normal");
  return true;
}

function HandleClick() {
  if (state.status !== "playing" && state.status !== "setup") return;
  const hit = HitTest(view.mouseX, view.mouseY);
  if (!hit) { view.selectedWorkerId = null; return; }

  if (hit.type === "worker") {
    view.selectedWorkerId = hit.id;
    MarkTutorial("select");
    if (state.status === "setup") {
      MarkSetupSelect(state);
      ConsumeEvents();
    }
    PlaySfx("order");
    return;
  }

  if (hit.type === "tumor") {
    if (view.selectedWorkerId) {
      if (HandleCommand(AssignWorker(state, view.selectedWorkerId, hit.id))) {
        MarkTutorial("assign");
        view.selectedWorkerId = null;
      }
      return;
    }
    if (hit.kind === "scope") {
      if (HandleCommand(SlashScope(state, hit.id))) MarkTutorial("slash");
    } else {
      ShowToast("缺陷单要牛马修：先点一头牛马，再点这张单。", "warning");
    }
    return;
  }

  if (hit.type === "core") {
    if (view.selectedWorkerId) {
      if (HandleCommand(AssignWorker(state, view.selectedWorkerId, "core"))) {
        MarkTutorial("assign");
        view.selectedWorkerId = null;
      }
    } else {
      ShowToast("想冲进度：先点一头牛马，再点游戏本体。", "normal");
    }
  }
}

function UpdatePointer(event) {
  const rect = canvasRect;
  if (!rect.width) return;
  view.mouseX = ((event.clientX - rect.left) / rect.width) * WORLD.width;
  view.mouseY = ((event.clientY - rect.top) / rect.height) * WORLD.height;
}

dom.gameCanvas.addEventListener("pointermove", (event) => {
  UpdatePointer(event);
  view.mouseInside = event.pointerType === "mouse";
}, { passive: true });
dom.gameCanvas.addEventListener("pointerdown", (event) => {
  EnsureAudio();
  UpdatePointer(event);
  if (event.pointerType === "mouse" && event.button === 2) { view.selectedWorkerId = null; return; }
  if (event.pointerType !== "mouse" || event.button === 0) HandleClick();
});
dom.gameCanvas.addEventListener("pointerleave", () => { view.mouseInside = false; });
dom.gameCanvas.addEventListener("contextmenu", (event) => event.preventDefault());

window.addEventListener("keydown", (event) => {
  if (state.status === "setup") {
    const key = event.key.toLowerCase();
    if (key === "enter" || key === " ") {
      const card = GetSetupCard(state);
      if (card?.action) HandleCommand(AdvanceSetup(state, card.action));
    } else if (key === "escape") HandleCommand(AdvanceSetup(state, "skip"));
    else if (["1", "2", "3", "4"].includes(key)) {
      const worker = state.workers[Number(key) - 1];
      if (worker && worker.state !== "gone") {
        view.selectedWorkerId = worker.id;
        MarkSetupSelect(state);
        PlaySfx("order");
      }
    }
    return;
  }
  if (state.status !== "playing") return;
  const key = event.key.toLowerCase();
  if (key === "q") HandleCommand(PaintPie(state));
  else if (key === "w") HandleCommand(BossCode(state));
  else if (key === "e") {
    if (!view.selectedWorkerId) ShowToast("先点一头牛马，再报销足浴。", "normal");
    else if (HandleCommand(Footbath(state, view.selectedWorkerId))) view.selectedWorkerId = null;
  } else if (key === "r") {
    if (HandleCommand(Release(state), { toast: false })) MarkTutorial("release");
  } else if (key === "t") HandleCommand(MilkTea(state));
  else if (key === "f") {
    if (!view.selectedWorkerId) ShowToast("先点一头牛马，再发奖状。", "normal");
    else HandleCommand(GiveAward(state, view.selectedWorkerId));
  } else if (key === "g") HandleCommand(TeamBuild(state));
  else if (key === "a") HandleCommand(BossGoOut(state, "spa"));
  else if (key === "s") HandleCommand(BossGoOut(state, "club"));
  else if (key === "d") HandleCommand(BossGoOut(state, "stock"));
  else if (key === "h") HandleCommand(HireExtra(state));
  else if (key === "y") OpenShop("ai");
  else if (key === "u") OpenShop("up");
  else if (key === "n") HandleCommand(ExpandStudio(state));
  else if (key === "b") ToggleShop();
  else if (["1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(key)) {
    const worker = ActiveWorkers(state)[Number(key) - 1];
    if (worker) { view.selectedWorkerId = worker.id; MarkTutorial("select"); }
  } else if (key === "escape") {
    if (!dom.empireShop.classList.contains("hidden")) CloseShop();
    else view.selectedWorkerId = null;
  }
});

dom.pieButton.addEventListener("click", () => { EnsureAudio(); HandleCommand(PaintPie(state)); });
dom.bossCodeButton.addEventListener("click", () => { EnsureAudio(); HandleCommand(BossCode(state)); });
dom.footbathButton.addEventListener("click", () => {
  EnsureAudio();
  if (!view.selectedWorkerId) { ShowToast("先点一头牛马，再报销足浴。", "normal"); return; }
  if (HandleCommand(Footbath(state, view.selectedWorkerId))) view.selectedWorkerId = null;
});
dom.releaseButton.addEventListener("click", () => {
  EnsureAudio();
  if (HandleCommand(Release(state), { toast: false })) MarkTutorial("release");
});
dom.milkTeaButton.addEventListener("click", () => { EnsureAudio(); HandleCommand(MilkTea(state)); });
dom.awardButton.addEventListener("click", () => {
  EnsureAudio();
  if (!view.selectedWorkerId) { ShowToast("先点一头牛马，再发奖状。", "normal"); return; }
  HandleCommand(GiveAward(state, view.selectedWorkerId));
});
dom.teambuildButton.addEventListener("click", () => { EnsureAudio(); HandleCommand(TeamBuild(state)); });
dom.spaButton.addEventListener("click", () => { EnsureAudio(); HandleCommand(BossGoOut(state, "spa")); });
dom.clubButton.addEventListener("click", () => { EnsureAudio(); HandleCommand(BossGoOut(state, "club")); });
dom.stockButton.addEventListener("click", () => { EnsureAudio(); HandleCommand(BossGoOut(state, "stock")); });
dom.hireButton.addEventListener("click", () => { EnsureAudio(); HandleCommand(HireExtra(state)); });
dom.aiButton.addEventListener("click", () => { EnsureAudio(); OpenShop("ai"); });
dom.upgradeButton.addEventListener("click", () => { EnsureAudio(); OpenShop("up"); });
dom.expandButton.addEventListener("click", () => { EnsureAudio(); HandleCommand(ExpandStudio(state)); });
dom.shopTabAi.addEventListener("click", () => OpenShop("ai"));
dom.shopTabUp.addEventListener("click", () => OpenShop("up"));
dom.shopClose.addEventListener("click", () => CloseShop());
dom.shopList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-buy]");
  if (!button) return;
  EnsureAudio();
  const id = button.getAttribute("data-buy");
  const kind = button.getAttribute("data-kind");
  if (kind === "ai") HandleCommand(ToggleAi(state, id));
  else HandleCommand(BuyUpgrade(state, id));
  RenderShop();
});
dom.tutorialSkip.addEventListener("click", () => FinishTutorial("行，老板天生就会。"));
dom.setupAction.addEventListener("click", () => {
  EnsureAudio();
  const card = GetSetupCard(state);
  if (card?.action) HandleCommand(AdvanceSetup(state, card.action));
});
dom.setupSkip.addEventListener("click", () => {
  EnsureAudio();
  HandleCommand(AdvanceSetup(state, "skip"));
});

function EnterOffice() {
  view.hudAt = 0;
  view.selectedWorkerId = null;
  view.tutorial.active = false;
  dom.tutorialTip.classList.add("hidden");
  SyncHud();
  SyncSetupCard();
  dom.titleScreen.classList.add("hidden");
  dom.endScreen.classList.add("hidden");
  dom.hud.classList.remove("hidden");
}

dom.startButton.addEventListener("click", () => {
  EnsureAudio();
  StartGame(state);
  EnterOffice();
});
dom.restartButton.addEventListener("click", () => {
  EnsureAudio();
  StartGame(state);
  view.floaters = [];
  view.confetti = [];
  view.danmaku = [];
  view.releaseCard = null;
  EnterOffice();
});

/* ============================ HUD 同步 ============================ */
function SyncHud() {
  const empire = GetEmpireView(state);
  dom.hudMonth.textContent = `M${String(state.month).padStart(2, "0")}`;
  dom.hudCash.textContent = FormatMoney(state.cash);
  dom.hudCash.style.color = state.cash < 20000 ? "#ff5d73" : "#f5efff";
  dom.hudRoyalty.textContent = `+${FormatMoney(empire.royaltyPerSec)}/秒`;
  dom.hudRoyalty.style.color = empire.royaltyPerSec > 0 ? "#43d9ad" : "#9d92bd";
  dom.hudGoalText.textContent = `${FormatMoney(state.revenue)} / ${FormatMoney(REVENUE_GOAL)}`;
  dom.hudGoalFill.style.width = `${Math.min(100, (state.revenue / REVENUE_GOAL) * 100)}%`;
  dom.hudProjectName.textContent = `${state.project.name} 进度 ${Math.floor(state.project.progress)}/${state.project.need}`;
  dom.hudProjectFill.style.width = `${(state.project.progress / state.project.need) * 100}%`;
  dom.hudStaff.textContent = empire.ghostStaff ? `${empire.staff}(${empire.ghostStaff}远程)` : `${empire.staff}/${empire.staffCap}`;
  dom.hudSpeed.textContent = `${Math.round(GetSpeedMultiplier(state) * 100)}%`;

  const away = BossAway(state);
  dom.pieButton.disabled = away || state.pie.cooldown > 0;
  dom.pieButton.querySelector("b").textContent = state.pie.cooldown > 0 ? `画大饼 (${Math.ceil(state.pie.cooldown)}s)` : "画大饼 [Q]";
  dom.bossCodeButton.disabled = away || state.bossCodeCooldown > 0 || state.hair <= 0;
  dom.bossCodeButton.querySelector("b").textContent = state.hair <= 0 ? "秃了，写不动" : state.bossCodeCooldown > 0 ? `亲自写代码 (${Math.ceil(state.bossCodeCooldown)}s)` : "亲自写代码 [W]";
  const teaming = state.workers.some((worker) => worker.state === "teambuild" || worker.mission?.then === "teambuild");
  const awardNow = AwardValue(state);
  dom.footbathButton.disabled = away || state.cash < FOOTBATH_COST;
  dom.milkTeaButton.disabled = away || state.cash < MILK_TEA_COST || state.milkTeaCooldown > 0;
  dom.milkTeaButton.querySelector("b").textContent = state.milkTeaCooldown > 0 ? `请奶茶 (${Math.ceil(state.milkTeaCooldown)}s)` : "请奶茶 [T]";
  dom.awardButton.disabled = away || state.awardCooldown > 0;
  dom.awardButton.querySelector("b").textContent = state.awardCooldown > 0
    ? `发奖状 (${Math.ceil(state.awardCooldown)}s)`
    : awardNow > 0 ? `发奖状 [F]  +${awardNow}` : `发奖状 [F]  ${awardNow}`;
  dom.teambuildButton.disabled = away || teaming || state.cash < TEAMBUILD_COST;
  dom.releaseButton.disabled = away || state.project.progress < state.project.need;
  dom.releaseButton.classList.toggle("ready", !away && state.project.progress >= state.project.need);
  dom.spaButton.disabled = away || state.cash < BOSS_ACTIVITIES.spa.cost;
  dom.clubButton.disabled = away || state.cash < BOSS_ACTIVITIES.club.cost;
  dom.stockButton.disabled = away || state.cash < BOSS_ACTIVITIES.stock.cost;
  dom.hireButton.disabled = away || !empire.canHire;
  dom.hireButton.querySelector("small").textContent = empire.hireLocked
    ? "编制满了 · 先扩张"
    : `${FormatMoney(empire.nextHireCost)} · ${empire.staff}/${empire.staffCap}`;
  dom.expandButton.disabled = away || !empire.nextExpand || !empire.nextExpand.can;
  dom.expandButton.querySelector("small").textContent = empire.nextExpand
    ? `${empire.nextExpand.name} · ${FormatMoney(empire.nextExpand.cost)}`
    : "已经是帝国";
  if (!dom.empireShop.classList.contains("hidden")) RenderShop();

  if (view.selectedWorkerId) {
    const def = FindWorkerDef(view.selectedWorkerId, state);
    dom.selectionHint.textContent = `已选中 ${def.roleLabel} ${def.name} —— 点红色缺陷单派人修 / 点游戏冲进度 / 黄色便签直接撕`;
    dom.selectionHint.classList.remove("hidden");
  } else {
    dom.selectionHint.classList.add("hidden");
  }
  SyncTutorial();
}

function OpenShop(tab) {
  shopTab = tab || shopTab;
  dom.empireShop.classList.remove("hidden");
  RenderShop();
}
function CloseShop() {
  dom.empireShop.classList.add("hidden");
}
function ToggleShop() {
  if (dom.empireShop.classList.contains("hidden")) OpenShop(shopTab);
  else CloseShop();
}
function RenderShop() {
  const empire = GetEmpireView(state);
  dom.shopTabAi.classList.toggle("on", shopTab === "ai");
  dom.shopTabUp.classList.toggle("on", shopTab === "up");
  if (shopTab === "ai") {
    dom.shopTitle.textContent = "AI 月租";
    dom.shopHint.textContent = `当前月租 ${FormatMoney(empire.aiBurn)} · 发薪日从口袋里扣。开通先付一个月。`;
    dom.shopList.innerHTML = empire.ais.map((plan) => {
      const label = plan.on ? "退订" : plan.locked ? "未解锁" : FormatMoney(plan.cost);
      return `<div class="shop-row${plan.locked ? " locked" : ""}"><b>${plan.name}</b><button type="button" data-kind="ai" data-buy="${plan.id}" class="${plan.on ? "on" : ""}" ${plan.locked ? "disabled" : ""}>${label}</button><small>${plan.desc}</small></div>`;
    }).join("");
  } else {
    dom.shopTitle.textContent = "基建";
    dom.shopHint.textContent = `${empire.tierName} · 热度 ×${empire.fame.toFixed(1)} · 目录 ${FormatMoney(empire.catalog)}`;
    dom.shopList.innerHTML = empire.upgrades.map((item) => {
      const label = item.owned ? "已装" : item.locked ? "未解锁" : FormatMoney(item.cost);
      return `<div class="shop-row${item.locked ? " locked" : ""}"><b>${item.name}</b><button type="button" data-kind="up" data-buy="${item.id}" ${item.owned || item.locked ? "disabled" : ""}>${label}</button><small>${item.desc}</small></div>`;
    }).join("");
  }
}

function ShowEndScreen() {
  dom.hud.classList.add("hidden");
  dom.commandBar.classList.add("hidden");
  dom.empireShop.classList.add("hidden");
  dom.setupCard.classList.add("hidden");
  dom.tutorialTip.classList.add("hidden");
  dom.endScreen.classList.remove("hidden");
  const stats = state.stats;
  if (state.status === "won") {
    dom.endTitle.textContent = "百亿老板！";
    dom.endTitle.style.color = "#ffd166";
    dom.endReason.textContent = `累计流水破 ${FormatMoney(REVENUE_GOAL)}。你在年会上说：“成绩是大家的。”台下的牛马在心里翻译：“钱是老板的。”`;
  } else {
    dom.endTitle.textContent = "公司没了";
    dom.endTitle.style.color = "#ff5d73";
    dom.endReason.textContent = state.loseReason;
  }
  const lines = [
    `${state.companyName || "无名公司"} · 招聘 ${stats.hired} 人 · 存活 ${stats.monthsSurvived} 个月 · 发售 ${stats.releases} 款游戏`,
    `砍需求 ${stats.slashes} 次 · 画饼 ${stats.pies} 张 · 亲自写代码 ${stats.bossCodes} 次（剩余头发 ${Math.round(state.hair)}%）`,
    `修复 BUG ${stats.bugsFixed} 个 · 足浴 ${stats.footbaths} · 奶茶 ${stats.milkTeas} · 奖状 ${stats.awards} · 团建 ${stats.teambuilds} · 气走 ${stats.quits} 头`,
    `老板足疗 ${stats.spaTrips} 次 · 高端会所 ${stats.clubTrips} 次${stats.investGained ? `（拉到投资 ${FormatMoney(stats.investGained)}）` : ""}`,
    `炒股 ${stats.stockPlays} 次 · 股市净收益 ${FormatMoney(stats.stockNet)}`,
    `扩张 ${stats.expands} 次 · 编外招聘 ${stats.extrasHired} · AI 月租花掉 ${FormatMoney(stats.aiSpend)} · 分成进账 ${FormatMoney(stats.royalties)}`,
  ];
  dom.endStats.innerHTML = lines.map((line) => `<div>${line}</div>`).join("");
}

/* ============================ 场景绘制 ============================ */
const WALL_BASE = 132;

function PaintPlant(g, x, y) {
  g.fillStyle = "#7a4a33";
  g.fillRect(x - 13, y - 16, 26, 20);
  g.fillStyle = "#3f7a4d";
  for (let i = 0; i < 5; i++) {
    const angle = -Math.PI / 2 + (i - 2) * 0.45;
    g.beginPath();
    g.ellipse(x + Math.cos(angle) * 14, y - 22 + Math.sin(angle) * 10, 7, 17, angle + Math.PI / 2, 0, 0, Math.PI * 2);
    g.fill();
  }
}

function PaintDesk(g, deskX, deskY, color, seed) {
  g.fillStyle = "rgba(0,0,0,0.24)";
  g.beginPath();
  g.ellipse(deskX, deskY + 32, 66, 14, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#241f33";
  g.fillRect(deskX - 14, deskY + 18, 28, 10);
  g.fillRect(deskX - 3, deskY + 26, 6, 8);
  g.fillStyle = "#4d4166";
  g.fillRect(deskX - 62, deskY - 14, 124, 30);
  g.fillStyle = "#5d4f7c";
  g.fillRect(deskX - 62, deskY - 14, 124, 7);
  g.fillStyle = "#171226";
  g.fillRect(deskX - 26, deskY - 46, 52, 34);
  g.fillStyle = "rgba(110, 190, 255, 0.42)";
  g.fillRect(deskX - 22, deskY - 42, 44, 26);
  g.fillStyle = "rgba(255,255,255,0.35)";
  for (let i = 0; i < 3; i++) g.fillRect(deskX - 18, deskY - 38 + i * 7, 22 + ((seed + i) % 3) * 5, 2);
  g.fillStyle = "#332b47";
  g.fillRect(deskX - 18, deskY - 8, 36, 8);
  g.fillStyle = color;
  g.fillRect(deskX + 38, deskY - 10, 12, 12);
  g.fillStyle = "rgba(255,255,255,0.5)";
  g.fillRect(deskX + 50, deskY - 7, 4, 6);
}

function BakeBackground() {
  bgCanvas.width = WORLD.width;
  bgCanvas.height = WORLD.height;
  const g = bgCtx;
  const wallGradient = g.createLinearGradient(0, 0, 0, WALL_BASE);
  wallGradient.addColorStop(0, "#332b47");
  wallGradient.addColorStop(1, "#2b2440");
  g.fillStyle = wallGradient;
  g.fillRect(0, 0, WORLD.width, WALL_BASE);
  g.fillStyle = "#1d1830";
  g.fillRect(0, WALL_BASE - 6, WORLD.width, 6);

  const floorGradient = g.createLinearGradient(0, WALL_BASE, 0, WORLD.height);
  floorGradient.addColorStop(0, "#2e2740");
  floorGradient.addColorStop(1, "#221c31");
  g.fillStyle = floorGradient;
  g.fillRect(0, WALL_BASE, WORLD.width, WORLD.height - WALL_BASE);
  g.strokeStyle = "rgba(255,255,255,0.028)";
  g.lineWidth = 1;
  for (let y = WALL_BASE + 34; y < WORLD.height; y += 42) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(WORLD.width, y); g.stroke();
    const offset = ((y / 42) % 2) * 110;
    for (let x = offset; x < WORLD.width; x += 220) {
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 42); g.stroke();
    }
  }

  g.fillStyle = "#171226";
  g.fillRect(944, 14, 250, 104);
  const skyGradient = g.createLinearGradient(0, 18, 0, 114);
  skyGradient.addColorStop(0, "#101b33");
  skyGradient.addColorStop(1, "#1c2b4d");
  g.fillStyle = skyGradient;
  g.fillRect(950, 20, 238, 92);
  g.fillStyle = "#f4ecc9";
  g.beginPath(); g.arc(1150, 44, 13, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#1c2b4d";
  g.beginPath(); g.arc(1156, 40, 11, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 3; i++) {
    const bx = 962 + i * 78;
    g.fillStyle = "#0c1424";
    g.fillRect(bx, 58 + (i % 2) * 8, 52, 54);
    for (let wy = 0; wy < 4; wy++) {
      for (let wx = 0; wx < 4; wx++) {
        const lit = ((i * 17 + wx * 5 + wy * 9) % 7) > 2;
        g.fillStyle = lit ? "rgba(255,214,140,0.85)" : "rgba(70,86,120,0.4)";
        g.fillRect(bx + 6 + wx * 11, 64 + (i % 2) * 8 + wy * 11, 6, 6);
      }
    }
  }
  g.strokeStyle = "#4a3f66";
  g.lineWidth = 4;
  g.strokeRect(950, 20, 238, 92);
  g.beginPath(); g.moveTo(1069, 20); g.lineTo(1069, 112); g.stroke();

  g.fillStyle = "#efe9dc";
  g.beginPath(); g.arc(96, 66, 24, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "#4a3f66"; g.lineWidth = 4; g.stroke();

  g.fillStyle = "#3d3357";
  g.fillRect(150, 34, 214, 74);
  g.strokeStyle = "#6a5a96"; g.lineWidth = 3; g.strokeRect(150, 34, 214, 74);
  g.fillStyle = "#ffd166";
  g.font = "bold 16px 'Microsoft YaHei', sans-serif";
  g.textAlign = "center";
  g.fillText("KPI 光荣榜", 257, 60);
  g.fillStyle = "#9d92bd";
  g.font = "13px 'Microsoft YaHei', sans-serif";
  g.fillText("本月全勤：空缺", 257, 84);

  g.fillStyle = "#8a2f3d";
  g.fillRect(478, 96, 324, 36);
  g.strokeStyle = "#5c1d28"; g.lineWidth = 3; g.strokeRect(478, 96, 324, 36);
  g.fillStyle = "#ffe9b3";
  g.font = "bold 19px 'Microsoft YaHei', sans-serif";
  g.fillText("今天不努力，明天陪老板努力", 640, 121);

  g.fillStyle = "#1a1526";
  g.fillRect(1218, 452, 62, 176);
  g.strokeStyle = "#4a3f66"; g.lineWidth = 3;
  g.strokeRect(1218, 452, 62, 176);
  g.fillStyle = "#3d3357";
  g.fillRect(1226, 462, 46, 158);
  g.fillStyle = "#ffd166";
  g.beginPath(); g.arc(1234, 546, 4, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#9d92bd";
  g.font = "12px 'Microsoft YaHei', sans-serif";
  g.textAlign = "right";
  g.fillText("足疗·团建·会所·股市·离职", 1276, 444);
  g.fillText("↑ 全走同一扇门", 1276, 660);

  PaintPlant(g, 46, 668);
  PaintPlant(g, 1190, 300);
  g.fillStyle = "#3a3450";
  g.fillRect(1128, 596, 34, 62);
  g.fillStyle = "#6fb6d9";
  g.fillRect(1132, 574, 26, 26);
  g.fillStyle = "rgba(255,255,255,0.25)";
  g.fillRect(1136, 578, 8, 18);

  g.fillStyle = "rgba(122, 92, 255, 0.07)";
  g.beginPath();
  g.ellipse(WORLD.coreX, WORLD.coreY + 24, 220, 120, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "rgba(122, 92, 255, 0.14)";
  g.lineWidth = 2;
  g.stroke();
  WORKER_DEFS.forEach((def, index) => PaintDesk(g, def.desk.x, def.desk.y, def.color, index));
  bgReady = true;
}

function DrawClockHands() {
  const minuteAngle = state.time * 0.6;
  ctx.strokeStyle = "#3a3450";
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(96, 66);
  ctx.lineTo(96 + Math.sin(minuteAngle) * 16, 66 - Math.cos(minuteAngle) * 16); ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(96, 66);
  ctx.lineTo(96 + Math.sin(minuteAngle / 12) * 10, 66 - Math.cos(minuteAngle / 12) * 10); ctx.stroke();
}

function DrawCompanyPlaque() {
  if (!state.companyName) return;
  ctx.fillStyle = "#3d3357";
  ctx.fillRect(158, 88, 198, 16);
  ctx.fillStyle = "#efe9fb";
  ctx.font = "12px 'Microsoft YaHei', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(state.companyName, 257, 100);
  ctx.textAlign = "left";
}

function DrawCore(time) {
  const project = state.project;
  const pulse = 1 + Math.sin(time * 2.2) * 0.03;
  const radius = 78 * pulse;
  const glow = ctx.createRadialGradient(WORLD.coreX, WORLD.coreY, 10, WORLD.coreX, WORLD.coreY, radius + 34);
  glow.addColorStop(0, "rgba(122, 92, 255, 0.5)");
  glow.addColorStop(1, "rgba(122, 92, 255, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(WORLD.coreX, WORLD.coreY, radius + 34, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = "#33294f";
  ctx.beginPath(); ctx.arc(WORLD.coreX, WORLD.coreY, radius, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#7a5cff"; ctx.lineWidth = 4; ctx.stroke();

  const ratio = project.progress / project.need;
  ctx.strokeStyle = "#43d9ad";
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(WORLD.coreX, WORLD.coreY, radius + 12, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#efe9fb";
  ctx.textAlign = "center";
  ctx.font = "bold 21px 'Microsoft YaHei', sans-serif";
  ctx.fillText(project.name, WORLD.coreX, WORLD.coreY - 8);
  ctx.font = "15px 'Microsoft YaHei', sans-serif";
  ctx.fillStyle = ratio >= 1 ? "#43d9ad" : "#b3a7d6";
  ctx.fillText(ratio >= 1 ? "可以发售了！[R]" : `进度 ${Math.floor(project.progress)}/${project.need}`, WORLD.coreX, WORLD.coreY + 22);
  ctx.textAlign = "left";
}

function DrawTicket(tumor) {
  const isScope = tumor.kind === "scope";
  const w = isScope ? 54 : 60;
  const h = isScope ? 50 : 42;
  const rot = (((tumor.id.charCodeAt(1) || 1) * 13 + (tumor.id.charCodeAt(2) || 3)) % 7 - 3) * 0.035;
  const hovering = Dist(view.mouseX, view.mouseY, tumor.x, tumor.y) < TumorRadius(tumor) + 10;

  ctx.save();
  ctx.translate(tumor.x, tumor.y);
  ctx.rotate(rot);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(-w / 2 + 3, -h / 2 + 4, w, h);
  ctx.fillStyle = isScope ? "#f2d36a" : "#f4ddd8";
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = isScope ? "#c99413" : "#b0263a";
  ctx.fillRect(-w / 2, -h / 2, w, 13);
  ctx.fillStyle = isScope ? "#3a2a08" : "#fff8f6";
  ctx.font = "bold 11px 'Microsoft YaHei', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(isScope ? "加塞便签" : "缺陷单", 0, -h / 2 + 10);
  ctx.fillStyle = isScope ? "rgba(80,50,10,0.32)" : "rgba(90,24,24,0.32)";
  for (let i = 0; i < 3; i++) ctx.fillRect(-w / 2 + 8, -h / 2 + 20 + i * 7, w - 22 - i * 5, 2);
  if (tumor.bossMade) {
    ctx.strokeStyle = "#8a2f3d";
    ctx.lineWidth = 1.4;
    ctx.strokeRect(w / 2 - 28, 4, 22, 12);
    ctx.fillStyle = "#8a2f3d";
    ctx.font = "9px 'Microsoft YaHei', sans-serif";
    ctx.fillText("亲笔", w / 2 - 17, 13);
  }
  const hpRatio = tumor.hp / tumor.maxHp;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(-20, h / 2 + 3, 40, 4);
  ctx.fillStyle = isScope ? "#c99413" : "#b0263a";
  ctx.fillRect(-20, h / 2 + 3, 40 * hpRatio, 4);
  if (hovering) {
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.strokeRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6);
  }
  ctx.restore();

  if (hovering) {
    ctx.fillStyle = "#fff";
    ctx.font = "12px 'Microsoft YaHei', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      isScope ? "点击直接撕掉" : (view.selectedWorkerId ? "点击派人修" : "先选牛马再点这张单"),
      tumor.x,
      tumor.y - h / 2 - 14,
    );
  }
  ctx.textAlign = "left";
}

function DrawWorker(worker, time) {
  const def = FindWorkerDef(worker.id, state);
  if (!def) return;
  if (worker.state === "gone") return;
  const selected = view.selectedWorkerId === worker.id;
  const walking = worker.state === "moving" || worker.state === "quitWalking";
  const working = worker.state === "working" || worker.state === "sprint";
  const slacking = worker.state === "desk" && BossAway(state);
  const bob = walking ? Math.sin(time * 12) * 3.2 : working ? Math.sin(time * 9) * 2 : Math.sin(time * 2 + worker.x) * 1;
  const x = worker.x;
  const y = worker.y + bob;

  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(x, worker.y + 26, 17, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  if (selected) {
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(x, worker.y, 34, time * 2, time * 2 + Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 身体 + 职能字
  ctx.fillStyle = def.color;
  ctx.beginPath();
  ctx.roundRect(x - 13, y - 10, 26, 32, 7);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.42)";
  ctx.font = "bold 13px 'Microsoft YaHei', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(def.roleGlyph, x, y + 11);

  // 头
  ctx.fillStyle = "#f2d5b8";
  ctx.beginPath(); ctx.arc(x, y - 21, 12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#3a3450";
  ctx.beginPath(); ctx.arc(x, y - 25, 11, Math.PI, 0); ctx.fill();

  // 表情
  ctx.fillStyle = "#241a05";
  if (worker.morale > 55) {
    ctx.fillRect(x - 6, y - 23, 3, 3); ctx.fillRect(x + 3, y - 23, 3, 3);
    ctx.beginPath(); ctx.arc(x, y - 17, 4, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  } else if (worker.morale > 25) {
    ctx.fillRect(x - 6, y - 23, 3, 3); ctx.fillRect(x + 3, y - 23, 3, 3);
    ctx.fillRect(x - 4, y - 15, 8, 2);
  } else {
    ctx.fillRect(x - 7, y - 24, 5, 2); ctx.fillRect(x + 2, y - 24, 5, 2);
    ctx.beginPath(); ctx.arc(x, y - 12, 4, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke();
  }

  // 摸鱼道具：发光的手机
  if (slacking) {
    const phoneGlow = 0.5 + 0.3 * Math.sin(time * 5 + worker.x);
    ctx.fillStyle = "#171226";
    ctx.fillRect(x + 10, y - 6, 10, 16);
    ctx.fillStyle = `rgba(140, 220, 255, ${phoneGlow})`;
    ctx.fillRect(x + 11.5, y - 4, 7, 12);
    if (Math.sin(time * 1.4 + worker.y) > 0) {
      ctx.fillStyle = "#9ecbff";
      ctx.font = "bold 12px 'Microsoft YaHei', sans-serif";
      ctx.fillText("摸鱼中", x, y - 44);
    }
  }

  // 状态标签
  ctx.font = "12px 'Microsoft YaHei', sans-serif";
  ctx.fillStyle = "#cfc6e8";
  const stateLabel = worker.state === "working" ? "修锣中" :
    worker.state === "sprint" ? "冲刺中" :
    worker.state === "soaking" ? "泡脚中" :
    worker.state === "teambuild" ? "团建中" :
    worker.state === "quitWalking" ? "去意已决" :
    slacking ? "带薪呼吸" : "";
  ctx.fillText(`${def.name}${stateLabel ? " · " + stateLabel : ""}`, x, worker.y + 42);

  // 士气条
  const moraleRatio = worker.morale / 100;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(x - 16, worker.y + 47, 32, 4);
  ctx.fillStyle = moraleRatio > 0.5 ? "#68e0a0" : moraleRatio > 0.25 ? "#ffd166" : "#ff5d73";
  ctx.fillRect(x - 16, worker.y + 47, 32 * moraleRatio, 4);
  ctx.textAlign = "left";
}

function DrawBossDesk() {
  // 老板专属高台 + 大班桌
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(BOSS_HOME.x, 214, 118, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3b3054";
  ctx.beginPath(); ctx.roundRect(BOSS_HOME.x - 110, 152, 220, 58, 8); ctx.fill();
  ctx.fillStyle = "#493c68";
  ctx.fillRect(BOSS_HOME.x - 110, 152, 220, 8);
  // 大班桌
  ctx.fillStyle = "#5b4630";
  ctx.beginPath(); ctx.roundRect(BOSS_HOME.x - 76, 186, 152, 24, 5); ctx.fill();
  ctx.fillStyle = "#6d543a";
  ctx.fillRect(BOSS_HOME.x - 76, 186, 152, 6);
  // 笔记本 + 金色铭牌
  ctx.fillStyle = "#171226";
  ctx.fillRect(BOSS_HOME.x - 44, 172, 34, 16);
  ctx.fillStyle = "#ffd166";
  ctx.fillRect(BOSS_HOME.x + 22, 190, 44, 12);
  ctx.fillStyle = "#241a05";
  ctx.font = "bold 10px 'Microsoft YaHei', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("老板", BOSS_HOME.x + 44, 200);
  ctx.textAlign = "left";
}

function DrawBossHair(x, headY, hair, time) {
  // 秃头进化四阶段：茂密 → M 型 → 地中海 → 反光灯泡
  ctx.fillStyle = "#241d33";
  if (hair > 70) {
    ctx.beginPath(); ctx.arc(x, headY - 5, 15, Math.PI, 0); ctx.fill();
    ctx.fillRect(x - 15, headY - 5, 4, 8);
    ctx.fillRect(x + 11, headY - 5, 4, 8);
  } else if (hair > 40) {
    ctx.beginPath(); ctx.arc(x, headY - 6, 14, Math.PI * 1.22, Math.PI * 1.78); ctx.lineTo(x, headY - 2); ctx.fill();
    ctx.fillRect(x - 15, headY - 4, 5, 9);
    ctx.fillRect(x + 10, headY - 4, 5, 9);
  } else if (hair > 12) {
    ctx.fillRect(x - 16, headY - 2, 5, 9);
    ctx.fillRect(x + 11, headY - 2, 5, 9);
  } else {
    // 全秃：高光 + 偶尔闪一下的星
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.ellipse(x - 5, headY - 9, 5, 3, -0.5, 0, Math.PI * 2);
    ctx.fill();
    if (Math.sin(time * 3.5) > 0.85) {
      ctx.strokeStyle = "#fff8d8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 9, headY - 14); ctx.lineTo(x + 15, headY - 20);
      ctx.moveTo(x + 15, headY - 14); ctx.lineTo(x + 9, headY - 20);
      ctx.stroke();
    }
  }
}

function DrawBoss(time) {
  DrawBossDesk();
  const boss = state.boss;

  if (boss.phase === "away") {
    // 人不在，桌上立牌
    ctx.fillStyle = "#efe9dc";
    ctx.fillRect(BOSS_HOME.x - 58, 160, 116, 22);
    ctx.strokeStyle = "#4a3f66"; ctx.lineWidth = 2;
    ctx.strokeRect(BOSS_HOME.x - 58, 160, 116, 22);
    ctx.fillStyle = "#5c4a1d";
    ctx.font = "bold 12px 'Microsoft YaHei', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("老板外出创造价值中", BOSS_HOME.x, 175);
    ctx.textAlign = "left";
    return;
  }

  const walking = boss.phase === "out" || boss.phase === "back";
  const bob = walking ? Math.sin(time * 11) * 3.4 : Math.sin(time * 1.6) * 1.2;
  const x = boss.x;
  const y = boss.y + bob;

  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath();
  ctx.ellipse(x, boss.y + 34, 22, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // 西装身体（比牛马大一号）
  ctx.fillStyle = "#23283a";
  ctx.beginPath(); ctx.roundRect(x - 17, y - 12, 34, 44, 8); ctx.fill();
  // 白衬衫 + 红领带
  ctx.fillStyle = "#e8e4f0";
  ctx.beginPath();
  ctx.moveTo(x - 6, y - 12); ctx.lineTo(x + 6, y - 12); ctx.lineTo(x, y + 6); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#c22b3d";
  ctx.fillRect(x - 2, y - 10, 4, 16);

  // 手臂：指挥时伸出白手套，平时抱胸
  const pointing = view.bossPoint && view.bossPoint.t > 0;
  if (pointing) {
    const angle = Math.atan2(view.bossPoint.y - y, view.bossPoint.x - x);
    ctx.strokeStyle = "#23283a";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(x, y - 2);
    ctx.lineTo(x + Math.cos(angle) * 30, y - 2 + Math.sin(angle) * 30);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * 34, y - 2 + Math.sin(angle) * 34, 6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = "#1c2130";
    ctx.beginPath(); ctx.roundRect(x - 15, y - 2, 30, 9, 4); ctx.fill();
  }

  // 头
  const headY = y - 25;
  ctx.fillStyle = "#f2d5b8";
  ctx.beginPath(); ctx.arc(x, headY, 15, 0, Math.PI * 2); ctx.fill();
  DrawBossHair(x, headY, state.hair, time);

  // 脸：永远皱着眉
  ctx.fillStyle = "#241a05";
  ctx.fillRect(x - 9, headY - 4, 6, 2.5);
  ctx.fillRect(x + 3, headY - 4, 6, 2.5);
  ctx.fillRect(x - 7, headY, 4, 3);
  ctx.fillRect(x + 3, headY, 4, 3);
  if (pointing) { ctx.beginPath(); ctx.ellipse(x, headY + 8, 4, 5, 0, 0, Math.PI * 2); ctx.fill(); }
  else ctx.fillRect(x - 4, headY + 7, 8, 2.5);

  ctx.fillStyle = "#ffd166";
  ctx.font = "bold 13px 'Microsoft YaHei', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(walking ? "老板 · 外出中" : "老板（你）", x, boss.y + 52);
  ctx.textAlign = "left";
}

function DrawFloaters(dt) {
  view.floaters = view.floaters.filter((floater) => (floater.life -= dt) > 0);
  view.floaters.forEach((floater) => {
    const alpha = Math.min(1, floater.life / 0.6);
    const rise = (floater.maxLife - floater.life) * 12;
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${floater.size || 15}px 'Microsoft YaHei', sans-serif`;
    ctx.textAlign = "center";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(10,8,16,0.85)";
    ctx.strokeText(floater.text, floater.x, floater.y - rise);
    ctx.fillStyle = floater.color;
    ctx.fillText(floater.text, floater.x, floater.y - rise);
    ctx.globalAlpha = 1;
  });
  ctx.textAlign = "left";
}

function DrawSlashes(dt) {
  view.slashes = view.slashes.filter((slash) => (slash.t -= dt) > 0);
  view.slashes.forEach((slash) => {
    const k = 1 - slash.t / 0.35;
    ctx.strokeStyle = `rgba(255, 255, 255, ${1 - k})`;
    ctx.lineWidth = 6 * (1 - k) + 2;
    ctx.beginPath();
    ctx.moveTo(slash.x - 46 + k * 24, slash.y + 40 - k * 20);
    ctx.lineTo(slash.x + 46 - k * 24, slash.y - 40 + k * 20);
    ctx.stroke();
  });
}

function DrawConfetti(dt) {
  view.confetti = view.confetti.filter((piece) => piece.y < WORLD.height + 30);
  view.confetti.forEach((piece) => {
    piece.x += piece.vx * dt;
    piece.y += piece.vy * dt;
    piece.spin += dt * 6;
    ctx.save();
    ctx.translate(piece.x, piece.y);
    ctx.rotate(piece.spin);
    ctx.fillStyle = piece.color;
    ctx.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size);
    ctx.restore();
  });
}

function DrawDanmaku(dt) {
  view.danmaku = view.danmaku.filter((entry) => entry.x > -900);
  ctx.font = "bold 19px 'Microsoft YaHei', sans-serif";
  view.danmaku.forEach((entry) => {
    entry.x -= entry.speed * dt;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(10,8,16,0.9)";
    ctx.strokeText(entry.text, entry.x, entry.y);
    ctx.fillStyle = entry.color;
    ctx.fillText(entry.text, entry.x, entry.y);
  });
}

function DrawReleaseCard(dt) {
  if (!view.releaseCard) return;
  view.releaseCard.t -= dt;
  if (view.releaseCard.t <= 0) { view.releaseCard = null; return; }
  const card = view.releaseCard;
  const alpha = Math.min(1, card.t / 0.5, (5.2 - card.t) / 0.3);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(16, 13, 24, 0.92)";
  ctx.beginPath(); ctx.roundRect(WORLD.coreX - 280, 188, 560, 196, 14); ctx.fill();
  ctx.strokeStyle = "#7a5cff"; ctx.lineWidth = 3; ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = "#efe9fb";
  ctx.font = "bold 25px 'Microsoft YaHei', sans-serif";
  ctx.fillText(`${card.name} 已发售！`, WORLD.coreX, 230);
  ctx.fillStyle = "#ffd166";
  ctx.font = "29px sans-serif";
  ctx.fillText("★".repeat(card.stars) + "☆".repeat(5 - card.stars), WORLD.coreX, 268);
  ctx.fillStyle = "#b3a7d6";
  ctx.font = "15px 'Microsoft YaHei', sans-serif";
  ctx.fillText(card.review, WORLD.coreX, 296);
  ctx.fillStyle = "#43d9ad";
  ctx.font = "bold 18px 'Microsoft YaHei', sans-serif";
  ctx.fillText(`+${FormatMoney(card.revenue)}${card.bugsShipped ? `（带着 ${card.bugsShipped} 个 BUG 上线）` : ""}`, WORLD.coreX, 326);
  if (card.stack) {
    ctx.fillStyle = "#ffd166";
    ctx.font = "12px 'Microsoft YaHei', sans-serif";
    ctx.fillText(card.stack, WORLD.coreX, 354);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
}

function DrawTutorialMarker(time) {
  const step = CurrentTutorialStep();
  if (!step) return;
  const target = TutorialTarget(step);
  if (!target) return;
  const pulse = 6 + Math.sin(time * 5) * 5;
  ctx.strokeStyle = "#ffd166";
  ctx.lineWidth = 3.5;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.arc(target.x, target.y, 44 + pulse * 0.4, time * 1.5, time * 1.5 + Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  // 下落箭头
  const arrowY = target.y - 74 - pulse;
  ctx.fillStyle = "#ffd166";
  ctx.beginPath();
  ctx.moveTo(target.x, arrowY + 18);
  ctx.lineTo(target.x - 12, arrowY);
  ctx.lineTo(target.x + 12, arrowY);
  ctx.closePath();
  ctx.fill();
}

/* ============================ 主渲染 ============================ */
function Render(time, dt) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(bgCanvas, 0, 0);
  ctx.save();
  if (view.shake > 0) {
    view.shake = Math.max(0, view.shake - dt * 1.8);
    ctx.translate((Math.random() - 0.5) * view.shake * 16, (Math.random() - 0.5) * view.shake * 16);
  }

  DrawClockHands();
  DrawCompanyPlaque();
  DrawCore(time);
  state.tumors.forEach((tumor) => DrawTicket(tumor));
  state.workers.forEach((worker) => DrawWorker(worker, time));
  DrawBoss(time);
  if (view.bossPoint) {
    view.bossPoint.t -= dt;
    if (view.bossPoint.t <= 0) view.bossPoint = null;
  }
  DrawSlashes(dt);
  DrawTutorialMarker(time);
  DrawFloaters(dt);
  DrawConfetti(dt);
  DrawDanmaku(dt);
  DrawReleaseCard(dt);
  ctx.restore();
}

/* ============================ 主循环 ============================ */
let ended = false;
function Frame(now) {
  const dt = Math.min(0.05, (now - view.lastFrame) / 1000);
  view.lastFrame = now;
  const time = now / 1000;

  if (state.status === "playing" || state.status === "setup") {
    Tick(state, dt);
    ConsumeEvents();
    if (now - (view.hudAt || 0) > 80) {
      view.hudAt = now;
      SyncHud();
    }
    ended = false;
  } else if ((state.status === "won" || state.status === "lost") && !ended) {
    ended = true;
    ConsumeEvents();
    ShowEndScreen();
  }

  Render(time, dt);
  requestAnimationFrame(Frame);
}

/* ============================ 适配：缩放 + 高分屏 + 横竖屏 ============================ */
function FitStage() {
  const scale = Math.min(window.innerWidth / WORLD.width, window.innerHeight / WORLD.height, 1.35);
  dom.stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  dom.stage.classList.toggle("compact", scale < 0.72);

  renderK = 1;
  if (dom.gameCanvas.width !== WORLD.width || dom.gameCanvas.height !== WORLD.height) {
    dom.gameCanvas.width = WORLD.width;
    dom.gameCanvas.height = WORLD.height;
  }
  canvasRect = dom.gameCanvas.getBoundingClientRect();
  if (!bgReady) BakeBackground();

  const portrait = window.innerHeight > window.innerWidth && window.innerWidth < 820;
  dom.rotateHint.classList.toggle("hidden", !portrait);
}
window.addEventListener("resize", FitStage);
window.addEventListener("orientationchange", () => setTimeout(FitStage, 250));
FitStage();

requestAnimationFrame(Frame);

// 调试钩子（实拍脚本用）
window.CrunchOverlord = { state, view };
