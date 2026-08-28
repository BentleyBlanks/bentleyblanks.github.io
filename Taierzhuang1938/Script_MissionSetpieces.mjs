// 《滕县 一九三八》章节摆点 —— 把七章的内容与四批玩法系统真正接起来的那一层。
//
// **纯规则，不许 import three。** 摆的是「在哪儿、什么时候、对谁」，
// 造几何与出声全走宿主注入的窄回调，所以整层在纯 Node 里跑得完
//（回归口 `Script_MissionSetpiecesTest.mjs`）。
//
// ── 为什么是一个模块，而不是七章 if-else 糊进 Script_Main ────────────────────
// 集成批 INT2 的活是「把七章内容与全部系统真正接通」。这件事有两种做法：
//   ① 在 Script_Main 的 EnterLevel 里写 `if (phase.id === "CH1_NanLu") { ... }`
//      七段 —— 装配层从此同时是关卡内容的容器，每加一拍都要动那个 5300 行的文件；
//   ② 把「哪一章在哪一拍做什么」写成**数据**，引擎只提供动词。
// 这里取 ②。`SETPIECES` 是一张按 levelId 索引的表，一章一条，**每章的摆点集中一处
// 可读**（AGENTS 的工程口径）。装配层只做三件事：建一次导演、每帧推一下、换关时
// 告诉它换到哪一章去了。
//
// ── 一章能挂的四种钩子（一条都不多）─────────────────────────────────────────
//   Setup(s)            换关时摆一次：交互点、机枪位、后送队、道具、时刻表。
//   onZone[zoneId](s)   玩家**第一次**走进那个路标时。
//   onVoice[key](s)     某一条台词**播出去之后**（key 就是 beat.voice）。
//                       这是最要紧的一种：剧本节拍与玩法节拍从此对得上 ——
//                       「顺子喊完『老子回去压住！』」与「播转身那一场」是同一拍。
//   Update(s, dt)       每帧（计时器、队列、状态机）。
//
// 四种都拿到同一个 `s`（SetpieceContext）：它把宿主的窄回调与七个玩法系统
// 包成一层薄门面，并且**每一个系统都可能是 null**（出图、靶场、纯规则测试里
// 它们根本不存在）。所以门面上每个方法都自己判空 —— 章节数据里不许写 `if (s.carry)`。
//
// ── 三条纪律 ────────────────────────────────────────────────────────────────
//
// 一、**玩家永远不被夺走移动权。** 这一层不锁视角、不锁移动、不替玩家按键。
//     唯一的例外是策划案点名的那 4—6 秒固定事件（四关罗班长救顺子），
//     而它走的是**关中过场**（同一个 RunCutscene，Esc 语义与关首过场一致），
//     不是自己造一套「不能动」的状态。
//
// 二、**不重复实现玩法。** 担架、机枪、扫射、照明弹、发报、白刃、交互点、
//     具名同伴、检查点 —— 九个系统都已经有了，这一层只负责**摆**它们。
//     这里出现的每一行 new 都该是可疑的。
//
// 三、**推信号，不改剧本。** 摆点层与叙事层的接缝只有一条：`story.Signal(name)`。
//     名字在各章 `Data_MissionChX.EVENTS` 里登记，判据兜底也在那儿；
//     这一层只负责在**事实发生的那一刻**推它（推过的永远优先于时刻表）。

import {
  BleedControlInteraction, CheckWoundedInteraction, DoorPlankInteraction,
  WireInteractions, CutWireInteraction, LeafletPickupInteraction, LeafletBurnInteraction,
  TearShirtInteraction, PickUpLoadInteraction, GiveSupplyInteraction,
} from "./Script_Interact.mjs";
import { EmplacementInteraction, AmmoResupplyInteraction } from "./Script_Emplacement.mjs";
import { TelegraphKeyInteraction, TelegraphReconnectInteraction } from "./Script_Telegraph.mjs";

// ---------------------------------------------------------------------------
// 数值
// ---------------------------------------------------------------------------

/**
 * 摆点层自己的旋钮。**数只在这里**，章节数据与文档只写常量名（AGENTS 硬规矩 12）。
 *
 * columnSpeedMS   后送队的推进速度。**必须比玩家搬运态慢**：
 *                 Script_Carry.CARRY_KINDS.stretcher 的 speedScale 是 0.42，
 *                 玩家常态步行约 4.2 m/s → 抬着担架约 1.76 m/s。
 *                 队列取 1.35 m/s，玩家抬着担架也追得上（Data_MissionCh1
 *                 的 ENGINE_REQUEST 2 明写「不然阶段七玩家抬着担架会被自己人甩掉」）。
 * columnWaitM     玩家落后这么远，队列停下等他。
 * columnResumeM   等到玩家追进这个距离才重新走（带迟滞，不然会在阈值上抖）。
 * columnSpanM     队列纵深：从队头到队尾。
 * columnLaneM     并排两列的横向间距。
 * columnScatterM  遇袭时往路沟一侧散开多远。
 * columnRegoalS   多久给每个人重设一次目标（每帧写目标 = 每帧打断寻路）。
 */
export const SETPIECE_TUNING = Object.freeze({
  columnSpeedMS: 1.35,
  columnWaitM: 26,
  columnResumeM: 17,
  columnSpanM: 22,
  columnLaneM: 3.2,
  columnScatterM: 7.5,
  columnRegoalS: 0.5,
});

const Num = (value, fallback = 0) => {
  const v = Number(value);
  return Number.isFinite(v) ? v : fallback;
};

// ---------------------------------------------------------------------------
// 后送队（最小队列控制器）
//
// 「2 担架（各 2 担架员抬）＋2 护卫＋可行走伤兵＋百姓沿路点位推进」。
// 一关的武装后送与五关的分段护送用的是**同一台**控制器 —— 两关的差别只有
// 路点、人数与「玩家在队里还是在队边上」，不是两套逻辑。
//
// 做什么：按路点推一个虚拟的**队头**，每个成员在队头后面认领一个固定的槽位。
// 不做什么：群体避障、编队重组、担架员被打倒之后自动补位的完整逻辑
//（策划案原话「不追求群体避障完美」）。担架员倒下时槽位空着 —— 这正是
// 一关阶段七「一名担架员中弹 → 顺子，接后头！」要的画面。
// ---------------------------------------------------------------------------

export class EscortColumn {
  /**
   * @param {object} host 与 CompanionDirector 同一套窄回调（装配层复用同一份）：
   *   Time() / PlayerPos() / SetGoal(handle,x,z) / PositionOf(handle) / Alive(handle)
   *   SpawnActor({label,x,z,weapon,squadId}) -> handle|null / Despawn(handle)
   * @param {object} spec
   *   waypoints  [{x,z}, ...]      队列走线（一般就是本章路标的一串）
   *   members    [{role,label,weapon}]  角色：bearer / guard / walking / civilian
   *   tuning     覆盖 SETPIECE_TUNING 的部分字段
   */
  constructor(host = {}, spec = {}) {
    this.host = host;
    this.tuning = { ...SETPIECE_TUNING, ...(spec.tuning || {}) };
    this.waypoints = (spec.waypoints || []).map((p) => ({ x: Num(p.x), z: Num(p.z) }));
    this.roster = spec.members || [];
    this.members = [];
    this.legIndex = 0;
    /** 队头在当前航段上走了多远（米）。 */
    this.legT = 0;
    this.moving = false;
    this.started = false;
    this.scattered = false;
    this.scatterUntil = -1;
    this.regoalAt = -99;
    this.arrived = false;
    this.log = [];
  }

  /** 队列里还站着的人。 */
  get Alive() {
    return this.members.filter((m) => m.handle && this._Alive(m.handle));
  }

  get Count() { return this.members.length; }

  /** 抬担架那几个（点名扫射白名单时要挑他们）。 */
  get Bearers() { return this.Alive.filter((m) => m.role === "bearer"); }
  /** 可行走伤兵与百姓（第二轮扫射的另一类目标）。 */
  get Civilians() { return this.Alive.filter((m) => m.role === "civilian" || m.role === "walking"); }

  _Alive(handle) {
    return this.host.Alive ? !!this.host.Alive(handle) : true;
  }

  /** 队头此刻在哪儿（世界坐标）。路点走完了就停在最后一个点上。 */
  HeadPosition() {
    const pts = this.waypoints;
    if (!pts.length) return null;
    const i = Math.min(this.legIndex, pts.length - 2);
    if (pts.length === 1 || this.legIndex >= pts.length - 1) return { ...pts[pts.length - 1] };
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const t = Math.min(1, this.legT / len);
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
  }

  /** 队头的朝向（单位向量）。散开与排槽位都要用它。 */
  HeadDirection() {
    const pts = this.waypoints;
    if (pts.length < 2) return { x: 0, z: 1 };
    const i = Math.min(this.legIndex, pts.length - 2);
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
  }

  /**
   * 造人并开始走。**不许传送**（策划案原文）：所有人都在第一个路点附近生成，
   * 然后自己走 —— 玩家跟着走的那一段是这一关的内容，不是过渡。
   */
  Start() {
    if (this.started) return this.members.length;
    this.started = true;
    this.moving = true;
    const head = this.HeadPosition();
    if (!head) return 0;
    const dir = this.HeadDirection();
    const right = { x: -dir.z, z: dir.x };
    this.roster.forEach((entry, index) => {
      const slot = this._Slot(index, entry);
      const x = head.x - dir.x * slot.back + right.x * slot.lateral;
      const z = head.z - dir.z * slot.back + right.z * slot.lateral;
      let handle = null;
      try {
        handle = this.host.SpawnActor ? this.host.SpawnActor({
          label: entry.label || "后送队", x, z,
          weapon: entry.weapon || null, squadId: "EscortColumn",
        }) : null;
      } catch (err) {
        this.log.push({ label: entry.label, ok: false, why: String((err && err.message) || err) });
        return;
      }
      if (!handle) { this.log.push({ label: entry.label, ok: false, why: "宿主没造出来（人口预算满了）" }); return; }
      this.members.push({ ...entry, handle, slot, index });
      this.log.push({ label: entry.label, ok: true, x: +x.toFixed(1), z: +z.toFixed(1) });
    });
    return this.members.length;
  }

  /** 第 index 个人站在队头后面多远、偏左右多少。 */
  _Slot(index, entry) {
    const rows = Math.max(1, Math.ceil(this.roster.length / 2));
    const row = Math.floor(index / 2);
    const side = index % 2 === 0 ? -1 : 1;
    // 担架在最前面（白布要在弹线经过的画面里），护卫在两侧，百姓压尾。
    const bias = entry.role === "bearer" ? 0 : entry.role === "guard" ? 0.35 : 0.7;
    return {
      back: (this.tuning.columnSpanM * (row / Math.max(1, rows))) + bias * 4,
      lateral: side * this.tuning.columnLaneM * (entry.role === "guard" ? 1.6 : 1),
    };
  }

  /** 遇袭：整队往路沟一侧扑。seconds 之后自己爬起来接着走。 */
  Scatter(seconds = 12) {
    this.scattered = true;
    this.scatterUntil = (this.host.Time ? this.host.Time() : 0) + Math.max(1, seconds);
    this.moving = false;
    this.regoalAt = -99;
    return true;
  }

  /** 收摊。**不 Kill** —— 撤走不是阵亡。 */
  Reset() {
    for (const m of this.members) {
      if (m.handle && this.host.Despawn) {
        try { this.host.Despawn(m.handle); } catch { /* 宿主的事 */ }
      }
    }
    this.members.length = 0;
    this.started = false;
    this.moving = false;
    this.scattered = false;
    this.legIndex = 0;
    this.legT = 0;
    this.arrived = false;
  }

  Update(dt) {
    if (!this.started) return false;
    const now = this.host.Time ? this.host.Time() : 0;
    if (this.scattered && now >= this.scatterUntil) {
      this.scattered = false;
      this.moving = true;
    }
    const head = this.HeadPosition();
    if (!head) return false;
    const player = this.host.PlayerPos ? this.host.PlayerPos() : null;
    // 玩家落后就等 —— 「不许传送」的另一半是「不许把人甩掉」。
    if (player && !this.scattered) {
      const gap = Math.hypot(player.x - head.x, player.z - head.z);
      if (this.moving && gap > this.tuning.columnWaitM) this.moving = false;
      else if (!this.moving && gap < this.tuning.columnResumeM) this.moving = true;
    }
    if (this.moving && this.legIndex < this.waypoints.length - 1) {
      const a = this.waypoints[this.legIndex];
      const b = this.waypoints[this.legIndex + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      this.legT += this.tuning.columnSpeedMS * Math.max(0, dt);
      while (this.legT >= len && this.legIndex < this.waypoints.length - 1) {
        this.legT -= len;
        this.legIndex += 1;
        if (this.legIndex >= this.waypoints.length - 1) { this.arrived = true; this.legT = 0; break; }
      }
    }
    if (now - this.regoalAt < this.tuning.columnRegoalS) return true;
    this.regoalAt = now;
    const dir = this.HeadDirection();
    const right = { x: -dir.z, z: dir.x };
    const scatterSide = this.scattered ? this.tuning.columnScatterM : 0;
    for (const m of this.members) {
      if (!m.handle || !this._Alive(m.handle)) continue;
      const lateral = m.slot.lateral + (this.scattered ? -scatterSide : 0);
      const x = head.x - dir.x * m.slot.back + right.x * lateral;
      const z = head.z - dir.z * m.slot.back + right.z * lateral;
      this.host.SetGoal?.(m.handle, x, z);
    }
    return true;
  }

  State() {
    return {
      started: this.started, moving: this.moving, scattered: this.scattered,
      arrived: this.arrived, leg: this.legIndex, legT: +this.legT.toFixed(1),
      alive: this.Alive.length, total: this.members.length,
      head: this.HeadPosition(), log: this.log.slice(),
    };
  }
}

// ---------------------------------------------------------------------------
// 摆点上下文
//
// 章节数据拿到的就是这一个对象。它做两件事：
//   · 把七个玩法系统与宿主回调包成**判空过的**门面（章节里不写 if (s.carry)）；
//   · 提供 `mem`（这一关的便签本）、`Once`（只做一次）、`After`（几秒之后做）。
// ---------------------------------------------------------------------------

class SetpieceContext {
  constructor(director) {
    this.d = director;
    /** 这一关的便签本。换关清空。 */
    this.mem = director.mem;
  }

  get levelId() { return this.d.levelId; }
  get phase() { return this.d.phase; }
  get tag() { return this.d.levelId; }

  // --- 系统（每一个都可能是 null）-------------------------------------------
  get story() { return this.d.host.Story?.() || null; }
  get carry() { return this.d.host.Carry?.() || null; }
  get interact() { return this.d.host.Interact?.() || null; }
  get emplacement() { return this.d.host.Emplacement?.() || null; }
  get strafe() { return this.d.host.Strafe?.() || null; }
  get flare() { return this.d.host.Flare?.() || null; }
  get telegraph() { return this.d.host.Telegraph?.() || null; }
  get companion() { return this.d.host.Companion?.() || null; }
  get checkpoint() { return this.d.host.Checkpoint?.() || null; }

  // --- 时间与位置 -----------------------------------------------------------
  Time() { return Num(this.d.host.Time?.(), 0); }
  LevelTime() { return Num(this.d.host.LevelTime?.(), 0); }
  PlayerPos() { return this.d.host.PlayerPos?.() || null; }
  PlayerZone() { return this.d.host.PlayerZone?.() || null; }

  /** 本章某个路标（{id,x,z,radius}）。写错 id 返回 null，不抛。 */
  Zone(id) {
    const zones = this.d.phase?.zones || [];
    return zones.find((z) => z && z.id === id) || null;
  }

  /** 路标附近的一个点。dx/dz 是相对路标圆心的偏移（米）。 */
  Near(zoneId, dx = 0, dz = 0) {
    const zone = this.Zone(zoneId);
    if (!zone) return null;
    return { x: zone.x + dx, y: Num(this.d.host.Ground?.(zone.x + dx, zone.z + dz), 0), z: zone.z + dz };
  }

  // --- 叙事 -----------------------------------------------------------------
  /** 推一条事件。名字在本章 EVENTS 里登记过 —— 这一层不发明名字。 */
  Signal(name) {
    if (!name) return false;
    this.d.signals.push({ name, at: +this.LevelTime().toFixed(1) });
    return !!this.story?.Signal(name);
  }

  /** 这条台词播过没有（key 就是 beat.voice）。 */
  Spoken(key) { return this.d.spoken.has(key); }

  Hint(text, seconds = 3) { this.d.host.Hint?.(text, seconds); }
  Say(who, text, seconds = 3) { this.d.host.Say?.(who, text, seconds); }

  // --- 便签 -----------------------------------------------------------------
  /** 同一个 key 只做一次（跨帧）。返回「这一次做了没有」。 */
  Once(key, fn) {
    if (this.d.once.has(key)) return false;
    this.d.once.add(key);
    fn?.(this);
    return true;
  }

  /** seconds 秒之后做一次。到点由 Update 派发。 */
  After(seconds, fn, key = null) {
    this.d.timers.push({ at: this.Time() + Math.max(0, Num(seconds, 0)), fn, key });
    return true;
  }

  /**
   * 摆一个交互点（自动带上本章的 tag，换关时一把清掉）。
   *
   * **tag 必须写在展开之后。** 交互预制（PickUpLoadInteraction 之类）
   * 返回的对象里带着 `tag: null` 那个默认值 —— 写成 `{ tag, ...spec }`
   * 会被它盖成 null，于是换关时 `Clear(levelId)` 一个都清不掉，
   * 上一关的交互点在新切片的同一坐标上悄悄复活。
   */
  Register(spec) {
    if (!spec || !this.interact) return null;
    return this.interact.Register({ ...spec, tag: spec.tag ?? this.d.levelId });
  }

  /** 摆一件关内道具。宿主没接线时返回 null —— 章节侧不因此报错。 */
  Prop(spec) { return this.d.host.Prop?.({ ...spec, tag: spec.tag ?? this.d.levelId }) || null; }

  /** 造一个演员（后送队、担架员、机枪副射手…）。 */
  SpawnActor(spec) { return this.d.host.SpawnActor?.(spec) || null; }

  /** 建一支后送队（一关与五关共用同一台控制器）。 */
  Column(spec) {
    const column = new EscortColumn(this.d.host, spec);
    this.d.columns.push(column);
    return column;
  }
}

// ---------------------------------------------------------------------------
// A 区三章的环境递进（§0「三个功能院落」）
//
// 「同一个院子三次出场，环境递进：③有序拥挤/电话通/搬药拆门板 → ④伤员剧增/
//  满地绷带血水/医护不足 → ⑤部分坍塌/治疗区被炮毁/熟人缺席/白布担架药箱散落。」
//
// 为什么走**运行时**摆件而不是布设层：Script_ExternalProps / Data_Dressing_* 是
// 按世界坐标铺的，同一只箱子在三关的同一个位置 —— 那正是「同一座城」要的性质，
// 但它表达不了「同一个院子越来越破」。这里只摆**差异**的那几件（每章七八件），
// 院子本身的家底仍由布设层出。
//
// 三章共用一个锚点（第二区公所大院，Data_MissionCh3 头注定的口径），
// 所以坐标一律写成「相对锚点的偏移」——锚点挪了这一整张表跟着挪。
// ---------------------------------------------------------------------------

const AID_YARD = {
  // ③ 有序：门板靠墙码着、药箱成堆、电话线顺墙根拉进来。
  CH3_Jiuhusuo: {
    zone: "C3_AidStation",
    props: [
      { id: "a3_plankStack", kind: "debris", dx: -10, dz: -11, color: 0x8b7350, note: "拆下来待用的门板，码成一摞" },
      { id: "a3_medStack1", kind: "box", dx: 6.5, dz: -4.0, color: 0x7a6a4c, note: "药箱（满的）" },
      { id: "a3_medStack2", kind: "box", dx: 7.4, dz: -4.8, color: 0x7a6a4c, note: "药箱（满的）" },
      { id: "a3_medStack3", kind: "box", dx: 6.9, dz: -5.6, color: 0x7a6a4c, note: "药箱（满的）" },
      { id: "a3_litter1", kind: "stretcher", dx: 3.0, dz: 4.5, ry: 0.18, note: "空担架，靠墙立着" },
      { id: "a3_litter2", kind: "stretcher", dx: 4.4, dz: 5.2, ry: -0.12, note: "空担架" },
      { id: "a3_phonePost", kind: "box", dx: 12.5, dz: 1.0, size: [0.16, 1.5, 0.16], color: 0x5a4a35, note: "拉电话线的木杆" },
      { id: "a3_paper", kind: "panel", dx: -3.0, dz: 12.0, texture: "./Texture/Tex_PaperLetter.png",
        size: [0.26, 0.34], note: "墙边那张南京暴行旧报纸" },
    ],
  },
  // ④ 挤满：担架铺了一地、绷带与血水、药箱少了一半。**门板还是那几块**（③ 拆的）。
  CH4_DongguanYe: {
    zone: "C4_AidStation",
    props: [
      { id: "a4_plankStack", kind: "debris", dx: -10, dz: -11, color: 0x8b7350, note: "还是三关拆的那几块门板，靠在墙根" },
      { id: "a4_litter1", kind: "stretcher", dx: 2.0, dz: 2.5, ry: 0.05, note: "占着的担架" },
      { id: "a4_litter2", kind: "stretcher", dx: 4.2, dz: 2.2, ry: -0.04, note: "占着的担架" },
      { id: "a4_litter3", kind: "stretcher", dx: 6.4, dz: 2.6, ry: 0.09, note: "占着的担架" },
      { id: "a4_litter4", kind: "stretcher", dx: 2.4, dz: 5.0, ry: -0.07, note: "占着的担架" },
      { id: "a4_litter5", kind: "stretcher", dx: 4.8, dz: 5.4, ry: 0.02, note: "占着的担架" },
      // 绷带与血水：一块贴地的暗色板。**不做血雾、不做特写** —— §5 明写无镜头特写。
      { id: "a4_bloodFloor", kind: "plane", dx: 4.0, dz: 3.8, size: [7.5, 5.5], color: 0x4a2b26,
        note: "满地绷带与血水" },
      { id: "a4_medStack1", kind: "box", dx: 6.9, dz: -5.6, color: 0x7a6a4c, note: "药箱 —— 只剩这一只（三关有三只）" },
    ],
  },
  // ⑤ 废墟：塌了半边、药箱空着、电话线断在门框上、白布担架。
  CH5_Chengqiang: {
    zone: "C5_AidRuin",
    props: [
      { id: "a5_rubble1", kind: "debris", dx: 8.0, dz: -8.0, size: [4.2, 1.1, 3.4], color: 0x6f665a, note: "塌下来的半边房" },
      { id: "a5_rubble2", kind: "debris", dx: 10.5, dz: -5.0, size: [2.6, 0.8, 2.2], color: 0x6f665a },
      { id: "a5_rubble3", kind: "debris", dx: 6.0, dz: -10.5, size: [2.0, 0.6, 1.8], color: 0x6f665a },
      { id: "a5_plankStack", kind: "debris", dx: -10, dz: -11, color: 0x8b7350, note: "门板担架还在（三关拆的那几块）" },
      { id: "a5_medEmpty1", kind: "box", dx: 6.9, dz: -5.6, color: 0x40372a, note: "药箱：空的，盖子敞着" },
      { id: "a5_medEmpty2", kind: "box", dx: 5.2, dz: -3.0, ry: 0.7, color: 0x40372a, note: "药箱：翻倒的" },
      { id: "a5_phonePost", kind: "box", dx: 12.5, dz: 1.0, size: [0.16, 0.9, 0.16], color: 0x5a4a35,
        note: "电话线断在门框上 —— 杆子只剩半截" },
      { id: "a5_bloodFloor", kind: "plane", dx: 4.0, dz: 3.8, size: [7.5, 5.5], color: 0x3d2621,
        note: "四关那一地绷带血水，干了" },
    ],
  },
};

/**
 * 摆这一章的 A 区差异件。**只摆差异**，院子本身的家底归布设层。
 * 锚点取不到（切片里没有这个路标）就一件不摆，不报错。
 */
function DressAidYard(s, levelId) {
  const plan = AID_YARD[levelId];
  if (!plan) return 0;
  let n = 0;
  for (const item of plan.props) {
    const at = s.Near(plan.zone, item.dx, item.dz);
    if (!at) break;
    const id = s.Prop({
      id: item.id, kind: item.kind, position: at, size: item.size,
      color: item.color, texture: item.texture, rotationY: item.ry || 0,
    });
    if (id) n += 1;
  }
  s.mem.aidYardProps = n;
  return n;
}

// ---------------------------------------------------------------------------
// 七章摆点表
//
// **一章一条，每一条都读得完。** 找「第五关的机枪位摆在哪儿」只有一个地方可看。
// ---------------------------------------------------------------------------

export const SETPIECES = {

  // =========================================================================
  // 序章｜出川 —— 整章是过场承载章，摆点层无事可做。
  //
  // 车厢是过场自带的布景，底下那片地皮上没有战线（EnterLevel 的 cutsceneOnly
  // 分支既不 Respawn 也不撒兵）。这里留一条空记录而不是不写 —— 「这一章故意
  // 没有摆点」与「忘了写」在代码里必须长得不一样。
  // =========================================================================
  CH0_Chuchuan: {
    id: "CH0_Chuchuan",
    note: "过场承载章：车厢、兵站、逃跑计划三段全在 CS_Chuchuan 里。",
    Setup() {},
  },

  // =========================================================================
  // 第一关｜往南的路
  //
  // 摆的东西（§2 阶段号）：
  //   ①  给机枪组补弹（ammoCrate 搬运 + 送到位）
  //   ②③ 后送队：2 担架（各 2 担架员）＋2 护卫＋可行走伤兵＋百姓，沿大车路南下
  //   ⑤⑥⑧ 三条扫射航线（railPass → crowdTurn → divePress）
  //   ⑦  接替担架（stretcher 搬运态 20—30 s）
  //   ⑧  松手：DiveCue → ForceRelease；不躲 → checkpoint.Rewind
  //   ⑪  结尾「重新握住担架」
  // =========================================================================
  CH1_NanLu: {
    id: "CH1_NanLu",

    Setup(s) {
      // --- ① 给机枪组补弹（两点：箱子在哪儿、送到哪儿）--------------------
      const crate = s.Near("C1_Railbed", 6, 4);
      const nest = s.Near("C1_Railbed", -9, -6);
      if (crate) {
        s.Register(PickUpLoadInteraction({
          id: "ch1_ammoCrate", position: crate, kindId: "ammoCrate",
          label: "抬起弹药箱", carry: s.carry, once: false,
          options: { label: "弹药箱", payload: { to: "mg" } },
        }));
      }
      if (nest) {
        s.Register(GiveSupplyInteraction({
          id: "ch1_ammoDrop", position: nest, item: "弹药箱", label: "把箱子送过去",
          Has: () => !!s.carry && s.carry.KindId === "ammoCrate",
          OnComplete: () => {
            s.carry?.Drop("delivered");
            s.Hint("弹药送到机枪位了。", 2.4);
            s.mem.ammoDelivered = (s.mem.ammoDelivered || 0) + 1;
          },
          once: false,
        }));
      }

      // --- ②③ 后送队 -----------------------------------------------------
      // 队伍成分照策划案 §2 阶段三逐条：2 担架 + 4 担架员 + 2 持枪护卫 +
      // 可行走伤兵 + 撤离百姓。**妇孺老人必须在队里看得见** —— 阶段六
      // 「担架、女人、娃儿都照打」是靠玩家自己看见成立的，不是靠台词。
      s.mem.column = s.Column({
        waypoints: [
          s.Zone("C1_Village"), s.Zone("C1_Culvert"), s.Zone("C1_SouthRoad"),
          s.Zone("C1_Ditch"),
        ].filter(Boolean).map((z) => ({ x: z.x, z: z.z })),
        members: [
          { role: "bearer", label: "担架员", weapon: null },
          { role: "bearer", label: "担架员", weapon: null },
          { role: "bearer", label: "担架员", weapon: null },
          { role: "bearer", label: "担架员", weapon: null },
          { role: "guard", label: "护卫", weapon: "HanYang" },
          { role: "guard", label: "护卫", weapon: "HanYang" },
          { role: "walking", label: "可行走伤兵", weapon: null },
          { role: "walking", label: "可行走伤兵", weapon: null },
          // 百姓走的是同一条队列。**这一层不造平民模型** —— 百姓 tzm 分身归
          // 布设层（Script_ActorCrowd / 城内布设），这里只占住队列里的位置，
          // 由宿主决定用哪一具皮。装配层没接平民皮时他们是没枪的国军兵。
          { role: "civilian", label: "百姓", weapon: null, civilian: true },
          { role: "civilian", label: "百姓（抱娃的婆娘）", weapon: null, civilian: true },
        ],
      });
    },

    onZone: {
      // ② 后方喊「缺两个护送伤兵的！」—— 打退这一波、玩家退到村口那一线时。
      C1_Village(s) {
        s.After(8, (ss) => {
          ss.Signal("EscortCall");
          ss.mem.column?.Start();
        }, "ch1_escortCall");
      },
      // ⑤ 第一次掠过：沿铁路打车辆，一个人都不伤（preset 的 damage.npc = none）。
      C1_Ditch(s) {
        s.Once("ch1_railPass", (ss) => {
          ss.strafe?.StrafeRun({
            preset: "railPass",
            from: { x: -486, z: -60 }, to: { x: -482, z: 150 },
            OnPhase: (beat) => { if (beat === "exit") ss.mem.railPassDone = ss.Time(); },
          });
        });
      },
    },

    onVoice: {
      // ⑦ 罗班长「顺子，接后头！」之后才摆得出「接住担架后端」那个点 ——
      //    先摆的话玩家会在担架员还活着的时候把担架接过来。
      ch1_luo_17(s) {
        const spot = s.mem.column?.HeadPosition() || s.Near("C1_Ditch", 2, 6);
        if (!spot) return;
        s.Register(PickUpLoadInteraction({
          id: "ch1_stretcher", kindId: "stretcher",
          // 挂在队头上：担架跟着队伍走，交互点也跟着走。
          Anchor: () => s.mem.column?.HeadPosition() || spot,
          label: "接住担架后端", carry: s.carry,
          options: {
            label: "担架（伤员）", canDrop: true,
            partner: s.mem.column?.Bearers?.[0]?.handle || null,
            payload: { who: "shangbing" },
          },
          OnComplete: () => {
            s.Signal("StretcherHandoff");
            s.mem.carryStartedAt = s.Time();
            // 抬起来那一刻打一个检查点：阶段八「不躲则从数秒前重来」退到这儿。
            s.checkpoint?.Save();
          },
        }));
      },
    },

    Update(s, dt) {
      s.mem.column?.Update(dt);

      // ⑥ 转向人群。第一轮走完 9 秒后拐回来 —— 「拉起、转弯、降高」那一下
      //    必须在玩家的自由视角里看得见（§2 不设开场过场就是为了这一眼）。
      if (s.mem.railPassDone && !s.mem.crowdTurnAt && s.Time() - s.mem.railPassDone > 9) {
        s.mem.crowdTurnAt = s.Time();
        const column = s.mem.column;
        // **点名，不掷骰子**：谁倒下由脚本决定（Script_AircraftStrafe 的白名单）。
        // 一个担架员 + 一个百姓；后面还有戏的人（同伴）一律进 immune。
        const victims = [];
        const bearer = column?.Bearers?.[1] || column?.Bearers?.[0];
        const civilian = column?.Civilians?.[column.Civilians.length - 1];
        if (bearer) victims.push({ ref: bearer.handle, at: 0.30 });
        if (civilian) victims.push({ ref: civilian.handle, at: 0.72 });
        s.strafe?.StrafeRun({
          preset: "crowdTurn",
          from: { x: -440, z: 55 }, to: { x: -450, z: 165 },
          TrackTo: () => column?.HeadPosition() || s.PlayerPos(),
          victims,
          // 后面还有戏的人一律必不死：班里那几个（罗班长、幺娃、何有田…）
          // 与担架上那个伤员。`immune` 压过 `victims`（白名单不许自相矛盾）。
          immune: (s.companion?.Roster || []).map((id) => s.companion.Handle(id)).filter(Boolean),
          OnPhase: (beat) => {
            if (beat === "fire") column?.Scatter(14);
            if (beat === "exit") s.mem.crowdTurnDone = s.Time();
          },
        });
      }

      // ⑧ 第三次进入航线。**要等玩家真的抬上担架**（搬运态满 20 s），
      //    没抬上就用 crowdTurn 结束后 30 s 兜底 —— 不能让这一拍等一个
      //    可能永远不发生的条件。
      if (!s.mem.diveAt && s.mem.crowdTurnDone) {
        const carried = s.mem.carryStartedAt && s.Time() - s.mem.carryStartedAt > 20;
        const timedOut = s.Time() - s.mem.crowdTurnDone > 30;
        if (carried || timedOut) {
          s.mem.diveAt = s.Time();
          s.strafe?.StrafeRun({
            preset: "divePress",
            from: { x: -444, z: 100 }, to: { x: -452, z: 195 },
            TrackTo: () => s.PlayerPos(),
            // 「你的手是先松开的」—— 剧情要求，不是玩家操作失误。
            OnDodge: () => { s.carry?.ForceRelease("dive"); },
            // 「不躲则被击倒并从数秒前重来」。**倒带必须发生在把伤害交给
            // 死亡链路之前** —— Script_AircraftStrafe 的 OnPlayerHit 就在那之前调。
            OnPlayerHit: () => {
              s.carry?.ForceRelease("dive");
              s.checkpoint?.Rewind(4);
              s.Hint("再来一次 —— 它压下来的时候扑进沟里。", 3.2);
            },
            OnPhase: (beat) => { if (beat === "exit") s.mem.diveDone = s.Time(); },
          });
        }
      }

      // ⑨ 南路被截断：飞机走后二十秒，路口那头的枪声一直没停。
      if (s.mem.diveDone && s.Time() - s.mem.diveDone > 20) {
        s.Once("ch1_southCut", (ss) => ss.Signal("SouthCut"));
      }

      // ⑪ 结尾：重新握住担架后端。**只在伤员那一句之后摆** ——
      //    §0 六个验收结果之二，这一下是本关的收束动作。
      if (s.Spoken("ch1_shangbing_04")) {
        s.Once("ch1_regrip", (ss) => {
          const spot = ss.Near("C1_BackToWall", 4, 6);
          if (!spot) return;
          ss.Register(PickUpLoadInteraction({
            id: "ch1_regrip", position: spot, kindId: "stretcher",
            label: "重新握住担架后端", carry: ss.carry,
            options: { label: "担架（伤员）", canDrop: true, payload: { who: "shangbing" } },
            OnComplete: () => ss.Hint("腿抬高了。", 2.2),
          }));
        });
      }
    },
  },

  // =========================================================================
  // 第二关｜手榴弹雨
  //
  //   ① 弹药箱拖运（三态：拖到投掷点 / 受潮弹单独码 / 殉爆倒计时拖出 6 m）
  //   ② 「甩！」那一拍对壕沿友军下齐投
  //   ④ 白刃 QTE：坍塌缺口段，清空 → Signal("BayonetDone")
  //   ⑤ 关末清点
  // =========================================================================
  CH2_Shouliudan: {
    id: "CH2_Shouliudan",

    Setup(s) {
      // ① 三只箱子：好弹、受潮弹、还有一只等着被掷弹筒点着的。
      const pile = s.Near("C2_ZhaiGate", 3, 5);
      const throwPoint = s.Near("C2_Ditch", -6, 2);
      const dampPoint = s.Near("C2_ZhaiGate", -7, -4);
      if (pile) {
        s.Register(PickUpLoadInteraction({
          id: "ch2_crate", position: pile, kindId: "ammoCrate",
          label: "拖起弹药箱", carry: s.carry, once: false,
          options: { label: "手榴弹箱", payload: { damp: false } },
        }));
        s.Register(PickUpLoadInteraction({
          id: "ch2_dampCrate", position: { x: pile.x + 2.4, y: pile.y, z: pile.z + 1.2 },
          kindId: "ammoCrate", label: "拖起受潮的那一箱", carry: s.carry, once: false,
          options: { label: "受潮的手榴弹箱", payload: { damp: true } },
        }));
      }
      if (throwPoint) {
        s.Register(GiveSupplyInteraction({
          id: "ch2_crateDrop", position: throwPoint, item: "弹药箱", label: "摆到投掷点",
          Has: () => !!s.carry && s.carry.KindId === "ammoCrate",
          OnComplete: () => {
            const damp = !!s.carry?.View()?.payload?.damp;
            s.carry?.Drop("staged");
            if (damp) {
              // 受潮弹混进好弹堆里要有一次失败反馈（策划案原文）。
              s.Say("赵德贵", "受潮的单独码一边！", 2.6);
              s.mem.dampMisplaced = (s.mem.dampMisplaced || 0) + 1;
            } else {
              s.mem.crateStaged = (s.mem.crateStaged || 0) + 1;
              s.Hint(`投掷点摆了 ${s.mem.crateStaged} 箱。`, 2.0);
            }
          },
          once: false,
        }));
      }
      if (dampPoint) {
        s.Register(GiveSupplyInteraction({
          id: "ch2_dampDrop", position: dampPoint, item: "受潮弹", label: "受潮的码这边",
          Has: () => !!s.carry && s.carry.KindId === "ammoCrate",
          OnComplete: () => {
            const damp = !!s.carry?.View()?.payload?.damp;
            s.carry?.Drop("staged");
            if (damp) s.mem.dampStaged = (s.mem.dampStaged || 0) + 1;
            else s.Say("刘文财", "好的莫往这边码！", 2.2);
          },
          once: false,
        }));
      }
    },

    onVoice: {
      // ② 「甩！」—— 玩家与背景守军**同时**投。一个人甩出去只是三颗手榴弹，
      //    不是史料里那场雨（集中六七十人、连续二三百枚）。
      ch2_luo_04(s) {
        const zone = s.Zone("C2_Ditch");
        if (!zone) return;
        s.Signal("GrenadeVolley");
        s.d.host.VolleyThrow?.({ x: zone.x, z: zone.z, radius: 46, spreadS: 0.8 });
      },
      // ④ 上刺刀那一句之后，缺口段的白刃 QTE 才开门。第一次要给一次按键提示，
      //    之后不再提示（Data_MissionCh2 的 ENGINE_REQUEST 3）。
      ch2_luo_06(s) {
        s.mem.bayonetOpen = true;
        s.mem.bayonetOpenAt = s.Time();
        s.d.host.SetMeleeGate?.(true);
        s.Hint("上刺刀 —— 挡住他，再反打。", 4.0);
      },
    },

    Update(s) {
      // ③ 殉爆：掷弹筒命中弹药箱 → 冒烟 4—6 s → 拖出 6 m 算救下。
      //    引擎侧的「谁被打中了」由宿主报（destruction / combat 的回执），
      //    没接线时这一段静默不发生 —— 不自己造一套伤害判定。
      const cooking = s.d.host.CookingCrate?.();
      if (cooking && !s.mem.cookingId) {
        s.mem.cookingId = cooking.id;
        s.Hint("箱子冒烟了 —— 拖开！", 4.0);
        s.Say("赵德贵", "箱子拖开！", 2.2);
      } else if (!cooking && s.mem.cookingId) {
        s.mem.cookingId = null;
      }

      // ④ 缺口内日军清空 → BayonetDone。**不许把「打完了」写成时间到了** ——
      //    兜底判据在 Data_MissionCh2.EVENTS 里，这里只报事实。
      if (s.mem.bayonetOpen && !s.mem.bayonetDone) {
        const zone = s.Zone("C2_BackStreet");
        const left = zone ? Num(s.d.host.EnemiesNear?.(zone.x, zone.z, zone.radius), -1) : -1;
        // 开门至少 12 s 之后才算数：开门那一帧敌人还没走到缺口里，
        // 一进门就判「清空了」是最常见的一种假绿。
        if (left === 0 && s.Time() - s.mem.bayonetOpenAt > 12) {
          s.mem.bayonetDone = true;
          s.Signal("BayonetDone");
        }
      }
    },
  },

  // =========================================================================
  // 第三关｜救护所
  //
  //   ①  A 区：搬药箱、拆门板、接电话线（ER-5 / ER-4）
  //   ④  报纸（ER-7）
  //   ⑦⑧ 处决声音先行段 → 破墙确认 → CS_Ch3_BreakWall（ER-1）
  //   ⑩  撕短褂（ER-2）
  //   ⑪  传单入火 → 火墙封路（ER-3）
  //   ⑫  剪线（ER-4）
  // =========================================================================
  CH3_Jiuhusuo: {
    id: "CH3_Jiuhusuo",

    Setup(s) {
      // A 区第一次出场：**有序**。差异件见 AID_YARD.CH3_Jiuhusuo。
      DressAidYard(s, "CH3_Jiuhusuo");

      // ① 药箱：抬起来 → 送进屋。
      const boxes = s.Near("C3_AidStation", -6, 8);
      const ward = s.Near("C3_AidStation", 7, -5);
      if (boxes) {
        s.Register(PickUpLoadInteraction({
          id: "ch3_medBox", position: boxes, kindId: "medBox",
          label: "抬起药箱", carry: s.carry, once: false,
          options: { label: "药箱" },
        }));
      }
      if (ward) {
        s.Register(GiveSupplyInteraction({
          id: "ch3_medBoxDrop", position: ward, item: "药箱", label: "抬进屋",
          Has: () => !!s.carry && s.carry.KindId === "medBox",
          OnComplete: () => { s.carry?.Drop("delivered"); s.mem.boxes = (s.mem.boxes || 0) + 1; },
          once: false,
        }));
      }
      // ① 门板 ×3 —— **这是四关、五关认得出这个院子的物证**（§5 阶段 10）。
      for (let i = 0; i < 3; i += 1) {
        const at = s.Near("C3_AidStation", -10 + i * 3.2, -9);
        if (!at) break;
        s.Register(DoorPlankInteraction({
          id: `ch3_plank${i}`, position: at,
          RemovePlank: () => s.d.host.SetPropState?.(`ch3_door${i}`, "removed") !== false,
          SpawnStretcher: () => s.Prop({ id: `ch3_stretcher${i}`, kind: "stretcher", position: at }),
          OnComplete: () => {
            s.mem.planks = (s.mem.planks || 0) + 1;
            // 拆下来的门框缺口要留在场景状态里 —— 四关走回来时认得出。
            s.d.host.MarkPersistent?.("ch3_doorPlanks", s.mem.planks);
            if (s.mem.planks >= 3) s.Hint("三块门板都拆下来了。", 2.6);
          },
        }));
      }
      // ① 电话线：两头接上（ER-4）。
      const wireA = s.Near("C3_AidStation", 12, 2);
      const wireB = s.Near("C3_AidStation", 16, -6);
      if (wireA && wireB) {
        for (const spec of WireInteractions({
          id: "ch3_phone", a: { position: wireA }, b: { position: wireB },
          OnJoin: () => { s.mem.phoneJoined = true; s.Say("小秦", "线接通了。", 2.4); },
        })) s.Register(spec);
      }
      // ④ 报纸：靠近读标题，完整内容进历史档案（不做全文界面、不做过场）。
      const paper = s.Near("C3_AidStation", -3, 12);
      if (paper) {
        s.Register(CheckWoundedInteraction({
          id: "ch3_newspaper", position: paper, seconds: 0.9, label: "读墙上那张旧报纸",
          OnComplete: () => {
            s.mem.paperRead = true;
            s.Hint("《首都陷落后之南京》—— 纸角卷了，字还认得出。", 5.0);
          },
        }));
      }
    },

    onZone: {
      // ⑦ 声音先行段：先掐掉交火声，再起间隔单发。玩家看不见任何东西，只能听。
      C3_LostBlock(s) {
        s.Once("ch3_execAudible", (ss) => {
          ss.d.host.SetCombatBed?.(false, 1.5);
          ss.Signal("ExecutionAudible");
          ss.mem.execLoopAt = ss.Time();
        });
      },
      // ⑧ 破墙观察位：确认之后才开火 —— 主动权在玩家手上。
      C3_ForwardAid(s) {
        s.Once("ch3_execConfirmed", (ss) => {
          ss.d.host.SetCombatBed?.(true, 0.8);
          // 这一条同时挂着 CS_Ch3_BreakWall（Data_MissionCh3.EVENTS 的 cutscene 字段）。
          ss.Signal("ExecutionConfirmed");
        });
      },
      // ⑪ 炉火那一处：传单可以捡、可以投。
      C3_Firebreak(s) {
        s.Once("ch3_firebreak", (ss) => {
          const leaflet = ss.Near("C3_Firebreak", -3, 4);
          const stove = ss.Near("C3_Firebreak", 2, -2);
          if (leaflet) {
            ss.Register(LeafletPickupInteraction({
              id: "ch3_leaflet", position: leaflet,
              OnComplete: () => { ss.mem.leaflet = true; },
            }));
          }
          if (stove) {
            ss.Register(LeafletBurnInteraction({
              id: "ch3_leafletFire", position: stove,
              HasLeaflet: () => !!ss.mem.leaflet,
              IgniteSource: () => {
                // 火墙：8—10 m、≥90 s，**对玩家同样有伤害**（它是封路，不是单向道具）。
                ss.d.host.Firewall?.({
                  id: "ch3_firewall", from: stove,
                  to: { x: stove.x + 9, y: stove.y, z: stove.z + 1.5 },
                  seconds: 95, damagePlayer: true,
                });
              },
              OnComplete: () => { ss.mem.leaflet = false; ss.Signal("LeafletBurned"); },
            }));
          }
        });
      },
    },

    onVoice: {
      // ⑩ 军医喊「绷带没得了！」之后才亮出短褂 —— 在那之前它不可用、不进 HUD。
      ch3_junyi_06(s) {
        const at = s.Near("C3_ForwardAid", 2, -3);
        if (!at) return;
        s.Register(TearShirtInteraction({
          id: "ch3_tearShirt", position: at,
          ConsumeShirt: () => s.d.host.TakeItem?.("civilianShirt") !== false,
          OnComplete: () => {
            s.mem.shirtTorn = true;
            s.Signal("ShirtTorn");
            // 逃跑计划的第二次失败靠**道具消失**表达，不靠台词。这里不加感言。
          },
        }));
        s.Register(BleedControlInteraction({
          id: "ch3_bleed", position: at, seconds: 3.0, label: "按住出血口",
          OnComplete: () => s.Say("顺子", "莫让他再流了。", 2.4),
        }));
      },
      // ⑫ 撤回路上：小秦剪断收不回来的那一段。
      ch3_luo_18(s) {
        const at = s.Near("C3_LostBlock", -8, 4);
        if (!at) return;
        s.Register(CutWireInteraction({
          id: "ch3_cutWire", position: at,
          OnComplete: () => s.Signal("LineCut"),
        }));
      },
    },

    Update(s) {
      // ⑦ 声音先行段的循环：间隔 9—14 s 一声**单发**，中间垫拖动声与咳嗽。
      // 长度由玩家自己走多快决定，不设时限；确认处决那一刻停。
      if (s.mem.execLoopAt && !s.d.once.has("ch3_execConfirmed")) {
        const gap = 9 + ((s.mem.execShots || 0) % 3) * 2.5;
        if (s.Time() - s.mem.execLoopAt > gap) {
          s.mem.execLoopAt = s.Time();
          s.mem.execShots = (s.mem.execShots || 0) + 1;
          const at = s.Near("C3_ForwardAid", 4, -4);
          s.d.host.PlaySfx?.("rifleIja", { position: at, volume: 0.55 });
          // 短促惨叫走**实录素材**（execScream），低概率、低音量、永远在墙后。
          if (s.mem.execShots % 3 === 2) {
            s.d.host.PlaySfx?.("execScream", { position: at, volume: 0.32 });
          }
        }
      }
      // ⑨ 突入之后搜完幸存者 → AssaultCleared。宿主报「这一片还有没有活着的日军」。
      if (s.d.once.has("ch3_execConfirmed") && !s.mem.cleared) {
        const zone = s.Zone("C3_ForwardAid");
        const left = zone ? Num(s.d.host.EnemiesNear?.(zone.x, zone.z, zone.radius), -1) : -1;
        if (left === 0) { s.mem.cleared = true; s.Signal("AssaultCleared"); }
      }
    },
  },

  // =========================================================================
  // 第四关｜东关之夜
  //
  //   ①  院门口口令确认
  //   ③  写信（贴图纸片道具）
  //   ③  CS_Ch4_UnfinishedLetter 改挂**休整之后**（关中过场）
  //   ⑤⑦ 两枚照明弹
  //   ⑧  罗班长救顺子（固定事件 4—6 s）→ 罗班长 SetAbsent 从五关起永久缺席
  //   ⑨  carryLeader：幺娃与一名士兵抬罗班长，玩家掩护
  //   ⑩  CS_Ch4_AidStation 挂**进 A 区那一拍**（关中过场）
  // =========================================================================
  CH4_DongguanYe: {
    id: "CH4_DongguanYe",

    Setup(s) {
      // A 区第二次出场：**挤满**（伤员剧增、满地绷带血水、药箱只剩一只）。
      // 门板还是三关拆的那几块 —— 玩家认得出这是同一个院子（§5 阶段 10）。
      DressAidYard(s, "CH4_DongguanYe");

      // ① 门口确认口令：「长江 / 泸州」。对上才放行。
      const gate = s.Near("C4_Assembly", 0, 9);
      if (gate) {
        s.Register(CheckWoundedInteraction({
          id: "ch4_countersign", position: gate, seconds: 0.8, label: "回令：泸州",
          OnComplete: () => {
            s.mem.countersign = true;
            s.Say("赵德贵", "过。", 1.8);
            s.d.host.OpenGate?.("ch4_assemblyGate");
          },
        }));
      }
      // ③ 写信：一张真的纸（贴图 prop 已支持 texture:）。摊在弹药箱上。
      const desk = s.Near("C4_Assembly", -5, -3);
      if (desk) {
        // 「摊在弹药箱上」的那张 —— **plane 不是 panel**：panel 是立着的
        // （贴在墙上的报纸走那一档），一张写了四行的信纸立在半空是穿帮。
        s.mem.letterProp = s.Prop({
          id: "ch4_letter", kind: "plane", position: desk,
          texture: "./Texture/Tex_PaperLetter.png", size: [0.30, 0.21],
        });
        s.Register(CheckWoundedInteraction({
          id: "ch4_writeLetter", position: desk, seconds: 1.6, label: "替他写两句",
          OnComplete: () => {
            s.mem.letterWritten = true;
            s.Hint("「就写我还活起。别写我吐了。」", 4.2);
          },
        }));
      }
    },

    onZone: {
      // ⑤ 第一枚：发射点在日军那一侧（东，+X），顶空压在横巷正中 ——
      //    亮的是巷子，不是发射筒。
      C4_FlareCross(s) {
        s.Once("ch4_flare1", (ss) => {
          ss.flare?.LaunchFlare({
            preset: "crossLane",
            from: { x: 496, z: -18 }, at: { x: 449, z: -22 },
            OnPhase: (beat) => { if (beat === "out") ss.Signal("C4_FlareDown"); },
          });
        });
      },
      // ⑦ 第二枚：窄巷压低（预设 apexM 54），十几米外照得清人脸 ——
      //    「两边都愣了半秒」是这么来的。
      C4_NarrowLane(s) {
        s.Once("ch4_flare2", (ss) => {
          ss.flare?.LaunchFlare({
            preset: "narrowLane",
            from: { x: 486, z: 128 }, at: { x: 443, z: 121 },
          });
          ss.d.host.SetMeleeGate?.(true);
        });
      },
      // ⑩ 回到 A 区：关中过场（抬回 → 剪开军服 →「没得脉了」→ 取信）。
      C4_AidStation(s) {
        s.Once("ch4_aidStation", (ss) => {
          ss.d.host.PlayCutscene?.("CS_Ch4_AidStation");
          // 过场播完之后 beats 里顺子的失控对话才接得上（「不可能。」「你再看一哈！」）。
        });
      },
    },

    onVoice: {
      // ② 休整最后一句「先把今晚熬过去。」之后才播口述那一场 ——
      //    §5 阶段③在阶段②**之后**。挂 cutsceneIn 的老做法是进章即播，
      //    顺序变成 ③①②，九十秒休整的那份静被提前掐掉。
      ch4_luo_05(s) {
        s.After(3.0, (ss) => ss.d.host.PlayCutscene?.("CS_Ch4_UnfinishedLetter"), "ch4_letterCut");
      },
      // ⑧ 罗班长救顺子。固定战场事件 4—6 s：墙塌 → 击倒 → 武器脱手 → 贴地视角 →
      //    日军补刺 → 罗班长撞开他、把玩家往后拖 → 腹部中弹。
      //    **事件期间玩家不许死**：先打一个检查点，再把伤害交给演出。
      ch4_luo_16(s) {
        s.checkpoint?.Save();
        s.d.host.SetPlayerInvulnerable?.(true, 6.5);
        s.mem.luoSavedAt = s.Time();
      },
      // ⑧ 收尾：罗班长腹部中弹。他从这一拍起是**伤员**，不是战斗员。
      ch4_luo_17(s) {
        s.d.host.SetPlayerInvulnerable?.(false);
        s.mem.luoWounded = true;
        // 抬他的人：幺娃 + 一名士兵。抬的人被打倒时要有第二个人接手 ——
        // 「担架落地卡住流程」是这一段唯一不许出现的失败态。
        s.d.host.CarryLeader?.({
          who: "luo", bearers: ["yaowa"], to: "C4_AidStation",
          OnStalled: () => s.d.host.CarryLeader?.({ who: "luo", bearers: ["heyoutian"], to: "C4_AidStation" }),
        });
        s.companion?.Detach("yaowa");
      },
      // ⑪ 「枪给我。」—— 本关最后一句。罗班长在这一拍之后**永久缺席**：
      //    五关起他不该再出现在任何一章的名册里（CompanionDirector.SetAbsent
      //    是跨关保留的，只有重开一局或选章回到他还活着的那一章才撤销）。
      ch4_shunzi_15(s) {
        s.companion?.Fell("luo");
        s.companion?.SetAbsent("luo");
        s.d.host.MarkPersistent?.("luoFallen", true);
      },
    },

    Update() {},
  },

  // =========================================================================
  // 第五关｜城墙没有了
  //
  //   ①  A 区废墟：罗班长遗体盖白布（四关那一拍的物证）
  //   ③  B 区母题道具沿路（烧黑弹药箱 / 纸灰 / 碎碗）—— 布设层出件，这里只查
  //   ⑤  escortConvoy：复用一关那台队列控制器
  //   ⑥⑩ 机枪位（S2 示例照抄）＋ ForceJam 挂「最后防守第二层」
  //   ⑦  生路三重确认
  //   ⑧  TurnedBack → CS_Ch5_TurnBack（关中过场）
  //   ⑪  钉关：坚持到最后一副担架离开视野
  //   ⑫  povChain 三段 → ChapterRelease
  // =========================================================================
  CH5_Chengqiang: {
    id: "CH5_Chengqiang",

    Setup(s) {
      // A 区第三次出场：**废墟**（塌了半边、药箱空着、电话线断在门框上）。
      DressAidYard(s, "CH5_Chengqiang");

      // ① 罗班长的遗体：门板担架上盖着白布。**没有交互** —— 策划案原话
      //    「没有人去掀」。它只是摆在那儿，玩家自己认出来。
      const bier = s.Near("C5_AidRuin", -4, 7);
      if (bier) {
        s.mem.bier = s.Prop({
          id: "ch5_luoBier", kind: "shroudedBody", position: bier,
          label: "盖白布的门板担架", note: "四关抬回来的那一个。不可交互。",
        });
      }

      // ③ 穿过旧场景（dressingEcho）。策划案要求路过第二/三/四关的旧场景，
      //    但 B 区集结院与东关外壕都在本章切片（maxX 285）之外 —— 本章头注
      //    ENGINE_REQUEST 10 定的折中是：A 区 → 十字街口这一段路边摆上**同一组母题**。
      //    三条 env beat 点的就是它们（「街垒塌了…」「烧黑的弹药箱…」「碎碗…」），
      //    摆件不到位那三条就成了空话。
      //    坐标沿 A 区(214,-18) → 十字街口(0,0) 那条线，按行程三等分摆。
      const echo = [
        // 第二关的母题：塌掉的投弹街垒 + 手榴弹箱的碎木
        { id: "ch5_echo_barricade", kind: "debris", x: 152, z: -14, size: [3.6, 0.9, 1.4], color: 0x6f665a },
        { id: "ch5_echo_crateWreck", kind: "debris", x: 147, z: -10, size: [1.2, 0.4, 0.9], color: 0x4a3d2c },
        // 第四关 B 区的母题：**烧黑的弹药箱**、压在盖上的纸灰
        { id: "ch5_echo_burntCrate", kind: "box", x: 96, z: -6, color: 0x2b2521 },
        { id: "ch5_echo_burntCrate2", kind: "box", x: 93, z: -3, rotationY: 0.6, color: 0x2b2521 },
        { id: "ch5_echo_ash", kind: "plane", x: 95, z: -5, size: [1.6, 1.2], color: 0x50493f },
        // 第三关救护所的母题：碎碗、半只搪瓷缸、塌了一半的院墙
        { id: "ch5_echo_bowl", kind: "debris", x: 46, z: 2, size: [0.5, 0.12, 0.5], color: 0xbdb6a4 },
        { id: "ch5_echo_mug", kind: "debris", x: 44, z: 4, size: [0.3, 0.16, 0.3], color: 0xc8c2b2 },
        { id: "ch5_echo_wall", kind: "debris", x: 40, z: -6, size: [4.0, 1.2, 0.8], color: 0x7a7264 },
      ];
      for (const item of echo) {
        s.Prop({ ...item, position: { x: item.x, y: Num(s.d.host.Ground?.(item.x, item.z), 0), z: item.z } });
      }

      // ⑤ 后送队：A 区 → 十字街口 → 西街长街 → 城门内侧 → 城外。
      //    与一关同一台控制器（EscortColumn），只是路点与人数不同。
      s.mem.column = s.Column({
        waypoints: [
          s.Zone("C5_AidRuin"), s.Zone("C5_Crossroad"), s.Zone("C5_WestStreet"),
          s.Zone("C5_GunNest"), s.Zone("C5_GateInner"), s.Zone("C5_GateOut"),
        ].filter(Boolean).map((z) => ({ x: z.x, z: z.z })),
        members: [
          { role: "bearer", label: "担架员", weapon: null },
          { role: "bearer", label: "担架员", weapon: null },
          { role: "bearer", label: "担架员", weapon: null },
          { role: "bearer", label: "担架员", weapon: null },
          { role: "guard", label: "幺娃", weapon: "HanYang" },
          { role: "walking", label: "可行走伤兵", weapon: null },
          { role: "walking", label: "可行走伤兵", weapon: null },
          { role: "civilian", label: "医护兵", weapon: null },
        ],
      });

      // ⑥ 最后一个火力点（Script_Emplacement 的摆点示例照抄）。
      //    街心那道街垒后头，面朝东 —— 日军是从长街那头压过来的。
      const nest = s.Zone("C5_GunNest");
      if (nest && s.emplacement) {
        s.mem.gunId = s.emplacement.CreateEmplacement({
          id: "ch5_lastNest", tag: s.tag, kindId: "Type92Hmg",
          position: { x: nest.x, y: Num(s.d.host.Ground?.(nest.x, nest.z), 0), z: nest.z },
          baseYaw: -Math.PI / 2,
          arcYawDeg: 34, belts: 4,
          OnOccupy: () => {
            s.Signal("GunNestTaken");
            s.mem.gunTakenAt = s.Time();
          },
          OnDead: () => s.Signal("GunJam"),
        });
        s.Register(EmplacementInteraction({
          id: "ch5_lastNest_take", emplacement: s.emplacement, gunId: s.mem.gunId,
          carry: s.carry,
        }));
        s.Register(AmmoResupplyInteraction({
          id: "ch5_lastNest_ammo", emplacement: s.emplacement, gunId: s.mem.gunId,
          position: { x: nest.x - 2, y: Num(s.d.host.Ground?.(nest.x - 2, nest.z + 2), 0), z: nest.z + 2 },
        }));
      }

      // ⑦ 生路的三重确认里那一条**工程事实**：西关城门要真的开着。
      //    门是贴图的话，「玩家真的走到城门内侧」这件事就不成立（§0 验收 5）。
      s.d.host.OpenGate?.("westGate");
      s.mem.column?.Start();
    },

    onZone: {
      // ⑦ ②画面 —— 玩家站到城门内侧，门外的路与后送队都在视野里。
      C5_GateInner(s) { s.Once("ch5_escapeSeen", (ss) => ss.Signal("EscapeSeen")); },
      // ⑧ 玩家已经在城门外了：任务写着【撤出滕县】，路就在脚下。
      //    这一刻身后的机枪停下 —— 但**任务文字先不改**（要有几秒钟是「还可以走」）。
      C5_GateOut(s) {
        s.Once("ch5_mgSilent", (ss) => {
          ss.Signal("MgSilent");
          ss.d.host.SilenceCoverFire?.(true);
          ss.mem.mgSilentAt = ss.Time();
        });
      },
      C5_ReturnGun(s) { s.Once("ch5_returned", (ss) => { ss.mem.backAtGun = ss.Time(); }); },
    },

    onVoice: {
      // ⑥ 排长「够了！你的差事完了！」→ 后送队继续往城外走。
      ch5_paizhang_13(s) { s.mem.column && (s.mem.column.moving = true); },
      // ⑧ 顺子「老子回去压住！」—— **转身就发生在这一拍**。
      //    CHAPTER.cutsceneMid = { id:"CS_Ch5_TurnBack", signal:"TurnedBack" }，
      //    所以推这条信号就等于请求宿主播那一场（播完还完全控制权）。
      ch5_shunzi_07(s) {
        s.Signal("TurnedBack");
        s.d.host.SilenceCoverFire?.(false);
      },
      // ⑩② 最后防守第二层：机枪卡壳 + 弹尽。**脚本把这挺枪弄坏**，
      //     不许替玩家离位 —— 拉几下枪机、什么时候弃枪是玩家自己的事。
      ch5_shunzi_11(s) {
        s.After(6.0, (ss) => {
          if (ss.mem.gunId) ss.emplacement?.ForceJam(ss.mem.gunId);
          ss.Signal("GunJam");
        }, "ch5_forceJam");
      },
      // ⑩③ 最后一名友军倒下。
      ch5_shunzi_14(s) { s.Signal("LastFriendDown"); },
      // ⑩③ 装上刺刀，四连吼开始。
      ch5_shunzi_15(s) { s.Signal("BayonetFixed"); s.d.host.SetMeleeGate?.(true); },
      // ⑪ 中弹倒地（不切黑）。
      ch5_shunzi_18(s) {
        s.After(24, (ss) => {
          ss.Signal("ShunziDown");
          ss.d.host.GroundPov?.({ seconds: 5.0, blackOut: false });
        }, "ch5_shunziDown");
      },
      // ⑫ 视角接替三段。**每一段都是玩家控制**：换出生点 + 换身份 + 一段短活。
      //    段与段之间不切黑，用声音衔接。
      ch5_canmou_01(s) {
        s.Signal("PovGunner");
        s.d.host.SwitchPov?.({
          id: "gunner", cast: "s124", label: "一二四师机枪副射手",
          at: s.Near("C5_WestStreet", 6, -4), task: "接过机枪，打完这一梭",
        });
      },
      ch5_xiaoqin_01(s) {
        s.Signal("PovLineman");
        s.d.host.SwitchPov?.({
          id: "lineman", cast: "xiaoqin", label: "前沿电话兵",
          at: s.Near("C5_Crossroad", -6, 8), task: "把伤亡报告递进院子",
        });
      },
      ch5_xiaoqin_02(s) {
        s.Signal("PovXiaoqin");
        s.d.host.SwitchPov?.({
          id: "xiaoqin", cast: "xiaoqin", label: "通信兵小秦",
          at: s.Near("C5_AidRuin", 4, -6), task: "接线：东关回话",
        });
      },
      // ⑫ 小秦喊完「听到回话！」—— **钉关放行就在这一拍**。
      //    在这之前 mechanics.pinFinalZone 把关卡钉着：走到最后一个路标不换关，
      //    阶段⑩⑪⑫（最后防守三层、最终白刃、视角接替）才演得完。
      ch5_xiaoqin_03(s) {
        s.After(4.0, (ss) => ss.Signal("ChapterRelease"), "ch5_release");
      },
    },

    Update(s, dt) {
      s.mem.column?.Update(dt);
      // ⑪ 唯一判定：**坚持到最后一副担架离开视野**（不是打赢）。
      // 队列走完全部路点 = 最后一副担架出了西关。
      if (s.mem.column?.arrived) {
        s.Once("ch5_lastLitter", (ss) => ss.Signal("LastLitterPassed"));
      }
      // 保险：小秦那一句被 FlushTail 之类的路径吞掉时，钉关也要放得开。
      // 装配层另有一道 240 s 的保险丝，这一条只是更早、更安静的一层。
      if (s.LevelTime() > Num(s.phase?.minutes, 20) * 60 + 60) {
        s.Once("ch5_releaseFuse", (ss) => ss.Signal("ChapterRelease"));
      }
    },
  },

  // =========================================================================
  // 终章｜最后一封
  //
  //   ①  前两封底稿可看（draftReading）
  //   ③  WireConfirm → CS_Ch6_LastWire（关中过场）
  //   ④  telegraph：电键 + 接头（S4 示例照抄）
  //   ⑤  cipherDisposal：密码本 / 底稿 / 呼号表三件
  //   ⑥  FlankMg → CS_Ch6_Xiguan（关中过场）→ groundPov
  // =========================================================================
  CH6_Zuihou: {
    id: "CH6_Zuihou",

    Setup(s) {
      const hq = s.Zone("C6_DivisionHq");
      if (!hq) return;
      const y = Num(s.d.host.Ground?.(hq.x, hq.z), 0);
      const key = { x: hq.x + 4, y, z: hq.z - 3 };
      const jack = { x: hq.x + 3.4, y, z: hq.z - 3.4 };

      // ① 前两封电报的底稿：走近可以看。完整电文进历史档案，不做全文界面。
      for (let i = 0; i < 2; i += 1) {
        const at = { x: hq.x + 1.2 + i * 0.9, y, z: hq.z - 1.6 };
        // 「案上压着前两封的底稿」—— 摊在桌上，所以是 plane。
        s.Prop({
          id: `ch6_draft${i}`, kind: "plane", position: at,
          texture: "./Texture/Tex_PaperLetter.png", size: [0.22, 0.30],
        });
        s.Register(CheckWoundedInteraction({
          id: `ch6_draft${i}`, position: at, seconds: 0.8, label: "看底稿",
          OnComplete: () => {
            s.mem.drafts = (s.mem.drafts || 0) + 1;
            s.Hint(i === 0 ? "底稿一：报敌情，请援。" : "底稿二：再请援。落款是同一个人。", 4.0);
            if (s.mem.drafts >= 1) s.Signal("DraftsRead");
          },
        }));
      }

      // ④ 发报。码组是**章节数据**，不是引擎数字。
      if (s.telegraph) {
        s.telegraph.BeginTelegraph({
          id: "ch6_lastwire", label: "最后一封",
          groups: ["2429", "1560", "3016", "0022", "4837"],
          position: key,
          breakAfterGroup: 2,
          OnGroup: (i) => s.Hint(`第${i}组　对上了。`, 2.2),
          OnDisconnect: () => s.Signal("WireBreak"),
          OnComplete: () => s.Signal("WireSent"),
        });
        s.Register(TelegraphKeyInteraction({ telegraph: s.telegraph, position: key }));
        s.Register(TelegraphReconnectInteraction({ telegraph: s.telegraph, position: jack }));
      }

      // ⑤ 密码材料三件：任意顺序，三件都处理完才开西门大街的通路。
      const cipher = ["密码本", "底稿", "呼号表"];
      cipher.forEach((label, i) => {
        const at = { x: hq.x - 2 - i * 1.4, y, z: hq.z + 2 };
        s.Register(CutWireInteraction({
          id: `ch6_cipher${i}`, position: at, seconds: 1.4, label: `烧掉${label}`,
          OnComplete: () => {
            s.mem.burned = (s.mem.burned || 0) + 1;
            s.d.host.Firewall?.({ id: `ch6_burn${i}`, from: at, to: at, seconds: 8, damagePlayer: false });
            if (s.mem.burned >= cipher.length) {
              s.Signal("CipherDone");
              s.d.host.OpenGate?.("ch6_hqDoor");
            }
          },
        }));
      });
      // 带不走的机器给一次「砸」的近战交互。
      s.Register(CheckWoundedInteraction({
        id: "ch6_smashSet", position: { x: hq.x + 4.6, y, z: hq.z - 2.2 },
        seconds: 1.2, label: "砸掉带不走的电台",
        OnComplete: () => { s.mem.setSmashed = true; s.d.host.PlaySfx?.("impactMetal", { volume: 0.8 }); },
      }));
    },

    onZone: {
      // ⑥ 电灯厂附近，侧面机枪突然开火 → 关中过场 → 地面视角数秒再切黑。
      C6_PowerPlant(s) {
        s.Once("ch6_flankMg", (ss) => {
          // Signal 一条就够：CS_Ch6_Xiguan 登记在 Data_MissionCh6.EVENTS 的
          // FlankMg 上（cutscene 字段），关内那条 cutscene beat 是同一场的
          // 另一条入口 —— cutsceneFired 保证只播一次。
          ss.Signal("FlankMg");
          ss.After(11.5, (s2) => s2.d.host.GroundPov?.({ seconds: 5.0, blackOut: true }), "ch6_groundPov");
        });
      },
    },

    onVoice: {
      // ③ 四问的最后一问答完 → 复诵那一场（关中过场）。
      ch6_canmou_07(s) {
        s.After(2.4, (ss) => ss.Signal("WireConfirm"), "ch6_wireConfirm");
      },
      // ⑤ 师部挨炮：烧密码材料是被炮打出来的，不是流程安排的。
      ch6_wangmingzhang_06(s) {
        s.After(3.0, (ss) => {
          ss.Signal("HqShelled");
          ss.d.host.Shell?.({ at: ss.Near("C6_DivisionHq", 14, 10), count: 2 });
        }, "ch6_hqShelled");
      },
    },

    Update() {},
  },
};

// ---------------------------------------------------------------------------
// 导演
// ---------------------------------------------------------------------------

/**
 * host 是装配层注入的窄接口。**每一条都是可选的** —— 全不给也跑得完
 *（纯规则测试就是这么跑的），缺哪一条就是那一件事不发生，不报错。
 *
 * 时间与位置
 *   Time() -> number                 全局秒表（state.elapsed）
 *   LevelTime() -> number            关内秒表（state.phaseTime）
 *   PlayerPos() -> {x,y,z}|null
 *   PlayerZone() -> string|null      玩家此刻在哪个路标圈里
 *   Ground(x, z) -> number
 *
 * 玩法系统（取值器，**不许拷值**：它们每关重建，拷出去会指到上一关）
 *   Story() Carry() Interact() Emplacement() Strafe() Flare() Telegraph()
 *   Companion() Checkpoint()
 *
 * 演员与道具
 *   SpawnActor({label,x,z,weapon,squadId}) -> handle|null
 *   Despawn(handle) / PositionOf(handle) / Alive(handle) / SetGoal(handle,x,z)
 *   Prop(spec) -> handle|null        摆一件关内道具（贴图纸片、白布担架…）
 *   SetPropState(id, state)          既有道具改状态（门板拆掉）
 *   MarkPersistent(key, value)       跨关记一笔（拆过几块门板、罗班长倒下了）
 *
 * 演出
 *   Hint(text, seconds) / Say(who, text, seconds) / PlaySfx(name, opts)
 *   PlayCutscene(id)                 关中过场（= window.Taierzhuang.PlayMidCutscene）
 *   SetCombatBed(on, fadeS)          交火声床整层淡入/淡出（三关声音先行段）
 *   Firewall(spec) / Shell(spec) / OpenGate(id) / SilenceCoverFire(on)
 *   VolleyThrow(spec)                让一片友军同时投弹（二关「甩！」）
 *   CarryLeader(spec)                AI 抬人（四关罗班长）
 *   SwitchPov(spec)                  视角接替（五关⑫）
 *   GroundPov(spec)                  击倒后的地面视角
 *   SetMeleeGate(on)                 白刃 QTE 的正片开关
 *   SetPlayerInvulnerable(on, secs)  固定事件那 4—6 秒
 *   EnemiesNear(x, z, r) -> number   这一片还有几个活着的日军
 *   CookingCrate() -> {id}|null      正在冒烟等着殉爆的弹药箱
 *   TakeItem(id) -> boolean          从背包里扣一件（民用短褂）
 */
export class MissionSetpieceDirector {
  constructor(host = {}) {
    this.host = host;
    this.levelId = null;
    this.phase = null;
    this.spec = null;
    this.ctx = null;
    this.mem = {};
    this.once = new Set();
    this.timers = [];
    this.columns = [];
    /** 已经播过的台词 key（onVoice 的判据）。 */
    this.spoken = new Set();
    /** story.fired 读到第几条了 —— 每帧只看新增的那几条。 */
    this.firedCursor = 0;
    /** 已经进过的路标（onZone 只触发第一次）。 */
    this.zonesSeen = new Set();
    /** 取证：这一关推了哪些信号、摆了几个点。 */
    this.signals = [];
    this.log = [];
  }

  /** 这一章有没有摆点表（序章那一条是**故意**空的，不算没有）。 */
  static Has(levelId) {
    return Object.prototype.hasOwnProperty.call(SETPIECES, levelId);
  }

  /**
   * 换关：清掉上一章的一切，摆这一章的。
   *
   * @param {string} levelId
   * @param {object} phase 本章的关卡表条目（要的只有 zones / minutes / mechanics）
   */
  BeginLevel(levelId, phase = null) {
    this.Reset("levelChange");
    this.levelId = levelId || null;
    this.phase = phase;
    this.spec = SETPIECES[this.levelId] || null;
    // 台词游标从**现在**起算。`story.fired` 是一本不清的全局流水账，
    // 从 0 开始扫的话，选章跳回一个已经玩过的章会把它上一遍的台词
    // 当成刚播的重演一遍 —— 表现是「一进关罗班长就已经牺牲了」。
    this.firedCursor = this.host.Story?.()?.fired?.length ?? 0;
    if (!this.spec) {
      this.log.push({ levelId, ok: false, why: "没有这一章的摆点表" });
      return false;
    }
    // 上下文**一关一个**，不是一帧一个：Update 是每帧路径，而这个门面
    // 自己没有任何 per-frame 状态（mem 是导演的，系统全走取值器）。
    this.ctx = new SetpieceContext(this);
    const s = this.ctx;
    try {
      this.spec.Setup?.(s);
    } catch (err) {
      // 摆点炸了不该把一关带走：吞掉、留痕、继续玩（台词与目标链不依赖这一层）。
      this.log.push({ levelId, ok: false, why: `Setup 抛异常：${String((err && err.message) || err)}` });
      return false;
    }
    this.log.push({ levelId, ok: true, points: this.host.Interact?.()?.PointCount ?? null });
    return true;
  }

  /** 换关/收摊。**交互点按本章 tag 清**，别把别的章的点一起摘掉。 */
  Reset(reason = "reset") {
    for (const column of this.columns) column.Reset();
    this.columns.length = 0;
    if (this.levelId) {
      try { this.host.Interact?.()?.Clear(this.levelId); } catch { /* 宿主的事 */ }
    }
    this.levelId = null;
    this.phase = null;
    this.spec = null;
    this.ctx = null;
    this.mem = {};
    this.once.clear();
    this.timers.length = 0;
    this.spoken.clear();
    this.firedCursor = 0;
    this.zonesSeen.clear();
    this.signals.length = 0;
    return reason;
  }

  Update(dt) {
    if (!this.spec || !this.ctx) return false;
    const s = this.ctx;

    // --- 台词节拍：只看 story.fired 新增的那几条 -----------------------------
    const story = this.host.Story?.();
    const fired = story ? story.fired : null;
    if (fired) {
      // 换关时 story.fired **不清**（它是全局流水账），所以游标只往前走。
      for (let i = this.firedCursor; i < fired.length; i += 1) {
        const beat = fired[i];
        if (!beat || !beat.voice) continue;
        this.spoken.add(beat.voice);
        const hook = this.spec.onVoice && this.spec.onVoice[beat.voice];
        if (hook) this._Safe(() => hook(s), `onVoice:${beat.voice}`);
      }
      this.firedCursor = fired.length;
    }

    // --- 路标：只触发第一次 --------------------------------------------------
    const zone = this.host.PlayerZone?.();
    if (zone && !this.zonesSeen.has(zone)) {
      this.zonesSeen.add(zone);
      const hook = this.spec.onZone && this.spec.onZone[zone];
      if (hook) this._Safe(() => hook(s), `onZone:${zone}`);
    }

    // --- 定时器 --------------------------------------------------------------
    if (this.timers.length) {
      const now = Num(this.host.Time?.(), 0);
      const due = this.timers.filter((t) => now >= t.at);
      if (due.length) {
        this.timers = this.timers.filter((t) => now < t.at);
        for (const t of due) {
          if (t.key && this.once.has(t.key)) continue;
          if (t.key) this.once.add(t.key);
          this._Safe(() => t.fn?.(s), `timer:${t.key || "?"}`);
        }
      }
    }

    this._Safe(() => this.spec.Update?.(s, dt), "Update");
    return true;
  }

  _Safe(fn, where) {
    try { fn(); } catch (err) {
      this.log.push({ levelId: this.levelId, ok: false, why: `${where}：${String((err && err.message) || err)}` });
    }
  }

  /** 取证口（Debug.Setpieces）。 */
  State() {
    return {
      levelId: this.levelId,
      has: !!this.spec,
      once: [...this.once],
      spoken: this.spoken.size,
      zonesSeen: [...this.zonesSeen],
      signals: this.signals.slice(),
      timers: this.timers.length,
      columns: this.columns.map((c) => c.State()),
      mem: Object.fromEntries(Object.entries(this.mem)
        .filter(([, v]) => typeof v !== "object" || v === null)),
      log: this.log.slice(-12),
    };
  }
}

export default MissionSetpieceDirector;
