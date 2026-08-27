// 《滕县 一九三八》主菜单与选章 —— DOM/CSS + 一台相机导演。
//
// 分工：这一份**只管菜单自己**（画面上的字、机位的运镜、选章的那张地图），
// 一切「真的去做点什么」都通过 host 回调交回装配层（Script_Main）：
//   host.Play(index, opts)   进某一关
//   host.PlaySandbox()       进选章末尾那条沙盒（玩法测试靶场，重载页面）
//   host.ExitSandbox()       从靶场退回正片
//   host.Resume()            从暂停回到游戏
//   host.SliceIndex()        现在建好的是哪一关的切片（决定用哪一组机位）
//   host.Unlock()            第一次点击时解锁音频（浏览器要用户手势）
// 这条界线是刻意的：菜单不许自己 import 战场、AI、玩家 —— 那三个模块换一遍，
// 菜单不该跟着改一行。
//
// 对标 Easy Red 2 的三条（见 Data_Menu.mjs 头注）：活场景、运镜、定时切机位。
// 排版上刻意**不抄** ER2 的横排大按钮：这一作用的是与 HUD、阵亡卡片、尾声
// 同一套字距与颜色（Style_Game.css 的 :root），换成横排方按钮就成了另一个游戏。

import * as THREE from "three";
import { FovFromFocalMm } from "./Script_Cutscene.mjs";
import { ValueNoise2, Clamp, Clamp01 } from "./Script_Noise.mjs";
import { MENU, CREDITS, PRESUMED_STAGING } from "./Data_TengxianScript.mjs";
import { MENU_SCENE, ShotsFor } from "./Data_Menu.mjs";
import {
  CITY, GATES, MOAT, EAST_SUBURB, WEST_SUBURB, OUTSKIRTS,
  CITY_FEATURES, LANDMARKS, OUTER_LANDMARKS, PRESUMED,
} from "./Data_Tengxian.mjs";

const NS = "http://www.w3.org/2000/svg";

/** 缓动：进出都软的推轨。ER2 的菜单运镜没有一处是匀速的。 */
function EaseInOutSine(k) { return 0.5 - 0.5 * Math.cos(Math.PI * Clamp01(k)); }
function Lerp(a, b, k) { return a + (b - a) * k; }

// ---------------------------------------------------------------------------
// 存档：只存「打到哪一关」这一件事
// ---------------------------------------------------------------------------
/**
 * 进度。**只记录通过了哪几关**，不存关内状态 ——
 * 这一作没有存档系统（自动检查点在关内，见 docs/Data_DesignFirstPass.md），
 * 菜单要的只是「继续」该从哪一关开始、选章里哪几关打过了。
 */
const STORE_KEY = "tengxian1938_progress_v1";

export const Progress = {
  Read() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const data = raw ? JSON.parse(raw) : null;
      const cleared = Array.isArray(data?.cleared) ? data.cleared : [];
      return { cleared, furthest: Number.isFinite(data?.furthest) ? data.furthest : 0 };
    } catch (error) {
      return { cleared: [], furthest: 0 };      // 无痕模式：localStorage 会抛
    }
  },
  /** 通过一关。id 与关号两样都存 —— 关表改了顺序时对得上。 */
  MarkCleared(id, index) {
    const now = Progress.Read();
    if (id && !now.cleared.includes(id)) now.cleared.push(id);
    now.furthest = Math.max(now.furthest, (index ?? 0) + 1);
    try { localStorage.setItem(STORE_KEY, JSON.stringify(now)); } catch (error) { /* 同上 */ }
    return now;
  },
  Reset() {
    try { localStorage.removeItem(STORE_KEY); } catch (error) { /* 同上 */ }
  },
};

// ---------------------------------------------------------------------------
// 选章里的那张图
// ---------------------------------------------------------------------------
/**
 * 战场全图的投影。**范围写死**：西到津浦路（x=-1500）、北到界河（z=-1420）、
 * 东到荆河（x=680）、南到南关（z=420）—— 七关的切片全部落在这个框里。
 * 城（610 见方）在图上约占八十像素，一眼能认出是座方城。
 */
const MAP = { minX: -1580, maxX: 740, minZ: -1680, maxZ: 500, w: 330, h: 310, pad: 8 };
const Px = (x) => MAP.pad + ((x - MAP.minX) / (MAP.maxX - MAP.minX)) * (MAP.w - MAP.pad * 2);
const Pz = (z) => MAP.pad + ((z - MAP.minZ) / (MAP.maxZ - MAP.minZ)) * (MAP.h - MAP.pad * 2);

// 菜单只声明文案与布局；开关值及实际效果由装配层交回的 host 管，避免菜单
// 偷偷持有玩家、物理世界或弹药账本。
const DEBUG_ITEMS = [
  { id: "noCollision", label: "无碰撞", note: "穿过人物、墙体与掩体；地形与关卡边界仍然生效" },
  { id: "fastMove", label: "快速移动", note: "步行、冲刺与匍匐移动速度提高至三倍" },
  { id: "invincible", label: "无敌模式", note: "免疫子弹、爆炸与流血伤害" },
  { id: "infiniteAmmo", label: "无限子弹", note: "已持有枪械无需装填，空弹仓会自动补满" },
  { id: "infiniteGrenades", label: "无限手榴弹", note: "普通手榴弹不会消耗；开启时会补给一枚" },
];

function SvgEl(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (parent) parent.appendChild(e);
  return e;
}

/**
 * 画一张战场全图，并把选中那一关的切片框出来。
 * 底图全部从 Data_Tengxian 现算 —— 没有第二份坐标，城改了图跟着改。
 */
function BuildMap(phase) {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "mnMap");
  svg.setAttribute("viewBox", `0 0 ${MAP.w} ${MAP.h}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  const g = SvgEl("g", {}, svg);
  const wall = CITY.wallCenter;

  // --- 城外：荆河、津浦路、界河与北沙河 -----------------------------------
  const river = OUTSKIRTS.river;
  SvgEl("path", {
    class: "mnMapWater",
    d: `M ${Px(river.x)} ${Pz(MAP.minZ)} L ${Px(river.x)} ${Pz(river.turnZ)} `
     + `L ${Px(river.x - 620)} ${Pz(river.turnZ + 620)}`,
  }, g);
  SvgEl("line", {
    class: "mnMapRail",
    x1: Px(WEST_SUBURB.railway.x), y1: Pz(MAP.minZ),
    x2: Px(WEST_SUBURB.railway.x), y2: Pz(MAP.maxZ),
  }, g);
  // 界河与北沙河：本作只取南岸那一小片，图上画成两条东西向的水线
  for (const [z, name] of [[-1420, "界河"], [-1000, "北沙河"]]) {
    SvgEl("line", { class: "mnMapWater", x1: Px(-420), y1: Pz(z), x2: Px(420), y2: Pz(z) }, g);
    SvgEl("text", { class: "mnMapLabel", x: Px(440), y: Pz(z) + 3 }, g).textContent = name;
  }

  // --- 城 -----------------------------------------------------------------
  SvgEl("rect", {
    class: "mnMapMoat",
    x: Px(-MOAT.outerEdge), y: Pz(-MOAT.outerEdge),
    width: Px(MOAT.outerEdge) - Px(-MOAT.outerEdge),
    height: Pz(MOAT.outerEdge) - Pz(-MOAT.outerEdge),
  }, g);
  SvgEl("rect", {
    class: "mnMapWall",
    x: Px(-wall), y: Pz(-wall), width: Px(wall) - Px(-wall), height: Pz(wall) - Pz(-wall),
  }, g);
  // 十字街：城内那两条主街，也是「城心」这个概念在图上的表达
  SvgEl("line", { class: "mnMapStreet", x1: Px(-wall), y1: Pz(0), x2: Px(wall), y2: Pz(0) }, g);
  SvgEl("line", { class: "mnMapStreet", x1: Px(0), y1: Pz(-wall), x2: Px(0), y2: Pz(wall) }, g);
  for (const gate of GATES) {
    SvgEl("circle", { class: "mnMapGate", cx: Px(gate.x), cy: Pz(gate.z), r: 2.2 }, g);
  }

  // --- 关厢与城外地标 -----------------------------------------------------
  const eb = EAST_SUBURB.bounds;
  SvgEl("rect", {
    class: "mnMapSuburb",
    x: Px(eb.minX), y: Pz(eb.minZ),
    width: Px(eb.maxX) - Px(eb.minX), height: Pz(eb.maxZ) - Pz(eb.minZ),
  }, g);
  // 挂牌地标。坐标一律从 Data_Tengxian 现算，图上不留第二份坐标。
  // 每条多带 [dx, dy, anchor] —— 那是**排版**参数不是地理数据：城在图上只有八十像素，
  // 城内四个点里监狱与警备队相距 58 m（图上 7.8 px），西关的通讯队与 122 师部相距
  // 40 m（5.5 px），一律用默认的「右下 5,3」就叠成一团糊字。
  const Feature = (id) => CITY_FEATURES.find((f) => f.id === id);
  const dots = [
    // 西关：铁路一侧从北到南 —— 车站、通讯队、122 师部、电灯厂
    [WEST_SUBURB.station.x, WEST_SUBURB.station.z, "车站", -5, -5, "end"],
    [WEST_SUBURB.communications.x, WEST_SUBURB.communications.z, "通讯队", -5, 2, "end"],
    [WEST_SUBURB.division122.x, WEST_SUBURB.division122.z, "122师部", -11, 9, "end"],
    [WEST_SUBURB.powerPlant.x, WEST_SUBURB.powerPlant.z, "电灯厂", -5, 8, "end"],
  ];
  // 城内：北城的文庙／警备队／监狱，南城的天主堂（后者在 LANDMARKS 不在 CITY_FEATURES）
  for (const [id, name, dx, dy, anchor] of [
    ["ConfucianTemple", "文庙", -5, 2, "end"],
    ["GarrisonHQ", "警备队", -5, -1, "end"],
    ["CountyJail", "监狱", 5, 6, "start"],
  ]) {
    const f = Feature(id);
    if (f) dots.push([f.x, f.z, name, dx, dy, anchor]);
  }
  const church = LANDMARKS.find((l) => l.id === "CatholicChurchInner");
  if (church) dots.push([church.x, church.z, "天主堂", 5, 3, "start"]);
  const pagoda = OUTER_LANDMARKS.find((l) => l.id === "LongquanPagoda");
  if (pagoda) dots.push([pagoda.x, pagoda.z, "龙泉塔", 5, 3, "start"]);
  for (const [x, z, name, dx = 5, dy = 3, anchor = "start"] of dots) {
    SvgEl("circle", { class: "mnMapDot", cx: Px(x), cy: Pz(z), r: 1.8 }, g);
    SvgEl("text", {
      class: "mnMapLabel", x: Px(x) + dx, y: Pz(z) + dy, "text-anchor": anchor,
    }, g).textContent = name;
  }

  // --- 选中的这一关：切片框 + 路标链 --------------------------------------
  if (phase) {
    const b = phase.bounds;
    SvgEl("rect", {
      class: "mnMapSlice",
      x: Px(b.minX), y: Pz(b.minZ),
      width: Px(b.maxX) - Px(b.minX), height: Pz(b.maxZ) - Pz(b.minZ),
    }, g);
    let prev = null;
    for (const zone of phase.zones) {
      const cx = Px(zone.x);
      const cy = Pz(zone.z);
      if (prev) SvgEl("line", { class: "mnMapPath", x1: prev[0], y1: prev[1], x2: cx, y2: cy }, g);
      SvgEl("circle", { class: "mnMapZone", cx, cy, r: 2.6 }, g);
      prev = [cx, cy];
    }
    // 路标链的终点标上名字：那就是这一关要走到的地方
    const last = phase.zones[phase.zones.length - 1];
    if (last) {
      const anchor = Px(last.x) > MAP.w * 0.72 ? "end" : "start";
      const dx = anchor === "end" ? -6 : 6;
      SvgEl("text", {
        class: "mnMapZoneLabel", x: Px(last.x) + dx, y: Pz(last.z) - 5, "text-anchor": anchor,
      }, g).textContent = last.name;
    }
  }

  SvgEl("text", { class: "mnMapNorth", x: MAP.w - 16, y: 16 }, g).textContent = "北 ↑";
  return svg;
}

// ---------------------------------------------------------------------------
// 主菜单
// ---------------------------------------------------------------------------
export class MainMenu {
  /**
   * @param {object} host
   *   root         DOM 容器（#menu）
   *   camera       THREE.PerspectiveCamera —— 只在 title 态被接管，暂停态不碰
   *   phases       Data_Battle.PHASES
   *   sandboxes    可选：选章末尾的沙盒条目数组（靶场 / 白刃 QTE 测试章）
   *   sandboxMode  false | "range" | "melee"
   *   Play(i, o)   进某一关（装配层负责建切片、播过场、进游戏）
   *   PlaySandbox() / ExitSandbox()  进／出靶场（都要重载页面，见 Play()）
   *   Resume()     暂停态的「继续」
   *   Settings()   暂停态的「设置」
   *   DebugOptions() / SetDebugOption(id, on) 调试选项的读取与写入
   *   SliceIndex() 当前建好的是哪一关的切片
   *   Unlock()     第一次用户手势时解锁音频（可选）
   *   GroundHeight(x, z) 可选：把机位抬到地面之上，免得穿地
   */
  constructor(host) {
    this.host = host;
    this.root = host.root;
    this.camera = host.camera;
    this.phases = host.phases || [];
    /**
     * 选章末尾那一条**沙盒条目**（玩法测试靶场，`Data_Range.RANGE_PHASE`）。
     * 它与七关并排摆在同一张列表上，但**不进 `this.phases`** —— 进度、「继续」、
     * 「下一关」标记与 `DefaultLevel()` 一概只按正片七关数，与 Script_Main
     * 那边「靶场不进 PHASES」的口径是同一条（见 docs/Data_TestRange.md）。
     */
    this.sandboxes = Array.isArray(host.sandboxes)
      ? host.sandboxes.filter(Boolean) : (host.sandbox ? [host.sandbox] : []);
    /** 列表上真正排出来的条目 = 七关 + 全部沙盒条目。键盘上下也按它走。 */
    this.entries = [...this.phases, ...this.sandboxes];
    /** 现在这一局本身就跑在沙盒里（?range=1）：暂停菜单换成「退出靶场」那一套。 */
    this.sandboxMode = host.sandboxMode || false;

    this.open = false;
    /** live = 开机菜单（接管相机、跑运镜）；暂停态是 false（世界冻在原地）。 */
    this.live = false;
    this.mode = "title";           // title | levels | codex | credits | debug | pause
    this.busy = false;
    this.time = 0;
    this.shotTime = 0;
    this.shotIndex = 0;
    this.shots = [];
    this.shotSliceId = null;
    this.selected = 0;             // 选章里选中的关号
    this.itemIndex = 0;            // 主列表里高亮第几项
    this.panelReturnMode = "title";
    this.target = new THREE.Vector3();

    this.el = {};
    this.Build();
    // 建完先藏起来。以前构造完必定紧跟一次 Open()，所以这一行不写也看不出来；
    // 靶场里菜单只当暂停层用（开机不 Open），不藏就是一屏标题盖在场地上。
    this.root.classList.add("off");
    this.BindInput();
  }

  // -------------------------------------------------------------------------
  // DOM
  // -------------------------------------------------------------------------
  Build() {
    const mk = (cls, parent = this.root, tag = "div") => {
      const e = document.createElement(tag);
      e.className = cls;
      parent.appendChild(e);
      return e;
    };
    this.root.classList.add("mnRoot", "off");

    this.el.vignette = mk("mnVignette");
    this.el.fade = mk("mnFade");

    const title = mk("mnTitle");
    this.el.titleMain = mk("mnTitleMain", title);
    this.el.titleMain.textContent = MENU.title;
    this.el.titleSub = mk("mnTitleSub", title);
    this.el.titleSub.textContent = MENU.subtitle;
    this.el.titleLines = mk("mnTitleLines", title);
    for (const line of MENU.lines) mk("mnTitleLine", this.el.titleLines).textContent = line;

    // --- 主列表 -----------------------------------------------------------
    this.el.list = mk("mnList", this.root, "nav");
    this.el.itemHint = document.createElement("div");
    this.el.itemHint.className = "mnItemHint";
    this.items = [];
    this.itemEls = [];
    this.SetItems(this.TitleItems());

    this.el.shotNote = mk("mnShotNote");
    this.el.foot = mk("mnFoot");
    this.el.foot.textContent = "↑↓ 选择 · Enter 确定 · Esc 返回";

    // --- 面板（选章 / 史实注记 / 关于）-------------------------------------
    this.el.panel = mk("mnPanel");
    const head = mk("mnPanelHead", this.el.panel);
    this.el.panelTitle = mk("mnPanelTitle", head);
    this.el.panelBack = mk("mnBack", head, "button");
    this.el.panelBack.textContent = "返回";
    this.el.panelBack.addEventListener("click", () => this.Show(this.panelReturnMode));
    this.el.panelBody = mk("mnPanelBody", this.el.panel);

    this.BuildLevels();
    this.el.text = document.createElement("div");
    this.el.text.className = "mnText";
  }

  /** 主列表。战役文案在 Data_TengxianScript.MENU 里，调试项只在这一层额外出现。 */
  TitleItems() {
    const progress = Progress.Read();
    const resume = progress.furthest > 0 && progress.furthest < this.phases.length;
    const label = resume ? `继续 · ${this.phases[progress.furthest].label}` : MENU.start;
    return [
      { id: "start", label,
        hint: resume ? "从上次通过的下一关接着打" : "从序 · 界河开始，先播「出川」那一场过场" },
      { id: "levels", label: MENU.chapters, hint: "七关任选一关直接进（不播过场）" },
      { id: "codex", label: MENU.codex, hint: "哪些数是史料、哪些是推定" },
      { id: "credits", label: MENU.credits, hint: "史料口径与虚构人物的交代" },
      { id: "settings", label: "设置", hint: "操作、画面与声音" },
      { id: "debug", label: "调试选项", hint: "碰撞、移动、伤害与补给的测试开关" },
    ];
  }

  /**
   * 暂停态：继续、设置与退出路径都留在同一层。
   *
   * 靶场里**不给「选章」与「主菜单」**：靶场是整表替换（PHASE_TABLE 只有它一关），
   * 换关与回主菜单都必须重载页面，摆一颗当场换不了关的按钮只会骗人。
   * 那两条合成一条「退出靶场」——重载回正片，落在主菜单上。
   */
  PauseItems() {
    if (this.sandboxMode) {
      return [
        { id: "resume", label: "继续", hint: "回到靶场" },
        { id: "settings", label: "设置", hint: "操作、画面与声音" },
        { id: "debug", label: "调试选项", hint: "碰撞、移动、伤害与补给的测试开关" },
        { id: "exitSandbox", label: "退出靶场", hint: "重载回正片，回到主菜单" },
      ];
    }
    return [
      { id: "resume", label: "继续", hint: "回到这一关" },
      { id: "settings", label: "设置", hint: "操作、画面与声音" },
      { id: "debug", label: "调试选项", hint: "碰撞、移动、伤害与补给的测试开关" },
      { id: "levels", label: MENU.chapters, hint: "换一关打（这一局的进度会丢）" },
      { id: "title", label: "主菜单", hint: "放弃这一局，回到主菜单" },
    ];
  }

  SetItems(items) {
    this.el.list.textContent = "";
    this.items = items;
    this.itemEls = items.map((item, i) => {
      const b = document.createElement("button");
      b.className = "mnItem";
      b.dataset.act = item.id;
      const bar = document.createElement("span");
      bar.className = "mnItemBar";
      const label = document.createElement("span");
      label.className = "mnItemLabel";
      label.textContent = item.label;
      b.appendChild(bar);
      b.appendChild(label);
      b.addEventListener("mouseenter", () => this.Highlight(i));
      b.addEventListener("click", () => { this.Highlight(i); this.Activate(item.id); });
      this.el.list.appendChild(b);
      return b;
    });
    this.el.list.appendChild(this.el.itemHint);
    this.Highlight(0);
  }

  Highlight(i) {
    this.itemIndex = Clamp(i, 0, this.items.length - 1);
    this.itemEls.forEach((el, k) => el.classList.toggle("on", k === this.itemIndex));
    this.el.itemHint.textContent = this.items[this.itemIndex]?.hint || "";
  }

  /** 选章面板：左边七关，右边简报 + 全图。 */
  BuildLevels() {
    const wrap = document.createElement("div");
    wrap.className = "mnLevels";
    this.el.levelList = document.createElement("div");
    this.el.levelList.className = "mnLevelList";
    this.el.brief = document.createElement("div");
    this.el.brief.className = "mnBrief";
    wrap.appendChild(this.el.levelList);
    wrap.appendChild(this.el.brief);
    this.el.levelsWrap = wrap;

    // 这是临时审片入口，不混进 PHASES／存档／默认继续关；等《断线》接完再把它
    // 变成正式第一关。放在选章最上面，让玩家无需记 query 参数也能选到新版序章。
    const prologue = document.createElement("button");
    prologue.className = "mnLevel mnProloguePreview";
    const prologueSpan = (cls, text) => {
      const s = document.createElement("span");
      s.className = cls;
      s.textContent = text;
      prologue.appendChild(s);
    };
    prologueSpan("mnLvNo", "序");
    prologueSpan("mnLvName", "出川 · 车厢序章");
    prologueSpan("mnLvDate", "临时入口 · 约 2 分钟");
    prologueSpan("mnLvMark", "预览");
    prologue.addEventListener("click", () => this.host.PlayPrologue?.());
    this.el.levelList.appendChild(prologue);

    this.levelEls = this.entries.map((phase, i) => {
      const b = document.createElement("button");
      b.className = phase.sandbox ? "mnLevel mnSandboxLevel" : "mnLevel";
      b.dataset.i = String(i);
      // 关号取标题里的那个序数字（「二 · 东关」-> 「二」），名字取后半。
      // 沙盒条目的 label 里没有「·」，硬拆会把整个标题塞进 34 px 的关号列。
      const [no, ...rest] = phase.sandbox
        ? [phase.sandboxGlyph || "靶", phase.label] : phase.label.split("·");
      const mkSpan = (cls, text) => {
        const s = document.createElement("span");
        s.className = cls;
        s.textContent = text;
        b.appendChild(s);
        return s;
      };
      mkSpan("mnLvNo", no.trim());
      mkSpan("mnLvName", (rest.join("·") || phase.label).trim());
      // 副行给日期；沙盒没有日期（它的 date 是「测试靶场」，跟名字重了），给 place
      mkSpan("mnLvDate", phase.sandbox ? phase.place : phase.date);
      mkSpan("mnLvMark", "");
      b.addEventListener("mouseenter", () => this.SelectLevel(i));
      b.addEventListener("click", () => { this.SelectLevel(i); this.Play(i); });
      this.el.levelList.appendChild(b);
      return b;
    });
  }

  // -------------------------------------------------------------------------
  // 状态切换
  // -------------------------------------------------------------------------
  /** 开机进菜单：接管相机，跑运镜。 */
  Open() {
    this.open = true;
    this.live = true;
    this.time = 0;
    this.SetItems(this.TitleItems());
    this.PickShots(true);
    this.Show("title");
    this.root.classList.remove("off", "pause");
  }

  /** 游戏中按 Esc：只挂一层暂停，**不碰相机**（世界冻在原地就是暂停该有的样子）。 */
  OpenPause() {
    this.open = true;
    this.live = false;
    this.mode = "pause";
    this.SetItems(this.PauseItems());
    this.Show("pause");
    this.root.classList.remove("off");
    this.root.classList.add("pause");
  }

  Close() {
    this.open = false;
    this.live = false;
    this.root.classList.add("off");
    this.root.classList.remove("pause", "panelOn");
    this.el.panel.classList.remove("on");
    this.el.fade.style.opacity = "0";
  }

  /** 从暂停回到主菜单：这时候才接管相机并起运镜。 */
  ToTitle() {
    this.live = true;
    this.SetItems(this.TitleItems());
    this.PickShots(true);
    this.Show("title");
    this.root.classList.remove("pause");
  }

  Show(mode) {
    const wasMode = this.mode;
    this.mode = mode;
    const panel = mode === "levels" || mode === "codex" || mode === "credits" || mode === "debug";
    if (panel) this.panelReturnMode = wasMode === "pause" ? "pause" : "title";
    this.root.classList.toggle("panelOn", panel);
    this.el.panel.classList.toggle("on", panel);
    if (mode === "levels") {
      this.el.panelTitle.textContent = MENU.chapters;
      this.el.panelBody.textContent = "";
      this.el.panelBody.appendChild(this.el.levelsWrap);
      this.SelectLevel(this.DefaultLevel());
    } else if (mode === "codex") {
      this.el.panelTitle.textContent = MENU.codex;
      this.el.panelBody.textContent = "";
      this.el.text.innerHTML = this.CodexHtml();
      this.el.panelBody.appendChild(this.el.text);
    } else if (mode === "credits") {
      this.el.panelTitle.textContent = MENU.credits;
      this.el.panelBody.textContent = "";
      this.el.text.innerHTML = CREDITS
        .map((line) => (line ? `<p>${line}</p>` : `<p class="mnGap"></p>`)).join("");
      this.el.panelBody.appendChild(this.el.text);
    } else if (mode === "debug") {
      this.el.panelTitle.textContent = "调试选项";
      this.BuildDebugOptions();
    }
  }

  /** 选章默认落在「继续」那一关上。 */
  DefaultLevel() {
    const progress = Progress.Read();
    return Clamp(progress.furthest, 0, this.phases.length - 1);
  }

  /**
   * 史实注记：把两张推定值登记表原样摆出来。
   * 这一页存在的理由不是「补充说明」，是史实纪律的对外那一半 ——
   * 凡登记在表上的数，游戏里任何地方都不许说成史实（见 Data_Tengxian.PRESUMED）。
   */
  CodexHtml() {
    const rows = (list) => list.map((p) => {
      const value = Array.isArray(p.value) ? p.value.join(" / ") : String(p.value);
      const unit = p.unit ? ` ${p.unit}` : "";
      return `<div class="mnCodexRow"><div class="mnCodexId">${p.id}</div>`
        + `<div class="mnCodexVal">${value}${unit}</div>`
        + `<div class="mnCodexNote">${p.note}</div></div>`;
    }).join("");
    return "<p>这一作把史料与推定分开记账。下面两张表里的数<b>全部是推定</b>，"
      + "游戏内任何文本都不许把它们说成史实；找到实测数据就改表，并把该条删掉。</p>"
      + `<h4>城的几何 · Data_Tengxian.PRESUMED</h4>${rows(PRESUMED)}`
      + `<h4>演出与关卡 · Data_TengxianScript.PRESUMED_STAGING</h4>${rows(PRESUMED_STAGING)}`;
  }

  /** 每次打开时从 host 重建，切换之后的 on/off 绝不留在过期 DOM 快照里。 */
  BuildDebugOptions() {
    const values = this.host.DebugOptions?.() || {};
    const wrap = document.createElement("div");
    wrap.className = "mnDebug";
    const intro = document.createElement("p");
    intro.className = "mnDebugIntro";
    intro.textContent = "这些开关只用于测试，可在主菜单或暂停菜单中随时调整。";
    wrap.appendChild(intro);
    for (const item of DEBUG_ITEMS) {
      const row = document.createElement("label");
      row.className = "mnDebugRow";
      row.dataset.option = item.id;
      const copy = document.createElement("span");
      copy.className = "mnDebugCopy";
      const name = document.createElement("b");
      name.textContent = item.label;
      const note = document.createElement("small");
      note.textContent = item.note;
      copy.append(name, note);
      const control = document.createElement("span");
      control.className = "mnDebugControl";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = values[item.id] === true;
      input.setAttribute("aria-label", item.label);
      const state = document.createElement("i");
      state.textContent = input.checked ? "开" : "关";
      input.addEventListener("change", () => {
        const next = this.host.SetDebugOption?.(item.id, input.checked) || {};
        input.checked = next[item.id] === true;
        state.textContent = input.checked ? "开" : "关";
        row.classList.toggle("on", input.checked);
      });
      control.append(input, state);
      row.append(copy, control);
      row.classList.toggle("on", input.checked);
      wrap.appendChild(row);
    }
    this.el.panelBody.textContent = "";
    this.el.panelBody.appendChild(wrap);
  }

  SelectLevel(i) {
    this.selected = Clamp(i, 0, this.entries.length - 1);
    const progress = Progress.Read();
    this.levelEls.forEach((el, k) => {
      el.classList.toggle("on", k === this.selected);
      const mark = el.querySelector(".mnLvMark");
      if (this.entries[k].sandbox) { mark.textContent = "沙盒"; mark.className = "mnLvMark"; return; }
      const done = progress.cleared.includes(this.entries[k].id);
      mark.textContent = done ? "已通过" : (k === progress.furthest ? "下一关" : "");
      mark.className = `mnLvMark${done ? " done" : ""}`;
    });

    const phase = this.entries[this.selected];
    const brief = this.el.brief;
    brief.textContent = "";
    const mk = (cls, tag = "div") => {
      const e = document.createElement(tag);
      e.className = cls;
      brief.appendChild(e);
      return e;
    };
    mk("mnBriefTitle").textContent = phase.label;
    mk("mnBriefPlace").textContent = phase.place;
    if (!phase.sandbox) mk("mnBriefDate").textContent = phase.date;   // 沙盒没有史实日期
    const meta = mk("mnBriefMeta");
    // 沙盒没有时限也没有兵员池（都是 9999 的占位数），拿工位数与携行说事才有信息。
    const metaTexts = phase.sandbox
      ? ["不计时 · 不计进度", `工位 ${phase.zones.length}`, "木桩兵自动复位"]
      : [`约 ${phase.minutes} 分钟`,
        `城里还站着的人 ${phase.nraPool}`, `路标 ${phase.zones.length}`];
    for (const text of metaTexts) {
      const s = document.createElement("span");
      s.textContent = text;
      meta.appendChild(s);
    }
    // 那张全图画的是滕县城（框写死在 MAP 里）；靶场在 (1400, 1400)，落在框外，
    // 画出来是一张空图外加一个贴边的切片框 —— 沙盒条目干脆不给图。
    if (!phase.sandbox) brief.appendChild(BuildMap(phase));
    const lines = mk("mnBriefLines");
    for (const line of phase.brief || []) {
      const p = document.createElement("p");
      p.textContent = line;
      lines.appendChild(p);
    }
    mk("mnBriefHead").textContent = "这一关要做的";
    const list = mk("mnObjectives", "ol");
    for (const o of phase.objectives || []) {
      const li = document.createElement("li");
      li.textContent = o;
      list.appendChild(li);
    }
    if (phase.mechanic) {
      mk("mnBriefHead").textContent = "本关机制";
      mk("mnMechanic").textContent = phase.mechanic;
    }
    // 靶场的携行是写死的（loadoutOverride），是真人进去最先要知道的一条。
    if (phase.sandbox && phase.loadoutOverride?.note) {
      mk("mnBriefHead").textContent = "携行";
      mk("mnMechanic").textContent = phase.loadoutOverride.note;
    }
    const go = mk("mnGo", "button");
    go.textContent = `进入 · ${phase.label}`;
    go.addEventListener("click", () => this.Play(this.selected));
  }

  // -------------------------------------------------------------------------
  // 动作
  // -------------------------------------------------------------------------
  Activate(id) {
    switch (id) {
      case "start": {
        const progress = Progress.Read();
        const index = Clamp(progress.furthest, 0, this.phases.length - 1);
        // 战役入口播关前过场（Esc 可跳）；选章那条直接进，见 Play()
        this.Play(index, { cutscenes: true });
        return;
      }
      case "levels": this.Show("levels"); return;
      case "codex": this.Show("codex"); return;
      case "credits": this.Show("credits"); return;
      case "debug": this.Show("debug"); return;
      case "resume": this.host.Resume?.(); return;
      case "settings": this.host.Settings?.(); return;
      case "exitSandbox": this.host.ExitSandbox?.(); return;
      case "title": this.ToTitle(); return;
      default: break;
    }
  }

  /**
   * 进一关。**选章默认不播过场**：那条是「挑一关来打」的入口，
   * 每次都先看三十八秒的出川会把它变成看片入口。战役入口才播（Activate）。
   *
   * 沙盒条目走另一条路：靶场是**整表替换**（PHASE_TABLE 只剩它一关），
   * 当场换不过去，只能重载页面 —— 交给 host.PlaySandbox。
   */
  Play(index, opts = {}) {
    if (this.busy) return;
    if (this.entries[index]?.sandbox) {
      this.host.PlaySandbox?.(this.entries[index].sandboxKey || "range");
      return;
    }
    // 已经在靶场里了：正片那七关同样换不过去，先退回正片再说。
    if (this.sandboxMode) { this.host.ExitSandbox?.(); return; }
    this.busy = true;
    this.host.Unlock?.();
    Promise.resolve(this.host.Play(index, { cutscenes: false, ...opts }))
      .catch((error) => { console.error("[Menu] 进关失败", error); })
      .finally(() => { this.busy = false; });
  }

  // -------------------------------------------------------------------------
  // 键盘
  // -------------------------------------------------------------------------
  BindInput() {
    this.onKey = (event) => {
      if (!this.open) return;
      const panel = this.root.classList.contains("panelOn");
      switch (event.key) {
        case "Escape":
          if (panel) { this.Show(this.panelReturnMode); event.preventDefault(); }
          else if (this.mode === "pause") { this.host.Resume?.(); event.preventDefault(); }
          return;
        case "ArrowDown": case "ArrowUp": {
          const delta = event.key === "ArrowDown" ? 1 : -1;
          if (panel && this.mode === "levels") this.SelectLevel(this.selected + delta);
          else if (!panel) this.Highlight(this.itemIndex + delta);
          event.preventDefault();
          return;
        }
        case "Enter": case " ":
          if (panel && this.mode === "levels") this.Play(this.selected);
          else if (!panel) this.Activate(this.items[this.itemIndex]?.id);
          event.preventDefault();
          return;
        default: break;
      }
    };
    // 第一次点击解锁音频：没有用户手势时 AudioContext 是 suspended 的
    this.onClick = () => { if (this.open) this.host.Unlock?.(); };
    document.addEventListener("keydown", this.onKey);
    this.root.addEventListener("pointerdown", this.onClick);
  }

  // -------------------------------------------------------------------------
  // 运镜
  // -------------------------------------------------------------------------
  /** 按当前建好的切片取机位表。切片换了就重取（回主菜单时会用到）。 */
  PickShots(reset = false) {
    const index = this.host.SliceIndex?.() ?? 0;
    const phase = this.phases[index];
    if (!phase) return;
    if (!reset && this.shotSliceId === phase.id) return;
    this.shotSliceId = phase.id;
    this.shots = ShotsFor(phase.id, phase.zones[0]);
    this.shotIndex = 0;
    this.shotTime = 0;
    this.ApplyShot(0);
    this.Crowd();
  }

  /**
   * 通知装配层「这一机位的人该摆在哪儿」——只交出**机位与被摄物**，
   * 具体落点由装配层去找（它手上才有碰撞盒与射线，见 Script_Main.PlaceMenuGarrison）。
   *
   * 第一版是在连线四成处直接撒人，实拍翻车：东门那一机位的四成处正落在
   * 关厢院落的迷宫里，五个人全站在院墙背后 —— 画面上一个人都没有。
   * 「在画面里」这件事光靠算比例是保证不了的，必须真打一条射线问「看得见吗」。
   *
   * **换机位时才调一次**，而且正好被黑场盖住 —— 人是被瞬移过去的，不是走过去的。
   */
  Crowd() {
    if (!this.host.Crowd) return;
    const shot = this.shots[this.shotIndex];
    if (!shot || shot.crowd === false || !MENU_SCENE.garrison) { this.host.Crowd(null); return; }
    const from = shot.from;
    const look = shot.look || from;
    this.host.Crowd({
      from: [from[0], from[1], from[2]],
      look: [look[0], look[1], look[2]],
      near: MENU_SCENE.garrisonAt[0],
      far: MENU_SCENE.garrisonAt[1],
      spread: MENU_SCENE.garrisonSpread,
      count: MENU_SCENE.garrison,
    });
  }

  /**
   * 每帧。**只在 live（开机菜单）时动相机** —— 暂停态动相机等于把玩家的
   * 视角抢走，回到游戏时他会发现自己看着别处。
   */
  Update(dt) {
    if (!this.open || !this.live || !this.shots.length) return;
    this.time += dt;
    this.shotTime += dt;
    const hold = MENU_SCENE.holdSeconds;
    const fade = MENU_SCENE.fadeSeconds;
    if (this.shotTime >= hold) {
      this.shotTime -= hold;
      this.shotIndex = (this.shotIndex + 1) % this.shots.length;
      this.Crowd();               // 换人位这一下正好被黑场盖住
    }
    // 黑场：切点前半程压下去、切完后半程提起来
    const toCut = hold - this.shotTime;
    let alpha = 0;
    if (toCut < fade / 2) alpha = 1 - toCut / (fade / 2);
    else if (this.shotTime < fade / 2) alpha = 1 - this.shotTime / (fade / 2);
    this.el.fade.style.opacity = alpha.toFixed(3);
    this.ApplyShot(this.shotTime / hold);
  }

  ApplyShot(k) {
    const shot = this.shots[this.shotIndex];
    if (!shot || !this.camera) return;
    const e = EaseInOutSine(k);
    const from = shot.from;
    const to = shot.to || shot.from;
    const look = shot.look || [from[0], from[1], from[2] - 1];
    const lookTo = shot.lookTo || look;

    const x = Lerp(from[0], to[0], e);
    const z = Lerp(from[2], to[2], e);
    let y = Lerp(from[1], to[1], e);
    // 机位不许穿地：地形是程序化的，坐标表里写死的高度有可能被土坎顶掉
    const ground = this.host.GroundHeight?.(x, z);
    if (Number.isFinite(ground)) y = Math.max(y, ground + 1.6);
    this.camera.position.set(x, y, z);
    this.target.set(
      Lerp(look[0], lookTo[0], e),
      Lerp(look[1], lookTo[1], e),
      Lerp(look[2], lookTo[2], e),
    );
    this.camera.fov = FovFromFocalMm(shot.focalMm ?? 35);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.target);

    // 手持漂移。**不许 Math.random**：同一时刻永远同一个值，出图才可复现
    const amount = MENU_SCENE.drift;
    if (amount > 0) {
      const t = this.time * 0.34;
      const n = (u, v) => ValueNoise2(t * u, v, 1938) - 0.5;
      this.camera.rotateX(n(1.0, 3.1) * 0.012 * amount);
      this.camera.rotateY(n(0.83, 11.7) * 0.014 * amount);
      this.camera.rotateZ(n(0.61, 23.5) * 0.010 * amount);
    }

    // 角上那行小字只报地名（ER2 报的是地图名）。note 是写给改坐标的人看的，不上屏。
    if (this.el.shotNote) {
      const phase = this.phases[this.host.SliceIndex?.() ?? 0];
      this.el.shotNote.textContent = phase
        ? `${phase.label}　${shot.title || shot.id}` : (shot.title || "");
    }
  }

  Dispose() {
    document.removeEventListener("keydown", this.onKey);
    this.root.removeEventListener("pointerdown", this.onClick);
    this.root.textContent = "";
  }
}

export default MainMenu;
