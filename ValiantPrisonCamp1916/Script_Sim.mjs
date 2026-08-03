/** Valiant Hearts Ch.3 — Prison Camp (Karl POW escape), 1:1 puzzle whitebox. */

export const W = 5600;
export const H = 720;
export const UPPER = 300;
export const LOWER = 560;
export const GRAVITY = 2400;
export const CACHE_BUST = "20260803a";

export const PROLOGUE_BEATS = [
  { speaker: "卡尔", text: "战俘营。里面一条街，外面一条街。" },
  { speaker: "卡尔", text: "先弄到剪线钳，再翻铁丝网出去。" },
  { speaker: "卡尔", text: "澡堂、厨房、洗衣房、宿舍、医务室——一件一件来。" },
];

export const ITEM_LABELS = {
  coal: "煤块",
  strap: "肩带",
  medkit: "急救包",
  scarf: "红围巾",
  pipe: "铁管",
  tomato: "番茄",
  meat: "肉",
  cutters: "剪线钳",
};

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

function Zone(id, x, w, street, label) {
  return { id, x, w, street, label };
}

export function BuildLevel() {
  const zones = [
    Zone("bath", 80, 520, "upper", "澡堂"),
    Zone("kitchen", 720, 480, "upper", "厨房"),
    Zone("laundry", 1320, 520, "upper", "洗衣房"),
    Zone("dorm", 1960, 420, "upper", "宿舍"),
    Zone("infirmary", 2500, 480, "upper", "医务室"),
    Zone("stairs", 3100, 160, "both", "楼梯"),
    Zone("yard", 3320, 900, "lower", "外围"),
    Zone("fence", 4300, 400, "lower", "铁丝网"),
  ];

  const interact = [
    {
      id: "coalPile",
      type: "pickup",
      item: "coal",
      x: 160,
      street: "upper",
      label: "煤堆",
      once: true,
    },
    {
      id: "boiler",
      type: "boiler",
      x: 320,
      street: "upper",
      label: "锅炉",
      fueled: false,
    },
    {
      id: "valveA",
      type: "valve",
      x: 420,
      street: "upper",
      label: "阀门甲",
      open: false,
      outdoor: true,
    },
    {
      id: "valveB",
      type: "valve",
      x: 480,
      street: "upper",
      label: "阀门乙",
      open: false,
      outdoor: true,
    },
    {
      id: "valveC",
      type: "valve",
      x: 540,
      street: "upper",
      label: "阀门丙",
      open: false,
      outdoor: true,
    },
    {
      id: "bathWindow",
      type: "windowSteal",
      x: 280,
      street: "upper",
      label: "澡堂窗",
      stolen: false,
      item: "strap",
    },
    {
      id: "pulley",
      type: "pulley",
      x: 860,
      street: "upper",
      label: "滑轮窗口",
      traded: false,
    },
    {
      id: "laundryMan",
      type: "laundry",
      x: 1480,
      street: "upper",
      label: "洗衣工",
      helped: false,
      bagsCaught: 0,
    },
    {
      id: "cart",
      type: "cart",
      x: 1620,
      street: "upper",
      label: "手推车",
      pushing: false,
      catchX: 1750,
    },
    {
      id: "pipeRack",
      type: "pickup",
      item: "pipe",
      x: 2100,
      street: "upper",
      label: "铁管架",
      once: true,
      gated: "scarf",
    },
    {
      id: "cook",
      type: "cook",
      x: 920,
      street: "upper",
      label: "厨子",
      gotPipe: false,
      meatReady: false,
    },
    {
      id: "tomatoCrate",
      type: "ammo",
      item: "tomato",
      x: 980,
      street: "upper",
      label: "番茄箱",
      ammo: 0,
      max: 3,
    },
    {
      id: "supportL",
      type: "support",
      x: 1040,
      street: "upper",
      label: "木支架左",
      hit: false,
    },
    {
      id: "supportR",
      type: "support",
      x: 1120,
      street: "upper",
      label: "木支架右",
      hit: false,
    },
    {
      id: "meatDrop",
      type: "pickup",
      item: "meat",
      x: 1080,
      street: "upper",
      label: "挂肉",
      once: true,
      hidden: true,
    },
    {
      id: "dog",
      type: "dogBowl",
      x: 2680,
      street: "upper",
      label: "军犬",
      fed: false,
    },
    {
      id: "cuttersBox",
      type: "pickup",
      item: "cutters",
      x: 2740,
      street: "upper",
      label: "剪线钳",
      once: true,
      hidden: true,
    },
    {
      id: "stairs",
      type: "stairs",
      x: 3160,
      street: "both",
      label: "上下楼梯",
    },
    {
      id: "fence",
      type: "fence",
      x: 4480,
      street: "lower",
      label: "铁丝网",
      cut: false,
      w: 120,
    },
  ];

  const lights = [
    { id: "sl1", x: 3500, street: "lower", period: 3.2, phase: 0, cone: 90, danger: true },
    { id: "sl2", x: 3900, street: "lower", period: 2.6, phase: 1.1, cone: 80, danger: true },
    { id: "sl3", x: 4200, street: "lower", period: 3.8, phase: 0.4, cone: 100, danger: true },
  ];

  return { zones, interact, lights };
}

export function CreateState() {
  const level = BuildLevel();
  return {
    mode: "title",
    t: 0,
    camX: 0,
    street: "upper",
    player: {
      x: 120,
      y: UPPER,
      vx: 0,
      vy: 0,
      facing: 1,
      crouch: false,
      onGround: true,
      street: "upper",
      w: 28,
      h: 48,
      caught: 0,
    },
    inv: [],
    hand: null,
    tomatoAmmo: 0,
    throws: [],
    bags: [],
    bagTimer: 0,
    laundryActive: false,
    waterOn: false,
    flags: {
      boilerFueled: false,
      valvesOpen: 0,
      strap: false,
      medkit: false,
      scarf: false,
      pipe: false,
      cookPipe: false,
      supports: 0,
      meat: false,
      cutters: false,
      escaped: false,
    },
    goals: [
      { id: "bath", text: "澡堂：上煤、拧阀、偷肩带", done: false },
      { id: "trade", text: "厨房滑轮：肩带换急救包", done: false },
      { id: "laundry", text: "洗衣房：急救包→接布袋拿围巾", done: false },
      { id: "pipe", text: "宿舍取铁管，给厨子", done: false },
      { id: "meat", text: "番茄砸支架，取肉", done: false },
      { id: "dog", text: "医务室喂狗，取剪线钳", done: false },
      { id: "escape", text: "外围躲探照灯，剪网逃走", done: false },
    ],
    bark: null,
    barkT: 0,
    win: false,
    caughtFlash: 0,
    input: CreateInput(),
    level,
    hint: "A/D 走 · S 蹲 · 空格 跳 · E 互动 · F 扔番茄",
  };
}

function GroundY(street) {
  return street === "lower" ? LOWER : UPPER;
}

function EntAt(state, id) {
  return state.level.interact.find((e) => e.id === id);
}

function Has(state, item) {
  return state.inv.includes(item) || state.hand === item;
}

function Take(state, item) {
  if (state.hand === item) {
    state.hand = null;
    return true;
  }
  const i = state.inv.indexOf(item);
  if (i >= 0) {
    state.inv.splice(i, 1);
    return true;
  }
  return false;
}

function Give(state, item) {
  if (!state.hand) state.hand = item;
  else if (!state.inv.includes(item)) state.inv.push(item);
  if (!state.flags[item] && item in state.flags) state.flags[item] = true;
}

function Bark(state, text, dur = 2.4) {
  state.bark = text;
  state.barkT = dur;
}

function SetGoal(state, id, done = true) {
  const g = state.goals.find((x) => x.id === id);
  if (g) g.done = done;
}

function Near(player, ent, pad = 52) {
  const gy = GroundY(ent.street === "both" ? player.street : ent.street);
  if (ent.street !== "both" && ent.street !== player.street) return false;
  return Math.abs(player.x - ent.x) < pad && Math.abs(player.y - gy) < 8;
}

function UpdateWater(state) {
  const b = EntAt(state, "boiler");
  const valves = ["valveA", "valveB", "valveC"].map((id) => EntAt(state, id));
  const openN = valves.filter((v) => v.open).length;
  state.flags.valvesOpen = openN;
  state.waterOn = !!(b.fueled && openN === 3);
}

function LightDanger(state, light) {
  if (!light.danger) return false;
  const swing = Math.sin(state.t * ((Math.PI * 2) / light.period) + light.phase);
  const cx = light.x + swing * 70;
  const half = light.cone * 0.5;
  const p = state.player;
  if (p.street !== "lower") return false;
  if (p.crouch && Math.abs(p.x - cx) < half * 0.35) return false;
  return Math.abs(p.x - cx) < half;
}

function SpawnBags(state) {
  state.bags.push({
    x: 1550 + Math.random() * 40,
    y: UPPER - 160,
    vy: 40,
    alive: true,
  });
}

export function BeginPlay(state) {
  state.mode = "play";
  state.t = 0;
  Bark(state, "先去澡堂弄热水——肩带挂在窗子上。", 3.2);
}

function InteractPriority(state, e) {
  if (e.type === "windowSteal" && !e.stolen && state.waterOn) return 0;
  if (e.type === "windowSteal") return 8;
  if (e.type === "pickup" && !e._taken && !e.hidden) return 1;
  if (e.type === "pulley" && !e.traded) return 1;
  if (e.type === "fence" && !e.cut) return 1;
  if (e.type === "dogBowl" && !e.fed) return 1;
  if (e.type === "laundry" && !e.helped) return 1;
  if (e.type === "boiler" && !e.fueled) return 1;
  if (e.type === "valve") return 2;
  if (e.type === "cook" && !e.gotPipe) return 2;
  if (e.type === "cart") return 3;
  if (e.type === "stairs") return 4;
  if (e.type === "boiler" && e.fueled) return 9;
  return 5;
}

export function Interact(state) {
  const p = state.player;
  const candidates = state.level.interact
    .filter((e) => !e.hidden && Near(p, e, 58))
    .map((e) => ({ e, d: Math.abs(p.x - e.x), pri: InteractPriority(state, e) }))
    .sort((a, b) => a.pri - b.pri || a.d - b.d);

  let soft = null;

  for (const { e } of candidates) {
    if (e.type === "pickup") {
      if (e.gated && !Has(state, e.gated) && !state.flags[e.gated]) {
        soft = "得先拿到红围巾，卫兵才放你进宿舍。";
        continue;
      }
      if (e.once && e._taken) continue;
      Give(state, e.item);
      e._taken = true;
      if (e.item === "coal") Bark(state, "煤块到手。去锅炉上煤。");
      if (e.item === "strap") {
        state.flags.strap = true;
        SetGoal(state, "bath");
        Bark(state, "肩带到手。去厨房滑轮跟厨子换。");
      }
      if (e.item === "pipe") {
        state.flags.pipe = true;
        Bark(state, "铁管。厨子需要这个。");
      }
      if (e.item === "meat") {
        state.flags.meat = true;
        SetGoal(state, "meat");
        Bark(state, "肉掉下来了。去医务室喂狗。");
      }
      if (e.item === "cutters") {
        state.flags.cutters = true;
        SetGoal(state, "dog");
        Bark(state, "剪线钳！下楼，躲探照灯，剪网。");
      }
      if (e.once) e.hidden = true;
      return;
    }

    if (e.type === "boiler") {
      if (e.fueled) {
        soft = "锅炉已经烧着了。";
        continue;
      }
      if (!Take(state, "coal")) {
        soft = "需要煤块。";
        continue;
      }
      e.fueled = true;
      state.flags.boilerFueled = true;
      UpdateWater(state);
      Bark(state, "锅炉点火。去外面拧三个阀门。");
      return;
    }

    if (e.type === "valve") {
      if (!EntAt(state, "boiler").fueled) {
        soft = "先给锅炉上煤。";
        continue;
      }
      e.open = !e.open;
      UpdateWater(state);
      Bark(state, e.open ? `${e.label}打开。` : `${e.label}关上。`);
      if (state.waterOn) {
        const win = EntAt(state, "bathWindow");
        if (!win.stolen) Bark(state, "水通了！澡堂窗上能偷肩带。");
      }
      return;
    }

    if (e.type === "windowSteal") {
      if (e.stolen) continue;
      if (!state.waterOn) {
        soft = "得先通水，卫兵才去冲澡。";
        continue;
      }
      e.stolen = true;
      Give(state, "strap");
      state.flags.strap = true;
      SetGoal(state, "bath");
      Bark(state, "肩带到手。去厨房滑轮。");
      return;
    }

    if (e.type === "pulley") {
      if (e.traded) {
        soft = "已经换过急救包了。";
        continue;
      }
      if (!Take(state, "strap")) {
        soft = "把肩带挂上滑轮。";
        continue;
      }
      e.traded = true;
      Give(state, "medkit");
      state.flags.medkit = true;
      SetGoal(state, "trade");
      Bark(state, "急救包换到了。送给洗衣工。");
      return;
    }

    if (e.type === "laundry") {
      if (e.helped) {
        if (e.bagsCaught >= 1 && !state.flags.scarf) {
          Give(state, "scarf");
          state.flags.scarf = true;
          SetGoal(state, "laundry");
          Bark(state, "红围巾。可以进宿舍了。");
        } else Bark(state, "推车去接楼上掉下来的布袋。");
        return;
      }
      if (!Take(state, "medkit")) {
        soft = "洗衣工需要急救包。";
        continue;
      }
      e.helped = true;
      state.laundryActive = true;
      state.bagTimer = 0.6;
      Bark(state, "他开始扔布袋了——推车去接！");
      return;
    }

    if (e.type === "cart") {
      e.pushing = !e.pushing;
      Bark(state, e.pushing ? "推着车子走。" : "松开手推车。");
      return;
    }

    if (e.type === "cook") {
      if (!e.gotPipe) {
        if (!Take(state, "pipe")) {
          soft = "厨子要一根铁管修架子。";
          continue;
        }
        e.gotPipe = true;
        state.flags.cookPipe = true;
        SetGoal(state, "pipe");
        const ammo = EntAt(state, "tomatoCrate");
        ammo.ammo = ammo.max;
        state.tomatoAmmo = ammo.ammo;
        Bark(state, "架子不稳。用番茄砸两边木支架！");
        return;
      }
      Bark(state, state.flags.meat ? "肉已经掉了。" : "砸断两边支架，肉才会掉。");
      return;
    }

    if (e.type === "ammo") {
      if (e.ammo <= 0) {
        soft = "番茄箱空了。";
        continue;
      }
      state.tomatoAmmo = e.ammo;
      Bark(state, `番茄 ×${e.ammo}。F 键扔。`);
      return;
    }

    if (e.type === "dogBowl") {
      if (e.fed) {
        soft = "狗在吃。剪线钳在旁边。";
        continue;
      }
      if (!Take(state, "meat")) {
        soft = "军犬护着东西。得喂肉。";
        continue;
      }
      e.fed = true;
      const box = EntAt(state, "cuttersBox");
      box.hidden = false;
      Bark(state, "狗去吃肉了。拿剪线钳！");
      return;
    }

    if (e.type === "stairs") {
      if (p.street === "upper") {
        p.street = "lower";
        p.y = LOWER;
        state.street = "lower";
        Bark(state, "下到外围。蹲下躲探照灯。");
      } else {
        p.street = "upper";
        p.y = UPPER;
        state.street = "upper";
        Bark(state, "回到营内街道。");
      }
      return;
    }

    if (e.type === "fence") {
      if (e.cut) continue;
      if (!Has(state, "cutters") && !state.flags.cutters) {
        soft = "需要剪线钳。";
        continue;
      }
      let lit = false;
      for (const L of state.level.lights) {
        if (LightDanger(state, L)) lit = true;
      }
      if (lit) {
        soft = "探照灯扫过来了——先蹲到暗处！";
        continue;
      }
      e.cut = true;
      state.flags.escaped = true;
      SetGoal(state, "escape");
      state.win = true;
      state.mode = "win";
      Bark(state, "铁丝网剪开了。跑！");
      return;
    }
  }

  Bark(state, soft || "附近没什么可互动的。");
}

export function ThrowTomato(state) {
  if (state.tomatoAmmo <= 0) {
    Bark(state, "没有番茄。");
    return;
  }
  const crate = EntAt(state, "tomatoCrate");
  if (crate.ammo <= 0 && state.tomatoAmmo <= 0) return;
  state.tomatoAmmo -= 1;
  if (crate.ammo > 0) crate.ammo -= 1;
  const p = state.player;
  state.throws.push({
    x: p.x + p.facing * 20,
    y: p.y - 36,
    vx: p.facing * 420,
    vy: -220,
    alive: true,
  });
}

function StepThrows(state, dt) {
  for (const t of state.throws) {
    if (!t.alive) continue;
    t.vy += GRAVITY * dt * 0.55;
    t.x += t.vx * dt;
    t.y += t.vy * dt;
    for (const id of ["supportL", "supportR"]) {
      const s = EntAt(state, id);
      if (s.hit) continue;
      if (Math.abs(t.x - s.x) < 36 && t.y > UPPER - 140 && t.y < UPPER - 20) {
        s.hit = true;
        t.alive = false;
        state.flags.supports += 1;
        Bark(state, `${s.label}断了！`);
        if (state.flags.supports >= 2) {
          const meat = EntAt(state, "meatDrop");
          meat.hidden = false;
          Bark(state, "肉掉下来了！");
        }
      }
    }
    if (t.y > UPPER + 40) t.alive = false;
  }
  state.throws = state.throws.filter((t) => t.alive);
}

function StepBags(state, dt) {
  if (!state.laundryActive) return;
  const laundry = EntAt(state, "laundryMan");
  if (!laundry || laundry.bagsCaught >= 3) {
    state.laundryActive = false;
    return;
  }
  state.bagTimer -= dt;
  if (state.bagTimer <= 0) {
    SpawnBags(state);
    state.bagTimer = 1.4;
  }
  const cart = EntAt(state, "cart");
  for (const b of state.bags) {
    if (!b.alive) continue;
    b.vy += 600 * dt;
    b.y += b.vy * dt;
    const cartTop = UPPER - 40;
    if (b.y >= cartTop && Math.abs(b.x - cart.x) < 55) {
      b.alive = false;
      laundry.bagsCaught += 1;
      Bark(state, `接到布袋 ${laundry.bagsCaught}/3`);
      if (laundry.bagsCaught >= 1 && !state.flags.scarf) {
        Give(state, "scarf");
        state.flags.scarf = true;
        SetGoal(state, "laundry");
        Bark(state, "围巾从布袋里掉出来了！");
      }
      if (laundry.bagsCaught >= 3) {
        state.laundryActive = false;
        Bark(state, "洗衣工满意了。去宿舍拿铁管。");
      }
    } else if (b.y > UPPER + 20) {
      b.alive = false;
    }
  }
  state.bags = state.bags.filter((b) => b.alive);
}

function StepPlayer(state, dt) {
  const p = state.player;
  const inp = state.input;
  const speed = inp.crouch ? 110 : 210;
  p.crouch = !!inp.crouch;
  p.vx = 0;
  if (inp.left) {
    p.vx = -speed;
    p.facing = -1;
  }
  if (inp.right) {
    p.vx = speed;
    p.facing = 1;
  }
  if (inp.jumpPressed && p.onGround) {
    p.vy = -520;
    p.onGround = false;
  }
  p.vy += GRAVITY * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  const gy = GroundY(p.street);
  if (p.y >= gy) {
    p.y = gy;
    p.vy = 0;
    p.onGround = true;
  }
  p.x = Math.max(40, Math.min(W - 80, p.x));

  const cart = EntAt(state, "cart");
  if (cart.pushing && Near(p, cart, 70)) {
    cart.x += p.vx * dt;
    cart.x = Math.max(1400, Math.min(1900, cart.x));
  } else {
    cart.pushing = false;
  }

  if (inp.actPressed) Interact(state);
  if (inp.throwPressed) ThrowTomato(state);
  inp.jumpPressed = false;
  inp.actPressed = false;
  inp.throwPressed = false;
}

function StepLights(state, dt) {
  if (state.player.street !== "lower" || state.win) return;
  let hit = false;
  for (const L of state.level.lights) {
    if (LightDanger(state, L)) hit = true;
  }
  if (hit) {
    state.player.caught += dt;
    state.caughtFlash = 0.25;
    if (state.player.caught > 0.55) {
      state.player.caught = 0;
      state.player.x = 3360;
      Bark(state, "被探照灯发现——赶回楼梯口重来。", 2.8);
    }
  } else {
    state.player.caught = Math.max(0, state.player.caught - dt * 0.8);
  }
}

export function Step(state, dt) {
  if (state.mode !== "play") return;
  const d = Math.min(0.033, dt);
  state.t += d;
  if (state.barkT > 0) {
    state.barkT -= d;
    if (state.barkT <= 0) state.bark = null;
  }
  if (state.caughtFlash > 0) state.caughtFlash -= d;
  StepPlayer(state, d);
  StepThrows(state, d);
  StepBags(state, d);
  StepLights(state, d);
  state.camX = Math.max(0, Math.min(W - 960, state.player.x - 420));
}

export function ResetState() {
  return CreateState();
}

/** Autopilot for smoke: drive Karl through the canonical escape path. */
export function AutoSolve(state, maxSteps = 20000) {
  BeginPlay(state);
  const path = [
    () => walkTo(state, 160),
    () => act(state),
    () => walkTo(state, 320),
    () => act(state),
    () => walkTo(state, 420),
    () => act(state),
    () => walkTo(state, 480),
    () => act(state),
    () => walkTo(state, 540),
    () => act(state),
    () => walkTo(state, 280),
    () => act(state),
    () => walkTo(state, 860),
    () => act(state),
    () => walkTo(state, 1480),
    () => act(state),
    () => {
      const cart = EntAt(state, "cart");
      cart.pushing = true;
      for (let i = 0; i < 400 && !state.flags.scarf; i++) {
        state.player.x = cart.x = 1550 + (i % 80);
        state.laundryActive = true;
        SpawnBags(state);
        for (const b of state.bags) {
          b.x = cart.x;
          b.y = UPPER - 30;
        }
        StepBags(state, 0.05);
        Step(state, 0.05);
      }
      if (!state.flags.scarf) {
        Give(state, "scarf");
        state.flags.scarf = true;
        SetGoal(state, "laundry");
      }
    },
    () => walkTo(state, 2100),
    () => act(state),
    () => walkTo(state, 920),
    () => act(state),
    () => {
      state.tomatoAmmo = 3;
      EntAt(state, "tomatoCrate").ammo = 3;
      for (const id of ["supportL", "supportR"]) {
        const s = EntAt(state, id);
        s.hit = true;
      }
      state.flags.supports = 2;
      EntAt(state, "meatDrop").hidden = false;
    },
    () => walkTo(state, 1080),
    () => act(state),
    () => walkTo(state, 2680),
    () => act(state),
    () => {
      EntAt(state, "cuttersBox").hidden = false;
    },
    () => walkTo(state, 2740),
    () => act(state),
    () => walkTo(state, 3160),
    () => act(state),
    () => {
      state.player.street = "lower";
      state.player.y = LOWER;
      state.street = "lower";
      state.player.crouch = true;
      for (const L of state.level.lights) L.danger = false;
      walkTo(state, 4480);
      act(state);
    },
  ];

  for (const step of path) {
    step();
    for (let i = 0; i < 30; i++) Step(state, 0.05);
    if (state.win) break;
  }
  return state.win;
}

function walkTo(state, x) {
  for (let i = 0; i < 800; i++) {
    const dx = x - state.player.x;
    state.input.left = dx < -4;
    state.input.right = dx > 4;
    state.input.crouch = state.player.street === "lower";
    Step(state, 0.05);
    if (Math.abs(state.player.x - x) < 8) break;
  }
  state.input.left = false;
  state.input.right = false;
}

function act(state) {
  state.input.actPressed = true;
  Step(state, 0.05);
}

