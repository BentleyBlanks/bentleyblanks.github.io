// 《滕县 一九三八》主菜单与选章 —— DOM/CSS + 一台相机导演。
//
// 分工：这一份**只管菜单自己**（画面上的字、机位的运镜、选章的线性任务列表），
// 一切「真的去做点什么」都通过 host 回调交回装配层（Script_Main）：
//   host.Play(index, opts)   进某一章
//   host.PlaySandbox()       进「测试场景」组里的沙盒（玩法测试靶场，重载页面）
//   host.ExitSandbox()       从靶场退回正片
//   host.Resume()            从暂停回到游戏
//   host.SliceIndex()        现在建好的是哪一章的切片（决定用哪一组机位）
//   host.Unlock()            第一次点击时解锁音频（浏览器要用户手势）
// 这条界线是刻意的：菜单不许自己 import 战场、AI、玩家 —— 那三个模块换一遍，
// 菜单不该跟着改一行。
//
// 对标 Easy Red 2 的三条（见 Data_Menu.mjs 头注）：活场景、运镜、定时切机位。
// 主菜单、暂停、选章与工具统一使用 World at War 的无衬线文字、冷灰与旧金选择条。

import * as THREE from "three";
import { FovFromFocalMm } from "./Script_Cutscene.mjs";
import { ValueNoise2, Clamp, Clamp01 } from "./Script_Noise.mjs";
import { MENU, CREDITS, PRESUMED_STAGING } from "./Data_TengxianScript.mjs";
import { MENU_SCENE, ShotsFor } from "./Data_Menu.mjs";
import { PRESUMED } from "./Data_Tengxian.mjs";

/**
 * 沙盒模式（`host.sandboxMode`）→ 暂停菜单里的两句话。
 * key 与 Script_Main 的 `?range=1 / ?melee=1 / ?jiehe=1` 一一对应。
 */
const SANDBOX_NAMES = {
  explosions: { where: "爆炸测试场", exit: "退出爆炸测试场" },
  weapons: { where: "枪械射击白盒", exit: "退出枪械靶场" },
  range: { where: "靶场", exit: "退出靶场" },
  melee: { where: "白刃测试场", exit: "退出白刃测试场" },
  firstLevelP012Whitebox: { where: "第一关 P0/P1/P2 场景白盒", exit: "退出 P0/P1/P2 白盒" },
  jiehe: { where: "界河白盒", exit: "退出界河白盒" },
};

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
// v2：2026-08-28 任务流程重制换了全部章节 id（L0_Jiehe… → CH0_Chuchuan…）。
// 沿用 v1 的话，老存档里那串 cleared 一个都对不上、furthest 却还是旧的关号 ——
// 表现成「选章里一关没通过，第一项却写着继续 · 第五关」。换键即弃旧档。
const STORE_KEY = "tengxian1938_progress_v2";

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
// 选章：World at War（2008）的纵向文字列表 + 右侧任务预览
// ---------------------------------------------------------------------------
function MissionName(label = "") {
  const parts = label.split("·");
  return (parts.length > 1 ? parts.slice(1).join("·") : label).trim();
}

// 七章任务图由菜单独占，不进入战斗数据。文件顺序与 PHASES 的线性章节顺序一致；
// 一章一图，右侧横向预览使用已有原创图片，不嵌入外部游戏截图。
const MISSION_ART = [
  "./Texture/Menu/Texture_MissionCh0Chuchuan.png",
  "./Texture/Menu/Texture_MissionCh1NanLu.png",
  "./Texture/Menu/Texture_MissionCh2Shouliudan.png",
  "./Texture/Menu/Texture_MissionCh3Jiuhusuo.png",
  "./Texture/Menu/Texture_MissionCh4DongguanYe.png",
  "./Texture/Menu/Texture_MissionCh5Chengqiang.png",
  "./Texture/Menu/Texture_MissionCh6Zuihou.png",
];

// 菜单只声明文案与布局；开关值及实际效果由装配层交回的 host 管，避免菜单
// 偷偷持有玩家、物理世界或弹药账本。
const DEBUG_ITEMS = [
  { id: "noCollision", label: "无碰撞", note: "穿过人物、墙体与掩体；地形与关卡边界仍然生效" },
  { id: "fastMove", label: "快速移动", note: "步行、冲刺与匍匐移动速度提高至三倍" },
  { id: "invincible", label: "无敌模式", note: "免疫子弹、爆炸与流血伤害" },
  { id: "infiniteAmmo", label: "无限子弹", note: "已持有枪械无需装填，空弹仓会自动补满" },
  { id: "infiniteGrenades", label: "无限手榴弹", note: "普通手榴弹不会消耗；开启时会补给一枚" },
];

export class MainMenu {
  /**
   * @param {object} host
   *   root         DOM 容器（#menu）
   *   camera       THREE.PerspectiveCamera —— 只在 title 态被接管，暂停态不碰
   *   phases       Data_Battle.PHASES
   *   sandboxes    可选：选章末尾的沙盒条目数组（靶场 / 白刃 QTE / 关卡白盒）
   *   sandboxMode  false | "range" | "melee" | "firstLevelP012Whitebox"
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
     * 选章末尾的**沙盒条目**（核心玩法靶场与 P0/P1/P2 白盒）。
     * 它与七关并排摆在同一张列表上，但**不进 `this.phases`** —— 进度、「继续」、
     * 「下一关」标记与 `DefaultLevel()` 一概只按正片七关数，与 Script_Main
     * 那边「靶场不进 PHASES」的口径是同一条（见 docs/Data_TestRange.md）。
     */
    this.sandboxes = Array.isArray(host.sandboxes)
      ? host.sandboxes.filter(Boolean) : (host.sandbox ? [host.sandbox] : []);
    /**
     * 列表上真正排出来的条目 = 七章 + 测试沙盒。键盘上下也按它走。
     * **顺序就是分组顺序**：正式章节在前，测试场景在后（docs/Data_MissionRemake.md §9）。
     */
    this.entries = [...this.phases, ...this.sandboxes];
    /**
     * 正式章节数。进度、「继续」、「下一关」标记与 DefaultLevel() 只按这几章算；
     * 后面带 `deprecated` 的那几章是「暂时废弃场景」（2026-09-06 起第一关到终章），
     * 列在选章里、标「未完成」、点得进去，但不算正片。
     */
    const firstDeprecated = this.phases.findIndex((p) => p.deprecated);
    this.officialCount = Math.max(1, firstDeprecated < 0 ? this.phases.length : firstDeprecated);
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
    const foot = mk("mnPanelFoot mnCampaignFoot", this.el.panel);
    this.el.panelBack = mk("mnBack", foot, "button");
    this.el.panelBack.textContent = "返回";
    mk("mnCampaignKeys", foot).textContent = "Esc 返回";
    this.el.panelBack.addEventListener("click", () => this.Show(this.panelReturnMode));
    this.el.panelBody = mk("mnPanelBody", this.el.panel);
    this.el.panel.appendChild(foot);

    this.BuildLevels();
    this.el.text = document.createElement("div");
    this.el.text.className = "mnText";
  }

  /** 主列表。战役文案在 Data_TengxianScript.MENU 里，调试项只在这一层额外出现。 */
  TitleItems() {
    const progress = Progress.Read();
    const resume = progress.furthest > 0 && progress.furthest < this.officialCount;
    const label = resume ? `继续 · ${this.phases[progress.furthest].label}` : MENU.start;
    return [
      { id: "start", label,
        hint: resume ? "从上次通过的下一章接着打" : "从序章 · 出川开始，先播车厢那一场过场" },
      { id: "levels", label: MENU.chapters, hint: "正式章节、暂时废弃场景与测试场景三组，任选一条直接进（不播过场）" },
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
      // 各片沙盒报自己的名字：通过直达 query 进入界河白盒时按 Esc 不能显示「退出靶场」，
      // 会让人以为自己进错了地方。
      const here = SANDBOX_NAMES[this.sandboxMode] || SANDBOX_NAMES.range;
      return [
        { id: "resume", label: "继续", hint: `回到${here.where}` },
        { id: "settings", label: "设置", hint: "操作、画面与声音" },
        { id: "debug", label: "调试选项", hint: "碰撞、移动、伤害与补给的测试开关" },
        { id: "exitSandbox", label: here.exit, hint: "重载回正片，回到主菜单" },
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
      b.addEventListener("focus", () => this.Highlight(i));
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

  /**
   * 选章面板：World at War 纵向任务列表 + 横向任务图与简报。
   *
   * **两组是规格要求**（docs/Data_MissionRemake.md §9）：
   *   正式章节 —— 七章按序，带「已通过 / 下一关」标记，进度只按这七条算；
   *   测试场景 —— 列玩法测试靶场、白刃 QTE 与第一关策划白盒。
   * 混在一张平铺列表里的后果不是难看：玩家分不清「哪些是正片」，
   * 而旧过场已经从正片流程脱钩了，摆在章节中间等于谎报流程。
   */
  BuildLevels() {
    const Make = (cls, parent, tag = "div", text = "") => {
      const el = document.createElement(tag);
      el.className = cls;
      el.textContent = text;
      parent?.appendChild(el);
      return el;
    };
    const wrap = Make("mnLevels");
    this.el.campaignMain = Make("mnCampaignMain", wrap);
    this.el.levelList = Make("mnLevelList", this.el.campaignMain, "nav");
    this.el.levelList.setAttribute("aria-label", "章节与测试场景");
    this.el.brief = Make("mnBrief", this.el.campaignMain, "section");
    this.el.brief.setAttribute("aria-label", "所选任务简报");
    const footer = Make("mnCampaignFoot", wrap);
    const back = Make("mnCampaignBack", footer, "button", "返回");
    back.type = "button";
    back.addEventListener("click", () => this.Show(this.panelReturnMode));
    Make("mnCampaignKeys", footer, "span", "↑↓ 选择  /  Enter 进入  /  Esc 返回");
    this.el.levelsWrap = wrap;
    const Group = (title, note, cls) => {
      const head = Make("mnLevelGroup", this.el.levelList);
      Make("", head, "b", title);
      Make("", head, "small", note);
      return Make(cls, this.el.levelList);
    };
    this.levelEls = [];
    const Row = (entry, i, track) => {
      const b = Make("mnLevel", track, "button");
      b.type = "button";
      b.dataset.i = String(i);
      b.setAttribute("aria-label", entry.label);
      if (entry.sandbox) b.classList.add("mnSandboxLevel");
      if (entry.deprecated) b.classList.add("mnDeprecatedLevel");
      const number = entry.sandbox ? (entry.glyph || entry.sandboxGlyph || "靶")
        : entry.label.split("·")[0].trim();
      Make("mnLvNo", b, "span", number);
      Make("mnLvName", b, "span", entry.sandbox ? entry.label : MissionName(entry.label));
      Make("mnLvMark", b, "span");
      b.addEventListener("pointerenter", (event) => {
        if (event.pointerType === "mouse") this.SelectLevel(i);
      });
      b.addEventListener("focus", () => this.SelectLevel(i));
      b.addEventListener("click", () => { this.SelectLevel(i); this.Play(i); });
      this.levelEls[i] = b;
    };
    const official = Group("正式章节", "滕县保卫战", "mnMissionTrack");
    this.phases.forEach((phase, i) => { if (!phase.deprecated) Row(phase, i, official); });
    // 暂时废弃场景：第一关到终章的切片还建得出来、点得进去，但没有任务内容，
    // 也不算正片进度。单独一组，别混进正式章节谎报流程。
    if (this.phases.some((phase) => phase.deprecated)) {
      const shelved = Group("暂时废弃场景", "只建场景 · 未完成", "mnDeprecatedTrack");
      this.phases.forEach((phase, i) => { if (phase.deprecated) Row(phase, i, shelved); });
    }
    if (this.sandboxes.length) {
      const sandbox = Group("测试场景", "独立测试", "mnSandboxTrack");
      this.sandboxes.forEach((entry, i) => Row(entry, this.phases.length + i, sandbox));
    }
  }

  // -------------------------------------------------------------------------
  // 状态切换
  // -------------------------------------------------------------------------
  /** 开机进菜单：接管相机，跑运镜。 */
  Open() {
    this.ClearSandboxComplete();
    this.open = true;
    this.live = true;
    this.time = 0;
    this.SetItems(this.TitleItems());
    this.PickShots(true);
    this.Show("title");
    this.root.classList.remove("off", "pause");
  }

  /**
   * 标题下那一行临时提示（序章过场播完回到主菜单时写「后续章节暂时废弃」）。
   * 只改 titleSub，下一次 Show("title") 会换回 MENU.subtitle —— 它不是状态，是一句话。
   */
  SetNotice(text) {
    if (!text) return;
    this.el.titleSub.textContent = text;
  }

  /** 游戏中按 Esc：只挂一层暂停，**不碰相机**（世界冻在原地就是暂停该有的样子）。 */
  OpenPause() {
    this.ClearSandboxComplete();
    this.open = true;
    this.live = false;
    this.mode = "pause";
    this.SetItems(this.PauseItems());
    this.Show("pause");
    this.root.classList.remove("off");
    this.root.classList.add("pause");
  }

  OpenSandboxComplete() {
    this.OpenPause();
    this.el.titleSub.textContent = "第一关 P0/P1/P2 测试关卡完成";
    this.SetItems([
      { id: "restartSandbox", label: "重新测试", hint: "从车厢重新开始这一版白盒" },
      { id: "exitSandbox", label: "返回主菜单", hint: "退出独立测试，不进入第二章" },
    ]);
    const style = document.createElement("style");
    style.textContent = `
      @keyframes p012EndingBlack { from { background-color:transparent; } to { background-color:#000; } }
      @keyframes p012EndingControls { from { visibility:hidden; opacity:0; } to { visibility:visible; opacity:1; } }
      #menu.p012Complete { animation:p012EndingBlack 2s ease-in-out both; }
      #menu.p012Complete > :not(style) { animation:p012EndingControls 0.3s 2s both; }
      #menu.p012Complete .mnFade, #menu.p012Complete .mnVignette { display:none; }
    `;
    this.root.appendChild(style);
    this.sandboxCompleteStyle = style;
    this.root.classList.add("p012Complete");
  }
  OpenSandboxFailure(atLoad = false) {
    this.OpenPause();
    this.el.titleSub.textContent="顺子 · 测试失败";
    this.SetItems([
      {id:"retrySandbox",label:atLoad?"在载物处继续":"从检查点继续",hint:"保留现场进度与剩余补给；仅恢复顺子本人，不移动载物"},
      {id:"restartSandbox",label:"重新测试",hint:"从车厢重新开始这一版白盒"},
      {id:"exitSandbox",label:"返回主菜单",hint:"退出独立测试"},
    ]);
  }

  ClearSandboxComplete() {
    this.sandboxCompleteStyle?.remove();
    this.sandboxCompleteStyle = null;
    this.root.classList.remove("p012Complete");
  }

  Close() {
    this.ClearSandboxComplete();
    this.open = false;
    this.live = false;
    this.root.classList.add("off");
    this.root.classList.remove("pause", "panelOn", "levelsOn");
    this.el.panel.classList.remove("on");
    this.el.fade.style.opacity = "0";
  }

  /** 从暂停回到主菜单：这时候才接管相机并起运镜。 */
  ToTitle() {
    this.ClearSandboxComplete();
    this.live = true;
    this.SetItems(this.TitleItems());
    this.PickShots(true);
    this.Show("title");
    this.root.classList.remove("pause");
  }

  Show(mode) {
    const wasMode = this.mode;
    this.mode = mode;
    if (mode === "title" || mode === "pause") {
      this.el.titleMain.textContent = mode === "pause" ? "游戏暂停" : MENU.title;
      this.el.titleSub.textContent = mode === "pause" ? MENU.title : MENU.subtitle;
    }
    const panel = mode === "levels" || mode === "codex" || mode === "credits" || mode === "debug";
    if (panel) this.panelReturnMode = wasMode === "pause" ? "pause" : "title";
    this.root.classList.toggle("panelOn", panel);
    this.el.panel.classList.toggle("on", panel);
    this.root.classList.toggle("levelsOn", mode === "levels");
    if (mode === "levels") {
      this.el.panelTitle.textContent = "任务选择";
      this.el.panelBody.textContent = "";
      this.el.panelBody.appendChild(this.el.levelsWrap);
      this.SelectLevel(this.DefaultLevel());
      this.levelEls[this.selected]?.scrollIntoView({ block: "nearest" });
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
    if (!panel && wasMode === "levels") {
      this.itemEls[this.itemIndex]?.focus({ preventScroll: true });
    }
  }

  /** 选章默认落在「继续」那一关上（只在正式章节里挑）。 */
  DefaultLevel() {
    const progress = Progress.Read();
    return Clamp(progress.furthest, 0, this.officialCount - 1);
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
      if (k === this.selected) el.setAttribute("aria-current", "true");
      else el.removeAttribute("aria-current");
      const mark = el.querySelector(".mnLvMark");
      if (this.entries[k].sandbox) { mark.textContent = "沙盒"; mark.className = "mnLvMark"; return; }
      if (this.entries[k].deprecated) { mark.textContent = "未完成"; mark.className = "mnLvMark todo"; return; }
      const done = progress.cleared.includes(this.entries[k].id);
      mark.textContent = done ? "已通过" : (k === progress.furthest && k < this.officialCount ? "下一关" : "");
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
    brief.classList.toggle("sandbox", !!phase.sandbox);
    if (!phase.sandbox) {
      const art = mk("mnMissionArt", "figure");
      const image = document.createElement("img");
      image.src = MISSION_ART[this.selected] || "";
      image.alt = `${MissionName(phase.label)}任务场景图`;
      image.decoding = "async";
      image.draggable = false;
      art.appendChild(image);
    }
    const copy = mk("mnMissionCopy");
    const AppendCopy = (cls, tag = "div") => {
      const e = document.createElement(tag);
      e.className = cls;
      copy.appendChild(e);
      return e;
    };
    AppendCopy("mnBriefTitle").textContent = MissionName(phase.label);
    AppendCopy("mnMissionWhen").textContent = phase.sandbox
      ? phase.place : `${phase.date} · ${phase.place}`;
    AppendCopy("mnMissionObjective").textContent = phase.objectives?.[0]
      || phase.brief?.[0] || "进入任务";
    if (phase.sandbox) {
      const training = mk("mnTrainingPreview");
      training.setAttribute("aria-hidden", "true");
      training.textContent = phase.glyph || phase.sandboxGlyph || "靶";
      brief.prepend(training);
    }
    const record = mk("mnMissionRecord");
    const cleared = progress.cleared.includes(phase.id);
    record.classList.toggle("done", !phase.sandbox && !phase.deprecated && cleared);
    record.classList.toggle("todo", !!phase.deprecated);
    const label = document.createElement("span");
    label.textContent = phase.sandbox ? "独立测试" : phase.deprecated ? "暂时废弃场景" : "章节记录";
    const value = document.createElement("b");
    value.textContent = phase.sandbox ? "不计入战役进度"
      : phase.deprecated ? "未完成 · 只建场景，没有任务内容" : cleared ? "已通过" : "尚未通过";
    record.append(label, value);
  }

  // -------------------------------------------------------------------------
  // 动作
  // -------------------------------------------------------------------------
  Activate(id) {
    switch (id) {
      case "start": {
        const progress = Progress.Read();
        const index = Clamp(progress.furthest, 0, this.officialCount - 1);
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
      case "restartSandbox": this.host.RestartSandbox?.(); return;
      case "retrySandbox": this.host.RetrySandbox?.(); return;
      case "title": this.ToTitle(); return;
      default: break;
    }
  }

  /**
   * 进一章。**选章默认不播过场**：那条是「挑一章来打」的入口，
   * 每次都先看一分多钟的出川会把它变成看片入口。战役入口才播（Activate）。
   * 例外见下面 cutsceneOnly 那一段。
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
    // 已经在靶场里了：正片那七章同样换不过去，先退回正片再说。
    if (this.sandboxMode) { this.host.ExitSandbox?.(); return; }
    this.busy = true;
    this.host.Unlock?.();
    // **过场承载章（序章）必须播**：它整章就是那一场过场，不建自己的切片。
    // 按选章的默认「不播过场」进去，玩家会落在上一片切片上、一个人都没有，
    // 而本章什么也不会发生 —— 那不是「跳过演出」，是掉进一个空场。
    const cutsceneOnly = !!this.entries[index]?.cutsceneOnly;
    Promise.resolve(this.host.Play(index, { cutscenes: cutsceneOnly, ...opts }))
      .catch((error) => { console.error("[Menu] 进章失败", error); })
      .finally(() => { this.busy = false; });
  }

  // -------------------------------------------------------------------------
  // 键盘
  // -------------------------------------------------------------------------
  BindInput() {
    this.onKey = (event) => {
      // 设置窗口接管键盘时，不让 Enter / 方向键穿透到背后的菜单。
      if (!this.open || document.querySelector("body.edToolsOpen #edRoot:not(.off)")) return;
      const panel = this.root.classList.contains("panelOn");
      switch (event.key) {
        case "Escape":
          if (panel) { this.Show(this.panelReturnMode); event.preventDefault(); }
          else if (this.mode === "pause") { this.host.Resume?.(); event.preventDefault(); }
          return;
        case "ArrowDown": case "ArrowUp": {
          const delta = event.key === "ArrowDown" ? 1 : -1;
          if (panel && this.mode === "levels") {
            this.SelectLevel(this.selected + delta);
            this.levelEls[this.selected]?.focus({ preventScroll: true });
            this.levelEls[this.selected]?.scrollIntoView({ block: "nearest" });
          }
          else if (!panel) {
            this.Highlight(this.itemIndex + delta);
            this.itemEls[this.itemIndex]?.focus({ preventScroll: true });
            this.itemEls[this.itemIndex]?.scrollIntoView({ block: "nearest" });
          }
          event.preventDefault();
          return;
        }
        case "Enter": case " ":
          // Native controls (especially Back) keep their own Enter/Space action.
          if (event.target.closest?.("button, input, select, textarea, a, summary")
            && !event.target.closest(".mnItem, .mnLevel")) return;
          if (panel && this.mode === "levels") this.Play(this.selected);
          else if (!panel) this.Activate(this.items[this.itemIndex]?.id);
          event.preventDefault();
          return;
        default: break;
      }
    };
    // 第一次点击解锁音频：没有用户手势时 AudioContext 是 suspended 的
    this.onClick = () => { if (this.open) this.host.Unlock?.(); };
    this.onNativeKey = event => {
      if ((event.key === " " || event.key === "Enter") && event.target.closest?.("button, input, select, textarea")
        && !event.target.closest(".mnItem, .mnLevel")) event.stopPropagation();
    };
    this.onResize = () => {
      if (this.open && this.root.contains(document.activeElement)) document.activeElement.scrollIntoView({ block: "nearest" });
    };
    this.root.addEventListener("keydown", this.onNativeKey);
    this.onTab = event => {
      if (event.key === "Tab" && this.open && !document.querySelector("body.edToolsOpen #edRoot:not(.off)")) event.stopPropagation();
    };
    document.addEventListener("keydown", this.onTab, true);
    window.addEventListener("resize", this.onResize);
    document.addEventListener("keydown", this.onKey);
    this.root.addEventListener("pointerdown", this.onClick);
  }

  // -------------------------------------------------------------------------
  // 运镜
  // -------------------------------------------------------------------------
  /** 按当前建好的切片取机位表。切片换了就重取（回主菜单时会用到）。 */
  PickShots(reset = false) {
    const index = this.host.SliceIndex?.() ?? 0;
    // 优先问装配层「现在建好的是哪一片」：沙盒与 ?phase=overview 都不在 PHASES 里，
    // 只按序号去查 this.phases 会取到别人的机位（见 Script_Main 的 SlicePhase 注释）。
    const phase = this.host.SlicePhase?.() || this.phases[index];
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
      const phase = this.host.SlicePhase?.() || this.phases[this.host.SliceIndex?.() ?? 0];
      this.el.shotNote.textContent = phase
        ? `${phase.label}　${shot.title || shot.id}` : (shot.title || "");
    }
  }

  Dispose() {
    document.removeEventListener("keydown", this.onKey);
    this.root.removeEventListener("keydown", this.onNativeKey);
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("keydown", this.onTab, true);
    this.root.removeEventListener("pointerdown", this.onClick);
    this.root.textContent = "";
  }
}

export default MainMenu;
