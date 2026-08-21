// 《血战台儿庄》HUD —— 纯 DOM/CSS，**不进 three 渲染**。
//
// 战术信息层级参考《战地》：顶部只留目标与兵力，左下地图，右下武器、弹药和姿态；
// 中央只出现眼下可执行的操作、准心与真正紧急的反馈，不打歼敌数字。
//
// 唯一一处比 ER2 多的是「阵亡卡片」——倒地后的战场留在半透明去色层下面，
// 生平打出刚才那个人的名字、籍贯、生卒年。ER2 有这个设计，而在台儿庄它有额外的分量：
// 孙连仲的命令原话就是「士兵打完了，你自己填上去。你填过了，我来填」。

import { REINFORCE } from "./Data_Battle.mjs";

const NS = "http://www.w3.org/2000/svg";

/** 章节卡排在简报之后要等多久。0.55 s 让简报那 0.6 s 的淡出先走完。 */
const TITLE_AFTER_BRIEF_S = 0.55;

/**
 * 两个目标标签在纵向上至少要隔开多少像素（同时横向要近到 MARKER_SEP_X 才算撞）。
 * 一个 marker 是「▲ + 名字 + 进度条」三行，实测占 38 px 高。
 * 线性关卡里所有路标几乎在同一个方位角上 —— 实测第五关「十字街口 62m /
 * 西门里街 222m / 西门里 340m」三个标签打在同一像素上（x 762–838、y 449.5–465.8），
 * 两两重叠 1019–1103 px²，而且整关不散。投影点不做避让就必然叠成一坨。
 */
const MARKER_SEP_Y = 40;
const MARKER_SEP_X = 130;
const GRENADE_WARNING_LIMIT = 4;

const STANCE_LABELS = {
  stand: "站立",
  crouch: "蹲伏",
  prone: "卧倒",
};

const EQUIPMENT_ICONS = {
  grenade: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7h7l2 3v7.5A3.5 3.5 0 0 1 14.5 21h-4A3.5 3.5 0 0 1 7 17.5V10l2-3Z"/><path d="M10 7V4h5v3m0-2h3l1-2"/></svg>`,
  bundle: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8h3v11H7zM14 8h3v11h-3zM10.5 6h3v14h-3zM8 5V3m8 2V3m-4.5 3V3"/></svg>`,
  mortar: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 4 3 1-3.8 12.5-3-1zM9 17l7 3m-10-2-2 3m11-1 3 1"/><path d="m9.5 3.5 2 .6-.6 2-2-.6z"/></svg>`,
};

/** 把内部的“剩余弹夹数”换成玩家真正需要判断的剩余弹数。 */
export function AmmoReadout({ ammo = 0, clips = 0, magazine = 0, armed = true } = {}) {
  const current = Math.max(0, Math.floor(Number(ammo) || 0));
  const capacity = Math.max(0, Math.floor(Number(magazine) || 0));
  const reserve = Math.max(0, Math.floor(Number(clips) || 0)) * capacity;
  return {
    current: armed ? String(current).padStart(2, "0") : "—",
    reserve: armed ? String(reserve).padStart(2, "0") : "—",
    low: armed && current > 0 && current <= Math.max(1, Math.ceil(capacity * 0.2)),
    empty: armed && current <= 0,
  };
}

/**
 * 情境提示的图标。**提示上不写字**：一行只有按键框 + 一个说明动作的小图 ——
 * 战斗中没人有工夫读「分一个桥夹给邱茂才」，但一眼能认出那是子弹。
 * 汉字说明仍挂在 title/aria-label 上（读屏与冒烟测试读它）。
 *
 * 用内联 SVG 而不是字体图标或下载的图标包：描边随 currentColor 走，
 * 和按键框同色同亮度；也不额外拖一个网络请求。
 * 一律 24×24 viewBox、只描边不填充，粗细交给 CSS 统一。
 */
const ACTION_ICONS = {
  // 一只伸出去的手：通用交互（够不着别的语义时的兜底）
  interact: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 12V5.6a1.6 1.6 0 0 1 3.2 0V11m0-1.2a1.6 1.6 0 0 1 3.2 0V12m0-1a1.6 1.6 0 0 1 3.2 0v5.2A5.8 5.8 0 0 1 12.6 22h-1A5.6 5.6 0 0 1 6 16.4v-3l-1.6.9a1.5 1.5 0 0 0-.6 2l.9 1.7"/></svg>`,
  // 一支斜着的步枪：从倒下的人身上拾枪 / 换枪
  pickup: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.6 18.4 19.6 6.6M2.8 20.6 6.2 17.2M10.6 12.8l1.8 2.6M13.8 9.8l2.2 1.4"/></svg>`,
  // 两发桥夹弹：分弹药给打光了的自己人
  ammo: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 20.5V10l2-3.5L11 10v10.5zM14 20.5V10l2-3.5 2 3.5v10.5zM5.5 15.5h14"/></svg>`,
  // 一片创可贴：止血
  bandage: `<svg viewBox="0 0 24 24" aria-hidden="true"><g transform="rotate(-45 12 12)"><rect x="3.2" y="9" width="17.6" height="6" rx="3"/><path d="M9 9v6M15 9v6"/></g></svg>`,
  // 双向箭头：换枪
  switchWeapon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h13l-3.4-3.4M20 15H7l3.4 3.4"/></svg>`,
};
ACTION_ICONS.action = ACTION_ICONS.interact;

/**
 * 从真实玩法状态生成情境操作提示。只要条件不成立就不返回那一项：
 * 没有第二支枪不提示换枪，够不着尸体不提示拾枪，没有绷带或没流血不提示包扎。
 * 保持纯函数，浏览器冒烟可以直接把三组边界状态喂进来验证。
 */
export function ContextualActionPrompts({
  interaction = null, bleeding = 0, bandages = 0, slots = {},
} = {}) {
  const prompts = [];
  if (interaction?.label) {
    prompts.push({ keys: "F", label: interaction.label, kind: interaction.kind || "interact" });
  }
  if (Number(bleeding) > 0 && Number(bandages) > 0) {
    prompts.push({ keys: "B", label: "包扎止血", kind: "bandage" });
  }
  const firearms = [
    ["primary", "1", "长枪"],
    ["secondary", "2", "短枪"],
  ].filter(([slot]) => !!slots?.[slot]);
  if (firearms.length > 1) {
    prompts.push({
      keys: firearms.map(([, key]) => key).join(" / "),
      label: `切换${firearms.map(([, , name]) => name).join(" / ")}`,
      kind: "switchWeapon",
    });
  }
  return prompts;
}

export class Hud {
  constructor(root) {
    this.root = root;
    this.el = {};
    this.minimapVisible = false;
    this.minimapDirty = 0;
    this.Build();
    this.noteQueue = [];
    this.noteTimer = 0;
    this.subtitleTimer = 0;
    this.titleTimer = 0;
    this.hintTimer = 0;
    this.briefTimer = 0;
    this.deathTimer = 0;
    /** 等简报播完再浮出来的章节卡（见 Title）。 */
    this.pendingTitle = null;
    /** 说过的每一句纯文本。通关冒烟拿它断言剧本真的播了。 */
    this.spoken = [];
    /**
     * 命中记号：剩余时长与总时长（Update 按比例淡出），外加一份取证队列。
     * **别和 player.hitMarks 搞混**：那个是「谁在打我、从哪个方位」（来弹指示器），
     * 这个是「我打中了谁」（打出去的回执）。两件事，两个方向，名字长得像纯属倒霉。
     */
    this.hitmarkTimer = 0;
    this.hitmarkSpan = 1;
    this.confirms = [];
    this.actionPrompts = [];
    this.actionPromptSignature = "";
    /** 帧率读数：累计一小段再平均，免得数字每帧乱跳。 */
    this.fpsAccum = 0;
    this.fpsFrames = 0;
    this.fpsLast = 0;
  }

  Build() {
    const mk = (cls, parent = this.root, tag = "div") => {
      const e = document.createElement(tag);
      e.className = cls;
      parent.appendChild(e);
      return e;
    };
    this.el.suppress = mk("hudSuppress");        // 压制暗角：纯 CSS 径向渐变，零成本
    this.el.damage = mk("hudDamage");
    this.BuildHitDirs();
    // 左上角一个小帧率读数：只看性能，字号压到最小、不抢战场信息。
    this.el.fps = mk("hudFps");
    this.el.fps.textContent = "-- FPS";
    this.el.top = mk("hudTop");
    this.el.phase = mk("hudPhase", this.el.top);
    this.el.objective = mk("hudObjective", this.el.top);
    this.el.state = mk("hudState");
    this.el.combat = mk("hudCombat");
    this.el.combat.innerHTML = `
      <div class="combatWeapon"></div>
      <div class="combatMain">
        <div class="combatStance" data-stance="stand" role="img" aria-label="站立">
          <svg class="stanceStand" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="5.5" r="3"/><path d="M16 9v10m0-7-6 6m6-6 6 5m-6 2-5 10m5-10 6 10"/></svg>
          <svg class="stanceCrouch" viewBox="0 0 32 32" aria-hidden="true"><circle cx="20.5" cy="7" r="3"/><path d="m19 10-6 7m2-4 8 4m-10 0 6 5m0 0 7 1m-7-1-6 7m13-6 3 6"/></svg>
          <svg class="stanceProne" viewBox="0 0 32 32" aria-hidden="true"><circle cx="25.5" cy="17" r="3"/><path d="M22 18h-9l-7 5m8-5-5-5m5 5 7 5m-12 0H3"/></svg>
        </div>
        <div class="combatAmmo" aria-label="弹药">
          <span class="ammoCurrent">00</span><span class="ammoDivider"></span><span class="ammoReserve">00</span>
        </div>
      </div>
      <div class="combatEquipment">
        <span class="equipment grenade" aria-label="手榴弹">${EQUIPMENT_ICONS.grenade}<b>0</b></span>
        <span class="equipment bundle" aria-label="集束手榴弹">${EQUIPMENT_ICONS.bundle}<b>0</b></span>
        <span class="equipment mortar" aria-label="迫击炮支援">${EQUIPMENT_ICONS.mortar}<b>0</b></span>
      </div>`;
    this.el.combatWeapon = this.el.combat.querySelector(".combatWeapon");
    this.el.combatStance = this.el.combat.querySelector(".combatStance");
    this.el.ammoCurrent = this.el.combat.querySelector(".ammoCurrent");
    this.el.ammoReserve = this.el.combat.querySelector(".ammoReserve");
    this.el.equipment = {
      grenades: this.el.combat.querySelector(".equipment.grenade"),
      bundles: this.el.combat.querySelector(".equipment.bundle"),
      mortar: this.el.combat.querySelector(".equipment.mortar"),
    };
    this.el.subtitle = mk("hudSubtitle");
    this.el.hint = mk("hudHint");
    this.el.actions = mk("hudActions");
    this.el.note = mk("hudNote");
    this.el.markers = mk("hudMarkers");
    this.el.grenadeWarnings = mk("hudGrenadeWarnings");
    for (let i = 0; i < GRENADE_WARNING_LIMIT; i += 1) {
      const warning = mk("hudGrenadeWarning", this.el.grenadeWarnings);
      warning.innerHTML = `<span class="ico"><i>!</i></span><span class="txt"></span>`;
      warning.style.display = "none";
    }
    this.el.minimap = mk("hudMinimap", this.root, "canvas");
    this.el.minimap.width = 190;
    this.el.minimap.height = 190;
    this.minimapCtx = this.el.minimap.getContext("2d");
    this.SetMinimapVisible(false);
    // ER2 式动态准心：腰射时给方向反馈，冲刺时仍保留但明显扩散，开镜交给机械瞄具。
    // 四条线和中心点常驻，只改 class/CSS 变量，避免每帧重建 DOM。
    this.el.crosshair = mk("hudCrosshair");
    this.el.crosshair.setAttribute("role", "img");
    this.el.crosshair.setAttribute("aria-label", "腰射准心");
    for (const side of ["left", "right", "up", "down"]) mk(`arm ${side}`, this.el.crosshair, "i");
    mk("dot", this.el.crosshair, "i");
    // 命中记号：屏幕正中四道短撇。**四个 span 常驻，不每次 new** ——
    // 一场仗打几百次命中，每次重建 DOM 会在 GC 上攒出可见的顿。
    this.el.hitmark = mk("hudHitmark");
    for (let i = 0; i < 4; i += 1) mk("t", this.el.hitmark, "i");
    this.el.deathCard = mk("hudDeathCard");
    this.el.brief = mk("hudBrief");
    this.el.title = mk("hudTitle");
    this.el.epilogue = mk("hudEpilogue");
    this.el.cook = mk("hudCook");
  }

  /** 上方一行：阶段 / 日期 / 当前要打的点。 */
  SetPhase(phase) {
    this.el.phase.innerHTML = `<span class="d">${phase.date}</span><span class="l">${phase.label}</span>`;
  }

  SetObjective(text, ours, theirs) {
    // 信息不对称：站在占领区里才看得见对面还剩多少人。
    // 目标只在这一处更新；不再把同一句任务文字重复扔到屏幕下方。
    const intel = theirs === null ? "" : `<span class="t">对面 ${theirs}</span>`;
    const signature = `${text}|${ours}|${theirs}`;
    if (this.el.objective.dataset.signature !== signature) {
      const objectiveChanged = this.el.objective.dataset.objective !== text;
      this.el.objective.dataset.signature = signature;
      this.el.objective.dataset.objective = text;
      this.el.objective.innerHTML = `<span class="objectiveMark">◆</span><span class="o">${text}</span>`
        + `<span class="forces"><span class="p">${REINFORCE.poolLabel} ${ours}</span>${intel}</span>`;
      if (objectiveChanged) {
        this.el.objective.classList.remove("changed");
        requestAnimationFrame(() => this.el.objective.classList.add("changed"));
      }
    }
  }

  /** 常驻 HUD 不再展示姓名与队伍；人物身份只在阵亡卡里出现。 */
  SetWeaponName(weaponName) {
    this.el.combatWeapon.textContent = weaponName;
  }

  /**
   * 动态准心规则对齐 ER2 的读法：腰射可见、跑动扩大、铁瞄隐藏。
   * 准心永远固定屏幕几何中心。武器摆动只能作为动画反馈，不能拖着 HUD 瞄准基准走。
   */
  SetCrosshair({ visible = false, move = 0, sprint = 0, ads = 0 } = {}) {
    const e = this.el.crosshair;
    const sprinting = sprint > 0.35;
    const shown = !!visible && ads < 0.62;
    const gap = 5 + Math.min(1, Math.max(0, move)) * 3
      + Math.min(1, Math.max(0, sprint)) * 10;
    e.classList.toggle("on", shown);
    e.classList.toggle("sprint", shown && sprinting);
    e.style.setProperty("--gap", `${gap.toFixed(1)}px`);
    e.setAttribute("aria-hidden", String(!shown));
    e.setAttribute("aria-label", sprinting ? "冲刺扩散准心" : "腰射准心");
  }

  /** 右下是姿态、弹药和装备；文字状态栏只保留伤情、屏息与命令。 */
  SetState({ stance = "stand", wounded, bleeding, bandages, breath, order,
    ammo = 0, clips = 0, magazine = 0, armed = true,
    grenades = 0, bundles = 0, mortar = 0, cooking = 0 }) {
    const stanceKey = STANCE_LABELS[stance] ? stance : "stand";
    this.el.combatStance.dataset.stance = stanceKey;
    this.el.combatStance.setAttribute("aria-label", STANCE_LABELS[stanceKey]);

    const rounds = AmmoReadout({ ammo, clips, magazine, armed });
    this.el.ammoCurrent.textContent = rounds.current;
    this.el.ammoReserve.textContent = rounds.reserve;
    this.el.combat.classList.toggle("lowAmmo", rounds.low);
    this.el.combat.classList.toggle("emptyAmmo", rounds.empty);

    for (const [key, value] of Object.entries({ grenades, bundles, mortar })) {
      const count = Math.max(0, Math.floor(Number(value) || 0));
      const item = this.el.equipment[key];
      item.querySelector("b").textContent = count;
      item.classList.toggle("empty", count <= 0);
    }

    const bits = [];
    if (bleeding > 0) bits.push(`<span class="b">流血</span>`);
    else if (wounded) bits.push(`<span class="w">带伤</span>`);
    if (bandages > 0) bits.push(`<span class="g">绷带 ${bandages}</span>`);
    if (breath) bits.push(`<span class="h">屏息</span>`);
    if (order) bits.push(`<span class="c">${order}</span>`);
    this.el.state.innerHTML = bits.join("");
    this.el.state.classList.toggle("on", bits.length > 0);
    // 蓄力条：攥着数几秒再扔，扔得远但引信也在烧。这一对取舍要看得见。
    this.el.cook.style.width = cooking > 0 ? `${Math.round(cooking * 120)}px` : "0";
    this.el.cook.classList.toggle("on", cooking > 0);
  }

  /**
   * 来弹指示器：屏幕中心外圈的一段弧，指向打你的那一枪是从哪来的。
   *
   * 为什么非要有：这一版之前玩家挨枪只有两件事会发生 —— 血掉了、暗角亮一点点
   *（而暗角是 health<70 才开始的，70 到 0 只隔两发）。也就是说在"还有得救"的
   * 那段血量里，屏幕上**什么都没发生**，玩家既不知道自己在挨打，更不知道朝哪边躲。
   * 弧是画在 SVG 里的，五个共用一份几何，转的时候只改 transform。
   */
  BuildHitDirs() {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "hudHitDirs");
    svg.setAttribute("viewBox", "-100 -100 200 200");
    this.hitDirPaths = [];
    for (let i = 0; i < 5; i += 1) {
      const path = document.createElementNS(NS, "path");
      // 朝正上（= 视线正前）的一段环形扇区，半径 60—76、张角 ±20°。
      path.setAttribute("d",
        "M-26.0,-71.4 A76,76 0 0 1 26.0,-71.4 L20.5,-56.4 A60,60 0 0 0 -20.5,-56.4 Z");
      path.setAttribute("class", "hudHitDir");
      path.style.opacity = "0";
      svg.appendChild(path);
      this.hitDirPaths.push(path);
    }
    this.root.appendChild(svg);
    this.el.hitDirs = svg;
  }

  /**
   * 命中记号。屏幕正中四道短撇往外弹一下就没。
   *
   * 为什么这个游戏需要它，尽管一路做到这里都在做减法：
   * 本作**没有准星、不打歼敌数**，所以命中因果必须另有一个克制的出口 ——
   * 血雾在一百米上是两三个像素，实录的 impactFlesh 走距离衰减到八十米只剩 4.8%。
   * 减法减到玩家读不出因果，减的就不是 UI 而是玩法了。
   *
   * 与 ER2 的差别：ER2 那一记是贴在准星上的，我们没有准星，所以它是**唯一**
   * 出现在屏幕正中的东西，也因此必须更短、更小、更暗 —— 命中 0.26 s、
   * 击杀 0.42 s，不打数字、不打"+1"、不累计连杀（docs/Data_DesignFirstPass.md §385）。
   *
   * @param {"hit"|"kill"} kind
   */
  Hitmark(kind = "hit") {
    this.el.hitmark.className = `hudHitmark on ${kind}`;
    // 旧值（命中 0.26 s / 击杀 0.42 s）在 60 Hz 下只亮 16 帧，第一帧又常被
    // 枪口焰和后坐遮掉；高分屏上的 1.5 px 细线更容易被抗锯齿吃掉。稍微延长，
    // 仍然短到不能被当成常驻准星，但玩家确实能读到这一枪有没有打中。
    this.hitmarkSpan = kind === "kill" ? 0.50 : 0.34;
    this.hitmarkTimer = this.hitmarkSpan;
    // 立刻亮，不等下一帧的 Update —— 命中回执迟一帧就等于枪响与记号对不上，
    // 而这一记号存在的全部理由就是"这一枪"和"打中了"要绑在同一个瞬间。
    this.el.hitmark.style.opacity = "1";
    this.el.hitmark.style.setProperty("--spread", "4px");
    // 取证：冒烟脚本拿它断言"打中了真的给了回执"，别靠解析 style。
    this.confirms.push(kind);
    if (this.confirms.length > 200) this.confirms.shift();
  }

  /**
   * 命中反馈的真实渲染状态，给浏览器冒烟取证。
   * 过去测试只数 `confirms`，即使 CSS 把四道线画成 0 px / 透明 / 压到别层下面也会过。
   */
  HitmarkState() {
    const strokes = [...this.el.hitmark.querySelectorAll(".t")];
    const style = getComputedStyle(this.el.hitmark);
    return {
      active: this.el.hitmark.classList.contains("on"),
      opacity: Number.parseFloat(style.opacity) || 0,
      zIndex: Number.parseInt(style.zIndex, 10) || 0,
      strokes: strokes.length,
      visibleStrokes: strokes.filter((stroke) => {
        const strokeStyle = getComputedStyle(stroke);
        return Number.parseFloat(strokeStyle.width) >= 7
          && Number.parseFloat(strokeStyle.height) >= 2
          && strokeStyle.backgroundColor !== "rgba(0, 0, 0, 0)";
      }).length,
    };
  }

  SetSuppression(v) {
    this.el.suppress.style.opacity = String(Math.min(1, v * 1.15));
  }

  /**
   * 受伤的全部画面反馈，一次调用。三层叠在同一张暗角上：
   *   · 底噪 —— 剩余血量（现在从 90 就开始渗，而不是 70：让"我该包扎了"提前到
   *     还有得救的时候；曲线取 1.6 次幂，越低涨得越快）；
   *   · 事件 —— 这一发的红闪（player.hitFlash，独立衰减，与剩余血量无关）；
   *   · 濒死 —— 40 以下整块暗角开始搏动（CSS 动画，零 JS 成本）。
   * 前两层取 max 而不是相加：相加会让"低血 + 连中"直接糊成纯红看不见路。
   */
  SetHurt({ health = 100, flash = 0, marks = null, yaw = 0 } = {}) {
    const base = Math.pow(Math.max(0, 1 - health / 90), 1.6) * 0.78;
    const v = Math.min(0.92, Math.max(base, flash * 0.85));
    this.el.damage.style.opacity = v.toFixed(3);
    this.el.damage.classList.toggle("low", health < 40 && health > 0);

    const paths = this.hitDirPaths;
    if (!paths) return;
    const list = marks || [];
    for (let i = 0; i < paths.length; i += 1) {
      const m = list[i];
      if (!m) { paths[i].style.opacity = "0"; continue; }
      // 世界方向 → 屏幕角。存的是世界向量，所以转身之后指示器跟着转 ——
      // 存屏幕角的话你一回头它就指错地方了。
      const sin = Math.sin(yaw), cos = Math.cos(yaw);
      const fwd = m.x * -sin + m.z * -cos;
      const right = m.x * cos + m.z * -sin;
      const deg = Math.atan2(right, fwd) * 180 / Math.PI;
      const life = m.max ? m.life / m.max : 0;
      paths[i].setAttribute("transform", `rotate(${deg.toFixed(1)})`);
      // 前 0.25 s 满亮，之后淡出：一眼看得见，但不会在屏幕上挂两秒。
      paths[i].style.opacity = (Math.min(1, life * 1.35) * 0.92).toFixed(3);
    }
  }

  Say(speaker, text, seconds = 3.6, variant = "") {
    this.el.subtitle.innerHTML = speaker
      ? `<span class="who">${speaker}</span><span class="txt">${text}</span>`
      : `<span class="txt narr">${text}</span>`;
    this.el.subtitle.className = `hudSubtitle on${variant ? " " + variant : ""}`;
    this.subtitleTimer = seconds;
    // 留一份纯文本给通关冒烟断言用 —— 靠解析 innerHTML 判断"台词有没有出现过"
    // 一改样式就会碎，而这条断言是剧本层唯一的回归保护。
    this.spoken.push(String(text));
    if (this.spoken.length > 400) this.spoken.shift();
  }

  /**
   * 章节卡：阶段开场那一行大字。
   *
   * 【2026-08-20 修「开场三层字叠在一起」】
   * 实测 1600×900 phase=0：简报可见窗 1.18—8.73 s，章节卡 2.63—7.31 s ——
   * **章节卡整个生命周期完全套在简报里面，重合 4.68 s，重合率 100%**，
   * 再加上一直在的目标指示器，开场固定有 4.7 秒三层文字互相压着。
   * 1280×720 上最糟：12 对墨迹重叠、7412 px²，「界 河」大字直接压在简报第二行上。
   * 1920×1080 之所以看着没事，是简报右边界离副标题只差 **7 px** ——
   * 版式里没有任何互斥保证，纯属侥幸。
   *
   * 因果上这本来就该是**顺序**关系：Script_Story.mjs:138 那行
   * `this.sinceLast = MIN_GAP;  // 开场不要立刻甩台词，让 brief 先说完`
   * 想要的就是这个，但它把闸门变量设成了闸门阈值本身，等于开场就把闸门打开，
   * 第一条 beat 0.8 s 就播 —— 注释想要的效果一次都没生效过。
   *
   * 这里不去动 Story 的节拍（那会改变每关播完多少条 beat，PlayTest 第 8 组在数），
   * 只把**显示**排到简报后面：beat 照常推进、sinceLast 照常清零，
   * 纯粹是这张卡片晚一点浮出来。0.55 s 的补偿是让简报那 0.6 s 的淡出先走完，
   * 不然两张卡会在低透明度上擦一下。
   */
  Title(text, sub = "") {
    this.spoken.push(String(text));
    if (this.briefTimer > 0) {
      this.pendingTitle = { text, sub, wait: this.briefTimer + TITLE_AFTER_BRIEF_S };
      return;
    }
    this._ShowTitle(text, sub);
  }

  _ShowTitle(text, sub) {
    this.el.title.innerHTML = `<div class="tMain">${text}</div>`
      + (sub ? `<div class="tSub">${sub}</div>` : "");
    this.el.title.classList.add("on");
    this.titleTimer = 4.2;
  }

  /** 尾声：一行一行浮出来，不打歼敌数。 */
  ShowEpilogue(lines) {
    this.el.epilogue.innerHTML = lines
      .map((l) => (l ? `<div class="eLine">${l}</div>` : `<div class="eGap"></div>`))
      .join("");
    this.el.epilogue.classList.add("on");
    for (const l of lines) if (l) this.spoken.push(String(l));
  }

  /**
   * 收掉尾声。从菜单重开一关时必须调 —— 不收的话新一关会顶着上一局的结算跑，
   * 而那一层是不透明的黑底（.hudEpilogue.on），玩家看到的是"进不去游戏"。
   */
  HideEpilogue() {
    this.el.epilogue.classList.remove("on");
  }

  Hint(text, seconds = 4.5) {
    this.el.hint.textContent = text;
    this.el.hint.classList.add("on");
    this.hintTimer = seconds;
  }

  /**
   * 常驻的情境操作提示，与 Hint 的一次性反馈分开。
   * 调用方可以每 0.1 秒重算；签名不变就完全不动 DOM，避免战斗中反复触发布局。
   */
  SetActionPrompts(prompts = []) {
    const next = prompts
      .filter((prompt) => prompt?.keys && prompt?.label)
      .slice(0, 3)
      .map((prompt) => ({
        keys: String(prompt.keys), label: String(prompt.label), kind: String(prompt.kind || "action"),
      }));
    const signature = next.map((prompt) => `${prompt.kind}:${prompt.keys}:${prompt.label}`).join("|");
    if (signature === this.actionPromptSignature) return;
    this.actionPromptSignature = signature;
    this.actionPrompts = next;
    this.el.actions.textContent = "";
    for (const prompt of next) {
      const row = document.createElement("div");
      row.className = `hudAction ${prompt.kind}`;
      const key = document.createElement("kbd");
      key.textContent = prompt.keys;
      const icon = document.createElement("span");
      icon.className = "ico";
      icon.innerHTML = ACTION_ICONS[prompt.kind] || ACTION_ICONS.action;
      // 文字不上屏，只留在无障碍属性里
      row.title = prompt.label;
      row.setAttribute("aria-label", `${prompt.keys}：${prompt.label}`);
      row.append(key, icon);
      this.el.actions.appendChild(row);
    }
    this.el.actions.classList.toggle("on", next.length > 0);
  }

  /** 史实注记卡片。排队弹，不叠在一起。 */
  Note(note) {
    this.noteQueue.push(note);
  }

  /**
   * 阵亡卡片。照 Easy Red 2 的呈现：第一人称倒地画面仍看得见，
   * 全屏半透明去色，姓名（特大加粗）-> 籍贯地名 · 生卒（小）-> 番号（更小更暗）。
   *
   * 为什么这张卡值得单独讲究：它是这个游戏唯一一处把"一条命"具体化的地方。
   * 姓名是中文的、籍贯是真地名（河北雄县、河南尉氏、陕西泾阳…按第 2 集团军的
   * 实际构成抽），生年由年龄反推 —— 十七到三十四岁，绝大多数活不到二十五。
   * 孙连仲那句命令的原话就是这个机制：「士兵打完了，你自己填上去。你填过了，我来填。」
   */
  ShowDeathCard(identity, unit, seconds) {
    const born = 1938 - identity.age;
    this.el.deathCard.innerHTML =
      `<div class="dcBiography">`
      + `<div class="dcKicker">阵亡</div>`
      + `<div class="dcName">${identity.name}</div>`
      + `<div class="dcRule"></div>`
      + `<div class="dcYears">${born} — 1938</div>`
      + `<div class="dcOrigin">${identity.origin}</div>`
      + `<div class="dcUnit">${unit}</div>`
      + `</div>`;
    this.el.deathCard.classList.add("on");
    // 卡片在的时候把功能 HUD 全压掉，但底下的第一人称战场继续渲染。
    this.root.classList.add("deathCardOn");
    this.deathTimer = seconds;
  }

  HideDeathCard() {
    this.el.deathCard.classList.remove("on");
    this.root.classList.remove("deathCardOn");
  }

  ShowBrief(phase) {
    // 旧版把每关三四句史实全铺在左侧，正好又与顶部目标、人物喊话同时出现。
    // 战术 HUD 只需要一条“刚发生了什么”；其余内容继续由关内对白和史实注记承接。
    const headline = phase.brief.find((line) => String(line || "").trim()) || phase.label;
    this.el.brief.innerHTML = `<div class="bTitle">${phase.date}</div>`
      + `<div class="bLine">${headline}</div>`;
    this.el.brief.classList.add("on");
    this.briefTimer = 4.0;
    // 换关了：上一关没来得及浮出来的章节卡就地作废，别飘到下一关去
    this.pendingTitle = null;
  }

  /** 屏幕空间的占领点图标。ER2：交叉刀剑＝待打，旗帜＝已占。 */
  UpdateMarkers(objectives, camera, project) {
    const box = this.el.markers;
    while (box.children.length < objectives.length) {
      const m = document.createElement("div");
      m.className = "hudMarker";
      m.innerHTML = `<span class="ico"></span><span class="nm"></span><span class="bar"><i></i></span>`;
      box.appendChild(m);
    }
    // 先把可见的都投影出来，再统一避让 —— 逐个直接写 left/top 是叠成一坨的根因。
    const placed = [];
    objectives.forEach((o, i) => {
      const el = box.children[i];
      const p = project(o.x, o.y ?? 1.6, o.z);
      if (!p.visible) { el.style.display = "none"; return; }
      el.style.display = "";
      el.className = `hudMarker ${o.owner === "nra" ? "ours" : o.contested ? "fight" : "theirs"}`;
      el.children[0].textContent = o.owner === "nra" ? "▲" : "✕";
      el.children[1].textContent = `${o.name} ${Math.round(p.dist)}m`;
      el.children[2].firstChild.style.width = `${Math.round(o.progress * 100)}%`;
      placed.push({ el, x: p.x, y: p.y, dist: p.dist });
    });

    // 纵向避让：近的先占位（它更要紧），远的往下挪，直到不再压着任何一个已放好的。
    // 只在横向也挨着（|dx| < MARKER_SEP_X）时才算撞 —— 屏幕两头的两个路标
    // 纵坐标一样也互不干扰，一刀切地往下推会把标签甩到画面外。
    placed.sort((a, b) => a.dist - b.dist);
    const done = [];
    for (const m of placed) {
      let guard = 0;
      let moved = true;
      while (moved && guard < 16) {
        moved = false;
        guard += 1;
        for (const d of done) {
          if (Math.abs(d.x - m.x) >= MARKER_SEP_X) continue;
          if (Math.abs(d.y - m.y) >= MARKER_SEP_Y) continue;
          m.y = d.y + MARKER_SEP_Y;
          moved = true;
        }
      }
      done.push(m);
      m.el.style.left = `${m.x}px`;
      m.el.style.top = `${m.y}px`;
    }
  }

  /**
   * Easy Red 2 式近弹提示：图标钉在手榴弹的屏幕位置；转身把它甩出视野后，
   * 图标贴到屏幕边缘继续指方向。只接收 CombatSystem 按真实伤害范围筛过的弹，
   * HUD 不重复发明“附近”是多少米。
   */
  UpdateGrenadeWarnings(threats, player, project) {
    const box = this.el.grenadeWarnings;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    const edgeX = Math.max(40, centerX - 58);
    const edgeY = Math.max(40, centerY - 76);
    const count = Math.min(GRENADE_WARNING_LIMIT, threats.length);

    for (let i = 0; i < GRENADE_WARNING_LIMIT; i += 1) {
      const el = box.children[i];
      if (i >= count) { el.style.display = "none"; continue; }
      const threat = threats[i];
      const p = project(threat.position.x, threat.position.y + 0.45, threat.position.z);
      let x = p.x;
      let y = p.y;
      let offscreen = !p.visible;

      if (offscreen) {
        const dx = threat.position.x - player.position.x;
        const dz = threat.position.z - player.position.z;
        const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
        const forward = dx * -sin + dz * -cos;
        const right = dx * cos + dz * -sin;
        const angle = Math.atan2(right, forward);
        x = centerX + Math.sin(angle) * edgeX;
        y = centerY - Math.cos(angle) * edgeY;
      }
      x = Math.max(42, Math.min(width - 42, x));
      y = Math.max(48, Math.min(height - 48, y));

      const urgent = threat.fuse <= 1.35;
      const lethal = threat.distance <= threat.dangerRadius * 0.58;
      el.style.display = "";
      el.style.left = `${x.toFixed(1)}px`;
      el.style.top = `${y.toFixed(1)}px`;
      el.className = `hudGrenadeWarning${offscreen ? " edge" : ""}`
        + `${urgent ? " urgent" : ""}${lethal ? " lethal" : ""}`;
      el.children[1].textContent = `${threat.kind === "GrenadeBundle" ? "集束" : "手榴弹"}`
        + ` ${Math.max(1, Math.ceil(threat.distance))}m`;
      el.setAttribute("aria-label", `${el.children[1].textContent}，附近爆炸物`);
    }
  }

  /** 小地图：200ms 重绘一次就够，不必每帧。 */
  UpdateMinimap(dt, { player, objectives, soldiers, bounds }) {
    // 地图收起时连 Canvas 都不重绘；按 M 打开后的第一帧会立刻补一张。
    if (!this.minimapVisible) return;
    this.minimapDirty += dt;
    if (this.minimapDirty < 0.2) return;
    this.minimapDirty = 0;
    const ctx = this.minimapCtx;
    const W = this.el.minimap.width, H = this.el.minimap.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(14,13,11,0.72)";
    ctx.fillRect(0, 0, W, H);
    const span = 260;
    const toMap = (x, z) => [
      W / 2 + (x - player.position.x) / span * W,
      H / 2 + (z - player.position.z) / span * H,
    ];
    // 占领点
    for (const o of objectives) {
      const [mx, my] = toMap(o.x, o.z);
      ctx.beginPath();
      ctx.arc(mx, my, (o.radius / span) * W, 0, Math.PI * 2);
      ctx.strokeStyle = o.owner === "nra" ? "rgba(150,190,230,0.75)" : "rgba(210,110,90,0.75)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    // 只画班组级的圆圈，不画个体敌人（ER2 的做法：敌方标记落在班组几何中心）
    let ex = 0, ez = 0, en = 0;
    for (const s of soldiers) {
      if (!s.alive) continue;
      if (s.side === "nra") {
        const [mx, my] = toMap(s.position.x, s.position.z);
        ctx.fillStyle = "rgba(160,200,240,0.85)";
        ctx.fillRect(mx - 1.2, my - 1.2, 2.4, 2.4);
      } else if (s.position.distanceTo(player.position) < 90) {
        ex += s.position.x; ez += s.position.z; en += 1;
      }
    }
    if (en > 0) {
      const [mx, my] = toMap(ex / en, ez / en);
      ctx.beginPath();
      ctx.arc(mx, my, 7 + en * 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(214,96,70,0.8)";
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // 玩家：一个朝向三角
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-player.yaw);
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fillStyle = "#e8e0cc";
    ctx.fill();
    ctx.restore();
  }

  /** 对齐 ER2：地图默认隐藏，M 键按需切换。 */
  SetMinimapVisible(on) {
    this.minimapVisible = !!on;
    this.el.minimap.classList.toggle("on", this.minimapVisible);
    this.el.minimap.setAttribute("aria-hidden", String(!this.minimapVisible));
    if (this.minimapVisible) this.minimapDirty = 0.2;
    return this.minimapVisible;
  }

  ToggleMinimap() {
    return this.SetMinimapVisible(!this.minimapVisible);
  }

  /**
   * 每 0.25 s 刷一次的平均帧率。
   * 用 performance.now 自己量，不吃传进来的 dt —— 主循环那个 dt 被 clamp 到
   * 0.05（见 Script_Main），真掉到 12 fps 时它照样报 20，读数就没意义了。
   */
  UpdateFps(dt) {
    if (!(dt > 0)) { this.fpsLast = 0; return; }           // 暂停时清掉基准，恢复后不把停顿算成一帧
    const now = performance.now();
    if (this.fpsLast === 0) { this.fpsLast = now; return; }
    this.fpsAccum += (now - this.fpsLast) / 1000;
    this.fpsLast = now;
    this.fpsFrames += 1;
    if (this.fpsAccum < 0.25) return;
    const fps = Math.round(this.fpsFrames / this.fpsAccum);
    this.fpsAccum = 0;
    this.fpsFrames = 0;
    this.el.fps.textContent = `${fps} FPS`;
    this.el.fps.classList.toggle("low", fps < 30);
  }

  Update(dt) {
    this.UpdateFps(dt);
    // 命中记号：往外弹 + 淡出。用 JS 补间而不是 CSS 动画，因为同一记号会被
    // 连续两发连点重播，CSS 动画重启要靠强制回流那一套 hack，在这里不值当。
    if (this.hitmarkTimer > 0) {
      this.hitmarkTimer -= dt;
      const k = Math.max(0, this.hitmarkTimer / this.hitmarkSpan);
      this.el.hitmark.style.opacity = String(k * k);      // 平方：收尾快，不拖尾巴
      this.el.hitmark.style.setProperty("--spread", `${(1 - k) * 3 + 4}px`);
      if (this.hitmarkTimer <= 0) {
        this.el.hitmark.className = "hudHitmark";
        this.el.hitmark.style.opacity = "0";
      }
    }
    if (this.subtitleTimer > 0) {
      this.subtitleTimer -= dt;
      if (this.subtitleTimer <= 0) this.el.subtitle.classList.remove("on");
    }
    if (this.titleTimer > 0) {
      this.titleTimer -= dt;
      if (this.titleTimer <= 0) this.el.title.classList.remove("on");
    }
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.el.hint.classList.remove("on");
    }
    if (this.briefTimer > 0) {
      this.briefTimer -= dt;
      if (this.briefTimer <= 0) this.el.brief.classList.remove("on");
    }
    // 排在简报后面的章节卡（见 Title 的注释）
    if (this.pendingTitle) {
      this.pendingTitle.wait -= dt;
      if (this.pendingTitle.wait <= 0) {
        this._ShowTitle(this.pendingTitle.text, this.pendingTitle.sub);
        this.pendingTitle = null;
      }
    }
    // 开场演出在的时候把目标指示器压下去。指示器整关都在，唯独这十来秒不该
    // 跟大字抢同一条带子 —— 实测那一帧最糟的一条 40 px 高的带子里同时排着
    // 简报第三行、章节副标题、和两个「▲ + 名字 + 距离」，
    // 「界河南岸 50m」这行字中间被另一个 ▲ 直接钉穿。
    this.root.classList.toggle("staging", this.briefTimer > 0 || this.titleTimer > 0);
    if (this.deathTimer > 0) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) this.HideDeathCard();
    }
    // 注记排队
    if (this.noteTimer > 0) {
      this.noteTimer -= dt;
      if (this.noteTimer <= 0) this.el.note.classList.remove("on");
    } else if (this.noteQueue.length) {
      const n = this.noteQueue.shift();
      this.el.note.innerHTML = `<div class="nTier">${n.tier}</div>`
        + `<div class="nTitle">${n.title}</div>`
        + `<div class="nBody">${n.body}</div>`;
      this.el.note.classList.add("on");
      this.noteTimer = 9.5;
    }
  }

  /**
   * 下令面板已经改成 Script_Wheel 的径向轮盘（按住 Tab 推鼠标选）。
   * 这里留一个空实现是为了让"命令面板归 HUD 管"这条契约还在 ——
   * 轮盘自己画自己的，HUD 只需要知道它现在是开着的（将来要压暗其余 UI 时从这儿改）。
   */
  SetOrdersVisible(on) {
    this.ordersOpen = !!on;
  }

  /**
   * 过场模式：整套 HUD 让位（准星、弹药、小地图、提示全部淡出），
   * 只留过场自己挂在同一个根下的字幕层。过场一完就还回来。
   */
  SetCinematic(on) {
    this.root.classList.toggle("cinematic", !!on);
  }
}
