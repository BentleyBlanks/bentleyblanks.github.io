export const CFG = Object.freeze({
  mapW: 18,
  mapH: 14,
  hexSize: 38,
  turnsPerMonth: 2,
  totalTurns: 112,
  startYear: 1941,
  villageCount: 14,
  villageGap: 2,
  baseLinkRange: 3,
  relayLinkRange: 5,
  suppressRange: 2,
  joinSupport: 70,
  suppressSupportCap: 58,
  baseWorkSupport: 6,
  grainCap: 360,
  manCap: 120,
  armsCap: 180,
  orgCap: 240,
  exposureDecay: 1.1,
  operationInterval: 9,
  operationTelegraph: 3,
  operationTTL: 10,
  bigSweepWarnTurn: 30,
  bigSweepTurn: 33,
  bigSweepMultiplier: 1.45,
  pillageGrain: 16,
  pillageSupport: 10,
  railRepairTurns: 9,
  counterMultiplier: .62,
  saveVersion: 1,
});

export const TERRAIN = Object.freeze({
  plain: { name: "平原", move: 1, defense: 0, yields: [8, 3, 1], color: "#77703d" },
  hills: { name: "丘陵", move: 1, defense: 3, yields: [6, 2, 1], color: "#735538" },
  forest: { name: "林地", move: 1, defense: 4, yields: [5, 2, 1], color: "#3e592b" },
  mountain: { name: "山地", move: 2, defense: 6, yields: [3, 1, 1], color: "#605c54" },
});

export const UNIT_TYPES = Object.freeze({
  scout: { name: "侦察员", glyph: "侦", side: "player", layer: "mil", str: 5, mp: 3, vis: 3, cost: { grain: 10, man: 5 }, upkeep: 0, desc: "揭开战雾并提高附近敌情的可见度。" },
  work: { name: "工作队", glyph: "工", side: "player", layer: "civ", str: 0, mp: 2, vis: 2, cost: { grain: 16, man: 5, org: 8 }, upkeep: 0, desc: "驻村发动群众；完成敌工科后可以策反伪军。" },
  militia: { name: "民兵队", glyph: "民", side: "player", layer: "mil", str: 9, mp: 2, vis: 2, cost: { grain: 16, man: 10, arms: 5 }, upkeep: 1, desc: "守村、设伏与初期破袭的主力。" },
  regular: { name: "主力连", glyph: "连", side: "player", layer: "mil", str: 17, mp: 2, vis: 2, cost: { grain: 28, man: 20, arms: 16 }, upkeep: 3, tech: "regular", desc: "正面作战与拔除炮楼的中坚。" },
  commando: { name: "武工队", glyph: "武", side: "player", layer: "mil", str: 12, mp: 3, vis: 2, cost: { grain: 22, man: 10, arms: 10, org: 8 }, upkeep: 1, tech: "sabotage", hidden: true, desc: "渗透、破袭、策反与切断敌军交通。" },
  puppet: { name: "伪军小队", glyph: "伪", side: "enemy", layer: "mil", str: 8, mp: 2, vis: 2, cost: {}, upkeep: 0 },
  squad: { name: "日军小队", glyph: "日", side: "enemy", layer: "mil", str: 14, mp: 2, vis: 2, cost: {}, upkeep: 0 },
  company: { name: "日军中队", glyph: "中", side: "enemy", layer: "mil", str: 22, mp: 2, vis: 2, cost: {}, upkeep: 0 },
});

export const BUILDINGS = Object.freeze({
  farm: { name: "合作农场", cost: { grain: 30, org: 4 }, months: 3, yields: [4, 0, 0, 0], desc: "+4粮/月；适合粮乡和平原村。" },
  school: { name: "冬学夜校", cost: { grain: 26, org: 6 }, months: 3, yields: [0, 0, 2, 0], desc: "+2组织/月；加快整训与政策切换。" },
  relay: { name: "地下交通站", cost: { grain: 24, org: 12 }, months: 3, yields: [0, 0, 0, 0], tech: "network", desc: "联络距离3→5，并提供敌情。" },
  tunnel: { name: "地道网", cost: { grain: 34, org: 8 }, months: 4, yields: [0, 0, 0, 0], tech: "tunnel", desc: "抵消据点压制，掠夺与民心损失减半。" },
  arsenal: { name: "兵工坊", cost: { grain: 48, org: 12 }, months: 4, yields: [0, 0, 0, 2], tech: "industry", pressure: .5, desc: "+2军火/月，但增加长期敌军压力。" },
  clinic: { name: "卫生所", cost: { grain: 30, org: 8 }, months: 3, yields: [0, 0, 0, 0], desc: "本村补员消耗降低，反扫荡后恢复民心。" },
});

export const TRAITS = Object.freeze({
  grain: { name: "粮乡", desc: "粮食基础产出+2", yields: [2, 0, 0] },
  smith: { name: "铁匠村", desc: "每月额外军火+1", yields: [0, 0, 0], arms: 1 },
  pass: { name: "山口村", desc: "驻军防御+3", yields: [0, 0, 0], defense: 3 },
  recruits: { name: "兵源村", desc: "人力基础产出+1", yields: [0, 1, 0] },
  hidden: { name: "隐蔽村", desc: "并入后暴露较低", yields: [0, 0, 0], joinExposure: -3 },
  teachers: { name: "文化村", desc: "组织基础产出+1", yields: [0, 0, 1] },
  miners: { name: "矿工村", desc: "破袭铁路缴获增加", yields: [0, 0, 0], sabotageBonus: 4 },
});

export const TECHS = Object.freeze({
  grassroots: { tier: 1, name: "减租减息", cost: 38, desc: "工作队发动群众+2，己方村民心恢复加快。" },
  network: { tier: 1, name: "交通情报网", cost: 42, desc: "解锁地下交通站；侦察敌军行动目标。" },
  mines: { tier: 1, name: "群众武装", cost: 42, desc: "民兵在己方村与林地防御+3。" },
  tunnel: { tier: 2, name: "地道战", cost: 76, need: ["grassroots"], desc: "解锁地道网，抵消炮楼压制并减轻扫荡损失。" },
  sabotage: { tier: 2, name: "破袭战", cost: 78, need: ["network"], desc: "解锁武工队；铁路破袭延长并削弱敌军增援。" },
  enemywork: { tier: 2, name: "敌工科", cost: 82, need: ["network"], desc: "工作队与武工队可以策反伪军，逐步获得情报、动摇或瓦解。" },
  industry: { tier: 2, name: "兵工生产", cost: 82, need: ["grassroots"], desc: "解锁兵工坊，稳定生产军火但增加压力。" },
  regular: { tier: 2, name: "正规化整训", cost: 88, need: ["mines"], desc: "解锁主力连，允许残部保留经验补充。" },
  counter: { tier: 3, name: "局部反攻", cost: 150, need: ["sabotage", "regular"], desc: "解锁攻击县城；攻城前仍需切断铁路和外围据点。" },
});

export const POLICIES = Object.freeze({
  hidden: { name: "隐蔽发展", desc: "暴露衰减+1.5；所有村产出-15%。", exposureDecay: 1.5, yieldMult: .85 },
  mobilize: { name: "群众动员", desc: "工作队发动群众+3，人力+20%；粮食产出-10%。", workSupport: 3, manMult: 1.2, grainMult: .9 },
  mainforce: { name: "集中主力", desc: "我军战斗力+2；部队维护+50%，主动攻击额外暴露+2。", combat: 2, upkeepMult: 1.5, attackExposure: 2 },
  scorched: { name: "坚壁清野", desc: "敌军掠夺与民心损失-60%；所有产出-25%。", pillageMult: .4, yieldMult: .75 },
  united: { name: "统一战线", desc: "策反进度+20，伪军战力-2；组织产出-15%。", defection: 20, puppetPenalty: 2, orgMult: .85 },
});

export const OPERATIONS = Object.freeze({
  cage: { name: "囚笼筑垒", icon: "◆", desc: "日军试图在交通枢纽附近修筑新炮楼。", target: "frontier", baseUnits: ["puppet", "squad"] },
  clear: { name: "清乡蚕食", icon: "▦", desc: "日伪军搜掠高民心村庄并切断群众联系。", target: "support", baseUnits: ["puppet", "puppet", "squad"] },
  raid: { name: "捕捉奇袭", icon: "⚡", desc: "小股精锐直扑总部、兵工坊与交通站。", target: "asset", baseUnits: ["squad", "company"] },
  guardrail: { name: "重点护路", icon: "▥", desc: "敌军增援铁路沿线，快速修复断轨。", target: "rail", baseUnits: ["puppet", "squad", "squad"] },
  sweep: { name: "铁壁合围", icon: "✹", desc: "多路纵队合围根据地，封锁交通并摧毁村庄。", target: "network", baseUnits: ["squad", "squad", "company"] },
});

export const CHAPTERS = Object.freeze([
  {
    id: "aftermath", start: 1, deadline: 12, title: "序章 · 百团余波",
    story: "正太路上的铁轨刚被掀翻，报复性扫荡已经逼近。先把散落的村庄重新联结起来。",
    goals: [
      { kind: "connected", target: 2, text: "保持2座村庄交通畅通" },
      { kind: "railSeen", target: 6, text: "侦明6段铁路" },
    ], reward: { org: 18, grain: 20 },
  },
  {
    id: "cage", start: 13, deadline: 32, title: "第一章 · 囚笼收紧",
    story: "铁路为柱、炮楼为锁。建立交通站，拔掉压在群众头上的第一颗钉子。",
    goals: [
      { kind: "owned", target: 4, text: "根据地发展到4座村庄" },
      { kind: "relay", target: 1, text: "建成1座地下交通站" },
      { kind: "destroyed", target: 1, text: "摧毁1处敌军据点或工地" },
    ], reward: { org: 24, arms: 10 },
  },
  {
    id: "may", start: 33, deadline: 52, title: "第二章 · 五月反扫荡",
    story: "铁壁合围已经展开。胜利不只看歼敌，更看能否保存群众、交通与有生力量。",
    goals: [
      { kind: "bigSweep", target: 1, text: "熬过五月太行反扫荡" },
      { kind: "connected", target: 3, text: "反扫荡后仍有3村交通畅通" },
    ], reward: { org: 28, man: 16 },
  },
  {
    id: "recover", start: 53, deadline: 78, title: "第三章 · 恢复与反蚕食",
    story: "主力化整为零，武工队深入敌后。恢复失地，并从敌人内部撬开裂缝。",
    goals: [
      { kind: "connected", target: 6, text: "恢复6座交通畅通的村庄" },
      { kind: "disrupt", target: 3, text: "累计3次破袭或策反成果" },
    ], reward: { org: 34, arms: 16 },
  },
  {
    id: "counter", start: 79, deadline: 112, title: "第四章 · 局部反攻",
    story: "日军开始收缩。是切断铁路、孤立县城，还是把完整的根据地保存到最后，由你决定。",
    goals: [
      { kind: "counter", target: 1, text: "完成【局部反攻】整训" },
      { kind: "victory", target: 1, text: "解放县城，或以7座畅通村庄坚持到胜利" },
    ], reward: {},
  },
]);

const VILLAGE_NAMES = ["王家峪", "麻田镇", "李家庄", "赵家坳", "石门村", "柳树沟", "黑石崖", "桃花寨", "南坡村", "北岭村", "青石口", "枣林坪", "白草洼", "苇子峪", "大杨庄", "孙家铺"];

export class RNG {
  constructor(seed = 1) { this.state = (Number(seed) >>> 0) || 1; }
  next() {
    let t = this.state += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    const out = ((t ^ t >>> 14) >>> 0) / 4294967296;
    this.state >>>= 0;
    return out;
  }
  int(min, max) { return min + Math.floor(this.next() * (max - min + 1)); }
  pick(list) { return list[Math.floor(this.next() * list.length)]; }
  shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = this.int(0, i); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
}

export const keyOf = (q, r) => `${q},${r}`;
export const inBounds = (q, r) => q >= 0 && q < CFG.mapW && r >= 0 && r < CFG.mapH;
export function neighbors(q, r) {
  const dirs = (q & 1) ? [[1,0],[1,1],[0,-1],[0,1],[-1,0],[-1,1]] : [[1,-1],[1,0],[0,-1],[0,1],[-1,-1],[-1,0]];
  return dirs.map(([dq, dr]) => [q + dq, r + dr]).filter(([a, b]) => inBounds(a, b));
}
export function hexDistance(q1, r1, q2, r2) {
  const x1 = q1, z1 = r1 - ((q1 - (q1 & 1)) >> 1), y1 = -x1 - z1;
  const x2 = q2, z2 = r2 - ((q2 - (q2 & 1)) >> 1), y2 = -x2 - z2;
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs(z1 - z2));
}
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export function dateLabel(turn) {
  const monthIndex = Math.floor((turn - 1) / CFG.turnsPerMonth);
  const year = CFG.startYear + Math.floor(monthIndex / 12);
  const month = monthIndex % 12 + 1;
  const half = (turn - 1) % 2 === 0 ? "上半月" : "下半月";
  return `${year}年${month}月${half}`;
}
export function eraYear(turn) { return CFG.startYear + Math.floor(Math.floor((turn - 1) / 2) / 12); }
export function chapterIndex(turn) {
  let idx = 0;
  for (let i = 0; i < CHAPTERS.length; i++) if (turn >= CHAPTERS[i].start) idx = i;
  return idx;
}

function eachTile(state, fn) {
  for (let q = 0; q < CFG.mapW; q++) for (let r = 0; r < CFG.mapH; r++) fn(state.tiles[q][r]);
}
export function tileAt(state, q, r) { return inBounds(q, r) ? state.tiles[q][r] : null; }
export function allVillages(state) {
  const out = [];
  eachTile(state, t => { if (t.village) out.push({ q: t.q, r: t.r, tile: t, village: t.village }); });
  return out;
}
export const playerVillages = state => allVillages(state).filter(x => x.village.owner === "player");
export const enemyStructures = state => {
  const out = [];
  eachTile(state, t => { if (t.structure) out.push({ q: t.q, r: t.r, tile: t, structure: t.structure }); });
  return out;
};

function generateMap(rng) {
  const tiles = [];
  for (let q = 0; q < CFG.mapW; q++) {
    tiles[q] = [];
    for (let r = 0; r < CFG.mapH; r++) {
      const x = q + (rng.next() - .5) * 2.2;
      let terrain;
      if (x < 5.5) terrain = rng.pick(["mountain", "mountain", "forest", "forest", "hills", "hills"]);
      else if (x < 11.5) terrain = rng.pick(["hills", "hills", "forest", "forest", "plain", "plain", "mountain"]);
      else terrain = rng.pick(["plain", "plain", "plain", "hills", "forest"]);
      tiles[q][r] = { q, r, terrain, rail: false, railBroken: 0, village: null, structure: null, disc: false, mine: false };
    }
  }

  let railQ = CFG.mapW - 3;
  const railTiles = [];
  for (let r = 0; r < CFG.mapH; r++) {
    if (r > 0 && rng.next() < .28) railQ = clamp(railQ + (rng.next() < .5 ? -1 : 1), CFG.mapW - 5, CFG.mapW - 2);
    const t = tiles[railQ][r];
    t.rail = true; t.terrain = "plain"; railTiles.push([railQ, r]);
  }
  const [townQ, townR] = railTiles[Math.floor(railTiles.length / 2)];
  tiles[townQ][townR].structure = { kind: "town", name: "云阳县城", hp: 280, maxHp: 280, str: 34 };
  let pillId = 1;
  for (let i = 1; i < railTiles.length; i += 3) {
    const [q, r] = railTiles[i];
    if (hexDistance(q, r, townQ, townR) < 2 || tiles[q][r].structure) continue;
    tiles[q][r].structure = { kind: "pillbox", name: `封锁炮楼${pillId++}`, hp: 145, maxHp: 145, str: 20 };
  }
  let midPlaced = 0, guard = 0;
  while (midPlaced < 2 && guard++ < 200) {
    const q = rng.int(9, 12), r = rng.int(1, CFG.mapH - 2), t = tiles[q][r];
    if (!t.rail && !t.structure && t.terrain !== "mountain") {
      t.structure = { kind: "pillbox", name: `蚕食炮楼${pillId++}`, hp: 145, maxHp: 145, str: 20 };
      midPlaced++;
    }
  }

  const zones = [[1, 5, 5], [6, 11, 5], [12, 16, 4]];
  const names = rng.shuffle(VILLAGE_NAMES).slice(0, CFG.villageCount);
  const traitKeys = rng.shuffle(Object.keys(TRAITS));
  const villages = [];
  let nameIndex = 0;
  for (const [minQ, maxQ, count] of zones) {
    let placed = 0, attempts = 0;
    while (placed < count && attempts++ < 1200) {
      const q = rng.int(minQ, maxQ), r = rng.int(1, CFG.mapH - 2), t = tiles[q][r];
      if (t.rail || t.structure || t.village || t.terrain === "mountain") continue;
      if (villages.some(v => hexDistance(q, r, v.q, v.r) < CFG.villageGap)) continue;
      const id = `v${nameIndex + 1}`;
      t.village = {
        id, name: names[nameIndex], owner: "neutral", support: rng.int(18, 38), trait: traitKeys[nameIndex % traitKeys.length],
        buildings: [], build: null, hq: false, connected: false, scarred: 0,
      };
      villages.push({ q, r, id }); nameIndex++; placed++;
    }
  }
  if (!villages.length) throw new Error("地图未能生成村庄");
  let hq = villages[0];
  for (const v of villages) if (v.q < hq.q || (v.q === hq.q && Math.abs(v.r - CFG.mapH / 2) < Math.abs(hq.r - CFG.mapH / 2))) hq = v;
  const hv = tiles[hq.q][hq.r].village;
  hv.owner = "player"; hv.support = 86; hv.hq = true; hv.name += "（总部）";
  return { tiles, hq: { q: hq.q, r: hq.r, villageId: hq.id }, town: { q: townQ, r: townR } };
}

function revealArea(state, q, r, radius) {
  eachTile(state, t => { if (hexDistance(q, r, t.q, t.r) <= radius) t.disc = true; });
}
export function visibleKeys(state) {
  const out = new Set();
  const add = (q, r, radius) => eachTile(state, t => { if (hexDistance(q, r, t.q, t.r) <= radius) out.add(keyOf(t.q, t.r)); });
  for (const u of state.units) if (u.side === "player") add(u.q, u.r, UNIT_TYPES[u.type].vis);
  for (const x of playerVillages(state)) add(x.q, x.r, x.village.buildings.includes("relay") ? 2 : 1);
  return out;
}

export function unitAt(state, q, r, side = null, layer = null) {
  return state.units.find(u => u.q === q && u.r === r && (!side || u.side === side) && (!layer || u.layer === layer));
}
export function getUnit(state, id) { return state.units.find(u => u.id === id) || null; }
function tilePassable(state, unit, q, r, destination = false) {
  const t = tileAt(state, q, r); if (!t) return false;
  if (t.structure && !destination) return false;
  const foe = unitAt(state, q, r, unit.side === "player" ? "enemy" : "player", "mil");
  if (foe && !destination) return false;
  const friendly = unitAt(state, q, r, unit.side, unit.layer);
  return !friendly || friendly.id === unit.id;
}
function spawnUnit(state, type, q, r, extra = {}) {
  const ut = UNIT_TYPES[type], layer = ut.layer, side = ut.side;
  let spot = null;
  const queue = [[q, r, 0]], seen = new Set([keyOf(q, r)]);
  while (queue.length) {
    const [cq, cr, d] = queue.shift();
    const t = tileAt(state, cq, cr);
    if (t && !t.structure && t.terrain !== "mountain" && !unitAt(state, cq, cr, side, layer) && !unitAt(state, cq, cr, side === "player" ? "enemy" : "player", "mil")) { spot = [cq, cr]; break; }
    if (d >= 3) continue;
    for (const [nq, nr] of neighbors(cq, cr)) if (!seen.has(keyOf(nq, nr))) { seen.add(keyOf(nq, nr)); queue.push([nq, nr, d + 1]); }
  }
  if (!spot) return null;
  const u = {
    id: state.nextUnitId++, type, side, layer, q: spot[0], r: spot[1], hp: 100, mp: ut.mp, acted: false, fortified: false,
    xp: 0, level: 0, defection: 0, wavering: false, name: extra.name || ut.name, ...extra,
  };
  state.units.push(u);
  if (side === "player") revealArea(state, u.q, u.r, ut.vis);
  return u;
}

export function suppressionAt(state, q, r) {
  let level = 0;
  for (const x of enemyStructures(state)) {
    const range = x.structure.kind === "site" ? 1 : CFG.suppressRange;
    if (hexDistance(q, r, x.q, x.r) <= range) level++;
  }
  return level;
}
function villageDisrupted(state, x) {
  const tunnel = x.village.buildings.includes("tunnel");
  const enemyNear = state.units.some(u => u.side === "enemy" && hexDistance(u.q, u.r, x.q, x.r) <= 1);
  const suppressed = suppressionAt(state, x.q, x.r) > 0 && !tunnel;
  return enemyNear || suppressed;
}
export function computeNetwork(state) {
  const villages = playerVillages(state), byId = new Map(villages.map(x => [x.village.id, x]));
  const edges = [];
  for (let i = 0; i < villages.length; i++) for (let j = i + 1; j < villages.length; j++) {
    const a = villages[i], b = villages[j];
    const range = a.village.buildings.includes("relay") || b.village.buildings.includes("relay") ? CFG.relayLinkRange : CFG.baseLinkRange;
    if (hexDistance(a.q, a.r, b.q, b.r) <= range) {
      const active = !villageDisrupted(state, a) && !villageDisrupted(state, b);
      edges.push({ a: a.village.id, b: b.village.id, active });
    }
  }
  const connected = new Set([state.hq.villageId]), queue = [state.hq.villageId];
  while (queue.length) {
    const id = queue.shift();
    for (const e of edges) {
      if (!e.active) continue;
      const next = e.a === id ? e.b : e.b === id ? e.a : null;
      if (next && !connected.has(next)) { connected.add(next); queue.push(next); }
    }
  }
  for (const x of villages) x.village.connected = connected.has(x.village.id);
  state.network = { connectedIds: [...connected], edges, blockedIds: villages.filter(x => villageDisrupted(state, x)).map(x => x.village.id) };
  return state.network;
}

function policyOf(state) { return POLICIES[state.policy] || POLICIES.hidden; }
function traitOf(v) { return TRAITS[v.trait] || TRAITS.grain; }
export function villageYield(state, x) {
  const v = x.village, base = TERRAIN[x.tile.terrain].yields.slice(), tr = traitOf(v);
  for (let i = 0; i < 3; i++) base[i] += tr.yields[i] || 0;
  if (v.hq) { base[0] += 2; base[2] += 2; }
  let arms = tr.arms || 0;
  for (const key of v.buildings) {
    const b = BUILDINGS[key]; if (!b) continue;
    base[0] += b.yields[0] || 0; base[1] += b.yields[1] || 0; base[2] += b.yields[2] || 0; arms += b.yields[3] || 0;
  }
  const supportMult = v.support >= 70 ? 1 : v.support >= 40 ? .75 : .5;
  const linkMult = v.connected ? 1 : .5;
  const p = policyOf(state), global = p.yieldMult ?? 1;
  base[0] *= supportMult * linkMult * global * (p.grainMult ?? 1);
  base[1] *= supportMult * linkMult * global * (p.manMult ?? 1);
  base[2] *= supportMult * linkMult * global * (p.orgMult ?? 1);
  arms *= supportMult * linkMult * global;
  return [Math.round(base[0]), Math.round(base[1]), Math.round(base[2]), Math.round(arms)];
}

function addLog(state, text, kind = "info") {
  state.logs.push({ turn: state.turn, text, kind });
  if (state.logs.length > 100) state.logs.splice(0, state.logs.length - 100);
}
function canAfford(state, cost = {}) {
  return state.grain >= (cost.grain || 0) && state.man >= (cost.man || 0) && state.arms >= (cost.arms || 0) && state.org >= (cost.org || 0);
}
function spend(state, cost = {}) {
  state.grain -= cost.grain || 0; state.man -= cost.man || 0; state.arms -= cost.arms || 0; state.org -= cost.org || 0;
}
function capResources(state) {
  state.grain = clamp(state.grain, 0, CFG.grainCap); state.man = clamp(state.man, 0, CFG.manCap);
  state.arms = clamp(state.arms, 0, CFG.armsCap); state.org = clamp(state.org, 0, CFG.orgCap);
  state.exposure = clamp(state.exposure, 0, 100); state.pressure = clamp(state.pressure, 0, 100);
}

export function unitStrength(state, u, mode = "attack") {
  const ut = UNIT_TYPES[u.type]; let str = ut.str + (u.level || 0);
  if (u.side === "player") {
    str += policyOf(state).combat || 0;
    if (state.techs.mines && u.type === "militia" && (tileAt(state, u.q, u.r).terrain === "forest" || tileAt(state, u.q, u.r).village?.owner === "player")) str += 3;
  } else if (u.type === "puppet") str -= policyOf(state).puppetPenalty || 0;
  if (u.wavering) str -= 3;
  if (mode === "defense") {
    const t = tileAt(state, u.q, u.r); str += TERRAIN[t.terrain].defense;
    if (t.village?.owner === "player") {
      str += traitOf(t.village).defense || 0;
      if (t.village.buildings.includes("tunnel")) str += 6;
    }
    if (u.fortified) str += 4;
  }
  return Math.max(1, str * (.55 + .45 * Math.max(0, u.hp) / 100));
}
function damageRoll(state, attack, defense) {
  const rng = new RNG(state.rngState);
  const dmg = Math.round(23 * Math.exp((attack - defense) / 12) * (.9 + rng.next() * .2));
  state.rngState = rng.state;
  return clamp(dmg, 6, 72);
}
function promote(u, amount) {
  u.xp += amount;
  const level = u.xp >= 15 ? 2 : u.xp >= 6 ? 1 : 0;
  if (level > u.level) u.level = level;
}
function removeUnit(state, u) { state.units = state.units.filter(x => x.id !== u.id); }
function killUnit(state, u, killerSide) {
  removeUnit(state, u);
  if (u.side === "enemy" && killerSide === "player") {
    state.arms += Math.max(2, Math.round(UNIT_TYPES[u.type].str * .4)); state.stats.kills++;
    if (u.opId && state.operation?.id === u.opId) state.operation.killedStrength += UNIT_TYPES[u.type].str;
    addLog(state, `歼灭${UNIT_TYPES[u.type].name}，缴获一批军火。`, "good");
  } else if (u.side === "player") { state.stats.playerLosses++; addLog(state, `${u.name}全员牺牲。`, "bad"); }
  capResources(state);
}

export function shortestPath(state, unit, tq, tr, maxCost = Infinity) {
  const start = keyOf(unit.q, unit.r), target = keyOf(tq, tr), dist = new Map([[start, 0]]), prev = new Map(), open = [[0, unit.q, unit.r]];
  while (open.length) {
    open.sort((a, b) => a[0] - b[0]);
    const [cost, q, r] = open.shift(), k = keyOf(q, r);
    if (cost !== dist.get(k)) continue;
    if (k === target) break;
    for (const [nq, nr] of neighbors(q, r)) {
      const destination = nq === tq && nr === tr;
      if (!tilePassable(state, unit, nq, nr, destination)) continue;
      const step = TERRAIN[tileAt(state, nq, nr).terrain].move, next = cost + step, nk = keyOf(nq, nr);
      if (next > maxCost || next >= (dist.get(nk) ?? Infinity)) continue;
      dist.set(nk, next); prev.set(nk, k); open.push([next, nq, nr]);
    }
  }
  if (!dist.has(target)) return null;
  const path = []; let cursor = target;
  while (cursor) { const [q, r] = cursor.split(",").map(Number); path.unshift([q, r]); cursor = prev.get(cursor); }
  return { path, cost: dist.get(target) };
}
export function reachableTiles(state, unitId) {
  const u = getUnit(state, unitId); if (!u || u.acted || u.mp <= 0) return new Map();
  const out = new Map(), queue = [[0, u.q, u.r]], dist = new Map([[keyOf(u.q, u.r), 0]]);
  while (queue.length) {
    queue.sort((a, b) => a[0] - b[0]); const [cost, q, r] = queue.shift();
    if (cost !== dist.get(keyOf(q, r))) continue;
    for (const [nq, nr] of neighbors(q, r)) {
      if (!tilePassable(state, u, nq, nr, false)) continue;
      const next = cost + TERRAIN[tileAt(state, nq, nr).terrain].move, nk = keyOf(nq, nr);
      if (next > u.mp || next >= (dist.get(nk) ?? Infinity)) continue;
      dist.set(nk, next); out.set(nk, next); queue.push([next, nq, nr]);
    }
  }
  return out;
}

export function moveUnit(state, unitId, q, r) {
  const u = getUnit(state, unitId); if (!u || u.side !== "player" || u.acted) return { ok: false, error: "该单位无法行动" };
  const found = shortestPath(state, u, q, r, u.mp);
  if (!found || found.cost <= 0) return { ok: false, error: "目标不可达" };
  u.q = q; u.r = r; u.mp -= found.cost; u.fortified = false;
  revealArea(state, q, r, UNIT_TYPES[u.type].vis);
  computeNetwork(state);
  return { ok: true, path: found.path, cost: found.cost };
}
export function combatPreview(state, attackerId, defenderId) {
  const a = getUnit(state, attackerId), d = getUnit(state, defenderId); if (!a || !d) return null;
  const attack = unitStrength(state, a, "attack"), defense = unitStrength(state, d, "defense");
  const expected = clamp(Math.round(23 * Math.exp((attack - defense) / 12)), 6, 72);
  const counter = expected >= d.hp ? 0 : clamp(Math.round(23 * Math.exp((unitStrength(state, d, "attack") - unitStrength(state, a, "defense")) / 12) * CFG.counterMultiplier), 4, 50);
  return { attack, defense, expected, counter };
}
export function attackUnit(state, attackerId, defenderId) {
  const a = getUnit(state, attackerId), d = getUnit(state, defenderId);
  if (!a || !d || a.side === d.side || a.acted || hexDistance(a.q, a.r, d.q, d.r) !== 1 || UNIT_TYPES[a.type].str <= 0) return { ok: false, error: "无法攻击" };
  const dmg = damageRoll(state, unitStrength(state, a, "attack"), unitStrength(state, d, "defense"));
  d.hp -= dmg; a.acted = true; a.mp = 0; a.fortified = false;
  let counter = 0;
  if (d.hp <= 0) { killUnit(state, d, a.side); promote(a, 5); }
  else {
    counter = Math.round(damageRoll(state, unitStrength(state, d, "attack"), unitStrength(state, a, "defense")) * CFG.counterMultiplier);
    a.hp -= counter; if (a.hp <= 0) killUnit(state, a, d.side); else promote(a, 2);
  }
  if (a.side === "player") state.exposure += 5 + (policyOf(state).attackExposure || 0);
  addLog(state, `${UNIT_TYPES[a.type].name}袭击${UNIT_TYPES[d.type].name}，造成${dmg}伤害${counter ? `，遭反击${counter}` : ""}。`, a.side === "player" ? "info" : "bad");
  capResources(state); computeNetwork(state); return { ok: true, damage: dmg, counter };
}
export function structurePreview(state, attackerId, q, r) {
  const a = getUnit(state, attackerId), s = tileAt(state, q, r)?.structure; if (!a || !s) return null;
  const attack = unitStrength(state, a, "attack"), defense = s.str * (.6 + .4 * s.hp / s.maxHp);
  const expected = clamp(Math.round(23 * Math.exp((attack - defense) / 12)), 6, 72);
  const counter = clamp(Math.round(23 * Math.exp((s.str - unitStrength(state, a, "defense")) / 12) * CFG.counterMultiplier), 4, 55);
  return { attack, defense, expected, counter };
}
export function attackStructure(state, attackerId, q, r) {
  const a = getUnit(state, attackerId), t = tileAt(state, q, r), s = t?.structure;
  if (!a || !s || a.side !== "player" || a.acted || hexDistance(a.q, a.r, q, r) !== 1 || UNIT_TYPES[a.type].str <= 0) return { ok: false, error: "无法攻击该据点" };
  if (s.kind === "town" && !state.techs.counter) return { ok: false, error: "需要完成【局部反攻】整训" };
  if (s.kind === "town") {
    const livePillboxes = enemyStructures(state).filter(x => x.structure.kind === "pillbox").length;
    const brokenRails = countBrokenRails(state);
    if (livePillboxes > 3 || brokenRails < 2) return { ok: false, error: "县城仍有外围据点与铁路增援；至少拔至3座炮楼并同时切断2段铁路" };
  }
  const dmg = damageRoll(state, unitStrength(state, a, "attack"), s.str * (.6 + .4 * s.hp / s.maxHp));
  s.hp -= dmg; a.acted = true; a.mp = 0; let counter = 0;
  if (s.hp <= 0) {
    const kind = s.kind; t.structure = null; state.stats.structuresDestroyed++;
    state.arms += kind === "town" ? 25 : 12; state.grain += kind === "town" ? 30 : 16; promote(a, 5);
    addLog(state, kind === "town" ? "红旗插上县城，全县囚笼被彻底撕开！" : `摧毁${s.name}，附近群众重新获得活动空间。`, "good");
    if (kind === "town") finishGame(state, "military");
  } else {
    counter = Math.round(damageRoll(state, s.str, unitStrength(state, a, "defense")) * CFG.counterMultiplier);
    a.hp -= counter; if (a.hp <= 0) killUnit(state, a, "enemy");
  }
  state.exposure += 7 + (policyOf(state).attackExposure || 0); state.pressure += 2;
  capResources(state); computeNetwork(state); return { ok: true, damage: dmg, counter };
}

export function startBuild(state, villageId, buildingKey) {
  const x = playerVillages(state).find(y => y.village.id === villageId), b = BUILDINGS[buildingKey];
  if (!x || !b || !x.village.connected) return { ok: false, error: "村庄交通中断，无法施工" };
  if (x.village.build || x.village.buildings.includes(buildingKey)) return { ok: false, error: "当前无法修建" };
  const slots = x.village.hq ? 3 : 2; if (x.village.buildings.length >= slots) return { ok: false, error: `该村只有${slots}个主要设施槽` };
  if (b.tech && !state.techs[b.tech]) return { ok: false, error: `需要整训【${TECHS[b.tech].name}】` };
  if (!canAfford(state, b.cost)) return { ok: false, error: "资源不足" };
  spend(state, b.cost); x.village.build = { key: buildingKey, monthsLeft: b.months };
  addLog(state, `${x.village.name}开始修建【${b.name}】，预计${b.months}个月。`); return { ok: true };
}
export function recruitUnit(state, villageId, type) {
  const x = playerVillages(state).find(y => y.village.id === villageId), ut = UNIT_TYPES[type];
  if (!x || !ut || ut.side !== "player" || !x.village.connected) return { ok: false, error: "只能在交通畅通的己方村组建队伍" };
  if (ut.tech && !state.techs[ut.tech]) return { ok: false, error: `需要整训【${TECHS[ut.tech].name}】` };
  if (!canAfford(state, ut.cost)) return { ok: false, error: "资源不足" };
  const unit = spawnUnit(state, type, x.q, x.r, { name: `${x.village.name.replace("（总部）", "")}${ut.name}` });
  if (!unit) return { ok: false, error: "村庄附近没有合法集结位置" };
  spend(state, ut.cost); unit.mp = 0; unit.acted = true; addLog(state, `${x.village.name}组建了${unit.name}。`); return { ok: true, unitId: unit.id };
}
export function buyTech(state, techKey) {
  const tech = TECHS[techKey]; if (!tech || state.techs[techKey]) return { ok: false, error: "该整训不可购买" };
  if ((tech.need || []).some(k => !state.techs[k])) return { ok: false, error: "前置整训尚未完成" };
  if (state.org < tech.cost) return { ok: false, error: "组织力不足" };
  state.org -= tech.cost; state.techs[techKey] = true; addLog(state, `完成整训【${tech.name}】。`, "good"); return { ok: true };
}
export function changePolicy(state, policyKey) {
  const p = POLICIES[policyKey]; if (!p || state.policy === policyKey) return { ok: false, error: "方针未发生变化" };
  if (state.turn - state.lastPolicyTurn < 6) return { ok: false, error: `方针至少执行6回合；还需${6 - (state.turn - state.lastPolicyTurn)}回合` };
  if (state.org < 12) return { ok: false, error: "调整方针需要12组织" };
  state.org -= 12; state.policy = policyKey; state.lastPolicyTurn = state.turn; addLog(state, `作战会议决定执行【${p.name}】。`, "major"); return { ok: true };
}
export function sabotageRail(state, unitId) {
  const u = getUnit(state, unitId), t = u ? tileAt(state, u.q, u.r) : null;
  if (!u || u.side !== "player" || u.acted || !t?.rail || t.railBroken > 0 || !["militia", "commando"].includes(u.type)) return { ok: false, error: "该单位无法在这里破袭" };
  const duration = state.techs.sabotage ? CFG.railRepairTurns + 3 : CFG.railRepairTurns;
  t.railBroken = duration; u.acted = true; u.mp = 0;
  const tr = t.village ? traitOf(t.village) : null, bonus = tr?.sabotageBonus || 0;
  state.arms += 7 + bonus; state.grain += 10; state.exposure += state.techs.sabotage ? 6 : 9; state.pressure += 2;
  state.stats.sabotages++; state.recentSabotageTurn = state.turn; promote(u, 3);
  addLog(state, `破袭铁路成功，敌军增援被迫停顿${duration}回合。`, "good"); capResources(state); return { ok: true };
}
export function attemptDefection(state, unitId, targetId) {
  const u = getUnit(state, unitId), target = getUnit(state, targetId);
  if (!state.techs.enemywork) return { ok: false, error: "需要完成【敌工科】整训" };
  if (!u || !target || u.side !== "player" || target.type !== "puppet" || u.acted || !["work", "commando"].includes(u.type) || hexDistance(u.q, u.r, target.q, target.r) !== 1) return { ok: false, error: "必须由邻接的工作队或武工队策反伪军" };
  if (state.org < 8) return { ok: false, error: "策反行动需要8组织" };
  state.org -= 8; u.acted = true; u.mp = 0; state.exposure += 3;
  const nearby = allVillages(state).filter(x => x.village.owner === "player" && hexDistance(x.q, x.r, target.q, target.r) <= 3).sort((a, b) => b.village.support - a.village.support)[0];
  const progress = 34 + (policyOf(state).defection || 0) + Math.round((nearby?.village.support || 20) / 10);
  target.defection = clamp((target.defection || 0) + progress, 0, 100);
  if (target.defection >= 100) {
    removeUnit(state, target); state.man += 7; state.arms += 5; state.stats.defections++; promote(u, 4);
    addLog(state, "伪军小队放下武器，交出情报和装备后被妥善安置。", "good");
  } else if (target.defection >= 65) {
    target.wavering = true; target.skipTurn = true; if (state.operation) state.operation.revealed = true;
    addLog(state, "敌工关系开始发挥作用：伪军军心动摇，并泄露了敌军目标。", "good");
  } else {
    if (state.operation) state.operation.revealed = true;
    addLog(state, "已建立秘密接触，获得部分敌情；继续工作可能促成瓦解。", "info");
  }
  capResources(state); return { ok: true, progress: target.defection };
}
export function reinforceUnit(state, unitId) {
  const u = getUnit(state, unitId); if (!u || u.side !== "player" || u.acted || u.hp >= 100) return { ok: false, error: "该单位无需或无法补员" };
  const x = playerVillages(state).find(v => v.q === u.q && v.r === u.r && v.village.connected);
  if (!x) return { ok: false, error: "只能在交通畅通的己方村补员" };
  const clinic = x.village.buildings.includes("clinic"), heal = clinic ? 45 : 30;
  const missing = Math.min(heal, 100 - u.hp), cost = { man: Math.max(1, Math.ceil(missing / (clinic ? 18 : 14))), grain: Math.max(2, Math.ceil(missing / 7)) };
  if (!canAfford(state, cost)) return { ok: false, error: "人力或粮食不足" };
  spend(state, cost); u.hp += missing; u.acted = true; u.mp = 0; addLog(state, `${u.name}补充${missing}点兵力，保留了骨干和经验。`); return { ok: true };
}
export function fortifyUnit(state, unitId) {
  const u = getUnit(state, unitId); if (!u || u.side !== "player" || u.acted || UNIT_TYPES[u.type].str <= 0) return { ok: false, error: "无法设防" };
  u.fortified = true; u.acted = true; u.mp = 0; return { ok: true };
}

export function countBrokenRails(state) { let n = 0; eachTile(state, t => { if (t.railBroken > 0) n++; }); return n; }
function operationIntel(state) {
  const relays = playerVillages(state).filter(x => x.village.buildings.includes("relay") && x.village.connected).length;
  const scouts = state.units.filter(u => u.side === "player" && u.type === "scout" && tileAt(state, u.q, u.r).disc).length;
  return relays + (state.techs.network ? 1 : 0) + Math.min(1, scouts);
}
function operationTargets(state, opKey) {
  const op = OPERATIONS[opKey], villages = playerVillages(state);
  if (op.target === "asset") {
    const assets = villages.filter(x => x.village.buildings.some(b => ["arsenal", "relay"].includes(b)));
    return (assets.length ? assets : villages.filter(x => x.village.hq)).slice(0, 2);
  }
  if (op.target === "support") return villages.slice().sort((a, b) => b.village.support - a.village.support).slice(0, 2);
  if (op.target === "frontier") return villages.slice().sort((a, b) => b.q - a.q).slice(0, 2);
  if (op.target === "rail") {
    const broken = []; eachTile(state, t => { if (t.railBroken > 0) broken.push({ q: t.q, r: t.r, tile: t }); });
    return broken.length ? broken.slice(0, 2) : [{ q: state.town.q, r: state.town.r, tile: tileAt(state, state.town.q, state.town.r) }];
  }
  return villages.filter(x => x.village.connected && !x.village.hq).sort((a, b) => b.village.support - a.village.support).slice(0, 3).concat(villages.filter(x => x.village.hq)).slice(0, 3);
}
function chooseOperation(state, rng) {
  if (state.turn >= CFG.bigSweepWarnTurn && !state.stats.bigSweepTriggered && state.turn <= CFG.bigSweepTurn) return "sweep";
  const broken = countBrokenRails(state), arsenals = playerVillages(state).filter(x => x.village.buildings.includes("arsenal")).length;
  const weighted = ["cage", "clear"];
  if (broken >= 2 || state.turn - state.recentSabotageTurn < 8) weighted.push("guardrail", "guardrail");
  if (arsenals || state.exposure >= 50) weighted.push("raid", "raid");
  if (state.pressure >= 42 || playerVillages(state).length >= 6) weighted.push("sweep");
  return rng.pick(weighted);
}
function scheduleOperation(state, forcedKey = null) {
  const rng = new RNG(state.rngState), type = forcedKey || chooseOperation(state, rng); state.rngState = rng.state;
  const targets = operationTargets(state, type).map(x => ({ q: x.q, r: x.r, villageId: x.village?.id || null }));
  const big = state.turn >= CFG.bigSweepWarnTurn && !state.stats.bigSweepTriggered && type === "sweep";
  state.operation = {
    id: ++state.operationSeq, type, phase: "telegraph", countdown: big ? CFG.bigSweepTurn - state.turn : CFG.operationTelegraph,
    ttl: 0, targets, revealed: operationIntel(state) >= 2, big, totalStrength: 0, killedStrength: 0, villagesHit: 0,
  };
  if (big) state.stats.bigSweepTriggered = true;
  addLog(state, big ? "急电：日军正集结重兵，五月太行反扫荡迫在眉睫。" : `敌情变化：日军正在准备【${OPERATIONS[type].name}】。`, "major");
}
function enemySpawnPoint(state, target) {
  const structures = enemyStructures(state).filter(x => x.structure.kind !== "site");
  structures.sort((a, b) => hexDistance(a.q, a.r, target.q, target.r) - hexDistance(b.q, b.r, target.q, target.r));
  for (const s of structures) for (const [q, r] of neighbors(s.q, s.r)) {
    const t = tileAt(state, q, r); if (!t.structure && t.terrain !== "mountain" && !unitAt(state, q, r, "enemy", "mil") && !unitAt(state, q, r, "player", "mil")) return [q, r];
  }
  return [CFG.mapW - 2, Math.floor(CFG.mapH / 2)];
}
function launchOperation(state) {
  const op = state.operation; if (!op) return;
  if (op.type === "cage") {
    const target = op.targets[0];
    let best = null, score = Infinity;
    for (let q = 6; q < CFG.mapW - 2; q++) for (let r = 1; r < CFG.mapH - 1; r++) {
      const t = tileAt(state, q, r); if (t.structure || t.village || t.rail || t.terrain === "mountain") continue;
      const d = hexDistance(q, r, target.q, target.r); if (d < score && d <= 3) { score = d; best = [q, r]; }
    }
    if (best) tileAt(state, best[0], best[1]).structure = { kind: "site", name: "新炮楼工地", hp: 62, maxHp: 62, str: 6, turnsLeft: 5 };
  }
  if (op.type === "guardrail") eachTile(state, t => { if (t.railBroken > 0) t.railBroken = Math.max(1, t.railBroken - 3); });
  let budget = 22 + state.pressure * .42 + state.turn * .16 + state.exposure * .2;
  if (op.big) budget *= CFG.bigSweepMultiplier;
  budget *= Math.max(.62, 1 - countBrokenRails(state) * .055);
  const menu = OPERATIONS[op.type].baseUnits.slice(), maxUnits = op.big ? 7 : 5;
  const rng = new RNG(state.rngState); let guard = 0, index = 0;
  while (budget > 6 && guard++ < 30 && index < maxUnits) {
    const type = rng.pick(menu), cost = UNIT_TYPES[type].str; if (cost > budget + 4) continue;
    const target = op.targets[index % op.targets.length] || { q: state.hq.q, r: state.hq.r }, spawn = enemySpawnPoint(state, target);
    const u = spawnUnit(state, type, spawn[0], spawn[1], { opId: op.id, targetQ: target.q, targetR: target.r, ttl: CFG.operationTTL + 2, mp: 0 });
    if (u) { budget -= cost; op.totalStrength += cost; index++; }
  }
  state.rngState = rng.state; op.phase = "active"; op.ttl = CFG.operationTTL; state.exposure *= .55;
  addLog(state, `${op.big ? "五月大规模反扫荡开始" : OPERATIONS[op.type].name + "开始"}：${index}支敌军纵队从封锁线出动。`, "bad");
  computeNetwork(state);
}
function endOperation(state) {
  const op = state.operation; if (!op) return;
  const ratio = op.totalStrength ? op.killedStrength / op.totalStrength : 0;
  if (ratio >= .55 || op.villagesHit === 0) {
    for (const x of playerVillages(state)) x.village.support = clamp(x.village.support + 4, 0, 100);
    addLog(state, `反${OPERATIONS[op.type].name}取得主动：根据地交通与群众基本保存。`, "good");
  } else addLog(state, `${OPERATIONS[op.type].name}结束：敌军袭扰${op.villagesHit}次，歼敌战力比${Math.round(ratio * 100)}%。`, "info");
  for (const u of state.units.slice()) if (u.opId === op.id) removeUnit(state, u);
  state.stats.operationsSurvived++;
  if (op.big) state.stats.bigSweepsSurvived++;
  state.operation = null;
  const rng = new RNG(state.rngState); state.nextOperationTurn = state.turn + CFG.operationInterval + rng.int(-1, 2); state.rngState = rng.state;
  computeNetwork(state);
}
function nearestPlayerTarget(state, u) {
  const units = state.units.filter(x => x.side === "player" && x.layer === "mil" && !UNIT_TYPES[x.type].hidden && hexDistance(u.q, u.r, x.q, x.r) <= 3);
  if (units.length) return units.sort((a, b) => hexDistance(u.q, u.r, a.q, a.r) - hexDistance(u.q, u.r, b.q, b.r))[0];
  return null;
}
function enemyAct(state, u) {
  if (u.skipTurn) { u.skipTurn = false; return; }
  const adjacent = state.units.filter(x => x.side === "player" && x.layer === "mil" && !UNIT_TYPES[x.type].hidden && hexDistance(u.q, u.r, x.q, x.r) === 1).sort((a, b) => a.hp - b.hp);
  if (adjacent.length) { u.acted = false; attackUnit(state, u.id, adjacent[0].id); return; }
  const prey = nearestPlayerTarget(state, u); if (prey) { u.targetQ = prey.q; u.targetR = prey.r; }
  const target = { q: u.targetQ ?? state.hq.q, r: u.targetR ?? state.hq.r };
  u.mp = UNIT_TYPES[u.type].mp;
  for (let step = 0; step < UNIT_TYPES[u.type].mp; step++) {
    const path = shortestPath(state, u, target.q, target.r, 50); if (!path || path.path.length < 2) break;
    const [q, r] = path.path[1];
    if (unitAt(state, q, r, "player", "mil")) break;
    u.q = q; u.r = r;
    const t = tileAt(state, q, r);
    if (t.mine) { t.mine = false; u.hp -= 36; if (u.hp <= 0) { killUnit(state, u, "player"); return; } }
    if (q === target.q && r === target.r) break;
  }
  const t = tileAt(state, u.q, u.r), v = t.village;
  if (v && v.owner === "player") {
    const protectedMult = v.buildings.includes("tunnel") ? .5 : 1, pMult = policyOf(state).pillageMult ?? 1, mult = protectedMult * pMult;
    const grainLoss = Math.round(CFG.pillageGrain * mult), supportLoss = Math.round(CFG.pillageSupport * mult);
    state.grain = Math.max(0, state.grain - grainLoss); v.support = clamp(v.support - supportLoss, 0, 100); state.operation && state.operation.villagesHit++;
    if (v.buildings.length) {
      const rng = new RNG(state.rngState), destroy = rng.next() < .18 * mult;
      if (destroy) { const index = rng.int(0, v.buildings.length - 1), lost = v.buildings.splice(index, 1)[0]; addLog(state, `${v.name}的【${BUILDINGS[lost].name}】被敌军摧毁。`, "bad"); }
      state.rngState = rng.state;
    }
    addLog(state, `敌军袭扰${v.name}：粮食-${grainLoss}，民心-${supportLoss}。`, "bad");
    if (v.support < 12 && !v.hq) { v.owner = "neutral"; v.connected = false; addLog(state, `${v.name}组织遭到破坏，被迫转入隐蔽。`, "bad"); }
  }
  const civilian = unitAt(state, u.q, u.r, "player", "civ");
  if (civilian) { removeUnit(state, civilian); state.stats.playerLosses++; addLog(state, `${civilian.name}遭敌军捕获，群众工作受到损失。`, "bad"); }
}

function resolveCivilWork(state) {
  for (const u of state.units) {
    if (u.side !== "player" || u.type !== "work") continue;
    const t = tileAt(state, u.q, u.r), v = t.village; if (!v) continue;
    if (v.owner === "neutral") {
      const gain = CFG.baseWorkSupport + (state.techs.grassroots ? 2 : 0) + (policyOf(state).workSupport || 0);
      v.support = clamp(v.support + gain, 0, 100);
      if (suppressionAt(state, u.q, u.r) > 0) v.support = Math.min(v.support, CFG.suppressSupportCap);
      if (v.support >= CFG.joinSupport && suppressionAt(state, u.q, u.r) === 0) {
        v.owner = "player"; v.support = Math.max(v.support, 72); state.stats.joined++;
        const trait = traitOf(v); state.exposure += Math.max(2, 7 + (trait.joinExposure || 0)); state.pressure += 3;
        addLog(state, `${v.name}挂起红旗，加入根据地交通网。`, "good"); revealArea(state, u.q, u.r, 2);
      }
    } else if (v.owner === "player") v.support = clamp(v.support + 2 + (state.techs.grassroots ? 1 : 0), 0, 100);
  }
}
function monthlySettlement(state) {
  computeNetwork(state);
  let g = 0, m = 0, o = 0, a = 0;
  for (const x of playerVillages(state)) {
    const y = villageYield(state, x); g += y[0]; m += y[1]; o += y[2]; a += y[3];
    const v = x.village;
    v.support = clamp(v.support + (state.techs.grassroots ? 2 : 1) + (v.buildings.includes("clinic") && v.scarred ? 2 : 0), 0, 100);
    if (v.scarred > 0) v.scarred--;
    if (v.build && --v.build.monthsLeft <= 0) {
      v.buildings.push(v.build.key); addLog(state, `${v.name}的【${BUILDINGS[v.build.key].name}】竣工。`, "good"); v.build = null;
    }
  }
  const upkeepBase = state.units.filter(u => u.side === "player").reduce((sum, u) => sum + UNIT_TYPES[u.type].upkeep, 0);
  const upkeep = Math.round(upkeepBase * (policyOf(state).upkeepMult ?? 1));
  state.grain += g - upkeep; state.man += m; state.org += o; state.arms += a; state.lastIncome = { grain: g - upkeep, man: m, org: o, arms: a };
  if (state.grain < 0) {
    state.grain = 0;
    for (const u of state.units) if (u.side === "player" && u.layer === "mil") u.hp -= 8;
    for (const x of playerVillages(state)) x.village.support = clamp(x.village.support - 3, 0, 100);
    addLog(state, "粮荒：部队与村庄同时承受损失。", "bad");
  }
  const nonHQ = playerVillages(state).filter(x => !x.village.hq).length, arsenals = playerVillages(state).filter(x => x.village.buildings.includes("arsenal")).length;
  state.pressure += .7 + nonHQ * .22 + arsenals * .5;
  capResources(state);
}
function progressEnemyInfrastructure(state) {
  eachTile(state, t => {
    if (t.railBroken > 0) t.railBroken--;
    if (t.structure?.kind === "site" && --t.structure.turnsLeft <= 0) {
      t.structure = { kind: "pillbox", name: "新筑炮楼", hp: 145, maxHp: 145, str: 20 }; addLog(state, "敌军一座新炮楼筑成，囚笼再次收紧。", "bad");
    }
  });
  if (state.operation?.type === "guardrail" && state.operation.phase === "active") eachTile(state, t => { if (t.railBroken > 0) t.railBroken = Math.max(0, t.railBroken - 1); });
}
function enemyTurn(state) {
  if (state.turn === CFG.bigSweepWarnTurn && !state.stats.bigSweepTriggered) {
    if (state.operation) endOperation(state);
    scheduleOperation(state, "sweep");
  } else if (!state.operation && state.turn >= state.nextOperationTurn) scheduleOperation(state);
  if (state.operation?.phase === "telegraph") {
    if (state.operation.countdown <= 0) launchOperation(state); else state.operation.countdown--;
  } else if (state.operation?.phase === "active") {
    for (const u of state.units.slice()) if (u.side === "enemy" && u.opId === state.operation.id) enemyAct(state, u);
    if (state.operation && (--state.operation.ttl <= 0 || !state.units.some(u => u.opId === state.operation.id))) endOperation(state);
  }
  for (const u of state.units.slice()) if (u.side === "enemy" && !u.opId) { enemyAct(state, u); if (u.ttl && --u.ttl <= 0) removeUnit(state, u); }
  if (state.turn % 14 === 0 && state.units.filter(u => u.side === "enemy" && !u.opId).length < 3) {
    const target = playerVillages(state).sort((a, b) => b.q - a.q)[0] || { q: state.hq.q, r: state.hq.r }, spawn = enemySpawnPoint(state, target);
    spawnUnit(state, eraYear(state.turn) <= 1941 ? "puppet" : "squad", spawn[0], spawn[1], { targetQ: target.q, targetR: target.r, ttl: 12 });
  }
}

export function goalProgress(state, goal) {
  if (goal.kind === "connected") return state.network?.connectedIds?.length || 0;
  if (goal.kind === "railSeen") { let n = 0; eachTile(state, t => { if (t.rail && t.disc) n++; }); return n; }
  if (goal.kind === "owned") return playerVillages(state).length;
  if (goal.kind === "relay") return playerVillages(state).filter(x => x.village.buildings.includes("relay")).length;
  if (goal.kind === "destroyed") return state.stats.structuresDestroyed;
  if (goal.kind === "bigSweep") return state.stats.bigSweepsSurvived;
  if (goal.kind === "disrupt") return state.stats.sabotages + state.stats.defections;
  if (goal.kind === "counter") return state.techs.counter ? 1 : 0;
  if (goal.kind === "victory") return state.result || ((state.network?.connectedIds?.length || 0) >= 7 && state.turn >= CFG.totalTurns) ? 1 : 0;
  return 0;
}
export function objectiveStatus(state, chapter = CHAPTERS[chapterIndex(state.turn)]) {
  return chapter.goals.map(goal => ({ ...goal, progress: goalProgress(state, goal), done: goalProgress(state, goal) >= goal.target }));
}
function evaluateChapter(state, index) {
  if (index < 0 || state.chapterResults[CHAPTERS[index].id]) return;
  const chapter = CHAPTERS[index], statuses = objectiveStatus(state, chapter), complete = statuses.filter(x => x.done).length;
  const success = complete >= Math.max(1, Math.ceil(statuses.length * .67));
  state.chapterResults[chapter.id] = { success, complete, total: statuses.length, turn: state.turn };
  if (success) {
    for (const [k, v] of Object.entries(chapter.reward || {})) state[k] += v;
    state.pressure = Math.max(0, state.pressure - 4); addLog(state, `${chapter.title}目标完成，上级与群众给予新的支援。`, "major");
  } else {
    state.pressure += 7; addLog(state, `${chapter.title}未能完成主要目标，敌军趁势收紧封锁。`, "bad");
  }
  capResources(state);
}
function transitionChapter(state, oldTurn, newTurn) {
  const oldIndex = chapterIndex(oldTurn), nextIndex = chapterIndex(newTurn);
  if (nextIndex !== oldIndex) {
    evaluateChapter(state, oldIndex); state.chapter = nextIndex; addLog(state, `—— ${CHAPTERS[nextIndex].title} ——`, "major");
  }
}
function finishGame(state, result) {
  if (state.over) return;
  state.over = true; state.result = result;
  state.score = Math.round(
    playerVillages(state).reduce((s, x) => s + x.village.support, 0) +
    (state.network?.connectedIds?.length || 0) * 30 + state.stats.sabotages * 12 + state.stats.defections * 18 +
    state.stats.structuresDestroyed * 20 + state.stats.operationsSurvived * 15 - state.stats.playerLosses * 18
  );
}
function checkDefeat(state) {
  const hq = tileAt(state, state.hq.q, state.hq.r)?.village;
  if (!hq || hq.owner !== "player" || hq.support <= 5) { finishGame(state, "defeat"); return true; }
  return false;
}
function checkEnd(state) {
  if (state.over) return;
  if (state.turn > CFG.totalTurns) {
    evaluateChapter(state, CHAPTERS.length - 1);
    const connected = state.network?.connectedIds?.length || 0, avgSupport = playerVillages(state).length ? playerVillages(state).reduce((s, x) => s + x.village.support, 0) / playerVillages(state).length : 0;
    finishGame(state, connected >= 7 && avgSupport >= 62 ? "network" : connected >= 5 ? "survival" : "pyrrhic");
  }
}

export function endTurn(state) {
  if (state.over) return { ok: false, error: "战役已经结束" };
  resolveCivilWork(state);
  const decay = CFG.exposureDecay + (policyOf(state).exposureDecay || 0); state.exposure = Math.max(0, state.exposure - decay);
  if (state.turn % CFG.turnsPerMonth === 0) monthlySettlement(state);
  progressEnemyInfrastructure(state); enemyTurn(state); computeNetwork(state);
  if (checkDefeat(state)) return { ok: true, over: true };
  for (const u of state.units) if (u.side === "player") {
    u.mp = UNIT_TYPES[u.type].mp; u.acted = false;
    if (u.hp < 100 && u.fortified && playerVillages(state).some(x => x.q === u.q && x.r === u.r && x.village.connected)) u.hp = Math.min(100, u.hp + 4);
  }
  const oldTurn = state.turn; state.turn++; transitionChapter(state, oldTurn, state.turn); computeNetwork(state); checkEnd(state); capResources(state);
  return { ok: true, over: state.over };
}

export function createGame(seed = Date.now() % 1000000000) {
  const normalizedSeed = (Number(seed) >>> 0) || 1941, rng = new RNG(normalizedSeed), map = generateMap(rng);
  const state = {
    version: CFG.saveVersion, seed: normalizedSeed, rngState: rng.state, turn: 1, over: false, result: null, score: 0,
    tiles: map.tiles, hq: map.hq, town: map.town, units: [], nextUnitId: 1,
    grain: 72, man: 24, arms: 16, org: 26, exposure: 8, pressure: 10, lastIncome: { grain: 0, man: 0, arms: 0, org: 0 },
    techs: {}, policy: "hidden", lastPolicyTurn: -99, chapter: 0, chapterResults: {}, network: { connectedIds: [], edges: [], blockedIds: [] },
    operation: null, operationSeq: 0, nextOperationTurn: 8, recentSabotageTurn: -99,
    stats: { joined: 0, kills: 0, playerLosses: 0, structuresDestroyed: 0, sabotages: 0, defections: 0, operationsSurvived: 0, bigSweepsSurvived: 0, bigSweepTriggered: false },
    logs: [],
  };
  revealArea(state, state.hq.q, state.hq.r, 3);
  spawnUnit(state, "militia", state.hq.q, state.hq.r);
  spawnUnit(state, "scout", state.hq.q, state.hq.r);
  spawnUnit(state, "work", state.hq.q, state.hq.r);
  computeNetwork(state);
  addLog(state, "百团大战的破袭声尚未散去，日军的囚笼正在重新收紧。", "major");
  addLog(state, "先派侦察员向东探明铁路，工作队联结邻近村庄。", "good");
  return state;
}

export function serializeGame(state) {
  return JSON.stringify({ version: CFG.saveVersion, state });
}
export function deserializeGame(text) {
  const data = JSON.parse(text); if (!data || data.version !== CFG.saveVersion || !data.state) throw new Error("存档版本不兼容");
  computeNetwork(data.state); return data.state;
}

export function invariantChecks(state) {
  const errors = [];
  if (!state || !Array.isArray(state.tiles) || state.tiles.length !== CFG.mapW) errors.push("地图尺寸错误");
  if (!Number.isFinite(state.grain + state.man + state.arms + state.org + state.exposure + state.pressure)) errors.push("资源存在非数值");
  for (const value of [state.grain, state.man, state.arms, state.org, state.exposure, state.pressure]) if (value < 0) errors.push("资源出现负数");
  const occupied = new Set();
  for (const u of state.units) {
    if (!inBounds(u.q, u.r)) errors.push(`单位${u.id}越界`);
    const k = `${u.side}:${u.layer}:${u.q},${u.r}`; if (occupied.has(k)) errors.push(`单位重叠${k}`); occupied.add(k);
    if (!Number.isFinite(u.hp) || u.hp <= 0) errors.push(`无效单位HP:${u.id}`);
  }
  const hq = tileAt(state, state.hq.q, state.hq.r)?.village; if (!hq?.hq) errors.push("总部丢失");
  for (const x of allVillages(state)) {
    const slots = x.village.hq ? 3 : 2;
    if (x.village.buildings.length > slots) errors.push(`${x.village.name}超出建筑槽`);
    if (x.village.support < 0 || x.village.support > 100) errors.push(`${x.village.name}民心越界`);
  }
  return errors;
}
