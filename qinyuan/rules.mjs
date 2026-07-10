export const CFG = Object.freeze({
  version: 1,
  mapW: 11,
  mapH: 9,
  startYear: 1942,
  startMonth: 11,
  turnsPerMonth: 2,
  totalTurns: 60,
  maxExposure: 100,
  maxResource: 999,
  gate: Object.freeze({ q: 10, r: 1 }),
});

export const TERRAIN = Object.freeze({
  field:  { name: "河谷田", move: 1,   defense: 0, color: "#b6ac83" },
  forest: { name: "松林",   move: 1.5, defense: 3, color: "#728069" },
  ridge:  { name: "山岭",   move: 2,   defense: 5, color: "#817f69" },
  ravine: { name: "沟壑",   move: 2,   defense: 4, color: "#9a8868" },
  river:  { name: "沁河岸", move: 2,   defense: 1, color: "#7f9690" },
});

export const UNIT_TYPES = Object.freeze({
  militia: { name: "沁源民兵", mark: "民", mp: 3, sight: 2, strength: 25, role: "伏击巡逻队；据点虚弱后实施袭扰" },
  mine:    { name: "爆破组",   mark: "雷", mp: 3, sight: 2, strength: 13, role: "在公路布雷、断路，截击补给队" },
  work:    { name: "群众工作队", mark: "众", mp: 3, sight: 2, strength: 8, role: "坚壁转移、建立封锁、瓦解据点" },
  courier: { name: "交通员",   mark: "信", mp: 4, sight: 3, strength: 7, role: "侦察敌情、组织转移、开展政治攻势" },
  patrol:  { name: "日伪巡逻队", mark: "巡", mp: 2, sight: 2, strength: 19 },
  escort:  { name: "护路队", mark: "护", mp: 2, sight: 2, strength: 24 },
  convoy:  { name: "敌军补给队", mark: "辎", mp: 1, sight: 1, strength: 8 },
});

export const DOCTRINES = Object.freeze({
  clear: {
    name: "空室清野",
    motto: "留下一个没有人民的世界",
    benefit: "转移少花1组织；敌军征粮所得减半",
    cost: "在山中安置群众的粮食负担更重",
  },
  sparrow: {
    name: "麻雀咬人",
    motto: "不求一战而胜，只求敌无宁日",
    benefit: "伏击伤害+35%，成功后少增加暴露",
    cost: "每月额外消耗2粮食",
  },
  mines: {
    name: "爆炸铺地",
    motto: "大路小路，出门就踩雷",
    benefit: "布雷少花1材料且多1次引信",
    cost: "工作队的政治攻势效果降低",
  },
  political: {
    name: "政治攻势",
    motto: "围点也围心，促其动摇分化",
    benefit: "瓦解意志效果+6，伪军巡逻更易溃散",
    cost: "民兵正面战斗力-20%",
  },
  production: {
    name: "边战边产",
    motto: "山里也要把日子撑起来",
    benefit: "每月多得4粮食、难民安置改善",
    cost: "据点每半月少承受1点围困消耗",
  },
});

export const POSTS = Object.freeze([
  { id: "town", name: "沁源县城", q: 5, r: 4, type: "town", initialSupply: 110, initialResolve: 100, initialGarrison: 100 },
  { id: "jiaokou", name: "交口据点", q: 8, r: 2, type: "outpost", initialSupply: 68, initialResolve: 76, initialGarrison: 70 },
  { id: "zhongyu", name: "中峪店据点", q: 2, r: 4, type: "outpost", initialSupply: 64, initialResolve: 72, initialGarrison: 66 },
  { id: "yanzhai", name: "阎寨据点", q: 7, r: 7, type: "outpost", initialSupply: 68, initialResolve: 78, initialGarrison: 72 },
]);

export const VILLAGES = Object.freeze([
  { id: "wangtao", name: "王陶", q: 2, r: 1, pop: 9 },
  { id: "chishi", name: "赤石桥", q: 5, r: 1, pop: 8 },
  { id: "songshu", name: "松树坪", q: 0, r: 3, pop: 7 },
  { id: "congzi", name: "聪子峪", q: 9, r: 3, pop: 8 },
  { id: "fazhong", name: "法中", q: 9, r: 5, pop: 9 },
  { id: "hanhong", name: "韩洪", q: 9, r: 8, pop: 8 },
  { id: "shangshe", name: "上舍", q: 5, r: 7, pop: 10 },
  { id: "guodao", name: "郭道", q: 3, r: 7, pop: 11 },
  { id: "baihu", name: "白狐窑", q: 1, r: 6, pop: 7 },
]);

export const REFUGES = Object.freeze([
  { id: "west", name: "西山隐蔽区", q: 0, r: 1 },
  { id: "south", name: "南沟窑洞", q: 4, r: 8 },
  { id: "east", name: "东岭山棚", q: 10, r: 7 },
]);

const MAIN_ROAD = Object.freeze([[10,1],[9,1],[8,2],[7,2],[6,3],[5,3],[5,4]]);
const WEST_ROAD = Object.freeze([[5,4],[4,4],[3,4],[2,4]]);
const SOUTH_ROAD = Object.freeze([[5,4],[5,5],[6,6],[7,6],[7,7]]);

export const SUPPLY_PATHS = Object.freeze({
  jiaokou: Object.freeze(MAIN_ROAD.slice(0, 3)),
  town: Object.freeze(MAIN_ROAD),
  zhongyu: Object.freeze([...MAIN_ROAD, ...WEST_ROAD.slice(1)]),
  yanzhai: Object.freeze([...MAIN_ROAD, ...SOUTH_ROAD.slice(1)]),
});

export const CHAPTERS = Object.freeze([
  {
    id: "empty-world", from: 1, to: 8,
    title: "把家搬进山",
    story: "敌人占了县城，却不能得到县城之外的粮、人和秩序。先坚壁，再转移；村庄空了，围困才真正开始。",
    goals: [
      { type: "hidden", target: 3, label: "完成3个村庄的坚壁藏粮" },
      { type: "evacuated", target: 3, label: "转移3个受威胁村庄" },
    ],
  },
  {
    id: "road", from: 9, to: 24,
    title: "断二沁大道",
    story: "公路不是领土，而是据点的脐带。地雷、断路和伏击共同抬高每一袋粮食进入沁源的代价。",
    goals: [
      { type: "convoysStopped", target: 2, label: "截停2支敌军补给队" },
      { type: "roadsCut", target: 4, label: "累计实施4次断路" },
    ],
  },
  {
    id: "gnaw", from: 25, to: 40,
    title: "蚂蚁啃骨头",
    story: "不要撞向最硬的城墙。封锁、袭扰、喊话，一口一口削掉外围据点的补给和守备意志。",
    goals: [
      { type: "withdrawn", target: 2, label: "迫使2处外围据点撤离" },
      { type: "persuaded", target: 4, label: "完成4次有效政治瓦解" },
    ],
  },
  {
    id: "total", from: 41, to: 54,
    title: "总围困",
    story: "所有小行动汇成一张网：村村不维持、路路有危险、据点步步收缩。让守军看见撤退是唯一出口。",
    goals: [
      { type: "isolation", target: 10, label: "全县围困强度达到10" },
      { type: "will", target: 65, label: "民心火种保持在65以上" },
    ],
  },
  {
    id: "withdraw", from: 55, to: 60,
    title: "逼敌出沁源",
    story: "县城仍在敌手，却已经没有乡野可以依靠。封住接应方向，压垮最后意志，见证占领者自己离开。",
    goals: [
      { type: "withdrawn", target: 4, label: "迫使全部4处据点撤离" },
      { type: "will", target: 50, label: "胜利时民心不低于50" },
    ],
  },
]);

export class RNG {
  constructor(seed = 1) {
    this.state = (Number(seed) >>> 0) || 0x6d2b79f5;
  }
  next() {
    let x = this.state;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 4294967296;
  }
  int(min, max) { return Math.floor(this.next() * (max - min + 1)) + min; }
  pick(items) { return items.length ? items[Math.floor(this.next() * items.length)] : null; }
}

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const keyOf = (q, r) => `${q},${r}`;
export const inBounds = (q, r) => q >= 0 && q < CFG.mapW && r >= 0 && r < CFG.mapH;

export function neighbors(q, r) {
  const offsets = q & 1
    ? [[0,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0]]
    : [[0,-1],[1,-1],[1,0],[0,1],[-1,0],[-1,-1]];
  return offsets.map(([dq, dr]) => [q + dq, r + dr]).filter(([nq, nr]) => inBounds(nq, nr));
}

function oddQCube(q, r) {
  const x = q;
  const z = r - (q - (q & 1)) / 2;
  return { x, y: -x - z, z };
}

export function hexDistance(q1, r1, q2, r2) {
  const a = oddQCube(q1, r1), b = oddQCube(q2, r2);
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
}

export function dateLabel(turn) {
  const monthOffset = Math.floor((turn - 1) / CFG.turnsPerMonth);
  const monthIndex = CFG.startMonth - 1 + monthOffset;
  const year = CFG.startYear + Math.floor(monthIndex / 12);
  const month = monthIndex % 12 + 1;
  const half = (turn - 1) % 2 === 0 ? "上半月" : "下半月";
  return `${year}年${month}月${half}`;
}

export function chapterIndex(turn) {
  const found = CHAPTERS.findIndex(ch => turn >= ch.from && turn <= ch.to);
  return found < 0 ? CHAPTERS.length - 1 : found;
}

function mapNoise(seed, q, r) {
  let x = (seed ^ Math.imul(q + 11, 0x45d9f3b) ^ Math.imul(r + 17, 0x119de1f3)) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15; x = Math.imul(x, 0x846ca68b); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function makeTiles(seed) {
  const roads = new Set([...MAIN_ROAD, ...WEST_ROAD, ...SOUTH_ROAD].map(([q,r]) => keyOf(q,r)));
  const river = new Set([[4,0],[4,1],[5,2],[5,3],[5,4],[6,5],[6,6],[7,7],[7,8]].map(([q,r]) => keyOf(q,r)));
  const tiles = Array.from({ length: CFG.mapW }, (_, q) => Array.from({ length: CFG.mapH }, (_, r) => {
    const noise = mapNoise(seed, q, r);
    const edge = q === 0 || r === 0 || q === CFG.mapW - 1 || r === CFG.mapH - 1;
    let terrain = edge || noise > .78 ? "ridge" : noise > .53 ? "forest" : noise < .16 ? "ravine" : "field";
    if (river.has(keyOf(q,r))) terrain = "river";
    if (roads.has(keyOf(q,r)) && terrain === "ridge") terrain = "field";
    return { q, r, terrain, road: roads.has(keyOf(q,r)), roadCut: 0, mine: 0, blockade: null, villageId: null, postId: null, refugeId: null };
  }));
  for (const village of VILLAGES) tiles[village.q][village.r].villageId = village.id;
  for (const post of POSTS) tiles[post.q][post.r].postId = post.id;
  for (const refuge of REFUGES) tiles[refuge.q][refuge.r].refugeId = refuge.id;
  return tiles;
}

export function tileAt(state, q, r) { return inBounds(q, r) ? state.tiles[q][r] : null; }
export function getVillage(state, id) { return state.villages.find(v => v.id === id) || null; }
export function getPost(state, id) { return state.posts.find(p => p.id === id) || null; }
export function getUnit(state, id) { return state.units.find(u => u.id === id) || null; }
export function unitAt(state, q, r, side = null) {
  return state.units.find(u => u.q === q && u.r === r && (!side || u.side === side)) || null;
}

function rand(state) {
  const rng = new RNG(state.rngState);
  const value = rng.next();
  state.rngState = rng.state;
  return value;
}

function randomInt(state, min, max) { return Math.floor(rand(state) * (max - min + 1)) + min; }

function addLog(state, text, tone = "normal") {
  state.logs.unshift({ turn: state.turn, text, tone });
  state.logs = state.logs.slice(0, 40);
}

function addUnit(state, data) {
  const type = UNIT_TYPES[data.type];
  const unit = {
    id: data.id || `u${state.nextUnitId++}`,
    side: data.side || "player",
    type: data.type,
    name: data.name || type.name,
    q: data.q,
    r: data.r,
    hp: data.hp ?? 100,
    mp: data.mp ?? type.mp,
    acted: false,
    fortified: false,
    xp: data.xp || 0,
    route: null,
    originPostId: data.originPostId || null,
    targetVillageId: data.targetVillageId || null,
    targetPostId: data.targetPostId || null,
    path: data.path || null,
    pathIndex: data.pathIndex || 0,
    cargo: data.cargo || 0,
  };
  state.units.push(unit);
  return unit;
}

function nearestRefuge(village) {
  return [...REFUGES].sort((a,b) => hexDistance(village.q,village.r,a.q,a.r) - hexDistance(village.q,village.r,b.q,b.r))[0];
}

export function createGame(seed = Date.now() % 1000000000) {
  const rng = new RNG(seed);
  const state = {
    version: CFG.version,
    seed: Number(seed) || 1,
    rngState: rng.state,
    turn: 1,
    tiles: makeTiles(Number(seed) || 1),
    villages: VILLAGES.map(v => ({ ...v, mode: "home", cache: 0, loyalty: 90, refugeId: nearestRefuge(v).id, searched: 0 })),
    posts: POSTS.map(p => ({ ...p, supply: p.initialSupply, resolve: p.initialResolve, garrison: p.initialGarrison, persuasion: 0, siegeStreak: 0, withdrawn: false, withdrewTurn: null })),
    units: [],
    nextUnitId: 1,
    grain: 42,
    org: 24,
    intel: 6,
    material: 9,
    will: 86,
    refugeCondition: 100,
    refugePop: 0,
    exposure: 7,
    doctrine: "clear",
    doctrineCooldown: 0,
    enemyIntent: { kind: "occupy", name: "筑点占路", detail: "敌军依托县城和三处外围据点，企图把占领延伸到乡村。", turns: 3 },
    revealUntil: 0,
    chapterSeen: 0,
    logs: [],
    stats: {
      hidden: 0, evacuated: 0, roadsCut: 0, minesLaid: 0, minesTriggered: 0,
      blockadesBuilt: 0, convoysStopped: 0, convoysArrived: 0, persuaded: 0,
      patrolsDefeated: 0, requisitions: 0, emptySearches: 0, raids: 0, withdrawn: 0,
      civiliansLost: 0,
    },
    over: false,
    result: null,
  };
  addUnit(state, { id: "militia-1", type: "militia", q: 3, r: 7, name: "郭道民兵队" });
  addUnit(state, { id: "militia-2", type: "militia", q: 1, r: 6, name: "白狐窑游击组" });
  addUnit(state, { id: "mine-1", type: "mine", q: 4, r: 7, name: "王来法爆破组" });
  addUnit(state, { id: "work-1", type: "work", q: 2, r: 7, name: "县委群众工作队" });
  addUnit(state, { id: "courier-1", type: "courier", q: 2, r: 6, name: "太岳交通线" });
  state.nextUnitId = 10;
  addLog(state, "敌军占据县城与交口、中峪店、阎寨；围困指挥部决定长期围困。", "chapter");
  addLog(state, "先坚壁藏粮，再组织群众转移。不要用民兵硬撞完整据点。", "advice");
  return state;
}

export function visibleKeys(state) {
  const visible = new Set();
  const reveal = (q, r, radius) => {
    for (let x = 0; x < CFG.mapW; x++) for (let y = 0; y < CFG.mapH; y++) {
      if (hexDistance(q,r,x,y) <= radius) visible.add(keyOf(x,y));
    }
  };
  for (const unit of state.units.filter(u => u.side === "player")) reveal(unit.q, unit.r, UNIT_TYPES[unit.type].sight);
  for (const village of state.villages.filter(v => v.mode !== "evacuated")) reveal(village.q, village.r, 1);
  reveal(3, 7, 2);
  for (const post of state.posts) visible.add(keyOf(post.q, post.r));
  if (state.turn <= state.revealUntil) for (let q=0;q<CFG.mapW;q++) for(let r=0;r<CFG.mapH;r++) visible.add(keyOf(q,r));
  return visible;
}

export function isEnemyVisible(state, unit) {
  return unit.side === "player" || visibleKeys(state).has(keyOf(unit.q,unit.r)) || state.turn <= state.revealUntil;
}

function pathBlockedForPlayer(state, unit, q, r, targetQ, targetR) {
  const tile = tileAt(state,q,r);
  if (!tile) return true;
  if (tile.postId && !getPost(state,tile.postId)?.withdrawn) return true;
  const occupant = unitAt(state,q,r);
  if (occupant && occupant.id !== unit.id && !(q === targetQ && r === targetR && occupant.side !== unit.side)) return true;
  return false;
}

export function shortestPath(state, unit, targetQ, targetR, maxCost = Infinity, options = {}) {
  if (!unit || !inBounds(targetQ,targetR)) return null;
  const start = keyOf(unit.q,unit.r), goal = keyOf(targetQ,targetR);
  const distances = new Map([[start, 0]]), previous = new Map(), frontier = [{ key:start, q:unit.q, r:unit.r, cost:0 }];
  while (frontier.length) {
    frontier.sort((a,b) => a.cost - b.cost);
    const current = frontier.shift();
    if (current.cost !== distances.get(current.key)) continue;
    if (current.key === goal) break;
    for (const [q,r] of neighbors(current.q,current.r)) {
      if (!options.enemy && pathBlockedForPlayer(state,unit,q,r,targetQ,targetR)) continue;
      if (options.enemy) {
        const occupant = unitAt(state,q,r,"player");
        if (occupant && !(q === targetQ && r === targetR)) continue;
      }
      const step = TERRAIN[tileAt(state,q,r).terrain].move;
      const nextCost = current.cost + step;
      const nextKey = keyOf(q,r);
      if (nextCost > maxCost || nextCost >= (distances.get(nextKey) ?? Infinity)) continue;
      distances.set(nextKey,nextCost); previous.set(nextKey,current.key);
      frontier.push({ key:nextKey,q,r,cost:nextCost });
    }
  }
  if (!distances.has(goal)) return null;
  const path = [];
  let cursor = goal;
  while (cursor) {
    const [q,r] = cursor.split(",").map(Number); path.unshift([q,r]);
    if (cursor === start) break;
    cursor = previous.get(cursor);
  }
  return { path, cost: distances.get(goal) };
}

export function reachableTiles(state, unitId) {
  const unit = getUnit(state,unitId);
  const result = new Map();
  if (!unit || unit.side !== "player") return result;
  for (let q=0;q<CFG.mapW;q++) for(let r=0;r<CFG.mapH;r++) {
    const path = shortestPath(state,unit,q,r,unit.mp);
    if (path) result.set(keyOf(q,r),path);
  }
  return result;
}

export function moveUnit(state, unitId, targetQ, targetR) {
  const unit = getUnit(state,unitId);
  if (!unit || unit.side !== "player") return { ok:false, reason:"只能指挥我方队伍" };
  if (unit.mp <= 0) return { ok:false, reason:"本半月已经没有移动力" };
  if (unitAt(state,targetQ,targetR,"enemy")) return { ok:false, reason:"敌军占据目标，需从相邻位置发动伏击" };
  const full = shortestPath(state,unit,targetQ,targetR,99);
  if (!full || full.path.length < 2) return { ok:false, reason:"无法到达该地" };
  let spent = 0, index = 0;
  for (let i=1;i<full.path.length;i++) {
    const [q,r] = full.path[i];
    const cost = TERRAIN[tileAt(state,q,r).terrain].move;
    if (spent + cost > unit.mp) break;
    spent += cost; index = i;
  }
  if (index === 0) return { ok:false, reason:"移动力不足以进入下一格" };
  const [q,r] = full.path[index];
  unit.q=q; unit.r=r; unit.mp=clamp(unit.mp-spent,0,UNIT_TYPES[unit.type].mp);
  unit.route = index < full.path.length - 1 ? { q:targetQ,r:targetR } : null;
  state.exposure = clamp(state.exposure + (unit.type === "militia" ? 2 : 1),0,100);
  return { ok:true, reached:!unit.route, q, r, spent, remaining:full.path.length-index-1 };
}

function actionUnit(state, unitId, allowed, at = null) {
  const unit = getUnit(state,unitId);
  if (!unit || unit.side !== "player") return { error:"需要选择我方队伍" };
  if (unit.acted) return { error:"这支队伍本半月已经行动" };
  if (!allowed.includes(unit.type)) return { error:"这支队伍不能执行该行动" };
  if (at && (unit.q !== at.q || unit.r !== at.r)) return { error:"队伍必须位于目标格" };
  return { unit };
}

export function hardenVillage(state, villageId, unitId) {
  const village = getVillage(state,villageId);
  if (!village) return { ok:false, reason:"村庄不存在" };
  const check = actionUnit(state,unitId,["work","courier"],village);
  if (check.error) return { ok:false, reason:check.error };
  if (village.mode !== "home") return { ok:false, reason:"只有尚未坚壁的村庄可以藏粮" };
  if (state.org < 2) return { ok:false, reason:"需要2组织" };
  state.org -= 2; village.mode="hidden"; village.cache=6; village.loyalty=clamp(village.loyalty+2,0,100);
  check.unit.acted=true; check.unit.mp=0; state.stats.hidden++; state.exposure=clamp(state.exposure+2,0,100);
  addLog(state,`${village.name}封井藏粮，农具与口粮转入地窖。`);
  return { ok:true };
}

export function evacuateVillage(state, villageId, unitId) {
  const village = getVillage(state,villageId);
  if (!village) return { ok:false, reason:"村庄不存在" };
  const check = actionUnit(state,unitId,["work","courier"],village);
  if (check.error) return { ok:false, reason:check.error };
  if (!['home','hidden'].includes(village.mode)) return { ok:false, reason:"群众已经转移" };
  const orgCost = state.doctrine === "clear" ? 2 : 3;
  if (state.org < orgCost || state.grain < 2) return { ok:false, reason:`需要${orgCost}组织、2粮食` };
  state.org-=orgCost; state.grain-=2; state.refugePop+=village.pop;
  village.cache = village.mode === "hidden" ? Math.max(village.cache,6) : 2;
  village.mode="evacuated"; village.loyalty=clamp(village.loyalty+4,0,100);
  check.unit.acted=true; check.unit.mp=0; state.stats.evacuated++; state.exposure=clamp(state.exposure+3,0,100);
  addLog(state,`${village.name}${village.pop}户群众转入${REFUGES.find(r=>r.id===village.refugeId).name}，村中不留一锅一勺。`,"good");
  return { ok:true };
}

export function returnVillage(state, villageId, unitId) {
  const village=getVillage(state,villageId);
  if(!village) return {ok:false,reason:"村庄不存在"};
  const check=actionUnit(state,unitId,["work","courier"],village);
  if(check.error) return {ok:false,reason:check.error};
  if(village.mode!=="evacuated") return {ok:false,reason:"群众并未转移"};
  const danger=state.posts.some(p=>!p.withdrawn&&hexDistance(p.q,p.r,village.q,village.r)<=2) || state.units.some(u=>u.side==='enemy'&&u.type!=='convoy'&&hexDistance(u.q,u.r,village.q,village.r)<=2);
  if(danger) return {ok:false,reason:"附近仍有敌情，不能贸然回迁"};
  if(state.grain<3) return {ok:false,reason:"回迁安置需要3粮食"};
  state.grain-=3; state.refugePop=Math.max(0,state.refugePop-village.pop); village.mode="hidden";
  check.unit.acted=true; check.unit.mp=0; state.will=clamp(state.will+2,0,100);
  addLog(state,`${village.name}群众安全回迁，重新开灶复耕。`,"good");
  return {ok:true};
}

function adjacentActivePosts(state,q,r) {
  return state.posts.filter(p=>!p.withdrawn&&hexDistance(q,r,p.q,p.r)===1);
}

export function establishBlockade(state, unitId, postId = null) {
  const check=actionUnit(state,unitId,["militia","work"]);
  if(check.error) return {ok:false,reason:check.error};
  const targets=adjacentActivePosts(state,check.unit.q,check.unit.r);
  const post=postId ? targets.find(p=>p.id===postId) : targets[0];
  if(!post) return {ok:false,reason:"必须位于敌据点相邻格"};
  const tile=tileAt(state,check.unit.q,check.unit.r);
  if(tile.blockade) return {ok:false,reason:"此处已经建立封锁哨"};
  if(state.org<2||state.grain<1) return {ok:false,reason:"需要2组织、1粮食"};
  state.org-=2; state.grain-=1; tile.blockade={postId:post.id,strength:1,turn:state.turn};
  check.unit.acted=true; check.unit.mp=0; state.stats.blockadesBuilt++; state.exposure=clamp(state.exposure+5,0,100);
  addLog(state,`${post.name}外建立封锁哨，守军活动范围被进一步压缩。`);
  return {ok:true};
}

export function layMine(state, unitId) {
  const check=actionUnit(state,unitId,["mine"]);
  if(check.error) return {ok:false,reason:check.error};
  const tile=tileAt(state,check.unit.q,check.unit.r);
  if(!tile.road&&!adjacentActivePosts(state,check.unit.q,check.unit.r).length) return {ok:false,reason:"地雷应布在公路或据点外围"};
  const cost=state.doctrine==="mines"?1:2;
  if(state.material<cost) return {ok:false,reason:`需要${cost}材料`};
  const charges=state.doctrine==="mines"?3:2;
  state.material-=cost; tile.mine=clamp(tile.mine+charges,0,5);
  check.unit.acted=true; check.unit.mp=0; state.stats.minesLaid+=charges; state.exposure=clamp(state.exposure+4,0,100);
  addLog(state,`${tile.road?'公路':'据点外围'}布成雷区（${tile.mine}次引信）。`);
  return {ok:true,charges};
}

export function cutRoad(state, unitId) {
  const check=actionUnit(state,unitId,["mine","work"]);
  if(check.error) return {ok:false,reason:check.error};
  const tile=tileAt(state,check.unit.q,check.unit.r);
  if(!tile.road) return {ok:false,reason:"只有二沁公路及其支线可以破坏"};
  if(state.material<1||state.org<1) return {ok:false,reason:"需要1材料、1组织"};
  state.material--; state.org--; tile.roadCut=Math.max(tile.roadCut,state.doctrine==="mines"?5:3);
  check.unit.acted=true; check.unit.mp=0; state.stats.roadsCut++; state.exposure=clamp(state.exposure+6,0,100);
  addLog(state,`爆破队切断${tile.postId?getPost(state,tile.postId).name+'路段':'二沁公路'}，至少阻滞${tile.roadCut}个半月。`,"good");
  return {ok:true};
}

export function gatherIntel(state, unitId) {
  const check=actionUnit(state,unitId,["courier"]);
  if(check.error) return {ok:false,reason:check.error};
  const tile=tileAt(state,check.unit.q,check.unit.r);
  const bonus=tile.terrain==='ridge'||tile.terrain==='forest'?1:0;
  state.intel=clamp(state.intel+2+bonus,0,CFG.maxResource); state.revealUntil=Math.max(state.revealUntil,state.turn+2);
  check.unit.acted=true; check.unit.mp=0; state.exposure=clamp(state.exposure+1,0,100);
  addLog(state,"消息树与交通线接通：未来两回合敌军行踪完全可见。","intel");
  return {ok:true,gained:2+bonus};
}

export function propaganda(state, unitId, postId = null) {
  const check=actionUnit(state,unitId,["work","courier"]);
  if(check.error) return {ok:false,reason:check.error};
  const targets=adjacentActivePosts(state,check.unit.q,check.unit.r);
  const post=postId?targets.find(p=>p.id===postId):targets[0];
  if(!post) return {ok:false,reason:"必须靠近据点才能开展喊话、送信与争取工作"};
  if(state.intel<2||state.org<1) return {ok:false,reason:"需要2情报、1组织"};
  let damage=9+(state.doctrine==='political'?6:0)-(state.doctrine==='mines'?3:0);
  damage=Math.max(4,damage); state.intel-=2; state.org--; post.resolve=clamp(post.resolve-damage,0,post.initialResolve); post.persuasion+=damage;
  if(post.persuasion>=24){post.persuasion-=24;post.garrison=clamp(post.garrison-9,0,post.initialGarrison);state.stats.persuaded++;addLog(state,`${post.name}内伪军出现动摇，守备力量减员。`,"good");}
  check.unit.acted=true; check.unit.mp=0; state.exposure=clamp(state.exposure+4,0,100);
  addLog(state,`向${post.name}发动政治攻势，守备意志-${damage}。`);
  checkWithdrawals(state);
  return {ok:true,damage};
}

export function postMetric(state, post) {
  if(post.withdrawn) return {isolation:6,blockades:0,roadConnected:false,nearDenial:0};
  const blockades=neighbors(post.q,post.r).map(([q,r])=>tileAt(state,q,r).blockade).filter(b=>b&&b.postId===post.id).length;
  const path=SUPPLY_PATHS[post.id];
  const roadConnected=!path.some(([q,r])=>tileAt(state,q,r).roadCut>0);
  const nearDenial=state.villages.filter(v=>hexDistance(v.q,v.r,post.q,post.r)<=2).reduce((sum,v)=>sum+(v.mode==='evacuated'?1:v.mode==='hidden'?.5:0),0);
  let isolation=blockades+(roadConnected?0:2)+Math.min(2,Math.floor(nearDenial/1.5))+(post.supply<18?1:0);
  return {isolation:clamp(isolation,0,6),blockades,roadConnected,nearDenial};
}

export function computeSiege(state) {
  const active=state.posts.filter(p=>!p.withdrawn);
  const metrics=state.posts.map(post=>({post,...postMetric(state,post)}));
  const occupation=state.posts.reduce((sum,p)=>{
    if(p.withdrawn)return sum;
    return sum+((p.supply/p.initialSupply)*.52+(p.resolve/p.initialResolve)*.34+(p.garrison/p.initialGarrison)*.14)*100;
  },0)/state.posts.length;
  const denial=state.villages.reduce((sum,v)=>sum+(v.mode==='evacuated'?1:v.mode==='hidden'?.5:0),0)/state.villages.length*100;
  const roads=state.tiles.flat().filter(t=>t.road&&(t.roadCut>0||t.mine>0)).length;
  return {
    occupation:clamp(Math.round(occupation),0,100),
    score:clamp(Math.round(100-occupation),0,100),
    denial:Math.round(denial),
    roads,
    withdrawn:state.posts.length-active.length,
    totalIsolation:metrics.reduce((sum,m)=>sum+(m.post.withdrawn?0:m.isolation),0),
    metrics,
  };
}

export function attackPreview(state, attackerId, defenderId) {
  const attacker=getUnit(state,attackerId), defender=getUnit(state,defenderId);
  if(!attacker||!defender) return null;
  let strength=UNIT_TYPES[attacker.type].strength;
  if(attacker.type==='militia'&&state.doctrine==='sparrow') strength*=1.35;
  if(attacker.type==='militia'&&state.doctrine==='political') strength*=.8;
  const defense=UNIT_TYPES[defender.type].strength+TERRAIN[tileAt(state,defender.q,defender.r).terrain].defense;
  return {attacker,defender,damage:clamp(Math.round(24+strength-defense*.45),10,60),retaliation:clamp(Math.round(13+defense*.35-strength*.25),4,35)};
}

function removeUnit(state,unit) { state.units=state.units.filter(u=>u.id!==unit.id); }

export function attackUnit(state, attackerId, defenderId) {
  const preview=attackPreview(state,attackerId,defenderId);
  if(!preview) return {ok:false,reason:"目标不存在"};
  const {attacker,defender}=preview;
  if(attacker.side!=='player'||defender.side!=='enemy') return {ok:false,reason:"目标关系错误"};
  if(attacker.acted) return {ok:false,reason:"本半月已经行动"};
  if(!['militia','mine'].includes(attacker.type)) return {ok:false,reason:"该队伍不适合伏击"};
  if(hexDistance(attacker.q,attacker.r,defender.q,defender.r)!==1) return {ok:false,reason:"必须与目标相邻"};
  const swing=randomInt(state,-4,5), damage=clamp(preview.damage+swing,7,65), retaliation=clamp(preview.retaliation-randomInt(state,0,4),2,35);
  defender.hp-=damage; attacker.hp-=retaliation; attacker.acted=true; attacker.mp=0; attacker.xp+=damage;
  state.exposure=clamp(state.exposure+(state.doctrine==='sparrow'?5:9),0,100);
  if(defender.hp<=0){
    if(defender.type==='convoy'){state.stats.convoysStopped++;addLog(state,`补给队被截停，${defender.cargo||30}份军需未能进入据点。`,"good");}
    else {state.stats.patrolsDefeated++;addLog(state,`${defender.name}被伏击击溃。`,"good");}
    removeUnit(state,defender);
  } else addLog(state,`${attacker.name}伏击${defender.name}：敌-${damage}，我-${retaliation}。`);
  if(attacker.hp<=0){state.stats.civiliansLost++;removeUnit(state,attacker);state.will=clamp(state.will-8,0,100);}
  return {ok:true,damage,retaliation,defeated:defender.hp<=0};
}

export function raidPost(state, unitId, postId = null) {
  const check=actionUnit(state,unitId,["militia"]);
  if(check.error)return {ok:false,reason:check.error};
  const targets=adjacentActivePosts(state,check.unit.q,check.unit.r);
  const post=postId?targets.find(p=>p.id===postId):targets[0];
  if(!post)return {ok:false,reason:"必须位于据点相邻格"};
  const metric=postMetric(state,post);
  if(post.supply>35&&metric.isolation<3)return {ok:false,reason:"据点补给与火力完整，强攻只会替敌人解决问题；先断路围困"};
  let force=18+metric.isolation*4+(state.doctrine==='sparrow'?5:0)-(state.doctrine==='political'?4:0);
  const damage=clamp(force+randomInt(state,-3,4),10,48), retaliation=clamp(Math.round(post.garrison/8)-metric.isolation*2+randomInt(state,0,4),3,28);
  post.garrison=clamp(post.garrison-damage,0,post.initialGarrison);post.supply=clamp(post.supply-7,0,post.initialSupply);post.resolve=clamp(post.resolve-5,0,post.initialResolve);
  check.unit.hp-=retaliation;check.unit.acted=true;check.unit.mp=0;state.stats.raids++;state.exposure=clamp(state.exposure+12,0,100);
  addLog(state,`${check.unit.name}趁${post.name}虚弱实施袭扰，守军-${damage}。`);
  if(check.unit.hp<=0){removeUnit(state,check.unit);state.will=clamp(state.will-8,0,100);state.stats.civiliansLost++;}
  checkWithdrawals(state);
  return {ok:true,damage,retaliation};
}

export function fortifyUnit(state, unitId) {
  const unit=getUnit(state,unitId);
  if(!unit||unit.side!=='player')return {ok:false,reason:"队伍不存在"};
  if(unit.acted)return {ok:false,reason:"本半月已经行动"};
  unit.acted=true;unit.mp=0;unit.fortified=true;unit.hp=clamp(unit.hp+6,0,100);
  state.exposure=clamp(state.exposure-3,0,100);
  return {ok:true};
}

export function changeDoctrine(state, key) {
  if(!DOCTRINES[key])return {ok:false,reason:"未知方略"};
  if(state.doctrine===key)return {ok:false,reason:"当前已经执行该方略"};
  if(state.doctrineCooldown>0)return {ok:false,reason:`还需等待${state.doctrineCooldown}回合才能调整方略`};
  if(state.org<5)return {ok:false,reason:"调整全县方略需要5组织"};
  state.org-=5;state.doctrine=key;state.doctrineCooldown=4;state.exposure=clamp(state.exposure+2,0,100);
  addLog(state,`围困指挥部转入“${DOCTRINES[key].name}”方略。`,"chapter");
  return {ok:true};
}

function damageByMine(state,unit) {
  const tile=tileAt(state,unit.q,unit.r);
  if(!tile.mine)return false;
  const damage=unit.type==='convoy'?58:42;
  tile.mine--;unit.hp-=damage;state.stats.minesTriggered++;
  addLog(state,`${unit.name}在${tile.road?'公路':'山口'}触雷，损失${damage}。`,"good");
  if(unit.hp<=0){
    if(unit.type==='convoy')state.stats.convoysStopped++;else state.stats.patrolsDefeated++;
    removeUnit(state,unit);return true;
  }
  return false;
}

function spawnConvoy(state, forced = false) {
  if(state.units.some(u=>u.type==='convoy'))return null;
  const targets=state.posts.filter(p=>!p.withdrawn).sort((a,b)=>(a.supply/a.initialSupply)-(b.supply/b.initialSupply));
  const target=targets[0];
  if(!target)return null;
  if(!forced&&state.turn%6!==3&&target.supply>target.initialSupply*.55)return null;
  const path=SUPPLY_PATHS[target.id].map(([q,r])=>({q,r}));
  const convoy=addUnit(state,{type:'convoy',side:'enemy',name:`增援${target.name}的补给队`,q:path[0].q,r:path[0].r,hp:100,targetPostId:target.id,path,pathIndex:0,cargo:32});
  addLog(state,`情报：敌军从沁县方向组织车马，目标可能是${target.name}。`,"enemy");
  return convoy;
}

function advanceConvoys(state) {
  for(const convoy of [...state.units.filter(u=>u.type==='convoy')]){
    const path=convoy.path;if(!path||convoy.pathIndex>=path.length-1)continue;
    const next=path[convoy.pathIndex+1],tile=tileAt(state,next.q,next.r);
    if(tile.roadCut>0){
      if(state.enemyIntent.kind==='clear'&&rand(state)<.42){tile.roadCut=Math.max(0,tile.roadCut-2);addLog(state,"敌工兵抢修被破坏的公路。","enemy");}
      else addLog(state,`${convoy.name}被断路阻滞。`,"good");
      continue;
    }
    const player=unitAt(state,next.q,next.r,'player');
    if(player){addLog(state,`${convoy.name}发现我方队伍，停止前进并呼叫护路队。`,"enemy");continue;}
    convoy.q=next.q;convoy.r=next.r;convoy.pathIndex++;
    if(damageByMine(state,convoy))continue;
    if(convoy.pathIndex===path.length-1){
      const post=getPost(state,convoy.targetPostId);
      if(post&&!post.withdrawn){post.supply=clamp(post.supply+convoy.cargo,0,post.initialSupply);post.resolve=clamp(post.resolve+7,0,post.initialResolve);state.stats.convoysArrived++;addLog(state,`补给抵达${post.name}，此前的围困成果被部分抵消。`,"bad");}
      removeUnit(state,convoy);
    }
  }
}

function choosePatrolTarget(state,post) {
  const candidates=state.villages.filter(v=>hexDistance(v.q,v.r,post.q,post.r)<=5);
  const weighted=[...candidates].sort((a,b)=>{
    const score=v=>(v.mode==='home'?0:v.mode==='hidden'?8:16)+hexDistance(post.q,post.r,v.q,v.r)+v.searched*2;
    return score(a)-score(b);
  });
  return weighted[0]||state.villages[0];
}

function spawnPatrol(state, forced = false) {
  const count=state.units.filter(u=>u.side==='enemy'&&['patrol','escort'].includes(u.type)).length;
  if(count>=3||(!forced&&state.turn%4!==0))return null;
  const posts=state.posts.filter(p=>!p.withdrawn);
  if(!posts.length)return null;
  const post=posts.sort((a,b)=>b.supply-a.supply)[Math.floor(rand(state)*posts.length)];
  const target=choosePatrolTarget(state,post),type=state.enemyIntent.kind==='clear'?'escort':'patrol';
  return addUnit(state,{type,side:'enemy',name:`${post.name}${type==='escort'?'护路队':'征粮巡逻队'}`,q:post.q,r:post.r,hp:type==='escort'?90:72,originPostId:post.id,targetVillageId:target.id});
}

function enemyAttack(state,enemy,player) {
  const e=UNIT_TYPES[enemy.type].strength,p=UNIT_TYPES[player.type].strength+(player.fortified?8:0)+TERRAIN[tileAt(state,player.q,player.r).terrain].defense;
  const damage=clamp(Math.round(18+e*.45-p*.2)+randomInt(state,-3,4),7,32);
  player.hp-=damage;addLog(state,`${enemy.name}袭击${player.name}，我方损失${damage}。`,"bad");
  if(player.hp<=0){removeUnit(state,player);state.will=clamp(state.will-8,0,100);state.stats.civiliansLost++;}
}

function resolveSearch(state,patrol,village) {
  const post=getPost(state,patrol.originPostId);
  village.searched++;
  if(village.mode==='home'){
    const reduction=state.doctrine==='clear'?3:6;
    const stolen=Math.min(reduction,state.grain);state.grain-=stolen;if(post)post.supply=clamp(post.supply+stolen,0,post.initialSupply);
    village.loyalty=clamp(village.loyalty-4,0,100);state.will=clamp(state.will-5,0,100);state.stats.requisitions++;
    addLog(state,`${patrol.name}闯入${village.name}征粮，夺走${stolen}粮食。`,"bad");
  }else if(village.mode==='hidden'){
    const found=rand(state)<(.28+state.exposure/250);
    if(found&&village.cache>0){const stolen=Math.min(3,village.cache);village.cache-=stolen;if(post)post.supply=clamp(post.supply+stolen,0,post.initialSupply);state.will=clamp(state.will-2,0,100);addLog(state,`${village.name}一处地窖被搜出，损失${stolen}份藏粮。`,"bad");}
    else {if(post)post.resolve=clamp(post.resolve-3,0,post.initialResolve);state.stats.emptySearches++;addLog(state,`${patrol.name}在${village.name}搜查无获。`,"good");}
  }else{
    if(post){post.supply=clamp(post.supply-2,0,post.initialSupply);post.resolve=clamp(post.resolve-5,0,post.initialResolve);}
    state.stats.emptySearches++;addLog(state,`${patrol.name}进入空无一人的${village.name}，一粒粮也未找到。`,"good");
  }
  removeUnit(state,patrol);
}

function advancePatrols(state) {
  for(const patrol of [...state.units.filter(u=>u.side==='enemy'&&['patrol','escort'].includes(u.type))]){
    const target=getVillage(state,patrol.targetVillageId);
    if(!target){removeUnit(state,patrol);continue;}
    let stopped=false;
    for(let step=0;step<UNIT_TYPES[patrol.type].mp&&!stopped;step++){
      const player=neighbors(patrol.q,patrol.r).map(([q,r])=>unitAt(state,q,r,'player')).find(Boolean);
      if(player&&(state.enemyIntent.kind==='sweep'||rand(state)<.24)){enemyAttack(state,patrol,player);stopped=true;break;}
      const path=shortestPath(state,patrol,target.q,target.r,99,{enemy:true});
      if(!path||path.path.length<2){stopped=true;break;}
      const [q,r]=path.path[1];patrol.q=q;patrol.r=r;
      if(damageByMine(state,patrol)){stopped=true;break;}
      if(q===target.q&&r===target.r){resolveSearch(state,patrol,target);stopped=true;}
    }
  }
}

function chooseEnemyIntent(state) {
  const siege=computeSiege(state),active=state.posts.filter(p=>!p.withdrawn);
  const avgSupply=active.length?active.reduce((s,p)=>s+p.supply/p.initialSupply,0)/active.length:0;
  const mineTiles=state.tiles.flat().filter(t=>t.mine||t.roadCut).length;
  const evacuated=state.villages.filter(v=>v.mode==='evacuated').length;
  let intent;
  if(avgSupply<.45||state.turn%9===3) intent={kind:'supply',name:'重点输送',detail:'据点军需吃紧，敌军将从沁县方向强送补给。',turns:4};
  else if(mineTiles>=3) intent={kind:'clear',name:'护路清障',detail:'工兵与护路队将优先清除断路和雷区。',turns:4};
  else if(evacuated>=4) intent={kind:'sweep',name:'搜山扫荡',detail:'乡村已经搬空，敌军转而搜寻工作队和山中交通线。',turns:4};
  else if(siege.totalIsolation>=6) intent={kind:'shrink',name:'收缩固守',detail:'外围活动受限，守军收缩兵力并试图拔除封锁哨。',turns:4};
  else intent={kind:'coerce',name:'逼建维持',detail:'敌军将选择仍有人烟的村庄威逼征粮、制造动摇。',turns:4};
  state.enemyIntent=intent;
}

function countermeasure(state) {
  const intent=state.enemyIntent.kind;
  if(intent==='clear'){
    const targets=state.tiles.flat().filter(t=>t.roadCut>0||t.mine>0);
    const tile=targets.sort((a,b)=>(b.roadCut+b.mine)-(a.roadCut+a.mine))[0];
    if(tile&&rand(state)<.52){if(tile.roadCut>0)tile.roadCut--;else tile.mine--;addLog(state,"敌工兵清除了一处交通障碍。","enemy");}
  } else if(intent==='shrink'){
    const targets=state.tiles.flat().filter(t=>t.blockade);
    const tile=targets[Math.floor(rand(state)*targets.length)];
    if(tile&&rand(state)<.45+state.exposure/300){addLog(state,`${getPost(state,tile.blockade.postId)?.name||'据点'}守军拔除一处封锁哨。`,"enemy");tile.blockade=null;}
  } else if(intent==='sweep'&&state.exposure>=45){
    const targets=state.units.filter(u=>u.side==='player').sort((a,b)=>a.hp-b.hp);
    const unit=targets[0];
    if(unit&&rand(state)<state.exposure/130){const damage=randomInt(state,8,18);unit.hp-=damage;state.exposure=clamp(state.exposure-12,0,100);addLog(state,`${unit.name}的隐蔽地遭到搜山，损失${damage}。`,"bad");if(unit.hp<=0){removeUnit(state,unit);state.will=clamp(state.will-8,0,100);state.stats.civiliansLost++;}}
  } else if(intent==='coerce'){
    const target=state.villages.filter(v=>v.mode==='home').sort((a,b)=>a.loyalty-b.loyalty)[0];
    if(target){target.loyalty=clamp(target.loyalty-2,0,100);if(target.loyalty<45)state.will=clamp(state.will-2,0,100);}
  }
}

function postAttrition(state) {
  for(const post of state.posts.filter(p=>!p.withdrawn)){
    const metric=postMetric(state,post);
    let supplyLoss=1+Math.max(0,metric.isolation-1);
    if(state.doctrine==='production')supplyLoss=Math.max(1,supplyLoss-1);
    post.supply=clamp(post.supply-supplyLoss,0,post.initialSupply);
    const resolveLoss=Math.max(0,metric.isolation-2)+(metric.nearDenial>=2?1:0);
    post.resolve=clamp(post.resolve-resolveLoss,0,post.initialResolve);
    post.siegeStreak=metric.isolation>=3?post.siegeStreak+1:Math.max(0,post.siegeStreak-1);
  }
  checkWithdrawals(state);
}

function withdrawPost(state,post) {
  post.withdrawn=true;post.withdrewTurn=state.turn;state.stats.withdrawn++;state.will=clamp(state.will+8,0,100);state.org=clamp(state.org+3,0,CFG.maxResource);
  for(const unit of [...state.units.filter(u=>u.side==='enemy'&&u.originPostId===post.id)])removeUnit(state,unit);
  for(const tile of state.tiles.flat())if(tile.blockade?.postId===post.id)tile.blockade=null;
  addLog(state,`${post.name}守军烧毁物资、收缩撤离。这里不是被攻下的，是被围得待不下去。`,"chapter");
}

function checkWithdrawals(state) {
  const outWithdrawn=state.posts.filter(p=>p.type==='outpost'&&p.withdrawn).length;
  for(const post of state.posts.filter(p=>!p.withdrawn)){
    const metric=postMetric(state,post);
    const broken=post.resolve<=0||(post.supply<=0&&post.resolve<=38)||(post.supply<18&&post.siegeStreak>=3&&post.resolve<=48)||(post.garrison<=15&&post.supply<=25);
    if(!broken)continue;
    if(post.type==='town'&&outWithdrawn<2)continue;
    withdrawPost(state,post);
  }
}

function monthlyEconomy(state) {
  let yieldGrain=0,orgGain=0;
  for(const village of state.villages){
    if(village.mode==='home')yieldGrain+=3;
    else if(village.mode==='hidden')yieldGrain+=2;
    if(village.loyalty>=65)orgGain+=.45;
  }
  let burden=Math.ceil(state.refugePop/18);
  if(state.doctrine==='clear')burden++;
  if(state.doctrine==='sparrow')burden+=2;
  if(state.doctrine==='production'){yieldGrain+=4;state.refugeCondition=clamp(state.refugeCondition+3,0,100);}
  const net=Math.floor(yieldGrain)-burden;
  state.grain=clamp(state.grain+net,0,CFG.maxResource);
  state.org=clamp(state.org+Math.max(1,Math.floor(orgGain)),0,CFG.maxResource);
  state.material=clamp(state.material+2,0,CFG.maxResource);
  if(state.grain===0&&burden>yieldGrain){state.refugeCondition=clamp(state.refugeCondition-8,0,100);state.will=clamp(state.will-6,0,100);addLog(state,"山中安置点缺粮，群众生活陷入困难。","bad");}
  else if(state.refugePop>0){state.refugeCondition=clamp(state.refugeCondition+1,0,100);}
  if(state.refugeCondition<45)state.will=clamp(state.will-2,0,100);
  else if(state.stats.withdrawn>0)state.will=clamp(state.will+1,0,100);
  addLog(state,`月度结算：生产${Math.floor(yieldGrain)}粮，山中安置消耗${burden}，材料+2。`,net>=0?'normal':'bad');
}

function processEnemy(state) {
  state.enemyIntent.turns--;
  if(state.enemyIntent.turns<=0)chooseEnemyIntent(state);
  spawnConvoy(state,state.enemyIntent.kind==='supply');
  spawnPatrol(state,state.enemyIntent.kind==='sweep'||state.enemyIntent.kind==='coerce');
  advanceConvoys(state);
  advancePatrols(state);
  countermeasure(state);
  postAttrition(state);
}

function chapterTransition(state,nextTurn) {
  const nextIndex=chapterIndex(nextTurn);
  if(nextIndex!==state.chapterSeen){
    state.chapterSeen=nextIndex;state.org=clamp(state.org+3,0,CFG.maxResource);
    addLog(state,`战役进入“${CHAPTERS[nextIndex].title}”：${CHAPTERS[nextIndex].story}`,"chapter");
  }
}

function finish(state,kind,title,detail) { state.over=true;state.result={kind,title,detail,turn:state.turn,stats:{...state.stats}}; }

function checkEnding(state) {
  if(state.posts.every(p=>p.withdrawn)){finish(state,'victory','沁源光复：占领者自行撤离',`经过${state.turn}个半月的围困，敌军失去乡野、补给与守备意志。你没有用一次昂贵的总攻替敌人解决困境。`);return;}
  if(state.will<=0){finish(state,'defeat','民心熄灭：围困网络瓦解','群众承受的损失和安置压力超过极限。反向围城的城墙不是砖石，而是共同意志。');return;}
  if(state.refugeCondition<=0){finish(state,'defeat','山中失守：群众无法继续安置','空室清野只完成了“空室”，却没能解决山中群众的生产和生活。');return;}
  if(state.turn>=CFG.totalTurns){
    const withdrawn=state.posts.filter(p=>p.withdrawn).length;
    if(getPost(state,'town').withdrawn)finish(state,'victory','沁源光复','县城守军已经撤离，围困取得决定性胜利。');
    else finish(state,'defeat',`围困未竟：${withdrawn}/4处据点撤离`,'1945年4月已至，县城仍能维持占领。回看围困账：是哪一环没有转化为敌人的实际成本？');
  }
}

export function endTurn(state) {
  if(state.over)return {ok:false,reason:"战役已经结束"};
  processEnemy(state);
  if(state.turn%CFG.turnsPerMonth===0)monthlyEconomy(state);
  for(const tile of state.tiles.flat())if(tile.roadCut>0)tile.roadCut--;
  state.doctrineCooldown=Math.max(0,state.doctrineCooldown-1);
  state.exposure=clamp(state.exposure-5,0,100);
  checkEnding(state);
  if(state.over)return {ok:true,over:true};
  const next=state.turn+1;chapterTransition(state,next);state.turn=next;
  for(const unit of state.units.filter(u=>u.side==='player')){unit.mp=UNIT_TYPES[unit.type].mp;unit.acted=false;unit.fortified=false;}
  return {ok:true,over:false};
}

export function goalProgress(state,goal) {
  const siege=computeSiege(state);
  switch(goal.type){
    case 'hidden':return state.villages.filter(v=>v.mode==='hidden'||v.mode==='evacuated'&&v.cache>=6).length;
    case 'evacuated':return state.villages.filter(v=>v.mode==='evacuated').length;
    case 'convoysStopped':return state.stats.convoysStopped;
    case 'roadsCut':return state.stats.roadsCut;
    case 'withdrawn':return siege.withdrawn;
    case 'persuaded':return state.stats.persuaded;
    case 'isolation':return siege.totalIsolation;
    case 'will':return state.will;
    default:return 0;
  }
}

export function objectiveStatus(state,chapter=CHAPTERS[chapterIndex(state.turn)]) {
  return chapter.goals.map(goal=>{const progress=goalProgress(state,goal);return {...goal,progress,done:progress>=goal.target};});
}

export function serializeGame(state) { return JSON.stringify(state); }

export function deserializeGame(text) {
  const state=JSON.parse(text);
  if(!state||state.version!==CFG.version)throw new Error("存档版本不兼容");
  const errors=invariantChecks(state);if(errors.length)throw new Error(`存档损坏：${errors.join('；')}`);
  return state;
}

export function invariantChecks(state) {
  const errors=[];
  if(!state||state.version!==CFG.version)errors.push('版本错误');
  if(!Array.isArray(state?.tiles)||state.tiles.length!==CFG.mapW||state.tiles.some(col=>!Array.isArray(col)||col.length!==CFG.mapH))errors.push('地图尺寸错误');
  if(!Array.isArray(state?.villages)||state.villages.length!==VILLAGES.length)errors.push('村庄数量错误');
  if(!Array.isArray(state?.posts)||state.posts.length!==POSTS.length)errors.push('据点数量错误');
  if(!Number.isInteger(state?.turn)||state.turn<1||state.turn>CFG.totalTurns)errors.push('回合错误');
  for(const key of ['grain','org','intel','material','will','refugeCondition','refugePop','exposure'])if(!Number.isFinite(state?.[key])||state[key]<0)errors.push(`${key}非法`);
  const ids=new Set();
  for(const unit of state?.units||[]){if(ids.has(unit.id))errors.push('单位ID重复');ids.add(unit.id);if(!UNIT_TYPES[unit.type])errors.push('单位类型错误');if(!inBounds(unit.q,unit.r))errors.push('单位越界');if(!Number.isFinite(unit.hp))errors.push('单位生命非法');}
  for(const village of state?.villages||[]){if(!['home','hidden','evacuated'].includes(village.mode))errors.push('村庄状态错误');if(!inBounds(village.q,village.r))errors.push('村庄越界');}
  for(const post of state?.posts||[]){if(!inBounds(post.q,post.r))errors.push('据点越界');if(post.supply<0||post.resolve<0||post.garrison<0)errors.push('据点数值为负');}
  const expectedRefuge=(state?.villages||[]).filter(v=>v.mode==='evacuated').reduce((sum,v)=>sum+v.pop,0);
  if(state?.refugePop!==expectedRefuge)errors.push('转移人口账目不一致');
  if(!DOCTRINES[state?.doctrine])errors.push('方略错误');
  return [...new Set(errors)];
}
