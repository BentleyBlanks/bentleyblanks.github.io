/**
 * Script_Rules.mjs — 纯逻辑内核
 * Owner: AgentSystems（基础设施三件套一并落地）
 *
 * 纪律（红线，违反即返工）：
 *  - **禁止 import three、禁止碰 DOM、禁止 Math.random()**。只 import Config。
 *  - 向量一律普通对象 {x,y,z}，不许出现 THREE.Vector3。
 *  - 必须能在纯 node 下 import 并跑通全部三幕流程（Script_SmokeTest 依赖这一点）。
 *  - **平民伤亡与苦难只进代价账本（Ledger），永不计分、永不转化为资源或奖励。**
 *    EvaluateEnding 不产生任何「评分/星级/优劣」，只产生结局 id + 账本 + 中性计数。
 *
 * 组织方式：
 *  1) 纯数学（探测 / 噪音 / 生存 / 伤害 / 瞄准 / 合成）——无状态，谁都能复用。
 *  2) 任务状态机——CreateMissionState() + ApplyMissionEvent(state, event) 不可变风格。
 *  3) CreateRules() ——在上面两层之上的有状态外壳，即契约里的 ctx.rules。
 */

import { Config, GetDifficulty } from './Script_Config.mjs';

/* ================================================================== *
 * 零、本地小工具（Rules 不许 import Script_Math，故自带）
 * ================================================================== */

function Clamp(value, min, max) {
  return value < min ? min : (value > max ? max : value);
}
function Clamp01(value) {
  return value < 0 ? 0 : (value > 1 ? 1 : value);
}
function Lerp(a, b, t) { return a + (b - a) * t; }
function SmoothStep01(t) {
  const x = Clamp01(t);
  return x * x * (3 - 2 * x);
}
function Num(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function CloneArray(list) { return list ? list.slice() : []; }
function CloneMap(map) {
  const out = {};
  if (map) for (const key of Object.keys(map)) out[key] = map[key];
  return out;
}

/* ================================================================== *
 * 一、探测数学
 * ================================================================== */

/**
 * 每秒警戒增量，返回 [-1,1]。负值 = 回落。
 * 设计意图：
 *  - 站着不动 + 蹲伏 + 有遮蔽 + 天黑 + 暴雪 ⇒ 几乎察觉不到你（潜行是主玩法）。
 *  - 一旦被怀疑（alert 高），锁定速度显著加快（涨得快、落得慢，紧张感来自这里）。
 *  - 没视线就一定回落：不许「隔墙感知」。
 */
export function ComputeDetection(params) {
  const stealth = Config.Stealth;
  const difficulty = GetDifficulty();
  const alert = Clamp01(Num(params.alert, 0));
  const decay = -stealth.alertDecayPerSecond * (difficulty.alertDecayScale || 1) * (1 + alert * 0.35);

  const viewRange = Num(params.viewRange, Config.Enemy.viewRangeDay);
  const distance = Math.max(0, Num(params.distance, 999));
  if (!params.lineOfSight || viewRange <= 0 || distance > viewRange) return decay;

  const coneFalloff = Clamp01(Num(params.coneFalloff, 0));
  if (coneFalloff <= 0) return decay;

  /* 距离：近处陡、远处平 */
  const distanceFactor = Math.pow(Clamp01(1 - distance / viewRange), 0.85);
  const visibility = coneFalloff * distanceFactor;
  if (visibility <= 0) return decay;

  /* 光照：全黑处最多减到 35% */
  const lightLevel = Clamp01(Num(params.lightLevel, 1));
  const lightTerm = 1 - stealth.darknessBonus * (1 - lightLevel);

  /* 天气：暴雪把可见度砍掉一半以上 */
  const weather = Clamp01(Num(params.weather, 0));
  const weatherTerm = 1 - 0.55 * weather;

  /* 藏匿：草垛/断墙/阴影 + 姿态加成 */
  let conceal = Clamp01(Num(params.concealment, 0));
  if (params.crouched) conceal += stealth.concealmentCrouchBonus;
  if (params.prone) conceal += stealth.concealmentProneBonus;
  if (params.inCover) conceal += stealth.concealmentCoverBonus;
  const concealTerm = Math.max(0.04, 1 - Clamp01(conceal) * 0.92);

  /* 移动：静止最难被发现，跑动几乎必被发现 */
  const speed = Math.max(0, Num(params.targetSpeed, 0));
  const motionTerm = Math.min(2.0, stealth.stillnessFloor + speed * stealth.motionPenaltyPerSpeed);

  /* 已经起疑的人锁定更快 */
  const momentum = 1 + alert * stealth.alertMomentumScale;

  const rise = stealth.alertRiseBase
    * visibility * lightTerm * weatherTerm * concealTerm * motionTerm * momentum
    * (difficulty.detectionScale || 1);

  return Clamp(rise, -1, 1);
}

/**
 * 噪音可听度 [0,1]。0 = 听不见。
 * 单调：距离越远越小、遮挡越强越小；distance >= radius 一律为 0。
 */
export function ComputeNoiseAudibility(distance, radius, occlusion) {
  const r = Num(radius, 0);
  const d = Math.max(0, Num(distance, 0));
  if (r <= 0 || d >= r) return 0;
  const t = 1 - d / r;
  const falloff = Math.pow(t, 1.6);
  return Clamp01(falloff * (1 - Clamp01(Num(occlusion, 0))));
}

/** 各类噪音的「值得跑一趟」权重。数值越大越容易引来人。 */
const InvestigationWeights = {
  gunshotRifle: 1.0, gunshotPistol: 1.0, grenade: 1.0, explosion: 1.0,
  dogBark: 0.90, boltCycle: 0.70, doorForce: 0.70, meleeHit: 0.80, bodyFall: 0.75,
  stone: 0.55, iceCrack: 0.50, doorOpen: 0.45, landHard: 0.45,
  footstepRun: 0.45, footstepWalk: 0.30, footstepCrouch: 0.20, footstepProne: 0.12,
  container: 0.30, craft: 0.25, vault: 0.30, stealthKill: 0.28, companionMove: 0.22,
};

/** 值得调查的分数。> 0.18 才建议 Investigate（EnemyAi 自己定阈值）。 */
export function ScoreInvestigation(audibility, kind, alert) {
  const weight = InvestigationWeights[kind] !== undefined ? InvestigationWeights[kind] : 0.5;
  const a = Clamp01(Num(audibility, 0));
  return Clamp(a * weight * (1 + Clamp01(Num(alert, 0)) * 0.5), 0, 1.5);
}

/* ================================================================== *
 * 二、生存数学（全部返回「这段 dt 内的数值变化量」）
 * ================================================================== */

/** 体温变化量。火是唯一的救命稻草，别的都只能减缓下滑。 */
export function ComputeWarmthDelta(params) {
  const survival = Config.Survival;
  const difficulty = GetDifficulty();
  const dt = Math.max(0, Num(params.dt, 0));
  if (dt <= 0) return 0;

  const exposure = Clamp01(Num(params.exposure, 0.5));
  let drain = Lerp(survival.warmthDrainOpen, survival.warmthDrainBlizzard, exposure);
  if (params.indoors) drain *= survival.warmthDrainIndoorScale;
  const clothing = Clamp01(Num(params.clothing, 0));
  drain *= 1 - clothing * survival.warmthClothingRelief;
  const wet = typeof params.wet === 'number' ? Clamp01(params.wet) : (params.wet ? 1 : 0);
  drain *= 1 + wet * (survival.warmthDrainWetScale - 1);
  if (params.moving) drain *= survival.warmthMovingScale;
  drain *= difficulty.warmthDrainScale || 1;

  const gain = params.nearFire ? survival.warmthGainFire : 0;
  return (gain - drain) * dt;
}

/** 体力变化量。冷会让你怎么歇都歇不回来。 */
export function ComputeStaminaDelta(params) {
  const survival = Config.Survival;
  const dt = Math.max(0, Num(params.dt, 0));
  if (dt <= 0) return 0;

  const warmth = Clamp(Num(params.warmth, survival.maxWarmth), 0, survival.maxWarmth);
  const health = Clamp(Num(params.health, survival.maxHealth), 0, survival.maxHealth);
  const coldFactor = warmth < survival.warmthLowThreshold
    ? Lerp(survival.staminaColdScale, 1, warmth / Math.max(1, survival.warmthLowThreshold))
    : 1;
  const healthFactor = 0.55 + 0.45 * (health / Math.max(1, survival.maxHealth));

  if (params.sprinting) {
    return -survival.staminaDrainRun * (2 - healthFactor) * (2 - coldFactor) * dt;
  }
  if (params.aiming) {
    return -survival.staminaDrainAim * dt;
  }
  const idle = Num(params.idleSeconds, 0);
  if (idle < survival.staminaRegenDelay) return 0;
  return survival.staminaRegen * coldFactor * healthFactor * dt;
}

/** 失血造成的生命变化量（负数）。止血了就是 0；一边流血一边跑会更快。 */
export function ComputeBleedDelta(params) {
  const survival = Config.Survival;
  const dt = Math.max(0, Num(params.dt, 0));
  if (dt <= 0 || !params.bleeding || params.bandaged) return 0;
  const scale = params.moving ? survival.bleedMovingScale : 1;
  return -survival.bleedPerSecond * scale * dt;
}

/* ================================================================== *
 * 三、伤害与瞄准
 * ================================================================== */

/** 伤害结算。头部倍率高，但这不是奖励爆头的游戏——是让一枪定生死更真实。 */
export function ComputeDamage(params) {
  const multipliers = Config.Combat.HitMultiplier;
  const part = typeof params.part === 'string' && multipliers[params.part] ? params.part : 'Torso';
  const multiplier = multipliers[part];

  const base = Math.max(0, Num(params.baseDamage, 0));
  const distance = Math.max(0, Num(params.distance, 0));
  const falloffStart = Num(params.falloffStart, 25);
  const falloffEnd = Num(params.falloffEnd, 90);
  let falloff = 1;
  if (falloffEnd > falloffStart && distance > falloffStart) {
    falloff = Lerp(1, 0.45, Clamp01((distance - falloffStart) / (falloffEnd - falloffStart)));
  }
  const armor = Clamp01(Num(params.armor, 0));
  const amount = Math.max(0, base * multiplier * falloff * (1 - armor * 0.6));
  const currentHealth = Num(params.currentHealth, Config.Survival.maxHealth);

  return {
    amount: amount,
    lethal: amount >= currentHealth,
    part: part,
    multiplier: multiplier * falloff,
  };
}

/**
 * 瞄准散布与晃动。
 * 端枪 1.2 秒内稳下来，但 4.5 秒后手会抖（端不住）；低血、缺体力、低温都放大晃动。
 * 靠墙架枪是唯一能把散布压到能打的手段——这就是「找掩体」的机制理由。
 */
export function ComputeAimSway(params) {
  const aim = Config.Combat.Aim;
  const survival = Config.Survival;

  let spread = aim.spreadStand;
  if (params.prone) spread *= aim.proneScale;
  else if (params.crouched) spread *= aim.crouchScale;
  if (params.braced) spread *= aim.bracedScale;
  if (params.moving) spread *= aim.movingScale;

  const hold = Math.max(0, Num(params.holdSeconds, 0));
  const settle = Lerp(1, aim.settleFloor, SmoothStep01(hold / Math.max(0.01, aim.settleSeconds)));
  let fatigue = 1;
  if (hold > aim.holdFatigueSeconds) {
    fatigue = Lerp(1, aim.holdFatigueScale, Clamp01((hold - aim.holdFatigueSeconds) / aim.holdFatigueSeconds));
  }
  spread *= settle * fatigue;

  const stamina = Clamp(Num(params.stamina, survival.maxStamina), 0, survival.maxStamina) / Math.max(1, survival.maxStamina);
  spread *= 1 + (1 - stamina) * aim.staminaPenalty;

  const health = Clamp(Num(params.health, survival.maxHealth), 0, survival.maxHealth) / Math.max(1, survival.maxHealth);
  spread *= 1 + (1 - health) * aim.injuryPenalty;

  const warmth = Clamp(Num(params.warmth, survival.maxWarmth), 0, survival.maxWarmth);
  let shiver = 0;
  if (warmth < survival.warmthLowThreshold) {
    shiver = 1 - warmth / Math.max(1, survival.warmthLowThreshold);
    spread *= 1 + shiver * aim.coldPenalty;
  }

  const time = Num(params.time, 0);
  const amplitude = aim.swayAmplitude * settle * (1 + (1 - stamina) * 0.9 + shiver * 1.2) * (params.braced ? 0.4 : 1);
  const swayX = Math.sin(time * aim.swayRateA * 6.2831853) * amplitude;
  const swayY = Math.sin(time * aim.swayRateB * 6.2831853 + 1.7) * amplitude * 0.72;

  return { spread: Math.max(0.0004, spread), swayX: swayX, swayY: swayY };
}

/* ================================================================== *
 * 四、合成（纯函数，不改传入的 inventory）
 * ================================================================== */

export function ResolveCraft(recipeId, inventory, recipes, context) {
  const table = recipes || Config.Survival.Recipes;
  const recipe = table ? table[recipeId] : null;
  const empty = { ok: false, reason: 'NoRecipe', consumed: [], produced: null };
  if (!recipe) return empty;
  if (recipe.requiresFire && !(context && context.nearFire)) {
    return { ok: false, reason: 'NeedFire', consumed: [], produced: null };
  }

  const counts = {};
  const list = inventory || [];
  for (let i = 0; i < list.length; i += 1) {
    const entry = list[i];
    if (!entry || !entry.id) continue;
    counts[entry.id] = (counts[entry.id] || 0) + Num(entry.count, 0);
  }

  const consumed = [];
  const inputs = recipe.inputs || [];
  for (let i = 0; i < inputs.length; i += 1) {
    const need = inputs[i];
    const have = counts[need.id] || 0;
    if (have < need.count) {
      return { ok: false, reason: 'Missing', consumed: [], produced: null, missing: { id: need.id, count: need.count - have } };
    }
    consumed.push({ id: need.id, count: need.count });
  }

  return {
    ok: true,
    reason: 'Ok',
    consumed: consumed,
    produced: { id: recipe.output.id, count: recipe.output.count },
    seconds: Num(recipe.seconds, Config.Survival.craftSeconds),
    noiseRadius: Num(recipe.noiseRadius, Config.Stealth.Noise.craft),
  };
}

/* ================================================================== *
 * 五、任务状态机（不可变风格）
 * ================================================================== */

const ObjectiveState = Object.freeze({
  Pending: 'Pending', Active: 'Active', Done: 'Done', Failed: 'Failed',
});

export const MissionStatus = Object.freeze({
  Idle: 'Idle', Playing: 'Playing', ChapterComplete: 'ChapterComplete',
  GameOver: 'GameOver', Ended: 'Ended',
});

function RequiredFor(objective) {
  const target = objective.target || {};
  if (objective.kind === 'Collect') return Math.max(1, Num(target.count, 1));
  if (objective.kind === 'Survive') return Math.max(1, Num(target.seconds, 30));
  if (objective.kind === 'Avoid') return Math.max(1, Num(target.count, 1));
  return 1;
}

function MakeObjective(def) {
  return {
    id: def.id,
    text: def.text || '',
    hint: def.hint === undefined ? null : def.hint,
    optional: !!def.optional,
    kind: def.kind || 'Reach',
    target: def.target ? CloneMap(def.target) : {},
    beatOnStart: def.beatOnStart === undefined ? null : def.beatOnStart,
    beatOnComplete: def.beatOnComplete === undefined ? null : def.beatOnComplete,
    failOn: CloneArray(def.failOn),
    failText: def.failText === undefined ? null : def.failText,
    state: ObjectiveState.Pending,
    progress: 0,
    required: RequiredFor(def),
    elapsed: 0,
  };
}

/** 全新的任务状态。纯数据，可 JSON 序列化。 */
export function CreateMissionState() {
  return {
    chapterId: null,
    chapterIndex: 0,
    chapterTitle: '',
    chapterSubtitle: '',
    nextChapterId: null,
    objectives: [],
    activeObjectiveId: null,
    beatsDone: [],
    flags: {},
    choices: {},
    ledger: [],
    tally: {},
    elapsed: 0,
    playSeconds: 0,
    status: MissionStatus.Idle,
    gameOverReason: null,
    endingId: null,
    effects: [],
  };
}

function CopyState(state) {
  const copy = {
    chapterId: state.chapterId,
    chapterIndex: state.chapterIndex,
    chapterTitle: state.chapterTitle,
    chapterSubtitle: state.chapterSubtitle,
    nextChapterId: state.nextChapterId,
    objectives: state.objectives.map((o) => ({ ...o, target: CloneMap(o.target), failOn: CloneArray(o.failOn) })),
    activeObjectiveId: state.activeObjectiveId,
    beatsDone: CloneArray(state.beatsDone),
    flags: CloneMap(state.flags),
    choices: CloneMap(state.choices),
    ledger: CloneArray(state.ledger),
    tally: CloneMap(state.tally),
    elapsed: state.elapsed,
    playSeconds: state.playSeconds,
    status: state.status,
    gameOverReason: state.gameOverReason,
    endingId: state.endingId,
    effects: [],
  };
  /* 存档还原时挂上的附加信息，跨事件保留，供 Boot 读取 */
  if (state.restore) copy.restore = state.restore;
  return copy;
}

function FindObjective(state, objectiveId) {
  for (let i = 0; i < state.objectives.length; i += 1) {
    if (state.objectives[i].id === objectiveId) return state.objectives[i];
  }
  return null;
}

function PushEffect(state, kind, payload) {
  state.effects.push({ kind: kind, payload: payload });
}

function ActivateObjective(state, objective) {
  if (!objective || objective.state === ObjectiveState.Done || objective.state === ObjectiveState.Failed) return;
  objective.state = ObjectiveState.Active;
  state.activeObjectiveId = objective.id;
  PushEffect(state, 'ObjectiveChanged', {
    objectiveId: objective.id, text: objective.text, state: 'New', optional: objective.optional,
  });
  if (objective.beatOnStart) PushEffect(state, 'StoryBeat', { id: objective.beatOnStart, chapterId: state.chapterId });
}

function ActivateNext(state) {
  for (let i = 0; i < state.objectives.length; i += 1) {
    const objective = state.objectives[i];
    if (objective.state === ObjectiveState.Pending && !objective.optional) {
      ActivateObjective(state, objective);
      return true;
    }
  }
  /* 主线走完了，剩下的可选目标不阻塞推进 */
  state.activeObjectiveId = null;
  return false;
}

function AllRequiredDone(state) {
  if (state.objectives.length === 0) return false;
  for (let i = 0; i < state.objectives.length; i += 1) {
    const objective = state.objectives[i];
    if (objective.optional) continue;
    if (objective.state !== ObjectiveState.Done) return false;
  }
  return true;
}

function CheckChapterComplete(state) {
  if (state.status !== MissionStatus.Playing) return;
  if (!AllRequiredDone(state)) return;
  state.status = MissionStatus.ChapterComplete;
  PushEffect(state, 'ChapterChanged', {
    chapterId: state.chapterId,
    index: state.chapterIndex,
    title: state.chapterTitle,
    subtitle: state.chapterSubtitle,
    complete: true,
    nextChapterId: state.nextChapterId,
  });
}

function CompleteObjectiveIn(state, objective) {
  if (!objective || objective.state === ObjectiveState.Done) return false;
  objective.state = ObjectiveState.Done;
  objective.progress = objective.required;
  PushEffect(state, 'ObjectiveChanged', {
    objectiveId: objective.id, text: objective.text, state: 'Done', optional: objective.optional,
  });
  if (objective.beatOnComplete) PushEffect(state, 'StoryBeat', { id: objective.beatOnComplete, chapterId: state.chapterId });
  if (state.activeObjectiveId === objective.id) ActivateNext(state);
  CheckChapterComplete(state);
  return true;
}

function FailObjectiveIn(state, objective, reason) {
  if (!objective || objective.state === ObjectiveState.Done || objective.state === ObjectiveState.Failed) return false;
  objective.state = ObjectiveState.Failed;
  PushEffect(state, 'ObjectiveChanged', {
    objectiveId: objective.id, text: objective.failText || objective.text,
    state: 'Failed', optional: objective.optional, reason: reason || 'Unknown',
  });
  if (!objective.optional) {
    state.status = MissionStatus.GameOver;
    state.gameOverReason = reason || 'ObjectiveFailed';
    PushEffect(state, 'GameOver', { reason: state.gameOverReason, chapterId: state.chapterId, allowRetry: true });
  } else if (state.activeObjectiveId === objective.id) {
    ActivateNext(state);
  }
  return true;
}

function TriggerGameOver(state, reason) {
  if (state.status === MissionStatus.GameOver || state.status === MissionStatus.Ended) return;
  state.status = MissionStatus.GameOver;
  state.gameOverReason = reason;
  PushEffect(state, 'GameOver', { reason: reason, chapterId: state.chapterId, allowRetry: true });
}

function ApplyTick(state, dt, snapshot) {
  const step = Math.max(0, Num(dt, 0));
  state.elapsed += step;
  state.playSeconds += step;
  if (state.status !== MissionStatus.Playing) return;

  const snap = snapshot || {};

  if (Num(snap.playerHealth, 100) <= 0) {
    TriggerGameOver(state, 'PlayerDowned');
    return;
  }

  const active = state.activeObjectiveId ? FindObjective(state, state.activeObjectiveId) : null;
  if (!active) return;
  active.elapsed += step;

  /* Survive：熬过去就是胜利 */
  if (active.kind === 'Survive') {
    active.progress = Math.min(active.required, active.progress + step);
    if (active.progress >= active.required) {
      CompleteObjectiveIn(state, active);
      return;
    }
  }

  /* 失败条件 */
  const failOn = active.failOn || [];
  for (let i = 0; i < failOn.length; i += 1) {
    const condition = failOn[i];
    if (condition === 'Detected' && Num(snap.alertLevel, 0) >= 2) {
      FailObjectiveIn(state, active, 'Detected');
      return;
    }
    if (condition === 'CompanionCaptured' && snap.companionMode === 'Captured') {
      FailObjectiveIn(state, active, 'CompanionCaptured');
      return;
    }
    if (condition === 'Timeout') {
      const limit = Num(active.target.seconds, 0);
      if (limit > 0 && active.elapsed > limit) {
        FailObjectiveIn(state, active, 'Timeout');
        return;
      }
    }
  }
}

/**
 * 任务事件归约器：返回全新 state，不改传入的 state。
 * event = { kind, ... }，kind 见下面的 switch。
 * 产生的副作用一律以 state.effects（RulesEffect[]）表达，由外壳派发。
 */
export function ApplyMissionEvent(state, event) {
  const base = state || CreateMissionState();
  const next = CopyState(base);
  if (!event || typeof event.kind !== 'string') return next;

  switch (event.kind) {
    case 'StartChapter': {
      const chapter = event.chapter || {};
      next.chapterId = chapter.id || event.chapterId || null;
      next.chapterIndex = Num(chapter.index, next.chapterIndex + 1);
      next.chapterTitle = chapter.title || '';
      next.chapterSubtitle = chapter.subtitle || '';
      next.nextChapterId = chapter.nextChapterId === undefined ? null : chapter.nextChapterId;
      next.objectives = (chapter.objectives || []).map(MakeObjective);
      next.activeObjectiveId = null;
      next.status = MissionStatus.Playing;
      next.gameOverReason = null;
      PushEffect(next, 'ChapterChanged', {
        chapterId: next.chapterId, index: next.chapterIndex,
        title: next.chapterTitle, subtitle: next.chapterSubtitle, complete: false,
        nextChapterId: next.nextChapterId,
      });
      ActivateNext(next);
      break;
    }

    case 'SetActiveObjective': {
      const objective = FindObjective(next, event.objectiveId);
      if (objective && objective.state !== ObjectiveState.Done && objective.state !== ObjectiveState.Failed) {
        ActivateObjective(next, objective);
      }
      break;
    }

    case 'Progress': {
      const objective = FindObjective(next, event.objectiveId);
      if (objective && objective.state !== ObjectiveState.Done && objective.state !== ObjectiveState.Failed) {
        if (objective.state === ObjectiveState.Pending) ActivateObjective(next, objective);
        objective.progress = Clamp(objective.progress + Num(event.amount, 1), 0, objective.required);
        PushEffect(next, 'ObjectiveChanged', {
          objectiveId: objective.id, text: objective.text, state: 'Updated',
          optional: objective.optional, progress: objective.progress, required: objective.required,
        });
        if (objective.progress >= objective.required) CompleteObjectiveIn(next, objective);
      }
      break;
    }

    case 'CompleteObjective':
      CompleteObjectiveIn(next, FindObjective(next, event.objectiveId));
      break;

    case 'FailObjective':
      FailObjectiveIn(next, FindObjective(next, event.objectiveId), event.reason);
      break;

    case 'MarkBeat': {
      if (event.beatId && next.beatsDone.indexOf(event.beatId) < 0) {
        next.beatsDone.push(event.beatId);
        PushEffect(next, 'StoryBeat', { id: event.beatId, chapterId: next.chapterId });
      }
      break;
    }

    case 'SetFlag':
      if (typeof event.key === 'string') next.flags[event.key] = event.value;
      break;

    case 'RecordChoice':
      if (typeof event.choiceId === 'string') next.choices[event.choiceId] = event.optionId;
      break;

    /* 代价账本：只记录，不计分、不给资源、不影响任何数值奖励（红线三） */
    case 'RecordCost':
      if (typeof event.key === 'string') {
        next.ledger.push({ key: event.key, note: event.note || '', at: next.playSeconds });
        PushEffect(next, 'Toast', { kind: 'Cost', key: event.key, note: event.note || '' });
      }
      break;

    case 'Tally':
      if (typeof event.key === 'string') {
        next.tally[event.key] = Num(next.tally[event.key], 0) + Num(event.amount, 1);
      }
      break;

    case 'Tick':
      ApplyTick(next, event.dt, event.snapshot);
      break;

    case 'AdvanceChapter':
      if (next.nextChapterId) {
        next.status = MissionStatus.Playing;
      } else {
        next.status = MissionStatus.Ended;
        PushEffect(next, 'GameOver', { reason: 'Ended', chapterId: next.chapterId, allowRetry: false });
      }
      break;

    case 'GameOver':
      TriggerGameOver(next, event.reason || 'Unknown');
      break;

    case 'Reset':
      return CreateMissionState();

    default:
      break;
  }

  return next;
}

/* ================================================================== *
 * 六、结算（**绝不计分**）
 * ================================================================== */

/**
 * 结局判定。
 * 硬性纪律：
 *  - 不产生分数、星级、评级、百分比。两个终局选择没有「更优」。
 *  - 平民伤亡、村庄被毁这类条目只出现在 ledger 里，绝不参与判定优劣，
 *    也绝不折算成任何资源、解锁或加成。
 *  - stats 只是中性计数（开了几枪、被发现几次），供玩家自省，不是成绩单。
 */
export function EvaluateEnding(state) {
  const source = state || CreateMissionState();
  const choice = source.choices ? source.choices.ChoiceStationReveal : null;
  const companionLost = !!(source.flags && (source.flags.CompanionLost || source.flags.CompanionCaptured));

  let endingId = 'EndingLetHerWalk';
  if (companionLost) endingId = 'EndingAlone';
  else if (choice === 'OptionRevealStation') endingId = 'EndingRevealStation';
  else if (choice === 'OptionLetHerWalk') endingId = 'EndingLetHerWalk';

  return {
    endingId: endingId,
    ledger: CloneArray(source.ledger),
    stats: CloneMap(source.tally),
  };
}

/* ================================================================== *
 * 七、存档
 * ================================================================== */

export const SaveKey = Config.Save.key;
export const SaveVersion = Config.Save.version;

export function SerializeProgress(state, extra) {
  const source = state || CreateMissionState();
  const bonus = extra || {};
  return {
    version: SaveVersion,
    chapterId: source.chapterId,
    objectiveId: source.activeObjectiveId,
    beatsDone: CloneArray(source.beatsDone),
    flags: CloneMap(source.flags),
    choices: CloneMap(source.choices),
    stats: bonus.stats || { health: Config.Survival.maxHealth, stamina: Config.Survival.maxStamina, warmth: Config.Survival.maxWarmth, hunger: Config.Survival.maxHunger },
    inventory: CloneArray(bonus.inventory),
    ammo: bonus.ammo || { rifle: 0, pistol: 0, granted: 0 },
    ledger: CloneArray(source.ledger),
    tally: CloneMap(source.tally),
    playSeconds: source.playSeconds,
    savedAt: Num(bonus.savedAt, Date.now()),
  };
}

/** 版本不符 / 结构损坏一律返回 null，绝不抛错（存档坏了不该毁掉这一局）。 */
export function DeserializeProgress(raw) {
  let data = raw;
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw); } catch (error) { return null; }
  }
  if (!data || typeof data !== 'object') return null;
  if (Num(data.version, -1) !== SaveVersion) return null;
  if (typeof data.chapterId !== 'string' || data.chapterId.length === 0) return null;

  const state = CreateMissionState();
  state.chapterId = data.chapterId;
  state.activeObjectiveId = typeof data.objectiveId === 'string' ? data.objectiveId : null;
  state.beatsDone = Array.isArray(data.beatsDone) ? data.beatsDone.slice() : [];
  state.flags = data.flags && typeof data.flags === 'object' ? CloneMap(data.flags) : {};
  state.choices = data.choices && typeof data.choices === 'object' ? CloneMap(data.choices) : {};
  state.ledger = Array.isArray(data.ledger) ? data.ledger.slice() : [];
  state.tally = data.tally && typeof data.tally === 'object' ? CloneMap(data.tally) : {};
  state.playSeconds = Num(data.playSeconds, 0);
  state.status = MissionStatus.Idle;
  /* 给 Boot 的附加还原信息（不是任务状态的一部分） */
  state.restore = {
    stats: data.stats || null,
    inventory: Array.isArray(data.inventory) ? data.inventory.slice() : [],
    ammo: data.ammo || { rifle: 0, pistol: 0, granted: 0 },
    savedAt: Num(data.savedAt, 0),
  };
  return state;
}

/* ================================================================== *
 * 八、有状态外壳 —— 即契约里的 ctx.rules
 * ================================================================== */

export function CreateRules(options) {
  const settings = options || {};
  const chapterTable = {};
  const chapterList = settings.chapters || [];
  for (let i = 0; i < chapterList.length; i += 1) {
    if (chapterList[i] && chapterList[i].id) chapterTable[chapterList[i].id] = chapterList[i];
  }

  let state = CreateMissionState();
  let pendingEffects = [];
  let accumulator = 0;
  const stepSeconds = Num(Config.Loop.rulesStepSeconds, 0.25);

  function Apply(event) {
    state = ApplyMissionEvent(state, event);
    if (state.effects.length > 0) {
      for (let i = 0; i < state.effects.length; i += 1) pendingEffects.push(state.effects[i]);
    }
    return state;
  }

  function DrainEffects() {
    if (pendingEffects.length === 0) return [];
    const out = pendingEffects;
    pendingEffects = [];
    return out;
  }

  const rules = {
    /* —— 章节与目标 —— */
    StartChapter(chapterId, chapterData) {
      const chapter = chapterData || chapterTable[chapterId] || { id: chapterId, objectives: [] };
      Apply({ kind: 'StartChapter', chapterId: chapterId, chapter: chapter });
      accumulator = 0;
    },
    GetChapterId() { return state.chapterId; },
    GetChapterIndex() { return state.chapterIndex; },
    GetObjectives() { return state.objectives.map((o) => ({ ...o })); },
    GetActiveObjective() {
      const objective = state.activeObjectiveId ? FindObjective(state, state.activeObjectiveId) : null;
      return objective ? { ...objective } : null;
    },
    SetActiveObjective(objectiveId) {
      Apply({ kind: 'SetActiveObjective', objectiveId: objectiveId });
      return state.activeObjectiveId === objectiveId;
    },
    ReportProgress(objectiveId, amount) {
      Apply({ kind: 'Progress', objectiveId: objectiveId, amount: amount });
      const objective = FindObjective(state, objectiveId);
      return objective ? { ...objective } : null;
    },
    CompleteObjective(objectiveId) {
      const before = FindObjective(state, objectiveId);
      if (!before || before.state === ObjectiveState.Done) return false;
      Apply({ kind: 'CompleteObjective', objectiveId: objectiveId });
      const after = FindObjective(state, objectiveId);
      return !!after && after.state === ObjectiveState.Done;
    },
    FailObjective(objectiveId, reason) {
      const before = FindObjective(state, objectiveId);
      if (!before || before.state === ObjectiveState.Failed || before.state === ObjectiveState.Done) return false;
      Apply({ kind: 'FailObjective', objectiveId: objectiveId, reason: reason });
      const after = FindObjective(state, objectiveId);
      return !!after && after.state === ObjectiveState.Failed;
    },
    IsObjectiveDone(objectiveId) {
      const objective = FindObjective(state, objectiveId);
      return !!objective && objective.state === ObjectiveState.Done;
    },
    IsChapterComplete() {
      return state.status === MissionStatus.ChapterComplete || state.status === MissionStatus.Ended;
    },
    AdvanceChapter() {
      const nextId = state.nextChapterId;
      Apply({ kind: 'AdvanceChapter' });
      if (!nextId) return null;
      const chapter = chapterTable[nextId];
      if (chapter) rules.StartChapter(nextId, chapter);
      return nextId;
    },

    /* —— 节拍与旗标 —— */
    MarkBeat(beatId) {
      if (state.beatsDone.indexOf(beatId) >= 0) return false;
      Apply({ kind: 'MarkBeat', beatId: beatId });
      return true;
    },
    IsBeatDone(beatId) { return state.beatsDone.indexOf(beatId) >= 0; },
    SetFlag(key, value) { Apply({ kind: 'SetFlag', key: key, value: value }); },
    GetFlag(key, fallback) {
      return Object.prototype.hasOwnProperty.call(state.flags, key) ? state.flags[key] : fallback;
    },
    RecordChoice(choiceId, optionId) { Apply({ kind: 'RecordChoice', choiceId: choiceId, optionId: optionId }); },
    GetChoice(choiceId) {
      return Object.prototype.hasOwnProperty.call(state.choices, choiceId) ? state.choices[choiceId] : null;
    },

    /* —— 代价记录（永不计分、永不转化为奖励） —— */
    RecordCost(entryKey, note) { Apply({ kind: 'RecordCost', key: entryKey, note: note }); },
    GetLedger() { return state.ledger.map((entry) => ({ ...entry })); },

    /* —— 统计（中性计数，不是成绩） —— */
    Tally(key, amount) { Apply({ kind: 'Tally', key: key, amount: amount === undefined ? 1 : amount }); },
    GetStats() { return CloneMap(state.tally); },

    /** 每 rulesStepSeconds 推进一次；返回本次产生的 RulesEffect 列表。 */
    Update(dt, snapshot) {
      accumulator += Math.max(0, Num(dt, 0));
      if (accumulator >= stepSeconds) {
        const step = accumulator;
        accumulator = 0;
        Apply({ kind: 'Tick', dt: step, snapshot: snapshot });
      }
      return DrainEffects();
    },

    Reset() {
      state = CreateMissionState();
      pendingEffects = [];
      accumulator = 0;
    },

    /* —— 纯数学转发：EnemyAi / Combat / Survival / Hud 统一从 ctx.rules 取 —— */
    ComputeDetection: ComputeDetection,
    ComputeNoiseAudibility: ComputeNoiseAudibility,
    ScoreInvestigation: ScoreInvestigation,
    ComputeWarmthDelta: ComputeWarmthDelta,
    ComputeStaminaDelta: ComputeStaminaDelta,
    ComputeBleedDelta: ComputeBleedDelta,
    ComputeDamage: ComputeDamage,
    ComputeAimSway: ComputeAimSway,
    ResolveCraft: ResolveCraft,

    /* —— 结算与存档 —— */
    EvaluateEnding() { return EvaluateEnding(state); },
    Serialize(extra) { return SerializeProgress(state, extra); },
    Restore(raw) {
      const restored = DeserializeProgress(raw);
      if (!restored) return false;
      state = restored;
      pendingEffects = [];
      accumulator = 0;
      return true;
    },
    GetStatus() { return state.status; },
    GetPlaySeconds() { return state.playSeconds; },
  };

  /* state 每次事件后都是新对象，用 getter 保证外部永远读到最新的一份 */
  Object.defineProperty(rules, 'state', {
    enumerable: true,
    get() { return state; },
  });

  return rules;
}

export default CreateRules;
