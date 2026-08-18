// 《血战台儿庄》通关冒烟：真浏览器里**真的去玩**，断言玩法与剧本没被改坏。
//
// 为什么必须有这一层：开机冒烟（Script_BootTest.mjs）只证明"画得出来"。
// 而这个项目最容易坏、坏了最看不出来的恰恰是玩法与剧本：
//   · Data_Script.mjs 那 20 KB 台词曾经整本没被 import，而画面一切正常；
//   · 叙事链只要有一条卡住（等一个永远不会来的事件），后面整本剧本被静默吞掉；
//   · 弹药账、投弹、白刃这些动词，数据里定义好了但一行没接，读代码看不出来。
// 所以这里的断言一律**从运行时状态取证**，不许读源码推断。
//
// 用法：node Taierzhuang1938/Script_PlayTest.mjs
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
page.on("pageerror", (e) => errors.push(`PAGEERROR ${String(e).slice(0, 240)}`));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const url = m.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  errors.push(`CONSOLE ${m.text().slice(0, 240)}`);
});

const results = [];
// 这一趟要跑十几分钟（六个阶段按出厂时长推 + 两次三百秒长跑）。
// 不打段落戳的话，卡住时只能看见"最后一条 ok 之后什么都没有"，定位不了。
const startedAt = Date.now();
function Stage(label) {
  console.log(`--- ${label}  (+${((Date.now() - startedAt) / 1000).toFixed(0)} s)`);
}
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}

async function Boot(phase = 0, scale = "small") {
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=${phase}&quality=medium&scale=${scale}`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang !== undefined, { timeout: 180000 });
  await page.evaluate(() => window.Taierzhuang.StepFrames(30));
}

// ===========================================================================
// 1) 调试口齐不齐（后面所有断言都靠它）
// ===========================================================================
Stage("1 调试口");
await Boot(0);
const api = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const d = T.Debug || {};
  return {
    hasStory: !!T.story, hasCombat: !!T.combat, hasDebug: !!T.Debug,
    fns: ["Reload", "DoMelee", "Throw", "Fire", "Ammo", "Spoken", "StoryFired", "Outcome"]
      .filter((k) => typeof d[k] === "function"),
  };
});
Check("调试口齐全", api.hasStory && api.hasCombat && api.fns.length === 8,
  `story=${api.hasStory} combat=${api.hasCombat} fns=${api.fns.length}/8`);

// ===========================================================================
// 2) 能走
// ===========================================================================
Stage("2 走动");
const moved = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const p0 = T.player.position.clone();
  // 直接推玩家控制器，不去合成键盘事件：出图模式下没有指针锁，
  // 键盘路径本来就走不通，而我们要测的是移动本身。
  for (let i = 0; i < 90; i += 1) {
    T.player.Update(1 / 60, {
      forward: 1, strafe: 0, sprint: false, ads: false, lean: 0,
      lookX: 0, lookY: 0, crouchPressed: false, pronePressed: false,
      breathHold: false, sensitivity: 1,
    }, null);
  }
  return { dist: T.player.position.distanceTo(p0) };
});
Check("玩家能走动", moved.dist > 1.5, `1.5 秒走了 ${moved.dist.toFixed(2)} m`);

// ===========================================================================
// 3) 开枪吃弹药 / 能装填 / 空仓打不出去
// ===========================================================================
Stage("3 弹药");
const gun = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  // 第 2 批之后开局就是热的（导航网格一接上，两军三十秒内就绞在一起），
  // 玩家在这一段里被打死是常态，而 Reload / Throw / DoMelee 对死人一律 return false ——
  // 量到的"装不上弹"是测试自己没站稳，不是装填坏了。所以第 3—5 段先冻场：
  // 把日军挪到三百米外，再等到人真的活过来（只写 health = 100 是复活不了的）。
  for (const s2 of T.ai.soldiers) {
    if (s2.side === "ija") s2.position.set(s2.position.x + 300, s2.position.y, s2.position.z + 300);
  }
  for (let k = 0; k < 8 && !T.player.Alive; k += 1) T.StepFrames(200);
  T.player.health = 100;
  const before = D.Ammo();
  for (let i = 0; i < 8; i += 1) { D.Fire(); T.StepFrames(6); }
  const afterFire = D.Ammo();
  // 打空之后再开火不许再掉（不许出现负数弹药）
  for (let i = 0; i < 10; i += 1) { D.Fire(); T.StepFrames(4); }
  const emptied = D.Ammo();
  // 等抢壳/拉栓动作播完再压弹：viewmodel.IsBusy() 期间 Reload 会被挡下来。
  // 这是对的行为（手都离开握把了还能压桥夹才是穿帮），测试得自己等。
  T.StepFrames(150);
  for (let k = 0; k < 8 && !T.player.Alive; k += 1) T.StepFrames(200);
  T.player.health = 100;
  // 重生会把弹仓填满、桥夹补齐 —— 那样 Reload 会因为"弹仓已满"直接 return false，
  // 量到的就不是装填了。所以读数一律紧贴 Reload 那一刻取。
  T.state.ammo = 0;
  const clipsBefore = T.state.clips;
  const reloaded = D.Reload();
  T.StepFrames(30);
  const afterReload = D.Ammo();
  return { before, afterFire, emptied, reloaded, afterReload, clipsBefore };
});
Check("开枪消耗弹药", gun.afterFire.ammo < gun.before.ammo,
  `${gun.before.ammo} -> ${gun.afterFire.ammo}`);
Check("弹药不会变负", gun.emptied.ammo >= 0, `空仓后 ammo=${gun.emptied.ammo}`);
Check("能装填", gun.reloaded && gun.afterReload.ammo > 0
  && gun.afterReload.clips === gun.clipsBefore - 1,
  `ammo 0->${gun.afterReload.ammo}, 桥夹 ${gun.clipsBefore}->${gun.afterReload.clips}`);

// ===========================================================================
// 4) 投弹：真的飞出去、真的炸、真的减库存
// ===========================================================================
Stage("4 投弹");
const nade = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  // 同上：ReleaseCook 对死人直接吞掉，先把人等活过来
  for (let k = 0; k < 8 && !T.player.Alive; k += 1) T.StepFrames(200);
  T.player.health = 100;
  const before = D.Ammo().grenades;
  D.Throw("Grenade", 0.9);
  const inFlight = T.combat.projectiles.length;
  const after = D.Ammo().grenades;
  // 引信 4.2 s，推 6 秒确保炸掉
  T.StepFrames(380);
  return { before, after, inFlight, left: T.combat.projectiles.length };
});
Check("投弹飞出去", nade.inFlight >= 1, `在飞 ${nade.inFlight} 枚`);
Check("投弹减库存", nade.after === nade.before - 1, `${nade.before} -> ${nade.after}`);
Check("手榴弹会炸（引信到了就消失）", nade.left === 0, `残留 ${nade.left} 枚`);

// ===========================================================================
// 5) 白刃：够得着就砍得到
// ===========================================================================
Stage("5 白刃");
const melee = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  // 把一个日军挪到玩家正前方 1.2 m
  // 等上一段测试的装填动画播完 —— IsBusy() 期间 DoMelee 会被挡下来（这是对的行为）
  T.StepFrames(180);
  // 第 1 批之后战场是真在打的，玩家会在前面几段里被打死。
  // DoMelee 对死人直接 return false，那样量到的"砍不到人"是测试自己没站稳，
  // 不是白刃坏了。先把人等活过来。
  for (let k = 0; k < 8 && !T.player.Alive; k += 1) T.StepFrames(200);
  T.player.health = 100;
  const enemy = T.ai.soldiers.find((s) => s.alive && s.side === "ija");
  if (!enemy) return { noEnemy: true };
  const busy = T.viewmodel.IsBusy();
  const fwd = { x: -Math.sin(T.player.yaw), z: -Math.cos(T.player.yaw) };
  enemy.position.set(T.player.position.x + fwd.x * 1.2, T.player.position.y,
    T.player.position.z + fwd.z * 1.2);
  const hpBefore = enemy.health;
  D.DoMelee();
  return { hpBefore, hpAfter: enemy.health, alive: enemy.alive, busy, playerAlive: T.player.Alive };
});
Check("白刃能砍到人", !melee.noEnemy && melee.hpAfter < melee.hpBefore,
  melee.noEnemy ? "场上没有日军"
    : `${melee.hpBefore} -> ${melee.hpAfter}（挥刀时 busy=${melee.busy} 玩家活=${melee.playerAlive}）`);

// ===========================================================================
// 6) 占领点：进度条会动、能翻旗
// ===========================================================================
Stage("6 占领");
const cap = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const o = T.battlefield.objectives[0];
  o.owner = "ija"; o.progress = 0;
  // 把玩家挪进点里，把**全部**日军挪走（双方都在区内应该冻结）。
  // 只挪点里那几个是不够的：第 1 批之后日军会自己往前线走，四十秒里陆续走进来，
  // 于是这个点全程 contested、进度冻住 —— 量到的是"夺不回来"，
  // 而要验的是占领结算本身。这里沿用第 7 段那套冻场做法。
  T.player.position.set(o.x, T.battlefield.GroundHeight(o.x, o.z), o.z);
  for (const s of T.ai.soldiers) {
    if (s.side === "ija") s.position.set(s.position.x + 400, s.position.y, s.position.z + 400);
  }
  const p0 = o.progress;
  T.StepFrames(240);
  const p1 = o.progress;
  T.StepFrames(2400, 1 / 60, false);
  return { p0, p1, p2: o.progress, owner: o.owner, name: o.name };
});
Check("占领进度会涨", cap.p1 > cap.p0, `${cap.p0.toFixed(3)} -> ${cap.p1.toFixed(3)}`);
Check("能把点夺回来", cap.owner === "nra", `${cap.name} 现属 ${cap.owner}，进度 ${cap.p2.toFixed(2)}`);

// ===========================================================================
// 7) 阵亡换人：卡片 + 换一个有名有姓的人 + 兵员池 -1
// ===========================================================================
Stage("7 阵亡换人");
const death = await page.evaluate(async () => {
  const T = window.Taierzhuang;
  // 把日军挪到两百米外：这一段测的是「阵亡 -> 换人」这条链路本身，
  // 不是能不能在交火中央活四秒。上一次没冻场，玩家重生后 4 秒内又被打死一次，
  // 兵员池掉了 2 而不是 1，断言就误报了。
  for (const s2 of T.ai.soldiers) {
    if (s2.side === "ija") s2.position.set(s2.position.x + 300, s2.position.y, s2.position.z + 300);
  }
  // 人得先活着才谈得上"这条命扣一张票"：Kill() 对死人直接 return，
  // OnPlayerDown 也就不会触发，读数会是"一票没动"，看起来像票池坏了。
  for (let k = 0; k < 8 && !T.player.Alive; k += 1) T.StepFrames(200);
  T.player.health = 100;
  const idBefore = T.state.identity.name;
  const poolBefore = T.state.nraPool;
  // 十秒一次的占点消耗会在这三帧里撞进来的话读数就不干净，先把钟拨回去
  T.state.captureDrainAccum = 0;
  T.player.Kill();
  T.StepFrames(3);          // 让 Frame 自己发现"上一帧还活着，这一帧死了"
  // 紧贴死亡那一刻读票池。第 1 批之后 AI 阵亡也扣票（那是对的：票池 = 兵力池），
  // 所以再往后推 260 帧去读，量到的是"这段时间全场死了几个人"，不是"玩家这条命"。
  const poolAtDeath = T.state.nraPool;
  const cardOn = document.querySelector(".hudDeathCard").classList.contains("on");
  const fallen = T.state.fallen.length;
  // 阵亡卡片 2.6 s + 重生
  T.StepFrames(260);
  return {
    idBefore, idAfter: T.state.identity.name,
    poolBefore, poolAfter: poolAtDeath,
    cardOn, fallen, alive: T.player.Alive,
    origin: T.state.identity.origin,
  };
});
Check("阵亡弹卡片", death.cardOn, `阵亡名单 ${death.fallen} 人`);
Check("玩家这条命扣一张票", death.poolAfter === death.poolBefore - 1,
  `${death.poolBefore} -> ${death.poolAfter}`);
Check("换成另一个有名有姓有籍贯的人", death.alive && !!death.origin,
  `${death.idBefore} -> ${death.idAfter}（${death.origin}）`);

// ===========================================================================
// 8) 剧本真的在播 —— 这一条是整份测试存在的主要理由
// ===========================================================================
Stage("8 剧本长跑（六阶段按出厂时长，约六分钟）");
const storySeen = [];
// 分块推帧，一块 1800 帧（三十秒）。
// **不许一次 evaluate 里同步跑一万三千帧**：那是把渲染进程主线程一口气占住
// 五十到九十秒，浏览器会当它没响应，实跑里这一段十次有六七次就卡死在这儿
// （每一次都恰好卡在第 8 段，而第 10/11/12 段本来就是分块的，从来没卡过）。
// 分块之后每次 evaluate 只占住三十帧秒，顺带还能打进度。
for (let phase = 0; phase < 6; phase += 1) {
  const t0 = Date.now();
  const total = await page.evaluate((ph) => {
    const T = window.Taierzhuang;
    // 只推到本阶段时长的九成：推满会触发 Frame 里的自动进入下一阶段，
    // 那时 story 的队列已经换成下一段的了，Remaining 量到的是新队列。
    const minutes = T.state.phaseMinutes || [4, 5, 5, 4, 5, 6];
    T.JumpToPhase(ph);
    return Math.round(minutes[ph] * 60 * 60 * 0.9);
  }, phase);
  for (let done = 0; done < total; done += 1800) {
    // 长跑不渲染：断言一帧画面都不需要，而软件光栅连推几万帧会把渲染进程卡死。
    await page.evaluate((n) => window.Taierzhuang.StepFrames(n, 1 / 60, false), Math.min(1800, total - done));
  }
  const row = await page.evaluate((ph) => {
    const T = window.Taierzhuang;
    return { phase: ph, fired: T.story.fired.length, remaining: T.story.Remaining };
  }, phase);
  storySeen.push(row);
  console.log(`    阶段 ${phase}：剧本已播 ${row.fired} 条，本段剩 ${row.remaining} 条`
    + `（${((Date.now() - t0) / 1000).toFixed(0)} s）`);
}
const storyRun = await page.evaluate((seen) => {
  const T = window.Taierzhuang, D = T.Debug;
  // 六个阶段各推两分钟，把每一段剧本都跑一遍
  // 按**各阶段真实配置的时长**推，不要图快用一个统一的短时长 ——
  // 上一版每阶段只推 180 s，而正片 P3 是 5 分钟，于是断言比出厂配置还严，
  // 报出来的"剧本卡住"其实是测试自己没给够时间。这里要验的是
  //「出厂配置下每一句台词都听得到」，那就得按出厂时长跑。
  const spoken = D.Spoken();
  const fired = D.StoryFired();
  return {
    seen,
    totalFired: fired.length,
    byTimeout: fired.filter((f) => f.byTimeout).length,
    hasLiu: spoken.some((t) => t.includes("他倒了我上")),
    hasSun: spoken.some((t) => t.includes("整个集团军打完为止")),
    hasPoem: spoken.some((t) => t.includes("榴花原是血染成")),
    hasFantang: spoken.some((t) => t.includes("王范堂")),
    hasLuyi: spoken.some((t) => t.includes("新华日报")),
    hasWanyoufu: spoken.some((t) => t.includes("半缸水")),
    noteShown: document.querySelectorAll(".hudNote").length > 0,
    sample: spoken.slice(-6),
  };
}, storySeen);
Check("剧本 beats 真的派发出来了", storyRun.totalFired >= 60,
  `播了 ${storyRun.totalFired} 条，其中 ${storyRun.byTimeout} 条靠超时兜底`);
Check("刘振海那句「他倒了我上」出现过", storyRun.hasLiu);
Check("孙连仲「整个集团军打完为止」出现过", storyRun.hasSun);
Check("黄樵松《榴花》出现过", storyRun.hasPoem);
Check("王范堂自报番号出现过", storyRun.hasFantang);
Check("记者陆诒出现过", storyRun.hasLuyi);
Check("万有福「半缸水」出现过", storyRun.hasWanyoufu);
// 六段剧本每一段都该基本播完，剩太多说明链子卡住了
const stuck = storyRun.seen.filter((x) => x.remaining > 6);
Check("没有哪一段剧本被卡住", stuck.length === 0,
  stuck.length ? `阶段 ${stuck.map((x) => `${x.phase}(剩${x.remaining})`).join(" ")}` : "六段都跑完了");

// ===========================================================================
// 9) 胜负判定可达
// ===========================================================================
Stage("9 胜负");
const outcome = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  T.state.outcome = null;
  T.state.nraPool = 0;
  T.player.Kill();
  T.StepFrames(6);
  const defeat = D.Outcome();
  T.state.outcome = null;
  D.EndBattle("victory");
  const victory = D.Outcome();
  const epilogueOn = document.querySelector(".hudEpilogue").classList.contains("on");
  return { defeat, victory, epilogueOn };
});
Check("兵员池归零会判败", outcome.defeat === "defeat", `outcome=${outcome.defeat}`);
Check("胜局会放尾声", outcome.victory === "victory" && outcome.epilogueOn);

// ===========================================================================
// 10) 长跑不崩、AI 数量稳定
// ===========================================================================
Stage("10 长跑");
await Boot(4, "medium");
const soak = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const samples = [];
  for (let i = 0; i < 8; i += 1) {
    T.StepFrames(600, 1 / 60, false);         // 10 s
    samples.push(T.ai.aliveCount);
  }
  return {
    samples,
    geometries: T.renderer.info.memory.geometries,
    programs: T.renderer.info.programs.length,
    projectiles: T.combat.projectiles.length,
  };
});
const minAlive = Math.min(...soak.samples);
const maxAlive = Math.max(...soak.samples);
Check("两分钟长跑 AI 数量稳定", minAlive >= 8 && maxAlive <= 120,
  `活人 ${minAlive}—${maxAlive}，几何 ${soak.geometries}，程序 ${soak.programs}`);
Check("投掷物不泄漏", soak.projectiles < 40, `残留 ${soak.projectiles}`);
Check("长跑无报错", errors.length === 0, errors.slice(0, 3).join(" | "));

// ===========================================================================
// 11) ER2 对齐第 1 批：仗真的在打 / 票池是兵力池 / 出生点看得出去
//
// 这一组每一条都从**运行时状态**取证。第 1 批修的全是"读代码看不出来"的东西：
// 全场七十个人站着不动、票池方向反了、出生点在封闭院落里 —— 页面照跑、画面照出，
// 只有把开火计数、状态分布、占领点归属、两个池子的增减读出来才看得见。
// ===========================================================================

// 11.1 出生点：不但站得下，还得看得出去
Stage("11 第 1 批：出生点 / 票池 / 交战");
await Boot(0, "small");
const spawnSmall = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  return {
    // **口径要跟代码一致**：FindOpenSpot 自己测的是 8 方位里通 3 条（37.5%），
    // 而上一版断言写的是 72 方位里通 3 条（4.2%）—— 宽了近十倍，
    // 读起来像在验一条硬条件，实际上什么都没验。独立复核指出的，这里对齐。
    open: D.OpenDirections(T.player.position.x, T.player.position.z, 8, 20),
    open72: D.OpenDirections(T.player.position.x, T.player.position.z, 72, 20),
    nraPool: T.state.nraPool,
  };
});
Check("玩家出生点向 8 个方位射 20 m 至少三条通（与 FindOpenSpot 同口径）",
  spawnSmall.open >= 3, `${spawnSmall.open}/8 条通（72 方位口径 ${spawnSmall.open72}/72）`);

// 11.2 票池随战场规模缩放
await Boot(0, "large");
const poolLarge = await page.evaluate(() => window.Taierzhuang.state.nraPool);
Check("兵员池随规模缩放（small ≠ large）", spawnSmall.nraPool !== poolLarge,
  `small=${spawnSmall.nraPool} large=${poolLarge}`);

// 11.3 六十秒开火计数 / 状态分布 / 占领点易主 —— 玩家全程不动手
await Boot(2, "medium");
const battle = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  const fire0 = D.FireCount();
  const owners0 = T.battlefield.objectives.map((o) => o.owner).join(",");
  const states = {};
  let ownerChanged = false;
  // 每秒采一次。只在十秒边界采会漏掉整段交火。
  // 开火计数只数**头六十秒**；占领点易主给到一百五十秒 —— 守军会往吃紧的点增援，
  // 一个点真正翻过去要打上一两分钟，这正是我们想要的（一分钟就翻旗说明没人守）。
  let fired60 = 0;
  for (let i = 0; i < 150; i += 1) {
    T.StepFrames(60, 1 / 60, false);
    if (i === 59) fired60 = D.FireCount() - fire0;
    const snapshot = D.AiStates();
    for (const key of Object.keys(snapshot)) states[key] = (states[key] || 0) + snapshot[key];
    if (T.battlefield.objectives.map((o) => o.owner).join(",") !== owners0) ownerChanged = true;
  }
  return {
    fired: fired60,
    states,
    ownerChanged,
    owners0,
    owners1: T.battlefield.objectives.map((o) => o.owner).join(","),
    deaths: D.Deaths(),
  };
});
Check("六十秒内全场开火计数 > 200", battle.fired > 200, `开了 ${battle.fired} 枪`);
Check("AI 状态分布不再恒为 advance", Object.keys(battle.states).length >= 3,
  JSON.stringify(battle.states));
Check("交火与装填两种状态都出现过", !!battle.states.fire && !!battle.states.reload,
  `fire=${battle.states.fire || 0} reload=${battle.states.reload || 0}`);
Check("占领点自己易了主（玩家没动手）", battle.ownerChanged,
  `${battle.owners0} -> ${battle.owners1}`);
Check("两侧都在真的死人", battle.deaths.nra > 0 && battle.deaths.ija > 0,
  `nra ${battle.deaths.nra} / ija ${battle.deaths.ija}`);

// 11.4 票池方向：日军炮弹炸死中国兵，扣的必须是**中方**的票
// 旧 bug 的反向断言。Blast 是同步结算，所以前后两次读数中间不推帧，
// 不会有别的死亡混进来。
const blastPool = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const victim = T.ai.soldiers.find((s) => s.alive && s.side === "nra");
  if (!victim) return { noVictim: true };
  // 挪到空地上单独炸，免得连坐炸到日军
  victim.position.set(T.battlefield.bounds.maxX - 30, victim.position.y, T.battlefield.bounds.maxZ - 30);
  victim.position.y = T.battlefield.GroundHeight(victim.position.x, victim.position.z);
  const at = victim.position.clone(); at.y += 0.4;
  const nra0 = T.state.nraPool, ija0 = T.state.ijaPool;
  T.combat.Blast(at, 6, 400, "shell");
  return { nra0, ija0, nra1: T.state.nraPool, ija1: T.state.ijaPool, dead: !victim.alive };
});
Check("日军炮弹炸死中国兵：扣中方票、日方票不动",
  !blastPool.noVictim && blastPool.dead
  && blastPool.nra1 === blastPool.nra0 - 1 && blastPool.ija1 === blastPool.ija0,
  `nra ${blastPool.nra0}->${blastPool.nra1}, ija ${blastPool.ija0}->${blastPool.ija1}`);

// 11.5 玩家亲手打死一个日军：日方票恰好 -1（不是 -2，防行内扣减与事件双扣）
const shotPool = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  T.StepFrames(200);                       // 等上一段的动作播完，IsBusy 会挡下开火
  for (let k = 0; k < 8 && !T.player.Alive; k += 1) T.StepFrames(200);
  T.player.health = 100;
  const target = T.ai.soldiers.find((s) => s.alive && s.side === "ija");
  if (!target) return { noTarget: true };
  // 靶子摆在**真正的瞄准射线**上，别拿 player.yaw 现推一条水平前向：
  // TryFire 的命中判定是「到射线的垂距 < 0.45 m」，而胸口在 position.y + 0.95。
  // 拿水平前向摆在 3 m 处，胸口比眼位低 0.65 m，垂距 0.65 > 0.45 —— 八枪全从头顶过去。
  const V = T.player.position.constructor;
  const dir = T.player.AimDirection(new V());
  const eye = T.player.EyePosition.clone();
  const spot = eye.clone().addScaledVector(dir, 4);
  target.position.set(spot.x, spot.y - 0.95, spot.z);
  target.health = 1;                        // 一枪必死，把"打了几枪"这个变量消掉
  const ija0 = T.state.ijaPool;
  // Debug.Fire 是同步的：中间不推帧，就不会有别的日军死掉混进读数
  let shots = 0;
  while (target.alive && shots < 8) { D.Fire(); shots += 1; }
  return { ija0, ija1: T.state.ijaPool, dead: !target.alive, shots };
});
Check("玩家亲手击杀：日方票恰好 -1（没有双扣）",
  !shotPool.noTarget && shotPool.dead && shotPool.ija1 === shotPool.ija0 - 1,
  `ijaPool ${shotPool.ija0}->${shotPool.ija1}，打了 ${shotPool.shots} 枪`);

// ===========================================================================
// 12) ER2 对齐第 2 批：键位表 / 携行 / 枪的手感三件套 / flank·charge / 两脚架 / 过热
//
// 同样一律从运行时取证。这一批改的大半是"读代码看不出来"的东西：
// 键位是散在装配层还是走 KEYMAP、LOADOUTS 到底有没有被读、子弹是不是还在走直线、
// 后坐有没有真的顶视角 —— 页面照跑、画面照出，只有把运行时状态读出来才看得见。
// ===========================================================================

// 12.1 键位表真的接上了：1/2/3/4 与滚轮走的是合成键盘事件，不是直接调函数
Stage("12 第 2 批：键位 / 携行 / 手感");
await Boot(3, "small");
const slots = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  // 冻场：日军挪到四百米外，补兵的钟拨到负一百万秒（SeedSoldiers 每三秒补一批
  // 新的到玩家跟前，只挪走现有的没用）。不冻场的话玩家会在这一组里反复阵亡，
  // 而 SwitchSlot / TryFire / Reload 对死人一律 return false ——
  // 量到的"切不了枪""打不出去"就全是测试自己没站稳。
  for (const s2 of T.ai.soldiers) {
    if (s2.side === "ija") s2.position.set(s2.position.x + 400, s2.position.y, s2.position.z + 400);
  }
  T.state.spawnAccumulator = -1e6;
  for (let k = 0; k < 8 && !T.player.Alive; k += 1) T.StepFrames(200);
  T.player.health = 100;
  const seen = [D.Slots()];
  for (const code of ["Digit2", "Digit3", "Digit4", "Digit1"]) {
    D.Key(code); T.StepFrames(40); seen.push(D.Slots());
  }
  D.Wheel(-120); T.StepFrames(40);
  return { seen, wheeled: D.Slots() };
});
const slotIds = slots.seen.map((s2) => s2.active);
Check("按 1/2/3/4 能切到四个不同槽位，viewmodel 跟着换枪",
  new Set(slotIds).size === 4 && slots.seen.every((s2) => s2.viewmodel === s2.weapon),
  `槽位 ${slotIds.join("->")}，viewmodel ${slots.seen.map((s2) => s2.viewmodel).join("->")}`);
Check("滚轮也能循环切槽",
  slots.wheeled.active !== slots.seen[slots.seen.length - 1].active,
  `${slots.seen[slots.seen.length - 1].active} -> ${slots.wheeled.active}`);

// 12.2 LOADOUTS 真的被读了：phase=3（P4 夜袭）是 L3_WhiteTowel
Check("P4 夜袭的携行是 L3_WhiteTowel：一支长枪、一支短枪、肩背大刀",
  slots.seen[0].loadout === "L3_WhiteTowel"
  && slots.seen[0].slots.secondary === "Mauser96"
  && slots.seen[0].slots.melee === "Dadao",
  `${slots.seen[0].loadout} primary=${slots.seen[0].slots.primary} `
  + `secondary=${slots.seen[0].slots.secondary} melee=${slots.seen[0].slots.melee}`);

// 12.3 / 12.4 弹道下坠与枪口视差。
// 站到城上空往斜下打，让子弹跑满三百米不撞墙 —— 城里随便哪一条射线四十米就到头了。
Stage("12.3 弹道");
const ballistics = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  T.state.spawnAccumulator = -1e6;
  for (const s2 of T.ai.soldiers) {
    if (s2.side === "ija") s2.position.set(s2.position.x + 400, s2.position.y, s2.position.z + 400);
  }
  for (let k = 0; k < 8 && !T.player.Alive; k += 1) T.StepFrames(200);
  T.player.health = 100;
  D.Key("Digit1"); T.StepFrames(60);
  // 站到城上空平射：城里找不出一条三百米不撞墙的射线（随便哪一条四十米就到头）。
  T.player.position.set(0, 90, 40);
  T.player.yaw = 0; T.player.pitch = 0;
  T.player.aimYaw = 0; T.player.aimPitch = 0;
  T.player.ads = 1;                        // 收散布，免得随机偏角把落差淹掉
  T.player.SyncCamera(1 / 60);             // 相机不同步的话枪口还留在原地
  // 把有效射程临时压到 300 m，让弹道正好在三百米处收住 —— 不然它会一直飞到
  // 汉阳造的 400 m 射程尽头，量到的是四百米的落差。viewmodel.weapon 跟
  // WEAPONS[currentWeapon] 是同一个对象，改完立刻还回去。
  const w = T.viewmodel.weapon;
  const savedRange = w.effectiveRangeM;
  w.effectiveRangeM = 300;
  T.state.ammo = 5;
  D.Fire();
  w.effectiveRangeM = savedRange;
  const shot = D.LastShot();
  if (shot) { shot.slot = D.Slots().active; shot.weapon = D.Slots().weapon; }
  return shot || { none: true, slot: D.Slots().active, alive: T.player.Alive };
});
Check("平射三百米有可感知的下坠（0.4—0.9 m）",
  !ballistics.none && ballistics.horizDist > 280 && ballistics.horizDist < 320
  && ballistics.dropM > 0.4 && ballistics.dropM < 0.9,
  ballistics.none
    ? `没打出去（槽位 ${ballistics.slot}，人活着=${ballistics.alive}）`
    : `${ballistics.weapon} 水平 ${ballistics.horizDist.toFixed(1)} m，`
      + `落差 ${ballistics.dropM.toFixed(3)} m，落点 ${ballistics.hitKind}`);
Check("射线起点是枪口不是眼睛（视差生效）",
  !ballistics.none && ballistics.muzzleOffsetM > 0.02 && ballistics.muzzleOffsetM < 0.6,
  ballistics.none ? "没打出去" : `枪口离瞄准轴 ${ballistics.muzzleOffsetM.toFixed(3)} m`);

// 12.5 后坐：连开三枪 pitch 单调上升，回落只回七成
const recoil = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  T.player.position.set(0, 90, 40);
  T.player.pitch = 0; T.player.ads = 0;
  // 上一段（弹道）已经打过一发，回落账上还欠着那一发的七成。
  // 不清零的话这里量到的"回落比"是两段加在一起的，会读成 11%。
  T.player.recoilPending.pitch = 0;
  T.player.recoilPending.yaw = 0;
  const pitches = [T.player.pitch];
  for (let i = 0; i < 3; i += 1) {
    // Debug.Fire 走的是 TryFire(dt=1)，而栓动枪的射击间隔是 1.25—1.40 s ——
    // "调一次就等于打一发"是不成立的，得打到枪口真的动了为止。
    // 中间**不推帧**：一推 player.Update 就开始回落，"单调上升"这条就测不出来了。
    const before = T.player.pitch;
    for (let k = 0; k < 6 && T.player.pitch === before; k += 1) { T.state.ammo = 5; D.Fire(); }
    pitches.push(T.player.pitch);
  }
  const peak = T.player.pitch;
  const idle = { forward: 0, strafe: 0, sprint: false, ads: false, lean: 0,
    lookX: 0, lookY: 0, crouchPressed: false, pronePressed: false, breathHold: false, sensitivity: 1 };
  for (let i = 0; i < 90; i += 1) T.player.Update(1 / 60, idle, null);
  return { pitches, peak, after: T.player.pitch, residual: T.player.pitch / (peak || 1) };
});
Check("连开三枪枪口单调上抬",
  recoil.pitches.every((v, i) => i === 0 || v > recoil.pitches[i - 1]) && recoil.peak > 0.02,
  recoil.pitches.map((v) => v.toFixed(4)).join(" -> "));
Check("一秒半后回落到峰值的 30%±10%（只回七成）",
  recoil.residual > 0.20 && recoil.residual < 0.40,
  `峰值 ${recoil.peak.toFixed(4)} -> ${recoil.after.toFixed(4)}（${(recoil.residual * 100).toFixed(0)}%）`);

// 12.6 铁瞄偏心：照门不落在屏幕正中，且汉阳造（老套筒）比中正式明显
const sights = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  T.viewmodel.Equip("ZhongZheng");
  const zz = D.AdsOffset();
  T.viewmodel.Equip("HanYang");
  const hy = D.AdsOffset();
  return { zz, hy };
});
Check("铁瞄有偏心，且汉阳造比中正式明显",
  sights.zz.x > 0 && sights.hy.x > sights.zz.x,
  `中正式 ${(sights.zz.x * 1000).toFixed(2)} mm，汉阳造 ${(sights.hy.x * 1000).toFixed(2)} mm`);

// 12.7 屏息挪到 Shift（按开镜量分流），Space 腾空
const breath = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  T.player.Spawn(T.player.position.x, T.player.position.z, 0);
  T.player.stamina = 1;
  const Sample = () => { T.player.ads = 1.0; T.StepFrames(2); return T.player.breathHold; };
  D.Key("ShiftLeft", true);          // 按住，不是点按
  const withShift = Sample();
  D.Key("ShiftLeft", false);
  D.Key("Space", true);
  const withSpace = Sample();
  D.Key("Space", false);
  return { withShift, withSpace };
});
Check("开镜时按住 Shift 是屏息", breath.withShift === true, `breathHold=${breath.withShift}`);
Check("按 Space 不再触发屏息（腾给第 3 批的翻越）", breath.withSpace === false,
  `breathHold=${breath.withSpace}`);

// 12.8 / 12.9 flank 与 charge 从"只写了个字符串"变成真的会动
Stage("12.8 命令");
const orders = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const V = T.player.position.constructor;
  // 把日军挪走：这一段验的是命令本身，不是能不能在交火中活十秒
  for (const s2 of T.ai.soldiers) {
    if (s2.side === "ija") s2.position.set(s2.position.x + 400, s2.position.y, s2.position.z + 400);
  }
  const zone = T.battlefield.objectives[0];
  // 起点不能直接用占领点圆心：中正门那个圆心落在门楼里，人一步都挪不动，
  // 量到的"没冲出去"是站位问题不是命令问题。用导航网格吸到最近能走的地方。
  const spot = { x: zone.x, z: zone.z };
  T.nav.SnapToMain(zone.x, zone.z, spot);
  const gy = T.battlefield.GroundHeight(spot.x, spot.z);
  T.player.position.set(spot.x, gy, spot.z);
  const near = T.ai.soldiers.filter((s2) => s2.alive && s2.side === "nra").slice(0, 5);
  const Reset = () => {
    for (const s2 of near) {
      s2.holdZone = zone; s2.position.set(spot.x, gy, spot.z); s2.order = "hold"; s2.target = null;
    }
  };
  Reset();
  const aim = new V(spot.x + 60, gy, spot.z + 60);
  const g0 = near.map((s2) => `${s2.goal.x.toFixed(1)},${s2.goal.z.toFixed(1)}`);
  const nFlank = T.ai.IssueOrder("flank", T.player.position, aim);
  const g1 = near.map((s2) => `${s2.goal.x.toFixed(1)},${s2.goal.z.toFixed(1)}`);
  Reset();
  const nCharge = T.ai.IssueOrder("charge", T.player.position, aim);
  const state0 = near.map((s2) => s2.state);
  T.StepFrames(900);          // 15 s，命令有效期是 18 s
  return {
    nFlank, goalChanged: g0.join("|") !== g1.join("|"),
    bothSides: new Set(g1).size >= 2, g1,
    nCharge, state0, bayonet: near.map((s2) => s2.bayonetFixed),
    away: near.map((s2) => +Math.hypot(s2.position.x - spot.x, s2.position.z - spot.z).toFixed(1)),
    radius: zone.radius,
  };
});
Check("IssueOrder('flank') 让受令者的 goal 真的变了，而且分左右两路",
  orders.nFlank > 0 && orders.goalChanged && orders.bothSides,
  `受令 ${orders.nFlank} 人，绕行点 ${orders.g1.slice(0, 2).join(" / ")}`);
Check("IssueOrder('charge') 让守点单位也上刺刀、冲出守区",
  orders.nCharge > 0 && orders.state0.every((v) => v === "charge")
  && orders.bayonet.every(Boolean)
  && orders.away.some((v) => v > orders.radius),
  `状态 ${orders.state0.join(",")}；离点心 ${orders.away.join(" / ")} m（守区半径 ${orders.radius}）`);

// 12.10 两脚架：不架不许开镜
Stage("12.10 两脚架");
const bipod = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  T.state.spawnAccumulator = -1e6;
  for (let k = 0; k < 8 && !T.player.Alive; k += 1) T.StepFrames(200);
  T.player.health = 100;
  T.state.slots.secondary = "Zb26";
  D.Key("Digit1"); T.StepFrames(30);      // 先回长枪，免得已经在 secondary 上按 2 无效
  D.Key("Digit2"); T.StepFrames(60);
  const equipped = D.Slots();
  const zb = { bipod: true, adsTimeS: 0.40, spreadAdsDeg: 0.55, spreadHipDeg: 4.2 };
  const Drive = (n) => {
    for (let i = 0; i < n; i += 1) {
      T.player.Update(1 / 60, { forward: 0, strafe: 0, sprint: false, ads: true, lean: 0,
        lookX: 0, lookY: 0, crouchPressed: false, pronePressed: false, breathHold: false, sensitivity: 1 }, zb);
    }
  };
  T.player.stance = "prone";
  Drive(180);
  const adsNoBipod = T.player.ads;
  const spreadNoBipod = T.player.SpreadDeg(zb);
  D.Key("KeyT"); T.StepFrames(2);
  const deployed = T.player.bipod;
  Drive(240);
  // 散布要在**同一个开镜量**下比，不然量到的是"开镜 + 架枪"两件事叠在一起
  const spreadWithBipod = T.player.SpreadDeg(zb);
  T.player.bipod = false;
  const spreadSameAds = T.player.SpreadDeg(zb);
  T.player.bipod = deployed;
  return { weapon: equipped.weapon, adsNoBipod, deployed, adsWithBipod: T.player.ads,
    spreadNoBipod, spreadWithBipod, spreadSameAds };
});
Check("捷克式不架两脚架右键不进开镜，架起后能到 1.0",
  bipod.weapon === "Zb26" && bipod.adsNoBipod < 0.05 && bipod.deployed && bipod.adsWithBipod > 0.95,
  `未架 ads=${bipod.adsNoBipod.toFixed(2)}，架起 ads=${bipod.adsWithBipod.toFixed(2)}`);
Check("架起两脚架散布明显收窄（同一开镜量下对比）",
  bipod.spreadWithBipod < bipod.spreadSameAds * 0.5,
  `未架 ${bipod.spreadSameAds.toFixed(3)}° -> 架起 ${bipod.spreadWithBipod.toFixed(3)}°`
  + `（腰射未架时是 ${bipod.spreadNoBipod.toFixed(3)}°）`);

// 12.11 单发模式（仅捷克式）
const fireMode = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  const before = D.Slots();
  D.Key("Digit0"); T.StepFrames(2);
  return { weapon: before.weapon, before: before.fireMode, after: D.Slots().fireMode };
});
Check("按 0 能把捷克式切成单发",
  fireMode.weapon === "Zb26" && fireMode.before === "auto" && fireMode.after === "semi",
  `${fireMode.weapon}：${fireMode.before} -> ${fireMode.after}`);

// 12.12 过热：十一年式打满 overheatShots 强制冷却
const overheat = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const s2 = T.ai.soldiers.find((x) => x.alive && x.side === "ija");
  if (!s2) return { none: true };
  s2.weaponId = "Type11";
  s2.weapon = { magazine: 30, fireIntervalS: 0.12, reloadTimeS: 5.2,
    overheatShots: 200, coolDownS: 8.0, aiAccuracy: 0.5, aiAimTimeS: 0,
    effectiveRangeM: 600, damage: 66, kind: "lmg" };
  s2.target = { position: { x: s2.position.x + 30, y: s2.position.y, z: s2.position.z },
    isPlayer: false, ref: null };
  s2.heat = 0; s2.coolUntil = -99;     // 从干净的枪管开始数，"两百发"才是确定的
  const Drive = () => {
    const before = T.ai.fireCount;
    s2.ammo = 30; s2.fireTimer = 0; s2.aimTime = 9; s2.suppression = 0;
    T.ai.TryFire(s2, 0.05, T.player);
    return T.ai.fireCount - before;
  };
  let shots = 0, iterations = 0;
  while (iterations < 500 && s2.coolUntil <= T.ai.time) { shots += Drive(); iterations += 1; }
  const coolFor = s2.coolUntil - T.ai.time;
  let duringCool = 0;
  for (let i = 0; i < 300; i += 1) duringCool += Drive();
  return { shots, coolFor, duringCool };
});
Check("十一年式打满两百发强制冷却，冷却期间一发也打不出去",
  !overheat.none && overheat.shots === 200 && overheat.coolFor > 7.5 && overheat.duringCool === 0,
  `打了 ${overheat.shots} 发，冷却 ${overheat.coolFor?.toFixed(1)} s，冷却期间 ${overheat.duringCool} 发`);

// 12.13 自由瞄准做成难度滑条：默认 2.0°（不再是 5°），枪仍然在视野里先动
const freeAim = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  T.player.aimYaw = 0; T.player.yaw = 0; T.player.ads = 0;
  for (let i = 0; i < 10; i += 1) {
    T.player.Update(1 / 60, { forward: 0, strafe: 0, sprint: false, ads: false, lean: 0,
      lookX: 12, lookY: 0, crouchPressed: false, pronePressed: false, breathHold: false, sensitivity: 1 }, null);
  }
  return {
    deg: D.Difficulty().freeAimDeg,
    autoSurrender: D.Difficulty().autoSurrender,
    aimYaw: Math.abs(T.player.aimYaw), yaw: Math.abs(T.player.yaw),
  };
});
Check("自由瞄准默认 2.0°（不再是 5°），推鼠标时枪先动",
  freeAim.deg === 2.0 && freeAim.aimYaw > 1e-4,
  `freeAimDeg=${freeAim.deg}，aimYaw=${freeAim.aimYaw.toFixed(4)} rad / yaw=${freeAim.yaw.toFixed(4)} rad`);
Check("玩家永不自动投降：difficulty.autoSurrender 恒 false",
  freeAim.autoSurrender === false, `autoSurrender=${freeAim.autoSurrender}`);

// 12.14 停摆检查：三百秒分段看开火，后一半必须还有仗打。
// 这一条是独立复核逼出来的：上一批的断言只数头六十秒，而实跑里仗打到九十秒就停，
// 之后 AI 状态精确回到 {advance: 70}，胜负改由占点消耗的时钟单方面决定 ——
// 断言全过而停摆完全看不见。窗口必须盖满三百秒。
Stage("12.14 三百秒停摆检查（约四分钟）");
await Boot(2, "medium");
const soak300 = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  const spawnZ = [];
  const realSpawn = T.ai.Spawn.bind(T.ai);
  T.ai.Spawn = (side, x, z, o) => { if (side === "ija") spawnZ.push(z); return realSpawn(side, x, z, o); };
  const owners0 = T.battlefield.objectives.map((o) => o.owner).join(",");
  const seg = [];
  let prev = D.FireCount();
  let flips = 0, lastOwners = owners0;
  for (let i = 0; i < 15; i += 1) {
    T.StepFrames(20 * 60, 1 / 60, false);
    const now = D.FireCount();
    seg.push(now - prev);
    prev = now;
    const owners = T.battlefield.objectives.map((o) => o.owner).join(",");
    if (owners !== lastOwners) { flips += 1; lastOwners = owners; }
  }
  T.ai.Spawn = realSpawn;
  return {
    seg, flips, owners0, owners1: lastOwners,
    first60: seg[0] + seg[1] + seg[2],
    back150: seg.slice(7).reduce((a, b) => a + b, 0),
    backSegments: seg.slice(7).filter((v) => v > 0).length,
    spawns: spawnZ.length,
    outside: spawnZ.filter((z) => z < -190).length,
  };
});
Check("头六十秒全场开火 > 200", soak300.first60 > 200, `开了 ${soak300.first60} 枪`);
Check("后一百五十秒仗还在打（不是停摆后靠占点时钟单方面结算）",
  soak300.backSegments >= 2 && soak300.back150 > 20,
  `每 20 s：${soak300.seg.join("/")}；后半段 ${soak300.back150} 枪、${soak300.backSegments}/8 段有火力`);
Check("三百秒内占领点反复易主", soak300.flips >= 1,
  `易主 ${soak300.flips} 次：${soak300.owners0} -> ${soak300.owners1}`);
Check("日方补兵不再落在北寨墙外", soak300.outside === 0,
  `${soak300.spawns} 次生成，墙外 ${soak300.outside} 次`);

// 12.15 导航网格：八个占领点都走得到。
// 三个点（清真寺、火车站、新关帝庙）的圆心落在封闭院落里，圆心直接做 BFS 起点
// 只能淹到 0.1% 的可走面积 —— 必须被吸附到主连通分量上，否则全城拿不到导航信息。
const navStats = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const stats = T.nav.Stats();
  const rows = [];
  for (const o of T.battlefield.objectives) {
    // 每张新场都要占一次"每帧最多算两张"的预算，不重置的话第三个点起一律拿到 null，
    // 量到的 0% 是预算用完了，不是走不到。BeginFrame 就是引擎每帧自己调的那一个。
    T.nav.BeginFrame();
    const field = T.nav.FieldFor(o.x, o.z);
    let reach = 0;
    if (field) for (let i = 0; i < field.dist.length; i += 1) if (field.dist[i] >= 0) reach += 1;
    rows.push({ id: o.id, pct: +(reach / stats.open * 100).toFixed(1) });
  }
  return { stats, rows, worst: Math.min(...rows.map((r) => r.pct)) };
});
Check("每个占领点都能从全城大部分地方走到（导航场连通）",
  navStats.worst > 40,
  `最差 ${navStats.worst}%；` + navStats.rows.map((r) => `${r.id} ${r.pct}%`).join(" "));


await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n通关冒烟：${results.length - failed.length}/${results.length} 过`);
if (failed.length) {
  console.log("没过的：");
  for (const f of failed) console.log(`  · ${f.name}${f.detail ? "  — " + f.detail : ""}`);
}
process.exit(failed.length === 0 ? 0 : 1);
