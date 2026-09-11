// Script_Ui.js —— 《采耳物语 · EarSpa3D》HUD / 工具架 / 移动端界面
//
// 契约见 Data_Contract.md §5.8：导出 CreateUi({ palette, tools, on })，返回一整套
// props / toast / cmd 三层 API。这里的原则：
//
//   1. 模块顶层零副作用：不碰 document / window / navigator，样式表注入也放在
//      CreateUi 内部（由 StyleUrl 决定地址）。这样 Node 侧 import 本文件也不会炸。
//   2. 颜色一律从传入的 palette 取（PALETTE + SEMANTIC + SHAPE），铺成 CSS 变量后
//      CSS 只写 var(--ear-xxx)；本文件里除「Canvas 需要一个具体色值」外不出现十六进制。
//   3. Update(dt) 是每帧函数，必须便宜：先比较再写 DOM，进度一律用 transform，
//      进深尺只在数值真的动了才重绘。
//   4. dispose() 要真的解绑、真的移除。

import { CSS_VARS, SHAPE } from "./Data_Palette.mjs?v=ear005-20260911";

const STYLE_ID = "ear-spa-ui-style";

// ── CSS 变量：把 palette 的 CSS_VARS 和 SHAPE 一起铺到 :root ──────────────────
// Data_Palette 只导出了颜色的 CSS_VARS，圆角/阴影在 SHAPE 里；契约冻结了那份数据
// 文件，所以在这里做一次安全的转换（键名 -> --ear-radius-md 这种形式）。
function ShapeVars(shape) {
  const out = {};
  for (const [key, value] of Object.entries(shape || {})) {
    out["--ear-" + key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())] = value;
  }
  return out;
}

export function CssVars(palette) {
  return { ...CSS_VARS, ...ShapeVars(SHAPE), ...ShapeVars(palette?.shape) };
}

function StyleUrl() {
  // index.html 与本文件同目录，所以相对 .js 自己的地址找 .css 最稳。
  try {
    return new URL("./Style_EarSpa.css", import.meta.url).href;
  } catch {
    return "./EarSpa3D/Style_EarSpa.css";
  }
}

const injectedDocs = new WeakSet();

function InjectStyle(doc) {
  if (injectedDocs.has(doc)) return;
  injectedDocs.add(doc);
  if (doc.getElementById(STYLE_ID)) return;
  const link = doc.createElement("link");
  link.id = STYLE_ID;
  link.rel = "stylesheet";
  link.href = StyleUrl();
  doc.head?.appendChild(link);
}

// ── 工具元信息：契约没规定 UI 文案，这里按 category / mechanic 给默认值 ────────
const CATEGORY_CN = {
  pick: "探取",
  clean: "清理",
  stimulate: "刺激",
  inspect: "观察",
  care: "护理",
};

const MECHANIC_HINT = {
  scoop: "沿着管壁慢慢刮",
  rake: "轻轻耙过，别蹭到皮肤",
  sweep: "贴着管壁扫一圈",
  pinch: "对准了再合拢，别急",
  wipe: "由里向外轻轻擦",
  vibrate: "靠上去，让它自己振",
  spray: "对着干结喷两下再等",
  irrigate: "温水慢慢冲，顺着流",
  vacuum: "吸头别贴住管壁",
  light: "先看清楚再动手",
};

export function ToolHint(tool) {
  if (!tool) return "";
  if (tool.hint) return tool.hint;
  const zone = Array.isArray(tool.idealDepthRange) && tool.idealDepthRange.length === 2
    ? `（${Number(tool.idealDepthRange[0]).toFixed(0)}–${Number(tool.idealDepthRange[1]).toFixed(0)}mm）`
    : "";
  return (MECHANIC_HINT[tool.mechanic] || "慢慢来，舒服最重要") + zone;
}

export function IsToolLocked(tool) {
  if (!tool) return true;
  if (typeof tool.locked === "boolean") return tool.locked;
  if (typeof tool.unlocked === "boolean") return !tool.unlocked;
  return false;
}

export function ToolLabel(tool) {
  return tool?.cnName || tool?.name || tool?.id || "工具";
}

export function ToolCategoryLabel(tool) {
  return CATEGORY_CN[tool?.category] || tool?.category || "";
}

// ── 耳道分区：契约 §2 的唯一真相（0 口 → 28 鼓膜）──────────────────────────
export const CANAL_LENGTH_MM = 28;
export const CANAL_ZONES = [
  { id: "cartilage", label: "软骨部", from: 0, to: 9, tone: "mint" },
  { id: "bony", label: "骨部", from: 9, to: 21, tone: "honey" },
  { id: "danger", label: "危险区", from: 21, to: 25, tone: "peach" },
  { id: "drum", label: "鼓膜", from: 25, to: 28, tone: "drum" },
];

export function ZoneAt(depthMm) {
  const d = Number(depthMm);
  if (!Number.isFinite(d)) return CANAL_ZONES[0];
  for (const z of CANAL_ZONES) if (d < z.to) return z;
  return CANAL_ZONES[CANAL_ZONES.length - 1];
}

// ── 内联 SVG 图标（离线可用，颜色全部走 currentColor）──────────────────────
const S = (body, extra = "") =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ` +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

export const ICONS = {
  // 耳勺 / 采耳针：细杆 + 小圆勺
  scoop: S(
    '<path d="M4.4 19.2 14.6 8.6"/><circle cx="16.4" cy="6.4" r="3.4"/>' +
      '<path d="M16.4 5.2v2.4"/>'
  ),
  // 鹅毛棒：羽轴 + 羽枝
  feather: S(
    '<path d="M20 4.2c-6.6.4-10.6 3.4-12.4 7.6-1 2.4-1.4 4.6-1.5 6.6"/>' +
      '<path d="M15.6 8.6 11.4 9.4M13.8 11.2l-3.2.8M17.6 6.4l-3.4.8"/>' +
      '<circle cx="5.6" cy="19.6" r="1.2"/>'
  ),
  // 马尾刷：一束细丝 + 柄
  horsehair: S(
    '<path d="M3.4 20.4 9 14.8"/><path d="M9.4 14.4l3-3"/>' +
      '<path d="M13.4 10.6l3.6-3.6M15.6 11.6l3.2-3.2M15 8.2l2-2M17.8 13.6l2-2"/>'
  ),
  // 音叉：U 形 + 柄
  fork: S(
    '<path d="M8.6 3.6v5.6a3.4 3.4 0 0 0 6.8 0V3.6"/>' +
      '<path d="M12 12.6v3.4"/><path d="M9.8 19.8h4.4"/>'
  ),
  // 镊子：两片 + 尖端
  tweezers: S(
    '<path d="M9 3.4 4.6 20.2"/><path d="M15 3.4 19.4 20.2"/>' +
      '<path d="M9 3.4h6"/><path d="M5.6 15.8h1.2M17.2 15.8h1.2"/>'
  ),
  // 棉签：细杆 + 两端棉头
  swab: S(
    '<path d="M12 4.6v14.8"/><ellipse cx="12" cy="4" rx="2.3" ry="2.9"/>' +
      '<ellipse cx="12" cy="20" rx="2.3" ry="2.9"/>'
  ),
  // 洗耳球：球囊 + 细嘴
  syringe: S(
    '<circle cx="9.6" cy="14.4" r="5.6"/><path d="M13.8 10.4 20.6 3.6"/>' +
      '<path d="M18 3.2l2.8 2.8"/>'
  ),
  // 吸引器：机身 + 软管 + 吸头
  vacuum: S(
    '<rect x="2.8" y="9.6" width="8.4" height="6.8" rx="3.2"/>' +
      '<path d="M11.6 13h3.2a3 3 0 0 1 3 3v1.6"/><path d="M17.8 20.4v-1.8"/>' +
      '<circle cx="17.8" cy="20.8" r="1.1"/>'
  ),
  // 耳镜：机身 + 喇叭口 + 观察孔
  otoscope: S(
    '<rect x="8.6" y="2.8" width="6.8" height="8.4" rx="2.4"/>' +
      '<path d="M8.6 11.8 5.2 19.8h13.6l-3.4-8"/>' +
      '<circle cx="12" cy="7" r="1.5"/>'
  ),
  // 滴耳液：瓶身 + 一滴
  dropper: S(
    '<rect x="8.2" y="2.8" width="7.6" height="9" rx="3"/>' +
      '<path d="M12 12.4v3.2"/>' +
      '<path d="M12 16.6c1.6 1.6 2.4 2.5 2.4 3.4a2.4 2.4 0 0 1-4.8 0c0-.9.8-1.8 2.4-3.4z"/>'
  ),
  // 清洁刷：柄 + 刷头
  brush: S(
    '<path d="M12 10.4v10"/><path d="M8.2 3.4v4a3.8 3.8 0 0 0 7.6 0v-4"/>' +
      '<path d="M10 3.4v2.6M14 3.4v2.6"/>'
  ),
  lock: S('<rect x="5.4" y="10.6" width="13.2" height="9.2" rx="3"/><path d="M8.4 10.6V8.2a3.6 3.6 0 0 1 7.2 0v2.4"/>', 'stroke-width="1.8"'),
  gear: S(
    '<circle cx="12" cy="12" r="3.1"/>' +
      '<path d="M12 3.6v2.2M12 18.2v2.2M4.8 12H7M17 12h2.2M6.9 6.9l1.6 1.6M15.5 15.5l1.6 1.6M17.1 6.9l-1.6 1.6M8.5 15.5l-1.6 1.6"/>'
  ),
  sound: S(
    '<path d="M4.4 9.6h3.2L12 5.6v12.8L7.6 14.4H4.4z"/>' +
      '<path d="M15.4 9.2a3.6 3.6 0 0 1 0 5.6M17.8 6.8a6.8 6.8 0 0 1 0 10.4"/>'
  ),
  mute: S(
    '<path d="M4.4 9.6h3.2L12 5.6v12.8L7.6 14.4H4.4z"/>' +
      '<path d="M16 10l4 4M20 10l-4 4"/>'
  ),
  close: S('<path d="M6.4 6.4l11.2 11.2M17.6 6.4 6.4 17.6"/>', 'stroke-width="2.1"'),
  check: S('<path d="M4.8 12.6l4.6 4.4L19.2 7.4"/>', 'stroke-width="2.2"'),
  warn: S('<path d="M12 4.6v9.2"/><circle cx="12" cy="18.4" r="1.2" fill="currentColor" stroke="none"/>'),
  info: S('<path d="M12 10v8"/><circle cx="12" cy="6" r="1.2" fill="currentColor" stroke="none"/>'),
  sparkle: S(
    '<path d="M12 3.4l1.9 5.1 5.1 1.9-5.1 1.9L12 17.4l-1.9-5.1L5 10.4l5.1-1.9z"/>' +
      '<path d="M18.6 16.4l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z"/>'
  ),
  heart: S('<path d="M12 20.2s-7.4-4.5-7.4-9.4A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 7.4 2.8c0 4.9-7.4 9.4-7.4 9.4z"/>', 'fill="currentColor" stroke="none"'),
  drum: S('<path d="M5.6 14.6a9.2 9.2 0 0 1 12.8 0"/><circle cx="12" cy="8.6" r="1.8" fill="currentColor" stroke="none"/>'),
  arrowLeft: S('<path d="M14.6 6.4 9 12l5.6 5.6"/>'),
  arrowRight: S('<path d="M9.4 6.4 15 12l-5.6 5.6"/>'),
  swipe: S('<path d="M4 12h16"/><path d="M7.6 8.4 4 12l3.6 3.6"/><path d="M16.4 8.4 20 12l-3.6 3.6"/>'),
  // 表情（角色状态提示用）
  faceRelaxed: S('<circle cx="12" cy="12" r="8.6"/><path d="M8.8 14.4a4.2 4.2 0 0 0 6.4 0"/><circle cx="9.4" cy="9.8" r="1.1" fill="currentColor" stroke="none"/><circle cx="14.6" cy="9.8" r="1.1" fill="currentColor" stroke="none"/>'),
  faceTicklish: S('<circle cx="12" cy="12" r="8.6"/><path d="M8.6 15.2c1.2-1.2 2.2 1 3.4 0s2.2 1 3.4 0"/><path d="M8.4 9.2 10.6 10M15.6 9.2 13.4 10"/>'),
  faceHappy: S('<circle cx="12" cy="12" r="8.6"/><path d="M8 13.4a5 5 0 0 0 8 0"/><path d="M8.2 9.2a1.8 1.8 0 0 1 2.6 0M13.2 9.2a1.8 1.8 0 0 1 2.6 0"/>'),
  faceShiver: S('<circle cx="12" cy="12" r="8.6"/><path d="M8.6 14.6q1.7 1.6 3.4 0t3.4 0"/><path d="M9 8.6v2.6M12 8v3.2M15 8.6v2.6"/>'),
  faceSurprise: S('<circle cx="12" cy="12" r="8.6"/><ellipse cx="12" cy="15" rx="1.9" ry="2.4"/><circle cx="9.4" cy="9.4" r="1.2" fill="currentColor" stroke="none"/><circle cx="14.6" cy="9.4" r="1.2" fill="currentColor" stroke="none"/>'),
  faceSleepy: S('<circle cx="12" cy="12" r="8.6"/><path d="M8.6 10.4q1.4-1.2 2.8 0M12.6 10.4q1.4-1.2 2.8 0"/><path d="M9.4 14.8h5.2"/>'),
  faceOuch: S('<circle cx="12" cy="12" r="8.6"/><path d="M9.2 16.2q2.8-2.4 5.6 0"/><path d="M8.4 8.6l2.4 1.6M15.6 8.6l-2.4 1.6"/>'),
};

const EXPRESSION_CN = {
  relaxed: "放松",
  ticklish: "有点痒",
  happy: "舒服",
  shiver: "酥麻",
  surprise: "惊讶",
  sleepy: "快睡着了",
  ouch: "轻一点",
};

// 耵聍类型：图标 + 中文名（契约 WAX_TYPES = dry | wet | impacted | debris）
const WAX_META = {
  dry: { cn: "干性碎屑", icon: "brush" },
  wet: { cn: "油性耵聍", icon: "dropper" },
  impacted: { cn: "硬结耵聍", icon: "sparkle" },
  debris: { cn: "细碎屑", icon: "feather" },
};

// 工具动作按钮：契约的 on.action(name) 只认名字，这里按 mechanic 给可用动作
const TOOL_ACTIONS = {
  toggleFine: { icon: "feather", label: "精修" },
  shop: { icon: "scoop", label: "小铺" },
  finish: { icon: "check", label: "收工" },
};

const BGM_OPTIONS = [
  { id: "rainNight", label: "雨夜" },
  { id: "teaRoom", label: "茶室" },
  { id: "morning", label: "清晨" },
  { id: "sleepy", label: "睡前" },
];

const QUALITY_OPTIONS = [
  { id: "low", label: "流畅" },
  { id: "mid", label: "均衡" },
  { id: "high", label: "精细" },
];

// ── 小工具 ────────────────────────────────────────────────────────────────
const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const fmt1 = (v) => (Math.round(num(v) * 10) / 10).toFixed(1);
const pct = (v) => Math.round(clamp01(v) * 100);

function El(doc, tag, cls, html) {
  const node = doc.createElement(tag);
  if (cls) node.className = cls;
  if (html != null) node.innerHTML = html;
  return node;
}

function IconEl(doc, name, cls) {
  const span = El(doc, "span", cls);
  span.innerHTML = ICONS[name] || ICONS.scoop;
  return span;
}

// ══════════════════════════════════════════════════════════════════════════
export function CreateUi({ palette, tools, on, mount, showLoading = true } = {}) {
  // 契约要求 palette/tools 缺失也不能抛
  const doc = (mount && mount.ownerDocument) || (typeof document !== "undefined" ? document : null);
  if (!doc) throw new Error("CreateUi 需要一个 DOM 环境（浏览器）");
  InjectStyle(doc);

  const pal = palette || {};
  const vars = CssVars(pal);
  for (const [key, value] of Object.entries(vars)) {
    if (typeof value === "string" && value) doc.documentElement.style.setProperty(key, value);
  }
  // Canvas 里画尺子需要具体色值，从调色板取（不写死十六进制）
  const C = {
    mint: pal.mint || "#DFF3EC",
    mintDeep: pal.mintDeep || "#9FDCC6",
    mintAccent: pal.mintAccent || "#6FD6B6",
    honey: pal.honey || "#F5C26B",
    honeyDeep: pal.honeyDeep || "#E0A24A",
    peach: pal.peach || "#FFE7DC",
    peachDeep: pal.peachDeep || "#FFC9B4",
    peachAccent: pal.peachAccent || "#FFA9A0",
    blush: pal.blush || "#FF9FAE",
    drumMembrane: pal.drumMembrane || "#F3E2DC",
    ink: pal.ink || "#4A4038",
    inkSoft: pal.inkSoft || "#8A7C6E",
    inkFaint: pal.inkFaint || "#C4B6A6",
    white: pal.white || "#FFFFFF",
    cream: pal.cream || "#FFF8F2",
  };

  const emit = (name, ...args) => {
    const fn = on && on[name];
    if (typeof fn !== "function") return;
    try {
      fn(...args);
    } catch (err) {
      // UI 不该因为业务回调出错就整个卡死
      console.warn(`[EarSpa3D UI] on.${name} 抛错：`, err);
    }
  };

  // ── 内部状态：所有写入都先跟这里比，避免每帧碰 DOM ──────────────────────
  const state = {
    clean01: 0,
    comfort01: 0,
    relax01: 0,
    depthTarget: 0,
    zoneId: "cartilage",
    pressure01: 0,
    speed: 0,
    toolId: null,
    expression: null,
    bgm: "rainNight",
    quality: "mid",
    volume: { master: 0.8, bgm: 0.5, sfx: 0.8 },
    muted: false,
    fps: 0,
    toolList: Array.isArray(tools) ? tools.slice() : [],
    disposed: false,
  };

  // 缓存上一次写进 DOM 的内容，供 SetText / SetHtml 比较（每帧写 innerText 会掉帧）
  const lastText = new Map();
  function SetText(node, key, text) {
    if (!node) return;
    if (lastText.get(key) === text) return;
    lastText.set(key, text);
    node.textContent = text;
  }
  function SetHtml(node, key, html) {
    if (!node) return;
    if (lastText.get(key) === html) return;
    lastText.set(key, html);
    node.innerHTML = html;
  }

  // 提示浮层的定时器、载入遮罩的定时器（先声明，API 里才能安全引用）
  const toastTimers = new Map();
  let loadingTimer = null;

  // ══════════════════════════ DOM 构建 ══════════════════════════════════════
  const root = El(doc, "div");
  root.id = "ear-root";

  const overlay = El(doc, "div", "ear-overlay");
  root.appendChild(overlay);

  // ── 顶部 HUD ──
  const hud = El(doc, "header", "ear-hud");
  hud.id = "ear-hud";

  const titleBox = El(doc, "div", "ear-hud__title ear-glass");
  const toolIconBox = El(doc, "span", "ear-hud__tool-icon");
  const texts = El(doc, "div", "ear-hud__texts");
  const toolNameEl = El(doc, "div", "ear-hud__tool-name", "选一件工具");
  const hintEl = El(doc, "div", "ear-hud__hint", "轻一点，慢慢来");
  texts.append(toolNameEl, hintEl);
  titleBox.append(toolIconBox, texts);

  const spacer = El(doc, "div", "ear-hud__spacer");
  const hudRight = El(doc, "div", "ear-hud__right");

  const fpsChip = El(doc, "div", "ear-chip ear-glass ear-chip--fps", `${ICONS.sparkle}<span class="ear-sr">帧率</span>`);
  fpsChip.setAttribute("aria-label", "帧率提示");
  fpsChip.style.display = "none"; // setFpsHint(0) 之前不占位
  const fpsText = El(doc, "span", null, "-- fps");
  fpsChip.appendChild(fpsText);

  const gearBtn = El(doc, "button", "ear-btn ear-btn--icon ear-glass", ICONS.gear);
  gearBtn.type = "button";
  gearBtn.setAttribute("aria-label", "设置");
  gearBtn.setAttribute("aria-haspopup", "dialog");
  gearBtn.dataset.panel = "settings";

  hudRight.append(fpsChip, gearBtn);
  hud.append(titleBox, spacer, hudRight);

  // ── 表情提示 ──
  const exprEl = El(doc, "div", "ear-expression ear-glass");
  const exprFace = El(doc, "span", "ear-expression__face", ICONS.faceRelaxed);
  const exprText = El(doc, "span", "ear-expression__text", "");
  exprEl.append(exprFace, exprText);
  exprEl.setAttribute("aria-live", "polite");

  // ── 仪表区 ──
  const meters = El(doc, "section", "ear-meters");
  meters.id = "ear-meters";

  // 进深尺
  const ruler = El(doc, "div", "ear-ruler ear-glass");
  const rulerHead = El(doc, "div", "ear-ruler__head");
  const rulerLabel = El(doc, "div", "ear-ruler__label", "进深");
  const rulerReadout = El(doc, "div", "ear-ruler__readout");
  const rulerValue = El(doc, "span", "ear-ruler__value", "0.0");
  const rulerUnit = El(doc, "span", "ear-ruler__unit", "mm");
  rulerReadout.append(rulerValue, rulerUnit);
  rulerHead.append(rulerLabel, rulerReadout);
  const rulerBody = El(doc, "div", "ear-ruler__body");
  const rulerCanvas = El(doc, "canvas", "ear-ruler__scale");
  rulerCanvas.setAttribute("role", "img");
  rulerCanvas.setAttribute("aria-label", "耳道进深尺：软骨部、骨部、危险区、鼓膜");
  rulerBody.appendChild(rulerCanvas);
  const zoneLabels = new Map();
  for (const z of CANAL_ZONES) {
    const node = El(doc, "div", `ear-ruler__zone ear-ruler__zone--${z.id}`, z.label);
    node.dataset.zone = z.id;
    rulerBody.appendChild(node);
    zoneLabels.set(z.id, node);
  }
  // mm 刻度数字单独一列（放 DOM 比画在 canvas 里清楚，也不会被分区名压住）
  const rulerNums = [];
  for (const mm of [5, 10, 15, 20, 25]) {
    const n = El(doc, "span", "ear-ruler__num", String(mm));
    rulerBody.appendChild(n);
    rulerNums.push({ node: n, frac: 1 - mm / CANAL_LENGTH_MM });
  }
  // 两端各标一下：上=禁触（鼓膜段），下=耳道口；往尺子内侧收一点，免得被裁掉
  for (const [frac, text, cls] of [[0.045, "禁触", "top"], [0.955, "耳道口", "bottom"]]) {
    const n = El(doc, "span", `ear-ruler__num ear-ruler__num--end ear-ruler__num--${cls}`, text);
    rulerBody.appendChild(n);
    rulerNums.push({ node: n, frac });
  }
  ruler.append(rulerHead, rulerBody);

  // 清洁度
  const meterColumn = El(doc, "div", "ear-meter-column");
  const cleanMeter = El(doc, "div", "ear-meter ear-meter--clean ear-glass");
  const cleanRow = El(doc, "div", "ear-meter__row");
  const cleanLabel = El(doc, "span", "ear-meter__label", "清洁度");
  const cleanValue = El(doc, "span", "ear-meter__value", "0<small>%</small>");
  cleanRow.append(cleanLabel, cleanValue);
  const cleanCapsule = El(doc, "div", "ear-capsule");
  const cleanFill = El(doc, "div", "ear-capsule__fill");
  cleanCapsule.appendChild(cleanFill);
  cleanMeter.append(cleanRow, cleanCapsule);

  // 舒适 / 酥麻
  const comfortMeter = El(doc, "div", "ear-meter ear-meter--comfort ear-glass");
  const comfortRow = El(doc, "div", "ear-meter__row");
  const comfortLabel = El(doc, "span", "ear-meter__label", "舒适 · 酥麻");
  const comfortValue = El(doc, "span", "ear-meter__value", "0<small>%</small>");
  comfortRow.append(comfortLabel, comfortValue);
  const comfortBody = El(doc, "div", "ear-meter__body");
  comfortBody.style.cssText = "display:flex;align-items:center;gap:12px";

  const ring = El(doc, "div", "ear-ring");
  const ringR = 40;
  const ringLen = 2 * Math.PI * ringR;
  ring.innerHTML =
    `<svg class="ear-ring__svg" viewBox="0 0 96 96" aria-hidden="true">` +
    `<defs><linearGradient id="ear-comfort-grad" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0%" stop-color="${C.peachDeep}"/>` +
    `<stop offset="60%" stop-color="${C.blush}"/>` +
    `<stop offset="100%" stop-color="${C.peachAccent}"/>` +
    `</linearGradient></defs>` +
    `<circle class="ear-ring__track" cx="48" cy="48" r="${ringR}"/>` +
    `<circle class="ear-ring__arc" cx="48" cy="48" r="${ringR}" ` +
    `stroke-dasharray="${ringLen.toFixed(2)}" stroke-dashoffset="${ringLen.toFixed(2)}"/>` +
    `</svg>` +
    `<span class="ear-ring__heart">${ICONS.heart}</span>` +
    `<span class="ear-ring__value">0%</span>`;
  const ringArc = ring.querySelector(".ear-ring__arc");
  const ringValue = ring.querySelector(".ear-ring__value");
  ring.setAttribute("role", "img");
  ring.setAttribute("aria-label", "舒适酥麻度");

  const comfortSliders = El(doc, "div", "ear-gauges");
  const relaxGauge = El(doc, "div", "ear-gauge");
  const relaxRow = El(doc, "div", "ear-gauge__row");
  const relaxLabel = El(doc, "span", "ear-gauge__label", "放松值");
  const relaxValue = El(doc, "span", "ear-gauge__value", "0%");
  relaxRow.append(relaxLabel, relaxValue);
  const relaxCapsule = El(doc, "div", "ear-capsule ear-capsule--thin ear-capsule--comfort");
  const relaxFill = El(doc, "div", "ear-capsule__fill");
  relaxCapsule.appendChild(relaxFill);
  relaxGauge.append(relaxRow, relaxCapsule);

  const pressGauge = El(doc, "div", "ear-gauge");
  const pressRow = El(doc, "div", "ear-gauge__row");
  const pressLabel = El(doc, "span", "ear-gauge__label", "力度");
  const pressValue = El(doc, "span", "ear-gauge__value", "0%");
  pressRow.append(pressLabel, pressValue);
  const pressCapsule = El(doc, "div", "ear-capsule ear-capsule--thin");
  const pressFill = El(doc, "div", "ear-capsule__fill");
  pressCapsule.appendChild(pressFill);
  pressGauge.append(pressRow, pressCapsule);

  const speedGauge = El(doc, "div", "ear-gauge");
  const speedRow = El(doc, "div", "ear-gauge__row");
  const speedLabel = El(doc, "span", "ear-gauge__label", "速度");
  const speedValue = El(doc, "span", "ear-gauge__value", "0.0<small> mm/s</small>");
  speedRow.append(speedLabel, speedValue);
  speedGauge.appendChild(speedRow);

  comfortSliders.append(relaxGauge, pressGauge, speedGauge);
  comfortBody.append(ring, comfortSliders);
  comfortMeter.append(comfortRow, comfortBody);
  meterColumn.append(cleanMeter, comfortMeter);
  meters.append(ruler, meterColumn);

  // ── 工具架 ──
  const rack = El(doc, "section", "ear-toolrack ear-glass");
  rack.id = "ear-toolRack";
  const rackHead = El(doc, "div", "ear-toolrack__head");
  const rackTitle = El(doc, "span", null, "工具架");
  const rackCount = El(doc, "b", null, "0");
  const rackHint = El(doc, "span", "ear-toolrack__scrollhint", `${ICONS.swipe}<span>左右滑动</span>`);
  rackHead.append(
    rackTitle,
    rackCount,
    El(doc, "span", null, "件"),
    El(doc, "div", "ear-hud__spacer"),
    rackHint
  );
  const strip = El(doc, "div", "ear-toolrack__strip");
  strip.setAttribute("role", "listbox");
  strip.setAttribute("aria-label", "采耳工具");
  strip.tabIndex = 0;
  rack.append(rackHead, strip);

  // ── 动作按钮 ──
  const actions = El(doc, "div", "ear-actions");
  for (const [name, meta] of Object.entries(TOOL_ACTIONS)) {
    const btn = El(doc, "button", "ear-btn ear-btn--icon ear-glass ear-actions__btn", ICONS[meta.icon]);
    btn.type = "button";
    btn.dataset.action = name;
    btn.setAttribute("aria-label", meta.label);
    btn.title = meta.label;
    btn.appendChild(El(doc, "span", null, meta.label));
    actions.appendChild(btn);
  }

  const workBtn = El(doc, "button", "ear-btn ear-work ear-glass", "按住清理");
  workBtn.type = "button";
  workBtn.setAttribute("aria-label", "按住清理");
  actions.prepend(workBtn);
  const WorkStart = ev => {
    ev.preventDefault();
    workBtn.setPointerCapture?.(ev.pointerId);
    workBtn.classList.add("is-held");
    emit("action", "workStart");
  };
  const WorkEnd = () => {
    workBtn.classList.remove("is-held");
    emit("action", "workEnd");
  };
  workBtn.addEventListener("pointerdown", WorkStart);
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) workBtn.addEventListener(name, WorkEnd);
  const cameras = El(doc, "nav", "ear-cameras ear-glass");
  cameras.setAttribute("aria-label", "视角");
  for (const [id, label] of [["canal", "内窥"], ["macro", "微距"], ["shop", "店内"]]) {
    const btn = El(doc, "button", "ear-btn", label);
    btn.type = "button";
    btn.dataset.camera = id;
    btn.setAttribute("aria-pressed", String(id === "canal"));
    btn.addEventListener("click", () => emit("camera", id));
    cameras.appendChild(btn);
  }
  root.appendChild(cameras);
  const contactMarker = El(doc, "div", "ear-contact");
  const contactLabel = El(doc, "span", "ear-contact__label");
  contactMarker.appendChild(contactLabel);
  contactMarker.hidden = true;
  root.appendChild(contactMarker);

  // ── 提示浮层 ──
  const toastHost = El(doc, "div", "ear-toast-host");
  toastHost.id = "ear-toast";
  toastHost.setAttribute("aria-live", "polite");

  // ── 载入遮罩 ──
  const loading = El(doc, "div", "ear-loading");
  loading.id = "ear-loading";
  loading.innerHTML =
    `<div class="ear-loading__inner"><div class="ear-loading__blob"></div>` +
    `<div class="ear-loading__text">正在准备采耳工具…</div>` +
    `<div class="ear-loading__sub">深呼吸，马上就好</div></div>`;
  if (!showLoading) loading.classList.add("is-gone");

  overlay.append(hud, exprEl, meters, rack);
  root.append(actions, toastHost, loading);
  (mount || doc.body).appendChild(root);

  // ══════════════════════════ 工具架渲染 ═══════════════════════════════════
  const toolCards = new Map(); // id -> { el, iconEl, nameEl, tool }

  function BuildToolCard(tool, index) {
    const locked = IsToolLocked(tool);
    const card = El(doc, "button", "ear-toolcard");
    card.type = "button";
    card.dataset.toolId = String(tool?.id ?? index);
    card.setAttribute("role", "option");
    card.setAttribute("aria-selected", "false");
    card.setAttribute(
      "aria-label",
      `${ToolLabel(tool)}${locked ? "，未解锁" : ""}，${ToolCategoryLabel(tool) || "工具"}`
    );
    card.setAttribute("aria-disabled", locked ? "true" : "false");
    if (locked) card.classList.add("is-locked");

    const icon = IconEl(doc, tool?.icon || "scoop", "ear-toolcard__icon");
    // 工具材质决定图标颜色（竹/木、不锈钢、羽毛、棉、玻璃），一眼能分辨
    const mat = tool?.material;
    const matClass = mat === "bamboo" || mat === "wood" ? "mat-wood"
      : mat === "steel" ? "mat-steel"
        : mat === "feather" || mat === "featherWhite" ? "mat-feather"
          : mat === "cotton" ? "mat-cotton"
            : mat === "glass" ? "mat-glass"
              : mat === "horsehair" ? "mat-hair"
                : "";
    if (matClass) icon.classList.add(matClass);
    const name = El(doc, "span", "ear-toolcard__name", ToolLabel(tool));
    const cat = El(doc, "span", "ear-toolcard__cat", ToolCategoryLabel(tool));
    card.append(icon, name, cat);

    if (locked) {
      const lock = IconEl(doc, "lock", "ear-toolcard__lock");
      card.appendChild(lock);
      // unlockAt 只用来做「还需要练习」的说明，不拦玩家上手
      if (tool?.unlockAt) card.title = `熟练度 ${tool.unlockAt} 后更顺手`;
    }
    if (tool?.realWorldNote) card.title = tool.realWorldNote;

    card.addEventListener("click", () => {
      emit("toolSelect", tool?.id);
    });
    return { el: card, iconEl: icon, nameEl: name, catEl: cat, tool, locked };
  }

  function RenderTools(list) {
    strip.textContent = "";
    toolCards.clear();
    (list || []).forEach((tool, i) => {
      const entry = BuildToolCard(tool, i);
      toolCards.set(String(tool?.id ?? i), entry);
      strip.appendChild(entry.el);
    });
    SetText(rackCount, "rackCount", String((list || []).length));
  }

  RenderTools(state.toolList);

  // ══════════════════════════ 进深尺 Canvas ════════════════════════════════
  const ctx = rulerCanvas.getContext("2d");
  let rulerW = 0;
  let rulerH = 0;
  let dpr = 1;
  let cursorY = 0; // 平滑跟随的游标（0 = 鼓膜，1 = 耳道口）
  let cursorInit = false;
  let dangerOn = false;

  const DepthToFrac = (mm) => 1 - Math.min(1, Math.max(0, num(mm) / CANAL_LENGTH_MM));

  function ResizeRuler() {
    if (!ctx) return;
    const rect = rulerBody.getBoundingClientRect();
    dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    rulerW = Math.max(1, Math.round(rect.width));
    rulerH = Math.max(1, Math.round(rect.height));
    // 画布尺寸必须是整数 CSS 像素 × dpr，否则会比盒子宽一点点（每帧带着布局抖）
    rulerCanvas.width = Math.round(rulerW * dpr);
    rulerCanvas.height = Math.round(rulerH * dpr);
    rulerCanvas.style.width = `${rulerW}px`;
    rulerCanvas.style.height = `${rulerH}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    DrawRuler();
    LayoutZoneLabels();
  }

  function LayoutZoneLabels() {
    // 把四个分区名摆在各自色段中间（纯 CSS 定位，跟着尺寸走）
    for (const z of CANAL_ZONES) {
      const node = zoneLabels.get(z.id);
      if (!node) continue;
      const mid = (z.from + z.to) / 2;
      node.style.top = `${(DepthToFrac(mid) * 100).toFixed(2)}%`;
    }
    // mm 刻度数字落在对应的刻度线上
    for (const item of rulerNums) {
      item.node.style.top = `${(item.frac * 100).toFixed(2)}%`;
    }
    // 尺子矮的时候，顶上/底下那个分区名会撞到标题，就把它收起来
    // 软骨部中心在 4.5mm，占整尺 16%，420px 的尺子才留得住这一行字
    rulerBody.dataset.hideTop = rulerH < 420 ? "1" : "0";
    rulerBody.dataset.hideBottom = rulerH < 190 ? "1" : "0";
    HideClippedLabels();
  }

  // 兜底：任何一行字只要超出尺子上下边界（不同字号 / 中文字体差异都会导致），
  // 就把它藏起来——宁可少一行标注，也不要出现被切成半截的字。
  function HideClippedLabels() {
    const box = rulerBody.getBoundingClientRect();
    for (const item of rulerNums) {
      const el = item.node;
      if (el.style.visibility === "hidden") el.style.visibility = "";
      const r = el.getBoundingClientRect();
      if (r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5) el.style.visibility = "hidden";
    }
    for (const [, el] of zoneLabels) {
      if (el.offsetParent === null && el.style.display === "none") continue;
      const r = el.getBoundingClientRect();
      if (r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5) el.style.visibility = "hidden";
      else el.style.visibility = "";
    }
  }

  // 分区名同时显示在进深标题上：低头看尺子时不用来回找
  function SyncRulerLabel() {
    const zone = CANAL_ZONES.find((z) => z.id === state.zoneId) || CANAL_ZONES[0];
    SetText(rulerLabel, "rulerZone", zone.id === "cartilage" ? "进深" : zone.label);
  }

  function DrawRuler() {
    if (!ctx || rulerW <= 1) return;
    // 色带摆在尺子左三分之一，左边留给分区名、右边留给 mm 刻度数字
    const barX = Math.round(rulerW * 0.30);
    const barW = Math.max(16, Math.round(rulerW * 0.24));
    const barR = barW / 2;
    // 分区名 / 刻度数字的定位都用同一个比例，交给 CSS 变量
    rulerBody.style.setProperty("--ear-bar-x", `${((barX / rulerW) * 100).toFixed(2)}%`);
    rulerBody.style.setProperty("--ear-bar-w", `${barW}px`);
    ctx.clearRect(0, 0, rulerW, rulerH);

    // 轨道底：奶白胶囊
    ctx.fillStyle = C.cream;
    ctx.globalAlpha = 0.9;
    RoundRect(barX, 0, barW, rulerH, barR);
    ctx.fill();
    ctx.globalAlpha = 1;

    // 四个真实分区：颜色从薄荷 → 蜜糖 → 蜜桃 → 珍珠灰粉
    for (const z of CANAL_ZONES) {
      const yTop = DepthToFrac(z.to) * rulerH;
      const yBottom = DepthToFrac(z.from) * rulerH;
      ctx.fillStyle =
        z.id === "cartilage" ? C.mintDeep
          : z.id === "bony" ? C.honey
            : z.id === "danger" ? C.peachDeep
              : C.drumMembrane;
      ctx.fillRect(barX, yTop, barW, Math.max(1, yBottom - yTop));
    }

    // 危险区再叠一层斜纹，远看就知道「这一段要小心」
    const dz = CANAL_ZONES.find((z) => z.id === "danger");
    if (dz) {
      const yTop = DepthToFrac(dz.to) * rulerH;
      const yBottom = DepthToFrac(dz.from) * rulerH;
      ctx.save();
      ctx.beginPath();
      ctx.rect(barX, yTop, barW, Math.max(1, yBottom - yTop));
      ctx.clip();
      ctx.strokeStyle = C.white;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      for (let x = -rulerH; x < barW + rulerH; x += 7) {
        ctx.beginPath();
        ctx.moveTo(barX + x, yBottom);
        ctx.lineTo(barX + x + (yBottom - yTop), yTop);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // 圆角遮罩：用 destination-in 把色带两端裁圆
    ctx.save();
    ctx.globalCompositeOperation = "destination-in";
    ctx.beginPath();
    RoundRect(barX, 0, barW, rulerH, barR);
    ctx.fill();
    ctx.restore();

    // 刻度：0.5mm 短 / 1mm 中 / 5mm 长，全部是色带上的白色短线
    // （数字交给 DOM 那一列，canvas 里不画字，省得和分区名打架）
    for (let mm = 0; mm <= CANAL_LENGTH_MM; mm += 0.5) {
      const y = DepthToFrac(mm) * rulerH;
      const major = Math.abs(mm % 5) < 0.01;
      const mid = Math.abs(mm % 1) < 0.01;
      const len = major ? barW * 0.92 : mid ? barW * 0.5 : barW * 0.26;
      ctx.strokeStyle = C.white;
      ctx.globalAlpha = major ? 0.95 : mid ? 0.7 : 0.45;
      ctx.lineWidth = major ? 1.6 : 1;
      // 5mm 长刻度从两边往里画，中间留一条缝，像真尺子
      ctx.beginPath();
      if (major) {
        ctx.moveTo(barX + 1, y);
        ctx.lineTo(barX + 1 + len / 2 - 2, y);
        ctx.moveTo(barX + barW - 1 - len / 2 + 2, y);
        ctx.lineTo(barX + barW - 1, y);
      } else {
        ctx.moveTo(barX + 1, y);
        ctx.lineTo(barX + 1 + len, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 鼓膜一端的小图标：一个可爱的「小鼓面」
    const drumY = 13;
    ctx.fillStyle = C.white;
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(barX + barW / 2, drumY, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = C.inkSoft;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(barX + barW / 2, drumY + 1.6, 3.8, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
    ctx.fillStyle = C.inkSoft;
    ctx.beginPath();
    ctx.arc(barX + barW / 2, drumY - 1.6, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  function RoundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.arcTo(x + w, y, x + w, y + rr, rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
    ctx.lineTo(x + rr, y + h);
    ctx.arcTo(x, y + h, x, y + h - rr, rr);
    ctx.lineTo(x, y + rr);
    ctx.arcTo(x, y, x + rr, y, rr);
    ctx.closePath();
  }

  function DrawCursor() {
    if (!ctx || rulerW <= 1) return;
    const y = cursorY * rulerH;
    const barX = Math.round(rulerW * 0.30);
    const barW = Math.max(16, Math.round(rulerW * 0.24));
    // 游标：一枚亮色小指针，带柔光（危险区换成蜜桃色）
    ctx.save();
    ctx.shadowColor = dangerOn ? C.peachAccent : C.inkFaint;
    ctx.shadowBlur = 8;
    ctx.fillStyle = dangerOn ? C.peachAccent : C.white;
    RoundRect(barX - 5, y - 3, barW + 10, 6, 3);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = dangerOn ? C.peachAccent : C.mintAccent;
    ctx.beginPath();
    ctx.arc(barX - 12, y, 3.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // 尺子只在「数值确实变了」时整幅重绘，游标跟随则单独轻量重绘
  let rulerDirty = true;

  // ══════════════════════════ 面板（设置 / 结算）═══════════════════════════
  const panels = new Map(); // id -> { scrim, panel, close }

  function MakePanel(id, { className = "", label = "" } = {}) {
    const scrim = El(doc, "div", "ear-panel-scrim");
    scrim.dataset.panel = id;
    scrim.setAttribute("role", "dialog");
    scrim.setAttribute("aria-modal", "true");
    scrim.setAttribute("aria-label", label || id);
    scrim.setAttribute("aria-hidden", "true");

    const panel = El(doc, `div`, `ear-panel ear-glass ${className}`.trim());
    panel.id = `ear-panel-${id}`;
    const head = El(doc, "div", "ear-panel__head");
    const title = El(doc, "div", "ear-panel__title", label);
    const closeBtn = El(doc, "button", "ear-btn ear-btn--icon ear-btn--ghost", ICONS.close);
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "关闭");
    const body = El(doc, "div", "ear-panel__body");
    head.append(title, closeBtn);
    panel.append(head, body);
    scrim.appendChild(panel);
    root.appendChild(scrim);

    const entry = { id, scrim, panel, body, title, head, closeBtn, open: false, extraDisposers: [] };
    closeBtn.addEventListener("click", () => Cmd.closePanel(id));
    scrim.addEventListener("click", (ev) => {
      if (ev.target === scrim) Cmd.closePanel(id);
    });
    panels.set(id, entry);
    return entry;
  }

  function OpenPanel(id) {
    const entry = panels.get(id);
    if (!entry) return false;
    if (entry.open) return true;
    entry.open = true;
    entry.scrim.classList.add("is-open");
    entry.scrim.setAttribute("aria-hidden", "false");
    entry.panel.tabIndex = -1;
    openStack.push(id);
    // 打开时把焦点交给关闭按钮：键盘用户不至于迷路
    try {
      entry.closeBtn.focus({ preventScroll: true });
    } catch {
      /* 老浏览器忽略 */
    }
    return true;
  }

  function ClosePanel(id) {
    const entry = panels.get(id);
    if (!entry || !entry.open) return false;
    entry.open = false;
    entry.scrim.classList.remove("is-open");
    entry.scrim.setAttribute("aria-hidden", "true");
    const at = openStack.indexOf(id);
    if (at >= 0) openStack.splice(at, 1);
    return true;
  }

  const openStack = [];

  // ── 设置面板内容 ──
  const settings = MakePanel("settings", { label: "设置" });
  const settingsSub = El(doc, "div", "ear-panel__sub", "怎么舒服怎么来");
  settings.head.insertBefore(settingsSub, settings.closeBtn);

  const bgmField = El(doc, "div", "ear-field");
  bgmField.appendChild(El(doc, "div", "ear-field__label", "背景音"));
  const bgmOptions = El(doc, "div", "ear-field__options");
  const bgmBtns = new Map();
  for (const opt of BGM_OPTIONS) {
    const b = El(doc, "button", "ear-opt", opt.label);
    b.type = "button";
    b.dataset.bgm = opt.id;
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => Cmd.setBgm(opt.id));
    bgmBtns.set(opt.id, b);
    bgmOptions.appendChild(b);
  }
  bgmField.appendChild(bgmOptions);

  const qualityField = El(doc, "div", "ear-field");
  qualityField.appendChild(El(doc, "div", "ear-field__label", "画质"));
  const qualityOptions = El(doc, "div", "ear-field__options");
  const qualityBtns = new Map();
  for (const opt of QUALITY_OPTIONS) {
    const b = El(doc, "button", "ear-opt", opt.label);
    b.type = "button";
    b.dataset.quality = opt.id;
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => {
      state.quality = opt.id;
      SyncSettings();
      emit("settings", { quality: opt.id });
    });
    qualityBtns.set(opt.id, b);
    qualityOptions.appendChild(b);
  }
  qualityField.appendChild(qualityOptions);

  const volumeField = El(doc, "div", "ear-field");
  const volLabel = El(doc, "div", "ear-field__label", "音量");
  const volRow = El(doc, "div", "ear-slider");
  const volInput = El(doc, "input");
  volInput.type = "range";
  volInput.min = "0";
  volInput.max = "100";
  volInput.step = "1";
  volInput.value = String(pct(state.volume.master));
  volInput.id = "ear-volume-master";
  volInput.setAttribute("aria-label", "总音量");
  const volValue = El(doc, "span", "ear-slider__value", `${pct(state.volume.master)}%`);
  volInput.addEventListener("input", () => {
    const v = num(volInput.value, 0) / 100;
    state.volume.master = v;
    SetText(volValue, "volValue", `${pct(v)}%`);
    emit("settings", { volume: { master: v } });
  });
  volRow.append(volInput, volValue);
  volumeField.append(volLabel, volRow);

  const sfxField = El(doc, "div", "ear-field");
  const sfxLabel = El(doc, "div", "ear-field__label", "音效");
  const sfxRow = El(doc, "div", "ear-slider");
  const sfxInput = El(doc, "input");
  sfxInput.type = "range";
  sfxInput.min = "0";
  sfxInput.max = "100";
  sfxInput.step = "1";
  sfxInput.value = String(pct(state.volume.sfx));
  sfxInput.id = "ear-volume-sfx";
  sfxInput.setAttribute("aria-label", "音效音量");
  const sfxValue = El(doc, "span", "ear-slider__value", `${pct(state.volume.sfx)}%`);
  sfxInput.addEventListener("input", () => {
    const v = num(sfxInput.value, 0) / 100;
    state.volume.sfx = v;
    SetText(sfxValue, "sfxValue", `${pct(v)}%`);
    emit("settings", { volume: { sfx: v } });
  });
  sfxRow.append(sfxInput, sfxValue);
  sfxField.append(sfxLabel, sfxRow);

  const muteField = El(doc, "div", "ear-field");
  muteField.appendChild(El(doc, "div", "ear-field__label", "声音开关"));
  const muteRow = El(doc, "div", "ear-field__options");
  const soundOnBtn = El(doc, "button", "ear-opt", "有声");
  const soundOffBtn = El(doc, "button", "ear-opt ear-opt--peach", "静音");
  for (const b of [soundOnBtn, soundOffBtn]) {
    b.type = "button";
    b.setAttribute("aria-pressed", "false");
    muteRow.appendChild(b);
  }
  soundOnBtn.addEventListener("click", () => {
    state.muted = false;
    SyncSettings();
    emit("settings", { muted: false });
  });
  soundOffBtn.addEventListener("click", () => {
    state.muted = true;
    SyncSettings();
    emit("settings", { muted: true });
  });
  muteField.appendChild(muteRow);

  settings.body.append(bgmField, qualityField, volumeField, sfxField, muteField);

  function SyncSettings() {
    for (const [id, b] of bgmBtns) b.setAttribute("aria-pressed", id === state.bgm ? "true" : "false");
    for (const [id, b] of qualityBtns) {
      b.setAttribute("aria-pressed", id === state.quality ? "true" : "false");
    }
    soundOnBtn.setAttribute("aria-pressed", state.muted ? "false" : "true");
    soundOffBtn.setAttribute("aria-pressed", state.muted ? "true" : "false");
    if (doc.activeElement !== volInput) volInput.value = String(pct(state.volume.master));
    if (doc.activeElement !== sfxInput) sfxInput.value = String(pct(state.volume.sfx));
    SetText(volValue, "volValue", `${pct(state.volume.master)}%`);
    SetText(sfxValue, "sfxValue", `${pct(state.volume.sfx)}%`);
  }
  SyncSettings();

  // ── 结算收藏册 ──
  const harvest = MakePanel("harvest", { label: "本次收获", className: "ear-harvest" });
  const harvestNote = El(doc, "div", "ear-panel__sub", "收藏册");
  harvest.head.insertBefore(harvestNote, harvest.closeBtn);

  // ══════════════════════════ 外向 API ═════════════════════════════════════
  const api = {
    // ── props ──
    setCleanliness01(v) {
      const next = clamp01(v);
      if (Math.abs(next - state.clean01) < 0.0005) return;
      state.clean01 = next;
      cleanFill.style.transform = `scaleX(${next.toFixed(4)})`;
      SetHtml(cleanValue, "cleanValue", `${pct(next)}<small>%</small>`);
    },

    setComfort01(v) {
      const next = clamp01(v);
      if (Math.abs(next - state.comfort01) < 0.002) return;
      state.comfort01 = next;
      const off = ringLen * (1 - next);
      ringArc.setAttribute("stroke-dashoffset", off.toFixed(2));
      SetText(ringValue, "ringValue", `${pct(next)}%`);
      ring.classList.toggle("is-high", next > 0.66);
      SetHtml(comfortValue, "comfortValue", `${pct(next)}<small>%</small>`);
    },

    setRelax01(v) {
      const next = clamp01(v);
      if (Math.abs(next - state.relax01) < 0.002) return;
      state.relax01 = next;
      relaxFill.style.transform = `scaleX(${next.toFixed(4)})`;
      SetText(relaxValue, "relaxValue", `${pct(next)}%`);
    },

    /** @param {number} mm @param {string|null} zoneId 契约：第二参可省，自己按 mm 推 */
    setDepth(mm, zoneId) {
      const next = Math.min(CANAL_LENGTH_MM + 3, Math.max(-1, num(mm)));
      const zone = zoneId ? CANAL_ZONES.find((z) => z.id === zoneId) || ZoneAt(next) : ZoneAt(next);
      if (Math.abs(next - state.depthTarget) < 0.0005 && zone.id === state.zoneId) return;
      state.depthTarget = next;
      if (zone.id !== state.zoneId) {
        state.zoneId = zone.id;
        rulerDirty = true;
        SyncRulerLabel();
      }
      SetText(rulerValue, "rulerValue", fmt1(next));
      const danger = zone.id === "danger" || zone.id === "drum";
      if (danger !== dangerOn) {
        dangerOn = danger;
        ruler.classList.toggle("is-danger", danger);
        rulerDirty = true;
      }
    },

    setPressure01(v) {
      const next = clamp01(v);
      if (Math.abs(next - state.pressure01) < 0.005) return;
      state.pressure01 = next;
      pressFill.style.transform = `scaleX(${next.toFixed(4)})`;
      const loud = next > 0.8;
      pressFill.style.filter = loud ? "hue-rotate(-14deg) saturate(1.1)" : "";
      SetText(pressValue, "pressValue", `${pct(next)}%`);
    },

    setSpeed(mmPerS) {
      const next = Math.max(0, num(mmPerS));
      if (Math.abs(next - state.speed) < 0.05) return;
      state.speed = next;
      SetHtml(speedValue, "speedValue", `${next.toFixed(1)}<small> mm/s</small>`);
    },

    setToolActive(id) {
      if (id === state.toolId) return;
      state.toolId = id;
      const list = state.toolList;
      const tool = list.find((t) => String(t?.id) === String(id)) || null;
      for (const [key, card] of toolCards) {
        const active = card.el.dataset.toolId === String(id);
        card.el.classList.toggle("is-active", active);
        card.el.setAttribute("aria-selected", active ? "true" : "false");
        if (active) {
          // 重播一次果冻回弹：先摘掉类再下一帧加回来
          card.el.classList.remove("is-active");
          void card.el.offsetWidth;
          card.el.classList.add("is-active");
          // 卡片划进可视区，别让选中的工具躲在屏幕外
          const strip_ = card.el.parentElement;
          if (strip_ && active) {
            const left = card.el.offsetLeft - 12;
            strip_.scrollTo?.({ left, behavior: "smooth" });
          }
        }
      }
      if (tool) {
        toolIconBox.innerHTML = ICONS[tool.icon] || ICONS.scoop;
        SetText(toolNameEl, "toolName", ToolLabel(tool));
        SetText(hintEl, "toolHint", ToolHint(tool));
      } else {
        toolIconBox.innerHTML = ICONS.scoop;
        SetText(toolNameEl, "toolName", "选一件工具");
        SetText(hintEl, "toolHint", "轻一点，慢慢来");
      }
    },

    hasOpenPanel() { return openStack.length > 0; },
    setToolLocked(id, locked) {
      const entry = toolCards.get(id);
      if (!entry) return;
      entry.tool.locked = locked;
      entry.el.classList.toggle("is-locked", locked);
      entry.el.setAttribute("aria-disabled", String(locked));
      entry.el.setAttribute("aria-label", `${ToolLabel(entry.tool)}${locked ? "，未解锁" : ""}`);
      if (!locked) entry.el.querySelector(".ear-toolcard__lock")?.remove();
    },
    setContactPoint({ x, y, visible, hit, working, blocked }) {
      contactMarker.hidden = !visible;
      contactMarker.style.left = `${x * 100}%`;
      contactMarker.style.top = `${y * 100}%`;
      contactMarker.classList.toggle("is-hit", !!hit);
      contactMarker.classList.toggle("is-working", !!working);
      contactLabel.textContent = blocked ? "先用滴耳液软化" : hit ? (working ? "正在处理" : "已对准") : "工作端";
    },
    setActionHint(label, note) {
      workBtn.textContent = `按住${label}`;
      workBtn.title = note;
    },
    setCameraMode(mode) {
      for (const btn of cameras.children) btn.setAttribute("aria-pressed", String(btn.dataset.camera === mode));
    },
    setFineMode(fine) {
      actions.querySelector('[data-action="toggleFine"]').setAttribute("aria-pressed", String(fine));
    },

    /** 温和提示：tone = "info" | "good" | "warn" */
    tip(text, { tone = "info", ms = 2200 } = {}) {
      if (!text) return;
      const t = tone === "good" || tone === "warn" ? tone : "info";
      const node = El(doc, "div", `ear-toast ear-toast--${t} ear-glass`);
      const icon = t === "good" ? "check" : t === "warn" ? "warn" : "info";
      node.append(IconEl(doc, icon, "ear-toast__icon"), El(doc, "span", null, String(text)));
      node.style.willChange = "transform, opacity";
      toastHost.appendChild(node);
      // 只做 transform/opacity 的出入场
      requestAnimationFrameSafe(() => node.classList.add("is-in"));
      const life = Math.max(600, num(ms, 2200));
      const timer = setTimeout(() => {
        node.classList.remove("is-in");
        const kill = setTimeout(() => node.remove(), 380);
        toastTimers.set(node, kill);
      }, life);
      toastTimers.set(node, timer);
      // 最多同时挂 3 条，多的先请走
      while (toastHost.children.length > 3) {
        const old = toastHost.firstElementChild;
        clearTimeout(toastTimers.get(old));
        toastTimers.delete(old);
        old.remove();
      }
    },

    /** 结算收藏册：契约入参 [{ type, size, depth, at }] */
    showHarvest(list) {
      const items = Array.isArray(list) ? list.slice() : [];
      harvest.body.textContent = "";
      const totalSize = items.reduce((sum, it) => sum + num(it?.size, 0), 0);
      const summary = El(doc, "div", "ear-harvest__summary");
      summary.innerHTML =
        `<div class="ear-harvest__summary-num">${items.length}</div>` +
        `<div><div class="ear-harvest__summary-text">块耵聍宝宝</div>` +
        `<div class="ear-harvest__summary-note">共约 ${fmt1(totalSize)} mm · 全都很干净</div></div>`;
      harvest.body.appendChild(summary);

      if (!items.length) {
        harvest.body.appendChild(
          El(doc, "div", "ear-harvest-empty", "这一轮耳朵里干干净净，什么都没掏出来～")
        );
      } else {
        const grid = El(doc, "div", "ear-harvest__list");
        items.forEach((item, i) => {
          const meta = WAX_META[item?.type] || WAX_META.dry;
          const typeKey = WAX_META[item?.type] ? item.type : "dry";
          const big = num(item?.size, 0) >= 3;
          const card = El(doc, "div", `ear-harvest-card ear-harvest-card--${typeKey}${big ? " is-big" : ""}`);
          card.style.animationDelay = `${Math.min(i * 70, 700)}ms`;
          const ic = IconEl(doc, meta.icon, "ear-harvest-card__icon");
          const metaBox = El(doc, "div", "ear-harvest-card__meta");
          const type = El(doc, "div", "ear-harvest-card__type", item?.cnName || meta.cn);
          const spec = El(
            doc,
            "div",
            "ear-harvest-card__spec",
            `${fmt1(item?.size)}mm · ${fmt1(item?.depth)}mm深`
          );
          metaBox.append(type, spec);
          card.append(ic, metaBox);
          grid.appendChild(card);
        });
        harvest.body.appendChild(grid);
        harvest.body.appendChild(
          El(
            doc,
            "div",
            "ear-harvest-empty",
            "点「收好」把它们收进收藏册，下一页继续～"
          )
        );
        const done = El(doc, "button", "ear-btn ear-btn--primary", `${ICONS.check}<span>收好</span>`);
        done.type = "button";
        done.style.marginTop = "14px";
        done.style.width = "100%";
        done.setAttribute("aria-label", "收好，关闭收藏册");
        done.addEventListener("click", () => {
          Cmd.closePanel("harvest");
          emit("action", "harvest-close");
        });
        harvest.body.appendChild(done);
      }
      Cmd.openPanel("harvest");
    },

    setExpressionHint(name) {
      const key = typeof name === "string" ? name : "";
      if (key === state.expression) return;
      state.expression = key;
      if (!key) {
        exprEl.classList.remove("is-on");
        return;
      }
      const icon = ICONS["face" + key.charAt(0).toUpperCase() + key.slice(1)] || ICONS.faceRelaxed;
      exprFace.innerHTML = icon;
      SetText(exprText, "expression", EXPRESSION_CN[key] || key);
      exprEl.classList.add("is-on");
    },

    openPanel(id) {
      const ok = OpenPanel(id);
      if (!ok) emit("action", `panel-missing:${id}`);
      return ok;
    },

    closePanel(id) {
      if (id == null) {
        for (const key of [...openStack]) ClosePanel(key);
        return true;
      }
      return ClosePanel(id);
    },

    setBgm(id) {
      if (!id || id === state.bgm) return;
      state.bgm = id;
      SyncSettings();
      emit("settings", { bgm: id });
      emit("action", `bgm:${id}`);
    },

    /** 契约写的是 patch，这里同时容忍一个纯数字（总音量）*/
    setVolume(patch) {
      if (patch == null) return;
      const next = typeof patch === "number"
        ? { master: clamp01(patch) }
        : {
          master: patch.master != null ? clamp01(patch.master) : undefined,
          bgm: patch.bgm != null ? clamp01(patch.bgm) : undefined,
          sfx: patch.sfx != null ? clamp01(patch.sfx) : undefined,
        };
      for (const [k, v] of Object.entries(next)) {
        if (v !== undefined) state.volume[k] = v;
      }
      if (patch && typeof patch === "object" && patch.muted != null) state.muted = !!patch.muted;
      SyncSettings();
    },

    setFpsHint(v) {
      const n = Math.round(num(v, 0));
      if (n === state.fps) return;
      state.fps = n;
      fpsChip.style.display = n > 0 ? "" : "none";
      if (n > 0) SetText(fpsText, "fps", `${n} fps`);
    },

    /** 契约 §5.8 的 Update(dt)：dt 单位秒，缺省也算得出来 */
    Update(dt) {
      if (state.disposed) return;
      const step = Number.isFinite(dt) && dt > 0 ? Math.min(0.1, dt) : 1 / 60;

      // 第一次 Update 就撤掉载入遮罩（生产路径由 Script_Main 打开游戏时调用）
      if (!loading.classList.contains("is-gone")) {
        loading.classList.add("is-gone");
        loadingTimer = setTimeout(() => loading.remove(), 600);
      }

      // 游标平滑跟随：指数逼近，进危险区时慢一点（手感更「重」）
      const target = DepthToFrac(state.depthTarget);
      if (!cursorInit) {
        cursorY = target;
        cursorInit = true;
      }
      const k = 1 - Math.exp(-(dangerOn ? 5.5 : 9) * step);
      const before = cursorY;
      cursorY += (target - cursorY) * k;

      if (Math.abs(cursorY - before) > 0.0006) {
        if (rulerDirty) {
          DrawRuler();
          rulerDirty = false;
        }
        DrawCursor();
      } else if (rulerDirty) {
        DrawRuler();
        DrawCursor();
        rulerDirty = false;
      }
    },

    dispose() {
      if (state.disposed) return;
      state.disposed = true;
      for (const [, timer] of toastTimers) clearTimeout(timer);
      toastTimers.clear();
      if (loadingTimer) clearTimeout(loadingTimer);
      if (resizeObs) resizeObs.disconnect();
      if (motionQuery && motionHandler) {
        try {
          motionQuery.removeEventListener("change", motionHandler);
        } catch {
          /* Safari 老版本 */
        }
      }
      for (const [, entry] of panels) {
        for (const fn of entry.extraDisposers) fn();
      }
      panels.clear();
      toolCards.clear();
      root.remove();
      lastText.clear();
    },

    get element() {
      return root;
    },
    get state() {
      return state;
    },
  };

  // 处理 requestAnimationFrame 不存在的情况（无头/极简环境）
  function requestAnimationFrameSafe(fn) {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => fn());
    else setTimeout(fn, 16);
  }

  // Cmd：内部动作入口（按钮点击都走它，方便统一埋点/日志）
  const Cmd = {
    tip: (t, o) => api.tip(t, o),
    openPanel: (id) => api.openPanel(id),
    closePanel: (id) => api.closePanel(id),
    setBgm: (id) => api.setBgm(id),
  };

  // ── 事件绑定 ──
  const onGearClick = () => {
    if (panels.get("settings")?.open) Cmd.closePanel("settings");
    else Cmd.openPanel("settings");
    emit("action", "settings");
  };
  gearBtn.addEventListener("click", onGearClick);

  const onActionClick = (ev) => {
    const btn = ev.target.closest?.("[data-action]");
    if (!btn) return;
    emit("action", btn.dataset.action);
  };
  actions.addEventListener("click", onActionClick);

  const onStripKey = (ev) => {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(ev.key)) return;
    const cards = [...toolCards.values()];
    if (!cards.length) return;
    let idx = cards.findIndex((c) => c.el.classList.contains("is-active"));
    if (ev.key === "ArrowLeft") idx = idx <= 0 ? cards.length - 1 : idx - 1;
    else if (ev.key === "ArrowRight") idx = idx < 0 || idx === cards.length - 1 ? 0 : idx + 1;
    else if (ev.key === "Home") idx = 0;
    else idx = cards.length - 1;
    ev.preventDefault();
    const card = cards[idx];
    card.el.focus({ preventScroll: true });
    emit("toolSelect", card.tool?.id);
  };
  strip.addEventListener("keydown", onStripKey);

  const onKeyDown = (ev) => {
    if (ev.key === "Escape" && openStack.length) {
      ev.preventDefault();
      Cmd.closePanel(openStack[openStack.length - 1]);
    }
  };
  doc.addEventListener("keydown", onKeyDown);

  // 尺寸变化：进深尺要重排（ResizeObserver 缺失时退回 window.resize）
  let resizeObs = null;
  let windowResizeHandler = null;
  if (typeof ResizeObserver === "function") {
    resizeObs = new ResizeObserver(() => ResizeRuler());
    resizeObs.observe(rulerBody);
  } else if (typeof window !== "undefined") {
    windowResizeHandler = () => ResizeRuler();
    window.addEventListener("resize", windowResizeHandler);
  }

  // 减少动效：把「进深尺脉动」也交给 CSS 的 reduced-motion 规则，这里只记一下
  let motionQuery = null;
  let motionHandler = null;
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    motionHandler = () => {
      root.classList.toggle("ear-reduced-motion", !!motionQuery.matches);
    };
    motionHandler();
    try {
      motionQuery.addEventListener("change", motionHandler);
    } catch {
      /* 忽略 */
    }
  }

  // 首帧：布局完成后再量尺子尺寸
  ResizeRuler();
  SyncRulerLabel();
  requestAnimationFrameSafe(() => ResizeRuler());

  // 把原始的 dispose 包一层，顺便解绑 window / document 上的监听
  const rawDispose = api.dispose;
  api.dispose = () => {
    doc.removeEventListener("keydown", onKeyDown);
    strip.removeEventListener("keydown", onStripKey);
    actions.removeEventListener("click", onActionClick);
    gearBtn.removeEventListener("click", onGearClick);
    if (windowResizeHandler && typeof window !== "undefined") {
      window.removeEventListener("resize", windowResizeHandler);
    }
    rawDispose();
  };

  return api;
}

export default CreateUi;
