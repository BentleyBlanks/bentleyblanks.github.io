/** Valiant Farm 1914 — one-level sim (throw / dog / dig / rescue). */

export const W = 4200;
export const H = 540;
export const GROUND = 420;
export const GRAVITY = 2100;
export const CACHE_BUST = "20260802b";

/** Opening comic beat — Valiant Hearts–style prologue line. */
export const PROLOGUE_LINE = "往后的形势只怕会更加艰难";

export function CreateInput() {
  return {
    left: false,
    right: false,
    crouch: false,
    jumpPressed: false,
    actPressed: false,
    throwPressed: false,
  };
}

function Solid(x, y, w, h, kind = "block") {
  return { x, y, w, h, kind };
}

function Ent(partial) {
  return { w: 28, h: 48, ...partial };
}

export function BuildLevel() {
  const solids = [
    Solid(-40, GROUND, W + 80, 200, "ground"),
    Solid(180, GROUND - 36, 70, 36, "crate"),
    Solid(520, GROUND - 36, 70, 36, "crate"),
    Solid(980, GROUND - 52, 90, 52, "crate"),
    Solid(1680, GROUND - 36, 70, 36, "crate"),
    Solid(2100, GROUND - 40, 80, 40, "sandbag"),
    Solid(2480, GROUND - 36, 70, 36, "crate"),
    Solid(3100, GROUND - 40, 90, 40, "sandbag"),
  ];

  const entities = [
    Ent({
      id: "can",
      type: "pickup",
      item: "can",
      x: 260,
      y: GROUND,
      label: "TIN",
    }),
    Ent({
      id: "grenade",
      type: "pickup",
      item: "grenade",
      x: 2150,
      y: GROUND,
      label: "NADE",
      hidden: true,
    }),
    Ent({
      id: "sentry1",
      type: "patrol",
      x: 700,
      y: GROUND,
      homeX: 700,
      amp: 110,
      facing: -1,
      stun: 0,
      t: 0,
      cone: 150,
    }),
    Ent({
      id: "sentry2",
      type: "patrol",
      x: 1450,
      y: GROUND,
      homeX: 1450,
      amp: 90,
      facing: 1,
      stun: 0,
      t: 1.2,
      cone: 140,
    }),
    Ent({
      id: "dog",
      type: "dog",
      x: 1100,
      y: GROUND,
      state: "follow",
      fetchTarget: null,
      carrying: null,
      crawlTo: null,
    }),
    Ent({
      id: "cutters",
      type: "pickup",
      item: "cutters",
      x: 1280,
      y: GROUND,
      label: "CUT",
      behindGap: true,
      hidden: false,
    }),
    Ent({
      id: "gap",
      type: "gap",
      x: 1180,
      y: GROUND,
      w: 40,
      h: 22,
      hint: "dog only",
    }),
    Ent({
      id: "wire1",
      type: "wire",
      x: 1580,
      y: GROUND,
      w: 80,
      h: 40,
      cut: false,
      needs: "cutters",
    }),
    Ent({
      id: "dirt",
      type: "dirt",
      x: 1850,
      y: GROUND,
      w: 96,
      h: 48,
      hp: 3,
      dug: false,
    }),
    Ent({
      id: "wire2",
      type: "wire",
      x: 1850,
      y: GROUND,
      w: 96,
      h: 36,
      cut: false,
      needs: "dig",
    }),
    Ent({
      id: "mg",
      type: "mg",
      x: 2750,
      y: GROUND,
      w: 70,
      h: 56,
      alive: true,
      heat: 0,
      facing: -1,
    }),
    Ent({
      id: "medic",
      type: "medic",
      x: 2920,
      y: GROUND,
      carried: false,
      rescued: false,
    }),
    Ent({
      id: "cart",
      type: "cart",
      x: 3550,
      y: GROUND,
      w: 90,
      h: 50,
    }),
  ];

  return {
    width: W,
    ground: GROUND,
    solids,
    entities,
    spawn: { x: 120, y: GROUND },
  };
}

export function CreateState() {
  const level = BuildLevel();
  return {
    phase: "title",
    level,
    player: {
      x: level.spawn.x,
      y: level.spawn.y,
      vx: 0,
      vy: 0,
      facing: 1,
      onGround: true,
      crouching: false,
      held: null,
      carryingMedic: false,
      hp: 3,
      invuln: 0,
      digProgress: 0,
    },
    cameraX: 0,
    shake: 0,
    projectiles: [],
    bark: null,
    barkTimer: 0,
    won: false,
    failTimer: 0,
    input: CreateInput(),
    stats: { throws: 0, stuns: 0, digs: 0, dogFetches: 0 },
    t: 0,
  };
}

function Aabb(x, y, w, h) {
  return { x: x - w / 2, y: y - h, w, h };
}

function Overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function NearX(ax, bx, r) {
  return Math.abs(ax - bx) < r;
}

function SetBark(state, text, time = 2.4) {
  state.bark = text;
  state.barkTimer = time;
}

function PlayerBox(p) {
  const h = p.crouching ? 34 : p.carryingMedic ? 48 : 48;
  const w = p.carryingMedic ? 34 : 26;
  return Aabb(p.x, p.y, w, h);
}

function ResolvePlayer(state, dt) {
  const { player: p, input, level } = state;
  if (state.won) return;

  const speed = p.carryingMedic ? 120 : p.crouching ? 110 : 230;
  const move = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  p.crouching = !!input.crouch && p.onGround && !p.carryingMedic;
  p.vx = move * speed;
  if (move) p.facing = move;

  if (input.jumpPressed && p.onGround && !p.crouching && !p.carryingMedic) {
    p.vy = -520;
    p.onGround = false;
  }

  p.vy += GRAVITY * dt;
  p.x += p.vx * dt;
  p.x = Math.max(30, Math.min(level.width - 30, p.x));

  let box = PlayerBox(p);
  for (const s of level.solids) {
    if (s.kind === "ground") continue;
    const sb = { x: s.x - s.w / 2, y: s.y - s.h, w: s.w, h: s.h };
    if (!Overlap(box, sb)) continue;
    if (p.vx > 0) p.x = sb.x - box.w / 2;
    else if (p.vx < 0) p.x = sb.x + sb.w + box.w / 2;
    box = PlayerBox(p);
  }

  // Block wires / undug dirt / live MG body
  for (const e of level.entities) {
    if (e.type === "wire" && !e.cut) {
      const wb = { x: e.x - e.w / 2, y: e.y - e.h, w: e.w, h: e.h };
      if (Overlap(box, wb)) {
        if (p.vx > 0) p.x = wb.x - box.w / 2;
        else if (p.vx < 0) p.x = wb.x + wb.w + box.w / 2;
        box = PlayerBox(p);
      }
    }
    if (e.type === "dirt" && !e.dug) {
      const db = { x: e.x - e.w / 2, y: e.y - e.h, w: e.w, h: e.h };
      if (Overlap(box, db)) {
        if (p.vx > 0) p.x = db.x - box.w / 2;
        else if (p.vx < 0) p.x = db.x + db.w + box.w / 2;
        box = PlayerBox(p);
      }
    }
  }

  const prevY = p.y;
  p.y += p.vy * dt;
  box = PlayerBox(p);
  p.onGround = false;

  // Floor plane
  if (p.y >= GROUND && p.vy >= 0) {
    p.y = GROUND;
    p.vy = 0;
    p.onGround = true;
  }

  for (const s of level.solids) {
    if (s.kind === "ground") continue;
    const sb = { x: s.x - s.w / 2, y: s.y - s.h, w: s.w, h: s.h };
    if (!Overlap(box, sb)) continue;
    if (p.vy >= 0 && prevY <= sb.y + 8) {
      p.y = sb.y;
      p.vy = 0;
      p.onGround = true;
    } else if (p.vy < 0) {
      p.y = sb.y + sb.h + box.h;
      p.vy = 0;
    }
    box = PlayerBox(p);
  }

  if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
}

function HurtPlayer(state, amount = 1) {
  const p = state.player;
  if (p.invuln > 0 || state.won) return;
  p.hp -= amount;
  p.invuln = 1.1;
  p.vx = -p.facing * 160;
  state.shake = 0.35;
  SetBark(state, "Hit — cover!", 1.6);
  if (p.hp <= 0) {
    p.hp = 0;
    state.failTimer = 1.2;
  }
}

function ThrowHeld(state) {
  const p = state.player;
  if (!p.held || p.carryingMedic) return;
  const item = p.held;
  p.held = null;
  state.stats.throws += 1;
  state.projectiles.push({
    kind: item,
    x: p.x + p.facing * 22,
    y: p.y - (p.crouching ? 22 : 34),
    vx: p.facing * (item === "grenade" ? 380 : 420),
    vy: item === "grenade" ? -220 : -280,
    life: item === "grenade" ? 1.15 : 1.6,
    fuse: item === "grenade" ? 1.15 : 0,
  });
}

function PickupNear(state) {
  const p = state.player;
  for (const e of state.level.entities) {
    if (e.type !== "pickup" || e.taken || e.hidden) continue;
    if (e.behindGap) continue;
    if (!NearX(p.x, e.x, 42)) continue;
    if (p.held) {
      // swap
      const drop = {
        id: `drop_${p.held}_${state.t | 0}`,
        type: "pickup",
        item: p.held,
        x: p.x - p.facing * 30,
        y: GROUND,
        label: p.held === "can" ? "TIN" : p.held === "cutters" ? "CUT" : "NADE",
        taken: false,
        hidden: false,
      };
      state.level.entities.push(drop);
    }
    p.held = e.item;
    e.taken = true;
    e.hidden = true;
    SetBark(state, e.item === "can" ? "Tin can." : e.item === "cutters" ? "Wire cutters." : "Grenade.", 1.5);
    return true;
  }
  return false;
}

function TryAct(state) {
  const p = state.player;
  const level = state.level;
  if (!state.input.actPressed || state.won) return;

  // Drop medic at cart = win
  const cart = level.entities.find((e) => e.type === "cart");
  const medic = level.entities.find((e) => e.type === "medic");
  if (p.carryingMedic && cart && NearX(p.x, cart.x, 70)) {
    p.carryingMedic = false;
    medic.rescued = true;
    medic.carried = false;
    medic.x = cart.x;
    medic.y = cart.y;
    state.won = true;
    state.phase = "win";
    SetBark(state, "Go — go — go!", 3);
    state.shake = 0.2;
    return;
  }

  // Pick / drop medic
  if (medic && !medic.rescued && NearX(p.x, medic.x, 50)) {
    if (!p.carryingMedic) {
      if (p.held) {
        SetBark(state, "Hands free — drop item (F empty throw first).", 2);
        return;
      }
      p.carryingMedic = true;
      medic.carried = true;
      SetBark(state, "I've got you.", 1.8);
      return;
    }
    p.carryingMedic = false;
    medic.carried = false;
    medic.x = p.x;
    medic.y = GROUND;
    SetBark(state, "Stay low.", 1.4);
    return;
  }

  // Cut wire
  for (const e of level.entities) {
    if (e.type !== "wire" || e.cut || e.needs !== "cutters") continue;
    if (!NearX(p.x, e.x, 55)) continue;
    if (p.held !== "cutters") {
      SetBark(state, "Need cutters.", 1.6);
      return;
    }
    e.cut = true;
    p.held = null;
    SetBark(state, "Wire down.", 1.6);
    state.shake = 0.15;
    return;
  }

  // Dig dirt (tap E or use while near)
  for (const e of level.entities) {
    if (e.type !== "dirt" || e.dug) continue;
    if (!NearX(p.x, e.x, 60)) continue;
    e.hp -= 1;
    state.stats.digs += 1;
    state.shake = 0.08;
    if (e.hp <= 0) {
      e.dug = true;
      const w2 = level.entities.find((w) => w.type === "wire" && w.needs === "dig");
      if (w2) w2.cut = true;
      SetBark(state, "Tunnel under!", 1.8);
    } else {
      SetBark(state, "Dig…", 0.8);
    }
    return;
  }

  // Command dog
  const dog = level.entities.find((e) => e.type === "dog");
  const cutters = level.entities.find((e) => e.id === "cutters");
  const gap = level.entities.find((e) => e.type === "gap");
  const mg = level.entities.find((e) => e.type === "mg");
  if (dog && NearX(p.x, dog.x, 75)) {
    if (cutters && !cutters.taken && cutters.behindGap && gap) {
      dog.state = "fetch";
      dog.fetchTarget = cutters;
      dog.crawlTo = gap.x;
      SetBark(state, "Walt — fetch!", 1.8);
      return;
    }
    if (mg?.alive && p.x > 2000) {
      dog.state = "distract";
      dog.distractT = 4.5;
      SetBark(state, "Walt — draw their fire!", 2);
      return;
    }
  }

  // Reveal grenade stash near sandbags after wire2 clear
  const g = level.entities.find((e) => e.id === "grenade");
  const w2 = level.entities.find((e) => e.type === "wire" && e.needs === "dig");
  if (g && g.hidden && w2?.cut && NearX(p.x, g.x, 50)) {
    g.hidden = false;
    SetBark(state, "Grenades in the bag.", 1.8);
    return;
  }

  if (PickupNear(state)) return;

  // Whistle dog follow
  if (dog && NearX(p.x, dog.x, 80)) {
    dog.state = "follow";
    SetBark(state, "Heel.", 1.2);
  }
}

function UpdateDog(state, dt) {
  const dog = state.level.entities.find((e) => e.type === "dog");
  if (!dog) return;
  const p = state.player;
  const cutters = dog.fetchTarget;

  if (dog.state === "fetch" && cutters && !cutters.taken) {
    const targetX = cutters.behindGap ? cutters.x : dog.crawlTo;
    dog.x += Math.sign(targetX - dog.x) * 220 * dt;
    if (Math.abs(dog.x - cutters.x) < 20) {
      cutters.behindGap = false;
      cutters.x = p.x + p.facing * 36;
      dog.carrying = "cutters";
      dog.state = "return";
      state.stats.dogFetches += 1;
      SetBark(state, "Good boy!", 1.5);
    }
    return;
  }

  if (dog.state === "return") {
    dog.x += Math.sign(p.x - dog.x) * 240 * dt;
    if (Math.abs(dog.x - p.x) < 40) {
      if (dog.carrying === "cutters") {
        const c = state.level.entities.find((e) => e.id === "cutters");
        if (c && !c.taken) {
          c.x = p.x + 28;
          c.y = GROUND;
          c.behindGap = false;
        }
      }
      dog.carrying = null;
      dog.state = "follow";
      dog.fetchTarget = null;
    }
    return;
  }

  // Distraction run if MG alive and player whistled near MG — auto when grenade thrown near
  if (dog.state === "distract") {
    const mg = state.level.entities.find((e) => e.type === "mg");
    if (!mg || !mg.alive) {
      dog.state = "follow";
      return;
    }
    dog.x += Math.sign(mg.x - 80 - dog.x) * 260 * dt;
    mg.facing = dog.x < mg.x ? -1 : 1;
    dog.distractT = (dog.distractT || 0) - dt;
    if (dog.distractT <= 0) dog.state = "follow";
    return;
  }

  // Follow
  const want = p.x - p.facing * 40;
  if (Math.abs(dog.x - want) > 18) {
    dog.x += Math.sign(want - dog.x) * Math.min(280, Math.abs(want - dog.x) * 4) * dt;
  }
  dog.y = GROUND;
}

function UpdatePatrols(state, dt) {
  const p = state.player;
  for (const e of state.level.entities) {
    if (e.type !== "patrol") continue;
    if (e.stun > 0) {
      e.stun -= dt;
      continue;
    }
    e.t += dt;
    e.x = e.homeX + Math.sin(e.t * 0.7) * e.amp;
    e.facing = Math.cos(e.t * 0.7) >= 0 ? 1 : -1;

    if (p.invuln > 0 || p.carryingMedic) {
      /* still detected if standing in cone */
    }
    const dx = p.x - e.x;
    const inCone = Math.sign(dx || 1) === e.facing && Math.abs(dx) < e.cone;
    const covered = p.crouching && Math.abs(dx) > 40;
    // crate cover: if crate between
    let blocked = false;
    for (const s of state.level.solids) {
      if (s.kind !== "crate" && s.kind !== "sandbag") continue;
      const mid = s.x;
      if ((e.x < mid && mid < p.x) || (p.x < mid && mid < e.x)) {
        if (p.crouching || p.y < GROUND - 10) blocked = true;
      }
    }
    if (inCone && !covered && !blocked && Math.abs(p.y - e.y) < 60) {
      e.alert = (e.alert || 0) + dt;
      if (e.alert > 0.35) {
        HurtPlayer(state, 1);
        e.alert = 0;
      }
    } else e.alert = 0;
  }
}

function UpdateMg(state, dt) {
  const mg = state.level.entities.find((e) => e.type === "mg");
  if (!mg || !mg.alive) return;
  const p = state.player;
  const dog = state.level.entities.find((e) => e.type === "dog");
  if (dog?.state === "distract") {
    mg.heat = 0;
    return;
  }
  const dx = p.x - mg.x;
  if (Math.abs(dx) < 420 && Math.sign(dx || -1) === mg.facing) {
    const behindBag = p.crouching && NearX(p.x, 2480, 90);
    const behindSand = p.crouching && NearX(p.x, 2100, 90);
    if (!behindBag && !behindSand && p.x < mg.x) {
      mg.heat += dt;
      if (mg.heat > 0.45) {
        HurtPlayer(state, 1);
        mg.heat = 0;
        state.shake = 0.25;
      }
    } else mg.heat = Math.max(0, mg.heat - dt);
  } else mg.heat = Math.max(0, mg.heat - dt);
}

function Boom(state, x, y) {
  state.shake = 0.55;
  SetBark(state, "Boom!", 1.2);
  for (const e of state.level.entities) {
    if (e.type === "patrol" && Math.abs(e.x - x) < 110) {
      e.stun = 4;
      state.stats.stuns += 1;
    }
    if (e.type === "mg" && e.alive && Math.abs(e.x - x) < 130) {
      e.alive = false;
      SetBark(state, "Nest silent!", 2);
    }
  }
  // soft dig assist
  for (const e of state.level.entities) {
    if (e.type === "dirt" && !e.dug && Math.abs(e.x - x) < 90) {
      e.hp = 0;
      e.dug = true;
      const w2 = state.level.entities.find((w) => w.type === "wire" && w.needs === "dig");
      if (w2) w2.cut = true;
    }
  }
}

function UpdateProjectiles(state, dt) {
  const next = [];
  for (const p of state.projectiles) {
    p.vy += GRAVITY * 0.5 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.kind === "grenade") {
      p.fuse -= dt;
      if (p.fuse <= 0 || p.y >= GROUND - 4) {
        Boom(state, p.x, Math.min(p.y, GROUND));
        continue;
      }
    } else if (p.life <= 0 || p.y >= GROUND - 2) {
      // can impact
      for (const e of state.level.entities) {
        if (e.type === "patrol" && e.stun <= 0 && Math.abs(e.x - p.x) < 55) {
          e.stun = 3.2;
          state.stats.stuns += 1;
          SetBark(state, "Helmet rings!", 1.5);
        }
      }
      continue;
    } else {
      for (const e of state.level.entities) {
        if (e.type === "patrol" && e.stun <= 0 && Math.hypot(e.x - p.x, e.y - 40 - p.y) < 40) {
          e.stun = 3.2;
          state.stats.stuns += 1;
          SetBark(state, "Helmet rings!", 1.5);
          p.life = 0;
        }
      }
      if (p.life <= 0) continue;
    }
    next.push(p);
  }
  state.projectiles = next;
}

function SyncMedic(state) {
  const medic = state.level.entities.find((e) => e.type === "medic");
  if (!medic || medic.rescued) return;
  if (state.player.carryingMedic) {
    medic.x = state.player.x;
    medic.y = state.player.y;
  }
}

function UpdateCamera(state, dt) {
  const target = state.player.x - 360;
  state.cameraX += (Math.max(0, Math.min(W - 960, target)) - state.cameraX) * Math.min(1, dt * 5);
  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt);
}

export function Step(state, dt) {
  if (state.phase !== "play" || state.won) {
    if (state.barkTimer > 0) {
      state.barkTimer -= dt;
      if (state.barkTimer <= 0) state.bark = null;
    }
    return state;
  }
  const clamped = Math.min(0.033, Math.max(0, dt));
  state.t += clamped;

  if (state.failTimer > 0) {
    state.failTimer -= clamped;
    if (state.failTimer <= 0) RestartPlay(state);
    return state;
  }

  if (state.input.throwPressed) {
    if (state.player.held) ThrowHeld(state);
    else if (!state.player.carryingMedic) PickupNear(state);
  }
  TryAct(state);
  ResolvePlayer(state, clamped);
  UpdateDog(state, clamped);
  UpdatePatrols(state, clamped);
  UpdateMg(state, clamped);
  UpdateProjectiles(state, clamped);
  SyncMedic(state);
  UpdateCamera(state, clamped);

  // Unhide grenade once under wire dug
  const w2 = state.level.entities.find((e) => e.type === "wire" && e.needs === "dig");
  const g = state.level.entities.find((e) => e.id === "grenade");
  if (w2?.cut && g) g.hidden = false;

  if (state.barkTimer > 0) {
    state.barkTimer -= clamped;
    if (state.barkTimer <= 0) state.bark = null;
  }

  // clear one-shots
  state.input.jumpPressed = false;
  state.input.actPressed = false;
  state.input.throwPressed = false;
  return state;
}

export function BeginPlay(state) {
  const next = CreateState();
  next.phase = "play";
  next.cameraX = 0;
  SetBark(next, PROLOGUE_LINE, 3.6);
  Object.assign(state, next);
  return state;
}

export function RestartPlay(state) {
  return BeginPlay(state);
}

/** Test helpers */
export function DebugHold(state, item) {
  state.player.held = item;
  return state;
}

export function DebugKillMg(state) {
  const mg = state.level.entities.find((e) => e.type === "mg");
  if (mg) mg.alive = false;
  return state;
}

export function DebugCutAll(state) {
  for (const e of state.level.entities) {
    if (e.type === "wire") e.cut = true;
    if (e.type === "dirt") {
      e.dug = true;
      e.hp = 0;
    }
  }
  return state;
}
