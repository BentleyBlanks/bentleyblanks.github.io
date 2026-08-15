// 《牛马指挥官》表现层：2D Canvas 渲染 + 鼠标交互 + WebAudio 音效。
// 规则一律走 Script_Rules.mjs，本文件只读 state、只画、只转发命令。

import {
  WORLD,
  MONTH_SECONDS,
  FOOTBATH_COST,
  CreateState,
  StartGame,
  Tick,
  DrainEvents,
  AssignWorker,
  SlashScope,
  PaintPie,
  BossCode,
  Footbath,
  Release,
  GetSpeedMultiplier,
  ActiveWorkers,
  FindWorkerDef,
  WORKER_DEFS,
} from "./Script_Rules.mjs?v=1";

const CORE_RADIUS = 72;
const WORKER_RADIUS = 30;

const state = CreateState((Date.now() % 1000000) >>> 0);

const view = {
  selectedWorkerId: null,
  mouseX: 640,
  mouseY: 360,
  mouseInside: false,
  hover: null, // {type:"worker"|"tumor"|"core", id}
  floaters: [], // {x,y,text,t,life,color,big}
  slashes: [], // {x,y,t}
  confetti: [], // {x,y,vx,vy,color,t}
  shake: 0,
  banner: { text: "", t: 0 },
  releaseCard: null, // {t, name, stars, review, revenue, bugsShipped}
  pieGlow: 0,
};

// ---------- DOM ----------
const dom = {};
["gameCanvas", "hud", "monthValue", "cashValue", "goalFill", "revenueValue", "hairFill", "projectValue",
  "bossBanner", "selectionHint", "toastStack", "commandBar", "pieButton", "bossCodeButton", "footbathButton",
  "releaseButton", "titleScreen", "endScreen", "endTitle", "endReason", "endStats", "startButton", "restartButton",
].forEach((id) => { dom[id] = document.getElementById(id); });
const ctx = dom.gameCanvas.getContext("2d");

// ---------- 音效（WebAudio 现场合成，失败静默降级） ----------
let audioCtx = null;
function EnsureAudio() {
  if (audioCtx) return;
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { audioCtx = null; }
}
function Beep(freq, duration, type = "square", gain = 0.05, slide = 0) {
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const amp = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), audioCtx.currentTime + duration);
    amp.gain.setValueAtTime(gain, audioCtx.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.connect(amp).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration + 0.02);
  } catch { /* 静默 */ }
}
function PlaySfx(id) {
  switch (id) {
    case "order": Beep(620, 0.08, "square", 0.05); Beep(880, 0.1, "square", 0.04); break;
    case "slash": Beep(180, 0.16, "sawtooth", 0.09, -120); break;
    case "pie": Beep(392, 0.12, "triangle", 0.06); Beep(523, 0.14, "triangle", 0.06); Beep(659, 0.22, "triangle", 0.06); break;
    case "bossCode": Beep(140, 0.25, "sawtooth", 0.07, 220); break;
    case "fixed": Beep(740, 0.09, "square", 0.05); Beep(988, 0.12, "square", 0.04); break;
    case "bug": Beep(220, 0.14, "sawtooth", 0.05, -60); break;
    case "scope": Beep(330, 0.14, "triangle", 0.05, 90); break;
    case "cashIn": [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => Beep(f, 0.14, "triangle", 0.06), i * 70)); break;
    case "cashOut": Beep(392, 0.12, "triangle", 0.05, -80); break;
    case "payday": Beep(294, 0.16, "triangle", 0.05, -60); break;
    case "quit": Beep(440, 0.2, "sine", 0.06, -180); Beep(220, 0.4, "sine", 0.05, -100); break;
    case "return": Beep(523, 0.1, "triangle", 0.05); break;
    case "win": [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => Beep(f, 0.2, "triangle", 0.07), i * 110)); break;
    case "lose": [392, 330, 262, 196].forEach((f, i) => setTimeout(() => Beep(f, 0.3, "sine", 0.07), i * 160)); break;
    case "select": Beep(520, 0.05, "square", 0.04); break;
    default: break;
  }
}

// ---------- 工具 ----------
function FormatMoney(value) { return `¥${Math.round(value).toLocaleString("zh-CN")}`; }
function Dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }
function TumorRadius(tumor) { return 20 + 14 * (tumor.hp / tumor.maxHp); }

function AddFloater(x, y, text, color = "#f4f1e6", big = false, life = 3) {
  view.floaters.push({ x, y, text, t: 0, life, color, big });
  if (view.floaters.length > 14) view.floaters.shift();
}

function ShowToast(text, tone = "normal") {
  const node = document.createElement("div");
  node.className = `toast ${tone}`;
  node.textContent = text;
  dom.toastStack.appendChild(node);
  while (dom.toastStack.children.length > 5) dom.toastStack.removeChild(dom.toastStack.firstChild);
  setTimeout(() => { node.classList.add("fade"); }, 3600);
  setTimeout(() => { node.remove(); }, 4400);
}

function ShowBanner(text) {
  view.banner = { text, t: 2.6 };
  dom.bossBanner.textContent = `老板：${text}`;
  dom.bossBanner.classList.remove("hidden");
}

function SpawnConfetti() {
  for (let i = 0; i < 90; i++) {
    view.confetti.push({
      x: WORLD.coreX + (Math.random() - 0.5) * 60,
      y: WORLD.coreY + (Math.random() - 0.5) * 40,
      vx: (Math.random() - 0.5) * 420,
      vy: -Math.random() * 380 - 120,
      color: ["#ffd166", "#ff6eae", "#66b8ff", "#68e0a0", "#ff9f43"][i % 5],
      t: 0,
    });
  }
}

// ---------- 事件消费 ----------
function ConsumeEvents() {
  for (const event of DrainEvents(state)) {
    switch (event.kind) {
      case "boss": ShowBanner(event.text); break;
      case "quote": AddFloater(event.x, event.y, event.text, "#f4f1e6"); break;
      case "toast": ShowToast(event.text, event.tone || "normal"); break;
      case "slash":
        view.slashes.push({ x: event.x, y: event.y, t: 0 });
        view.shake = Math.max(view.shake, 0.4);
        AddFloater(event.x, event.y - 20, "咔嚓！", "#ffd166", true, 1.4);
        break;
      case "fixed":
        AddFloater(event.x, event.y, event.tumorKind === "bug" ? "BUG 已修复" : "需求谈没了（好事）", "#8df0b0", false, 1.8);
        break;
      case "spawn": view.shake = Math.max(view.shake, 0.12); break;
      case "pie": view.pieGlow = 8; break;
      case "bossCode":
        view.shake = Math.max(view.shake, 0.25);
        AddFloater(WORLD.coreX, WORLD.coreY - CORE_RADIUS - 18, "老板代码 +10（勿动）", "#d78bff", true, 2);
        break;
      case "release":
        view.releaseCard = { t: 3.4, ...event };
        SpawnConfetti();
        view.shake = Math.max(view.shake, 0.3);
        break;
      case "sfx": PlaySfx(event.id); break;
      default: break;
    }
  }
}

// ---------- 交互 ----------
function HitTest(x, y) {
  for (const tumor of state.tumors) {
    if (Dist(x, y, tumor.x, tumor.y) <= TumorRadius(tumor) + 6) return { type: "tumor", id: tumor.id };
  }
  for (const worker of state.workers) {
    if (worker.state === "gone" || worker.state === "soaking") continue;
    if (Dist(x, y, worker.x, worker.y) <= WORKER_RADIUS + 6) return { type: "worker", id: worker.id };
  }
  if (Dist(x, y, WORLD.coreX, WORLD.coreY) <= CORE_RADIUS + 10) return { type: "core" };
  return null;
}

function HandleClick() {
  if (state.status !== "playing") return;
  EnsureAudio();
  const hit = HitTest(view.mouseX, view.mouseY);
  const selected = view.selectedWorkerId;

  if (!hit) { view.selectedWorkerId = null; return; }

  if (hit.type === "worker") {
    if (view.selectedWorkerId === hit.id) { view.selectedWorkerId = null; return; }
    const worker = state.workers.find((candidate) => candidate.id === hit.id);
    if (worker.state === "quitWalking") { ShowToast("人家都在走人了，别点了。", "danger"); return; }
    view.selectedWorkerId = hit.id;
    PlaySfx("select");
    AddFloater(worker.x, worker.y - 46, "老板请指示！", "#cfe8ff", false, 1.4);
    return;
  }

  if (hit.type === "tumor") {
    if (selected) {
      const result = AssignWorker(state, selected, hit.id);
      if (!result.ok) ShowToast(result.message, "warning");
      view.selectedWorkerId = null;
    } else {
      const result = SlashScope(state, hit.id);
      if (!result.ok) ShowToast(result.message, "warning");
    }
    return;
  }

  if (hit.type === "core") {
    if (selected) {
      const result = AssignWorker(state, selected, "core");
      if (!result.ok) ShowToast(result.message, "warning");
      view.selectedWorkerId = null;
    } else {
      ShowToast("这是你的游戏，不是你的鼠标垫。想加速就派牛马冲刺，或者亲自写代码。", "normal");
    }
  }
}

dom.gameCanvas.addEventListener("mousemove", (event) => {
  const rect = dom.gameCanvas.getBoundingClientRect();
  view.mouseX = (event.clientX - rect.left) * (WORLD.width / rect.width);
  view.mouseY = (event.clientY - rect.top) * (WORLD.height / rect.height);
  view.mouseInside = true;
});
dom.gameCanvas.addEventListener("mouseleave", () => { view.mouseInside = false; });
dom.gameCanvas.addEventListener("mousedown", (event) => {
  if (event.button === 0) HandleClick();
  else view.selectedWorkerId = null;
});
dom.gameCanvas.addEventListener("contextmenu", (event) => event.preventDefault());
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") view.selectedWorkerId = null;
});

dom.startButton.addEventListener("click", () => {
  EnsureAudio();
  StartGame(state);
  dom.titleScreen.classList.add("hidden");
  dom.endScreen.classList.add("hidden");
  dom.hud.classList.remove("hidden");
  dom.commandBar.classList.remove("hidden");
});
dom.restartButton.addEventListener("click", () => {
  EnsureAudio();
  view.selectedWorkerId = null;
  view.floaters = [];
  view.confetti = [];
  view.releaseCard = null;
  StartGame(state);
  dom.endScreen.classList.add("hidden");
  dom.hud.classList.remove("hidden");
  dom.commandBar.classList.remove("hidden");
});

dom.pieButton.addEventListener("click", () => {
  const result = PaintPie(state);
  if (!result.ok) ShowToast(result.message, "warning");
});
dom.bossCodeButton.addEventListener("click", () => {
  const result = BossCode(state);
  if (!result.ok) ShowToast(result.message, "warning");
});
dom.footbathButton.addEventListener("click", () => {
  if (!view.selectedWorkerId) { ShowToast("先点选一头牛马，再报销足浴。关怀要精准投放。", "warning"); return; }
  const result = Footbath(state, view.selectedWorkerId);
  if (!result.ok) ShowToast(result.message, "warning");
  else view.selectedWorkerId = null;
});
dom.releaseButton.addEventListener("click", () => {
  const result = Release(state);
  if (!result.ok) ShowToast(result.message, "warning");
});

// ---------- 结算画面 ----------
let endShown = false;
function ShowEndScreen() {
  endShown = true;
  dom.commandBar.classList.add("hidden");
  const stats = state.stats;
  if (state.status === "won") {
    dom.endTitle.textContent = "小目标达成！";
    dom.endReason.innerHTML = `累计流水 ${FormatMoney(state.revenue)}。距离 100 亿还剩 99.995%。<br />牛马们围过来问：说好的一人一层楼呢？你指了指工位的隔板。`;
  } else {
    dom.endTitle.textContent = "做游戏真的会死";
    dom.endReason.textContent = state.loseReason;
  }
  const lines = [
    `存活 <b>${stats.monthsSurvived}</b> 个月，发售 <b>${stats.releases}</b> 款游戏，累计流水 <b>${FormatMoney(state.revenue)}</b>`,
    `亲手砍掉需求 <b>${stats.slashes}</b> 个（策划的心碎声按次计费）`,
    `画大饼 <b>${stats.pies}</b> 张，老板亲自写代码 <b>${stats.bossCodes}</b> 次（剩余头发 ${Math.max(0, state.hair)}%）`,
    `牛马修复 BUG <b>${stats.bugsFixed}</b> 个，谈没需求 <b>${stats.scopesNegotiated}</b> 个，足浴报销 <b>${stats.footbaths}</b> 次`,
    `离职 <b>${stats.quits}</b> 人${stats.quits === 0 ? "（零离职！建议申报和谐劳动关系示范单位）" : "（仲裁庭见）"}`,
  ];
  dom.endStats.innerHTML = lines.map((line) => `<li>${line}</li>`).join("");
  dom.endScreen.classList.remove("hidden");
}

// ---------- HUD 同步 ----------
function SyncHud() {
  dom.monthValue.textContent = `M${String(state.month).padStart(2, "0")}`;
  dom.cashValue.textContent = FormatMoney(state.cash);
  dom.cashValue.style.color = state.cash < 20000 ? "#ff5a6a" : "#ffe9a8";
  dom.goalFill.style.width = `${Math.min(100, (state.revenue / state.revenueGoal) * 100)}%`;
  dom.revenueValue.textContent = `${FormatMoney(state.revenue)} / ${FormatMoney(state.revenueGoal)}`;
  dom.hairFill.style.width = `${Math.max(0, state.hair)}%`;
  const project = state.project;
  dom.projectValue.textContent = `${project.name} ${Math.floor(project.progress)}/${project.need} · 效率 ${Math.round(GetSpeedMultiplier(state) * 100)}%`;

  dom.pieButton.disabled = state.pie.cooldown > 0;
  dom.pieButton.textContent = state.pie.cooldown > 0 ? `画大饼（${Math.ceil(state.pie.cooldown)}s）` : "画大饼";
  dom.bossCodeButton.disabled = state.bossCodeCooldown > 0 || state.hair <= 0;
  dom.bossCodeButton.textContent = state.hair <= 0 ? "秃了，写不动了" : state.bossCodeCooldown > 0 ? `老板亲自写代码（${Math.ceil(state.bossCodeCooldown)}s）` : "老板亲自写代码";
  dom.footbathButton.disabled = !view.selectedWorkerId || state.cash < FOOTBATH_COST;
  const ready = project.progress >= project.need;
  dom.releaseButton.disabled = !ready;
  dom.releaseButton.classList.toggle("ready", ready);
  dom.releaseButton.textContent = ready ? "发售！！" : `发售（${Math.floor(project.progress)}/${project.need}）`;

  if (view.selectedWorkerId) {
    const def = FindWorkerDef(view.selectedWorkerId);
    dom.selectionHint.textContent = `已选中：${def.name}（${def.roleLabel}）— 点 BUG/需求瘤派活 · 点中间的游戏冲刺 · 或报销足浴`;
    dom.selectionHint.classList.remove("hidden");
  } else {
    dom.selectionHint.classList.add("hidden");
  }
}

// ---------- 绘制 ----------
function DrawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, WORLD.height);
  gradient.addColorStop(0, "#181c2c");
  gradient.addColorStop(0.42, "#141724");
  gradient.addColorStop(1, "#0e1019");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  ctx.strokeStyle = "rgba(255,255,255,0.028)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= WORLD.width; x += 64) {
    ctx.beginPath(); ctx.moveTo(x, 120); ctx.lineTo(x, WORLD.height); ctx.stroke();
  }
  for (let y = 120; y <= WORLD.height; y += 64) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.width, y); ctx.stroke();
  }

  // 墙上标语
  ctx.fillStyle = "#1d2135";
  ctx.fillRect(430, 84, 420, 40);
  ctx.fillStyle = "#8f8b7f";
  ctx.font = "16px 'Microsoft YaHei'";
  ctx.textAlign = "center";
  ctx.fillText("老板语录：亏钱是暂时的，画饼是永恒的。", 640, 110);

  // 大门（足浴与离职共用）
  ctx.fillStyle = "#232841";
  ctx.fillRect(WORLD.width - 46, 500, 46, 130);
  ctx.fillStyle = "#3a4165";
  ctx.fillRect(WORLD.width - 42, 508, 38, 114);
  ctx.fillStyle = "#9aa3c0";
  ctx.font = "12px 'Microsoft YaHei'";
  ctx.fillText("足浴 / 离职", WORLD.width - 64, 492);
  ctx.fillText("双向大门", WORLD.width - 64, 508);

  // 中央地毯
  ctx.fillStyle = "rgba(70, 60, 110, 0.25)";
  ctx.beginPath();
  ctx.ellipse(WORLD.coreX, WORLD.coreY + 24, 210, 120, 0, 0, Math.PI * 2);
  ctx.fill();
}

function DrawDesk(def, worker) {
  const { x, y } = def.desk;
  ctx.fillStyle = "#2a2438";
  ctx.fillRect(x - 52, y + 16, 104, 14);
  ctx.fillStyle = "#3b3350";
  ctx.fillRect(x - 48, y - 4, 96, 22);
  // 显示器
  ctx.fillStyle = "#12141f";
  ctx.fillRect(x - 20, y - 30, 40, 26);
  const busy = worker && worker.state === "desk";
  ctx.fillStyle = busy ? "rgba(120, 200, 255, 0.85)" : "rgba(90, 100, 140, 0.3)";
  ctx.fillRect(x - 17, y - 27, 34, 20);
  if (worker && worker.state === "soaking") {
    ctx.fillStyle = "#8f8b7f";
    ctx.font = "12px 'Microsoft YaHei'";
    ctx.textAlign = "center";
    ctx.fillText("足浴中…（报销）", x, y + 46);
  }
  if (worker && worker.state === "gone") {
    ctx.fillStyle = "#6b7395";
    ctx.font = "12px 'Microsoft YaHei'";
    ctx.textAlign = "center";
    ctx.fillText("空工位（仲裁中）", x, y + 46);
  }
}

function DrawCore(time) {
  const project = state.project;
  const wobble = Math.sin(time * 2.2) * 4;
  const radius = CORE_RADIUS + wobble;
  const gradient = ctx.createRadialGradient(WORLD.coreX - 18, WORLD.coreY - 22, 12, WORLD.coreX, WORLD.coreY, radius + 8);
  gradient.addColorStop(0, "#7f7bff");
  gradient.addColorStop(0.7, "#4a3f9e");
  gradient.addColorStop(1, "#2d2760");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  for (let i = 0; i <= 32; i++) {
    const angle = (i / 32) * Math.PI * 2;
    const bump = Math.sin(angle * 5 + time * 1.7) * 5;
    const px = WORLD.coreX + Math.cos(angle) * (radius + bump);
    const py = WORLD.coreY + Math.sin(angle) * (radius + bump) * 0.86;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  // 进度环
  const ratio = Math.min(1, project.progress / project.need);
  ctx.lineWidth = 9;
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.arc(WORLD.coreX, WORLD.coreY, radius + 22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = ratio >= 1 ? "#8df0b0" : "#ffd166";
  ctx.beginPath();
  ctx.arc(WORLD.coreX, WORLD.coreY, radius + 22, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#f4f1e6";
  ctx.font = "bold 19px 'Microsoft YaHei'";
  ctx.textAlign = "center";
  ctx.fillText(project.name, WORLD.coreX, WORLD.coreY - radius - 34);
  ctx.font = "bold 24px 'Microsoft YaHei'";
  ctx.fillStyle = ratio >= 1 ? "#8df0b0" : "#ffe9a8";
  ctx.fillText(`${Math.floor(project.progress)}/${project.need}`, WORLD.coreX, WORLD.coreY + 8);

  if (state.pie.timer > 0) {
    ctx.fillStyle = "rgba(255, 209, 102, 0.9)";
    ctx.font = "bold 16px 'Microsoft YaHei'";
    ctx.fillText(`大饼生效中 ×1.7（${Math.ceil(state.pie.timer)}s）`, WORLD.coreX, WORLD.coreY - radius - 58);
  }
}

function DrawTumor(tumor, time) {
  const radius = TumorRadius(tumor);
  const pulse = Math.sin(time * 4 + tumor.x) * 2;
  const isScope = tumor.kind === "scope";
  const bodyColor = tumor.bossMade ? "#b04ad0" : isScope ? "#e8b437" : "#e04a52";
  const darkColor = tumor.bossMade ? "#6d2a85" : isScope ? "#9a731c" : "#8f2730";

  const gradient = ctx.createRadialGradient(tumor.x - 6, tumor.y - 8, 4, tumor.x, tumor.y, radius + pulse);
  gradient.addColorStop(0, bodyColor);
  gradient.addColorStop(1, darkColor);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  for (let i = 0; i <= 20; i++) {
    const angle = (i / 20) * Math.PI * 2;
    const bump = Math.sin(angle * 3 + time * 3) * 3;
    const px = tumor.x + Math.cos(angle) * (radius + pulse + bump);
    const py = tumor.y + Math.sin(angle) * (radius + pulse + bump) * 0.9;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  // 恶意小表情
  ctx.fillStyle = "#1a121a";
  ctx.beginPath(); ctx.arc(tumor.x - 7, tumor.y - 4, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(tumor.x + 7, tumor.y - 4, 3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#1a121a";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(tumor.x, tumor.y + 6, 6, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.font = "bold 12px 'Microsoft YaHei'";
  ctx.textAlign = "center";
  ctx.fillText(tumor.label, tumor.x, tumor.y - radius - 8);

  const hovered = view.hover?.type === "tumor" && view.hover.id === tumor.id;
  if (hovered) {
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.arc(tumor.x, tumor.y, radius + 9, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    if (!view.selectedWorkerId) {
      ctx.fillStyle = isScope ? "#ffd166" : "#ff9aa2";
      ctx.font = "12px 'Microsoft YaHei'";
      ctx.fillText(isScope ? "点击：砍！" : "派牛马来修", tumor.x, tumor.y + radius + 18);
    }
  }
}

function DrawWorker(worker, time) {
  if (worker.state === "gone" || worker.state === "soaking") return;
  const def = FindWorkerDef(worker.id);
  const selected = view.selectedWorkerId === worker.id;
  const moving = worker.state === "moving" || worker.state === "quitWalking";
  const bob = moving ? Math.sin(time * 12 + worker.x) * 3 : Math.sin(time * 2 + worker.x) * 1.2;
  const x = worker.x;
  const y = worker.y + bob;

  // 选中聚光灯
  if (selected) {
    ctx.fillStyle = "rgba(255, 233, 168, 0.12)";
    ctx.beginPath();
    ctx.moveTo(x - 34, y - 120);
    ctx.lineTo(x + 34, y - 120);
    ctx.lineTo(x + 52, y + 26);
    ctx.lineTo(x - 52, y + 26);
    ctx.closePath();
    ctx.fill();
  }

  // 影子
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.ellipse(x, worker.y + 26, 20, 6, 0, 0, Math.PI * 2); ctx.fill();

  // 身体
  ctx.fillStyle = def.color;
  ctx.beginPath();
  ctx.roundRect(x - 13, y - 8, 26, 32, 8);
  ctx.fill();
  // 头
  ctx.fillStyle = "#f6d7b0";
  ctx.beginPath(); ctx.arc(x, y - 20, 12, 0, Math.PI * 2); ctx.fill();
  // 表情按士气
  ctx.fillStyle = "#221a14";
  if (worker.morale > 55) {
    ctx.beginPath(); ctx.arc(x - 4, y - 22, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 4, y - 22, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#221a14"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y - 18, 4, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();
  } else if (worker.morale > 25) {
    ctx.fillRect(x - 6, y - 23, 4, 2);
    ctx.fillRect(x + 2, y - 23, 4, 2);
    ctx.fillRect(x - 4, y - 15, 8, 2);
  } else {
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("×  ×", x, y - 20);
    ctx.strokeStyle = "#221a14"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y - 12, 4, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  }

  // 工作特效
  if (worker.state === "working") {
    ctx.fillStyle = "rgba(160, 220, 255, 0.9)";
    ctx.font = "bold 13px 'Microsoft YaHei'";
    ctx.textAlign = "center";
    ctx.fillText(["苦干", "硬修", "狂敲"][Math.floor(time * 3) % 3], x, y - 44);
    for (let i = 0; i < 2; i++) {
      const sweatY = y - 30 + ((time * 60 + i * 18) % 24);
      ctx.fillStyle = "rgba(140, 200, 255, 0.7)";
      ctx.beginPath(); ctx.arc(x + 15, sweatY, 2.2, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (worker.state === "sprint") {
    ctx.strokeStyle = "rgba(255, 209, 102, 0.75)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const off = 18 + i * 7 + (time * 90 % 7);
      ctx.beginPath(); ctx.moveTo(x - off, y - 4); ctx.lineTo(x - off + 5, y - 4); ctx.stroke();
    }
    ctx.fillStyle = "#ffd166";
    ctx.font = "bold 13px 'Microsoft YaHei'";
    ctx.textAlign = "center";
    ctx.fillText("冲刺中！", x, y - 44);
  }

  // 名牌与士气条
  ctx.fillStyle = selected ? "#ffe9a8" : "#cfccc0";
  ctx.font = `${selected ? "bold " : ""}13px 'Microsoft YaHei'`;
  ctx.textAlign = "center";
  ctx.fillText(`${def.name} · ${def.roleLabel}`, x, worker.y + 44);
  const moraleWidth = 40;
  ctx.fillStyle = "#262a3a";
  ctx.fillRect(x - moraleWidth / 2, worker.y + 50, moraleWidth, 5);
  ctx.fillStyle = worker.morale > 55 ? "#68e0a0" : worker.morale > 25 ? "#f7c948" : "#ff5a6a";
  ctx.fillRect(x - moraleWidth / 2, worker.y + 50, moraleWidth * (worker.morale / 100), 5);

  if (selected) {
    ctx.strokeStyle = "#ffe9a8";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.arc(x, y - 2, WORKER_RADIUS + 4, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  } else if (view.hover?.type === "worker" && view.hover.id === worker.id) {
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y - 2, WORKER_RADIUS + 2, 0, Math.PI * 2); ctx.stroke();
  }
}

function DrawFloaters(dt) {
  for (const floater of view.floaters) {
    floater.t += dt;
    const k = floater.t / floater.life;
    if (k >= 1) continue;
    const y = floater.y - floater.t * 18;
    const alpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
    ctx.globalAlpha = alpha;
    ctx.font = `${floater.big ? "bold 24px" : "13px"} 'Microsoft YaHei'`;
    ctx.textAlign = "center";
    if (!floater.big) {
      const width = ctx.measureText(floater.text).width + 18;
      ctx.fillStyle = "rgba(16, 18, 30, 0.88)";
      ctx.beginPath();
      ctx.roundRect(floater.x - width / 2, y - 15, width, 22, 10);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.fillStyle = floater.color;
    ctx.fillText(floater.text, floater.x, y + (floater.big ? 0 : 1));
    ctx.globalAlpha = 1;
  }
  view.floaters = view.floaters.filter((floater) => floater.t < floater.life);
}

function DrawSlashes(dt) {
  for (const slash of view.slashes) {
    slash.t += dt;
    const k = slash.t / 0.4;
    if (k >= 1) continue;
    ctx.strokeStyle = `rgba(255, 255, 255, ${1 - k})`;
    ctx.lineWidth = 5 * (1 - k) + 1;
    const reach = 34 + k * 26;
    ctx.beginPath(); ctx.moveTo(slash.x - reach, slash.y - reach); ctx.lineTo(slash.x + reach, slash.y + reach); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(slash.x + reach, slash.y - reach); ctx.lineTo(slash.x - reach, slash.y + reach); ctx.stroke();
  }
  view.slashes = view.slashes.filter((slash) => slash.t < 0.4);
}

function DrawConfetti(dt) {
  for (const piece of view.confetti) {
    piece.t += dt;
    piece.x += piece.vx * dt;
    piece.y += piece.vy * dt;
    piece.vy += 620 * dt;
    ctx.fillStyle = piece.color;
    ctx.fillRect(piece.x, piece.y, 5, 8);
  }
  view.confetti = view.confetti.filter((piece) => piece.t < 2.4 && piece.y < WORLD.height + 20);
}

function DrawReleaseCard(dt) {
  const card = view.releaseCard;
  if (!card) return;
  card.t -= dt;
  if (card.t <= 0) { view.releaseCard = null; return; }
  const alpha = Math.min(1, card.t / 0.4, (3.4 - card.t) / 0.25);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(10, 12, 22, 0.9)";
  ctx.beginPath(); ctx.roundRect(WORLD.coreX - 260, 210, 520, 216, 14); ctx.fill();
  ctx.strokeStyle = "#ffd166";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = "#f4f1e6";
  ctx.font = "bold 24px 'Microsoft YaHei'";
  ctx.fillText(`${card.name} 发售！`, WORLD.coreX, 258);
  ctx.fillStyle = "#ffd166";
  ctx.font = "30px 'Microsoft YaHei'";
  ctx.fillText("★".repeat(card.stars) + "☆".repeat(5 - card.stars), WORLD.coreX, 300);
  ctx.fillStyle = "#cfccc0";
  ctx.font = "16px 'Microsoft YaHei'";
  ctx.fillText(card.review, WORLD.coreX, 336);
  ctx.fillStyle = "#8df0b0";
  ctx.font = "bold 22px 'Microsoft YaHei'";
  ctx.fillText(`+${FormatMoney(card.revenue)}`, WORLD.coreX, 374);
  if (card.bugsShipped > 0) {
    ctx.fillStyle = "#ff9aa2";
    ctx.font = "13px 'Microsoft YaHei'";
    ctx.fillText(`（随包附赠 BUG ×${card.bugsShipped}，玩家已在做鬼畜）`, WORLD.coreX, 402);
  }
  ctx.globalAlpha = 1;
}

function DrawCursor() {
  if (!view.mouseInside) return;
  const x = view.mouseX;
  const y = view.mouseY;
  // 老板的白手套指针
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.35);
  ctx.fillStyle = "#f6f3ea";
  ctx.strokeStyle = "#20242f";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-6, 0, 12, 26, 6); // 手掌
  ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(-3.5, -16, 7, 20, 3.5); // 食指
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#c8442e";
  ctx.fillRect(-8, 22, 16, 7); // 袖扣
  ctx.restore();

  if (view.selectedWorkerId) {
    const worker = state.workers.find((candidate) => candidate.id === view.selectedWorkerId);
    if (worker && worker.state !== "gone") {
      ctx.strokeStyle = "rgba(255, 233, 168, 0.5)";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 7]);
      ctx.beginPath();
      ctx.moveTo(worker.x, worker.y);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

function Render(dt, time) {
  ctx.save();
  if (view.shake > 0) {
    view.shake = Math.max(0, view.shake - dt * 1.6);
    ctx.translate((Math.random() - 0.5) * view.shake * 16, (Math.random() - 0.5) * view.shake * 16);
  }

  DrawBackground();
  WORKER_DEFS.forEach((def) => DrawDesk(def, state.workers.find((worker) => worker.id === def.id)));
  DrawCore(time);
  state.tumors.forEach((tumor) => DrawTumor(tumor, time));
  const sorted = [...state.workers].sort((a, b) => a.y - b.y);
  sorted.forEach((worker) => DrawWorker(worker, time));
  DrawSlashes(dt);
  DrawConfetti(dt);
  DrawFloaters(dt);
  DrawReleaseCard(dt);

  // 暗角
  const vignette = ctx.createRadialGradient(WORLD.coreX, 360, 320, WORLD.coreX, 360, 780);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.42)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  DrawCursor();
  ctx.restore();
}

// ---------- 主循环 ----------
let lastTime = performance.now();
function Frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if (state.status === "playing") {
    Tick(state, dt);
    view.hover = HitTest(view.mouseX, view.mouseY);
    if (view.selectedWorkerId) {
      const worker = state.workers.find((candidate) => candidate.id === view.selectedWorkerId);
      if (!worker || worker.state === "gone" || worker.state === "soaking") view.selectedWorkerId = null;
    }
  }
  ConsumeEvents();
  if (state.status === "playing") SyncHud();

  if (view.banner.t > 0) {
    view.banner.t -= dt;
    if (view.banner.t <= 0) dom.bossBanner.classList.add("hidden");
  }

  Render(dt, now / 1000);

  if ((state.status === "won" || state.status === "lost") && !endShown) ShowEndScreen();
  if (state.status === "playing") endShown = false;

  requestAnimationFrame(Frame);
}

// ---------- 自适应缩放 ----------
function FitStage() {
  const stage = document.getElementById("stage");
  const scale = Math.min(window.innerWidth / WORLD.width, window.innerHeight / WORLD.height, 1.25);
  stage.style.transform = `translateY(-50%) scale(${scale})`;
}
window.addEventListener("resize", FitStage);
FitStage();

requestAnimationFrame(Frame);
