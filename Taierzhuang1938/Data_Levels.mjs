// 《血战台儿庄》关卡布局 —— 纯数据，**不许 import three**。
//
// 坐标系：X 向东，Z 向南（+Z 是城里），Y 向上。玩家从北往南退，最后从南边出城。
// 这与史实一致：日军三月二十三日到达台儿庄以北，二十七日晨从北面突入，
// 城区自北向南被一点点吃掉；运河在城南。
//
// 街巷宽度照考据：主街 4—6 m，次巷 2—3 m，夹道 1.2—1.8 m。
// 巷宽小于 2.5 m 的地方，八九式中战车进不来 —— 这条是玩法规则，不是装饰。

/** 一个"街区"：一片被街巷围起来的地，里面按行列切成若干四合院。 */
function Block(x, z, w, d, options = {}) {
  return { x, z, w, d, rows: 1, cols: 1, damage: 0.2, seed: `b${x}_${z}`, ...options };
}

export const LEVELS_MAP = {
  // =========================================================================
  // 序 · 上墙：北寨墙。墙北是护城河与开阔地，墙南是城里。
  L0_Wall: {
    sky: "smokyDay",
    bounds: { minX: -62, maxX: 62, minZ: -46, maxZ: 46 },
    ground: { size: 190, material: "Ground" },
    rampart: {
      x: 0, z: -28, length: 118, ry: 0, height: 4.0, thickness: 2.2,
      ramp: { at: 2 }, seed: "north",
    },
    moat: { z: -39, width: 10, depth: 2.0 },     // 护城河：离墙 9 m、宽 10 m、深 2 m
    blocks: [
      Block(-34, 6, 26, 24, { rows: 1, cols: 2, damage: 0.18, seed: "L0a" }),
      Block(0, 8, 24, 22, { rows: 1, cols: 2, damage: 0.12, seed: "L0b" }),
      Block(34, 6, 26, 24, { rows: 1, cols: 2, damage: 0.3, seed: "L0c" }),
      Block(-30, 34, 24, 20, { rows: 1, cols: 2, damage: 0.1, seed: "L0d" }),
      Block(14, 36, 30, 20, { rows: 1, cols: 2, damage: 0.22, seed: "L0e" }),
    ],
    barricades: [
      { x: -8, z: -22, ry: 0, length: 6 },
      { x: 12, z: -22, ry: 0, length: 5 },
    ],
    trees: [{ x: -18, z: 12, scale: 1.2 }, { x: 22, z: 20, scale: 1.0 }, { x: 6, z: 30, scale: 0.9 }],
    poles: [{ x: -4, z: -14 }, { x: -4, z: 16 }],
    craters: [
      { x: -12, z: -34, radius: 3.2, depth: 0.7 }, { x: 8, z: -36, radius: 2.6, depth: 0.55 },
      { x: 26, z: -32, radius: 3.8, depth: 0.8 }, { x: -30, z: -33, radius: 2.4, depth: 0.5 },
    ],
    fires: [{ x: 40, z: 4, intensity: 20, radius: 22 }],
    player: { x: 2, z: 8, ry: Math.PI },          // 面朝北（-Z）
    allies: [{ who: "liu", x: 3.4, z: 6.0 }, { who: "meng", x: -1.2, z: 4.4 }],
    zones: [
      { name: "Rampart", x: 2, z: -25, r: 7 },
    ],
    waves: [
      { id: 1, at: "zone:Rampart", delay: 6, count: 8, from: [{ x: -20, z: -72 }, { x: 6, z: -76 }],
        weapons: ["Type38"], advanceTo: { x: 0, z: -36 } },
      { id: 2, at: "waveClear:1", delay: 7, count: 12, from: [{ x: -34, z: -78 }, { x: 14, z: -80 }, { x: 30, z: -74 }],
        weapons: ["Type38", "Type38", "Type11"], advanceTo: { x: 0, z: -34 },
        support: [{ kind: "Type89Launcher", x: -26, z: -66 }] },
    ],
    events: [{ id: "FirstShell", at: "zone:Rampart", delay: 2.5, kind: "shellBarrage", count: 9, area: { x: 0, z: -27, r: 26 } }],
    exit: null,
  },

  // =========================================================================
  // 一 · 破口：寨墙被打开一个口子，退进街巷。
  L1_Breach: {
    sky: "dawn",
    bounds: { minX: -52, maxX: 52, minZ: -40, maxZ: 58 },
    ground: { size: 190, material: "GroundRubble" },
    rampart: {
      x: 0, z: -26, length: 104, ry: 0, height: 4.0, thickness: 2.2,
      breach: { at: 4, width: 16 }, ramp: { at: -30 }, seed: "breach",
    },
    blocks: [
      Block(-30, 2, 24, 20, { rows: 1, cols: 2, damage: 0.45, seed: "L1a" }),
      Block(2, 4, 22, 20, { rows: 1, cols: 2, damage: 0.55, seed: "L1b" }),
      Block(32, 2, 22, 20, { rows: 1, cols: 2, damage: 0.4, seed: "L1c" }),
      Block(-28, 30, 24, 22, { rows: 1, cols: 2, damage: 0.3, seed: "L1d" }),
      Block(6, 32, 26, 22, { rows: 1, cols: 2, damage: 0.35, seed: "L1e" }),
      Block(36, 30, 20, 22, { rows: 1, cols: 1, damage: 0.6, seed: "L1f" }),
    ],
    barricades: [
      { x: -2, z: 18, ry: 0, length: 7 },
      { x: 20, z: 20, ry: Math.PI / 2, length: 5 },
    ],
    breachWalls: [
      { x: -13.5, z: 6, ry: Math.PI / 2, tag: "toWest" },
      { x: 15.0, z: 22, ry: Math.PI / 2, tag: "toEast" },
    ],
    trees: [{ x: -16, z: 26, scale: 1.0 }],
    poles: [{ x: -1, z: -6 }, { x: -1, z: 24 }],
    craters: [
      { x: 4, z: -24, radius: 5.0, depth: 0.9 }, { x: -10, z: -12, radius: 3.0, depth: 0.6 },
      { x: 18, z: 6, radius: 2.8, depth: 0.55 }, { x: -22, z: 14, radius: 3.4, depth: 0.7 },
    ],
    fires: [{ x: -24, z: 4, intensity: 24, radius: 24 }, { x: 30, z: 16, intensity: 16, radius: 18 }],
    player: { x: 2, z: 2, ry: Math.PI },
    allies: [{ who: "liu", x: 3.6, z: 3.4 }, { who: "meng", x: 0.2, z: 0.6 }],
    zones: [
      { name: "Alley", x: 0, z: 20, r: 8 },
    ],
    waves: [
      { id: 1, at: "start", delay: 4, count: 10, from: [{ x: 4, z: -30 }, { x: -6, z: -30 }],
        weapons: ["Type38", "Type38", "Type11"], advanceTo: { x: 2, z: -4 } },
      { id: 2, at: "event:MengDown", delay: 3, count: 10, from: [{ x: 6, z: -28 }, { x: -16, z: -26 }],
        weapons: ["Type38"], advanceTo: { x: 0, z: 10 } },
      { id: 3, at: "event:FirstBreach", delay: 4, count: 14,
        from: [{ x: -18, z: -22 }, { x: 10, z: -24 }, { x: 26, z: -20 }],
        weapons: ["Type38", "Type38", "Type11", "Type38"], advanceTo: { x: 0, z: 18 } },
    ],
    events: [
      { id: "MengDown", at: "waveProgress:1:0.5", kind: "allyDown", who: "meng" },
      { id: "FirstBreach", at: "playerBreach:1", kind: "flag" },
    ],
    exit: { x: 0, z: 52, r: 5 },
  },

  // =========================================================================
  // 二 · 室战墙战：清真寺一带。逐屋争夺，战车进巷。
  L2_RoomWar: {
    sky: "burningStreet",
    bounds: { minX: -50, maxX: 50, minZ: -34, maxZ: 62 },
    ground: { size: 190, material: "GroundRubble" },
    blocks: [
      Block(-30, -18, 22, 18, { rows: 1, cols: 2, damage: 0.6, seed: "L2a" }),
      Block(4, -20, 24, 18, { rows: 1, cols: 2, damage: 0.7, seed: "L2b" }),
      Block(34, -18, 20, 18, { rows: 1, cols: 1, damage: 0.5, seed: "L2c" }),
      Block(-32, 8, 20, 22, { rows: 1, cols: 2, damage: 0.35, seed: "L2d" }),
      Block(2, 6, 22, 20, { rows: 1, cols: 2, damage: 0.45, seed: "L2e" }),
      Block(34, 8, 20, 22, { rows: 1, cols: 1, damage: 0.55, seed: "L2f" }),
    ],
    mosque: { x: 0, z: 40, ry: 0, damage: 0.45 },
    barricades: [
      { x: -14, z: -4, ry: Math.PI / 2, length: 5 },
      { x: 16, z: 22, ry: 0, length: 6 },
      { x: 0, z: 25, ry: 0, length: 8 },
    ],
    breachWalls: [
      { x: -19.5, z: -14, ry: Math.PI / 2, tag: "west1" },
      { x: 14.0, z: -12, ry: Math.PI / 2, tag: "east1" },
      { x: -20.0, z: 12, ry: Math.PI / 2, tag: "west2" },
    ],
    trees: [{ x: -22, z: 30, scale: 1.1 }],
    poles: [{ x: -1, z: -8 }, { x: -1, z: 18 }],
    craters: [
      { x: -6, z: -14, radius: 3.6, depth: 0.75 }, { x: 12, z: 2, radius: 3.0, depth: 0.6 },
      { x: -18, z: 20, radius: 2.6, depth: 0.5 }, { x: 8, z: 30, radius: 4.2, depth: 0.85 },
    ],
    fires: [
      { x: -28, z: -16, intensity: 26, radius: 26 }, { x: 32, z: 4, intensity: 20, radius: 22 },
      { x: 20, z: 44, intensity: 14, radius: 18 },
    ],
    player: { x: 0, z: -26, ry: 0 },
    allies: [{ who: "liu", x: -1.8, z: -27.4 }],
    zones: [
      { name: "Courtyard", x: -4, z: 0, r: 8 },
      { name: "Mosque", x: 0, z: 34, r: 10 },
    ],
    waves: [
      { id: 1, at: "start", delay: 3, count: 8, from: [{ x: -14, z: -32 }, { x: 12, z: -32 }],
        weapons: ["Type38", "Type38", "Type11"], advanceTo: { x: 0, z: -18 } },
      { id: 2, at: "zone:Courtyard", delay: 3, count: 10, from: [{ x: -22, z: -28 }, { x: 18, z: -26 }],
        weapons: ["Type38"], advanceTo: { x: -4, z: 2 } },
      { id: 3, at: "event:TankIn", delay: 1, count: 8, from: [{ x: 2, z: -30 }],
        weapons: ["Type38"], advanceTo: { x: 0, z: 6 },
        vehicles: [{ kind: "Type89Tank", x: 0, z: -30, path: [{ x: 0, z: -6 }, { x: 0, z: 14 }] }] },
      { id: 4, at: "event:TankDead", delay: 6, count: 10, from: [{ x: -26, z: -20 }, { x: 22, z: -18 }],
        weapons: ["Type38", "Type11"], advanceTo: { x: 0, z: 22 } },
      { id: 5, at: "zone:Mosque", delay: 5, count: 16,
        from: [{ x: -30, z: 22 }, { x: 30, z: 24 }, { x: 0, z: 16 }],
        weapons: ["Type38", "Type38", "Type11", "Type38"], advanceTo: { x: 0, z: 34 },
        support: [{ kind: "Type92Hmg", x: 26, z: 26 }, { kind: "Type89Launcher", x: -28, z: 18 }] },
    ],
    events: [
      { id: "TankIn", at: "waveClear:2", delay: 4, kind: "flag" },
      { id: "TankDead", at: "vehicleDead", kind: "flag" },
    ],
    exit: null,
  },

  // =========================================================================
  // 三 · 白毛巾：城西北角，夜。潜行摸哨，然后强攻。
  L3_WhiteTowel: {
    sky: "night",
    bounds: { minX: -46, maxX: 46, minZ: -46, maxZ: 40 },
    ground: { size: 190, material: "GroundRubble" },
    rampart: {
      x: -34, z: -6, length: 66, ry: Math.PI / 2, height: 4.0, thickness: 2.2, seed: "west",
    },
    blocks: [
      Block(-14, -30, 20, 18, { rows: 1, cols: 2, damage: 0.72, seed: "L3a" }),
      Block(16, -28, 22, 18, { rows: 1, cols: 2, damage: 0.65, seed: "L3b" }),
      Block(-12, 0, 22, 20, { rows: 1, cols: 2, damage: 0.55, seed: "L3c" }),
      Block(20, 2, 20, 20, { rows: 1, cols: 1, damage: 0.6, seed: "L3d" }),
      Block(-8, 28, 24, 18, { rows: 1, cols: 2, damage: 0.4, seed: "L3e" }),
    ],
    barricades: [
      { x: -22, z: -18, ry: 0, length: 5 },
      { x: 4, z: -14, ry: Math.PI / 2, length: 4 },
    ],
    trees: [{ x: -26, z: 8, scale: 1.0 }],
    craters: [
      { x: -18, z: -22, radius: 3.0, depth: 0.6 }, { x: 8, z: -34, radius: 3.6, depth: 0.7 },
    ],
    fires: [{ x: 24, z: -32, intensity: 12, radius: 16 }],
    player: { x: 0, z: 30, ry: Math.PI },
    allies: [
      { who: "fantang", x: -1.6, z: 28.6 }, { who: "liu", x: 1.8, z: 28.8 },
      { who: "qin", x: -3.2, z: 29.6 },
      { who: "dare", x: 3.4, z: 30.2 }, { who: "dare", x: -5.0, z: 27.8 },
      { who: "dare", x: 5.2, z: 28.0 },
    ],
    zones: [
      { name: "Approach", x: 0, z: 6, r: 10 },
      { name: "Posts", x: -10, z: -18, r: 12 },
    ],
    sentries: [
      { x: -14, z: 2, ry: Math.PI }, { x: 6, z: -4, ry: Math.PI * 0.8 },
      { x: -20, z: -10, ry: Math.PI * 1.2 }, { x: 10, z: -16, ry: Math.PI },
    ],
    waves: [
      { id: 8, at: "event:Alarm", delay: 1, count: 12, from: [{ x: -26, z: -34 }, { x: 14, z: -36 }],
        weapons: ["Type38", "Type38", "Type11"], advanceTo: { x: -6, z: -14 } },
      { id: 9, at: "waveClear:8", delay: 5, count: 14, from: [{ x: -30, z: -40 }, { x: 20, z: -38 }, { x: 0, z: -42 }],
        weapons: ["Type38", "Type38", "Type11", "Type38"], advanceTo: { x: -8, z: -24 },
        support: [{ kind: "Type92Hmg", x: 18, z: -38 }] },
    ],
    events: [
      { id: "TowelOn", at: "start", delay: 9, kind: "flag" },
      { id: "PoemRead", at: "event:TowelOn", delay: 4, kind: "flag" },
      { id: "Sneak", at: "zone:Approach", kind: "flag" },
      { id: "Alarm", at: "sentriesAlerted", kind: "flag" },
      { id: "LiuDown", at: "waveProgress:8:0.7", kind: "allyDown", who: "liu" },
    ],
    exit: null,
  },

  // =========================================================================
  // 四 · 最后五分钟：一个十字路口，守到反攻信号。
  L4_LastFiveMinutes: {
    sky: "night",
    bounds: { minX: -48, maxX: 48, minZ: -50, maxZ: 44 },
    ground: { size: 190, material: "GroundRubble" },
    blocks: [
      Block(-28, -26, 22, 20, { rows: 1, cols: 2, damage: 0.8, seed: "L4a" }),
      Block(24, -28, 22, 20, { rows: 1, cols: 2, damage: 0.75, seed: "L4b" }),
      Block(-30, 16, 20, 20, { rows: 1, cols: 2, damage: 0.6, seed: "L4c" }),
      Block(26, 18, 20, 20, { rows: 1, cols: 1, damage: 0.7, seed: "L4d" }),
      Block(0, 34, 26, 16, { rows: 1, cols: 2, damage: 0.5, seed: "L4e" }),
    ],
    barricades: [
      { x: 0, z: -10, ry: 0, length: 9, height: 1.3 },
      { x: -12, z: -6, ry: Math.PI / 2, length: 6 },
      { x: 12, z: -6, ry: Math.PI / 2, length: 6 },
      { x: 0, z: 10, ry: 0, length: 7 },
    ],
    poles: [{ x: -3, z: -18 }, { x: -3, z: 6 }],
    craters: [
      { x: -6, z: -20, radius: 4.2, depth: 0.85 }, { x: 10, z: -16, radius: 3.4, depth: 0.7 },
      { x: -14, z: 2, radius: 3.0, depth: 0.6 }, { x: 16, z: 8, radius: 3.8, depth: 0.75 },
    ],
    fires: [
      { x: -26, z: -22, intensity: 22, radius: 24 }, { x: 28, z: -24, intensity: 18, radius: 20 },
      { x: 0, z: -34, intensity: 14, radius: 18 },
    ],
    player: { x: 0, z: -4, ry: Math.PI },
    allies: [
      { who: "wang", x: -2.4, z: 2.0 }, { who: "qin", x: 2.6, z: -2.0 },
      { who: "nra", x: -5.0, z: -3.0 }, { who: "nra", x: 5.4, z: -3.4 },
      { who: "nra", x: -8.0, z: 0.0 }, { who: "nra", x: 8.2, z: 0.4 },
    ],
    zones: [],
    waves: [
      { id: 1, at: "start", delay: 12, count: 10, from: [{ x: -12, z: -44 }, { x: 8, z: -46 }],
        weapons: ["Type38", "Type11"], advanceTo: { x: 0, z: -14 } },
      { id: 2, at: "waveClear:1", delay: 6, count: 12, from: [{ x: -24, z: -42 }, { x: 18, z: -44 }],
        weapons: ["Type38", "Type38", "Type11"], advanceTo: { x: 0, z: -12 } },
      { id: 3, at: "waveClear:2", delay: 6, count: 12, from: [{ x: -30, z: -40 }, { x: 24, z: -40 }, { x: 0, z: -48 }],
        weapons: ["Type38", "Type11", "Type38"], advanceTo: { x: 0, z: -10 },
        support: [{ kind: "Type89Launcher", x: -30, z: -46 }] },
      { id: 4, at: "waveClear:3", delay: 7, count: 16, from: [{ x: -26, z: -46 }, { x: 20, z: -46 }, { x: -4, z: -50 }],
        weapons: ["Type38", "Type38", "Type11", "Type38"], advanceTo: { x: 0, z: -8 },
        vehicles: [{ kind: "Type94Tankette", x: 6, z: -46, path: [{ x: 4, z: -20 }, { x: 2, z: -10 }] }],
        support: [{ kind: "Type92Hmg", x: -28, z: -44 }] },
      { id: 8, at: "event:Signal", delay: 3, count: 14, from: [{ x: -16, z: -40 }, { x: 14, z: -42 }],
        weapons: ["Type38", "Type11"], advanceTo: { x: 0, z: -20 }, retreating: true },
    ],
    events: [
      { id: "QinDown", at: "waveProgress:4:0.6", kind: "allyDown", who: "qin" },
      { id: "Signal", at: "waveClear:4", delay: 6, kind: "counterattack" },
    ],
    exit: { x: 0, z: -44, r: 6, after: "waveClear:8" },
  },

  // =========================================================================
  // 尾声 · 清晨：走出去。没有敌人。
  L5_Morning: {
    sky: "dawn",
    bounds: { minX: -40, maxX: 40, minZ: -30, maxZ: 66 },
    ground: { size: 190, material: "GroundRubble" },
    blocks: [
      Block(-26, -12, 20, 18, { rows: 1, cols: 2, damage: 0.85, seed: "L5a" }),
      Block(22, -14, 20, 18, { rows: 1, cols: 2, damage: 0.8, seed: "L5b" }),
      Block(-24, 16, 20, 20, { rows: 1, cols: 2, damage: 0.7, seed: "L5c" }),
      Block(24, 18, 20, 20, { rows: 1, cols: 1, damage: 0.75, seed: "L5d" }),
      Block(-22, 44, 18, 18, { rows: 1, cols: 1, damage: 0.6, seed: "L5e" }),
      Block(22, 46, 18, 18, { rows: 1, cols: 1, damage: 0.65, seed: "L5f" }),
    ],
    barricades: [{ x: 0, z: 4, ry: 0, length: 8 }, { x: 0, z: 30, ry: 0, length: 6 }],
    trees: [{ x: -14, z: 26, scale: 1.1 }],
    poles: [{ x: -3, z: -6 }, { x: -3, z: 22 }, { x: -3, z: 46 }],
    craters: [
      { x: -8, z: -8, radius: 3.6, depth: 0.7 }, { x: 10, z: 12, radius: 3.0, depth: 0.6 },
      { x: -6, z: 36, radius: 4.0, depth: 0.8 },
    ],
    fires: [{ x: -26, z: -10, intensity: 8, radius: 14 }],
    player: { x: 0, z: -18, ry: 0 },
    allies: [{ who: "luyi", x: 2.2, z: -16.0 }, { who: "wanyoufu", x: -3.0, z: 20.0 }],
    zones: [
      { name: "Ruin", x: 0, z: 18, r: 10 },
      { name: "End", x: 0, z: 58, r: 6 },
    ],
    waves: [],
    events: [],
    exit: { x: 0, z: 60, r: 6 },
  },
};

export const LEVEL_ORDER = ["L0_Wall", "L1_Breach", "L2_RoomWar", "L3_WhiteTowel", "L4_LastFiveMinutes", "L5_Morning"];
