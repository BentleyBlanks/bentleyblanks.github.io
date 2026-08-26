// 《滕县 一九三八》人物方向性能回归：朝向敌军密集区不能让人物提交量失控。
//
// 用法：node Taierzhuang1938/Script_PerformanceTest.mjs
// 退出码即成败。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors = [];
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 240)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  errors.push(`CONSOLE ${message.text().slice(0, 240)}`);
});

let result = null;
try {
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=2&quality=low&scale=small`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang !== undefined, null, { timeout: 240000 });
  result = await page.evaluate(() => {
    const T = window.Taierzhuang;
    T.StepFrames(60);
    const player = T.player;
    // 初始 60 帧里双方可能已经交火；阵亡者有独立的倒地动画更新规则，不能混进
    // “活人转头 LOD”基准，否则场景出生点一变就会让计数随早期伤亡漂移。
    const enemies = T.ai.soldiers.filter((soldier) => soldier.side === "ija" && soldier.alive && soldier.actor);
    const allies = T.ai.soldiers.filter((soldier) => soldier.side === "nra" && soldier.alive && soldier.actor);
    // 人为摆出一条最坏的通视走廊：前方是日军密集区，后方只留少量守军。
    // 测的是“转头”这一个变量，不把关卡随机撒兵当成性能依据。
    const origin = player.position.clone();
    const Place = (soldier, x, z) => {
      soldier.position.set(origin.x + x, origin.y, origin.z + z);
      soldier.actor.root.position.copy(soldier.position);
      if (soldier.body) soldier.body.Teleport(soldier.position.x, soldier.position.y, soldier.position.z);
    };
    enemies.slice(0, 30).forEach((soldier, index) => {
      const column = index % 10;
      const row = Math.floor(index / 10);
      Place(soldier, (column - 4.5) * 3.2, -34 - row * 20);
    });
    // 关卡出生点与街网会迭代，不能让“第 31 人以后”的随机出生位置混进结果；
    // 全部移到两组采样视锥的侧后方，测试只保留上面明确摆出的 30 名日军。
    enemies.slice(30).forEach((soldier, index) => {
      Place(soldier, 500 + (index % 8) * 4, (Math.floor(index / 8) - 2) * 8);
    });
    allies.slice(0, 8).forEach((soldier, index) => {
      Place(soldier, (index - 3.5) * 3.2, 38 + (index % 2) * 8);
    });

    // CPU 回归不只看墙钟（CI 负载会让 ms 波动）：同时统计真正进入姿态
    // 解算的次数。这个数是确定的，可以锁住“远处 23 人又每帧全算”的回归。
    for (const soldier of T.ai.soldiers) {
      if (!soldier.actor || soldier.actor.userDataPerformanceWrapped) continue;
      const Update = soldier.actor.Update.bind(soldier.actor);
      soldier.actor.Update = (...args) => {
        soldier.actor.performanceUpdateCount = (soldier.actor.performanceUpdateCount || 0) + 1;
        return Update(...args);
      };
      soldier.actor.userDataPerformanceWrapped = true;
    }

    const Sample = (yaw) => {
      for (const soldier of T.ai.soldiers) {
        if (soldier.actor) soldier.actor.performanceUpdateCount = 0;
      }
      player.yaw = yaw;
      player.pitch = 0;
      player.aimYaw = 0;
      player.aimPitch = 0;
      T.StepFrames(2);
      T.renderer.info.autoReset = false;
      T.renderer.info.reset();
      const started = performance.now();
      T.StepFrames(12);
      T.renderer.getContext().finish();
      const cpuMs = (performance.now() - started) / 12;
      const rendered = T.ai.soldiers.filter((soldier) => soldier.renderLod === "detail"
        || soldier.renderLod === "crowd");
      const metrics = {
        cpuMs,
        drawCalls: T.renderer.info.render.calls / 12,
        triangles: T.renderer.info.render.triangles / 12,
        renderedIja: rendered.filter((soldier) => soldier.side === "ija").length,
        renderedNra: rendered.filter((soldier) => soldier.side === "nra").length,
        detailIja: rendered.filter((soldier) => soldier.side === "ija" && soldier.renderLod === "detail").length,
        crowdIja: rendered.filter((soldier) => soldier.side === "ija" && soldier.renderLod === "crowd").length,
        animatedIja: T.ai.soldiers.filter((soldier) => soldier.side === "ija" && soldier.alive)
          .reduce((sum, soldier) => sum + (soldier.actor?.performanceUpdateCount || 0), 0),
        detachedActors: T.ai.soldiers.filter((soldier) => soldier.actor
          && soldier.renderLod !== "detail" && !soldier.actor.root.parent).length,
        batchRecords: T.actorBatch?.records.size ?? 0,
        smallestBatchCapacity: Math.min(Infinity, ...[...(T.actorBatch?.groups.values() ?? [])]
          .flatMap((group) => Object.values(group.meshes).filter(Boolean))
          .map((mesh) => mesh.instanceMatrix.count)),
      };
      T.renderer.info.autoReset = true;
      return metrics;
    };
    const toward = Sample(0);
    const away = Sample(Math.PI);

    // 战斗一开始就会留下近景尸体，而本作明确要求尸体保留到本关结束。
    // 保留画面不等于永远重算定格姿势：倒地动画 0.9 s 收完后，尸体若仍在
    // 视锥内，旧逻辑会让每具完整 Actor 每帧继续 Update。十具就是一秒六百次
    // 无效骨架／分件解算，正好会把高刷屏从 144 Hz 推过 6.9 ms 门槛，表现为
    // “跑几步以后帧率直接减半”。这里把近景与远景尸体各摆一排，同时锁死
    // 完整 Actor 的定格更新和远景尸体专用合批两条回归。
    player.yaw = 0;
    player.pitch = 0;
    T.StepFrames(2);
    const corpseVictims = T.ai.soldiers.filter((soldier) => soldier.alive && soldier.actor).slice(0, 20);
    corpseVictims.forEach((soldier, index) => {
      const half = Math.ceil(corpseVictims.length / 2);
      const rowIndex = index % half;
      const z = index < half ? -20 - (index % 2) * 2 : -38 - (index % 2) * 2;
      Place(soldier, (rowIndex - (half - 1) / 2) * 2.0, z);
      soldier.Kill();
    });
    T.StepFrames(120);                    // 2 s：倒地动作与尸体刚体都已稳定
    for (const soldier of corpseVictims) soldier.actor.performanceUpdateCount = 0;
    T.StepFrames(60);
    const settledCorpses = {
      killed: corpseVictims.length,
      detailed: corpseVictims.filter((soldier) => soldier.renderLod === "detail").length,
      crowd: corpseVictims.filter((soldier) => soldier.renderLod === "crowd").length,
      settled: corpseVictims.filter((soldier) => soldier.corpseSettled).length,
      deadLodInstances: T.ai.crowd?.DeadCount ?? 0,
      poseUpdates: corpseVictims.reduce(
        (sum, soldier) => sum + (soldier.actor?.performanceUpdateCount || 0), 0),
    };

    return { toward, away, settledCorpses };
  });
} finally {
  await browser.close();
  server.close();
}

if (result) {
  const Format = (sample) => `CPU ${sample.cpuMs.toFixed(1)} ms | calls ${sample.drawCalls.toFixed(0)}`
    + ` | tris ${(sample.triangles / 1e6).toFixed(2)}M | IJA ${sample.renderedIja}`
    + ` (${sample.detailIja} detail + ${sample.crowdIja} LOD, ${sample.animatedIja} pose updates)`
    + ` | NRA ${sample.renderedNra}`;
  console.log(`toward  ${Format(result.toward)}`);
  console.log(`away    ${Format(result.away)}`);
  console.log(`ratio   CPU ${(result.toward.cpuMs / result.away.cpuMs).toFixed(2)}x | calls `
    + `${(result.toward.drawCalls / result.away.drawCalls).toFixed(2)}x`);
  console.log(`corpses ${result.settledCorpses.detailed} detail + ${result.settledCorpses.crowd} dead LOD`
    + ` / ${result.settledCorpses.settled} settled | ${result.settledCorpses.poseUpdates} redundant pose updates`);
}
for (const error of errors) console.log(error);
const failures = [];
if (result) {
  if (result.toward.renderedIja < 20) failures.push(`镜头前日军渲染不足 ${result.toward.renderedIja} < 20`);
  if (result.toward.crowdIja < 10) failures.push(`远景 LOD 未接管 ${result.toward.crowdIja} < 10`);
  if (result.toward.animatedIja > 60) failures.push(`日军姿态更新过多 ${result.toward.animatedIja} > 60`);
  if (result.toward.detachedActors < 10) failures.push(`屏外/远景完整模型仍挂在场景树 ${result.toward.detachedActors} < 10`);
  if (result.toward.smallestBatchCapacity < result.toward.batchRecords) {
    failures.push(`人物批次仍会随转头扩容 ${result.toward.smallestBatchCapacity} < ${result.toward.batchRecords}`);
  }
  if (result.toward.drawCalls > 650) failures.push(`朝敌方向 calls 过高 ${result.toward.drawCalls.toFixed(0)} > 650`);
  const callRatio = result.toward.drawCalls / Math.max(1, result.away.drawCalls);
  if (callRatio > 1.35) failures.push(`转向 calls 尖峰 ${callRatio.toFixed(2)}x > 1.35x`);
  if (result.settledCorpses.killed < 16 || result.settledCorpses.detailed < 6
      || result.settledCorpses.crowd < 6) {
    failures.push(`尸体 LOD 取证不足 ${result.settledCorpses.detailed} detail + `
      + `${result.settledCorpses.crowd} LOD / ${result.settledCorpses.killed}`);
  }
  if (result.settledCorpses.settled !== result.settledCorpses.killed) {
    failures.push(`尸体刚体未稳定 ${result.settledCorpses.settled}/${result.settledCorpses.killed}`);
  }
  if (result.settledCorpses.poseUpdates !== 0) {
    failures.push(`定格尸体仍在重算姿势 ${result.settledCorpses.poseUpdates} 次`);
  }
  if (result.settledCorpses.deadLodInstances < result.settledCorpses.crowd) {
    failures.push(`远景尸体没有全部使用倒地合批 ${result.settledCorpses.deadLodInstances}`
      + ` < ${result.settledCorpses.crowd}`);
  }
}
for (const failure of failures) console.log(`FAIL ${failure}`);
process.exit(errors.length || failures.length || !result ? 1 : 0);
