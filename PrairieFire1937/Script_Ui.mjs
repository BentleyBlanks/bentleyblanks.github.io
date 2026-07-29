// ============================================================================
// 《燎原 · 敌后1937》 —— Script_Ui.mjs
//
// UI / 交互层。整套 HUD 由 CreateUi(root, hooks) 在运行时自建 DOM 挂到 root 下，
// 样式全部来自同目录的 Style_Game.css。零外部依赖：不加载字体文件 / 图片文件 / CDN，
// 纸张纤维与颗粒纹理由 CSS 渐变与内联 SVG data URI 生成，
// 事件卡插画由 Canvas2D 程序化绘制（灰阶剪影 + 老照片颗粒 + 暗角）。
//
// 视觉基调：1940 年代华北战地档案 —— 土黄纸面、暗红印章、墨黑钢笔字；
// 但一切以现代策略游戏 HUD 的信息密度与可读性为先（正文对比度 ≥ 4.5:1）。
//
// 硬性约定：
//  · 模块顶层不执行任何 DOM 副作用，所有 document 访问都在函数内部。
//  · 导出函数 PascalCase，变量 lowerCamelCase，文件名无连字符。
//  · 代价账本（平民伤亡 / 流离 / 焚村 / 被夺粮 / 骨干损失）只陈述、不计分，
//    文案克制肃穆，不出现任何"战果""奖励"式表达。
// ============================================================================

import {
  HexKey,
  ParseHexKey,
  HexToWorld,
  WorldToHex,
  HexCornerOffsets,
  hexDirections,
  CreateRng,
  Clamp,
  ValueNoise2D,
} from "./Script_Hex.mjs";
import { assetBase, illustrationAssets } from "./Data_Assets.mjs";

// ---------------------------------------------------------------------------
// 静态描述表（纯数据，无副作用）
// ---------------------------------------------------------------------------

/** 六种资源的显示元信息，顺序即顶部资源条顺序。 */
export const resourceDefinitions = Object.freeze([
  { key: "grain", name: "粮", full: "粮秣", glyph: "禾", blurb: "部队补给、人口增长；不足则减员与饥荒。" },
  { key: "labor", name: "工", full: "工力", glyph: "工", blurb: "修地道、垒梯田、建区域所需的人工。" },
  { key: "ordnance", name: "械", full: "枪械弹药", glyph: "械", blurb: "补充与整编部队，主要靠缴获与土法复装。" },
  { key: "medicine", name: "药", full: "医药", glyph: "药", blurb: "救治伤员，显著降低减员与后遗损失。" },
  { key: "intel", name: "情报", full: "情报", glyph: "谍", blurb: "情报网、预警与识破敌军意图。" },
  { key: "cadre", name: "干部", full: "骨干", glyph: "干", blurb: "最稀缺的一项：开辟新区、派工作队、推行政策。" },
]);

/** 五个时期。turnRange 为闭区间，与规格书第 5 节一致。 */
export const eraDefinitionsFallback = Object.freeze([
  { key: "Opening", name: "开辟期", turnRange: [0, 5], summary: "收枪、建党政军、发动群众。" },
  { key: "Growth", name: "发展期", turnRange: [6, 13], summary: "根据地连片、办兵工、破袭交通。" },
  { key: "Hardship", name: "困难期", turnRange: [14, 21], summary: "大扫荡、囚笼、三光；精兵简政。" },
  { key: "Recovery", name: "恢复期", turnRange: [22, 27], summary: "大生产、减租减息、挤敌人。" },
  { key: "Counter", name: "反攻期", turnRange: [28, 31], summary: "攻势作战、收复县城。" },
]);

const seasonNames = Object.freeze(["秋", "冬", "春", "夏"]);

const terrainDisplay = Object.freeze({
  Mountain: { name: "高山", color: "#6d6458", note: "难行，极佳隐蔽，产出贫瘠。" },
  Ridge: { name: "山脊", color: "#7e7365", note: "视野开阔，是观察哨与转移通道。" },
  Hill: { name: "丘陵", color: "#8e8455", note: "梯田与村落的骨架。" },
  Forest: { name: "林地", color: "#4b6043", note: "隐蔽极佳，宜设伏。" },
  Plain: { name: "平原", color: "#a99b5f", note: "产粮但暴露，敌骑车易达。" },
  Loess: { name: "黄土塬", color: "#b49b64", note: "沟壑纵横，宜挖地道。" },
  Marsh: { name: "苇塘", color: "#606e56", note: "青纱帐一般的天然掩护。" },
  River: { name: "河川", color: "#405b69", note: "需渡口通行，枯水期可涉。" },
  Gorge: { name: "峡谷", color: "#595148", note: "咽喉之地，一夫当关。" },
});

const featureDisplay = Object.freeze({
  Village: { name: "村庄", note: "群众工作的基本单位。" },
  Town: { name: "集镇", note: "集市与情报交汇处。" },
  CountySeat: { name: "县城", note: "敌伪政权中枢，重兵驻守。" },
  Ford: { name: "渡口", note: "河川唯一可靠通道。" },
  Pass: { name: "关隘", note: "扼守山道的要点。" },
  Shrine: { name: "庙宇", note: "开会、藏粮、教书的老地方。" },
  Terrace: { name: "梯田", note: "山坡上一寸寸垒出来的口粮。" },
  Grove: { name: "林盘", note: "村边树林，掩护出入。" },
  Quarry: { name: "石场", note: "石料来源，可供修筑。" },
  SaltPan: { name: "盐滩", note: "土法熬盐，边区硬通货。" },
});

const controlDisplay = Object.freeze({
  Enemy: { name: "敌占区", color: "#8c2f24" },
  Contested: { name: "争夺区", color: "#a8763a" },
  Guerrilla: { name: "游击区", color: "#7d8f5e" },
  Base: { name: "根据地", color: "#c8a86a" },
});

const workDisplay = Object.freeze({
  Terrace: { name: "梯田", note: "增产，抗旱。" },
  Trench: { name: "交通壕", note: "村落间隐蔽机动。" },
  Tunnel: { name: "地道", note: "藏人藏粮，扫荡时的命根子。" },
  Smithy: { name: "铁匠炉", note: "复装子弹、修枪。" },
  Cache: { name: "粮秣窖", note: "坚壁清野时保住口粮。" },
  Beacon: { name: "消息树", note: "望见敌情立刻放倒。" },
});

/**
 * 单位行动种类。key 对应 Script_Rules.ListContextActions 返回的 action.kind，
 * hooks.OnUnitAction 收到的是整个 action 对象（含 unitId / 目标键 / 代价）。
 * tone 决定按钮配色，hotkey 只发给该 kind 在当前列表里的第一条。
 */
export const actionDefinitions = Object.freeze([
  { kind: "Move", name: "转移", hotkey: "M", tone: "move", hint: "沿可通行地形机动；山地林地消耗更高。" },
  { kind: "Attack", name: "伏击", hotkey: "A", tone: "attack", hint: "打击敌军。打完必须转移，否则暴露度按四倍计。" },
  { kind: "Sabotage", name: "破袭", hotkey: "S", tone: "attack", hint: "破坏铁路、公路与电线，牵制敌军运输。" },
  { kind: "Siege", name: "攻坚", hotkey: "K", tone: "attack", hint: "强攻或围困据点，需要械与工兵，代价很高。" },
  { kind: "BuildWork", name: "修建", hotkey: "B", tone: "build", hint: "挖地道、修交通壕、垒梯田、设消息树。" },
  { kind: "FoundBase", name: "开辟根据地", hotkey: "F", tone: "build", hint: "派骨干立起党政军三套架子，消耗干部。" },
  { kind: "Mobilize", name: "发动群众", hotkey: "G", tone: "support", hint: "开群众会、减租减息、建农会，抬升群众基础。" },
  { kind: "Recon", name: "侦察", hotkey: "R", tone: "support", hint: "派侦察与情报员，扩大视野与情报覆盖。" },
  { kind: "Rest", name: "休整 / 隐蔽", hotkey: "H", tone: "support", hint: "就地休整，恢复体力与隐蔽，消耗粮与药。" },
  { kind: "Withdraw", name: "撤出", hotkey: "W", tone: "move", hint: "主动跳出合围圈，降低暴露度。" },
]);

/** 九个全屏面板。ShowPanel(name) 的合法取值即这些 key（外加 null 表示关闭）。 */
export const panelDefinitions = Object.freeze([
  { key: "Tech", tab: "技术", glyph: "技", hotkey: "1", title: "军事技术", subtitle: "缴获 · 仿制 · 土法上马" },
  { key: "Doctrine", tab: "群众", glyph: "众", hotkey: "2", title: "群众与政权", subtitle: "组织起来的力量" },
  { key: "Policy", tab: "政策", glyph: "策", hotkey: "3", title: "边区政策", subtitle: "装配到有限的政策槽" },
  { key: "Base", tab: "根据地", glyph: "根", hotkey: "4", title: "根据地建设", subtitle: "区域 · 生产 · 人口" },
  { key: "Intel", tab: "情报", glyph: "情", hotkey: "5", title: "敌情与情报网", subtitle: "已知意图与覆盖" },
  { key: "Ledger", tab: "账本", glyph: "账", hotkey: "6", title: "代价账本", subtitle: "只作记录，不计功过" },
  { key: "Log", tab: "纪事", glyph: "纪", hotkey: "7", title: "战报与纪事", subtitle: "逐回合记录" },
  { key: "Help", tab: "说明", glyph: "说", hotkey: "8", title: "操作与史实说明", subtitle: "快捷键 · 历史框架" },
  { key: "Settings", tab: "设置", glyph: "设", hotkey: "9", title: "设置与存档", subtitle: "新局 · 音频 · 存档" },
]);

export const panelNames = Object.freeze(panelDefinitions.map((item) => item.key));

/** 三档难度，key 与 Script_Ai.difficultyDefinitions 一致。 */
const difficultyDefinitions = Object.freeze([
  { key: "Normal", name: "普通", note: "守备队按部就班，扫荡前的调兵痕迹明显。" },
  { key: "Hard", name: "严酷", note: "囚笼收得更紧，抽调守备更狠，预警窗口更短。" },
  { key: "Brutal", name: "残酷", note: "扫荡频繁而突然，困难期几乎没有喘息。" },
]);


const keyboardHelpRows = Object.freeze([
  ["空格", "结束回合"],
  ["Esc", "关闭当前面板 / 取消选择"],
  ["1 – 9", "切换九个全屏面板"],
  ["方向键", "把选择移到相邻地块"],
  ["Tab / Shift+Tab", "在控件间移动焦点（焦点环可见）"],
  ["Enter", "确认当前焦点上的操作"],
  ["M / A / S / K", "移动 / 伏击 / 破袭 / 攻坚"],
  ["B / G / R", "建设 / 动员 / 侦察"],
  ["T / W / H", "进地道 / 转移 / 休整"],
  ["?", "打开本说明页"],
]);

const historyHelpRows = Object.freeze([
  ["1937 秋", "华北敌后开辟：收枪、建立党政军三套架子，第一批工作队下到村里。"],
  ["1939 – 1940", "根据地连片，兵工与被服自给，交通破袭成为常态。"],
  ["1941 – 1942", "最艰难的两年：囚笼政策、反复扫荡与三光，精兵简政、减租减息同时推行。"],
  ["1943 – 1944", "大生产运动缓过一口气，敌伪据点被逐个挤掉。"],
  ["1944 夏 – 1945 夏", "局部反攻，收复县城；1945 年日本投降是不可改写的史实终点。"],
]);

// ---------------------------------------------------------------------------
// 无副作用的纯工具函数
// ---------------------------------------------------------------------------

/**
 * 回合 → 公历季度标签。turn 0 = 1937 秋，一回合一季度。
 * label 的写法与 Script_Rules.FormatTurnDate / Data_History.FormatTurnDate 完全一致
 * （"1937年 秋"，年与数字之间不留空格），顶栏与日志因此不会出现两种日期格式。
 */
export function FormatTurnDate(turn) {
  const index = Math.max(0, Math.floor(Number(turn) || 0));
  const year = 1937 + Math.floor((index + 2) / 4);
  return { year, season: seasonNames[index % 4], label: `${year}年 ${seasonNames[index % 4]}` };
}

/** 回合 → 时期定义（默认表，可被 view.era / state.eraInfo 覆盖）。 */
export function EraForTurn(turn) {
  const index = Math.max(0, Math.floor(Number(turn) || 0));
  for (const era of eraDefinitionsFallback) {
    if (index >= era.turnRange[0] && index <= era.turnRange[1]) return era;
  }
  return eraDefinitionsFallback[eraDefinitionsFallback.length - 1];
}

function FormatSigned(value) {
  const amount = Number(value) || 0;
  if (amount > 0) return `+${FormatNumber(amount)}`;
  if (amount < 0) return `−${FormatNumber(Math.abs(amount))}`;
  return "±0";
}

function FormatNumber(value) {
  const amount = Number(value) || 0;
  if (Math.abs(amount) >= 10000) return `${(amount / 10000).toFixed(1)}万`;
  if (!Number.isInteger(amount)) return amount.toFixed(1);
  return String(amount);
}

function ToneForDelta(value) {
  const amount = Number(value) || 0;
  if (amount > 0) return "good";
  if (amount < 0) return "bad";
  return "flat";
}

function SafeText(value, fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

/** 六角坐标键 "7,5" → "(7, 5)"，避免被读成小数。 */
export function FormatHexCoord(key) {
  if (!key) return "";
  const text = String(key);
  const comma = text.indexOf(",");
  if (comma < 0) return text;
  return `(${text.slice(0, comma).trim()}, ${text.slice(comma + 1).trim()})`;
}

function PercentOf(value, total) {
  const amount = Number(value) || 0;
  const span = Number(total) || 100;
  return Clamp((amount / (span || 1)) * 100, 0, 100);
}

// ---------------------------------------------------------------------------
// CreateUi —— 唯一入口
// ---------------------------------------------------------------------------

/**
 * 建立整套 HUD。
 * @param {HTMLElement} root 挂载容器（由主 agent 提供，本模块不碰 index.html）
 * @param {object} hooks 回调集合，全部可选，调用前判空
 * @returns {object} UiHandle
 */
export function CreateUi(root, hooks = {}) {
  const doc = (root && root.ownerDocument) || (typeof document !== "undefined" ? document : null);
  if (!doc || !root) throw new Error("CreateUi 需要一个有效的 DOM 容器。");

  const svgNamespace = "http://www.w3.org/2000/svg";
  let callbacks = Object.assign({}, hooks || {});
  const listeners = [];
  const timers = new Set();
  const tooltipProviders = new Map();
  const dom = {};
  const cache = {
    resource: {},
    signatures: {},
    minimapKey: "",
    lastState: null,
    lastView: null,
    autoSelectToken: "",
  };
  /**
   * 数据表来源有两条路：
   *  1) 首选 hooks.definitions —— Script_Main 在调用 CreateUi 前已经 import 好，
   *     传进来的是各模块的完整 namespace（units / tech / terrain / history）。
   *     走这条路第一帧就有中文名，不会闪英文 key。
   *  2) 缺失时才回退到动态 import()，任何一个失败都只降级为空态，绝不拖垮 HUD。
   * 这样 Script_Ui 在 node 里仍可零依赖导入。
   */
  const definitions = { tech: null, units: null, terrain: null, history: null, loading: false, loaded: false };

  function AdoptDefinitions(source) {
    if (!source || typeof source !== "object") return false;
    let adopted = false;
    for (const slot of ["units", "tech", "terrain", "history"]) {
      if (source[slot] && typeof source[slot] === "object") {
        definitions[slot] = source[slot];
        adopted = true;
      }
    }
    if (adopted) definitions.loaded = true;
    return adopted;
  }
  let tooltipCounter = 0;
  let disposed = false;
  let activePanel = null;
  let activeCinematic = null;
  let activeConfirm = null;
  let busy = false;
  let currentState = null;
  let currentView = {};
  let minimapCollapsed = false;
  let contextCollapsed = false;

  // ---- 基础 DOM 工具 -------------------------------------------------------

  function El(tag, className, options = {}) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (options.text !== undefined && options.text !== null) node.textContent = String(options.text);
    if (options.attrs) {
      for (const name of Object.keys(options.attrs)) {
        const value = options.attrs[name];
        if (value === null || value === undefined || value === false) continue;
        node.setAttribute(name, value === true ? "" : String(value));
      }
    }
    if (options.style && node.style) {
      for (const name of Object.keys(options.style)) node.style[name] = options.style[name];
    }
    if (options.children) {
      for (const child of options.children) if (child) node.appendChild(child);
    }
    if (options.parent) options.parent.appendChild(node);
    if (options.onClick) On(node, "click", options.onClick);
    if (options.tip) AttachTooltip(node, options.tip);
    return node;
  }

  function Svg(tag, attrs) {
    const node = doc.createElementNS
      ? doc.createElementNS(svgNamespace, tag)
      : doc.createElement(tag);
    if (attrs) {
      for (const name of Object.keys(attrs)) {
        const value = attrs[name];
        if (value === null || value === undefined) continue;
        node.setAttribute(name, String(value));
      }
    }
    return node;
  }

  function On(target, type, handler, options) {
    if (!target || !target.addEventListener) return () => {};
    target.addEventListener(type, handler, options);
    listeners.push({ target, type, handler, options });
    return function Off() {
      if (target.removeEventListener) target.removeEventListener(type, handler, options);
    };
  }

  function Later(fn, delay) {
    if (typeof setTimeout !== "function") return null;
    const id = setTimeout(() => {
      timers.delete(id);
      if (!disposed) fn();
    }, delay);
    timers.add(id);
    return id;
  }

  function ClearNode(node) {
    if (!node) return node;
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  function SetText(node, text) {
    if (!node) return;
    const next = text === null || text === undefined ? "" : String(text);
    if (node.textContent !== next) node.textContent = next;
  }

  function SetFlag(node, className, on) {
    if (!node || !node.classList) return;
    if (on) node.classList.add(className);
    else node.classList.remove(className);
  }

  function SetAttr(node, name, value) {
    if (!node || !node.setAttribute) return;
    if (value === null || value === undefined || value === false) {
      if (node.removeAttribute) node.removeAttribute(name);
      return;
    }
    node.setAttribute(name, value === true ? "" : String(value));
  }

  function SetBarWidth(node, percent) {
    if (!node || !node.style) return;
    const next = `${Clamp(Number(percent) || 0, 0, 100).toFixed(1)}%`;
    if (node.style.width !== next) node.style.width = next;
  }

  function RectOf(node) {
    if (node && typeof node.getBoundingClientRect === "function") {
      const rect = node.getBoundingClientRect();
      if (rect) return rect;
    }
    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }

  function ViewportSize() {
    if (typeof window !== "undefined" && window && window.innerWidth) {
      return { width: window.innerWidth, height: window.innerHeight };
    }
    return { width: 1280, height: 800 };
  }

  // ---- 滚动可见性 ---------------------------------------------------------
  //
  // 本机（以及大量移动端浏览器）的滚动条是叠加式的：能滚，但静止时完全不画。
  // 于是"内容还在下面 / 右边"这件事对玩家不可见。这里统一给可滚容器打状态类，
  // 样式层据此画渐隐与箭头，做到"能滚就一定看得出能滚"。

  /** 绑定一次滚动监听，之后由 UpdateScrollAffordance 维护状态类。 */
  function BindScrollAffordance(node) {
    if (!node || !node.classList) return node;
    if (node.getAttribute && node.getAttribute("data-pf-scroll") === "1") return node;
    SetAttr(node, "data-pf-scroll", "1");
    On(node, "scroll", () => UpdateScrollAffordance(node), { passive: true });
    UpdateScrollAffordance(node);
    return node;
  }

  /** 按当前滚动位置刷新状态类；随时可调用，无副作用之外的开销。 */
  function UpdateScrollAffordance(node) {
    if (!node || !node.classList) return;
    const spanY = Math.max(0, (node.scrollHeight || 0) - (node.clientHeight || 0));
    const spanX = Math.max(0, (node.scrollWidth || 0) - (node.clientWidth || 0));
    const top = node.scrollTop || 0;
    const left = node.scrollLeft || 0;
    SetFlag(node, "is-scroll-y", spanY > 2);
    SetFlag(node, "is-scroll-up", spanY > 2 && top > 2);
    SetFlag(node, "is-scroll-down", spanY > 2 && top < spanY - 2);
    SetFlag(node, "is-scroll-x", spanX > 2);
    SetFlag(node, "is-scroll-left", spanX > 2 && left > 2);
    SetFlag(node, "is-scroll-right", spanX > 2 && left < spanX - 2);
  }

  function Call(name, ...args) {
    const fn = callbacks && callbacks[name];
    if (typeof fn === "function") {
      try {
        return fn(...args);
      } catch (error) {
        // 回调抛错不应拖垮 HUD。
        if (typeof console !== "undefined" && console.error) console.error(`[Ui] ${name} 回调异常`, error);
      }
    }
    return undefined;
  }

  function EnsureDefinitions() {
    if (definitions.loaded || definitions.loading) return;
    definitions.loading = true;
    Promise.all([
      import("./Data_Tech.mjs").catch(() => null),
      import("./Data_Units.mjs").catch(() => null),
      import("./Data_Terrain.mjs").catch(() => null),
      import("./Data_History.mjs").catch(() => null),
    ]).then((modules) => {
      if (disposed) return;
      definitions.tech = definitions.tech || modules[0];
      definitions.units = definitions.units || modules[1];
      definitions.terrain = definitions.terrain || modules[2];
      definitions.history = definitions.history || modules[3];
      definitions.loading = false;
      definitions.loaded = true;
      // 定义到位后重绘一次图例、底部卡片与当前面板。
      RenderMinimapLegend();
      cache.signatures.context = "";
      cache.minimapKey = "";
      if (currentState) Sync(currentState, currentView);
    });
  }

  /** 取某张定义表；模块没加载成功时返回空对象，调用方自行处理空态。 */
  function DefinitionTable(name) {
    const source =
      (definitions.tech && definitions.tech[name]) ||
      (definitions.units && definitions.units[name]) ||
      (definitions.terrain && definitions.terrain[name]) ||
      (definitions.history && definitions.history[name]) ||
      null;
    return source && typeof source === "object" ? source : {};
  }

  /** 优先用 Data_* 的正式名称，退回本模块的兜底表。 */
  function LookupName(tableName, key, fallbackTable) {
    if (!key) return null;
    const entry = DefinitionTable(tableName)[key];
    if (entry && entry.name) return entry;
    return (fallbackTable && fallbackTable[key]) || null;
  }

  // ---- Tooltip 引擎 --------------------------------------------------------

  function AttachTooltip(node, provider) {
    if (!node || !provider) return node;
    tooltipCounter += 1;
    const id = `t${tooltipCounter}`;
    tooltipProviders.set(id, provider);
    SetAttr(node, "data-tip", id);
    return node;
  }

  function ResolveTooltip(id) {
    const provider = tooltipProviders.get(id);
    if (!provider) return null;
    const raw = typeof provider === "function" ? provider() : provider;
    if (!raw) return null;
    if (typeof raw === "string") return { title: "", body: raw, rows: [] };
    return raw;
  }

  function RenderTooltip(payload) {
    const box = dom.tooltip;
    if (!box) return;
    ClearNode(box);
    if (payload.title) El("div", "pf-tip-title", { text: payload.title, parent: box });
    if (payload.body) El("div", "pf-tip-body", { text: payload.body, parent: box });
    if (payload.rows && payload.rows.length) {
      const table = El("div", "pf-tip-rows", { parent: box });
      for (const row of payload.rows) {
        if (!row) continue;
        const line = El("div", "pf-tip-row", { parent: table });
        El("span", "pf-tip-label", { text: SafeText(row.label, ""), parent: line });
        El("span", `pf-tip-value is-${row.tone || "flat"}`, { text: SafeText(row.value, ""), parent: line });
      }
    }
    if (payload.footer) El("div", "pf-tip-foot", { text: payload.footer, parent: box });
  }

  function PlaceTooltip(anchor) {
    const box = dom.tooltip;
    if (!box) return;
    const view = ViewportSize();
    const rect = RectOf(anchor);
    const tip = RectOf(box);
    const margin = 10;
    const width = tip.width || 240;
    const height = tip.height || 96;
    let left = rect.left + rect.width / 2 - width / 2;
    let top = rect.bottom + margin;
    if (top + height > view.height - margin) top = rect.top - height - margin;
    if (top < margin) top = margin;
    left = Clamp(left, margin, Math.max(margin, view.width - width - margin));
    box.style.left = `${Math.round(left)}px`;
    box.style.top = `${Math.round(top)}px`;
  }

  function ShowTooltipFor(node) {
    if (!node || !node.getAttribute) return;
    const id = node.getAttribute("data-tip");
    if (!id) return;
    const payload = ResolveTooltip(id);
    if (!payload) return;
    RenderTooltip(payload);
    SetFlag(dom.tooltip, "is-open", true);
    SetAttr(dom.tooltip, "aria-hidden", "false");
    PlaceTooltip(node);
  }

  function HideTooltip() {
    SetFlag(dom.tooltip, "is-open", false);
    SetAttr(dom.tooltip, "aria-hidden", "true");
  }

  function FindTipTarget(node) {
    let cursor = node;
    while (cursor && cursor !== root) {
      if (cursor.getAttribute && cursor.getAttribute("data-tip")) return cursor;
      cursor = cursor.parentNode;
    }
    return null;
  }

  // ---- 骨架搭建 -----------------------------------------------------------

  function BuildShell() {
    if (root.classList) root.classList.add("pf-ui");
    SetAttr(root, "data-pf-ui", "1");

    dom.hud = El("div", "pf-hud", { parent: root, attrs: { role: "region", "aria-label": "战场界面" } });
    // 内联双保险：这个全屏层必须穿透点击，交互元素由 .pf-hud > * 单独恢复。
    // 只靠样式表规则曾被宿主页面的兜底样式按源顺序反杀过一次（整张地图点不了），
    // 内联样式不受样式表加载顺序影响。
    dom.hud.style.pointerEvents = "none";

    BuildTopBar();
    BuildMeterStrip();
    BuildSweepBanner();
    BuildMinimap();
    // 通知流与底部面板同处左下角，放进同一个 flex 列里，从结构上杜绝互相压盖。
    // 单位牌层：悬浮在部队头顶的兵种牌（辨识度的主承担者），逐帧由主循环投影定位。
    dom.unitLayer = El("div", "pf-unitlayer", { parent: dom.hud, attrs: { "aria-hidden": "true" } });
    dom.unitLayer.style.pointerEvents = "none";

    dom.leftDock = El("div", "pf-leftdock", { parent: dom.hud });
    BuildNotifyStream();
    BuildContextPanel();
    BuildEndTurnDock();
    BuildHintBar();

    dom.toastLayer = El("div", "pf-toast-layer", {
      parent: root,
      attrs: { role: "status", "aria-live": "polite", "aria-label": "提示" },
    });
    // 提示流只展示不交互，同样内联穿透，防止它挡住下方的地图。
    dom.toastLayer.style.pointerEvents = "none";
    dom.panelLayer = El("div", "pf-panel-layer", { parent: root, attrs: { "aria-hidden": "true" } });
    dom.cinemaLayer = El("div", "pf-cinema-layer", { parent: root, attrs: { "aria-hidden": "true" } });
    dom.modalLayer = El("div", "pf-modal-layer", { parent: root, attrs: { "aria-hidden": "true" } });
    dom.tooltip = El("div", "pf-tooltip", { parent: root, attrs: { role: "tooltip", "aria-hidden": "true" } });
    dom.busy = El("div", "pf-busy", { parent: root, attrs: { "aria-hidden": "true" } });
    // 内联三保险：这个指示层曾以 z-index 85 + pointer-events:auto 盖住事件卡，
    // 玩家看着"推演中…"却点不了任何选项，整局永久卡死。指示器只许看不许摸。
    dom.busy.style.pointerEvents = "none";
    const busyCard = El("div", "pf-busy-card", { parent: dom.busy });
    El("div", "pf-busy-spin", { parent: busyCard });
    dom.busyText = El("div", "pf-busy-text", { text: "推演中…", parent: busyCard });
  }

  function BuildTopBar() {
    dom.topBar = El("header", "pf-topbar", { parent: dom.hud });

    // —— 左上时局条 ——
    const era = El("div", "pf-era", { parent: dom.topBar });
    const eraHead = El("div", "pf-era-head", { parent: era });
    dom.eraName = El("span", "pf-era-name pf-stamp", { text: "开辟期", parent: eraHead });
    dom.eraDate = El("span", "pf-era-date", { text: "1937年 秋", parent: eraHead });
    const eraMeta = El("div", "pf-era-meta", { parent: era });
    dom.eraTurn = El("span", "pf-era-turn", { text: "回合 1 / 32", parent: eraMeta });
    dom.eraPhase = El("span", "pf-era-phase", { text: "", parent: eraMeta });
    const eraTrack = El("div", "pf-era-track", {
      parent: era,
      attrs: { role: "progressbar", "aria-label": "时期进度", "aria-valuemin": "0", "aria-valuemax": "100" },
    });
    dom.eraTrack = eraTrack;
    dom.eraFill = El("i", "pf-era-fill", { parent: eraTrack });
    dom.eraTicks = El("div", "pf-era-ticks", { parent: era });
    for (const item of eraDefinitionsFallback) {
      El("i", "pf-era-tick", { parent: dom.eraTicks, attrs: { "data-era": item.key, title: item.name } });
    }
    AttachTooltip(era, () => {
      const state = currentState || {};
      const info = ResolveEra(state);
      const date = FormatTurnDate(state.turn || 0);
      return {
        title: `${info.name} · ${date.label}`,
        body: info.summary || "",
        rows: [
          { label: "回合", value: `${(state.turn || 0) + 1} / ${state.maxTurns || 32}` },
          { label: "时期区间", value: `第 ${info.turnRange[0] + 1} – ${info.turnRange[1] + 1} 回合` },
          { label: "阶段", value: SafeText(state.phaseKey, "行动") },
        ],
        footer: "一回合为一个季度；1945 年夏是不可改写的史实终点。",
      };
    });

    // —— 资源条 ——
    dom.resourceBar = El("div", "pf-resbar", { parent: dom.topBar, attrs: { role: "list", "aria-label": "资源" } });
    dom.resourceNodes = {};
    for (const resource of resourceDefinitions) {
      const chip = El("div", "pf-res", {
        parent: dom.resourceBar,
        attrs: { role: "listitem", "data-res": resource.key, tabindex: "0", "aria-label": resource.full },
      });
      El("span", "pf-res-glyph", { text: resource.glyph, parent: chip, attrs: { "aria-hidden": "true" } });
      const body = El("span", "pf-res-body", { parent: chip });
      const stock = El("span", "pf-res-stock", { text: "0", parent: body });
      const delta = El("span", "pf-res-delta", { text: "±0", parent: body });
      const floatLayer = El("span", "pf-res-floats", { parent: chip, attrs: { "aria-hidden": "true" } });
      dom.resourceNodes[resource.key] = { chip, stock, delta, floatLayer };
      AttachTooltip(chip, () => BuildResourceTip(resource));
    }
    // 六项资源在窄视口里会横向溢出；不给提示就等于"静默丢项"。
    BindScrollAffordance(dom.resourceBar);

    // —— 面板按钮组 ——
    dom.panelTabs = El("nav", "pf-tabs", { parent: dom.topBar, attrs: { "aria-label": "面板" } });
    dom.panelTabNodes = {};
    for (const panel of panelDefinitions) {
      const button = El("button", "pf-tab", {
        parent: dom.panelTabs,
        attrs: { type: "button", "data-panel": panel.key, "aria-label": `${panel.title}（快捷键 ${panel.hotkey}）` },
      });
      El("span", "pf-tab-glyph", { text: panel.glyph, parent: button, attrs: { "aria-hidden": "true" } });
      El("span", "pf-tab-name", { text: panel.tab, parent: button });
      El("span", "pf-tab-key", { text: panel.hotkey, parent: button, attrs: { "aria-hidden": "true" } });
      const badge = El("span", "pf-tab-badge", { parent: button, attrs: { "aria-hidden": "true" } });
      dom.panelTabNodes[panel.key] = { button, badge };
      On(button, "click", () => ShowPanel(activePanel === panel.key ? null : panel.key));
      AttachTooltip(button, () => ({ title: panel.title, body: panel.subtitle, footer: `快捷键 ${panel.hotkey}` }));
    }
  }

  function BuildResourceTip(resource) {
    const state = currentState || {};
    const stock = (state.stock && state.stock[resource.key]) || 0;
    const income = (state.income && state.income[resource.key]) || 0;
    const detailSource =
      (currentView && currentView.incomeDetail && currentView.incomeDetail[resource.key]) ||
      (state.incomeDetail && state.incomeDetail[resource.key]) ||
      null;
    const rows = [];
    if (Array.isArray(detailSource) && detailSource.length) {
      for (const item of detailSource) {
        rows.push({
          label: SafeText(item.label || item.source, "其他"),
          value: FormatSigned(item.amount ?? item.value ?? 0),
          tone: ToneForDelta(item.amount ?? item.value ?? 0),
        });
      }
    } else {
      rows.push({ label: "本回合结算", value: FormatSigned(income), tone: ToneForDelta(income) });
    }
    rows.push({ label: "现有存量", value: FormatNumber(stock) });
    return { title: resource.full, body: resource.blurb, rows, footer: "悬停或聚焦查看分项来源。" };
  }

  function BuildMeterStrip() {
    dom.meterStrip = El("div", "pf-meters", { parent: dom.hud });
    // 屏幕阅读器专用播报：暴露度/警备度跨过阈值时朗读一句，视觉上不占位。
    dom.meterSpoken = El("p", "pf-sr-only", {
      parent: dom.meterStrip,
      attrs: { role: "status", "aria-live": "polite" },
    });
    dom.meterNodes = {};
    const meterSpecs = [
      {
        key: "exposure",
        name: "暴露度",
        note: "行动痕迹越多、离敌越近，越可能招来扫荡。打完仗必须转移。",
        tone: "warm",
      },
      {
        key: "alert",
        name: "警备度",
        note: "敌军对本区的重视程度。持续破袭会抬高警备，也会牵制其兵力。",
        tone: "cold",
      },
    ];
    for (const spec of meterSpecs) {
      const meter = El("div", "pf-meter", { parent: dom.meterStrip, attrs: { "data-meter": spec.key, tabindex: "0" } });
      const head = El("div", "pf-meter-head", { parent: meter });
      El("span", "pf-meter-name", { text: spec.name, parent: head });
      const value = El("span", "pf-meter-value", { text: "0", parent: head });
      const track = El("div", "pf-meter-track", {
        parent: meter,
        attrs: {
          role: "progressbar",
          "aria-label": spec.name,
          "aria-valuemin": "0",
          "aria-valuemax": "100",
          "aria-valuenow": "0",
        },
      });
      const fill = El("i", "pf-meter-fill", { parent: track });
      El("i", "pf-meter-notch", { parent: track, style: { left: "60%" } });
      El("i", "pf-meter-notch is-high", { parent: track, style: { left: "85%" } });
      const band = El("div", "pf-meter-band", { text: "平静", parent: meter });
      dom.meterNodes[spec.key] = { meter, value, track, fill, band };
      AttachTooltip(meter, () => {
        const state = currentState || {};
        const amount = Math.round(Number(state[spec.key]) || 0);
        return {
          title: spec.name,
          body: spec.note,
          rows: [
            { label: "当前", value: `${amount} / 100`, tone: amount >= 85 ? "bad" : amount >= 60 ? "warn" : "good" },
            { label: "临界", value: "60 起风声 · 85 极危" },
          ],
          footer: spec.key === "exposure" ? "进地道、转移、群众掩护都能压下去。" : "警备度高时敌军调兵回防，别处反而出现空隙。",
        };
      });
    }
  }

  function BuildSweepBanner() {
    dom.sweepBanner = El("div", "pf-sweep", {
      parent: dom.hud,
      attrs: { role: "alert", "aria-live": "assertive", hidden: true },
    });
    El("span", "pf-sweep-siren", { parent: dom.sweepBanner, attrs: { "aria-hidden": "true" } });
    const body = El("div", "pf-sweep-body", { parent: dom.sweepBanner });
    dom.sweepTitle = El("div", "pf-sweep-title", { text: "扫荡预警", parent: body });
    dom.sweepDetail = El("div", "pf-sweep-detail", { text: "", parent: body });
    dom.sweepCountdown = El("div", "pf-sweep-count", { parent: dom.sweepBanner });
    dom.sweepButton = El("button", "pf-sweep-btn", {
      text: "查看轴线",
      parent: dom.sweepBanner,
      attrs: { type: "button" },
    });
    On(dom.sweepButton, "click", () => {
      const forecast = cache.forecast || (currentState && currentState.sweep);
      if (!forecast || !forecast.targetKey) return;
      Call("OnFocusHex", forecast.targetKey, { axisKeys: forecast.axisKeys || [], reason: "Sweep" });
      Toast("已把镜头带到扫荡轴线的落点。", "warn");
    });
  }

  function BuildMinimap() {
    dom.minimapDock = El("aside", "pf-minimap", { parent: dom.hud, attrs: { "aria-label": "小地图" } });
    const head = El("div", "pf-minimap-head", { parent: dom.minimapDock });
    El("span", "pf-minimap-title", { text: "略图", parent: head });
    dom.minimapToggle = El("button", "pf-minimap-toggle", {
      text: "收",
      parent: head,
      attrs: { type: "button", "aria-label": "折叠小地图", "aria-expanded": "true" },
    });
    On(dom.minimapToggle, "click", () => SetMinimapCollapsed(!minimapCollapsed));

    dom.minimapBody = El("div", "pf-minimap-body", { parent: dom.minimapDock });
    dom.minimapCanvas = El("canvas", "pf-minimap-canvas", {
      parent: dom.minimapBody,
      attrs: { width: "320", height: "240", role: "img", "aria-label": "根据地略图，可点击跳转" },
    });
    On(dom.minimapCanvas, "click", (event) => HandleMinimapClick(event));
    On(dom.minimapCanvas, "pointermove", (event) => HandleMinimapHover(event));
    On(dom.minimapCanvas, "pointerleave", () => HideTooltip());

    dom.minimapLegend = El("div", "pf-minimap-legend", { parent: dom.minimapDock });
    RenderMinimapLegend();
    AttachTooltip(dom.minimapCanvas, () => ({
      title: "根据地略图",
      body: "颜色为政权归属，亮点为我方队伍，暗红点为已知敌军。",
      footer: "点击任意位置把镜头带过去。",
    }));
  }

  /** 图例名称与 Data_Terrain.controlDefinitions 保持一致，避免和地块面板的徽章不同名。 */
  function RenderMinimapLegend() {
    const legend = ClearNode(dom.minimapLegend);
    if (!legend) return;
    const table = DefinitionTable("controlDefinitions");
    for (const key of ["Base", "Guerrilla", "Contested", "Enemy"]) {
      const fallback = controlDisplay[key];
      const definition = table[key] || {};
      const item = El("span", "pf-legend-item", { parent: legend });
      El("i", "pf-legend-dot", { parent: item, style: { background: definition.color || fallback.color } });
      El("span", null, { text: definition.name || fallback.name, parent: item });
    }
  }

  function SetMinimapCollapsed(next) {
    minimapCollapsed = !!next;
    SetFlag(dom.minimapDock, "is-collapsed", minimapCollapsed);
    SetText(dom.minimapToggle, minimapCollapsed ? "展" : "收");
    SetAttr(dom.minimapToggle, "aria-expanded", minimapCollapsed ? "false" : "true");
    if (!minimapCollapsed) {
      cache.minimapKey = "";
      DrawMinimap();
    }
  }

  function BuildContextPanel() {
    dom.context = El("section", "pf-context", { parent: dom.leftDock, attrs: { "aria-label": "地块与单位" } });
    dom.contextGrip = El("button", "pf-context-grip", {
      parent: dom.context,
      attrs: { type: "button", "aria-label": "展开或收起底部面板", "aria-expanded": "true" },
    });
    On(dom.contextGrip, "click", () => {
      contextCollapsed = !contextCollapsed;
      SetFlag(dom.context, "is-collapsed", contextCollapsed);
      SetAttr(dom.contextGrip, "aria-expanded", contextCollapsed ? "false" : "true");
    });
    dom.contextInner = El("div", "pf-context-inner", { parent: dom.context });
    dom.tileCard = El("div", "pf-tile", { parent: dom.contextInner });
    dom.unitCard = El("div", "pf-unit", { parent: dom.contextInner });
    dom.actionRail = El("div", "pf-actions", {
      parent: dom.contextInner,
      attrs: { role: "group", "aria-label": "行动" },
    });
    // 横屏矮窗里这块只有 200 上下的高度却要装三百多的内容，必须让"还能往下滚"看得见。
    BindScrollAffordance(dom.context);
  }

  function BuildEndTurnDock() {
    dom.endDock = El("div", "pf-enddock", { parent: dom.hud });
    dom.todoList = El("ul", "pf-todo", { parent: dom.endDock, attrs: { "aria-label": "待办" } });
    dom.endButton = El("button", "pf-endturn", {
      parent: dom.endDock,
      attrs: { type: "button", "aria-keyshortcuts": "Space" },
    });
    El("span", "pf-endturn-label", { text: "结束回合", parent: dom.endButton });
    // 待办数直接写在副标题里；不再另做浮动角标——那是重复信息，且在窄视口必被裁切。
    dom.endTurnSub = El("span", "pf-endturn-sub", { text: "空格", parent: dom.endButton });
    On(dom.endButton, "click", () => RequestEndTurn());
    AttachTooltip(dom.endButton, () => {
      const todos = ComputeTodos(currentState, currentView);
      return {
        title: "结束回合",
        body: todos.length ? "还有事没交代完：" : "本回合的事都安排好了。",
        rows: todos.map((item) => ({ label: item.text, value: item.count ? String(item.count) : "", tone: "warn" })),
        footer: "快捷键：空格",
      };
    });
  }

  function BuildNotifyStream() {
    dom.notify = El("div", "pf-notify", {
      parent: dom.leftDock,
      attrs: { role: "log", "aria-live": "polite", "aria-label": "通知" },
    });
  }

  function BuildHintBar() {
    dom.hintBar = El("div", "pf-hint", { parent: dom.hud, attrs: { "aria-live": "polite" } });
    SetText(dom.hintBar, "点选地块查看详情；选中队伍后在底部选择行动。");
  }

  // ---- 全局输入 -----------------------------------------------------------

  function BindGlobalInput() {
    On(root, "pointerover", (event) => {
      const target = FindTipTarget(event.target);
      if (target) ShowTooltipFor(target);
    });
    On(root, "pointerout", (event) => {
      const target = FindTipTarget(event.target);
      const next = FindTipTarget(event.relatedTarget);
      if (target && target !== next) HideTooltip();
    });
    On(root, "focusin", (event) => {
      const target = FindTipTarget(event.target);
      if (target) ShowTooltipFor(target);
    });
    On(root, "focusout", () => HideTooltip());

    const keyTarget = typeof window !== "undefined" && window ? window : doc;
    On(keyTarget, "keydown", HandleKeyDown);
    On(keyTarget, "resize", () => {
      MeasureTopBar();
      cache.minimapKey = "";
      DrawMinimap();
      HideTooltip();
      UpdateScrollAffordance(dom.resourceBar);
      UpdateScrollAffordance(dom.context);
      if (activePanel) RenderPanel(activePanel, cache.panelPayload);
    });
  }

  /**
   * 顶栏高度随资源条换行、时期刻度显隐而变，写死 top 必然在某个视口下压叠。
   * 这里实测一次写进 --pf-topbar-h，让仪表条与略图始终吊在顶栏下沿。
   */
  function MeasureTopBar() {
    if (!dom.topBar || !root.style) return;
    const height = Math.round(RectOf(dom.topBar).height || 0);
    if (!height || height === cache.topBarHeight) return;
    cache.topBarHeight = height;
    root.style.setProperty("--pf-topbar-h", `${height}px`);
  }

  function IsTypingTarget(node) {
    if (!node || !node.tagName) return false;
    const tag = String(node.tagName).toUpperCase();
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || node.isContentEditable === true;
  }

  function HandleKeyDown(event) {
    if (disposed) return;
    const key = event.key;
    if (key === "Escape") {
      if (activeCinematic) {
        if (activeCinematic.dismissible) ResolveCinematic(null);
        event.preventDefault();
        return;
      }
      if (activeConfirm) {
        ResolveConfirm(false);
        event.preventDefault();
        return;
      }
      if (activePanel) {
        ShowPanel(null);
        event.preventDefault();
        return;
      }
      Call("OnSelectHex", null);
      return;
    }
    if (IsTypingTarget(event.target)) return;
    if (activeCinematic || activeConfirm) return;

    if (key === " " || key === "Spacebar") {
      const tag = event.target && event.target.tagName ? String(event.target.tagName).toUpperCase() : "";
      if (tag === "BUTTON" || tag === "A") return;
      event.preventDefault();
      RequestEndTurn();
      return;
    }
    if (key === "?" || (key === "/" && event.shiftKey)) {
      event.preventDefault();
      ShowPanel("Help");
      return;
    }
    if (key >= "1" && key <= "9") {
      const panel = panelDefinitions[Number(key) - 1];
      if (panel) {
        event.preventDefault();
        ShowPanel(activePanel === panel.key ? null : panel.key);
      }
      return;
    }
    if (key.indexOf("Arrow") === 0) {
      const map = { ArrowRight: 0, ArrowUp: 2, ArrowLeft: 3, ArrowDown: 5 };
      const index = map[key];
      if (index === undefined) return;
      const selected = currentView && currentView.selectedKey;
      if (!selected) return;
      event.preventDefault();
      const origin = ParseHexKey(selected);
      const direction = hexDirections[index];
      const nextKey = HexKey(origin.q + direction.q, origin.r + direction.r);
      if (currentState && currentState.map && currentState.map.hexes && !currentState.map.hexes[nextKey]) return;
      Call("OnSelectHex", nextKey);
      return;
    }
    // 行动快捷键：只认当前行动栏里实际存在的那一条
    const upper = String(key).toUpperCase();
    const action = cache.hotkeyIndex && cache.hotkeyIndex[upper];
    if (action) {
      event.preventDefault();
      if (action.enabled === false) Toast(action.reason || "现在还做不了这件事。", "warn");
      else TriggerAction(action);
    }
  }

  function RequestEndTurn() {
    if (busy || (currentState && currentState.over)) return;
    Call("OnEndTurn");
  }

  /** 把 Rules 给出的 action 对象原样交回主循环（契约见 Script_Main.hooks.OnUnitAction）。 */
  function TriggerAction(action) {
    if (!action || action.enabled === false) return;
    Call("OnUnitAction", action);
  }

  // ---- 时期与派生数据 ------------------------------------------------------

  function ResolveEra(state) {
    const supplied =
      (currentView && currentView.era) ||
      (state && state.eraInfo) ||
      null;
    const fallback =
      (state && state.eraKey && eraDefinitionsFallback.find((item) => item.key === state.eraKey)) ||
      EraForTurn(state ? state.turn : 0);
    if (!supplied) return fallback;
    return {
      key: supplied.key || fallback.key,
      name: supplied.name || fallback.name,
      turnRange: supplied.turnRange || fallback.turnRange,
      summary: supplied.summary || fallback.summary,
      dateRange: supplied.dateRange || null,
    };
  }

  /** 待办清单：优先采用 Rules.GetTurnBriefing 的口径，缺省时自行从 state 推导。 */
  function ComputeTodos(state, view) {
    if (view && Array.isArray(view.todos)) return view.todos;
    const todos = [];
    if (!state) return todos;
    const units = Array.isArray(state.units) ? state.units : [];
    const idle = units.filter((unit) => !unit.acted && (unit.moves || 0) > 0);
    const briefing = view && view.briefing;
    const pendingUnits = briefing && briefing.pendingUnits !== undefined ? briefing.pendingUnits : idle.length;
    if (pendingUnits > 0) {
      todos.push({ id: "idle", text: "队伍未行动", count: pendingUnits, focusKey: idle.length ? idle[0].key : null });
    }
    const research = state.research || {};
    const needsResearch = briefing ? !!briefing.needsResearch : !research.currentId;
    const needsDoctrine = briefing ? !!briefing.needsDoctrine : !research.currentDoctrineId;
    if (needsResearch) todos.push({ id: "research", text: "技术方向未选", count: 1, panel: "Tech" });
    if (needsDoctrine) todos.push({ id: "doctrine", text: "群众工作方向未选", count: 1, panel: "Doctrine" });
    const policy = state.policy || {};
    const slots = Number(policy.slots) || 0;
    const equipped = Array.isArray(policy.equipped) ? policy.equipped.filter(Boolean).length : 0;
    const open = briefing && briefing.openPolicySlots !== undefined ? briefing.openPolicySlots : Math.max(0, slots - equipped);
    if (open > 0) todos.push({ id: "policy", text: "政策槽空缺", count: open, panel: "Policy" });
    return todos;
  }

  // ---- Sync：全量刷新（内部 diff） ----------------------------------------

  function Sync(state, view) {
    if (disposed) return;
    const stateChanged = state !== cache.lastState;
    currentState = state || currentState || {};
    currentView = NormalizeView(currentState, view);
    cache.lastState = state || cache.lastState;
    cache.lastView = currentView;

    EnsureDefinitions();
    MeasureTopBar();
    RenderEra(currentState);
    RenderResources(currentState, stateChanged);
    RenderMeters(currentState);
    RenderSweep(currentState);
    RenderMinimap(currentState, currentView, stateChanged);
    RenderContext(currentState, currentView);
    EnsureUnitSelection(currentState, currentView);
    RenderEndTurn(currentState, currentView);
    RenderNotify(currentState);
    RenderTabBadges(currentState, currentView);
    if (currentView.hint !== null && currentView.hint !== undefined) SetHint(currentView.hint);
    if (activePanel) RenderPanel(activePanel, cache.panelPayload);
    SetFlag(root, "is-over", !!currentState.over);
  }

  /**
   * 归一化 view。字段口径以 Script_Main 的 view 对象为准
   * （selectedKey / selectedUnitId / hoverKey / actions / reachable / attackTargets /
   *  preview / panel / quality / muted / difficulty / busy / hint / briefing），
   * 其余字段为可选增强，缺省时由本模块自行从 state 与 Data_* 推导。
   */
  function NormalizeView(state, view) {
    const source = view || {};
    return {
      selectedKey: source.selectedKey ?? null,
      hoverKey: source.hoverKey ?? null,
      selectedUnitId: source.selectedUnitId ?? null,
      cameraKey: source.cameraKey ?? source.selectedKey ?? null,
      viewRadius: Number(source.viewRadius) || 5,
      frameKeys: Array.isArray(source.frameKeys) ? source.frameKeys : null,
      actions: Array.isArray(source.actions) ? source.actions : [],
      reachable: Array.isArray(source.reachable) ? source.reachable : [],
      attackTargets: Array.isArray(source.attackTargets) ? source.attackTargets : [],
      preview: source.preview || null,
      briefing: source.briefing || null,
      panel: source.panel ?? null,
      todos: Array.isArray(source.todos) ? source.todos : null,
      notifications: Array.isArray(source.notifications) ? source.notifications : null,
      incomeDetail: source.incomeDetail || null,
      terrainColors: source.terrainColors || null,
      era: source.era || null,
      tech: source.tech || null,
      doctrine: source.doctrine || null,
      policy: source.policy || null,
      base: source.base || null,
      intel: source.intel || null,
      ledger: source.ledger || null,
      quality: source.quality || currentView.quality || "high",
      muted: source.muted === undefined ? !!currentView.muted : !!source.muted,
      difficulty: source.difficulty || (state && state.difficulty) || currentView.difficulty || "Normal",
      seed: source.seed ?? (state && state.seed) ?? 1937,
      hint: source.hint === undefined ? null : source.hint,
      busy: !!source.busy,
    };
  }

  function RenderEra(state) {
    const era = ResolveEra(state);
    const turn = Number(state.turn) || 0;
    const maxTurns = Number(state.maxTurns) || 32;
    const date = FormatTurnDate(turn);
    SetText(dom.eraName, era.name);
    SetText(dom.eraDate, date.label);
    SetAttr(dom.eraDate, "title", era.dateRange || `${era.name}：第 ${era.turnRange[0] + 1} – ${era.turnRange[1] + 1} 回合`);
    SetText(dom.eraTurn, `回合 ${turn + 1} / ${maxTurns}`);
    SetText(dom.eraPhase, state.phaseKey ? `· ${state.phaseKey}` : "");
    const span = Math.max(1, era.turnRange[1] - era.turnRange[0] + 1);
    const progress = PercentOf(turn - era.turnRange[0] + 1, span);
    SetBarWidth(dom.eraFill, progress);
    SetAttr(dom.eraTrack, "aria-valuenow", Math.round(progress));
    SetAttr(dom.eraTrack, "aria-valuetext", `${era.name} ${Math.round(progress)}%`);
    SetAttr(root, "data-era", era.key);
    // 时期刻度高亮
    if (dom.eraTicks && dom.eraTicks.childNodes) {
      const ticks = dom.eraTicks.childNodes;
      for (let index = 0; index < ticks.length; index += 1) {
        const node = ticks[index];
        const item = eraDefinitionsFallback[index];
        if (!node || !item) continue;
        SetFlag(node, "is-past", turn > item.turnRange[1]);
        SetFlag(node, "is-now", turn >= item.turnRange[0] && turn <= item.turnRange[1]);
      }
    }
  }

  function RenderResources(state, stateChanged) {
    const stock = state.stock || {};
    const income = state.income || {};
    for (const resource of resourceDefinitions) {
      const nodes = dom.resourceNodes[resource.key];
      if (!nodes) continue;
      const amount = Number(stock[resource.key]) || 0;
      const delta = Number(income[resource.key]) || 0;
      const previous = cache.resource[resource.key];
      SetText(nodes.stock, FormatNumber(amount));
      SetText(nodes.delta, FormatSigned(delta));
      SetFlag(nodes.delta, "is-good", delta > 0);
      SetFlag(nodes.delta, "is-bad", delta < 0);
      SetFlag(nodes.chip, "is-empty", amount <= 0);
      SetFlag(nodes.chip, "is-scarce", amount > 0 && amount < 10);
      SetAttr(nodes.chip, "aria-label", `${resource.full} ${FormatNumber(amount)}，本回合 ${FormatSigned(delta)}`);
      if (stateChanged && previous !== undefined && previous !== amount) {
        FlashResource(resource.key, amount - previous);
      }
      cache.resource[resource.key] = amount;
    }
    UpdateScrollAffordance(dom.resourceBar);
  }

  function RenderMeters(state) {
    const specs = [
      { key: "exposure", name: "暴露度", bands: ["隐蔽", "有风声", "已被盯上", "扫荡在即"] },
      { key: "alert", name: "警备度", bands: ["松弛", "加强巡逻", "增兵设卡", "全区戒严"] },
    ];
    const spoken = [];
    for (const spec of specs) {
      const nodes = dom.meterNodes[spec.key];
      if (!nodes) continue;
      const amount = Clamp(Math.round(Number(state[spec.key]) || 0), 0, 100);
      SetText(nodes.value, String(amount));
      SetBarWidth(nodes.fill, amount);
      SetAttr(nodes.track, "aria-valuenow", amount);
      const bandIndex = amount >= 85 ? 3 : amount >= 60 ? 2 : amount >= 30 ? 1 : 0;
      SetText(nodes.band, spec.bands[bandIndex]);
      SetFlag(nodes.meter, "is-warn", bandIndex === 2);
      SetFlag(nodes.meter, "is-danger", bandIndex === 3);
      SetAttr(nodes.track, "aria-valuetext", `${amount}，${spec.bands[bandIndex]}`);
      if (cache.meterBands && cache.meterBands[spec.key] !== undefined && cache.meterBands[spec.key] !== bandIndex) {
        spoken.push(`${spec.name}${amount}，${spec.bands[bandIndex]}`);
      }
      if (!cache.meterBands) cache.meterBands = {};
      cache.meterBands[spec.key] = bandIndex;
    }
    if (spoken.length) SetText(dom.meterSpoken, spoken.join("；"));
  }

  /**
   * 扫荡预警。优先采用 view.briefing.forecast（Rules.ForecastSweep 的结果，含 confidence），
   * 没有 briefing 时退回 state.sweep。这是本作最核心的张力提示，必须醒目。
   */
  function RenderSweep(state) {
    const forecast = (currentView && currentView.briefing && currentView.briefing.forecast) || state.sweep || null;
    cache.forecast = forecast;
    if (!forecast || !forecast.targetKey) {
      SetAttr(dom.sweepBanner, "hidden", true);
      SetFlag(dom.sweepBanner, "is-open", false);
      SetFlag(root, "has-sweep", false);
      return;
    }
    SetAttr(dom.sweepBanner, "hidden", null);
    SetFlag(dom.sweepBanner, "is-open", true);
    SetFlag(root, "has-sweep", true);
    const turns = Math.max(0, Number(forecast.turnsUntil) || 0);
    const strength = Number(forecast.strength) || 0;
    const axisCount = (forecast.axisKeys && forecast.axisKeys.length) || 0;
    const confidence = forecast.confidence === undefined ? null : Number(forecast.confidence);
    SetText(dom.sweepTitle, turns <= 0 ? "扫荡已经开始" : "扫荡预警");
    const target = HexLabel(state, forecast.targetKey);
    const parts = [];
    parts.push(axisCount ? `敌军自 ${axisCount} 条轴线合击${target}` : `敌军正向${target}合击`);
    if (strength > 0) parts.push(`估计兵力 ${FormatNumber(strength)}`);
    parts.push("坚壁清野、转移群众、主力跳出合围圈");
    let detail = `${parts.join("，")}。`;
    if (confidence !== null && confidence < 0.45) {
      detail += ` 该区情报覆盖仅 ${Math.round(confidence * 100)}%，判断可能有误，轴线与落点都还没吃准。`;
    }
    SetText(dom.sweepDetail, detail);
    SetText(dom.sweepCountdown, turns <= 0 ? "现在" : `${turns} 回合`);
    SetFlag(dom.sweepBanner, "is-imminent", turns <= 1);
    SetFlag(dom.sweepBanner, "is-vague", confidence !== null && confidence < 0.45);
    SetAttr(
      dom.sweepBanner,
      "aria-label",
      `扫荡预警：${turns <= 0 ? "已经开始" : `还有 ${turns} 回合`}，目标 ${target}`
    );
  }

  function HexLabel(state, key) {
    if (!key) return "未明";
    const hex = state && state.map && state.map.hexes ? state.map.hexes[key] : null;
    if (!hex) return key;
    const feature = hex.feature && featureDisplay[hex.feature] ? featureDisplay[hex.feature].name : null;
    const terrain = terrainDisplay[hex.terrain] ? terrainDisplay[hex.terrain].name : hex.terrain;
    return feature ? `${feature}（${terrain}）` : `${terrain} ${FormatHexCoord(key)}`;
  }

  // ---- 小地图 -------------------------------------------------------------

  function ComputeMinimapLayout(state) {
    const canvas = dom.minimapCanvas;
    if (!canvas) return null;
    const map = state && state.map;
    if (!map || !map.order || !map.order.length) return null;
    const rect = RectOf(canvas);
    const cssWidth = Math.max(120, Math.round(rect.width || canvas.clientWidth || 320));
    const cssHeight = Math.max(90, Math.round(rect.height || canvas.clientHeight || 240));
    const ratio =
      typeof window !== "undefined" && window && window.devicePixelRatio ? Clamp(window.devicePixelRatio, 1, 2) : 1;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const key of map.order) {
      const coord = ParseHexKey(key);
      const world = HexToWorld(coord.q, coord.r, 1);
      if (world.x < minX) minX = world.x;
      if (world.x > maxX) maxX = world.x;
      if (world.z < minZ) minZ = world.z;
      if (world.z > maxZ) maxZ = world.z;
    }
    minX -= 1;
    maxX += 1;
    minZ -= 1;
    maxZ += 1;
    const spanX = Math.max(0.001, maxX - minX);
    const spanZ = Math.max(0.001, maxZ - minZ);
    const scale = Math.min(cssWidth / spanX, cssHeight / spanZ);
    return {
      cssWidth,
      cssHeight,
      ratio,
      minX,
      minZ,
      scale,
      offsetX: (cssWidth - spanX * scale) / 2,
      offsetY: (cssHeight - spanZ * scale) / 2,
    };
  }

  function WorldToMinimap(layout, world) {
    return {
      x: layout.offsetX + (world.x - layout.minX) * layout.scale,
      y: layout.offsetY + (world.z - layout.minZ) * layout.scale,
    };
  }

  function MinimapToKey(layout, px, py) {
    const worldX = (px - layout.offsetX) / layout.scale + layout.minX;
    const worldZ = (py - layout.offsetY) / layout.scale + layout.minZ;
    const coord = WorldToHex(worldX, worldZ, 1);
    return HexKey(coord.q, coord.r);
  }

  function RenderMinimap(state, view, stateChanged) {
    if (minimapCollapsed) return;
    const signature = [
      state.turn,
      (state.units && state.units.length) || 0,
      (state.enemies && state.enemies.length) || 0,
      state.sweep ? `${state.sweep.targetKey}:${state.sweep.turnsUntil}` : "-",
      view.cameraKey || "-",
      view.selectedKey || "-",
      stateChanged ? "s" : "n",
    ].join("|");
    if (signature === cache.minimapKey && !stateChanged) return;
    cache.minimapKey = signature;
    DrawMinimap();
  }

  function DrawMinimap() {
    const canvas = dom.minimapCanvas;
    const state = currentState;
    if (!canvas || !state) return;
    const ctx = canvas.getContext ? canvas.getContext("2d") : null;
    if (!ctx) return;
    const layout = ComputeMinimapLayout(state);
    if (!layout) return;
    cache.minimapLayout = layout;
    const pixelWidth = Math.round(layout.cssWidth * layout.ratio);
    const pixelHeight = Math.round(layout.cssHeight * layout.ratio);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    if (ctx.setTransform) ctx.setTransform(layout.ratio, 0, 0, layout.ratio, 0, 0);
    ctx.clearRect(0, 0, layout.cssWidth, layout.cssHeight);
    ctx.fillStyle = "#161311";
    ctx.fillRect(0, 0, layout.cssWidth, layout.cssHeight);

    const corners = HexCornerOffsets(1);
    const map = state.map || {};
    const hexes = map.hexes || {};
    const order = map.order || [];
    const palette = (currentView && currentView.terrainColors) || null;

    for (const key of order) {
      const hex = hexes[key];
      if (!hex) continue;
      const coord = ParseHexKey(key);
      const point = WorldToMinimap(layout, HexToWorld(coord.q, coord.r, 1));
      ctx.beginPath();
      for (let index = 0; index < 6; index += 1) {
        const corner = corners[index];
        const cx = point.x + corner.x * layout.scale;
        const cy = point.y + corner.z * layout.scale;
        if (index === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      }
      ctx.closePath();
      let color = (palette && palette[hex.terrain]) || (terrainDisplay[hex.terrain] || {}).color || "#6a5f4d";
      if (!hex.explored) {
        color = "#241f1a";
      } else {
        const control = controlDisplay[hex.control];
        if (control) color = MixColors(color, control.color, hex.control === "Base" ? 0.5 : 0.34);
        if (!hex.visibility) color = MixColors(color, "#2a2621", 0.42);
        if (hex.scorch > 20) color = MixColors(color, "#3a2b22", Clamp(hex.scorch / 160, 0, 0.45));
      }
      ctx.fillStyle = color;
      ctx.fill();
      if (hex.railway) {
        ctx.strokeStyle = "rgba(228,214,182,0.5)";
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }
    }

    // 据点 / 根据地
    for (const stronghold of state.strongholds || []) {
      if (!stronghold || !stronghold.key) continue;
      const hex = hexes[stronghold.key];
      if (hex && !hex.explored) continue;
      const coord = ParseHexKey(stronghold.key);
      const point = WorldToMinimap(layout, HexToWorld(coord.q, coord.r, 1));
      ctx.fillStyle = "#8c2f24";
      ctx.strokeStyle = "rgba(20,18,16,0.85)";
      ctx.lineWidth = 1;
      const size = Math.max(3, layout.scale * 0.6);
      ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size);
      ctx.strokeRect(point.x - size / 2, point.y - size / 2, size, size);
    }
    for (const base of state.bases || []) {
      if (!base || !base.key) continue;
      const coord = ParseHexKey(base.key);
      const point = WorldToMinimap(layout, HexToWorld(coord.q, coord.r, 1));
      ctx.beginPath();
      ctx.arc(point.x, point.y, Math.max(3.5, layout.scale * 0.72), 0, Math.PI * 2);
      ctx.strokeStyle = "#e8dcc0";
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    // 单位点
    for (const unit of state.units || []) {
      if (!unit || !unit.key) continue;
      const coord = ParseHexKey(unit.key);
      const point = WorldToMinimap(layout, HexToWorld(coord.q, coord.r, 1));
      ctx.beginPath();
      ctx.arc(point.x, point.y, Math.max(2.2, layout.scale * 0.42), 0, Math.PI * 2);
      ctx.fillStyle = unit.hidden ? "#9fd08a" : "#e8dcc0";
      ctx.fill();
    }
    for (const enemy of state.enemies || []) {
      if (!enemy || !enemy.key) continue;
      if (enemy.visibleToPlayer === false) continue;
      const coord = ParseHexKey(enemy.key);
      const point = WorldToMinimap(layout, HexToWorld(coord.q, coord.r, 1));
      ctx.beginPath();
      ctx.arc(point.x, point.y, Math.max(2.2, layout.scale * 0.42), 0, Math.PI * 2);
      ctx.fillStyle = "#e0604c";
      ctx.fill();
    }

    // 扫荡箭头
    const sweep = cache.forecast || state.sweep;
    if (sweep && sweep.targetKey) {
      const targetCoord = ParseHexKey(sweep.targetKey);
      const targetPoint = WorldToMinimap(layout, HexToWorld(targetCoord.q, targetCoord.r, 1));
      const axis = Array.isArray(sweep.axisKeys) && sweep.axisKeys.length ? sweep.axisKeys : [];
      ctx.strokeStyle = "rgba(224,96,76,0.92)";
      ctx.lineWidth = 2;
      for (const key of axis) {
        const coord = ParseHexKey(key);
        const point = WorldToMinimap(layout, HexToWorld(coord.q, coord.r, 1));
        DrawArrow(ctx, point, targetPoint);
      }
      ctx.beginPath();
      ctx.arc(targetPoint.x, targetPoint.y, Math.max(5, layout.scale * 1.1), 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(224,96,76,0.95)";
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }

    // 选中格
    const selected = currentView && currentView.selectedKey;
    if (selected && hexes[selected]) {
      const coord = ParseHexKey(selected);
      const point = WorldToMinimap(layout, HexToWorld(coord.q, coord.r, 1));
      ctx.beginPath();
      ctx.arc(point.x, point.y, Math.max(4, layout.scale * 0.95), 0, Math.PI * 2);
      ctx.strokeStyle = "#f0d27a";
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }

    // 视野框
    DrawViewFrame(ctx, layout);
  }

  function DrawArrow(ctx, from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length < 2) return;
    const ux = dx / length;
    const uy = dy / length;
    const endX = to.x - ux * 6;
    const endY = to.y - uy * 6;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - ux * 6 - uy * 3.4, endY - uy * 6 + ux * 3.4);
    ctx.lineTo(endX - ux * 6 + uy * 3.4, endY - uy * 6 - ux * 3.4);
    ctx.closePath();
    ctx.fillStyle = "rgba(224,96,76,0.92)";
    ctx.fill();
  }

  function DrawViewFrame(ctx, layout) {
    const view = currentView || {};
    let keys = view.frameKeys;
    if ((!keys || !keys.length) && view.cameraKey) {
      keys = [view.cameraKey];
    }
    if (!keys || !keys.length) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const key of keys) {
      const coord = ParseHexKey(key);
      const point = WorldToMinimap(layout, HexToWorld(coord.q, coord.r, 1));
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    }
    if (!Number.isFinite(minX)) return;
    if (view.frameKeys && view.frameKeys.length) {
      minX -= layout.scale;
      maxX += layout.scale;
      minY -= layout.scale;
      maxY += layout.scale;
    } else {
      const radius = (Number(view.viewRadius) || 5) * layout.scale * 1.5;
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      minX = cx - radius;
      maxX = cx + radius;
      minY = cy - radius * 0.66;
      maxY = cy + radius * 0.66;
    }
    ctx.save();
    ctx.strokeStyle = "rgba(232,220,192,0.85)";
    ctx.lineWidth = 1.4;
    if (ctx.setLineDash) ctx.setLineDash([4, 3]);
    ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
    ctx.restore();
  }

  function MixColors(hexA, hexB, amount) {
    const a = ParseHexColor(hexA);
    const b = ParseHexColor(hexB);
    const t = Clamp(amount, 0, 1);
    const r = Math.round(a[0] + (b[0] - a[0]) * t);
    const g = Math.round(a[1] + (b[1] - a[1]) * t);
    const bl = Math.round(a[2] + (b[2] - a[2]) * t);
    return `rgb(${r},${g},${bl})`;
  }

  function ParseHexColor(value) {
    const text = String(value || "#000000").replace("#", "");
    if (text.length === 3) {
      return [
        parseInt(text[0] + text[0], 16),
        parseInt(text[1] + text[1], 16),
        parseInt(text[2] + text[2], 16),
      ];
    }
    return [
      parseInt(text.slice(0, 2), 16) || 0,
      parseInt(text.slice(2, 4), 16) || 0,
      parseInt(text.slice(4, 6), 16) || 0,
    ];
  }

  function HandleMinimapClick(event) {
    const layout = cache.minimapLayout;
    if (!layout) return;
    const rect = RectOf(dom.minimapCanvas);
    const px = (event.clientX || 0) - rect.left;
    const py = (event.clientY || 0) - rect.top;
    const key = MinimapToKey(layout, px, py);
    if (currentState && currentState.map && currentState.map.hexes && !currentState.map.hexes[key]) return;
    Call("OnFocusHex", key, { reason: "Minimap" });
    Call("OnSelectHex", key);
  }

  function HandleMinimapHover(event) {
    const layout = cache.minimapLayout;
    if (!layout || !currentState) return;
    const rect = RectOf(dom.minimapCanvas);
    const key = MinimapToKey(layout, (event.clientX || 0) - rect.left, (event.clientY || 0) - rect.top);
    const hex = currentState.map && currentState.map.hexes ? currentState.map.hexes[key] : null;
    if (!hex) return;
    const control = controlDisplay[hex.control] || { name: "未明" };
    RenderTooltip({
      title: HexLabel(currentState, key),
      body: hex.explored ? control.name : "尚未侦察",
      rows: hex.explored
        ? [
            { label: "群众基础", value: `${Math.round(hex.massBase || 0)} / 100` },
            { label: "情报覆盖", value: `${Math.round(hex.intel || 0)}%` },
          ]
        : [],
      footer: "点击跳转",
    });
    SetFlag(dom.tooltip, "is-open", true);
    SetAttr(dom.tooltip, "aria-hidden", "false");
    PlaceTooltip(dom.minimapCanvas);
  }

  // ---- 底部地块 / 单位面板 -------------------------------------------------

  function RenderContext(state, view) {
    const signature = [
      view.selectedKey || "-",
      view.selectedUnitId || "-",
      state.turn,
      state === cache.contextState ? "0" : "1",
      (view.actions || []).map((action) => `${action.kind}:${action.label}:${action.enabled !== false ? 1 : 0}`).join(","),
      definitions.loaded ? "d" : "-",
    ].join("|");
    if (signature === cache.signatures.context) return;
    cache.signatures.context = signature;
    cache.contextState = state;

    const hexes = (state.map && state.map.hexes) || {};
    const hex = view.selectedKey ? hexes[view.selectedKey] : null;
    const unit = view.selectedUnitId
      ? (state.units || []).find((item) => item.id === view.selectedUnitId) || null
      : null;

    SetFlag(dom.context, "is-empty", !hex && !unit);
    RenderTileCard(state, view, hex);
    RenderUnitCard(state, view, unit);
    RenderActionRail(state, view, unit);
    UpdateScrollAffordance(dom.context);
  }

  /**
   * 主流程在每次 EndTurn 结束时会把 view.selectedUnitId 清空，而 view.selectedKey 仍停在原地；
   * 于是"选中的地块明明驻着队伍"却渲染成「选中一支队伍后，这里会列出可用行动。」。
   * 这里替玩家补上一次自动选中：每个 (地块, 回合) 只补一次，绝不与主流程来回打架。
   */
  function EnsureUnitSelection(state, view) {
    if (!view || !view.selectedKey) return;
    const token = `${view.selectedKey}|${state ? state.turn : 0}`;
    if (view.selectedUnitId) {
      cache.autoSelectToken = token;
      return;
    }
    if (cache.autoSelectToken === token) return;
    const garrison = UnitsAtKey(state, view.selectedKey);
    if (!garrison.length) return;
    cache.autoSelectToken = token;
    // 延后一拍再回调：Sync 正在渲染途中，同步回调会让主流程在渲染中重入。
    Later(() => {
      if (disposed) return;
      const now = currentView || {};
      if (now.selectedKey !== view.selectedKey || now.selectedUnitId) return;
      Call("OnSelectHex", view.selectedKey, { unitId: garrison[0].id });
    }, 0);
  }

  function UnitsAtKey(state, key) {
    if (!state || !key) return [];
    const units = Array.isArray(state.units) ? state.units : [];
    return units.filter((item) => item && item.key === key);
  }

  function RenderTileCard(state, view, hex) {
    const card = ClearNode(dom.tileCard);
    if (!hex) {
      El("div", "pf-empty", { text: "未选中地块。点选地图，或用方向键移动选择。", parent: card });
      return;
    }
    const terrain = LookupName("terrainDefinitions", hex.terrain, terrainDisplay) || { name: hex.terrain, note: "" };
    const feature = LookupName("featureDefinitions", hex.feature, featureDisplay);
    const controlDefinition = DefinitionTable("controlDefinitions")[hex.control];
    const control = Object.assign(
      { name: "未明", color: "#5c6b62" },
      controlDisplay[hex.control] || {},
      controlDefinition ? { name: controlDefinition.name || controlDisplay[hex.control]?.name } : {}
    );

    const head = El("div", "pf-card-head", { parent: card });
    const title = El("div", "pf-card-title", { parent: head });
    const headline = feature ? feature.name : terrain.name;
    El("span", "pf-card-name", { text: headline, parent: title });
    // 没有地物时标题本身就是地形名，副标题只留坐标，避免"丘陵 / 丘陵 · 7,5"这种重复。
    El("span", "pf-card-sub", {
      text: feature ? `${terrain.name} · ${FormatHexCoord(hex.key)}` : FormatHexCoord(hex.key),
      parent: title,
    });
    const badge = El("span", "pf-control-badge", { text: control.name, parent: head });
    if (badge.style) {
      badge.style.borderColor = control.color;
      badge.style.color = control.color;
    }

    const grid = El("div", "pf-tile-grid", { parent: card });
    AddFact(grid, "道路", hex.road === 2 ? "公路" : hex.road === 1 ? "土路" : "无");
    AddFact(grid, "铁路", hex.railway ? (hex.railBroken > 0 ? `已破坏（抢修 ${hex.railBroken} 回合）` : "通车") : "无");
    AddFact(grid, "地道", hex.tunnel ? "已通" : "未通");
    AddFact(grid, "高程", `${Math.round((hex.elevation || 0) * 100)}`);
    AddFact(grid, "情报", `${Math.round(hex.intel || 0)}%`);
    AddFact(grid, "视野", hex.visibility >= 2 ? "直视" : hex.visibility === 1 ? "耳目" : hex.explored ? "记忆" : "未侦察");
    if (hex.scorch > 0) AddFact(grid, "焚毁", `${Math.round(hex.scorch)}%`, "bad");

    const yields = El("div", "pf-yields", { parent: card, attrs: { "aria-label": "地块产出" } });
    for (const resource of resourceDefinitions) {
      if (resource.key === "cadre") continue;
      const amount = (hex.yields && hex.yields[resource.key]) || 0;
      const cell = El("span", "pf-yield", { parent: yields, attrs: { "data-res": resource.key } });
      El("i", "pf-yield-glyph", { text: resource.glyph, parent: cell, attrs: { "aria-hidden": "true" } });
      El("b", "pf-yield-value", { text: FormatNumber(amount), parent: cell });
      SetFlag(cell, "is-zero", !amount);
      AttachTooltip(cell, () => ({ title: resource.full, body: `本格基础产出 ${FormatNumber(amount)}。`, rows: [] }));
    }

    const mass = El("div", "pf-mass", { parent: card });
    const massHead = El("div", "pf-mass-head", { parent: mass });
    El("span", null, { text: "群众基础", parent: massHead });
    El("b", null, { text: `${Math.round(hex.massBase || 0)} / 100`, parent: massHead });
    const massTrack = El("div", "pf-mass-track", {
      parent: mass,
      attrs: {
        role: "progressbar",
        "aria-label": "群众基础",
        "aria-valuemin": "0",
        "aria-valuemax": "100",
        "aria-valuenow": Math.round(hex.massBase || 0),
      },
    });
    const massFill = El("i", "pf-mass-fill", { parent: massTrack });
    SetBarWidth(massFill, hex.massBase || 0);
    El("div", "pf-mass-note", {
      text: MassBaseNote(hex.massBase || 0),
      parent: mass,
    });

    if ((hex.scorch || 0) > 0) {
      El("div", "pf-scorch-note", {
        text: `此村曾遭焚掠（${Math.round(hex.scorch)}%），产出与人口恢复缓慢。`,
        parent: card,
      });
    }

    if (Array.isArray(hex.works) && hex.works.length) {
      const works = El("div", "pf-chips", { parent: card, attrs: { "aria-label": "已建工事" } });
      for (const work of hex.works) {
        const info = LookupName("workDefinitions", work, workDisplay) || { name: work };
        El("span", "pf-chip", {
          text: info.shortName ? `${info.name}` : info.name,
          parent: works,
          tip: { title: info.name, body: info.blurb || info.note || "" },
        });
      }
    }

    const garrison = (state.units || []).filter((unit) => unit.key === hex.key);
    if (garrison.length) {
      const list = El("div", "pf-garrison", { parent: card });
      El("span", "pf-garrison-label", { text: "驻军", parent: list });
      for (const unit of garrison) {
        const button = El("button", "pf-garrison-unit", {
          text: UnitName(unit),
          parent: list,
          attrs: { type: "button" },
        });
        SetFlag(button, "is-active", unit.id === view.selectedUnitId);
        On(button, "click", () => Call("OnSelectHex", hex.key, { unitId: unit.id }));
      }
    }

    // 开辟根据地在行动栏里也有一份（kind:'FoundBase'），这里给一个更醒目的入口。
    const foundAction = (view.actions || []).find((action) => action && action.kind === "FoundBase");
    if (foundAction) {
      const found = El("button", "pf-found-base", {
        text: foundAction.label || "在此开辟根据地",
        parent: card,
        attrs: { type: "button", disabled: foundAction.enabled === false ? true : null },
      });
      AttachTooltip(found, () => ({
        title: foundAction.label || "开辟根据地",
        body: "派出骨干与工作队，在群众基础较好的村庄立起党政军三套架子。",
        rows: CostRows(foundAction.cost),
        footer: foundAction.enabled === false ? foundAction.reason || "条件不足" : "消耗干部，暴露度会上升。",
      }));
      On(found, "click", () => {
        if (foundAction.enabled === false) {
          Toast(foundAction.reason || "现在还立不起来。", "warn");
          return;
        }
        Call("OnFoundBase", { unitId: foundAction.unitId || view.selectedUnitId, key: foundAction.key || hex.key });
      });
    }
  }

  function MassBaseNote(value) {
    if (value >= 80) return "子弟兵进村不用敲门，消息树一倒全村就动。";
    if (value >= 60) return "群众肯掩护，也肯出担架队。";
    if (value >= 35) return "面上过得去，深处还没扎根。";
    if (value >= 15) return "只认粮不认人，需要工作队长住。";
    return "村里还怕报复，见了队伍就关门。";
  }

  function AddFact(parent, label, value, tone) {
    const cell = El("div", `pf-fact${tone ? ` is-${tone}` : ""}`, { parent });
    El("span", "pf-fact-label", { text: label, parent: cell });
    El("b", "pf-fact-value", { text: SafeText(value), parent: cell });
    return cell;
  }

  function UnitName(unit) {
    if (!unit) return "队伍";
    if (unit.name) return unit.name;
    const definition = DefinitionTable("unitDefinitions")[unit.type];
    return (definition && definition.name) || unit.type || "队伍";
  }

  function RenderUnitCard(state, view, unit) {
    const card = ClearNode(dom.unitCard);
    if (!unit) {
      SetFlag(dom.unitCard, "is-hidden", true);
      return;
    }
    SetFlag(dom.unitCard, "is-hidden", false);
    const head = El("div", "pf-card-head", { parent: card });
    const title = El("div", "pf-card-title", { parent: head });
    El("span", "pf-card-name", { text: UnitName(unit), parent: title });
    El("span", "pf-card-sub", { text: `第 ${SafeText(unit.level, 1)} 级 · ${FormatHexCoord(unit.key)}`, parent: title });
    const stateChips = El("div", "pf-unit-flags", { parent: head });
    El("span", `pf-flag ${unit.hidden ? "is-hidden-good" : "is-exposed"}`, {
      text: unit.hidden ? "隐蔽" : "暴露",
      parent: stateChips,
      tip: {
        title: unit.hidden ? "隐蔽状态" : "已暴露",
        body: unit.hidden
          ? "在林地、山地、地道或群众掩护下不被发现，可以设伏。"
          : "敌军已掌握位置。尽快转移，否则会把扫荡引到村子上。",
      },
    });
    if ((unit.fatigue || 0) > 0) {
      El("span", "pf-flag is-tired", {
        text: `疲劳 ${Math.round(unit.fatigue)}`,
        parent: stateChips,
        tip: { title: "疲劳", body: "连续行军作战会累积疲劳，降低战力，休整可恢复。" },
      });
    }

    const bars = El("div", "pf-unit-bars", { parent: card });
    AddUnitBar(bars, "兵员", unit.hp || 0, unit.maxHp || 1, "hp");
    AddUnitBar(bars, "行动力", unit.moves || 0, unit.maxMoves || 1, "moves");
    AddUnitBar(bars, "经验", unit.xp || 0, unit.nextXp || 100, "xp");

    // 能力来自 Data_Units.unitDefinitions[type].abilities，再经 abilityDefinitions 取中文名。
    const unitDefinition = DefinitionTable("unitDefinitions")[unit.type] || {};
    const abilityKeys = Array.isArray(unit.abilities)
      ? unit.abilities
      : Array.isArray(unitDefinition.abilities)
        ? unitDefinition.abilities
        : [];
    if (abilityKeys.length) {
      const abilityTable = DefinitionTable("abilityDefinitions");
      const chips = El("div", "pf-chips", { parent: card, attrs: { "aria-label": "能力" } });
      for (const ability of abilityKeys) {
        const key = typeof ability === "string" ? ability : ability.id || ability.key;
        const entry = abilityTable[key] || (typeof ability === "object" ? ability : null);
        const name = (entry && entry.name) || key;
        El("span", "pf-chip", {
          text: name,
          parent: chips,
          tip: { title: name, body: (entry && (entry.summary || entry.blurb)) || "", footer: (entry && entry.detail) || "" },
        });
      }
    }
    if (unitDefinition.blurb) {
      El("div", "pf-unit-blurb", { text: unitDefinition.blurb, parent: card });
    }
    const orders = Array.isArray(unit.orders) ? unit.orders : unit.orders ? [unit.orders] : [];
    if (orders.length) {
      El("div", "pf-unit-orders", { text: `当前命令：${orders.join(" → ")}`, parent: card });
    }
  }

  function AddUnitBar(parent, label, value, max, kind) {
    const row = El("div", `pf-ubar is-${kind}`, { parent });
    const head = El("div", "pf-ubar-head", { parent: row });
    El("span", null, { text: label, parent: head });
    El("b", null, { text: `${FormatNumber(value)} / ${FormatNumber(max)}`, parent: head });
    const track = El("div", "pf-ubar-track", {
      parent: row,
      attrs: {
        role: "progressbar",
        "aria-label": label,
        "aria-valuemin": "0",
        "aria-valuemax": String(max),
        "aria-valuenow": String(Math.round(value)),
      },
    });
    const fill = El("i", "pf-ubar-fill", { parent: track });
    SetBarWidth(fill, PercentOf(value, max));
    // 兵员条按存量比例换档：满编不该顶着一条警戒红——红色要留给真正告急的时候。
    if (kind === "hp") {
      const ratio = max > 0 ? value / max : 0;
      SetFlag(row, "is-low", ratio < 0.35);
      SetFlag(row, "is-mid", ratio >= 0.35 && ratio < 0.7);
    }
    return row;
  }

  function RenderActionRail(state, view, unit) {
    const rail = ClearNode(dom.actionRail);
    cache.actionList = [];
    cache.hotkeyIndex = {};
    const actions = Array.isArray(view.actions) ? view.actions : [];
    if (!actions.length) {
      // 这一格驻着我方队伍却还没选中任何一支时，不能把玩家丢在"没有行动"的死胡同里，
      // 直接把驻军摆成一排一触即选的按钮（EnsureUnitSelection 通常已经替玩家点过了，
      // 这里是主流程未接管 unitId 时的兜底）。
      const garrison = unit ? [] : UnitsAtKey(state, view.selectedKey);
      if (garrison.length) {
        El("div", "pf-actions-lead", { text: "本格驻军 —— 点一支队伍即可列出它的行动：", parent: rail });
        for (const item of garrison) {
          const pick = El("button", "pf-action is-support pf-action-pick", {
            parent: rail,
            attrs: { type: "button", "data-action": "SelectUnit" },
          });
          El("span", "pf-action-name", { text: UnitName(item), parent: pick });
          El("small", "pf-action-cost", { text: item.acted ? "本回合已行动" : "待命", parent: pick });
          On(pick, "click", () => Call("OnSelectHex", item.key, { unitId: item.id }));
        }
        return;
      }
      El("div", "pf-empty", {
        text: unit ? "这支队伍在此处没有可执行的行动。" : "选中一支队伍后，这里会列出可用行动。",
        parent: rail,
      });
      return;
    }
    const usedHotkeys = new Set();
    for (const action of actions) {
      if (!action || !action.kind) continue;
      const meta = actionDefinitions.find((item) => item.kind === action.kind) || {
        name: action.kind,
        hint: "",
        tone: "support",
        hotkey: "",
      };
      const hotkey = meta.hotkey && !usedHotkeys.has(meta.hotkey) ? meta.hotkey : "";
      if (hotkey) {
        usedHotkeys.add(hotkey);
        cache.hotkeyIndex[hotkey] = action;
      }
      cache.actionList.push(action);
      const tone = action.danger ? "attack" : meta.tone || "support";
      const button = El("button", `pf-action is-${tone}`, {
        parent: rail,
        attrs: {
          type: "button",
          "data-action": action.kind,
          disabled: action.enabled === false ? true : null,
          "aria-keyshortcuts": hotkey || null,
        },
      });
      SetFlag(button, "is-danger", !!action.danger);
      El("span", "pf-action-name", { text: NormalizeActionLabel(action.label) || meta.name, parent: button });
      const costText = FormatCost(action.cost);
      El("small", "pf-action-cost", {
        text: costText || (action.enabled === false ? "不可用" : action.danger ? "代价很高" : "—"),
        parent: button,
      });
      if (hotkey) El("i", "pf-action-key", { text: hotkey, parent: button, attrs: { "aria-hidden": "true" } });
      AttachTooltip(button, () => BuildActionTip(action, meta, hotkey));
      On(button, "click", () => {
        if (action.enabled === false) {
          Toast(action.reason || "现在还做不了这件事。", "warn");
          return;
        }
        TriggerAction(action);
      });
    }
  }

  /**
   * 规范化行动标签。Rules 用 `修建${工事名}` 拼标签，而部分工事名自带动词
   * （如「修梯田」「挖地道」），拼出来会是「修建修梯田」。这里只做显示层去重，
   * 不改动 Rules 传来的 action 对象本身。
   */
  function NormalizeActionLabel(label) {
    if (!label) return "";
    return String(label)
      .replace(/^修建(修|挖|垒|设|架|埋)/, "$1")
      .replace(/^(修建|设置)\1/, "$1");
  }

  function BuildActionTip(action, meta, hotkey) {
    const rows = CostRows(action.cost);
    const preview = currentView && currentView.preview;
    if (preview && action.kind === "Attack") {
      if (preview.odds !== undefined) {
        rows.push({ label: "胜算", value: `${Math.round(Number(preview.odds) * 100)}%`, tone: "flat" });
      }
      if (preview.exposureDelta !== undefined) {
        rows.push({
          label: "暴露度",
          value: FormatSigned(preview.exposureDelta),
          tone: Number(preview.exposureDelta) > 0 ? "bad" : "good",
        });
      }
      for (const risk of preview.risks || []) {
        rows.push({ label: "风险", value: typeof risk === "string" ? risk : risk.text || "", tone: "warn" });
      }
    }
    if (Array.isArray(action.withdrawOptions) && action.withdrawOptions.length) {
      rows.push({ label: "撤往", value: action.withdrawOptions[0].label || action.withdrawOptions[0].key });
    }
    return {
      title: action.label || meta.name,
      body: action.hint || meta.hint || "",
      rows,
      footer:
        action.enabled === false
          ? `不可用：${action.reason || "条件不足"}`
          : action.danger
            ? "这条路会把扫荡引到村子上，慎选。"
            : hotkey
              ? `快捷键 ${hotkey}`
              : "",
    };
  }

  function FormatCost(cost) {
    if (!cost) return "";
    const parts = [];
    for (const resource of resourceDefinitions) {
      const amount = cost[resource.key];
      if (amount) parts.push(`${resource.name}${FormatNumber(amount)}`);
    }
    if (cost.moves) parts.push(`行动力${FormatNumber(cost.moves)}`);
    if (cost.turns) parts.push(`${FormatNumber(cost.turns)}回合`);
    return parts.join(" · ");
  }

  function CostRows(cost) {
    if (!cost) return [];
    const rows = [];
    for (const resource of resourceDefinitions) {
      const amount = cost[resource.key];
      if (!amount) continue;
      const stock = (currentState && currentState.stock && currentState.stock[resource.key]) || 0;
      rows.push({
        label: resource.full,
        value: `${FormatNumber(amount)}（存 ${FormatNumber(stock)}）`,
        tone: stock >= amount ? "flat" : "bad",
      });
    }
    if (cost.turns) rows.push({ label: "工期", value: `${FormatNumber(cost.turns)} 回合` });
    return rows;
  }

  // ---- 结束回合 / 待办 ----------------------------------------------------

  function RenderEndTurn(state, view) {
    const todos = ComputeTodos(state, view);
    const list = ClearNode(dom.todoList);
    for (const todo of todos.slice(0, 4)) {
      const item = El("li", "pf-todo-item", { parent: list });
      const button = El("button", "pf-todo-btn", { parent: item, attrs: { type: "button" } });
      El("span", "pf-todo-text", { text: todo.text, parent: button });
      if (todo.count) El("b", "pf-todo-count", { text: String(todo.count), parent: button });
      On(button, "click", () => {
        if (todo.panel) ShowPanel(todo.panel);
        else if (todo.focusKey) {
          Call("OnFocusHex", todo.focusKey, { reason: "Todo" });
          Call("OnSelectHex", todo.focusKey);
        }
      });
    }
    const pending = todos.reduce((sum, item) => sum + (item.count || 1), 0);
    SetFlag(dom.endButton, "is-pending", todos.length > 0);
    SetFlag(dom.endDock, "has-todo", todos.length > 0);
    SetText(dom.endTurnSub, state.over ? "战事已终" : todos.length ? `${pending} 项待办` : "空格");
    SetAttr(dom.endButton, "disabled", busy || state.over ? true : null);
    SetAttr(
      dom.endButton,
      "aria-label",
      todos.length ? `结束回合，还有 ${pending} 项待办` : "结束回合"
    );
  }

  function RenderTabBadges(state, view) {
    const counts = {
      Tech: view.tech && Array.isArray(view.tech.nodes)
        ? view.tech.nodes.filter((node) => node.state === "available").length
        : 0,
      Doctrine: view.doctrine && Array.isArray(view.doctrine.nodes)
        ? view.doctrine.nodes.filter((node) => node.state === "available").length
        : 0,
      Policy: Math.max(
        0,
        (Number(state.policy && state.policy.slots) || 0) -
          ((state.policy && Array.isArray(state.policy.equipped) ? state.policy.equipped.filter(Boolean).length : 0))
      ),
      Intel: view.intel && Array.isArray(view.intel.reports)
        ? view.intel.reports.filter((item) => item.unread).length
        : 0,
      Base: view.base && Array.isArray(view.base.bases)
        ? view.base.bases.filter((item) => !item.queue || !item.queue.length).length
        : 0,
    };
    for (const panel of panelDefinitions) {
      const nodes = dom.panelTabNodes[panel.key];
      if (!nodes) continue;
      const count = counts[panel.key] || 0;
      SetText(nodes.badge, count > 0 ? String(count) : "");
      SetFlag(nodes.badge, "is-on", count > 0);
      SetFlag(nodes.button, "is-active", activePanel === panel.key);
      SetAttr(nodes.button, "aria-pressed", activePanel === panel.key ? "true" : "false");
    }
  }

  // ---- 通知流 -------------------------------------------------------------

  function RenderNotify(state) {
    const entries = (currentView && currentView.notifications) || state.log || [];
    const tail = entries.slice(-6);
    const signature = tail.map((item) => `${item.turn || 0}:${item.text || item.message || ""}`).join("|");
    if (signature === cache.signatures.notify) return;
    cache.signatures.notify = signature;
    const list = ClearNode(dom.notify);
    for (const entry of tail) {
      const tone = entry.tone || entry.kind || "info";
      const line = El("div", `pf-note is-${tone}`, { parent: list });
      El("i", "pf-note-turn", { text: `${(entry.turn ?? state.turn ?? 0) + 1}`, parent: line });
      El("span", "pf-note-text", { text: entry.text || entry.message || "", parent: line });
    }
  }

  // ---- Toast --------------------------------------------------------------

  function Toast(text, kind = "info") {
    if (disposed || !dom.toastLayer) return;
    const node = El("div", `pf-toast is-${kind}`, { parent: dom.toastLayer });
    El("i", "pf-toast-mark", { parent: node, attrs: { "aria-hidden": "true" } });
    El("span", "pf-toast-text", { text: String(text), parent: node });
    while (dom.toastLayer.childNodes.length > 5) {
      dom.toastLayer.removeChild(dom.toastLayer.firstChild);
    }
    const life = kind === "bad" ? 6200 : kind === "warn" ? 5200 : 4200;
    Later(() => {
      SetFlag(node, "is-out", true);
      Later(() => {
        if (node.parentNode) node.parentNode.removeChild(node);
      }, 420);
    }, life);
    return node;
  }

  // ---- 资源浮动数字 -------------------------------------------------------

  function FlashResource(key, delta) {
    const nodes = dom.resourceNodes && dom.resourceNodes[key];
    if (!nodes || !delta) return;
    const tone = ToneForDelta(delta);
    const bubble = El("span", `pf-float is-${tone}`, { text: FormatSigned(delta), parent: nodes.floatLayer });
    SetFlag(nodes.chip, `is-flash-${tone}`, true);
    Later(() => SetFlag(nodes.chip, `is-flash-${tone}`, false), 720);
    Later(() => {
      if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
    }, 1200);
  }

  // ---- 面板系统 -----------------------------------------------------------

  function ShowPanel(name, payload) {
    if (disposed) return;
    if (!name) {
      activePanel = null;
      cache.panelPayload = null;
      ClearNode(dom.panelLayer);
      SetFlag(dom.panelLayer, "is-open", false);
      SetAttr(dom.panelLayer, "aria-hidden", "true");
      SetFlag(root, "has-panel", false);
      RenderTabBadges(currentState || {}, currentView || {});
      Call("OnPanelOpen", null);
      return;
    }
    if (panelNames.indexOf(name) < 0) return;
    activePanel = name;
    cache.panelPayload = payload || null;
    RenderPanel(name, payload);
    SetFlag(dom.panelLayer, "is-open", true);
    SetAttr(dom.panelLayer, "aria-hidden", "false");
    SetFlag(root, "has-panel", true);
    RenderTabBadges(currentState || {}, currentView || {});
    Call("OnPanelOpen", name);
  }

  function RenderPanel(name, payload) {
    const definition = panelDefinitions.find((item) => item.key === name);
    if (!definition) return;
    const layer = ClearNode(dom.panelLayer);
    const scrim = El("div", "pf-panel-scrim", { parent: layer });
    On(scrim, "click", () => ShowPanel(null));
    const panel = El("section", "pf-panel", {
      parent: layer,
      attrs: { role: "dialog", "aria-modal": "true", "aria-label": definition.title, "data-panel": name },
    });
    const head = El("header", "pf-panel-head", { parent: panel });
    const titleBox = El("div", "pf-panel-titlebox", { parent: head });
    El("h2", "pf-panel-title pf-stamp", { text: definition.title, parent: titleBox });
    El("p", "pf-panel-sub", { text: definition.subtitle, parent: titleBox });
    const close = El("button", "pf-panel-close", {
      text: "关闭",
      parent: head,
      attrs: { type: "button", "aria-label": "关闭面板（Esc）" },
    });
    On(close, "click", () => ShowPanel(null));
    const body = El("div", "pf-panel-body", { parent: panel });

    const state = currentState || {};
    const view = currentView || {};
    if (name === "Tech") RenderTreePanel(body, state, view, "Tech");
    else if (name === "Doctrine") RenderTreePanel(body, state, view, "Doctrine");
    else if (name === "Policy") RenderPolicyPanel(body, state, view);
    else if (name === "Base") RenderBasePanel(body, state, view);
    else if (name === "Intel") RenderIntelPanel(body, state, view);
    else if (name === "Ledger") RenderLedgerPanel(body, state, view, payload);
    else if (name === "Log") RenderLogPanel(body, state, view);
    else if (name === "Help") RenderHelpPanel(body, state, view);
    else if (name === "Settings") RenderSettingsPanel(body, state, view, payload);

    dom.panel = panel;
    dom.panelBody = body;
    // 内容不足以撑满统一最小高度时（代价账本开局只有五个 0），撤掉最小高度贴合内容，
    // 免得面板下半部留一大片空白。撑得满的面板不受影响，高度区间仍然统一。
    FitPanelHeight();
    Later(FitPanelHeight, 30);

    if (close.focus) Later(() => close.focus(), 30);
  }

  /**
   * 量一次内容高度，决定面板是否收成"贴合内容"态。
   * 不能用 scrollHeight 判断：内容不足时它恒等于 clientHeight，什么也看不出来。
   * 这里量最后一个子元素的下沿离面板体下沿还剩多少，剩太多就说明下半部是空的。
   */
  function FitPanelHeight() {
    const panel = dom.panel;
    const body = dom.panelBody;
    if (!panel || !body || panel.isConnected === false) return;
    SetFlag(panel, "is-fit", false);
    const last = body.lastElementChild;
    if (!last) return;
    const slack = RectOf(body).bottom - RectOf(last).bottom;
    SetFlag(panel, "is-fit", slack > 48);
  }

  // ---- 双树（科技 / 群众政权） --------------------------------------------

  function RenderTreePanel(body, state, view, treeKey) {
    const tabs = El("div", "pf-tree-tabs", { parent: body, attrs: { role: "tablist" } });
    for (const entry of [
      { key: "Tech", label: "军事技术" },
      { key: "Doctrine", label: "群众与政权" },
    ]) {
      const button = El("button", "pf-tree-tab", {
        text: entry.label,
        parent: tabs,
        attrs: { type: "button", role: "tab", "aria-selected": entry.key === treeKey ? "true" : "false" },
      });
      SetFlag(button, "is-active", entry.key === treeKey);
      On(button, "click", () => ShowPanel(entry.key));
    }

    const isTech = treeKey === "Tech";
    const source = isTech ? view.tech : view.doctrine;
    const research = state.research || {};
    const nodes = source && Array.isArray(source.nodes) ? source.nodes : BuildTreeNodes(state, treeKey);
    const currentId = source && source.currentId !== undefined
      ? source.currentId
      : isTech
        ? research.currentId
        : research.currentDoctrineId;
    const progress = source && source.progress !== undefined
      ? source.progress
      : isTech
        ? research.progress
        : research.doctrineProgress;

    const status = El("div", "pf-tree-status", { parent: body });
    const current = nodes.find((node) => node.id === currentId);
    if (current) {
      El("span", "pf-tree-current", { text: `在研：${current.name}`, parent: status });
      const track = El("div", "pf-tree-progress", { parent: status });
      const fill = El("i", null, { parent: track });
      SetBarWidth(fill, PercentOf(progress, current.total || 100));
    } else {
      El("span", "pf-tree-current is-idle", {
        text: isTech ? "尚未选定技术方向" : "尚未选定群众工作方向",
        parent: status,
      });
    }

    if (!nodes.length) {
      El("div", "pf-empty pf-empty-block", {
        text: "本期没有可展开的条目。等前线缴获与群众工作积累之后再回来看。",
        parent: body,
      });
      return;
    }

    const layout = LayoutTreeNodes(nodes, treeKey);

    // 纪元跳转条 + 常显滚动轨，都摆在树的上方：面板体本身竖向余量不足时，
    // 摆在树下面的东西会被推出可视区，摆在上面则永远看得见。
    const nav = El("div", "pf-tree-nav", { parent: body });
    const pager = El("div", "pf-tree-eras", {
      parent: nav,
      attrs: { role: "group", "aria-label": "按纪元跳转" },
    });

    // 外层负责"还有内容在右边 / 下面"的渐隐提示，内层负责真正的滚动。
    const wrap = El("div", "pf-tree-wrap", { parent: body });
    const canvas = El("div", "pf-tree", {
      parent: wrap,
      attrs: { tabindex: "0", role: "group", "aria-label": isTech ? "军事技术树" : "群众与政权树" },
    });
    const inner = El("div", "pf-tree-inner", {
      parent: canvas,
      style: { width: `${layout.width}px`, height: `${layout.height}px` },
    });

    // 纪元标签做成列头，每列只出现一次，不再逐节点重复。
    for (const column of layout.columns) {
      El("span", "pf-tree-colhead", {
        text: column.label,
        parent: inner,
        style: { left: `${column.x}px`, width: `${layout.nodeWidth}px` },
      });
    }

    const svg = Svg("svg", {
      class: "pf-tree-links",
      width: layout.width,
      height: layout.height,
      viewBox: `0 0 ${layout.width} ${layout.height}`,
      "aria-hidden": "true",
    });
    inner.appendChild(svg);

    const positions = layout.positions;
    for (const node of nodes) {
      const to = positions[node.id];
      if (!to) continue;
      for (const requirement of node.requires || []) {
        const from = positions[requirement];
        if (!from) continue;
        // 正交折线：从上游右侧中点水平出，走列间沟槽竖直换行，再水平进下游左侧中点。
        // 端点严格落在卡片边框上，读得出 A → B，也不会画出满屏交叉的大弧线。
        const x1 = from.x + layout.nodeWidth;
        const y1 = from.y + layout.nodeHeight / 2;
        const x2 = to.x;
        const y2 = to.y + layout.nodeHeight / 2;
        const gutter = x1 + Math.max(14, (x2 - x1) * 0.45);
        const radius = 8;
        let path;
        if (Math.abs(y1 - y2) < 2) {
          path = `M ${x1} ${y1} L ${x2} ${y2}`;
        } else {
          const direction = y2 > y1 ? 1 : -1;
          path =
            `M ${x1} ${y1} L ${gutter - radius} ${y1}` +
            ` Q ${gutter} ${y1} ${gutter} ${y1 + radius * direction}` +
            ` L ${gutter} ${y2 - radius * direction}` +
            ` Q ${gutter} ${y2} ${gutter + radius} ${y2}` +
            ` L ${x2} ${y2}`;
        }
        const linkState = node.state === "done" ? "done" : node.state === "locked" ? "locked" : "open";
        svg.appendChild(Svg("path", { d: path, class: `pf-tree-link is-${linkState}` }));
        // 箭头，指明方向
        svg.appendChild(
          Svg("path", {
            d: `M ${x2 - 7} ${y2 - 4} L ${x2} ${y2} L ${x2 - 7} ${y2 + 4} Z`,
            class: `pf-tree-arrow is-${linkState}`,
          })
        );
      }
    }

    for (const node of nodes) {
      const position = positions[node.id];
      if (!position) continue;
      const card = El("button", `pf-node is-${node.state || "locked"}`, {
        parent: inner,
        attrs: {
          type: "button",
          "data-node": node.id,
          "aria-label": `${node.name || node.id}，${NodeStateName(node.state)}`,
          style: `left:${position.x}px;top:${position.y}px;width:${layout.nodeWidth}px;height:${layout.nodeHeight}px`,
        },
      });
      El("span", "pf-node-name", { text: node.name || node.id, parent: card });
      El("small", "pf-node-cost", { text: FormatCost(node.cost) || "无需消耗", parent: card });
      El("span", "pf-node-state", { text: NodeStateName(node.state), parent: card });
      if (node.state === "done") El("i", "pf-node-seal", { text: "成", parent: card, attrs: { "aria-hidden": "true" } });
      if (node.state === "active") {
        const bar = El("i", "pf-node-progress", { parent: card });
        SetBarWidth(bar, PercentOf(node.progress, node.total || 100));
      }
      AttachTooltip(card, () => ({
        title: node.name || node.id,
        body: node.blurb || "",
        rows: CostRows(node.cost).concat(
          node.effectRows || (node.effects ? DescribeEffects(node.effects) : [])
        ),
        footer:
          node.state === "done"
            ? "已完成"
            : node.state === "locked"
              ? node.reason || "前置条件未满足"
              : "点击列入研究",
      }));
      On(card, "click", () => {
        if (node.state === "locked") {
          Toast(node.reason || "前置条件还没满足。", "warn");
          return;
        }
        if (node.state === "done") return;
        Call("OnResearch", { id: node.id, tree: isTech ? "tech" : "doctrine" });
      });
    }

    BuildTreeChrome(nav, pager, wrap, canvas, layout, treeKey);
  }

  /**
   * 给树补上两件"看得见的滚动"：
   *   1. 纪元跳转条 —— 每一列一枚按钮，点一下把该列滚进视野，当前可见的列高亮；
   *   2. 常显滚动轨 —— 自绘的横向滑块（叠加式系统滚动条静止时不画，指望不上），
   *      可点可拖，宽度按可视比例给出，玩家一眼就知道自己只看到了整棵树的多少。
   * 竖直方向由 .pf-tree 上的 is-scroll-down / is-scroll-up 状态类画渐隐提示。
   */
  function BuildTreeChrome(nav, pager, wrap, canvas, layout, treeKey) {
    const columns = Array.isArray(layout.columns) ? layout.columns : [];
    if (!cache.treeScroll) cache.treeScroll = {};
    const jumpButtons = [];
    for (let index = 0; index < columns.length; index += 1) {
      const column = columns[index];
      const button = El("button", "pf-tree-era", {
        parent: pager,
        attrs: { type: "button", "data-column": String(index), "aria-label": `跳到${column.label}` },
      });
      El("span", "pf-tree-era-name", { text: column.label, parent: button });
      El("small", "pf-tree-era-count", { text: `${column.count || 0} 项`, parent: button });
      On(button, "click", () => {
        const max = Math.max(0, canvas.scrollWidth - canvas.clientWidth);
        canvas.scrollLeft = Clamp(column.x - 10, 0, max);
        SyncTreeChrome();
      });
      jumpButtons.push(button);
    }

    const vfade = El("i", "pf-tree-vfade", { parent: wrap, attrs: { "aria-hidden": "true" } });
    const railBox = El("div", "pf-tree-railbox", { parent: nav });
    const rail = El("div", "pf-tree-rail", {
      parent: railBox,
      attrs: { role: "presentation", "aria-hidden": "true" },
    });
    const thumb = El("i", "pf-tree-thumb", { parent: rail });
    El("small", "pf-tree-railnote", { text: "← 拖动滑块平移整棵树，或点上方纪元跳转 →", parent: railBox });

    function SyncTreeChrome() {
      UpdateScrollAffordance(canvas);
      const span = Math.max(0, canvas.scrollWidth - canvas.clientWidth);
      SetFlag(nav, "is-pannable", span > 2);
      SetFlag(wrap, "is-pannable", span > 2);
      const spanY = Math.max(0, canvas.scrollHeight - canvas.clientHeight);
      SetFlag(wrap, "is-vscroll", spanY > 2 && canvas.scrollTop < spanY - 2);
      const hiddenRows = Math.max(1, Math.round(spanY / Math.max(1, layout.nodeHeight + layout.rowGap)));
      SetText(vfade, spanY > 2 ? `▾ 下面还有约 ${hiddenRows} 行` : "");
      const ratio = canvas.scrollWidth > 0 ? canvas.clientWidth / canvas.scrollWidth : 1;
      const width = Clamp(ratio * 100, 12, 100);
      const offset = span > 0 ? (canvas.scrollLeft / span) * (100 - width) : 0;
      if (thumb.style) {
        thumb.style.width = `${width.toFixed(2)}%`;
        thumb.style.left = `${Clamp(offset, 0, 100 - width).toFixed(2)}%`;
      }
      const left = canvas.scrollLeft;
      const right = left + canvas.clientWidth;
      for (let index = 0; index < jumpButtons.length; index += 1) {
        const column = columns[index];
        const visible = column.x + layout.nodeWidth > left + 4 && column.x < right - 4;
        SetFlag(jumpButtons[index], "is-visible", visible);
        SetAttr(jumpButtons[index], "aria-current", visible ? "true" : null);
      }
    }

    // 轨道上点击 / 拖拽都按同一套换算走：把落点当作滑块中心。
    let dragging = false;
    function ScrollToPointer(event) {
      const rect = RectOf(rail);
      if (!rect.width) return;
      const ratio = canvas.scrollWidth > 0 ? canvas.clientWidth / canvas.scrollWidth : 1;
      const usable = Math.max(1, rect.width * (1 - ratio));
      const position = event.clientX - rect.left - (rect.width * ratio) / 2;
      const span = Math.max(0, canvas.scrollWidth - canvas.clientWidth);
      canvas.scrollLeft = Clamp(position / usable, 0, 1) * span;
      SyncTreeChrome();
    }
    On(rail, "pointerdown", (event) => {
      dragging = true;
      if (rail.setPointerCapture && event.pointerId !== undefined) {
        try {
          rail.setPointerCapture(event.pointerId);
        } catch (error) {
          // 某些环境不支持指针捕获，退化为普通拖拽即可
        }
      }
      ScrollToPointer(event);
      event.preventDefault();
    });
    On(rail, "pointermove", (event) => {
      if (dragging) ScrollToPointer(event);
    });
    On(rail, "pointerup", () => {
      dragging = false;
    });
    On(rail, "pointercancel", () => {
      dragging = false;
    });
    On(canvas, "scroll", SyncTreeChrome, { passive: true });
    On(canvas, "scroll", () => {
      cache.treeScroll[treeKey] = { left: canvas.scrollLeft, top: canvas.scrollTop };
    }, { passive: true });

    // 面板每次 Sync 都会重建，滚动位置必须自己记住，否则玩家刚翻到第五纪元就被弹回开头。
    const remembered = cache.treeScroll[treeKey];
    if (remembered && typeof canvas.scrollTo === "function") {
      canvas.scrollTo({ left: remembered.left || 0, top: remembered.top || 0, behavior: "auto" });
    }

    // 首帧布局尚未落定（面板还要做一次贴合内容的高度收缩），等一拍再量，滑块宽度才准。
    SyncTreeChrome();
    Later(SyncTreeChrome, 60);
  }

  /**
   * view 未提供树数据时，直接用 Data_Tech 的定义 + state.research 推导三态节点。
   * 布局优先采用 Data_Tech 的 techTreeLayout / doctrineTreeLayout（若有 column/row）。
   */
  function BuildTreeNodes(state, treeKey) {
    const isTech = treeKey === "Tech";
    const table = DefinitionTable(isTech ? "techDefinitions" : "doctrineDefinitions");
    const ids = Object.keys(table);
    if (!ids.length) return [];
    const research = state.research || {};
    const done = new Set(Array.isArray(research.done) ? research.done : []);
    const currentId = isTech ? research.currentId : research.currentDoctrineId;
    const layoutSource = definitions.tech
      ? definitions.tech[isTech ? "techTreeLayout" : "doctrineTreeLayout"]
      : null;
    const layout = layoutSource && typeof layoutSource === "object" ? layoutSource : {};
    return ids.map((id) => {
      const definition = table[id] || {};
      const requires = Array.isArray(definition.requires) ? definition.requires : [];
      const placed = layout[id] || {};
      let nodeState = "locked";
      let reason = "";
      if (done.has(id)) nodeState = "done";
      else if (id === currentId) nodeState = "active";
      else if (requires.every((requirement) => done.has(requirement))) nodeState = "available";
      else {
        const missing = requires.filter((requirement) => !done.has(requirement));
        const names = missing.map((key) => (table[key] && table[key].name) || key);
        reason = names.length ? `需先完成：${names.join("、")}` : "前置条件未满足";
      }
      return {
        id,
        name: definition.name || id,
        era: definition.era,
        cost: definition.cost || null,
        requires,
        blurb: definition.blurb || "",
        effects: definition.effects || null,
        state: nodeState,
        reason,
        progress: id === currentId ? (isTech ? research.progress : research.doctrineProgress) : 0,
        total: (definition.cost && (definition.cost.intel || definition.cost.cadre)) ? 100 : 100,
        column: placed.column,
        row: placed.row,
      };
    });
  }

  function EraShortName(eraKey) {
    const era = eraDefinitionsFallback.find((item) => item.key === eraKey);
    return era ? era.name : eraKey ? String(eraKey) : "—";
  }

  /** 效果 key → 中文名。缺一条就会把工程 key 直接印给玩家。 */
  const effectLabels = {
    yieldBonus: "产出加成",
    flatYield: "每回合额外产出",
    unlockUnits: "解锁部队",
    unlockDistricts: "解锁区域",
    unlockWorks: "解锁工事",
    unlockPolicies: "解锁政策",
    policySlots: "政策槽位",
    baseSlots: "区域槽位",
    massGrowth: "群众工作成效",
    populationGrowth: "人口增长",
    cadreGrowth: "干部培养",
    unrestDecay: "民情安定",
    exposureDecay: "暴露度消退",
    intelRange: "情报覆盖",
    sweepWarning: "扫荡预警提前量",
    garrisonReveal: "可见敌军守备",
    combatAmbush: "伏击效果",
    combatAttack: "攻击力",
    combatDefence: "防御力",
    captureRate: "缴获率",
    healRate: "伤员恢复",
    buildSpeed: "建设速度",
    moveBonus: "行动力",
    sabotageBonus: "破袭成效",
    siegeBonus: "攻坚效果",
    upkeepDiscount: "维持费减免",
    tunnelMove: "地道通行",
    seizureResist: "抗征粮",
    civilianShelter: "群众掩蔽",
  };

  /** 资源 key → 中文名，用于展开 yieldBonus / flatYield 这类资源映射。 */
  const resourceShortLabels = {
    grain: "粮", labor: "工", ordnance: "械", medicine: "药", intel: "情报", cadre: "干部",
  };

  /** 把解锁项的内部 id 解析成中文名，解析不到才退回 id。 */
  function ResolveUnlockName(key, id) {
    const tables = {
      unlockUnits: () => definitions.units?.unitDefinitions?.[id]?.name,
      unlockDistricts: () => definitions.units?.districtDefinitions?.[id]?.name,
      unlockWorks: () => definitions.terrain?.workDefinitions?.[id]?.name,
      unlockPolicies: () => definitions.tech?.policyDefinitions?.[id]?.name,
    };
    try {
      return tables[key]?.() || String(id);
    } catch (error) {
      return String(id);
    }
  }

  /**
   * 格式化单条效果。此前直接 String(value)，于是 yieldBonus / flatYield 这类
   * 资源映射会印成 [object Object]，unlock* 会把内部 id 抛给玩家——
   * 62 条科技/政权/政策定义全部走这条路径。
   */
  function FormatEffectValue(key, value) {
    if (typeof value === "boolean") return value ? "是" : "否";
    if (typeof value === "number") {
      const percentKeys = new Set([
        "yieldBonus", "massGrowth", "populationGrowth", "cadreGrowth", "unrestDecay", "exposureDecay",
        "combatAmbush", "combatAttack", "combatDefence", "captureRate", "healRate", "buildSpeed",
        "sabotageBonus", "siegeBonus", "upkeepDiscount", "seizureResist", "civilianShelter",
      ]);
      if (percentKeys.has(key)) return `${value > 0 ? "+" : ""}${Math.round(value * 100)}%`;
      return FormatSigned(value);
    }
    if (Array.isArray(value)) {
      return value.map((id) => ResolveUnlockName(key, id)).join("、") || "—";
    }
    if (value && typeof value === "object") {
      const parts = [];
      for (const [resource, amount] of Object.entries(value)) {
        const number = Number(amount) || 0;
        if (!number) continue;
        const name = resourceShortLabels[resource] ?? resource;
        const isRatio = key === "yieldBonus";
        parts.push(`${name} ${number > 0 ? "+" : ""}${isRatio ? `${Math.round(number * 100)}%` : number}`);
      }
      return parts.join(" · ") || "—";
    }
    return String(value);
  }

  function DescribeEffects(effects) {
    const rows = [];
    for (const name of Object.keys(effects || {})) {
      const value = effects[name];
      if (value === null || value === undefined) continue;
      if (Array.isArray(value) && !value.length) continue;
      rows.push({
        label: effectLabels[name] ?? name,
        value: FormatEffectValue(name, value),
        tone: typeof value === "number" ? ToneForDelta(value) : "flat",
      });
    }
    return rows.slice(0, 6);
  }

  function NodeStateName(state) {
    const names = { done: "已完成", active: "研究中", available: "可研究", locked: "未解锁" };
    return names[state] || "未解锁";
  }

  /**
   * 分层布局。优先采用 Data_Tech 的 techTreeLayout.tiers（按 tier 分列，
   * 这是数据本身给出的依赖层级），没有才退回按纪元分列。
   * 列头文字取该列节点的纪元名。
   */
  function LayoutTreeNodes(nodes, treeKey) {
    // 卡片尺寸随视口分三档：窄视口下缩小行高，整棵树才可能在竖直方向一次装完
    // （平板 1024 上原本恒有一整行看不见）。列宽仍留足两行中文标题。
    const viewport = ViewportSize();
    const metrics =
      // 卡片固有内容高约 76px（padding 9×2 + 标题 19 + gap 3×2 + 成本 16 + 状态 17）。
      // 窄视口下若把 nodeHeight 压到 70/72，flex 会把标题行框收缩到 11px，
      // 再被 .pf-node-name 的 overflow:hidden 从字中间横切——节点名整片不可读。
      // 因此窄档的高度必须 ≥ 内容固有高。
      viewport.width <= 640
        ? { nodeWidth: 140, nodeHeight: 80, columnGap: 40, rowGap: 12 }
        : viewport.width <= 1199
          ? { nodeWidth: 158, nodeHeight: 82, columnGap: 54, rowGap: 12 }
          : { nodeWidth: 184, nodeHeight: 84, columnGap: 78, rowGap: 16 };
    const nodeWidth = metrics.nodeWidth;
    const nodeHeight = metrics.nodeHeight;
    const columnGap = metrics.columnGap;
    const rowGap = metrics.rowGap;
    const headHeight = 26;
    const byId = {};
    for (const node of nodes) byId[node.id] = node;

    const layoutSource = definitions.tech
      ? definitions.tech[treeKey === "Tech" ? "techTreeLayout" : "doctrineTreeLayout"]
      : null;
    let columnGroups = [];
    if (layoutSource && Array.isArray(layoutSource.tiers) && layoutSource.tiers.length) {
      columnGroups = layoutSource.tiers.map((tier) => tier.map((id) => byId[id]).filter(Boolean));
    }
    if (!columnGroups.length || !columnGroups.some((group) => group.length)) {
      const eraOrder = eraDefinitionsFallback.map((item) => item.key);
      const buckets = new Map();
      for (const node of nodes) {
        const index = node.column !== undefined && node.column !== null
          ? node.column
          : Math.max(0, eraOrder.indexOf(node.era));
        if (!buckets.has(index)) buckets.set(index, []);
        buckets.get(index).push(node);
      }
      columnGroups = Array.from(buckets.keys())
        .sort((a, b) => a - b)
        .map((key) => buckets.get(key));
    }
    columnGroups = columnGroups.filter((group) => group && group.length);

    const positions = {};
    const columns = [];
    const eraOrder = eraDefinitionsFallback.map((item) => item.key);
    const ordinals = ["一", "二", "三", "四", "五", "六", "七", "八"];
    // 先定出每列代表的纪元，再决定要不要补序号：一个纪元跨多列时才补，
    // 否则会出现单列的"开辟期 · 一"这种多余写法。
    const columnEras = columnGroups.map((group) => {
      const keys = group.map((node) => node.era).filter(Boolean);
      keys.sort((a, b) => eraOrder.indexOf(a) - eraOrder.indexOf(b));
      return keys[0] || null;
    });
    const eraTotals = {};
    for (const eraKey of columnEras) if (eraKey) eraTotals[eraKey] = (eraTotals[eraKey] || 0) + 1;
    const eraSeen = {};
    let maxRows = 0;
    columnGroups.forEach((group, columnIndex) => {
      const x = columnIndex * (nodeWidth + columnGap);
      const eraKey = columnEras[columnIndex];
      let label;
      if (eraKey) {
        eraSeen[eraKey] = (eraSeen[eraKey] || 0) + 1;
        label = eraTotals[eraKey] > 1
          ? `${EraShortName(eraKey)} · ${ordinals[eraSeen[eraKey] - 1] || eraSeen[eraKey]}`
          : EraShortName(eraKey);
      } else {
        label = `第 ${columnIndex + 1} 层`;
      }
      columns.push({ x, label, count: group.length });
      group.forEach((node, rowIndex) => {
        positions[node.id] = { x, y: headHeight + rowIndex * (nodeHeight + rowGap) };
        if (rowIndex + 1 > maxRows) maxRows = rowIndex + 1;
      });
    });

    return {
      positions,
      columns,
      nodeWidth,
      nodeHeight,
      rowGap,
      width: Math.max(nodeWidth, columnGroups.length * (nodeWidth + columnGap) - columnGap + 10),
      height: Math.max(nodeHeight, headHeight + maxRows * (nodeHeight + rowGap) - rowGap + 10),
    };
  }

  // ---- 政策卡 -------------------------------------------------------------

  function RenderPolicyPanel(body, state, view) {
    const policyState = state.policy || {};
    const source = view.policy || {};
    const slotCount = Math.max(1, Number(source.slots ?? policyState.slots) || 1);
    const equipped = Array.isArray(source.equipped ?? policyState.equipped)
      ? (source.equipped ?? policyState.equipped).slice()
      : [];
    const cards = Array.isArray(source.cards) ? source.cards : BuildPolicyCards(state);
    const cardById = {};
    for (const card of cards) cardById[card.id] = card;

    El("p", "pf-panel-lead", {
      text: "政策槽随政权建设增加。每一条都要人去落实，装上去就意味着别的事得往后放。",
      parent: body,
    });

    const slotRow = El("div", "pf-slots", { parent: body, attrs: { "aria-label": "政策槽" } });
    for (let index = 0; index < Math.max(slotCount, 1); index += 1) {
      const slot = El("div", "pf-slot", {
        parent: slotRow,
        attrs: { "data-slot": index, tabindex: "0", role: "button", "aria-label": `政策槽 ${index + 1}` },
      });
      if (index >= slotCount) {
        SetFlag(slot, "is-locked", true);
        El("span", "pf-slot-empty", { text: "未开放", parent: slot });
        continue;
      }
      const cardId = equipped[index];
      const card = cardId ? cardById[cardId] : null;
      if (card) {
        SetFlag(slot, "is-filled", true);
        El("span", "pf-slot-cat", { text: CategoryName(card.category), parent: slot });
        El("span", "pf-slot-name", { text: card.name, parent: slot });
        El("button", "pf-slot-drop", {
          text: "撤下",
          parent: slot,
          attrs: { type: "button", "aria-label": `撤下${card.name}` },
          onClick: () => CommitPolicies(equipped.filter((id, position) => position !== index)),
        });
        AttachTooltip(slot, () => ({ title: card.name, body: card.blurb || "", rows: CostRows(card.cost) }));
      } else {
        El("span", "pf-slot-empty", { text: "空槽", parent: slot });
        AttachTooltip(slot, () => ({ title: `政策槽 ${index + 1}`, body: "把下面的政策卡点上来，或直接拖进这里。" }));
      }
      On(slot, "dragover", (event) => {
        if (event.preventDefault) event.preventDefault();
        SetFlag(slot, "is-hot", true);
      });
      On(slot, "dragleave", () => SetFlag(slot, "is-hot", false));
      On(slot, "drop", (event) => {
        if (event.preventDefault) event.preventDefault();
        SetFlag(slot, "is-hot", false);
        const id = event.dataTransfer && event.dataTransfer.getData ? event.dataTransfer.getData("text/plain") : "";
        if (!id) return;
        const next = equipped.slice();
        while (next.length < slotCount) next.push(null);
        next[index] = id;
        CommitPolicies(next);
      });
    }

    if (!cards.length) {
      El("div", "pf-empty pf-empty-block", { text: "眼下还没有可用的政策条目。", parent: body });
      return;
    }

    const groups = {};
    for (const card of cards) {
      const category = card.category || "Other";
      if (!groups[category]) groups[category] = [];
      groups[category].push(card);
    }
    for (const category of Object.keys(groups)) {
      El("h3", "pf-group-title", { text: CategoryName(category), parent: body });
      const grid = El("div", "pf-cardgrid", { parent: body });
      for (const card of groups[category]) {
        const node = El("article", "pf-card", {
          parent: grid,
          attrs: { tabindex: "0", draggable: card.locked ? null : "true", "data-policy": card.id },
        });
        SetFlag(node, "is-locked", !!card.locked);
        SetFlag(node, "is-equipped", equipped.indexOf(card.id) >= 0);
        El("div", "pf-card-era", { text: EraShortName(card.era), parent: node });
        El("h4", "pf-card-name", { text: card.name, parent: node });
        El("p", "pf-card-blurb", { text: card.blurb || "", parent: node });
        El("div", "pf-card-cost", { text: FormatCost(card.cost) || "无需消耗", parent: node });
        if (card.locked) El("div", "pf-card-lock", { text: card.reason || "尚未解锁", parent: node });
        AttachTooltip(node, () => ({
          title: card.name,
          body: card.blurb || "",
          rows: CostRows(card.cost).concat(card.effectRows || DescribeEffects(card.effects)),
          footer: card.locked ? card.reason || "尚未解锁" : "点击装入首个空槽",
        }));
        On(node, "dragstart", (event) => {
          if (event.dataTransfer && event.dataTransfer.setData) event.dataTransfer.setData("text/plain", card.id);
        });
        On(node, "click", () => TogglePolicy(card, equipped, slotCount));
        On(node, "keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            if (event.preventDefault) event.preventDefault();
            TogglePolicy(card, equipped, slotCount);
          }
        });
      }
    }
  }

  /** 点击卡片 = 装上/撤下；始终把完整的政策 id 列表交回（契约见 Rules.SetPolicies）。 */
  function TogglePolicy(card, equipped, slotCount) {
    const current = equipped.filter(Boolean);
    if (current.indexOf(card.id) >= 0) {
      CommitPolicies(current.filter((id) => id !== card.id));
      return;
    }
    if (card.locked) {
      Toast(card.reason || "这条政策还推不下去。", "warn");
      return;
    }
    if (current.length >= slotCount) {
      Toast("政策槽已满，先撤下一条。", "warn");
      return;
    }
    CommitPolicies(current.concat(card.id));
  }

  function CommitPolicies(ids) {
    Call("OnAdoptPolicy", (ids || []).filter(Boolean));
  }

  /** view 未提供政策卡时，从 Data_Tech.policyDefinitions + state.research 推导。 */
  function BuildPolicyCards(state) {
    const table = DefinitionTable("policyDefinitions");
    const ids = Object.keys(table);
    if (!ids.length) return [];
    const done = new Set((state.research && state.research.done) || []);
    return ids.map((id) => {
      const definition = table[id] || {};
      const requires = Array.isArray(definition.requires) ? definition.requires : [];
      const missing = requires.filter((requirement) => !done.has(requirement));
      return {
        id,
        name: definition.name || id,
        category: definition.category || "Other",
        era: definition.era,
        cost: definition.cost || null,
        blurb: definition.blurb || "",
        effects: definition.effects || null,
        locked: missing.length > 0,
        reason: missing.length ? "相关方针尚未确立" : "",
      };
    });
  }

  function CategoryName(category) {
    const table = DefinitionTable("policyCategories");
    const entry = table && table[category];
    if (entry && entry.name) return entry.name;
    const names = { Military: "军事", Economy: "经济", Mass: "群众", Organization: "组织", Other: "其他" };
    return names[category] || category || "其他";
  }

  // ---- 根据地面板 ---------------------------------------------------------

  function RenderBasePanel(body, state, view) {
    const source = view.base || {};
    const bases = Array.isArray(source.bases) && source.bases.length ? source.bases : state.bases || [];
    if (!bases.length) {
      El("div", "pf-empty pf-empty-block", {
        text: "还没有立起来的根据地。先在群众基础好的村庄派驻工作队，把架子搭起来。",
        parent: body,
      });
      return;
    }
    for (const base of bases) {
      const card = El("section", "pf-base", { parent: body });
      const head = El("div", "pf-base-head", { parent: card });
      El("h3", "pf-base-name", { text: base.name || "根据地", parent: head });
      El("span", "pf-base-tier", { text: `第 ${SafeText(base.tier, 1)} 等`, parent: head });
      const focus = El("button", "pf-base-focus", {
        text: "定位",
        parent: head,
        attrs: { type: "button" },
      });
      On(focus, "click", () => Call("OnFocusHex", base.key, { reason: "Base" }));

      const stats = El("div", "pf-base-stats", { parent: card });
      AddFact(stats, "人口", FormatNumber(base.population || 0));
      AddFact(stats, "驻军", FormatNumber(base.garrison || 0));
      AddFact(stats, "不安", `${Math.round(base.unrest || 0)}`, (base.unrest || 0) > 50 ? "bad" : null);
      AddFact(stats, "区域", FormatNumber((base.districts || []).length));

      const districtTable = DefinitionTable("districtDefinitions");
      if ((base.districts || []).length) {
        const chips = El("div", "pf-chips", { parent: card, attrs: { "aria-label": "已建区域" } });
        for (const district of base.districts) {
          const definition = districtTable[district.type] || {};
          const name = district.name || definition.name || district.type;
          El("span", "pf-chip", { text: name, parent: chips, tip: { title: name, body: definition.blurb || "" } });
        }
      }

      const queue = Array.isArray(base.queue) ? base.queue : [];
      const queueBox = El("div", "pf-queue", { parent: card });
      El("h4", "pf-queue-title", { text: "建造队列", parent: queueBox });
      if (!queue.length) {
        El("div", "pf-empty", { text: "队列空着——工力闲置就是浪费。", parent: queueBox });
      } else {
        for (const item of queue) {
          const definition = districtTable[item.type] || {};
          const total = Number(item.turns) || Number(item.total) || 1;
          const doneTurns = item.progress !== undefined ? Number(item.progress) : total - (Number(item.turnsLeft) || 0);
          const row = El("div", "pf-queue-row", { parent: queueBox });
          El("span", "pf-queue-name", { text: item.name || definition.name || item.type, parent: row });
          const track = El("div", "pf-queue-track", { parent: row });
          const fill = El("i", null, { parent: track });
          SetBarWidth(fill, PercentOf(doneTurns, total));
          El("small", "pf-queue-left", { text: `余 ${FormatNumber(Math.max(0, total - doneTurns))} 回合`, parent: row });
        }
      }

      const buildable = Array.isArray(base.buildable) ? base.buildable : BuildDistrictOptions(state, base);
      if (buildable.length) {
        El("h4", "pf-queue-title", { text: "可建区域", parent: card });
        const grid = El("div", "pf-buildgrid", { parent: card });
        for (const item of buildable) {
          const button = El("button", "pf-buildcard", {
            parent: grid,
            attrs: { type: "button", disabled: item.enabled === false ? true : null },
          });
          El("span", "pf-buildcard-name", { text: item.name || item.type, parent: button });
          El("small", "pf-buildcard-cost", { text: FormatCost(item.cost) || "—", parent: button });
          AttachTooltip(button, () => ({
            title: item.name || item.type,
            body: item.blurb || "",
            rows: CostRows(item.cost).concat(item.yieldRows || []),
            footer: item.enabled === false ? item.reason || "条件不足" : "点击排入队列",
          }));
          On(button, "click", () => {
            if (item.enabled === false) {
              Toast(item.reason || "条件不足。", "warn");
              return;
            }
            Call("OnBuild", { kind: "District", baseId: base.id, districtType: item.type });
          });
        }
      }

      const trainable = Array.isArray(base.trainable) ? base.trainable : BuildUnitOptions(state);
      if (trainable.length) {
        const row = El("div", "pf-buildrow", { parent: card });
        El("span", "pf-buildrow-label", { text: "编成", parent: row });
        for (const item of trainable) {
          const button = El("button", "pf-buildbtn", {
            parent: row,
            attrs: { type: "button", disabled: item.enabled === false ? true : null },
          });
          El("span", null, { text: item.name || item.type, parent: button });
          El("small", "pf-cost", { text: FormatCost(item.cost) || "—", parent: button });
          AttachTooltip(button, () => ({
            title: item.name || item.type,
            body: item.blurb || "",
            rows: CostRows(item.cost),
            footer: item.enabled === false ? item.reason || "条件不足" : "点击在此基地编成",
          }));
          On(button, "click", () => {
            if (item.enabled === false) {
              Toast(item.reason || "条件不足。", "warn");
              return;
            }
            Call("OnBuild", { kind: "Unit", baseId: base.id, unitType: item.type });
          });
        }
      }
    }
  }

  /** 由 Data_Units.districtDefinitions + state 推导可建区域（含负担得起与否）。 */
  function BuildDistrictOptions(state, base) {
    const table = DefinitionTable("districtDefinitions");
    const ids = Object.keys(table);
    if (!ids.length) return [];
    const done = new Set((state.research && state.research.done) || []);
    const built = new Set((base.districts || []).map((item) => item.type));
    const queued = new Set((base.queue || []).map((item) => item.type));
    const options = [];
    for (const id of ids) {
      const definition = table[id] || {};
      const maxPerBase = definition.maxPerBase ?? 1;
      const count = (base.districts || []).filter((item) => item.type === id).length;
      if (count >= maxPerBase && maxPerBase <= 1 && (built.has(id) || queued.has(id))) continue;
      let reason = "";
      if (definition.requiresTech && !done.has(definition.requiresTech)) reason = "科技未解锁";
      else if (queued.has(id)) reason = "已在队列中";
      else if ((definition.minBaseTier ?? 1) > (base.tier ?? 1)) reason = "根据地等级不足";
      else reason = AffordReason(state, definition.cost);
      options.push({
        type: id,
        name: definition.name || id,
        cost: definition.cost || null,
        blurb: definition.blurb || "",
        enabled: !reason,
        reason,
        yieldRows: YieldRows(definition.yields),
      });
    }
    return options;
  }

  /** 由 Data_Units.unitDefinitions 推导我方可编成单位。 */
  function BuildUnitOptions(state) {
    const table = DefinitionTable("unitDefinitions");
    const ids = Object.keys(table);
    if (!ids.length) return [];
    const done = new Set((state.research && state.research.done) || []);
    const options = [];
    for (const id of ids) {
      const definition = table[id] || {};
      if (definition.side !== "Player") continue;
      let reason = "";
      if (definition.requiresTech && !done.has(definition.requiresTech)) reason = "科技未解锁";
      else reason = AffordReason(state, definition.cost);
      options.push({
        type: id,
        name: definition.name || id,
        cost: definition.cost || null,
        blurb: definition.blurb || "",
        enabled: !reason,
        reason,
      });
    }
    return options;
  }

  function AffordReason(state, cost) {
    if (!cost) return "";
    for (const resource of resourceDefinitions) {
      const amount = Number(cost[resource.key]) || 0;
      if (amount > 0 && ((state.stock && state.stock[resource.key]) || 0) < amount) return `${resource.full}不足`;
    }
    return "";
  }

  function YieldRows(yields) {
    if (!yields) return [];
    const rows = [];
    for (const resource of resourceDefinitions) {
      const amount = Number(yields[resource.key]) || 0;
      if (amount) rows.push({ label: `产出 · ${resource.full}`, value: FormatSigned(amount), tone: ToneForDelta(amount) });
    }
    return rows;
  }

  // ---- 情报面板 -----------------------------------------------------------

  function RenderIntelPanel(body, state, view) {
    const source = view.intel || {};
    const coverage = Number(source.coverage);
    const box = El("div", "pf-intel-top", { parent: body });
    const meter = El("div", "pf-intel-meter", { parent: box });
    El("span", null, { text: "情报网覆盖", parent: meter });
    const track = El("div", "pf-intel-track", {
      parent: meter,
      attrs: { role: "progressbar", "aria-label": "情报网覆盖", "aria-valuemin": "0", "aria-valuemax": "100" },
    });
    const fill = El("i", null, { parent: track });
    const coverageValue = Number.isFinite(coverage) ? coverage : ComputeIntelCoverage(state);
    SetBarWidth(fill, coverageValue);
    SetAttr(track, "aria-valuenow", Math.round(coverageValue));
    El("b", null, { text: `${Math.round(coverageValue)}%`, parent: meter });
    El("p", "pf-panel-lead", {
      text: "情报靠的是村里的眼睛：小学教员、赶集的货郎、车站上的伙夫。覆盖越广，扫荡来之前留给转移的时间越多。",
      parent: box,
    });

    const enemies = Array.isArray(source.enemies) ? source.enemies : (state.enemies || []).filter((item) => item.visibleToPlayer !== false);
    El("h3", "pf-group-title", { text: "已知敌军与意图", parent: body });
    if (!enemies.length) {
      El("div", "pf-empty pf-empty-block", { text: "暂无确切敌情。派侦察组出去。", parent: body });
    } else {
      const list = El("div", "pf-intel-list", { parent: body });
      for (const enemy of enemies) {
        const row = El("div", "pf-intel-row", { parent: list });
        El("span", "pf-intel-name", { text: EnemyUnitName(enemy), parent: row });
        El("span", "pf-intel-intent", { text: IntentName(enemy.intent), parent: row });
        El("span", "pf-intel-where", { text: enemy.key ? FormatHexCoord(enemy.key) : "位置不明", parent: row });
        const strength = El("span", "pf-intel-strength", {
          text: `${Math.round(enemy.hp || 0)} / ${Math.round(enemy.maxHp || enemy.hp || 0)}`,
          parent: row,
        });
        SetFlag(strength, "is-weak", (enemy.hp || 0) < (enemy.maxHp || 1) * 0.4);
        const jump = El("button", "pf-intel-jump", { text: "定位", parent: row, attrs: { type: "button" } });
        On(jump, "click", () => Call("OnFocusHex", enemy.key, { reason: "Intel" }));
      }
    }

    const reports = Array.isArray(source.reports) ? source.reports : [];
    El("h3", "pf-group-title", { text: "情报摘录", parent: body });
    if (!reports.length) {
      El("div", "pf-empty pf-empty-block", { text: "本回合没有新的情报送到。", parent: body });
    } else {
      for (const report of reports) {
        const item = El("article", "pf-report", { parent: body });
        El("h4", "pf-report-title", { text: report.title || "情报", parent: item });
        El("p", "pf-report-body", { text: report.body || "", parent: item });
        El("small", "pf-report-meta", {
          text: `第 ${(report.turn ?? state.turn ?? 0) + 1} 回合 · 可信度 ${SafeText(report.confidence, "中")}`,
          parent: item,
        });
      }
    }

    const strongholds = state.strongholds || [];
    if (strongholds.length) {
      El("h3", "pf-group-title", { text: "敌军据点", parent: body });
      const grid = El("div", "pf-stronghold-grid", { parent: body });
      for (const stronghold of strongholds) {
        const cell = El("button", "pf-stronghold", { parent: grid, attrs: { type: "button" } });
        El("span", "pf-stronghold-type", { text: StrongholdName(stronghold.type), parent: cell });
        El("small", null, { text: `守备 ${FormatNumber(stronghold.garrison || 0)}`, parent: cell });
        const alarm = El("i", "pf-stronghold-alarm", { parent: cell });
        SetBarWidth(alarm, stronghold.alarm || 0);
        On(cell, "click", () => Call("OnFocusHex", stronghold.key, { reason: "Stronghold" }));
        AttachTooltip(cell, () => ({
          title: StrongholdName(stronghold.type),
          body: `位置 ${FormatHexCoord(stronghold.key)}。`,
          rows: [
            { label: "守备", value: FormatNumber(stronghold.garrison || 0) },
            { label: "补给", value: FormatNumber(stronghold.supply || 0) },
            { label: "戒备", value: `${Math.round(stronghold.alarm || 0)}%` },
          ],
        }));
      }
    }
  }

  function ComputeIntelCoverage(state) {
    const hexes = (state.map && state.map.hexes) || {};
    const keys = Object.keys(hexes);
    if (!keys.length) return 0;
    let total = 0;
    for (const key of keys) total += Number(hexes[key].intel) || 0;
    return total / keys.length;
  }

  /** 敌军意图键（由 Script_Ai 写入 enemy.intent）→ 中文。 */
  /** 敌方部队中文名：优先查定义表，查不到给中性描述，不暴露内部 key。 */
  function EnemyUnitName(enemy) {
    const named = definitions.units?.unitDefinitions?.[enemy?.type]?.name;
    return named || enemy?.name || "不明部队";
  }

  function IntentName(intent) {
    const names = {
      Patrol: "巡逻",
      Sweep: "扫荡",
      Build: "修筑据点",
      Repair: "抢修铁路",
      Requisition: "抢粮",
      Pursue: "追击",
      Garrison: "驻守",
      Withdraw: "回撤",
      Escort: "护运",
      Pacify: "宣抚",
      Stage: "集结",
    };
    // 兜底一律给中文，绝不把内部 key 抛给玩家。
    return names[intent] || "意图不明";
  }

  function StrongholdName(type) {
    const feature = DefinitionTable("featureDefinitions")[type];
    if (feature && feature.name) return feature.name;
    const names = { Blockhouse: "炮楼", Garrison: "据点", CountySeat: "县城", RailStation: "车站", Bunker: "碉堡" };
    return names[type] || type || "据点";
  }

  // ---- 代价账本（只陈述，不计分） -----------------------------------------

  function RenderLedgerPanel(body, state, view, payload) {
    const assessment = payload && payload.metrics ? payload : null;
    const ledger = Object.assign(
      {},
      state.ledger || {},
      (assessment && assessment.ledger) || {},
      (view.ledger && view.ledger.totals) || {}
    );
    El("p", "pf-panel-lead is-solemn", {
      text: "以下数字不折算成任何分数、资源或奖励。它们只是记录：这些代价确实发生过。",
      parent: body,
    });
    const grid = El("div", "pf-ledger-grid", { parent: body });
    const rows = [
      { key: "civilianDeaths", name: "平民伤亡", note: "扫荡、轰炸与报复中失去生命的乡亲。" },
      { key: "displaced", name: "流离失所", note: "房屋被毁、被迫离村的人。" },
      { key: "villagesBurned", name: "被焚村庄", note: "三光之后剩下的空场院。" },
      { key: "grainSeized", name: "被夺粮秣", note: "抢走或烧毁的口粮，按石计。" },
      { key: "cadreLost", name: "骨干损失", note: "牺牲、被捕或失去联系的干部与战士。" },
    ];
    for (const row of rows) {
      const cell = El("div", "pf-ledger-cell", { parent: grid });
      El("div", "pf-ledger-value", { text: FormatNumber(ledger[row.key] || 0), parent: cell });
      El("div", "pf-ledger-name", { text: row.name, parent: cell });
      El("div", "pf-ledger-note", { text: row.note, parent: cell });
    }

    // 终局评定的分项另开一节，与代价账本明确区隔：账本不参与任何计分。
    if (assessment) {
      El("h3", "pf-group-title", { text: `终局评定 · ${SafeText(assessment.grade, "—")}`, parent: body });
      if (assessment.ending) {
        const box = El("div", "pf-report", { parent: body });
        El("h4", "pf-report-title", { text: assessment.ending.title || "结局", parent: box });
        if (assessment.ending.body) El("p", "pf-report-body", { text: assessment.ending.body, parent: box });
        if (assessment.ending.epilogue) El("small", "pf-report-meta", { text: assessment.ending.epilogue, parent: box });
      }
      const metricNames = {
        survival: "根据地存续",
        massScore: "群众基础",
        construction: "建设水平",
        populationScore: "人口",
        safety: "人民安全",
        disruption: "交通牵制",
      };
      const countNames = {
        baseVillages: "根据地村庄",
        population: "根据地人口",
        districts: "已建区域",
        works: "已建工事",
        techs: "已完成研究",
        bases: "根据地数",
      };
      const grid = El("div", "pf-base-stats", { parent: body });
      for (const key of Object.keys(assessment.metrics || {})) {
        AddFact(grid, metricNames[key] || key, FormatNumber(Math.round(Number(assessment.metrics[key]) || 0)));
      }
      for (const key of Object.keys(assessment.counts || {})) {
        AddFact(grid, countNames[key] || key, FormatNumber(assessment.counts[key]));
      }
    }

    const entries = (view.ledger && Array.isArray(view.ledger.entries) ? view.ledger.entries : []).slice(-40).reverse();
    El("h3", "pf-group-title", { text: "逐条记录", parent: body });
    if (!entries.length) {
      El("div", "pf-empty pf-empty-block", { text: "目前尚无逐条记录。", parent: body });
      return;
    }
    const list = El("ol", "pf-ledger-list", { parent: body });
    for (const entry of entries) {
      const item = El("li", "pf-ledger-item", { parent: list });
      El("span", "pf-ledger-turn", { text: `第 ${(entry.turn ?? 0) + 1} 回合`, parent: item });
      El("span", "pf-ledger-text", { text: entry.text || "", parent: item });
    }
  }

  // ---- 纪事 / 战报 --------------------------------------------------------

  function RenderLogPanel(body, state) {
    const entries = (state.log || []).slice().reverse();
    if (!entries.length) {
      El("div", "pf-empty pf-empty-block", { text: "还没有记录。", parent: body });
      return;
    }
    const list = El("ol", "pf-loglist", { parent: body });
    for (const entry of entries.slice(0, 200)) {
      const item = El("li", `pf-logitem is-${entry.tone || entry.kind || "info"}`, { parent: list });
      El("span", "pf-logitem-turn", { text: `${(entry.turn ?? 0) + 1}`, parent: item });
      const text = El("div", "pf-logitem-body", { parent: item });
      El("span", "pf-logitem-text", { text: entry.text || entry.message || "", parent: text });
      if (entry.detail) El("small", "pf-logitem-detail", { text: entry.detail, parent: text });
    }
  }

  // ---- 说明 ---------------------------------------------------------------

  function RenderHelpPanel(body) {
    El("h3", "pf-group-title", { text: "快捷键", parent: body });
    const table = El("div", "pf-keytable", { parent: body });
    for (const row of keyboardHelpRows) {
      const line = El("div", "pf-keyrow", { parent: table });
      El("kbd", "pf-key", { text: row[0], parent: line });
      El("span", null, { text: row[1], parent: line });
    }
    El("h3", "pf-group-title", { text: "历史框架", parent: body });
    const timeline = El("div", "pf-timeline", { parent: body });
    for (const row of historyHelpRows) {
      const item = El("div", "pf-timeline-row", { parent: timeline });
      El("span", "pf-timeline-when", { text: row[0], parent: item });
      El("span", "pf-timeline-what", { text: row[1], parent: item });
    }
    El("h3", "pf-group-title", { text: "关于计分", parent: body });
    El("p", "pf-panel-lead is-solemn", {
      text: "本作不以歼敌数为主要评价。评价看的是根据地人口与存续、群众基础、建设水平、对敌交通的牵制，以及人民的安全。平民伤亡与流离只进代价账本，不会变成任何形式的收益。",
      parent: body,
    });
  }

  // ---- 设置 / 主菜单 ------------------------------------------------------

  function RenderSettingsPanel(body, state, view, payload) {
    const form = El("div", "pf-settings", { parent: body });

    // 新局
    const newBox = El("section", "pf-set-block", { parent: form });
    El("h3", "pf-group-title", { text: "开新局", parent: newBox });
    const seedRow = El("label", "pf-field", { parent: newBox });
    El("span", "pf-field-label", { text: "地图种子", parent: seedRow });
    const seedInput = El("input", "pf-input", {
      parent: seedRow,
      attrs: { type: "text", value: String(view.seed ?? state.seed ?? 1937), inputmode: "numeric" },
    });
    const difficultyRow = El("div", "pf-field", { parent: newBox });
    El("span", "pf-field-label", { text: "难度", parent: difficultyRow });
    const difficultyGroup = El("div", "pf-segment", { parent: difficultyRow, attrs: { role: "radiogroup" } });
    let chosenDifficulty = view.difficulty || "Standard";
    const difficultyButtons = {};
    for (const item of difficultyDefinitions) {
      const button = El("button", "pf-seg", {
        text: item.name,
        parent: difficultyGroup,
        attrs: { type: "button", role: "radio", "aria-checked": item.key === chosenDifficulty ? "true" : "false" },
        tip: { title: `难度：${item.name}`, body: item.note },
      });
      difficultyButtons[item.key] = button;
      SetFlag(button, "is-active", item.key === chosenDifficulty);
      On(button, "click", () => {
        chosenDifficulty = item.key;
        for (const key of Object.keys(difficultyButtons)) {
          SetFlag(difficultyButtons[key], "is-active", key === chosenDifficulty);
          SetAttr(difficultyButtons[key], "aria-checked", key === chosenDifficulty ? "true" : "false");
        }
        Call("OnSetDifficulty", chosenDifficulty);
      });
    }
    const startButton = El("button", "pf-primary", { text: "开始新局", parent: newBox, attrs: { type: "button" } });
    On(startButton, "click", async () => {
      const ok = await Confirm({
        title: "开始新的一局？",
        body: "当前进度若未存档将会丢失。",
        confirmLabel: "开始",
        cancelLabel: "再想想",
        tone: "warn",
      });
      if (!ok) return;
      const seedText = seedInput.value === undefined ? String(view.seed || 1937) : String(seedInput.value);
      const seedNumber = Number(seedText.replace(/[^0-9-]/g, "")) || 1937;
      Call("OnNewGame", { seed: seedNumber, difficulty: chosenDifficulty, quality: view.quality });
    });

    // 画质选择器已移除：全项目只保留一条渲染路径。
    // 分档意味着多条各自独立的 shader 与 pass 组合，其中未被持续验证的那条
    // 曾导致地形着色器编译失败、整张地图不绘制。现在画面按设备自动适配像素比，
    // 不再暴露会改变渲染路径的选项。

    // 音频（对外语义是 muted，与 Script_Main 的 view.muted 一致）
    const audioBox = El("section", "pf-set-block", { parent: form });
    El("h3", "pf-group-title", { text: "音频", parent: audioBox });
    const audioButton = El("button", "pf-toggle", {
      parent: audioBox,
      attrs: { type: "button", role: "switch", "aria-checked": view.muted ? "false" : "true" },
    });
    El("i", "pf-toggle-knob", { parent: audioButton, attrs: { "aria-hidden": "true" } });
    const audioLabel = El("span", null, {
      text: view.muted ? "环境音与音效：关" : "环境音与音效：开",
      parent: audioButton,
    });
    SetFlag(audioButton, "is-on", !view.muted);
    On(audioButton, "click", () => {
      const nextMuted = !currentView.muted;
      currentView.muted = nextMuted;
      SetFlag(audioButton, "is-on", !nextMuted);
      SetAttr(audioButton, "aria-checked", nextMuted ? "false" : "true");
      SetText(audioLabel, nextMuted ? "环境音与音效：关" : "环境音与音效：开");
      Call("OnToggleAudio", nextMuted);
    });
    El("p", "pf-hint-text", {
      text: "音乐与音效全部由浏览器现场合成，无外部音频文件；首次需要一次点击才能启动。",
      parent: audioBox,
    });

    // 存读档（单一存档位，与 Script_Main 的 OnSave/OnLoad 无参契约一致）
    const saveBox = El("section", "pf-set-block", { parent: form });
    El("h3", "pf-group-title", { text: "存档", parent: saveBox });
    const summary = (payload && payload.saveSummary) ||
      `第 ${(state.turn || 0) + 1} 回合 · ${FormatTurnDate(state.turn || 0).label}`;
    const row = El("div", "pf-saverow", { parent: saveBox });
    El("span", "pf-save-name", { text: "战役存档", parent: row });
    El("small", "pf-save-meta", { text: summary, parent: row });
    const saveButton = El("button", "pf-ghost", { text: "存入", parent: row, attrs: { type: "button" } });
    On(saveButton, "click", () => Call("OnSave"));
    const loadButton = El("button", "pf-ghost", { text: "读取", parent: row, attrs: { type: "button" } });
    On(loadButton, "click", async () => {
      const ok = await Confirm({
        title: "读取存档？",
        body: "当前未保存的进度会被覆盖。",
        confirmLabel: "读取",
        cancelLabel: "取消",
      });
      if (ok) Call("OnLoad");
    });
    El("p", "pf-hint-text", { text: "每回合结束会自动存一次；手动存档单独保留一份。", parent: saveBox });
  }

  // ---- 全屏叙事卡 Cinematic ------------------------------------------------

  function Cinematic(payload = {}) {
    return new Promise((resolve) => {
      if (disposed) {
        resolve(null);
        return;
      }
      if (activeCinematic) ResolveCinematic(null);
      const layer = ClearNode(dom.cinemaLayer);
      SetFlag(layer, "is-open", true);
      SetAttr(layer, "aria-hidden", "false");
      SetFlag(root, "has-cinema", true);

      const card = El("div", "pf-cinema", {
        parent: layer,
        attrs: { role: "dialog", "aria-modal": "true", "aria-label": payload.title || "历史事件" },
      });
      const illustration = payload.illustration || {};
      const figure = El("figure", "pf-cinema-figure", { parent: card });
      const canvas = El("canvas", "pf-cinema-canvas", {
        parent: figure,
        attrs: {
          width: "720",
          height: "360",
          role: "img",
          "aria-label": payload.illustrationAlt || "程序化生成的黑白档案照片质感插画",
        },
      });
      PaintArchivePhoto(
        canvas,
        payload.seed ?? HashText(String(payload.id || payload.eraKey || payload.title || "1937")),
        MotifFor(illustration.kind || payload.motif),
        illustration.tone || payload.tone || "cold"
      );
      // 可选外部插画：Assets/ 下若有该 kind 的图片则覆盖程序化插画（同一画布再压
      // 一层暗角与颗粒保持档案质感）。加载失败静默保留程序化版本。
      TryExternalIllustration(canvas, illustration.kind || payload.motif);
      El("figcaption", "pf-cinema-caption", {
        text: payload.dateline || payload.dateLabel || FormatTurnDate((currentState && currentState.turn) || 0).label,
        parent: figure,
      });

      const bodyBox = El("div", "pf-cinema-body", { parent: card });
      El("h2", "pf-cinema-title pf-stamp", { text: payload.title || "记事", parent: bodyBox });
      if (payload.subtitle) El("p", "pf-cinema-sub", { text: payload.subtitle, parent: bodyBox });
      const paragraphs = Array.isArray(payload.body) ? payload.body : String(payload.body || "").split("\n");
      for (const paragraph of paragraphs) {
        if (!paragraph) continue;
        El("p", "pf-cinema-text", { text: paragraph, parent: bodyBox });
      }
      if (payload.epilogue) El("p", "pf-cinema-text", { text: payload.epilogue, parent: bodyBox });
      // 时期过场带的“本期规则”条目
      if (Array.isArray(payload.rules) && payload.rules.length) {
        const rules = El("ul", "pf-cinema-rules", { parent: bodyBox });
        for (const rule of payload.rules) El("li", null, { text: rule, parent: rules });
      }
      if (payload.result && payload.result.grade) {
        El("p", "pf-cinema-sub", { text: `评定：${payload.result.grade}`, parent: bodyBox });
      }
      const quoteText = payload.quote || payload.flavor;
      if (quoteText) {
        const quote = El("blockquote", "pf-cinema-quote", { parent: bodyBox });
        El("p", null, { text: quoteText, parent: quote });
        if (payload.source) El("cite", null, { text: `——${payload.source}`, parent: quote });
      }

      const options = Array.isArray(payload.options) && payload.options.length
        ? payload.options
        : [{ id: "ok", label: "知道了" }];
      const optionBox = El("div", "pf-cinema-options", { parent: card });
      for (const option of options) {
        const button = El("button", "pf-cinema-option", {
          parent: optionBox,
          attrs: { type: "button", disabled: option.disabled ? true : null },
        });
        El("span", "pf-option-label", { text: option.label, parent: button });
        const detail = option.detail || option.hint;
        if (detail) El("small", "pf-option-detail", { text: detail, parent: button });
        const preview = Array.isArray(option.preview) && option.preview.length
          ? option.preview
          : PreviewFromEffects(option.effects, option.ledger);
        if (preview.length) {
          const previewBox = El("div", "pf-option-preview", { parent: button });
          for (const item of preview) {
            const chip = El("span", `pf-preview-chip is-${item.tone || ToneForDelta(item.delta)}`, { parent: previewBox });
            const resource = resourceDefinitions.find((entry) => entry.key === item.key);
            El("i", null, { text: resource ? resource.name : item.label || item.key, parent: chip });
            El("b", null, { text: item.text || FormatSigned(item.delta), parent: chip });
          }
        }
        if (option.disabled && option.reason) El("small", "pf-option-lock", { text: option.reason, parent: button });
        On(button, "click", () => {
          if (option.disabled) {
            Toast(option.reason || "这条路眼下走不通。", "warn");
            return;
          }
          ResolveCinematic(option.id);
        });
      }

      activeCinematic = { resolve, dismissible: payload.dismissible !== false };
      const firstOption = optionBox.firstChild;
      if (firstOption && firstOption.focus) Later(() => firstOption.focus(), 40);
    });
  }

  function ResolveCinematic(optionId) {
    const pending = activeCinematic;
    activeCinematic = null;
    SetFlag(dom.cinemaLayer, "is-open", false);
    SetAttr(dom.cinemaLayer, "aria-hidden", "true");
    SetFlag(root, "has-cinema", false);
    Later(() => {
      if (!activeCinematic) ClearNode(dom.cinemaLayer);
    }, 320);
    if (pending) pending.resolve(optionId);
  }

  /** Data_History 的 illustration.kind → 本模块的绘制母题。 */
  function MotifFor(kind) {
    const table = {
      Village: "village",
      Assembly: "crowd",
      Night: "night",
      Harvest: "village",
      Tunnel: "night",
      Snow: "winter",
      Ridge: "mountain",
      Rail: "rail",
    };
    return table[kind] || (typeof kind === "string" && kind ? String(kind).toLowerCase() : "village");
  }

  /**
   * 把事件选项的 effects 折成几枚"代价/收益预览"小标签。
   * 注意红线：ledger 项一律以"代价"呈现，绝不写成收益。
   */
  function PreviewFromEffects(effects, ledger) {
    const chips = [];
    if (effects && effects.stockDelta) {
      for (const resource of resourceDefinitions) {
        const amount = Number(effects.stockDelta[resource.key]) || 0;
        if (amount) chips.push({ key: resource.key, delta: amount, tone: ToneForDelta(amount) });
      }
    }
    if (effects && effects.massDelta) {
      chips.push({ label: "群众", delta: effects.massDelta, tone: ToneForDelta(effects.massDelta) });
    }
    if (effects && effects.exposureDelta) {
      chips.push({ label: "暴露", delta: effects.exposureDelta, tone: effects.exposureDelta > 0 ? "bad" : "good" });
    }
    if (effects && effects.alertDelta) {
      chips.push({ label: "警备", delta: effects.alertDelta, tone: effects.alertDelta > 0 ? "bad" : "good" });
    }
    if (effects && effects.policySlots) {
      chips.push({ label: "政策槽", delta: effects.policySlots, tone: "good" });
    }
    for (const key of Object.keys(ledger || {})) {
      const amount = Number(ledger[key]) || 0;
      if (!amount) continue;
      const names = {
        civilianDeaths: "伤亡",
        displaced: "流离",
        villagesBurned: "焚村",
        cadreLost: "骨干",
        grainSeized: "被夺粮",
      };
      chips.push({ label: names[key] || key, text: FormatNumber(amount), tone: "bad" });
    }
    return chips.slice(0, 6);
  }

  function HashText(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  /**
   * 程序化「老照片」：灰阶剪影 + 颗粒 + 暗角，全部 Canvas2D 绘制，无外部素材。
   * tone 取 'warm' | 'cold' | 'grim'，只影响整体明度与色偏，不改变构图。
   */
  function PaintArchivePhoto(canvas, seed, motif, tone = "cold") {
    const ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
    if (!ctx) return;
    const width = canvas.width || 720;
    const height = canvas.height || 360;
    const rng = CreateRng((Number(seed) >>> 0) || 1937);
    const toneTable = {
      warm: { top: "#d6cdb8", mid: "#ada291", low: "#756c5c", lift: 10, warmth: 1.1 },
      cold: { top: "#cfc6b4", mid: "#a49b8b", low: "#6f6759", lift: 4, warmth: 1.0 },
      grim: { top: "#a9a191", mid: "#7d7566", low: "#4c463c", lift: -8, warmth: 0.92 },
    };
    const palette = toneTable[tone] || toneTable.cold;

    // 天空：老照片的高光偏灰
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, palette.top);
    sky.addColorStop(0.55, palette.mid);
    sky.addColorStop(1, palette.low);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    if (motif === "night") {
      ctx.fillStyle = "rgba(24,22,20,0.55)";
      ctx.fillRect(0, 0, width, height);
      ctx.beginPath();
      ctx.arc(width * 0.78, height * 0.22, 26, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(232,220,192,0.75)";
      ctx.fill();
    }

    // 远山：三层脊线
    const layers = [
      { base: 0.52, amp: 0.16, color: "#8a8172", freq: 0.9 },
      { base: 0.62, amp: 0.13, color: "#6a6154", freq: 1.5 },
      { base: 0.72, amp: 0.1, color: "#4c463b", freq: 2.4 },
    ];
    layers.forEach((layer, index) => {
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let x = 0; x <= width; x += 4) {
        const n = ValueNoise2D((x / width) * 6 * layer.freq, index * 3.7 + seed * 0.001, 1337 + index);
        const y = height * (layer.base - layer.amp * (n - 0.35));
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fillStyle = layer.color;
      ctx.fill();
    });

    const groundY = height * 0.78;
    ctx.fillStyle = "#3a352c";
    ctx.fillRect(0, groundY, width, height - groundY);

    if (motif === "village" || motif === "crowd") {
      for (let index = 0; index < 7; index += 1) {
        const x = width * (0.08 + index * 0.12) + rng() * 20;
        const w = 46 + rng() * 34;
        const h = 30 + rng() * 22;
        const y = groundY - h;
        ctx.fillStyle = "#2e2a23";
        ctx.fillRect(x, y, w, h);
        ctx.beginPath();
        ctx.moveTo(x - 6, y);
        ctx.lineTo(x + w / 2, y - 16 - rng() * 8);
        ctx.lineTo(x + w + 6, y);
        ctx.closePath();
        ctx.fillStyle = "#242019";
        ctx.fill();
      }
    }
    if (motif === "rail") {
      ctx.strokeStyle = "#241f19";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-10, groundY + 26);
      ctx.lineTo(width + 10, groundY + 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-10, groundY + 42);
      ctx.lineTo(width + 10, groundY + 20);
      ctx.stroke();
      for (let index = 0; index < 24; index += 1) {
        const t = index / 23;
        const x = t * width;
        const y = groundY + 26 - t * 20;
        ctx.fillStyle = "rgba(28,25,20,0.85)";
        ctx.fillRect(x - 4, y, 8, 20);
      }
      for (let index = 0; index < 5; index += 1) {
        const x = 60 + index * (width / 5);
        ctx.fillStyle = "#221e18";
        ctx.fillRect(x, groundY - 70, 4, 70);
        ctx.fillRect(x - 12, groundY - 70, 28, 4);
      }
    }
    if (motif === "winter") {
      for (let index = 0; index < 380; index += 1) {
        const x = rng() * width;
        const y = rng() * height;
        ctx.fillStyle = `rgba(236,230,216,${0.25 + rng() * 0.5})`;
        ctx.fillRect(x, y, 2, 2);
      }
    }
    if (motif === "crowd" || motif === "mountain" || motif === "night") {
      const count = motif === "crowd" ? 22 : 9;
      for (let index = 0; index < count; index += 1) {
        const x = width * (0.06 + rng() * 0.88);
        const scale = 0.7 + rng() * 0.6;
        const baseY = groundY + 14 + rng() * 26;
        ctx.fillStyle = "rgba(22,20,17,0.92)";
        ctx.beginPath();
        ctx.arc(x, baseY - 26 * scale, 4.4 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x - 4 * scale, baseY - 22 * scale, 8 * scale, 16 * scale);
        ctx.fillRect(x - 5 * scale, baseY - 7 * scale, 4 * scale, 9 * scale);
        ctx.fillRect(x + 1 * scale, baseY - 7 * scale, 4 * scale, 9 * scale);
      }
    }

    // 颗粒 + 单色化
    if (ctx.getImageData && ctx.putImageData) {
      try {
        const image = ctx.getImageData(0, 0, width, height);
        const data = image.data;
        for (let index = 0; index < data.length; index += 4) {
          const gray = data[index] * 0.3 + data[index + 1] * 0.59 + data[index + 2] * 0.11;
          const grain = (rng() - 0.5) * 34;
          const value = Clamp(gray + grain + palette.lift, 0, 255);
          data[index] = Clamp(value * 1.04 * palette.warmth + 6, 0, 255);
          data[index + 1] = Clamp(value * 0.99 + 2, 0, 255);
          data[index + 2] = Clamp(value * 0.9 * (2 - palette.warmth), 0, 255);
        }
        ctx.putImageData(image, 0, 0);
      } catch (error) {
        // 某些环境（如画布被污染）拿不到像素，退化为无颗粒版本即可。
      }
    }

    // 暗角
    const vignette = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.28,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.72
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(16,14,12,0.72)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    // 相纸边缘划痕
    ctx.strokeStyle = "rgba(232,220,192,0.12)";
    ctx.lineWidth = 1;
    for (let index = 0; index < 6; index += 1) {
      const x = rng() * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (rng() - 0.5) * 40, height);
      ctx.stroke();
    }
  }

  // ---- Confirm ------------------------------------------------------------

  function Confirm(payload = {}) {
    return new Promise((resolve) => {
      if (disposed) {
        resolve(false);
        return;
      }
      if (activeConfirm) ResolveConfirm(false);
      const layer = ClearNode(dom.modalLayer);
      SetFlag(layer, "is-open", true);
      SetAttr(layer, "aria-hidden", "false");
      const scrim = El("div", "pf-modal-scrim", { parent: layer });
      On(scrim, "click", () => ResolveConfirm(false));
      const box = El("div", `pf-modal is-${payload.tone || "info"}`, {
        parent: layer,
        attrs: { role: "alertdialog", "aria-modal": "true", "aria-label": payload.title || "确认" },
      });
      El("h3", "pf-modal-title", { text: payload.title || "确认", parent: box });
      El("p", "pf-modal-body", { text: payload.body || "", parent: box });
      if (Array.isArray(payload.rows) && payload.rows.length) {
        const rows = El("div", "pf-modal-rows", { parent: box });
        for (const row of payload.rows) {
          const line = El("div", "pf-modal-row", { parent: rows });
          El("span", null, { text: row.label, parent: line });
          El("b", `is-${row.tone || "flat"}`, { text: row.value, parent: line });
        }
      }
      const actions = El("div", "pf-modal-actions", { parent: box });
      const cancel = El("button", "pf-ghost", {
        text: payload.cancelLabel || "取消",
        parent: actions,
        attrs: { type: "button" },
      });
      On(cancel, "click", () => ResolveConfirm(false));
      const confirm = El("button", "pf-primary", {
        text: payload.confirmLabel || "确认",
        parent: actions,
        attrs: { type: "button" },
      });
      On(confirm, "click", () => ResolveConfirm(true));
      activeConfirm = { resolve };
      if (confirm.focus) Later(() => confirm.focus(), 30);
    });
  }

  function ResolveConfirm(value) {
    const pending = activeConfirm;
    activeConfirm = null;
    SetFlag(dom.modalLayer, "is-open", false);
    SetAttr(dom.modalLayer, "aria-hidden", "true");
    Later(() => {
      if (!activeConfirm) ClearNode(dom.modalLayer);
    }, 260);
    if (pending) pending.resolve(!!value);
  }

  // ---- 其它句柄方法 -------------------------------------------------------

  function SetBusy(value) {
    busy = !!value;
    SetFlag(dom.busy, "is-open", busy);
    SetAttr(dom.busy, "aria-hidden", busy ? "false" : "true");
    SetAttr(root, "aria-busy", busy ? "true" : "false");
    SetAttr(dom.endButton, "disabled", busy || (currentState && currentState.over) ? true : null);
  }

  function SetHint(text) {
    SetText(dom.hintBar, text === null || text === undefined ? "" : String(text));
    SetFlag(dom.hintBar, "is-empty", !text);
  }

  function Bind(nextHooks) {
    callbacks = Object.assign({}, callbacks, nextHooks || {});
    // hooks 里可以顺带带来数据表命名空间，随时接受更新。
    if (nextHooks && AdoptDefinitions(nextHooks.definitions)) {
      RenderMinimapLegend();
      cache.signatures.context = "";
      cache.minimapKey = "";
      if (currentState) Sync(currentState, currentView);
    }
    return callbacks;
  }

  function Dispose() {
    if (disposed) return;
    disposed = true;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    for (const entry of listeners) {
      if (entry.target && entry.target.removeEventListener) {
        entry.target.removeEventListener(entry.type, entry.handler, entry.options);
      }
    }
    listeners.length = 0;
    tooltipProviders.clear();
    if (activeCinematic) {
      activeCinematic.resolve(null);
      activeCinematic = null;
    }
    if (activeConfirm) {
      activeConfirm.resolve(false);
      activeConfirm = null;
    }
    ClearNode(root);
    if (root.classList) root.classList.remove("pf-ui");
  }

  // ---- 启动 ---------------------------------------------------------------

  // 构造时就吃下主循环预先加载好的定义表，保证第一帧即为中文。
  AdoptDefinitions(hooks && hooks.definitions);
  BuildShell();
  BindGlobalInput();
  RenderMinimapLegend();
  MeasureTopBar();
  // 移动端寸土寸金：略图默认收成图标按钮，玩家要看时再展开。
  if (ViewportSize().width <= 640) SetMinimapCollapsed(true);
  if (!definitions.loaded) EnsureDefinitions();
  SetHint("点选地块查看详情；选中队伍后在底部选择行动。空格结束回合。");

  /**
   * 可选外部插画：存在即用、失败即弃。图片铺满画布后再压一层暗角 + 颗粒，
   * 与程序化档案照片保持同一质感体系。
   */
  let illustrationSentinel = null;

  function TryExternalIllustration(canvas, kind) {
    const file = kind ? illustrationAssets[kind] : null;
    if (!file || !canvas || typeof Image === "undefined" || typeof fetch === "undefined") return;
    // 与音频同一套哨兵约定：Assets/CREDITS.md 不存在即视为未投放，零探测零 404。
    if (illustrationSentinel === null) {
      let enabled = false;
      try {
        enabled = typeof location !== "undefined" && /[?&#]assets=1\b/.test(location.search + location.hash);
      } catch (error) {
        enabled = false;
      }
      illustrationSentinel = enabled
        ? fetch(assetBase + "CREDITS.md", { method: "HEAD", cache: "force-cache" })
            .then((response) => Boolean(response && response.ok))
            .catch(() => false)
        : Promise.resolve(false);
    }
    illustrationSentinel.then((present) => {
      if (present) LoadIllustrationImage(canvas, file);
    });
    return;
  }

  function LoadIllustrationImage(canvas, file) {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      try {
        const context = canvas.getContext("2d");
        if (!context || !canvas.isConnected) return;
        const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
        const drawWidth = image.width * scale;
        const drawHeight = image.height * scale;
        context.drawImage(image, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
        const vignette = context.createRadialGradient(
          canvas.width / 2, canvas.height / 2, canvas.height * 0.32,
          canvas.width / 2, canvas.height / 2, canvas.height * 0.85,
        );
        vignette.addColorStop(0, "rgba(10,9,8,0)");
        vignette.addColorStop(1, "rgba(10,9,8,0.55)");
        context.fillStyle = vignette;
        context.fillRect(0, 0, canvas.width, canvas.height);
      } catch (error) {
        // 保留程序化插画
      }
    };
    image.src = assetBase + file;
  }

  // ---------------------------------------------------------------------
  // 单位牌：屏幕空间的兵种标识（对标文明VI的单位旗standard）
  // ---------------------------------------------------------------------
  const unitPlates = new Map();

  function UnitGlyph(type, side) {
    const named = definitions.units?.unitDefinitions?.[type]?.name;
    if (named && named.length) return named[0];
    return side === "Enemy" ? "敌" : "队";
  }

  function AcquirePlate(id) {
    let plate = unitPlates.get(id);
    if (plate) return plate;
    const rootNode = El("button", "pf-plate", { parent: dom.unitLayer, attrs: { type: "button" } });
    const glyph = El("span", "pf-plate-glyph", { parent: rootNode });
    const bar = El("span", "pf-plate-bar", { parent: rootNode });
    const fill = El("i", "pf-plate-fill", { parent: bar });
    const mark = El("span", "pf-plate-mark", { parent: rootNode });
    plate = { rootNode, glyph, fill, mark, unitId: id };
    On(rootNode, "click", (event) => {
      event.stopPropagation();
      Call("OnPickUnit", plate.unitId);
    });
    unitPlates.set(id, plate);
    return plate;
  }

  /**
   * 逐帧同步单位牌。project(key) 由主循环传入（世界坐标 → 屏幕坐标），
   * 数量级 ≤ 三十来个，直接更新 DOM transform，不做虚拟化。
   */
  function SyncUnitPlates(state, viewState, project) {
    if (!dom.unitLayer || !state || typeof project !== "function") return;
    const seen = new Set();
    const perHex = {};

    const PlaceOne = (unit, side) => {
      const hex = state.map && state.map.hexes ? state.map.hexes[unit.key] : null;
      if (!hex || !hex.explored) return;
      if (side === "Enemy" && !unit.visibleToPlayer) return;
      const spot = project(unit.key);
      if (!spot || spot.visible === false) return;
      const stack = (perHex[unit.key] = (perHex[unit.key] || 0) + 1) - 1;
      const plate = AcquirePlate(unit.id);
      plate.unitId = unit.id;
      seen.add(unit.id);
      const x = Math.round(spot.x + stack * 14 - 13);
      const y = Math.round(spot.y - 34 - stack * 5);
      plate.rootNode.style.transform = `translate(${x}px, ${y}px)`;
      plate.rootNode.style.display = "";
      SetFlag(plate.rootNode, "is-enemy", side === "Enemy");
      SetFlag(plate.rootNode, "is-friendly", side !== "Enemy");
      SetFlag(plate.rootNode, "is-hidden-unit", side !== "Enemy" && Boolean(unit.hidden));
      SetFlag(plate.rootNode, "is-acted", side !== "Enemy" && Boolean(unit.acted));
      SetFlag(plate.rootNode, "is-selected", viewState && viewState.selectedUnitId === unit.id);
      SetText(plate.glyph, UnitGlyph(unit.type, side));
      const ratio = unit.maxHp > 0 ? Clamp01Local(unit.hp / unit.maxHp) : 0;
      plate.fill.style.width = `${Math.round(ratio * 100)}%`;
      SetFlag(plate.rootNode, "is-low", ratio < 0.35);
      SetFlag(plate.rootNode, "is-mid", ratio >= 0.35 && ratio < 0.7);
      SetText(plate.mark, side !== "Enemy" && unit.hidden ? "隐" : "");
      const label = `${definitions.units?.unitDefinitions?.[unit.type]?.name ?? "部队"} ${Math.round(unit.hp)}/${unit.maxHp}`;
      SetAttr(plate.rootNode, "aria-label", label);
      SetAttr(plate.rootNode, "title", label);
    };

    for (const unit of state.units ?? []) PlaceOne(unit, "Player");
    for (const enemy of state.enemies ?? []) PlaceOne(enemy, "Enemy");

    for (const [id, plate] of unitPlates) {
      if (!seen.has(id)) {
        plate.rootNode.style.display = "none";
      }
    }
  }

  function Clamp01Local(value) {
    return value < 0 ? 0 : value > 1 ? 1 : value;
  }

  return {
    Sync,
    SyncUnitPlates,
    ShowPanel,
    Toast,
    Cinematic,
    Confirm,
    SetBusy,
    SetHint,
    FlashResource,
    Bind,
    Dispose,
    // 附带的只读工具，便于主 agent 复用同一套显示口径
    dom,
    GetActivePanel: () => activePanel,
  };
}
