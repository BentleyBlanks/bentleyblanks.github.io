/**
 * Levels: surface props + diggable soil band.
 * Underground starts as cellar pockets only — corridors must be carved.
 */

import {
  AirConnected,
  BuildDigBand,
  CELL,
  CellCenter,
  CountAirInRect,
  RebuildTunnelSolids,
} from "./Script_Dig.mjs";
import { SeedDepthDecor } from "./Script_Depth.mjs";
import { ITEM_CHARGE, ITEM_GRENADE, ITEM_SHOVEL, PickupEntity } from "./Script_Items.mjs";

function PlacePickup(x, y, itemId, layer = "both") {
  const p = PickupEntity(x, y, itemId);
  p.layer = layer;
  return p;
}

export const SURFACE_Y = 0;
export const VIEW_W = 960;
export const VIEW_H = 540;
/** Dig band sits just under the surface cut line. */
export const DIG_ORIGIN_Y = 72;
export const DIG_ROWS = 8;

function Solid(id, x, y, w, h) {
  return { id, x, y, w, h, digOnly: false };
}

function Ent(partial) {
  return { w: 28, h: 48, done: false, hidden: false, ...partial };
}

function ParallaxProfile(night = false) {
  return {
    night,
    skyTop: night ? "#141a24" : "#9eb6bc",
    skyBot: night ? "#2a2430" : "#e2c9a0",
    haze: night ? "#1c2430" : "#7f9a7a",
    field: night ? "#2a3228" : "#6f8a52",
    earth: night ? "#3a2e24" : "#8b6a45",
    soilDeep: "#3d281c",
    soilMid: "#6a4a32",
    soilLight: "#8a6340",
    soft: "#9a6b3e",
    hard: "#4a4540",
    air: "#2a2118",
  };
}

function BaseLevel(width, opts = {}) {
  return {
    width,
    viewW: VIEW_W,
    viewH: VIEW_H,
    surfaceY: SURFACE_Y,
    /** Kept for camera helpers — equals bottom of a typical standing row. */
    tunnelFloor: DIG_ORIGIN_Y + (DIG_ROWS - 2) * CELL,
    tunnelCeil: DIG_ORIGIN_Y + CELL,
    palette: ParallaxProfile(!!opts.night),
    surfaceSolids: [Solid("sg", -40, SURFACE_Y, width + 80, 220)],
    tunnelSolids: [],
    soil: null,
    digLinks: [], // { id, goal, ax,ay,bx,by }
    digZones: [], // { id, goal, c,r,w,h, need }
    entities: [],
    props: [],
    spawn: { x: 140, y: SURFACE_Y, tunnel: !!opts.startTunnel },
    shafts: [],
  };
}

function AttachSoil(level, soil) {
  level.soil = soil;
  RebuildTunnelSolids(level);
  return level;
}

function SpawnInCellar(level, c, r) {
  const p = CellCenter(level.soil, c, r + 1);
  level.spawn = { x: p.x, y: p.y + CELL * 0.35, tunnel: true };
}

/** Act1: three isolated cellars — dig to connect A→B→C. */
function BuildAct1() {
  const level = BaseLevel(2600);
  const cols = 56;
  const originX = 80;
  // House cellars under props
  const cellarA = { c: 4, r: 2, w: 3, h: 2 };
  const cellarB = { c: 22, r: 2, w: 3, h: 2 };
  const cellarC = { c: 40, r: 3, w: 3, h: 2 };
  const soil = BuildDigBand({
    originX,
    originY: DIG_ORIGIN_Y,
    cols,
    rows: DIG_ROWS,
    hardBlobs: [
      { c: 14, r: 1, w: 2, h: 3 }, // rock forcing dig around
      { c: 32, r: 4, w: 3, h: 2 },
    ],
    cellars: [cellarA, cellarB, cellarC],
  });
  AttachSoil(level, soil);

  const a = CellCenter(soil, cellarA.c + 1, cellarA.r + 1);
  const b = CellCenter(soil, cellarB.c + 1, cellarB.r + 1);
  const c = CellCenter(soil, cellarC.c + 1, cellarC.r + 1);
  level.digLinks = [
    { id: "link_ab", goal: "link_ab", ax: a.x, ay: a.y, bx: b.x, by: b.y },
    { id: "link_bc", goal: "link_bc", ax: b.x, ay: b.y, bx: c.x, by: c.y },
  ];

  level.shafts = [{ x: a.x, label: "高家地窖", col: cellarA.c + 1, row: cellarA.r }];
  level.entities = [
    Ent({
      id: "npc_laozhong",
      type: "talk",
      x: 200,
      y: SURFACE_Y,
      layer: "surface",
      speaker: "高老忠",
      script: [
        { speaker: "高老忠", text: "传宝，三家地窖互不相通，藏不住全村人。" },
        { speaker: "高老忠", text: "鬼子一进庄，各顾各的地窖——等于把人往网里送。" },
        { speaker: "高老忠", text: "铁锹在井边。你先捡上——空手挖不动土。" },
        { speaker: "高老忠", text: "下洞后按 R 画蓝图，标出要挖的巷道，再点 J 一格格开挖。别学打洞乱刨！" },
      ],
      hint: "与高老忠交谈",
      goal: "talk_laozhong",
    }),
    Ent({
      id: "npc_linxia",
      type: "talk",
      x: 480,
      y: SURFACE_Y,
      layer: "surface",
      speaker: "林霞",
      script: [
        { speaker: "林霞", text: "男的下洞，女的望风。蓝图画短了，人就喘不上气。" },
        { speaker: "林霞", text: "软土能挖，硬砖绕开。通了三家，才算真正有地道。" },
        { speaker: "林霞", text: "我在街上盯着——有狗腿子过来，你就别出声。" },
      ],
      hint: "与林霞交谈",
      goal: "talk_linxia",
    }),
    Ent({
      id: "npc_militia1",
      type: "talk",
      x: 720,
      y: SURFACE_Y,
      layer: "surface",
      speaker: "民兵",
      script: [
        { speaker: "民兵", text: "高老忠说得对。洞不通，夜里一抄就全完。" },
        { speaker: "民兵", text: "你挖，我们望风。别让山田那帮人瞧见土。" },
      ],
      hint: "与民兵交谈",
    }),
    PlacePickup(100, SURFACE_Y, ITEM_SHOVEL, "surface"),
    Ent({
      id: "hatch1",
      type: "hatch",
      x: a.x,
      y: SURFACE_Y,
      layer: "both",
      w: 40,
      h: 18,
      hint: "按 E 下地窖（先捡铁锹）",
      goal: "enter_hatch",
      tunnelX: a.x,
      tunnelY: a.y + 10,
    }),
  ];
  level.props = [
    { kind: "house", x: a.x, variant: 0 },
    { kind: "house", x: b.x, variant: 1 },
    { kind: "house", x: c.x, variant: 0 },
    { kind: "tree", x: 2100 },
    { kind: "well", x: (a.x + b.x) / 2 },
  ];
  return level;
}

/** Act2: night raid — dig collapsed soft plug so east shelter chamber opens, then surface. */
function BuildAct2() {
  const level = BaseLevel(2800, { night: true });
  const originX = 60;
  const cols = 60;
  const west = { c: 5, r: 2, w: 4, h: 2 };
  const east = { c: 28, r: 2, w: 4, h: 3 }; // safe chamber — starts sealed by soft (not carved yet!)
  // Only west cellar exists; east must be dug out
  const soil = BuildDigBand({
    originX,
    originY: DIG_ORIGIN_Y,
    cols,
    rows: DIG_ROWS,
    hardBlobs: [
      { c: 16, r: 1, w: 2, h: 4 },
      { c: 22, r: 5, w: 5, h: 1 },
    ],
    cellars: [west],
  });
  // Mark east zone as soft (already is) — player must carve `need` air cells there
  AttachSoil(level, soil);
  const w = CellCenter(soil, west.c + 1, west.r + 1);
  level.digZones = [
    { id: "safe_chamber", goal: "dig_safe_room", c: east.c, r: east.r, w: east.w, h: east.h, need: 8 },
  ];
  level.digLinks = [
    {
      id: "link_safe",
      goal: "link_safe",
      ax: w.x,
      ay: w.y,
      bx: CellCenter(soil, east.c + 1, east.r + 1).x,
      by: CellCenter(soil, east.c + 1, east.r + 1).y,
      // link checks AIR at both ends — east center becomes AIR once dug
    },
  ];
  level.shafts = [
    { x: w.x, label: "西口" },
    { x: CellCenter(soil, east.c + 1, east.r).x, label: "东窖（待挖）" },
  ];
  level.entities = [
    PlacePickup(w.x - 50, SURFACE_Y, ITEM_SHOVEL, "surface"),
    Ent({
      id: "npc_night",
      type: "talk",
      x: w.x - 120,
      y: SURFACE_Y,
      layer: "surface",
      speaker: "高老忠",
      script: [
        { speaker: "高老忠", text: "夜袭来了！东窖还没挖成，西口藏不下全村。" },
        { speaker: "高传宝", text: "叔，我去挖东窖通气！" },
        { speaker: "高老忠", text: "你挖蓝图、开东窖。钟——我去敲。进洞！" },
        { speaker: "高老忠", text: "听见钟声再跑。听不见——就往地道里钻，别回头。" },
      ],
      hint: "夜袭前听交代",
      goal: "talk_night",
    }),
    Ent({
      id: "npc_linxia_night",
      type: "talk",
      x: w.x + 160,
      y: SURFACE_Y,
      layer: "surface",
      speaker: "林霞",
      script: [
        { speaker: "林霞", text: "我去喊街东的人。你只管挖——通了东窖才够藏。" },
        { speaker: "林霞", text: "鬼子灯火已经到黑风口了。快！" },
      ],
      hint: "与林霞交接望风",
    }),
    Ent({
      id: "hatch2a",
      type: "hatch",
      x: w.x,
      y: SURFACE_Y,
      layer: "both",
      w: 40,
      h: 18,
      hint: "按 E 下地道",
      tunnelX: w.x,
      tunnelY: w.y + 10,
    }),
    Ent({
      id: "v1",
      type: "shelter",
      x: 280,
      y: SURFACE_Y,
      layer: "surface",
      speaker: "大娘",
      hint: "护送入洞",
      line: "孩子呢？快——进西口！",
      goal: "shelter_a",
      requiresGoal: "link_safe",
    }),
    Ent({
      id: "v2",
      type: "shelter",
      x: 520,
      y: SURFACE_Y,
      layer: "surface",
      speaker: "乡亲",
      hint: "护送入洞",
      line: "东窖通了吗？不通我可不下去！",
      goal: "shelter_b",
      requiresGoal: "link_safe",
    }),
    Ent({
      id: "v3",
      type: "shelter",
      x: 760,
      y: SURFACE_Y,
      layer: "surface",
      speaker: "小伙计",
      hint: "护送入洞",
      line: "谢传宝叔！钟一响我们就钻！",
      goal: "shelter_c",
      requiresGoal: "link_safe",
    }),
    Ent({
      id: "bell",
      type: "bell",
      x: 2300,
      y: SURFACE_Y,
      layer: "surface",
      w: 36,
      h: 90,
      radius: 70,
      hint: "到钟下——高老忠敲钟",
      goal: "reach_bell",
    }),
    Ent({
      id: "patrol1",
      type: "patrol",
      x: 1600,
      y: SURFACE_Y,
      layer: "surface",
      homeX: 1600,
      amp: 140,
      hostile: true,
      barkYamada: "高家庄的人呢？搜！地窖里也给我翻！",
    }),
    Ent({
      id: "patrol2",
      type: "patrol",
      x: 2050,
      y: SURFACE_Y,
      layer: "surface",
      homeX: 2050,
      amp: 90,
      hostile: true,
      barkYamada: "钟楼方向有动静——跟上！",
    }),
  ];
  level.props = [
    { kind: "house", x: w.x, variant: 0 },
    { kind: "house", x: CellCenter(soil, east.c + 1, east.r).x, variant: 1 },
    { kind: "tree", x: 2260 },
    { kind: "bell", x: 2300 },
  ];
  level.surfaceSolids.push(Solid("bags", 1900, SURFACE_Y - 36, 70, 36));
  return level;
}

/** Act3: dig an alcove for the flip lid, then spy puzzle. */
function BuildAct3() {
  const level = BaseLevel(2400, { startTunnel: true });
  const originX = 40;
  const cols = 50;
  const start = { c: 3, r: 2, w: 5, h: 2 };
  const soil = BuildDigBand({
    originX,
    originY: DIG_ORIGIN_Y,
    cols,
    rows: DIG_ROWS,
    hardBlobs: [
      { c: 12, r: 2, w: 2, h: 3 },
      { c: 20, r: 1, w: 3, h: 2 },
    ],
    cellars: [start],
  });
  AttachSoil(level, soil);
  SpawnInCellar(level, start.c + 1, start.r);
  const startPt = CellCenter(soil, start.c + 2, start.r + 1);
  // Alcove zone to the right — must carve 6 air cells
  level.digZones = [{ id: "alcove", goal: "dig_alcove", c: 15, r: 2, w: 4, h: 3, need: 6 }];
  level.digLinks = [
    {
      id: "link_trap",
      goal: "link_trap",
      ax: startPt.x,
      ay: startPt.y,
      bx: CellCenter(soil, 30, 3).x,
      by: CellCenter(soil, 30, 3).y,
    },
  ];
  // Pre-carve nothing at trap — player digs there; place a soft target marker cell center for link B
  // Carve a tiny air seed at trap so link B can become valid as they dig into it — actually link needs both AIR.
  // Seed 1 air at trap destination so digging a path TO it completes link; seed:
  // Actually B starts as SOFT — AirConnected fails until they carve into that cell. Good.

  level.shafts = [{ x: startPt.x, label: "灶台口" }];
  const trapX = CellCenter(soil, 30, 3).x;
  level.entities = [
    PlacePickup(startPt.x - 36, startPt.y + 16, ITEM_SHOVEL, "tunnel"),
    Ent({
      id: "npc_plan",
      type: "talk",
      x: startPt.x + 40,
      y: startPt.y + 16,
      layer: "tunnel",
      speaker: "林霞",
      script: [
        { speaker: "林霞", text: "要能藏也能打。先设计翻口厢室蓝图，再改建机关。" },
        { speaker: "高传宝", text: "我画蓝图挖厢室、通卡口。上面那两个武工队，回头盘问。" },
      ],
      hint: "听计议",
      goal: "talk_plan",
      tunnelAnchored: true,
    }),
    Ent({
      id: "flip_build",
      type: "flip_build",
      x: CellCenter(soil, 16, 3).x,
      y: CellCenter(soil, 16, 3).y + 16,
      layer: "tunnel",
      w: 44,
      h: 28,
      hint: "挖出翻口厢室后按 E 改建",
      goal: "build_flip",
      requiresGoal: "dig_alcove",
      tunnelAnchored: true,
    }),
    Ent({
      id: "hatch3",
      type: "hatch",
      x: startPt.x,
      y: SURFACE_Y,
      layer: "both",
      w: 40,
      h: 18,
      hint: "按 E 上地面 / 下地道",
      tunnelX: startPt.x,
      tunnelY: startPt.y + 10,
    }),
    Ent({
      id: "spy_talk",
      type: "spy_talk",
      x: startPt.x - 40,
      y: SURFACE_Y,
      layer: "surface",
      hint: "按 E 盘问来客",
      goal: "expose_spy",
    }),
    Ent({
      id: "spy",
      type: "spy",
      x: startPt.x + 80,
      y: SURFACE_Y,
      layer: "surface",
      exposed: false,
      trapped: false,
    }),
    Ent({
      id: "flip_trap",
      type: "flip_trap",
      x: trapX,
      y: CellCenter(soil, 30, 3).y + 16,
      layer: "tunnel",
      w: 52,
      h: 22,
      armed: false,
      hint: "特务到位后按 E 触发翻口",
      goal: "trap_spy",
      requiresGoal: "link_trap",
      tunnelAnchored: true,
    }),
  ];
  level.props = [
    { kind: "house", x: startPt.x, variant: 0 },
    { kind: "house", x: trapX, variant: 1 },
  ];
  return level;
}

function PlaceEnemy(id, x, opts = {}) {
  const hp = opts.hp ?? 2;
  return Ent({
    id,
    type: "enemy",
    x,
    y: SURFACE_Y,
    layer: "surface",
    homeX: x,
    amp: opts.amp ?? 100,
    phase: opts.phase ?? 0,
    hp,
    maxHp: hp,
    dead: false,
    alert: 0,
    alertX: x,
    hurtFlash: 0,
    label: "鬼子",
    hostile: true,
    t: 0,
  });
}

function PlaceShotPort(id, x, tunnelY, requiresGoal, hint) {
  return Ent({
    id,
    type: "shot_port",
    x,
    y: SURFACE_Y,
    layer: "both",
    w: 36,
    h: 20,
    radius: 56,
    hint,
    requiresGoal,
    tunnelX: x,
    tunnelY,
    cool: 0,
  });
}

/** Act4: dig three shafts, sneak out ports, kill 鬼子, retreat into tunnels. */
function BuildAct4() {
  const level = BaseLevel(2800);
  const originX = 40;
  const cols = 58;
  const spine = { c: 4, r: 3, w: 8, h: 2 };
  const soil = BuildDigBand({
    originX,
    originY: DIG_ORIGIN_Y,
    cols,
    rows: DIG_ROWS,
    hardBlobs: [
      { c: 18, r: 2, w: 2, h: 3 },
      { c: 32, r: 2, w: 2, h: 3 },
    ],
    cellars: [spine],
  });
  AttachSoil(level, soil);
  const s = CellCenter(soil, spine.c + 2, spine.r + 1);
  // Three vertical dig zones near surface row (r=1) — dig UP shafts
  level.digZones = [
    { id: "shaft_a", goal: "dig_shaft_a", c: 14, r: 1, w: 2, h: 4, need: 5 },
    { id: "shaft_b", goal: "dig_shaft_b", c: 28, r: 1, w: 2, h: 4, need: 5 },
    { id: "shaft_c", goal: "dig_shaft_c", c: 42, r: 1, w: 2, h: 4, need: 5 },
  ];
  level.digLinks = [
    {
      id: "link_a",
      goal: null,
      ax: s.x,
      ay: s.y,
      bx: CellCenter(soil, 14, 2).x,
      by: CellCenter(soil, 14, 2).y,
    },
  ];
  const portX = (c) => CellCenter(soil, c, 1).x;
  const tunnelAt = (c) => CellCenter(soil, c, 2).y + 10;
  const pxA = portX(14);
  const pxB = portX(28);
  const pxC = portX(42);
  level.shafts = [
    { x: s.x, label: "主巷" },
    { x: pxA, label: "井口出击" },
    { x: pxB, label: "墙根出击" },
    { x: pxC, label: "灶台出击" },
  ];
  level.entities = [
    PlacePickup(s.x - 40, SURFACE_Y, ITEM_SHOVEL, "surface"),
    PlacePickup(s.x + 70, SURFACE_Y, ITEM_GRENADE, "surface"),
    Ent({
      id: "npc_ambush",
      type: "talk",
      x: s.x + 30,
      y: SURFACE_Y,
      layer: "surface",
      speaker: "高传宝",
      script: [
        { speaker: "高传宝", text: "山田的鬼子进村了。竖井挖穿——悄悄出井，瞄着打，打完钻回去。" },
        { speaker: "林霞", text: "打一枪换一个地方。别在地面恋战，杀光这拨再谈别的。" },
        { speaker: "民兵", text: "井口、墙根、灶台三口轮着出。看见黄皮就开枪。" },
      ],
      hint: "战前交代",
      goal: "talk_ambush",
    }),
    Ent({
      id: "h4",
      type: "hatch",
      x: s.x,
      y: SURFACE_Y,
      layer: "both",
      w: 40,
      h: 18,
      hint: "按 E 下主巷",
      tunnelX: s.x,
      tunnelY: s.y + 10,
      goal: "enter_spine",
    }),
    PlaceShotPort("port1", pxA, tunnelAt(14), "dig_shaft_a", "井口出击"),
    PlaceShotPort("port2", pxB, tunnelAt(28), "dig_shaft_b", "墙根出击"),
    PlaceShotPort("port3", pxC, tunnelAt(42), "dig_shaft_c", "灶台出击"),
    // Village invaders — kill them all (神出鬼没)
    PlaceEnemy("oni1", pxA + 70, { amp: 70, phase: 0.2, hp: 2 }),
    PlaceEnemy("oni2", pxB - 40, { amp: 110, phase: 1.1, hp: 2 }),
    PlaceEnemy("oni3", pxB + 90, { amp: 80, phase: 2.4, hp: 2 }),
    PlaceEnemy("oni4", pxC - 30, { amp: 95, phase: 0.7, hp: 2 }),
    PlaceEnemy("oni5", pxC + 120, { amp: 60, phase: 1.8, hp: 3 }),
  ];
  level.props = [
    { kind: "house", x: s.x, variant: 0 },
    { kind: "well", x: pxA },
    { kind: "house", x: pxB, variant: 1 },
    { kind: "house", x: pxC, variant: 0 },
    { kind: "tree", x: pxA - 90 },
    { kind: "tree", x: pxC + 200 },
  ];
  return level;
}

/** Act5: dig under blockhouse through soft maze around hard footings. */
function BuildAct5() {
  const level = BaseLevel(3000, { startTunnel: true });
  const originX = 40;
  const cols = 64;
  const start = { c: 3, r: 3, w: 4, h: 2 };
  const charge = { c: 48, r: 3, w: 3, h: 2 }; // not pre-carved
  const soil = BuildDigBand({
    originX,
    originY: DIG_ORIGIN_Y,
    cols,
    rows: DIG_ROWS,
    hardBlobs: [
      { c: 12, r: 2, w: 3, h: 4 },
      { c: 22, r: 1, w: 2, h: 5 },
      { c: 30, r: 3, w: 4, h: 2 },
      { c: 40, r: 2, w: 3, h: 3 },
    ],
    cellars: [start],
  });
  AttachSoil(level, soil);
  SpawnInCellar(level, start.c + 1, start.r);
  const s = CellCenter(soil, start.c + 1, start.r + 1);
  const chargePt = CellCenter(soil, charge.c + 1, charge.r + 1);
  level.digZones = [
    { id: "charge_room", goal: "dig_charge_room", c: charge.c, r: charge.r, w: charge.w, h: charge.h, need: 5 },
  ];
  level.digLinks = [
    { id: "link_charge", goal: "link_charge", ax: s.x, ay: s.y, bx: chargePt.x, by: chargePt.y },
  ];
  level.shafts = [
    { x: s.x, label: "进攻端" },
    { x: chargePt.x, label: "炮楼根（待挖）" },
  ];
  level.entities = [
    PlacePickup(s.x + 40, s.y + 16, ITEM_SHOVEL, "tunnel"),
    PlacePickup(s.x - 40, s.y + 16, ITEM_CHARGE, "tunnel"),
    Ent({
      id: "npc_assault",
      type: "talk",
      x: s.x + 80,
      y: s.y + 16,
      layer: "tunnel",
      speaker: "赵平原",
      script: [
        { speaker: "赵平原", text: "炮楼夯土硬，软土里绕。先设计通往药室的蓝图。" },
        { speaker: "赵平原", text: "挖通后放下铁锹、拿炸药包到药室按 F 安放，再上地面发信号。" },
        { speaker: "高传宝", text: "叔的钟声还在。这一回，轮到炮楼听咱们的。" },
      ],
      hint: "进攻端听令",
      goal: "talk_assault",
      tunnelAnchored: true,
    }),
    Ent({
      id: "plant_zone",
      type: "plant_zone",
      x: chargePt.x,
      y: chargePt.y + 16,
      layer: "tunnel",
      w: 40,
      h: 28,
      hint: "挖通后空手拿炸药包过来，按 F 安放",
      goal: "plant_charge",
      requiresGoal: "link_charge",
      tunnelAnchored: true,
      radius: 56,
    }),
    Ent({
      id: "hatch5",
      type: "hatch",
      x: s.x,
      y: SURFACE_Y,
      layer: "both",
      w: 40,
      h: 18,
      hint: "按 E 回地面发信号",
      tunnelX: s.x,
      tunnelY: s.y + 10,
    }),
    Ent({
      id: "signal",
      type: "signal",
      x: chargePt.x + 220,
      y: SURFACE_Y,
      layer: "surface",
      w: 40,
      h: 50,
      hint: "按 E 发出总攻信号",
      goal: "signal_assault",
      requiresGoal: "plant_charge",
    }),
    Ent({
      id: "patrol3",
      type: "patrol",
      x: chargePt.x + 120,
      y: SURFACE_Y,
      layer: "surface",
      homeX: chargePt.x + 120,
      amp: 70,
      hostile: true,
    }),
  ];
  level.props = [
    { kind: "blockhouse", x: chargePt.x + 160 },
    { kind: "house", x: s.x, variant: 0 },
  ];
  return level;
}

const BUILDERS = {
  act1_connect: BuildAct1,
  act2_bell: BuildAct2,
  act3_combat_tunnel: BuildAct3,
  act4_ambush: BuildAct4,
  act5_heifengkou: BuildAct5,
};

export function BuildLevel(chapterId) {
  const level = (BUILDERS[chapterId] || BuildAct1)();
  SeedDepthDecor(level);
  return level;
}

export function EvalDigGoals(level) {
  const done = {};
  if (!level.soil) return done;
  for (const link of level.digLinks || []) {
    if (!link.goal) continue;
    done[link.goal] = AirConnected(level.soil, link.ax, link.ay, link.bx, link.by);
  }
  for (const zone of level.digZones || []) {
    if (!zone.goal) continue;
    done[zone.goal] = CountAirInRect(level.soil, zone.c, zone.r, zone.w, zone.h) >= zone.need;
  }
  return done;
}

export { CELL, AirConnected, CountAirInRect };
