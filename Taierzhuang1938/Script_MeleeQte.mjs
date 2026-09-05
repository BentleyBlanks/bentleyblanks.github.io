// 两种僵持共用 F 连按进度。纯规则，不负责伤害或自动处决。
import { MELEE_QTE_RULES as Q } from "./Data_MeleeCombat.mjs";
const Clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export class MeleeQteDirector {
  constructor(host = {}, { assist = "tap" } = {}) {
    this.host = host; this.active = null; this.serial = 0; this.SetAssist(assist);
  }
  get Active() { return !!this.active; }
  get TimeScale() { return 1; }
  SetAssist(mode) { this.assist = ["tap", "hold", "auto"].includes(mode) ? mode : "tap"; return this.assist; }
  Begin(kind, attacker, context = {}) {
    if (this.Active || !["standing", "ground"].includes(kind) || !attacker) return false;
    const stamina = Clamp(context.stamina ?? 1, 0, 1);
    this.active = { kind, attacker, serial: ++this.serial, phase: "input", t: 0,
      resolveT: 0, progress: kind === "ground" ? Q.groundStart : Q.standingStart,
      gain: Q.gainPerPress * (0.82 + stamina * 0.18),
      decay: Q.decayPerS * Clamp(context.strength ?? 1, 0.8, 1.25),
      lastPress: -1, credit: 1, held: false, accepted: 0, rejected: 0, pulse: 0, success: null,
      reason: context.reason || "contact", advantage: !!context.parried,
    };
    if (context.parried) this.active.progress += 0.06;
    return true;
  }
  Press(down, repeat = false) {
    const a = this.active;
    if (!a) return false;
    if (!down) { a.held = false; return true; }
    if (a.held || repeat) return true;
    a.held = true; this.Advance(); return true;
  }
  Advance() {
    const a = this.active;
    if (!a || a.phase !== "input") return;
    const weight = Math.min(1, a.credit);
    if (weight < 1e-6) { a.rejected++; return; }
    a.credit -= weight; a.lastPress = a.t; a.accepted += weight; a.rejected += 1 - weight; a.pulse = weight;
    a.progress = Clamp(a.progress + a.gain * weight, 0, 1);
    if (a.progress >= 1) this.Resolve(true);
  }
  Resolve(success) {
    const a = this.active;
    if (!a || a.phase !== "input") return;
    a.phase = "resolve"; a.success = success; a.resolveT = 0; this.host.Resolve?.(a);
  }
  Update(dt) {
    const a = this.active;
    if (!a) return;
    a.pulse = Math.max(0, a.pulse - dt * 5);
    if (a.phase === "resolve") {
      a.resolveT += dt;
      if (a.resolveT >= Q.resolveS) { this.active = null; this.host.Finish?.(a); }
      return;
    }
    a.t += dt; a.credit = Math.min(1, a.credit + dt * Q.maxRate);
    if (this.assist === "auto" || (this.assist === "hold" && a.held)) {
      if (a.t - a.lastPress >= 1 / 6) this.Advance();
    }
    if (a.phase !== "input") return;
    a.progress = Math.max(0, a.progress - a.decay * dt);
    if (a.progress <= 0 || a.t >= Q.windowS) this.Resolve(false);
  }
  Cancel() { this.active = null; }
  View() {
    const a = this.active;
    if (!a) return null;
    return { kind: a.kind, serial: a.serial, phase: a.phase, success: a.success,
      label: a.kind === "ground" ? "倒地抵抗" : "武器僵持", prompt: "快速连按 F · 抵抗",
      keys: ["F"], expected: "F", input: "mash", index: a.accepted,
      progress: a.progress, timeT: a.t / Q.windowS, timeLeft: Math.max(0, Q.windowS - a.t),
      resolveT: a.resolveT / Q.resolveS, pulse: a.pulse, assist: this.assist,
      accepted: a.accepted, rejected: a.rejected, reason: a.reason,
    };
  }
  State() { return this.View(); }
}
