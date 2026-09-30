// ===========================================================================
// Data_FirstLevelFarBankCrowd.mjs —— 18 对岸「步坦大部队」的纯视觉人群名册（纯数据，零 three）
//
// 用户 2026-09-30：河对岸是成片的日军步兵与坦克，只是桥断了过不来。R2 做对了兵力、时间线与撤离，但射位离北岸 83–90 m，
// 一个人只有十来个像素，30 个真 AI 读成「岸上有几个人」。这一层补的是规模：一百多个只画不打的人，
// 画在 AI 的远景批渲染层里（ActorCrowd 的姿势桶：站 / 跪 / 卧 / 跑步翻页），不进 ai.soldiers、不占 actorPool（ija:48）。
//
// 数值（分拨、速度、枪口焰频率）在 END_TUNING.farBank.crowd；这里只有「谁站哪、怎么走进来」。
// 摆位一律用「离北岸岸沿往北 back 米」（岸沿由 FarBankShoreZ 取，随 R1a 的岸线起伏），桥面上的用桥轴 x 与桥面高度。
//
// 五种人（kind）：
//   shore    岸线三排：卧 / 跪打河对面（第一排 back 2.0 m 卧与跪，第二排跪与站，第三排站），交错着挤成一堵人墙；
//   bridge   桥头纵队：桥北两孔（桥面上）两列各一队挤在桁架里，前排跪、后排站；
//   reserve  土坎后面的留守：桥轴路堤两侧一堆一堆的站着、来回踱（从射位看在土坎与路堤的天际线上）；
//   flag     执旗的人（shore / reserve 里挑的，站着举旗）；
//   officer  举指挥刀的军官（站在路堤顶、桥头前排、岸线正中）。
//
// 走进来：全部从桥轴路堤上往北 spawnBackM 米的地方跑下来（路堤 x −80…−74，比两侧高 0.6–1.25 m，纵队的剪影映在天空里），
// 到 z≈72 处汇进桥轴缺口，再分头去自己的位：岸线中段直走、西段沿岸沿走到西侧、东段沿岸沿走到东侧，桥头纵队上桥。
// 没有导航网格：每条路线都由 Script_FirstLevelFarBankTest 逐 0.5 m 量净空（0.4 m 内无实心件、地面不低于 −0.5 m）。
// ===========================================================================
import { MISSION_RAIL_BRIDGE } from "./Data_FirstLevelMissionTopology.mjs";
import {
  FarBankShoreZ, FAR_BANK_REAL, FAR_BANK_SHORE_A, FAR_BANK_SHORE_B, FAR_BANK_STANDBY, FAR_BANK_TANKS,
} from "./Data_FirstLevelBridgeFarBank.mjs";

const freeze = Object.freeze;
export const FAR_BANK_CROWD_AXIS_X = MISSION_RAIL_BRIDGE.x;

/** 桥面的范围：桥台北端 z 86 到 2 号墩以南（被炸孔 z 136 起是坍塌件，人群不上）。 */
export const FAR_BANK_DECK = freeze({ x: MISSION_RAIL_BRIDGE.x, halfW: MISSION_RAIL_BRIDGE.deckW / 2, z0: 86.5, z1: 135.5, topY: MISSION_RAIL_BRIDGE.deckTopY });

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
/** 岸线三排：离岸沿 back 米、排内间距、姿势配比（[姿势, 权重]）。 */
export const FAR_BANK_CROWD_RANKS = freeze([
  freeze({ back: 1.7, gap: 1.15, poses: freeze([["prone", 0.5], ["kneel", 0.5]]) }),
  freeze({ back: 2.9, gap: 1.25, poses: freeze([["kneel", 0.6], ["stand", 0.4]]) }),
  freeze({ back: 4.1, gap: 1.3, poses: freeze([["stand", 0.6], ["kneel", 0.4]]) }),
  freeze({ back: 5.3, gap: 1.4, poses: freeze([["stand", 0.85], ["kneel", 0.15]]) }),
  freeze({ back: 6.6, gap: 1.5, poses: freeze([["stand", 1]]) }),
]);
export const FAR_BANK_CROWD_X = freeze([-132, -42]);
/** 桥轴缺口（路堤与桥头）左右各留这么宽：不摆岸线兵。 */
export const FAR_BANK_CROWD_GAP_HALF_M = 7;
/** 桥头纵队：两列在桥面上，离桥轴 ±laneM；从 z 96 起每 1.25 m 一个，到 frontZ 为止（再往南是 R2 的桥头人堆与冲桥组）。 */
export const FAR_BANK_CROWD_BRIDGE = freeze({ laneM: 2.15, z0: 94, frontZ: 117, gapM: 0.95 });
/** 留守：桥轴两侧、土坎以北的几堆。[中心 x, 中心 z, 人数]。 */
export const FAR_BANK_CROWD_RESERVE = freeze([
  freeze([-88, 74, 12]), freeze([-68, 73, 12]), freeze([-98, 66, 10]), freeze([-64, 70, 8]), freeze([-86, 58, 10]), freeze([-70, 56, 8]),
  freeze([-56, 73, 8]), freeze([-94, 48, 10]),
]);
export const FAR_BANK_CROWD_SPAWN_Z = FarBankShoreZ(FAR_BANK_CROWD_AXIS_X) - 100;

/** 北岸两段土坎（BridgeNorthRidge，z 81.6…82.8）：人不站在上面 / 贴着它。[x0, x1]。 */
const RIDGES = [[-92, -82], [-72, -60]];
const NearRidge = (x, z) => z > 80.6 && z < 83.8 && RIDGES.some(([a, b]) => x > a - 0.8 && x < b + 0.8);
const R2_POSTS = [...FAR_BANK_REAL, ...FAR_BANK_SHORE_A, ...FAR_BANK_SHORE_B, ...FAR_BANK_STANDBY];
const TANK_ZONES = FAR_BANK_TANKS.filter((t) => t.kind !== "bridge").map((t) => ({ x: t.x, z: FarBankShoreZ(t.x) - t.backM }));

const Pick = (rnd, table) => { let r = rnd() * table.reduce((a, [, w]) => a + w, 0); for (const [name, w] of table) { r -= w; if (r <= 0) return name; } return table[0][0]; };

/**
 * 路线：spawn → 桥轴路堤 → 缺口 → 自己的位。返回途经点（不含出生点、含终点）。
 * lane = 路堤上的横向偏移（±2.4 m 内错开，一队不是一条线）。
 */
/** 沿岸沿走的走廊：从 x0 到 x1，每 8 m 一个点，贴着岸沿以北 3.2 m（岸沿随 R1a 的岸线起伏，空气墙压在岸沿上）。 */
function Corridor(x0, x1) {
  const pts = [], n = Math.max(1, Math.ceil(Math.abs(x1 - x0) / 8));
  for (let k = 1; k <= n; k++) { const x = x0 + (x1 - x0) * k / n; pts.push({ x, z: FarBankShoreZ(x) - 3.2 }); }
  return pts;
}
function RouteFor(kind, post, lane) {
  const ax = FAR_BANK_CROWD_AXIS_X, shore = FarBankShoreZ(ax);
  const down = { x: ax + lane, z: shore - 18 };            // z 72：路堤上、土坎以北
  if (kind === "bridge") return [down, { x: post.x, z: FAR_BANK_DECK.z0 + 2.5 }, { x: post.x, z: post.z }];
  if (kind === "reserve") return [{ x: ax + lane * 0.6, z: Math.min(post.z, shore - 20) }, { x: post.x, z: post.z }];
  const gate = { x: ax, z: shore - 5.5 };                  // z 84.5：缺口南口（土坎南脸 z 82.8 以南）
  if (post.x < ax - 17) return [down, gate, { x: -92.5, z: FarBankShoreZ(-92.5) - 3.2 }, ...Corridor(-92.5, post.x), { x: post.x, z: post.z }];
  if (post.x > ax + 17) return [down, gate, { x: -60, z: FarBankShoreZ(-60) - 3.2 }, ...Corridor(-60, post.x), { x: post.x, z: post.z }];
  return [down, gate, { x: post.x, z: post.z }];
}

/**
 * 名册（确定性）。字段：
 *   id, kind, pose（stand|kneel|prone）, post {x,z,yaw}, route（途经点，含终点）, lane, wave（cover|fire|withdraw|blast）, order（本拨内的序号）,
 *   flag（举旗）, sword（举刀）, pace（留守踱步）, scale。
 */
export function BuildFarBankCrowdRoster(seed = 0x18B2B) {
  const rnd = Rng(seed);
  const units = [];
  const add = (kind, post, pose, extra = {}) => {
    // 拒绝：压真 AI 名册位、贴土坎、与已有的人挤在 0.85 m 内（留守随机撒点，岸线 / 桥头按格子摆，间距本来就够）
    if (R2_POSTS.some((p) => Math.hypot(p.x - post.x, p.z - post.z) < 1.4) || NearRidge(post.x, post.z)) return false;
    if (units.some((u) => Math.hypot(u.post.x - post.x, u.post.z - post.z) < 0.85)) return false;
    const lane = (rnd() - 0.5) * 4.8;
    units.push({ id: `FarBankCrowd${units.length}`, kind, pose, post: { x: +post.x.toFixed(2), z: +post.z.toFixed(2), yaw: post.yaw ?? Math.PI + (rnd() - 0.5) * 0.35 },
      lane: +lane.toFixed(2), route: null, wave: null, order: 0, flag: false, sword: false, pace: false, scale: +(1.0 + rnd() * 0.1).toFixed(3), ...extra });
    return true;
  };
  // 岸线三排
  const [xMin, xMax] = FAR_BANK_CROWD_X;
  FAR_BANK_CROWD_RANKS.forEach((rank, ri) => {
    for (let x = xMin + rnd() * rank.gap + ri * 0.7; x <= xMax; x += rank.gap * (0.85 + rnd() * 0.3)) {
      if (Math.abs(x - FAR_BANK_CROWD_AXIS_X) < FAR_BANK_CROWD_GAP_HALF_M) continue;
      const post = { x, z: FarBankShoreZ(x) - rank.back - (rnd() - 0.5) * 0.5 };
      const tankGap = ri === 0 ? 2.6 : 3.6;
      if (TANK_ZONES.some((t) => Math.abs(t.x - x) < tankGap && (ri > 0 || Math.abs(t.z - post.z) < 5))) continue;
      add("shore", post, Pick(rnd, rank.poses));
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
  // 旗与刀：旗一律举在站着的人手里（岸线第三排与留守里每隔几个挑一个，桥头前排一面）；刀在路堤顶、桥头前排、岸线正中
  const stand = units.filter((u) => u.pose === "stand" && (u.kind === "shore" || u.kind === "reserve"));
  stand.forEach((u, i) => { if (i % 11 === 4) u.flag = true; });
  const bridgeFront = units.filter((u) => u.kind === "bridge").sort((a, b) => b.post.z - a.post.z);
  if (bridgeFront[2]) bridgeFront[2].flag = true;
  for (const u of bridgeFront.slice(0, 2)) u.sword = true;
  units.filter((u) => u.kind === "reserve").forEach((u, i) => { if (i % 6 === 2 && !u.flag) u.sword = true; });
  units.filter((u) => u.kind === "shore" && u.pose === "stand" && !u.flag).forEach((u, i) => { if (i % 11 === 5) u.sword = true; });
  // 路线
  for (const u of units) u.route = RouteFor(u.kind, u.post, u.lane).map((p) => ({ x: +p.x.toFixed(2), z: +p.z.toFixed(2) }));
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

export const FAR_BANK_CROWD_KINDS = freeze(["shore", "bridge", "reserve"]);
