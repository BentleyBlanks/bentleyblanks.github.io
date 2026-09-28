// ===========================================================================
// Script_FirstLevelKitchenAmbush.mjs —— 第一关公开阶段 9「灶屋—连屋近战」进门遭伏击
//
// 2026-09-28 用户：「我进屋子的时候怎么被日军偷袭的 QTE 没有！具体形式就参考 COD5 里的 QTE」。
// 照《使命召唤：战争世界》（COD5）的万岁冲锋：藏着的日军嚎一声扑出来，把人撞翻在地、
// 骑上来举刺刀往下捅，屏幕上只剩一个按键 —— 窗口里按一下就反手捅死他，漏掉就是被捅死，
// 回检查点重来这一拍。
//
// 纯规则：不 import three、不读场景、不碰玩家。副作用全走注入的钩子
// （Script_FirstLevelVillageBlock 给），所以 Script_FirstLevelMidTest 可以逐拍确定性地跑
// 成功／失败／先手打掉／重试四条路。口径见 docs/Data_FirstLevelMid20260919.md「09 进门遭伏击」。
//
// 拍：
//   hidden     藏在灶屋与连屋之间那条过道的西段（出灶屋南门往南走时在右手边）
//   lunge      玩家跨进过道：嚎「突撃！」、罗班长吼「右手！」，他端着刺刀扑过来
//              —— 这半秒里被打死就是「提前击败」，不进 QTE（Notion 09 原文）
//   pinned     撞上：玩家被撞翻（共用剧本倒地），他骑上来压刀；镜头锁到他脸上
//   prompt     一次性按键窗口（共用倒地僵持的 input "press"）
//   countered  按上了：反手一刺，他死在这一下上；起身、还控制权
//   failed     漏掉：刀捅进去（满血也死）。死了就停在这里，检查点重试把整拍重放
//   done / preempted  收尾：剩下三个人从东巷那扇门压进来，普通白刃／枪战
// ===========================================================================
export const KITCHEN_AMBUSH_PHASES = Object.freeze([
  "hidden", "lunge", "pinned", "prompt", "countered", "failed", "done", "preempted",
]);

/**
 * 玩家有没有「进屋」：跨出灶屋南门进了过道，或者从别处绕进了连屋（tuning.triggers 里任一块）。
 * 纯几何，测试直接调。
 */
export function KitchenAmbushTriggered(player, tuning) {
  return tuning.triggers.some((box) =>
    player.x > box.minX && player.x < box.maxX && player.z > box.minZ && player.z < box.maxZ);
}

/**
 * 冲锋这一帧往哪儿跑：人还在过道里、目标在过道外，先冲到那一头的门洞口再拐 ——
 * 过道南北两面都是实墙，直线过去会顶在墙上。纯几何。
 */
export function KitchenAmbushLungeTarget(lead, player, tuning) {
  const L = tuning.linkZ, inLink = (p) => p.z > L.min && p.z < L.max;
  if (!inLink(lead) || inLink(player) || Math.abs(lead.x - tuning.doorX) <= 0.6) return { x: player.x, z: player.z };
  return { x: tuning.doorX, z: player.z > L.max ? L.max - 0.3 : L.min + 0.3 };
}

export class FirstLevelKitchenAmbush {
  /**
   * @param {object} hooks 全部可缺省：Record/Say/Spring/Tackle/BeginPress/Counter/Stab/
   *   EndPin/Rise/Unlock/Release/Prompt
   * @param {object} tuning MID_TUNING.kitchenAmbush
   */
  constructor(hooks = {}, tuning = {}) {
    this.hooks = hooks;
    this.T = tuning;
    this.Reset();
  }
  Reset() {
    this.phase = "hidden";
    this.sincePhase = 0;
    this.outcome = null;   // "countered" | "failed" | "preempted" | "broken"
    this.downed = false;   // 玩家死在这一拍里（等检查点重试）
    this.attempts = 0;     // 第几次扑上来（重试会加一）
  }
  get Phase() { return this.phase; }
  /** 剧本正占着玩家：控制锁 + 倒地 + 提示环（装配层据此让 HUD 整个让位）。 */
  get Scripted() { return ["pinned", "prompt", "countered", "failed"].includes(this.phase) && !this.downed; }
  get Lunging() { return this.phase === "lunge"; }
  get Done() { return this.phase === "done" || this.phase === "preempted"; }
  /** 屏幕上该不该有那个按键环。 */
  get Prompting() { return this.phase === "prompt" && !this.downed; }
  Enter(phase) { this.phase = phase; this.sincePhase = 0; }

  /**
   * 每帧。
   * @param {number} dt
   * @param {object} s 这一帧的现场：
   *   leadAlive     伏击兵还活着
   *   playerAlive   玩家还活着
   *   triggered     KitchenAmbushTriggered(玩家)（只在 hidden 读）
   *   reachM        伏击兵到玩家的水平距离（只在 lunge 读）
   *   qte           这一拍自己开的那一次共用倒地僵持：null 或 { phase, success }
   *   risen         玩家已经起身、共用白刃层交回了操作
   */
  Update(dt, s = {}) {
    this.sincePhase += Math.max(0, dt || 0);
    const T = this.T;
    if (this.downed) return;
    switch (this.phase) {
      case "hidden":
        if (!s.leadAlive) { this.Preempt("killedHidden"); return; }
        if (s.triggered && s.playerAlive !== false) this.Spring();
        return;
      case "lunge":
        if (!s.leadAlive) { this.Preempt("killedLunging"); return; }
        if (s.playerAlive === false) { this.Down(); return; }
        if (this.sincePhase < T.emergeS) return;
        if (s.reachM <= T.tackleReachM) this.Tackle();
        else if (this.sincePhase >= T.emergeS + T.lungeMaxS) this.Break("outran");
        return;
      case "pinned":
        if (s.playerAlive === false) { this.Down(); return; }
        if (!s.leadAlive) { this.Break("leadLost"); return; }
        if (this.sincePhase >= T.promptDelayS) this.Prompt();
        return;
      case "prompt":
        if (s.playerAlive === false) { this.Down(); return; }
        if (s.qte?.phase === "resolve") { if (s.qte.success) this.Counter(); else this.Fail(); return; }
        // 共用层把这一次僵持收掉了（人没了、被别的东西打断）：不许卡在锁里。
        if (!s.qte && this.sincePhase > 0.05) this.Break(s.leadAlive ? "qteLost" : "leadLost");
        return;
      case "countered":
        if (s.playerAlive === false) { this.Down(); return; }
        if (s.risen && this.sincePhase >= T.counterHoldS) this.Finish();
        return;
      case "failed":
        // 无敌档 / 血量调过头：被捅了也没死，照样起身、他转普通白刃。
        if (s.playerAlive === false) { this.Down(); return; }
        if (s.risen) this.Finish();
        return;
      default:
        return;
    }
  }

  /** 玩家跨进门槛：他从屏风后面扑出来。 */
  Spring() {
    if (this.phase !== "hidden") return false;
    this.Enter("lunge");
    this.attempts++;
    this.hooks.Record?.("kitchenAmbushSprung", { attempt: this.attempts });
    this.hooks.Spring?.();
    // 罗班长跟在后面进灶屋，一眼看见人影：「右手！」（录音就是这两个字，发现人影那一瞬吼的）。
    this.hooks.Say?.("MeleeRight");
    return true;
  }

  /** 冲锋途中（或还没露头）就被打死：Notion 09「提前击败近战敌人则不强制播放固定 QTE」。 */
  Preempt(reason) {
    if (this.phase !== "hidden" && this.phase !== "lunge") return false;
    this.Enter("preempted");
    this.outcome = "preempted";
    this.hooks.Record?.("kitchenAmbushPreempted", { reason });
    this.hooks.Release?.();
    return true;
  }

  /** 撞上：撞翻、骑上来压刀、镜头锁到他脸上。 */
  Tackle() {
    if (this.phase !== "lunge") return false;
    this.Enter("pinned");
    this.hooks.Tackle?.();
    this.hooks.Record?.("kitchenAmbushTackled", {});
    return true;
  }

  /** 倒地镜头落稳、刀举起来了：开一次性按键窗口。 */
  Prompt() {
    if (this.phase !== "pinned") return false;
    if (this.hooks.BeginPress?.() === false) { this.Break("qteRefused"); return false; }
    this.Enter("prompt");
    this.hooks.Record?.("kitchenAmbushPrompted", {});
    return true;
  }

  /** 按上了：反手一刺，他死在这一下上。起身由共用结算走（GroundWin → Rise）。 */
  Counter() {
    if (this.phase !== "prompt") return false;
    this.Enter("countered");
    this.outcome = "countered";
    this.hooks.Counter?.();
    this.hooks.Say?.("MeleeCurse");
    this.hooks.Record?.("kitchenAmbushCountered", { attempt: this.attempts });
    return true;
  }

  /** 漏掉了：刀捅进去。共用倒地失败伤害之外再补一刀，满血也死（COD5 被万岁冲锋捅中就是死）。 */
  Fail() {
    if (this.phase !== "prompt") return false;
    this.Enter("failed");
    this.outcome = "failed";
    this.hooks.Stab?.();
    this.hooks.Record?.("kitchenAmbushFailed", { attempt: this.attempts });
    return true;
  }

  /** 玩家死在这一拍里：收掉提示与锁，整拍停在原地等检查点重试。 */
  Down() {
    this.downed = true;
    this.hooks.Prompt?.(null);
    this.hooks.Unlock?.();
    return true;
  }

  /** 起完身：还控制权，剩下的人放出来。 */
  Finish() {
    if (this.Done) return false;
    this.Enter("done");
    this.hooks.Unlock?.();
    this.hooks.Release?.();
    return true;
  }

  /** 旁路收尾（压他的人没了、共用层拒绝开僵持）：起身、还权、放人，不卡在锁里。 */
  Break(reason) {
    if (this.Done) return false;
    this.outcome = this.outcome || "broken";
    this.hooks.EndPin?.();
    this.hooks.Rise?.();
    this.Enter("done");
    this.hooks.Unlock?.();
    this.hooks.Release?.();
    this.hooks.Record?.("kitchenAmbushBroken", { reason });
    return true;
  }

  /**
   * 检查点重试：死在这一拍里（或者他还没被打死）就把整拍从头再来一遍 —— 他回到屏风后面，
   * 玩家回到灶屋里。已经反杀／先手打掉的不重放。
   * @returns {boolean} true = 要重放（运行时据此把人摆回藏身点）
   */
  Rearm() {
    if (this.outcome === "countered" || this.outcome === "preempted" || this.outcome === "broken") return false;
    if (this.phase === "hidden") return false;
    const attempts = this.attempts;
    this.Reset();
    this.attempts = attempts;
    return true;
  }

  /** 屏幕上那个环：剩余窗口（1 → 0）。只读快照，装配层补键面字与屏幕锚点。 */
  PromptView(qte) {
    if (!this.Prompting || !qte || qte.phase !== "input") return null;
    return { mode: "press", action: "interact", progress: qte.progress, timeT: qte.timeT, pulse: qte.pulse || 0 };
  }

  State() {
    return { phase: this.phase, outcome: this.outcome, downed: this.downed, attempts: this.attempts,
      sincePhase: +this.sincePhase.toFixed(3) };
  }
}
