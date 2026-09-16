// 同阵营活人不叠在一起（docs/Data_EnemyAi.md「同阵营软分离」）。
// 纯 Node：从 Script_Ai.mjs 源码抽出 SeparateSoldiers / CrowdPinned / CoverHideTaken
// 三个方法原样执行，不起浏览器、不 import three。
// 用法：node Taierzhuang1938/Script_AiCrowdTest.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { CROWD } from "./Data_Tuning_Ai.mjs";
import { COVER } from "./Data_Tuning_AiCover.mjs";

const source = fs.readFileSync(new URL("./Script_Ai.mjs", import.meta.url), "utf8").replace(/\r/g, "");
const Method = (name) => source.match(new RegExp(`  ${name}\\([^\\n]*\\{[\\s\\S]*?\\n  }\\n`))[0];
const director = vm.runInNewContext(
  `({${Method("CrowdPinned")},${Method("SeparateSoldiers")},${Method("CoverHideTaken")}})`,
  { CROWD, COVER, Math });

let serial = 1;
const Man = (x, z, extra = {}) => ({ id: serial++, side: "nra", alive: true, position: { x, y: 0, z }, vaultT: -1, ...extra });
const Host = (soldiers) => Object.assign(Object.create(director), { soldiers });
const Run = (host, frames, dt = 1 / 60) => {
  for (let i = 0; i < frames; i += 1) {
    host.SeparateSoldiers(dt);
    for (const s of host.soldiers) { s.position.x += s.crowdPushX; s.position.z += s.crowdPushZ; }
  }
};
const Gap = (a, b) => Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
let checks = 0;
const Ok = (value, message) => { assert.ok(value, message); checks += 1; };

// ① 两个队友跪在同一个点：推开到 spacingM，各让一半，速度不超过 pushMps。
{
  const a = Man(0, 0), b = Man(0.2, 0), host = Host([a, b]);
  host.SeparateSoldiers(1 / 60);
  Ok(Math.abs(Math.hypot(a.crowdPushX, a.crowdPushZ) - Math.hypot(b.crowdPushX, b.crowdPushZ)) < 1e-9, "two free men share the push equally");
  Ok(Math.hypot(b.crowdPushX, b.crowdPushZ) * 2 <= CROWD.pushMps / 60 + 1e-9, "one frame never exceeds pushMps");
  Run(host, 120);
  Ok(Gap(a, b) >= CROWD.spacingM - 1e-6, `stacked allies end at least ${CROWD.spacingM} m apart (${Gap(a, b).toFixed(3)})`);
}
// ② 正好重合（零距离）也有确定方向，不产生 NaN。
{
  const a = Man(5, 5), b = Man(5, 5), host = Host([a, b]);
  Run(host, 120);
  Ok(Number.isFinite(a.position.x) && Number.isFinite(b.position.z), "exactly coincident men get a finite direction");
  Ok(Gap(a, b) >= CROWD.spacingM - 1e-6, "exactly coincident men separate");
}
// ③ 七个人挤在一个掩体点（2026-09-16 开局实测的那一团）。
{
  const men = Array.from({ length: 7 }, (_, i) => Man(-60.8 + i * 0.05, 90.16 + (i % 2) * 0.03));
  const host = Host(men);
  Run(host, 600);
  let min = Infinity;
  for (let i = 0; i < men.length; i += 1) for (let j = i + 1; j < men.length; j += 1) min = Math.min(min, Gap(men[i], men[j]));
  Ok(min > CROWD.spacingM * 0.9, `a seven-man pile spreads out (closest pair ${min.toFixed(3)} m)`);
}
// ④ 钉住的人不挪，另一个人承担全部推开量；两个都钉住就谁也不动。
for (const pin of [{ meleeCombat: {} }, { missionCarriageAction: {} }, { carryRole: "front" }, { missionAmbushClip: {} },
  { p012OnMovingTrain: true }, { missionTrainPassenger: true, missionTrainReady: false }, { vaultT: 0.2 }, { crowdPinned: true }]) {
  const a = Man(0, 0, pin), b = Man(0.3, 0), host = Host([a, b]);
  Run(host, 120);
  Ok(a.position.x === 0 && a.position.z === 0, `pinned ${Object.keys(pin)[0]} is never moved`);
  Ok(Gap(a, b) >= CROWD.spacingM - 1e-6, `the free man steps clear of pinned ${Object.keys(pin)[0]}`);
  const c = Man(0, 0, pin), d = Man(0.3, 0, pin), both = Host([c, d]);
  Run(both, 30);
  Ok(Gap(c, d) === 0.3, `two pinned ${Object.keys(pin)[0]} actors stay authored`);
}
Ok(!Host([]).CrowdPinned(Man(0, 0, { missionTrainPassenger: true, missionTrainReady: true })), "released passengers are free again");
// ⑤ 敌我、死人、楼上楼下都不推。
{
  const cases = [
    [Man(0, 0), Man(0.2, 0, { side: "ija" }), "opposite sides (melee and ambush stay in contact)"],
    [Man(0, 0), Man(0.2, 0, { alive: false }), "corpses"],
    [Man(0, 0), Man(0.2, 0, { position: { x: 0.2, y: CROWD.maxDyM + 0.1, z: 0 } }), "different floors"],
    [Man(0, 0), Man(CROWD.spacingM + 0.01, 0), "men already far enough apart"],
  ];
  for (const [a, b, label] of cases) {
    const host = Host([a, b]);
    host.SeparateSoldiers(1 / 60);
    Ok(!a.crowdPushX && !a.crowdPushZ && !b.crowdPushX && !b.crowdPushZ, `no push between ${label}`);
  }
}
// ⑥ 每帧重算：上一帧没被 StepBody 消费的推开量不累积。
{
  const a = Man(0, 0), b = Man(0.2, 0), host = Host([a, b]);
  host.SeparateSoldiers(1 / 60);
  const first = b.crowdPushX;
  host.SeparateSoldiers(1 / 60);
  Ok(b.crowdPushX === first, "unconsumed pushes are replaced, not accumulated");
}
// ⑥b 友军给玩家让路；玩家不动，敌人与钉住的人不让。
{
  const player = { Alive: true, position: { x: 0, y: 0, z: 0 } };
  const mate = Man(0.3, 0), foe = Man(-0.3, 0, { side: "ija" }), pinned = Man(0, 0.3, { missionCarriageAction: {} });
  const host = Object.assign(Host([mate, foe, pinned]), { ctx: { player } });
  Run(host, 120);
  Ok(Math.hypot(mate.position.x, mate.position.z) >= CROWD.spacingM - 1e-6, "an ally steps out of the player's way");
  Ok(player.position.x === 0 && player.position.z === 0, "the player is never pushed by the crowd pass");
  Ok(foe.position.x === -0.3, "enemies do not yield to the player");
  Ok(pinned.position.z === 0.3, "pinned performers do not yield to the player");
  const dead = Object.assign(Host([Man(0.3, 0)]), { ctx: { player: { Alive: false, position: { x: 0, y: 0, z: 0 } } } });
  Run(dead, 30);
  Ok(dead.soldiers[0].position.x === 0.3, "a dead player moves nobody");
}
// ⑦ 队友占着的隐蔽位不能再选；自己的、敌人的、死人的不算。
{
  const me = Man(0, 0), mate = Man(3, 0, { cover: { hidePos: { x: 1, z: 1 } } });
  const foe = Man(8, 0, { side: "ija", cover: { hidePos: { x: 5, z: 5 } } });
  const dead = Man(9, 0, { alive: false, cover: { hidePos: { x: 7, z: 7 } } });
  me.cover = { hidePos: { x: 10, z: 10 } };
  const host = Host([me, mate, foe, dead]);
  Ok(host.CoverHideTaken(me, { x: 1.2, z: 1.1 }), "a hide spot next to an ally's claimed spot is taken");
  Ok(!host.CoverHideTaken(me, { x: 1 + COVER.claimedHideClearanceM + 0.05, z: 1 }), "a spot one body width away is free");
  Ok(!host.CoverHideTaken(me, { x: 10, z: 10 }), "one's own current spot is not taken");
  Ok(!host.CoverHideTaken(me, { x: 5, z: 5 }), "an enemy's spot does not block");
  Ok(!host.CoverHideTaken(me, { x: 7, z: 7 }), "a dead man's stale cover does not block");
}
// ⑧ 接线：推开量随 StepBody 走角色控制器；待机隔帧步进遇到推开量当帧就走；选掩体用硬过滤。
Ok(/this\.SeparateSoldiers\(dt\);[\s\S]{0,200}for \(let i = 0; i < this\.soldiers\.length/.test(source), "Update separates before the Act loop");
Ok(/dx \+= s\.crowdPushX;[\s\S]{0,120}body\.Move\(dx, s\.velocityY \* dt, dz\)/.test(source), "the push goes through the character controller");
Ok(/cadence === 1 \|\| s\.crowdPushX \|\| s\.crowdPushZ/.test(source), "idle cadence does not delay a push");
Ok(/CoverAllowed\(s, cand\)\) continue;\n\s*if \(this\.CoverHideTaken\(s, cand\.hidePos\)\) continue;/.test(source), "UpdateCover rejects claimed hide spots");

console.log(`AiCrowdTest 通过：${checks} 条断言`);
