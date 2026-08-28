// 《滕县 一九三八》通用交互：F 键。**纯规则，不许 import three。**
//
// ── 这个文件现在是两层 ───────────────────────────────────────────────────────
//
// 【一】**内建分支**（ER2 式的「按上下文挑一件事做」，原样保留）：
//   · 拾枪拾弹 —— 2 m 内最近的尸体，捡它的枪与还没打完的桥夹；
//   · 分弹药   —— 2.5 m 内弹打光的弟兄，分一个桥夹过去。
//   这两条不查注册表，因为它们的「交互点」是活的战场对象（谁倒下了、谁打光了），
//   摆不进一张静态表里。
//
// 【二】**可注册交互点框架**（2026-08-28 任务流程重制新增）：
//   任务流程重制给七章开出了一长串「站到这儿按一下」的动作 ——
//   按住伤口止血、递纱布、检查伤员、拆门板、接/剪电话线、拾传单、投传单入火、撕短褂……
//   它们的差别只有四样：**够得着的判据、手势、提示语、完成之后干什么**。
//   把它们写成 if 分支就是把关卡内容写进引擎；所以这里给一张注册表，
//   章节/集成批调 `Register(spec)` 摆点，引擎只负责判定与推进。
//
// ── 三种手势 ────────────────────────────────────────────────────────────────
//   tap      按一下就完成（拾传单、递纱布、拆门板）。
//   hold     按住，进度环走满才完成；**中途松手进度会退回去，但不清零** ——
//            按住止血这种事，手抖一下不该从头再来。
//   confirm  长按确认；**中途松手直接清零**。用在不可逆的决定上
//            （撕短褂、剪掉收不回来的电话线）：要玩家真的按满那一下。
//
// ── 这一层不碰玩家状态 ──────────────────────────────────────────────────────
// 捡到什么、给了谁、哪件道具没了，全部通过 hooks / OnComplete 交回装配层与章节数据，
// 因为槽位与弹仓的账在 Script_Main 手里（state.slots / state.mags）。

import { WEAPONS } from "./Data_Weapons.mjs";

/**
 * 判据常数。数值只在这里；文档写常量名不抄数（AGENTS 硬规矩 12）。
 *
 * corpseReachM / mateReachM 比 ER2 短一点 —— 巷战里两米开外的东西本来就不该「顺手」拿到。
 * facingDot 是「大致朝着它」：0.20 约等于 ±78°，比准心宽得多；
 * 交互不是射击，不该要求玩家对准。
 */
export const INTERACT = {
  corpseReachM: 2.0,
  mateReachM: 2.5,
  pointReachM: 2.2,
  pointHeightM: 3.0,
  facingDot: 0.20,
  /** hold 型松手之后进度每秒退多少（按占总时长的比例算）。 */
  holdDecayPerS: 1.4,
  /** 注册点默认优先级：比内建的拾枪（0）高，同样距离下先提示「止血」而不是「捡枪」。 */
  pointPriority: 10,
};

const Clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const GESTURES = new Set(["tap", "hold", "confirm"]);

/** 交互点的锚点：固定坐标或挂在实体上（`Anchor()` 每次现算）。 */
function AnchorOf(point) {
  if (typeof point.Anchor === "function") return point.Anchor();
  return point.position || null;
}

export class InteractSystem {
  /**
   * @param {object} ctx { ai, audio, hud }
   * @param {object} hooks
   *   TakeWeapon(weaponId, clips, soldier, weaponVariant) -> boolean  捡起一件武器（装配层改槽位与弹仓）
   *   HasWeapon(weaponId) -> boolean                    玩家是否已有同类槽位（决定“拾起/换上”）
   *   SpareClips() -> number                            玩家手上还有几个桥夹
   *   GiveClip(soldier) -> boolean                      分一个桥夹给弟兄
   */
  constructor(ctx, hooks = {}) {
    this.ctx = ctx;
    this.hooks = hooks;
    this.lastLabel = null;      // 提示语只在变化时打一次，不然每帧一条
    this.pickups = 0;           // 捡了几次（运行时取证用）
    this.handouts = 0;          // 分了几次弹
    /** 注册的交互点：id -> spec。摆点是集成批的事，引擎只读这张表。 */
    this.points = new Map();
    this.autoId = 0;
    /** 正在按住的那一次：{ id, t, holding, gesture, seconds }。 */
    this.hold = null;
    this.completions = 0;       // 注册点被完成了几次（取证用）
    this.cancels = 0;
  }

  // -------------------------------------------------------------------------
  // 注册表
  // -------------------------------------------------------------------------

  /**
   * 摆一个交互点。**同 id 重复注册是覆盖，不是报错** ——
   * 换关重摆是常态，为此让集成批先记得调 Clear 太容易漏。
   *
   * @param {object} spec
   *   id        字符串；不给就自动编号
   *   kind      HUD 图标用的语义名（interact/bandage/plank/wire/fire/leaflet/tear/...）
   *   label     提示语；可以是函数 (ctx) => string
   *   gesture   "tap" | "hold" | "confirm"（默认 tap）
   *   seconds   hold/confirm 要按多久（默认 1.2）
   *   position  {x,y,z} 固定坐标；或
   *   Anchor()  -> {x,y,z}   挂在实体上时每次现算
   *   reachM / heightM / facingDot   够得着的判据（不给用 INTERACT 的默认；facingDot=null 表示不判朝向）
   *   priority  排序权重，越大越先提示（默认 INTERACT.pointPriority）
   *   once      完成一次就自动摘掉（默认 true）
   *   cooldownS 可重复时两次之间的间隔
   *   tag       批量清理用的分组名（一般写章节 id）
   *   Enabled(ctx) -> boolean          现在能不能做（缺条件时整条不出现，不出灰提示）
   *   OnBegin(ctx) / OnProgress(t, ctx) / OnCancel(ctx)
   *   OnComplete(ctx) -> boolean|void  返回 false 表示「这一下不算数」（不计完成、不摘点）
   * @returns {string} 点的 id
   */
  Register(spec = {}) {
    const id = String(spec.id ?? `ip_${++this.autoId}`);
    const gesture = GESTURES.has(spec.gesture) ? spec.gesture : "tap";
    const point = {
      ...spec,
      id,
      gesture,
      kind: spec.kind || "interact",
      seconds: Math.max(0.05, Number(spec.seconds ?? 1.2)),
      reachM: Number(spec.reachM ?? INTERACT.pointReachM),
      heightM: Number(spec.heightM ?? INTERACT.pointHeightM),
      facingDot: spec.facingDot === null ? null : Number(spec.facingDot ?? INTERACT.facingDot),
      priority: Number(spec.priority ?? INTERACT.pointPriority),
      once: spec.once !== false,
      cooldownS: Number(spec.cooldownS ?? 0),
      tag: spec.tag ?? null,
      cooldownLeft: 0,
      count: 0,
    };
    this.points.set(id, point);
    return id;
  }

  Unregister(id) {
    if (this.hold?.id === id) this.CancelHold("unregistered");
    return this.points.delete(String(id));
  }

  /** 按 tag 批量清理；不给 tag 就整表清空（换关走这一条）。 */
  Clear(tag = null) {
    let removed = 0;
    for (const [id, point] of [...this.points]) {
      if (tag !== null && point.tag !== tag) continue;
      this.points.delete(id);
      removed += 1;
    }
    if (this.hold && !this.points.has(this.hold.id)) this.CancelHold("cleared");
    return removed;
  }

  Point(id) { return this.points.get(String(id)) || null; }
  get PointCount() { return this.points.size; }

  // -------------------------------------------------------------------------
  // 判定
  // -------------------------------------------------------------------------

  /** 玩家够不够得着这个点；够得着就返回距离，够不着返回 null。 */
  Reach(point, player) {
    const anchor = AnchorOf(point);
    if (!anchor) return null;
    const px = player.position.x, pz = player.position.z;
    const dx = anchor.x - px, dz = anchor.z - pz;
    const dist = Math.hypot(dx, dz);
    if (dist > point.reachM) return null;
    // 高度窗口：楼上那个点不该在楼下按得到。锚点不给 y 就不判。
    if (anchor.y != null && player.position.y != null) {
      if (Math.abs(anchor.y - player.position.y) > point.heightM) return null;
    }
    if (point.facingDot != null && dist > 0.05) {
      const yaw = Number(player.yaw) || 0;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      if ((fx * dx + fz * dz) / dist < point.facingDot) return null;
    }
    return dist;
  }

  /** 交给回调的上下文。保持窄：点、玩家、距离，外加系统自己。 */
  Context(point, player, dist) {
    return { point, player, dist, system: this, payload: point.payload ?? null };
  }

  LabelOf(point, ctx) {
    const label = typeof point.label === "function" ? point.label(ctx) : point.label;
    return label == null ? "" : String(label);
  }

  /**
   * 现在按 F 会发生什么。返回 null 表示什么也不会发生 —— **那就真的什么也不发生**，
   * 不许弹"这里没有东西可以交互"之类的提示：一个键按下去老是弹废话比没反应更差。
   *
   * 注册点与内建分支排在同一张榜上：先比 priority，再比距离。
   */
  Query(player) {
    if (!player || !player.Alive) return null;
    let best = null;
    const Consider = (candidate) => {
      if (!best) { best = candidate; return; }
      if (candidate.priority > best.priority
        || (candidate.priority === best.priority && candidate.dist < best.dist)) best = candidate;
    };

    for (const point of this.points.values()) {
      if (point.cooldownLeft > 0) continue;
      const dist = this.Reach(point, player);
      if (dist == null) continue;
      const ctx = this.Context(point, player, dist);
      if (point.Enabled && !point.Enabled(ctx)) continue;
      Consider({
        kind: point.kind, point, dist, priority: point.priority,
        gesture: point.gesture, seconds: point.seconds,
        label: this.LabelOf(point, ctx),
      });
    }

    for (const s of this.ctx?.ai?.soldiers || []) {
      const d = Math.hypot(s.position.x - player.position.x, s.position.z - player.position.z);
      if (!s.alive) {
        // 尸体：身上有没有还没被拿走的东西
        if (!s.drop || s.drop.taken || d > INTERACT.corpseReachM) continue;
        const name = WEAPONS[s.drop.weaponId]?.name || "枪";
        // HasPrimary 是早期测试/嵌入方的兼容口；主程序提供 HasWeapon，
        // 才能让大刀按 3 号槽而不是拿长枪槽判断“拾起/换上”。
        const hasWeapon = this.hooks.HasWeapon
          ? this.hooks.HasWeapon(s.drop.weaponId) : this.hooks.HasPrimary?.();
        const verb = hasWeapon ? "换上" : "拾起";
        Consider({
          kind: "pickup", soldier: s, label: `${verb} ${name}`, dist: d,
          priority: 0, gesture: "tap", seconds: 0,
        });
        continue;
      }
      // 活着的自己人：弹打光了就分一个桥夹过去
      if (s.side !== "nra" || d > INTERACT.mateReachM) continue;
      if (s.ammo > 0) continue;
      if ((this.hooks.SpareClips?.() ?? 0) < 2) continue;    // 自己只剩一个就不给了
      Consider({
        kind: "ammo", soldier: s, label: `分一个桥夹给 ${s.identity.name}`, dist: d,
        priority: 0, gesture: "tap", seconds: 0,
      });
    }
    return best;
  }

  // -------------------------------------------------------------------------
  // 手势
  // -------------------------------------------------------------------------

  /**
   * F 按下。tap 立刻做完；hold/confirm 开始按住，由 Update 推进度。
   * @returns 执行/开始的那一条，或者 null。
   */
  Press(player) {
    const candidate = this.Query(player);
    if (!candidate) return null;
    if (candidate.gesture === "tap") return this.Complete(candidate, player) ? candidate : null;
    // 换目标就重开一条进度；同一个点接着按则续上刚才退掉一半的那截。
    if (!this.hold || this.hold.id !== candidate.point.id) {
      // 上一条没退干净就被换掉时也要回一次 OnCancel —— 章节侧靠它收演出。
      if (this.hold) this.CancelHold("switched");
      this.hold = {
        id: candidate.point.id, t: 0, holding: true,
        gesture: candidate.gesture, seconds: candidate.seconds, label: candidate.label,
      };
      candidate.point.OnBegin?.(this.Context(candidate.point, player, candidate.dist));
    } else {
      this.hold.holding = true;
      this.hold.label = candidate.label;
    }
    return candidate;
  }

  /** F 松开。hold 型留着进度慢慢退，confirm 型立刻清零。 */
  Release() {
    if (!this.hold) return null;
    if (this.hold.gesture === "confirm") return this.CancelHold("released");
    this.hold.holding = false;
    return this.hold;
  }

  CancelHold(reason = "cancelled") {
    const hold = this.hold;
    if (!hold) return null;
    this.hold = null;
    this.cancels += 1;
    const point = this.points.get(hold.id);
    point?.OnCancel?.({ point, reason, system: this, t: hold.t });
    return null;
  }

  /**
   * 每帧推进按住型手势。**排在 player.Update 之后**：判据要用这一帧的位置，
   * 玩家走开一步进度就该断（不是走开之后还在后台读条）。
   */
  Update(dt, player) {
    const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
    for (const point of this.points.values()) {
      if (point.cooldownLeft > 0) point.cooldownLeft = Math.max(0, point.cooldownLeft - step);
    }
    const hold = this.hold;
    if (!hold) return null;
    const point = this.points.get(hold.id);
    if (!point) return this.CancelHold("gone");
    if (!player?.Alive) return this.CancelHold("playerDown");
    const dist = this.Reach(point, player);
    if (dist == null) return this.CancelHold("outOfReach");
    const ctx = this.Context(point, player, dist);
    if (point.Enabled && !point.Enabled(ctx)) return this.CancelHold("disabled");

    if (hold.holding) {
      hold.t = Clamp01(hold.t + step / hold.seconds);
      point.OnProgress?.(hold.t, ctx);
      if (hold.t >= 1) {
        const candidate = {
          kind: point.kind, point, dist, priority: point.priority,
          gesture: point.gesture, seconds: point.seconds, label: this.LabelOf(point, ctx),
        };
        this.hold = null;
        this.Complete(candidate, player);
        return candidate;
      }
    } else {
      hold.t -= step * INTERACT.holdDecayPerS / hold.seconds;
      if (hold.t <= 0) return this.CancelHold("decayed");
    }
    return null;
  }

  /** 真的做成了。内建两条走各自的结算；注册点走 OnComplete。 */
  Complete(candidate, player) {
    if (candidate.kind === "pickup") {
      const drop = candidate.soldier.drop;
      if (!this.hooks.TakeWeapon?.(drop.weaponId, drop.clips, candidate.soldier,
        drop.weaponVariant ?? 0)) return false;
      drop.taken = true;
      this.pickups += 1;
      const w = WEAPONS[drop.weaponId];
      this.ctx?.audio?.Play("magIn", { volume: 0.6 });
      if (w?.kind === "melee") {
        this.ctx?.hud?.Hint(`拾起${w.name}，放进 3 号近战槽`, 2.8);
        return true;
      }
      // 缴获日械只有枪里那五发 —— 这句提示是这条规则唯一的说明书，别删
      this.ctx?.hud?.Hint(drop.clips > 0
        ? `捡了一支${w?.name || "枪"}，还有 ${drop.clips} 个桥夹`
        : `捡了一支${w?.name || "枪"} —— 只有枪里这几发，我们没有这个口径`, 3.2);
      return true;
    }
    if (candidate.kind === "ammo") {
      if (!this.hooks.GiveClip?.(candidate.soldier)) return false;
      candidate.soldier.ammo = candidate.soldier.weapon.magazine || 5;
      this.handouts += 1;
      this.ctx?.audio?.Play("stripperLoad", { volume: 0.55 });
      this.ctx?.hud?.Say(candidate.soldier.identity.name, "接着！", 2.0);
      return true;
    }
    const point = candidate.point;
    if (!point) return false;
    const ctx = this.Context(point, player, candidate.dist);
    // 回调可以否掉这一次（条件在按住的过程中没了、背包里其实没有那件东西）。
    if (point.OnComplete && point.OnComplete(ctx) === false) return false;
    point.count += 1;
    this.completions += 1;
    if (point.sound) this.ctx?.audio?.Play(point.sound, { volume: point.soundVolume ?? 0.6 });
    if (point.hint) this.ctx?.hud?.Hint(point.hint, point.hintSeconds ?? 2.6);
    if (point.once) this.points.delete(point.id);
    else point.cooldownLeft = point.cooldownS;
    return true;
  }

  /** 兼容口：老调用点（DoInteract 早期版本、冒烟脚本）用的「按一下就做」。 */
  Perform(player) { return this.Press(player); }

  /** 给 HUD 进度环的脱敏快照。没有在按住就是 null。 */
  View() {
    const hold = this.hold;
    if (!hold) return null;
    const point = this.points.get(hold.id);
    if (!point) return null;
    // label 是按下那一刻算好存进 hold 的，不在这里现算 —— 现算要一份带 player 的
    // ctx，而 HUD 每帧都调 View()，让它去构造上下文等于把渲染层拖进规则层。
    return {
      id: hold.id, kind: point.kind, gesture: hold.gesture,
      t: Clamp01(hold.t), seconds: hold.seconds, holding: !!hold.holding,
      label: hold.label ?? "",
    };
  }

  /** 取证口（Debug.Interact）。 */
  State() {
    return {
      points: [...this.points.values()].map((p) => ({
        id: p.id, kind: p.kind, gesture: p.gesture, tag: p.tag,
        count: p.count, cooldownLeft: p.cooldownLeft,
      })),
      hold: this.View(),
      pickups: this.pickups, handouts: this.handouts,
      completions: this.completions, cancels: this.cancels,
    };
  }

  /**
   * 每帧的提示语。只在"能做的事"变了的时候打一次 ——
   * 每帧调一次 hud.Hint 会让提示条永远停在屏幕上闪。
   */
  UpdatePrompt(player) {
    const candidate = this.Query(player);
    const label = candidate ? candidate.label : null;
    if (label === this.lastLabel) return candidate;
    this.lastLabel = label;
    if (label) this.ctx?.hud?.Hint(`F — ${label}`, 1.6);
    return candidate;
  }
}

// ===========================================================================
// 救护类预制交互
//
// 全部是**纯函数**：吃一份摆点参数，吐一个（或一对）可以直接 Register 的 spec。
// 引擎不知道第几关在哪儿摆了几个 —— 那是集成批按各章 mechanics 旗标做的事。
// 每个预制只固定三样东西：手势、默认时长、提示语的说法；
// 「做完之后世界发生什么」一律留给调用方的回调。
//
// ── 摆点示例（集成批照抄这一段）──────────────────────────────────────────────
//
//   import {
//     BleedControlInteraction, DoorPlankInteraction, TearShirtInteraction,
//     WireInteractions, PickUpLoadInteraction,
//   } from "./Script_Interact.mjs";
//
//   // 进第三关时摆一批，tag 一律写章节 id —— 换关时 interact.Clear() 整表清，
//   // 要单独收掉某一段就 interact.Clear("CH3_Jiuhusuo")。
//   const T = window.Taierzhuang;          // 装配层里直接用 interact / carry 两个局部量
//   T.interact.Register(DoorPlankInteraction({
//     id: "ch3_plank_a", tag: "CH3_Jiuhusuo",
//     position: { x: 214, y: 0, z: -34 },
//     RemovePlank: () => dressing.Remove("doorPlank_a"),
//     SpawnStretcher: () => dressing.Spawn("stretcher", { x: 214, y: 0, z: -34 }),
//   }));
//   T.interact.Register(PickUpLoadInteraction({
//     id: "ch3_stretcher_rear", tag: "CH3_Jiuhusuo",
//     Anchor: () => stretcherProp.position,        // 挂在实体上，道具一挪点跟着挪
//     kindId: "stretcher", label: "接住担架后端", carry: T.carry,
//     options: { label: "担架（伤员）", partner: yaowaSoldier },
//   }));
//   T.interact.Register(TearShirtInteraction({
//     tag: "CH3_Jiuhusuo", Anchor: () => woundedSoldier.position,
//     ConsumeShirt: () => inventory.Take("civilianShirt"),   // 没有就返回 false，这一下不算数
//     OnComplete: () => story.Signal("shirtTorn"),
//   }));
//   for (const spec of WireInteractions({
//     id: "ch3_phone", tag: "CH3_Jiuhusuo",
//     a: { position: { x: 240, y: 0, z: -30 } },
//     b: { position: { x: 268, y: 0, z: -18 } },
//     OnJoin: () => story.Signal("phoneJoined"),
//   })) T.interact.Register(spec);
//
//   // 第一关「顺子松手」：脚本在日机进入攻击航线那一拍强行掰开手，
//   // 玩家躲不躲得掉是另一条（aircraftStrafe 那一批），这里只负责松手这件事。
//   T.carry.ForceRelease("dive");
//
//   // 第四关抬罗班长：抬起来的时候就声明「不许松手」，玩家按 F 只会挨一句吼。
//   T.carry.Begin("stretcher", {
//     label: "罗班长", canDrop: false, refuseLine: "哪个都不准松！",
//     partner: yaowaSoldier, payload: { who: "luo" },
//     OnRelease: (info) => story.Signal(info.forced ? "luoDropped" : "luoDelivered"),
//   });
// ===========================================================================

/** 按住伤口止血（三关大出血、四关罗班长腹部中弹）。手抖一下不清零，所以是 hold。 */
export function BleedControlInteraction({
  id, position, Anchor, seconds = 3.0, label = "按住出血口", tag = null,
  OnComplete, OnProgress, once = true, payload = null,
} = {}) {
  return {
    id, position, Anchor, tag, payload, once,
    kind: "bandage", gesture: "hold", seconds, label,
    hint: "先压住出血。", sound: "stripperLoad",
    OnProgress, OnComplete,
  };
}

/** 递纱布 / 交药品：手上有就递过去，没有就整条不出现（不给灰提示）。 */
export function GiveSupplyInteraction({
  id, position, Anchor, item = "纱布", label, tag = null,
  Has, OnComplete, once = true, payload = null,
} = {}) {
  return {
    id, position, Anchor, tag, payload, once,
    kind: "supply", gesture: "tap", seconds: 0,
    label: label ?? `递${item}`,
    Enabled: Has ? (ctx) => !!Has(ctx) : undefined,
    sound: "magIn", OnComplete,
  };
}

/**
 * 检查伤员。**「有没有脉」不在引擎里判** —— 那是剧本的事（四关卫生兵那一句
 * 「没得脉了」是固定演出）。这里只负责把「玩家真的蹲下来看了一眼」这件事报上去。
 */
export function CheckWoundedInteraction({
  id, position, Anchor, seconds = 1.1, label = "查看伤员", tag = null,
  OnComplete, once = true, payload = null,
} = {}) {
  return {
    id, position, Anchor, tag, payload, once,
    kind: "check", gesture: "hold", seconds, label,
    OnComplete,
  };
}

/**
 * 拆门板做担架（三关「没得担架了，拆门板！」）。
 * 完成时把门板 prop 换成担架 prop：两件事都由调用方的回调做，
 * 引擎只保证「拆」这个动作真的发生过一次。
 */
export function DoorPlankInteraction({
  id, position, Anchor, seconds = 1.8, label = "拆下门板做担架", tag = null,
  RemovePlank, SpawnStretcher, OnComplete, once = true, payload = null,
} = {}) {
  return {
    id, position, Anchor, tag, payload, once,
    kind: "plank", gesture: "hold", seconds, label,
    hint: "门板拆下来了 —— 当担架使。", sound: "impactWood",
    OnComplete: (ctx) => {
      // 顺序是固定的：先摘门板再放担架，反过来会有一帧两件东西叠在同一个位置。
      const removed = RemovePlank ? RemovePlank(ctx) : true;
      if (removed === false) return false;
      const stretcher = SpawnStretcher ? SpawnStretcher(ctx) : null;
      OnComplete?.({ ...ctx, stretcher });
      return true;
    },
  };
}

/**
 * 接电话线：**两点连线判定**。小秦查断点、玩家把断掉的两头接上。
 * 返回一对 spec —— 先按哪一头都行，两头都按到才算接通。
 * 中间任何一头被「剪」掉（CutWireInteraction）时调用方自己 Unregister 这一对。
 */
export function WireInteractions({
  id = "wire", a, b, seconds = 1.6, tag = null,
  labelA = "接上这一头", labelB = "接上另一头", OnJoin, once = true,
} = {}) {
  const link = { a: false, b: false };
  const Make = (side, spot, label) => ({
    id: `${id}_${side}`, tag, once,
    position: spot?.position, Anchor: spot?.Anchor,
    kind: "wire", gesture: "hold", seconds, label,
    // 已经接上的那一头不再提示（不出灰条）。
    Enabled: () => !link[side],
    OnComplete: (ctx) => {
      link[side] = true;
      if (link.a && link.b) OnJoin?.({ ...ctx, link: { ...link } });
      return true;
    },
  });
  return [Make("a", a, labelA), Make("b", b, labelB)];
}

/** 剪断收不回来的线路（三关撤退时小秦那一剪）。不可逆 → confirm。 */
export function CutWireInteraction({
  id, position, Anchor, seconds = 1.4, label = "剪断线路", tag = null,
  OnComplete, once = true, payload = null,
} = {}) {
  return {
    id, position, Anchor, tag, payload, once,
    kind: "wire", gesture: "confirm", seconds, label,
    hint: "这一段收不回来了。", OnComplete,
  };
}

/** 拾一张「放下武器，可保生命」的传单。 */
export function LeafletPickupInteraction({
  id, position, Anchor, label = "拾起传单", tag = null,
  OnComplete, once = true, payload = null,
} = {}) {
  return {
    id, position, Anchor, tag, payload, once,
    kind: "leaflet", gesture: "tap", seconds: 0, label,
    OnComplete,
  };
}

/**
 * 把传单投进火里（三关末，火焰封住一条追击路线）。
 * 手上没有传单时整条不出现；点燃哪一处火由 IgniteSource 回调决定。
 */
export function LeafletBurnInteraction({
  id, position, Anchor, label = "把传单投进火里", tag = null,
  HasLeaflet, IgniteSource, OnComplete, once = true, payload = null,
} = {}) {
  return {
    id, position, Anchor, tag, payload, once,
    kind: "fire", gesture: "tap", seconds: 0, label,
    Enabled: HasLeaflet ? (ctx) => !!HasLeaflet(ctx) : undefined,
    OnComplete: (ctx) => {
      if (HasLeaflet && !HasLeaflet(ctx)) return false;
      IgniteSource?.(ctx);
      OnComplete?.(ctx);
      return true;
    },
  };
}

/**
 * 撕开背包里那件民用短褂（三关，顺子亲手毁掉自己的逃跑计划）。
 * **必须是 confirm**：这是全作最重的一次玩家操作，松手就该从头再来。
 * 短褂道具由 ConsumeShirt 回调从背包里扣掉；扣不掉就不算数（返回 false）。
 */
export function TearShirtInteraction({
  id = "tearShirt", position, Anchor, seconds = 2.2, tag = null,
  label = "撕开背包里那件短褂", ConsumeShirt, OnComplete, once = true,
} = {}) {
  return {
    id, position, Anchor, tag, once,
    kind: "tear", gesture: "confirm", seconds, label,
    OnComplete: (ctx) => {
      if (ConsumeShirt && ConsumeShirt(ctx) === false) return false;
      OnComplete?.(ctx);
      return true;
    },
  };
}

/**
 * 抬起一件东西（担架 / 药箱 / 弹药箱 / 门板 / 铁锅 / 伤员）。
 * 这是**交互层与负重层唯一的接缝**：交互只负责「玩家站到了这儿并且按了 F」，
 * 真正的状态机在 Script_Carry。`carry` 传 CarrySystem 实例。
 */
export function PickUpLoadInteraction({
  id, position, Anchor, kindId = "medBox", label, tag = null,
  carry, options = {}, seconds = 0, gesture = "tap", OnComplete, once = true,
} = {}) {
  return {
    id, position, Anchor, tag, once,
    kind: "carry", gesture, seconds,
    label: label ?? `抬起${kindId === "stretcher" ? "担架" : "东西"}`,
    // 手上已经占着的时候整条不出现 —— 不给一个按了没反应的提示。
    Enabled: () => !carry || !carry.Active,
    OnComplete: (ctx) => {
      if (carry && !carry.Begin(kindId, options)) return false;
      OnComplete?.(ctx);
      return true;
    },
  };
}
