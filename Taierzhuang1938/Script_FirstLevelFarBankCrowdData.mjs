// Data_FirstLevelFarBankCrowd.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { FarBankShoreZ } from "./Data_FirstLevelBridgeFarBank.mjs";
import { DescentTrailX, FAR_BANK_CROWD_AXIS_X, FAR_BANK_CROWD_BRIDGE, FAR_BANK_CROWD_GAP_HALF_M, FAR_BANK_CROWD_HILL_EXIT, FAR_BANK_CROWD_HILL_SPAWN, FAR_BANK_CROWD_HILL_X, FAR_BANK_CROWD_KEEPOUT, FAR_BANK_CROWD_RANKS, FAR_BANK_CROWD_RESERVE, FAR_BANK_CROWD_SLOPE_RANKS, FAR_BANK_CROWD_SLOPE_X_MIN, FAR_BANK_CROWD_X, FAR_BANK_DECK, R2_POSTS, RIDGES, TANK_POSTS } from "./Data_FirstLevelFarBankCrowd.mjs";

/**
 * 站的地面高度：桥面上取桥面高度（河床在下面几米），其余走传进来的地形函数。纯函数。
 */
export function CrowdGroundY(x, z, terrain) {
  if (Math.abs(x - FAR_BANK_DECK.x) <= FAR_BANK_DECK.halfW + 0.2 && z >= FAR_BANK_DECK.z0 && z <= FAR_BANK_DECK.z1) return FAR_BANK_DECK.topY;
  return terrain(x, z);
}

function Rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const NearRidge = (x, z) => z > 80.6 && z < 83.8 && RIDGES.some(([a, b]) => x > a - 0.8 && x < b + 0.8);

const Pick = (rnd, table) => { let r = rnd() * table.reduce((a, [, w]) => a + w, 0); for (const [name, w] of table) { r -= w; if (r <= 0) return name; } return table[0][0]; };

/**
 * 路线：spawn → 自己的位。返回 { spawn, route }（route 是途经点，不含出生点、含终点）。
 * lane = 路堤上的横向偏移（±2.4 m 内错开，一队不是一条线）。
 */
/** 沿岸沿走的走廊：从 x0 到 x1，每 8 m 一个点，贴着岸沿以北 3.2 m（岸沿随 R1a 的岸线起伏，空气墙压在岸沿上）。 */
function Corridor(x0, x1) {
  const pts = [], n = Math.max(1, Math.ceil(Math.abs(x1 - x0) / 8));
  for (let k = 1; k <= n; k++) { const x = x0 + (x1 - x0) * k / n; pts.push({ x, z: FarBankShoreZ(x) - 3.2 }); }
  return pts;
}

/** 坡顶下来的人：巷口出口 → 沿踩道下到自己那一排的 z → 横着走到位。岸线上的人（z 81 以南）走到踩道 z 76 处再斜插到位。 */
function HillRoute(post, rnd) {
  const exit = FAR_BANK_CROWD_HILL_EXIT, spawn = FAR_BANK_CROWD_HILL_SPAWN;
  const start = { x: spawn.x + (rnd() - 0.5) * 2 * spawn.spread, z: spawn.z };
  const zRow = Math.min(post.z, 76);
  const via = zRow > exit.z + 0.5 ? [{ x: DescentTrailX(zRow) + (rnd() - 0.5) * 1.6, z: zRow }] : [];
  return { spawn: start, route: [{ x: exit.x + (start.x - spawn.x), z: exit.z }, ...via, { x: post.x, z: post.z }] };
}

function RouteFor(kind, post, lane, rnd) {
  const ax = FAR_BANK_CROWD_AXIS_X, shore = FarBankShoreZ(ax);
  const down = { x: ax + lane, z: shore - 18 };            // z 72：路堤上、土坎以北
  if (kind === "slope" || (kind === "shore" && post.x < ax - 17)) return HillRoute(post, rnd);
  if (kind === "bridge") return { spawn: null, route: [down, { x: post.x, z: FAR_BANK_DECK.z0 + 2.5 }, { x: post.x, z: post.z }] };
  if (kind === "reserve") return { spawn: null, route: [{ x: ax + lane * 0.6, z: Math.min(post.z, shore - 20) }, { x: post.x, z: post.z }] };
  const gate = { x: ax, z: shore - 5.5 };                  // z 84.5：缺口南口（土坎南脸 z 82.8 以南）
  if (post.x > ax + 17) return { spawn: null, route: [down, gate, { x: -60, z: FarBankShoreZ(-60) - 3.2 }, ...Corridor(-60, post.x), { x: post.x, z: post.z }] };
  return { spawn: null, route: [down, gate, { x: post.x, z: post.z }] };
}

/**
 * 名册（确定性）。字段：
 *   id, kind, pose（stand|kneel|prone）, post {x,z,yaw}, spawn（null = 桥轴路堤上的默认出生点，或 {x,z}）, route（途经点，含终点）, lane,
 *   wave（cover|fire|withdraw|blast）, order（本拨内的序号）, flag（举旗）, sword（举刀）, pace（留守踱步）, crest（坡顶前沿那一排）, scale。
 */
export function BuildFarBankCrowdRoster(seed = 0x18B2B) {
  const rnd = Rng(seed);
  const units = [];
  const add = (kind, post, pose, extra = {}) => {
    // 拒绝：压真 AI 名册位、贴土坎、压树、贴车、与已有的人挤在 0.85 m 内（留守随机撒点，岸线 / 桥头按格子摆，间距本来就够）
    if (R2_POSTS.some((p) => Math.hypot(p.x - post.x, p.z - post.z) < 1.4) || NearRidge(post.x, post.z)) return false;
    if (FAR_BANK_CROWD_KEEPOUT.some(([x, z, r]) => Math.hypot(x - post.x, z - post.z) < r)) return false;
    if ((kind === "reserve" || kind === "slope") && TANK_POSTS.some((t) => Math.hypot(t.x - post.x, t.z - post.z) < 3.4)) return false;
    if (kind === "shore" && TANK_POSTS.some((t) => Math.hypot(t.x - post.x, t.z - post.z) < 2.6)) return false;
    if (units.some((u) => Math.hypot(u.post.x - post.x, u.post.z - post.z) < 0.85)) return false;
    const lane = (rnd() - 0.5) * 4.8, { rankScale = 1.0, ...rest } = extra;
    units.push({ id: `FarBankCrowd${units.length}`, kind, pose, post: { x: +post.x.toFixed(2), z: +post.z.toFixed(2), yaw: post.yaw ?? Math.PI + (rnd() - 0.5) * 0.35 },
      lane: +lane.toFixed(2), spawn: null, route: null, wave: null, order: 0, flag: false, sword: false, pace: false, crest: false,
      scale: +(rankScale + rnd() * 0.1).toFixed(3), ...rest });
    return true;
  };
  // 岸线排（平的岸台）
  const [xMin, xMax] = FAR_BANK_CROWD_X;
  FAR_BANK_CROWD_RANKS.forEach((rank, ri) => {
    for (let x = xMin + rnd() * rank.gap + ri * 0.7; x <= xMax; x += rank.gap * (0.85 + rnd() * 0.3)) {
      if (Math.abs(x - FAR_BANK_CROWD_AXIS_X) < FAR_BANK_CROWD_GAP_HALF_M) continue;
      if (!rank.hillSide && x < FAR_BANK_CROWD_HILL_X) continue;
      const post = { x, z: FarBankShoreZ(x) - rank.back - (rnd() - 0.5) * 0.5 };
      add("shore", post, Pick(rnd, rank.poses));
    }
  });
  // 坡地八排
  FAR_BANK_CROWD_SLOPE_RANKS.forEach((rank, ri) => {
    for (let x = FAR_BANK_CROWD_SLOPE_X_MIN + rnd() * rank.gap + (ri % 2) * rank.gap * 0.5; x <= rank.xMax; x += rank.gap * (0.85 + rnd() * 0.3)) {
      add("slope", { x, z: rank.z + (rnd() - 0.5) * 0.8 }, Pick(rnd, rank.poses), { crest: !!rank.crest, rankScale: rank.scale });
    }
  });
  // 桥头纵队：两列，前排（z 大）跪、后排站
  const B = FAR_BANK_CROWD_BRIDGE;
  for (const [li, side] of [-1, 1].entries()) {
    for (let z = B.frontZ - li * 0.6, k = 0; z >= B.z0; z -= B.gapM, k++) add("bridge", { x: FAR_BANK_CROWD_AXIS_X + side * B.laneM, z, yaw: Math.PI }, k < 4 ? "kneel" : "stand");
  }
  // 留守：一堆一堆的站着、踱步
  for (const [cx, cz, n] of FAR_BANK_CROWD_RESERVE) {
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 24; tries++) {
        const a = rnd() * Math.PI * 2, r = 0.8 + rnd() * 4.2;
        if (add("reserve", { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r * 0.8 }, "stand", { pace: true })) break;
      }
    }
  }
  // 旗与刀：旗一律举在站着的人手里 —— 坡顶前沿那一排每三个一面（映在天上，最先读出「军队」），其余站姿的人每十个一面，桥头前排一面；
  // 刀在坡顶前沿（每四个一把）、桥头前排、路堤上的留守。总数封顶（旗 ≤ 28、刀 ≤ 14）：每面旗与每把刀是一个普通 Mesh 一次 draw。
  const crest = units.filter((u) => u.crest && u.pose === "stand");
  crest.forEach((u, i) => { if (i % 3 === 1) u.flag = true; });
  const stand = units.filter((u) => u.pose === "stand" && !u.crest && (u.kind === "shore" || u.kind === "reserve" || u.kind === "slope"));
  stand.forEach((u, i) => { if (i % 10 === 6) u.flag = true; });
  const bridgeFront = units.filter((u) => u.kind === "bridge").sort((a, b) => b.post.z - a.post.z);
  if (bridgeFront[2]) bridgeFront[2].flag = true;
  for (const u of bridgeFront.slice(0, 2)) u.sword = true;
  crest.forEach((u, i) => { if (i % 4 === 2 && !u.flag) u.sword = true; });
  units.filter((u) => u.kind === "reserve").forEach((u, i) => { if (i % 9 === 2 && !u.flag) u.sword = true; });
  let flags = 0, swords = 0;
  for (const u of units) {
    if (u.flag && ++flags > 28) u.flag = false;
    if (u.sword && ++swords > 14) u.sword = false;
  }
  // 路线
  for (const u of units) {
    const { spawn, route } = RouteFor(u.kind, u.post, u.lane, rnd);
    u.spawn = spawn ? { x: +spawn.x.toFixed(2), z: +spawn.z.toFixed(2) } : null;
    u.route = route.map((p) => ({ x: +p.x.toFixed(2), z: +p.z.toFixed(2) }));
  }
  return units;
}

/**
 * 分拨：按 shares 把名册切成几拨（先洗牌，每一拨里各类都有，不是「先岸线后桥头」），拨内序号 = 出发顺序。
 * 桥头纵队的前排优先进第一拨（射位一到就看得见桥上的队）。
 */
export function AssignCrowdWaves(units, waves, seed = 0x5EED) {
  const rnd = Rng(seed);
  const order = units.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  // 桥头前 6 个先出
  const front = units.map((u, i) => [u, i]).filter(([u]) => u.kind === "bridge").sort((a, b) => b[0].post.z - a[0].post.z).slice(0, 6).map(([, i]) => i);
  const rest = order.filter((i) => !front.includes(i));
  const sequence = [...front, ...rest];
  let cursor = 0;
  waves.forEach((wave, wi) => {
    const count = wi === waves.length - 1 ? sequence.length - cursor : Math.round(sequence.length * wave.share);
    for (let n = 0; n < count && cursor < sequence.length; n++, cursor++) { const u = units[sequence[cursor]]; u.wave = wave.id; u.order = n; }
  });
  return units;
}
