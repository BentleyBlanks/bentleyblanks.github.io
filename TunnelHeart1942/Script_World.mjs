/**
 * Level geometry for the whitebox.
 *
 * Coordinate contract (feet-based):
 * - Surface ground y = 0
 * - Tunnel floor y = TUNNEL_FLOOR (below)
 * - Tunnel corridor height is TUNNEL_FLOOR - TUNNEL_CEIL (≥ 140)
 * - Full-height tunnel seals are DIG-ONLY (never jump-over walls)
 * - Short rubble (h ≤ 40) may be jumped
 */

export const SURFACE_Y = 0;
export const TUNNEL_FLOOR = 240;
export const TUNNEL_CEIL = 96; // 144px headroom — jump clears short rubble, not seals
export const VIEW_W = 960;
export const VIEW_H = 540;

function Solid(id, x, y, w, h, opts = {}) {
  return { id, x, y, w, h, digOnly: !!opts.digOnly, oneWay: !!opts.oneWay };
}

function Dig(id, x, layer, opts = {}) {
  return {
    id,
    x,
    layer, // "surface" | "tunnel"
    y: layer === "tunnel" ? TUNNEL_FLOOR : SURFACE_Y,
    done: false,
    clears: opts.clears || null,
    goal: opts.goal || null,
    hint: opts.hint || "按住 J 挖掘",
    line: opts.line || "通了。",
  };
}

function Ent(partial) {
  return {
    w: 28,
    h: 48,
    done: false,
    hidden: false,
    ...partial,
  };
}

function ParallaxProfile(night = false) {
  return {
    night,
    skyTop: night ? "#141a24" : "#9eb6bc",
    skyBot: night ? "#2a2430" : "#e2c9a0",
    haze: night ? "#1c2430" : "#7f9a7a",
    field: night ? "#2a3228" : "#6f8a52",
    earth: night ? "#3a2e24" : "#8b6a45",
    soilDeep: "#4a3426",
    soilMid: "#6a4a32",
    soilLight: "#8a6340",
    fog: night ? "rgba(10,12,18,.55)" : "rgba(255,255,255,.08)",
  };
}

function BaseLevel(width, opts = {}) {
  const night = !!opts.night;
  return {
    width,
    viewW: VIEW_W,
    viewH: VIEW_H,
    surfaceY: SURFACE_Y,
    tunnelFloor: TUNNEL_FLOOR,
    tunnelCeil: TUNNEL_CEIL,
    palette: ParallaxProfile(night),
    surfaceSolids: [Solid("sg", -40, SURFACE_Y, width + 80, 220)],
    tunnelSolids: [
      Solid("tg", -40, TUNNEL_FLOOR, width + 80, 220),
      Solid("tc", -40, TUNNEL_CEIL - 40, width + 80, 40),
    ],
    digSpots: [],
    entities: [],
    props: [], // midground props at play depth (houses, tree, bell, blockhouse)
    spawn: { x: 140, y: SURFACE_Y, tunnel: !!opts.startTunnel },
    shafts: [], // visual shafts between surface and tunnel
  };
}

function AddSeal(level, id, x, width = 56) {
  // Full corridor seal — dig only
  level.tunnelSolids.push(
    Solid(id, x - width / 2, TUNNEL_CEIL, width, TUNNEL_FLOOR - TUNNEL_CEIL, { digOnly: true }),
  );
}

function BuildAct1() {
  const level = BaseLevel(2400);
  AddSeal(level, "seal_west", 620);
  AddSeal(level, "seal_east", 1180);

  level.digSpots = [
    Dig("dig_west", 620, "tunnel", {
      clears: "seal_west",
      goal: "dig_west",
      hint: "按住 J · 挖开西口土塞",
      line: "西头两家通气了。",
    }),
    Dig("dig_east", 1180, "tunnel", {
      clears: "seal_east",
      goal: "dig_east",
      hint: "按住 J · 挖开东口土塞",
      line: "三家连上了。",
    }),
  ];

  level.shafts = [{ x: 420, label: "地窖口" }];

  level.entities = [
    Ent({
      id: "npc_laozhong",
      type: "talk",
      x: 260,
      y: SURFACE_Y,
      layer: "surface",
      speaker: "高老忠",
      line: "先下洞。土塞挖开，人才能从这家钻到那家。",
      hint: "与高老忠交谈",
      goal: "talk_laozhong",
    }),
    Ent({
      id: "hatch1",
      type: "hatch",
      x: 420,
      y: SURFACE_Y,
      layer: "both",
      w: 40,
      h: 18,
      hint: "按 E 进入地道",
      goal: "enter_hatch",
    }),
  ];

  level.props = [
    { kind: "house", x: 220, variant: 0 },
    { kind: "house", x: 700, variant: 1 },
    { kind: "house", x: 1250, variant: 0 },
    { kind: "tree", x: 1600 },
    { kind: "well", x: 980 },
  ];
  return level;
}

function BuildAct2() {
  const level = BaseLevel(2600, { night: true });
  level.shafts = [{ x: 520, label: "地道口" }, { x: 900, label: "粮窖口" }];
  level.entities = [
    Ent({
      id: "v1",
      type: "shelter",
      x: 300,
      y: SURFACE_Y,
      layer: "surface",
      hint: "护送入洞",
      line: "孩子先进！",
      goal: "shelter_a",
      hatchX: 520,
    }),
    Ent({
      id: "v2",
      type: "shelter",
      x: 640,
      y: SURFACE_Y,
      layer: "surface",
      hint: "护送入洞",
      line: "粮窖这边！",
      goal: "shelter_b",
      hatchX: 520,
    }),
    Ent({
      id: "v3",
      type: "shelter",
      x: 880,
      y: SURFACE_Y,
      layer: "surface",
      hint: "护送入洞",
      line: "谢传宝叔！",
      goal: "shelter_c",
      hatchX: 900,
    }),
    Ent({
      id: "hatch2a",
      type: "hatch",
      x: 520,
      y: SURFACE_Y,
      layer: "both",
      w: 40,
      h: 18,
      hint: "按 E 下地道 / 上地面",
    }),
    Ent({
      id: "hatch2b",
      type: "hatch",
      x: 900,
      y: SURFACE_Y,
      layer: "both",
      w: 40,
      h: 18,
      hint: "按 E 下地道 / 上地面",
    }),
    Ent({
      id: "bell",
      type: "bell",
      x: 2100,
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
      x: 1500,
      y: SURFACE_Y,
      layer: "surface",
      homeX: 1500,
      amp: 140,
      hostile: true,
    }),
  ];
  level.props = [
    { kind: "house", x: 280, variant: 0 },
    { kind: "house", x: 760, variant: 1 },
    { kind: "tree", x: 2060 },
    { kind: "bell", x: 2100 },
  ];
  // short jumpable sandbags on the way to the bell
  level.surfaceSolids.push(Solid("bags", 1750, SURFACE_Y - 36, 70, 36));
  return level;
}

function BuildAct3() {
  const level = BaseLevel(2200, { startTunnel: true });
  level.spawn = { x: 160, y: TUNNEL_FLOOR, tunnel: true };
  level.shafts = [{ x: 360, label: "灶台口" }];
  AddSeal(level, "seal_mid", 800, 48);

  level.digSpots = [
    Dig("dig_mid", 800, "tunnel", {
      clears: "seal_mid",
      hint: "挖开岔道土塞",
      line: "岔道通了。",
    }),
  ];

  level.entities = [
    Ent({
      id: "flip_build",
      type: "flip_build",
      x: 520,
      y: TUNNEL_FLOOR,
      layer: "tunnel",
      w: 44,
      h: 28,
      hint: "按 E 改建翻口",
      goal: "build_flip",
    }),
    Ent({
      id: "hatch3",
      type: "hatch",
      x: 360,
      y: SURFACE_Y,
      layer: "both",
      w: 40,
      h: 18,
      hint: "按 E 上地面 / 下地道",
    }),
    Ent({
      id: "spy_talk",
      type: "spy_talk",
      x: 300,
      y: SURFACE_Y,
      layer: "surface",
      hint: "按 E 盘问来客",
      goal: "expose_spy",
    }),
    Ent({
      id: "spy",
      type: "spy",
      x: 640,
      y: SURFACE_Y,
      layer: "surface",
      exposed: false,
      trapped: false,
    }),
    Ent({
      id: "flip_trap",
      type: "flip_trap",
      x: 1100,
      y: TUNNEL_FLOOR,
      layer: "tunnel",
      w: 52,
      h: 22,
      armed: false,
      hint: "特务到位后按 E 触发翻口",
      goal: "trap_spy",
    }),
  ];
  level.props = [
    { kind: "house", x: 260, variant: 0 },
    { kind: "house", x: 900, variant: 1 },
  ];
  return level;
}

function BuildAct4() {
  const level = BaseLevel(2600);
  level.shafts = [
    { x: 480, label: "井口" },
    { x: 980, label: "墙根" },
    { x: 1500, label: "灶台" },
  ];
  level.entities = [
    Ent({ id: "h4a", type: "hatch", x: 480, y: SURFACE_Y, layer: "both", w: 40, h: 18, hint: "地道口" }),
    Ent({ id: "h4b", type: "hatch", x: 980, y: SURFACE_Y, layer: "both", w: 40, h: 18, hint: "地道口" }),
    Ent({ id: "h4c", type: "hatch", x: 1500, y: SURFACE_Y, layer: "both", w: 40, h: 18, hint: "地道口" }),
    Ent({
      id: "port1",
      type: "shot_port",
      x: 560,
      y: SURFACE_Y,
      layer: "surface",
      hint: "按 E 出击开火",
      goal: "shot_a",
      exitTo: 1000,
    }),
    Ent({
      id: "port2",
      type: "shot_port",
      x: 1060,
      y: SURFACE_Y,
      layer: "surface",
      hint: "按 E 出击开火",
      goal: "shot_b",
      exitTo: 1540,
    }),
    Ent({
      id: "port3",
      type: "shot_port",
      x: 1580,
      y: SURFACE_Y,
      layer: "surface",
      hint: "按 E 出击开火",
      goal: "shot_c",
      exitTo: 1900,
    }),
    Ent({
      id: "patrol2",
      type: "patrol",
      x: 1200,
      y: SURFACE_Y,
      layer: "surface",
      homeX: 1200,
      amp: 180,
      hostile: true,
      hits: 0,
    }),
  ];
  level.props = [
    { kind: "house", x: 400, variant: 0 },
    { kind: "house", x: 900, variant: 1 },
    { kind: "house", x: 1400, variant: 0 },
    { kind: "well", x: 480 },
  ];
  return level;
}

function BuildAct5() {
  const level = BaseLevel(2800, { startTunnel: true });
  level.spawn = { x: 160, y: TUNNEL_FLOOR, tunnel: true };
  AddSeal(level, "seal_under", 1400, 64);
  level.shafts = [{ x: 1900, label: "野外口" }];
  level.digSpots = [
    Dig("dig_under", 1400, "tunnel", {
      clears: "seal_under",
      goal: "dig_under",
      hint: "按住 J · 挖到炮楼根",
      line: "挖到炮楼根了。",
    }),
  ];
  level.entities = [
    Ent({
      id: "charge",
      type: "charge",
      x: 1600,
      y: TUNNEL_FLOOR,
      layer: "tunnel",
      w: 40,
      h: 28,
      hint: "按 E 安放炸药",
      goal: "plant_charge",
      needsGoal: "dig_under",
    }),
    Ent({
      id: "hatch5",
      type: "hatch",
      x: 1900,
      y: SURFACE_Y,
      layer: "both",
      w: 40,
      h: 18,
      hint: "按 E 爬上地表",
    }),
    Ent({
      id: "signal",
      type: "signal",
      x: 2200,
      y: SURFACE_Y,
      layer: "surface",
      w: 40,
      h: 50,
      hint: "按 E 发出总攻信号",
      goal: "signal_assault",
      needsGoal: "plant_charge",
    }),
    Ent({
      id: "patrol3",
      type: "patrol",
      x: 2050,
      y: SURFACE_Y,
      layer: "surface",
      homeX: 2050,
      amp: 70,
      hostile: true,
    }),
  ];
  level.props = [
    { kind: "blockhouse", x: 2450 },
    { kind: "house", x: 400, variant: 0 },
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
