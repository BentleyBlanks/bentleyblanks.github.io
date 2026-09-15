// 屋内伏击（第一关内部步骤 Melee）的编排规则。
//
// 纯 Node：不 import three、不读场景、不碰玩家。所有副作用都由注入的钩子完成，
// 位移与朝向由 Script_FirstLevelMissionRuntime 按当前 Phase 每帧驱动 ——
// 这里只负责「什么时候发生什么」和「记哪条事实」，所以 Script_FirstLevelMissionTest
// 可以逐拍确定性地跑成功／失败两条路、重放与重试。
//
// 拍表、数值出处与验收命令见 docs/Data_FirstLevelRoomAmbush.md。

export const AMBUSH_PHASES = Object.freeze(["waiting", "lunge", "pinned", "bind", "witness", "broken", "resolved"]);

export class FirstLevelAmbush {
  /**
   * @param {object} hooks 全部可缺省：Record/Has/Say/Lock/Unlock/Wake/PlayClip/
   *   Stab/HoldBind/BeginQte/EndBind/LookLitter/ColumnCasualty/KnockDown/Release/SquadIn/Finish
   * @param {object} tuning MISSION_TUNING（只读 ambush* 那几项）
   */
  constructor(hooks = {}, tuning = {}) {
    this.hooks = hooks;
    this.R = tuning;
    this.Reset();
  }
  Reset() {
    this.phase = "waiting";
    this.waited = 0;      // 触发前等担架进门的秒数
    this.protectedWait = 0; // 等出生保护过去的秒数（刚重生 / 调试跳转）
    this.story = 0;       // 触发之后的编排时钟（背景拍表读它）
    this.sinceStab = -1;  // 刺中玩家之后的秒数；-1 表示还没刺
    this.sinceBind = -1;  // 连按窗口开了之后的秒数
    this.sinceZhou = -1;  // 老周挨刀之后的秒数（挣脱要等这一刀演完）
    this.sinceBroken = -1;
    this.beats = new Set();
    this.qteStarted = false;
    this.qteSuccess = null;
    this.squadSent = false;
    this.squadArrived = false;
  }
  get Phase() { return this.phase; }
  /** 剧本正在占着玩家（控制锁 + 顶住 + QTE）。 */
  get Scripted() { return ["lunge", "pinned", "bind", "witness"].includes(this.phase); }
  get Started() { return this.phase !== "waiting"; }
  /** 老周那一刀还没落：捅他的那个（AmbushRearB）还在演，先不放回普通战斗。 */
  get ZhouPending() { return this.Started && this.phase !== "resolved" && !this.beats.has("zhou"); }
  get Done() { return this.phase === "resolved"; }

  Beat(id, at, Run) {
    if (this.story < at || this.beats.has(id)) return false;
    this.beats.add(id);
    Run();
    return true;
  }
  Clip(id, clipId) { this.hooks.PlayClip?.(id, clipId); }

  /**
   * 触发这一拍：记事实、喊话、锁控制、三个人起身。
   * 侧翼那个（AmbushFlank）留到挣脱之后才动，这里不叫醒。
   */
  Trigger(detail = {}) {
    if (this.phase !== "waiting") return false;
    const R = this.R;
    this.phase = "lunge";
    this.story = 0;
    this.hooks.Record?.("ambushTriggered", { ...detail });
    this.hooks.Say?.("RoomAmbush", { urgent: true });
    this.hooks.Lock?.(R.ambushLockMaxS);
    for (const id of ["AmbushLead", "AmbushRearA", "AmbushRearB"]) this.hooks.Wake?.(id);
    this.beats.add("rise");
    for (const id of ["AmbushLead", "AmbushRearA", "AmbushRearB"]) this.Clip(id, "AmbushRise");
    return true;
  }

  /**
   * 刺刀真的捅进来：伤害走共用白刃伤害链（kind "qte"），随后**顶住**。
   * 顶住这一段（ambushPinHoldS）还不开连按窗口：这几秒里背景拍表把两个抬担架的
   * 和幺娃放倒，玩家在锁住的视锥里看着，手上没有该按的键。
   */
  Stab() {
    if (this.phase !== "lunge") return false;
    this.phase = "pinned";
    this.sinceStab = 0;
    this.hooks.Stab?.();
    this.hooks.Record?.("ambushStabbed", { damage: this.R.ambushStabDamage });
    this.hooks.HoldBind?.(this.R.ambushPinHoldS);
    return true;
  }

  /** 顶够了：连按窗口开，这时候按 F 才算数。 */
  OpenStruggle() {
    if (this.phase !== "pinned") return false;
    this.phase = "bind";
    this.sinceBind = 0;
    this.qteStarted = this.hooks.BeginQte?.() === true;
    return true;
  }

  /**
   * 连按结算完（成败都算），但控制权还不还：老周那一刀还没落。
   * 视线从刺刀拉到担架上，玩家必须看着这一刀，看完才挣脱（Break）。
   */
  Witness() {
    if (this.phase !== "pinned" && this.phase !== "bind") return false;
    this.phase = "witness";
    this.hooks.EndBind?.();
    this.hooks.LookLitter?.();
    return true;
  }

  /** 挣脱：成功或失败都还控制权，四个人从这一刻起是普通敌兵。 */
  Break() {
    if (!this.Scripted) return false;
    // 旁路（领头那个在扑过来的路上被打死、控制锁兜底超时）直接从顶住里出来：
    // 僵持姿势也要一并收掉，不然两个人会保持顶住的状态不动。
    if (this.phase !== "witness") this.hooks.EndBind?.();
    this.phase = "broken";
    this.sinceBroken = 0;
    this.hooks.Unlock?.();
    this.hooks.Release?.();
    this.hooks.Record?.("ambushBroken", {
      qte: this.qteStarted ? (this.qteSuccess ? "success" : "failure") : "none",
    });
    this.hooks.Say?.("RoomAmbushBreak");
    return true;
  }

  /**
   * 配音里老周喊出那一声（RoomAmbush 的 AmbushZhouLine 事件）的瞬间就是刀进去的瞬间。
   * 起手那一下（BayonetStabDown）由 Background 的 zhouClip 按兜底期限提前起播，
   * 所以事件到得早一点也已经在挥了。缺配音时由 Background 的兜底期限接管。
   * 这一刀也是挣脱的闸：落下之前 witness 那一段不会还控制权。
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
    this.sinceStab = 0;
    this.sinceBind = 0;
    this.sinceZhou = this.R.ambushWitnessTailS;
    this.sinceBroken = this.R.ambushSquadDelayS;
    this.qteStarted = true;
    for (const id of ["frontBearerClip", "frontBearer", "zhouClip", "zhou", "yaowa", "rearBearerClip", "rearBearer"])
      this.beats.add(id);
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
   *   qteActive 共用 QTE 还在不在；qteSuccess 结算结果（只在结算那一帧非空）；
   *   aliveCount 四个伏击兵还活着几个；squadInside 是否已有班里人进屋；
   *   playerAlive 玩家是否还活着；playerProtected 出生保护还在不在（在就不起这一拍）。
   */
  Update(dt, world = {}) {
    const R = this.R;
    const step = Math.max(0, dt) || 0;
    if (world.playerAlive === false) return this.State();
    if (this.Started && this.phase !== "resolved") {
      this.story += step;
      this.Background();
    }
    if (this.sinceStab >= 0) this.sinceStab += step;
    if (this.sinceBind >= 0) this.sinceBind += step;
    if (this.sinceZhou >= 0) this.sinceZhou += step;
    if (this.sinceBroken >= 0) this.sinceBroken += step;
    switch (this.phase) {
      case "waiting": {
        // 出生保护（刚重生、检查点重试、调试跳转）期间不起这一拍：这一刀必须真的落上，
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
        if (reach <= R.ambushBindReachM || this.story >= R.ambushLungeMaxS) this.Stab();
        break;
      }
      case "pinned": {
        // 顶住的这几秒里玩家动不了也不用按键：背景拍表在这段时间把两个抬担架的放倒。
        // 顶住他的那个被打死了就没人顶着了，直接还控制权。
        if (world.leadAlive === false) { this.Break(); break; }
        if (this.sinceStab >= R.ambushPinHoldS) this.OpenStruggle();
        break;
      }
      case "bind": {
        if (world.qteSuccess != null) this.qteSuccess = !!world.qteSuccess;
        // 连按窗口至少要看得见；QTE 没能开起来时也不许同一帧就松开。
        if (this.sinceBind >= R.ambushBindMinS && !world.qteActive) this.Witness();
        break;
      }
      case "witness": {
        // 连按结束了，控制权还锁着：老周那一刀落下（配音事件或兜底期限）、
        // 再让那一刀演完 ambushWitnessTailS 才挣脱 —— 刀要拔出来，人要看得见。
        // 这一条就是「ambushBroken 一定排在 zhouStabbed 之后」的全部实现。
        if (this.beats.has("zhou") && this.sinceZhou >= R.ambushWitnessTailS) this.Break();
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
    return this.State();
  }

  /** 背景拍表：抬担架的两个人和老周挨刀，幺娃被撞倒。与玩家那条僵持并行。 */
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
    this.Beat("yaowa", R.ambushYaowaDownAtS, () => this.hooks.KnockDown?.("yaowa"));
    this.Beat("rearBearerClip", R.ambushRearBearerStabAtS - R.ambushClipLeadS,
      () => this.Clip("AmbushRearA", "BayonetStabStanding"));
    this.Beat("rearBearer", R.ambushRearBearerStabAtS,
      () => this.hooks.ColumnCasualty?.("rearBearer"));
  }

  State() {
    return {
      phase: this.phase,
      story: this.story,
      waited: this.waited,
      sinceStab: this.sinceStab,
      sinceBind: this.sinceBind,
      sinceZhou: this.sinceZhou,
      sinceBroken: this.sinceBroken,
      beats: [...this.beats],
      qteStarted: this.qteStarted,
      qteSuccess: this.qteSuccess,
      squadSent: this.squadSent,
      squadArrived: this.squadArrived,
    };
  }
}
