/**
 * Levels: surface props + diggable soil band.
 * Underground starts as cellar pockets only — corridors must be carved.
 */

import {
  AirConnected,
  BuildDigBand,
  CarveRect,
  CELL,
  CellCenter,
  CountAirInRect,
  RebuildTunnelSolids,
} from "./Script_Dig.mjs";
import { SeedDepthDecor } from "./Script_Depth.mjs";
import { EnsurePlanGrid, PlanCorridorHeadroom, PlanSoftPath } from "./Script_Plan.mjs";
import {
  ITEM_AMMO,
  ITEM_CHARGE,
  ITEM_GRENADE,
  ITEM_NONE,
  ITEM_RIFLE,
  ITEM_SHOVEL,
  PickupEntity,
} from "./Script_Items.mjs";

function PlacePickup(x, y, itemId, layer = "both", extras = {}) {
  const p = PickupEntity(x, y, itemId, extras);
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
    // One soft rock bump later — Act1 tutorial path stays a straight soft corridor.
    hardBlobs: [{ c: 33, r: 5, w: 2, h: 1 }],
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

  // Pre-draw the tutorial corridors — player walks the blue path and taps J.
  EnsurePlanGrid(soil);
  const ac = { c: cellarA.c + 1, r: cellarA.r + 1 };
  const bc = { c: cellarB.c + 1, r: cellarB.r + 1 };
  const cc = { c: cellarC.c + 1, r: cellarC.r + 1 };
  PlanSoftPath(soil, ac.c, ac.r, bc.c, bc.r);
  PlanSoftPath(soil, bc.c, bc.r, cc.c, cc.r);
  PlanCorridorHeadroom(soil);
  level.tutorialPlan = true;

  const wellX = (a.x + b.x) / 2;
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
        { speaker: "高老忠", text: "下洞后路已经标好了。顺着蓝色格子一锨一锨挖通——想改道再进设计重画。" },
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
        { speaker: "林霞", text: "男的下洞，女的望风。顺着蓝图挖，别乱跑。" },
        { speaker: "林霞", text: "软土能挖，硬砖绕开。通了三家，才算真正有地道。" },
        { speaker: "林霞", text: "井边那把铁锹——先捡上再下洞。" },
      ],
      hint: "与林霞交谈",
      goal: "talk_linxia",
    }),
    Ent({
      id: "npc_militia1",
      type: "talk",
      x: 980,
      y: SURFACE_Y,
      layer: "surface",
      speaker: "民兵",
      script: [
        { speaker: "民兵", text: "高老忠说得对。洞不通，夜里一抄就全完。" },
        { speaker: "民兵", text: "你挖，我们望风。别让山田那帮人瞧见土。" },
      ],
      hint: "与民兵交谈",
    }),
    // Shovel left of the well — clear of militia talk radius ("铁锹在井边")
    PlacePickup(wellX - 40, SURFACE_Y, ITEM_SHOVEL, "surface"),
    Ent({
      id: "hatch1",
      type: "hatch",
      x: a.x,
      y: SURFACE_Y,
      layer: "both",
      w: 40,
      h: 18,
      hint: "下地窖（先捡铁锹）",
      goal: "enter_hatch",
      tunnelX: a.x,
      tunnelY: a.y + 10,
      needsShovel: true,
    }),
  ];
  level.props = [
    { kind: "house", x: a.x, variant: 0 },
    { kind: "house", x: b.x, variant: 1 },
    { kind: "house", x: c.x, variant: 0 },
    { kind: "tree", x: 2100 },
    { kind: "well", x: wellX },
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
      hint: "下地道",
      tunnelX: w.x,
      tunnelY: w.y + 10,
    }),
    Ent({
      id: "v1",
      type: "shelter",
      x: 600,
      y: SURFACE_Y,
      layer: "surface",
      speaker: "大娘",
      hint: "点我跟上，带到井口进洞",
      line: "孩子呢？我跟着你——去西口井边进洞！",
      enterLine: "进了！娃们也跟着下来！",
      goal: "shelter_a",
      requiresGoal: "link_safe",
      radius: 56,
    }),
    Ent({
      id: "v2",
      type: "shelter",
      x: 780,
      y: SURFACE_Y,
      layer: "surface",
      speaker: "乡亲",
      hint: "点我跟上，带到井口进洞",
      line: "东窖通了？好——跟着你去井口！",
      enterLine: "钻进去了！谢传宝！",
      goal: "shelter_b",
      requiresGoal: "link_safe",
      radius: 56,
    }),
    Ent({
      id: "v3",
      type: "shelter",
      x: 980,
      y: SURFACE_Y,
      layer: "surface",
      speaker: "小伙计",
      hint: "点我跟上，带到井口进洞",
      line: "传宝叔带路！我跟你去井口钻！",
      enterLine: "进洞了！钟一响就再也别出来！",
      goal: "shelter_c",
      requiresGoal: "link_safe",
      radius: 56,
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
      label: "日军",
      faction: "ijp",
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
      label: "日军",
      faction: "ijp",
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
      hint: "挖出翻口厢室后改建机关",
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
      hint: "上地面 / 下地道",
      tunnelX: startPt.x,
      tunnelY: startPt.y + 10,
    }),
    Ent({
      id: "spy_talk",
      type: "spy_talk",
      x: startPt.x - 40,
      y: SURFACE_Y,
      layer: "surface",
      hint: "盘问来客",
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
      hint: "特务到位后触发翻口",
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
  const label = opts.label || "日军";
  // 伪军 = easy proximity KO; 日军/机枪手 = hard IJA (front = counter).
  const faction =
    opts.faction ||
    (label === "伪军" ? "puppet" : "ijp");
  return Ent({
    id,
    type: "enemy",
    x,
    y: opts.y ?? SURFACE_Y,
    layer: opts.layer || "surface",
    homeX: x,
    amp: opts.amp ?? 100,
    phase: opts.phase ?? 0,
    hp,
    maxHp: hp,
    dead: false,
    ko: false,
    corpse: false,
    discovered: false,
    highAlert: false,
    facing: opts.facing ?? 1,
    alert: 0,
    alertX: x,
    hurtFlash: 0,
    label,
    faction,
    hostile: true,
    /** Behind sandbags — bullets deal half, blast ignores. */
    cover: !!opts.cover,
    t: 0,
    dropAmmo: opts.dropAmmo || 0,
    dropRifle: !!opts.dropRifle,
    dropGrenade: !!opts.dropGrenade,
    /** Flood-raid: walks AIR cells underground after the sweep begins. */
    tunnelRaid: !!opts.tunnelRaid,
    hidden: !!opts.hidden,
  });
}

/**
 * Act9 — 灌水扫荡: multi-layer tunnels, seal mouths before / during flood,
 * drink cistern, herd villagers to the high ledge, KO tunnel raiders for guns.
 */
function BuildAct9FloodRaid() {
  const level = BaseLevel(3000, { night: true, startTunnel: true });
  const cols = 62;
  const rows = 12;
  const originX = 60;
  const soil = BuildDigBand({
    originX,
    originY: DIG_ORIGIN_Y,
    cols,
    rows,
    hardBlobs: [
      { c: 24, r: 4, w: 3, h: 2 },
      { c: 36, r: 7, w: 4, h: 2 },
    ],
    cellars: [],
  });

  // Multi-layer carved network: upper refuge / mid walk / lower cistern basin.
  CarveRect(soil, 6, 2, 14, 2); // high west
  CarveRect(soil, 40, 2, 14, 2); // high east
  CarveRect(soil, 4, 5, 54, 2); // mid spine
  CarveRect(soil, 10, 8, 18, 2); // low west basin
  CarveRect(soil, 34, 8, 18, 2); // low east basin
  // Vertical connectors (shafts) — punch row1 so mouths open to the surface crust.
  for (const c of [10, 32, 50]) {
    CarveRect(soil, c, 1, 1, 9);
  }
  // Soft side ramps between layers for looping fights.
  CarveRect(soil, 20, 3, 2, 3);
  CarveRect(soil, 28, 6, 2, 3);
  CarveRect(soil, 44, 3, 2, 3);

  AttachSoil(level, soil);
  level.tunnelFloor = DIG_ORIGIN_Y + (rows - 3) * CELL;
  level.tunnelCeil = DIG_ORIGIN_Y + CELL;
  SpawnInCellar(level, 8, 5);

  const westMouth = CellCenter(soil, 10, 1);
  const midMouth = CellCenter(soil, 32, 1);
  const eastMouth = CellCenter(soil, 50, 1);
  const highWest = CellCenter(soil, 12, 2);
  const highEast = CellCenter(soil, 46, 2);
  const cistern = CellCenter(soil, 16, 9);
  const exitHatch = CellCenter(soil, 50, 5);

  level.shafts = [
    { x: westMouth.x, label: "西灌水口", col: 10, floodInlet: true },
    { x: midMouth.x, label: "中井", col: 32, floodInlet: false },
    { x: eastMouth.x, label: "东突口", col: 50, floodInlet: true },
  ];

  level.flood = {
    enabled: true,
    /** Seconds of prep before 日军 open the sluices. */
    prepTimer: 55,
    phase: "prep", // prep → flood → raid → escape
    raidDelay: 12,
    raidTimer: 0,
    inletRate: 0.55,
  };
  level.refugeHigh = { x: highWest.x, y: highWest.y + 10 };
  level.refugeExit = { x: eastMouth.x, y: exitHatch.y + 10 };

  level.spawnLoadout = { held: ITEM_SHOVEL, ammo: 0, grenades: 0 };
  level.entities = [
    Ent({
      id: "npc_raid",
      type: "talk",
      x: CellCenter(soil, 9, 5).x,
      y: CellCenter(soil, 9, 5).y + 16,
      layer: "tunnel",
      tunnelAnchored: true,
      speaker: "林霞",
      script: [
        {
          text: "传宝——扫荡队要灌水！西口、东口先用土封死，别让水灌满中层。",
          mood: "talk",
        },
        {
          text: "下层有积水窖，渴了就喝一口。乡亲先哄到上层台，别站在灌水道上。",
          mood: "tip",
        },
        {
          text: "水一起来，日军会顺着井口摸进来。辗转击晕，抢枪——突围时用得着。",
          mood: "tip",
        },
      ],
      goal: "talk_raid",
      radius: 56,
    }),
    Ent({
      id: "seal_west",
      type: "seal_mouth",
      x: westMouth.x,
      y: westMouth.y + 12,
      layer: "tunnel",
      tunnelAnchored: true,
      c: 10,
      r: 1,
      mouthLabel: "西口",
      hint: "封西灌水口",
      radius: 48,
    }),
    Ent({
      id: "seal_east",
      type: "seal_mouth",
      x: eastMouth.x,
      y: eastMouth.y + 12,
      layer: "tunnel",
      tunnelAnchored: true,
      c: 50,
      r: 1,
      mouthLabel: "东口",
      hint: "封东灌水口",
      radius: 48,
    }),
    Ent({
      id: "cistern",
      type: "cistern",
      x: cistern.x,
      y: cistern.y + 14,
      layer: "tunnel",
      tunnelAnchored: true,
      hint: "饮水窖",
      goal: "drink_cistern",
      radius: 50,
    }),
    Ent({
      id: "refugee_a",
      type: "refugee",
      x: CellCenter(soil, 22, 5).x,
      y: CellCenter(soil, 22, 5).y + 16,
      layer: "tunnel",
      tunnelAnchored: true,
      speaker: "大娘",
      order: "idle",
      highX: highWest.x,
      highY: highWest.y + 12,
      exitX: eastMouth.x,
      exitY: exitHatch.y + 12,
      radius: 52,
    }),
    Ent({
      id: "refugee_b",
      type: "refugee",
      x: CellCenter(soil, 30, 5).x,
      y: CellCenter(soil, 30, 5).y + 16,
      layer: "tunnel",
      tunnelAnchored: true,
      speaker: "小伙计",
      order: "idle",
      highX: highEast.x,
      highY: highEast.y + 12,
      exitX: eastMouth.x,
      exitY: exitHatch.y + 12,
      radius: 52,
    }),
    Ent({
      id: "refugee_c",
      type: "refugee",
      x: CellCenter(soil, 38, 5).x,
      y: CellCenter(soil, 38, 5).y + 16,
      layer: "tunnel",
      tunnelAnchored: true,
      speaker: "乡亲",
      order: "idle",
      highX: highEast.x - 40,
      highY: highEast.y + 12,
      exitX: eastMouth.x,
      exitY: exitHatch.y + 12,
      radius: 52,
    }),
    Ent({
      id: "escape_hatch",
      type: "hatch",
      x: eastMouth.x,
      y: SURFACE_Y,
      layer: "both",
      tunnelX: eastMouth.x,
      tunnelY: exitHatch.y + 16,
      hint: "东突口——带乡亲突围",
      goal: "escape_breakout",
      radius: 56,
      needsShovel: false,
      requiresGoal: "silence_raiders",
    }),
    // Tunnel raiders — hidden until flood raid phase.
    PlaceEnemy("raid_jp1", westMouth.x, {
      y: CellCenter(soil, 10, 5).y + 16,
      layer: "tunnel",
      tunnelRaid: true,
      hidden: true,
      amp: 0,
      hp: 2,
      label: "日军",
      facing: 1,
      dropRifle: true,
      dropAmmo: 3,
    }),
    PlaceEnemy("raid_jp2", midMouth.x, {
      y: CellCenter(soil, 32, 5).y + 16,
      layer: "tunnel",
      tunnelRaid: true,
      hidden: true,
      amp: 0,
      hp: 2,
      label: "日军",
      facing: -1,
      dropAmmo: 2,
      dropGrenade: true,
    }),
    PlaceEnemy("raid_pup", CellCenter(soil, 40, 5).x, {
      y: CellCenter(soil, 40, 5).y + 16,
      layer: "tunnel",
      tunnelRaid: true,
      hidden: true,
      amp: 0,
      hp: 2,
      label: "伪军",
      facing: -1,
      dropAmmo: 2,
    }),
  ];
  level.props = [
    { kind: "house", x: westMouth.x - 40, variant: 0 },
    { kind: "well", x: midMouth.x },
    { kind: "house", x: eastMouth.x + 20, variant: 1 },
    { kind: "tree", x: 900 },
    { kind: "shed", x: 2100 },
  ];
  return level;
}

/** Act10 — breakout with weapons looted in the flood raid. */
function BuildAct10Breakout() {
  const level = BaseLevel(2400, { night: true, startTunnel: false });
  const cols = 40;
  const soil = BuildDigBand({
    originX: 80,
    originY: DIG_ORIGIN_Y,
    cols,
    rows: DIG_ROWS,
    hardBlobs: [],
    cellars: [{ c: 4, r: 2, w: 4, h: 2 }],
  });
  AttachSoil(level, soil);
  const hatch = CellCenter(soil, 5, 2);
  level.spawn = { x: hatch.x, y: SURFACE_Y, tunnel: false };
  level.spawnLoadout = { held: ITEM_NONE, ammo: 0, grenades: 0 };
  level.shafts = [{ x: hatch.x, label: "突围井" }];
  level.entities = [
    Ent({
      id: "npc_escape",
      type: "talk",
      x: hatch.x + 80,
      y: SURFACE_Y,
      layer: "surface",
      speaker: "林霞",
      script: [
        {
          text: "枪在你手里。乡亲跟着你——别恋战，往东车马道突。",
          mood: "talk",
        },
        {
          text: "路上还有堵口的伪军。能绕就绕，挡路就敲晕抢过去。",
          mood: "tip",
        },
      ],
      goal: "talk_escape",
      radius: 56,
    }),
    Ent({
      id: "escort_a",
      type: "shelter",
      x: hatch.x + 140,
      y: SURFACE_Y,
      layer: "surface",
      speaker: "大娘",
      hint: "点我跟上突围",
      line: "传宝叔，我们跟你走！",
      enterLine: "上车了——总算活着出来了！",
      goal: "escort_gate",
      radius: 56,
      /** Breakout: mouth is the east cart, not a hatch. */
      escapeToCart: true,
    }),
    Ent({
      id: "escort_b",
      type: "shelter",
      x: hatch.x + 200,
      y: SURFACE_Y,
      layer: "surface",
      speaker: "小伙计",
      hint: "点我跟上突围",
      line: "我跟着！",
      enterLine: "上了！",
      goal: "escort_gate",
      radius: 56,
      escapeToCart: true,
    }),
    Ent({
      id: "cart_gate",
      type: "cart_gate",
      x: 2100,
      y: SURFACE_Y,
      layer: "surface",
      hint: "车马道——带乡亲到这儿突围",
      goal: "reach_cart",
      radius: 70,
    }),
    PlaceEnemy("block_pup1", 1200, {
      amp: 40,
      hp: 2,
      label: "伪军",
      facing: -1,
      dropAmmo: 2,
    }),
    PlaceEnemy("block_jp1", 1550, {
      amp: 30,
      hp: 2,
      label: "日军",
      facing: -1,
      dropRifle: true,
      dropAmmo: 2,
    }),
    PlaceEnemy("block_pup2", 1850, {
      amp: 50,
      hp: 2,
      label: "伪军",
      facing: -1,
    }),
  ];
  level.props = [
    { kind: "house", x: hatch.x, variant: 0 },
    { kind: "tree", x: 600 },
    { kind: "house", x: 1000, variant: 1 },
    { kind: "shed", x: 1400 },
    { kind: "tree", x: 1800 },
    { kind: "well", x: 2000 },
  ];
  return level;
}

/** Destructible sandbag pile — blast clears it; visual cover only (no walk collision). */
function PlaceSandbag(id, x, opts = {}) {
  return Ent({
    id,
    type: "sandbag",
    x,
    y: SURFACE_Y,
    layer: "surface",
    w: opts.w || 54,
    h: opts.h || 28,
    broken: false,
    hidden: false,
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
      hint: "下主巷",
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

/**
 * Act5 street hunt — surface gunfight / stealth.
 * Scarce pocket ammo, rifle+grenade pickups, ADS, rear KO, corpse alarm.
 */
function BuildAct5StreetHunt() {
  const level = BaseLevel(3400, { night: true });
  // Tiny cellar retreat — optional, not the focus.
  const cellar = { c: 3, r: 2, w: 3, h: 2 };
  const soil = BuildDigBand({
    originX: 40,
    originY: DIG_ORIGIN_Y,
    cols: 20,
    rows: DIG_ROWS,
    hardBlobs: [],
    cellars: [cellar],
  });
  AttachSoil(level, soil);
  const hatch = CellCenter(soil, cellar.c + 1, cellar.r + 1);
  level.spawn = { x: 160, y: SURFACE_Y, tunnel: false };
  // Start with rifle but almost no ammo — force scavenging / stealth.
  level.spawnLoadout = { held: ITEM_RIFLE, ammo: 2 };
  level.combatStreet = true;
  level.shafts = [{ x: hatch.x, label: "退路地窖" }];
  level.entities = [
    Ent({
      id: "npc_street",
      type: "talk",
      x: 220,
      y: SURFACE_Y,
      layer: "surface",
      speaker: "林霞",
      script: [
        {
          speaker: "林霞",
          text: "街上还有日伪军。子弹极少——能摸到背后就悄悄制住，别让他们看见尸体。",
        },
        {
          speaker: "高传宝",
          text: "有枪就开镜瞄着打。手雷在墙根。看见尸体他们会喊人。",
        },
      ],
      hint: "听交代",
      goal: "talk_street",
    }),
    PlacePickup(300, SURFACE_Y, ITEM_GRENADE, "surface"),
    PlacePickup(520, SURFACE_Y, ITEM_AMMO, "surface", { ammoAmount: 3 }),
    PlacePickup(980, SURFACE_Y, ITEM_AMMO, "surface", { ammoAmount: 2 }),
    PlacePickup(1400, SURFACE_Y, ITEM_RIFLE, "surface"),
    PlacePickup(1680, SURFACE_Y, ITEM_GRENADE, "surface"),
    PlacePickup(2100, SURFACE_Y, ITEM_AMMO, "surface", { ammoAmount: 4 }),
    PlacePickup(hatch.x - 30, SURFACE_Y, ITEM_SHOVEL, "surface"),
    Ent({
      id: "h5street",
      type: "hatch",
      x: hatch.x,
      y: SURFACE_Y,
      layer: "both",
      w: 40,
      h: 18,
      hint: "钻地窖躲一阵",
      tunnelX: hatch.x,
      tunnelY: hatch.y + 10,
    }),
    PlaceEnemy("jp1", 640, { amp: 55, phase: 0.3, hp: 2, label: "日军", dropAmmo: 2 }),
    PlaceEnemy("pup1", 860, {
      amp: 40,
      phase: 1.4,
      hp: 2,
      label: "伪军",
      facing: -1,
      dropAmmo: 2,
    }),
    PlaceEnemy("jp2", 1180, { amp: 70, phase: 2.1, hp: 2, label: "日军", dropGrenade: true }),
    PlaceEnemy("pup2", 1520, { amp: 50, phase: 0.8, hp: 2, label: "伪军", dropAmmo: 3 }),
    PlaceEnemy("jp3", 1880, { amp: 90, phase: 1.6, hp: 3, label: "日军", dropRifle: true, dropAmmo: 2 }),
    PlaceEnemy("pup3", 2280, { amp: 45, phase: 2.8, hp: 2, label: "伪军", dropAmmo: 2 }),
    PlaceEnemy("jp4", 2680, { amp: 60, phase: 0.5, hp: 3, label: "日军", dropAmmo: 4 }),
  ];
  level.props = [
    { kind: "house", x: 400, variant: 0 },
    { kind: "house", x: 900, variant: 1 },
    { kind: "well", x: 1100 },
    { kind: "house", x: 1500, variant: 0 },
    { kind: "tree", x: 1750 },
    { kind: "house", x: 2100, variant: 1 },
    { kind: "house", x: 2500, variant: 0 },
    { kind: "tree", x: 2900 },
  ];
  return level;
}

/** Act6: dig under blockhouse through soft maze around hard footings. */
function BuildAct6Heifengkou() {
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
        { speaker: "赵平原", text: "挖通后放下铁锹，拿炸药包到药室安放，再上地面发信号。" },
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
      hint: "挖通后空手拿炸药包过来安放",
      goal: "plant_charge",
      requiresGoal: "link_charge",
      tunnelAnchored: true,
      radius: 56,
    }),
    Ent({
      id: "hatch6",
      type: "hatch",
      x: s.x,
      y: SURFACE_Y,
      layer: "both",
      w: 40,
      h: 18,
      hint: "回地面发信号",
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
      hint: "发出总攻信号",
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
      label: "日军",
      faction: "ijp",
    }),
  ];
  level.props = [
    { kind: "blockhouse", x: chargePt.x + 160 },
    { kind: "house", x: s.x, variant: 0 },
  ];
  return level;
}

/**
 * Act7: dig through hard soil + crawlway to enemy camp, surface behind the
 * gunner, seize the MG nest, hold waves of 日伪军.
 */
function BuildAct7MgNest() {
  const level = BaseLevel(3400, { startTunnel: true });
  const originX = 40;
  const cols = 72;
  const start = { c: 3, r: 3, w: 4, h: 2 };
  // 1-high crawl forces crouch mid-route (hardship).
  const crawl = { c: 18, r: 4, w: 10, h: 1 };
  const camp = { c: 54, r: 3, w: 4, h: 2 }; // not pre-carved — must dig
  const soil = BuildDigBand({
    originX,
    originY: DIG_ORIGIN_Y,
    cols,
    rows: DIG_ROWS,
    hardBlobs: [
      { c: 12, r: 2, w: 3, h: 3 }, // blocks straight dig — go under via crawl
      { c: 30, r: 1, w: 2, h: 5 },
      { c: 38, r: 3, w: 4, h: 2 },
      { c: 46, r: 2, w: 3, h: 3 }, // camp footing — skirt soft earth
    ],
    cellars: [start, crawl],
  });
  AttachSoil(level, soil);
  SpawnInCellar(level, start.c + 1, start.r);
  const s = CellCenter(soil, start.c + 1, start.r + 1);
  const campPt = CellCenter(soil, camp.c + 1, camp.r + 1);
  const crawlPt = CellCenter(soil, crawl.c + 5, crawl.r);
  level.digZones = [
    { id: "camp_room", goal: null, c: camp.c, r: camp.r, w: camp.w, h: camp.h, need: 5 },
  ];
  level.digLinks = [
    { id: "link_camp", goal: "link_camp", ax: s.x, ay: s.y, bx: campPt.x, by: campPt.y },
  ];
  level.shafts = [
    { x: s.x, label: "出击端" },
    { x: crawlPt.x, label: "低洞" },
    { x: campPt.x, label: "敌营下（待挖）" },
  ];
  const nestX = campPt.x + 36;
  level.mgWaves = [
    {
      gap: 0.8,
      bark: "前哨扑上来了——打！",
      foes: [
        { x: nestX + 220, label: "伪军", hp: 2, amp: 30, phase: 0.2 },
        { x: nestX + 300, label: "日军", hp: 2, amp: 40, phase: 1.1 },
      ],
    },
    {
      gap: 1.1,
      bark: "又一阵！压住！",
      foes: [
        { x: nestX + 260, label: "伪军", hp: 2, amp: 50, phase: 0.4 },
        { x: nestX + 340, label: "日军", hp: 3, amp: 35, phase: 2.0 },
        { x: nestX + 420, label: "伪军", hp: 2, amp: 45, phase: 1.4 },
      ],
    },
    {
      gap: 1.3,
      bark: "最后一波——打光他们！",
      foes: [
        { x: nestX + 240, label: "日军", hp: 3, amp: 55, phase: 0.6 },
        { x: nestX + 320, label: "伪军", hp: 2, amp: 40, phase: 1.8 },
        { x: nestX + 400, label: "日军", hp: 3, amp: 50, phase: 0.9 },
        { x: nestX + 480, label: "伪军", hp: 2, amp: 35, phase: 2.4 },
      ],
    },
  ];
  level.mgArmed = false;
  level.mgWaveIndex = 0;
  level.mgWaveTimer = 0;
  level.entities = [
    PlacePickup(s.x + 36, s.y + 16, ITEM_SHOVEL, "tunnel"),
    PlacePickup(crawlPt.x, crawlPt.y + 8, ITEM_GRENADE, "tunnel"),
    Ent({
      id: "npc_mg",
      type: "talk",
      x: s.x + 70,
      y: s.y + 16,
      layer: "tunnel",
      speaker: "林霞",
      script: [
        {
          speaker: "林霞",
          text: "直挖会撞夯土。从低洞绕过去，挖到营盘底下再翻上去。",
        },
        {
          speaker: "林霞",
          text: "机枪手盯着正面——你从他背后出来，制住他，枪就是咱们的。",
        },
        {
          speaker: "高传宝",
          text: "抢过机枪，来多少日伪军，我扫多少。",
        },
      ],
      hint: "听林霞交代营盘",
      goal: "talk_mg",
      tunnelAnchored: true,
    }),
    // Mid-route peek — optional hardship / ammo sink, not a required goal.
    PlaceShotPort(
      "peek_mid",
      CellCenter(soil, 32, 1).x,
      CellCenter(soil, 32, 2).y + 10,
      null,
      "墙根窥口（可打可退）",
    ),
    Ent({
      id: "patrol_mid",
      type: "patrol",
      x: CellCenter(soil, 32, 1).x + 40,
      y: SURFACE_Y,
      layer: "surface",
      homeX: CellCenter(soil, 32, 1).x + 40,
      amp: 70,
      hostile: true,
      label: "日军",
      faction: "ijp",
    }),
    Ent({
      id: "hatch_camp",
      type: "hatch",
      x: nestX - 100,
      y: SURFACE_Y,
      layer: "both",
      w: 40,
      h: 18,
      radius: 52,
      hint: "敌营翻口",
      goal: "surface_camp",
      requiresGoal: "link_camp",
      // Keep tunnel mouth under the hatch X so Near() lines up underground.
      tunnelX: nestX - 100,
      tunnelY: campPt.y + 10,
      needsShovel: false,
    }),
    // Facing +1 (east) — surface west of him, walk up, rear KO, then take nest.
    PlaceEnemy("mg_gunner", nestX + 80, {
      amp: 0,
      phase: 0,
      hp: 2,
      facing: 1,
      label: "机枪手",
    }),
    Ent({
      id: "mg_nest",
      type: "mg_nest",
      x: nestX,
      y: SURFACE_Y,
      layer: "surface",
      w: 56,
      h: 36,
      radius: 70,
      facing: 1,
      hint: "机枪巢",
      goal: "man_mg",
      requiresGoal: "silence_gunner",
    }),
    // Start hatch back to village end
    Ent({
      id: "hatch_start",
      type: "hatch",
      x: s.x,
      y: SURFACE_Y,
      layer: "both",
      w: 40,
      h: 18,
      hint: "回出击端",
      tunnelX: s.x,
      tunnelY: s.y + 10,
    }),
  ];
  level.props = [
    { kind: "house", x: s.x - 40, variant: 0 },
    { kind: "blockhouse", x: nestX + 160 },
    { kind: "shed", x: nestX - 120 },
    { kind: "post", x: nestX + 80 },
  ];
  return level;
}

/**
 * Act8 grenade yard — teach pocket grenades + lob arcs over sandbags.
 * Cover foes shrug off rifle fire; blast clears bags and splash.
 */
function BuildAct8GrenadeYard() {
  const level = BaseLevel(2800, { night: true });
  const cellar = { c: 2, r: 2, w: 3, h: 2 };
  const soil = BuildDigBand({
    originX: 40,
    originY: DIG_ORIGIN_Y,
    cols: 16,
    rows: DIG_ROWS,
    hardBlobs: [],
    cellars: [cellar],
  });
  AttachSoil(level, soil);
  const hatch = CellCenter(soil, cellar.c + 1, cellar.r + 1);
  level.spawn = { x: 180, y: SURFACE_Y, tunnel: false };
  level.spawnLoadout = { held: null, ammo: 0, grenades: 0 };
  level.grenadeYard = true;
  level.shafts = [{ x: hatch.x, label: "退路地窖" }];
  level.entities = [
    Ent({
      id: "npc_nade",
      type: "talk",
      x: 240,
      y: SURFACE_Y,
      layer: "surface",
      speaker: "林霞",
      script: [
        {
          speaker: "林霞",
          text: "村西晒谷场，日伪军趴在沙袋后。步枪打不穿——得用手雷。",
        },
        {
          speaker: "林霞",
          text: "雷箱里有土制手雷。抬头高抛过沙袋，蹲下近抛贴着门口。一窝端。",
        },
        {
          speaker: "高传宝",
          text: "捡雷，朝面朝方向扔。沙袋炸开，人就完了。",
        },
      ],
      hint: "听交代",
      goal: "talk_nade",
    }),
    PlacePickup(360, SURFACE_Y, ITEM_GRENADE, "surface", {
      grenadeAmount: 3,
      goal: "stock_nades",
    }),
    PlacePickup(980, SURFACE_Y, ITEM_GRENADE, "surface", { grenadeAmount: 2 }),
    PlacePickup(1680, SURFACE_Y, ITEM_GRENADE, "surface", { grenadeAmount: 3 }),
    PlacePickup(520, SURFACE_Y, ITEM_AMMO, "surface", { ammoAmount: 2 }),
    PlacePickup(600, SURFACE_Y, ITEM_RIFLE, "surface"),
    PlacePickup(hatch.x - 28, SURFACE_Y, ITEM_SHOVEL, "surface"),
    Ent({
      id: "h8yard",
      type: "hatch",
      x: hatch.x,
      y: SURFACE_Y,
      layer: "both",
      w: 40,
      h: 18,
      hint: "钻地窖躲一阵",
      tunnelX: hatch.x,
      tunnelY: hatch.y + 10,
    }),
    // Nest A — two behind bags, short lob / high lob teach
    PlaceSandbag("bag_a1", 780),
    PlaceSandbag("bag_a2", 820),
    PlaceEnemy("yard_pup1", 800, {
      amp: 18,
      phase: 0.4,
      hp: 2,
      label: "伪军",
      facing: -1,
      cover: true,
      dropGrenade: true,
    }),
    PlaceEnemy("yard_jp1", 860, {
      amp: 22,
      phase: 1.2,
      hp: 3,
      label: "日军",
      facing: -1,
      cover: true,
    }),
    // Nest B — cluster for splash
    PlaceSandbag("bag_b1", 1280),
    PlaceSandbag("bag_b2", 1330),
    PlaceSandbag("bag_b3", 1380),
    PlaceEnemy("yard_pup2", 1310, {
      amp: 15,
      phase: 0.8,
      hp: 2,
      label: "伪军",
      facing: -1,
      cover: true,
      dropAmmo: 2,
    }),
    PlaceEnemy("yard_jp2", 1360, {
      amp: 20,
      phase: 2.0,
      hp: 3,
      label: "日军",
      facing: -1,
      cover: true,
      dropGrenade: true,
    }),
    PlaceEnemy("yard_pup3", 1420, {
      amp: 16,
      phase: 1.5,
      hp: 2,
      label: "伪军",
      facing: 1,
      cover: true,
    }),
    // Nest C — doorway short-toss
    PlaceSandbag("bag_c1", 1900),
    PlaceSandbag("bag_c2", 1960),
    PlaceEnemy("yard_jp3", 1930, {
      amp: 12,
      phase: 0.6,
      hp: 3,
      label: "日军",
      facing: -1,
      cover: true,
      dropRifle: true,
      dropAmmo: 2,
    }),
    PlaceEnemy("yard_jp4", 2020, {
      amp: 28,
      phase: 2.4,
      hp: 3,
      label: "日军",
      facing: -1,
      cover: true,
    }),
    // Open flank — melee / rifle finish so the yard is not pure spam
    PlaceEnemy("yard_pup_open", 2320, {
      amp: 55,
      phase: 0.3,
      hp: 2,
      label: "伪军",
      facing: -1,
      dropAmmo: 2,
    }),
  ];
  level.props = [
    { kind: "shed", x: 320 },
    { kind: "house", x: 700, variant: 0 },
    { kind: "tree", x: 1050 },
    { kind: "house", x: 1250, variant: 1 },
    { kind: "well", x: 1600 },
    { kind: "house", x: 1880, variant: 0 },
    { kind: "tree", x: 2200 },
    { kind: "shed", x: 2500 },
  ];
  return level;
}

const BUILDERS = {
  act1_connect: BuildAct1,
  act2_bell: BuildAct2,
  act3_combat_tunnel: BuildAct3,
  act4_ambush: BuildAct4,
  act5_street_hunt: BuildAct5StreetHunt,
  act6_heifengkou: BuildAct6Heifengkou,
  act7_mg_nest: BuildAct7MgNest,
  act8_grenade_yard: BuildAct8GrenadeYard,
  act9_flood_raid: BuildAct9FloodRaid,
  act10_breakout: BuildAct10Breakout,
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
