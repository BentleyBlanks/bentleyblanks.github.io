// 《滕县 一九三八》AI 行为稳定性冒烟。
// 真浏览器连续采样 12 秒，锁住「不瞬转、不反复蹲起、不频繁换目标、支援手不乱冲」。
// 用法：node Taierzhuang1938/Script_AiBehaviorTest.mjs

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const server = await ServeRoot(rootDir, 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const results = [];
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  — ${detail}` : ""}`);
}

try {
  const port = server.address().port;
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=1&quality=low&scale=small`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang !== undefined, { timeout: 180000 });
  await page.evaluate(() => window.Taierzhuang.StepFrames(60, 1 / 60, false));

  const sample = await page.evaluate(() => {
    const T = window.Taierzhuang;
    // 测稳定性时不让伤亡把「合理换目标」混进来。
    for (const soldier of T.ai.soldiers) if (soldier.alive) soldier.health = 1e9;
    const tracked = new Map();
    for (const soldier of T.ai.soldiers) {
      if (!soldier.alive) continue;
      tracked.set(soldier.id, {
        yaw: soldier.yaw, stance: soldier.stance,
        target: soldier.target?.isPlayer ? "player" : (soldier.target?.ref?.id ?? null),
        x: soldier.position.x, z: soldier.position.z,
        stanceChanges: 0, targetChanges: 0, maxYawStep: 0, maxBlendStep: 0,
        maxLookYawStep: 0, maxAimStep: 0,
        movingSamples: 0, directedSamples: 0, squadSamples: 0, squadDirectedSamples: 0,
        supportCharges: 0,
        stanceHistory: [],
        crouch: soldier.crouchBlend, prone: soldier.proneBlend,
        lookYaw: soldier.lookYaw, aim: soldier.aimBlend,
      });
    }

    for (let frame = 0; frame < 720; frame += 1) {
      T.StepFrames(1, 1 / 60, false);
      for (const soldier of T.ai.soldiers) {
        const prev = tracked.get(soldier.id);
        if (!prev || !soldier.alive) continue;
        const yawStep = Math.abs(Math.atan2(Math.sin(soldier.yaw - prev.yaw),
          Math.cos(soldier.yaw - prev.yaw)));
        prev.maxYawStep = Math.max(prev.maxYawStep, yawStep);
        const blendStep = Math.max(Math.abs(soldier.crouchBlend - prev.crouch),
          Math.abs(soldier.proneBlend - prev.prone));
        prev.maxBlendStep = Math.max(prev.maxBlendStep, blendStep);
        prev.maxLookYawStep = Math.max(prev.maxLookYawStep,
          Math.abs(soldier.lookYaw - prev.lookYaw));
        prev.maxAimStep = Math.max(prev.maxAimStep,
          Math.abs(soldier.aimBlend - prev.aim));
        if (soldier.stance !== prev.stance) {
          prev.stanceChanges += 1;
          prev.stanceHistory.push(`${frame}:${prev.stance}>${soldier.stance}/${soldier.state}/${soldier.suppression.toFixed(2)}`);
        }
        const target = soldier.target?.isPlayer ? "player" : (soldier.target?.ref?.id ?? null);
        if (target !== prev.target) prev.targetChanges += 1;
        if (soldier.tacticalRole === "support" && soldier.state === "charge") {
          prev.supportCharges += 1;
        }
        const dx = soldier.position.x - prev.x;
        const dz = soldier.position.z - prev.z;
        const moved = Math.hypot(dx, dz);
        if (moved > 0.008) {
          const dot = (-Math.sin(soldier.yaw) * dx - Math.cos(soldier.yaw) * dz) / moved;
          prev.movingSamples += 1;
          if (dot > 0.15) prev.directedSamples += 1;
          if (!soldier.holdZone && soldier.order === "advance"
            && Math.hypot(soldier.squadForwardX, soldier.squadForwardZ) > 0.5) {
            const squadDot = (soldier.squadForwardX * dx + soldier.squadForwardZ * dz) / moved;
            prev.squadSamples += 1;
            if (squadDot > 0) prev.squadDirectedSamples += 1;
          }
        }
        prev.yaw = soldier.yaw; prev.stance = soldier.stance; prev.target = target;
        prev.x = soldier.position.x; prev.z = soldier.position.z;
        prev.crouch = soldier.crouchBlend; prev.prone = soldier.proneBlend;
        prev.lookYaw = soldier.lookYaw; prev.aim = soldier.aimBlend;
      }
    }

    const soldiers = [...tracked.entries()].map(([id, data]) => {
      const soldier = T.ai.soldiers.find((item) => item.id === id);
      return { id, side: soldier?.side, squad: soldier?.squadId, role: soldier?.tacticalRole, ...data };
    });
    const roles = [...new Set(soldiers.map((soldier) => soldier.role))];
    const squads = [...new Set(soldiers.map((soldier) => soldier.squad))];
    const moving = soldiers.reduce((sum, soldier) => sum + soldier.movingSamples, 0);
    const directed = soldiers.reduce((sum, soldier) => sum + soldier.directedSamples, 0);
    const squadSamples = soldiers.reduce((sum, soldier) => sum + soldier.squadSamples, 0);
    const squadDirected = soldiers.reduce((sum, soldier) => sum + soldier.squadDirectedSamples, 0);
    const stanceWorst = soldiers.slice().sort((a, b) => b.stanceChanges - a.stanceChanges)[0];
    // 规则层直调也按新契约把枪口摆正、把目标标为可见，确认方向闸门没有误伤过热账。
    const gunner = T.ai.soldiers.find((soldier) => soldier.alive && soldier.side === "ija");
    let overheatShots = -1;
    if (gunner) {
      gunner.weapon = { magazine: 30, fireIntervalS: 0.12, reloadTimeS: 5.2,
        overheatShots: 200, coolDownS: 8, aiAccuracy: 0.5, aiAimTimeS: 0,
        effectiveRangeM: 600, damage: 66, kind: "lmg" };
      gunner.target = { position: { x: gunner.position.x + 30, y: gunner.position.y, z: gunner.position.z },
        isPlayer: false, ref: null };
      gunner.targetVisible = true; gunner.yaw = -Math.PI * 0.5;
      gunner.heat = 0; gunner.coolUntil = -99;
      overheatShots = 0;
      for (let i = 0; i < 500 && gunner.coolUntil <= T.ai.time; i += 1) {
        const before = T.ai.fireCount;
        gunner.ammo = 30; gunner.fireTimer = 0; gunner.aimTime = 9; gunner.suppression = 0;
        T.ai.TryFire(gunner, 0.05, T.player);
        overheatShots += T.ai.fireCount - before;
      }
    }

    // 把日军临时从规则层隐藏，强制走「没有近敌」分支：仍在自动推进的友军小队
    // 必须统一锁当前未完成路标，不能恢复成每人挑最近点。
    const savedIjaStates = T.ai.soldiers
      .filter((soldier) => soldier.side === "ija")
      .map((soldier) => [soldier, soldier.state]);
    for (const [soldier] of savedIjaStates) soldier.state = "dead";
    T.ai.UpdateSquads();
    const mission = T.battlefield.objectives.find((objective) => !objective.reached)
      || T.battlefield.objectives[T.battlefield.objectives.length - 1];
    const fallback = T.ai.soldiers.filter((soldier) => soldier.alive && soldier.side === "nra"
      && !soldier.holdZone && soldier.order === "advance" && T.ai.time >= soldier.manualGoalUntil);
    const fallbackFocused = fallback.filter((soldier) => soldier.squadFocusKind === "objective"
      && soldier.squadFocusId === mission?.id).length;
    const fallbackDirected = fallback.filter((soldier) => {
      const gx = soldier.goal.x - soldier.position.x;
      const gz = soldier.goal.z - soldier.position.z;
      const ox = (mission?.x ?? soldier.position.x) - soldier.position.x;
      const oz = (mission?.z ?? soldier.position.z) - soldier.position.z;
      return gx * ox + gz * oz > 0;
    }).length;
    for (const [soldier, state] of savedIjaStates) soldier.state = state;
    return {
      count: soldiers.length, roles, squads,
      maxYawStep: Math.max(...soldiers.map((soldier) => soldier.maxYawStep)),
      maxBlendStep: Math.max(...soldiers.map((soldier) => soldier.maxBlendStep)),
      maxLookYawStep: Math.max(...soldiers.map((soldier) => soldier.maxLookYawStep)),
      maxAimStep: Math.max(...soldiers.map((soldier) => soldier.maxAimStep)),
      maxStanceChanges: Math.max(...soldiers.map((soldier) => soldier.stanceChanges)),
      stanceWorst: stanceWorst ? `${stanceWorst.side}/${stanceWorst.role}/${stanceWorst.id} ${stanceWorst.stanceHistory.join(",")}` : "none",
      maxTargetChanges: Math.max(...soldiers.map((soldier) => soldier.targetChanges)),
      supportCharges: soldiers.reduce((sum, soldier) => sum + soldier.supportCharges, 0),
      directionRatio: moving ? directed / moving : 0,
      squadDirectionRatio: squadSamples ? squadDirected / squadSamples : 0,
      fallbackCount: fallback.length,
      fallbackFocused,
      fallbackDirected,
      overheatShots,
    };
  });

  Check("六人组与战术角色已分配", sample.count >= 8 && sample.squads.length >= 2
    && ["leader", "assault", "support", "flank"].every((role) => sample.roles.includes(role)),
  `兵=${sample.count} 组=${sample.squads.length} 角色=${sample.roles.join("/")}`);
  Check("身体没有逐帧瞬转", sample.maxYawStep <= 0.086,
    `单帧最大 ${(sample.maxYawStep * 180 / Math.PI).toFixed(2)}°`);
  Check("蹲卧动画连续", sample.maxBlendStep <= 0.071,
    `单帧最大 blend=${sample.maxBlendStep.toFixed(4)}`);
  Check("枪口转向与据枪连续", sample.maxLookYawStep <= 0.081 && sample.maxAimStep <= 0.093,
    `单帧 look=${sample.maxLookYawStep.toFixed(4)} aim=${sample.maxAimStep.toFixed(4)}`);
  Check("姿态没有阈值抽动", sample.maxStanceChanges <= 6,
    `12 秒单兵最多切换 ${sample.maxStanceChanges} 次（${sample.stanceWorst}）`);
  Check("目标锁没有来回甩枪口", sample.maxTargetChanges <= 7,
    `12 秒单兵最多换目标 ${sample.maxTargetChanges} 次`);
  Check("支援位不自行冲锋", sample.supportCharges === 0,
    `误入 charge 帧=${sample.supportCharges}`);
  Check("枪口方向闸门不破坏机枪过热账", sample.overheatShots === 200,
    `触发冷却前开火=${sample.overheatShots}`);
  Check("移动方向与身体朝向一致", sample.directionRatio >= 0.6,
    `一致采样 ${(sample.directionRatio * 100).toFixed(1)}%`);
  Check("自动推进服从小队共同方向", sample.squadDirectionRatio >= 0.58,
    `同向采样 ${(sample.squadDirectionRatio * 100).toFixed(1)}%`);
  Check("无近敌时整队回退到当前任务路标", sample.fallbackCount >= 2
    && sample.fallbackFocused === sample.fallbackCount
    && sample.fallbackDirected >= sample.fallbackCount * 0.8,
  `友军=${sample.fallbackCount} 同焦点=${sample.fallbackFocused} 朝路标=${sample.fallbackDirected}`);
  Check("浏览器无脚本错误", errors.length === 0, errors.slice(0, 2).join(" | "));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) process.exitCode = 1;
