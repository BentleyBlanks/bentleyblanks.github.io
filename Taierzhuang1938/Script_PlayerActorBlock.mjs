// 玩家与人物的身体挡位（2026-09-17）。
//
// 角色胶囊在 Rapier 里互不相撞（Script_Physics 的 IG_CHARACTER 故意不含 CHARACTER：
// 窄壕里硬碰撞会把队伍顶死，运动学控制器又没有脱困能力）。AI 之间由
// `AiDirector.SeparateSoldiers` 软推开；玩家这边以前什么都没有，车厢里能直接
// 走进罗班长的身体。
//
// 这里只改玩家**这一步**的水平位移，结果照样交给 `CharacterBody.Move`，所以墙仍然说了算：
//   · 走向一个人：朝他那一分量被削掉，贴着他的身体边沿滑开，不会走进去；
//   · 他自己走进了玩家身体（或脚本把人摆在玩家身上）：玩家往外让，速度不超过
//     `PLAYER_ACTOR_BLOCK.pushOutMps`，看起来是侧身让一步而不是被弹飞。
// 人物不被玩家推动 —— 车厢里坐着的、在演动作的人都不该被玩家撞歪。
//
// 数值在 `Data_Tuning_Player.PLAYER_ACTOR_BLOCK`。纯规则：不 import three，只认 `{position:{x,y,z}, alive}` 与宿主给的半径。

import { PLAYER_ACTOR_BLOCK } from "./Data_Tuning_Player.mjs";
export { PLAYER_ACTOR_BLOCK };

/**
 * 不挡玩家的人：死人、白刃里（刺刀僵持本来就贴身）、被玩家背着的伤员、
 * 抬担架的（玩家接替担架时就站在他们的位置上）、屋内伏击正在演动作的（玩家被按在地上时
 * 人就站在他身上）、枪械实验室的靶子。
 */
export function ActorBlocksPlayer(actor) {
  return !!(actor && actor.alive !== false && actor.position
    && !actor.meleeCombat && !actor.p012CarriedCasualty && !actor.carryRole
    && !actor.weaponRangeTargetId && !actor.missionAmbushClip && !actor.playerPassThrough);
}

/**
 * 把玩家这一步 (dx, dz) 裁成不会进入任何人身体的位移。
 *
 * @param {{x:number,y:number,z:number}} p   玩家脚底当前位置
 * @param {number} dx, dz                    这一步想走的水平位移（米）
 * @param {number} radius                    玩家胶囊半径
 * @param {Array}  actors                    候选人物（通常是 ai.soldiers）
 * @param {(actor)=>number} RadiusOf         人物当前姿态的胶囊半径
 * @param {number} dt                        本帧秒数（只用于往外让的限速）
 * @param {object} [out]                     复用出参 `{dx, dz, slideX, slideZ, blocked, pushed}`
 *                                           （slide 是不含往外让的那部分，给速度用）
 */
export function BlockPlayerStep(p, dx, dz, radius, actors, RadiusOf, dt, out = {}) {
  const T = PLAYER_ACTOR_BLOCK;
  out.dx = dx; out.dz = dz; out.slideX = dx; out.slideZ = dz; out.blocked = false; out.pushed = false;
  if (!actors || !actors.length) return out;
  const maxOut = Math.max(0, T.pushOutMps * dt);
  // ① 已经在别人身体里：先决定往外让多少（只算一次，不随下面的滑动轮次重复叠加）。
  let pushX = 0, pushZ = 0;
  for (let i = 0; i < actors.length; i += 1) {
    const a = actors[i];
    if (!ActorBlocksPlayer(a) || Math.abs(a.position.y - p.y) > T.maxDyM) continue;
    const minD = radius + RadiusOf(a);
    const ox = p.x - a.position.x, oz = p.z - a.position.z;
    const d = Math.hypot(ox, oz);
    if (d >= minD - T.skinM) continue;
    let nx, nz;
    if (d > 1e-4) { nx = ox / d; nz = oz / d; }
    else { nx = 1; nz = 0; }          // 正好重合：随便定一个方向，墙会替它挑对的那边
    const depth = minD - d;
    pushX += nx * depth; pushZ += nz * depth;
  }
  const pushLen = Math.hypot(pushX, pushZ);
  if (pushLen > 1e-6) {
    const k = Math.min(1, maxOut / pushLen);
    pushX *= k; pushZ *= k;
    out.pushed = true;
  }
  // ② 这一步本身：朝人走的分量削掉、沿身体边沿滑；已经在里面的人，只许往外走。
  let sx = dx, sz = dz;
  for (let pass = 0; pass < T.passes; pass += 1) {
    let changed = false;
    for (let i = 0; i < actors.length; i += 1) {
      const a = actors[i];
      if (!ActorBlocksPlayer(a) || Math.abs(a.position.y - p.y) > T.maxDyM) continue;
      const minD = radius + RadiusOf(a);
      const ox = p.x - a.position.x, oz = p.z - a.position.z;
      const d0 = Math.hypot(ox, oz);
      const qx = ox + sx, qz = oz + sz;
      const d1 = Math.hypot(qx, qz);
      if (d0 < minD - T.skinM) {
        // 已经侵入：不许更深，朝他的那一分量归零（往外、沿切向都照走）。
        if (d1 >= d0) continue;
        const nx = d0 > 1e-4 ? ox / d0 : 1, nz = d0 > 1e-4 ? oz / d0 : 0;
        const inward = sx * nx + sz * nz;
        if (inward < 0) { sx -= inward * nx; sz -= inward * nz; changed = true; out.blocked = true; }
        continue;
      }
      // 从外面（或正贴在边沿上）走进来：削掉法向分量，再把终点放回身体边沿上。
      if (d1 >= minD - 1e-9) continue;
      const nx = ox / d0, nz = oz / d0;
      const inward = sx * nx + sz * nz;
      if (inward < 0) { sx -= inward * nx; sz -= inward * nz; }
      const rx = ox + sx, rz = oz + sz, r = Math.hypot(rx, rz);
      if (r < minD - 1e-9) {
        const ux = r > 1e-6 ? rx / r : nx, uz = r > 1e-6 ? rz / r : nz;
        sx = ux * minD - ox; sz = uz * minD - oz;
      }
      changed = true; out.blocked = true;
    }
    if (!changed) break;
  }
  out.slideX = sx; out.slideZ = sz;
  out.dx = sx + pushX; out.dz = sz + pushZ;
  return out;
}
