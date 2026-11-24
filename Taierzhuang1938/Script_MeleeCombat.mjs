// 通用白刃规则：玩家、敌军、友军同一状态机。纯 Node 可跑，宿主负责物理与伤害。
import { MELEE_RULES as R, MELEE_WEAPONS as W, MELEE_QTE_RULES as Q, MELEE_SQUAD as G,
  MELEE_VARIANTS as V, MELEE_LODGE as L, MELEE_DRAG as D,
  MELEE_CLEAVE as C, MELEE_SLIDE as S0, MELEE_CRUSH as K } from "./Data_MeleeCombat.mjs";
import { MeleeQteDirector } from "./Script_MeleeQte.mjs";
import { T } from "./Script_Text.mjs";
const Smooth = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
const DIRECTIONS = new Map(D.directions.map((d) => [d.id, d]));
/** 拖拽挥砍：鼠标这一甩的方向（屏幕坐标，y 朝上）→ 刀从反方向来的那个来向（刀顺着甩的方向走）。 */
export function DirectionForStroke(x, y) {
  const from = Math.atan2(-y, -x) * 180 / Math.PI;
  let best = null, gap = Infinity;
  for (const d of D.directions) {
    const g = Math.abs(((from - d.angleDeg + 540) % 360) - 180);
    if (g < gap) { gap = g; best = d; }
  }
  return best;
}
const Clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const Alive = (entity) => !!entity && (entity.Alive ?? entity.alive) === true;
const Distance = (a, b) => Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
const Wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
const Facing = (a, b, yaw = a.yaw || 0) => {
  const d = Distance(a, b) || 1;
  return (-Math.sin(yaw) * (b.position.x - a.position.x) - Math.cos(yaw) * (b.position.z - a.position.z)) / d;
};
// b 相对 a 正面的带符号方位角：0 正前、±π/2 左右侧、±π 正后。
const BearingFrom = (a, b) => {
  const yaw = a.yaw || 0, dx = b.position.x - a.position.x, dz = b.position.z - a.position.z;
  return Math.atan2(-Math.cos(yaw) * dx + Math.sin(yaw) * dz, -Math.sin(yaw) * dx - Math.cos(yaw) * dz);
};
// Finite swept weapon segments; broad centre checks are only a culling stage.
const PointSegment = (p, a, b) => {
  const dx = b.x-a.x, dz = b.z-a.z, t = Clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz || 1),0,1);
  return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);
};
const Tip = (e, yaw, reach) => ({x:e.position.x-Math.sin(yaw)*reach,y:(e.position.y||0)+1.1,z:e.position.z-Math.cos(yaw)*reach});
// 近邻网格（见 BuildIndex）：格子边长要 >= engageM，查询才只用扫 3×3 格。
const CELL_M = 6;
const CellKeyAt = (cx, cz) => (cx + 4096) * 8192 + (cz + 4096);
const CellKey = (x, z) => CellKeyAt(Math.floor(x / CELL_M), Math.floor(z / CELL_M));
export class MeleeCombatDirector {
  constructor(host = {}, options = {}) {
    this.host = host; this.time = 0; this.fighters = new Map(); this.events = [];
    this.serial = 0; this.held = new Set(); this.enabled = true;
    // 近邻网格与两个复用的查询数组（Near 返回的就是它们，别存下来）
    this.indexCells = new Map(); this.indexRank = new Map(); this.indexAt = -1;
    this.nearA = []; this.nearB = [];
    this.stats = { attacks: 0, hits: 0, misses: 0, parries: 0, pushes: 0, standing: 0, ground: 0, successes: 0, failures: 0,
      lodges: 0, shallowCuts: 0, yanks: 0, finishes: 0, drags: 0,
      cleaves: 0, rips: 0, slides: 0, slideSlashes: 0, guardBlocks: 0, guardCrushes: 0, crushFinishes: 0 };
    this.qte = new MeleeQteDirector({ Resolve: (a) => this.ResolveQte(a), Finish: (a) => this.FinishQte(a) }, options);
    // 玩法变体（只有白刃实验场会切，见 Data_MeleeCombat.MELEE_VARIANTS）；拖拽挥砍要的鼠标：
    // pending 是这一帧还没记账的位移，strokes 是最近 windowS 秒逐帧的位移，aim 是刀架跟着鼠标偏出去的量（像素）。
    this.variant = { control: "classic", impact: "classic" }; this.viewFollow = D.viewFollow;
    this.mouse = { pending: { x: 0, y: 0 }, strokes: [], aim: { x: 0, y: 0 } };
  }
  SetVariant({ control = this.variant.control, impact = this.variant.impact } = {}) {
    this.variant = { control: V.control.includes(control) ? control : "classic", impact: V.impact.includes(impact) ? impact : "classic" };
    // 不经 Fighter()：重开项目时玩家的武器还没换好，这里先建出来会把旧武器记进去。
    const f = this.fighters.get(this.Player());
    if (f?.lodge) this.ReleaseLodge(f, "variant");
    if (f?.cleave) this.ReleaseCleave(f, "variant");
    if (f?.slide) this.ReleaseSlide(f, "variant");
    for (const entry of this.fighters.values()) entry.guardPoise = K.maxPoise;
    return { ...this.variant };
  }
  get Drag() { return this.variant.control === "drag"; }
  get HasCleave() { return this.variant.impact === "cleave" || this.variant.impact === "pofeng"; }
  get HasSlide() { return this.variant.impact === "slide" || this.variant.impact === "pofeng"; }
  get HasCrush() { return this.variant.impact === "crush" || this.variant.impact === "pofeng"; }
  get EnhancedFeel() { return this.variant.impact !== "classic"; }
  /** 按着左键拖拽时鼠标主要归刀：视角只跟 viewFollow 倍（实验场插件按它缩这一帧的转视角）。 */
  get CapturesLook() {
    const f = this.fighters.get(this.Player());
    return (this.Drag && this.held.has("Mouse0") && (f?.state === "aim" || (f?.state === "attack" && !!f.attack?.drag)))
      || f?.state === "cleave";
  }
  /** 拖拽时视角跟鼠标的比例（0 = 视角不动、只动刀，1 = 视角照常全跟）。 */
  SetViewFollow(value) { this.viewFollow = Clamp(Number.isFinite(+value) ? +value : D.viewFollow, 0, 1); return this.viewFollow; }
  /** 每帧喂一次鼠标位移（像素，lookY 向下为正）：拖拽挥砍拿它带刀、出刀。 */
  AddLook(dx = 0, dy = 0) {
    this.mouse.pending.x += dx; this.mouse.pending.y -= dy;
  }
  /** 最近 windowS 秒鼠标走过的位移（像素，y 朝上）。 */
  StrokeVector() {
    let x = 0, y = 0;
    for (const s of this.mouse.strokes) { x += s.x; y += s.y; }
    return { x, y };
  }
  /** 现在这一甩会砍出哪个来向（没甩够为 null，面板八向指示用）。 */
  DragPreview() {
    const v = this.StrokeVector();
    return Math.hypot(v.x, v.y) >= D.minStrokePx * 0.5 ? DirectionForStroke(v.x, v.y).id : null;
  }
  Player() { return this.host.Player?.(); }
  Soldiers() { return this.host.Soldiers?.() || []; }
  Weapon(entity) { return this.host.Weapon?.(entity) || entity?.meleeWeapon || null; }
  CanUse() { return Alive(this.Player()) && !!this.Weapon(this.Player()) && this.host.CanUse?.() !== false; }
  CanChangeWeapon() { const f = this.Fighter(this.Player()); return !this.Active && (!f?.weapon || this.Idle(f)); }
  get Active() { return this.qte.Active; }
  get TimeScale() { return 1; }
  get Blocking() {
    return this.Active || ["fall", "down", "rise", "lodged", "yank", "cleave", "rip", "sliding", "slideSlash"].includes(this.Fighter(this.Player())?.state);
  }
  Fighter(entity) {
    if (!entity) return null;
    if (!this.fighters.has(entity)) this.fighters.set(entity, {
      entity, state: "idle", t: 0, duration: 0, stamina: 100, poise: 100,
      guardPoise: K.maxPoise, lastGuardHit: -99,
      weapon: this.Weapon(entity), actionSerial: 0, nextThink: this.time + 0.65,
      lastParry: -99, lastHit: -99, move: 0, target: null, pressureBy: null,
      attack: null, hit: false, parryUsed: false, buffer: null, qteCount: 0,
      qteUntil: -99, recoveryUntil: -99, beatUntil: -99, pushUntil: -99, interruptUntil: -99,
      // 剧本按住的倒地时长（ScriptedKnockDown 设，普通倒地是 null ＝ 共用 1.7 s）
      groundHoldS: null, cleave: null, slide: null, crushedBy: null,
    });
    return this.fighters.get(entity);
  }
  Log(kind, a = null, b = null, extra = {}) {
    const event = { serial: ++this.serial, time: this.time, kind, actor: a === this.Player() ? "Player" : a?.id, target: b === this.Player() ? "Player" : b?.id, ...extra };
    this.events.push(event); if (this.events.length > 60) this.events.shift();
    this.host.Event?.(event, a, b);
  }
  SetState(f, state, duration = 0, clip = null) {
    const previous=this.Pose(f);
    // Successful contact releases input early. Let the captured deflection
    // finish visually, while any new attack can interrupt it immediately.
    f.parryVisualTail = state === "idle" && f.state === "parry"
      ? {pose:previous,startedAt:this.time-f.t,duration:R.parryWindowS+R.parryRecoveryS} : null;
    if(previous) {delete previous.transition;f.previousPose=previous;f.transitionAt=this.time;}
    f.state = state; f.t = 0; f.duration = duration; f.clip = clip; f.actionSerial++; f.feint = false;
    if (state !== "attack") f.attack = null;
    if (["qte", "stagger", "fall", "down", "rise", "contact"].includes(state)) f.buffer = null;
  }
  Idle(f) { return f && (f.state === "idle" || f.state === "charge"); }
  AttackDown(entity = this.Player()) {
    const f = this.Fighter(entity);
    if (!Alive(entity) || !f?.weapon || this.Active && entity === this.Player()) return false;
    if (f.state === "lodged") return true;
    if (entity === this.Player() && this.Drag && W[f.weapon]) {
      if (this.Idle(f)) return this.BeginAim(f);
      // 拖拽挥砍出刀或硬磕反弹中再按：排进缓冲，收完就接下一刀。
      if ((f.state === "attack" && f.attack?.drag) || f.state === "guardBounce") {
        f.buffer = { expires: this.time + Math.max(0, f.duration - f.t) + R.inputBufferS, released: false };
        return true;
      }
      return false;
    }
    if (f.state !== "idle") {
      if (f.state === "guardBounce" || (["attack","parry","push"].includes(f.state) && f.duration-f.t <= R.inputBufferS)) {
        f.buffer = {expires:this.time + Math.max(0, f.duration - f.t) + R.inputBufferS, released:false}; return true;
      }
      return false;
    }
    this.SetState(f, "charge", R.chargeMaxS, "Charge"); return true;
  }
  AttackUp(entity = this.Player()) {
    const f = this.Fighter(entity);
    if (entity === this.Player() && this.Drag) {
      if (f?.buffer && (f.state === "attack" || f.state === "guardBounce")) { f.buffer.released = true; return true; }
      if (f?.state === "aim") { if (!f.resumedAim && f.t <= D.tapS) return this.TapCut(f); this.SetState(f, "idle"); }
      return true;
    }
    if (f?.buffer) { f.buffer.released = true; return true; }
    if (f?.state !== "charge") return false;
    const held = f.t;
    return this.Attack(entity, held >= R.chargeMinS, held);
  }
  Attack(entity, heavy = false, held = 0) {
    const f = this.Fighter(entity);
    if (!Alive(entity) || !this.Idle(f) || !W[f.weapon]) return false;
    const base = W[f.weapon][heavy ? "heavy" : "light"];
    const spec = { ...base, windup: entity === this.Player() ? base.windup : Math.max(base.windup,R.npcTellS) };
    if (f.stamina < spec.cost) { this.SetState(f, "idle"); this.Log("exhausted", entity); return false; }
    f.stamina -= spec.cost;
    const alternate = !heavy && ((f.swingIndex = (f.swingIndex || 0) + 1) % 2 === 0);
    this.SetState(f, "attack", spec.windup + spec.active + spec.recovery, heavy ? "Heavy" : alternate ? "LightAlt" : "Light");
    if (f.weapon === "Dadao" && !heavy && this.Closest(entity,1.1,.55)) f.clip = alternate ? "CompactAlt" : "Compact";
    f.t = Math.min(held, Math.max(0,spec.windup-.045));
    f.buffer = null;
    f.attack = { ...spec, baseWindup:base.windup, baseDuration:base.windup+base.active+base.recovery, heavy, yaw: entity.yaw || 0, connected: false, lungeDone: 0, previousTip:null, locked:false };
    f.hit = false; this.stats.attacks++; this.Log(heavy ? "heavy" : "light", entity);
    return true;
  }
  /** 佯攻：只亮起手不出刀，骗对手拨挡。短于 chargeMinS，撞不出硬架僵持。 */
  Feint(entity) {
    const f = this.Fighter(entity);
    if (!Alive(entity) || f.state !== "idle" || !W[f.weapon]) return false;
    this.SetState(f, "charge", G.feintS, "Charge"); f.feint = true;
    this.Log("feint", entity, f.target); return true;
  }
  // ── 拖拽挥砍（只给玩家；见 Data_MeleeCombat.MELEE_DRAG）──────────────────────────────
  /** 按下左键：进拖拽架势（刀举起来跟着鼠标走）；出刀中按下的，砍完自动回架势。 */
  BeginAim(f, resumed = false) {
    if (!this.Idle(f)) return f.state === "attack" && !!f.attack?.drag;
    this.mouse.strokes.length = 0; this.mouse.aim.x = 0; this.mouse.aim.y = 0; f.buffer = null;
    this.SetState(f, "aim", 0, "Charge"); f.resumedAim = !!resumed; return true;
  }
  /** 点一下的那一刀：刀架偏出去了就顺着偏的方向，否则右上斜劈；力道最轻一档。 */
  TapCut(f) {
    const a = this.mouse.aim;
    const dir = Math.hypot(a.x, a.y) > D.tapAimPx ? DirectionForStroke(a.x, a.y) : D.directions.find((d) => d.id === D.tapDirection);
    this.SetState(f, "idle");
    if (!this.AttackDirectional(f.entity, dir, { damageScale: D.powerScale[0], drag: true })) return false;
    this.stats.drags++; f.attack.tap = true; return true;
  }
  StepAim(f, dt) {
    const m = this.mouse, fade = Math.exp(-dt / D.aimReturnS);
    m.aim.x *= fade; m.aim.y *= fade;
    // 甩得够长（窗口里累计位移）且够快（窗口里最快那一帧的速度）才出刀；力道也按最快那一帧算。
    const v = this.StrokeVector(), length = Math.hypot(v.x, v.y);
    const speed = m.strokes.reduce((top, s) => Math.max(top, Math.hypot(s.x, s.y) / Math.max(s.dt, 1e-3)), 0);
    if (length < D.minStrokePx || speed < D.triggerPxPerS) return;
    const power = Clamp((speed - D.powerPxPerS[0]) / (D.powerPxPerS[1] - D.powerPxPerS[0]), 0, 1);
    const scale = D.powerScale[0] + (D.powerScale[1] - D.powerScale[0]) * power;
    m.strokes.length = 0;
    this.SetState(f, "idle");
    if (this.AttackDirectional(f.entity, DirectionForStroke(v.x, v.y), { damageScale: scale, drag: true })) {
      this.stats.drags++;
      f.attack.dragSpeed = Math.round(speed);
    }
  }
  /** 一刀从某个来向砍出去（第一人称刀轨按来向倒放 / 镜像 / 滚转）。拖拽挥砍与拖拽模式下的补刀都走它。 */
  AttackDirectional(entity, dir, { windupScale = 1, damageScale = 1, tag = null, drag = false } = {}) {
    const f = this.Fighter(entity);
    if (!Alive(entity) || !this.Idle(f) || !W[f.weapon] || !dir) return false;
    const overhead = dir.id === "up";
    const spec = { ...D.attack, ...(overhead ? D.overhead : {}) };
    if (f.stamina < spec.cost) { this.SetState(f, "idle"); this.Log("exhausted", entity); return false; }
    const windup = spec.windup * windupScale;
    f.stamina -= spec.cost;
    this.SetState(f, "attack", windup + spec.active + spec.recovery, overhead ? "Heavy" : "Light");
    f.attack = { ...spec, damage: Math.round(spec.damage * damageScale), windup, baseWindup: spec.windup, baseActive: spec.active,
      baseDuration: spec.windup + spec.active + spec.recovery, heavy: overhead, yaw: entity.yaw || 0, connected: false, lungeDone: 0,
      previousTip: null, locked: false, direction: dir, sweep: dir.sweep * R.bladeSweepRad, kind: tag, drag };
    f.hit = false; f.buffer = null; this.stats.attacks++;
    this.Log(overhead ? "heavy" : "light", entity, null, { direction: dir.id, kind: tag });
    return true;
  }
  // ── 卡刀 → 拔刀 → 踉跄 → 补刀（见 Data_MeleeCombat.MELEE_LODGE）─────────────────────
  /**
   * 这一刀算不算砍进了身体里：刀刃吃进去的深度（够得着的长度 − 到对方体表的距离）够深，
   * 而且对方在这一刀正中线附近（砍在边上、刀尖擦过的只是一道口子，不卡）。轻击力道小，要更深才卡。
   */
  CutDepth(e, f, target) {
    const a = f.attack, distance = Distance(e, target);
    const toward = Math.atan2(e.position.x - target.position.x, e.position.z - target.position.z);
    return { depth: a.reach - (distance - R.bodyRadiusM), offAxis: Math.abs(Wrap(toward - a.yaw)),
      need: L.minDepthM + (a.heavy ? 0 : L.lightExtraDepthM) };
  }
  LodgeEligible(e, f, target) {
    if (this.variant.impact !== "lodge" || e !== this.Player() || !L.weapons.includes(f.weapon)
      || !Alive(target) || f.attack?.finisher || !this.Fighter(target)?.weapon) return false;
    const cut = this.CutDepth(e, f, target);
    const deep = cut.depth >= cut.need && cut.offAxis <= L.maxOffAxisRad;
    if (!deep) { this.stats.shallowCuts++; this.Log("shallowCut", e, target, { depth: +cut.depth.toFixed(2), offAxis: +cut.offAxis.toFixed(2) }); }
    return deep;
  }
  StrokeOf(f) {
    const a = f.attack;
    if (!a?.direction) return { split: null, reverse: false, mirror: false, roll: 0 };
    return { split: [a.baseWindup / a.baseDuration, (a.baseWindup + a.baseActive) / a.baseDuration],
      reverse: a.direction.reverse, mirror: a.direction.mirror, roll: a.direction.rollDeg * Math.PI / 180 };
  }
  BeginLodge(f, target) {
    const e = f.entity, tf = this.Fighter(target);
    const stroke = this.StrokeOf(f);
    f.lodge = { target, clip: f.clip, n: Clamp(this.AttackTime(f) + L.pressInN, 0, 1), ...stroke,
      progress: 0, held: !!this.held.has("KeyF"), direction: f.attack.direction?.id || null, serial: ++this.serial };
    const lodge = f.lodge;
    // 刀吃进去的那一点（世界坐标）：肩膀（上撩落在腰腹），偏向刀来的那一侧（玩家视角的左右）。
    const dir = f.attack.direction, sweep = dir ? dir.sweep : -1, yaw = e.yaw || 0;
    const side = -Math.sign(sweep || -1) * L.anchorSideM;
    lodge.anchor = { x: target.position.x + Math.cos(yaw) * side, y: (target.position.y || 0) + (dir?.reverse ? L.anchorTorsoM : L.anchorShoulderM),
      z: target.position.z - Math.sin(yaw) * side };
    this.SetState(f, "lodged", Infinity, lodge.clip); f.lodge = lodge;
    this.SetState(tf, "lodged", Infinity, "Hit"); tf.lodgedBy = e; tf.buffer = null;
    this.stats.lodges++; this.Log("lodge", e, target);
  }
  StepLodge(f, dt) {
    const e = f.entity, lodge = f.lodge, target = lodge?.target, tf = target && this.Fighter(target);
    if (!lodge || !Alive(target) || tf.state !== "lodged") { this.ReleaseLodge(f, "released"); return; }
    // 长按 F 把圈走满，松手往回退；没有时限。
    lodge.progress = Clamp(lodge.progress + (lodge.held ? dt / L.holdS : -L.decayPerS * dt), 0, 1);
    // 视角不拽：刀锁在对方身上那一点（第一人称按 lodge.anchor 锁在世界空间），玩家随便转头看。
    if (lodge.progress >= 1) this.Yank(f);
  }
  Yank(f) {
    const e = f.entity, lodge = f.lodge, target = lodge.target, tf = this.Fighter(target);
    this.SetState(f, "yank", L.yankS, lodge.clip); f.lodge = lodge;
    tf.lodgedBy = null; tf.poise = 0;
    this.Repel(target, e, L.yankRepelM);
    this.SetState(tf, "reel", L.reelS, "Pushed");
    tf.reelBy = e; tf.reelYaw = Math.atan2(target.position.x - e.position.x, target.position.z - e.position.z);
    tf.reelSide = this.serial % 2 ? 1 : -1;
    tf.nextThink = Math.max(tf.nextThink, this.time + L.reelS);
    this.stats.yanks++; this.Log("yank", e, target);
  }
  ReleaseLodge(f, reason) {
    const target = f.lodge?.target, tf = target && this.fighters.get(target);
    f.lodge = null;
    if (tf?.state === "lodged") { tf.lodgedBy = null; this.SetState(tf, "stagger", 0.4, "Hit"); }
    if (f.state === "lodged") this.SetState(f, "idle");
    this.Log("lodgeRelease", f.entity, target, { reason });
  }
  StepReel(f, dt) {
    const e = f.entity, by = f.reelBy, k = Math.sqrt(Math.max(0, 1 - f.t / f.duration));
    const wave = Math.sin(f.t * 2 * Math.PI / L.reelCycleS);
    if (by && Alive(by)) {
      const d = Distance(e, by) || 1, ax = (e.position.x - by.position.x) / d, az = (e.position.z - by.position.z) / d;
      const sway = wave * f.reelSide;
      this.Move(e, (ax * L.reelSpeedMps * k - az * sway * 0.5 * k) * dt, (az * L.reelSpeedMps * k + ax * sway * 0.5 * k) * dt);
    }
    e.yaw = (f.reelYaw ?? e.yaw ?? 0) + Math.sin(f.t * Math.PI / L.reelCycleS) * L.reelSwayRad * k * f.reelSide;
    if (f.t >= f.duration) { f.reelBy = null; f.poise = 40; this.SetState(f, "idle"); }
  }
  FinishCandidate(entity = this.Player()) {
    const f = this.Fighter(entity);
    if (!f || !(this.Idle(f) || f.state === "guardBounce") || !W[f.weapon] || this.Active) return null;
    return this.Opponents(entity).find((t) => {
      const tf = this.fighters.get(t);
      if (tf?.state === "reel" && tf.reelBy === entity && Distance(entity, t) <= L.finishReachM && this.Visible(entity, t)) return true;
      if (tf?.state === "crushed" && tf.crushedBy === entity && Distance(entity, t) <= K.finishReachM && this.Visible(entity, t)) return true;
      return false;
    }) || null;
  }
  /** F 补刀／破防处决：对踉跄或护枪被震断的对手自动转身抢步补一刀。 */
  Finish(entity = this.Player()) {
    const target = this.FinishCandidate(entity), f = this.Fighter(entity);
    if (!target) return false;
    if (f.state === "guardBounce") this.SetState(f, "idle");
    const tf = this.fighters.get(target), crushed = tf?.state === "crushed";
    const windupScale = crushed ? K.finishWindupScale : L.finishWindupScale;
    f.stamina = Math.max(f.stamina, 40);
    if (this.Drag) {
      if (!this.AttackDirectional(entity, DIRECTIONS.get("up"), { windupScale, tag: crushed ? "crushFinish" : "finish" })) return false;
    } else {
      if (!this.Attack(entity, true)) return false;
      const a = f.attack; a.windup *= windupScale; f.duration = a.windup + a.active + a.recovery;
    }
    f.attack.finisher = target;
    f.attack.crushFinish = crushed;
    this.Log(crushed ? "crushFinishStart" : "finishStart", entity, target); return true;
  }
  // ── 玩法一：吃肉顿刀 · 拖刃拉豁（Data_MeleeCombat.MELEE_CLEAVE）───────────────────────
  CleaveEligible(e, f, target) {
    return this.HasCleave && e === this.Player() && C.weapons.includes(f.weapon)
      && Alive(target) && !f.attack?.finisher && !!this.Fighter(target)?.weapon;
  }
  UpdateCleaveAnchor(cleave, e, target) {
    const yaw = e.yaw || 0, side = -Math.sign(cleave.sweep || -1) * C.anchorSideM;
    cleave.anchor = {
      x: target.position.x + Math.cos(yaw) * side,
      y: (target.position.y || 0) + (cleave.reverse ? C.anchorTorsoM : C.anchorShoulderM),
      z: target.position.z - Math.sin(yaw) * side,
    };
  }
  BeginCleave(f, target, { sweep = -1 } = {}) {
    const e = f.entity, tf = this.Fighter(target), stroke = this.StrokeOf(f);
    const cleave = {
      target, clip: f.clip, n0: Clamp(this.AttackTime(f), 0.30, 0.56), ...stroke,
      sweep, direction: f.attack?.direction?.id || null, drag: !!f.attack?.drag,
      pullX: 0, pullY: 0, wantRip: false, serial: ++this.serial, anchor: null,
    };
    this.UpdateCleaveAnchor(cleave, e, target);
    this.SetState(f, "cleave", C.windowS, cleave.clip); f.cleave = cleave;
    this.SetState(tf, "cleaved", C.windowS + 0.12, "Hit"); tf.cleavedBy = e; tf.buffer = null;
    this.stats.cleaves++; this.Log("cleave", e, target, { sweep, anchor: { ...cleave.anchor } });
  }
  StepCleave(f, _dt) {
    const e = f.entity, cleave = f.cleave, target = cleave?.target, tf = target && this.Fighter(target);
    if (!cleave || !Alive(target) || tf.state !== "cleaved") { this.ReleaseCleave(f, "released"); return; }
    this.UpdateCleaveAnchor(cleave, e, target);
    const pulled = Math.hypot(cleave.pullX, cleave.pullY);
    const speed = this.mouse.strokes.reduce((top, s) => Math.max(top, Math.hypot(s.x, s.y) / Math.max(s.dt, 1e-3)), 0);
    if (f.t >= C.minBiteS && (cleave.wantRip || pulled >= C.ripStrokePx || speed >= C.ripSpeedPxPerS)) {
      this.Rip(f); return;
    }
    if (f.t >= f.duration) {
      f.cleave = null; tf.cleavedBy = null;
      this.SetState(tf, "stagger", 0.34, "Hit");
      this.SetState(f, "idle");
      if (cleave.drag && this.Drag && this.held.has("Mouse0")) this.BeginAim(f, true);
      this.Log("cleaveExit", e, target);
    }
  }
  Rip(f) {
    const e = f.entity, cleave = f.cleave, target = cleave?.target, tf = target && this.Fighter(target);
    if (!cleave || !Alive(target)) { this.ReleaseCleave(f, "gone"); return false; }
    const yaw = e.yaw || 0, sg = Math.sign(cleave.sweep || -1) || -1;
    // 刀刃出肉切向：顺着扫刀方向把人横扯出去，并稍往后带。
    const tx = sg * Math.cos(yaw), tz = -sg * Math.sin(yaw);
    const bx = Math.sin(yaw), bz = Math.cos(yaw);
    tf.cleavedBy = null;
    this.SetState(f, "rip", C.ripS, cleave.clip); f.cleave = cleave;
    this.Damage(target, e, C.ripDamage, "heavy", { yaw, sweep: cleave.sweep });
    if (Alive(target)) {
      this.Move(target, tx * C.wrenchSideM + bx * C.wrenchBackM, tz * C.wrenchSideM + bz * C.wrenchBackM);
      this.Stagger(target, e, "Pushed", R.staggerS + 0.25, C.ripPoise);
    } else {
      this.Move(target, tx * C.wrenchSideM * 0.65, tz * C.wrenchSideM * 0.65);
    }
    this.stats.rips++;
    this.Log("rip", e, target, { sweep: cleave.sweep, tangent: { x: tx, z: tz }, anchor: { ...cleave.anchor } });
    return true;
  }
  ReleaseCleave(f, reason) {
    const target = f.cleave?.target, tf = target && this.fighters.get(target);
    f.cleave = null;
    if (tf?.state === "cleaved") { tf.cleavedBy = null; this.SetState(tf, "stagger", 0.32, "Hit"); }
    if (f.state === "cleave" || f.state === "rip") this.SetState(f, "idle");
    this.Log("cleaveRelease", f.entity, target, { reason });
  }
  // ── 玩法二：磕枪顺刃 · 压杆劈杀（Data_MeleeCombat.MELEE_SLIDE）───────────────────────
  UpdateSlideAnchor(slide, e, target) {
    const dx = e.position.x - target.position.x, dz = e.position.z - target.position.z;
    const d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
    const p = slide.progress;
    const along = S0.tipOffsetM + (S0.hiltOffsetM - S0.tipOffsetM) * p;
    const height = S0.tipHeightM + (S0.hiltHeightM - S0.tipHeightM) * p;
    slide.anchor = { x: target.position.x + ux * along, y: (target.position.y || 0) + height, z: target.position.z + uz * along };
  }
  BeginSlide(f, target, reason = "parryCatch") {
    const e = f.entity, tf = this.Fighter(target);
    const pushNow = this.held.has("KeyW") || (this.host.MoveIntent?.(e)?.forward > 0);
    const slide = {
      target, progress: S0.startProgress, nextSparkAt: S0.startProgress + S0.sparkEvery,
      pushHeld: !!pushNow, mousePush: 0, pushing: !!pushNow, reason, serial: ++this.serial, anchor: null,
    };
    this.UpdateSlideAnchor(slide, e, target);
    this.SetState(f, "sliding", S0.windowS, "ParryRight"); f.slide = slide;
    this.SetState(tf, "sliding", S0.windowS + 0.1, "WeaponClash"); tf.slideBy = e; tf.buffer = null;
    this.stats.slides++;
    this.Log("slideStart", e, target, { reason, point: { ...slide.anchor } });
    return true;
  }
  StepSlide(f, dt) {
    const e = f.entity, slide = f.slide, target = slide?.target, tf = target && this.Fighter(target);
    if (!slide || !Alive(target) || tf.state !== "sliding") { this.ReleaseSlide(f, "released"); return; }
    const intentFwd = this.host.MoveIntent?.(e)?.forward || 0;
    const pushing = slide.pushHeld || intentFwd > 0.1 || slide.mousePush > 1e-4;
    slide.pushing = pushing;
    const delta = (pushing ? S0.pushRatePerS * dt : -S0.decayPerS * dt) + (slide.mousePush || 0);
    slide.mousePush = 0;
    slide.progress = Clamp(slide.progress + delta, 0, 1);
    if (pushing && delta > 0) {
      // 欺身压进刺刀死角（贴到 closeTargetDistM），把三八式的长枪管废掉。
      const d = Distance(e, target), need = d - S0.closeTargetDistM;
      if (need > 0) {
        const step = Math.min(need, S0.closeStepMps * dt);
        this.Move(e, (target.position.x - e.position.x) / d * step, (target.position.z - e.position.z) / d * step);
      }
    }
    this.UpdateSlideAnchor(slide, e, target);
    while (slide.progress >= slide.nextSparkAt && slide.nextSparkAt <= 1.01) {
      this.Log("slideGrind", e, target, { progress: +slide.progress.toFixed(2), point: { ...slide.anchor } });
      slide.nextSparkAt += S0.sparkEvery;
    }
    if (slide.progress >= 1) { this.SlideSlash(f); return; }
    if (f.t >= f.duration) {
      f.slide = null; tf.slideBy = null;
      this.Repel(e, target, S0.breakRepelM * 0.5); this.Repel(target, e, S0.breakRepelM);
      this.SetState(tf, "stagger", S0.breakS, "Deflected");
      this.SetState(f, "stagger", S0.breakS * 0.75, "WeaponClash");
      this.Log("slideBreak", e, target);
    }
  }
  SlideSlash(f) {
    const e = f.entity, slide = f.slide, target = slide?.target, tf = target && this.Fighter(target);
    if (!slide || !Alive(target) || slide.progress < S0.strikeMinProgress) return false;
    tf.slideBy = null;
    this.SetState(f, "slideSlash", S0.slashS, "Heavy"); f.slide = slide;
    const yaw = Math.atan2(e.position.x - target.position.x, e.position.z - target.position.z);
    e.yaw = yaw;
    this.Damage(target, e, S0.slashDamage, "heavy", { yaw, sweep: -R.bladeSweepRad, reach: W.Dadao.light.reach });
    if (Alive(target)) {
      this.Repel(target, e, S0.slashRepelM);
      this.Stagger(target, e, "Hit", R.staggerS + 0.3, S0.slashPoise);
    }
    this.stats.slideSlashes++;
    this.Log("slideSlash", e, target, { progress: +slide.progress.toFixed(2), point: { ...slide.anchor } });
    return true;
  }
  ReleaseSlide(f, reason) {
    const target = f.slide?.target, tf = target && this.fighters.get(target);
    f.slide = null;
    if (tf?.state === "sliding") { tf.slideBy = null; this.SetState(tf, "stagger", 0.3, "Deflected"); }
    if (f.state === "sliding" || f.state === "slideSlash") this.SetState(f, "idle");
    this.Log("slideRelease", f.entity, target, { reason });
  }
  // ── 玩法三：横枪硬接 · 震断破防（Data_MeleeCombat.MELEE_CRUSH）───────────────────────
  CrushBlockEligible(e, f, target, tf) {
    return this.HasCrush && e === this.Player() && K.weapons.includes(f.weapon)
      && tf?.weapon === "Bayonet" && !f.attack?.finisher
      && ["idle", "charge"].includes(tf.state) && tf.guardPoise > 0
      && Facing(target, e) >= K.guardFacingDot;
  }
  ApplyGuardHit(f, target, tf) {
    const e = f.entity, a = f.attack, heavy = !!a.heavy;
    const drain = heavy ? K.heavyDrain : K.lightDrain;
    tf.guardPoise = Math.max(0, tf.guardPoise - drain);
    tf.lastGuardHit = this.time;
    const d = Distance(e, target) || 1;
    const point = {
      x: target.position.x + (e.position.x - target.position.x) / d * 0.42,
      y: (target.position.y || 0) + 1.26,
      z: target.position.z + (e.position.z - target.position.z) / d * 0.42,
    };
    const sweep = a.sweep || -1;
    if (tf.guardPoise <= 0) {
      this.Repel(target, e, K.crushRepelM);
      tf.poise = 0; tf.crushedBy = e;
      this.SetState(tf, "crushed", K.crushedS, "Pushed");
      tf.crushYaw = Math.atan2(target.position.x - e.position.x, target.position.z - e.position.z);
      tf.crushSide = sweep >= 0 ? 1 : -1;
      tf.nextThink = Math.max(tf.nextThink, this.time + K.crushedS);
      this.SetState(f, "guardBounce", K.crushRecoveryS, "Obstructed"); f.bounceDrag = !!a.drag; f.bounceSweep = sweep;
      this.stats.guardCrushes++;
      this.Log("guardCrush", e, target, { point, sweep });
      return;
    }
    this.Repel(target, e, heavy ? K.heavyRepelM : K.lightRepelM);
    this.SetState(tf, "stagger", K.enemyBraceS, "Deflected");
    tf.nextThink = Math.max(tf.nextThink, this.time + K.enemyBraceS + 0.14);
    this.SetState(f, "guardBounce", K.bounceS, "Obstructed"); f.bounceDrag = !!a.drag; f.bounceSweep = sweep;
    this.stats.guardBlocks++;
    this.Log("guardBlock", e, target, { point, guardPoise: tf.guardPoise, heavy, sweep });
  }
  StepCrushed(f, dt) {
    const e = f.entity, by = f.crushedBy, k = Math.sqrt(Math.max(0, 1 - f.t / f.duration));
    if (by && Alive(by)) {
      const d = Distance(e, by) || 1, ax = (e.position.x - by.position.x) / d, az = (e.position.z - by.position.z) / d;
      this.Move(e, ax * 0.32 * k * dt, az * 0.32 * k * dt);
    }
    e.yaw = (f.crushYaw ?? e.yaw ?? 0) + Math.sin(f.t * Math.PI / 0.72) * 0.28 * k * (f.crushSide || 1);
    if (f.t >= f.duration) { f.crushedBy = null; f.poise = 45; f.guardPoise = K.maxPoise; this.SetState(f, "idle"); }
  }
  /** 攻击动作的归一化播放时间（拖刀延长的接触段按比例拉慢，不是让动作提前播完）。 */
  AttackTime(f) {
    const a = f.attack, active = a.baseActive ?? a.active;
    const t = f.t < a.windup ? f.t / a.windup * a.baseWindup
      : f.t < a.windup + a.active ? a.baseWindup + (f.t - a.windup) / a.active * active
        : a.baseWindup + active + (f.t - a.windup - a.active);
    return t / a.baseDuration;
  }
  Parry(entity = this.Player()) {
    const f = this.Fighter(entity);
    if (f?.state === "aim") this.SetState(f, "idle");   // 拖拽架势里也随时能拨挡
    if (!Alive(entity) || !this.Idle(f) || !W[f.weapon] || f.stamina < R.parryCost) return false;
    // 磕枪顺刃：玩家持大刀按右键迎上正在出刺或挺枪对峙的日军，直接架锁三八式枪管。
    if (entity === this.Player() && this.HasSlide && S0.weapons.includes(f.weapon)) {
      const slideTarget = this.Closest(entity, S0.catchReachM, S0.facingDot);
      const tf = slideTarget ? this.Fighter(slideTarget) : null;
      if (slideTarget && tf?.weapon === "Bayonet" && Facing(slideTarget, entity) >= S0.facingDot
        && (tf.state === "attack" || tf.state === "charge" || (tf.state === "idle" && Distance(entity, slideTarget) <= 1.75))) {
        f.stamina -= R.parryCost;
        return this.BeginSlide(f, slideTarget, tf.state === "attack" ? "parryCatch" : "beatCatch");
      }
    }
    f.stamina -= R.parryCost; f.parryUsed = false;
    const intent = this.host.MoveIntent?.(entity) || {strafe:0};
    const target = this.Closest(entity,W[f.weapon].beatReach,.4);
    const side = intent.strafe || (target ? Math.sin(BearingFrom(entity,target)) : 1);
    this.SetState(f, "parry", R.parryWindowS + R.parryRecoveryS, side < 0 ? "ParryLeft" : "ParryRight");
    f.beatTried = false;
    this.Log("parryStart", entity); return true;
  }
  Opponents(entity) {
    const side = entity === this.Player() ? "nra" : entity.side;
    return [this.Player(), ...this.Soldiers()].filter((target) => Alive(target) && !target.meleeDormant && target !== entity
      && (target === this.Player() ? "nra" : target.side) !== side);
  }

  /**
   * 每一步重建一次的粗网格。白刃全部发生在 engageM(5.5 m) 以内，
   * 「谁在我旁边」不该靠把全场的人扫一遍来回答。
   *
   * 格子边长 CELL_M 6 m，查询扫 3×3 格，所以 6 m 以内的查询都是准的；
   * 超过 6 m 的调用（现在没有）走 Closest 里的全场退路。
   * 键用整数不用字符串：滕县爆炸那一轮量过，字符串键的格点每次要几十万次
   * 字符串拼接与哈希，光这一项就是十几毫秒。
   *
   * indexRank 同时记下每个人在 all 里的次序，分离循环靠它给每一对定发起方。
   */
  BuildIndex(all) {
    const cells = this.indexCells || (this.indexCells = new Map());
    const rank = this.indexRank || (this.indexRank = new Map());
    cells.clear(); rank.clear();
    for (let i = 0; i < all.length; i += 1) {
      const e = all[i];
      rank.set(e, i);
      if (!Alive(e) || !e.position) continue;
      const key = CellKey(e.position.x, e.position.z);
      let list = cells.get(key);
      if (!list) cells.set(key, list = []);
      list.push(e);
    }
    this.indexAt = this.time;
  }

  /** reach 米内的实体（含调用者自己，调用方自己排除）。返回复用数组，别存下来。 */
  Near(position, reach, out = this.nearA || (this.nearA = [])) {
    out.length = 0;
    const cells = this.indexCells;
    if (!cells) return out;
    const cx = Math.floor(position.x / CELL_M), cz = Math.floor(position.z / CELL_M);
    const r2 = reach * reach;
    for (let dx = -1; dx <= 1; dx += 1) for (let dz = -1; dz <= 1; dz += 1) {
      const list = cells.get(CellKeyAt(cx + dx, cz + dz));
      if (!list) continue;
      for (const e of list) {
        const ex = e.position.x - position.x, ez = e.position.z - position.z;
        if (ex * ex + ez * ez <= r2) out.push(e);
      }
    }
    return out;
  }
  Visible(a, b) { return Math.abs((a.position.y || 0) - (b.position.y || 0)) < 1.35 && this.host.LineClear?.(a, b) !== false; }
  BodyBlocker(a, b) {
    return [this.Player(),...this.Soldiers()].find(t => Alive(t) && t!==a && t!==b
      && Math.abs((t.position.y||0)-(a.position.y||0))<1.35
      && Distance(a,t)<Distance(a,b)-.12 && PointSegment(t.position,a.position,b.position)<R.bodyRadiusM);
  }
  WeaponContact(a,b) {
    if (!W[this.Weapon(a)] || !W[this.Weapon(b)] || !this.Visible(a,b) || this.BodyBlocker(a,b)) return false;
    if (Facing(a,b)<.55 || Facing(b,a)<.45) return false;
    const at = Tip(a,a.yaw||0,Math.min(W[this.Weapon(a)].beatReach,1.35));
    const bt = Tip(b,b.yaw||0,1.25);
    return Math.min(PointSegment(at,b.position,bt),PointSegment(bt,a.position,at))<.32;
  }
  TryBeat(f) {
    const e=f.entity;
    const target=this.Closest(e,W[f.weapon].beatReach,.65);
    if (!target || !this.WeaponContact(e,target)) return;
    const tf=this.Fighter(target);
    // A thrust already committed is handled by the reactive contact window.
    if (!['idle','charge','attack'].includes(tf.state) || tf.state==='attack' || tf.beatUntil>this.time) return;
    tf.beatUntil=this.time+R.beatCooldownS; f.parryUsed=true; f.lastParry=this.time;
    f.duration=f.t+R.parrySuccessRecoveryS;
    this.Stagger(target,e,'Deflected',R.beatStaggerS,0);
    this.Log('weaponBeat',e,target);
  }
  /**
   * reach 以内、朝向过 dot、看得见的最近的敌人。
   *
   * 这条是 Step 里每个人每一步都要问一次的（`managed` 那一行），所以走近邻网格、
   * 不建数组、不排序：先按距离淘汰，再判朝向，最后才打通视射线（`Visible` 会
   * 走 host.LineClear 打一条真射线，是这里最贵的一步）。比当前最优还远的直接跳过。
   *
   * 网格还没建（构造完还没跑过 Step）或者要的距离超过一格，退回全场扫描 ——
   * 结果与旧写法逐字相同，只是慢。
   */
  Closest(entity, reach = R.engageM, dot = -1) {
    // Step 之外的调用（玩家按 F 推架、拨挡、试验场「重开」之后的第一次询问）位置可能
    // 刚被改过，网格是上一步的。这些调用一帧最多几次，重建一次 O(N) 就好；
    // 旧写法在这里本来也要新建一个全场数组，不比这个便宜。
    if (!this.stepping) this.BuildIndex([this.Player(), ...this.Soldiers()].filter(Boolean));
    if (this.indexAt < 0 || reach > CELL_M) {
      return this.Opponents(entity).filter((t) => Distance(entity, t) <= reach && Facing(entity, t) >= dot && this.Visible(entity, t))
        .sort((a, b) => Distance(entity, a) - Distance(entity, b))[0] || null;
    }
    const player = this.Player();
    const side = entity === player ? "nra" : entity.side;
    let best = null, bestDistance = Infinity;
    for (const target of this.Near(entity.position, reach, this.nearA)) {
      if (target === entity || !Alive(target) || target.meleeDormant) continue;
      if ((target === player ? "nra" : target.side) === side) continue;
      const distance = Distance(entity, target);
      if (distance >= bestDistance) continue;
      if (Facing(entity, target) < dot || !this.Visible(entity, target)) continue;
      best = target; bestDistance = distance;
    }
    return best;
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
    if (f.state === "lodged" && f.lodge) this.ReleaseLodge(f, "interrupted");
    if ((f.state === "cleave" || f.state === "rip") && f.cleave) this.ReleaseCleave(f, "interrupted");
    if ((f.state === "sliding" || f.state === "slideSlash") && f.slide) this.ReleaseSlide(f, "interrupted");
    // Damage is already applied; repeated hits must not restart falling or rising.
    if (entity === this.Player() && (["fall", "down", "rise", "qte"].includes(f.state) || this.time < f.recoveryUntil)) return;
    f.poise = Math.max(0, f.poise - poise); f.lastHit = this.time; f.pressureBy = from;
    if (f.poise <= 0) { this.SetState(f, "fall", R.knockdownS, "Fall"); this.Log("knockdown", entity, from); }
    else this.SetState(f, "stagger", duration, clip);
    f.nextThink = Math.max(f.nextThink,this.time+duration+.12);
  }
  KnockDown(entity = this.Player(), attacker = null, reason = "impact") {
    const f = this.Fighter(entity);
    if (!Alive(entity) || !f?.weapon || this.Active || (entity === this.Player() && this.time < f.recoveryUntil) || ["fall","down","rise"].includes(f.state)) return false;
    f.poise = 0; f.pressureBy = attacker; f.lastHit = this.time;
    this.SetState(f,"fall",R.knockdownS,"Fall");this.Log("knockdown",entity,attacker,{reason});return true;
  }
  Damage(target, attacker, amount, kind, contact = null) {
    if (this.host.Damage) this.host.Damage(target, attacker, amount, kind, contact || {});
    else { target.health = Math.max(0, target.health - amount); if (target.health <= 0) target.alive = false; }
    this.Log("hit", attacker, target, { amount, attack: kind }); this.stats.hits++;
  }
  BeginBind(a, b, reason) {
    const player = this.Player();
    if (Distance(a,b)>R.bindReachM || !this.WeaponContact(a,b)) return false;
    if (a !== player && b !== player) {
      this.Stagger(a, b, "Deflected", R.parryStaggerS, 12);
      this.Stagger(b, a, "Deflected", R.parryStaggerS, 12); this.Log("npcClash", a, b); return true;
    }
    if (this.Active || !this.CanUse()) return false;
    const opponent = a === player ? b : a;
    const pf = this.Fighter(player);
    const of = this.Fighter(opponent);
    if (this.time<pf.qteUntil || of.qteCount>=Q.perOpponentLimit || this.ImmediateThreat(opponent)) return false;
    if (!this.qte.Begin("standing", opponent, { stamina: pf.stamina / 100, reason, parried: this.time - pf.lastParry < 1, strength: opponent.meleeTraining?.strength ?? 1 })) return false;
    this.SetState(pf, "qte", Q.windowS, "Bind");
    this.SetState(this.Fighter(opponent), "qte", Q.windowS, "Bind");
    of.qteCount++; pf.qteUntil=this.time+Q.cooldownS;
    this.stats.standing++; this.Log("standingQte", player, opponent, { reason }); return true;
  }
  /**
   * 剧本倒地：由任务编排把玩家砸翻在地，并按住 seconds 秒不自己爬起来。
   *
   * 与 KnockDown 的唯一区别在**入口**：不看操作恢复冷却，也不要求他手里正握着
   * 白刃武器 —— 砸下来的是对方的枪托（第一关屋内伏击，docs/Data_FirstLevelRoomAmbush.md）。
   * 倒地 → 地面镜头 → 起身全部走共用状态机；出口是 ScriptedRise 或共用地面 QTE 的结算。
   */
  ScriptedKnockDown(entity, attacker = null, seconds = 0, reason = "scripted") {
    if (!Alive(entity) || this.Active) return false;
    const f = this.Fighter(entity);
    // 任务在砸下来那一瞬才把刺刀挂上（顶上来的是对方那把枪）。不在这里把缓存的武器
    // 对齐的话，下一次 Step 会认成「换了武器」，一句 SetState(idle) 就把刚倒下的人
    // 拽回站姿 —— 症状是掉血了、恍惚起来了，人却还站着（2026-09-16 实拍踩到）。
    f.weapon = this.Weapon(entity);
    f.poise = 0; f.pressureBy = attacker; f.lastHit = this.time;
    f.groundHoldS = Math.max(0, seconds) || null;
    this.SetState(f, "fall", R.knockdownS, "Fall");
    this.Log("knockdown", entity, attacker, { reason, scripted: true });
    return true;
  }
  /**
   * 压住，但还不给连按：他骑上来、刺刀压向胸口（Pressure），玩家还躺着（down）。
   * 只摆对手的姿势与朝向，不动 qteCount / qteUntil，也不碰 QTE 本体；
   * 出口是 BeginScriptedGround 或 EndScriptedGround。
   */
  HoldScriptedGround(player, opponent, seconds = 0) {
    if (!Alive(player) || !Alive(opponent) || this.Active) return false;
    const of = this.Fighter(opponent);
    opponent.yaw = Math.atan2(opponent.position.x - player.position.x, opponent.position.z - player.position.z);
    this.SetState(of, "qte", seconds, "Pressure");
    this.Log("scriptedHold", player, opponent, { seconds });
    return true;
  }
  /**
   * 剧本地面僵持（推刀）：由任务编排强制开一次倒地 QTE。
   *
   * 2026-11-23 起这是倒地 QTE **唯一的入口**（用户：通用的倒地 QTE 删掉，改成特定关卡 / 剧情触发）：
   * 白刃战里被撞倒只是倒地、起身，不再自动开 QTE。不查距离与视线、不看 qteCount / qteUntil，
   * 也不要求玩家手里正握着白刃武器 —— 压上来的是对方的刺刀。
   * 窗口、力度、连按进度与成败结算仍然走共用规则，成功不自动杀敌
   *（这一拍的杀招是赢了之后玩家自己按下去的那一下反捅）。
   *
   * input "press"：一次性按键（第一关 09 灶屋伏击，照《使命召唤：战争世界》的万岁冲锋），
   * 窗口里按一下就赢；杀招由任务在结算那一刻自己下（见 Script_FirstLevelKitchenAmbush）。
   */
  BeginScriptedGround(player, opponent, { windowS = null, strength = 1, reason = "scripted", input = "mash" } = {}) {
    if (!Alive(player) || !Alive(opponent) || this.Active) return false;
    const pf = this.Fighter(player), of = this.Fighter(opponent);
    opponent.yaw = Math.atan2(opponent.position.x - player.position.x, opponent.position.z - player.position.z);
    of.qteCount = 0; pf.qteUntil = -99;
    if (!this.qte.Begin("ground", opponent, { stamina: pf.stamina / 100, reason, strength, windowS, input })) return false;
    const seconds = this.qte.active.windowS;
    this.SetState(pf, "qte", seconds, "Ground");
    this.SetState(of, "qte", seconds, "Pressure");
    of.qteCount++; pf.qteUntil = this.time + Q.cooldownS;
    this.stats.ground++; this.Log("scriptedGroundQte", player, opponent, { reason });
    return true;
  }
  /**
   * 收掉上面那一段压住。QTE 已经接管（或还开着）时什么都不做 —— 那时候出口归它。
   * "qte" 这个状态不会自己超时（StepFighter 直接 return），所以没开成 QTE 的那几条
   * 旁路（压他的人被打死、控制锁兜底超时、检查点重试）必须显式走这里。
   */
  EndScriptedGround(player, opponent = null) {
    if (this.Active) return false;
    const of = opponent ? this.Fighter(opponent) : null;
    if (of?.state === "qte") this.SetState(of, "idle");
    return true;
  }
  /** 剧本起身：把剧本按住的倒地收掉，走共用起身（riseS + 控制恢复窗口）。 */
  ScriptedRise(entity) {
    const f = this.Fighter(entity);
    if (!f || this.Active) return false;
    f.groundHoldS = null;
    if (!["fall", "down", "qte"].includes(f.state)) return false;
    this.SetState(f, "rise", R.riseS, "Rise");
    f.poise = Q.recoveryPoise;
    if (entity === this.Player()) f.recoveryUntil = this.time + R.riseS + Q.controlRecoveryS;
    return true;
  }
  /**
   * 清掉剧本僵持留下的配额与冷却：接下来这一场里，真实几何撞出来的僵持照常可以发生。
   * 只动预算，不改任何人的状态。
   */
  ClearQteBudget(opponents = []) {
    const pf = this.Fighter(this.Player());
    if (pf) pf.qteUntil = -99;
    for (const opponent of opponents) {
      const f = this.fighters.get(opponent);
      if (f) f.qteCount = 0;
    }
  }
  ResolveQte(a) {
    this.stats[a.success ? "successes" : "failures"]++;
    this.Log(a.success ? "qteSuccess" : "qteFailure", this.Player(), a.attacker, { qteKind: a.kind });
    if (!a.success) this.Damage(this.Player(), a.attacker, a.kind === "ground" ? Q.groundFailureDamage : Q.standingFailureDamage, "qte");
  }
  ReleaseQteRecovery(pf, kind) {
    const recoveryS = kind === "ground" ? R.riseS : R.staggerS;
    pf.qteUntil = Math.max(pf.qteUntil, this.time + recoveryS + Q.cooldownS);
    pf.recoveryUntil = Math.max(pf.recoveryUntil, this.time + recoveryS + Q.controlRecoveryS);
    pf.poise = Math.max(pf.poise, Q.recoveryPoise);
  }
  FinishQte(a) {
    const p = this.Player(), pf = this.Fighter(p), of = this.Fighter(a.attacker);
    if (!Alive(p)) { if (of) this.SetState(of, "idle"); return; }
    this.ReleaseQteRecovery(pf, a.kind);
    if (a.success) {
      // 剧本僵持里玩家手上可能根本不是白刃武器（刺刀是对方顶上来的）：
      // 顶开的距离退回共用默认值，不要读一个不存在的武器表。
      // 对方已经死在结算里（剧本一次性按键的反刺）就不推尸体，只收起身。
      if (Alive(a.attacker)) {
        this.Repel(a.attacker, p, W[pf.weapon]?.pushDistance ?? R.pushDistanceM);
        this.SetState(of, "stagger", (a.kind==='ground'?R.riseS:0)+Q.recoveryAdvantageS, "Pushed");
      }
      pf.poise = 65;
      this.SetState(pf, a.kind === "ground" ? "rise" : "idle", a.kind === "ground" ? R.riseS : 0, a.kind === "ground" ? "Rise" : "Guard");
    } else {
      this.Repel(p, a.attacker, 0.32);
      this.SetState(of, "idle"); of.nextThink = this.time + 0.8;
      pf.pressureBy = a.attacker;
      const fall = false; // Ordinary standing failure never chains another forced struggle.
      this.SetState(pf, fall ? "fall" : a.kind === "ground" ? "rise" : "stagger", fall ? R.knockdownS : a.kind === "ground" ? R.riseS : R.staggerS, fall ? "Fall" : a.kind === "ground" ? "Rise" : "Pushed");
    }
    this.held.clear();
  }
  ImmediateThreat(partner) {
    const p=this.Player();
    return this.Opponents(p).find(e=>e!==partner && this.Weapon(e) && !e.meleeTraining?.passive
      && Distance(e,p)<=W[this.Weapon(e)].light.reach+.55 && this.Visible(e,p) && !this.BodyBlocker(e,p)
      && !['stagger','fall','down','rise','qte','lodged','reel','cleaved','sliding','crushed'].includes(this.Fighter(e).state));
  }
  EscapeQte(threat) {
    const a=this.qte.active;if(!a)return;
    const p=this.Player(),pf=this.Fighter(p),of=this.Fighter(a.attacker);
    this.qte.Cancel();this.held.clear();
    this.ReleaseQteRecovery(pf, a.kind);
    this.SetState(pf,a.kind==='ground'?'rise':'idle',a.kind==='ground'?R.riseS:0,a.kind==='ground'?'Rise':'Guard');
    this.SetState(of,'idle');of.nextThink=this.time+R.npcTellS;
    // No victory, damage, teleport or partner stagger; a fresh visible tell follows release.
    for(const e of this.Opponents(p)) {
      const f=this.Fighter(e);
      if(f.state==='idle')f.nextThink=Math.max(f.nextThink,this.time+(a.kind==='ground'?R.riseS:0)+.25);
    }
    this.Log('qteEscape',p,threat,{qteKind:a.kind});
  }
  HandleInput(code, down, repeat = false) {
    if (code === "Blur") {
      this.held.clear(); this.qte.Press(false);
      const f = this.Fighter(this.Player());
      if(f)f.buffer=null;
      if (f?.lodge) f.lodge.held = false;
      if (f?.slide) f.slide.pushHeld = false;
      if (f?.state === "charge") this.SetState(f, "idle");
      return false;
    }
    if (code === "KeyW") {
      if (down) this.held.add("KeyW"); else this.held.delete("KeyW");
    }
    if (this.Active) {
      if (code === "KeyF") this.qte.Press(down, repeat);
      return !["Escape", "Backquote", "AltLeft", "AltRight"].includes(code);
    }
    const pf = this.fighters.get(this.Player());
    // 卡刀：长按 F 拔刀，其余白刃键吞掉（Esc / Alt / ` 照常放行）。按着的键照记，拔出来以后再按 F 才是补刀。
    if (pf?.state === "lodged" || pf?.state === "yank") {
      if (down) this.held.add(code); else this.held.delete(code);
      if (code === "KeyF" && pf.lodge) pf.lodge.held = !!down;
      return !["Escape", "Backquote", "AltLeft", "AltRight"].includes(code);
    }
    // 吃肉顿刀：再按左键（或甩鼠标）触发拖刃拉豁。
    if (pf?.state === "cleave" || pf?.state === "rip") {
      const wasHeld = this.held.has(code);
      if (down) this.held.add(code); else this.held.delete(code);
      if (pf.state === "cleave" && code === "Mouse0" && down && !repeat && !wasHeld && pf.cleave) {
        pf.cleave.wantRip = true;
        if (pf.t >= C.minBiteS) this.Rip(pf);
      }
      return !["Escape", "Backquote", "AltLeft", "AltRight"].includes(code);
    }
    // 磕枪顺刃：按住 W 沿枪管前压推进，推进过半后按左键顺杆劈杀。
    if (pf?.state === "sliding" || pf?.state === "slideSlash") {
      const wasHeld = this.held.has(code);
      if (down) this.held.add(code); else this.held.delete(code);
      if (pf.slide && code === "KeyW") pf.slide.pushHeld = !!down;
      if (pf.state === "sliding" && code === "Mouse0" && down && !repeat && !wasHeld && pf.slide?.progress >= S0.strikeMinProgress) {
        this.SlideSlash(pf);
      }
      return !["Escape", "Backquote", "AltLeft", "AltRight"].includes(code);
    }
    if (!this.CanUse()) return false;
    if (!["Mouse0", "Mouse2", "KeyF"].includes(code)) return this.Blocking && !["Escape", "Backquote", "AltLeft", "AltRight"].includes(code);
    if (!down) {
      this.held.delete(code);
      if (code === "Mouse0") this.AttackUp();
      return code !== "KeyF";
    }
    if (repeat || this.held.has(code)) return true;
    // F 负责卡刀补刀与破防抢步处决；不归白刃管的 F 交回通用交互。
    if (code === "KeyF") {
      if (!this.Blocking && this.Finish()) { this.held.add(code); return true; }
      return this.Blocking;
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
    if ((f.state !== "attack" || !f.attack.locked) && !["lodged", "reel", "cleaved", "sliding", "crushed"].includes(f.state)) {
      e.yaw = (e.yaw || 0) + Clamp(Wrap(yaw - (e.yaw || 0)), -R.npcTurnRate * dt, R.npcTurnRate * dt);
    }
    if (f.state !== "idle") return;
    const training = e.meleeTraining || {};
    if (training.passive || e.meleeDormant) return;
    // 玩家倒地：上前候着等他起身（通用倒地 QTE 已撤，只有剧本能开，见 BeginScriptedGround）。
    if (target === this.Player() && ["fall", "down"].includes(tf.state)) {
      if (d > 1.05) this.AdvanceNpc(f, target, dt, 1);
      return;
    }
    if (tf.state === "qte") { this.CircleNpc(f,target,dt,f.role?.angle||45,2.4); return; }
    if (training.kind === "bind") {
      if (tf.state === "attack" && tf.attack?.heavy && d < R.bindReachM && this.time >= f.nextThink) this.Attack(e, true);
      return;
    }
    // 可读动作触发反应；训练时序项目不给额外闪避。无全知百分百拨挡。
    if (!training.kind || training.kind === "duel" || training.kind === "observe") {
      if (tf.actionSerial!==f.observedAction) { f.observedAction=tf.actionSerial; f.observedAt=this.time; }
      if (tf.state === "attack" && !tf.attack?.connected && this.time-f.observedAt>=R.npcReactionS
        && tf.t < tf.attack.windup && d <= tf.attack.reach && f.actionSerial % 3 === 1) { this.Parry(e); return; }
    }
    const role = f.role && f.role.target === target ? f.role : null;
    if (role?.kind === "flank") { this.FlankNpc(f, target, dt, role, spec); return; }
    const preferred = spec.light.reach - 0.28;
    if (d > preferred + 0.12) this.AdvanceNpc(f, target, dt, 1);
    else if (d < spec.minReach + 0.2 && this.time >= f.nextThink) {
      if (this.Push(e)) { f.nextThink = this.time + 1.25; return; }
      this.AdvanceNpc(f, target, dt, -1);
    } else if (tf.state === "charge" && d < preferred && training.kind !== "timing") this.AdvanceNpc(f, target, dt, -1);
    if (this.time >= f.nextThink && d < spec.light.reach + 0.08 && Facing(e, target) > 0.9 && this.CanNpcAttack(f,target)) {
      // 正面牵制者隔几次亮一下起手骗拨挡，给侧翼制造突刺机会（佯攻骗刺）。
      if (role?.kind === "front" && tf.state === "idle" && (f.frontActions = (f.frontActions || 0) + 1) % G.feintEvery === 0) {
        this.Feint(e); f.nextThink = this.time + G.feintS + G.feintRecoveryS; return;
      }
      this.Attack(e, training.kind === "timing" || (f.actionSerial % 4 === 2 && d > 1.45));
      f.nextThink = this.time + 1.5 + (training.slot || 0) * 0.19;
    }
  }
  /** 侧翼：绕到目标侧后方的位置，目标没看着自己或正被牵制时才突刺；被正面盯住就退到够不着的距离。 */
  FlankNpc(f, target, dt, role, spec) {
    const e = f.entity, tf = this.Fighter(target), d = Distance(e, target);
    const exposed = Facing(target, e) < G.flankAttackDot;
    const committed = ["attack", "parry", "push", "stagger", "charge"].includes(tf.state);
    const open = exposed || committed || this.time>=f.nextThink;
    const radius = spec.light.reach - G.flankRadiusInsetM;
    if (open && this.time >= f.nextThink && d < spec.light.reach + 0.08 && Facing(e, target) > 0.9 && this.CanNpcAttack(f,target)) {
      this.Attack(e, exposed && d > 1.45 && f.actionSerial % 3 === 0);
      f.nextThink = this.time + G.flankAttackCooldownS; return;
    }
    if (!open && d < spec.minReach + 0.35 && this.time >= f.nextThink && this.Push(e)) { f.nextThink = this.time + 1.25; return; }
    this.CircleNpc(f, target, dt, role.angle, open ? radius : radius + G.flankStandoffM);
  }
  CanNpcAttack(f,target) {
    if(this.BodyBlocker(f.entity,target)) { this.CircleNpc(f,target,1/60,f.role?.angle||40,W[f.weapon].light.reach-.2);return false; }
    // Schedule before launch. Windups may overlap, contact opportunities stay readable.
    const contactAt=this.time+R.npcTellS;
    for(const other of this.fighters.values()) {
      if(other===f || other.entity===this.Player() || other.target!==target || other.state!=='attack')continue;
      const at=this.time+other.attack.windup-other.t;
      if(Math.abs(contactAt-at)<.38)return false;
    }
    return true;
  }
  /** 沿目标周围的圆弧绕行到 angleDeg 方位（相对目标正面），同时把半径收到 radius；不穿过目标。 */
  CircleNpc(f, target, dt, angleDeg, radius) {
    const e = f.entity, ty = target.yaw || 0;
    const r = Distance(e, target) || 1, cur = BearingFrom(target, e);
    const maxAng = R.npcSpeed * G.circleSpeedScale / Math.max(r, 0.8) * dt;
    const next = cur + Clamp(Wrap(angleDeg * Math.PI / 180 - cur), -maxAng, maxAng);
    const nextR = r + Clamp(radius - r, -R.npcSpeed * dt, R.npcSpeed * dt);
    const nx = target.position.x + (-Math.sin(ty) * Math.cos(next) - Math.cos(ty) * Math.sin(next)) * nextR;
    const nz = target.position.z + (-Math.cos(ty) * Math.cos(next) + Math.sin(ty) * Math.sin(next)) * nextR;
    const mx = nx - e.position.x, mz = nz - e.position.z, m = Math.hypot(mx, mz);
    if (m < 1e-4) return;
    const cap = Math.min(m, R.npcSpeed * dt);
    this.Move(e, mx / m * cap, mz / m * cap); f.move = 1;
  }
  /**
   * 多打一分工：同一目标的两名以上 NPC 里，目标正面最对着的那个做「正面牵制」，
   * 其余按现有方位就近领一个侧翼槽位（±85° 起，人多再往后方展开）。
   * 目标转向谁，谁就在下一次刷新变成正面，原正面则绕去侧翼——这是围攻压力的来源。
   */
  Coordinate() {
    const player = this.Player(), groups = new Map();
    for (const f of this.fighters.values()) {
      const e = f.entity, kind = e.meleeTraining?.kind;
      if (e === player || !e.meleeCombat || !f.target || !Alive(e) || (kind && !["duel", "observe"].includes(kind))) { f.role = null; continue; }
      if (!groups.has(f.target)) groups.set(f.target, []);
      groups.get(f.target).push(f);
    }
    for (const [target, group] of groups) {
      if (group.length < 2) { group[0].role = null; continue; }
      const tf = this.Fighter(target);
      if (this.time < (tf.roleRefreshAt || 0) && group.every((f) => f.role?.target === target)) continue;
      tf.roleRefreshAt = this.time + G.roleRefreshS;
      const facing = new Map(group.map((f) => [f, Facing(target, f.entity)]));
      const best = [...group].sort((a, b) => facing.get(b) - facing.get(a))[0];
      let front = group.find((f) => f.role?.kind === "front" && f.role.target === target) || null;
      if (!front || facing.get(best) > facing.get(front) + G.roleHysteresis) front = best;
      if (front.role?.kind !== "front" || front.role.target !== target) this.Log("roleFront", front.entity, target);
      front.role = { kind: "front", target, angle: 0 };
      // 槽位成对给（左右各一），单个侧翼也能就近选边，不必绕过整个正面。
      const free = G.flankSlotsDeg.slice(0, Math.ceil((group.length - 1) / 2) * 2);
      const AngleGap = (deg, bearing) => Math.abs(Wrap((deg - bearing) * Math.PI / 180));
      for (const f of group.filter((g) => g !== front).sort((a, b) => Math.abs(BearingFrom(target, b.entity)) - Math.abs(BearingFrom(target, a.entity)))) {
        const bearing = BearingFrom(target, f.entity) * 180 / Math.PI;
        const slot = free.reduce((pick, deg) => AngleGap(deg, bearing) < AngleGap(pick, bearing) ? deg : pick, free[0]);
        free.splice(free.indexOf(slot), 1);
        if (f.role?.kind !== "flank" || f.role.target !== target) this.Log("roleFlank", f.entity, target, { angle: slot });
        f.role = { kind: "flank", target, angle: slot };
      }
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
    if(f.buffer && this.time>f.buffer.expires) f.buffer=null;
    if(f.state==='idle' && f.buffer) {
      const released=f.buffer.released;f.buffer=null;
      this.AttackDown(e);if(released)this.AttackUp(e);
    }
    if (f.state === "idle") { f.stamina = Math.min(100, f.stamina + R.staminaRecovery * dt); }
    if (this.time - f.lastHit > 1.5 && f.state === "idle") f.poise = Math.min(100, f.poise + R.poiseRecovery * dt);
    if (this.HasCrush && e !== this.Player() && f.state === "idle" && this.time - f.lastGuardHit > K.regenDelayS) {
      f.guardPoise = Math.min(K.maxPoise, f.guardPoise + K.regenPerS * dt);
    }
    if (f.state === "qte") return;
    if (f.state === "lodged") { if (e === this.Player()) this.StepLodge(f, dt); return; }
    if (f.state === "yank") { if (f.t >= f.duration) { f.lodge = null; this.SetState(f, "idle"); } return; }
    if (f.state === "reel") { this.StepReel(f, dt); return; }
    if (f.state === "cleave") { if (e === this.Player()) this.StepCleave(f, dt); return; }
    if (f.state === "cleaved") { if (f.t >= f.duration) { f.cleavedBy = null; this.SetState(f, "idle"); } return; }
    if (f.state === "rip") {
      if (f.t >= f.duration) {
        const wasDrag = !!f.cleave?.drag; f.cleave = null; this.SetState(f, "idle");
        if (wasDrag && e === this.Player() && this.Drag && this.held.has("Mouse0")) this.BeginAim(f, true);
      }
      return;
    }
    if (f.state === "sliding") { if (e === this.Player()) this.StepSlide(f, dt); else if (f.t >= f.duration) { f.slideBy = null; this.SetState(f, "idle"); } return; }
    if (f.state === "slideSlash") {
      if (f.t >= f.duration) {
        f.slide = null; this.SetState(f, "idle");
        if (e === this.Player() && this.Drag && this.held.has("Mouse0")) this.BeginAim(f, true);
      }
      return;
    }
    if (f.state === "guardBounce") {
      if (f.t >= f.duration) {
        const wasDrag = !!f.bounceDrag; f.bounceDrag = false; this.SetState(f, "idle");
        if (wasDrag && e === this.Player() && this.Drag && this.held.has("Mouse0") && !f.buffer) this.BeginAim(f, true);
      }
      return;
    }
    if (f.state === "crushed") { this.StepCrushed(f, dt); return; }
    if (f.state === "aim") { this.StepAim(f, dt); return; }
    if(f.state==='contact' && f.t>=f.duration) {
      const other=f.contactTarget;
      if(!Alive(other) || !this.BeginBind(e,other,f.contactReason||'visibleWeaponBrace')) {
        this.SetState(f,'stagger',.22,'WeaponClash');
        const tf=this.Fighter(other);if(tf?.state==='contact')this.SetState(tf,'stagger',.22,'WeaponClash');
      }
      return;
    }
    if(f.state==='charge' && !f.feint && f.t>R.maxHeavyHoldS) {
      this.SetState(f,'stagger',.45,'Obstructed');this.Log('chargeFatigue',e);return;
    }
    if(f.state==='parry' && !f.beatTried && f.t>=R.beatContactS) { f.beatTried=true;this.TryBeat(f); }
    if (f.state === "charge" && f.feint && f.t >= f.duration) { this.SetState(f, "idle"); return; }
    if (f.state === "attack") {
      const a = f.attack;
      // Plant the NPC's forward foot before the point arrives. Tracking until the
      // first contact frame made normal walking too slow to clear the body radius.
      // 补刀：起手里自动转向踉跄的那个人。
      if (a.finisher && Alive(a.finisher) && !a.connected && f.t < a.windup + a.active) {
        const want = Math.atan2(e.position.x - a.finisher.position.x, e.position.z - a.finisher.position.z);
        if (f.t < a.windup) e.yaw = (e.yaw || 0) + Clamp(Wrap(want - (e.yaw || 0)), -L.finishTurnRate * dt, L.finishTurnRate * dt);
        // 抢上一步：踉跄的人在往后退，补刀要跟进到刀够得着的距离。
        const d = Distance(e, a.finisher), need = d - (a.reach - L.finishStandoffM);
        if (need > 0) { const step = Math.min(need, L.finishLungeMps * dt); this.Move(e, -Math.sin(want) * step, -Math.cos(want) * step); }
      }
      const aimUntil=a.windup-(e===this.Player()?0:R.npcAimCommitLeadS);
      // 拖拽挥砍的刀跟着视角（按着左键时视角是定住的），不走 NPC 的锁定修正。
      if (a.direction) a.yaw = e.yaw || 0;
      else if(f.t<aimUntil) a.yaw=e.yaw||0;
      else if(!a.locked) { a.locked=true; a.lockYaw=a.yaw; }
      else a.yaw=a.lockYaw+Clamp(Wrap((e.yaw||0)-a.lockYaw),-R.attackCorrectionRad,R.attackCorrectionRad);
      if (f.t >= a.windup && f.t <= a.windup + a.active && !a.connected) this.ResolveContact(f);
      if (f.state !== "attack") return;
      const lunge = a.lunge * Clamp((f.t - a.windup) / a.active, 0, 1);
      if (lunge > a.lungeDone) {
        this.Move(e, -Math.sin(a.yaw) * (lunge - a.lungeDone), -Math.cos(a.yaw) * (lunge - a.lungeDone)); a.lungeDone = lunge;
      }
      if (f.t >= f.duration) {
        if (!a.connected) { this.stats.misses++; this.Log("miss", e); }
        this.SetState(f, "idle");
        // 拖拽挥砍：左键还按着就回到架势，接着甩下一刀。
        if (a.drag && e === this.Player() && this.held.has("Mouse0")) this.BeginAim(f, true);
      }
      return;
    }
    if (f.state === "push" && !f.hit && f.t >= 0.16) {
      f.hit = true; const t = f.target;
      if (Alive(t) && Distance(e, t) <= W[f.weapon].pushReach + 0.1 && Facing(e, t) > 0.5 && this.Visible(e, t)) {
        const tf=this.Fighter(t);
        if(tf.pushUntil>this.time || tf.state==='attack' && tf.attack?.heavy && tf.t+dt>=tf.attack.windup && tf.t<tf.attack.windup+tf.attack.active) {
          this.Log('pushResisted',e,t);return;
        }
        tf.pushUntil=this.time+R.pushImmunityS;
        this.Repel(t, e, W[f.weapon].pushDistance);
        this.Stagger(t, e, "Pushed", R.pushStaggerS, 42);
        f.duration=f.t+R.pushSuccessRecoveryS;
        this.stats.pushes++; this.Log("push", e, t);
      }
    }
    if (f.state === "fall" && f.t >= f.duration) {
      // 剧本按住的倒地（ScriptedKnockDown）用它自己的时长；普通倒地仍是 1.7 s。
      this.SetState(f, "down", f.groundHoldS ?? 1.7, "Ground"); return;
    }
    if (f.state === "down" && f.t >= f.duration) {
      f.groundHoldS = null;
      this.SetState(f, "rise", R.riseS, "Rise");
      f.poise = e === this.Player() ? Q.recoveryPoise : 50;
      if (e === this.Player()) f.recoveryUntil = this.time + R.riseS + Q.controlRecoveryS;
      return;
    }
    if (!["idle", "charge", "down"].includes(f.state) && f.t >= f.duration) this.SetState(f, "idle");
  }
  ResolveContact(f) {
    const e = f.entity, a = f.attack, weapon = W[f.weapon];
    const u=Clamp((f.t-a.windup)/a.active,0,1), blade=f.weapon==='Dadao';
    // 刀刃这一刀扫过的半幅（带符号，Alt 分镜左右镜像）：接触点与断肢选段共用同一个数。
    const sweep=a.direction?a.sweep:blade?(f.clip.endsWith('Alt')?-1:1)*R.bladeSweepRad:0;
    const yaw=a.yaw+sweep*(1-2*u);
    const end=Tip(e,yaw,blade?a.reach:.66+(a.reach-.66)*Math.sin(u*Math.PI/2));
    const start=Tip(e,yaw,blade?.42:Math.max(.6,(a.previousReach??.66)));
    const previous=a.previousTip || end;
    a.previousTip=end;a.previousReach=.66+(a.reach-.66)*Math.sin(u*Math.PI/2);
    const environment=this.host.SweepEnvironment?.(e,start,end,previous);
    if(environment) {
      a.connected=true;this.SetState(f,'stagger',a.heavy?.55:.3,'Obstructed');this.Log('environment',e,null,{point:environment});return;
    }
    const Swept=t=>PointSegment(t.position,start,end)<=R.bodyRadiusM+R.bladeRadiusM || PointSegment(t.position,previous,end)<=R.bodyRadiusM+R.bladeRadiusM;
    const targets = this.Opponents(e).filter((t) => Distance(e, t) <= a.reach+.1 && Facing(e,t,a.yaw)>.4 && this.Visible(e,t) && Swept(t)).sort((b, c) => Distance(e, b) - Distance(e, c));
    // When point geometry cannot extend at close range, the stock/blade visibly catches.
    const cramped=this.Closest(e,weapon.minReach,.8);
    if(!targets.length && cramped && this.WeaponContact(e,cramped)) {
      a.connected=true;this.SetState(f,'stagger',.3,'WeaponClash');this.Log('tooClose',e,cramped);return;
    }
    const target = targets[0];
    if (!target) {
      // 鞭尸：玩家这一刀没扫到活人，前面也没有活人快要扫到，才交给宿主按视线找尸体
      //（Script_Dismemberment.PickWhipCorpse）。尸体不进 Opponents：它不格挡、不踉跄、
      // 不挡刀，只吃伤害结算（血、断肢）。AI 的刀不砍尸体。
      if (e !== this.Player() || this.Closest(e, a.reach + .5, .4)) return;
      const corpse = this.host.WhipCorpse?.(e, { yaw: a.yaw, sweep, reach: a.reach });
      if (!corpse) return;
      a.connected = true;
      this.Damage(corpse.soldier, e, a.damage, a.heavy ? "heavy" : "light",
        { yaw: a.yaw, sweep, reach: a.reach, start, end, previous, shapeId: corpse.shapeId, point: corpse.point || null, corpse: true });
      return;
    }
    const tf = this.Fighter(target), distance = Distance(e, target);
    const blocker=this.BodyBlocker(e,target);
    if(blocker) {a.connected=true;this.SetState(f,'stagger',.32,'Obstructed');this.Log('bodyObstruction',e,blocker);return;}
    if (tf.state === "qte") return;
    // 磕枪顺刃：玩家挥大刀迎击正在突刺的刺刀手，刀口直接架锁在三八式枪管上。
    if (this.HasSlide && e === this.Player() && S0.weapons.includes(f.weapon) && tf.weapon === "Bayonet"
      && tf.state === "attack" && tf.t <= tf.attack.windup + tf.attack.active
      && distance <= S0.catchReachM && Facing(e, target) >= S0.facingDot && Facing(target, e) >= S0.facingDot) {
      a.connected = true;
      this.BeginSlide(f, target, "attackClash");
      return;
    }
    if (tf.state === "parry" && tf.t <= R.parryWindowS && !tf.parryUsed && Facing(target, e) >= R.parryFacingDot) {
      tf.parryUsed = true; tf.lastParry = this.time;
      tf.duration=tf.t+R.parrySuccessRecoveryS;
      a.connected = true; this.Stagger(e, target, "Deflected", R.parryStaggerS, 17);
      this.stats.parries++; this.Log("parry", target, e); return;
    }
    const trainingKind = target.meleeTraining?.kind || e.meleeTraining?.kind || null;
    const hardBrace = (!this.HasCrush || trainingKind === "bind") && a.heavy
      && ((tf.state === "attack" && tf.attack?.heavy && tf.t < tf.attack.windup + tf.attack.active) || (tf.state === "charge" && tf.t >= R.chargeMinS));
    if (distance <= R.bindReachM && hardBrace && Facing(target, e) > 0.65 && W[tf.weapon]) {
      if(this.WeaponContact(e,target)) {
        a.connected=true;
        const reason=tf.state==='charge'?'chargedWeaponBrace':'simultaneousHeavyContact';
        this.SetState(f,'contact',Q.contactHoldS,'WeaponClash');f.contactTarget=target;f.contactReason=reason;
        this.SetState(tf,'contact',Q.contactHoldS,'WeaponClash');tf.contactTarget=e;tf.contactReason=reason;this.Log('weaponClash',e,target);return;
      }
    }
    if (distance < weapon.minReach) { this.Log("tooClose", e, target); a.connected = true; this.SetState(f,'stagger',.3,'WeaponClash'); return; }
    // 横枪硬接：正面戒备的日军横起三八式硬挡大刀，爆火星削减护枪架势；侧翼绕开或收招破绽不挡。
    if (this.CrushBlockEligible(e, f, target, tf)) {
      a.connected = true;
      this.ApplyGuardHit(f, target, tf);
      return;
    }
    a.connected = true;
    // 踉跄（拔刀后）或破防失衡（护枪被震断后）的对手挨上任何一刀都是致命重创。
    const reelHit = tf.state === "reel" && tf.reelBy === e;
    const crushedHit = tf.state === "crushed" && tf.crushedBy === e;
    const amount = crushedHit ? Math.max(a.damage, K.finishDamage, (target.health ?? 100) + 1)
      : reelHit ? Math.max(a.damage, (target.health ?? 100) + 1) : a.damage;
    if (crushedHit) tf.crushedBy = null;
    this.Damage(target, e, amount, a.heavy ? "heavy" : "light", { yaw: a.yaw, sweep, reach: a.reach, start, end, previous });
    if (crushedHit) { this.stats.crushFinishes++; this.Log("crushFinish", e, target, { sweep }); }
    else if (reelHit) { this.stats.finishes++; this.Log("finish", e, target); }
    if (Alive(target) && this.LodgeEligible(e, f, target)) { this.BeginLodge(f, target); return; }
    if (Alive(target) && this.CleaveEligible(e, f, target)) { this.BeginCleave(f, target, { sweep }); return; }
    if (Alive(target)) {
      const protectedRecovery=this.time<tf.interruptUntil;
      this.Stagger(target,e,'Hit',a.heavy?R.staggerS:protectedRecovery?.12:.32,a.poise);
      tf.interruptUntil=this.time+R.hitInterruptCooldownS;
      tf.nextThink=Math.max(tf.nextThink,this.time+.45);
    }
  }
  Update(dt) {
    if (!Number.isFinite(dt) || dt <= 0 || !this.enabled) return;
    // 拖拽挥砍与吃肉拉豁／顺杆前压：记录最近 windowS 秒的鼠标位移。
    const m = this.mouse, frame = m.pending, pf = this.fighters.get(this.Player());
    m.strokes.push({ t: this.time + dt, dt, x: frame.x, y: frame.y });
    while (m.strokes.length && m.strokes[0].t < this.time + dt - D.windowS) m.strokes.shift();
    if (pf?.state === "aim") {
      m.aim.x = Clamp(m.aim.x + frame.x, -D.aimRadiusPx, D.aimRadiusPx); m.aim.y = Clamp(m.aim.y + frame.y, -D.aimRadiusPx, D.aimRadiusPx);
    }
    if (pf?.state === "cleave" && pf.cleave && pf.t >= C.minBiteS) {
      pf.cleave.pullX += frame.x; pf.cleave.pullY += frame.y;
    }
    if (pf?.state === "sliding" && pf.slide && frame.y > 0) {
      pf.slide.mousePush = (pf.slide.mousePush || 0) + frame.y * S0.mousePushPerPx;
    }
    frame.x = 0; frame.y = 0;
    let left = Math.min(dt, 0.25);
    while (left > 1e-8) { const step = Math.min(left, R.maxStepS); this.Step(step); left -= step; }
  }
  Step(dt) {
    this.time += dt;
    const player = this.Player();
    // 赢下来之后对方死在结算里（剧本一次性按键的反刺）不算「人没了」：结算那 0.6 s 与起身照常走完。
    const won = this.qte.active?.phase === "resolve" && this.qte.active.success === true;
    if (this.Active && (!Alive(player) || (!Alive(this.qte.active.attacker) && !won))) this.Cancel("participantGone");
    if(this.Active) {const threat=this.ImmediateThreat(this.qte.active.attacker);if(threat)this.EscapeQte(threat);}
    const all = [player, ...this.Soldiers()].filter(Boolean);
    this.BuildIndex(all);
    this.stepping = true;
    const live = this.indexRank;
    for (const [entity] of this.fighters) if (!live.has(entity)) this.fighters.delete(entity);
    for (const entity of all) {
      const f = this.Fighter(entity), weapon = this.Weapon(entity);
      if (weapon !== f.weapon) { this.SetState(f, "idle"); f.weapon = weapon; f.buffer=null;if (entity === player) this.held.clear(); }
      const training = entity.meleeTraining;
      const eligible = entity !== player && Alive(entity) && !entity.meleeDormant && !!weapon && !entity.unarmed && !entity.scriptDefensive && !entity.scriptedNoncombatant;
      const managed = eligible && (!!training || !!this.Closest(entity) || f.state !== "idle");
      if (entity !== player) entity.meleeCombat = managed ? this.Pose(f) : null;
      if (entity === player || managed) {
        this.StepFighter(f, dt);
        if (managed) this.NpcThink(f, dt);
      }
    }
    this.Coordinate();
    // 互相分开：只有「正在白刃的那个人」和他 separationM(0.62 m) 以内的邻居要处理。
    //
    // 旧写法是全场所有人两两配对。第一关前沿有 221 个人，就是每一步 24 000 对；
    // 而 Update 按 maxStepS(1/90 s) 切子步，帧越慢切得越多 —— 25 fps 时一帧跑四步，
    // 将近十万次配对。实测这一条把 Script_Main 的「输入」这一桶顶到 7.3 ms/帧，
    // 而且是正反馈：越卡越慢。现在从网格里取邻居，没在白刃的人一次都不进循环。
    for (const a of all) {
      if (!a.meleeCombat || !Alive(a)) continue;
      const rankA = this.indexRank.get(a);
      for (const b of this.Near(a.position, R.separationM, this.nearB)) {
        if (b === a || !Alive(b)) continue;
        // 每一对只算一次：两个人都在白刃时，由 all 里靠前的那个发起。
        if (b.meleeCombat && this.indexRank.get(b) < rankA) continue;
        if (!this.Visible(a, b)) continue;
        const distance = Distance(a, b);
        if (distance >= R.separationM) continue;
        const dx = distance > 0.001 ? (b.position.x - a.position.x) / distance : 1;
        const dz = distance > 0.001 ? (b.position.z - a.position.z) / distance : 0;
        const amount = Math.min((R.separationM - distance) * 0.5, dt * 1.2);
        if (a !== player) this.Move(a, -dx * amount, -dz * amount);
        if (b !== player) this.Move(b, dx * amount, dz * amount);
      }
    }
    this.qte.Update(dt);
    const struggle = this.qte.active;
    if (struggle?.phase === "input" && struggle.t - (struggle.lastSound || -1) > .5 + struggle.progress * .6) {
      struggle.lastSound = struggle.t;
      this.host.Event?.({kind:"struggle", progress:struggle.progress, qteKind:struggle.kind}, player, struggle.attacker);
    }
    for (const entity of all) if (entity !== player && entity.meleeCombat) entity.meleeCombat = this.Pose(this.Fighter(entity));
    this.stepping = false;
  }
  Pose(f) {
    if (!f?.weapon) return null;
    let clip = f.clip || (f.move > 0 ? "Advance" : f.move < 0 ? "Retreat" : "Guard");
    if (f.state === "idle") clip = f.move > 0 ? "Advance" : f.move < 0 ? "Retreat" : "Guard";
    const a = this.qte.active;
    if (f.state === "qte" && a) {
      // 倒地僵持输了，压在上面的人是**捅下去**，不是被推开：保持 Pressure 姿势直到结算走完。
      if (a.phase === "resolve") clip = a.kind === "ground" ? (f.entity === this.Player() ? a.success ? "GroundWin" : "GroundLose" : a.success ? "Pushed" : "Pressure") : a.success === (f.entity === this.Player()) ? "BindWin" : "BindLose";
    }
    const phase = f.attack ? f.t < f.attack.windup ? "windup" : f.t < f.attack.windup + f.attack.active ? "active" : "recovery" : f.state;
    const attackTime=f.attack ? this.AttackTime(f) : null;
    const result = { managed: true, weapon: f.weapon, state: f.state, phase, clip: `${f.weapon}${clip}`, action: clip,
      t: f.t, duration: f.duration, normalized: f.duration ? Clamp(f.t / f.duration, 0, 1) : (f.t % 1),
      animationNormalized:attackTime ?? (f.state === "parry" ? f.t/(R.parryWindowS+R.parryRecoveryS) : null),
      transition:f.previousPose && this.time-f.transitionAt<.07 ? {from:f.previousPose,mix:Clamp((this.time-f.transitionAt)/.07,0,1)} : null,
      weaponYawOffset:f.attack?.locked?Wrap(f.attack.yaw-(f.entity.yaw||0)):0,
      stamina: f.stamina, poise: f.poise, actionSerial: f.actionSerial,
      parryActive: f.state === "parry" && f.t <= R.parryWindowS && !f.parryUsed,
      progress: a?.progress ?? 0.5, pulse: a?.pulse || 0, qteKind: a?.kind || null,
      qteResolve: a?.phase === "resolve" ? a.resolveT / Q.resolveS : 0,
      focusYaw: a && f.entity === this.Player() ? Math.atan2(f.entity.position.x - a.attacker.position.x, f.entity.position.z - a.attacker.position.z) : null,
      focusPitch: a?.kind === "ground" ? .70 : -.28,
      move: f.move, targetId: f.target?.id ?? null, role: f.role?.kind || null,
    };
    if (f.attack?.direction) {
      const stroke = this.StrokeOf(f), [s0, s1] = stroke.split;
      const weight = this.RollWeight(attackTime, s0, s1);
      result.strokeSplit = stroke.split; result.strokeReverse = stroke.reverse;
      result.swingRoll = stroke.roll * weight; result.swingMirror = stroke.mirror ? weight : 0;
      result.direction = f.attack.direction.id; result.attackKind = f.attack.kind;
    }
    if (f.state === "aim" && f.entity === this.Player()) {
      // 拖拽架势：刀举在蓄力顶点，整副手臂跟着鼠标往那边偏、往那边歪一点。
      const ax = this.mouse.aim.x / D.aimRadiusPx, ay = this.mouse.aim.y / D.aimRadiusPx;
      Object.assign(result, { aimOffset: { x: ax * D.aimOffsetM, y: ay * D.aimOffsetM }, swingRoll: -ax * D.aimRollRad, direction: this.DragPreview() });
    }
    if (f.attack?.finisher) result.finisher = true;
    if ((f.state === "lodged" || f.state === "yank") && f.lodge && f.entity === this.Player()) {
      // 第一人称：刀定在砍进去那一帧，拔刀时顺着刀路往回抽、回到架势。
      const L0 = f.lodge, p = f.state === "yank" ? Smooth(f.t / f.duration) : 0;
      const weight = L0.split ? this.RollWeight(L0.n, ...L0.split) * (1 - p) : 0;
      Object.assign(result, { clip: `${f.weapon}${L0.clip}`, action: L0.clip, animationNormalized: L0.n * (1 - p),
        strokeSplit: L0.split, strokeReverse: L0.reverse, swingRoll: L0.roll * weight, swingMirror: L0.mirror ? weight : 0, weaponYawOffset: 0,
        lodge: { progress: L0.progress, held: L0.held, yank: p, anchor: L0.anchor, serial: L0.serial, strain: f.state === "yank" ? 1 - p : Math.max(L0.progress, L0.held ? 0.6 : 0.25) } });
    } else if (f.state === "lodged") {
      Object.assign(result, { clip: `${f.weapon}Hit`, action: "Hit", animationNormalized: 0.32 + Math.sin(this.time * 41) * 0.02 });
    } else if ((f.state === "cleave" || f.state === "rip") && f.cleave && f.entity === this.Player()) {
      const C0 = f.cleave, ripP = f.state === "rip" ? Smooth(f.t / f.duration) : 0;
      const biteP = f.state === "cleave" ? Clamp(f.t / f.duration, 0, 1) : 1;
      const nBite = Clamp(C0.n0 + C.crawlN * biteP, 0, 0.85);
      const n = f.state === "rip" ? nBite + (1 - nBite) * ripP : nBite;
      const weight = C0.split ? this.RollWeight(n, ...C0.split) : 0;
      const pulled = Clamp(Math.hypot(C0.pullX, C0.pullY) / C.ripStrokePx, 0, 1);
      Object.assign(result, {
        clip: `${f.weapon}${C0.clip}`, action: C0.clip, animationNormalized: n,
        strokeSplit: C0.split, strokeReverse: C0.reverse, swingRoll: C0.roll * weight, swingMirror: C0.mirror ? weight : 0, weaponYawOffset: 0,
        cleave: { progress: pulled, bite: biteP, rip: ripP, anchor: C0.anchor, serial: C0.serial, sweep: C0.sweep },
        lodge: { progress: pulled, held: true, yank: f.state === "rip" ? ripP : 1 - C.lockBlend * (1 - biteP * 0.3), anchor: C0.anchor, serial: C0.serial, strain: f.state === "rip" ? 0 : 0.45 + pulled * 0.45 },
      });
    } else if (f.state === "cleaved") {
      Object.assign(result, { clip: `${f.weapon}Hit`, action: "Hit", animationNormalized: 0.28 + Math.sin(this.time * 48) * 0.025 });
    } else if ((f.state === "sliding" || f.state === "slideSlash") && f.slide && f.entity === this.Player()) {
      const S1 = f.slide, slashP = f.state === "slideSlash" ? Smooth(f.t / f.duration) : 0;
      if (f.state === "sliding") {
        Object.assign(result, {
          clip: `${f.weapon}Heavy`, action: "Heavy", animationNormalized: 0.36 + S1.progress * 0.08,
          swingRoll: S0.bindRollRad * (1 - S1.progress * 0.25), weaponYawOffset: 0,
          slide: { progress: S1.progress, pushing: S1.pushing, ready: S1.progress >= S0.strikeMinProgress, anchor: S1.anchor },
          lodge: { progress: S1.progress, held: S1.pushing, yank: 0.12, anchor: S1.anchor, serial: S1.serial, strain: S1.pushing ? 0.7 : 0.3 },
        });
      } else {
        Object.assign(result, {
          clip: `${f.weapon}Heavy`, action: "Heavy", animationNormalized: 0.38 + slashP * 0.62,
          swingRoll: -0.32 * (1 - slashP), weaponYawOffset: 0,
          slide: { progress: 1, slash: slashP },
        });
      }
    } else if (f.state === "sliding") {
      const pf = this.fighters.get(this.Player()), p = pf?.slide?.progress ?? 0;
      Object.assign(result, { clip: `${f.weapon}Deflected`, action: "Deflected", animationNormalized: 0.16 + p * 0.52 + Math.sin(this.time * 38) * 0.015 });
    } else if (f.state === "guardBounce" && f.entity === this.Player()) {
      const u = Clamp(f.t / Math.max(f.duration, 1e-3), 0, 1);
      Object.assign(result, { clip: `${f.weapon}Obstructed`, action: "Obstructed", animationNormalized: u * 0.72, swingRoll: (f.bounceSweep || -1) * 0.18 * (1 - u) });
    } else if (f.state === "crushed") {
      const cycle = f.t / 0.72, index = Math.floor(cycle), u = cycle - index;
      const action = index % 2 ? "Hit" : "Pushed";
      Object.assign(result, { clip: `${f.weapon}${action}`, action, animationNormalized: 0.18 + u * 0.66, finishable: true });
    } else if (f.state === "reel") {
      // 踉跄：Hit / Pushed 两段交替，每段 reelCycleS，段与段之间 0.08 s 交接。
      const cycle = f.t / L.reelCycleS, index = Math.floor(cycle), u = cycle - index;
      const action = index % 2 ? "Hit" : "Pushed", other = index % 2 ? "Pushed" : "Hit";
      Object.assign(result, { clip: `${f.weapon}${action}`, action, animationNormalized: 0.12 + u * 0.7, finishable: true,
        transition: index > 0 && u < 0.1 ? { from: { ...result, clip: `${f.weapon}${other}`, action: other, animationNormalized: 0.82, transition: null }, mix: u / 0.1 } : result.transition });
    }
    if (this.HasCrush && f.entity !== this.Player()) result.guardPoise = Math.round(f.guardPoise);
    const tail=f.parryVisualTail;
    if(f.state === "idle" && tail) {
      const elapsed=this.time-tail.startedAt;
      const from={...tail.pose,t:elapsed,animationNormalized:Clamp(elapsed/tail.duration,0,1),transition:null};
      if(elapsed<tail.duration) return {...result,clip:from.clip,action:from.action,animationNormalized:from.animationNormalized,transition:null,visualRecovery:true};
      if(elapsed<tail.duration+.07)result.transition={from,mix:(elapsed-tail.duration)/.07};
    }
    return result;
  }
  /** 方向挥砍的滚转权重：起手前七成里滚进去，收招后六成里滚回来。 */
  RollWeight(n, s0, s1) {
    const out = s1 + (1 - s1) * 0.4;
    return Smooth((n ?? 0) / Math.max(1e-3, s0 * 0.7)) * (1 - Smooth(((n ?? 0) - out) / Math.max(1e-3, 1 - out)));
  }
  ViewPose() { return this.CanUse() ? this.Pose(this.Fighter(this.Player())) : null; }
  View() {
    const qte = this.qte.View();
    if (qte) return qte;
    return null;
  }
  /** 屏幕中央提示环：卡刀长按 F、吃肉顿刀甩鼠／左键拉豁、磕枪顺刃按 W 推杆／左键顺劈、破防失衡按 F 处决。 */
  PromptView() {
    const f = this.fighters.get(this.Player());
    if (f?.state === "lodged" && f.lodge) {
      return { mode: "press", key: "F", progress: f.lodge.progress, pulse: f.lodge.held ? 0.5 + 0.5 * Math.sin(this.time * 24) : 0 };
    }
    if (f?.state === "cleave" && f.cleave) {
      const pulled = Clamp(Math.hypot(f.cleave.pullX, f.cleave.pullY) / C.ripStrokePx, 0, 1);
      return { mode: "finisher", key: T("gameplay.melee.promptRip"), progress: Math.max(pulled, 1 - f.t / f.duration), pulse: 0.55 + 0.45 * Math.sin(this.time * 28) };
    }
    if (f?.state === "sliding" && f.slide) {
      const ready = f.slide.progress >= S0.strikeMinProgress;
      return {
        mode: ready ? "finisher" : "press",
        key: ready ? T("gameplay.melee.promptLmb") : "W",
        progress: f.slide.progress,
        pulse: ready ? 0.6 + 0.4 * Math.sin(this.time * 26) : (f.slide.pushing ? 0.5 + 0.5 * Math.sin(this.time * 22) : 0),
      };
    }
    const finish = this.FinishCandidate();
    const tf = finish ? this.fighters.get(finish) : null;
    if (tf?.state === "crushed") {
      return { mode: "finisher", key: "F", progress: Clamp(1 - tf.t / tf.duration, 0, 1), pulse: 0.6 + 0.4 * Math.sin(this.time * 24) };
    }
    return null;
  }
  SetAssist(mode) { return this.qte.SetAssist(mode); }
  State() {
    const pf = this.fighters.get(this.Player());
    const foe = this.Opponents(this.Player())[0], foeF = foe ? this.fighters.get(foe) : null;
    return {
      time: this.time, active: this.qte.View(), stats: { ...this.stats }, player: this.Pose(this.Fighter(this.Player())), events: this.events.slice(-14),
      variant: { ...this.variant }, dragPreview: this.Drag ? this.DragPreview() : null,
      lodge: pf?.state === "lodged" && pf.lodge ? { progress: pf.lodge.progress, held: pf.lodge.held } : null,
      cleave: pf?.state === "cleave" && pf.cleave ? { progress: Clamp(Math.hypot(pf.cleave.pullX, pf.cleave.pullY) / C.ripStrokePx, 0, 1), bite: Clamp(pf.t / pf.duration, 0, 1) } : null,
      slide: pf?.state === "sliding" && pf.slide ? { progress: pf.slide.progress, pushing: pf.slide.pushing, ready: pf.slide.progress >= S0.strikeMinProgress } : null,
      enemyGuard: this.HasCrush && foeF ? { guardPoise: Math.round(foeF.guardPoise), crushed: foeF.state === "crushed" } : null,
      finishTarget: this.FinishCandidate()?.id ?? null,
    };
  }
  Cancel(reason = "reset") {
    this.qte.Cancel(); this.held.clear();
    for (const f of this.fighters.values()) {
      this.SetState(f, "idle"); f.buffer = null; f.groundHoldS = null;
      f.lodge = null; f.lodgedBy = null; f.reelBy = null;
      f.cleave = null; f.cleavedBy = null; f.slide = null; f.slideBy = null;
      f.crushedBy = null; f.guardPoise = K.maxPoise;
      f.entity.meleeCombat = null;
    }
    this.Log("cancel", null, null, { reason });
  }
  ReleasePlayer() {
    this.held.clear(); const f = this.Fighter(this.Player()); if(f)f.buffer=null;
    if (f?.lodge) this.ReleaseLodge(f, "release");
    if (f?.cleave) this.ReleaseCleave(f, "release");
    if (f?.slide) this.ReleaseSlide(f, "release");
    if (f && !this.Active) this.SetState(f, "idle");
  }
  Reset() { this.Cancel(); this.fighters.clear(); this.events.length = 0; this.time = 0; for (const key of Object.keys(this.stats)) this.stats[key] = 0; }
}
