// 《滕县 一九三八》玩家负重状态机 —— 担架（双人抬）与单人重物（药箱/弹药箱/门板/铁锅/伤员）。
//
// **纯规则，不许 import three。** 「抬着东西的时候能不能开枪、走多快、放不放得下」
// 这三件事与画面无关，所以整条状态机在纯 Node 里跑得完（回归口 `Script_CarryTest.mjs`）。
//
// ── 为什么单独一个模块 ───────────────────────────────────────────────────────
// 任务流程重制里有七章要用到「手上占着东西」这件事：
//   一关 stretcherCarry / stretcherRelease、二关 crateHauling、三关 doorPlankStretcher /
//   carryWounded、四关 carryLeader、五关 escortConvoy 的抬担架过路口。
// 它们的差别只有四个数（走多慢、举多久、放多久、能不能摔）和两个开关
// （允不允许玩家主动放下、能不能被脚本强行掰开手），**不是七套逻辑**。
// 所以这里给一张 `CARRY_KINDS` 表 + 一台状态机，章节侧只写 `Begin("stretcher", {...})`。
//
// ── 与玩家控制器的接口只有一个字段 ───────────────────────────────────────────
// `player.carrySpeedScale`（默认 1）。Script_Player 在三处读它：禁冲刺、禁开镜、乘进移速。
// 这一层每帧写它，**不直接改速度公式**——移动的账在 Script_Player 手里，
// 负重只是往那本账上加一条乘数。
//
// ── 「能不能开枪」不在这里判 ────────────────────────────────────────────────
// 这里只导出 `Blocking`（举起中 / 抬着 / 放下收尾这三段都是 true），
// 装配层的 `TryFire` 读它决定这一下左键是打枪还是把箱子摔了。
// 视图模型收枪同理：装配层按 `Blocking` 的边沿切 `viewmodel.root.visible`。
//
// ── 玩家永远可以走开 ────────────────────────────────────────────────────────
// 除了显式声明 `canDrop:false` 的那一次（第四关抬罗班长，「哪个都不准松」是剧情要求），
// 玩家随时按 F 就能放下、按左键就能摔下。**这一层不夺控制权、不锁视角、不锁移动**，
// 这是 docs/Data_MissionDesign.md 的实机演出规矩。

/**
 * 负重档案表。数值只在这里，文档里只写常量名（AGENTS 硬规矩 12）。
 *
 * speedScale  乘进 `player.carrySpeedScale`；<1 时冲刺与开镜一并封掉。
 * liftS       举起的收尾时间：这一段已经走不快也开不了枪，但还没「抬稳」。
 * releaseS    主动放下的收尾时间。担架比箱子长，因为要跟前端那个人对上节奏。
 * canThrow    慌了能不能直接摔在地上（左键）。**担架不许摔** —— 那是个人，不是麻袋。
 * holders     几个人抬。2 表示需要一个前端同伴（由 AI/演员占位，不在这一层驱动）。
 * spanM       前后端的间距，`PartnerAnchor` 按它算前端该站哪儿。
 * sfxLift/Drop/Throw  三个动作各用哪条现成的音效配方（Script_Audio 的 RECIPES 名）。
 */
export const CARRY_KINDS = {
  stretcher: {
    id: "stretcher", label: "担架", holderLabel: "担架后端",
    speedScale: 0.42, liftS: 0.75, releaseS: 0.60,
    canThrow: false, holders: 2, spanM: 1.85,
    note: "两只手都占着 —— 枪背在背上",
    sfxLift: "footstepRubble", sfxDrop: "impactDirt", sfxThrow: "bodyFall",
  },
  wounded: {
    id: "wounded", label: "伤员", holderLabel: "背着伤员",
    speedScale: 0.38, liftS: 1.00, releaseS: 0.55,
    canThrow: false, holders: 1, spanM: 0,
    note: "背上一个人 —— 走不快，也打不了",
    sfxLift: "footstepRubble", sfxDrop: "bodyFall", sfxThrow: "bodyFall",
  },
  medBox: {
    id: "medBox", label: "药箱",
    speedScale: 0.58, liftS: 0.55, releaseS: 0.35,
    canThrow: true, holders: 1, spanM: 0,
    note: "抱着药箱",
    sfxLift: "footstepRubble", sfxDrop: "impactWood", sfxThrow: "impactWood",
  },
  ammoCrate: {
    id: "ammoCrate", label: "弹药箱",
    speedScale: 0.50, liftS: 0.65, releaseS: 0.40,
    canThrow: true, holders: 1, spanM: 0,
    note: "拖着弹药箱",
    sfxLift: "footstepRubble", sfxDrop: "impactWood", sfxThrow: "impactWood",
  },
  doorPlank: {
    id: "doorPlank", label: "门板",
    speedScale: 0.54, liftS: 0.70, releaseS: 0.40,
    canThrow: true, holders: 1, spanM: 0,
    note: "扛着一扇门板",
    sfxLift: "footstepRubble", sfxDrop: "impactWood", sfxThrow: "impactWood",
  },
  ironPot: {
    id: "ironPot", label: "铁锅",
    speedScale: 0.72, liftS: 0.40, releaseS: 0.25,
    canThrow: true, holders: 1, spanM: 0,
    note: "抱着一口铁锅",
    sfxLift: "footstepRubble", sfxDrop: "impactMetal", sfxThrow: "impactMetal",
  },
};

/** 摔下去之后再拿起来之前的空窗；没有它，一次左键会在同一帧摔完又捡起来。 */
const REPICK_LOCK_S = 0.45;

const Clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

/**
 * host 是装配层注入的窄接口（同 MeleeQteDirector 的约定）：
 *   Play(name, opts)              放一条音效
 *   Hint(text, seconds)           一次性提示语
 *   Say(who, text, seconds)       让人喊一句（拒绝松手时用）
 *   Time() -> number              关内秒表，用于取证与冷却
 */
export class CarrySystem {
  constructor(host = {}) {
    this.host = host;
    /** 当前那一件；null = 空手。 */
    this.load = null;
    this.serial = 0;
    /** 刚摔下/放下之后的短暂空窗，防止同一次按键既放下又捡起。 */
    this.lockS = 0;
    this.player = null;
    this.stats = {
      begun: 0, dropped: 0, thrown: 0, forced: 0, refused: 0, completed: 0,
    };
    /** 最后一次卸载的取证记录：{ kindId, reason, forced, carriedS }。 */
    this.lastRelease = null;
  }

  get Active() { return !!this.load; }
  /** 举起中 / 抬着 / 放下收尾这三段都算「手上占着」：不能开枪，枪也不在画面里。 */
  get Blocking() { return !!this.load; }
  get Phase() { return this.load ? this.load.phase : "idle"; }
  get KindId() { return this.load ? this.load.kind.id : null; }
  /** 抬稳了没有：脚本要在「真的抬起来了」之后才推进目标链，读这个而不是 Active。 */
  get Carrying() { return !!this.load && this.load.phase === "carry"; }

  Time() { return Number(this.host.Time?.() ?? 0); }

  /**
   * 抬起一件东西。
   *
   * @param {string} kindId  CARRY_KINDS 的键
   * @param {object} opts
   *   label        覆盖显示名（「罗班长」比「担架」更该出现在 HUD 上）
   *   partner      前端同伴（AI soldier / 演员），本层只存不驱动
   *   payload      集成批挂的任意数据（担架上是谁、箱子里是什么）
   *   canDrop      允不允许玩家主动放下（默认 true；第四关抬罗班长设 false）
   *   refuseLine   canDrop=false 时按 F 会喊的那一句
   *   OnLift / OnDrop(info) / OnRelease(info)  三个回调，章节侧接自己的演出
   * @returns {boolean} 真的抬起来了没有
   */
  Begin(kindId, opts = {}) {
    if (this.load || this.lockS > 0) return false;
    const kind = CARRY_KINDS[kindId];
    if (!kind) return false;
    // 死人不抬东西。玩家没接上来的时候（纯规则测试）不查这一条。
    if (this.player && this.player.Alive === false) return false;
    this.load = {
      serial: ++this.serial,
      kind,
      label: String(opts.label ?? kind.label),
      note: String(opts.note ?? kind.note ?? ""),
      partner: opts.partner ?? null,
      payload: opts.payload ?? null,
      canDrop: opts.canDrop !== false,
      refuseLine: opts.refuseLine ?? "哪个都不准松！",
      OnDrop: opts.OnDrop ?? null,
      OnRelease: opts.OnRelease ?? null,
      phase: "lift",
      phaseT: 0,
      carriedS: 0,
      beganAt: this.Time(),
    };
    this.stats.begun += 1;
    this.host.Play?.(kind.sfxLift, { volume: 0.5 });
    opts.OnLift?.(this.View());
    return true;
  }

  /**
   * 玩家主动放下（F）。`canDrop:false` 的那一次只会挨一句吼 —— 这是剧情要求的
   * 「拒绝松手」变体，不是 bug，所以它**返回 false 且记一次 refused**。
   */
  Drop(reason = "player") {
    const load = this.load;
    if (!load) return false;
    if (load.phase === "release") return false;
    if (!load.canDrop) {
      this.stats.refused += 1;
      this.host.Say?.("你", load.refuseLine, 1.8);
      return false;
    }
    load.phase = "release";
    load.phaseT = 0;
    load.reason = reason;
    this.stats.dropped += 1;
    this.host.Play?.(load.kind.sfxDrop, { volume: 0.55 });
    load.OnDrop?.(this.View());
    return true;
  }

  /**
   * 摔下去（左键）。**立刻**恢复战斗 —— 这是「可扔下快速恢复」那一条：
   * 被打了要开枪的时候，玩家去够的键本来就是左键，不该让他先想起来 F 在哪。
   * 担架 canThrow:false，摔不了；那时左键什么也不做（不代替放下）。
   */
  Throw(reason = "fire") {
    const load = this.load;
    if (!load || !load.kind.canThrow) return false;
    // 「拒绝松手」连摔也拦住，而且同样回一句 —— 静默无反应会被读成 bug。
    if (!load.canDrop) {
      this.stats.refused += 1;
      this.host.Say?.("你", load.refuseLine, 1.8);
      return false;
    }
    this.host.Play?.(load.kind.sfxThrow, { volume: 0.7 });
    this.stats.thrown += 1;
    this.Finish("throw", reason, false);
    return true;
  }

  /**
   * 脚本强行掰开手（第一关日机进入攻击航线，顺子本能松开担架）。
   * 任何阶段都成立，`canDrop` 也拦不住它 —— 那正是「本能」两个字的意思。
   */
  ForceRelease(reason = "scripted") {
    if (!this.load) return false;
    this.stats.forced += 1;
    this.host.Play?.(this.load.kind.sfxThrow, { volume: 0.65 });
    this.Finish("force", reason, true);
    return true;
  }

  /** 换关 / 复活 / 出错时的兜底：不记 forced，也不放音。 */
  Reset(reason = "reset") {
    if (this.load) this.Finish("reset", reason, false);
    this.lockS = 0;
    if (this.player) this.player.carrySpeedScale = 1;
    return true;
  }

  /** 三条卸载路径的共同出口。 */
  Finish(how, reason, forced) {
    const load = this.load;
    if (!load) return null;
    const info = {
      kindId: load.kind.id, label: load.label, payload: load.payload,
      partner: load.partner, how, reason, forced: !!forced,
      carriedS: load.carriedS, serial: load.serial,
    };
    this.load = null;
    this.lastRelease = info;
    this.lockS = how === "reset" ? 0 : REPICK_LOCK_S;
    if (this.player) this.player.carrySpeedScale = 1;
    load.OnRelease?.(info);
    return info;
  }

  /**
   * 每帧。**必须排在 player.Update 之前** —— 它写的 `carrySpeedScale`
   * 就是这一帧玩家要用的那个乘数，写晚一帧就会「刚抬起来还能冲刺一步」。
   */
  Update(dt, player = this.player) {
    const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
    if (player) this.player = player;
    if (this.lockS > 0) this.lockS = Math.max(0, this.lockS - step);
    const load = this.load;
    if (!load) {
      if (this.player) this.player.carrySpeedScale = 1;
      return;
    }
    // 人倒了，东西自然落地。这一条不走 ForceRelease：它不是「顺子松手」，
    // 记进 forced 会污染那一关的取证。
    if (this.player && this.player.Alive === false) {
      this.Finish("death", "playerDown", false);
      return;
    }
    if (load.phase === "lift") {
      load.phaseT += step;
      if (load.phaseT >= load.kind.liftS) { load.phase = "carry"; load.phaseT = 0; }
    } else if (load.phase === "carry") {
      load.phaseT += step;
      load.carriedS += step;
    } else if (load.phase === "release") {
      load.phaseT += step;
      if (load.phaseT >= load.kind.releaseS) {
        this.stats.completed += 1;
        this.Finish("drop", load.reason || "player", false);
        return;
      }
    }
    if (this.player) this.player.carrySpeedScale = load.kind.speedScale;
  }

  /**
   * 前端同伴该站哪儿。纯几何：沿玩家朝向往前 spanM。
   * 演员/AI 走不走得到那儿由它们自己决定，这一层只给一个点。
   */
  PartnerAnchor(player = this.player) {
    const load = this.load;
    if (!load || load.kind.holders < 2 || !player) return null;
    const yaw = Number(player.yaw) || 0;
    const span = load.kind.spanM;
    return {
      x: (player.position?.x ?? 0) - Math.sin(yaw) * span,
      y: player.position?.y ?? 0,
      z: (player.position?.z ?? 0) - Math.cos(yaw) * span,
      yaw,
    };
  }

  /**
   * 给 HUD 与情境提示条的脱敏快照。**HUD 只读这个**，不认识 load 本体。
   * `prompt` 就是提示条上那一行字；`t` 是举起/放下那一段的进度（抬着的时候是 1）。
   */
  View() {
    const load = this.load;
    if (!load) return null;
    const kind = load.kind;
    const t = load.phase === "lift" ? Clamp01(load.phaseT / Math.max(1e-3, kind.liftS))
      : load.phase === "release" ? 1 - Clamp01(load.phaseT / Math.max(1e-3, kind.releaseS))
        : 1;
    const prompt = load.phase === "lift" ? `抬起${load.label}……`
      : load.phase === "release" ? `放下${load.label}……`
        : load.canDrop ? `放下${load.label}` : `不许松手`;
    return {
      active: true,
      serial: load.serial,
      kindId: kind.id,
      label: load.label,
      note: load.note,
      phase: load.phase,
      t,
      carriedS: load.carriedS,
      speedScale: kind.speedScale,
      canDrop: load.canDrop,
      canThrow: !!kind.canThrow && load.canDrop,
      holders: kind.holders,
      partner: load.partner,
      payload: load.payload,
      blockFire: true,
      prompt,
    };
  }

  /** 取证口（Debug.Carry / 冒烟断言读它）。 */
  State() {
    return {
      load: this.View(),
      lockS: this.lockS,
      stats: { ...this.stats },
      lastRelease: this.lastRelease ? { ...this.lastRelease } : null,
      speedScale: this.player ? this.player.carrySpeedScale : 1,
    };
  }
}

export default CarrySystem;
