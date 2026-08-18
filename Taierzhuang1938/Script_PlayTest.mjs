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
const gun = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  const before = D.Ammo();
  for (let i = 0; i < 8; i += 1) { D.Fire(); T.StepFrames(6); }
  const afterFire = D.Ammo();
  // 打空之后再开火不许再掉（不许出现负数弹药）
  for (let i = 0; i < 10; i += 1) { D.Fire(); T.StepFrames(4); }
  const emptied = D.Ammo();
  // 等抢壳/拉栓动作播完再压弹：viewmodel.IsBusy() 期间 Reload 会被挡下来。
  // 这是对的行为（手都离开握把了还能压桥夹才是穿帮），测试得自己等。
  T.StepFrames(150);
  const reloaded = D.Reload();
  T.StepFrames(30);
  const afterReload = D.Ammo();
  return { before, afterFire, emptied, reloaded, afterReload };
});
Check("开枪消耗弹药", gun.afterFire.ammo < gun.before.ammo,
  `${gun.before.ammo} -> ${gun.afterFire.ammo}`);
Check("弹药不会变负", gun.emptied.ammo >= 0, `空仓后 ammo=${gun.emptied.ammo}`);
Check("能装填", gun.reloaded && gun.afterReload.ammo > gun.emptied.ammo
  && gun.afterReload.clips < gun.before.clips,
  `ammo ${gun.emptied.ammo}->${gun.afterReload.ammo}, 桥夹 ${gun.before.clips}->${gun.afterReload.clips}`);

// ===========================================================================
// 4) 投弹：真的飞出去、真的炸、真的减库存
// ===========================================================================
const nade = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
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
const melee = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  // 把一个日军挪到玩家正前方 1.2 m
  // 等上一段测试的装填动画播完 —— IsBusy() 期间 DoMelee 会被挡下来（这是对的行为）
  T.StepFrames(180);
  // 第 1 批之后战场是真在打的，玩家会在前面几段里被打死。
  // DoMelee 对死人直接 return false，那样量到的"砍不到人"是测试自己没站稳，
  // 不是白刃坏了。先把人等活过来。
  if (!T.player.Alive) T.StepFrames(320);
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
  T.StepFrames(2400);
  return { p0, p1, p2: o.progress, owner: o.owner, name: o.name };
});
Check("占领进度会涨", cap.p1 > cap.p0, `${cap.p0.toFixed(3)} -> ${cap.p1.toFixed(3)}`);
Check("能把点夺回来", cap.owner === "nra", `${cap.name} 现属 ${cap.owner}，进度 ${cap.p2.toFixed(2)}`);

// ===========================================================================
// 7) 阵亡换人：卡片 + 换一个有名有姓的人 + 兵员池 -1
// ===========================================================================
const death = await page.evaluate(async () => {
  const T = window.Taierzhuang;
  // 把日军挪到两百米外：这一段测的是「阵亡 -> 换人」这条链路本身，
  // 不是能不能在交火中央活四秒。上一次没冻场，玩家重生后 4 秒内又被打死一次，
  // 兵员池掉了 2 而不是 1，断言就误报了。
  for (const s2 of T.ai.soldiers) {
    if (s2.side === "ija") s2.position.set(s2.position.x + 300, s2.position.y, s2.position.z + 300);
  }
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
const storyRun = await page.evaluate(async () => {
  const T = window.Taierzhuang, D = T.Debug;
  const seen = [];
  // 六个阶段各推两分钟，把每一段剧本都跑一遍
  // 按**各阶段真实配置的时长**推，不要图快用一个统一的短时长 ——
  // 上一版每阶段只推 180 s，而正片 P3 是 5 分钟，于是断言比出厂配置还严，
  // 报出来的"剧本卡住"其实是测试自己没给够时间。这里要验的是
  //「出厂配置下每一句台词都听得到」，那就得按出厂时长跑。
  const minutes = T.state.phaseMinutes || [4, 5, 5, 4, 5, 6];
  for (let phase = 0; phase < 6; phase += 1) {
    T.JumpToPhase(phase);
    // 只推到本阶段时长的九成：推满会触发 Frame 里的自动进入下一阶段，
    // 那时 story 的队列已经换成下一段的了，Remaining 量到的是新队列 ——
    // 上一版"给的时间越长、剩得越多"这个反常结果就是这么来的。
    T.StepFrames(Math.round(minutes[phase] * 60 * 60 * 0.9));
    seen.push({ phase, fired: T.story.fired.length, remaining: T.story.Remaining });
  }
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
});
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
await Boot(4, "medium");
const soak = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const samples = [];
  for (let i = 0; i < 8; i += 1) {
    T.StepFrames(600);                        // 10 s
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
await Boot(0, "small");
const spawnSmall = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  return {
    open: D.OpenDirections(T.player.position.x, T.player.position.z, 72, 20),
    nraPool: T.state.nraPool,
  };
});
Check("玩家出生点向 72 个方位射 20 m 至少三条通",
  spawnSmall.open >= 3, `${spawnSmall.open}/72 条通`);

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
    T.StepFrames(60);
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
  if (!T.player.Alive) T.StepFrames(320);
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

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n通关冒烟：${results.length - failed.length}/${results.length} 过`);
if (failed.length) {
  console.log("没过的：");
  for (const f of failed) console.log(`  · ${f.name}${f.detail ? "  — " + f.detail : ""}`);
}
process.exit(failed.length === 0 ? 0 : 1);
