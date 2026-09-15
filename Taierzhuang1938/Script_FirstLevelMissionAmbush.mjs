// 屋内伏击（第一关内部步骤 Melee）的编排规则。
//
// 纯 Node：不 import three、不读场景、不碰玩家。所有副作用都由注入的钩子完成，
// 位移与朝向由 Script_FirstLevelMissionRuntime 按当前 Phase 每帧驱动 ——
// 这里只负责「什么时候发生什么」和「记哪条事实」，所以 Script_FirstLevelMissionTest
// 可以逐拍确定性地跑成功／失败两条路、重放与重试。
//
// 拍表、数值出处与验收命令见 docs/Data_FirstLevelRoomAmbush.md。
//
// 五拍（对标《使命召唤：二战》诺曼底地堡）：
//   lunge   藏在壁龛里那个扑出来
//   butt    枪托砸倒（RifleButtStrike）→ 共用倒地：相机落到地板上
//   daze    晕厥＋恍惚；躺着看北门口的担架被一个个捅穿
//   grab    他扑上来压刺刀：一次性「按 F 抓住枪」的提示环
//   mash    推刀：共用地面 QTE（连按），只是画成同一个环
//   finish  推赢之后反手捅回去（左键），这一下才是杀招
export const AMBUSH_PHASES = Object.freeze([
  "waiting", "lunge", "butt", "daze", "grab", "mash", "finish", "broken", "resolved",
]);

/** 玩家手上有该按的键的那几拍。 */
const PROMPT_PHASES = Object.freeze(["grab", "mash", "finish"]);

export class FirstLevelAmbush {
  /**
   * @param {object} hooks 全部可缺省：Record/Has/Say/Lock/Unlock/Wake/PlayClip/
   *   KnockDown/Daze/LookAt/Prompt/BeginGround/GroundFailure/Finisher/Rise/EndGround/
   *   ColumnCasualty/KnockDownFriend/Release/SquadIn/Finish
   * @param {object} tuning MISSION_TUNING（只读 ambush* 那几项）
   */
  constructor(hooks = {}, tuning = {}) {
    this.hooks = hooks;
    this.R = tuning;
    this.Reset();
  }
  Reset() {
    this.phase = "waiting";
    this.waited = 0;        // 触发前等担架进门的秒数
    this.protectedWait = 0; // 等出生保护过去的秒数（刚重生 / 调试跳转）
    this.story = 0;         // 触发之后的编排时钟（背景拍表读它）
    this.sinceButt = -1;    // 被砸倒之后的秒数（恍惚曲线读它）
    this.sincePhase = 0;    // 进当前这一拍之后的秒数（提示窗口读它）
    this.sinceZhou = -1;
    this.sinceBroken = -1;
    this.beats = new Set();
    this.qteStarted = false;
    this.qteSuccess = null;
    this.failure = null;    // "grab" | "mash"：哪一步没顶住
    this.finisherAtS = null; // 反捅那一下落在进 finish 之后的第几秒
    this.downed = false;    // 玩家在这一拍里死了（收提示与恍惚只做一次）
    this.prompt = null;     // 当前提示环（脱敏快照，运行时只管画）
    this.squadSent = false;
    this.squadArrived = false;
  }
  get Phase() { return this.phase; }
  /** 剧本正在占着玩家（控制锁 + 倒地 + 提示环）。 */
  get Scripted() { return ["lunge", "butt", "daze", "grab", "mash", "finish"].includes(this.phase); }
  get Started() { return this.phase !== "waiting"; }
  /** 老周那一刀还没落：捅他的那个（AmbushRearB）还在演，先不放回普通战斗。 */
  get ZhouPending() { return this.Started && this.phase !== "resolved" && !this.beats.has("zhou"); }
  get Done() { return this.phase === "resolved"; }
  /** 被砸倒之后的秒数；还没被砸就是 null。恍惚曲线与地面镜头都按它取样。 */
  get DazeSeconds() { return this.sinceButt >= 0 ? this.sinceButt : null; }
  get Prompt() { return this.prompt; }

  Beat(id, at, Run) {
    if (this.story < at || this.beats.has(id)) return false;
    this.beats.add(id);
    Run();
    return true;
  }
  Clip(id, clipId) { this.hooks.PlayClip?.(id, clipId); }
  Enter(phase) { this.phase = phase; this.sincePhase = 0; }

  /**
   * 触发这一拍：记事实、喊话、锁控制、三个人起身。
   * 侧翼那个（AmbushFlank）留到挣脱之后才动，这里不叫醒。
   */
  Trigger(detail = {}) {
    if (this.phase !== "waiting") return false;
    const R = this.R;
    this.Enter("lunge");
    this.story = 0;
    this.hooks.Record?.("ambushTriggered", { ...detail });
    this.hooks.Say?.("RoomAmbush", { urgent: true });
    this.hooks.Lock?.(R.ambushLockMaxS);
    for (const id of ["AmbushLead", "AmbushRearA", "AmbushRearB"]) this.hooks.Wake?.(id);
    this.beats.add("rise");
    for (const id of ["AmbushLead", "AmbushRearA", "AmbushRearB"]) this.Clip(id, "AmbushRise");
    return true;
  }

  /** 够得着了：抡起枪托（RifleButtStrike），ambushButtImpactS 之后才砸到。 */
  Swing() {
    if (this.phase !== "lunge") return false;
    this.Enter("butt");
    // 视线跟着他走：触发那一下瞄的是他起身的位置，这会儿他已经贴到脸前了。
    // 不重新瞄，玩家看到的是一面墙挨了一下。
    this.hooks.LookAt?.("lead");
    this.Clip("AmbushLead", "RifleButtStrike");
    return true;
  }

  /**
   * 枪托砸中：伤害走共用白刃伤害链（kind "qte"），随后**倒下**——
   * 共用 KnockDown 把玩家真的放进 down 状态，镜头落到地板上。
   * 眼皮与耳鸣从这一瞬起算（Daze 的横轴零点就是这里）。
   */
  Butt() {
    if (this.phase !== "butt") return false;
    this.Enter("daze");
    this.sinceButt = 0;
    this.hooks.KnockDown?.();
    this.hooks.Daze?.(true);
    this.hooks.Record?.("ambushStabbed", { damage: this.R.ambushButtDamage, butt: true });
    return true;
  }

  /**
   * 他扑上来压刺刀：开「抓住枪」的一次性提示。
   * 压住的姿势由共用白刃层的 Pressure 摆（不放烘焙 clip）—— 反捅那一段
   * （PressureStabbed）就是从这个姿势接上去的。
   */
  Pounce() {
    if (this.phase !== "daze") return false;
    this.Enter("grab");
    this.hooks.LookAt?.("lead");
    this.hooks.Pounce?.();
    return true;
  }

  /**
   * 玩家在窗口里按下抓枪键：进共用地面 QTE（推刀）。
   * 推刀本身是共用规则（窗口、连按、结算），这一拍只是换一张环来画。
   */
  Grab() {
    if (this.phase !== "grab") return false;
    this.Enter("mash");
    this.qteStarted = this.hooks.BeginGround?.() === true;
    this.hooks.Record?.("ambushGrabbed", {});
    return true;
  }

  /** 推赢了：开反捅（左键）的提示。这一下才是杀招。 */
  Win() {
    if (this.phase !== "mash") return false;
    this.qteSuccess = true;
    this.Enter("finish");
    return true;
  }

  /**
   * 没顶住（抓枪没按上 / 推刀输了）：刀捅进去。
   * 共用地面失败伤害由钩子施加；在这一拍的血量下（枪托 20 + 共用 72 + 额外 18）
   * 就是死。死了的那条路**不记 ambushBroken** —— 检查点重试要把整拍从头重放，
   * 记了这条事实 ResetAmbush 就会当成「已经挣脱过」接着往下跑。
   */
  Fail(reason) {
    if (!["grab", "mash"].includes(this.phase)) return false;
    this.failure = reason;
    if (reason === "mash") this.qteSuccess = false;
    this.hooks.EndGround?.();
    this.hooks.GroundFailure?.(reason === "grab");
    this.hooks.Record?.("ambushBladeLanded", { reason });
    if (this.hooks.PlayerAlive?.() === false) return true;
    this.Break();
    return true;
  }

  /** 玩家在这一拍里死了：收掉提示与恍惚，整拍留在原地等检查点重试重放。 */
  Down() {
    this.hooks.Prompt?.(null);
    this.prompt = null;
    this.hooks.EndGround?.();
    this.hooks.Daze?.(false);
    return true;
  }

  /** 反捅：领头那个真的死在这一下上（走共用伤害链），然后起身。 */
  Finisher() {
    if (this.phase !== "finish" || this.beats.has("finisher")) return false;
    this.beats.add("finisher");
    this.Clip("AmbushLead", "PressureStabbed");
    this.hooks.Finisher?.();
    this.hooks.Record?.("ambushFinisher", {});
    return true;
  }

  /** 起身：还控制权，四个人从这一刻起是普通敌兵。 */
  Break() {
    if (!this.Scripted) return false;
    this.hooks.Prompt?.(null);
    this.prompt = null;
    this.hooks.EndGround?.();
    this.hooks.Rise?.();
    this.hooks.Daze?.(false);
    this.phase = "broken";
    this.sincePhase = 0;
    this.sinceBroken = 0;
    this.hooks.Unlock?.();
    this.hooks.Release?.();
    this.hooks.Record?.("ambushBroken", {
      qte: this.qteStarted ? (this.qteSuccess ? "success" : "failure") : "none",
      failure: this.failure,
    });
    this.hooks.Say?.("RoomAmbushBreak");
    return true;
  }

  /**
   * 配音里老周喊出那一声（RoomAmbush 的 AmbushZhouLine 事件）的瞬间就是刀进去的瞬间。
   * 起手那一下（BayonetStabDown）由 Background 的 zhouClip 按兜底期限提前起播，
   * 所以事件到得早一点也已经在挥了。缺配音时由 Background 的兜底期限接管。
   */
  CueZhouStab() {
    if (!this.Started || this.beats.has("zhou")) return false;
    if (!this.beats.has("zhouClip")) { this.beats.add("zhouClip"); this.Clip("AmbushRearB", "BayonetStabDown"); }
    this.beats.add("zhou");
    this.sinceZhou = 0;
    this.hooks.ColumnCasualty?.("zhou");
    this.hooks.Record?.("zhouStabbed", { health: this.R.ambushZhouHealthAfter, cue: true });
    return true;
  }

  /**
   * 检查点重试落在「已经挣脱」之后：接着往下跑，不重放背景拍表。
   * 死掉的日军不复活，抬担架的两个人也不会再死一次。
   */
  ResumeBroken() {
    this.Reset();
    this.phase = "broken";
    this.story = 0;
    this.sinceButt = -1;
    this.sinceZhou = 0;
    this.sinceBroken = this.R.ambushSquadDelayS;
    this.qteStarted = true;
    this.qteSuccess = true;
    for (const id of ["frontBearerClip", "frontBearer", "zhouClip", "zhou", "yaowa",
      "rearBearerClip", "rearBearer", "finisher"]) this.beats.add(id);
    return true;
  }

  /** 调试跳转到伏击之后的阶段：只把状态摆到「已结束」，不重放任何一拍、不喊话。 */
  MarkResolved() {
    this.ResumeBroken();
    this.phase = "resolved";
    this.squadSent = true;
    this.squadArrived = true;
    return true;
  }

  Resolve(detail = {}) {
    if (this.phase === "resolved") return false;
    if (this.Scripted) this.Break();
    this.phase = "resolved";
    this.hooks.Record?.("meleeResolved", { sharedCombat: true, ambush: true, ...detail });
    this.hooks.Say?.("RoomAmbushCleared");
    this.hooks.Finish?.();
    return true;
  }

  /**
   * @param {number} dt
   * @param {object} world 观测量，全部由运行时提供：
   *   litterAtDoor 担架是否已到屋门口；leadAlive / leadDistanceM 领头那个的状态；
   *   grabPressed / finisherPressed 这一帧收到的提示按键（运行时消费输入后置位）；
   *   qteActive 共用 QTE 还在不在；qteSuccess 结算结果（只在结算那一帧非空）；
   *   qteProgress / qteTimeT / qtePulse 共用 QTE 的进度（只用来画环）；
   *   aliveCount 四个伏击兵还活着几个；squadInside 是否已有班里人进屋；
   *   playerAlive 玩家是否还活着；playerProtected 出生保护还在不在（在就不起这一拍）。
   */
  Update(dt, world = {}) {
    const R = this.R;
    const step = Math.max(0, dt) || 0;
    if (world.playerAlive === false) {
      if (this.Scripted && !this.downed) { this.downed = true; this.Down(); }
      return this.State();
    }
    if (this.Started && this.phase !== "resolved") {
      this.story += step;
      this.Background();
    }
    this.sincePhase += step;
    if (this.sinceButt >= 0) this.sinceButt += step;
    if (this.sinceZhou >= 0) this.sinceZhou += step;
    if (this.sinceBroken >= 0) this.sinceBroken += step;
    switch (this.phase) {
      case "waiting": {
        // 出生保护（刚重生、检查点重试、调试跳转）期间不起这一拍：这一下必须真的落上，
        // 被 spawnGrace 吃掉的话整场戏就只剩动画。保护是有限的（SPAWN.graceS），
        // 这里仍然留一个上限，免得任何一条无限豁免把任务卡死。
        if (world.playerProtected && this.protectedWait < R.ambushProtectedWaitS) {
          this.protectedWait += step;
          break;
        }
        this.waited += step;
        if (!world.litterAtDoor && this.waited < R.ambushLitterWaitS) break;
        this.Trigger({ litterAtDoor: !!world.litterAtDoor, waited: Number(this.waited.toFixed(3)) });
        break;
      }
      case "lunge": {
        if (world.leadAlive === false) { this.Break(); break; }
        const reach = Number.isFinite(world.leadDistanceM) ? world.leadDistanceM : Infinity;
        if (reach <= R.ambushBindReachM || this.story >= R.ambushLungeMaxS) this.Swing();
        break;
      }
      case "butt": {
        // 抡到一半被打死也照样落这一下：枪托已经在半空了，而且倒地是整拍的地基。
        if (this.sincePhase >= R.ambushButtImpactS) this.Butt();
        break;
      }
      case "daze": {
        // 躺在地上的那几秒。视线在 ambushLookLitterAtS 拉到北门口的担架上，
        // 背景拍表把担架队一个个放倒；ambushPounceAtS 才轮到玩家自己这条线。
        if (!this.beats.has("lookLitter") && this.story >= R.ambushLookLitterAtS) {
          this.beats.add("lookLitter");
          this.hooks.LookAt?.("litter");
        }
        if (world.leadAlive === false) { this.Break(); break; }
        if (this.story >= R.ambushPounceAtS) this.Pounce();
        break;
      }
      case "grab": {
        if (world.leadAlive === false) { this.Break(); break; }
        if (world.grabPressed) { this.Grab(); break; }
        if (this.sincePhase >= R.ambushGrabWindowS) this.Fail("grab");
        break;
      }
      case "mash": {
        if (world.qteSuccess != null) this.qteSuccess = !!world.qteSuccess;
        if (world.qteActive) break;
        // 共用 QTE 结算完（或者根本没开起来）：赢了进反捅，输了刀进去。
        if (this.qteStarted && this.qteSuccess === false) { this.Fail("mash"); break; }
        this.Win();
        break;
      }
      case "finish": {
        // 没按也会在窗口末尾自动补上：共用 QTE 已经判赢了，这一下只是把胜负演出来。
        if (!this.beats.has("finisher")
          && (world.finisherPressed || this.sincePhase >= R.ambushFinisherWindowS)) {
          this.finisherAtS = this.sincePhase;
          this.Finisher();
        }
        if (this.beats.has("finisher")
          && this.sincePhase >= (this.finisherAtS ?? 0) + R.ambushFinisherHoldS) this.Break();
        break;
      }
      case "broken": {
        if (!this.squadSent && this.sinceBroken >= R.ambushSquadDelayS) {
          this.squadSent = true;
          this.hooks.SquadIn?.();
        }
        if (this.squadSent && world.squadInside && !this.squadArrived) {
          this.squadArrived = true;
          this.hooks.Record?.("ambushSquadArrived", { seconds: Number(this.sinceBroken.toFixed(2)) });
        }
        if (world.aliveCount === 0) this.Resolve({ killed: world.killed ?? null });
        break;
      }
    }
    this.PushPrompt(world);
    return this.State();
  }

  /** 提示环：一次只有一个，内容完全由当前这一拍决定。 */
  PushPrompt(world) {
    const R = this.R;
    let next = null;
    if (this.phase === "grab") {
      const t = Math.min(1, this.sincePhase / Math.max(1e-6, R.ambushGrabWindowS));
      next = { mode: "press", action: "interact", progress: 1 - t, timeT: t, pulse: 0 };
    } else if (this.phase === "mash" && world.qteActive) {
      next = { mode: "mash", action: "interact", progress: world.qteProgress ?? 0,
        timeT: world.qteTimeT ?? 0, pulse: world.qtePulse ?? 0 };
    } else if (this.phase === "finish" && !this.beats.has("finisher")) {
      const t = Math.min(1, this.sincePhase / Math.max(1e-6, R.ambushFinisherWindowS));
      next = { mode: "finisher", action: "fire", progress: 1 - t, timeT: t, pulse: 0 };
    }
    const same = !!next === !!this.prompt && (!next || (next.mode === this.prompt.mode
      && Math.abs(next.progress - this.prompt.progress) < 1e-4
      && Math.abs(next.timeT - this.prompt.timeT) < 1e-4 && next.pulse === this.prompt.pulse));
    this.prompt = next;
    if (!same) this.hooks.Prompt?.(next);
    return next;
  }

  /** 背景拍表：抬担架的两个人和老周挨刀，幺娃被撞倒。与玩家那条倒地并行。 */
  Background() {
    const R = this.R;
    this.Beat("frontBearerClip", R.ambushBearerStabAtS - R.ambushClipLeadS,
      () => this.Clip("AmbushRearA", "BayonetStabStanding"));
    this.Beat("frontBearer", R.ambushBearerStabAtS,
      () => this.hooks.ColumnCasualty?.("frontBearer"));
    this.Beat("zhouClip", R.ambushZhouStabAtS - R.ambushClipLeadS,
      () => this.Clip("AmbushRearB", "BayonetStabDown"));
    this.Beat("zhou", R.ambushZhouStabAtS, () => {
      this.sinceZhou = 0;
      this.hooks.ColumnCasualty?.("zhou");
      this.hooks.Record?.("zhouStabbed", { health: R.ambushZhouHealthAfter });
    });
    this.Beat("rearBearerClip", R.ambushRearBearerStabAtS - R.ambushClipLeadS,
      () => this.Clip("AmbushRearA", "BayonetStabStanding"));
    this.Beat("rearBearer", R.ambushRearBearerStabAtS,
      () => this.hooks.ColumnCasualty?.("rearBearer"));
    this.Beat("yaowa", R.ambushYaowaDownAtS, () => this.hooks.KnockDownFriend?.("yaowa"));
  }

  State() {
    return {
      phase: this.phase,
      story: this.story,
      waited: this.waited,
      sinceButt: this.sinceButt,
      sincePhase: this.sincePhase,
      sinceZhou: this.sinceZhou,
      sinceBroken: this.sinceBroken,
      beats: [...this.beats],
      qteStarted: this.qteStarted,
      qteSuccess: this.qteSuccess,
      failure: this.failure,
      prompt: this.prompt ? { ...this.prompt } : null,
      promptPhases: [...PROMPT_PHASES],
      squadSent: this.squadSent,
      squadArrived: this.squadArrived,
    };
  }
}
