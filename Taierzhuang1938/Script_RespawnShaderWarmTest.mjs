// ===========================================================================
// Script_RespawnShaderWarmTest.mjs —— 换人那一帧不许同步编译着色器
//
// 事故（2026-09-05，RTX 4070 SUPER / Edge）：玩家阵亡 → 阵亡卡片读完 →
// RespawnPlayer() 那一帧 post 桶 2929 ms，renderer.info.programs 43 → 52。
// 当时归因到「换上来的人领了不同的枪」；这条探针量出来不是（换人后仍是
// loadoutOverride 钉死的那支枪），涨的是卢沟桥人物 GLB 的材质：换人换了个机位，
// 第一次看见的模型号那一帧才编 program。定论与做法见 Script_Main.WarmActorShaders
// 与 docs/Data_TechRenderPipeline.md §16。
//
// 三组断言：
//   1. 连死几次（--deaths），RespawnPlayer 落地那一帧 program 总数不涨、整帧 CPU < 50 ms；
//      身份按阵亡人数派种子，所以多死几次才覆盖到不同机位。
//   2. 全模型号扫描：把两个阵营四个模型号各配本阵营的枪摆到镜头前真画几帧，
//      再把镜头转一圈 —— program 总数仍不涨。这一条保证预热覆盖的是**全部**模型号，
//      不是碰巧撒兵撒到的那几个。
//   3. 页面没有 pageerror / console.error。
//
// 用法：node Taierzhuang1938/Script_RespawnShaderWarmTest.mjs [--query="phase=2"] [--deaths=3]
//       默认 query 为 phase=2（正片切片），--query="explosions=1" 走爆炸测试场。
// ===========================================================================

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");

const Arg = (name, fallback) => {
  const hit = process.argv.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const QUERY = Arg("query", "phase=2");
const DEATHS = Math.max(1, parseInt(Arg("deaths", "3"), 10) || 3);
const MAX_FRAME_MS = 50;

const server = await ServeRoot(rootDir, 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 300)}`));
page.on("console", (message) => {
  if (message.type() === "error" && !/fonts\.(googleapis|gstatic)\.com/.test(message.location()?.url || "")) {
    errors.push(`CONSOLE ${message.text().slice(0, 300)}`);
  }
});

let failed = false;
const Report = (ok, name, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name} — ${detail}`);
  if (!ok) failed = true;
};

try {
  const port = server.address().port;
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?${QUERY}&shot=1&manual=1&quality=medium&scale=small`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang?.state?.ready, null, { timeout: 180000 });

  const result = await page.evaluate((deaths) => {
    const T = window.Taierzhuang;
    const Programs = () => T.renderer.info.programs.map((program) => ({ name: program.name, key: program.cacheKey }));
    const Slots = () => T.Debug.Slots();
    const Born = (before) => {
      const known = new Set(before.map((program) => program.key));
      return Programs().filter((program) => !known.has(program.key)).map((program) => program.name);
    };
    // 敌人挪远：这条探针只量换人那一帧，不许中途被打死或被爆炸把人再撂倒。
    for (const soldier of T.ai.soldiers) {
      if (soldier.side === "ija") soldier.position.set(soldier.position.x + 800, soldier.position.y, soldier.position.z + 800);
    }
    T.state.spawnAccumulator = -1e6;
    T.profiler.Enable();
    if (!T.player.Alive) T.player.Spawn(T.player.position.x, T.player.position.z, T.player.yaw);
    T.player.health = 100;
    // 先把当前这把枪与场景本身画热：探针只认「换人」引入的增量。
    T.StepFrames(12);
    const rounds = [];
    for (let round = 0; round < deaths; round += 1) {
      const before = Slots();
      const programsBefore = Programs();
      T.player.Kill();
      T.StepFrames(1);
      const pending = T.state.pendingRespawn;
      let respawnFrame = null;
      let frames = 0;
      let cardFramesMaxMs = 0;
      const programsAtDeath = T.renderer.info.programs.length;
      let programsDuringCard = programsAtDeath;
      // 阵亡卡片倒计时按 dt 走；逐帧推，抓住 pendingRespawn 翻回 false 的那一帧。
      while (T.state.pendingRespawn && frames < 600) {
        const programsPre = T.renderer.info.programs.length;
        T.StepFrames(1);
        frames += 1;
        const record = T.profiler.history[T.profiler.history.length - 1];
        if (T.state.pendingRespawn) {
          cardFramesMaxMs = Math.max(cardFramesMaxMs, record.cpuMs);
          programsDuringCard = T.renderer.info.programs.length;
        } else {
          respawnFrame = {
            cpuMs: record.cpuMs, cpu: record.cpu,
            programsPre, programsPost: T.renderer.info.programs.length,
          };
        }
      }
      // 换人落地后再画几帧：新机位下的阴影、预通道变体都该已经热了。
      const settle = [];
      for (let i = 0; i < 6; i += 1) {
        const pre = T.renderer.info.programs.length;
        T.StepFrames(1);
        const record = T.profiler.history[T.profiler.history.length - 1];
        settle.push({ cpuMs: record.cpuMs, born: T.renderer.info.programs.length - pre });
      }
      rounds.push({
        round, pending, frames, cardFramesMaxMs, programsAtDeath, programsDuringCard,
        before: { weapon: before.viewmodel, active: before.active },
        after: { weapon: Slots().viewmodel, active: Slots().active },
        respawnFrame, born: Born(programsBefore), settle,
        alive: T.player.Alive, pool: T.state.nraPool,
      });
      if (!T.player.Alive) break;
    }

    // --- 全模型号扫描 -------------------------------------------------------
    // 两个阵营各四个模型号 × 本阵营会发的枪，摆在镜头前 8—14 m、左右 ±4 m 的扇面里
    // 真画几帧（CullActors 只把视锥内、细节距离内的人挂回场景，摆远了等于没画）。
    // 玩家先无敌：摆到眼前的日军会开枪。兵力上限按要摆的人数放开，不然 Spawn 返回 null。
    T.player.SetDebugOptions({ invincible: true });
    const characterMaterials = new Set();
    for (const list of Object.values(T.actorFactory?.characterAssets?.byFaction || {})) {
      for (const asset of list) asset.gltf?.scene?.traverse((object) => {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) if (material?.name) characterMaterials.add(material.name);
      });
    }
    const sweepBefore = Programs();
    const spawned = [];
    const weapons = { nra: ["HanYang", "ZhongZheng", "Zb26"], ija: ["Type38", "Type11"] };
    const plan = [];
    for (const side of ["nra", "ija"]) {
      for (let variant = 0; variant < 4; variant += 1) for (const weapon of weapons[side]) plan.push({ side, variant, weapon });
    }
    T.ai.maxAlive += plan.length;
    const yaw = T.player.yaw;
    const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    plan.forEach(({ side, variant, weapon }, column) => {
      const depth = 8 + (column % 4) * 2;
      const lateral = (column - (plan.length - 1) * 0.5) * 0.45;
      const x = T.player.position.x + forward.x * depth + right.x * lateral;
      const z = T.player.position.z + forward.z * depth + right.z * lateral;
      const soldier = T.ai.Spawn(side, x, z, { modelVariant: variant, weapon });
      if (!soldier) return;
      // Spawn 会把人吸到导航主区、再找一块站得下的地：城里那一片院墙密，
      // 半数人会被推到镜头外。这里要的只是「这个模型号被画过」，直接搬回镜头前。
      soldier.position.set(x, T.player.position.y, z);
      soldier.body?.Teleport(x, T.player.position.y, z);
      spawned.push(soldier);
    });
    T.StepFrames(4);
    const sweepModels = spawned.map((soldier) => `${soldier.actor?.modelId || "?"}:${soldier.weaponId}`);
    const sweepAttached = spawned.filter((soldier) => soldier.actor?.root?.parent).length;
    const attachedModels = [...new Set(spawned.filter((soldier) => soldier.actor?.root?.parent)
      .map((soldier) => soldier.actor?.modelId || "?"))].sort();
    const bornAfterSpawn = Born(sweepBefore);
    // 转一圈：把撒兵撒出去的那些模型号也都看一遍。城里的房子/陈设第一次进画面也会现编
    // （那是另一笔账，见 docs §16），所以这一条只盯人物材质，其余只记录。
    for (let step = 0; step < 8; step += 1) {
      T.player.yaw = yaw + step * Math.PI / 4;
      T.StepFrames(1);
    }
    T.player.yaw = yaw;
    const bornAfterSweep = Born(sweepBefore).filter((name) => !bornAfterSpawn.includes(name));
    for (const soldier of spawned) T.ai.Remove(soldier);
    T.ai.maxAlive -= plan.length;
    T.player.SetDebugOptions({ invincible: false });

    return {
      rounds, deathCardSeconds: T.state.deathTimer,
      warm: T.state.actorShaderWarm || null,
      sweep: { planned: plan.length, spawned: spawned.length, attached: sweepAttached, models: [...new Set(sweepModels)].sort(),
        attachedModels, bornAfterSpawn,
        bornCharacter: bornAfterSweep.filter((name) => characterMaterials.has(name)),
        bornOther: bornAfterSweep.filter((name) => !characterMaterials.has(name)),
        characterMaterials: characterMaterials.size, programs: T.renderer.info.programs.length },
    };
  }, DEATHS);

  const warm = result.warm;
  console.log(warm
    ? `进关预热：kinds=${warm.kinds.join("/")} 代理 ${warm.proxies} 人 · 代表件 ${warm.picks} · ${warm.ms} ms`
      + ` · programs ${warm.programsBefore}→${warm.programs}`
      + ` · 分段 ${Object.entries(warm.stages || {}).map(([name, ms]) => `${name}=${ms}`).join(" ")}`
    : "进关预热：state.actorShaderWarm 缺失（WarmActorShaders 没跑）");
  Report(!!warm, "进关跑过人物材质预热", warm ? `${warm.ms} ms` : "缺失");

  for (const round of result.rounds) {
    const frame = round.respawnFrame;
    const changed = round.before.weapon !== round.after.weapon;
    const ok = !!frame && frame.programsPost === frame.programsPre && frame.cpuMs < MAX_FRAME_MS;
    const buckets = frame ? Object.entries(frame.cpu).sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([name, ms]) => `${name}=${ms.toFixed(1)}`).join(" ") : "-";
    Report(ok, `第 ${round.round + 1} 次换人 ${round.before.weapon}→${round.after.weapon}${changed ? "（换枪）" : "（同枪）"}`,
      `卡片 ${round.frames} 帧 · 落地帧 cpu=${frame ? frame.cpuMs.toFixed(1) : "?"}ms [${buckets}]`
      + ` · programs ${frame ? `${frame.programsPre}→${frame.programsPost}` : "?"}`
      + ` · 卡片期间最慢帧 ${round.cardFramesMaxMs.toFixed(1)}ms（programs ${round.programsAtDeath}→${round.programsDuringCard}）`
      + ` · 落地后 ${round.settle.map((s) => `${s.cpuMs.toFixed(0)}${s.born ? `+${s.born}` : ""}`).join("/")}ms`);
    if (round.born.length) console.log(`     这一轮新建的 program：${round.born.join(", ")}`);
    if (!round.pending) Report(false, "阵亡后进入换人流程", "pendingRespawn=false");
    if (!round.alive) Report(false, "换人后玩家活过来", `票池 ${round.pool}`);
  }
  if (result.rounds.length < DEATHS) Report(false, "换人轮数", `只跑了 ${result.rounds.length}/${DEATHS} 轮`);

  const sweep = result.sweep;
  // 两个阵营四个模型号都要真的挂进场景（被画过）；个别人被院墙挡在视锥外可以容忍，模型号不能缺。
  const attachedModels = new Set(sweep.attachedModels);
  const modelsWanted = ["LugouNra01", "LugouNra02", "LugouNra03", "LugouNra04", "LugouIja01", "LugouIja02", "LugouIja03", "LugouIja04"];
  const missingModels = modelsWanted.filter((id) => !attachedModels.has(id));
  Report(sweep.spawned === sweep.planned && !missingModels.length,
    "全模型号摆到镜头前",
    `撒 ${sweep.spawned}/${sweep.planned} · 挂进场景 ${sweep.attached}${missingModels.length ? ` · 没画到 ${missingModels.join("/")}` : ""}`
    + ` · ${sweep.models.join(", ")}`);
  Report(sweep.bornAfterSpawn.length === 0, "摆上来的模型号一个 program 都不新建",
    sweep.bornAfterSpawn.length ? `新建：${sweep.bornAfterSpawn.join(", ")}` : `programs=${sweep.programs}`);
  Report(sweep.bornCharacter.length === 0, "镜头转一圈不新建人物 program",
    sweep.bornCharacter.length ? `新建：${sweep.bornCharacter.join(", ")}` : `programs=${sweep.programs}（人物材质 ${sweep.characterMaterials} 种）`);
  if (sweep.bornOther.length) console.log(`     转一圈另有首次出画的非人物材质（城里陈设，另一笔账）：${sweep.bornOther.join(", ")}`);

  if (errors.length) {
    failed = true;
    for (const error of errors) console.error(error);
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failed) process.exitCode = 1;
