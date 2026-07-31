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
      x: 220,
      y: SURFACE_Y,
      layer: "surface",
      speaker: "高老忠",
      line: "铁锹在井边。捡起来再下洞——空手挖不动土。",
      hint: "与高老忠交谈",
      goal: "talk_laozhong",
    }),
    PlacePickup(180, SURFACE_Y, ITEM_SHOVEL, "surface"),
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
      hint: "护送入洞",
      line: "快进西口！",
      goal: "shelter_a",
      requiresGoal: "link_safe",
    }),
    Ent({
      id: "v2",
      type: "shelter",
      x: 520,
      y: SURFACE_Y,
      layer: "surface",
      hint: "护送入洞",
      line: "东窖通了吗？",
      goal: "shelter_b",
      requiresGoal: "link_safe",
    }),
    Ent({
      id: "v3",
      type: "shelter",
      x: 760,
      y: SURFACE_Y,
      layer: "surface",
      hint: "护送入洞",
      line: "谢传宝叔！",
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
      hint: "按 E 敲钟报警",
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

/** Act4: dig three upward shafts to surface ports, then ambush. */
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
      goal: null, // zones carry goals
      ax: s.x,
      ay: s.y,
      bx: CellCenter(soil, 14, 2).x,
      by: CellCenter(soil, 14, 2).y,
    },
  ];
  const portX = (c) => CellCenter(soil, c, 1).x;
  level.shafts = [
    { x: s.x, label: "主巷" },
    { x: portX(14), label: "井口（上挖）" },
    { x: portX(28), label: "墙根（上挖）" },
    { x: portX(42), label: "灶台（上挖）" },
  ];
  level.entities = [
    PlacePickup(s.x - 40, SURFACE_Y, ITEM_SHOVEL, "surface"),
    PlacePickup(s.x + 70, SURFACE_Y, ITEM_GRENADE, "surface"),
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
    Ent({
      id: "port1",
      type: "shot_port",
      x: portX(14),
      y: SURFACE_Y,
      layer: "surface",
      hint: "井口出击",
      goal: "shot_a",
      requiresGoal: "dig_shaft_a",
      exitTo: portX(28),
    }),
    Ent({
      id: "port2",
      type: "shot_port",
      x: portX(28),
      y: SURFACE_Y,
      layer: "surface",
      hint: "墙根出击",
      goal: "shot_b",
      requiresGoal: "dig_shaft_b",
      exitTo: portX(42),
    }),
    Ent({
      id: "port3",
      type: "shot_port",
      x: portX(42),
      y: SURFACE_Y,
      layer: "surface",
      hint: "灶台出击",
      goal: "shot_c",
      requiresGoal: "dig_shaft_c",
      exitTo: portX(42) + 200,
    }),
    Ent({
      id: "patrol2",
      type: "patrol",
      x: portX(28),
      y: SURFACE_Y,
      layer: "surface",
      homeX: portX(28),
      amp: 180,
      hostile: true,
      hits: 0,
    }),
  ];
  level.props = [
    { kind: "house", x: s.x, variant: 0 },
    { kind: "well", x: portX(14) },
    { kind: "house", x: portX(28), variant: 1 },
    { kind: "house", x: portX(42), variant: 0 },
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
  return (BUILDERS[chapterId] || BuildAct1)();
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
