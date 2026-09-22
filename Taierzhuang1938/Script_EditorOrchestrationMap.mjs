// ===========================================================================
// Script_EditorOrchestrationMap.mjs —— 关卡编排工作台的俯视图（canvas 2D，零 three）
//
// 契约见分包文档 §7。这一层只负责「把编排模型画成一张真实比例的俯视图，
// 并把鼠标动作翻译回世界坐标」，不碰任何运行时状态、不进 three 场景。
//
// 绘制口径：**北在上**（Z 小在上）、X 向右。一米就是一米 —— 面板上的距离
// 能直接拿尺子量，别在这里引入任何「示意图」式的挪位。
//
// 配色跟 Style_Interface.css 的界面主题同一家：冷灰底、旧金选中、浅灰字。
// 地表被压成暗色是有意的 —— 标记是主角，底图只交代「这是哪儿」。
//
// 为什么底图要缓存：`layout.SampleGroundColor` 里有壕沟网格与道路走廊的逐点
// 采样，整张图三十多万格。每帧重采一次的话拖动会掉到个位数帧率，所以 1 m 一格
// 烘到一张离屏 canvas（顺手做一次轻模糊，去掉采样噪点的块状感），之后只
// drawImage —— 模型换了才重烘。
//
// 文字为什么要排版：整关视野下二十几个锚点、二十一条路线、二十一个组的名字
// 会糊成一片黑边，既读不出来，还把它标注的那个标记本身啃掉一半。所以所有文字
// 都走一遍贪心避让（`PlaceLabels`）：按优先级放，放不下就换位置，再放不下就
// 不画。排版结果缓存在 `labelCache` 上，视野/阶段/选中没变就不重排。
//
// 容错口径：模型字段缺了就**不画那一层**，不抛错。工作台要在「P1 的表还没长
// 齐」「不在第一关」这些半成品状态下照样打得开。
//
// 交互口径：每一种「进去了的状态」都得有出口，而且出口不止一个 —— 折线可以
// 双击、回车、右键结束，Esc 整条不要，退格退一个点，换工具也算画完；画到一半时
// 光标旁写着这句话。开着某个模式却看不出来、或者只有一种退出办法，用户的感受
// 就是「点了没反应」和「停不下来」。
// ===========================================================================

import { PhaseLayout } from "./Script_MissionOrchestration.mjs";
import {
  ORCHESTRATION_ICONS, ICON_ORDER, IconLabel,
  IconForMember, IconForFriendly, IconForAnchor, IconForZone, IconForNote, StateBadge,
} from "./Data_OrchestrationIcons.mjs";

// ---------------------------------------------------------------------------
// 图标：一整批 64×64 白剪影 PNG，进程里只加载一次
//
// 为什么放模块级：工作台的弹窗开了关、关了开是常事，每次重开都重新 new Image()
// 拉二十三张图，既闪一下又白费请求。图片对象本身是无状态的，共享着用最省。
//
// 加载完成之前**不能出现空白**：`IconImage` 拿不到图就回 null，画的那一层退回
// 原来的几何标记（圆/方/三角）。所以「图还没到」只是长得朴素一点，不是一片空。
// ---------------------------------------------------------------------------
const ICON_IMAGES = new Map();
let iconsPromise = null;

/** 加载全部图标。返回的 Promise 解析成 `Map<名字, Image>`，失败的那张就是缺席。 */
export function LoadOrchestrationIcons(doc = null) {
  if (iconsPromise) return iconsPromise;
  const ImageCtor = globalThis.Image;
  if (typeof ImageCtor !== "function") {
    iconsPromise = Promise.resolve(ICON_IMAGES);   // 非浏览器环境：一张都不加载，照样能画
    return iconsPromise;
  }
  const jobs = [];
  for (const [name, spec] of Object.entries(ORCHESTRATION_ICONS)) {
    jobs.push(new Promise((resolve) => {
      const image = new ImageCtor();
      image.onload = () => { ICON_IMAGES.set(name, image); resolve(); };
      image.onerror = () => resolve();             // 少一张就少一张，不许拖垮整张图
      try {
        image.src = new URL(spec.file, import.meta.url).href;
      } catch (error) { resolve(); }
    }));
  }
  iconsPromise = Promise.all(jobs).then(() => ICON_IMAGES);
  void doc;
  return iconsPromise;
}
export function IconImage(name) { return ICON_IMAGES.get(name) || null; }

/**
 * 地图上这个敌人用哪张图标。
 *
 * 规则的正身在 `Data_OrchestrationIcons.IconForMember`（面板与地图共用），这里只
 * 按「14 px 下认不认得出」再拧一处：「上刺刀」那张画的是一把细长的枪，缩到整关
 * 视野只剩一道斜杠，看着像画崩了。所以图上照旧画步枪兵，刺刀退成**放大之后
 * 才出现的小角标**（`TraitBadge`）。
 *
 * 这一处拧在地图这层而不是登记表里，是因为它是**画法**的限制（多少像素能认出
 * 什么），不是「他是干什么的」的判断；面板用大图标，那边照旧该画刺刀。
 */
export function MapIconForMember(member, state = null, encounterId = null) {
  const icon = IconForMember(member, state, encounterId);
  return icon === "Bayonet" ? "Rifleman" : icon;
}
/** 特点角标（不是状态角标）：目前只有「上了刺刀」这一条。 */
export function TraitBadge(member) {
  return member?.bayonet ? "Bayonet" : null;
}
/** 测试与宿主问「这张图到底加载上没有」。 */
export function LoadedIconNames() { return [...ICON_IMAGES.keys()]; }

// ---------------------------------------------------------------------------
// 调色板。导出是给测试**数像素**用的：光看 visible 会漏掉「画上了却 1 px 都
// 看不见」，所以测试按这里的精确 RGB 去数实心填充的像素数（仓库旧账：刺刀装上
// 了却一个像素都看不见，16 项全绿照样漏过）。改颜色就等于改测试的 oracle。
//
// 取色跟着 Style_Interface.css：--ui-surface #101314、--ui-gold #dfbd68、
// --ui-bright #eeefec、--ui-muted #a3aaa4。
// ---------------------------------------------------------------------------
export const MAP_COLORS = Object.freeze({
  backdrop: [16, 19, 20],          // 关卡范围之外的空白 = 面板底色
  groundDark: [40, 44, 42],        // 地表亮度映射的下沿
  groundLight: [78, 82, 74],       // 上沿。压得住上面的标记，又还看得出田块与道路走廊
  grid: [176, 186, 178],           // 50 m 网格（很淡地画）
  road: [156, 148, 128],
  roadEdge: [40, 42, 38],
  railway: [104, 106, 100],
  sleeper: [138, 130, 112],
  trench: [124, 106, 82],
  trenchEdge: [38, 34, 28],
  blockFallback: [122, 124, 118],
  blockEdge: [20, 22, 22],
  anchor: [196, 203, 196],
  route: [96, 196, 214],
  tactic: [226, 122, 74],
  assault: [236, 176, 104],
  zone: [223, 189, 104],           // --ui-gold
  friendly: [96, 156, 236],
  // 「未出现」是一枚冷灰蓝，不是中性灰：图廓（北向箭头、刻度、比例尺）都是浅灰，
  // 它们压在暗底上抗锯齿出来的中间色全是 b≤r 的中性灰。中性灰里挑颜色，早晚会有
  // 一枚边缘像素正好等于它 —— 那会让「这一阶段一个未出现的人都没有」这条断言
  // 凭一个像素翻红（实测就是北向箭头那个「北」字的边缘）。偏蓝一档就撞不上了。
  enemyPending: [126, 136, 146],
  enemyStaged: [182, 62, 48],
  enemyDormant: [196, 118, 96],
  enemyActive: [255, 82, 62],
  enemyCleared: [112, 114, 110],
  // 缩到整关视野时，角标那张小图只剩七八个像素，看得出「有东西」却读不出是什么。
  // 所以小尺寸下角标退成一枚纯色点，用颜色区分：休眠冷蓝灰、待命黄。
  // 两枚都刻意躲开已经在数的颜色 —— 尤其不能用玩家那枚黄（`player`），
  // 否则「还没 SetLive 时玩家色像素必须是 0」那条断言会被待命的兵顶红。
  badgeDormant: [150, 176, 208],
  badgeStandby: [236, 200, 92],
  player: [255, 214, 64],
  liveEnemy: [255, 150, 96],
  liveDead: [124, 124, 120],
  guide: [122, 232, 160],
  sketch: [166, 126, 220],
  note: [152, 120, 192],
  select: [255, 211, 77],
  textLight: [238, 239, 236],      // --ui-bright
  textMuted: [163, 170, 164],      // --ui-muted
  halo: [10, 12, 12],              // 标记的深色描边：压在浅地表上也咬得住轮廓
  labelBack: [18, 21, 23],         // 文字底板（不透明：半透明底在这张图上既读不出字也数不出像素）
  handle: [30, 34, 39],            // 组把手 / 拍把手的芯片底色：不透明，测试能精确数
  legendBack: [13, 16, 17],        // --ui-panel 的不透明版；图例层的 oracle
  legendEdge: [116, 122, 116],
  scaleBar: [214, 217, 209],       // 比例尺 / 北向箭头 / 边缘刻度
});

const FONT_FAMILY = '"TzUiLatin", "TzUiSans", "Segoe UI", system-ui, sans-serif';
const FONT = `11px ${FONT_FAMILY}`;
const FONT_SMALL = `10px ${FONT_FAMILY}`;
const FONT_TINY = `9px ${FONT_FAMILY}`;
const GROUND_STEP_M = 1;
// 采样亮度几乎全落在 0.82–0.92 这条窄带里，直接乘个系数只会得到一张灰白纸。
// 先把这条窄带映射到暗色区间，地形起伏才看得出来。窗口开多宽是「对比度」旋钮：
// 开窄了田块的棋盘格会跳出来抢戏，开宽了又成一张纯色纸 —— 0.72–1.0 是折中。
const GROUND_FLOOR = 0.72;
const GROUND_CEIL = 1.0;
const GROUND_CHROMA = 0.45;        // 保留一点原色相，别全灰掉

// 把手芯片：成员质心旁边一枚小标签。偏移要大过成员点的拾取半径（7 px），
// 否则点人会点到把手上 —— 「把手不许遮住成员」是这枚芯片的硬条件。
const CHIP_PAD = 5;
const CHIP_H = 15;
const CHIP_DX = 11;
const CHIP_DY = -16;
const CHIP_HIT_R = 11;
// 挤成一堆就合并：同一组里两枚图标的中心近到「图标宽度 × 这个倍数」以内，
// 就并成一枚簇标记。1.7 是照真数据量的 —— 整关视野下前线那十二个人彼此相隔
// 10–13 m，换算过来 15–22 px，而图标才 14 px 宽；要把这一串串成一枚，
// 阈值得比图标本身再宽出大半个身位。**只在同一组内合并**，不同组各归各的。
const CLUSTER_GAP_FACTOR = 1.7;
// 小于这个像素尺寸就不画细节角标（闭眼 / 沙漏 / 骷髅 / 刺刀），改用一枚小色点。
const BADGE_DETAIL_PX = 18;
const LABEL_PAD_X = 4;
const LABEL_H = 13;
const MAX_LABELS = 72;             // 排版的硬上限：再多也读不过来，还白烧时间

// 标签优先级：数字小的先占位置。选中 > 组/拍 > 锚点 > 触发圈事实名 > 路线名。
// 悬停不在这条队伍里 —— 它走 tooltip，永远画在最上层，也永远不占别人的位置。
const PRIORITY = { select: 0, chip: 20, anchor: 40, zone: 50, route: 60 };
// 缩放不够时低优先级的名字直接不参加排版（px/m）。
const LABEL_ZOOM = { anchor: 0.85, zone: 1.35, route: 1.9 };

// 拾取分层：同一个位置上谁赢。人永远赢把手。
// 草图（用户自己画的圈/箭头/折线/标注）排在触发区与路线之上、锚点之下：它是刚画上去
// 的一笔，要点得中；可它又只是一层批注，不该把底下真正的编排对象挡住。
// 候选位（ghost）是个精确的点，跟人同级 —— 拖它 = 重放候选位，那是 move 工具的主用例。
const PICK_RANK = { zone: 1, route: 1, sketch: 1.5, anchor: 2, friendly: 2, chip: 3, note: 4, member: 5, live: 6, player: 7 };
// 拖出来的圈 / 箭头小于这么多像素就不算一笔：手一抖点一下会生成半径 1 m 的圈
// 和零长的箭头，删起来比画还麻烦。
const MIN_DRAG_PX = 4;

// 图例。**一行一张图标，跟图上画的是同一张图、同一种颜色**，所以图例就是
// 「这张图怎么读」的唯一答案，不是另画一套示意图。用词全是普通中文 ——
// 「pending」「standby」只有写它的人看得懂。
const LEGEND_ROWS = Object.freeze([
  { text: "敌人 · 未出现", icon: "Rifleman", color: "enemyPending", alpha: 0.64 },
  { text: "敌人 · 已生成", icon: "Rifleman", color: "enemyStaged" },
  { text: "敌人 · 待命", icon: "Rifleman", color: "enemyStaged", badge: "Reserve" },
  { text: "敌人 · 休眠", icon: "Rifleman", color: "enemyDormant", alpha: 0.74, badge: "Dormant" },
  { text: "敌人 · 活跃", icon: "Rifleman", color: "enemyActive" },
  { text: "敌人 · 已清除", icon: "Rifleman", color: "enemyCleared", alpha: 0.66, badge: "Cleared" },
  { text: "机枪手", icon: "MachineGunner", color: "enemyStaged" },
  { text: "上刺刀", icon: "Bayonet", color: "enemyStaged" },
  { text: "钉在原地", icon: "Hold", color: "enemyStaged" },
  { text: "飞机", icon: "Aircraft", color: "enemyStaged" },
  { text: "我方士兵", icon: "FriendlySquad", color: "friendly" },
  { text: "哨位", icon: "GuardPost", color: "friendly" },
  { text: "守军", icon: "Defender", color: "friendly" },
  { text: "机枪巢", icon: "ForwardNest", color: "friendly" },
  { text: "车辆 / 装车位", icon: "Cart", color: "friendly" },
  { text: "战车起点", icon: "Tank", color: "friendly" },
  { text: "玩家起点", icon: "Player", color: "friendly" },
  { text: "锚点", icon: "Anchor", color: "anchor" },
  { text: "院门", icon: "Gate", color: "anchor" },
  { text: "补给 / 炸药包", icon: "Supply", color: "anchor" },
  { text: "担架撤离点", icon: "Stretcher", color: "anchor" },
  { text: "触发区", icon: "Zone", color: "zone" },
  { text: "威胁处", icon: "Wave", color: "zone" },
  { text: "设计路线", icon: "Route", color: "route" },
  { text: "战术线 / 跃进线", swatch: "tactic" },
  { text: "实时 · 玩家", icon: "Player", color: "player" },
  { text: "实时 · 敌人 / 阵亡", swatch: "live" },
  { text: "实时 · 指引路线", swatch: "guide" },
  { text: "批注", icon: "Note", color: "note" },
]);

const TOOLS = new Set(["select", "pan", "circle", "arrow", "path", "label", "move"]);
const DEFAULT_LAYERS = Object.freeze({
  terrain: true, blocks: true, trenches: true, roads: true, anchors: true,
  routes: true, zones: true, friendlies: true, encounters: true, tactics: true,
  live: true, notes: true, labels: true, legend: true,
});

function Css(rgb, alpha = 1) {
  if (!rgb) return "rgba(0,0,0,0)";
  return alpha >= 1
    ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`
    : `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}
function HexCss(value, fallback, scale = 1) {
  if (!Number.isFinite(value)) return fallback;
  const n = value | 0;
  const r = Clamp(Math.round(((n >> 16) & 255) * scale), 0, 255);
  const g = Clamp(Math.round(((n >> 8) & 255) * scale), 0, 255);
  const b = Clamp(Math.round((n & 255) * scale), 0, 255);
  return `rgb(${r},${g},${b})`;
}
const Clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const Byte = (v) => Clamp(Math.round(v), 0, 255);

/** 折线点归一：既吃 `{x,z}` 也吃 `[x,z]`（railway.points 就是后者）。 */
function Points(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const p of list) {
    if (Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
      out.push({ x: p[0], z: p[1] });
    } else if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) {
      out.push({ x: p.x, z: p.z });
    }
  }
  return out;
}

export class OrchestrationMap {
  constructor(canvas, { model = null } = {}) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext("2d") : null;
    this.disposed = false;

    this.model = null;
    this.contentBounds = null;
    this.phaseNumber = 1;
    this.phaseLayout = null;
    this.live = null;
    this.selection = null;
    this.hover = null;
    this.layers = { ...DEFAULT_LAYERS };
    this.sketch = [];
    this.notes = [];
    this.tool = "select";
    // 过滤：null = 全画。每一类是一个 Set，不在集合里的对象不画、不拾取、
    // 也不参与标签避让 —— 工作台点「只看这一组」时地图必须真的清爽下来，
    // 而不是「画上了但点不中」这种半吊子状态。
    this.filter = null;
    // 本帧真画出去的标记。宿主与测试拿它回答「屏幕上到底有什么」，
    // 比翻模型准 —— 模型里有的东西可能被图层、过滤或视野挡掉了。
    this.drawnMarkers = [];
    this.marks = null;
    this.iconPx = 14;
    this.iconPixel = 1;
    // 合并阈值：null = 跟着图标尺寸自动算；给个数就是固定像素；0 = 不合并。
    this.clusterGap = null;
    // 染色缓存：白剪影 + 一种颜色 + 一个像素尺寸 → 一张离屏小图。
    // 不缓存的话每个标记每帧都要 source-in 合成一次，几百个人直接掉到个位数帧率。
    this.tintCache = new Map();

    this.dpr = 1;
    this.cssWidth = 800;
    this.cssHeight = 600;
    this.view = { cx: 0, cz: 0, scale: 2 };   // scale = 像素 / 米
    // 用户自己拖过 / 滚过之后视野算「手动」：跟随实时换阶段时不许再抢过去重新框景。
    // 两颗「适配」按钮（以及任何一次 Fit*）把它复位回「自动」。
    this.viewTouched = false;
    this.ground = null;
    this.picks = [];
    this.handles = [];
    // 排好版、真画上去了的标签矩形。互不相交是硬条件（测试咬这一条）。
    this.placedLabels = [];
    this.labelCache = null;
    this.scaleBar = null;
    this.gridTicks = null;
    this.gridStep = 50;
    this.soft = null;
    // 图例默认收着：工作台 1380 宽时地图栏只有 620 px，摊开的图例要吃掉三分之一。
    this.legendOpen = false;
    this.legendHit = null;
    this.drag = null;
    // 折线正在落的那几个点（世界坐标）。**永远是数组**：宿主要读它判断「还在画吗」，
    // 一会儿 null 一会儿数组的字段每个调用方都得先防一次空。
    this.pathPoints = [];
    // 候选位上一次拖的是谁。ghost 形状只记得 memberId，可候选位也能是锚点或触发区
    // 挪出来的 —— 再拖那一枚时得把原来的 target 原样还回去。
    this.moveTarget = null;
    // 一次性的「@ 提及」武装：下一次普通左键点击等同 Ctrl+点，点完就解除。
    this.mentionArmed = false;
    // 光标旁那句小提示这一帧画在哪儿（没画就是 null）。测试与宿主按它取证。
    this.cursorHint = null;
    this.spaceDown = false;
    this.pointer = null;

    this.callbacks = { select: [], hover: [], sketch: [], move: [], label: [], mention: [] };

    this.handlers = {
      down: (e) => this.OnDown(e),
      move: (e) => this.OnMove(e),
      up: (e) => this.OnUp(e),
      // 鼠标离开画布：橡皮筋预览与光标提示都钉在最后那个位置，必须重画一次抹掉。
      // SetHover(null) 只在 hover 真的变了时才重画，画折线时 hover 本来就是 null。
      leave: () => { this.pointer = null; this.SetHover(null); this.Redraw(); },
      wheel: (e) => this.OnWheel(e),
      dbl: (e) => this.OnDoubleClick(e),
      menu: (e) => e.preventDefault(),
      winMove: (e) => { if (e.target !== this.canvas) this.OnMove(e); },
      winUp: (e) => { if (e.target !== this.canvas) this.OnUp(e); },
      keyDown: (e) => this.OnKeyDown(e),
      // 松开空格一律停平移：按下时焦点在画布、松开时焦点跑进输入框，这种半截状态
      // 会让地图从此一直以为空格按着。
      keyUp: (e) => { if (e.code === "Space" || e.key === " ") this.spaceDown = false; },
    };
    // 武装「@ 提及」时把鼠标样式换成十字；解除时还回宿主原来设的那一个。
    this.baseCursor = canvas?.style?.cursor || "";
    if (canvas) {
      canvas.addEventListener("mousedown", this.handlers.down);
      canvas.addEventListener("mousemove", this.handlers.move);
      canvas.addEventListener("mouseup", this.handlers.up);
      canvas.addEventListener("mouseleave", this.handlers.leave);
      canvas.addEventListener("wheel", this.handlers.wheel, { passive: false });
      canvas.addEventListener("dblclick", this.handlers.dbl);
      canvas.addEventListener("contextmenu", this.handlers.menu);
      const win = canvas.ownerDocument?.defaultView || globalThis;
      this.win = win;
      win.addEventListener("mousemove", this.handlers.winMove);
      win.addEventListener("mouseup", this.handlers.winUp);
      win.addEventListener("keydown", this.handlers.keyDown);
      win.addEventListener("keyup", this.handlers.keyUp);
    }

    this.Resize();
    if (model) this.SetModel(model);

    // 图标到齐了再重画一次。在这之前画的是几何标记（不会是空白），
    // 所以宿主不等 `ready` 也能立刻看到东西；测试则 `await map.ready` 再数像素。
    this.ready = LoadOrchestrationIcons(canvas?.ownerDocument || null).then(() => {
      if (this.disposed) return this;
      this.tintCache.clear();
      this.labelCache = null;
      this.Redraw();
      return this;
    });
  }

  // -------------------------------------------------------------------------
  // 过滤（V2 的面板调这个：「只看这一组 / 这一阶段的这几条」）
  // -------------------------------------------------------------------------
  /**
   * `filter = { members, encounters, routes, zones, friendlies, anchors, notes }`，
   * 每一项是 Set 或 null；null（或整个 filter 传 null）= 这一类全画。
   */
  SetFilter(filter) {
    if (!filter) {
      this.filter = null;
    } else {
      const next = {};
      for (const key of ["members", "encounters", "routes", "zones", "friendlies", "anchors", "notes"]) {
        const value = filter[key];
        next[key] = value instanceof Set ? value : (Array.isArray(value) ? new Set(value) : null);
      }
      this.filter = next;
    }
    this.labelCache = null;
    this.Redraw();
    return this;
  }
  /** 这一类里的这个 id 该不该画。没设过滤就一律该画。 */
  Allowed(kind, id) {
    const set = this.filter?.[kind];
    if (!set) return true;
    return set.has(id);
  }
  AllowedMember(encounterId, memberId) {
    return this.Allowed("encounters", encounterId) && this.Allowed("members", memberId);
  }
  /**
   * 实时小队的这个人该不该画。
   *
   * `friendlies` 集合装的是**设计**友军点的 id（squadPost、guardPost 那几个），
   * 实时小队的 id 是角色号（luo、zhou…）—— 两套 id 根本不是一个命名空间。照集合
   * 直接滤的话，一点「只看某一处友军点」，正跟着玩家走的那个班就整个没了。
   * 所以只有当这个 id 真的也是个设计友军点、而且被滤掉了，才不画。
   */
  SquadAllowed(id) {
    const set = this.filter?.friendlies;
    if (!set || set.has(id)) return true;
    return !(this.model?.friendlies || []).some((entry) => entry.id === id);
  }

  /**
   * 挤成一堆时合并的阈值。`null` = 跟着图标尺寸自动算（默认），
   * `0` = 一个都不合并（想逐个点人时用），给个正数就是固定像素。
   */
  SetClusterGap(px) {
    this.clusterGap = Number.isFinite(px) && px >= 0 ? px : null;
    this.labelCache = null;
    this.Redraw();
    return this;
  }
  ClusterGapPx() {
    return Number.isFinite(this.clusterGap) ? this.clusterGap : this.iconPx * CLUSTER_GAP_FACTOR;
  }

  // -------------------------------------------------------------------------
  // 输入口
  // -------------------------------------------------------------------------
  SetModel(model) {
    this.model = model || null;
    this.ground = null;
    this.contentBounds = this.ComputeContentBounds();
    this.labelCache = null;
    this.SetPhase(this.phaseNumber);
    this.FitBounds();
    return this;
  }

  /** 阶段状态从 P1 的 `PhaseLayout` 取；它还没长齐时退回一份保守推断。 */
  SetPhase(n) {
    const number = Number.isFinite(n) ? Math.round(n) : 1;
    this.phaseNumber = number;
    let layout = null;
    if (this.model) {
      try {
        if (typeof PhaseLayout === "function") layout = PhaseLayout(this.model, number);
      } catch (error) {
        layout = null;
      }
      if (!layout || !Array.isArray(layout.encounters)) layout = this.FallbackPhaseLayout(number);
    }
    this.phaseLayout = layout;
    this.labelCache = null;
    this.Redraw();
    return this;
  }

  /** PhaseLayout 缺席时的兜底：只按 encounter.phaseNumber 分「还没到 / 已经到」。 */
  FallbackPhaseLayout(number) {
    const encounters = [];
    for (const encounter of this.model?.encounters || []) {
      const start = Number.isFinite(encounter.phaseNumber) ? encounter.phaseNumber : 1;
      let state = number < start ? "pending" : "spawned";
      if (state !== "pending" && encounter.dormant) state = "dormant";
      if (Number.isFinite(encounter.clearedAtPhase) && number > encounter.clearedAtPhase) state = "cleared";
      encounters.push({ ...encounter, state });
    }
    return {
      encounters,
      zones: this.model?.zones || [],
      routes: Object.keys(this.model?.routes || {}),
      friendlies: this.model?.friendlies || [],
      steps: (this.model?.phases || []).find((p) => p.number === number)?.steps || [],
    };
  }

  SetLive(live) { this.live = live || null; this.Redraw(); return this; }
  SetSelection(sel) { this.selection = sel || null; this.labelCache = null; this.Redraw(); return this; }
  SetHover(sel) {
    const before = this.hover;
    this.hover = sel || null;
    if (SameSel(before, this.hover)) return this;
    this.Emit("hover", this.hover);
    this.Redraw();
    return this;
  }
  SetLayers(layers) { Object.assign(this.layers, layers || {}); this.labelCache = null; this.Redraw(); return this; }
  /** 图例摊开还是收成一枚芯片。芯片本身也归 `legend` 图层管，关掉就一起没。 */
  SetLegendOpen(on) {
    const next = !!on;
    if (next === this.legendOpen) return this;
    this.legendOpen = next;
    this.labelCache = null;         // 图例占的地方变了，标签得重新排
    this.Redraw();
    return this;
  }
  SetSketch(shapes) {
    this.sketch = Array.isArray(shapes) ? shapes.slice() : [];
    // 草图换了一整批时，选中的那个下标可能已经指向别人、或者指空了（宿主删掉一笔
    // 之后下标整体前移）。指空就把选中清掉 —— 宁可没选中，也不能描亮错的那一笔。
    if (this.selection?.kind === "sketch" && !this.sketch[this.selection.index]) {
      this.selection = null;
      this.labelCache = null;
    }
    this.Redraw();
    return this;
  }
  SetNotes(notes) { this.notes = Array.isArray(notes) ? notes.slice() : []; this.Redraw(); return this; }
  /**
   * 换工具。**没画完的折线先收尾再换**：已经落了两个点以上就当这一笔画完了
   * （辛苦点出来的线因为顺手点了别的工具就没了，比多出一笔还气人），只落了一个点
   * 才当没画过 —— 一个点连不成线，留着也没用。
   */
  SetTool(tool) {
    const next = TOOLS.has(tool) ? tool : "select";
    if (next !== this.tool) {
      if (this.tool === "path") {
        if (this.pathPoints.length >= 2) this.FinishPath();
        else this.CancelPath();
      }
      // 换工具 = 上一件事做完了：拖到一半的圈/箭头/候选位不该跟着新工具继续。
      this.drag = null;
    }
    this.tool = next;
    this.Redraw();
    return this;
  }

  onSelect(cb) { if (typeof cb === "function") this.callbacks.select.push(cb); return this; }
  onHover(cb) { if (typeof cb === "function") this.callbacks.hover.push(cb); return this; }
  onSketch(cb) { if (typeof cb === "function") this.callbacks.sketch.push(cb); return this; }
  onMove(cb) { if (typeof cb === "function") this.callbacks.move.push(cb); return this; }
  /**
   * 标注工具落点。宿主接了这个回调就由宿主自己弹输入框（工作台是在弹窗 DOM 里
   * 就地长一个小输入框），没人接才退回「直接产出一枚空文字的 label 形状」——
   * 这样单跑俯视图模块的测试与旧用法都不受影响。
   */
  onLabel(cb) { if (typeof cb === "function") this.callbacks.label.push(cb); return this; }
  /**
   * 「@ 提及」：Ctrl（Mac 上 Meta）点图上任何一个点得中的对象，或者武装之后点一下。
   * 载荷跟 `onSelect` 同形，但**不改选中、不改画面** —— 它说的是「我要在文字里提到
   * 这个东西」，不是「我现在要看它」。这两件事混在一起的话，用户为了提一句话就得
   * 把正在看的对象丢掉。
   */
  onMention(cb) { if (typeof cb === "function") this.callbacks.mention.push(cb); return this; }
  /**
   * 武装一次性的 @ 提及：接下来那一次普通左键点击等同 Ctrl+点，**点完就解除**
   * （点空地也解除 —— 悬着一个隐形的模式比没有还糟）。给的是右栏那个「@」按钮用的：
   * 光有 Ctrl+点的话，没人知道有这么个用法。
   */
  ArmMention(on = true) {
    const next = !!on;
    if (next === this.mentionArmed) return this;
    this.mentionArmed = next;
    if (this.canvas?.style) this.canvas.style.cursor = next ? "crosshair" : this.baseCursor;
    this.Redraw();
    return this;
  }
  Emit(name, payload) {
    if (this.disposed) return;
    for (const cb of this.callbacks[name] || []) {
      try { cb(payload); } catch (error) { /* 宿主回调出错不许拖垮绘制 */ }
    }
  }

  // -------------------------------------------------------------------------
  // 坐标
  // -------------------------------------------------------------------------
  Viewport() {
    return { w: this.cssWidth, h: this.cssHeight, scale: this.view.scale, cx: this.view.cx, cz: this.view.cz };
  }
  WorldToScreen(x, z) {
    const v = this.Viewport();
    return { x: (x - v.cx) * v.scale + v.w / 2, y: (z - v.cz) * v.scale + v.h / 2 };
  }
  ScreenToWorld(px, py) {
    const v = this.Viewport();
    return { x: (px - v.w / 2) / v.scale + v.cx, z: (py - v.h / 2) / v.scale + v.cz };
  }
  LocalPoint(event) {
    const rect = this.canvas?.getBoundingClientRect?.();
    if (!rect) return { x: event.clientX || 0, y: event.clientY || 0 };
    return { x: (event.clientX || 0) - rect.left, y: (event.clientY || 0) - rect.top };
  }

  /**
   * 「整关」到底是多大一块。地图数据的 bounds 是 342 × 1001 m，但第一关的戏
   * 全在北边那 484 m 里（Z −215…269）：照 bounds 框景，一半以上的画布是空地，
   * 整关视野只剩 0.8 px/m，什么都读不出来。所以「整关」= 编排真正用到的范围。
   */
  ComputeContentBounds() {
    const model = this.model;
    const b = model?.bounds;
    if (!model) return null;
    const box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    const Add = (x, z) => {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      if (x < box.minX) box.minX = x; if (x > box.maxX) box.maxX = x;
      if (z < box.minZ) box.minZ = z; if (z > box.maxZ) box.maxZ = z;
    };
    for (const encounter of model.encounters || []) {
      for (const member of encounter.members || []) {
        Add(member.x, member.z);
        for (const point of Points(member.tactic?.points)) Add(point.x, point.z);
      }
    }
    for (const route of Object.values(model.routes || {})) for (const p of Points(route)) Add(p.x, p.z);
    for (const anchor of Object.values(model.anchors || {})) Add(anchor?.x, anchor?.z);
    for (const friendly of model.friendlies || []) Add(friendly.x, friendly.z);
    for (const zone of model.zones || []) {
      if (Number.isFinite(zone.radiusM) && Number.isFinite(zone.x)) {
        Add(zone.x - zone.radiusM, zone.z - zone.radiusM);
        Add(zone.x + zone.radiusM, zone.z + zone.radiusM);
      } else if (Number.isFinite(zone.minX)) {
        Add(zone.minX, zone.minZ); Add(zone.maxX, zone.maxZ);
      }
    }
    if (box.minX > box.maxX) return b ? { ...b } : null;
    const pad = 26;
    const out = {
      minX: box.minX - pad, maxX: box.maxX + pad,
      minZ: box.minZ - pad, maxZ: box.maxZ + pad,
    };
    if (b && Number.isFinite(b.minX)) {
      out.minX = Math.max(out.minX, b.minX); out.maxX = Math.min(out.maxX, b.maxX);
      out.minZ = Math.max(out.minZ, b.minZ); out.maxZ = Math.min(out.maxZ, b.maxZ);
    }
    return out;
  }

  FitBounds() {
    const region = this.contentBounds || this.model?.bounds;
    if (!region || !Number.isFinite(region.minX)) { this.Redraw(); return this; }
    this.FitRegion(region);
    return this;
  }
  FitRegion(region, padding = 24) {
    const w = Math.max(1, region.maxX - region.minX);
    const d = Math.max(1, region.maxZ - region.minZ);
    const scale = Math.min((this.cssWidth - padding * 2) / w, (this.cssHeight - padding * 2) / d);
    this.view.scale = Math.max(0.05, scale);
    this.view.cx = (region.minX + region.maxX) / 2;
    this.view.cz = (region.minZ + region.maxZ) / 2;
    this.viewTouched = false;         // 框过景 = 回到「自动」，跟随实时可以接手了
    this.Redraw();
    return this;
  }
  FitPhase(n) {
    if (Number.isFinite(n) && n !== this.phaseNumber) this.SetPhase(n);
    const box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    const Add = (x, z) => {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      if (x < box.minX) box.minX = x; if (x > box.maxX) box.maxX = x;
      if (z < box.minZ) box.minZ = z; if (z > box.maxZ) box.maxZ = z;
    };
    // 只框「这一阶段正在演的那几个人」。两类东西会把框子撑回整关视野，都要挡掉：
    // 已清除的组（第 12 阶段有十一个，遍布全关），以及不属于任何阶段的常驻防御点
    // （phaseNumber 为 null，从车站一直排到南边）。它们都不是这一阶段的戏。
    for (const encounter of this.phaseLayout?.encounters || []) {
      if (encounter.state === "pending" || encounter.state === "cleared") continue;
      for (const member of encounter.members || []) Add(member.x, member.z);
    }
    if (box.minX > box.maxX) {
      // 这一阶段场上一个敌人都没有（第 1/2/11 阶段）：退而框本阶段的友军。
      for (const friendly of this.phaseLayout?.friendlies || []) {
        if (friendly.phaseNumber === this.phaseNumber) Add(friendly.x, friendly.z);
      }
    }
    if (box.minX > box.maxX) return this.FitBounds();
    const pad = 30;
    return this.FitRegion({
      minX: box.minX - pad, maxX: box.maxX + pad, minZ: box.minZ - pad, maxZ: box.maxZ + pad,
    });
  }
  /** 跳到某一点（「定位」批注用）。这是用户点名要看的地方，算手动视野。 */
  ZoomTo(point, radiusM = 40) {
    if (!point || !Number.isFinite(point.x)) return this;
    this.view.cx = point.x;
    this.view.cz = point.z;
    const r = Math.max(1, radiusM);
    this.view.scale = Math.max(0.05, Math.min(this.cssWidth, this.cssHeight) / (2 * r));
    this.viewTouched = true;
    this.Redraw();
    return this;
  }

  Resize() {
    if (!this.canvas) return this;
    const win = this.canvas.ownerDocument?.defaultView || globalThis;
    this.dpr = Math.min(Math.max(win.devicePixelRatio || 1, 1), 2);
    const cssW = this.canvas.clientWidth || this.canvas.width || 800;
    const cssH = this.canvas.clientHeight || this.canvas.height || 600;
    this.cssWidth = Math.max(16, Math.round(cssW));
    this.cssHeight = Math.max(16, Math.round(cssH));
    const pxW = Math.round(this.cssWidth * this.dpr);
    const pxH = Math.round(this.cssHeight * this.dpr);
    if (this.canvas.width !== pxW) this.canvas.width = pxW;
    if (this.canvas.height !== pxH) this.canvas.height = pxH;
    this.labelCache = null;
    this.Redraw();
    return this;
  }

  // -------------------------------------------------------------------------
  // 底图缓存：1 m 一格烘一次，顺手轻模糊
  // -------------------------------------------------------------------------
  BuildGround() {
    const layout = this.model?.layout;
    const b = this.model?.bounds;
    if (!layout || typeof layout.SampleGroundColor !== "function" || !b || !Number.isFinite(b.minX)) {
      this.ground = null;
      return null;
    }
    const doc = this.canvas?.ownerDocument || globalThis.document;
    if (!doc) { this.ground = null; return null; }
    const cols = Math.max(1, Math.ceil((b.maxX - b.minX) / GROUND_STEP_M));
    const rows = Math.max(1, Math.ceil((b.maxZ - b.minZ) / GROUND_STEP_M));
    const off = doc.createElement("canvas");
    off.width = cols;
    off.height = rows;
    const ctx = off.getContext("2d");
    const image = ctx.createImageData(cols, rows);
    const out = [0, 0, 0];
    const dark = MAP_COLORS.groundDark;
    const light = MAP_COLORS.groundLight;
    const raw = new Float32Array(cols * rows * 3);
    for (let j = 0; j < rows; j += 1) {
      const z = b.minZ + (j + 0.5) * GROUND_STEP_M;
      for (let i = 0; i < cols; i += 1) {
        const x = b.minX + (i + 0.5) * GROUND_STEP_M;
        let r = 0.85, g = 0.85, bl = 0.85;
        try {
          const sample = layout.SampleGroundColor(x, z, out);
          if (sample && Number.isFinite(sample[0])) { r = sample[0]; g = sample[1]; bl = sample[2]; }
        } catch (error) { /* 采样器不在状态就用中灰，别整层塌掉 */ }
        const lum = 0.3 * r + 0.59 * g + 0.11 * bl;
        const t = Clamp((lum - GROUND_FLOOR) / (GROUND_CEIL - GROUND_FLOOR), 0, 1);
        const k = (j * cols + i) * 3;
        raw[k] = dark[0] + (light[0] - dark[0]) * t + (r - lum) * GROUND_CHROMA * 255;
        raw[k + 1] = dark[1] + (light[1] - dark[1]) * t + (g - lum) * GROUND_CHROMA * 255;
        raw[k + 2] = dark[2] + (light[2] - dark[2]) * t + (bl - lum) * GROUND_CHROMA * 255;
      }
    }
    // 1-2-1 可分离模糊一遍：采样器的噪点按格给值，不抹一下整张图就是方块斑。
    const tmp = new Float32Array(raw.length);
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        const k = (j * cols + i) * 3;
        const kl = (j * cols + Math.max(0, i - 1)) * 3;
        const kr = (j * cols + Math.min(cols - 1, i + 1)) * 3;
        tmp[k] = (raw[kl] + raw[k] * 2 + raw[kr]) * 0.25;
        tmp[k + 1] = (raw[kl + 1] + raw[k + 1] * 2 + raw[kr + 1]) * 0.25;
        tmp[k + 2] = (raw[kl + 2] + raw[k + 2] * 2 + raw[kr + 2]) * 0.25;
      }
    }
    for (let j = 0; j < rows; j += 1) {
      const up = Math.max(0, j - 1) * cols * 3;
      const down = Math.min(rows - 1, j + 1) * cols * 3;
      const mid = j * cols * 3;
      for (let i = 0; i < cols; i += 1) {
        const o = i * 3;
        const k = (j * cols + i) * 4;
        image.data[k] = Byte((tmp[up + o] + tmp[mid + o] * 2 + tmp[down + o]) * 0.25);
        image.data[k + 1] = Byte((tmp[up + o + 1] + tmp[mid + o + 1] * 2 + tmp[down + o + 1]) * 0.25);
        image.data[k + 2] = Byte((tmp[up + o + 2] + tmp[mid + o + 2] * 2 + tmp[down + o + 2]) * 0.25);
        image.data[k + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    this.ground = {
      canvas: off, minX: b.minX, minZ: b.minZ,
      width: cols * GROUND_STEP_M, depth: rows * GROUND_STEP_M,
    };
    return this.ground;
  }

  // -------------------------------------------------------------------------
  // 图标：固定屏幕尺寸、按状态染色、按「图标×颜色×尺寸」缓存
  // -------------------------------------------------------------------------
  /**
   * 图标在屏幕上的边长（px）。**固定屏幕尺寸**，不随缩放线性放大 ——
   * 标记是符号不是实物，缩到整关也得认得出，放大看细节时才稍微长大一点。
   */
  IconPixels(view) {
    const scale = Number.isFinite(view?.scale) ? view.scale : this.view.scale;
    return Math.round(Clamp(14 + (scale - 1.8) * 1.7, 14, 22));
  }

  /**
   * 白剪影 → 「带深色描边的彩色图标」。缓存键 = 图标 × 颜色 × 像素尺寸。
   *
   * 描边**烘进缓存**，不是每帧画八遍：地图上同时有一百多个标记，每个描边四到八次
   * 就是上千次 drawImage。烘一次之后每个标记只剩一次 drawImage，一帧还是 1.5 ms。
   *
   * 为什么非要描边不可：试过在图标底下垫一枚深色圆盘，14 px 的图标压在圆盘上
   * 就成了一坨深色泥 —— 图标本身的颜色（尤其「未出现」那枚冷灰蓝）和圆盘分不开。
   * 描边只贴着剪影的轮廓走，把图标从地表里剥出来，颜色还是干净的。
   */
  TintedIcon(name, color, raster) {
    const image = ICON_IMAGES.get(name);
    if (!image) return null;
    const css = Array.isArray(color) ? Css(color) : String(color);
    const key = `${name}|${css}|${raster}`;
    const hit = this.tintCache.get(key);
    if (hit) return hit;
    const doc = this.canvas?.ownerDocument || globalThis.document;
    if (!doc) return null;
    const Layer = (size, fill) => {
      const c = doc.createElement("canvas");
      c.width = size;
      c.height = size;
      const g = c.getContext("2d");
      if (!g) return null;
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "high";
      g.drawImage(image, 0, 0, size, size);
      g.globalCompositeOperation = "source-in";   // 只染剪影，透明的地方还是透明
      g.fillStyle = fill;
      g.fillRect(0, 0, size, size);
      return c;
    };
    const pad = Math.max(1, Math.round(raster * 0.075));
    const inner = Math.max(6, raster - pad * 2);
    const glyph = Layer(inner, css);
    const edge = Layer(inner, Css(MAP_COLORS.halo));
    if (!glyph || !edge) return null;
    const off = doc.createElement("canvas");
    off.width = raster;
    off.height = raster;
    const g = off.getContext("2d");
    if (!g) return null;
    for (let k = 0; k < 8; k += 1) {
      const angle = (Math.PI * 2 * k) / 8;
      g.drawImage(edge, pad + Math.cos(angle) * pad, pad + Math.sin(angle) * pad, inner, inner);
    }
    g.drawImage(glyph, pad, pad, inner, inner);
    if (this.tintCache.size > 420) this.tintCache.clear();
    this.tintCache.set(key, off);
    return off;
  }

  /**
   * 画一枚图标。`size` 是屏幕边长；`pixel` 是这张画布的设备像素倍率（实时画布是
   * devicePixelRatio，出图是放大倍数）—— 染色小图按设备像素烘，缩下去才不糊。
   * 回 false 表示这张图还没加载好，调用方该退回几何标记。
   */
  DrawIcon(ctx, x, y, name, color, size, {
    pixel = 1, alpha = 1, plate = 0, badge = null, rotate = 0,
  } = {}) {
    const raster = Math.max(12, Math.round(size * pixel));
    const tinted = this.TintedIcon(name, color, raster);
    if (!tinted) return false;
    const half = size / 2;
    if (plate > 0) {
      // 可选的圆形底盘。默认不给 —— 描边已经把图标从地表里剥出来了，
      // 再垫一层只会把图标自己的颜色压暗。挤成一堆的那几层才开它。
      ctx.fillStyle = Css(MAP_COLORS.halo, plate);
      ctx.beginPath();
      ctx.arc(x, y, half * 0.92, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    if (rotate) {
      ctx.translate(x, y);
      ctx.rotate(rotate);
      ctx.drawImage(tinted, -half, -half, size, size);
    } else {
      ctx.drawImage(tinted, x - half, y - half, size, size);
    }
    ctx.restore();
    if (badge) {
      // 角标：休眠的闭眼、待命的沙漏、已清除的骷髅。用亮灰不用状态色 ——
      // 和身下那枚同色的图标叠在一起就分不出层了。
      const bs = Math.max(8, Math.round(size * 0.5));
      const bx = x + half - bs * 0.3;
      const by = y + half - bs * 0.3;
      ctx.fillStyle = Css(MAP_COLORS.halo, 0.92);
      ctx.beginPath();
      ctx.arc(bx, by, bs * 0.62, 0, Math.PI * 2);
      ctx.fill();
      const mark = this.TintedIcon(badge, MAP_COLORS.textLight, Math.max(10, Math.round(bs * pixel)));
      if (mark) ctx.drawImage(mark, bx - bs / 2, by - bs / 2, bs, bs);
    }
    return true;
  }

  /**
   * 每枚标记中心那颗不透明的小芯。
   *
   * 两个用处，缺一不可：一是图标只是个符号，真正「他站在哪儿」得有个准点；
   * 二是测试要数像素 —— 图标缩到 14 px、再加半透明与抗锯齿之后，细线图标
   * （路线、波、闭眼）可能一个精确 RGB 的像素都剩不下，而「画上了却一个像素
   * 都验不到」正是这个仓库栽过的跟头。这颗芯永远是精确色、永远不透明。
   */
  CorePixel(ctx, x, y, color, r = 1.6) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = Css(color);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /** 记一笔「本帧真画出去了」。 */
  Mark(entry) {
    if (this.marks) this.marks.push(entry);
  }

  // -------------------------------------------------------------------------
  // 绘制
  // -------------------------------------------------------------------------
  Redraw() {
    if (this.disposed || !this.ctx) return this;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.picks = [];
    this.Paint(ctx, { ...this.Viewport(), pixel: this.dpr }, { picks: this.picks, interactive: true });
    return this;
  }

  /** 把手（组 / 转运威胁）的屏幕中心点；测试与宿主拿它去点、去对位。 */
  HandlePoint(kind, id) {
    const found = this.handles.find((entry) => entry.kind === kind && entry.id === id);
    return found ? { x: found.cx, y: found.cy, w: found.w, h: found.h } : null;
  }

  ToPng({ scale = 1, region = null } = {}) {
    const doc = this.canvas?.ownerDocument || globalThis.document;
    if (!doc) return "";
    const factor = Math.max(0.1, Math.min(scale || 1, 4));
    const w = Math.max(16, Math.round(this.cssWidth * factor));
    const h = Math.max(16, Math.round(this.cssHeight * factor));
    const off = doc.createElement("canvas");
    off.width = w;
    off.height = h;
    const ctx = off.getContext("2d");
    let view;
    if (region && Number.isFinite(region.minX)) {
      const rw = Math.max(1, region.maxX - region.minX);
      const rd = Math.max(1, region.maxZ - region.minZ);
      const s = Math.min((w - 16) / rw, (h - 16) / rd);
      view = { w, h, scale: Math.max(0.05, s), cx: (region.minX + region.maxX) / 2, cz: (region.minZ + region.maxZ) / 2, pixel: factor };
    } else {
      view = { w, h, scale: this.view.scale * factor, cx: this.view.cx, cz: this.view.cz, pixel: factor };
    }
    this.Paint(ctx, view, { picks: null, interactive: false });
    return off.toDataURL("image/png");
  }

  /**
   * 「这一套图标都长什么样」一张图：每个图标配一行中文名，外加 16 px 的缩略
   * （图标是要在 14–22 px 上看的，只看大图看不出哪一个到那个尺寸就糊了）。
   * 工作台的帮助里放它，测试也存一张当验收底片。
   */
  IconSheetPng({ columns = 6, cell = 104 } = {}) {
    const doc = this.canvas?.ownerDocument || globalThis.document;
    if (!doc) return "";
    const names = ICON_ORDER;
    const rows = Math.ceil(names.length / columns);
    const off = doc.createElement("canvas");
    off.width = columns * cell;
    off.height = rows * cell;
    const ctx = off.getContext("2d");
    ctx.fillStyle = Css(MAP_COLORS.backdrop);
    ctx.fillRect(0, 0, off.width, off.height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < names.length; i += 1) {
      const name = names[i];
      const cx = (i % columns) * cell + cell / 2;
      const cy = Math.floor(i / columns) * cell + cell / 2;
      ctx.fillStyle = Css(MAP_COLORS.groundDark);
      ctx.fillRect(cx - cell / 2 + 4, cy - cell / 2 + 4, cell - 8, cell - 8);
      this.DrawIcon(ctx, cx, cy - 16, name, MAP_COLORS.textLight, 46, { pixel: 2, plate: 0 });
      this.DrawIcon(ctx, cx - 14, cy + 18, name, MAP_COLORS.enemyStaged, 16, { pixel: 2, plate: 0 });
      this.DrawIcon(ctx, cx + 10, cy + 18, name, MAP_COLORS.friendly, 22, { pixel: 2, plate: 0 });
      ctx.font = FONT_SMALL;
      ctx.fillStyle = Css(MAP_COLORS.textMuted);
      ctx.fillText(`${IconLabel(name)}  ${name}`, cx, cy + 40);
    }
    ctx.textAlign = "left";
    return off.toDataURL("image/png");
  }

  Paint(ctx, view, { picks = null, interactive = false } = {}) {
    const Project = (x, z) => ({ x: (x - view.cx) * view.scale + view.w / 2, y: (z - view.cz) * view.scale + view.h / 2 });
    const Push = (sel, px, py, r, rank = 1) => { if (picks) picks.push({ sel, px, py, r, rank }); };
    // 文字先攒着，底图与标记画完再统一排版 —— 这样避让算得出「谁已经占了哪儿」。
    const labels = [];
    const Add = (entry) => { if (entry.text) labels.push(entry); };
    // 标记占位图：16 px 一格的粗网格，画一个标记就把它盖到的格子涂上。
    // 排版时拿它当「别压在人身上」的软约束 —— 逐个标记两两比会把上百个敌人
    // 乘进内层循环，格子查表是常数次。
    this.soft = MakeGrid(view.w, view.h);
    // 本帧的图标尺寸与设备像素倍率，以及「真画出去了什么」的收集器。
    this.iconPx = this.IconPixels(view);
    this.iconPixel = Number.isFinite(view.pixel) && view.pixel > 0 ? view.pixel : 1;
    this.marks = [];

    ctx.save();
    ctx.fillStyle = Css(MAP_COLORS.backdrop);
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.font = FONT;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";

    const layout = this.model?.layout || null;
    const L = this.layers;
    const showLabels = !!L.labels;

    this.PaintTerrain(ctx, view, Project, layout);
    this.PaintGrid(ctx, view, Project);
    this.PaintWays(ctx, view, Project, layout);
    this.PaintBlocks(ctx, view, Project, layout);

    // --- 已存批注的草图（淡色打底，先画，别盖住新画的） -------------------
    if (L.notes) {
      for (const note of this.notes) {
        if (!this.Allowed("notes", note?.id)) continue;
        for (const shape of note?.sketch?.shapes || []) {
          this.PaintShape(ctx, Project, view, shape, Css(MAP_COLORS.note, 0.5), false);
        }
        const target = note?.target;
        if (target && Number.isFinite(target.x) && Number.isFinite(target.z)) {
          const p = Project(target.x, target.z);
          const icon = IconForNote();
          const size = this.iconPx * 0.9;
          if (!this.DrawIcon(ctx, p.x, p.y - size * 0.2, icon, MAP_COLORS.note, size,
            { pixel: this.iconPixel })) {
            ctx.fillStyle = Css(MAP_COLORS.note, 0.85);
            ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
          }
          this.CorePixel(ctx, p.x, p.y, MAP_COLORS.note, 1.5);
          this.Mark({ kind: "note", id: note.id, icon, x: p.x, y: p.y });
          Push({ kind: "note", id: note.id, x: target.x, z: target.z }, p.x, p.y, 8, PICK_RANK.note);
        }
      }
    }

    if (L.zones) this.PaintZones(ctx, view, Project, Push, Add, showLabels);
    if (L.routes) this.PaintRoutes(ctx, view, Project, Push, Add, showLabels);
    if (L.anchors) this.PaintAnchors(ctx, view, Project, Push, Add, showLabels);
    if (L.friendlies) this.PaintFriendlies(ctx, Project, Push);
    if (L.encounters) this.PaintEncounters(ctx, view, Project, Push, Add, showLabels);

    // --- 实机层 -----------------------------------------------------------
    if (L.live && this.live) this.PaintLive(ctx, Project, Push, Add, showLabels);

    // --- 草图（当前草稿 + 正在拖的那一个） --------------------------------
    // 选中的那一笔描亮：草图也是能点中、能按 Delete 删掉的东西，
    // 看不出「现在选的是哪一笔」的话，删之前根本不敢按。
    const pickedShape = this.selection?.kind === "sketch" ? this.selection.index : -1;
    for (let i = 0; i < this.sketch.length; i += 1) {
      this.PaintShape(ctx, Project, view, this.sketch[i], Css(MAP_COLORS.sketch), true,
        { highlight: i === pickedShape });
    }
    if (interactive) this.PaintPreview(ctx, Project, view);

    // --- 选中描亮 ----------------------------------------------------------
    if (this.selection) this.PaintHighlight(ctx, Project, this.selection);

    // --- 画布四周的图廓：比例尺、北向、坐标刻度、图例 ----------------------
    const chrome = this.PaintChrome(ctx, view, interactive);

    // --- 文字：贪心避让后一次画完 -----------------------------------------
    const placed = this.LayoutLabels(ctx, view, labels, chrome, interactive);
    this.PaintLabels(ctx, placed);
    for (const entry of placed) {
      if (entry.pick) Push(entry.pick, entry.cx, entry.cy, CHIP_HIT_R, PICK_RANK.chip);
    }
    if (interactive) {
      this.placedLabels = placed;
      this.handles = placed.filter((entry) => entry.style === "chip");
    }

    // --- 光标旁的小提示 + 悬停 tooltip（永远在最上层，不参与避让） -------
    if (interactive) this.PaintCursorHint(ctx, view);
    if (interactive && this.hover && this.pointer) this.PaintTooltip(ctx, view, this.hover);
    ctx.restore();
    // 出图（ToPng）画的是另一套视野，别让它顶掉面板正在看的那一份清单。
    if (interactive) this.drawnMarkers = this.marks;
    this.marks = null;
  }

  PaintTerrain(ctx, view, Project, layout) {
    if (!this.layers.terrain || !this.model) return;
    const ground = this.ground || this.BuildGround();
    if (!ground) return;
    const a = Project(ground.minX, ground.minZ);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(ground.canvas, a.x, a.y, ground.width * view.scale, ground.depth * view.scale);
    // 图廓线：关卡数据到此为止。没有这条线，画布边上那一大片黑看着像画崩了。
    const b = this.model?.bounds;
    if (b && Number.isFinite(b.minX)) {
      const c = Project(b.maxX, b.maxZ);
      const o = Project(b.minX, b.minZ);
      ctx.strokeStyle = Css(MAP_COLORS.legendEdge, 0.3);
      ctx.lineWidth = 1;
      ctx.strokeRect(o.x + 0.5, o.y + 0.5, c.x - o.x - 1, c.y - o.y - 1);
    }
    void layout;
  }

  /** 50 m 网格。很淡 —— 它是量距离用的，不是画面的一部分。 */
  PaintGrid(ctx, view, Project) {
    this.gridTicks = null;
    const b = this.model?.bounds;
    if (!b || !Number.isFinite(b.minX)) return;
    // 50 m 是基准格；缩放离谱时换成同一串整数里的另一档，别出 12.5 m 这种刻度。
    const STEPS = [5, 10, 25, 50, 100, 200, 500, 1000];
    let step = 50;
    for (const candidate of STEPS) {
      step = candidate;
      if (candidate * view.scale >= 58) break;
    }
    while (step * view.scale > 210 && step > 5) {
      const index = STEPS.indexOf(step);
      if (index <= 0) break;
      step = STEPS[index - 1];
    }
    const a = Project(b.minX, b.minZ);
    const c = Project(b.maxX, b.maxZ);
    const x0 = Math.max(0, a.x), x1 = Math.min(view.w, c.x);
    const y0 = Math.max(0, a.y), y1 = Math.min(view.h, c.y);
    if (x1 <= x0 || y1 <= y0) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
    ctx.clip();
    ctx.lineWidth = 1;
    const world = { minX: (x0 - view.w / 2) / view.scale + view.cx, maxX: (x1 - view.w / 2) / view.scale + view.cx,
      minZ: (y0 - view.h / 2) / view.scale + view.cz, maxZ: (y1 - view.h / 2) / view.scale + view.cz };
    const ticks = { x: [], z: [] };
    for (let x = Math.ceil(world.minX / step) * step; x <= world.maxX; x += step) {
      const p = Project(x, 0);
      ctx.strokeStyle = Css(MAP_COLORS.grid, x % (step * 4) === 0 ? 0.17 : 0.085);
      ctx.beginPath(); ctx.moveTo(p.x + 0.5, y0); ctx.lineTo(p.x + 0.5, y1); ctx.stroke();
      ticks.x.push({ v: x, px: p.x });
    }
    for (let z = Math.ceil(world.minZ / step) * step; z <= world.maxZ; z += step) {
      const p = Project(0, z);
      ctx.strokeStyle = Css(MAP_COLORS.grid, z % (step * 4) === 0 ? 0.17 : 0.085);
      ctx.beginPath(); ctx.moveTo(x0, p.y + 0.5); ctx.lineTo(x1, p.y + 0.5); ctx.stroke();
      ticks.z.push({ v: z, px: p.y });
    }
    ctx.restore();
    this.gridTicks = ticks;
    this.gridStep = step;
  }

  /** 道路 / 铁路 / 壕沟：都带边线，线宽一致，缩到整关也分得出是哪一种。 */
  PaintWays(ctx, view, Project, layout) {
    if (!layout) return;
    const L = this.layers;
    if (L.roads) {
      for (const road of layout.roads || []) {
        const pts = Points(road.points);
        if (pts.length < 2) continue;
        const w = Math.max(1.5, (road.width || 4) * view.scale);
        ctx.strokeStyle = Css(MAP_COLORS.roadEdge, 0.55);
        ctx.lineWidth = w + 2;
        Stroke(ctx, pts, Project);
        ctx.strokeStyle = Css(MAP_COLORS.road, 0.42);
        ctx.lineWidth = w;
        Stroke(ctx, pts, Project);
      }
      // 铁路：路基一条粗线 + 枕木短线，别只画一条线，缩小后分不清是路还是轨
      const rail = Points(layout.railway?.points);
      if (rail.length >= 2) {
        const w = Math.max(2, 3.4 * view.scale);
        ctx.strokeStyle = Css(MAP_COLORS.roadEdge, 0.8);
        ctx.lineWidth = w + 2;
        Stroke(ctx, rail, Project);
        ctx.strokeStyle = Css(MAP_COLORS.railway, 0.95);
        ctx.lineWidth = w;
        Stroke(ctx, rail, Project);
        ctx.strokeStyle = Css(MAP_COLORS.sleeper, 0.75);
        ctx.lineWidth = 1;
        for (let i = 1; i < rail.length; i += 1) {
          const a = rail[i - 1], b = rail[i];
          const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
          const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
          const step = Math.max(4, 22 / Math.max(view.scale, 0.05));
          for (let t = 0; t < len; t += step) {
            const q = Project(a.x + ux * t - uz * 1.7, a.z + uz * t + ux * 1.7);
            const q2 = Project(a.x + ux * t + uz * 1.7, a.z + uz * t - ux * 1.7);
            ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q2.x, q2.y); ctx.stroke();
          }
        }
      }
    }
    if (L.trenches) {
      for (const segment of layout.trenches || []) {
        const pts = Points(segment.points);
        if (pts.length < 2) continue;
        const w = Math.max(2, (segment.width || 3.6) * view.scale);
        ctx.strokeStyle = Css(MAP_COLORS.trenchEdge, 0.85);
        ctx.lineWidth = w + 2;
        Stroke(ctx, pts, Project);
        ctx.strokeStyle = Css(MAP_COLORS.trench, 0.9);
        ctx.lineWidth = w;
        Stroke(ctx, pts, Project);
      }
    }
  }

  /**
   * 体块。两千多个方块，一个个 fillRect 会把一帧吃掉一大半，所以按颜色归一批、
   * 一次 fill；顺手做视锥剔除。阴影只给够大的块 —— 小块上的阴影只会糊成脏点。
   */
  PaintBlocks(ctx, view, Project, layout) {
    if (!this.layers.blocks || !layout) return;
    const colors = layout.semanticColors || {};
    const fallback = Css(MAP_COLORS.blockFallback);
    const byColor = new Map();
    const edges = [];
    const shadows = [];
    const margin = 16;
    for (const block of layout.blocks || []) {
      if (!Number.isFinite(block.x) || !Number.isFinite(block.w)) continue;
      const a = Project(block.x - block.w / 2, block.z - block.d / 2);
      const w = Math.max(1, block.w * view.scale);
      const d = Math.max(1, block.d * view.scale);
      if (a.x > view.w + margin || a.y > view.h + margin || a.x + w < -margin || a.y + d < -margin) continue;
      // 体块比压暗后的地表亮一档：地图上「房子是实的、地是底」，靠明度分，
      // 再各自描一圈深边。压到和地表一个明度就等于没画。
      const key = HexCss(colors[block.semantic], fallback, 0.95);
      let bucket = byColor.get(key);
      if (!bucket) { bucket = []; byColor.set(key, bucket); }
      bucket.push([a.x, a.y, w, d]);
      if (w > 5 && d > 5) {
        edges.push([a.x, a.y, w, d]);
        if (w > 9 && d > 9) shadows.push([a.x, a.y, w, d]);
      }
    }
    if (shadows.length) {
      ctx.fillStyle = "rgba(0,0,0,0.34)";
      ctx.beginPath();
      for (const [x, y, w, d] of shadows) ctx.rect(x + 1.5, y + 2, w, d);
      ctx.fill();
    }
    for (const [color, rects] of byColor) {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (const [x, y, w, d] of rects) ctx.rect(x, y, w, d);
      ctx.fill();
    }
    if (edges.length) {
      ctx.strokeStyle = Css(MAP_COLORS.blockEdge, 0.55);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const [x, y, w, d] of edges) ctx.rect(x + 0.5, y + 0.5, w - 1, d - 1);
      ctx.stroke();
    }
    const bridge = layout.bridge;
    if (bridge && Number.isFinite(bridge.x) && Number.isFinite(bridge.w)) {
      const a = Project(bridge.x - bridge.w / 2, bridge.z - bridge.d / 2);
      const w = Math.max(2, bridge.w * view.scale);
      const d = Math.max(2, bridge.d * view.scale);
      ctx.fillStyle = HexCss(colors.structure, fallback, 0.86);
      ctx.fillRect(a.x, a.y, w, d);
      ctx.strokeStyle = Css(MAP_COLORS.blockEdge, 0.95);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(a.x + 0.5, a.y + 0.5, w - 1, d - 1);
    }
  }

  /** 触发圈：虚线，比标记淡一档；事实名小一号。 */
  PaintZones(ctx, view, Project, Push, Add, showLabels) {
    const zones = this.phaseLayout?.zones || this.model?.zones || [];
    const nameZoom = view.scale >= LABEL_ZOOM.zone;
    const nameFor = ZoneNames(zones, showLabels && nameZoom);
    for (const zone of zones) {
      if (!this.Allowed("zones", zone.id || zone.fact)) continue;
      const name = nameFor.get(zone) || "";
      ctx.strokeStyle = Css(MAP_COLORS.zone, 0.42);
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 5]);
      if (Number.isFinite(zone.radiusM) && Number.isFinite(zone.x)) {
        const p = Project(zone.x, zone.z);
        const r = Math.max(2, zone.radiusM * view.scale);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        // 圈心不画图标：全关四十五个触发区，每个中心再摆一枚金色同心圆，整张图
        // 就是一地金点。**虚线圈本身就是这个触发区的图标** —— 它还顺带说了多大范围，
        // 那是一枚居中的小图标给不了的。圈心只留一颗淡淡的点标出准确坐标。
        ctx.fillStyle = Css(MAP_COLORS.zone, 0.75);
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2); ctx.fill();
        this.Mark({ kind: "zone", id: zone.id || zone.fact, icon: null, x: p.x, y: p.y });
        if (name) {
          Add({
            kind: "zone", id: zone.id || zone.fact, text: name,
            ax: p.x, ay: p.y - Math.min(r, 26), color: MAP_COLORS.zone,
            priority: PRIORITY.zone, style: "tiny", keep: 6,
          });
        }
        Push({ kind: "zone", id: zone.id || zone.fact, x: zone.x, z: zone.z }, p.x, p.y, 8, PICK_RANK.zone);
      } else if (Number.isFinite(zone.minX)) {
        const a = Project(zone.minX, zone.minZ);
        const b = Project(zone.maxX, zone.maxZ);
        ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
        ctx.setLineDash([]);
        const cx = (zone.minX + zone.maxX) / 2, cz = (zone.minZ + zone.maxZ) / 2;
        const c = Project(cx, cz);
        // 方框里只有转运两处威胁留图标，便于一眼辨出压向装载区和侧巷的两块压力。
        const boxIcon = zone.kind === "threatArea" ? IconForZone(zone) : null;
        if (boxIcon) {
          this.DrawIcon(ctx, c.x, c.y, boxIcon, MAP_COLORS.zone, this.iconPx * 0.78,
            { pixel: this.iconPixel });
          this.CorePixel(ctx, c.x, c.y, MAP_COLORS.zone, 1.5);
        }
        this.Mark({ kind: "zone", id: zone.id || zone.fact, icon: boxIcon, x: c.x, y: c.y });
        Push({ kind: "zone", id: zone.id || zone.fact, x: cx, z: cz }, c.x, c.y, 8, PICK_RANK.zone);
        // 转运两处威胁的框：标签做成各自可点的把手，别只是一行描边字。
        if (zone.kind === "threatArea") {
          const threatId = String(zone.id || "").replace(/^threat_/, "");
          const info = ThreatInfo(this.model, threatId);
          const text = showLabels && info.threat
            ? `${info.title} · ${threatId} · ${ThreatWindow(info.threat)}`
            : info.title;
          Add({
            kind: "threat", id: threatId, text, ax: a.x + 3, ay: a.y, color: MAP_COLORS.zone,
            priority: PRIORITY.chip, style: "chip", keep: 4,
            pick: { kind: "threat", id: threatId, x: cx, z: cz },
          });
        } else if (name) {
          Add({
            kind: "zone", id: zone.id || zone.fact, text: name,
            ax: a.x + 3, ay: a.y - 2, color: MAP_COLORS.zone,
            priority: PRIORITY.zone, style: "tiny", keep: 4,
          });
        }
      }
      ctx.setLineDash([]);
    }
  }

  PaintRoutes(ctx, view, Project, Push, Add, showLabels) {
    if (!this.model?.routes) return;
    const names = Array.isArray(this.phaseLayout?.routes) && this.phaseLayout.routes.length
      ? this.phaseLayout.routes
      : Object.keys(this.model.routes);
    const nameZoom = view.scale >= LABEL_ZOOM.route;
    for (const name of names) {
      if (!this.Allowed("routes", name)) continue;
      const pts = Points(this.model.routes[name]);
      if (pts.length < 2) continue;
      // 不透明：半透明的线在这张图上一个精确像素都数不出来，
      // 测试就没法回答「这条路线到底画出来没有」。
      const color = Css(MAP_COLORS.route);
      DirectedPath(ctx, pts, Project, color, 1.6, 7, { arrows: "along", spacing: 150, dot: 1.7 });
      const mid = pts[Math.floor(pts.length / 2)];
      const p = Project(mid.x, mid.z);
      if (showLabels && nameZoom) {
        Add({
          kind: "route", id: name, text: name, ax: p.x, ay: p.y,
          color: MAP_COLORS.route, priority: PRIORITY.route, style: "tiny", keep: 5,
        });
      }
      Push({ kind: "route", id: name, x: mid.x, z: mid.z }, p.x, p.y, 6, PICK_RANK.route);
    }
  }

  PaintAnchors(ctx, view, Project, Push, Add, showLabels) {
    if (!this.model?.anchors) return;
    const nameZoom = view.scale >= LABEL_ZOOM.anchor;
    for (const [id, point] of Object.entries(this.model.anchors)) {
      if (!point || !Number.isFinite(point.x)) continue;
      if (!this.Allowed("anchors", id)) continue;
      const p = Project(point.x, point.z);
      // 锚点按它到底是个什么地方画：院门画门、装车/转运画车、担架撤离点画担架，
      // 剩下的才是通用小旗。
      //
      // **就一枚 12 px 的图标，居中压在那个坐标上**。先前是「图标画在上方 + 小十字
      // 标坐标」，两件东西占了一个半图标的高度，挤的地方那面小旗就骑到邻居头上去了。
      // 图标居中之后它自己就标着坐标，十字没必要再画。
      const icon = IconForAnchor(id);
      const size = 12;
      if (this.DrawIcon(ctx, p.x, p.y, icon, MAP_COLORS.anchor, size, { pixel: this.iconPixel })) {
        this.Mark({ kind: "anchor", id, icon, x: p.x, y: p.y });
      } else {
        ctx.strokeStyle = Css(MAP_COLORS.halo, 0.75);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(p.x - 4.5, p.y); ctx.lineTo(p.x + 4.5, p.y);
        ctx.moveTo(p.x, p.y - 4.5); ctx.lineTo(p.x, p.y + 4.5);
        ctx.stroke();
        ctx.strokeStyle = Css(MAP_COLORS.anchor, 0.95);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(p.x - 4.5, p.y); ctx.lineTo(p.x + 4.5, p.y);
        ctx.moveTo(p.x, p.y - 4.5); ctx.lineTo(p.x, p.y + 4.5);
        ctx.stroke();
      }
      MarkGrid(this.soft, p.x - size / 2, p.y - size / 2, size, size);
      if (showLabels && nameZoom) {
        Add({
          kind: "anchor", id, text: id, ax: p.x, ay: p.y,
          color: MAP_COLORS.anchor, priority: PRIORITY.anchor, style: "text", keep: 6,
        });
      }
      Push({ kind: "anchor", id, x: point.x, z: point.z }, p.x, p.y, 6, PICK_RANK.anchor);
    }
  }

  PaintFriendlies(ctx, Project, Push) {
    const list = this.phaseLayout?.friendlies || this.model?.friendlies || [];
    const size = this.iconPx * 0.9;
    for (const friendly of list) {
      if (!Number.isFinite(friendly.x)) continue;
      if (!this.Allowed("friendlies", friendly.id)) continue;
      const p = Project(friendly.x, friendly.z);
      const icon = IconForFriendly(friendly.kind);
      if (!this.DrawIcon(ctx, p.x, p.y, icon, MAP_COLORS.friendly, size,
        { pixel: this.iconPixel })) {
        ctx.fillStyle = Css(MAP_COLORS.halo, 0.8);
        ctx.beginPath(); ctx.arc(p.x, p.y, 4.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = Css(MAP_COLORS.friendly);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 3.6); ctx.lineTo(p.x + 3.4, p.y); ctx.lineTo(p.x, p.y + 3.6); ctx.lineTo(p.x - 3.4, p.y);
        ctx.closePath(); ctx.fill();
      }
      this.CorePixel(ctx, p.x, p.y, MAP_COLORS.friendly, 1.6);
      this.Mark({ kind: "friendly", id: friendly.id, icon, x: p.x, y: p.y });
      MarkGrid(this.soft, p.x - size / 2, p.y - size / 2, size, size);
      Push({ kind: "friendly", id: friendly.id, x: friendly.x, z: friendly.z }, p.x, p.y, 6, PICK_RANK.friendly);
    }
  }

  /**
   * 这一局里已经被打死的人（按 id 查）。
   *
   * 设计层拿它给「已击毙」的那几个换画法 —— 先前设计层完全不看实机数据，打死一个人
   * 图标照旧，实机层只在同一位置补一枚 4 px 的灰叉，还被图标盖住，等于「打了没反应」。
   * 跟着 `live` 图层走：关掉实机就是要看纯设计，那时候不该有人是灰的。
   */
  LiveDeadIds() {
    if (!this.layers.live || !this.live) return null;
    const list = this.live.enemies;
    if (!Array.isArray(list) || !list.length) return null;
    const dead = new Set();
    const known = new Set();
    for (const enemy of list) {
      if (!enemy?.id) continue;
      known.add(enemy.id);
      if (enemy.alive === false) dead.add(enemy.id);
    }
    return { dead, known };
  }

  PaintEncounters(ctx, view, Project, Push, Add, showLabels) {
    const L = this.layers;
    const size = this.iconPx;
    const gap = this.ClusterGapPx();
    const live = this.LiveDeadIds();
    for (const encounter of this.phaseLayout?.encounters || []) {
      const state = encounter.state || "spawned";
      const entries = [];
      for (const member of encounter.members || []) {
        if (!Number.isFinite(member.x)) continue;
        if (!this.AllowedMember(encounter.id, member.id)) continue;
        entries.push({ member, p: Project(member.x, member.z) });
      }
      if (!entries.length) continue;
      // 战术线照旧逐人画：合并的是「人在哪」，不是「他要往哪走」——
      // 把一组的去向也并掉，图上就看不出这撮人是散开包抄还是一路平推。
      if (L.tactics) {
        for (const entry of entries) this.PaintTactic(ctx, Project, entry.member, state);
      }
      for (const group of ClusterEntries(entries, gap)) {
        if (group.items.length === 1) {
          const { member, p } = group.items[0];
          const dead = !!live?.dead.has(member.id);
          const icon = this.PaintMember(ctx, p, member, state, encounter.id, dead);
          this.Mark({
            kind: "member", id: member.id, encounter: encounter.id,
            state: dead ? "dead" : state, icon, x: p.x, y: p.y,
          });
          MarkGrid(this.soft, p.x - size / 2, p.y - size / 2, size, size);
          Push({ kind: "member", id: member.id, encounterId: encounter.id, x: member.x, z: member.z },
            p.x, p.y, 7, PICK_RANK.member);
          continue;
        }
        // 一撮人并成一枚：组图标 + 右下角人数。点它拿到的是**整组**
        // （不是「这一撮」——点开之后要看的永远是这一组的编排）。
        // 有实机数据时人数写成「活着/总数」，全灭了整撮转灰 —— 并起来之后
        // 单个人的骷髅角标就看不见了，人数芯片得替它把话说了。
        const tally = ClusterTally(group, live);
        const icon = this.PaintCluster(ctx, group, encounter, state, tally);
        const world = ClusterWorld(group);
        this.Mark({
          kind: "cluster", id: encounter.id, encounter: encounter.id,
          state: tally.wiped ? "dead" : state,
          count: group.items.length, alive: tally.known ? tally.alive : null, icon, x: group.x, y: group.y,
        });
        const reach = size * 0.72;
        MarkGrid(this.soft, group.x - reach, group.y - reach, reach * 2, reach * 2);
        Push({ kind: "encounter", id: encounter.id, cluster: group.items.length, x: world.x, z: world.z },
          group.x, group.y, reach, PICK_RANK.member);
      }
    }
    // 已清除的组不给把手：第 12 阶段有十一个这样的组，遍布全关，
    // 它们的芯片会把还在演的那几组盖掉。骷髅角标还在，悬停照样报得出是谁。
    for (const encounter of this.phaseLayout?.encounters || []) {
      const state = encounter.state || "spawned";
      if (state === "cleared") continue;
      if (!this.Allowed("encounters", encounter.id)) continue;
      const centre = Centroid(encounter.members);
      if (!centre) continue;
      const p = Project(centre.x, centre.z);
      const text = showLabels ? `${encounter.id} · ${StateText(state)}` : encounter.id;
      Add({
        kind: "encounter", id: encounter.id, text, ax: p.x, ay: p.y, color: StateColor(state),
        priority: PRIORITY.chip, style: "chip", keep: 7,
        pick: { kind: "encounter", id: encounter.id, x: centre.x, z: centre.z },
      });
    }
    void view;
  }

  /**
   * 一个敌人。
   *
   * 图标说「他是干什么的」（机枪 / 上刺刀 / 钉在原地 / 飞机 / 步枪兵），
   * 颜色说「他现在是什么状态」，角标再说一遍状态里最要紧的那几种
   * （待命的沙漏、休眠的闭眼、已清除的骷髅）。状态不能只靠颜色分 —— 打印出来、
   * 色弱、或者缩到整关视野时颜色都不够用，所以颜色之外必须还有个形状。
   *
   * 这一局里已经被打死的（`dead`）按「已击毙」画：灰、更淡、右下角一枚骷髅角标，
   * 走的就是「已清除」那一套画法与尺寸规则 —— 打死一个人图上得当场看得出来。
   *
   * 回图标名，调用方记进 `drawnMarkers`。图还没加载好就退回原来的几何标记。
   */
  PaintMember(ctx, p, member, state, encounterId = null, dead = false) {
    const color = dead ? MAP_COLORS.liveDead : StateColor(state);
    const icon = MapIconForMember(member, state, encounterId);
    if (state === "active" && !dead) {
      ctx.strokeStyle = Css(color, 0.22);
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, this.iconPx * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    }
    const alpha = dead ? 0.55 : StateAlpha(state);
    // 够大才画细节角标；小了就退成一枚小色点（见 BADGE_DETAIL_PX 那条注释）。
    const detail = this.iconPx >= BADGE_DETAIL_PX;
    const stateBadge = dead ? StateBadge("cleared") : StateBadge(state);
    const drawn = this.DrawIcon(ctx, p.x, p.y, icon, color, this.iconPx, {
      pixel: this.iconPixel,
      alpha,
      badge: detail ? (stateBadge || TraitBadge(member)) : null,
    });
    if (drawn) this.CorePixel(ctx, p.x, p.y, color, 1.7);
    else this.PaintMemberShape(ctx, p, member, dead ? "cleared" : state);
    if (!detail) this.PaintStateDot(ctx, p.x, p.y, this.iconPx, dead ? "cleared" : state);
    return icon;
  }

  /**
   * 小尺寸下的状态记号。休眠一枚冷蓝灰点、待命一枚黄点、已清除照旧一个灰叉
   * —— 叉在任何尺寸下都认得出，是唯一不用退化的那个。
   */
  PaintStateDot(ctx, x, y, size, state) {
    const half = size / 2;
    const bx = x + half * 0.82;
    const by = y + half * 0.82;
    if (state === "cleared") {
      ctx.strokeStyle = Css(MAP_COLORS.halo, 0.9);
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(bx - 3, by - 3); ctx.lineTo(bx + 3, by + 3);
      ctx.moveTo(bx + 3, by - 3); ctx.lineTo(bx - 3, by + 3);
      ctx.stroke();
      ctx.strokeStyle = Css(MAP_COLORS.enemyCleared);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(bx - 3, by - 3); ctx.lineTo(bx + 3, by + 3);
      ctx.moveTo(bx + 3, by - 3); ctx.lineTo(bx - 3, by + 3);
      ctx.stroke();
      return;
    }
    const color = state === "dormant" ? MAP_COLORS.badgeDormant
      : (state === "standby" ? MAP_COLORS.badgeStandby : null);
    if (!color) return;
    ctx.globalAlpha = 1;
    ctx.fillStyle = Css(MAP_COLORS.halo, 0.9);
    ctx.beginPath(); ctx.arc(bx, by, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = Css(color);
    ctx.beginPath(); ctx.arc(bx, by, 2.2, 0, Math.PI * 2); ctx.fill();
  }

  /**
   * 一撮挤在一起的人合成的簇标记：组里最常见的那张图标 + 右下角一枚人数芯片。
   * 放大到彼此分得开时这枚就自己散成一个个人，不需要任何开关。
   */
  PaintCluster(ctx, group, encounter, state, tally = null) {
    const color = tally?.wiped ? MAP_COLORS.liveDead : StateColor(state);
    const icon = DominantIcon(group.items, state, encounter.id);
    const size = this.iconPx * 1.2;
    if (state === "active" && !tally?.wiped) {
      ctx.strokeStyle = Css(color, 0.22);
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.arc(group.x, group.y, size * 0.62, 0, Math.PI * 2);
      ctx.stroke();
    }
    const drawn = this.DrawIcon(ctx, group.x, group.y, icon, color, size, {
      pixel: this.iconPixel, alpha: tally?.wiped ? 0.55 : StateAlpha(state),
    });
    if (!drawn) {
      // 图还没到：退回一枚实心点，人数芯片照画 —— 不许出现「一撮人不见了」。
      ctx.fillStyle = Css(MAP_COLORS.halo, 0.8);
      ctx.beginPath(); ctx.arc(group.x, group.y, size * 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = Css(color);
      ctx.beginPath(); ctx.arc(group.x, group.y, size * 0.32, 0, Math.PI * 2); ctx.fill();
    }
    this.CorePixel(ctx, group.x, group.y, color, 1.7);
    // 人数芯片：深底 + 状态色描边与数字。压在图标右下角，跟单人的角标同一个位置。
    // 有实机数据就写「活着/总数」——「这一撮还剩几个」是打起来时最想知道的那个数。
    const text = tally?.known ? `${tally.alive}/${group.items.length}` : String(group.items.length);
    ctx.font = FONT_TINY;
    const w = Math.ceil(ctx.measureText(text).width) + 7;
    const h = 12;
    const bx = group.x + size * 0.34;
    const by = group.y + size * 0.26;
    RoundRect(ctx, bx, by, w, h, 3);
    ctx.fillStyle = Css(MAP_COLORS.handle);
    ctx.fill();
    ctx.strokeStyle = Css(color, 0.95);
    ctx.lineWidth = 1;
    RoundRect(ctx, bx + 0.5, by + 0.5, w - 1, h - 1, 3);
    ctx.stroke();
    ctx.fillStyle = Css(color);
    ctx.textBaseline = "middle";
    ctx.fillText(text, bx + 3.5, by + h / 2);
    ctx.font = FONT;
    return icon;
  }

  /** 图标到齐之前的兜底几何标记（也是「万一某张 PNG 丢了」的兜底）。 */
  PaintMemberShape(ctx, p, member, state) {
    const color = StateColor(state);
    const filled = state !== "pending" && state !== "cleared";
    const Shape = (r) => {
      ctx.beginPath();
      if (member.weapon === "Type11" || member.weapon === "MachineGun") {
        ctx.moveTo(p.x, p.y - r - 1.2); ctx.lineTo(p.x + r + 0.8, p.y + r * 0.75);
        ctx.lineTo(p.x - r - 0.8, p.y + r * 0.75); ctx.closePath();
      } else if (member.hold) {
        ctx.rect(p.x - r, p.y - r, r * 2, r * 2);
      } else {
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      }
    };
    if (state === "cleared") {
      ctx.strokeStyle = Css(MAP_COLORS.halo, 0.6);
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(p.x - 3.4, p.y - 3.4); ctx.lineTo(p.x + 3.4, p.y + 3.4);
      ctx.moveTo(p.x + 3.4, p.y - 3.4); ctx.lineTo(p.x - 3.4, p.y + 3.4);
      ctx.stroke();
      ctx.strokeStyle = Css(color, 0.9);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(p.x - 3.4, p.y - 3.4); ctx.lineTo(p.x + 3.4, p.y + 3.4);
      ctx.moveTo(p.x + 3.4, p.y - 3.4); ctx.lineTo(p.x - 3.4, p.y + 3.4);
      ctx.stroke();
      return;
    }
    if (state === "active") {
      ctx.strokeStyle = Css(color, 0.22);
      ctx.lineWidth = 3.2;
      Shape(7);
      ctx.stroke();
    }
    ctx.strokeStyle = Css(MAP_COLORS.halo, 0.85);   // 深色描边：浅地表上也咬得住轮廓
    ctx.lineWidth = 3;
    Shape(4.2);
    ctx.stroke();
    ctx.globalAlpha = state === "dormant" ? 0.5 : 1;
    if (state === "pending") ctx.setLineDash([3, 2.5]);
    if (filled) { ctx.fillStyle = Css(color); Shape(4.2); ctx.fill(); }
    ctx.strokeStyle = Css(color);
    ctx.lineWidth = 1.5;
    Shape(4.2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    if (!filled || state === "dormant") {
      // 空心圈（pending）和半透明的休眠体，中间都再点一颗**不透明**的芯。
      // 看着是「位置已知、人还没到／还没醒」；同时给测试一块精确颜色去数 ——
      // 1.5 px 的描边和 0.5 的半透明在画布上全是混出来的中间色，一个精确像素
      // 都数不出来，而「画上了却一个像素都验不到」正是这个仓库栽过的跟头。
      ctx.fillStyle = Css(color);
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.7, 0, Math.PI * 2); ctx.fill();
    }
  }

  /** 战术路线：细线 + 末端箭头。跃进线用虚线，和「走过去」分得开。 */
  PaintTactic(ctx, Project, member, state) {
    const tactic = member.tactic;
    // 还没出现的组的路线压淡；在场的那条一律不透明 —— 同上，半透明数不出像素。
    const dim = state === "pending" ? 0.4 : 1;
    if (tactic && Array.isArray(tactic.points) && tactic.points.length) {
      const pts = [{ x: member.x, z: member.z }, ...Points(tactic.points)];
      DirectedPath(ctx, pts, Project, Css(MAP_COLORS.tactic, dim), 1.2, 6, { arrows: "end", dot: 0 });
      if (tactic.near && Number.isFinite(tactic.near.x)) {
        const p = Project(tactic.near.x, tactic.near.z);
        ctx.strokeStyle = Css(MAP_COLORS.tactic, dim);
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (Array.isArray(member.assaultLane) && member.assaultLane.length >= 2) {
      DirectedPath(ctx, Points(member.assaultLane), Project, Css(MAP_COLORS.assault, dim * 0.85), 1, 5,
        { arrows: "end", dash: [4, 3], dot: 0 });
    }
  }

  PaintLive(ctx, Project, Push, Add = null, showLabels = false) {
    const live = this.live;
    const guide = Array.isArray(live.guideRoute)
      ? Points(live.guideRoute)
      : Points(this.model?.routes?.[live.guideRoute]);
    if (guide.length >= 2) {
      // 当前指引路线是「现在该往哪走」，要比设计路线抢眼一档：先铺一层宽光晕。
      ctx.strokeStyle = Css(MAP_COLORS.guide, 0.2);
      ctx.lineWidth = 8;
      Stroke(ctx, guide, Project);
      DirectedPath(ctx, guide, Project, Css(MAP_COLORS.guide), 2.4, 8, { arrows: "along", spacing: 90, dot: 2 });
    }

    const design = new Map();
    for (const encounter of this.phaseLayout?.encounters || []) {
      for (const member of encounter.members || []) design.set(member.id, member);
    }
    for (const enemy of live.enemies || []) {
      if (!Number.isFinite(enemy.x)) continue;
      if (!this.AllowedMember(enemy.encounter, enemy.id)) continue;
      const p = Project(enemy.x, enemy.z);
      const source = design.get(enemy.id);
      if (source && Number.isFinite(source.x)) {
        const q = Project(source.x, source.z);
        ctx.strokeStyle = Css(enemy.alive === false ? MAP_COLORS.liveDead : MAP_COLORS.liveEnemy, 0.3);
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        ctx.setLineDash([]);
      }
      if (enemy.alive === false) {
        ctx.strokeStyle = Css(MAP_COLORS.liveDead, 0.9);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(p.x - 4, p.y - 4); ctx.lineTo(p.x + 4, p.y + 4);
        ctx.moveTo(p.x + 4, p.y - 4); ctx.lineTo(p.x - 4, p.y + 4);
        ctx.stroke();
      } else {
        ctx.strokeStyle = Css(MAP_COLORS.halo, 0.8);
        ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.arc(p.x, p.y, 3.6, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = enemy.dormant ? 0.5 : 1;
        ctx.fillStyle = Css(MAP_COLORS.liveEnemy);
        ctx.beginPath(); ctx.arc(p.x, p.y, 3.6, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      this.Mark({ kind: "live", id: enemy.id, encounter: enemy.encounter,
        state: enemy.alive === false ? "dead" : (enemy.dormant ? "dormant" : "alive"), icon: null, x: p.x, y: p.y });
      Push({ kind: "member", id: enemy.id, encounterId: enemy.encounter, x: enemy.x, z: enemy.z },
        p.x, p.y, 6, PICK_RANK.live);
    }

    // --- 跟着玩家走的那个班：这一局里真人真位置，名字写在旁边 ---------------
    // 友军色 + 我方士兵图标，朝向跟玩家箭头同一套规则（世界 yaw 0 看向 -Z = 屏幕上方）。
    for (const mate of live.squad || []) {
      if (!mate || !Number.isFinite(mate.x) || !Number.isFinite(mate.z)) continue;
      if (!this.SquadAllowed(mate.id)) continue;
      const p = Project(mate.x, mate.z);
      const dead = mate.alive === false;
      const size = this.iconPx * 0.95;
      let icon = null;
      if (dead) {
        // 阵亡的一律画灰叉，跟实时敌人那一套同形 —— 叉在任何尺寸下都认得出。
        ctx.strokeStyle = Css(MAP_COLORS.halo, 0.85);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(p.x - 4.5, p.y - 4.5); ctx.lineTo(p.x + 4.5, p.y + 4.5);
        ctx.moveTo(p.x + 4.5, p.y - 4.5); ctx.lineTo(p.x - 4.5, p.y + 4.5);
        ctx.stroke();
        ctx.strokeStyle = Css(MAP_COLORS.liveDead);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(p.x - 4.5, p.y - 4.5); ctx.lineTo(p.x + 4.5, p.y + 4.5);
        ctx.moveTo(p.x + 4.5, p.y - 4.5); ctx.lineTo(p.x - 4.5, p.y + 4.5);
        ctx.stroke();
        this.CorePixel(ctx, p.x, p.y, MAP_COLORS.liveDead, 1.6);
      } else {
        icon = "FriendlySquad";
        const yaw = Number.isFinite(mate.yaw) ? mate.yaw : null;
        const drawn = this.DrawIcon(ctx, p.x, p.y, icon, MAP_COLORS.friendly, size,
          { pixel: this.iconPixel, rotate: yaw === null ? 0 : -yaw });
        if (!drawn) {
          icon = null;
          ctx.fillStyle = Css(MAP_COLORS.halo, 0.8);
          ctx.beginPath(); ctx.arc(p.x, p.y, 4.6, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = Css(MAP_COLORS.friendly);
          ctx.beginPath(); ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2); ctx.fill();
        }
        this.CorePixel(ctx, p.x, p.y, MAP_COLORS.friendly, 1.7);
      }
      this.Mark({ kind: "liveFriendly", id: mate.id, state: dead ? "dead" : "alive", icon, x: p.x, y: p.y });
      MarkGrid(this.soft, p.x - size / 2, p.y - size / 2, size, size);
      if (Add && showLabels && mate.label) {
        Add({
          kind: "friendly", id: mate.id, text: mate.label, ax: p.x, ay: p.y,
          color: dead ? MAP_COLORS.liveDead : MAP_COLORS.friendly,
          priority: PRIORITY.anchor, style: "text", keep: 7,
        });
      }
      // 实时位赢设计位：这个班正站在哪儿，比他的出生点更值得点中。
      Push({ kind: "friendly", id: mate.id, live: true, x: mate.x, z: mate.z },
        p.x, p.y, 7, PICK_RANK.live);
    }

    const player = live.player;
    if (player && Number.isFinite(player.x)) {
      const p = Project(player.x, player.z);
      const yaw = Number.isFinite(player.yaw) ? player.yaw : 0;
      ctx.fillStyle = Css(MAP_COLORS.player, 0.16);
      ctx.beginPath(); ctx.arc(p.x, p.y, 13, 0, Math.PI * 2); ctx.fill();
      // 世界 yaw 0 看向 -Z（北）。屏幕上 -Z 是上，所以直接用同一个角度转就行。
      const size = Math.max(16, this.iconPx * 1.15);
      const drawn = this.DrawIcon(ctx, p.x, p.y, "Player", MAP_COLORS.player, size,
        { pixel: this.iconPixel, rotate: -yaw });
      if (!drawn) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(-yaw);
        ctx.strokeStyle = Css(MAP_COLORS.halo, 0.9);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3.5); ctx.lineTo(-6, 7);
        ctx.closePath(); ctx.stroke();
        ctx.fillStyle = Css(MAP_COLORS.player);
        ctx.fill();
        ctx.restore();
      }
      this.CorePixel(ctx, p.x, p.y, MAP_COLORS.player, 1.8);
      this.Mark({ kind: "player", id: "player", icon: "Player", x: p.x, y: p.y });
      Push({ kind: "point", id: "player", x: player.x, z: player.z }, p.x, p.y, 8, PICK_RANK.player);
    }
  }

  /**
   * 画一笔草图。`highlight` = 这一笔正被选中：先照原样描一圈旧金的粗边，再把本体
   * 加粗一档画上去。草图本身是紫的，压在暗地表上光靠加粗看不出选没选中 ——
   * 而「现在选的是哪一笔」不明确的话，用户是不敢按 Delete 的。
   */
  PaintShape(ctx, Project, view, shape, color, solid, { highlight = false, width = 0 } = {}) {
    if (!shape) return;
    if (highlight) {
      // 描边不透明、而且要比本体宽出一圈半以上：半透明的金边一个精确像素都数不出来，
      // 只宽出一点的话本体一盖，剩下的全是抗锯齿混色 ——「选中了却验不到」
      // 正是这个仓库栽过的跟头。
      this.PaintShape(ctx, Project, view, shape, Css(MAP_COLORS.select), solid,
        { width: (solid ? 1.8 : 1.2) + 5 });
    }
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width > 0 ? width : (solid ? 1.8 : 1.2) + (highlight ? 1 : 0);
    if (!solid) ctx.setLineDash([4, 3]);
    if (shape.type === "circle" && Number.isFinite(shape.x)) {
      const p = Project(shape.x, shape.z);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2, (shape.r || 1) * view.scale), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2); ctx.fill();   // 圈心：实心，好拖也好数
    } else if (shape.type === "arrow" && shape.from && shape.to) {
      DirectedPath(ctx, [shape.from, shape.to], Project, color, ctx.lineWidth, 9, { arrows: "end", dot: 2.2 });
    } else if (shape.type === "path" && Array.isArray(shape.points)) {
      const pts = Points(shape.points);
      if (pts.length >= 2) Stroke(ctx, pts, Project);
      for (const point of pts) {
        const p = Project(point.x, point.z);
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2); ctx.fill();
      }
    } else if (shape.type === "label" && Number.isFinite(shape.x)) {
      const p = Project(shape.x, shape.z);
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
      PlainLabel(ctx, p.x + 6, p.y, shape.text || "（待填）", color);
    } else if (shape.type === "ghost" && Number.isFinite(shape.x)) {
      const p = Project(shape.x, shape.z);
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.stroke();
      PlainLabel(ctx, p.x + 8, p.y, shape.memberId || "候选位", color);
    }
    ctx.setLineDash([]);
  }

  PaintPreview(ctx, Project, view) {
    const drag = this.drag;
    const color = Css(MAP_COLORS.sketch);
    if (this.pathPoints.length) {
      const pts = this.pathPoints.slice();
      if (this.pointer) pts.push(this.ScreenToWorld(this.pointer.x, this.pointer.y));
      if (pts.length >= 2) { ctx.strokeStyle = color; ctx.lineWidth = 1.8; Stroke(ctx, pts, Project); }
      for (const point of this.pathPoints) {
        const p = Project(point.x, point.z);
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (!drag || !drag.world) return;
    const now = drag.current || drag.world;
    if (drag.kind === "circle") {
      const r = Math.hypot(now.x - drag.world.x, now.z - drag.world.z);
      this.PaintShape(ctx, Project, view, { type: "circle", x: drag.world.x, z: drag.world.z, r }, color, true);
    } else if (drag.kind === "arrow") {
      this.PaintShape(ctx, Project, view, { type: "arrow", from: drag.world, to: now }, color, true);
    } else if (drag.kind === "move" && drag.target) {
      const a = Project(drag.world.x, drag.world.z);
      const b = Project(now.x, now.z);
      ctx.strokeStyle = Css(MAP_COLORS.select);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /**
   * 光标旁那句小提示。**用画布画，不用 DOM**：这一层是纯 canvas，往宿主的弹窗里
   * 插节点等于把地图的内部状态漏到外面，弹窗一重排提示就飘到别处去了。
   *
   * 只在「有个模式正开着」的时候出现 —— 折线画到一半、@ 提及武装着。这两种状态
   * 光看画面都认不出来，用户只会觉得「点了没反应」或者「怎么停不下来」。
   */
  PaintCursorHint(ctx, view) {
    this.cursorHint = null;
    if (!this.pointer) return;
    let text = "";
    let accent = MAP_COLORS.sketch;
    if (this.mentionArmed) { text = "点一个对象 = @ 它"; accent = MAP_COLORS.select; }
    else if (this.tool === "path" && this.pathPoints.length) text = "回车 / 双击结束 · Esc 取消";
    if (!text) return;
    ctx.font = FONT_SMALL;
    const w = Math.ceil(ctx.measureText(text).width) + 14;
    const h = 18;
    let x = this.pointer.x + 15;
    let y = this.pointer.y - h - 9;
    if (x + w > view.w - 3) x = Math.max(3, view.w - w - 3);
    if (y < 3) y = Math.min(view.h - h - 3, this.pointer.y + 19);
    RoundRect(ctx, x, y, w, h, 3);
    ctx.fillStyle = Css(MAP_COLORS.labelBack);    // 不透明：半透明的提示压在地表上读不出字
    ctx.fill();
    ctx.strokeStyle = Css(accent, 0.85);
    ctx.lineWidth = 1;
    RoundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 3);
    ctx.stroke();
    ctx.fillStyle = Css(MAP_COLORS.textLight);
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + 7, y + h / 2);
    ctx.font = FONT;
    this.cursorHint = { x, y, w, h, text };
  }

  PaintHighlight(ctx, Project, sel) {
    // 组既可以从流程栏/详情栏选，也可以点地图上的组把手。选中以后得看得见是
    // 「哪一撮人」——所以整组成员逐个描亮，而不是挑第一个人画个圈了事。
    // 拍与组同名（transferFlank 既是一拍也是一组），描亮同一撮人。
    const Ring = (p, r) => {
      ctx.strokeStyle = Css(MAP_COLORS.select, 0.28);
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = Css(MAP_COLORS.select);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
    };
    if (sel?.kind === "encounter" || sel?.kind === "threat") {
      const encounter = (this.phaseLayout?.encounters || []).find((entry) => entry.id === sel.id);
      if (encounter) {
        for (const member of encounter.members || []) {
          if (!Number.isFinite(member.x)) continue;
          Ring(Project(member.x, member.z), 9);
        }
        return;
      }
    }
    const point = this.SelPoint(sel);
    if (!point) return;
    Ring(Project(point.x, point.z), 9);
  }

  /**
   * 画布四周的图廓：50 m 刻度、比例尺、北向箭头、图例。
   * 返回它们占掉的矩形 —— 标签避让得知道这些地方不许放字。
   */
  PaintChrome(ctx, view, interactive) {
    const taken = [];
    const hitBefore = this.legendHit;
    this.legendHit = null;
    const ticks = this.gridTicks;
    if (ticks && this.model?.bounds) {
      ctx.font = FONT_TINY;
      ctx.fillStyle = Css(MAP_COLORS.scaleBar, 0.55);
      ctx.strokeStyle = Css(MAP_COLORS.scaleBar, 0.35);
      ctx.lineWidth = 1;
      ctx.textAlign = "center";
      for (const tick of ticks.x) {
        if (tick.px < 26 || tick.px > view.w - 26) continue;
        ctx.beginPath(); ctx.moveTo(tick.px + 0.5, 0); ctx.lineTo(tick.px + 0.5, 4); ctx.stroke();
        ctx.fillText(String(tick.v), tick.px, 10);
      }
      ctx.textAlign = "left";
      for (const tick of ticks.z) {
        if (tick.px < 22 || tick.px > view.h - 14) continue;
        // 刻度线短一截、字往右让 —— 贴在一起时那道线会被读成负号。
        ctx.beginPath(); ctx.moveTo(0, tick.px + 0.5); ctx.lineTo(3, tick.px + 0.5); ctx.stroke();
        ctx.fillText(String(tick.v), 7, tick.px + 0.5);
      }
      ctx.font = FONT;
      taken.push({ x: 0, y: 0, w: view.w, h: 16 });
      taken.push({ x: 0, y: 0, w: 30, h: view.h });
    }
    this.PaintNorth(ctx, view, taken);
    this.PaintScaleBar(ctx, view, taken);
    if (this.layers.legend) this.PaintLegend(ctx, view, taken);
    // 出图（ToPng）用的是另一套坐标，别拿它去改「点哪儿能开合图例」。
    if (!interactive) this.legendHit = hitBefore;
    return taken;
  }

  PaintNorth(ctx, view, taken) {
    const x = view.w - 26;
    const y = 26;
    ctx.strokeStyle = Css(MAP_COLORS.scaleBar, 0.75);
    ctx.fillStyle = Css(MAP_COLORS.scaleBar, 0.75);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y - 12); ctx.lineTo(x + 5, y + 5); ctx.lineTo(x, y + 1); ctx.lineTo(x - 5, y + 5);
    ctx.closePath();
    ctx.fill();
    ctx.font = FONT_SMALL;
    ctx.textAlign = "center";
    ctx.fillText("北", x, y + 15);
    ctx.textAlign = "left";
    ctx.font = FONT;
    taken.push({ x: x - 14, y: y - 16, w: 28, h: 38 });
  }

  /** 比例尺：取一个整数米长度，画成黑白两段的尺子。旁边写清楚 X 东 / Z 南。 */
  PaintScaleBar(ctx, view, taken) {
    const scale = view.scale;
    const target = Math.min(170, Math.max(60, view.w * 0.16));
    const nice = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
    let meters = nice[nice.length - 1];
    for (const candidate of nice) {
      if (candidate * scale >= target * 0.62) { meters = candidate; break; }
    }
    const width = meters * scale;
    const x = view.w - width - 18;
    const y = view.h - 22;
    ctx.fillStyle = Css(MAP_COLORS.labelBack);
    ctx.fillRect(x - 8, y - 13, width + 16, 30);
    ctx.strokeStyle = Css(MAP_COLORS.legendEdge, 0.4);
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 7.5, y - 12.5, width + 15, 29);
    ctx.fillStyle = Css(MAP_COLORS.scaleBar);
    ctx.fillRect(x, y, width / 2, 4);
    ctx.strokeStyle = Css(MAP_COLORS.scaleBar);
    ctx.strokeRect(x + width / 2 + 0.5, y + 0.5, width / 2 - 1, 3);
    ctx.font = FONT_TINY;
    ctx.fillStyle = Css(MAP_COLORS.textLight, 0.9);
    ctx.textAlign = "left";
    ctx.fillText("0", x, y - 6);
    ctx.textAlign = "right";
    ctx.fillText(`${meters} m`, x + width, y - 6);
    ctx.textAlign = "left";
    ctx.fillStyle = Css(MAP_COLORS.textMuted, 0.9);
    ctx.fillText("X 东 →   Z 南 ↓", x, y + 11);
    ctx.font = FONT;
    this.scaleBar = { meters, text: `${meters} m`, x, y, w: width };
    taken.push({ x: x - 10, y: y - 15, w: width + 20, h: 34 });
  }

  /**
   * 图例。用普通中文写状态，不写内部术语 —— 这张图是给人看的，
   * 「pending」「standby」只有写它的人看得懂。
   */
  PaintLegend(ctx, view, taken) {
    const rows = LEGEND_ROWS;
    const rowH = 15;
    const x = 38;
    // 画布太小就只给芯片，摊开的图例会把地图本身挤没
    const open = this.legendOpen && view.w >= 500 && view.h >= rows.length * rowH + 86;
    const w = open ? 172 : 52;
    const headH = 20;
    const h = open ? rows.length * rowH + 26 : headH;
    const y = view.h - h - 16;
    ctx.fillStyle = Css(MAP_COLORS.legendBack);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = Css(MAP_COLORS.legendEdge, 0.45);
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = Css(MAP_COLORS.zone);
    ctx.fillRect(x, y, w, 1.5);
    // 收起 / 展开的小三角。用画的不用字符 —— 打包字体的子集里没有这些符号，
    // 交给系统字体回退等于把它交给运气。
    const tx = x + 9;
    const ty = y + (open ? 9 : headH / 2);
    ctx.fillStyle = Css(MAP_COLORS.zone);
    ctx.beginPath();
    if (open) { ctx.moveTo(tx - 3.5, ty - 2); ctx.lineTo(tx + 3.5, ty - 2); ctx.lineTo(tx, ty + 3); }
    else { ctx.moveTo(tx - 2, ty - 3.5); ctx.lineTo(tx + 3, ty); ctx.lineTo(tx - 2, ty + 3.5); }
    ctx.closePath();
    ctx.fill();
    ctx.font = FONT_SMALL;
    ctx.fillStyle = Css(MAP_COLORS.textLight);
    ctx.fillText("图例", x + 17, ty + (open ? 1 : 0));
    if (open) {
      ctx.font = FONT_TINY;
      for (let i = 0; i < rows.length; i += 1) {
        const cy = y + 26 + i * rowH + rowH / 2 - 2;
        this.PaintLegendSwatch(ctx, rows[i], x + 16, cy);
        ctx.fillStyle = Css(MAP_COLORS.textMuted);
        ctx.fillText(rows[i].text, x + 30, cy);
      }
    }
    ctx.font = FONT;
    // 点标题栏（收起时就是整枚芯片）开合
    this.legendHit = { x, y, w, h: Math.min(h, headH) };
    taken.push({ x: x - 4, y: y - 4, w: w + 8, h: h + 8 });
  }

  /**
   * 图例的一行示意图。图标行直接画地图上那一张图（同一份染色缓存），
   * 图例与图面永远对得上；只剩线条类（战术线 / 实时敌人 / 指引线）还是手画的。
   */
  PaintLegendSwatch(ctx, row, x, y) {
    if (row.icon) {
      const color = MAP_COLORS[row.color] || MAP_COLORS.textMuted;
      const drawn = this.DrawIcon(ctx, x, y, row.icon, color, 13, {
        pixel: this.iconPixel, alpha: row.alpha ?? 1, badge: row.badge || null,
      });
      // 图还没到（或某张 PNG 丢了）：给一枚同色实心点顶着，图例不许出现空行。
      if (!drawn) {
        ctx.fillStyle = Css(color);
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      } else {
        // 图例这一栏的芯点比图上的大一圈：13 px 的小图加了描边之后，
        // 剩给「精确颜色」的地方只有两三个像素，测试一抖就红。
        this.CorePixel(ctx, x, y, color, 2.2);
      }
      return;
    }
    const kind = row.swatch;
    const Line = (color, dash = null, width = 1.6) => {
      ctx.strokeStyle = Css(color);
      ctx.lineWidth = width;
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = Css(color);
      ctx.beginPath(); ctx.arc(x + 6, y, 2, 0, Math.PI * 2); ctx.fill();
    };
    switch (kind) {
      case "tactic":
        ctx.strokeStyle = Css(MAP_COLORS.tactic);
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x - 7, y - 2.5); ctx.lineTo(x + 5, y - 2.5); ctx.stroke();
        Arrow(ctx, x + 7, y - 2.5, 1, 0, 5, Css(MAP_COLORS.tactic));
        ctx.strokeStyle = Css(MAP_COLORS.assault);
        ctx.setLineDash([3, 2]);
        ctx.beginPath(); ctx.moveTo(x - 7, y + 3); ctx.lineTo(x + 5, y + 3); ctx.stroke();
        ctx.setLineDash([]);
        Arrow(ctx, x + 7, y + 3, 1, 0, 5, Css(MAP_COLORS.assault));
        break;
      case "live":
        ctx.fillStyle = Css(MAP_COLORS.liveEnemy);
        ctx.beginPath(); ctx.arc(x - 4, y, 3.4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = Css(MAP_COLORS.liveDead);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x + 2, y - 3.4); ctx.lineTo(x + 8.8, y + 3.4);
        ctx.moveTo(x + 8.8, y - 3.4); ctx.lineTo(x + 2, y + 3.4);
        ctx.stroke();
        break;
      case "guide": Line(MAP_COLORS.guide, null, 2); break;
      default: break;
    }
  }

  // -------------------------------------------------------------------------
  // 文字排版（贪心避让）
  // -------------------------------------------------------------------------
  /**
   * 排版一次能排的就排，排不下的就不画。缓存键里带视野、阶段、图层与选中 ——
   * 跟随实时每 0.25 s 刷一次时这些都没变，就不必再排一遍。
   */
  LayoutLabels(ctx, view, candidates, chrome, interactive) {
    const key = interactive
      ? `${view.w}x${view.h}|${view.scale.toFixed(4)}|${view.cx.toFixed(2)}|${view.cz.toFixed(2)}`
        + `|${this.phaseNumber}|${candidates.length}|${this.selection?.kind || ""}:${this.selection?.id || ""}`
        + `|${this.layers.labels ? 1 : 0}${this.layers.legend ? 1 : 0}${this.legendOpen ? 1 : 0}`
        // 实时小队的名字是唯一会**自己走**的标签：人数没变、视野没变，位置却每 0.25 s
        // 换一次。不把位置算进缓存键的话，名字会钉在原地，人走了字还留着。
        + `|${SquadKey(this.live?.squad)}`
      : null;
    if (key && this.labelCache && this.labelCache.key === key) return this.labelCache.placed;
    const placed = this.PlaceLabels(ctx, view, candidates, chrome);
    if (key) this.labelCache = { key, placed };
    return placed;
  }

  PlaceLabels(ctx, view, candidates, chrome) {
    const placed = [];
    if (!candidates.length) return placed;
    const sel = this.selection;
    // 选中的那一个永远排第一：用户点它就是要看它。
    for (const candidate of candidates) {
      if (sel && candidate.kind === sel.kind && candidate.id === sel.id) candidate.priority = PRIORITY.select;
    }
    const markers = candidates.map((c) => ({ x: c.ax - c.keep, y: c.ay - c.keep, w: c.keep * 2, h: c.keep * 2 }));
    const order = candidates.map((c, i) => ({ c, i }));
    order.sort((a, b) => (a.c.priority - b.c.priority) || (a.i - b.i));
    const pad = 3;
    // 同名只写一次：锚点 bundle、路线 bundle、爬行框 bundleCrawlFirst 说的是同一处地方，
    // 三行一模一样的字并排着只会让人以为看花了眼。优先级高的那个留下来。
    const seen = new Set();
    for (const { c, i } of order) {
      // 把手（组芯片 / 威胁芯片）是**可点的控件**，不是装饰：标签预算用光了、
      // 或者恰好跟别人重名，都不许把它整枚扔掉 —— 宿主与测试都按 HandlePoint 去点它，
      // 扔掉之后那一下点击会落到底下的组上，看起来像「点威胁选中的却是那一组」。
      const handle = c.style === "chip" && !!c.pick;
      if (placed.length >= MAX_LABELS && !handle) continue;
      if (seen.has(c.text) && !handle) continue;
      const font = c.style === "tiny" ? FONT_TINY : FONT_SMALL;
      ctx.font = font;
      const textW = Math.ceil(ctx.measureText(c.text).width);
      const w = textW + (c.style === "chip" ? CHIP_PAD * 2 : LABEL_PAD_X * 2);
      const h = c.style === "chip" ? CHIP_H : LABEL_H;
      let hit = null;
      const offsets = LabelOffsets(w, c.style);
      for (let k = 0; k < offsets.length; k += 1) {
        const [dx, dy] = offsets[k];
        const rect = { x: c.ax + dx, y: c.ay + dy - h / 2, w, h };
        if (rect.x < 2 || rect.y < 2 || rect.x + w > view.w - 2 || rect.y + h > view.h - 2) continue;
        if (HitsAny(rect, chrome, pad)) continue;
        if (HitsAny(rect, placed, pad)) continue;
        if (HitsMarkers(rect, markers, i)) continue;
        // 前几个位置还要求「别压在任何一个标记上」；都占满了才允许压。
        // 组把手只坚持两下就放弃这条 —— 它自己那一撮人就在脚下，太较真会挪到天边。
        if (k < (c.style === "chip" ? 2 : 6) && HitsGrid(this.soft, rect)) continue;
        hit = { dx, dy, rect, far: k >= 4 };
        break;
      }
      // 四十二个候选位全被占了：把手挤着放（夹回画布里、拉一条引线），别消失。
      if (!hit && handle) {
        const [dx, dy] = offsets.at(-1);
        const rect = {
          x: Clamp(c.ax + dx, 2, Math.max(2, view.w - w - 2)),
          y: Clamp(c.ay + dy - h / 2, 2, Math.max(2, view.h - h - 2)), w, h,
        };
        hit = { dx, dy, rect, far: true };
      }
      if (!hit) continue;
      seen.add(c.text);
      placed.push({
        kind: c.kind, id: c.id, text: c.text, style: c.style, color: c.color, font,
        x: hit.rect.x, y: hit.rect.y, w, h, cx: hit.rect.x + w / 2, cy: hit.rect.y + h / 2,
        ax: c.ax, ay: c.ay, leader: hit.far, pick: c.pick || null, priority: c.priority,
      });
    }
    return placed;
  }

  PaintLabels(ctx, placed) {
    const sel = this.selection;
    for (const entry of placed) {
      const picked = !!sel && sel.kind === entry.kind && sel.id === entry.id;
      if (entry.leader) {
        // 挪开了的名字画一条细引线回它标注的那个点，否则读者不知道这行字说的是谁。
        ctx.strokeStyle = Css(entry.color, 0.5);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(entry.ax, entry.ay);
        ctx.lineTo(Clamp(entry.ax, entry.x, entry.x + entry.w), Clamp(entry.ay, entry.y, entry.y + entry.h));
        ctx.stroke();
      }
      if (entry.style === "chip") {
        RoundRect(ctx, entry.x, entry.y, entry.w, entry.h, 3);
        ctx.fillStyle = Css(MAP_COLORS.handle);
        ctx.fill();
        ctx.strokeStyle = Css(picked ? MAP_COLORS.select : entry.color, picked ? 1 : 0.75);
        ctx.lineWidth = picked ? 2 : 1;
        RoundRect(ctx, entry.x + 0.5, entry.y + 0.5, entry.w - 1, entry.h - 1, 3);
        ctx.stroke();
      } else {
        RoundRect(ctx, entry.x, entry.y, entry.w, entry.h, 2);
        ctx.fillStyle = Css(MAP_COLORS.labelBack);
        ctx.fill();
        if (picked) {
          ctx.strokeStyle = Css(MAP_COLORS.select);
          ctx.lineWidth = 1;
          RoundRect(ctx, entry.x + 0.5, entry.y + 0.5, entry.w - 1, entry.h - 1, 2);
          ctx.stroke();
        }
      }
      ctx.font = entry.font;
      ctx.fillStyle = Css(picked ? MAP_COLORS.select : entry.color);
      ctx.fillText(entry.text, entry.x + (entry.style === "chip" ? CHIP_PAD : LABEL_PAD_X), entry.cy);
    }
    ctx.font = FONT;
  }

  PaintTooltip(ctx, view, sel) {
    const lines = this.DescribeSel(sel);
    if (!lines.length) return;
    ctx.font = FONT;
    let width = 0;
    for (const line of lines) width = Math.max(width, ctx.measureText(line).width);
    const w = width + 18;
    const h = lines.length * 15 + 12;
    let x = this.pointer.x + 14;
    let y = this.pointer.y + 14;
    if (x + w > view.w) x = view.w - w - 4;
    if (y + h > view.h) y = view.h - h - 4;
    ctx.fillStyle = Css(MAP_COLORS.legendBack, 0.97);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = Css(MAP_COLORS.legendEdge, 0.5);
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = Css(MAP_COLORS.zone);
    ctx.fillRect(x, y, 2, h);
    for (let i = 0; i < lines.length; i += 1) {
      ctx.fillStyle = Css(i === 0 ? MAP_COLORS.textLight : MAP_COLORS.textMuted);
      ctx.fillText(lines[i], x + 9, y + 13 + i * 15);
    }
  }

  DescribeSel(sel) {
    if (!sel) return [];
    if (sel.kind === "sketch") return this.DescribeSketch(sel);
    const lines = [sel.kind === "friendly" && sel.live
      ? LiveMateText(this.live?.squad, sel.id)
      : `${KindText(sel.kind)}：${sel.id ?? ""}`];
    if (sel.kind === "encounter") {
      const encounter = (this.phaseLayout?.encounters || []).find((entry) => entry.id === sel.id);
      if (encounter) {
        const total = (encounter.members || []).length;
        lines.push(`${StateText(encounter.state)} · ${total} 人`);
        // 挤成一堆合并出来的那枚：说清楚脚下这一撮是几个人，别让人以为整组就这些。
        if (Number.isFinite(sel.cluster) && sel.cluster > 1) {
          lines.push(sel.cluster >= total
            ? `这一撮就是整组 ${sel.cluster} 人（挤在一起，放大就散开）`
            : `脚下这一撮 ${sel.cluster} 人（挤在一起，放大就散开）`);
        }
        const spawn = encounter.spawn || {};
        const where = spawn.step || spawn.fact || spawn.threat || "";
        if (spawn.kind) lines.push(`出现：${spawn.kind}${where ? ` ${where}` : ""}`);
        if (encounter.standbyUntil) lines.push(`待命到 ${encounter.standbyUntil}`);
      }
    }
    if (sel.kind === "threat") {
      const info = ThreatInfo(this.model, sel.id);
      if (info.threat) {
        lines.push(`${info.title} · ${ThreatWindow(info.threat)}`);
        lines.push(`解除后记 ${info.threat.resolved}`);
      }
    }
    if (sel.kind === "member") {
      const found = this.FindMember(sel.id);
      if (found) {
        // 打死了就先说这一句：这时候「他属于哪一组、按计划该干什么」都是次要的。
        const dead = !!this.LiveDeadIds()?.dead.has(sel.id);
        lines.push(`${found.encounter.id} · ${dead ? "已击毙" : StateText(found.encounter.state)}`);
        const bits = [];
        // 图标说的是什么，提示里就用同一个中文词说一遍 —— 图与字不许各说各的。
        const label = IconLabel(MapIconForMember(found.member, found.encounter.state, found.encounter.id));
        if (label) bits.push(label);
        if (found.member.weapon) bits.push(found.member.weapon);
        if (found.member.hold) bits.push("钉在原地");
        if (found.member.bayonet) bits.push("刺刀");
        if (found.member.tactic) bits.push(`路线 ${found.member.tactic.points?.length || 0} 点`);
        if (bits.length) lines.push(bits.join(" / "));
      }
    }
    if (Number.isFinite(sel.x)) lines.push(`x ${sel.x.toFixed(1)}  z ${sel.z.toFixed(1)}`);
    return lines;
  }

  /**
   * 自己画的那一笔怎么说给人听。写的是「圈选 · 半径 12 m」这种话 ——
   * 提示卡里冒出 `type:"circle"` 或者数组下标，那是把内部字段名甩到脸上。
   */
  DescribeSketch(sel) {
    const shape = this.sketch[sel?.index];
    if (!shape) return [];
    const lines = [];
    if (shape.type === "circle") {
      lines.push(`圈选 · 半径 ${Round1(shape.r)} m`);
      if (Number.isFinite(shape.x)) lines.push(`x ${Round1(shape.x)}  z ${Round1(shape.z)}`);
    } else if (shape.type === "arrow") {
      const len = Math.hypot((shape.to?.x ?? 0) - (shape.from?.x ?? 0), (shape.to?.z ?? 0) - (shape.from?.z ?? 0));
      lines.push(`箭头 · 长 ${Round1(len)} m`);
    } else if (shape.type === "path") {
      const pts = Points(shape.points);
      let len = 0;
      for (let i = 1; i < pts.length; i += 1) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      lines.push(`折线 · ${pts.length} 个点 · 全长 ${Round1(len)} m`);
    } else if (shape.type === "label") {
      lines.push(`标注 · ${shape.text || "（待填）"}`);
    } else if (shape.type === "ghost") {
      lines.push(`候选位 · ${shape.memberId || "选中的东西"}`);
      if (Number.isFinite(shape.x)) lines.push(`挪到 x ${Round1(shape.x)}  z ${Round1(shape.z)}`);
    } else {
      lines.push("画上去的一笔");
    }
    return lines;
  }

  /**
   * 自己画的那几笔里，这一下点中了哪一个。
   *
   * 圈按「圈心或圈周」、箭头与折线按「端点或线段」，都按屏幕像素算 —— 世界米数在
   * 整关视野下是 0.8 px/m，照米数给容差等于点不中任何东西。回的是 `{sel, d, rank}`
   * 列表，`PickAt` 拿去跟别的对象一起排。
   */
  SketchPicks(px, py) {
    const out = [];
    const Hit = (index, d) => out.push({ sel: { kind: "sketch", index }, d, rank: PICK_RANK.sketch });
    for (let i = 0; i < this.sketch.length; i += 1) {
      const shape = this.sketch[i];
      if (!shape) continue;
      if (shape.type === "circle" && Number.isFinite(shape.x)) {
        const c = this.WorldToScreen(shape.x, shape.z);
        const d = Math.hypot(c.x - px, c.y - py);
        const rim = Math.abs(d - Math.max(2, (shape.r || 1) * this.view.scale));
        if (d <= 8) Hit(i, d);
        else if (rim <= 6) Hit(i, rim);
      } else if (shape.type === "arrow" && shape.from && shape.to) {
        const a = this.WorldToScreen(shape.from.x, shape.from.z);
        const b = this.WorldToScreen(shape.to.x, shape.to.z);
        const ends = Math.min(Math.hypot(a.x - px, a.y - py), Math.hypot(b.x - px, b.y - py));
        const seg = SegmentDistance(px, py, a, b);
        if (ends <= 8) Hit(i, ends);
        else if (seg <= 5) Hit(i, seg);
      } else if (shape.type === "path") {
        const pts = Points(shape.points).map((p) => this.WorldToScreen(p.x, p.z));
        let best = Infinity;
        let onSeg = Infinity;
        for (let k = 0; k < pts.length; k += 1) {
          best = Math.min(best, Math.hypot(pts[k].x - px, pts[k].y - py));
          if (k > 0) onSeg = Math.min(onSeg, SegmentDistance(px, py, pts[k - 1], pts[k]));
        }
        if (best <= 8) Hit(i, best);
        else if (onSeg <= 5) Hit(i, onSeg);
      } else if (shape.type === "label" && Number.isFinite(shape.x)) {
        // 文字框：写的时候是 `PlainLabel(x + 6, y)`，所以框子在锚点右边、上下各半行。
        const p = this.WorldToScreen(shape.x, shape.z);
        const text = shape.text || "（待填）";
        const w = TextWidth(this.ctx, text, FONT_SMALL) + 10;
        if (px >= p.x - 4 && px <= p.x + 6 + w && py >= p.y - LABEL_H / 2 && py <= p.y + LABEL_H / 2) {
          Hit(i, Math.hypot(p.x - px, p.y - py));
        }
      } else if (shape.type === "ghost" && Number.isFinite(shape.x)) {
        const p = this.WorldToScreen(shape.x, shape.z);
        const d = Math.hypot(p.x - px, p.y - py);
        if (d <= 10) out.push({ sel: { kind: "sketch", index: i }, d, rank: PICK_RANK.member });
      }
    }
    return out;
  }

  /**
   * 这一枚候选位原本标的是谁。ghost 形状只记得 memberId，可候选位也能是从锚点或
   * 触发区拖出来的 —— 所以上一次拖它的那个 target 留在 `moveTarget` 里，优先用它。
   */
  GhostTarget(shape) {
    const last = this.moveTarget;
    if (last && (!shape?.memberId || last.id === shape.memberId)) return last;
    if (shape?.memberId) {
      const found = this.FindMember(shape.memberId);
      return found
        ? { kind: "member", id: shape.memberId, encounterId: found.encounter.id, x: found.member.x, z: found.member.z }
        : { kind: "member", id: shape.memberId };
    }
    return MovableSel(this.selection) ? this.selection : null;
  }

  FindMember(id) {
    for (const encounter of this.phaseLayout?.encounters || []) {
      for (const member of encounter.members || []) {
        if (member.id === id) return { encounter, member };
      }
    }
    return null;
  }

  SelPoint(sel) {
    if (!sel) return null;
    if (Number.isFinite(sel.x) && Number.isFinite(sel.z)) return { x: sel.x, z: sel.z };
    if (sel.kind === "member") {
      const found = this.FindMember(sel.id);
      if (found) return { x: found.member.x, z: found.member.z };
    }
    if (sel.kind === "anchor") {
      const anchor = this.model?.anchors?.[sel.id];
      if (anchor) return { x: anchor.x, z: anchor.z };
    }
    if (sel.kind === "encounter" || sel.kind === "threat") {
      const encounter = (this.phaseLayout?.encounters || this.model?.encounters || [])
        .find((entry) => entry.id === sel.id);
      if (encounter) return Centroid(encounter.members);
    }
    return null;
  }

  /**
   * 拾取。够得着的里面取最近的；距离打平（半个像素之内）时按 rank 分高下 ——
   * 人永远赢把手，实机位赢设计位。把手排在人后面画，但点人拿到的永远是人。
   *
   * 自己画的那几笔也参加（`SketchPicks`），而且**先过一遍**：同分时后来者赢，
   * 把草图排在前面，一枚候选位正好压在某个人身上时拿到的仍然是那个人。
   */
  PickAt(px, py) {
    let best = null;
    let bestD = Infinity;
    let bestRank = -Infinity;
    const Consider = (sel, d, rank) => {
      if (d < bestD - 0.5 || (d < bestD + 0.5 && rank >= bestRank)) {
        if (d < bestD) bestD = d;
        best = sel;
        bestRank = rank;
      }
    };
    for (const hit of this.SketchPicks(px, py)) Consider(hit.sel, hit.d, hit.rank);
    for (const entry of this.picks) {
      const d = Math.hypot(entry.px - px, entry.py - py);
      const reach = Math.max(entry.r, 5);
      if (d > reach) continue;
      Consider(entry.sel, d, entry.rank ?? 1);
    }
    return best ? { ...best } : null;
  }

  // -------------------------------------------------------------------------
  // 交互
  // -------------------------------------------------------------------------
  OnDown(event) {
    if (this.disposed) return;
    const local = this.LocalPoint(event);
    this.pointer = local;
    const world = this.ScreenToWorld(local.x, local.y);
    // --- @ 提及：Ctrl（Mac 上 Meta）+ 左键，或者武装之后的那一下 -------------
    // **任何工具下都生效**，连平移工具与画到一半的折线也认（这时候不落点）——
    // 「要提一个东西还得先切回选择工具」这种规矩没人记得住。
    if (event.button === 0 && (this.mentionArmed || event.ctrlKey || event.metaKey)) {
      const sel = this.PickAt(local.x, local.y);
      if (this.mentionArmed) this.ArmMention(false);     // 一次性：点空了也解除
      // 草图是自己刚画上去的一笔，不是编排里的东西，@ 它没有意义。
      if (sel && sel.kind !== "sketch") this.Emit("mention", sel);
      event.preventDefault?.();
      return;
    }
    // 折线画到一半的右键是「画完了」，不是平移：右键一拖，刚点出来的线就全丢了。
    if (this.tool === "path" && this.pathPoints.length && event.button === 2) {
      this.FinishPath();
      event.preventDefault?.();
      return;
    }
    const panning = event.button === 2 || event.button === 1 || this.spaceDown || this.tool === "pan";
    if (panning) {
      this.drag = { kind: "pan", screen: local, cx: this.view.cx, cz: this.view.cz };
      event.preventDefault?.();
      return;
    }
    if (event.button !== 0) return;
    // 图例的标题栏（收起时就是那枚芯片）先吃掉这一下，别顺手把底下的标记选中
    const hit = this.legendHit;
    if (hit && local.x >= hit.x && local.x <= hit.x + hit.w && local.y >= hit.y && local.y <= hit.y + hit.h) {
      this.SetLegendOpen(!this.legendOpen);
      event.preventDefault?.();
      return;
    }
    if (this.tool === "select") {
      const sel = this.PickAt(local.x, local.y);
      this.selection = sel;
      this.labelCache = null;
      this.Emit("select", sel);
      this.Redraw();
      return;
    }
    if (this.tool === "circle" || this.tool === "arrow") {
      this.drag = { kind: this.tool, screen: local, world, current: world };
      this.Redraw();
      return;
    }
    if (this.tool === "path") {
      this.pathPoints.push(world);
      this.Redraw();
      return;
    }
    if (this.tool === "label") {
      // 有人接管就把「在哪儿点的」交出去（宿主在那儿长一个输入框），
      // 没人接才直接产出一枚空文字的标注。
      if (this.callbacks.label.length) this.Emit("label", { x: world.x, z: world.z, px: local.x, py: local.y });
      else this.Emit("sketch", { type: "label", x: world.x, z: world.z, text: "" });
      return;
    }
    if (this.tool === "move") {
      const picked = this.PickAt(local.x, local.y);
      // 从已经摆出来的那枚候选位上按下 = 把它重新放一遍（原来标的是谁不变）。
      // 先前只能一次次从人身上重拖，摆歪了连挪都挪不动。
      const ghost = picked?.kind === "sketch" ? this.sketch[picked.index] : null;
      if (ghost && ghost.type === "ghost") {
        const target = this.GhostTarget(ghost);
        if (!target) return;
        this.moveTarget = target;
        this.drag = { kind: "move", screen: local, world: { x: ghost.x, z: ghost.z }, current: world, target };
        this.Redraw();
        return;
      }
      const target = MovableSel(picked) ? picked : (MovableSel(this.selection) ? this.selection : null);
      if (!target) return;
      this.moveTarget = target;
      const origin = this.SelPoint(target) || world;
      this.drag = { kind: "move", screen: local, world: origin, current: world, target };
      this.Redraw();
    }
  }

  OnMove(event) {
    if (this.disposed) return;
    const local = this.LocalPoint(event);
    this.pointer = local;
    const drag = this.drag;
    if (drag?.kind === "pan") {
      this.view.cx = drag.cx - (local.x - drag.screen.x) / this.view.scale;
      this.view.cz = drag.cz - (local.y - drag.screen.y) / this.view.scale;
      this.viewTouched = true;          // 手动挪过的视野，跟随实时不许再抢
      this.Redraw();
      return;
    }
    if (drag) {
      drag.current = this.ScreenToWorld(local.x, local.y);
      this.Redraw();
      return;
    }
    // 折线画到一半：光标那一段橡皮筋和提示都跟着走，这时候不去算悬停
    //（要点的是下一个落点，不是脚下那个人）。
    if (this.tool === "path" && this.pathPoints.length) { this.Redraw(); return; }
    const before = this.hover;
    const next = this.PickAt(local.x, local.y);
    this.SetHover(next);
    // tooltip 跟着鼠标走：sel 没变也要重画，否则提示框钉在原地。
    // 武装 @ 提及时那句小提示也贴着光标，同理（悬停照常算 —— 正要 @ 谁总得先看清）。
    if ((SameSel(before, next) && next) || this.mentionArmed) this.Redraw();
  }

  OnUp(event) {
    if (this.disposed) return;
    const drag = this.drag;
    this.drag = null;
    if (!drag) return;
    const local = this.LocalPoint(event);
    // 在画布外面松手：世界坐标照算（拖出去的那一笔本来就该落在外面），但光标不留在
    // 画布外 —— 提示与 tooltip 会跟着画到边上去。
    const inside = local.x >= 0 && local.y >= 0 && local.x <= this.cssWidth && local.y <= this.cssHeight;
    this.pointer = inside ? local : null;
    const world = this.ScreenToWorld(local.x, local.y);
    // 手一抖的那一下不算一笔：圈与箭头都要求真的拖开过几个像素，
    // 否则一次误点就在图上留一枚半径 1 m 的圈或者一支零长的箭头。
    const moved = Math.hypot(local.x - (drag.screen?.x ?? local.x), local.y - (drag.screen?.y ?? local.y));
    if (drag.kind === "circle") {
      if (moved >= MIN_DRAG_PX) {
        const r = Math.hypot(world.x - drag.world.x, world.z - drag.world.z);
        this.Emit("sketch", { type: "circle", x: drag.world.x, z: drag.world.z, r: Math.max(1, r) });
      }
    } else if (drag.kind === "arrow") {
      if (moved >= MIN_DRAG_PX) this.Emit("sketch", { type: "arrow", from: { ...drag.world }, to: { ...world } });
    } else if (drag.kind === "move" && drag.target) {
      this.Emit("move", { target: { ...drag.target }, to: { x: world.x, z: world.z } });
    }
    this.Redraw();
  }

  /**
   * 结束折线，产出一笔 `sketch`。双击 / 回车 / 右键 / 切工具走的都是这里 ——
   * 先前只有双击能收尾，画上瘾了就停不下来，切工具还把点全丢了。
   * 不足两点当没画过（一个点连不成线）。回产出的形状，没产出回 null。
   */
  FinishPath() {
    const points = this.pathPoints;
    this.pathPoints = [];
    if (!points.length) { this.Redraw(); return null; }
    // 双击的第一下已经落过一个点，末尾那两个几乎重合的点丢掉一个。
    if (points.length >= 2) {
      const a = points[points.length - 1], b = points[points.length - 2];
      if (Math.hypot(a.x - b.x, a.z - b.z) * this.view.scale < MIN_DRAG_PX) points.pop();
    }
    let shape = null;
    if (points.length >= 2) {
      shape = { type: "path", points };
      this.Emit("sketch", shape);
    }
    this.Redraw();
    return shape;
  }

  /** 整条折线不要了（Esc）。回 true 表示确实丢掉了没画完的东西。 */
  CancelPath() {
    const had = this.pathPoints.length > 0;
    this.pathPoints = [];
    if (had) this.Redraw();
    return had;
  }

  OnDoubleClick(event) {
    if (this.disposed) return;
    if (this.tool !== "path" || !this.pathPoints.length) return;
    this.FinishPath();
    event.preventDefault?.();
  }

  /**
   * 键盘。**焦点在输入框里的时候一概不接**：工作台弹窗里有好几个输入框（批注正文、
   * 标注文字），折线的回车与退格把用户正在打的字吃掉，那是最难查的一类怪事。
   *
   * 只有「手上正有一件没做完的事」时才吃掉按键（画着折线、武装着 @、拖着圈）——
   * 平时的回车与 Esc 归宿主（弹窗自己也要用）。
   */
  OnKeyDown(event) {
    if (this.disposed) return;
    if (TypingTarget(event.target)) return;
    if (event.code === "Space" || event.key === " ") { this.spaceDown = true; return; }
    const drawing = this.tool === "path" && this.pathPoints.length > 0;
    if (event.key === "Enter") {
      if (!drawing) return;
      this.FinishPath();
      event.preventDefault?.();
      return;
    }
    if (event.key === "Backspace") {
      if (!drawing) return;
      this.pathPoints.pop();                 // 退一个点，不是整条丢掉
      this.Redraw();
      event.preventDefault?.();
      return;
    }
    if (event.key === "Escape") {
      let handled = false;
      if (this.mentionArmed) { this.ArmMention(false); handled = true; }
      if (drawing) { this.CancelPath(); handled = true; }
      else if (this.drag && this.drag.kind !== "pan") { this.drag = null; this.Redraw(); handled = true; }
      if (handled) event.preventDefault?.();
    }
  }

  OnWheel(event) {
    if (this.disposed) return;
    event.preventDefault?.();
    const local = this.LocalPoint(event);
    const before = this.ScreenToWorld(local.x, local.y);
    const factor = Math.exp(-(event.deltaY || 0) * 0.0015);
    this.view.scale = Clamp(this.view.scale * factor, 0.08, 40);
    const after = this.ScreenToWorld(local.x, local.y);
    this.view.cx += before.x - after.x;     // 以鼠标为中心：光标下那一点不动
    this.view.cz += before.z - after.z;
    this.viewTouched = true;
    this.Redraw();
  }

  Dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const canvas = this.canvas;
    if (canvas) {
      canvas.removeEventListener("mousedown", this.handlers.down);
      canvas.removeEventListener("mousemove", this.handlers.move);
      canvas.removeEventListener("mouseup", this.handlers.up);
      canvas.removeEventListener("mouseleave", this.handlers.leave);
      canvas.removeEventListener("wheel", this.handlers.wheel);
      canvas.removeEventListener("dblclick", this.handlers.dbl);
      canvas.removeEventListener("contextmenu", this.handlers.menu);
    }
    const win = this.win;
    if (win) {
      win.removeEventListener("mousemove", this.handlers.winMove);
      win.removeEventListener("mouseup", this.handlers.winUp);
      win.removeEventListener("keydown", this.handlers.keyDown);
      win.removeEventListener("keyup", this.handlers.keyUp);
    }
    this.callbacks = { select: [], hover: [], sketch: [], move: [], label: [], mention: [] };
    this.ground = null;
    this.picks = [];
    this.handles = [];
    this.placedLabels = [];
    this.labelCache = null;
    this.drag = null;
    this.pathPoints = [];
    this.moveTarget = null;
    this.cursorHint = null;
    this.mentionArmed = false;
    if (canvas?.style) canvas.style.cursor = this.baseCursor;
    this.live = null;
    this.drawnMarkers = [];
    this.marks = null;
    this.filter = null;
    // 染色小图是这个实例自己的离屏 canvas，跟着实例走；图片本体在模块级共享，
    // 下次开面板还能接着用，不重下。
    this.tintCache.clear();
  }
}

// ---------------------------------------------------------------------------
// 绘制小工具
// ---------------------------------------------------------------------------
function Stroke(ctx, points, Project) {
  ctx.beginPath();
  for (let i = 0; i < points.length; i += 1) {
    const p = Project(points[i].x, points[i].z);
    if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
}

/**
 * 有向折线。`arrows:"end"` 只在末端画一枚箭头（战术线、跃进线用这个，路上撒
 * 满箭头只会把图糊掉）；`"along"` 沿途每 spacing 像素一枚（设计路线、指引路线）。
 * 拐点圆点不只是好看 —— 细线在斜角上全是抗锯齿的中间色，测试数「这条路线到底
 * 画出来没有」时只能靠实心块给出精确 RGB 的像素。
 */
function DirectedPath(ctx, list, Project, color, width, arrow, { arrows = "along", spacing = 150, dash = null, dot = 1.7 } = {}) {
  const points = Points(list);
  if (points.length < 2) return;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  if (dash) ctx.setLineDash(dash);
  Stroke(ctx, points, Project);
  if (dash) ctx.setLineDash([]);
  if (arrows === "along") {
    let carry = 0;
    for (let i = 1; i < points.length; i += 1) {
      const a = Project(points[i - 1].x, points[i - 1].z);
      const b = Project(points[i].x, points[i].z);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1) continue;
      const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
      for (let t = spacing - carry; t < len; t += spacing) {
        Arrow(ctx, a.x + ux * t, a.y + uy * t, ux, uy, arrow, color);
      }
      carry = (carry + len) % spacing;
    }
  }
  const last = Project(points[points.length - 1].x, points[points.length - 1].z);
  const prev = Project(points[points.length - 2].x, points[points.length - 2].z);
  const len = Math.hypot(last.x - prev.x, last.y - prev.y) || 1;
  Arrow(ctx, last.x, last.y, (last.x - prev.x) / len, (last.y - prev.y) / len, arrow, color);
  if (dot > 0) {
    for (const point of points) {
      const p = Project(point.x, point.z);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.6, dot), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function Arrow(ctx, x, y, ux, uy, size, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - ux * size - uy * size * 0.55, y - uy * size + ux * size * 0.55);
  ctx.lineTo(x - ux * size + uy * size * 0.55, y - uy * size - ux * size * 0.55);
  ctx.closePath();
  ctx.fill();
}

function RoundRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.arcTo(x + w, y, x + w, y + rad, rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad);
  ctx.lineTo(x + rad, y + h);
  ctx.arcTo(x, y + h, x, y + h - rad, rad);
  ctx.lineTo(x, y + rad);
  ctx.arcTo(x, y, x + rad, y, rad);
  ctx.closePath();
}

/** 点到线段的距离（屏幕像素）。折线与箭头的拾取全靠它。 */
function SegmentDistance(px, py, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  if (len <= 1e-6) return Math.hypot(px - a.x, py - a.y);
  const t = Clamp(((px - a.x) * dx + (py - a.y) * dy) / len, 0, 1);
  return Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t));
}
/** 量一段文字有多宽。量完把字体还回去 —— 别把调用方的画笔状态搅了。 */
function TextWidth(ctx, text, font) {
  if (!ctx) return String(text).length * 6;
  const was = ctx.font;
  ctx.font = font;
  const w = ctx.measureText(text).width;
  ctx.font = was;
  return w;
}
/** 一位小数。界面上的米数写到厘米既读不过来也没那个精度。 */
function Round1(v) { return Number.isFinite(v) ? (Math.round(v * 10) / 10).toString() : "?"; }
/** 实时小队这一帧的指纹：名字要跟着人走，排版缓存就得认得出「人挪了」。 */
function SquadKey(squad) {
  if (!Array.isArray(squad) || !squad.length) return "";
  let key = "";
  for (const mate of squad) {
    key += `${mate?.id || ""}${Math.round(mate?.x || 0)},${Math.round(mate?.z || 0)}${mate?.alive === false ? "x" : ""};`;
  }
  return key;
}
/** 实时小队成员的提示头一行：写中文名与死活，不写角色号。 */
function LiveMateText(squad, id) {
  const mate = (squad || []).find((entry) => entry?.id === id);
  const name = mate?.label || id || "";
  return `实时 · ${name}（${mate?.alive === false ? "阵亡" : "活着"}）`;
}
/**
 * 一撮人里还剩几个活的。
 *
 * **只有「查得到而且死了」才算死**：实机名单里没有的那个人多半是还没生成，不是
 * 阵亡 —— 把「不知道」算成死，芯片会在刚进这一阶段时就报全灭。
 * 整组一个都不在实机名单里就回 `known:false`，芯片照旧只写总数。
 */
function ClusterTally(group, live) {
  if (!live) return { known: false, alive: 0, wiped: false };
  let seen = 0, dead = 0;
  for (const item of group.items) {
    if (live.known.has(item.member.id)) seen += 1;
    if (live.dead.has(item.member.id)) dead += 1;
  }
  if (!seen) return { known: false, alive: 0, wiped: false };
  const alive = group.items.length - dead;
  return { known: true, alive, wiped: alive === 0 };
}
/**
 * 焦点是不是落在能打字的地方。是的话键盘归它 —— 工作台弹窗里有好几个输入框，
 * 折线的回车/退格要是把用户正在打的字吃掉，查起来是最难受的一类怪事。
 */
function TypingTarget(target) {
  if (!target || typeof target !== "object") return false;
  const tag = String(target.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return !!target.isContentEditable;
}

/** 草图上的随手文字：不进避让系统（它是用户自己放的），描个深色边就够。 */
function PlainLabel(ctx, x, y, text, color) {
  if (!text) return;
  ctx.font = FONT_SMALL;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(14,16,17,0.8)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.font = FONT;
}

/** 候选位置：先试贴着标记的四个角，再往外扩，越靠后越远（远的要画引线）。 */
function LabelOffsets(w, style) {
  if (style === "chip") {
    const list = [
      [CHIP_DX, CHIP_DY], [-w - CHIP_DX, CHIP_DY], [CHIP_DX, -CHIP_DY], [-w - CHIP_DX, -CHIP_DY],
      [-w / 2, -26], [-w / 2, 26], [CHIP_DX, -32], [-w - CHIP_DX, -32], [CHIP_DX, 32], [-w - CHIP_DX, 32],
      [-w / 2, -44], [-w / 2, 44], [CHIP_DX + 24, -50], [-w - CHIP_DX - 24, -50],
      [CHIP_DX + 24, 50], [-w - CHIP_DX - 24, 50], [-w / 2, -62], [-w / 2, 62],
    ];
    // 组把手与拍把手是可点的控件，不是装饰：宁可挂到七十像素外拉一条引线，
    // 也不能因为身边挤满了人就整枚消失（宿主与测试都按 HandlePoint 去点它）。
    for (const radius of [72, 104, 140]) {
      for (let k = 0; k < 8; k += 1) {
        const angle = (Math.PI * 2 * k) / 8 + Math.PI / 8;
        const dx = Math.cos(angle) * radius;
        list.push([dx < 0 ? dx - w : dx, Math.sin(angle) * radius]);
      }
    }
    return list;
  }
  return [
    [8, 0], [-w - 8, 0], [7, -12], [-w - 7, -12], [7, 12], [-w - 7, 12],
    [-w / 2, -14], [-w / 2, 14], [12, -24], [-w - 12, -24], [12, 24], [-w - 12, 24],
    [-w / 2, -28], [-w / 2, 28],
  ];
}

function Intersects(a, b, pad) {
  return !(a.x - pad > b.x + b.w || a.x + a.w + pad < b.x || a.y - pad > b.y + b.h || a.y + a.h + pad < b.y);
}
function HitsAny(rect, list, pad) {
  for (const other of list) if (Intersects(rect, other, pad)) return true;
  return false;
}
/** 名字不许压在别人的标记上 —— 压上去就等于把那个标记读没了。 */
function HitsMarkers(rect, markers, skipIndex) {
  for (let i = 0; i < markers.length; i += 1) {
    if (i === skipIndex) continue;
    if (Intersects(rect, markers[i], 0)) return true;
  }
  return false;
}

// 粗占位图。16 px 一格：敌人/友军/实机标记画到哪儿就涂哪儿，排版查表即可，
// 不必拿几百个标记去和每一个候选位置两两相交。
const GRID_CELL = 16;
function MakeGrid(w, h) {
  const cols = Math.max(1, Math.ceil(w / GRID_CELL));
  const rows = Math.max(1, Math.ceil(h / GRID_CELL));
  return { cols, rows, data: new Uint8Array(cols * rows) };
}
function MarkGrid(grid, x, y, w, h) {
  if (!grid) return;
  const i0 = Clamp(Math.floor(x / GRID_CELL), 0, grid.cols - 1);
  const i1 = Clamp(Math.floor((x + w) / GRID_CELL), 0, grid.cols - 1);
  const j0 = Clamp(Math.floor(y / GRID_CELL), 0, grid.rows - 1);
  const j1 = Clamp(Math.floor((y + h) / GRID_CELL), 0, grid.rows - 1);
  for (let j = j0; j <= j1; j += 1) {
    for (let i = i0; i <= i1; i += 1) grid.data[j * grid.cols + i] = 1;
  }
}
function HitsGrid(grid, rect) {
  if (!grid) return false;
  const i0 = Clamp(Math.floor(rect.x / GRID_CELL), 0, grid.cols - 1);
  const i1 = Clamp(Math.floor((rect.x + rect.w) / GRID_CELL), 0, grid.cols - 1);
  const j0 = Clamp(Math.floor(rect.y / GRID_CELL), 0, grid.rows - 1);
  const j1 = Clamp(Math.floor((rect.y + rect.h) / GRID_CELL), 0, grid.rows - 1);
  for (let j = j0; j <= j1; j += 1) {
    for (let i = i0; i <= i1; i += 1) if (grid.data[j * grid.cols + i]) return true;
  }
  return false;
}

/**
 * 转运的两处威胁在界面上叫「第几处威胁」（旧的四「拍」已随 2026.09.19 重构下线），
 * 图上写给人看的时候按它在 MISSION_TRANSFER_THREATS 里的次序报第几处（从 1 起）。
 */
function ThreatInfo(model, threatId) {
  const threats = model?.transferThreats || [];
  const index = threats.findIndex((entry) => entry.id === threatId);
  if (index < 0) return { title: "转运威胁", threat: null, order: 0 };
  return { title: `第 ${index + 1} 处威胁`, threat: threats[index], order: index + 1 };
}

/** 出现条件的人话。第一处进步就在；第二处等第一处解除。 */
function ThreatWindow(threat) {
  if (!threat) return "条件未定";
  return threat.after ? `${threat.after} 之后` : `进 ${threat.step || "Transfer"} 即到`;
}

/**
 * 触发圈的名字。`bundleRoutePoint0…15` 这种一家人有十六个，十六行几乎一样的字
 * 会把整片北城糊住 —— 一家人只写一行「bundleRoutePoint ×16」，圈还是照画。
 */
function ZoneNames(zones, enabled) {
  const out = new Map();
  if (!enabled) return out;
  const families = new Map();
  for (const zone of zones) {
    const raw = String(zone.fact || zone.id || "");
    if (!raw) continue;
    const prefix = raw.replace(/\d+$/, "");
    if (!families.has(prefix)) families.set(prefix, []);
    families.get(prefix).push(zone);
  }
  for (const [prefix, list] of families) {
    if (list.length > 2) {
      out.set(list[0], `${prefix} ×${list.length}`);
      for (let i = 1; i < list.length; i += 1) out.set(list[i], "");
    } else {
      for (const zone of list) out.set(zone, String(zone.fact || zone.id || ""));
    }
  }
  return out;
}

/** 一组人的质心。组把手挂在这儿，比挂在「第一个人」身上更像「这一撮人」。 */
function Centroid(members) {
  let x = 0, z = 0, n = 0;
  for (const member of members || []) {
    if (!Number.isFinite(member?.x) || !Number.isFinite(member?.z)) continue;
    x += member.x; z += member.z; n += 1;
  }
  return n ? { x: x / n, z: z / n } : null;
}

/**
 * 同一组里挤在一起的人合成几撮。**单链合并**：只要两个人近到阈值以内就算一伙，
 * 一串隔得都不远的人会串成一整撮 —— 前线那十二个人排成一条 60 m 的线，
 * 两两算的话谁也并不进谁，串起来才是眼睛看到的那一条。
 * 合并只在**组内**做；不同组哪怕叠在一起也各画各的。
 */
function ClusterEntries(entries, gap) {
  if (!(gap > 0) || entries.length < 2) return entries.map((e) => ({ items: [e], x: e.p.x, y: e.p.y }));
  const parent = entries.map((_, i) => i);
  const Find = (i) => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    while (parent[i] !== root) { const next = parent[i]; parent[i] = root; i = next; }
    return root;
  };
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const dx = entries[i].p.x - entries[j].p.x;
      const dy = entries[i].p.y - entries[j].p.y;
      if (dx * dx + dy * dy > gap * gap) continue;
      const a = Find(i), b = Find(j);
      if (a !== b) parent[a] = b;
    }
  }
  const byRoot = new Map();
  for (let i = 0; i < entries.length; i += 1) {
    const root = Find(i);
    let bucket = byRoot.get(root);
    if (!bucket) { bucket = []; byRoot.set(root, bucket); }
    bucket.push(entries[i]);
  }
  const out = [];
  for (const items of byRoot.values()) {
    let x = 0, y = 0;
    for (const item of items) { x += item.p.x; y += item.p.y; }
    out.push({ items, x: x / items.length, y: y / items.length });
  }
  return out;
}
/** 一撮人的世界坐标质心（拾取回调要给世界坐标，不是屏幕坐标）。 */
function ClusterWorld(group) {
  let x = 0, z = 0;
  for (const item of group.items) { x += item.member.x; z += item.member.z; }
  return { x: x / group.items.length, z: z / group.items.length };
}
/** 一撮人用哪张图标：数一数谁最多。打平取先出现的那个（成员顺序是定的）。 */
function DominantIcon(items, state, encounterId) {
  const tally = new Map();
  let best = "Rifleman";
  let bestN = 0;
  for (const item of items) {
    const icon = MapIconForMember(item.member, state, encounterId);
    const n = (tally.get(icon) || 0) + 1;
    tally.set(icon, n);
    if (n > bestN) { bestN = n; best = icon; }
  }
  return best;
}
/** 状态决定的透明度。单人与簇用同一条，免得两种画法看着像两种状态。 */
function StateAlpha(state) {
  if (state === "pending") return 0.64;
  if (state === "dormant") return 0.74;
  if (state === "cleared") return 0.66;
  return 1;
}

function StateColor(state) {
  switch (state) {
    case "pending": return MAP_COLORS.enemyPending;
    case "dormant": return MAP_COLORS.enemyDormant;
    case "active": return MAP_COLORS.enemyActive;
    case "cleared": return MAP_COLORS.enemyCleared;
    default: return MAP_COLORS.enemyStaged;   // spawned / standby
  }
}
function StateText(state) {
  switch (state) {
    case "pending": return "未出现";
    case "spawned": return "已生成";
    case "standby": return "待命";
    case "dormant": return "休眠";
    case "active": return "活跃";
    case "cleared": return "已清除";
    default: return String(state || "");
  }
}
function KindText(kind) {
  switch (kind) {
    case "member": return "敌人";
    case "encounter": return "遭遇组";
    case "anchor": return "锚点";
    case "zone": return "触发区";
    case "route": return "路线";
    case "friendly": return "友军";
    case "threat": return "转运威胁";
    case "note": return "批注";
    case "sketch": return "画上去的一笔";
    default: return "点";
  }
}
function MovableSel(sel) {
  return !!sel && (sel.kind === "member" || sel.kind === "anchor" || sel.kind === "zone");
}
function SameSel(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  // 草图形状没有 id，靠下标区分：不比下标的话，从一个圈挪到旁边那支箭头会被当成
  // 「还是同一个」，提示卡就不跟着换了。
  return a.kind === b.kind && a.id === b.id && a.encounterId === b.encounterId && a.index === b.index;
}
