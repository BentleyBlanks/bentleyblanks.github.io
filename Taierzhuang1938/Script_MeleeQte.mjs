// 《滕县 一九三八》白刃 QTE 规则控制器 —— 纯规则，**不许 import three**。
//
// 这里故意不认识 Actor、HUD、Viewmodel：三者只读 View()/ViewPose()。正片 AI 的
//刺刀命中与测试章木桩都调用 BeginBlock；处决提示与 F 键都调用 ExecutionCandidate /
// TryBeginExecution。这样六套输入、判定和伤害只有一份，不会出现“训练场能按、正片不认”。

import {
  MELEE_QTE,
  MELEE_BLOCK_PATTERNS,
  MELEE_EXECUTION_PATTERNS,
} from "./Data_MeleeQte.mjs";

const Clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const WrapPi = (angle) => {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
};

function PatternAt(list, index) {
  const count = list.length;
  const safe = ((Number(index) || 0) % count + count) % count;
  return list[safe];
}

function DistanceXZ(a, b) {
  return Math.hypot((a?.x || 0) - (b?.x || 0), (a?.z || 0) - (b?.z || 0));
}

function KeyLabel(code) {
  return String(code || "").replace(/^Key/, "").replace(/^Digit/, "");
}

/**
 * host 是装配层注入的窄接口：
 *   Player() / Soldiers() / Time()
 *   CanBlock() / CanExecute(soldier)
 *   DamagePlayer(amount, attacker, kind) / KillSoldier(soldier, kind)
 *   Play(name, attacker) / Focus(attacker, realDt)
 */
export class MeleeQteDirector {
  constructor(host = {}, { assist = "tap" } = {}) {
    this.host = host;
    this.active = null;
    this.serial = 0;
    this.nextBlockPattern = 0;
    this.nextExecutionPattern = 0;
    this.assist = ["tap", "hold", "auto"].includes(assist) ? assist : "tap";
    this.stats = {
      blockStarted: 0,
      blockSuccess: 0,
      blockFail: 0,
      executionStarted: 0,
      executionSuccess: 0,
      executionFail: 0,
    };
    this.trainingCooldown = new Map();
  }

  get Active() { return !!this.active; }

  get TimeScale() {
    if (!this.active) return 1;
    return this.active.phase === "input" ? MELEE_QTE.timeScale : MELEE_QTE.resolveTimeScale;
  }

  SetAssist(mode = "tap") {
    if (["tap", "hold", "auto"].includes(mode)) this.assist = mode;
    return this.assist;
  }

  Player() { return this.host.Player?.() || this.host.player || null; }
  Soldiers() { return this.host.Soldiers?.() || this.host.soldiers || []; }
  Time() { return Number(this.host.Time?.() ?? 0); }

  CanBlock() { return this.host.CanBlock ? !!this.host.CanBlock() : true; }
  CanExecute(soldier) { return this.host.CanExecute ? !!this.host.CanExecute(soldier) : true; }

  BeginBlock(attacker, patternOverride = null) {
    if (this.active || !attacker?.alive || attacker.side !== "ija" || !this.Player()?.Alive) return false;
    if (!this.CanBlock()) return false;
    const forced = patternOverride ?? attacker.qteTraining?.pattern;
    const patternIndex = forced == null ? this.nextBlockPattern++ : forced;
    const pattern = PatternAt(MELEE_BLOCK_PATTERNS, patternIndex);
    this.active = this.MakeState("block", pattern, attacker);
    this.stats.blockStarted += 1;
    attacker.meleeQte = this.ActorState(this.active);
    this.host.Play?.("bayonetRush", attacker);
    return true;
  }

  ExecutionCandidate() {
    if (this.active || !this.Player()?.Alive || !this.CanExecute()) return null;
    const player = this.Player();
    let best = null;
    let bestDistance = Infinity;
    const now = this.Time();
    for (const soldier of this.Soldiers()) {
      if (!soldier?.alive || soldier.side !== "ija" || soldier.meleeQte) continue;
      const distance = DistanceXZ(player.position, soldier.position);
      if (distance > MELEE_QTE.executionReachM || distance >= bestDistance) continue;
      const dx = soldier.position.x - player.position.x;
      const dz = soldier.position.z - player.position.z;
      const inv = 1 / Math.max(0.001, distance);
      const forwardX = -Math.sin(player.yaw || 0);
      const forwardZ = -Math.cos(player.yaw || 0);
      if ((forwardX * dx + forwardZ * dz) * inv < MELEE_QTE.executionFacingDot) continue;
      const special = soldier.qteTraining?.kind === "execution"
        || soldier.executionReadyUntil > now
        || soldier.health <= 35
        || soldier.suppression >= 0.80;
      if (!special || !this.CanExecute(soldier)) continue;
      best = soldier;
      bestDistance = distance;
    }
    return best;
  }

  TryBeginExecution(patternOverride = null, forcedTarget = null) {
    if (this.active) return false;
    const attacker = forcedTarget || this.ExecutionCandidate();
    if (!attacker) return false;
    const forced = patternOverride ?? attacker.qteTraining?.pattern;
    const patternIndex = forced == null ? this.nextExecutionPattern++ : forced;
    const pattern = PatternAt(MELEE_EXECUTION_PATTERNS, patternIndex);
    this.active = this.MakeState("execution", pattern, attacker);
    this.stats.executionStarted += 1;
    attacker.meleeQte = this.ActorState(this.active);
    this.host.Play?.("executionStart", attacker);
    return true;
  }

  MakeState(kind, pattern, attacker) {
    return {
      serial: ++this.serial,
      kind,
      pattern,
      attacker,
      phase: "input",
      elapsed: 0,
      resolveElapsed: 0,
      progress: 0,
      index: 0,
      success: null,
      killed: false,
      held: new Set(),
      holdTime: 0,
      assistAccumulator: 0,
      pulse: 0,
      wrongPulse: 0,
    };
  }

  AllowedCodes(state = this.active) {
    if (!state) return [];
    const pattern = state.pattern;
    if (pattern.input === "alternate") return pattern.keys;
    if (pattern.input === "sequence") return pattern.sequence;
    return [pattern.key];
  }

  HandleInput(code, down = true, repeat = false) {
    const state = this.active;
    if (!state || state.phase !== "input") return false;
    // QTE 接管时这四个键都不再透给走路、挥刀或交互。错误键会给反馈，但不会
    // 把序列整段清零；短时间窗口已经足够惩罚，不再额外制造“猜错一次必败”。
    const qteCodes = ["KeyA", "KeyD", "KeyV", "KeyF"];
    if (!qteCodes.includes(code)) return false;
    if (down) state.held.add(code);
    else state.held.delete(code);
    if (repeat) return true;

    const pattern = state.pattern;
    if (pattern.input === "holdRelease") {
      if (code !== pattern.key) { this.Wrong(state); return true; }
      if (down) state.holdTime = Math.max(0, state.holdTime);
      else if (state.holdTime >= pattern.holdS) this.Succeed(state);
      else this.Wrong(state);
      return true;
    }
    if (!down) return true;

    if (pattern.input === "mash") {
      if (code === pattern.key) this.Advance(state, 1 / pattern.target);
      else this.Wrong(state);
      return true;
    }
    if (pattern.input === "alternate") {
      const expected = pattern.keys[state.index % pattern.keys.length];
      if (code === expected) {
        state.index += 1;
        this.Advance(state, 1 / pattern.target);
      } else this.Wrong(state);
      return true;
    }
    if (pattern.input === "sequence") {
      const expected = pattern.sequence[state.index];
      if (code === expected) {
        state.index += 1;
        this.Advance(state, 1 / pattern.sequence.length);
      } else this.Wrong(state);
      return true;
    }
    if (pattern.input === "timed") {
      const normalized = Clamp01(state.elapsed / pattern.windowS);
      if (code === pattern.key && normalized >= pattern.sweetStart && normalized <= pattern.sweetEnd) {
        state.progress = 1;
        state.pulse += 1;
        this.Succeed(state);
      } else this.Wrong(state);
      return true;
    }
    return true;
  }

  Advance(state, amount) {
    state.progress = Clamp01(state.progress + amount);
    state.pulse += 1;
    if (state.progress >= 0.999) this.Succeed(state);
  }

  Wrong(state) {
    state.wrongPulse += 1;
    state.progress = Math.max(0, state.progress - 0.08);
  }

  Succeed(state) {
    if (!state || state.phase !== "input") return;
    state.success = true;
    state.phase = "resolve";
    state.resolveElapsed = 0;
    if (state.kind === "block") {
      state.attacker.executionReadyUntil = this.Time() + MELEE_QTE.executionReadyS;
      state.attacker.suppression = Math.max(state.attacker.suppression || 0, 0.82);
      this.stats.blockSuccess += 1;
      this.host.Play?.("blockSuccess", state.attacker);
    } else {
      this.stats.executionSuccess += 1;
      this.host.Play?.("executionSuccess", state.attacker);
    }
  }

  Fail(state) {
    if (!state || state.phase !== "input") return;
    state.success = false;
    state.phase = "resolve";
    state.resolveElapsed = 0;
    if (state.kind === "block") {
      this.stats.blockFail += 1;
      this.host.DamagePlayer?.(MELEE_QTE.blockFailDamage, state.attacker, "blockFail");
      this.host.Play?.("blockFail", state.attacker);
    } else {
      this.stats.executionFail += 1;
      this.host.DamagePlayer?.(MELEE_QTE.executionFailDamage, state.attacker, "executionFail");
      this.host.Play?.("executionFail", state.attacker);
    }
  }

  Update(realDt) {
    const step = Math.max(0, Math.min(0.1, Number(realDt) || 0));
    this.TickTrainingCooldown(step);
    if (!this.active) {
      this.TryTrainingBlock();
      return;
    }
    const state = this.active;
    if (!state.attacker?.alive && !(state.kind === "execution" && state.killed)) {
      this.Cancel("targetLost");
      return;
    }
    this.host.Focus?.(state.attacker, step);
    state.pulse = Math.max(0, state.pulse - step * 3.5);
    state.wrongPulse = Math.max(0, state.wrongPulse - step * 4.5);

    if (state.phase === "input") {
      state.elapsed += step;
      const pattern = state.pattern;
      if (pattern.input === "holdRelease" && state.held.has(pattern.key)) {
        state.holdTime += step;
        state.progress = Clamp01(state.holdTime / pattern.holdS);
      }
      this.StepAssist(state, step);
      if (state.phase === "input" && state.elapsed >= pattern.windowS) this.Fail(state);
    } else {
      state.resolveElapsed += step;
      if (state.kind === "execution" && state.success && !state.killed
          && state.resolveElapsed >= MELEE_QTE.executionKillAt) {
        state.killed = true;
        this.host.KillSoldier?.(state.attacker, state.pattern.id);
      }
      const resolveS = state.kind === "execution"
        ? Math.max(MELEE_QTE.executionResolveS, state.pattern.minResolveS || 0)
        : MELEE_QTE.blockResolveS;
      if (state.resolveElapsed >= resolveS) this.Finish(state);
    }
    if (this.active === state && state.attacker) state.attacker.meleeQte = this.ActorState(state);
  }

  StepAssist(state, dt) {
    const pattern = state.pattern;
    if (this.assist === "auto") {
      state.assistAccumulator += dt;
      if (pattern.input === "timed") {
        const normalized = state.elapsed / pattern.windowS;
        if (normalized >= (pattern.sweetStart + pattern.sweetEnd) * 0.5) this.Succeed(state);
      } else if (pattern.input === "holdRelease") {
        state.holdTime += dt * 0.65;
        state.progress = Clamp01(state.holdTime / pattern.holdS);
        if (state.holdTime >= pattern.holdS) this.Succeed(state);
      } else if (state.assistAccumulator >= 0.28) {
        state.assistAccumulator = 0;
        state.index += 1;
        this.Advance(state, 1 / Math.max(1, pattern.target || pattern.sequence?.length || 1));
      }
      return;
    }
    if (this.assist !== "hold") return;
    const expected = pattern.input === "alternate" ? pattern.keys[state.index % pattern.keys.length]
      : pattern.input === "sequence" ? pattern.sequence[state.index]
      : pattern.key;
    if (!expected || !state.held.has(expected) || pattern.input === "timed" || pattern.input === "holdRelease") return;
    state.assistAccumulator += dt;
    if (state.assistAccumulator >= 0.22) {
      state.assistAccumulator = 0;
      state.index += 1;
      this.Advance(state, 1 / Math.max(1, pattern.target || pattern.sequence?.length || 1));
    }
  }

  TickTrainingCooldown(dt) {
    for (const [id, value] of this.trainingCooldown) {
      if (value <= dt) this.trainingCooldown.delete(id);
      else this.trainingCooldown.set(id, value - dt);
    }
  }

  TryTrainingBlock() {
    const player = this.Player();
    if (!player?.Alive || !this.CanBlock()) return false;
    let best = null;
    let distance = Infinity;
    for (const soldier of this.Soldiers()) {
      if (!soldier?.alive || soldier.qteTraining?.kind !== "block" || this.trainingCooldown.has(soldier.id)) continue;
      const d = DistanceXZ(player.position, soldier.position);
      if (d <= MELEE_QTE.blockReachM + 0.35 && d < distance) { best = soldier; distance = d; }
    }
    return best ? this.BeginBlock(best, best.qteTraining.pattern) : false;
  }

  Finish(state) {
    if (state.attacker) {
      state.attacker.meleeQte = null;
      if (state.attacker.qteTraining) this.trainingCooldown.set(state.attacker.id, MELEE_QTE.trainingResetS);
    }
    if (this.active === state) this.active = null;
  }

  Cancel(reason = "cancelled") {
    if (this.active?.attacker) this.active.attacker.meleeQte = null;
    const hadActive = !!this.active;
    this.active = null;
    return hadActive ? reason : false;
  }

  ActorState(state = this.active) {
    if (!state) return null;
    const resolveT = state.phase === "resolve"
      ? Clamp01(state.resolveElapsed / (state.kind === "execution" ? MELEE_QTE.executionResolveS : MELEE_QTE.blockResolveS))
      : 0;
    return {
      kind: state.kind,
      style: state.pattern.style,
      phase: state.phase,
      progress: state.progress,
      inputT: Clamp01(state.elapsed / state.pattern.windowS),
      resolveT,
      success: state.success,
      pulse: state.pulse,
      wrongPulse: state.wrongPulse,
    };
  }

  ViewPose() { return this.ActorState(); }

  View() {
    const state = this.active;
    if (!state) return null;
    const pattern = state.pattern;
    const expectedCode = pattern.input === "alternate" ? pattern.keys[state.index % pattern.keys.length]
      : pattern.input === "sequence" ? pattern.sequence[state.index]
      : pattern.key;
    const labels = pattern.keyLabels || [pattern.keyLabel || KeyLabel(pattern.key)];
    return {
      serial: state.serial,
      kind: state.kind,
      label: pattern.label,
      prompt: pattern.prompt,
      input: pattern.input,
      keys: labels,
      expected: KeyLabel(expectedCode),
      index: state.index,
      progress: state.progress,
      timeLeft: Math.max(0, pattern.windowS - state.elapsed),
      timeT: 1 - Clamp01(state.elapsed / pattern.windowS),
      sweetStart: pattern.sweetStart ?? null,
      sweetEnd: pattern.sweetEnd ?? null,
      holdT: pattern.holdS ? Clamp01(state.holdTime / pattern.holdS) : 0,
      phase: state.phase,
      success: state.success,
      pulse: state.pulse,
      wrongPulse: state.wrongPulse,
      assist: this.assist,
    };
  }

  State() {
    return {
      active: this.View(),
      assist: this.assist,
      timeScale: this.TimeScale,
      stats: { ...this.stats },
      candidateId: this.ExecutionCandidate()?.id ?? null,
    };
  }

  MakeExecutable(soldier = null) {
    const target = soldier || this.Soldiers().find((entry) => entry?.alive && entry.side === "ija");
    if (!target) return false;
    target.executionReadyUntil = this.Time() + MELEE_QTE.executionReadyS;
    target.suppression = Math.max(target.suppression || 0, 0.82);
    return target;
  }
}

export default MeleeQteDirector;
