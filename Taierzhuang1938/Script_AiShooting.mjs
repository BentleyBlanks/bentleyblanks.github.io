// Script_AiShooting.mjs — 敌军射击模型：从「决定打」到「这一发落在哪」的全部规则。
//
// ---------------------------------------------------------------------------
// 职责
// ---------------------------------------------------------------------------
// 四件事，一件不多：
//   1. **瞄准误差的收敛过程** —— 换目标 / 探头出来时误差回到初值，随时间收敛到底，
//      移动 / 被压制 / 目标在动会把它重新撑开（`BeginAim` / `UpdateAim` / `AimError`）；
//   2. **暴露判定** —— 从枪口向目标身上的几个采样点射线，回答「他露出来多少、
//      现在该瞄哪个点」（`Exposure` + `PlayerSamples` / `SoldierSamples`）；
//   3. **能不能扣扳机** —— 射击走廊里有没有自己人（`LineOfFireClear`）；
//   4. **这一发的结果** —— 命中与否、方向、打偏落在哪（`Resolve`），
//      外加点射节奏（`BurstPlan`）、压制点（`SuppressPoint`）、枪口（`MuzzleOrigin`）
//      与抬枪角（`LookPitch`）。
//
// **不产生画面、不扣血、不写 soldier 的战斗状态**（弹药、计时器、过热、曳光、音效、
// `TakeHit` 全部留在 `Script_Ai.TryFire` 里）。本模块只在 `soldier.shooting`
// 这一个字段上挂自己的记忆。
//
// ---------------------------------------------------------------------------
// 契约（改这个文件之前先读完这一段）
// ---------------------------------------------------------------------------
// · **不 import three、不 import Script_Ai**。只吃普通对象 `{x,y,z}` 与注入的 `host`，
//   所以纯 Node 毫秒级可测（项目契约 2：规则层无 three 依赖）。
//   `Script_Ai` 仍是唯一持有 `THREE.Vector3` 的适配层。
// · 玩家距离平衡由 Script_Ai 计算（近距调整见 docs/Data_PlayerDamage.md）。
//   `COMBAT.aiAccuracyBase × 难度 × 剧本 × 距离衰减 × 压制 × COMBAT.player.accuracyScale
//   × 玩家姿态折让 × firstShotGrace` 那整条链**仍然在 `Script_Ai` 里算**，
//   整条链的乘积作为 `baseAccuracy` 传进来。`Resolve` 只在它上面叠两条曲线：
//
//       命中率 = baseAccuracy × ExposureCurve(fraction) × AimErrorCurve(err)
//
//   两条曲线的上限都是 1，且**满暴露（fraction=1）、误差收敛到底（err == floor）时
//   都精确等于 1**；近距玩家按目标张角减轻误差折扣，25 m 以上保留原曲线。
//   反过来 `fraction = 0` 时**永远不命中**：看不见的目标只能压制射击。
// · `soldier.shooting` 由 `BeginAim`（或任何入口）幂等挂载；`Detach` 卸掉。
//   模块不读 `soldier` 上除 `position` / `stance` / `suppression` / `weapon` /
//   `muzzleWorld` / `rnd` / `id` 以外的字段。
// · **热路径零分配**：采样点、射线临时量、结果对象全部复用。
//   `Exposure` / `Resolve` / `SuppressPoint` / `MuzzleOrigin` 返回的是**复用对象**，
//   调用方要跨帧留着就自己 copy 一份。
//   两处例外，都是有意的、并且写在下面「已知的分配」里。
// · 确定性：只用调用方传入的 `rnd` 或 `host.Rnd`，**一行 `Math.random` 都没有**。
//   两者都没有时退化成确定性的中值（不是随机），这样测试不会因为缺注入而随机变红。
//
// ---------------------------------------------------------------------------
// 宿主回调（由 Script_Ai 从 ctx 组装，四个新模块共用同一份形状，见 docs/Data_EnemyAi.md §3）
// ---------------------------------------------------------------------------
//   host.Time()                        → number（ai.time，秒）
//   host.Rnd()                         → [0,1)（Mulberry32，确定性）
//   host.Raycast(from, dir, maxDist)   → { t, normal:[x,y,z], box? } | null
//                                        t 是**沿 dir 的距离（米）**，dir 必须归一。
//                                        from / dir 只被读 .x/.y/.z，传普通对象即可
//                                        （`Script_Physics.Raycast` 与 `RaycastAabb` 都只读这三个分量）。
//   host.BlocksSight(from, to)         → boolean（关卡地形 / 战车遮挡，可缺省）
//   host.StanceEye(stance, subject?)   → m（`AiDirector.StanceEye`，含身高缩放；可缺省）
// 全部可缺省：缺 Raycast 时暴露判定退化成「全部可见」（纯逻辑环境与单测用）。
//
// ---------------------------------------------------------------------------
// 已知的分配（两处，都受缓存或射速节流）
// ---------------------------------------------------------------------------
//   1. `PlayerSamples` 调 `Script_PlayerHitbox.PlayerHitboxes`，它内部每次 new 一组
//      分段对象。**不能改那个文件**（它是玩家挨打那条链的共享几何），而重写一份
//      姿态几何等于给「人有多高」立第二份真相 —— 那比每次十几个小对象贵得多。
//      代价被两件事夹住：只有以玩家为目标时才走这条路（同时打玩家的人上限是
//      `COMBAT.maxShootersOnPlayer = 3`），而且结果按 `exposureCacheS` 缓存。
//   2. `Resolve` 调 `GaussianPair(rnd)`，它返回一个两元素数组。用它而不是自己再写一遍
//      Box–Muller 的理由同上：散点统计只许有一份实现（`PlayerHitPart` 用的就是它）。
//      一发一次，与开火频率同阶。
//
// ---------------------------------------------------------------------------
// 为什么要有这个模块（病根，docs/Data_EnemyAi.md §2.3）
// ---------------------------------------------------------------------------
//   · 通视按眼高算、结算按躯干中点算 —— 两条线不是同一条，中间那堵矮墙没人验：
//     玩家蹲在矮墙后只露眼睛，会被隔墙打中躯干；反过来 AI 也不知道自己只露了一个头。
//   · 子弹从躯干中心出发而不是枪口，`lookPitch` 恒 0，人物不抬枪不压枪。
//   · 看不见目标就闭嘴，没有压制射击。
//   · 瞄准误差是常数，没有收敛过程 —— 探头没有代价。
// 这四条对应本模块的四件事，一一对上。

import { PLAYER_HITBOX, PlayerHitboxes, GaussianPair } from "./Script_PlayerHitbox.mjs";
import { AIM, SHOOTING, BURST, SAMPLES, CLOSE_RANGE } from "./Data_Tuning_AiShooting.mjs";

const STANCE_NAMES = ["stand", "crouch", "prone"];

/** 采样点的标签。**不是** `Player.TakeHit` 的部位名（那套是 head/torso/arm/leg）。 */
export const SAMPLE_PART = Object.freeze({
  HEAD: "head", CHEST: "chest", PELVIS: "pelvis", KNEE: "knee",
});

function Clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function Clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function Finite(v) { return typeof v === "number" && Number.isFinite(v); }
function FinitePoint(p) { return !!p && Finite(p.x) && Finite(p.y) && Finite(p.z); }

/** 按 kind 取一档，表里没有这个 kind 就落到 default。 */
function ByKind(table, kind) {
  return (kind && Object.prototype.hasOwnProperty.call(table, kind)) ? table[kind] : table.default;
}

/**
 * 暴露曲线：目标露出来的比例 → 命中率倍率。
 *
 * `f^1.6`（指数在表里）。两个端点是契约：`f=1 → 1`（满暴露不打折，TTK 账不变）、
 * `f=0 → 0`（看不见的人打不中，这条同时由 `Resolve` 的早退兜第二道）。
 * 中间取 1.6 次幂的理由写在 `SHOOTING.exposureExponent` 的注释里。
 */
export function ExposureCurve(fraction) {
  const f = Clamp01(Finite(fraction) ? fraction : 0);
  if (f <= 0) return 0;
  if (f >= 1) return 1;
  return Math.pow(f, SHOOTING.exposureExponent);
}

/**
 * 瞄准误差曲线：当前误差 → 命中率倍率。在 `floorRad` 处**精确等于 1**，随误差单调下降。
 *
 * 闭式：`1 / (1 + (excess / halfRad)²)`，其中 `excess = max(0, err − floor)`。
 *
 * 为什么是这个形状（洛伦兹型，不是指数也不是线性）：把瞄准方向的抖动当成 2D 高斯
 * （1σ = excess），目标张角半宽 θ₀，那么命中概率是 `1 − exp(−θ₀²/(2σ²))`。
 * 这个式子在 σ ≪ θ₀ 时趋近 1、在 σ ≫ θ₀ 时按 **1/σ²** 衰减。
 * `1/(1+(σ/halfRad)²)` 用一个参数同时对上这两头的渐近行为，而且：
 *   · 在 σ=0 处精确为 1（指数形式也行，但它在 0 附近太平，读起来像"误差不影响命中"）；
 *   · 处处单调、可导，不会在阈值上跳变（分段线性会让玩家看到"瞄到某一刻突然变准"）；
 *   · 只有一次乘法一次除法，1/6 分帧下 110 人跑得起。
 * 默认使用 AIM.halfRad。玩家近距可传身体张角 targetAngleRad，避免把贴脸目标
 * 当成远处的小靶；张角小于 halfRad 时沿用旧曲线，不追加远距离惩罚。
 *
 * @param {number} errorRad 当前瞄准误差（弧度）
 * @param {number} [floorRad=0] 这支枪 / 这个姿态瞄到底的误差；低于它一律算 1
 * @param {number} [targetAngleRad=0] 可选的目标半张角
 */
export function AimErrorCurve(errorRad, floorRad = 0, targetAngleRad = 0) {
  const err = Finite(errorRad) ? errorRad : 0;
  const floor = Finite(floorRad) ? floorRad : 0;
  const excess = err - floor;
  if (!(excess > 0)) return 1;
  const k = excess / Math.max(AIM.halfRad, targetAngleRad);
  return 1 / (1 + k * k);
}

/** Smoothly remove distant-crossfire assistance at close contact. */
export function CloseRangeWeight(distance) {
  if (!Finite(distance)) return 0;
  const t = Clamp01((CLOSE_RANGE.fadeOutM - distance)
    / (CLOSE_RANGE.fadeOutM - CLOSE_RANGE.fullAccuracyM));
  return t * t * (3 - 2 * t);
}

/**
 * 射击模型。一个 `AiDirector` 配一个实例（所有士兵共用），状态挂在各自的 `soldier.shooting` 上。
 */
export class ShootingModel {
  constructor(host = {}) {
    this.host = host || {};
    /** 本实例累计射了多少条暴露射线。性能取证与 `Debug.Ai` 用；测试也数它。 */
    this.rayCount = 0;

    // --- 复用容器（热路径零分配）-------------------------------------------
    this._samples = [];              // SoldierSamples / PlayerSamples 的默认 out
    this._boxes = [];                // PlayerHitboxes 的复用数组
    this._dir = { x: 0, y: 0, z: 0 };        // 射线方向
    this._center = { x: 0, y: 0, z: 0 };     // 躯干中心（选瞄点用）
    this._muzzle = { x: 0, y: 0, z: 0 };
    this._suppress = { x: 0, y: 0, z: 0 };
    this._burst = { shots: 1, intervalS: 1, pauseS: 0 };
    this._result = {
      hit: false,
      dir: { x: 0, y: 0, z: 0 },
      aimPoint: { x: 0, y: 0, z: 0 },
      missPoint: { x: 0, y: 0, z: 0 },
      missDir: { x: 0, y: 0, z: 0 },
      // 取证字段（覆盖层 / 测试读，规则不依赖）
      accuracy: 0, baseAccuracy: 0, exposure: 1, exposureCurve: 1,
      aimError: 0, aimErrorCurve: 1, distance: 0, roll: 1,
    };
  }

  // ======================================================================
  // 挂载
  // ======================================================================

  /**
   * 幂等地在 `soldier.shooting` 上挂内部状态。`BeginAim` / `UpdateAim` / `Exposure` /
   * `Resolve` 任何一个入口都会先调它，所以调用方不必关心顺序。
   *
   * 误差**一开始就播在初值上**，不是 0。这一条很要紧：0 会让 `AimErrorCurve` 读成
   * "已经瞄到底"，于是漏调 `BeginAim` 的调用方白拿满命中率 —— 漏调用应该让 AI 变差，
   * 不该让它变强。这样 `AimError()` 对"挂了但没瞄过"与"根本没挂过"两种人也读到同一个数。
   */
  Attach(soldier) {
    let st = soldier.shooting;
    if (st) return st;
    const p = this._Profile(soldier, soldier?.stance, soldier?.suppression);
    st = {
      targetId: undefined,
      aiming: false,
      errorRad: p.initial,
      initialRad: p.initial,
      floorRad: p.floor,
      convergePerS: p.rate,
      // initialRad / beganAt 是取证字段（`?aidebug=1` 覆盖层与 `Debug.Ai.State` 读），
      // 规则本身不依赖它们；updates 是"这一轮瞄准被推进过几次"。
      beganAt: -1e9,
      updates: 0,
      exposure: {
        targetId: undefined,
        time: -1e9,
        fraction: 0,
        visibleParts: [],
        aimPoint: { x: 0, y: 0, z: 0 },
        hasAimPoint: false,
        fromX: NaN, fromY: NaN, fromZ: NaN,
        keyX: NaN, keyY: NaN, keyZ: NaN,
        rays: 0,
      },
      // Exposure 的返回视图。字段每次原地改写，引用稳定 —— 不产生新对象。
      view: { fraction: 0, visibleParts: null, aimPoint: null },
    };
    st.view.visibleParts = st.exposure.visibleParts;
    soldier.shooting = st;
    return st;
  }

  /** 卸掉内部状态（士兵出场 / 换阵营 / 单测清场）。 */
  Detach(soldier) {
    if (soldier) soldier.shooting = undefined;
  }

  // ======================================================================
  // 瞄准误差
  // ======================================================================

  /**
   * 这支枪 / 这个姿态 / 这个压制值下的误差三件套。
   * @returns {{initial:number, floor:number, rate:number}}
   */
  _Profile(soldier, stance, suppression) {
    const kind = soldier?.weapon?.kind;
    const idx = Clamp((Finite(stance) ? stance : 0) | 0, 0, AIM.stanceScale.length - 1);
    const scale = AIM.stanceScale[idx];
    const s = Clamp01(Finite(suppression) ? suppression : 0);
    return {
      initial: ByKind(AIM.initialErrorRad, kind) * scale * (1 + s * AIM.suppressedInitialScale),
      floor: ByKind(AIM.floorRad, kind) * scale,
      rate: ByKind(AIM.convergePerS, kind),
    };
  }

  /**
   * 开始瞄一个目标。**换目标、或者从隐蔽里探头出来**时调：误差回到 `initialErrorRad`。
   *
   * 幂等：同一个 `targetId` 反复调**不会**重置误差 —— 这条是必须的，
   * 否则每次 `TryFire` 都重置一遍，误差永远停在初值，AI 再也瞄不准
   * （表现是"打了半天一发不中"，而 DamageTest 的 TTK 会直接冲出上界）。
   * 探头 / 换掩体那种「需要重新瞄」的场合传 `{ force: true }`。
   *
   * @param {object} soldier
   * @param {*} [targetId] 目标标识（`soldier.target.id`；玩家用固定 id）
   * @param {{force?:boolean}} [opts]
   */
  BeginAim(soldier, targetId = null, opts = null) {
    const st = this.Attach(soldier);
    const changed = st.targetId !== targetId || !st.aiming;
    if (changed || opts?.force) {
      const p = this._Profile(soldier, soldier.stance, soldier.suppression);
      st.initialRad = p.initial;
      st.floorRad = p.floor;
      st.convergePerS = p.rate;
      st.errorRad = Math.max(p.initial, p.floor);
      st.beganAt = this._Now();
      st.updates = 0;
    }
    st.targetId = targetId;
    st.aiming = true;
    return st;
  }

  /**
   * 每次 Think（或每帧）推进一次瞄准。**必须被调**：不调的话误差一直停在初值，
   * `Resolve` 会一直按"刚举枪"那档算命中率。
   *
   * 先按 `convergePerS` 指数收敛到 `floorRad`，再加这一帧的扰动：
   *   · `moving`       自己在动（布尔或 0..1 的速度归一化量）
   *   · `suppression`  被压制（0..1）
   *   · `targetMoving` 目标在动（布尔或 0..1）
   *   · `exposedS`     目标已经持续暴露了几秒 —— 越久收敛越快（老兵会越打越准）
   *   · `stance`       不传就读 `soldier.stance`；姿态换了会重算底噪与初值档
   *
   * @returns {number} 更新后的误差（弧度）
   */
  UpdateAim(soldier, dt, opts = null) {
    const st = this.Attach(soldier);
    const step = Finite(dt) ? Math.max(0, dt) : 0;
    const stance = Finite(opts?.stance) ? opts.stance : soldier.stance;
    const suppression = Clamp01(Finite(opts?.suppression) ? opts.suppression
      : (Finite(soldier.suppression) ? soldier.suppression : 0));
    const p = this._Profile(soldier, stance, suppression);
    st.floorRad = p.floor;
    st.convergePerS = p.rate;
    if (!st.aiming && st.updates === 0) st.errorRad = Math.max(st.errorRad, p.initial);

    const moving = Amount(opts?.moving);
    const targetMoving = Amount(opts?.targetMoving);
    const exposedS = Finite(opts?.exposedS) ? Math.max(0, opts.exposedS) : 0;

    // 暴露越久收敛越快，封顶在 exposedConvergeCapS。
    const bonus = 1 + AIM.exposedConvergeBonus
      * Math.min(exposedS, AIM.exposedConvergeCapS) / AIM.exposedConvergeCapS;
    const rate = p.rate * bonus;

    let err = st.errorRad;
    if (step > 0) {
      err = p.floor + (err - p.floor) * Math.exp(-rate * step);
      err += (AIM.disturbMovingPerS * moving
        + AIM.disturbSuppressionPerS * suppression
        + AIM.disturbTargetMovingPerS * targetMoving) * step;
    }
    // 吸附：指数收敛永远到不了底，而「收敛到底 ⇒ 曲线 == 1 ⇒ 命中率 == baseAccuracy」
    // 是不许破的契约，必须有一个能真正到达的底。
    if (err - p.floor < AIM.snapRad) err = p.floor;
    st.errorRad = Clamp(err, p.floor, AIM.maxRad);
    st.updates += 1;
    return st.errorRad;
  }

  /**
   * 当前瞄准误差（弧度）。没挂过状态的人返回**他这支枪的初值** ——
   * 没瞄过的人本来就不准，这里不替调用方补一次 `BeginAim`（那会掩盖漏调用）。
   */
  AimError(soldier) {
    const st = soldier?.shooting;
    if (st) return st.errorRad;
    return this._Profile(soldier, soldier?.stance, soldier?.suppression).initial;
  }

  /** 这个人瞄到底能有多准（弧度）。取证与测试读。 */
  AimFloor(soldier) {
    const st = soldier?.shooting;
    if (st) return st.floorRad;
    return this._Profile(soldier, soldier?.stance, soldier?.suppression).floor;
  }

  /** 误差曲线的当前值（0..1）。`Resolve` 用的就是它。 */
  AimErrorCurve(soldier) {
    return AimErrorCurve(this.AimError(soldier), this.AimFloor(soldier));
  }

  /** 暴露曲线。转发给模块函数，方便覆盖层与测试从模型上取。 */
  ExposureCurve(fraction) { return ExposureCurve(fraction); }

  // ======================================================================
  // 采样点
  // ======================================================================

  /**
   * 玩家的暴露采样点：头球心 / 胸 / 骨盆（+ 双膝）。
   *
   * 几何一律来自 `Script_PlayerHitbox`（玩家挨打那条链用的同一份），
   * 所以「AI 觉得你露出来多少」与「子弹真的会碰到哪根胶囊」不会各说各话
   * —— 这正是 §2.3 那条「通视按眼高、结算按躯干」的病根。
   *
   * 探身（lean）时头点直接取 `player.EyePosition`：`Script_Ai.HasLineOfSight`
   * 与 `TryFire` 在探身时用的也是它，三处保持同一个点。
   *
   * @param {{position:object, yaw:number, stance:string|number, LeanOffsetM?:number, EyePosition?:object}} player
   * @param {Array} [out] 复用数组；默认那一份与 `SoldierSamples` **共用**，
   *        所以「生成采样点 → 立刻 `Exposure`」要一气呵成，别隔着另一个目标的采样。
   * @returns {Array<{x:number,y:number,z:number,part:string}>} 顺序固定：头 / 胸 / 盆 / 膝 / 膝
   */
  PlayerSamples(player, out = this._samples) {
    let n = 0;
    if (!player || !player.position) { out.length = 0; return out; }
    const named = typeof player.stance === "string"
      ? player.stance
      : STANCE_NAMES[Clamp((player.stance | 0), 0, 2)];
    const stanceName = PLAYER_HITBOX[named] ? named : "stand";
    const lean = Finite(player.LeanOffsetM) ? player.LeanOffsetM : 0;
    const boxes = PlayerHitboxes(player.position, Finite(player.yaw) ? player.yaw : 0,
      stanceName, this._boxes, lean);

    let head = null, torso = null, legA = null, legB = null;
    for (let i = 0; i < boxes.length; i += 1) {
      const b = boxes[i];
      if (b.part === "head" && !head) head = b;
      else if (b.part === "torso" && !torso) torso = b;
      else if (b.part === "leg") { if (!legA) legA = b; else if (!legB) legB = b; }
    }
    if (!head || !torso) { out.length = 0; return out; }

    // 探身时头点用真眼位（与通视那条线同一个点）。
    if (lean && FinitePoint(player.EyePosition)) {
      n = Write(out, n, player.EyePosition.x, player.EyePosition.y, player.EyePosition.z, SAMPLE_PART.HEAD);
    } else {
      n = Write(out, n, head.center.x, head.center.y, head.center.z, SAMPLE_PART.HEAD);
    }

    // 躯干胶囊的「胸端」= 离头更近的那一端。站 / 蹲时它在上方，**卧姿时它在前方**，
    // 所以只能按到头的距离判，不能写死"y 大的那一端"。
    const dS = Dist2(torso.start, head.center);
    const dE = Dist2(torso.end, head.center);
    const chestEnd = dS <= dE ? torso.start : torso.end;
    const pelvisEnd = dS <= dE ? torso.end : torso.start;
    n = WriteLerp(out, n, chestEnd, pelvisEnd, SAMPLES.playerChestT, SAMPLE_PART.CHEST);
    n = WriteLerp(out, n, chestEnd, pelvisEnd, SAMPLES.playerPelvisT, SAMPLE_PART.PELVIS);
    if (legA) n = WriteLerp(out, n, legA.start, legA.end, SAMPLES.playerKneeT, SAMPLE_PART.KNEE);
    if (legB) n = WriteLerp(out, n, legB.start, legB.end, SAMPLES.playerKneeT, SAMPLE_PART.KNEE);
    out.length = n;
    return out;
  }

  /**
   * AI 目标的暴露采样点：按姿态在脚底之上摆三个（卧姿两个）高度。
   *
   * 为什么不做前后偏移：卧倒的人身体是向前铺开的，但 `SoldierSamples` 的签名里
   * 没有 yaw，而 AI 打 AI 那条链本来就是**粗判**（部位仍是 `s.rnd() < 0.08` 那一掷，
   * 见 docs/Data_PlayerDamage.md「AI 打 AI 仍按概率抽部位」）。
   * 这里要回答的只是"他露出来多少"，一条竖直的采样柱够用，而且省一半三角函数。
   *
   * @param {{x:number,y:number,z:number}} position 脚底
   * @param {number} stance 0 站 / 1 蹲 / 2 卧
   * @param {Array} [out] 复用数组；默认那一份与 `PlayerSamples` 共用（见那边的说明）
   * @param {number} [heightScale=1] 身高缩放（`childCapsules[0].height / CAPSULE[0].height`）
   */
  SoldierSamples(position, stance, out = this._samples, heightScale = 1) {
    let n = 0;
    if (!position) { out.length = 0; return out; }
    const spec = SAMPLES.soldier[Clamp((Finite(stance) ? stance : 0) | 0, 0, SAMPLES.soldier.length - 1)];
    const k = Finite(heightScale) && heightScale > 0 ? heightScale : 1;
    const x = position.x, y = Finite(position.y) ? position.y : 0, z = position.z;
    n = Write(out, n, x, y + spec.head * k, z, SAMPLE_PART.HEAD);
    if (Finite(spec.chest)) n = Write(out, n, x, y + spec.chest * k, z, SAMPLE_PART.CHEST);
    if (Finite(spec.pelvis)) n = Write(out, n, x, y + spec.pelvis * k, z, SAMPLE_PART.PELVIS);
    out.length = n;
    return out;
  }

  // ======================================================================
  // 暴露
  // ======================================================================

  /**
   * 从 `from`（枪口）向目标的采样点逐条射线，回答「他露出来多少、该瞄哪个点」。
   *
   * · 射线数 ≤ `SHOOTING.exposureSamples`（默认 3：头 / 胸 / 盆）——
   *   采样点生成器给的膝盖只有把预算调大才会被射到；
   * · `hit.t < dist − blockedMarginM` 视为被挡；也过一次 `host.BlocksSight`（更便宜，先问它）；
   * · 结果按 `exposureCacheS` 缓存在 `soldier.shooting.exposure` 上，
   *   射手或目标头部移动超过 `exposureCacheMoveM` 时提前作废；
   * · `aimPoint` 取**最靠近躯干中心的可见采样点**（不是最近的点：那会让 AI 专挑
   *   露在外面的一只脚打），全部被挡时为 `null`。
   *
   * @param {object} soldier
   * @param {{x:number,y:number,z:number}} from 枪口（`MuzzleOrigin` 的结果）
   * @param {Array<{x:number,y:number,z:number,part:string}>} targetSamples
   * @param {{targetId?:*, now?:number}} [opts]
   * @returns {{fraction:number, visibleParts:string[], aimPoint:{x,y,z}|null}} 复用对象
   */
  Exposure(soldier, from, targetSamples, opts = null) {
    const st = this.Attach(soldier);
    const ex = st.exposure;
    const now = Finite(opts?.now) ? opts.now : this._Now();
    const targetId = (opts && "targetId" in opts) ? opts.targetId : st.targetId;
    const count = targetSamples ? targetSamples.length : 0;

    if (!count || !FinitePoint(from)) {
      ex.fraction = 0; ex.hasAimPoint = false; ex.visibleParts.length = 0;
      ex.targetId = targetId; ex.time = now;
      return this._View(st);
    }

    const key = targetSamples[0];
    const move = SHOOTING.exposureCacheMoveM * SHOOTING.exposureCacheMoveM;
    if (ex.targetId === targetId
      && now - ex.time >= 0 && now - ex.time < SHOOTING.exposureCacheS
      && Dist2Raw(from.x, from.y, from.z, ex.fromX, ex.fromY, ex.fromZ) < move
      && Dist2Raw(key.x, key.y, key.z, ex.keyX, ex.keyY, ex.keyZ) < move) {
      return this._View(st);
    }

    const used = Math.min(count, Math.max(1, SHOOTING.exposureSamples | 0));
    TorsoCenter(targetSamples, used, this._center);

    ex.visibleParts.length = 0;
    let visible = 0;
    let bestIdx = -1;
    let bestD2 = Infinity;
    for (let i = 0; i < used; i += 1) {
      const p = targetSamples[i];
      if (this._Blocked(from, p)) continue;
      visible += 1;
      ex.visibleParts.push(p.part);
      const d2 = Dist2(p, this._center);
      if (d2 < bestD2) { bestD2 = d2; bestIdx = i; }
    }

    ex.fraction = visible / used;
    if (bestIdx >= 0) {
      const p = targetSamples[bestIdx];
      ex.aimPoint.x = p.x; ex.aimPoint.y = p.y; ex.aimPoint.z = p.z;
      ex.hasAimPoint = true;
    } else {
      ex.hasAimPoint = false;
    }
    ex.targetId = targetId;
    ex.time = now;
    ex.fromX = from.x; ex.fromY = from.y; ex.fromZ = from.z;
    ex.keyX = key.x; ex.keyY = key.y; ex.keyZ = key.z;
    ex.rays += used;
    return this._View(st);
  }

  _View(st) {
    const ex = st.exposure;
    const view = st.view;
    view.fraction = ex.fraction;
    view.visibleParts = ex.visibleParts;
    view.aimPoint = ex.hasAimPoint ? ex.aimPoint : null;
    return view;
  }

  /** 一条采样线被挡住了没有。缺 `host.Raycast` 时一律算通（纯逻辑环境）。 */
  _Blocked(from, to) {
    const host = this.host;
    if (typeof host.BlocksSight === "function" && host.BlocksSight(from, to)) return true;
    if (typeof host.Raycast !== "function") return false;
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!(dist > 1e-4)) return false;
    const dir = this._dir;
    dir.x = dx / dist; dir.y = dy / dist; dir.z = dz / dist;
    this.rayCount += 1;
    const hit = host.Raycast(from, dir, dist);
    return !!hit && Finite(hit.t) && hit.t < dist - SHOOTING.blockedMarginM;
  }

  // ======================================================================
  // 射击走廊
  // ======================================================================

  /**
   * 射击线上有没有自己人。任何一个友军躯干中心落在走廊里（点到线段距离 <
   * `friendlyCorridorM`，且在 from→to 之间）就返回 false。
   *
   * 修的是「一个班挤在一堵墙后面，后排隔着前排的后脑勺开枪」。
   * 枪口正前 `friendlyMinAlongM` 之内的人不算 —— 那个位置上的"友军"是自己的身体。
   *
   * @param {{x,y,z}} from 枪口
   * @param {{x,y,z}} to 瞄点
   * @param {Array<{x:number,y:number,z:number,radius?:number}>} allies 友军躯干中心
   */
  LineOfFireClear(from, to, allies) {
    if (!allies || !allies.length || !FinitePoint(from) || !FinitePoint(to)) return true;
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const len2 = dx * dx + dy * dy + dz * dz;
    if (!(len2 > 1e-8)) return true;
    const len = Math.sqrt(len2);
    const ix = dx / len, iy = dy / len, iz = dz / len;
    for (let i = 0; i < allies.length; i += 1) {
      const a = allies[i];
      if (!a || !Finite(a.x) || !Finite(a.z)) continue;
      const ax = a.x - from.x;
      const ay = (Finite(a.y) ? a.y : from.y) - from.y;
      const az = a.z - from.z;
      const along = ax * ix + ay * iy + az * iz;
      if (along <= SHOOTING.friendlyMinAlongM || along >= len) continue;
      const px = ax - ix * along, py = ay - iy * along, pz = az - iz * along;
      const r = Finite(a.radius) ? a.radius : SHOOTING.friendlyCorridorM;
      if (px * px + py * py + pz * pz < r * r) return false;
    }
    return true;
  }

  // ======================================================================
  // 结算
  // ======================================================================

  /**
   * 结算一发。**只叠两条曲线**，其余全部由调用方算好放进 `baseAccuracy`。
   *
   *     命中率 = baseAccuracy × ExposureCurve(fraction) × AimErrorCurve(err)
   *
   * 不变量（DamageTest 的账）：`fraction = 1` 且误差收敛到底时两条曲线都精确为 1，
   * 命中率 == `baseAccuracy`；`fraction = 0` 时**永远不命中**。
   *
   * 骰子**无论命中与否都掷同样多次**（一次 `rnd()` + 一对高斯），
   * 这样确定性随机序列不随分支漂移 —— 同一个种子重跑读到同一场仗。
   *
   * @param {object} soldier
   * @param {{x,y,z}} from 枪口
   * @param {{x,y,z}} aimPoint 瞄点（`Exposure` 给的，或压制点）
   * @param {{baseAccuracy:number, exposure?:number|object, distance?:number,
   *          rnd?:function, aimError?:number, targetRadiusM?:number}} opts
   * @returns {{hit:boolean, dir:{x,y,z}, aimPoint:{x,y,z}, missPoint:{x,y,z}, missDir:{x,y,z}}}
   *          复用对象；要跨帧留着就自己 copy。
   */
  Resolve(soldier, from, aimPoint, opts = null) {
    const st = this.Attach(soldier);
    const res = this._result;
    const o = opts || {};
    const base = Finite(o.baseAccuracy) ? o.baseAccuracy : 0;
    const fraction = ExposureFraction(o.exposure);
    const err = Finite(o.aimError) ? o.aimError : st.errorRad;
    const exposureCurve = ExposureCurve(fraction);
    // A 24 cm target at 2 m tolerates more angular error than the same body at
    // 25 m. Optional: non-player and distant shooting retain their old curve.
    const targetAngle = o.targetRadiusM > 0 && o.distance > 0
      ? Math.atan(o.targetRadiusM / o.distance) : 0;
    const errorCurve = AimErrorCurve(err, st.floorRad, targetAngle);
    const acc = base * exposureCurve * errorCurve;

    const rnd = typeof o.rnd === "function" ? o.rnd
      : (typeof soldier?.rnd === "function" ? soldier.rnd
        : (typeof this.host.Rnd === "function" ? this.host.Rnd : null));
    const roll = rnd ? rnd() : 1;

    // 方向与距离。
    let dx = aimPoint.x - from.x, dy = aimPoint.y - from.y, dz = aimPoint.z - from.z;
    let dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!(dist > 1e-6)) { dx = 0; dy = 0; dz = 1; dist = 1; }
    res.dir.x = dx / dist; res.dir.y = dy / dist; res.dir.z = dz / dist;
    res.aimPoint.x = aimPoint.x; res.aimPoint.y = aimPoint.y; res.aimPoint.z = aimPoint.z;
    const distance = Finite(o.distance) && o.distance > 0 ? o.distance : dist;

    // 打偏的落点：以瞄点为心、tan(误差)×距离 为 1σ 的高斯散点，落在与射击线垂直的平面上。
    // 与 `AiDirector.PlayerHitPart` 用的是同一套 Box–Muller，不另写第二份。
    const sigma = Math.min(SHOOTING.missMaxOffsetM,
      Math.tan(Math.min(Math.max(err, 0), 1.2)) * distance * SHOOTING.missSpreadScale);
    const pair = rnd ? GaussianPair(rnd) : ONE_PAIR;
    // 与 dir 垂直的两个轴（与 PlayerHitPart 同一套构造）。
    let ux = res.dir.z, uy = 0, uz = -res.dir.x;
    let ul = Math.sqrt(ux * ux + uz * uz);
    if (ul < 1e-6) { ux = 1; uy = 0; uz = 0; ul = 1; }
    ux /= ul; uz /= ul;
    const wx = res.dir.y * uz - res.dir.z * uy;
    const wy = res.dir.z * ux - res.dir.x * uz;
    const wz = res.dir.x * uy - res.dir.y * ux;
    let ou = pair[0] * sigma, ow = pair[1] * sigma;
    let r = Math.sqrt(ou * ou + ow * ow);
    // 打偏的弹着点绝不与瞄点重合：重合的话曳光会直穿目标，画面上像"打中了但没扣血"。
    if (!(r > SHOOTING.missMinOffsetM)) {
      if (r > 1e-9) { const k = SHOOTING.missMinOffsetM / r; ou *= k; ow *= k; }
      else { ou = SHOOTING.missMinOffsetM; ow = 0; }
      r = SHOOTING.missMinOffsetM;
    } else if (r > SHOOTING.missMaxOffsetM) {
      const k = SHOOTING.missMaxOffsetM / r; ou *= k; ow *= k;
    }
    res.missPoint.x = aimPoint.x + ux * ou + wx * ow;
    res.missPoint.y = aimPoint.y + uy * ou + wy * ow;
    res.missPoint.z = aimPoint.z + uz * ou + wz * ow;
    let mx = res.missPoint.x - from.x, my = res.missPoint.y - from.y, mz = res.missPoint.z - from.z;
    const ml = Math.sqrt(mx * mx + my * my + mz * mz) || 1;
    res.missDir.x = mx / ml; res.missDir.y = my / ml; res.missDir.z = mz / ml;

    res.hit = fraction > 0 && roll < acc;
    res.accuracy = acc;
    res.baseAccuracy = base;
    res.exposure = fraction;
    res.exposureCurve = exposureCurve;
    res.aimError = err;
    res.aimErrorCurve = errorCurve;
    res.distance = distance;
    res.roll = roll;
    return res;
  }

  // ======================================================================
  // 点射 / 压制 / 枪口 / 抬枪
  // ======================================================================

  /**
   * 一梭子打几发、每发间隔多久、打完停多久。消费 `Data_Weapons` 的
   * `aiBurstMin` / `aiBurstMax`（这一轮之前它们是死字段）。
   *
   * 拉栓步枪恒 1 发：三八式表里写着 `aiBurstMax: 2`，但两发之间必须拉一次栓，
   * 而那一下就是 `fireIntervalS` 本身；排一个"两连发"会让人在 0.24 s 内打出两发，
   * 读起来是半自动步枪。理由与那张表在 `BURST.singleShotKinds` 的注释里。
   *
   * @param {object} weapon `Data_Weapons.WEAPONS` 里的一支
   * @param {function} [rnd] 确定性随机；不给就用 `host.Rnd`；都没有时取中值（不随机）
   * @returns {{shots:number, intervalS:number, pauseS:number}} 复用对象
   */
  BurstPlan(weapon, rnd) {
    const out = this._burst;
    const kind = weapon?.kind;
    const spec = ByKind(BURST.byKind, kind);
    const single = BURST.singleShotKinds.indexOf(kind) >= 0;
    const r = typeof rnd === "function" ? rnd
      : (typeof this.host.Rnd === "function" ? this.host.Rnd : null);
    const u1 = r ? r() : 0.5;
    const u2 = r ? r() : 0.5;

    let min = Finite(weapon?.aiBurstMin) ? Math.round(weapon.aiBurstMin) : spec.min;
    let max = Finite(weapon?.aiBurstMax) ? Math.round(weapon.aiBurstMax) : spec.max;
    min = Clamp(min, 1, BURST.maxShots);
    max = Clamp(max, min, BURST.maxShots);
    out.shots = single ? 1 : Clamp(min + Math.floor(u1 * (max - min + 1)), min, max);

    out.intervalS = Finite(weapon?.fireIntervalS) ? weapon.fireIntervalS
      : (Finite(weapon?.rpm) && weapon.rpm > 0 ? 60 / weapon.rpm : 1.0);
    out.pauseS = single ? spec.pauseMinS
      : spec.pauseMinS + (spec.pauseMaxS - spec.pauseMinS) * u2;
    return out;
  }

  /**
   * 目标藏起来之后往哪儿打。
   *
   * 有掩体：掩体沿**上方** `suppressAboveCoverM`、沿法线往外偏一点，加横向散布 ——
   * 子弹擦着掩体顶过去，砖屑落在缩着头的人脸上。这就是"藏起来也有子弹擦过"。
   * 打在掩体上只有一声闷响，打高了对方根本不知道在挨打，两头都不算压制。
   * 竖向散布刻意小于 `suppressAboveCoverM`，保证弹着点**永远在掩体沿以上**。
   *
   * 没掩体：最后目击位置的胸高（1.10 m，与 `TryFire` 对 AI 目标的 `to.y += 1.1` 同值）。
   *
   * 掩体三种字段名都认（`height|h`、`nx|faceX|fx`、`nz|faceZ|fz`）—— 生产方有三家
   * （`Script_WallPlan` 推 `{x,z,h,fx,fz}`、`Script_World.Cover` 推
   * `{x,z,height,faceX,faceZ}`、测试假件用 `{height,nx,nz}`），归一化本该在
   * `Script_AiCover.NormalizeCover` 做，这里再认一次是为了**单独用本模块时也不会静默失效**
   * （`FindCover` 只读 `c.height` 那个 bug 就是这么来的，见 docs/Data_EnemyAi.md §2.2）。
   *
   * @param {{x,y,z}} lkp 最后目击位置
   * @param {object|null} [cover]
   * @param {object} [out] 复用点
   */
  SuppressPoint(lkp, cover = null, out = this._suppress) {
    const r = typeof this.host.Rnd === "function" ? this.host.Rnd : null;
    const j1 = r ? r() * 2 - 1 : 0;
    const j2 = r ? r() * 2 - 1 : 0;
    const lx = Finite(lkp?.x) ? lkp.x : 0;
    const ly = Finite(lkp?.y) ? lkp.y : 0;
    const lz = Finite(lkp?.z) ? lkp.z : 0;
    const h = Finite(cover?.height) ? cover.height : (Finite(cover?.h) ? cover.h : NaN);
    if (cover && Finite(h) && Finite(cover.x) && Finite(cover.z)) {
      let nx = Finite(cover.nx) ? cover.nx : (Finite(cover.faceX) ? cover.faceX : (Finite(cover.fx) ? cover.fx : 0));
      let nz = Finite(cover.nz) ? cover.nz : (Finite(cover.faceZ) ? cover.faceZ : (Finite(cover.fz) ? cover.fz : 0));
      const nl = Math.sqrt(nx * nx + nz * nz);
      if (nl > 1e-6) { nx /= nl; nz /= nl; } else { nx = 0; nz = 0; }
      const baseY = Finite(cover.y) ? cover.y : ly;
      const scatter = j1 * SHOOTING.suppressScatterM;
      out.x = cover.x + nx * SHOOTING.suppressOutsideM - nz * scatter;
      out.z = cover.z + nz * SHOOTING.suppressOutsideM + nx * scatter;
      out.y = baseY + h + SHOOTING.suppressAboveCoverM + j2 * SHOOTING.suppressVerticalScatterM;
      return out;
    }
    out.x = lx + j1 * SHOOTING.suppressScatterM;
    out.y = ly + SHOOTING.suppressLkpChestM;
    out.z = lz + j2 * SHOOTING.suppressScatterM;
    return out;
  }

  /**
   * 子弹从哪儿出来。
   *
   * 优先级：`soldier.muzzleWorld` → `soldier.actor.weaponMuzzleWorld` → 姿态高兜底。
   * 前两者由适配层每帧（或开火前）写入 `Actor.MuzzleWorld()` 的世界坐标 ——
   * 有它曳光才是从枪管出来的，没它就是从胸口出来（§2.3 的第二条病根）。
   *
   * 兜底 = 姿态眼高 − `muzzleDropM`：据枪时瞄准线在枪膛上方约 15 cm。
   * 姿态眼高优先用 `host.StanceEye`（`AiDirector.StanceEye`，带身高缩放），
   * 缺注入时用表里的 `[1.5, 1.0, 0.5]`。
   *
   * @param {object} soldier
   * @param {object} [out] 复用点
   */
  MuzzleOrigin(soldier, out = this._muzzle) {
    const m = FinitePoint(soldier?.muzzleWorld) ? soldier.muzzleWorld
      : (FinitePoint(soldier?.actor?.weaponMuzzleWorld) ? soldier.actor.weaponMuzzleWorld : null);
    if (m) { out.x = m.x; out.y = m.y; out.z = m.z; return out; }
    const pos = soldier?.position;
    const stance = Clamp((Finite(soldier?.stance) ? soldier.stance : 0) | 0, 0, SHOOTING.stanceEyeM.length - 1);
    const eye = typeof this.host.StanceEye === "function"
      ? this.host.StanceEye(stance, soldier) : SHOOTING.stanceEyeM[stance];
    out.x = Finite(pos?.x) ? pos.x : 0;
    out.y = (Finite(pos?.y) ? pos.y : 0) + (Finite(eye) ? eye : SHOOTING.stanceEyeM[stance]) - SHOOTING.muzzleDropM;
    out.z = Finite(pos?.z) ? pos.z : 0;
    return out;
  }

  /**
   * 给 `Actor` 的 `lookPitch`（弧度）。**向上为正**。
   *
   * 取证：`Script_Actor` 里 `Clamp(s.lookPitch, -1.0, 0.9)` 之后
   * `chest.rotation.x += lookPitch * 0.22`、`neck.rotation.x += lookPitch * 0.62`，
   * 而那一段的符号约定注释写明「人物正面朝 -Z，rotation.x 为**正** = 上身后仰 / 抬头」；
   * `PoseWeapon` 里 `POSE_E.set(lookPitch, lookYaw, 0, "YXZ")` 作用在朝 -Z 的枪轴上，
   * 绕 X 转正角把 (0,0,−1) 变成 (0, sin p, −cos p) —— 同样是**正 = 向上**。
   * 这里先按 `Script_Actor` 的同一组上下界夹一次，免得 AI 算出来的抬枪量
   * 在画面里被无声吃掉。
   */
  LookPitch(from, to) {
    if (!FinitePoint(from) || !FinitePoint(to)) return 0;
    const dy = to.y - from.y;
    const horiz = Math.sqrt((to.x - from.x) * (to.x - from.x) + (to.z - from.z) * (to.z - from.z));
    const pitch = horiz > 1e-6 ? Math.atan2(dy, horiz) : (dy >= 0 ? Math.PI / 2 : -Math.PI / 2);
    return Clamp(pitch, SHOOTING.lookPitchMinRad, SHOOTING.lookPitchMaxRad);
  }

  _Now() {
    const t = typeof this.host.Time === "function" ? this.host.Time() : NaN;
    return Finite(t) ? t : 0;
  }
}

// --------------------------------------------------------------------------
// 小工具（模块私有；不导出以免变成第二份公共 API）
// --------------------------------------------------------------------------

/** 布尔或 0..1 的量 → 0..1。给 moving / targetMoving 用（调用方两种都可能传）。 */
function Amount(v) {
  if (v === true) return 1;
  if (v === false || v === undefined || v === null) return 0;
  return Finite(v) ? Clamp01(v) : 0;
}

/** `exposure` 可以是数字、`Exposure()` 的返回视图，或缺省（缺省 = 满暴露）。 */
function ExposureFraction(exposure) {
  if (Finite(exposure)) return Clamp01(exposure);
  if (exposure && Finite(exposure.fraction)) return Clamp01(exposure.fraction);
  return 1;
}

function Dist2(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

function Dist2Raw(ax, ay, az, bx, by, bz) {
  const dx = ax - bx, dy = ay - by, dz = az - bz;
  return dx * dx + dy * dy + dz * dz;
}

/** 写一个采样点到 out[i]，复用已有对象（不产生垃圾）。 */
function Write(out, i, x, y, z, part) {
  let s = out[i];
  if (!s) { s = { x: 0, y: 0, z: 0, part: "" }; out[i] = s; }
  s.x = x; s.y = y; s.z = z; s.part = part;
  return i + 1;
}

/** 在 a→b 上按 t 插值写一个采样点。 */
function WriteLerp(out, i, a, b, t, part) {
  return Write(out, i, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t, part);
}

/**
 * 躯干中心：胸与盆两个采样点的中点；只有胸就用胸；两个都没有就取所有采样点的均值。
 * 选瞄点时按到它的距离排序，**不是按到枪口的距离** —— 后者会让 AI 专挑
 * 露在掩体外面的一只脚打。
 *
 * 胸与盆到这个中心**天然等距**（中心就是它们的中点），所以两个都可见时永远是平局。
 * `Exposure` 的比较是严格小于，平局归先到的那个；而采样顺序把胸排在盆前面 ——
 * 于是"全身都露着就瞄胸口"是这条平局规则的直接结果，不是巧合。
 */
function TorsoCenter(samples, used, out) {
  let chest = null, pelvis = null;
  for (let i = 0; i < used; i += 1) {
    const p = samples[i];
    if (p.part === SAMPLE_PART.CHEST && !chest) chest = p;
    else if (p.part === SAMPLE_PART.PELVIS && !pelvis) pelvis = p;
  }
  if (chest && pelvis) {
    out.x = (chest.x + pelvis.x) * 0.5;
    out.y = (chest.y + pelvis.y) * 0.5;
    out.z = (chest.z + pelvis.z) * 0.5;
    return out;
  }
  if (chest) { out.x = chest.x; out.y = chest.y; out.z = chest.z; return out; }
  let sx = 0, sy = 0, sz = 0;
  for (let i = 0; i < used; i += 1) { sx += samples[i].x; sy += samples[i].y; sz += samples[i].z; }
  out.x = sx / used; out.y = sy / used; out.z = sz / used;
  return out;
}

/** 没有随机源时 `Resolve` 用的确定性"高斯对"：半径 1 的固定偏移，不是随机。 */
const ONE_PAIR = Object.freeze([1, 0]);
