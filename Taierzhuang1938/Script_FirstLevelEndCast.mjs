// ===========================================================================
// Script_FirstLevelEndCast.mjs —— 阶段 15–18 的「在场的人」公共层
//
// 两类人，两条路，别混：
//
//   1. **真人实体**（`EndExtras`）：走 `ai.Spawn("nra", …)` 的真士兵 —— 有武器、
//      有血、敌人会瞄他们、他们会倒下。警戒兵、院门守军、军医、传令兵、
//      桥头军官、爆破人员、回援尾队都是这一类。剧情走位只写 `MoveActor` /
//      `Defend`，不自己改 AI 规则。
//   2. **布景里的人**（`EndDressing`）：走 `MissionPeople.Person` 的纯视觉角色 ——
//      有骨架、会走路动画，但没有血条也不会被瞄。掉队伤员、照应他们的人、
//      门外抬进来的下一副担架、夜景里搬弹药与分配防区的人都是这一类。
//
// 布景层每帧重报（与 column.walkers 同一条纪律）：`Begin()` → 若干 `Person` /
// `Litter` / `Prop` → 由 `FirstLevelMissionView` 在 `people.Begin()` 与
// `people.End()` 之间调一次 `Draw(view, time)`。没报的那一帧人自动藏起来。
//
// **本模块零 three、零玩家可见中文、零编排判定**：什么时候该出现谁由各步骤模块
// 决定，三维向量一律从宿主（view / actor）已有的对象上借。
// ===========================================================================

const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** 从 from 指向 to 的 yaw（朝向 = (−sin yaw, −cos yaw)，与 MISSION_PLACEMENT 同口径）。 */
export function EndFacing(from, to) {
  return Math.atan2(from.x - to.x, from.z - to.z);
}
/** 折线总长。 */
export function EndRouteLength(route) {
  let sum = 0;
  for (let i = 1; i < route.length; i++) sum += Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z);
  return sum;
}
/** 折线上走过 distance 之后的点（带朝向）。 */
export function EndRoutePoint(route, distance) {
  let left = Math.max(0, distance);
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i], length = Math.hypot(b.x - a.x, b.z - a.z);
    if (left <= length || i === route.length - 1) {
      const t = Math.min(1, left / (length || 1));
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, yaw: Math.atan2(a.x - b.x, a.z - b.z) };
    }
    left -= length;
  }
  return { x: route[0].x, z: route[0].z, yaw: 0 };
}
/** 把一个点投影到折线上最近的位置，返回 {x,z,yaw,progress,distance}。 */
export function EndProjectOnto(route, point) {
  let best = { x: route[0].x, z: route[0].z, yaw: 0, progress: 0, distance: Infinity }, walked = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i];
    const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz) || 1;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (length * length)));
    const x = a.x + dx * t, z = a.z + dz * t, distance = Math.hypot(point.x - x, point.z - z);
    if (distance < best.distance) best = { x, z, yaw: Math.atan2(-dx, -dz), progress: walked + t * length, distance };
    walked += length;
  }
  return best;
}

// ---------------------------------------------------------------------------
// 1. 真人实体
// ---------------------------------------------------------------------------
export class EndExtras {
  constructor(runtime) {
    this.runtime = runtime;
    this.entries = new Map();
  }
  /** 生成一个剧情用的国军实体。已经有了就直接返回原来那个。 */
  Spawn(id, point, { weapon = "HanYang", squadId = "MissionEndCast", stance = 0,
    unarmed = false, essential = true } = {}) {
    const existing = this.entries.get(id);
    if (existing) return existing.actor;
    const r = this.runtime;
    const actor = r.ai.Spawn("nra", point.x, point.z, { weapon, unarmed, squadId: `${squadId}_${id}` });
    if (!actor) return null;
    actor.missionId = id;
    actor.missionEndCast = true;
    // 剧情人物**默认不死**（血量下限 1，走既有的 scriptEssential 那条路 ——
    // 弹药屋留守兵、老周、开场传令兵用的都是它）。院门守军、军医、传令兵、
    // 桥头军官与爆破人员全是「这一段必须在场的人」，被流弹打没了整段演出就断了。
    // 真要「有人可能中弹」的地方（回援尾队里的三个步枪兵）显式传 essential: false。
    actor.scriptEssential = essential;
    // 剧情人物不归共用行军层管，也不参加班里人的掩体逻辑。
    actor.missionTrainReady = false;
    r.InstallSentry?.(actor);
    r.PlaceActor(actor, point);
    if (Number.isFinite(point.yaw)) actor.yaw = point.yaw;
    r.Defend(actor, point, 0, 0);
    actor.scriptedNoncombatant = true;
    r.ai.SetStance(actor, stance, Infinity, true);
    this.entries.set(id, { actor, route: null, routeSource: null });
    return actor;
  }
  Actor(id) {
    const entry = this.entries.get(id);
    return entry?.actor?.alive ? entry.actor : null;
  }
  Any(id) { return this.entries.get(id)?.actor || null; }
  Has(id) { return this.entries.has(id); }
  /** 站住不动，可选朝向；`fight` 为 true 时照常还击（警戒兵、桥头掩护）。 */
  Hold(id, point, { yaw = null, stance = 0, fight = false, radiusM = 1.2 } = {}) {
    const actor = this.Actor(id);
    if (!actor) return false;
    const entry = this.entries.get(id);
    entry.route = null; entry.routeSource = null;
    this.runtime.Defend(actor, point, fight ? radiusM : 0, 0);
    actor.scriptedNoncombatant = !fight;
    this.runtime.ai.SetStance(actor, stance, 1.5, true);
    if (Number.isFinite(yaw) && !actor.target) actor.yaw = yaw;
    return true;
  }
  /** 沿折线走。每帧调用；走完（或人没了）返回 true。 */
  Walk(id, route, speed, { arriveM = 0.9, stance = 0, faceEnd = null, fight = false } = {}) {
    const actor = this.Actor(id);
    if (!actor) return true;
    const entry = this.entries.get(id);
    if (entry.routeSource !== route) { entry.routeSource = route; entry.route = route.map(p => ({ x: p.x, z: p.z })); }
    const pending = entry.route;
    while (pending.length && Distance(actor.position, pending[0]) < arriveM) pending.shift();
    actor.scriptedNoncombatant = !fight;
    if (!pending.length) {
      this.runtime.MoveActor(actor, actor.position, 0);
      this.runtime.ai.SetStance(actor, stance, 1.5, true);
      if (Number.isFinite(faceEnd) && !actor.target) actor.yaw = faceEnd;
      return true;
    }
    this.runtime.MoveActor(actor, pending[0], speed);
    this.runtime.ai.SetStance(actor, stance, 1.5, true);
    return false;
  }
  /** 走到某一点（不铺折线）。走到返回 true。 */
  WalkTo(id, point, speed, { arriveM = 0.9, stance = 0, yaw = null, fight = false } = {}) {
    const actor = this.Actor(id);
    if (!actor) return true;
    const entry = this.entries.get(id);
    entry.route = null; entry.routeSource = null;
    actor.scriptedNoncombatant = !fight;
    if (Distance(actor.position, point) < arriveM) {
      this.runtime.MoveActor(actor, actor.position, 0);
      this.runtime.ai.SetStance(actor, stance, 1.5, true);
      if (Number.isFinite(yaw) && !actor.target) actor.yaw = yaw;
      return true;
    }
    this.runtime.MoveActor(actor, point, speed);
    this.runtime.ai.SetStance(actor, stance, 1.5, true);
    return false;
  }
  /** 让某人转过去看着一个点（不改站位）。 */
  Face(id, point, dt, radPerS = 3) {
    const actor = this.Actor(id);
    if (!actor || actor.target) return;
    const goal = EndFacing(actor.position, point);
    const gap = Math.atan2(Math.sin(goal - actor.yaw), Math.cos(goal - actor.yaw));
    actor.yaw += Math.max(-radPerS * dt, Math.min(radPerS * dt, gap));
  }
  Remove(id) {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    if (entry.actor) this.runtime.ai.Remove(entry.actor);
  }
  /** 只留下 keep 里列出的 id，其余全部撤掉（阶段回跳 / 重试用）。 */
  Keep(keep) {
    for (const id of [...this.entries.keys()]) if (!keep.includes(id)) this.Remove(id);
  }
  Clear() { for (const id of [...this.entries.keys()]) this.Remove(id); }
  /** 这些人里离 point 最近的一个还活着的（爆破清场判据用）。 */
  Nearest(point) {
    let best = null;
    for (const entry of this.entries.values()) {
      if (!entry.actor?.alive) continue;
      const distance = Distance(entry.actor.position, point);
      if (!best || distance < best.distance) best = { id: entry.actor.missionId, distance, actor: entry.actor };
    }
    return best;
  }
  State() {
    return [...this.entries].map(([id, entry]) => ({
      id, alive: !!entry.actor?.alive,
      x: entry.actor?.position.x ?? null, z: entry.actor?.position.z ?? null,
    }));
  }
}

// ---------------------------------------------------------------------------
// 2. 布景里的人与小件
// ---------------------------------------------------------------------------
export class EndDressing {
  constructor() { this.people = []; this.litters = []; this.props = []; }
  Begin() { this.people.length = 0; this.litters.length = 0; this.props.length = 0; }
  Person(id, x, z, yaw, options = {}) { this.people.push({ id, x, z, yaw, options }); }
  /** 一副布景担架（床面 + 躺着的人 + 两个抬手）。 */
  Litter(id, x, z, yaw, { bearers = true, moving = true } = {}) {
    this.litters.push({ id, x, z, yaw, bearers, moving });
  }
  /** 一件白盒小件：key 取 FirstLevelMissionView 已有的实例桶。 */
  Prop(key, x, y, z, yaw = 0, scale = [1, 1, 1], rx = 0, rz = 0) {
    this.props.push({ key, x, y, z, yaw, scale, rx, rz });
  }
  /** 由 FirstLevelMissionView.Update 在 people.Begin/End 之间调一次。 */
  Draw(view, time) {
    // 抬手的握点要 Vector3：从 view 已有的那一个借（clone 之后各写各的）。
    const Vector = (x, y, z) => view.position.clone().set(x, y, z);
    for (const entry of this.people)
      view.people.Person(entry.id, entry.x, entry.z, entry.yaw, { kind: "bearer", ...entry.options });
    for (const litter of this.litters) {
      const deck = view.battlefield.GroundHeight(litter.x, litter.z) + 0.76;
      view.Instance("bed", litter.x, deck, litter.z, litter.yaw);
      view.people.Patient(litter.id, litter.x, deck + 0.07, litter.z, litter.yaw, time);
      if (!litter.bearers) continue;
      const cos = Math.cos(litter.yaw), sin = Math.sin(litter.yaw);
      for (const side of [-1, 1]) {
        const Grip = (hand, end) => Vector(
          litter.x + cos * hand * 0.29 - sin * end, deck + 0.12, litter.z - sin * hand * 0.29 - cos * end);
        view.people.Person(`${litter.id}Bearer${side > 0 ? 1 : 0}`,
          litter.x - sin * side * 1.28, litter.z - cos * side * 1.28, litter.yaw, {
            carryTarget: { left: Grip(-1, side), right: Grip(1, side) },
            role: side === 1 ? "front" : "rear", alive: true, moving: litter.moving, carrying: true,
          });
      }
    }
    for (const prop of this.props)
      view.Instance(prop.key, prop.x, prop.y, prop.z, prop.yaw,
        prop.scale[0], prop.scale[1], prop.scale[2], prop.rx, prop.rz);
  }
  State() { return { people: this.people.length, litters: this.litters.length, props: this.props.length }; }
}
