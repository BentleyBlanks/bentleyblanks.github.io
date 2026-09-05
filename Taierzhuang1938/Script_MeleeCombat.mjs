// 通用白刃规则：玩家、敌军、友军同一状态机。纯 Node 可跑，宿主负责物理与伤害。
import { MELEE_RULES as R, MELEE_WEAPONS as W, MELEE_QTE_RULES as Q } from "./Data_MeleeCombat.mjs";
import { MeleeQteDirector } from "./Script_MeleeQte.mjs";
const Clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const Alive = (entity) => !!entity && (entity.Alive ?? entity.alive) === true;
const Distance = (a, b) => Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
const Wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
const Facing = (a, b, yaw = a.yaw || 0) => {
  const d = Distance(a, b) || 1;
  return (-Math.sin(yaw) * (b.position.x - a.position.x) - Math.cos(yaw) * (b.position.z - a.position.z)) / d;
};
export class MeleeCombatDirector {
  constructor(host = {}, options = {}) {
    this.host = host; this.time = 0; this.fighters = new Map(); this.events = [];
    this.serial = 0; this.held = new Set(); this.enabled = true;
    this.stats = { attacks: 0, hits: 0, misses: 0, parries: 0, pushes: 0, standing: 0, ground: 0, successes: 0, failures: 0 };
    this.qte = new MeleeQteDirector({ Resolve: (a) => this.ResolveQte(a), Finish: (a) => this.FinishQte(a) }, options);
  }
  Player() { return this.host.Player?.(); }
  Soldiers() { return this.host.Soldiers?.() || []; }
  Weapon(entity) { return this.host.Weapon?.(entity) || entity?.meleeWeapon || null; }
  CanUse() { return Alive(this.Player()) && !!this.Weapon(this.Player()) && this.host.CanUse?.() !== false; }
  CanChangeWeapon() { const f = this.Fighter(this.Player()); return !this.Active && (!f?.weapon || this.Idle(f)); }
  get Active() { return this.qte.Active; }
  get TimeScale() { return 1; }
  get Blocking() { return this.Active || ["fall", "down", "rise"].includes(this.Fighter(this.Player())?.state); }
  Fighter(entity) {
    if (!entity) return null;
    if (!this.fighters.has(entity)) this.fighters.set(entity, {
      entity, state: "idle", t: 0, duration: 0, stamina: 100, poise: 100,
      weapon: this.Weapon(entity), actionSerial: 0, nextThink: this.time + 0.65,
      lastParry: -99, lastHit: -99, move: 0, target: null, pressureBy: null,
      attack: null, hit: false, parryUsed: false,
    });
    return this.fighters.get(entity);
  }
  Log(kind, a = null, b = null, extra = {}) {
    const event = { serial: ++this.serial, time: this.time, kind, actor: a === this.Player() ? "Player" : a?.id, target: b === this.Player() ? "Player" : b?.id, ...extra };
    this.events.push(event); if (this.events.length > 60) this.events.shift();
    this.host.Event?.(event, a, b);
  }
  SetState(f, state, duration = 0, clip = null) {
    f.state = state; f.t = 0; f.duration = duration; f.clip = clip; f.actionSerial++;
    if (state !== "attack") f.attack = null;
  }
  Idle(f) { return f && (f.state === "idle" || f.state === "charge"); }
  AttackDown(entity = this.Player()) {
    const f = this.Fighter(entity);
    if (!Alive(entity) || !f?.weapon || f.state !== "idle" || this.Active && entity === this.Player()) return false;
    this.SetState(f, "charge", R.chargeMaxS, "Charge"); return true;
  }
  AttackUp(entity = this.Player()) {
    const f = this.Fighter(entity);
    if (f?.state !== "charge") return false;
    return this.Attack(entity, f.t >= R.chargeMinS);
  }
  Attack(entity, heavy = false) {
    const f = this.Fighter(entity);
    if (!Alive(entity) || !this.Idle(f) || !W[f.weapon]) return false;
    const spec = W[f.weapon][heavy ? "heavy" : "light"];
    if (f.stamina < spec.cost) { this.SetState(f, "idle"); this.Log("exhausted", entity); return false; }
    f.stamina -= spec.cost;
    const alternate = !heavy && ((f.swingIndex = (f.swingIndex || 0) + 1) % 2 === 0);
    this.SetState(f, "attack", spec.windup + spec.active + spec.recovery, heavy ? "Heavy" : alternate ? "LightAlt" : "Light");
    f.attack = { ...spec, heavy, yaw: entity.yaw || 0, connected: false, lungeDone: 0 };
    f.hit = false; this.stats.attacks++; this.Log(heavy ? "heavy" : "light", entity);
    return true;
  }
  Parry(entity = this.Player()) {
    const f = this.Fighter(entity);
    if (!Alive(entity) || !this.Idle(f) || !W[f.weapon] || f.stamina < R.parryCost) return false;
    f.stamina -= R.parryCost; f.parryUsed = false;
    this.SetState(f, "parry", R.parryWindowS + R.parryRecoveryS, "Parry");
    this.Log("parryStart", entity); return true;
  }
  Opponents(entity) {
    const side = entity === this.Player() ? "nra" : entity.side;
    return [this.Player(), ...this.Soldiers()].filter((target) => Alive(target) && target !== entity
      && (target === this.Player() ? "nra" : target.side) !== side);
  }
  Visible(a, b) { return Math.abs((a.position.y || 0) - (b.position.y || 0)) < 1.35 && this.host.LineClear?.(a, b) !== false; }
  Closest(entity, reach = R.engageM, dot = -1) {
    return this.Opponents(entity).filter((t) => Distance(entity, t) <= reach && Facing(entity, t) >= dot && this.Visible(entity, t))
      .sort((a, b) => Distance(entity, a) - Distance(entity, b))[0] || null;
  }
  PushCandidate(entity = this.Player()) {
    const f = this.Fighter(entity);
    if (!this.Idle(f) || !W[f.weapon] || this.Active) return null;
    return this.Closest(entity, W[f.weapon].pushReach, 0.55);
  }
  Push(entity = this.Player()) {
    const f = this.Fighter(entity), target = this.PushCandidate(entity);
    if (!target || f.stamina < R.pushCost) return false;
    f.stamina -= R.pushCost; f.target = target;
    this.SetState(f, "push", R.pushRecoveryS, "Push"); f.hit = false;
    this.Log("pushStart", entity, target); return true;
  }
  Move(entity, dx, dz) {
    if (this.host.Move) this.host.Move(entity, dx, dz);
    else { entity.position.x += dx; entity.position.z += dz; }
  }
  Repel(entity, from, distance) {
    const d = Distance(entity, from) || 1;
    this.Move(entity, (entity.position.x - from.position.x) / d * distance, (entity.position.z - from.position.z) / d * distance);
  }
  Stagger(entity, from, clip, duration, poise = 0) {
    const f = this.Fighter(entity);
    f.poise = Math.max(0, f.poise - poise); f.lastHit = this.time; f.pressureBy = from;
    if (f.poise <= 0) { this.SetState(f, "fall", R.knockdownS, "Fall"); this.Log("knockdown", entity, from); }
    else this.SetState(f, "stagger", duration, clip);
  }
  KnockDown(entity = this.Player(), attacker = null, reason = "impact") {
    const f = this.Fighter(entity);
    if (!Alive(entity) || !f?.weapon || this.Active || ["fall","down","rise"].includes(f.state)) return false;
    f.poise = 0; f.pressureBy = attacker; f.lastHit = this.time;
    this.SetState(f,"fall",R.knockdownS,"Fall");this.Log("knockdown",entity,attacker,{reason});return true;
  }
  Damage(target, attacker, amount, kind) {
    if (this.host.Damage) this.host.Damage(target, attacker, amount, kind);
    else { target.health = Math.max(0, target.health - amount); if (target.health <= 0) target.alive = false; }
    this.Log("hit", attacker, target, { amount, attack: kind }); this.stats.hits++;
  }
  BeginBind(a, b, reason) {
    const player = this.Player();
    if (a !== player && b !== player) {
      this.Stagger(a, b, "Deflected", R.parryStaggerS, 12);
      this.Stagger(b, a, "Deflected", R.parryStaggerS, 12); this.Log("npcClash", a, b); return true;
    }
    if (this.Active || !this.CanUse()) return false;
    const opponent = a === player ? b : a;
    const pf = this.Fighter(player);
    if (!this.qte.Begin("standing", opponent, { stamina: pf.stamina / 100, reason, parried: this.time - pf.lastParry < 1, strength: opponent.meleeTraining?.strength ?? 1 })) return false;
    this.SetState(pf, "qte", Q.windowS, "Bind");
    this.SetState(this.Fighter(opponent), "qte", Q.windowS, "Bind");
    this.stats.standing++; this.Log("standingQte", player, opponent, { reason }); return true;
  }
  BeginGround(opponent) {
    const p = this.Player(), pf = this.Fighter(p);
    if (pf.state !== "down" || !Alive(p) || !Alive(opponent) || !this.CanUse() || this.Active || Distance(p, opponent) > R.bindReachM + 0.3 || !this.Visible(p, opponent)) return false;
    if (!this.qte.Begin("ground", opponent, { stamina: pf.stamina / 100, reason: "knockdownPressure" })) return false;
    this.SetState(pf, "qte", Q.windowS, "Ground");
    this.SetState(this.Fighter(opponent), "qte", Q.windowS, "Pressure");
    this.stats.ground++; this.Log("groundQte", p, opponent); return true;
  }
  ResolveQte(a) {
    this.stats[a.success ? "successes" : "failures"]++;
    this.Log(a.success ? "qteSuccess" : "qteFailure", this.Player(), a.attacker, { qteKind: a.kind });
    if (!a.success) this.Damage(this.Player(), a.attacker, a.kind === "ground" ? Q.groundFailureDamage : Q.standingFailureDamage, "qte");
  }
  FinishQte(a) {
    const p = this.Player(), pf = this.Fighter(p), of = this.Fighter(a.attacker);
    if (!Alive(p)) { if (of) this.SetState(of, "idle"); return; }
    if (a.success) {
      this.Repel(a.attacker, p, R.pushDistanceM);
      this.SetState(of, "stagger", Q.successStaggerS, "Pushed");
      pf.poise = 65;
      this.SetState(pf, a.kind === "ground" ? "rise" : "idle", a.kind === "ground" ? R.riseS : 0, a.kind === "ground" ? "Rise" : "Guard");
    } else {
      this.Repel(p, a.attacker, 0.32);
      this.SetState(of, "idle"); of.nextThink = this.time + 0.8;
      pf.pressureBy = a.attacker;
      const fall = a.kind === "standing" && pf.poise < 40;
      this.SetState(pf, fall ? "fall" : a.kind === "ground" ? "rise" : "stagger", fall ? R.knockdownS : a.kind === "ground" ? R.riseS : R.staggerS, fall ? "Fall" : a.kind === "ground" ? "Rise" : "Pushed");
    }
    this.held.clear();
  }
  HandleInput(code, down, repeat = false) {
    if (code === "Blur") {
      this.held.clear(); this.qte.Press(false);
      const f = this.Fighter(this.Player());
      if (f?.state === "charge") this.SetState(f, "idle");
      return false;
    }
    if (this.Active) {
      if (code === "KeyF") this.qte.Press(down, repeat);
      return !["Escape", "Backquote", "AltLeft", "AltRight"].includes(code);
    }
    if (!this.CanUse()) return false;
    if (!["Mouse0", "Mouse2", "KeyF", "KeyV"].includes(code)) return this.Blocking && !["Escape", "Backquote", "AltLeft", "AltRight"].includes(code);
    if (!down) {
      this.held.delete(code);
      if (code === "Mouse0" || code === "KeyV") this.AttackUp();
      return code !== "KeyF";
    }
    if (repeat || this.held.has(code)) return true;
    if (code === "KeyF") {
      const pushed = !this.Blocking && this.Push();
      if (pushed) this.held.add(code); return pushed || this.Blocking;
    }
    this.held.add(code);
    if (this.Blocking) return true;
    if (code === "Mouse2") this.Parry(); else this.AttackDown();
    return true;
  }
  NpcThink(f, dt) {
    const e = f.entity;
    const target = this.Closest(e), spec = W[f.weapon];
    f.target = target; f.move = 0;
    if (!target || !spec) return;
    const tf = this.Fighter(target), d = Distance(e, target);
    const yaw = Math.atan2(e.position.x - target.position.x, e.position.z - target.position.z);
    if (f.state !== "attack") e.yaw = (e.yaw || 0) + Clamp(Wrap(yaw - (e.yaw || 0)), -R.npcTurnRate * dt, R.npcTurnRate * dt);
    if (f.state !== "idle") return;
    const training = e.meleeTraining || {};
    if (training.passive) return;
    if (target === this.Player() && ["fall", "down"].includes(tf.state)) {
      if (d > 1.05) this.AdvanceNpc(f, target, dt, 1);
      else if (tf.state === "down") this.BeginGround(e);
      return;
    }
    if (tf.state === "qte") return;
    if (training.kind === "bind") {
      if (tf.state === "attack" && tf.attack?.heavy && d < R.bindReachM && this.time >= f.nextThink) this.Attack(e, true);
      return;
    }
    if (training.kind === "push") return;
    if (training.kind === "ground") {
      if (this.time >= f.nextThink && d <= spec.pushReach) { this.Push(e); f.nextThink = this.time + 1.4; }
      return;
    }
    // 可读动作触发反应；训练时序项目不给额外闪避。无全知百分百拨挡。
    if (!training.kind || training.kind === "duel" || training.kind === "observe") {
      if (tf.state === "attack" && !tf.attack?.connected && tf.t > tf.attack.windup - 0.10
        && tf.t < tf.attack.windup && d <= tf.attack.reach && f.actionSerial % 3 === 1) { this.Parry(e); return; }
    }
    const preferred = spec.light.reach - 0.28;
    if (d > preferred + 0.12) this.AdvanceNpc(f, target, dt, 1);
    else if (d < spec.minReach + 0.2 && this.time >= f.nextThink) {
      if (this.Push(e)) { f.nextThink = this.time + 1.25; return; }
      this.AdvanceNpc(f, target, dt, -1);
    } else if (tf.state === "charge" && d < preferred && training.kind !== "timing") this.AdvanceNpc(f, target, dt, -1);
    // 侧位缓慢绕行，不把敌人传送到玩家背后。
    if ((training.slot || 0) > 0 && d < 3.4 && d > 1.5) {
      const side = training.slot % 2 ? 1 : -1;
      this.Move(e, Math.cos(yaw) * dt * 0.35 * side, -Math.sin(yaw) * dt * 0.35 * side);
    }
    if (this.time >= f.nextThink && d < spec.light.reach + 0.08 && Facing(e, target) > 0.9) {
      this.Attack(e, training.kind === "timing" || (f.actionSerial % 4 === 2 && d > 1.45));
      f.nextThink = this.time + 1.5 + (training.slot || 0) * 0.19;
    }
  }
  AdvanceNpc(f, target, dt, direction) {
    const d = Distance(f.entity, target) || 1;
    const speed = R.npcSpeed * direction;
    this.Move(f.entity, (target.position.x - f.entity.position.x) / d * speed * dt, (target.position.z - f.entity.position.z) / d * speed * dt);
    f.move = direction;
  }
  StepFighter(f, dt) {
    const e = f.entity;
    if (!Alive(e)) return;
    f.t += dt;
    if (f.state === "idle") { f.stamina = Math.min(100, f.stamina + R.staminaRecovery * dt); }
    if (this.time - f.lastHit > 1.5 && f.state === "idle") f.poise = Math.min(100, f.poise + R.poiseRecovery * dt);
    if (f.state === "qte") return;
    if (f.state === "attack") {
      const a = f.attack;
      if (f.t >= a.windup && f.t <= a.windup + a.active && !a.connected) this.ResolveContact(f);
      if (f.state !== "attack") return;
      const lunge = a.lunge * Clamp((f.t - a.windup) / a.active, 0, 1);
      if (lunge > a.lungeDone) {
        this.Move(e, -Math.sin(a.yaw) * (lunge - a.lungeDone), -Math.cos(a.yaw) * (lunge - a.lungeDone)); a.lungeDone = lunge;
      }
      if (f.t >= f.duration) {
        if (!a.connected) { this.stats.misses++; this.Log("miss", e); }
        this.SetState(f, "idle");
      }
      return;
    }
    if (f.state === "push" && !f.hit && f.t >= 0.16) {
      f.hit = true; const t = f.target;
      if (Alive(t) && Distance(e, t) <= W[f.weapon].pushReach + 0.1 && Facing(e, t) > 0.5 && this.Visible(e, t)) {
        this.Repel(t, e, R.pushDistanceM);
        this.Stagger(t, e, "Pushed", R.pushStaggerS, 42);
        this.stats.pushes++; this.Log("push", e, t);
      }
    }
    if (f.state === "fall" && f.t >= f.duration) {
      this.SetState(f, "down", 1.7, "Ground"); return;
    }
    if (f.state === "down" && f.t >= f.duration) { this.SetState(f, "rise", R.riseS, "Rise"); f.poise = 50; return; }
    if (!["idle", "charge", "down"].includes(f.state) && f.t >= f.duration) this.SetState(f, "idle");
  }
  ResolveContact(f) {
    const e = f.entity, a = f.attack, weapon = W[f.weapon];
    const targets = this.Opponents(e).filter((t) => Distance(e, t) <= a.reach && Facing(e, t, a.yaw) >= a.arcDot && this.Visible(e, t)).sort((b, c) => Distance(e, b) - Distance(e, c));
    const target = targets[0]; if (!target) return;
    const tf = this.Fighter(target), distance = Distance(e, target);
    if (tf.state === "qte") return;
    if (tf.state === "parry" && tf.t <= R.parryWindowS && !tf.parryUsed && Facing(target, e) >= R.parryFacingDot) {
      tf.parryUsed = true; tf.lastParry = this.time;
      a.connected = true; this.Stagger(e, target, "Deflected", R.parryStaggerS, 17);
      this.stats.parries++; this.Log("parry", target, e); return;
    }
    const hardBrace = a.heavy && ((tf.state === "attack" && tf.attack?.heavy && tf.t < tf.attack.windup + tf.attack.active) || (tf.state === "charge" && tf.t >= R.chargeMinS));
    if (distance <= R.bindReachM && hardBrace && Facing(target, e) > 0.65 && W[tf.weapon]) {
      a.connected = true; this.BeginBind(e, target, tf.state === "charge" ? "chargedWeaponBrace" : "simultaneousHeavyContact"); return;
    }
    if (distance < weapon.minReach) { this.Log("tooClose", e, target); a.connected = true; return; }
    a.connected = true;
    this.Damage(target, e, a.damage, a.heavy ? "heavy" : "light");
    if (Alive(target)) this.Stagger(target, e, "Hit", a.heavy ? R.staggerS : 0.23, a.poise);
  }
  Update(dt) {
    if (!Number.isFinite(dt) || dt <= 0 || !this.enabled) return;
    let left = Math.min(dt, 0.25);
    while (left > 1e-8) { const step = Math.min(left, R.maxStepS); this.Step(step); left -= step; }
  }
  Step(dt) {
    this.time += dt;
    const player = this.Player();
    if (this.Active && (!Alive(player) || !Alive(this.qte.active.attacker))) this.Cancel("participantGone");
    const all = [player, ...this.Soldiers()].filter(Boolean);
    for (const [entity] of this.fighters) if (!all.includes(entity)) this.fighters.delete(entity);
    for (const entity of all) {
      const f = this.Fighter(entity), weapon = this.Weapon(entity);
      if (weapon !== f.weapon) { this.SetState(f, "idle"); f.weapon = weapon; if (entity === player) this.held.clear(); }
      const training = entity.meleeTraining;
      const eligible = entity !== player && Alive(entity) && !!weapon && !entity.unarmed && !entity.scriptDefensive && !entity.scriptedNoncombatant;
      const managed = eligible && (!!training || !!this.Closest(entity) || f.state !== "idle");
      if (entity !== player) entity.meleeCombat = managed ? this.Pose(f) : null;
      if (entity === player || managed) {
        this.StepFighter(f, dt);
        if (managed) this.NpcThink(f, dt);
      }
    }
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      if (!Alive(a) || !Alive(b) || !(a.meleeCombat || b.meleeCombat) || !this.Visible(a, b)) continue;
      const distance = Distance(a, b);
      if (distance >= R.separationM) continue;
      const dx = distance > 0.001 ? (b.position.x - a.position.x) / distance : 1;
      const dz = distance > 0.001 ? (b.position.z - a.position.z) / distance : 0;
      const amount = Math.min((R.separationM - distance) * 0.5, dt * 1.2);
      if (a !== player) this.Move(a, -dx * amount, -dz * amount);
      if (b !== player) this.Move(b, dx * amount, dz * amount);
    }
    this.qte.Update(dt);
    const struggle = this.qte.active;
    if (struggle?.phase === "input" && struggle.t - (struggle.lastSound || -1) > .5 + struggle.progress * .6) {
      struggle.lastSound = struggle.t;
      this.host.Event?.({kind:"struggle", progress:struggle.progress, qteKind:struggle.kind}, player, struggle.attacker);
    }
    for (const entity of all) if (entity !== player && entity.meleeCombat) entity.meleeCombat = this.Pose(this.Fighter(entity));
  }
  Pose(f) {
    if (!f?.weapon) return null;
    let clip = f.clip || (f.move > 0 ? "Advance" : f.move < 0 ? "Retreat" : "Guard");
    if (f.state === "idle") clip = f.move > 0 ? "Advance" : f.move < 0 ? "Retreat" : "Guard";
    const a = this.qte.active;
    if (f.state === "qte" && a) {
      if (a.phase === "resolve") clip = a.kind === "ground" ? (f.entity === this.Player() ? a.success ? "GroundWin" : "GroundLose" : "Pushed") : a.success === (f.entity === this.Player()) ? "BindWin" : "BindLose";
    }
    const phase = f.attack ? f.t < f.attack.windup ? "windup" : f.t < f.attack.windup + f.attack.active ? "active" : "recovery" : f.state;
    return { managed: true, weapon: f.weapon, state: f.state, phase, clip: `${f.weapon}${clip}`, action: clip,
      t: f.t, duration: f.duration, normalized: f.duration ? Clamp(f.t / f.duration, 0, 1) : (f.t % 1),
      stamina: f.stamina, poise: f.poise, actionSerial: f.actionSerial,
      parryActive: f.state === "parry" && f.t <= R.parryWindowS && !f.parryUsed,
      progress: a?.progress ?? 0.5, pulse: a?.pulse || 0, qteKind: a?.kind || null,
      qteResolve: a?.phase === "resolve" ? a.resolveT / Q.resolveS : 0,
      focusYaw: a && f.entity === this.Player() ? Math.atan2(f.entity.position.x - a.attacker.position.x, f.entity.position.z - a.attacker.position.z) : null,
      focusPitch: a?.kind === "ground" ? .70 : -.28,
      move: f.move, targetId: f.target?.id ?? null,
    };
  }
  ViewPose() { return this.CanUse() ? this.Pose(this.Fighter(this.Player())) : null; }
  View() { return this.qte.View(); }
  SetAssist(mode) { return this.qte.SetAssist(mode); }
  State() { return { time: this.time, active: this.qte.View(), stats: { ...this.stats }, player: this.Pose(this.Fighter(this.Player())), events: this.events.slice(-14) }; }
  Cancel(reason = "reset") {
    this.qte.Cancel(); this.held.clear();
    for (const f of this.fighters.values()) { this.SetState(f, "idle"); f.entity.meleeCombat = null; }
    this.Log("cancel", null, null, { reason });
  }
  ReleasePlayer() { this.held.clear(); const f = this.Fighter(this.Player()); if (f && !this.Active) this.SetState(f, "idle"); }
  Reset() { this.Cancel(); this.fighters.clear(); this.events.length = 0; this.time = 0; for (const key of Object.keys(this.stats)) this.stats[key] = 0; }
}
