// 《滕县 1938》对话字幕栈 —— COD 式叠放对白。**纯 JS，不 import three、模块层不碰 document**
// （Node 里要能直接 import 来跑断言，Script_Hud / Script_CutsceneCheck 都吃这一条）。
//
// ── 为什么要有这个文件 ──────────────────────────────────────────────────────
// 在这之前，过场的台词层是 `director.lineSlot` **一个槽**，HUD 的字幕层是
// `hud.el.subtitle` **一个 div**：新的一句直接覆盖上一句，上一句连一帧过渡都没有就没了。
// 后果在新序章（CS_Chuchuan 镜 6，1:08—1:30 的班长动员问答）上最明显 ——
// 「去死，怕不怕？」8.4 s 起、只给 0.6 s；「不怕！」9.7 s 起。答句一出现，
// 问句就整条消失，屏幕上永远只有半场对话，玩家读到的是一串互不相干的短句。
//
// COD 的做法（本文件照抄的那一套）是三条：
//   1. **叠放**：同时活着的对白从下往上排，最新的一条在最下面，最多 3 条；
//   2. **留白**：一句话说完之后还挂 `hold` 秒才退场，所以问句会等到答句上来才走；
//   3. **过渡**：进场从下方浮起并淡入，退场向上飘并淡出，其余各条被推着走。
//
// ── 一条工程规矩：补间自己算，不用 CSS transition ────────────────────────────
// 这一层的每一次位移与透明度都由 `Update(dt)` 用**游戏时钟**算出来，直接写
// style.transform / style.opacity。不用 CSS transition/animation 的原因和
// Script_Hud 里命中记号那段注释一样，外加一条更硬的：
// **出图管线（Script_CutsceneShot）是手动步进的** —— 它一口气 `StepFrames(n)` 把
// 过场推到第 t 秒，再截图。CSS 过渡走的是墙上时钟，那一口气里它一帧都没走，
// 截出来的字幕会永远停在「刚进场」的透明度上。自己补间则与步进方式无关：
// 推到哪一秒，画面就是那一秒该有的样子，逐次可复现。
//
// ── 用法 ───────────────────────────────────────────────────────────────────
//   const stack = new SubtitleStack({ doc, host, skin: "cs" });
//   stack.Push({ whoId: "squadLeader", who: "班长", text: "去死，怕不怕？", seconds: 0.6 });
//   stack.Update(dt);          // 每帧
//   stack.Clear();             // 过场结束 / 关卡切换
// 没有 doc/host 也能跑（纯模型），Node 断言就是这么用的。

import { HashString } from "./Script_Noise.mjs";

/**
 * 全部旋钮。改手感不用翻实现。
 *
 * readPerChar / readBase 是**字幕最短可读时长**的唯一定义（每字 0.22 s + 1.2 s，
 * 出处 docs/Data_CutsceneRedo.md §1.4）；Script_CutsceneCheck.MinReadSeconds 也从这里取，
 * 别在别处再写一份 0.22。
 *
 * hold 是「说完之后还挂多久」。0.9 s 是照着镜 6 那段问答定的：问句 8.4 s 起、
 * 答句 9.7 s 起，只有留白 ≥0.7 s 才叠得起来；再长就会连黑场字卡都压住。
 */
export const SUBTITLE_TUNING = Object.freeze({
  max: 3,               // 同屏最多几条。COD 也是 2—3 条；再多就没人读得完
  hold: 0.9,            // 一句话读完之后继续挂多久（秒）
  readPerChar: 0.22,    // 每个字的可读时长（秒）
  readBase: 1.2,        // 可读时长的基底（秒）
  riseIn: 0.22,         // 进场补间时长（秒）
  fadeOut: 0.34,        // 退场补间时长（秒）
  risePx: 9,            // 进场时从静止位下方多少像素浮上来
  driftPx: 7,           // 退场时再往上飘多少像素
  gapPx: 4,             // 两条之间的行距（像素）
  rowPx: 30,            // 量不到真实行高时的兜底行高（像素）
});

/** 字幕/台词的最短可读时长。`authored` 给了就取两者较大值。 */
export function MinReadSeconds(text, authored = 0) {
  const chars = String(text || "").replace(/\s+/g, "").length;
  const need = chars * SUBTITLE_TUNING.readPerChar + SUBTITLE_TUNING.readBase;
  return Math.max(need, Number(authored) || 0);
}

/**
 * 说话人名字的颜色。COD 给每个角色一个固定色，玩家不看名字、只看颜色就知道换人了；
 * 叠放之后这件事从"锦上添花"变成"必需" —— 两三条挤在一起时，色块是最快的分辨依据。
 *
 * 已登记的角色写死在表里（相邻发言的人必须给不同色，靠哈希碰运气会碰上）；
 * 没登记的按 HashString 落进调色板 —— **不许 Math.random**，同一个 id 每次同一个色。
 * 色相全部压在这一作的羊皮纸/军装色域里，不用 COD 那种饱和度拉满的原色。
 */
const TONE_PALETTE = Object.freeze([
  "#e0b062",  // 主调（--warn）：带兵的
  "#c3d2e2",  // 冷白：年轻兵
  "#d9906b",  // 陶土：老兵
  "#b9c79c",  // 草绿
  "#d9b6cd",  // 藕
  "#9fbcc9",  // 灰蓝
]);

/** 已登记角色的定色。改这里之前先确认相邻发言的两个人没撞色。 */
const TONE_BY_ID = Object.freeze({
  // —— 新序章 CS_Chuchuan 的车厢 ——
  squadLeader: "#e0b062",
  squad: "#efe4c8",          // 众人：齐声那一条，比谁都亮
  youngDispatch: "#c3d2e2",
  oldWound: "#d9906b",
  machineGunner: "#b9c79c",
  rifleman: "#9fbcc9",
  externalOfficer: "#d9b6cd",
  // —— 正片七关 ——
  player: "#efe4c8",
  qiu: "#e0b062",
  yang: "#d9906b",
  wang: "#e8c07a",
  zhao: "#b9c79c",
  zhang: "#9fbcc9",
  yan: "#c3d2e2",
  hou: "#d9b6cd",
  adjutant: "#c3d2e2",
  runner: "#b9c79c",
});

export function SpeakerTone(id) {
  const key = String(id || "");
  if (!key) return TONE_PALETTE[0];
  if (TONE_BY_ID[key]) return TONE_BY_ID[key];
  return TONE_PALETTE[HashString(key) % TONE_PALETTE.length];
}

/** 平滑补间。首尾都是零导数，进退场都不会有硬起停。 */
function Smooth(k) {
  const t = k <= 0 ? 0 : (k >= 1 ? 1 : k);
  return t * t * (3 - 2 * t);
}

const STYLE_ID = "subtitleStackStyle";

/**
 * 叠放层自己的样式：**只管排布，不管长相**。
 * 字号、颜色、阴影这些留给宿主的皮肤（过场在 Script_Cutscene 的 CSS 里，
 * HUD 在 Style_Game.css 里），所以同一套堆栈能长成两种样子。
 *
 * 每条对白是 `position:absolute; bottom:0` 的一层，纵向靠 transform 摞起来。
 * 为什么不用 flex 从下往上排：flex 的重排是瞬时的，新的一条一进来，
 * 上面几条会「跳」一格；transform 是我们自己按帧写的，跳不了。
 *
 * ── 这里**一个字都不许写 .sbtStack 的 position** ────────────────────────────
 * 宿主自带定位（`.hudSubtitle` 与 `.csLine` 都是 position:absolute），
 * 而 `.sbtStack` 与它们**同为单类选择器、权重一样**，谁的样式表在后面谁赢。
 * 这份样式是运行时 append 到 head 的，与 Style_Game.css / cutsceneStyle 的先后
 * 取决于 Hud 与 CutsceneDirector 谁先构造 —— 实测就是这么错的：
 * `.sbtStack{position:relative}` 把 `.hudSubtitle` 的 absolute 顶掉，
 * 字幕整摞跑到 y=−114（屏幕上沿之外），而过场那一摞因为构造顺序恰好在后面、看着是好的。
 * 宿主必须是**已定位**元素（absolute/relative/fixed），这是契约，由宿主自己保证。
 */
export const SUBTITLE_CSS = `
.sbtLine{position:absolute;left:0;right:0;bottom:0;opacity:0;will-change:transform,opacity}
.sbtWho{margin-right:.6em}
.sbtText{white-space:pre-wrap}
`;

/** 把叠放层的样式装进这份 document（同一份只装一次）。 */
export function EnsureSubtitleStyle(doc) {
  if (!doc || !doc.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = SUBTITLE_CSS;
  doc.head.appendChild(style);
}

/** 把一段用户可见文本里的 HTML 元字符挡掉。台词是数据，不该当标记解析。 */
function Escape(text) {
  return String(text ?? "").replace(/[&<>"]/g, (c) => (
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"));
}

/**
 * 一摞对白。
 *
 * 顺序约定：`entries` 里**最旧在前、最新在后**；画面上最新的一条在**最下面**，
 * 旧的往上摞。这与 COD 一致，也与"眼睛停在屏幕底部"这件事一致。
 */
export class SubtitleStack {
  /**
   * @param {object}   opts
   * @param {Document} opts.doc        没有就是纯模型模式（Node 断言）
   * @param {Element}  opts.host       挂载点；没有就是纯模型模式
   * @param {string}   opts.skin       附加在每条 line 上的皮肤类名（"cs" / "hud"）
   * @param {number}   opts.max        同屏上限
   * @param {number}   opts.hold       说完之后继续挂多久
   * @param {number}   opts.rowPx      量不到行高时的兜底
   */
  constructor({ doc = null, host = null, skin = "", max = SUBTITLE_TUNING.max,
    hold = SUBTITLE_TUNING.hold, rowPx = SUBTITLE_TUNING.rowPx, gapPx = SUBTITLE_TUNING.gapPx } = {}) {
    this.doc = doc || null;
    this.host = host || null;
    this.skin = skin || "";
    this.max = Math.max(1, Math.floor(max));
    this.hold = Math.max(0, hold);
    this.rowPx = Math.max(1, rowPx);
    this.gapPx = Math.max(0, gapPx);
    this.entries = [];
    if (this.doc) EnsureSubtitleStyle(this.doc);
    if (this.host) this.host.classList.add("sbtStack");
  }

  /** 还没开始退场的条数（叠放上限数的是这个，退场中的不占名额）。 */
  get LiveCount() { return this.entries.reduce((n, e) => n + (e.leaving === null ? 1 : 0), 0); }

  /** 给断言/调试用的快照：最旧在前，和 entries 同序。 */
  get Lines() {
    return this.entries.map((e) => ({
      whoId: e.whoId, who: e.who, text: e.text, tone: e.tone, variant: e.variant, tier: e.tier,
      alpha: Number(e.alpha.toFixed(4)), offset: Number(e.offset.toFixed(2)),
      leaving: e.leaving !== null, life: Number(e.life.toFixed(3)),
    }));
  }

  /**
   * 推一句进来。
   * @param {string} who     显示用的名字（空＝旁白，不打名字、走斜体）
   * @param {string} whoId   角色 id，只用来定色；不给就退回 who
   * @param {number} seconds 数据写的时长；实际显示取 max(它, 可读下限) + hold
   */
  Push({ who = "", whoId = "", text = "", seconds = 0, variant = "", off = false, tier = "" } = {}) {
    const body = String(text ?? "");
    if (!body) return null;
    const id = String(whoId || who || "");
    const entry = {
      whoId: id,
      who: String(who || ""),
      text: body,
      off: !!off,
      tier: tier || "",
      variant: variant || "",
      tone: who ? SpeakerTone(id) : "",
      // 显示时长：**数据时长与可读下限取大，再加 hold**。
      // 加 hold 是叠放的前提 —— 不留白，下一句上来时这一句已经没了，摞不起来。
      life: MinReadSeconds(body, seconds) + this.hold,
      age: 0,
      leaving: null,
      alpha: 0,
      offset: 0,
      height: this.rowPx,
      el: null,
    };
    this.entries.push(entry);
    this._Mount(entry);
    this._EnforceCap();
    this._Layout();
    return entry;
  }

  /** 每帧推进。dt 是**游戏时钟**的秒数，不是墙上时钟。 */
  Update(dt) {
    const step = Number(dt) || 0;
    if (!this.entries.length) return;
    for (let i = this.entries.length - 1; i >= 0; i -= 1) {
      const entry = this.entries[i];
      entry.age += step;
      if (entry.leaving === null) {
        entry.life -= step;
        if (entry.life <= 0) entry.leaving = 0;
      } else {
        entry.leaving += step;
        if (entry.leaving >= SUBTITLE_TUNING.fadeOut) {
          this._Unmount(entry);
          this.entries.splice(i, 1);
        }
      }
    }
    this._Layout();
  }

  /** 让还活着的条目立刻进入退场补间（黑场字卡上不许压着对白）。 */
  FadeAll() {
    for (const entry of this.entries) if (entry.leaving === null) entry.leaving = 0;
    this._Layout();
  }

  /** 立刻清空，不走补间（过场结束、关卡切换、跳过）。 */
  Clear() {
    for (const entry of this.entries) this._Unmount(entry);
    this.entries.length = 0;
  }

  // -------------------------------------------------------------------------
  // 内部
  // -------------------------------------------------------------------------

  /** 超过上限就把**最旧的一条**提前推进退场补间；不是直接删，删了就没有过渡。 */
  _EnforceCap() {
    let live = this.LiveCount;
    for (const entry of this.entries) {
      if (live <= this.max) break;
      if (entry.leaving !== null) continue;
      entry.leaving = 0;
      live -= 1;
    }
  }

  _Mount(entry) {
    if (!this.doc || !this.host) return;
    const el = this.doc.createElement("div");
    el.className = `sbtLine${this.skin ? ` ${this.skin}` : ""}`
      + `${entry.variant ? ` ${entry.variant}` : ""}${entry.off ? " off" : ""}`
      + `${entry.who ? "" : " narr"}`;
    const who = entry.who
      ? `<span class="sbtWho" style="color:${entry.tone}">${Escape(entry.who)}${entry.off ? "（画外）" : ""}：</span>`
      : "";
    el.innerHTML = `${who}<span class="sbtText">${Escape(entry.text)}</span>`;
    el.style.opacity = "0";
    this.host.appendChild(el);
    entry.el = el;
    // 真实行高（换行的长句是两行）。量不到就用兜底值 —— Node 里根本没有布局。
    entry.height = el.offsetHeight || this.rowPx;
  }

  _Unmount(entry) {
    if (entry.el && entry.el.parentNode) entry.el.parentNode.removeChild(entry.el);
    entry.el = null;
  }

  /**
   * 排布 + 写样式。**每条的静止位 = 比它新的那些条的加权高度之和**，
   * 权重就是它们各自的进场/退场进度 —— 新的一条从 0 长到 1 时，
   * 上面几条正好被"推"上去；最旧的一条缩回 0 时，它上面的（如果有）落下来。
   * 位移因此是这两个补间的副产品，不用再单独插值一次。
   */
  _Layout() {
    let stackedPx = 0;
    for (let i = this.entries.length - 1; i >= 0; i -= 1) {
      const entry = this.entries[i];
      const enter = Smooth(entry.age / SUBTITLE_TUNING.riseIn);
      // 进场那零点二秒里重量一次行高：长句会不会折成两行，取决于字体的字宽，
      // 而 Noto Serif SC 是网络字体 —— 挂载那一帧它可能还没到，量出来是一行，
      // 换上之后变两行，上面几条就会矮一格。只在进场期间重量，稳态不碰布局。
      if (entry.el && enter < 1) entry.height = entry.el.offsetHeight || entry.height;
      const leave = entry.leaving === null ? 0 : Smooth(entry.leaving / SUBTITLE_TUNING.fadeOut);
      const weight = enter * (1 - leave);
      entry.alpha = weight;
      entry.offset = stackedPx;
      stackedPx += (entry.height + this.gapPx) * weight;
      if (!entry.el) continue;
      const y = -entry.offset
        + (1 - enter) * SUBTITLE_TUNING.risePx
        - leave * SUBTITLE_TUNING.driftPx;
      entry.el.style.transform = `translateY(${y.toFixed(2)}px)`;
      entry.el.style.opacity = weight.toFixed(3);
    }
  }
}

export default SubtitleStack;
