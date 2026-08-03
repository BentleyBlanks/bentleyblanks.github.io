// 《地道里的光》 —— 核心逻辑层（无渲染依赖，可在 node 中驱动通关全部章节）。
// 剧本来源：Notion《地道里的光》剧本大纲 + 关卡设计（八章结构，参考《勇敢的心：世界大战》）。
// 设计三原则：每关一个小人物目标；用行动而非台词表现成长；目标是保护群众、保存力量，而不是消灭敌人。

export const GAME_VERSION = "0.1.0";

// ---------------------------------------------------------------------------
// 章节元数据
// ---------------------------------------------------------------------------
export const CHAPTERS = [
  { id: "c1", num: "第一章", title: "门框上的刻痕", year: "1942 · 华北敌后 · 梁家村", env: "village", light: "day" },
  { id: "c2", num: "第二章", title: "第一次失去", year: "1943 · 春 · 梁家村", env: "village", light: "night" },
  { id: "c3", num: "第三章", title: "寻找妹妹", year: "1943 · 据点外的庄稼地", env: "fields", light: "night" },
  { id: "c4", num: "第四章", title: "地道里的第一次光", year: "1943 · 高家庄地道", env: "tunnelVillage", light: "tunnel" },
  { id: "c5", num: "第五章", title: "反击地道", year: "1943 · 夏 · 高家庄地道", env: "tunnelVillage", light: "tunnel" },
  { id: "c6", num: "第六章", title: "敌人的陷阱", year: "1943 · 押送前夜", env: "fields", light: "night" },
  { id: "c7", num: "第七章", title: "地道里的光", year: "1943 · 据点地道", env: "tunnelFort", light: "dark" },
  { id: "c8", num: "第八章", title: "回家的路", year: "一个月后 · 梁家村", env: "village", light: "dawn" },
];

// ---------------------------------------------------------------------------
// 世界布局（米制，x 向东，z 向南；渲染层直接消费这些数据生成白盒几何）
// ---------------------------------------------------------------------------
export const LAYOUTS = {
  village: {
    size: 170,
    // 建筑：柱子家在西南，院墙围出小院；burned 标记第八章废墟状态
    buildings: [
      { id: "homeHouse", x: -30, z: -25, w: 12, d: 10, h: 3.4, name: "柱子家", burnable: true },
      { id: "houseA", x: 12, z: -30, w: 12, d: 8, h: 3.2, burnable: true },
      { id: "houseB", x: 30, z: -16, w: 10, d: 8, h: 3.0 },
      { id: "houseC", x: 18, z: 6, w: 10, d: 9, h: 3.2 },
      { id: "houseD", x: -8, z: 20, w: 12, d: 8, h: 3.0, burnable: true },
      { id: "houseE", x: -30, z: 16, w: 10, d: 8, h: 3.2 },
      { id: "houseF", x: 34, z: 14, w: 9, d: 8, h: 3.0 },
      { id: "houseG", x: -12, z: -38, w: 10, d: 8, h: 3.0 },
    ],
    walls: [
      // 柱子家院墙（缺口即院门，朝东）
      { x1: -38, z1: -32, x2: -38, z2: -12, h: 1.8 },
      { x1: -38, z1: -32, x2: -16, z2: -32, h: 1.8 },
      { x1: -16, z1: -32, x2: -16, z2: -24, h: 1.8 },
      { x1: -16, z1: -16, x2: -16, z2: -12, h: 1.8 },
      { x1: -38, z1: -12, x2: -24, z2: -12, h: 1.8 },
      // 村中零散断墙
      { x1: 4, z1: -14, x2: 12, z2: -14, h: 1.6 },
      { x1: -2, z1: 12, x2: 6, z2: 12, h: 1.5 },
      { x1: 24, z1: -4, x2: 30, z2: -4, h: 1.5 },
    ],
    haystacks: [
      { x: -8, z: -8, r: 1.7 }, { x: 14, z: -8, r: 1.7 }, { x: 6, z: 24, r: 1.7 },
      { x: -20, z: 28, r: 1.7 }, { x: 26, z: 0, r: 1.7 }, { x: 40, z: 6, r: 1.7 },
    ],
    trees: [
      { x: 20, z: 22, r: 0.5, big: true, name: "老槐树" },
      { x: -44, z: 2, r: 0.4 }, { x: 46, z: -22, r: 0.4 }, { x: -6, z: 44, r: 0.4 },
    ],
    props: [
      { id: "well", x: 0, z: 4, kind: "well", name: "水井" },
      { id: "workbench", x: -21, z: -17, kind: "bench", name: "工作台" },
      { id: "doorframe", x: -26.5, z: -19.8, kind: "doorframe", name: "门框" },
      { id: "cellar", x: -33, z: -14.5, kind: "cellar", name: "地窖" },
      { id: "millstone", x: 25, z: -8, kind: "millstone", name: "磨盘" },
      { id: "woodpile", x: -4, z: -44, kind: "woodpile", name: "木料堆" },
      { id: "stool", x: -27.5, z: -21.5, kind: "stool", name: "旧木凳" },
    ],
    zones: {
      homeYard: { x: -27, z: -20, r: 6, label: "家里的院子" },
      courtGate: { x: -16, z: -20, r: 2.5 },
      sisterTree: { x: 20, z: 21, r: 3.5, label: "老槐树下" },
      cellar: { x: -33, z: -14.5, r: 2.0, label: "地窖" },
      eastExit: { x: 56, z: 4, r: 4, label: "村东口" },
      northLane: { x: 2, z: -22, r: 3 },
      midLane: { x: 18, z: -2, r: 3 },
      woodpile: { x: -4, z: -44, r: 3, label: "木料堆" },
      workbench: { x: -21, z: -17, r: 2.2, label: "工作台" },
      doorframe: { x: -26.5, z: -18.6, r: 1.8, label: "门框" },
      villageEdge: { x: -52, z: 30, r: 5, label: "村西头" },
    },
    bounds: { minX: -60, maxX: 62, minZ: -52, maxZ: 50 },
  },

  fields: {
    size: 190,
    // 据点居中偏北，南面是庄稼地与交通沟
    buildings: [
      { id: "blockhouse", x: 0, z: -20, w: 10, d: 10, h: 9, name: "炮楼" },
      { id: "barracks", x: -10, z: -8, w: 12, d: 6, h: 3.4, name: "营房" },
      { id: "prisonShed", x: 11, z: -9, w: 9, d: 6, h: 3.0, name: "牢房" },
    ],
    walls: [
      // 据点围墙，南门留缺口
      { x1: -20, z1: -26, x2: 20, z2: -26, h: 2.6 },
      { x1: -20, z1: -26, x2: -20, z2: 2, h: 2.6 },
      { x1: 20, z1: -26, x2: 20, z2: 2, h: 2.6 },
      { x1: -20, z1: 2, x2: -3, z2: 2, h: 2.6 },
      { x1: 3, z1: 2, x2: 20, z2: 2, h: 2.6 },
    ],
    haystacks: [
      { x: -30, z: 14, r: 1.8 }, { x: -6, z: 30, r: 1.8 }, { x: 26, z: 18, r: 1.8 },
      { x: 12, z: 36, r: 1.8 }, { x: -34, z: 34, r: 1.8 },
    ],
    trees: [
      { x: -44, z: 8, r: 0.4 }, { x: 42, z: 24, r: 0.4 }, { x: 36, z: -6, r: 0.4 },
    ],
    props: [
      { id: "gatePost", x: 0, z: 2, kind: "gate", name: "据点南门" },
      { id: "ditch", x: 0, z: 44, kind: "ditch", name: "交通沟" },
      { id: "cornfieldA", x: -34, z: 24, kind: "crops" },
      { id: "cornfieldB", x: 30, z: 30, kind: "crops" },
    ],
    zones: {
      obsWest: { x: -28, z: 12, r: 2.6, label: "西侧灌木" },
      obsSouth: { x: -6, z: 29, r: 2.6, label: "南面草垛" },
      obsEast: { x: 25, z: 16, r: 2.6, label: "东侧田埂" },
      contactA: { x: -33, z: 35, r: 2.6, label: "赶车的乡亲" },
      contactB: { x: 13, z: 37, r: 2.6, label: "拾柴的大娘" },
      ditchSouth: { x: 0, z: 44, r: 5, label: "交通沟" },
      gate: { x: 0, z: 4, r: 3.5, label: "据点南门" },
      campTable: { x: -8, z: 52, r: 3, label: "民兵歇脚点" },
    },
    bounds: { minX: -52, maxX: 52, minZ: -34, maxZ: 60 },
  },

  // 高家庄地道：藏人、转移、保存力量 —— 不是攻击工事
  tunnelVillage: {
    depth: -3.4,
    nodes: {
      entE: { x: 26, z: -2, r: 1.6, name: "东口（磨盘下）" },
      juncE: { x: 14, z: 2, r: 1.4 },
      chamberA: { x: 2, z: -6, r: 2.6, name: "藏人洞·甲" },
      juncMid: { x: -4, z: 4, r: 1.4 },
      chamberB: { x: -12, z: 12, r: 2.6, name: "藏人洞·乙" },
      wellLink: { x: -2, z: 14, r: 1.5, name: "井壁暗口" },
      entW: { x: -24, z: 6, r: 1.6, name: "西口（井台旁）" },
      ventSpot: { x: 2, z: -9.5, r: 1.2, name: "通风口位" },
      bellSpot: { x: 22, z: -1, r: 1.2, name: "预警铃位" },
      hiddenSpot: { x: -18, z: 18, r: 1.4, name: "新暗口位" },
    },
    edges: [
      ["entE", "juncE"], ["juncE", "chamberA"], ["juncE", "juncMid"],
      ["chamberA", "juncMid"], ["juncMid", "chamberB"], ["chamberB", "wellLink"],
      ["juncMid", "entW"], ["chamberB", "entW"], ["chamberA", "ventSpot"],
      ["entE", "bellSpot"], ["chamberB", "hiddenSpot"],
    ],
    corridorHalfWidth: 1.0,
    zones: {
      entE: { x: 26, z: -2, r: 2.2, label: "东口" },
      entW: { x: -24, z: 6, r: 2.2, label: "西口" },
      chamberA: { x: 2, z: -6, r: 2.8, label: "藏人洞·甲" },
      chamberB: { x: -12, z: 12, r: 2.8, label: "藏人洞·乙" },
      ventSpot: { x: 2, z: -9.5, r: 1.6, label: "通风口" },
      bellSpot: { x: 22, z: -1, r: 1.6, label: "预警铃" },
      hiddenSpot: { x: -18, z: 18, r: 1.8, label: "新暗口" },
    },
  },

  // 据点外围地道（第七章）：从庄稼地潜入据点边缘，再折返救人
  tunnelFort: {
    depth: -3.4,
    nodes: {
      fieldEnt: { x: -34, z: 26, r: 1.8, name: "地里入口" },
      seg1: { x: -26, z: 14, r: 1.3 },
      collapse1: { x: -18, z: 8, r: 1.3, name: "塌方·一" },
      seg2: { x: -10, z: 4, r: 1.3 },
      pocketA: { x: -12, z: -2, r: 2.0, name: "旁洞·甲" },
      seg3: { x: -2, z: 0, r: 1.3 },
      collapse2: { x: 4, z: -4, r: 1.3, name: "塌方·二" },
      pocketB: { x: 2, z: 6, r: 2.0, name: "旁洞·乙" },
      cellHatch: { x: 11, z: -6, r: 1.8, name: "牢房地沿" },
      pocketC: { x: 14, z: 2, r: 2.0, name: "旁洞·丙" },
    },
    edges: [
      ["fieldEnt", "seg1"], ["seg1", "collapse1"], ["collapse1", "seg2"],
      ["seg2", "pocketA"], ["seg2", "seg3"], ["seg3", "collapse2"],
      ["seg3", "pocketB"], ["collapse2", "cellHatch"], ["cellHatch", "pocketC"],
    ],
    corridorHalfWidth: 1.0,
    zones: {
      fieldEnt: { x: -34, z: 26, r: 2.4, label: "地里入口" },
      cellHatch: { x: 11, z: -6, r: 2.2, label: "牢房地沿" },
      collapse1: { x: -18, z: 8, r: 1.8, label: "塌方处" },
      collapse2: { x: 4, z: -4, r: 1.8, label: "塌方处" },
      pocketA: { x: -12, z: -2, r: 2.4, label: "旁洞·甲" },
      pocketB: { x: 2, z: 6, r: 2.4, label: "旁洞·乙" },
      pocketC: { x: 14, z: 2, r: 2.4, label: "旁洞·丙" },
    },
  },
};

// ---------------------------------------------------------------------------
// 几何小工具
// ---------------------------------------------------------------------------
function Dist(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }

function InZone(px, pz, zone) { return Dist(px, pz, zone.x, zone.z) <= zone.r; }

function ClosestOnSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az;
  const len2 = abx * abx + abz * abz;
  let t = len2 === 0 ? 0 : ((px - ax) * abx + (pz - az) * abz) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: ax + abx * t, z: az + abz * t };
}

function SegsIntersect(p1x, p1z, p2x, p2z, p3x, p3z, p4x, p4z) {
  const d1 = (p4x - p3x) * (p1z - p3z) - (p4z - p3z) * (p1x - p3x);
  const d2 = (p4x - p3x) * (p2z - p3z) - (p4z - p3z) * (p2x - p3x);
  const d3 = (p2x - p1x) * (p3z - p1z) - (p2z - p1z) * (p3x - p1x);
  const d4 = (p2x - p1x) * (p4z - p1z) - (p2z - p1z) * (p4x - p1x);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

// 视线遮挡：建筑取样 + 高墙线段相交（矮墙不挡视线，蹲下才算掩护）
function LineBlocked(layout, ax, az, bx, bz) {
  if (layout.buildings) {
    const steps = 14;
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      for (const b of layout.buildings) {
        if (Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2) return true;
      }
    }
  }
  if (layout.walls) {
    for (const w of layout.walls) {
      if (w.h >= 1.6 && SegsIntersect(ax, az, bx, bz, w.x1, w.z1, w.x2, w.z2)) return true;
    }
  }
  return false;
}

function CollideWalls(layout, x, z, radius) {
  if (!layout.walls) return { x, z };
  for (const w of layout.walls) {
    const p = ClosestOnSegment(x, z, w.x1, w.z1, w.x2, w.z2);
    const d = Dist(x, z, p.x, p.z);
    const minD = radius + 0.25;
    if (d < minD && d > 1e-6) {
      x = p.x + ((x - p.x) / d) * minD;
      z = p.z + ((z - p.z) / d) * minD;
    }
  }
  return { x, z };
}

// 地道行走约束：只允许在走廊与洞室内活动
export function ConstrainToTunnel(layout, x, z) {
  let best = null, bestDist = Infinity;
  for (const key of Object.keys(layout.nodes)) {
    const n = layout.nodes[key];
    const d = Dist(x, z, n.x, n.z) - n.r;
    if (d < bestDist) { bestDist = d; best = { x: n.x, z: n.z, allow: n.r }; }
  }
  for (const [a, b] of layout.edges) {
    const na = layout.nodes[a], nb = layout.nodes[b];
    const p = ClosestOnSegment(x, z, na.x, na.z, nb.x, nb.z);
    const d = Dist(x, z, p.x, p.z) - layout.corridorHalfWidth;
    if (d < bestDist) { bestDist = d; best = { x: p.x, z: p.z, allow: layout.corridorHalfWidth }; }
  }
  if (bestDist <= 0) return { x, z };
  // 拉回最近的可行走点
  const dx = x - best.x, dz = z - best.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: best.x + (dx / len) * best.allow, z: best.z + (dz / len) * best.allow };
}

function CollideBuildings(layout, x, z, radius) {
  if (!layout.buildings) return { x, z };
  for (const b of layout.buildings) {
    const hw = b.w / 2 + radius, hd = b.d / 2 + radius;
    const dx = x - b.x, dz = z - b.z;
    if (Math.abs(dx) < hw && Math.abs(dz) < hd) {
      const pushX = hw - Math.abs(dx), pushZ = hd - Math.abs(dz);
      if (pushX < pushZ) x = b.x + Math.sign(dx || 1) * hw;
      else z = b.z + Math.sign(dz || 1) * hd;
    }
  }
  return { x, z };
}

// ---------------------------------------------------------------------------
// 剧本：八个章节的 beat 序列
// beat.kind: cinematic | goto | collect | escort | lead | interact | hold | choice | smokeEscape | buildSpots | rescueLoop
// ---------------------------------------------------------------------------
const V = LAYOUTS.village.zones;
const F = LAYOUTS.fields.zones;
const TV = LAYOUTS.tunnelVillage.zones;
const TF = LAYOUTS.tunnelFort.zones;

// 台词遵守“少说话”：只保留大纲里的原句，其余用镜头说明（stage）代替
const SCRIPTS = {
  c1: [
    {
      kind: "cinematic", id: "c1_open",
      lines: [
        { stage: "1942年，华北敌后。梁家村。", d: 3.2, cam: { kind: "high", x: 0, z: 0, dist: 60 } },
        { stage: "梁木匠把刨子放下，叫住了往外跑的儿子。", d: 3.4, cam: { kind: "yard" } },
        { stage: "他让柱子靠着门框站直，用墨斗线在门框上刻下一道线。", d: 4.0, cam: { kind: "doorframe" } },
        { who: "爹", say: "再过几年，这个家就靠你了。", d: 3.6, cam: { kind: "doorframe" } },
        { stage: "柱子没听懂这句话有多重。他只惦记着院外那堆没搬完的木料。", d: 3.8, cam: { kind: "yard" } },
      ],
    },
    {
      kind: "collect", id: "c1_planks", objective: "帮爹把三根木料搬回工作台",
      items: [{ x: -5, z: -43 }, { x: -2.5, z: -45 }, { x: -6.5, z: -46 }],
      deliver: V.workbench, carryLabel: "木料",
      hint: "走到木料旁按 E 扛起，送回院里工作台再按 E 放下",
    },
    {
      kind: "collect", id: "c1_water", objective: "帮娘从井台提一桶水回来",
      items: [{ x: 0.8, z: 5.2 }],
      deliver: V.homeYard, carryLabel: "水桶",
      hint: "娘在灶间忙，水缸见了底",
    },
    {
      kind: "goto", id: "c1_findSister", zone: V.sisterTree, objective: "去老槐树下找妹妹回家吃饭",
      hint: "娘直起腰，朝老槐树的方向望了望",
    },
    {
      kind: "escort", id: "c1_sisterHome", follower: "sister", dest: V.homeYard,
      objective: "带妹妹回家", hint: "妹妹会跟着你走",
    },
    {
      kind: "cinematic", id: "c1_raid",
      lines: [
        { stage: "锣声。有人在村口喊：鬼子进村了——", d: 3.0, cam: { kind: "high", x: 40, z: 0, dist: 46 } },
        { stage: "爹把刨子塞进柴堆，转身推开院门。", d: 3.0, cam: { kind: "yard" } },
        { who: "爹", say: "带妹妹进地窖。别出声。", d: 3.0, cam: { kind: "yard" } },
      ],
      onDone: (state) => { SpawnRaidSoldiers(state); },
    },
    {
      kind: "escort", id: "c1_hide", follower: "sister", dest: V.cellar, stealth: true,
      objective: "带妹妹躲进地窖", hint: "别撞上院外的鬼子，从院里绕到地窖口",
      resetHint: "被巡逻的鬼子看见了。再试一次——柱子还只是个孩子，跑不过刺刀。",
    },
    {
      kind: "cinematic", id: "c1_father",
      lines: [
        { stage: "地窖板的缝里，能看见院子。", d: 3.0, cam: { kind: "cellarPeek" },
          on: (state) => {
            // 两个兵进院，架住爹
            const father = state.actors.find((a) => a.id === "father");
            const r1 = state.actors.find((a) => a.id === "raid1");
            const r2 = state.actors.find((a) => a.id === "raid2");
            if (father) { father.x = -25; father.z = -17.5; father.heading = Math.PI; }
            if (r1) { r1.patrol = null; r1.cineTarget = { x: -23.8, z: -17.2 }; r1.cineSpeed = 3; }
            if (r2) { r2.patrol = null; r2.cineTarget = { x: -26.2, z: -17.8 }; r2.cineSpeed = 3; }
          } },
        { stage: "爹被两个兵按着跪在地上。他们问他八路把粮藏在哪。", d: 4.2, cam: { kind: "cellarPeek" } },
        { stage: "爹摇头。枪托砸下来。他又摇头。", d: 4.0, cam: { kind: "cellarPeek" } },
        { stage: "妹妹想哭。柱子把她的脸按进自己肩膀。", d: 3.8, cam: { kind: "cellarPeek" } },
        { stage: "爹被拖出院门的时候，回头看了一眼门框。", d: 4.2, cam: { kind: "doorframe" },
          on: (state) => {
            for (const id of ["father", "raid1", "raid2"]) {
              const a = state.actors.find((x) => x.id === id);
              if (a) { a.cineTarget = { x: -14, z: -20 }; a.cineSpeed = 1.5; a.cineVanish = true; }
            }
          } },
        { stage: "那道刚刻下的线，还露着新茬。", d: 3.4, cam: { kind: "doorframe" } },
      ],
    },
  ],

  c2: [
    {
      kind: "cinematic", id: "c2_open",
      lines: [
        { stage: "1943年。爹没有回来。", d: 3.0, cam: { kind: "high", x: -20, z: -10, dist: 50 } },
        { stage: "柱子十六岁了，学会了爹的手艺，也学会了听见狗叫就先看村口。", d: 4.2, cam: { kind: "yard" } },
        { stage: "这天夜里，狗叫得不一样。", d: 3.0, cam: { kind: "yard" } },
        { stage: "鬼子又来了。这回他们拿着名单，挨家找帮过八路的人。", d: 4.2, cam: { kind: "high", x: 30, z: -10, dist: 44 } },
        { stage: "前头挑灯笼带路的，是邻村据点里的翻译官。名单就是他递上去的。", d: 4.4, cam: { kind: "high", x: 20, z: -20, dist: 36 } },
      ],
      onDone: (state) => { SpawnNightSweep(state); },
    },
    {
      kind: "leadFollow", id: "c2_mother", leader: "mother", follower: "sister",
      waypoints: [V.homeYard, V.northLane, V.midLane],
      objective: "跟紧娘，别出声", hint: "娘走你就走，娘停你就蹲下（C 蹲低）",
      resetHint: "手电扫过来的时候要蹲进影子里。",
    },
    {
      kind: "cinematic", id: "c2_decoy",
      lines: [
        { stage: "前面巷口站着人。走不过去了。", d: 3.0, cam: { kind: "low" } },
        { stage: "娘把妹妹的手放进柱子手里，又把两个孩子往磨盘后面按了按。", d: 4.4, cam: { kind: "low" } },
        { stage: "她没说话。只朝村东口努了努嘴。", d: 3.4, cam: { kind: "low" } },
        { stage: "然后她站起来，朝反方向走去，故意踢翻了一只水瓮。", d: 4.2, cam: { kind: "decoy" },
          on: (state) => {
            const mother = state.actors.find((a) => a.id === "mother");
            if (mother) { mother.cineTarget = { x: -8, z: -34 }; mother.cineSpeed = 2.3; }
          } },
        { stage: "灯笼、喊声、脚步，全都追着那声响去了。", d: 3.8, cam: { kind: "decoy" },
          on: (state) => {
            for (const id of ["sweep1", "sweep2"]) {
              const s = state.actors.find((a) => a.id === id);
              if (s) { s.cineTarget = { x: -4, z: -30 }; s.cineSpeed = 2.6; }
            }
          } },
      ],
      onDone: (state) => { MotherDecoyDone(state); },
    },
    {
      kind: "escort", id: "c2_escape", follower: "sister", dest: V.eastExit, stealth: true,
      objective: "带妹妹去村东口", hint: "沿着草垛和断墙的影子走",
      resetHint: "妹妹跑不快。等巡逻走远了再动。",
      midToast: { zone: { x: 30, z: 0, r: 6 }, text: "路过的院里在拖人。柱子把妹妹的脸按在自己胸口，贴着墙根走了过去。" },
    },
    {
      kind: "cinematic", id: "c2_taken",
      lines: [
        { stage: "村东口就在眼前。", d: 2.6, cam: { kind: "low" } },
        { stage: "两盏马灯突然从路两边亮起来。", d: 3.0, cam: { kind: "ambush" },
          on: (state) => {
            state.actors.push(
              MakeActor("ambush1", "puppet", 52, 9, { lantern: true, heading: -2.2 }),
              MakeActor("ambush2", "soldier", 60, 0, { lantern: true, heading: 2.6 }),
            );
          } },
        { stage: "是等在这里的。", d: 2.6, cam: { kind: "ambush" } },
        { stage: "妹妹的手从柱子手里被拽走。他扑上去，被枪托砸在背上。", d: 4.4, cam: { kind: "ambush" },
          on: (state) => {
            const sister = state.actors.find((a) => a.id === "sister");
            if (sister) {
              sister.following = false;
              sister.cineTarget = { x: 57, z: 5 };
              sister.cineSpeed = 2.4;
            }
            const a1 = state.actors.find((a) => a.id === "ambush1");
            if (a1) { a1.cineTarget = { x: 58, z: 4 }; a1.cineSpeed = 2.0; a1.cineVanish = true; }
          } },
        { stage: "邻居七叔从沟里死死抱住他，捂着他的嘴，把他拖进高粱地。", d: 4.4, cam: { kind: "ambush" },
          on: (state) => {
            const sister = state.actors.find((a) => a.id === "sister");
            if (sister) sister.visible = false;
            const a2 = state.actors.find((a) => a.id === "ambush2");
            if (a2) { a2.cineTarget = { x: 60, z: -2 }; a2.cineVanish = true; }
          } },
        { stage: "那天夜里，娘没有回来。", d: 3.4, cam: { kind: "dark" } },
        { stage: "柱子在高粱地里蹲到天亮。他只剩一个念头了。", d: 4.0, cam: { kind: "dark" } },
        { stage: "救回妹妹。", d: 3.0, cam: { kind: "dark" } },
      ],
    },
  ],

  c3: [
    {
      kind: "cinematic", id: "c3_open",
      lines: [
        { stage: "乡亲们说，被抓的人关进了河东的据点。", d: 3.4, cam: { kind: "high", x: 0, z: -10, dist: 56 } },
        { stage: "柱子沿着运输队的车辙，摸到了据点外的庄稼地。", d: 3.8, cam: { kind: "high", x: 0, z: 20, dist: 44 } },
        { stage: "他不敢靠近。他先学会了看。", d: 3.2, cam: { kind: "low" } },
      ],
      onDone: (state) => { SpawnFortPatrols(state, false); },
    },
    {
      kind: "observe", id: "c3_watch", spots: [F.obsWest, F.obsSouth, F.obsEast], watchTime: 5,
      objective: "在三处遮蔽点观察据点（每处停留一会儿）",
      hint: "蹲在遮蔽点里别动，柱子会把看到的记在心里",
      resetHint: "巡逻队走近了。柱子退回庄稼地，等风声过去。",
      notes: [
        "岗楼上两个人，换岗时背对南门，半袋烟的工夫。",
        "巡逻队沿围墙转，转到东北角会停下来抽烟。",
        "牢房在东边。白天押着人往围墙上搬土袋，天黑后送过一次饭。押送用的骡车拴在门里。",
      ],
    },
    {
      kind: "gotoSeq", id: "c3_contacts", spots: [F.contactA, F.contactB],
      objective: "去问问地里的乡亲", hint: "乡亲们敢说话，但只敢小声说",
      notes: [
        "赶车的乡亲：『里头新关了十几个，有女娃。别靠南门，狗鼻子灵。』",
        "拾柴的大娘：『过几天要往县里押人。孩子，你一个人不行。』",
      ],
    },
    {
      kind: "goto", id: "c3_closer", zone: F.gate, stealth: true, sneakTo: true,
      objective: "趁换岗摸近南门，看清牢房方向", hint: "贴着墙根走，别进灯光",
      resetHint: "岗楼上的灯扫了过来。退回沟里，重新等换岗。",
      interruptAt: 0.8,
    },
    {
      kind: "cinematic", id: "c3_rescue",
      lines: [
        { stage: "身后突然伸过来一只手，把柱子整个按进交通沟。", d: 3.6, cam: { kind: "ditch" } },
        { stage: "巡逻队的脚步声从头顶的田埂上过去了。", d: 3.6, cam: { kind: "ditch" } },
        { stage: "沟里蹲着几个背枪的庄稼人。领头的把他上下打量了一遍。", d: 4.0, cam: { kind: "ditch" } },
        { who: "高传宝", say: "梁家村的柱子？", d: 2.8, cam: { kind: "ditch" } },
        { who: "高传宝", say: "你爹以前帮过乡亲。", d: 3.0, cam: { kind: "ditch" } },
        { stage: "夜里，一个满身泥的交通员摸进沟来，鞋底磨穿了。", d: 4.0, cam: { kind: "ditch" } },
        { who: "交通员", say: "据点里又抓了几个人。柱子的妹妹，也在里面。", d: 4.2, cam: { kind: "ditch" } },
        { who: "高传宝", say: "先把人救出来。不能让乡亲们再被带走。", d: 4.0, cam: { kind: "ditch" } },
        { stage: "鬼子放出风来，要往县里押人，日子没说定——这是撒出来的饵。谁都听得懂。", d: 4.6, cam: { kind: "ditch" } },
      ],
    },
  ],

  c4: [
    {
      kind: "cinematic", id: "c4_open",
      lines: [
        { stage: "高家庄的地道，是乡亲们一锹一锹挖出来的。", d: 3.6, cam: { kind: "tunnelWide" } },
        { stage: "它不通向据点。它通向的是：藏得住人，转移得走，活得下去。", d: 4.4, cam: { kind: "tunnelWide" } },
        { who: "高传宝", say: "想救人，先学会怎么把人藏好。", d: 3.4, cam: { kind: "tunnel" } },
      ],
      onDone: (state) => { SpawnTunnelVillagers(state); },
    },
    {
      kind: "lead", id: "c4_hideA", group: "elders", from: "entE", dest: TV.chamberA,
      objective: "把两位老人带到藏人洞·甲", hint: "走到老人身边按 E，他们会跟着你",
    },
    {
      kind: "lead", id: "c4_hideB", group: "family", from: "entE", dest: TV.chamberB,
      objective: "把大嫂和孩子带到藏人洞·乙", hint: "孩子走得慢，别落下他们",
    },
    {
      kind: "hold", id: "c4_shore", zone: TV.entW, holdTime: 3,
      objective: "西口的顶木松了，把它撑牢", hint: "在西口按住 E，柱子会用上木匠的手艺",
      note: "柱子第一次发现，爹教的活计，在地底下也用得上。",
    },
    {
      kind: "hold", id: "c4_listen", zone: TV.entE, holdTime: 4,
      objective: "贴在东口下面，听听上面的动静", hint: "按住 E，柱子会把听到的记在心里",
      note: "探杆一下一下地戳。脚步散开，又聚拢。他们是按趟来的——趟与趟之间，有空子。",
    },
    {
      kind: "cinematic", id: "c4_smokeStart",
      lines: [
        { stage: "头顶传来闷响。泥土簌簌往下掉。", d: 3.2, cam: { kind: "tunnel" } },
        { stage: "有人用本地口音在上面喊：地道口就在磨盘这一片，扒！", d: 3.8, cam: { kind: "tunnel" } },
        { who: "民兵", say: "鬼子发现东口了！", d: 2.6, cam: { kind: "tunnel" } },
        { stage: "一股呛人的烟，顺着东口灌了进来。", d: 3.4, cam: { kind: "smokeE" } },
      ],
      onDone: (state) => { StartSmoke(state); },
    },
    {
      kind: "smokeEscape", id: "c4_smoke", dest: TV.entW, lossScript: true,
      objective: "赶在烟前头，把人从西口转移出去",
      hint: "烟往里灌，先带离东边近的人。E 让一群人跟上，到西口他们会自己爬出去",
      resetHint: "烟呛倒了人。民兵把大家拖回洞室，重新来。",
    },
    {
      kind: "cinematic", id: "c4_loss",
      lines: [
        { stage: "西口外，乡亲们趴在田里咳嗽。人数了两遍。", d: 3.8, cam: { kind: "fieldNight" } },
        { stage: "顺子没出来。拴柱大爷也没有。", d: 4.2, cam: { kind: "fieldNight" } },
        { stage: "第二天，鬼子又拉来了水泵，往地道里灌水。", d: 3.8, cam: { kind: "fieldNight" } },
        { stage: "民兵冒险打开另一条道，把困着的人一个个拖出来。", d: 4.0, cam: { kind: "fieldNight" } },
        { stage: "有人活着出来。有人再也没有出来。", d: 4.2, cam: { kind: "dark" } },
        { stage: "柱子站在出口，看着被抬出来的乡亲，一句话也说不出。", d: 4.2, cam: { kind: "fieldNight" } },
        { who: "高传宝", say: "准备下一次行动。", d: 3.0, cam: { kind: "fieldNight" } },
        { stage: "柱子背起工具，跟着队伍再次下了地道。", d: 3.6, cam: { kind: "tunnelWide" } },
      ],
    },
  ],

  c5: [
    {
      kind: "cinematic", id: "c5_open",
      lines: [
        { stage: "东口封死了。第二天起，全村轮班下洞。", d: 3.6, cam: { kind: "tunnelWide" } },
        { stage: "高传宝在门板上画了三个记号：通风眼，新暗口，预警铃。", d: 4.0, cam: { kind: "tunnel" } },
        { stage: "柱子的墨斗和刨子，成了地道里的家伙什。", d: 3.6, cam: { kind: "tunnel" } },
      ],
    },
    {
      kind: "buildSpots", id: "c5_build",
      spots: [
        { zone: TV.ventSpot, label: "打通风眼", holdTime: 3, note: "眼口藏在井壁里，烟能出去，地面上看不出来。" },
        { zone: TV.hiddenSpot, label: "挖新暗口", holdTime: 3, note: "旧口废了不可惜，可惜的是没有下一个口。" },
        { zone: TV.bellSpot, label: "拴预警铃", holdTime: 3, note: "东口一响，全村先知道。" },
      ],
      objective: "完成三处改造：通风眼、新暗口、预警铃",
      hint: "到标记处按住 E 施工",
    },
    {
      kind: "cinematic", id: "c5_alarm",
      lines: [
        { stage: "没过几天，鬼子又来了。还是老一套：堵口，灌烟。", d: 3.8, cam: { kind: "smokeE" } },
      ],
      onDone: (state) => { StartDrillSmoke(state); },
    },
    {
      kind: "smokeEscape", id: "c5_drill", dest: TV.hiddenSpot,
      objective: "铃响了——把人从新暗口送出去",
      hint: "通风眼会拖住甲洞的烟。别走西口，鬼子早就盯上它了",
      resetHint: "烟追上了人。再来——这一回，地道听你们的。",
    },
    {
      kind: "cinematic", id: "c5_test",
      lines: [
        { stage: "烟顺着井壁的暗眼散了。地面上，什么也看不出来。", d: 4.0, cam: { kind: "ventUp" } },
        { stage: "鬼子在村里翻到天黑，一个人也没找到。", d: 3.8, cam: { kind: "fieldNight" } },
        { stage: "撤下来的时候，一个年轻民兵被塌下的土石压住了腿。", d: 4.2, cam: { kind: "tunnel" } },
        { stage: "鬼子的探杆就在头顶上戳。谁也不敢出声。", d: 3.8, cam: { kind: "tunnel" } },
        { stage: "他把手里的枪递出去，朝洞外摆了摆手。", d: 4.2, cam: { kind: "tunnel" } },
        { who: "年轻民兵", say: "带乡亲们走。", d: 3.0, cam: { kind: "tunnel" } },
        { d: 2.4, cam: { kind: "dark" } },
      ],
    },
  ],

  c6: [
    {
      kind: "cinematic", id: "c6_open",
      lines: [
        { stage: "押送定在后天。据点里外都加了岗。", d: 3.4, cam: { kind: "high", x: 0, z: 0, dist: 50 } },
        { stage: "谁都知道这是个套：他们要的不是这十几个乡亲，是来救乡亲的人。", d: 4.6, cam: { kind: "high", x: 0, z: 10, dist: 44 } },
        { who: "高传宝", say: "套是套。人，也是真的人。", d: 3.4, cam: { kind: "ditch" } },
        { stage: "柱子这回没有躲在沟里等。他主动领了侦查的活。", d: 3.8, cam: { kind: "ditch" } },
      ],
      onDone: (state) => { SpawnFortPatrols(state, true); },
    },
    {
      kind: "observe", id: "c6_scout", spots: [F.obsWest, F.obsEast], watchTime: 4,
      objective: "记下加岗后的巡逻路数（两处观察点）",
      hint: "换岗的空当很短，看准了再记",
      resetHint: "差一点被发现。柱子把心跳按下去，重新贴回土里。",
      notes: [
        "南门加了双岗，但换岗还是背对庄稼地。",
        "牢房外多了一个游动哨，绕到北墙要一袋烟的工夫。",
      ],
    },
    {
      kind: "goto", id: "c6_report", zone: F.campTable, objective: "回歇脚点，把看到的画下来",
      hint: "柱子用木匠画线的手，把据点画在了门板上",
    },
    {
      kind: "choice", id: "c6_plan",
      prompt: "高传宝把门板图转向大家：人怎么进去？",
      options: [
        { key: "ground", label: "地面佯动", detail: "民兵在村北打枪扯动巡逻，突击组趁乱从南门附近翻墙——快，但撤人的路上全是明处。" },
        { key: "tunnel", label: "地下进人", detail: "顺着挖到据点边上的地道摸到牢房地沿——慢，土层不稳，但乡亲们能从地下走。" },
      ],
      objective: "定下营救的路子",
    },
    {
      kind: "cinematic", id: "c6_eve",
      lines: [
        { stage: "行动前夜。油灯把门板图照得发黄。", d: 3.6, cam: { kind: "lamp" } },
        { stage: "柱子站在图前，指着据点的方向。", d: 3.2, cam: { kind: "lamp" } },
        { who: "柱子", say: "我去。", d: 2.4, cam: { kind: "lamp" } },
        { stage: "高传宝看了他一眼。没有劝。", d: 3.0, cam: { kind: "lamp" } },
        { who: "高传宝", say: "跟紧队伍。", d: 2.6, cam: { kind: "lamp" } },
      ],
    },
  ],

  c7: [
    {
      kind: "cinematic", id: "c7_open", dynamicLines: (state) => (
        state.flags.route === "ground"
          ? [
            { stage: "区上武工队来了两个班，和民兵分了工：地面的归他们，地下的归地道。", d: 4.4, cam: { kind: "dark" } },
            { stage: "二更天，村北先响了枪。", d: 3.0, cam: { kind: "dark" } },
            { stage: "据点岗楼上的灯全甩向北面。巡逻队跑步出了南门。", d: 3.8, cam: { kind: "dark" } },
            { stage: "突击组翻进围墙。柱子跟着最后一个下了地道——乡亲们要从地下走。", d: 4.4, cam: { kind: "tunnelWide" } },
          ]
          : [
            { stage: "区上武工队来了两个班，埋伏在庄稼地里接应——地面不动，人从地下走。", d: 4.4, cam: { kind: "dark" } },
            { stage: "二更天，地道里一盏灯也没点。", d: 3.2, cam: { kind: "dark" } },
            { stage: "队伍在黑暗里贴着墙根移动，谁也不说话。", d: 3.6, cam: { kind: "tunnelWide" } },
            { stage: "柱子数着步子。到牢房地沿，要过两处没撑牢的老塌方。", d: 4.2, cam: { kind: "tunnelWide" } },
          ]
      ),
      onDone: (state) => { SetupFortTunnel(state); },
    },
    {
      kind: "digSeq", id: "c7_dig", spots: [TF.collapse1, TF.collapse2], holdTime: 3.5,
      objective: "清开塌方，打通去牢房地沿的路", hint: "按住 E 清土。头顶有动静时停一停（提示会变红）",
      quakeInterval: 9,
    },
    {
      kind: "goto", id: "c7_reach", zone: TF.cellHatch, objective: "摸到牢房地沿",
    },
    {
      kind: "cinematic", id: "c7_sister",
      lines: [
        { stage: "地沿的木板被顶开一条缝。霉味和哭声一起漏下来。", d: 4.0, cam: { kind: "hatch" } },
        { stage: "民兵一个个往下接人。柱子在人堆里看见了妹妹。", d: 4.0, cam: { kind: "hatch" },
          on: (state) => {
            const n = LAYOUTS.tunnelFort.nodes;
            for (let i = 0; i < 3; i += 1) {
              state.actors.push(MakeActor(`freed${i}`, "villager", n.cellHatch.x + 0.4 * i, n.cellHatch.z + 0.3 * i, {
                scripted: true, cineTarget: { x: n.fieldEnt.x, z: n.fieldEnt.z }, cineSpeed: 1.7 + i * 0.25, cineVanish: true,
              }));
            }
          } },
        { stage: "妹妹瘦得脱了相。她抓住柱子的袖子。", d: 3.6, cam: { kind: "close" } },
        { who: "妹妹", say: "哥，娘呢？", d: 3.0, cam: { kind: "close" } },
        { stage: "柱子没有说话。", d: 3.0, cam: { kind: "close" } },
        { stage: "妹妹看着哥哥的眼睛，慢慢松开了手，又慢慢把额头抵在他肩上。", d: 5.0, cam: { kind: "close" } },
        { stage: "她明白了。", d: 2.8, cam: { kind: "close" } },
      ],
      onDone: (state) => { AttachSister(state); },
    },
    {
      kind: "escort", id: "c7_out", follower: "sister", dest: TF.fieldEnt,
      objective: "带妹妹沿地道撤到地里入口", hint: "路已经打通了，走就是",
    },
    {
      kind: "cinematic", id: "c7_turn",
      lines: [
        { stage: "入口外就是庄稼地，就是活路。", d: 3.2, cam: { kind: "hatchUp" } },
        { stage: "一个民兵跌跌撞撞从地道里追出来。", d: 3.2, cam: { kind: "tunnel" } },
        { who: "民兵", say: "还有人没出来！东边旁洞里，还有几个乡亲！", d: 4.0, cam: { kind: "tunnel" } },
        { stage: "头顶上，搜查的脚步声越来越密。", d: 3.4, cam: { kind: "tunnel" } },
        { stage: "妹妹就在眼前。柱子等这一天，等了整整一年。", d: 4.2, cam: { kind: "close" } },
        { stage: "可旁洞里那几个人，也在等有人回去。", d: 3.8, cam: { kind: "close" } },
        { stage: "柱子把妹妹的手放进一位大娘手里。", d: 3.6, cam: { kind: "close" } },
        { stage: "高传宝没有拦他。只把一盏煤油灯递了过来。", d: 4.0, cam: { kind: "lamp" } },
        { stage: "柱子接过灯，转身走回黑暗里。", d: 4.0, cam: { kind: "lampTurn" } },
      ],
      onDone: (state) => { StartRescueLoop(state); },
    },
    {
      kind: "rescueLoop", id: "c7_rescue",
      objective: "把旁洞里的乡亲全部带出去（3 处）",
      hint: "灯照多远，路就有多远。E 让乡亲跟上，送到地里入口再回去",
      resetHint: "土又塌了一截。民兵把人拉了回来，重新探路。",
    },
    {
      kind: "cinematic", id: "c7_done",
      lines: [
        { stage: "最后一个乡亲被推出洞口的时候，东边天已经泛白。", d: 4.2, cam: { kind: "dawn" } },
        { stage: "人数了三遍。一个不少。", d: 3.4, cam: { kind: "dawn" } },
        { stage: "柱子坐在田埂上，灯芯已经烧到了头。", d: 3.8, cam: { kind: "lampOut" } },
        { stage: "他把灯吹灭了。天亮了。", d: 4.0, cam: { kind: "dawn" } },
      ],
    },
  ],

  c8: [
    {
      kind: "cinematic", id: "c8_open",
      lines: [
        { stage: "一个月后。", d: 2.6, cam: { kind: "dark" } },
        { stage: "高家庄的地道重新修整。被发现的口子封死了，新口挖在另一片庄稼地旁。", d: 4.6, cam: { kind: "high", x: 0, z: 0, dist: 56 } },
        { stage: "乡亲们把废弃的旧口填平。那块地方，正是当年柱子第一次找到妹妹的地方。", d: 4.8, cam: { kind: "high", x: 20, z: 10, dist: 40 } },
        { stage: "柱子带着妹妹，回了一趟梁家村。", d: 3.4, cam: { kind: "high", x: -30, z: -20, dist: 40 } },
      ],
      onDone: (state) => { SetupRuinedVillage(state); },
    },
    {
      kind: "escort", id: "c8_walk", follower: "sister", dest: V.homeYard, slow: true,
      objective: "和妹妹一起，走回家看看",
    },
    {
      kind: "cinematic", id: "c8_wall",
      lines: [
        { stage: "院子烧毁了。只剩一堵残墙。", d: 3.6, cam: { kind: "ruin" } },
        { stage: "门框还在。", d: 3.0, cam: { kind: "doorframe" } },
        { stage: "妹妹走过去，伸手摸了一下爹刻的那道线。", d: 4.0, cam: { kind: "doorframe" } },
        { stage: "她的手停了一会儿。", d: 3.2, cam: { kind: "doorframe" } },
        { stage: "那道线，比她记忆里高了许多。", d: 3.8, cam: { kind: "doorframe" } },
      ],
    },
    {
      kind: "hold", id: "c8_carve", zone: V.doorframe, holdTime: 2.5,
      objective: "在旧刻痕旁，刻下一道新的线", hint: "按住 E",
      note: "刻完，柱子用拇指抹平了木屑。",
      onDone: (state) => { state.flags.carved = true; },
    },
    {
      kind: "cinematic", id: "c8_call",
      lines: [
        { stage: "院外传来民兵喊他的声音。", d: 3.0, cam: { kind: "ruin" } },
        { who: "民兵", say: "柱子，地道那边还缺人。", d: 3.0, cam: { kind: "ruin" } },
        { stage: "柱子放下工具，回头看了一眼妹妹。", d: 3.6, cam: { kind: "ruin" } },
        { stage: "妹妹抱着爹留下的旧木凳，点了点头。", d: 3.8, cam: { kind: "stool" } },
      ],
    },
    {
      kind: "goto", id: "c8_leave", zone: V.courtGate, objective: "走到院门口去，民兵在村西头等",
    },
    {
      kind: "cinematic", id: "c8_end",
      lines: [
        { stage: "柱子走出院子。", d: 3.0, cam: { kind: "leaveYard" } },
        { stage: "门框上的两道刻痕，留在了身后。", d: 6.2, cam: { kind: "doorframeFar" } },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// 角色与事件生成（beat onEnter/onDone 调用）
// ---------------------------------------------------------------------------
function MakeActor(id, kind, x, z, extra = {}) {
  return { id, kind, x, z, heading: 0, speed: 0, visible: true, ...extra };
}

function SpawnRaidSoldiers(state) {
  state.actors = state.actors.filter((a) => a.kind !== "soldier");
  state.actors.push(
    MakeActor("raid1", "soldier", 10, -20, {
      patrol: [{ x: 10, z: -20 }, { x: -8, z: -20 }, { x: -8, z: -4 }, { x: 10, z: -4 }], patrolIndex: 0, speed: 1.5,
    }),
    MakeActor("raid2", "soldier", -12, 0, {
      patrol: [{ x: -12, z: 0 }, { x: -12, z: -8 }, { x: -22, z: -8 }, { x: -22, z: 2 }], patrolIndex: 0, speed: 1.4,
    }),
  );
  state.stealthActive = true;
}

function SpawnNightSweep(state) {
  state.actors = state.actors.filter((a) => !IsEnemy(a));
  state.actors.push(
    // 带路的翻译官挑着灯笼在前，两个兵在后
    MakeActor("sweep1", "puppet", 8, -26, {
      patrol: [{ x: 8, z: -26 }, { x: 26, z: -26 }, { x: 26, z: -10 }, { x: 8, z: -10 }], patrolIndex: 0, speed: 1.6, lantern: true,
    }),
    MakeActor("sweep2", "soldier", 34, 2, {
      patrol: [{ x: 34, z: 2 }, { x: 16, z: 2 }, { x: 16, z: 16 }, { x: 34, z: 16 }], patrolIndex: 0, speed: 1.5, lantern: true,
    }),
    MakeActor("sweep3", "soldier", 44, -6, {
      patrol: [{ x: 44, z: -6 }, { x: 50, z: 6 }, { x: 44, z: 14 }], patrolIndex: 0, speed: 1.3, lantern: true,
    }),
  );
  state.stealthActive = true;
  // 娘作为引路人出现在院里
  const mother = state.actors.find((a) => a.id === "mother");
  if (mother) { mother.x = -27; mother.z = -18; mother.visible = true; }
}

function MotherDecoyDone(state) {
  const mother = state.actors.find((a) => a.id === "mother");
  if (mother) mother.visible = false;
  // 巡逻被引开：东半区的岗换成稀疏路线，留出一条要靠影子走的路
  const s1 = state.actors.find((a) => a.id === "sweep1");
  if (s1) s1.patrol = [{ x: -6, z: -34 }, { x: -18, z: -34 }, { x: -18, z: -44 }];
  const s2 = state.actors.find((a) => a.id === "sweep2");
  if (s2) { s2.patrol = [{ x: 24, z: 8 }, { x: 36, z: 8 }, { x: 36, z: 20 }]; s2.speed = 1.3; }
}

function SpawnFortPatrols(state, reinforced) {
  state.actors = state.actors.filter((a) => !IsEnemy(a));
  state.actors.push(
    MakeActor("fortA", "soldier", -22, 6, {
      patrol: [{ x: -22, z: 6 }, { x: -22, z: -28 }, { x: 22, z: -28 }, { x: 22, z: 6 }], patrolIndex: 0, speed: 1.5,
    }),
    MakeActor("gate1", "soldier", -2, 4, {
      patrol: [{ x: -2, z: 4 }, { x: 2, z: 4 }], patrolIndex: 0, speed: 0.5,
    }),
  );
  if (reinforced) {
    state.actors.push(
      // 牢房外新添的游动哨：伪军，绕北墙一圈
      MakeActor("fortB", "puppet", 4, -14, {
        patrol: [{ x: 4, z: -14 }, { x: 17, z: -14 }, { x: 17, z: -22 }, { x: 4, z: -22 }], patrolIndex: 0, speed: 1.2, lantern: true,
      }),
      MakeActor("gate2", "soldier", 4, 4, {
        patrol: [{ x: 4, z: 4 }, { x: -4, z: 4 }], patrolIndex: 0, speed: 0.55,
      }),
    );
  }
  state.stealthActive = true;
}

function SpawnTunnelVillagers(state) {
  state.actors = state.actors.filter((a) => a.kind !== "villager");
  const n = LAYOUTS.tunnelVillage.nodes;
  state.actors.push(
    MakeActor("elder1", "villager", n.entE.x - 1, n.entE.z + 0.6, { label: "拴柱大爷", group: "elders", slow: true }),
    MakeActor("elder2", "villager", n.entE.x + 0.5, n.entE.z - 1, { label: "六婶", group: "elders", slow: true }),
    MakeActor("aunt", "villager", n.juncE.x, n.juncE.z + 0.8, { label: "大嫂", group: "family" }),
    MakeActor("kid", "villager", n.juncE.x + 0.8, n.juncE.z, { label: "小石头", group: "family", slow: true }),
    MakeActor("shunzi", "villager", n.chamberA.x + 1, n.chamberA.z + 1, { label: "顺子", group: "none" }),
  );
}

function StartSmoke(state) {
  // 烟沿东口向里推进：记录每个节点被烟淹没的时刻
  state.smoke = {
    t: 0,
    schedule: [
      { node: "entE", at: 0 }, { node: "bellSpot", at: 6 }, { node: "juncE", at: 16 },
      { node: "chamberA", at: 34 }, { node: "juncMid", at: 50 }, { node: "ventSpot", at: 40 },
      { node: "chamberB", at: 78 }, { node: "wellLink", at: 88 }, { node: "hiddenSpot", at: 104 }, { node: "entW", at: 120 },
    ],
    filled: new Set(),
  };
  // 转移目标：甲乙两洞的四个人；顺子按剧本自己行动
  for (const a of state.actors) {
    if (a.kind !== "villager") continue;
    if (a.group === "elders") { a.x = LAYOUTS.tunnelVillage.nodes.chamberA.x; a.z = LAYOUTS.tunnelVillage.nodes.chamberA.z; }
    if (a.group === "family") { a.x = LAYOUTS.tunnelVillage.nodes.chamberB.x; a.z = LAYOUTS.tunnelVillage.nodes.chamberB.z; }
    if (a.id === "shunzi") a.visible = false; // 顺子已回身去背人——只在结尾字幕里出现
    a.following = false; a.evacuated = false;
  }
}

function StartDrillSmoke(state) {
  // 验收战：预警铃先响，通风眼拖住甲洞的烟，西口是死路，新暗口是活路
  const n = LAYOUTS.tunnelVillage.nodes;
  state.actors = state.actors.filter((a) => a.kind !== "villager");
  state.actors.push(
    MakeActor("d_elder", "villager", n.chamberA.x - 0.8, n.chamberA.z + 0.6, { label: "六婶", slow: true }),
    MakeActor("d_aunt", "villager", n.chamberB.x, n.chamberB.z, { label: "大嫂" }),
    MakeActor("d_kid", "villager", n.chamberB.x + 0.8, n.chamberB.z + 0.5, { label: "小石头", slow: true }),
  );
  state.smoke = {
    t: 0,
    schedule: [
      { node: "entE", at: 0 }, { node: "bellSpot", at: 4 }, { node: "juncE", at: 18 },
      { node: "juncMid", at: 46 }, { node: "entW", at: 58 }, // 鬼子这回也堵了西口
      { node: "chamberA", at: 85 }, // 通风眼把甲洞的烟拖慢了
      { node: "chamberB", at: 80 }, { node: "wellLink", at: 92 },
      { node: "ventSpot", at: 70 }, { node: "hiddenSpot", at: 999 },
    ],
    filled: new Set(),
  };
  state.player.x = n.entE.x;
  state.player.z = n.entE.z;
  // 高传宝去新暗口那头接应，别站在烟道里
  const gao = state.actors.find((a) => a.id === "gao");
  if (gao) { gao.cineTarget = { x: n.hiddenSpot.x, z: n.hiddenSpot.z }; gao.cineSpeed = 2.4; }
  state.toast = { text: "东口的铃响成一串。人已经在往洞里下了。", t: 4 };
}

function SetupFortTunnel(state) {
  state.collapses = {
    collapse1: { cleared: false, progress: 0 },
    collapse2: { cleared: false, progress: 0 },
  };
  state.actors = state.actors.filter((a) => a.kind !== "villager" && a.kind !== "soldier");
  state.player.x = LAYOUTS.tunnelFort.nodes.fieldEnt.x;
  state.player.z = LAYOUTS.tunnelFort.nodes.fieldEnt.z;
}

function AttachSister(state) {
  let sister = state.actors.find((a) => a.id === "sister");
  if (!sister) {
    sister = MakeActor("sister", "sister", 0, 0, { label: "妹妹" });
    state.actors.push(sister);
  }
  sister.visible = true;
  sister.x = state.player.x + 0.8;
  sister.z = state.player.z + 0.4;
  sister.following = true;
}

function StartRescueLoop(state) {
  const sister = state.actors.find((a) => a.id === "sister");
  if (sister) { sister.visible = false; sister.following = false; }
  state.player.lamp = true;
  const n = LAYOUTS.tunnelFort.nodes;
  state.actors.push(
    MakeActor("trapA1", "villager", n.pocketA.x, n.pocketA.z, { label: "被困乡亲", pocket: "pocketA" }),
    MakeActor("trapA2", "villager", n.pocketA.x + 0.8, n.pocketA.z + 0.5, { label: "被困乡亲", pocket: "pocketA" }),
    MakeActor("trapB1", "villager", n.pocketB.x, n.pocketB.z, { label: "受伤的老人", pocket: "pocketB", slow: true }),
    MakeActor("trapB2", "villager", n.pocketB.x - 0.7, n.pocketB.z + 0.6, { label: "搀扶的民兵", pocket: "pocketB" }),
    MakeActor("trapC1", "villager", n.pocketC.x, n.pocketC.z, { label: "抱孩子的大嫂", pocket: "pocketC", slow: true }),
  );
  // 老人那段对话按剧本走：见 rescueLoop 里的 pocketB 触发
  state.rescue = { delivered: new Set(), dialogueShown: new Set(), quakeT: 0 };
  if (state.flags.route === "ground") {
    state.toast = { text: "村北的枪声停了。敌人正在回防——头顶的动静密了起来。", t: 5 };
  }
}

function SetupRuinedVillage(state) {
  state.flags.ruined = true;
  state.player.x = 40; state.player.z = 20;
  let sister = state.actors.find((a) => a.id === "sister");
  if (!sister) { sister = MakeActor("sister", "sister", 41, 21, { label: "妹妹" }); state.actors.push(sister); }
  sister.visible = true; sister.following = true;
  sister.x = state.player.x + 1; sister.z = state.player.z + 0.6;
  state.actors = state.actors.filter((a) => a.kind !== "soldier" && a.kind !== "villager");
}

// ---------------------------------------------------------------------------
// 状态机
// ---------------------------------------------------------------------------
export function CreateGame(chapterIndex = 0) {
  const state = {
    version: GAME_VERSION,
    phase: "chapterCard", // chapterCard | playing | chapterEnd | gameEnd
    chapterIndex,
    beatIndex: 0,
    time: 0,
    cardTimer: 0,
    player: { x: 0, z: 0, heading: 0, crouch: false, carry: null, lamp: false, hidden: false, radius: 0.45 },
    actors: [],
    stealthActive: false,
    detection: { level: 0, spotter: null },
    smoke: null,
    collapses: null,
    rescue: null,
    beat: null,
    microCine: null,
    flags: { route: null, resets: 0, ruined: false, carved: false, notesSeen: [] },
    caption: null,     // {who, say, stage, ...} 当前字幕
    camHint: { kind: "follow" },
    fade: 0,           // 0 正常，1 全黑
    toast: null,       // 短提示 {text, t}
    prompt: null,      // 交互提示文本
    done: false,
  };
  StartChapter(state, chapterIndex);
  return state;
}

export function StartChapter(state, index) {
  const ch = CHAPTERS[index];
  state.chapterIndex = index;
  state.beatIndex = 0;
  state.phase = "chapterCard";
  state.cardTimer = 0;
  state.actors = [];
  state.stealthActive = false;
  state.detection = { level: 0, spotter: null };
  state.smoke = null;
  state.collapses = null;
  state.rescue = null;
  state.microCine = null;
  state.caption = null;
  state.prompt = null;
  state.player.carry = null;
  state.player.lamp = false;
  state.player.crouch = false;
  if (index !== 7) state.flags.ruined = false;

  // 各章初始位置与常驻角色
  if (ch.id === "c1") {
    state.player.x = -27; state.player.z = -16;
    state.actors.push(
      MakeActor("father", "family", -21.5, -18.2, { label: "爹" }),
      MakeActor("mother", "family", -29, -22, { label: "娘" }),
      MakeActor("sister", "sister", 20, 21, { label: "妹妹" }),
    );
  } else if (ch.id === "c2") {
    state.player.x = -27; state.player.z = -18;
    state.actors.push(
      MakeActor("mother", "family", -28, -20, { label: "娘", visible: false }),
      MakeActor("sister", "sister", -26, -19, { label: "妹妹", following: true }),
    );
  } else if (ch.id === "c3") {
    state.player.x = -6; state.player.z = 50;
  } else if (ch.id === "c4" || ch.id === "c5") {
    state.player.x = LAYOUTS.tunnelVillage.nodes.entE.x;
    state.player.z = LAYOUTS.tunnelVillage.nodes.entE.z;
    state.actors.push(MakeActor("gao", "militia", LAYOUTS.tunnelVillage.nodes.juncE.x, LAYOUTS.tunnelVillage.nodes.juncE.z, { label: "高传宝" }));
  } else if (ch.id === "c6") {
    state.player.x = -8; state.player.z = 52;
    state.actors.push(MakeActor("gao", "militia", -9, 53, { label: "高传宝" }));
  } else if (ch.id === "c7") {
    state.player.x = LAYOUTS.tunnelFort.nodes.fieldEnt.x;
    state.player.z = LAYOUTS.tunnelFort.nodes.fieldEnt.z;
  } else if (ch.id === "c8") {
    SetupRuinedVillage(state);
  }
  EnterBeat(state);
}

function CurrentScript(state) { return SCRIPTS[CHAPTERS[state.chapterIndex].id]; }
export function CurrentBeatDef(state) { return CurrentScript(state)[state.beatIndex] || null; }

function EnterBeat(state) {
  const def = CurrentBeatDef(state);
  if (!def) { EndChapter(state); return; }
  state.beat = {
    t: 0, lineIndex: 0, lineT: 0, lineFired: -1,
    itemStates: def.kind === "collect" ? def.items.map((p) => ({ x: p.x, z: p.z, carried: false, delivered: false })) : null,
    visited: new Set(),
    holdProgress: 0,
    spotIndex: 0,
    spotProgress: def.kind === "buildSpots" ? def.spots.map(() => 0) : null,
    spotDone: def.kind === "buildSpots" ? def.spots.map(() => false) : null,
    digIndex: 0,
    quakeT: 0, quakeActive: false,
    noteIndex: 0,
    snapshot: SnapshotPositions(state),
    choiceMade: null,
  };
  if (def.kind === "cinematic") {
    state.caption = null;
    state.beatLines = def.dynamicLines ? def.dynamicLines(state) : def.lines;
  }
  def.onEnter?.(state);
}

function SnapshotPositions(state) {
  return {
    player: { x: state.player.x, z: state.player.z },
    actors: state.actors.map((a) => ({ id: a.id, x: a.x, z: a.z, following: !!a.following })),
  };
}

function RestoreSnapshot(state) {
  const snap = state.beat.snapshot;
  state.player.x = snap.player.x; state.player.z = snap.player.z;
  for (const s of snap.actors) {
    const a = state.actors.find((x) => x.id === s.id);
    if (a) { a.x = s.x; a.z = s.z; a.following = s.following; }
  }
  state.detection.level = 0;
}

function AdvanceBeat(state) {
  const def = CurrentBeatDef(state);
  def?.onDone?.(state);
  state.beatIndex += 1;
  state.caption = null;
  state.prompt = null;
  if (state.beatIndex >= CurrentScript(state).length) EndChapter(state);
  else EnterBeat(state);
}

function EndChapter(state) {
  if (state.chapterIndex >= CHAPTERS.length - 1) {
    state.phase = "gameEnd";
    state.done = true;
  } else {
    state.phase = "chapterEnd";
    state.cardTimer = 0;
  }
}

// 跳过当前字幕行（玩家按 E / 空格）
export function AdvanceCinematic(state) {
  const def = CurrentBeatDef(state);
  if (!def) return;
  if (def.kind === "cinematic") {
    state.beat.lineIndex += 1;
    state.beat.lineT = 0;
    if (state.beat.lineIndex >= state.beatLines.length) AdvanceBeat(state);
  }
}

export function MakeChoice(state, key) {
  const def = CurrentBeatDef(state);
  if (def?.kind !== "choice") return;
  state.flags.route = key;
  state.beat.choiceMade = key;
  AdvanceBeat(state);
}

export function ConfirmChapterCard(state) {
  if (state.phase === "chapterCard") state.phase = "playing";
  else if (state.phase === "chapterEnd") StartChapter(state, state.chapterIndex + 1);
}

// ---------------------------------------------------------------------------
// 主步进
// input: {moveX, moveZ, crouch, interact(边沿), interactHeld, advance(边沿)}
// ---------------------------------------------------------------------------
export function StepGame(state, input, dt) {
  if (state.phase === "gameEnd") return;
  state.time += dt;
  if (state.toast && (state.toast.t -= dt) <= 0) state.toast = null;

  if (state.phase === "chapterCard" || state.phase === "chapterEnd") {
    state.cardTimer += dt;
    if (input.advance && state.cardTimer > 0.8) ConfirmChapterCard(state);
    return;
  }

  const def = CurrentBeatDef(state);
  if (!def) return;
  state.beat.t += dt;
  state.prompt = null;

  if (state.microCine) { StepMicroCine(state, input, dt); StepCineActors(state, dt); return; }
  if (def.kind === "cinematic") { StepCinematic(state, input, dt); return; }
  if (def.kind === "choice") { state.caption = null; return; } // UI 层处理选择

  MovePlayer(state, input, dt);
  StepFollowers(state, dt);
  StepSoldiers(state, dt);
  StepCineActors(state, dt);
  if (state.smoke) StepSmoke(state, dt);

  switch (def.kind) {
    case "goto": StepGoto(state, def, input); break;
    case "gotoSeq": StepGotoSeq(state, def, input); break;
    case "collect": StepCollect(state, def, input); break;
    case "escort": StepEscort(state, def, input); break;
    case "leadFollow": StepLeadFollow(state, def, dt); break;
    case "lead": StepLead(state, def, input); break;
    case "observe": StepObserve(state, def, dt); break;
    case "hold": StepHold(state, def, input, dt); break;
    case "buildSpots": StepBuildSpots(state, def, input, dt); break;
    case "digSeq": StepDigSeq(state, def, input, dt); break;
    case "smokeEscape": StepSmokeEscape(state, def, input); break;
    case "rescueLoop": StepRescueLoop(state, def, input, dt); break;
    default: break;
  }

  if (state.stealthActive && !def.noDetect) StepDetection(state, def, dt);
}

// 过场里的走位：让画面里的人做字幕说的事
function StepCineActors(state, dt) {
  const env = CHAPTERS[state.chapterIndex].env;
  const tunnelLayout = (env === "tunnelVillage" || env === "tunnelFort") ? LAYOUTS[env] : null;
  for (const a of state.actors) {
    if (!a.cineTarget) continue;
    const d = Dist(a.x, a.z, a.cineTarget.x, a.cineTarget.z);
    if (d < 0.35) {
      if (a.cineVanish) a.visible = false;
      a.cineTarget = null;
      continue;
    }
    const speed = a.cineSpeed || 1.6;
    const step = Math.min(speed * dt, d);
    a.heading = Math.atan2(a.cineTarget.x - a.x, a.cineTarget.z - a.z);
    a.x += ((a.cineTarget.x - a.x) / d) * step;
    a.z += ((a.cineTarget.z - a.z) / d) * step;
    if (tunnelLayout) {
      // 地道里的走位贴着走廊滑，不穿白盒墙
      const c = ConstrainToTunnel(tunnelLayout, a.x, a.z);
      a.x = c.x; a.z = c.z;
      if (a.cineVanish && Dist(a.x, a.z, a.cineTarget.x, a.cineTarget.z) < 2.4) {
        a.visible = false;
        a.cineTarget = null;
      }
    }
  }
}

// 玩法中插入的微过场（如第七章旁洞的老人对话）
export function StartMicroCine(state, lines) {
  state.microCine = { lines, i: 0, t: 0 };
}

function StepMicroCine(state, input, dt) {
  const mc = state.microCine;
  const line = mc.lines[mc.i];
  if (!line) { state.microCine = null; state.caption = null; return; }
  state.caption = line;
  state.camHint = line.cam || { kind: "close" };
  mc.t += dt;
  if (input.advance || mc.t >= line.d) {
    mc.i += 1;
    mc.t = 0;
    if (mc.i >= mc.lines.length) { state.microCine = null; state.caption = null; }
  }
}

function StepCinematic(state, input, dt) {
  const lines = state.beatLines;
  const line = lines[state.beat.lineIndex];
  if (!line) { AdvanceBeat(state); return; }
  if (state.beat.lineFired !== state.beat.lineIndex) {
    state.beat.lineFired = state.beat.lineIndex;
    line.on?.(state);
  }
  state.caption = line;
  state.camHint = line.cam || { kind: "follow" };
  StepCineActors(state, dt);
  state.beat.lineT += dt;
  if (input.advance || state.beat.lineT >= line.d) {
    state.beat.lineIndex += 1;
    state.beat.lineT = 0;
    if (state.beat.lineIndex >= lines.length) AdvanceBeat(state);
  }
}

function MovePlayer(state, input, dt) {
  const def = CurrentBeatDef(state);
  const layout = LAYOUTS[CHAPTERS[state.chapterIndex].env];
  const p = state.player;
  p.crouch = !!input.crouch;
  let speed = p.crouch ? 2.1 : 4.2;
  if (def.slow) speed = 1.8;
  if (p.carry) speed = 3.0;
  const len = Math.hypot(input.moveX, input.moveZ);
  if (len > 0.01) {
    const nx = input.moveX / Math.max(1, len), nz = input.moveZ / Math.max(1, len);
    p.x += nx * speed * dt;
    p.z += nz * speed * dt;
    p.heading = Math.atan2(nx, nz);
  }
  const env = CHAPTERS[state.chapterIndex].env;
  if (env === "tunnelVillage" || env === "tunnelFort") {
    // 塌方未清开前视作墙
    if (state.collapses) {
      for (const key of Object.keys(state.collapses)) {
        const c = state.collapses[key];
        if (c.cleared) continue;
        const node = LAYOUTS.tunnelFort.nodes[key];
        const d = Dist(p.x, p.z, node.x, node.z);
        const block = 1.1;
        if (d < block) {
          const dx = p.x - node.x, dz = p.z - node.z;
          const l = Math.hypot(dx, dz) || 1;
          p.x = node.x + (dx / l) * block;
          p.z = node.z + (dz / l) * block;
        }
      }
    }
    const c = ConstrainToTunnel(layout, p.x, p.z);
    p.x = c.x; p.z = c.z;
  } else {
    let col = CollideBuildings(layout, p.x, p.z, p.radius);
    col = CollideWalls(layout, col.x, col.z, p.radius);
    p.x = col.x; p.z = col.z;
    const b = layout.bounds;
    p.x = Math.max(b.minX, Math.min(b.maxX, p.x));
    p.z = Math.max(b.minZ, Math.min(b.maxZ, p.z));
  }
  // 躲藏判定：蹲在草垛边
  p.hidden = false;
  if (p.crouch && layout.haystacks) {
    for (const h of layout.haystacks) {
      if (Dist(p.x, p.z, h.x, h.z) < h.r + 1.1) { p.hidden = true; break; }
    }
  }
}

function StepFollowers(state, dt) {
  const env = CHAPTERS[state.chapterIndex].env;
  const layout = LAYOUTS[env];
  for (const a of state.actors) {
    if (!a.following || !a.visible) continue;
    const targetDist = 1.3;
    const d = Dist(a.x, a.z, state.player.x, state.player.z);
    if (d > targetDist) {
      const speed = Math.min((a.slow ? 2.6 : 3.8), (d - targetDist) * 3);
      const dx = (state.player.x - a.x) / d, dz = (state.player.z - a.z) / d;
      a.x += dx * speed * dt;
      a.z += dz * speed * dt;
      a.heading = Math.atan2(dx, dz);
    }
    if (env === "tunnelVillage" || env === "tunnelFort") {
      const c = ConstrainToTunnel(layout, a.x, a.z);
      a.x = c.x; a.z = c.z;
    }
  }
}

function IsEnemy(a) { return a.kind === "soldier" || a.kind === "puppet"; }

function StepSoldiers(state, dt) {
  for (const a of state.actors) {
    if (!IsEnemy(a) || !a.visible || !a.patrol || a.cineTarget) continue;
    const wp = a.patrol[a.patrolIndex % a.patrol.length];
    const d = Dist(a.x, a.z, wp.x, wp.z);
    if (d < 0.4) { a.patrolIndex = (a.patrolIndex + 1) % a.patrol.length; continue; }
    const dx = (wp.x - a.x) / d, dz = (wp.z - a.z) / d;
    a.x += dx * a.speed * dt;
    a.z += dz * a.speed * dt;
    a.heading = Math.atan2(dx, dz);
  }
}

const VISION_RANGE = 13;
const VISION_HALF_ANGLE = (70 * Math.PI / 180) / 2;

export function SoldierSeesPlayer(layout, soldier, player) {
  if (player.hidden) return false;
  const d = Dist(soldier.x, soldier.z, player.x, player.z);
  if (d > VISION_RANGE) return false;
  if (d < 1.6) return true;
  const angTo = Math.atan2(player.x - soldier.x, player.z - soldier.z);
  let diff = angTo - soldier.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const effHalf = player.crouch ? VISION_HALF_ANGLE * 0.75 : VISION_HALF_ANGLE;
  const effRange = player.crouch ? VISION_RANGE * 0.7 : VISION_RANGE;
  if (Math.abs(diff) > effHalf || d > effRange) return false;
  return !LineBlocked(layout, soldier.x, soldier.z, player.x, player.z);
}

function StepDetection(state, def, dt) {
  const layout = LAYOUTS[CHAPTERS[state.chapterIndex].env];
  let seen = false;
  for (const a of state.actors) {
    if (!IsEnemy(a) || !a.visible) continue;
    if (SoldierSeesPlayer(layout, a, state.player)) { seen = true; state.detection.spotter = a.id; break; }
  }
  if (seen) state.detection.level = Math.min(1, state.detection.level + dt * 0.9);
  else state.detection.level = Math.max(0, state.detection.level - dt * 0.5);
  if (state.detection.level >= 1) {
    state.flags.resets += 1;
    RestoreSnapshot(state);
    state.toast = { text: def.resetHint || "被发现了。退回来，重新等机会。", t: 4 };
  }
}

function ZoneReached(state, zone) { return InZone(state.player.x, state.player.z, zone); }

function StepGoto(state, def, input) {
  if (def.interruptAt) {
    // 第三章摸近南门：走到八成路程即触发被民兵按倒的剧情
    const start = state.beat.snapshot.player;
    const total = Dist(start.x, start.z, def.zone.x, def.zone.z);
    const left = Dist(state.player.x, state.player.z, def.zone.x, def.zone.z);
    if (total > 0 && left / total <= 1 - def.interruptAt) { AdvanceBeat(state); return; }
  }
  if (ZoneReached(state, def.zone)) AdvanceBeat(state);
}

function StepGotoSeq(state, def, input) {
  const i = state.beat.spotIndex;
  const spot = def.spots[i];
  if (!spot) { AdvanceBeat(state); return; }
  if (ZoneReached(state, spot)) {
    if (def.notes?.[i]) state.toast = { text: def.notes[i], t: 5 };
    state.beat.spotIndex += 1;
    if (state.beat.spotIndex >= def.spots.length) AdvanceBeat(state);
  }
}

function StepCollect(state, def, input) {
  const p = state.player;
  const items = state.beat.itemStates;
  if (p.carry === null) {
    for (const it of items) {
      if (it.carried || it.delivered) continue;
      if (Dist(p.x, p.z, it.x, it.z) < 1.6) {
        state.prompt = `E · 扛起${def.carryLabel}`;
        if (input.interact) { it.carried = true; p.carry = def.carryLabel; }
        break;
      }
    }
  } else if (ZoneReached(state, def.deliver)) {
    state.prompt = `E · 放下${def.carryLabel}`;
    if (input.interact) {
      const it = items.find((x) => x.carried && !x.delivered);
      if (it) { it.delivered = true; it.carried = false; }
      p.carry = null;
    }
  }
  if (items.every((x) => x.delivered)) AdvanceBeat(state);
}

function StepEscort(state, def, input) {
  if (def.midToast && !state.beat.visited.has("midToast") && InZone(state.player.x, state.player.z, def.midToast.zone)) {
    state.beat.visited.add("midToast");
    state.toast = { text: def.midToast.text, t: 5 };
  }
  const f = state.actors.find((a) => a.id === def.follower);
  if (f && !f.following && f.visible) {
    if (Dist(state.player.x, state.player.z, f.x, f.z) < 2.2) {
      state.prompt = "E · 拉住她的手";
      if (input.interact) f.following = true;
    }
  }
  if (f?.following && ZoneReached(state, def.zone || def.dest)) {
    const near = Dist(f.x, f.z, state.player.x, state.player.z) < 4;
    if (near) AdvanceBeat(state);
  }
}

function StepLeadFollow(state, def, dt) {
  // 跟随引路人（娘）：她逐个走向路点，玩家离得近才前进
  const leader = state.actors.find((a) => a.id === def.leader);
  if (!leader) { AdvanceBeat(state); return; }
  const wps = def.waypoints;
  if (state.beat.spotIndex >= wps.length) { AdvanceBeat(state); return; }
  const wp = wps[state.beat.spotIndex];
  const near = Dist(leader.x, leader.z, state.player.x, state.player.z) < 6;
  if (near) {
    const d = Dist(leader.x, leader.z, wp.x, wp.z);
    if (d < 1.2) {
      state.beat.spotIndex += 1;
      if (state.beat.spotIndex >= wps.length) { AdvanceBeat(state); return; }
    } else {
      const speed = 2.4;
      leader.x += ((wp.x - leader.x) / d) * speed * dt;
      leader.z += ((wp.z - leader.z) / d) * speed * dt;
      leader.heading = Math.atan2(wp.x - leader.x, wp.z - leader.z);
    }
  }
}

function StepLead(state, def, input) {
  const group = state.actors.filter((a) => a.group === def.group && a.visible);
  const anyLoose = group.some((a) => !a.following && !a.evacuated);
  if (anyLoose) {
    const near = group.find((a) => !a.following && Dist(a.x, a.z, state.player.x, state.player.z) < 2.4);
    if (near) {
      state.prompt = "E · 招呼他们跟上";
      if (input.interact) for (const a of group) a.following = true;
    }
  }
  if (group.length && group.every((a) => a.following)) {
    const allNear = group.every((a) => InZone(a.x, a.z, def.dest));
    if (ZoneReached(state, def.dest) && allNear) {
      for (const a of group) { a.following = false; a.settled = true; }
      AdvanceBeat(state);
    }
  }
}

function StepObserve(state, def, dt) {
  const i = state.beat.spotIndex;
  const spot = def.spots[i];
  if (!spot) { AdvanceBeat(state); return; }
  if (ZoneReached(state, spot) && state.player.crouch) {
    state.beat.holdProgress += dt;
    state.prompt = `观察中… ${Math.min(100, Math.round(state.beat.holdProgress / def.watchTime * 100))}%`;
    if (state.beat.holdProgress >= def.watchTime) {
      if (def.notes?.[i]) { state.toast = { text: "柱子记下：" + def.notes[i], t: 5.5 }; state.flags.notesSeen.push(def.notes[i]); }
      state.beat.holdProgress = 0;
      state.beat.spotIndex += 1;
      if (state.beat.spotIndex >= def.spots.length) AdvanceBeat(state);
    }
  } else if (ZoneReached(state, spot)) {
    state.prompt = "C · 蹲下才能安心观察";
  } else {
    state.beat.holdProgress = 0;
  }
}

function StepHold(state, def, input, dt) {
  if (ZoneReached(state, def.zone)) {
    state.prompt = state.beat.holdProgress > 0
      ? `${def.objective}… ${Math.round(state.beat.holdProgress / def.holdTime * 100)}%`
      : (def.hint || "按住 E");
    if (input.interactHeld) {
      state.beat.holdProgress += dt;
      if (state.beat.holdProgress >= def.holdTime) {
        if (def.note) state.toast = { text: def.note, t: 4.5 };
        AdvanceBeat(state);
      }
    } else if (state.beat.holdProgress > 0) {
      state.beat.holdProgress = Math.max(0, state.beat.holdProgress - dt * 2);
    }
  }
}

function StepBuildSpots(state, def, input, dt) {
  for (let i = 0; i < def.spots.length; i += 1) {
    const s = def.spots[i];
    if (state.beat.spotDone[i]) continue;
    if (ZoneReached(state, s.zone)) {
      state.prompt = `按住 E · ${s.label} ${Math.round(state.beat.spotProgress[i] / s.holdTime * 100)}%`;
      if (input.interactHeld) {
        state.beat.spotProgress[i] += dt;
        if (state.beat.spotProgress[i] >= s.holdTime) {
          state.beat.spotDone[i] = true;
          state.toast = { text: s.note, t: 4.5 };
        }
      }
      break;
    }
  }
  if (state.beat.spotDone.every(Boolean)) AdvanceBeat(state);
}

function StepDigSeq(state, def, input, dt) {
  // 探杆声：周期性“头顶有动静”，挖掘会被打断（地面佯动扯走了注意力时，间隔更长）
  state.beat.quakeT += dt;
  const cycle = def.quakeInterval + (state.flags.route === "ground" ? 4 : 0);
  state.beat.quakeActive = (state.beat.quakeT % cycle) > cycle - 2.5;

  const keys = ["collapse1", "collapse2"];
  const key = keys[state.beat.digIndex];
  if (!key) { AdvanceBeat(state); return; }
  const c = state.collapses[key];
  const zone = TF[key];
  if (ZoneReached(state, zone)) {
    if (state.beat.quakeActive) {
      state.prompt = "！头顶有动静——停下，别出声";
      c.progress = Math.max(0, c.progress - dt * 0.3);
    } else {
      state.prompt = `按住 E · 清土 ${Math.round(c.progress / def.holdTime * 100)}%`;
      if (input.interactHeld) {
        c.progress += dt;
        if (c.progress >= def.holdTime) {
          c.cleared = true;
          state.toast = { text: "土清开了。前面的路通了。", t: 3 };
          state.beat.digIndex += 1;
          if (state.beat.digIndex >= keys.length) AdvanceBeat(state);
        }
      }
    }
  }
}

function StepSmoke(state, dt) {
  state.smoke.t += dt;
  for (const s of state.smoke.schedule) {
    if (state.smoke.t >= s.at) state.smoke.filled.add(s.node);
  }
}

export function NodeSmoked(state, nodeKey) { return !!state.smoke?.filled.has(nodeKey); }

function StepSmokeEscape(state, def, input) {
  const layout = LAYOUTS.tunnelVillage;
  const dest = def.dest || TV.entW;

  // 第四章的注定失去：拴柱大爷在半路腿软，顺子回身去背他——两人都没能出来
  if (def.lossScript) {
    const elder1 = state.actors.find((a) => a.id === "elder1");
    const shunzi = state.actors.find((a) => a.id === "shunzi");
    if (!state.beat.lossStage && elder1?.following && elder1.x < -2) {
      state.beat.lossStage = 1;
      state.beat.lossT = state.beat.t;
      elder1.following = false;
      elder1.scripted = true;
      elder1.cineTarget = { x: layout.nodes.chamberA.x, z: layout.nodes.chamberA.z };
      elder1.cineSpeed = 1.0;
      if (shunzi) {
        shunzi.visible = true;
        shunzi.scripted = true;
        shunzi.x = layout.nodes.juncMid.x;
        shunzi.z = layout.nodes.juncMid.z;
        shunzi.cineTarget = { x: layout.nodes.chamberA.x, z: layout.nodes.chamberA.z };
        shunzi.cineSpeed = 3.2;
      }
      state.toast = { text: "拴柱大爷腿一软，坐在了道口。顺子从后面追了上去：『你们先走！』", t: 5 };
    }
    if (state.beat.lossStage === 1) {
      // 两人退回甲洞方向；走到甲洞附近、或烟先追上他们时才隐去——不在镜头前凭空消失
      const nA = layout.nodes.chamberA;
      const bothBack = [elder1, shunzi].every((a) => !a || !a.visible
        || Dist(a.x, a.z, nA.x, nA.z) < 3.2
        || [...state.smoke.filled].some((key) => Dist(a.x, a.z, layout.nodes[key].x, layout.nodes[key].z) < layout.nodes[key].r + 1.2));
      if (bothBack || state.beat.t - state.beat.lossT > 16) {
        state.beat.lossStage = 2;
        if (elder1) { elder1.visible = false; elder1.cineTarget = null; }
        if (shunzi) { shunzi.visible = false; shunzi.cineTarget = null; }
      }
    }
  }

  const villagers = state.actors.filter((a) => a.kind === "villager" && a.visible && !a.evacuated && !a.scripted);
  // E 招呼附近的人跟上
  const loose = villagers.find((a) => !a.following && Dist(a.x, a.z, state.player.x, state.player.z) < 2.6);
  if (loose) {
    state.prompt = "E · 招呼他们跟上";
    if (input.interact) {
      for (const a of villagers) {
        if (!a.following && Dist(a.x, a.z, state.player.x, state.player.z) < 3.2) a.following = true;
      }
    }
  }
  // 到出口的人自动撤出
  for (const a of villagers) {
    if (InZone(a.x, a.z, dest)) { a.evacuated = true; a.following = false; a.visible = false; }
  }
  // 烟追上未撤离的人 → 重置（脚本化失去的两人不参与判定）
  for (const a of villagers) {
    for (const key of state.smoke.filled) {
      const n = layout.nodes[key];
      if (Dist(a.x, a.z, n.x, n.z) < n.r + 1.0) {
        state.flags.resets += 1;
        state.smoke.t = 0; state.smoke.filled.clear();
        RestoreSnapshot(state);
        state.beat.lossStage = 0;
        for (const v of state.actors.filter((x) => x.kind === "villager")) {
          v.following = false; v.evacuated = false; v.scripted = false; v.cineTarget = null;
          v.visible = v.id !== "shunzi" || !def.lossScript;
        }
        state.toast = { text: def.resetHint, t: 4 };
        return;
      }
    }
  }
  const remaining = state.actors.filter((a) => a.kind === "villager" && !a.scripted
    && !(def.lossScript && a.id === "shunzi") && !a.evacuated);
  if (remaining.length === 0) AdvanceBeat(state);
}

function StepRescueLoop(state, def, input, dt) {
  const trapped = state.actors.filter((a) => a.pocket && a.visible && !a.evacuated);

  // 探杆：地面在头顶戳探。先有落土预兆，随后必须站住——动了，乡亲们会吓得缩回旁洞
  const cycle = state.flags.route === "ground" ? 7 : 9.5;
  state.rescue.quakeT += dt;
  const phase = state.rescue.quakeT % cycle;
  state.beat.quakeWarn = phase > cycle - 2.9;
  state.beat.quakeActive = phase > cycle - 2.2;
  const graceOver = phase > cycle - 1.8; // 探杆落定后仍在动才受罚
  if (state.beat.quakeWarn && !state.beat.quakeActive) {
    state.prompt = "…头顶的土簌簌往下掉";
  }
  if (state.beat.quakeActive) {
    state.prompt = "！探杆就在头顶——站住，别出声";
    const moving = Math.hypot(input.moveX, input.moveZ) > 0.1;
    if (moving && graceOver) {
      const followers = trapped.filter((a) => a.following);
      if (followers.length) {
        const n = LAYOUTS.tunnelFort.nodes;
        for (const a of followers) {
          a.following = false;
          a.cineTarget = { x: n[a.pocket].x, z: n[a.pocket].z };
          a.cineSpeed = 2.8;
        }
        state.toast = { text: "头顶的探杆停住了。乡亲们吓得缩回了旁洞。", t: 4 };
        state.rescue.quakeT = 0;
      }
    }
  }

  // 旁洞乙的老人对话（按剧本：你妹妹呢——送出去了）
  if (!state.rescue.dialogueShown.has("pocketB")) {
    const nearB = trapped.some((a) => a.pocket === "pocketB" && Dist(a.x, a.z, state.player.x, state.player.z) < 3);
    if (nearB) {
      state.rescue.dialogueShown.add("pocketB");
      StartMicroCine(state, [
        { stage: "扶着民兵的老人抬起头，借着灯光认出了他。", d: 3.2, cam: { kind: "close" } },
        { who: "老人", say: "梁家的柱子？你妹妹呢？", d: 3.0, cam: { kind: "close" } },
        { who: "柱子", say: "送出去了。", d: 2.6, cam: { kind: "close" } },
        { stage: "老人松了一口气。", d: 2.4, cam: { kind: "close" } },
      ]);
      return;
    }
  }
  const loose = trapped.find((a) => !a.following && !a.cineTarget && Dist(a.x, a.z, state.player.x, state.player.z) < 2.6);
  if (loose) {
    if (!state.beat.quakeActive && !state.beat.quakeWarn) state.prompt = "E · 带他们走";
    if (input.interact) {
      for (const a of trapped) {
        if (!a.following && Dist(a.x, a.z, state.player.x, state.player.z) < 3.2) { a.following = true; a.cineTarget = null; }
      }
    }
  }
  for (const a of trapped) {
    if (a.following && InZone(a.x, a.z, TF.fieldEnt)) {
      a.evacuated = true; a.following = false; a.visible = false;
      state.rescue.delivered.add(a.id);
    }
  }
  const left = state.actors.filter((a) => a.pocket && !a.evacuated);
  if (left.length === 0) AdvanceBeat(state);
}

// ---------------------------------------------------------------------------
// HUD / 测试辅助
// ---------------------------------------------------------------------------
export function GetObjective(state) {
  if (state.phase !== "playing") return null;
  return CurrentBeatDef(state)?.objective || null;
}

export function GetHint(state) {
  if (state.phase !== "playing") return null;
  return CurrentBeatDef(state)?.hint || null;
}

// 自动通关辅助：给出当前该去的位置与该做的动作
export function GetBeatTarget(state) {
  const def = CurrentBeatDef(state);
  if (!def) return null;
  const p = state.player;
  switch (def.kind) {
    case "cinematic": return { action: "advance" };
    case "choice": return { action: "choice" };
    case "goto": return { action: "walk", x: def.zone.x, z: def.zone.z };
    case "gotoSeq": {
      const s = def.spots[state.beat.spotIndex];
      return s ? { action: "walk", x: s.x, z: s.z } : null;
    }
    case "collect": {
      if (p.carry) return { action: "interactAt", x: def.deliver.x, z: def.deliver.z };
      const it = state.beat.itemStates.find((x) => !x.carried && !x.delivered);
      return it ? { action: "interactAt", x: it.x, z: it.z } : { action: "interactAt", x: def.deliver.x, z: def.deliver.z };
    }
    case "escort": {
      const f = state.actors.find((a) => a.id === def.follower);
      if (f && !f.following && f.visible) return { action: "interactAt", x: f.x, z: f.z };
      const dest = def.zone || def.dest;
      return { action: "walk", x: dest.x, z: dest.z };
    }
    case "leadFollow": {
      const leader = state.actors.find((a) => a.id === def.leader);
      return leader ? { action: "walk", x: leader.x, z: leader.z } : null;
    }
    case "lead": {
      const group = state.actors.filter((a) => a.group === def.group && a.visible);
      const looseA = group.find((a) => !a.following);
      if (looseA) return { action: "interactAt", x: looseA.x, z: looseA.z };
      return { action: "walk", x: def.dest.x, z: def.dest.z };
    }
    case "observe": {
      const s = def.spots[state.beat.spotIndex];
      return s ? { action: "crouchAt", x: s.x, z: s.z } : null;
    }
    case "hold": return { action: "holdAt", x: def.zone.x, z: def.zone.z };
    case "buildSpots": {
      const i = state.beat.spotDone.findIndex((d) => !d);
      if (i < 0) return null;
      return { action: "holdAt", x: def.spots[i].zone.x, z: def.spots[i].zone.z };
    }
    case "digSeq": {
      const keys = ["collapse1", "collapse2"];
      const key = keys[state.beat.digIndex];
      if (!key) return null;
      return { action: "holdAt", x: TF[key].x, z: TF[key].z, pauseOnQuake: true };
    }
    case "smokeEscape": {
      const dest = def.dest || TV.entW;
      const pool = state.actors.filter((a) => a.kind === "villager" && a.visible && !a.evacuated && !a.scripted
        && !(def.lossScript && a.id === "shunzi"));
      const loose = pool.find((a) => !a.following);
      if (loose) return { action: "interactAt", x: loose.x, z: loose.z };
      if (pool.some((a) => a.following)) return { action: "walk", x: dest.x, z: dest.z };
      return null;
    }
    case "rescueLoop": {
      const loose = state.actors.find((a) => a.pocket && a.visible && !a.evacuated && !a.following);
      const anyFollowing = state.actors.some((a) => a.pocket && a.visible && !a.evacuated && a.following);
      if (anyFollowing) return { action: "walk", x: TF.fieldEnt.x, z: TF.fieldEnt.z };
      if (loose) return { action: "interactAt", x: loose.x, z: loose.z };
      return null;
    }
    default: return null;
  }
}
