// Script_EncounterTankTest.mjs —— 遭遇战与第一关九四式轻装甲车 AI/压迫力纯 Node 回归门禁
import assert from "node:assert/strict";
import { ENCOUNTER_TANK } from "./Data_Tuning_EncounterTank.mjs";
import { EncounterTankBrain, AnalyticTanketteMuzzle, YawTo } from "./Script_EncounterTankBrain.mjs";

const Wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// 1. 纯数据表可无损 JSON 序列化，关键几何与节奏数值有效
{
  const roundtrip = JSON.parse(JSON.stringify(ENCOUNTER_TANK));
  assert.deepEqual(roundtrip.hull.half, ENCOUNTER_TANK.hull.half);
  assert.ok(ENCOUNTER_TANK.mg.shotIntervalS > 0 && ENCOUNTER_TANK.mg.shotIntervalS < 0.25);
  assert.ok(ENCOUNTER_TANK.mg.walkInDamageScale === 0);
  assert.ok(ENCOUNTER_TANK.mg.playerDamageScale > 0);
  assert.ok(ENCOUNTER_TANK.engagement.holdFireBeats.includes("05c"));
  assert.ok(!ENCOUNTER_TANK.engagement.holdFireBeats.includes("06a"));
  assert.ok(!ENCOUNTER_TANK.engagement.holdFireBeats.includes("08c"));
}

// 2. 05c 接近段停火但保持炮塔警戒扫视与运动转速；进入 06a/08c 开火许可后才射击
{
  const brain = new EncounterTankBrain("tank1", { x: 105, z: 196, hullYaw: Math.PI, turretYaw: Math.PI });
  const player = { id: "player", kind: "player", x: 100, y: 1.2, z: 220, ground: 0, alive: true };
  let firedWhileHolding = 0;
  let maxTurretDelta = 0;
  for (let i = 0; i < 60; i++) {
    const out = brain.Update(0.1, {
      pose: { x: 105, z: 196 + i * 0.12, groundY: 0, hullYaw: Math.PI },
      weaponsFree: false,
      targets: [player],
      Los: () => true,
    });
    firedWhileHolding += out.fire.length;
    maxTurretDelta = Math.max(maxTurretDelta, Math.abs(Wrap(out.turret.yaw - Math.PI)));
  }
  assert.equal(firedWhileHolding, 0, "Hold-fire approach beat never shoots");
  assert.ok(maxTurretDelta > 0.1, "Turret actively tracks/scans during approach");
  assert.ok(brain.rpm > ENCOUNTER_TANK.pressure.idleRpm, "Moving tank raises engine RPM");
}

// 3. 08c 沟口阻击：发现沟南顺子 → 炮塔转向 + 停顿预兆 → 首次接触零伤扫地警告 → 后续致命长点射
{
  const brain = new EncounterTankBrain("tank3", { x: 115, z: 465.8, hullYaw: Math.PI, turretYaw: Math.PI });
  const player = { id: "player", kind: "player", x: 104, y: 1.2, z: 478, ground: 0, alive: true };
  const expectedYaw = YawTo({ x: 115, z: 465.8 }, player);
  let sawAimHold = false;
  const walkInShots = [];
  const lethalShots = [];

  for (let i = 0; i < 120; i++) {
    const out = brain.Update(0.1, {
      pose: { x: 115, z: 465.8, groundY: 0, hullYaw: Math.PI },
      weaponsFree: true,
      targets: [player],
      Los: () => true,
    });
    if (out.turret.phase === "aimHold") sawAimHold = true;
    for (const s of out.fire) {
      if (s.kind === "walkIn") walkInShots.push(s);
      else if (s.kind === "lethal") lethalShots.push(s);
    }
  }
  assert.ok(sawAimHold, "Tank pauses briefly after turret aligns as a fair telegraph");
  assert.ok(Math.abs(Wrap(brain.turretYaw - expectedYaw)) < 0.15, "Turret aligns toward trench player");
  assert.ok(walkInShots.length >= 8, "First contact fires a visible walk-in warning burst");
  assert.ok(walkInShots.every((s) => s.damageScale === 0), "Walk-in burst deals zero direct hit damage");
  assert.ok(lethalShots.length >= 10, "Subsequent bursts deliver sustained lethal fire if player stays exposed");
  assert.ok(lethalShots.every((s) => s.damageScale > 0), "Lethal bursts deal real damage");
}

// 4. 玩家缩回掩体失去视线后，坦克记住 lastKnown 并向掩体沿持续压制扫射
{
  const brain = new EncounterTankBrain("tank3", { x: 115, z: 465.8, hullYaw: Math.PI, turretYaw: Math.PI });
  const player = { id: "player", kind: "player", x: 104, y: 1.2, z: 478, ground: 0, alive: true };
  // 先看见 0.3s 建立记忆并跳过首次警告
  for (let i = 0; i < 5; i++) {
    brain.Update(0.1, { pose: { x: 115, z: 465.8, groundY: 0, hullYaw: Math.PI }, weaponsFree: true, targets: [player], Los: () => true });
  }
  // 玩家缩进沟底失去视线，掩体沿在 (106, 0.9, 476.5)
  const coverLip = { x: 106, y: 0.9, z: 476.5 };
  const suppressShots = [];
  for (let i = 0; i < 45; i++) {
    const out = brain.Update(0.1, {
      pose: { x: 115, z: 465.8, groundY: 0, hullYaw: Math.PI },
      weaponsFree: true,
      targets: [player],
      Los: () => false,
      Cover: () => coverLip,
    });
    for (const s of out.fire) if (s.kind === "suppress") suppressShots.push(s);
  }
  assert.ok(suppressShots.length >= 6, "Tank suppresses last-known cover lip after player ducks");
  const avgDistToLip = suppressShots.reduce((sum, s) => sum + Math.hypot(s.at.x - coverLip.x, s.at.z - coverLip.z), 0) / suppressShots.length;
  assert.ok(avgDistToLip < 2.5, "Suppressing rounds land tightly along the cover lip");
}

// 5. 08c 无直接视线且无记忆时，按沟沿区域目标压制（战场绝不哑火）
{
  const brain = new EncounterTankBrain("tank3", { x: 115, z: 465.8, hullYaw: Math.PI, turretYaw: Math.PI });
  const zone = { id: "ditchLipCenter", kind: "zone", x: 105.5, y: 0.65, z: 477.2, ground: 0, weight: 0.75, alive: true };
  let zoneShots = 0;
  for (let i = 0; i < 50; i++) {
    const out = brain.Update(0.1, {
      pose: { x: 115, z: 465.8, groundY: 0, hullYaw: Math.PI },
      weaponsFree: true,
      targets: [zone],
      Los: () => false,
    });
    zoneShots += out.fire.filter((s) => s.kind === "zone").length;
  }
  assert.ok(zoneShots >= 8, "Tank rakes authored trench lip zones even while defenders stay hidden");
}

// 6. 子弹打装甲触发仇恨甩塔（含冷却）与近爆晃动机身
{
  const brain = new EncounterTankBrain("tank1", { x: 101, z: 274, hullYaw: Math.PI, turretYaw: Math.PI });
  const flankShooter = { x: 88, y: 1.2, z: 270 };
  assert.equal(brain.OnBulletHit({ from: flankShooter, shooterId: "player" }).aggro, true, "First armor hit draws turret aggro");
  assert.equal(brain.OnBulletHit({ from: flankShooter, shooterId: "player" }).aggro, false, "Immediate repeat hit respects aggro cooldown");

  const startYaw = brain.turretYaw;
  for (let i = 0; i < 15; i++) {
    brain.Update(0.1, { pose: { x: 101, z: 274, groundY: 0, hullYaw: Math.PI }, weaponsFree: true, targets: [], Los: () => true });
  }
  const wantYaw = YawTo({ x: 101, z: 274 }, flankShooter);
  assert.ok(Math.abs(Wrap(brain.turretYaw - wantYaw)) < Math.abs(Wrap(startYaw - wantYaw)) - 0.5, "Turret whips toward armor shooter");

  const blast = brain.OnBlast({ position: { x: 97, y: 0.3, z: 274 }, thrower: { x: 92, y: 1.2, z: 276 }, throwerId: "player" });
  assert.equal(blast.reacted, true, "Nearby grenade triggers tank blast reaction");
  const rocked = brain.Update(0.05, { pose: { x: 101, z: 274, groundY: 0, hullYaw: Math.PI }, weaponsFree: true, targets: [], Los: () => true });
  assert.ok(Math.abs(rocked.pose.hullRock) > 0.005, "Nearby blast rocks the tank hull");
}

// 7. 06g/06h 幺娃在西坎吸引后车 tank2 炮塔；玩家绕近 3.3m 内进入俯角死角
{
  const brain = new EncounterTankBrain("tank2", { x: 101, z: 262, hullYaw: Math.PI, turretYaw: Math.PI });
  const yao = { id: "yao", kind: "heavyAlly", x: 81, y: 1.2, z: 275, ground: 0, alive: true };
  const playerMid = { id: "player", kind: "player", x: 96, y: 1.2, z: 280, ground: 0, alive: true };
  const decoyRule = ENCOUNTER_TANK.engagement.decoyBeats["06h"];
  brain.OnDecoyFire({ from: yao, actorId: "yao", durationS: 4.0 });
  for (let i = 0; i < 20; i++) {
    brain.Update(0.1, {
      pose: { x: 101, z: 262, groundY: 0, hullYaw: Math.PI },
      weaponsFree: true,
      targets: [yao, playerMid],
      Los: () => true,
      decoyRule,
    });
  }
  assert.equal(brain.targetId, "yao", "Yao decoy draws tank2 turret west away from mid-range player");

  // 玩家紧贴车头 2.2m 塞集束弹：处于贴身死角，坦克不再穿自身履带锁死贴身玩家
  const brainClose = new EncounterTankBrain("tank1", { x: 101, z: 278, hullYaw: Math.PI, turretYaw: Math.PI });
  const planter = { id: "player", kind: "player", x: 101, y: 1.0, z: 275.8, ground: 0, alive: true };
  let closeShots = 0;
  for (let i = 0; i < 30; i++) {
    const out = brainClose.Update(0.1, {
      pose: { x: 101, z: 278, groundY: 0, hullYaw: Math.PI },
      weaponsFree: true,
      targets: [planter],
      Los: () => true,
    });
    closeShots += out.fire.length;
  }
  assert.equal(closeShots, 0, "Close dead-zone under hull protects bundle planting once escorts are cleared");
}

// 8. 摧毁后立即停火、熄火、输出 destroyed 事件
{
  const brain = new EncounterTankBrain("tank1", { x: 101, z: 278, hullYaw: Math.PI, turretYaw: Math.PI });
  const player = { id: "player", kind: "player", x: 94, y: 1.2, z: 276, ground: 0, alive: true };
  const evs = [];
  let shotsAfter = 0;
  for (let i = 0; i < 30; i++) {
    const out = brain.Update(0.1, {
      pose: { x: 101, z: 278, groundY: 0, hullYaw: Math.PI, destroyed: true },
      weaponsFree: true,
      targets: [player],
      Los: () => true,
    });
    evs.push(...out.events);
    shotsAfter += out.fire.length;
  }
  assert.ok(evs.some((e) => e.id === "destroyed"), "Destroying tank emits destroyed event");
  assert.equal(shotsAfter, 0, "Destroyed tank never fires");
  assert.equal(brain.rpm, 0, "Destroyed tank engine stalls down to 0 rpm");
}

// 9. 解析枪口坐标位于炮塔前方（-Z 沿炮塔朝向）
{
  const muzzleNorth = AnalyticTanketteMuzzle(0, 0, 0, 0, 0, 0);
  assert.ok(muzzleNorth.z < 0 && muzzleNorth.y > 1.2 && muzzleNorth.y < 1.5, "North-facing turret muzzle sits forward and at turret gun height");
  const muzzleSouth = AnalyticTanketteMuzzle(115, 0, 465.8, Math.PI, Math.PI, 0);
  assert.ok(muzzleSouth.z > 465.8, "South-facing turret muzzle projects southward (+Z)");
}

console.log("Script_EncounterTankTest: ALL PASSED");
