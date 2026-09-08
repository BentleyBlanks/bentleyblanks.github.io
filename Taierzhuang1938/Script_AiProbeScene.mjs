// Script_AiProbeScene.mjs —— 敌军 AI 的**试验场**（docs/Data_EnemyAi.md §14.2 第 6 节）。
//
// 3A 的 AI 组都有一个固定的 arena：一堵墙、一个班、一个不死的靶子，改完数就在
// 同一个场景里再看一遍。本项目的 arena 一直存在，只是长在 `Script_AiCombatBrowserTest`
// 里 —— 只有跑门禁的人看得见，设计师点不开。这个模块把那一套原样搬出来，
// 让验收探针与编辑器**用同一份**：探针里量到的行为，设计师在编辑器里能一键复现。
//
// 三条约束：
//   1. **不 import three，也不 import 场景**：只吃一个 `T`（`window.Tengxian`）。
//      它是浏览器侧的，但不碰 DOM —— 页面已经把 battlefield / ai / player / nav 挂在 T 上了。
//   2. **不改行为、不改数**：从 `Script_AiCombatBrowserTest` 逐行搬过来，
//      站点判据、撒兵间距、无敌血量一个数都没动（断言仍然是 11/11）。
//   3. **每一次「隔离」都配一个还原**：`IsolateSquad` 返回的 `Restore()` 会把
//      场上人口、波次预算与 `maxAlive` 放回去 —— 编辑器是**叠在正片上**开的，
//      清完场不还原等于把玩家那一局毁了。
//
// 朝向契约：yaw=0 面朝 -Z；世界 X 东 / Z 南 / Y 上，米。

/** 整班横排的撒兵偏移（米）。挑站点与真正撒兵用的是同一份。 */
export const SQUAD_OFFSETS = Object.freeze([-4, -2.4, -0.8, 0.8, 2.4, 4]);
/** 每个撒兵位身边多远之内必须有掩体点（够一两秒走到，量的才是行为）。 */
export const SEAT_COVER_M = 6;
/** 射手三姿态的眼高（Script_Ai.StanceEye）加一档余量，与玩家站/蹲的眼高。 */
const SHOOTER_EYES = Object.freeze([1.5, 1.35, 1.0, 0.85]);
const PLAYER_STAND_EYE = 1.63;
const PLAYER_CROUCH_EYE = 1.15;

function Ground(T, x, z) { return T.battlefield.GroundHeight(x, z); }

/** 两点之间有没有碰撞体挡着（只认碰撞体）。 */
function Blocked(T, from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const hit = T.battlefield.Raycast(from, { x: dx / len, y: dy / len, z: dz / len }, len);
  return !!hit && hit.t < len - 0.4;
}

/**
 * 「看不看得见」要过 **AI 自己那条**判据（`aiHost.BlocksSight` 走第一关运行时，含地形），
 * 不能只问碰撞体：两条不一致的话，挑出来的空地在 AI 眼里可能仍然是看不见的，
 * 对照组就会量成「同一批枪打不到他」—— 那是地形不是 AI。
 */
function Unseen(T, from, to) { return Blocked(T, from, to) || T.ai.aiHost.BlocksSight(from, to); }

/**
 * 挑一堵真的能挡住人的墙：从 26–34 m 外的射手眼位打过来，
 * 墙这一侧的蹲姿胸口**打不到**、墙另一侧的站姿胸口**打得到**。
 * 用射线挑而不是写死坐标：换了地形也不会变成「量地形不量 AI」。
 *
 * 射手那一侧还要求身边有掩体点可用 —— 「探头有没有节奏」这条要在**有掩体的地方**量，
 * 站在空地上的人本来就没有 hide/peek 可言。
 *
 * @returns {{cover, hide, open, shoot, rangeM, yaw, seats, coversAtShoot,
 *            playerAt, playerStance, playerYaw}|null}
 *   `hide` 是墙后的藏身点、`open` 是空地对照点、`shoot` 是撒兵的射击线，
 *   `yaw` 是**玩家面朝这支班**的朝向（侧翼锥按玩家朝向算，背对着他们量出来的永远是零）。
 *   `playerAt / playerStance / playerYaw` 是给调用方直接喂进 `PlacePlayer` 的那三个 ——
 *   「玩家该站哪儿、什么姿势、朝哪边」是**场地**的属性，不该让每个调用方各猜一份。
 */
export function PickSite(T, cx, cz) {
  const list = T.ai.covers.Nearby(cx, cz, 110).filter((c) => c.height >= 1.5);
  for (const c of list) {
    for (const sign of [1, -1]) {
      // 距离要拉到**自动冲锋距离以外**（突击位 24 m 是最远的一档，见 Script_Ai 的
      // chargeRange）：十三米上日军会上刺刀冲过来，那时量到的是「会不会冲」不是「会不会躲」。
      for (const range of [34, 30, 26]) {
        const shoot = { x: c.x, z: c.z - sign * range };
        if (T.nav && !T.nav.Walkable(shoot.x, shoot.z)) continue;
        const hideAt = { x: c.x, z: c.z + sign * 1.2 };
        const openAt = { x: c.x, z: c.z - sign * 1.8 };
        const shootY = Ground(T, shoot.x, shoot.z);
        const hide = { x: hideAt.x, y: Ground(T, hideAt.x, hideAt.z) + PLAYER_CROUCH_EYE, z: hideAt.z };
        const open = { x: openAt.x, y: Ground(T, openAt.x, openAt.z) + PLAYER_STAND_EYE, z: openAt.z };
        let ok = true;
        // 站点必须对**每一档眼高**都成立，否则人一蹲下通视就没了 —— 实测就栽在这儿：
        // 挑站点时按 1.35 m 量的，而 AI 蹲下之后眼高只有 1.0 m。
        for (const eye of SHOOTER_EYES) {
          const from = { x: shoot.x, y: shootY + eye, z: shoot.z };
          if (!Blocked(T, from, hide)) { ok = false; break; }        // 墙那一侧：每一档都不许通
          if (Unseen(T, from, open)) { ok = false; break; }          // 空地那一侧：每一档都要通
        }
        if (!ok) continue;
        // 整班是横着一排撒的，通视要**逐个撒兵位**验：只验中心那一个的话，
        // 两翼的人可能被土坎挡着，量出来就是「一个班只有一个人在打」。
        const seats = SQUAD_OFFSETS.filter((dx) => {
          const sx = shoot.x + dx;
          const sy = Ground(T, sx, shoot.z);
          for (const eye of SHOOTER_EYES) {
            if (Unseen(T, { x: sx, y: sy + eye, z: shoot.z }, open)) return false;
          }
          // 身边要真的有掩体可进：站在离最近的墙八米开外，量出来的是「跑了多久」
          // 而不是「会不会躲」—— 被压制趴下的人爬八米要十秒以上。
          return T.ai.covers.Nearby(sx, shoot.z, SEAT_COVER_M).length > 0;
        });
        if (seats.length < 4) continue;
        const yaw = sign > 0 ? 0 : Math.PI;
        return { cover: { x: c.x, z: c.z, height: c.height }, hide: hideAt, open: openAt, shoot,
          rangeM: range, yaw, seats,
          coversAtShoot: T.ai.covers.Nearby(shoot.x, shoot.z, 12).length,
          playerAt: openAt, playerStance: "stand", playerYaw: yaw };
      }
    }
  }
  return null;
}

/**
 * 在站点的射击线上撒一支**没有剧本旗**的普通班。
 *
 * 为什么不用正片里的人：第一关前沿的日军全带剧本旗，而 `Script_AiTactics.IsScripted`
 * 明确不给剧本单位派机动任务（关卡的跃进线不能被侧翼任务改写）—— 那是设计不是缺陷，
 * 所以侧翼与投弹要在没有剧本旗的普通班上量，走的仍然是同一条 AI 链路。
 *
 * `maxAlive` 只在撒兵这几行里临时抬一下就放回去：人口上限是给正片配的（同屏 56 人），
 * 抬了不放回去，正片后面补兵的账就跟着变了。真正的隔离在 `IsolateSquad` 里。
 */
export function SpawnProbeSquad(T, site, options = {}) {
  const count = Number.isFinite(options.count) ? options.count : 6;
  const grenades = Number.isFinite(options.grenades) ? options.grenades : 2;
  const weapon = options.weapon || "Type38";
  const coverSlackM = Number.isFinite(options.coverSlackM) ? options.coverSlackM : 6;
  const holdRadius = Number.isFinite(options.holdRadius) ? options.holdRadius : 2;
  const squadId = options.squadId || "AiProbeSquad";
  const ai = T.ai;
  const priorMaxAlive = ai.maxAlive;
  ai.maxAlive = Math.max(priorMaxAlive, ai.soldiers.length + count + 8);
  const squad = [];
  for (let i = 0; i < count; i += 1) {
    const s = ai.Spawn("ija", site.shoot.x - 7 + i * 2.8, site.shoot.z, { weapon, squadId });
    if (!s) continue;
    s.health = 1e9;
    s.grenades = grenades;
    // 先钉住：隔墙那一对实验要的是同一批枪、同一个距离，不能让他们绕过来。
    s.holdZone = { id: "AiProbeHold", x: s.position.x, z: s.position.z, radius: holdRadius };
    s.scriptCoverSlackM = coverSlackM;
    s.order = "hold";
    squad.push(s);
  }
  ai.maxAlive = priorMaxAlive;
  return squad;
}

/**
 * 把场上清成「一个班对一个玩家」，返回**还原函数**。
 *
 * 三个理由，每一个都足以单独否掉「就在正片里量」：
 *   · `COMBAT.maxShootersOnPlayer` 是全场共享的三个名额，正片前沿早占满了，
 *     这支班一个都拿不到，于是转去打一百米外的国军；
 *   · 具名同伴会跟着玩家跑，探针班眼前最近的敌人变成同伴而不是玩家；
 *   · `ai.fireCount` 是全场计数，混着前沿几十号人根本读不出「这支班打了几发」。
 *
 * 补兵会往清空后的表里塞人（`UpdateWaves`），所以顺手把这一关的波次预算用光；
 * `Restore()` 再把预算、人口上限与花名册放回去（新撒的那一班留在场上，
 * 方便覆盖层与快照还有东西可看）。
 */
export function IsolateSquad(T, squad, options = {}) {
  const ai = T.ai;
  const priorMaxAlive = ai.maxAlive;
  const roster = ai.soldiers.slice();
  const runtime = options.runtime
    || (typeof T.Debug?.FirstLevelMissionRuntime === "function" ? T.Debug.FirstLevelMissionRuntime() : null);
  const priorWaves = runtime ? runtime.waves : null;

  ai.maxAlive = Number.isFinite(options.maxAlive) ? options.maxAlive : 200;
  if (runtime) runtime.waves = { spawned: 1e9, squads: 0, nextAt: 1e18 };
  ai.soldiers.length = 0;
  for (const s of squad) ai.soldiers.push(s);

  return function Restore() {
    const kept = ai.soldiers.slice();
    ai.soldiers.length = 0;
    for (const s of roster) ai.soldiers.push(s);
    for (const s of kept) if (!roster.includes(s)) ai.soldiers.push(s);
    ai.maxAlive = priorMaxAlive;
    if (runtime && priorWaves) runtime.waves = priorWaves;
  };
}

/** 把玩家瞬移到一个点（贴地 +0.1 m）、摆好姿态与朝向、清速度、给满血。 */
export function PlacePlayer(T, at, stance = "stand", yaw = 0) {
  const player = T.player;
  const p = player.position;
  p.set(at.x, Ground(T, at.x, at.z) + 0.1, at.z);
  player.body?.Teleport(p.x, p.y, p.z);
  player.stance = stance;
  player.yaw = yaw;
  player.velocity.set(0, 0, 0);
  player.health = 1e9;
  player.bleeding = 0;
}

/**
 * 伤亡会把「谁还在掩体里」的分母搅乱：整场无敌，只量行为。
 *
 * **玩家也在内**：编辑器那颗按钮就叫「玩家无敌」，而验收探针本来就在每次
 * `PlacePlayer` 里把玩家血量顶到 1e9 —— 两边合成一个动词，免得「无敌」在两个
 * 地方各是一半（探针那一半照旧，数一个没变）。
 */
export function Immortal(T) {
  for (const s of T.ai.soldiers) if (s.alive) s.health = 1e9;
  if (T.player) { T.player.health = 1e9; T.player.bleeding = 0; }
}

/**
 * 一键开场：找一堵墙 → 对面撒一个班 → 清场 → 把玩家摆到空地上并给无敌。
 *
 * @returns {{ site: object|null, squad: object[], Restore: function }}
 *   没找到合格的墙时 `site` 是 null、`squad` 是空的、`Restore` 是空操作 ——
 *   调用方（编辑器）照常调 `Restore()` 就行，不必分两条路写。
 */
export function SetupArena(T, options = {}) {
  const site = PickSite(T, options.cx, options.cz);
  if (!site) return { site: null, squad: [], Restore: () => {} };
  const squad = SpawnProbeSquad(T, site, options);
  const Restore = IsolateSquad(T, squad, options);
  if (options.placePlayer !== false) {
    PlacePlayer(T, site.open, "stand", site.yaw);
    Immortal(T);
  }
  return { site, squad, Restore };
}
