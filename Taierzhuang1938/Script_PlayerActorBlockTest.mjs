// 玩家走不进人物身体（Script_PlayerActorBlock）。纯 Node，不起浏览器。
// 用法：node Taierzhuang1938/Script_PlayerActorBlockTest.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { BlockPlayerStep, ActorBlocksPlayer, PLAYER_ACTOR_BLOCK } from "./Script_PlayerActorBlock.mjs";
import { BlockPlayerByLitters } from "./Script_LitterBlock.mjs";
import { CROWD } from "./Data_Tuning_Ai.mjs";

const R = 0.34, dt = 1 / 60, speed = 3.05;
const RadiusOf = (a) => a.radius ?? 0.34;
const Man = (x, z, extra = {}) => ({ alive: true, position: { x, y: 0, z }, ...extra });
const Gap = (p, a) => Math.hypot(p.x - a.position.x, p.z - a.position.z);
let checks = 0;
const Ok = (value, message) => { assert.ok(value, message); checks += 1; };
// 按住方向键走 seconds 秒，每帧都过一遍裁剪（和 MoveWithCollision 同一顺序）。
function Walk(p, dirX, dirZ, actors, seconds) {
  const out = {};
  let minGap = Infinity;
  for (let t = 0; t < seconds; t += dt) {
    const l = Math.hypot(dirX, dirZ) || 1;
    BlockPlayerStep(p, dirX / l * speed * dt, dirZ / l * speed * dt, R, actors, RadiusOf, dt, out);
    p.x += out.dx; p.z += out.dz;
    for (const a of actors) if (ActorBlocksPlayer(a)) minGap = Math.min(minGap, Gap(p, a));
  }
  return minGap;
}

// ① 正面走向罗班长（车厢里那一下）：停在身体外，不穿过去。
{
  const luo = Man(0, -1.05), p = { x: 0, y: 0, z: 0 };
  const min = Walk(p, 0, -1, [luo], 2);
  Ok(min >= 2 * R - 1e-6, `walking straight into him stops at his body (closest ${min.toFixed(4)} m)`);
  Ok(p.z > luo.position.z, "the player never ends up on his far side");
}
// ② 斜着蹭过去：沿身体边沿滑开，照样能绕过去。
{
  const luo = Man(0, -1.5), p = { x: 0.2, y: 0, z: 0 };
  const min = Walk(p, 0, -1, [luo], 1.5);
  Ok(min >= 2 * R - 1e-6, "a glancing walk never enters his body");
  Ok(p.z < luo.position.z - 0.3, `the player slides around and keeps going (z=${p.z.toFixed(2)})`);
}
// ③ 夹在两人之间的窄缝（0.9 m 心距，放不下一个 0.68 m 的人）：过不去，也不陷进任何一个。
{
  const a = Man(-0.45, -1.2), b = Man(0.45, -1.2), p = { x: 0, y: 0, z: 0 };
  const min = Walk(p, 0, -1, [a, b], 2);
  Ok(min >= 2 * R - 0.01, `squeezing between two men never overlaps either (closest ${min.toFixed(4)} m)`);
  Ok(p.z > -1.2, "a gap narrower than a body cannot be walked through");
}
// ④ 人自己走进了玩家身体：玩家往外让，限速，不瞬移。
{
  const npc = Man(0, 0), p = { x: 0.1, y: 0, z: 0 }, out = {};
  BlockPlayerStep(p, 0, 0, R, [npc], RadiusOf, dt, out);
  Ok(out.pushed && out.dx > 0, "an actor standing inside the player pushes him outward");
  Ok(Math.hypot(out.dx, out.dz) <= PLAYER_ACTOR_BLOCK.pushOutMps * dt + 1e-9, "the push-out is speed-limited");
  for (let i = 0; i < 60; i += 1) { BlockPlayerStep(p, 0, 0, R, [npc], RadiusOf, dt, out); p.x += out.dx; p.z += out.dz; }
  Ok(Gap(p, npc) >= 2 * R - 1e-6, "after a second the player is clear of the body");
  // 已经在里面时往里走被拦，往外走照走。
  const q = { x: 0.2, y: 0, z: 0 };
  BlockPlayerStep(q, -0.05, 0, R, [npc], RadiusOf, dt, out);
  Ok(out.slideX >= 0, "inside a body the player cannot walk deeper");
  BlockPlayerStep(q, 0.05, 0, R, [npc], RadiusOf, dt, out);
  Ok(Math.abs(out.slideX - 0.05) < 1e-9, "inside a body the player can walk out freely");
}
// ⑤ 不挡的人：死人、白刃里、背着的伤员、担架、伏击表演、楼上楼下。
for (const [label, extra] of [["corpse", { alive: false }], ["melee bind", { meleeCombat: {} }],
  ["carried casualty", { p012CarriedCasualty: true }], ["stretcher bearer", { carryRole: "front" }],
  ["ambush performer", { missionAmbushClip: {} }], ["opt-out", { playerPassThrough: true }]]) {
  const p = { x: 0, y: 0, z: 0 }, npc = Man(0, -1, extra);
  Walk(p, 0, -1, [npc], 1);
  Ok(p.z < -1.2, `the player walks through a ${label}`);
}
{
  const p = { x: 0, y: 0, z: 0 }, upstairs = Man(0, -1, { position: { x: 0, y: PLAYER_ACTOR_BLOCK.maxDyM + 0.3, z: -1 } });
  Walk(p, 0, -1, [upstairs], 1);
  Ok(p.z < -1.2, "a man on another floor does not block");
}
// ⑥ 卧姿人物更粗：按宿主给的半径挡。
{
  const prone = Man(0, -1.5, { radius: 0.42 }), p = { x: 0, y: 0, z: 0 };
  const min = Walk(p, 0, -1, [prone], 2);
  Ok(min >= R + 0.42 - 1e-6, "the actor's own capsule radius is respected");
}
// ⑦ 没人时原样返回。
{
  const out = BlockPlayerStep({ x: 0, y: 0, z: 0 }, 0.03, -0.02, R, [], RadiusOf, dt, {});
  Ok(out.dx === 0.03 && out.dz === -0.02 && !out.blocked && !out.pushed, "no actors: step unchanged");
}
// ⑦b 抬着的担架也挡玩家（2026-09-27）；玩家自己抬着的那副不挡。
{
  const clearance = CROWD.litterHalfWidthM + R, maxOut = PLAYER_ACTOR_BLOCK.pushOutMps * dt;
  const seg = { ax: 0, az: 1.28, bx: 0, bz: -1.28, y: 0 };
  const WalkLitter = (p, segs, frames) => {
    let crossed = false;
    for (let i = 0; i < frames; i += 1) {
      const out = BlockPlayerByLitters(p, speed * dt, 0.2 * speed * dt, segs, clearance, maxOut, CROWD.maxDyM);
      p.position.x += out.dx; p.position.z += out.dz;
      if (p.position.x > -clearance + 1e-3 && p.position.x < clearance - 1e-3 && Math.abs(p.position.z) < 1.28) crossed = true;
    }
    return crossed;
  };
  const me = { position: { x: -2, y: 0, z: 0 } };
  Ok(!WalkLitter(me, [seg], 300), "walking at a carried litter never takes the player between the bearers");
  Ok(me.position.z > 1.28, "the player slides round the litter's end instead");
  const carrier = { position: { x: -2, y: 0, z: 0 } };
  Ok(WalkLitter(carrier, [{ ...seg, player: true }], 120), "the litter the player carries himself (level flag) does not block him");
  const rearMan = { position: { x: -2, y: 0, z: 0 } };
  Ok(WalkLitter(rearMan, [{ ...seg, rear: rearMan }], 120), "a litter whose rear end is the player does not block him");
  const swept = { position: { x: 0.05, y: 0, z: 0 } };
  const out = BlockPlayerByLitters(swept, 0, 0, [seg], clearance, maxOut, CROWD.maxDyM);
  Ok(out.pushed && Math.hypot(out.dx, out.dz) <= maxOut + 1e-9 && out.dx > 0, "a player swept into a litter steps out at the capped speed");
  const none = BlockPlayerByLitters({ position: { x: 0, y: 0, z: 0 } }, 0.03, -0.02, [], clearance, maxOut, CROWD.maxDyM);
  Ok(none.dx === 0.03 && none.dz === -0.02 && !none.blocked && !none.pushed, "no litters: step unchanged");
}
// ⑧ 接线：玩家这一步先过裁剪再交给角色控制器；装配层给了人物列表与半径。
const player = fs.readFileSync(new URL("./Script_Player.mjs", import.meta.url), "utf8").replace(/\r/g, "");
const main = fs.readFileSync(new URL("./Script_Main.mjs", import.meta.url), "utf8").replace(/\r/g, "");
Ok(/BlockPlayerStep\([\s\S]{0,1200}const moved = body\.Move\(step\.x, step\.y, step\.z\)/.test(player), "Player clips the step before body.Move");
Ok(/BlockPlayerByLitters\(this, step\.x, step\.z[\s\S]{0,500}const moved = body\.Move\(step\.x, step\.y, step\.z\)/.test(player), "Player clips the step against litters before body.Move");
Ok(/ActorBlockers: \(\) => ai\?\.soldiers/.test(main) && /ActorRadius: /.test(main), "Main wires actors and their capsule radius");
Ok(/LitterBlockers: \(\) => ai\?\.litterSegs/.test(main), "Main wires the AI's litter segments to the player");
Ok(/\.\.\.PlayerBodyBlockers\(\)/.test(main) && /LitterBlockers: PlayerBodyBlockers\(\)\.LitterBlockers/.test(main), "the rebuilt player world on level change keeps the litter blockers");

console.log(`PlayerActorBlockTest 通过：${checks} 条断言`);
