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
  await page.waitForFunction(() => window.Taierzhuang !== undefined, null, { timeout: 180000 });
  await page.evaluate(() => {
    const T = window.Taierzhuang;
    // 第一关先留 30 秒认路；AI 专项只把阶段钟拨到完整首遇，再触发一次补兵拍，
    // 不先模拟 31 秒战斗，以免把关卡进程混进姿态/队形的稳定性基准。
    T.state.phaseTime = 31;
    T.state.spawnAccumulator = 3.1;
    T.StepFrames(1, 1 / 60, false);
  });

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
      const squadCenters = new Map();
      for (const member of T.ai.soldiers) {
        if (!member.alive) continue;
        const center = squadCenters.get(member.squadId)
          || { x: 0, z: 0, count: 0 };
        center.x += member.position.x;
        center.z += member.position.z;
        center.count += 1;
        squadCenters.set(member.squadId, center);
      }
      for (const center of squadCenters.values()) {
        center.x /= center.count;
        center.z /= center.count;
      }
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
          // 「自动推进服从小队共同方向」只对**推进状态**的自动推进者有定义：
          // fire/suppressed 里的挪掩体、charge 的扑人本来就不看队向（实测
          // 这两桶常年 43–45%，纯稀释）；同伴队吃的是跟随器的手动 goal，
          // 也不是 SetSquadGoal 发的。任务流程重制后开局就接敌，混采会把
          // 战斗噪声当成「不服从」。
          if (!soldier.holdZone && soldier.order === "advance"
            && soldier.state === "advance" && T.ai.time >= soldier.manualGoalUntil
            && Math.hypot(soldier.squadForwardX, soldier.squadForwardZ) > 0.5) {
            const squadDot = (soldier.squadForwardX * dx + soldier.squadForwardZ * dz) / moved;
            prev.squadSamples += 1;
            // 编队保持算服从：队伍被火力钉住时质心不动，排在前面的人要**往回**
            // 收拢到 SetSquadGoal 分派的槽位（goal 在队向身后），这是纪律不是散兵。
            // 当年要防的回归（每人各奔几百米外的终点/导航场在街口各给各的答案）
            // goal 全在前方，享受不到这条豁免，读数仍会塌到 ~0.5。
            const gx = soldier.goal.x - soldier.position.x;
            const gz = soldier.goal.z - soldier.position.z;
            const goalLen = Math.hypot(gx, gz);
            const towardSlotBehind = goalLen > 0.3
              && (gx * dx + gz * dz) / (goalLen * moved) > 0
              && gx * soldier.squadForwardX + gz * soldier.squadForwardZ < 0;
            // 横向槽位同样是编队纪律：首关田坎把三支进攻组导向中央缺口时，
            // 侧翼兵会先横走到自己 36 m 内的滚动槽位，再沿队向推进。旧口径只放行
            // “前进/向后收拢”，把这种合法绕障压到 20% 左右。只认**队伍附近**的槽位，
            // 旧回归里每人各奔几百米外终点的 goal 仍然享受不到这条豁免。
            const center = squadCenters.get(soldier.squadId);
            const localSlot = center
              && Math.hypot(soldier.goal.x - center.x, soldier.goal.z - center.z) <= 36;
            const towardLocalSlot = localSlot && goalLen > 0.3
              && (gx * dx + gz * dz) / (goalLen * moved) > 0;
            if (squadDot > 0 || towardSlotBehind || towardLocalSlot) {
              prev.squadDirectedSamples += 1;
            }
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
    const squadBreakdown = [...soldiers.reduce((groups, soldier) => {
      if (!soldier.squadSamples) return groups;
      const key = `${soldier.side}/${soldier.squad}`;
      const item = groups.get(key) || { key, samples: 0, directed: 0 };
      item.samples += soldier.squadSamples;
      item.directed += soldier.squadDirectedSamples;
      groups.set(key, item);
      return groups;
    }, new Map()).values()]
      .map((item) => ({ ...item, ratio: item.directed / item.samples }))
      .sort((a, b) => a.ratio - b.ratio || b.samples - a.samples);
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
    //
    // 任务流程重制后各章友军全被剧本钉住（同伴队滚动续 manualGoalUntil、守点队
    // 带 holdZone），场上不再有天然「自动推进」的友军 —— 直接按旧过滤器采样
    // 恒为空集，测出来的是章节内容不是 AI。所以这里把剧本层也临时清掉
    // （事后原样还原），逼出 UpdateSquads 的 autoAdvance 支路再验行为本身；
    // 多跑几轮 UpdateSquads 是给 ApproachAngle 限速的队向留收敛时间
    // （正常游戏里队向早已对准，这里是探针当场改令，得补上这几秒）。
    const savedIjaStates = T.ai.soldiers
      .filter((soldier) => soldier.side === "ija")
      .map((soldier) => [soldier, soldier.state]);
    for (const [soldier] of savedIjaStates) soldier.state = "dead";
    const savedNraOrders = T.ai.soldiers
      .filter((soldier) => soldier.alive && soldier.side === "nra")
      .map((soldier) => [soldier, soldier.holdZone, soldier.order, soldier.manualGoalUntil,
        soldier.goal.x, soldier.goal.z]);
    for (const [soldier] of savedNraOrders) {
      soldier.holdZone = null;
      soldier.order = "advance";
      soldier.manualGoalUntil = -99;
    }
    for (let round = 0; round < 5; round += 1) T.ai.UpdateSquads();
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
    for (const [soldier, holdZone, order, manualGoalUntil, goalX, goalZ] of savedNraOrders) {
      soldier.holdZone = holdZone;
      soldier.order = order;
      soldier.manualGoalUntil = manualGoalUntil;
      soldier.goal.set(goalX, 0, goalZ);
    }
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
      squadBreakdown,
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
  // 0.58 的余量账（2026-08-29 任务流程重制并入 master 后重校）：本口径只采
  // 推进状态、且把「向身后槽位收拢」记为服从后，CH1 实测 ~73%（重制未并 master
  // 前 ~95%，差值来自 58e78f71 压制钉队是有意为之）；要防的散兵回归读数 ~50%。
  // 旧口径混采 fire/charge 战斗噪声时曾掉到 57.6% 贴闸，不是 AI 退步。
  Check("自动推进服从小队共同方向", sample.squadDirectionRatio >= 0.58,
    `同向采样 ${(sample.squadDirectionRatio * 100).toFixed(1)}%`
      + `；${sample.squadBreakdown.map((item) => `${item.key}=${(item.ratio * 100).toFixed(0)}%/${item.samples}`)
        .join(" ")}`);
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
