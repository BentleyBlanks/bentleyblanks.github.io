// 《滕县 一九三八》脚本检查点 —— 「不躲被击倒 → 从数秒前重来」。
//
// **纯规则，不许 import three。** 存的是一串数（位置、朝向、姿态、血、弹），
// 还原走宿主注入的一个回调。回归口 `Script_MissionHooksTest.mjs`。
//
// ── 它解决的是哪一件事 ──────────────────────────────────────────────────────
// 第一关阶段八（Data_MissionCh1 的 ENGINE_REQUEST 6）：日机第三次进入航线，
// 提示【扑入路沟】，**不躲则被击倒并从数秒前重来**。
//
// 常规的死亡换人在这里是错的，两条都错：
//   · 「城里还站着的人」是一条**只往下走**的曲线（§0 / Data_MissionCh0 的池曲线），
//     一次演出性的击倒不该在史实数字上扣一个人；
//   · 常规 respawn 会把玩家放到**上一个路标后方**（Script_Main RespawnPlayer 那段
//     注释写着），而这一拍的整个意义是「你正抬着担架、飞机正在头上」——
//     人一被挪走，这一拍就整个跳过去了。
//
// 所以给一条独立的通道：**倒带**。回到数秒前那个位置、那个姿态、那点弹药，
// 不扣池、不弹死亡卡、不换人。
//
// ── 环形采样，不做存档 ──────────────────────────────────────────────────────
// 每 SAMPLE_S 记一帧，攒 WINDOW_S 秒。要还原到「几秒前」时取时间上最接近的那一帧。
// 不存世界状态（敌人、弹坑、担架）—— 那是存档的活，几秒的倒带不需要，
// 而且真去还原世界状态会与物理/AI 的既有状态打架，代价远大于收益。
//
// ── 谁来调它 ────────────────────────────────────────────────────────────────
// S3（扫射/伤害那一批）的 OnPlayerHit：判定「这一下是脚本安排的击倒」时，
// **在把伤害提交给死亡链路之前**调 Rewind() —— 调完人还活着，死亡判定就不会触发。
// 打完再调是没用的：那时死亡卡已经弹了、池已经扣了。

/** 采样间隔与窗口。数只在这里。 */
export const CHECKPOINT_TUNING = {
  sampleS: 0.25,     // 每 0.25 s 一帧：四十帧覆盖十秒，内存上等于四十个小对象
  windowS: 10.0,     // 往回能倒多久。策划案说的是「数秒前」，十秒是有余量的上限
  defaultRewindS: 4.0, // Rewind() 不给秒数时倒多远
  minRewindS: 0.5,   // 比这更近的倒带没有意义（还在同一拍里）
};

const MAX_SAMPLES = Math.ceil(CHECKPOINT_TUNING.windowS / CHECKPOINT_TUNING.sampleS) + 2;

/**
 * 一帧采样。字段少到可以逐条解释：
 *   t                这一帧的时刻（宿主时钟）
 *   x/y/z, yaw/pitch 站位与视线
 *   stance           0 站 1 蹲 2 卧
 *   health           血。倒带要把这一下的伤一起收回去，否则「重来」是残血重来
 *   ammo/clips/grenades  弹。不还原的话反复重来会把子弹耗光
 *   mark             这一帧是不是 Save() 明确打下的点（而不是定时采的）
 */

export class CheckpointRecorder {
  /**
   * @param {object} host
   *   Time()            → 秒
   *   Sample()          → 上面那张表的一份快照（不含 t/mark），拿不到就返回 null
   *   Apply(sample)     → 把快照写回玩家（位置/姿态/血/弹）。返回 true 算还原成功
   *
   * **这一层不出提示、不出音效、不出字幕。** 「重来」要不要让玩家看见一行字，
   * 是那一拍的演出决定（第一关阶段八有一条 env beat 在说这件事），
   * 由调用方在 Rewind() 之后自己出 —— 这一层只管把人放回去。
   */
  constructor(host = {}, options = {}) {
    this.host = host;
    this.tuning = { ...CHECKPOINT_TUNING, ...(options.tuning || {}) };
    this.samples = [];
    this.lastAt = -99;
    this.enabled = true;
    /** 取证：倒带过几次、每次倒回多久。PlayTest 与排障读它。 */
    this.rewinds = [];
  }

  get Count() { return this.samples.length; }
  get Latest() { return this.samples.length ? this.samples[this.samples.length - 1] : null; }
  get RewindCount() { return this.rewinds.length; }

  /** 换关/收摊：环里的东西一律作废（上一关的坐标倒到这一关就是穿墙）。 */
  Reset(reason = "reset") {
    this.samples.length = 0;
    this.lastAt = -99;
    this.rewinds.length = 0;
    return reason;
  }

  /**
   * 每帧推一下：到点就采一帧。
   * **必须排在玩家更新之后** —— 采的是这一帧结束时的状态。
   */
  Update() {
    if (!this.enabled) return false;
    const now = this.host.Time ? this.host.Time() : 0;
    if (now - this.lastAt < this.tuning.sampleS) return false;
    return this._Push(now, false);
  }

  /**
   * 明确打一个点（「这一拍开始了，出事就退到这儿」）。
   * 与定时采样共用同一个环，只是 mark=true —— Rewind 找不到合适的定时帧时优先用它。
   */
  Save() {
    const now = this.host.Time ? this.host.Time() : 0;
    return this._Push(now, true);
  }

  /**
   * 倒回 seconds 秒前。
   *
   * 取的是**时间上最接近**的那一帧，不是"最早那一帧"：环里可能只攒了两秒，
   * 那就退到两秒前，而不是什么都不做 —— 「重来」永远要发生，哪怕退得不够远。
   *
   * @returns {object|null} 还原到的那一帧；环是空的或宿主拒绝时返回 null。
   */
  Rewind(seconds = this.tuning.defaultRewindS) {
    if (!this.samples.length) return null;
    const now = this.host.Time ? this.host.Time() : 0;
    const want = now - Math.max(this.tuning.minRewindS, Number(seconds) || this.tuning.defaultRewindS);
    let best = this.samples[0];
    let bestD = Math.abs(best.t - want);
    for (const sample of this.samples) {
      const d = Math.abs(sample.t - want);
      // 平手时偏向**更早**的那一帧：宁可多退半秒，也别退到还在挨打的那一刻。
      if (d < bestD || (d === bestD && sample.t < best.t)) { best = sample; bestD = d; }
    }
    let ok = false;
    if (this.host.Apply) {
      try { ok = this.host.Apply(best) !== false; } catch { ok = false; }
    }
    this.rewinds.push({ at: +now.toFixed(2), to: +best.t.toFixed(2), back: +(now - best.t).toFixed(2), ok });
    if (ok) {
      // 倒回去之后，比它更晚的采样一律作废：那些是"另一条时间线"上的。
      this.samples = this.samples.filter((s) => s.t <= best.t);
      this.lastAt = best.t;
    }
    return ok ? best : null;
  }

  _Push(now, mark) {
    if (!this.host.Sample) return false;
    let snapshot = null;
    try { snapshot = this.host.Sample(); } catch { snapshot = null; }
    if (!snapshot || !Number.isFinite(snapshot.x)) return false;
    this.lastAt = now;
    this.samples.push({ ...snapshot, t: now, mark: !!mark });
    while (this.samples.length > MAX_SAMPLES) this.samples.shift();
    // 窗口外的也丢掉（换关暂停之后时钟会跳一大段）
    const cutoff = now - this.tuning.windowS;
    while (this.samples.length > 1 && this.samples[0].t < cutoff) this.samples.shift();
    return true;
  }
}

export default CheckpointRecorder;
