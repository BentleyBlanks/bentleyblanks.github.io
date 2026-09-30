// ===========================================================================
// Data_FirstLevelFarBankCrowd.mjs —— 18 对岸「步坦大部队」的纯视觉人群名册（纯数据，零 three）
//
// 用户 2026-09-30：河对岸是成片的日军步兵与坦克，只是桥断了过不来。R2 做对了兵力、时间线与撤离，但射位离北岸 83–90 m，
// 一个人只有十来个像素，30 个真 AI 读成「岸上有几个人」。这一层补的是规模：几百个只画不打的人，
// 画在这一层自己的 ActorCrowd 里（姿势桶：站 / 跪 / 卧 / 跑步翻页），不进 ai.soldiers、不占 actorPool（ija:48）。
//
// 数值（分拨、速度、枪口焰频率）在 END_TUNING.farBank.crowd；这里只有「谁站哪、怎么走进来」。
// 摆位：岸线排用「离北岸岸沿往北 back 米」（岸沿由 FarBankShoreZ 取，随 R1a 的岸线起伏）；
// **R2c（北岸坡地）起坡地上的排用绝对 z**（台地是绝对坐标，Data_FirstLevelWhiteboxTerrainRear 的 NORTH_TERRACES）；桥面上的用桥轴 x 与桥面高度。
//
// 四种人（kind）+ 两种道具（旗 / 刀是挂在站着的人身上的布尔字段）：
//   shore    岸线排（岸沿以北 1.7…6.6 m，平的岸台）：卧 / 跪打河对面，靠前的卧与跪、靠后的站；坡地一侧（x < −88）只排前三排；
//   slope    坡地八排（R2c）：坡地四级台地上，从第一级坡脚（z 78.2）到坡顶前沿（z 27.8）一排一排往上叠（排落在各级的坡段上：台面平的地方从射位看排与排叠在一起，只有坡段上高度在变，画面上才错得开），
//            前面的跪、中间的站、坡顶一线全是站着的（剪影映在天上，旗与军官刀都排在这一线）；
//   bridge   桥头纵队：桥北两孔（桥面上）两列各一队挤在桁架里，前排跪、后排站；
//   reserve  桥轴路堤东侧的留守：一堆一堆的站着、来回踱（西侧的堆已被坡地八排取代）；
//   flag     执旗的人；sword 举指挥刀的军官。
//
// 走进来：坡地与岸线西段的人从**坡顶村两户之间的巷口**（NORTH_DESCENT_TRAIL 的头，x −119.5）翻过坡顶、沿下坡踩道涌下来
// （出生点在坡顶后面 z −8，被坡顶挡着，射位看不见；看见的是人一个个从坡顶冒出来往下跑），到自己那一排的 z 再横着走过去。
// 桥头纵队、留守与岸线东段仍从桥轴路堤上往北 spawnBackM 米的地方跑下来（路堤 x −80…−74，纵队的剪影映在天空里），
// 到 z≈72 处汇进桥轴缺口，再分头去自己的位。没有导航网格：每条路线都由 Script_FirstLevelFarBankTest 逐 0.5 m 量净空
// （0.4 m 内无实心件、地面不低于 −0.5 m）。
// ===========================================================================
import { MISSION_PONTOON_BRIDGE, PONTOON_HEADS } from "./Data_FirstLevelMissionTopology.mjs";
import {
  FarBankShoreZ, FAR_BANK_REAL, FAR_BANK_SHORE_A, FAR_BANK_SHORE_B, FAR_BANK_STANDBY, FAR_BANK_TANKS, FarBankTankPostZ,
} from "./Data_FirstLevelBridgeFarBank.mjs";
import { NORTH_DESCENT_TRAIL } from "./Data_FirstLevelWhiteboxTerrainRear.mjs";

const freeze = Object.freeze;
export const FAR_BANK_CROWD_AXIS_X = MISSION_PONTOON_BRIDGE.x;

/** 桥面的范围：北栈终点 z 89.5 到被炸段北端 z 120.5（被炸段起是坍塌件，纯视觉人群不上）。 */
export const FAR_BANK_DECK = freeze({ x: MISSION_PONTOON_BRIDGE.x, halfW: MISSION_PONTOON_BRIDGE.deckW / 2, z0: PONTOON_HEADS.north, z1: MISSION_PONTOON_BRIDGE.spans[1].z1, topY: MISSION_PONTOON_BRIDGE.deckTopY });

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

// ---------------------------------------------------------------------------
// 参数（几何相关的；节奏数值在 END_TUNING.farBank.crowd）
// ---------------------------------------------------------------------------
/** 岸线五排：离岸沿 back 米、排内间距、姿势配比（[姿势, 权重]）。hillSide false = 坡地一侧（x < FAR_BANK_CROWD_HILL_X）不排（坡地八排接着往北叠）。 */
export const FAR_BANK_CROWD_RANKS = freeze([
  freeze({ back: 1.7, gap: 1.15, poses: freeze([["prone", 0.5], ["kneel", 0.5]]), hillSide: true }),
  freeze({ back: 2.9, gap: 1.25, poses: freeze([["kneel", 0.6], ["stand", 0.4]]), hillSide: true }),
  freeze({ back: 4.1, gap: 1.3, poses: freeze([["stand", 0.6], ["kneel", 0.4]]), hillSide: false }),
  freeze({ back: 5.3, gap: 1.4, poses: freeze([["stand", 0.85], ["kneel", 0.15]]), hillSide: false }),
  freeze({ back: 6.6, gap: 1.5, poses: freeze([["stand", 1]]), hillSide: false }),
]);
export const FAR_BANK_CROWD_X = freeze([-132, -42]);
/** 岸线排里 x 小于它的一段属于「坡地一侧」：只排前三排，后面的人在坡上。 */
export const FAR_BANK_CROWD_HILL_X = -88;
/** 桥轴缺口（路堤与桥头）左右各留这么宽：不摆岸线兵。 */
export const FAR_BANK_CROWD_GAP_HALF_M = 7;
/**
 * 坡地八排（R2c）：z 是这一排的绝对 z（台地顶沿：第一级 69.5、第二级 55、第三级 40.5、坡顶 26；每级南面的坡段 11.5 m；每级坡段上两排，坡顶一排），
 * xMax 是这一排东端（台地东端逐级往西错开：−89 / −93 / −97 / −101，留出 ≥ 1 m 的边），gap 排内间距，poses 姿势配比。
 * 姿势：靠前的跪、中间的站；最后一排（坡顶前沿）全站着 —— 剪影映在天上，旗与刀都排在这一线。
 */
export const FAR_BANK_CROWD_SLOPE_X_MIN = -146;
export const FAR_BANK_CROWD_SLOPE_RANKS = freeze([
  freeze({ z: 78.2, gap: 1.55, scale: 1.06, xMax: -92, poses: freeze([["kneel", 0.55], ["stand", 0.45]]) }),
  freeze({ z: 72.4, gap: 1.6, scale: 1.09, xMax: -92, poses: freeze([["stand", 0.7], ["kneel", 0.3]]) }),
  freeze({ z: 62.4, gap: 1.65, scale: 1.12, xMax: -93, poses: freeze([["stand", 1]]) }),
  freeze({ z: 58.6, gap: 1.7, scale: 1.15, xMax: -95, poses: freeze([["stand", 0.7], ["kneel", 0.3]]) }),
  freeze({ z: 47.6, gap: 1.75, scale: 1.18, xMax: -97, poses: freeze([["stand", 1]]) }),
  freeze({ z: 43.0, gap: 1.75, scale: 1.21, xMax: -99, poses: freeze([["stand", 0.8], ["kneel", 0.2]]) }),
  freeze({ z: 33.2, gap: 1.8, scale: 1.24, xMax: -101, poses: freeze([["stand", 1]]) }),
  freeze({ z: 27.8, gap: 1.45, scale: 1.28, xMax: -104, poses: freeze([["stand", 1]]), crest: true }),
]);
/** 桥头纵队：两列在浮桥北截桥面上，离桥轴 ±laneM（桥面 2.8 m 宽）；从 z 93 起每 0.95 m 一个，到 frontZ 为止（再往南是 R2 的桥头人堆与冲桥组）。 */
export const FAR_BANK_CROWD_BRIDGE = freeze({ laneM: 0.65, z0: 93, frontZ: 110.4, gapM: 0.95 });
/** 留守：桥轴路堤东侧、土坎以北的几堆。[中心 x, 中心 z, 人数]。西侧的堆（x < −90）R2c 起由坡地八排取代。 */
export const FAR_BANK_CROWD_RESERVE = freeze([
  freeze([-88, 74, 10]), freeze([-68, 73, 12]), freeze([-64, 70, 8]), freeze([-86, 58, 8]), freeze([-70, 56, 8]), freeze([-56, 73, 8]),
]);
export const FAR_BANK_CROWD_SPAWN_Z = FarBankShoreZ(FAR_BANK_CROWD_AXIS_X) - 100;
/** 坡地上的人的出生点：坡顶村的巷口后面（z −8，被坡顶挡着）；巷口在两户房子之间（x −121…−118），出生点横向只散 ±0.6 m。 */
export const FAR_BANK_CROWD_HILL_SPAWN = freeze({ x: NORTH_DESCENT_TRAIL[0].x, z: -8, spread: 0.6 });
/** 翻过坡顶的点（巷口出口，坡顶前沿 z 26 以南 1.5 m 处）。 */
export const FAR_BANK_CROWD_HILL_EXIT = freeze({ x: NORTH_DESCENT_TRAIL[1].x, z: 27.5 });

/** 下坡踩道在某个 z 上的 x（折线插值，夹在两头）。 */
export function DescentTrailX(z) {
  const t = NORTH_DESCENT_TRAIL;
  if (z <= t[0].z) return t[0].x;
  for (let i = 1; i < t.length; i++) {
    if (z <= t[i].z) { const k = (z - t[i - 1].z) / (t[i].z - t[i - 1].z || 1); return t[i - 1].x + (t[i].x - t[i - 1].x) * k; }
  }
  return t[t.length - 1].x;
}

/** 北岸两段土坎（BridgeNorthRidge，z 81.6…82.8）：人不站在上面 / 贴着它。[x0, x1]。 */
const RIDGES = [[-92, -82], [-72, -60]];
const NearRidge = (x, z) => z > 80.6 && z < 83.8 && RIDGES.some(([a, b]) => x > a - 0.8 && x < b + 0.8);
const R2_POSTS = [...FAR_BANK_REAL, ...FAR_BANK_SHORE_A, ...FAR_BANK_SHORE_B, ...FAR_BANK_STANDBY];
/**
 * 三辆车的停位（桥面上那辆是桥头以北的等待位；台地上两辆是各自的平台，含下压后的位置）：任何人不站在车体旁 3.4 m 内。
 */
const TANK_POSTS = FAR_BANK_TANKS.flatMap((t) => {
  const post = { x: t.x, z: FarBankTankPostZ(t) };
  return t.pushZ != null ? [post, { x: t.x, z: t.pushZ }] : [post];
});
/**
 * 站位避让点（[x, z, 半径]）：坡地上的枯树干（Layout 的 FieldPoplarWest*NB 六棵 + 坡地上的 (−117,74.5) 与坡后 (−122,6)）。
 * Script_FirstLevelFarBankTest 逐条对 Layout 里的树干块核对，挪了树忘了改这里会红。
 */
export const FAR_BANK_CROWD_KEEPOUT = freeze([
  freeze([-146, 80, 1.8]), freeze([-131, 61.3, 1.8]), freeze([-108, 45.3, 1.8]), freeze([-141, 30.5, 1.8]), freeze([-125, 30.5, 1.8]), freeze([-107, 24.5, 1.8]),
  freeze([-117, 74.5, 1.8]), freeze([-122, 6, 1.8]),
]);

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

export const FAR_BANK_CROWD_KINDS = freeze(["shore", "slope", "bridge", "reserve"]);
